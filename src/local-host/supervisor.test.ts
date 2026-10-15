import { expect, test } from "bun:test";
import { superviseLocal } from "./supervisor";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

test("an existing core is reused and an unknown occupied port is refused without creating a process", async () => {
  for (const present of ["ours", "other"] as const) {
    let created = 0;
    const result = await superviseLocal({ probe: async () => present, spawn() { created++; throw new Error("forbidden"); }, wait: async () => {}, report: () => {} }, new AbortController().signal);
    expect(result).toBe(present === "ours" ? "existing" : "busy");
    expect(created).toBe(0);
  }
});

test("a replacement starts only after the owned child exited and the backoff completed", async () => {
  const first = deferred<number | null>();
  const pause = deferred<void>();
  const waiting = deferred<void>();
  const secondStarted = deferred<void>();
  const second = deferred<number | null>();
  const controller = new AbortController();
  let created = 0;
  const result = superviseLocal({ probe: async () => "absent", spawn() {
    created++;
    if (created === 1) return { exited: first.promise, stop: async () => first.resolve(0) };
    secondStarted.resolve();
    return { exited: second.promise, stop: async () => second.resolve(0) };
  }, wait: async () => { waiting.resolve(); await pause.promise; }, report: () => {} }, controller.signal);
  await Promise.resolve(); await Promise.resolve();
  expect(created).toBe(1);
  first.resolve(1);
  await waiting.promise;
  expect(created).toBe(1);
  pause.resolve();
  await secondStarted.promise;
  expect(created).toBe(2);
  controller.abort();
  expect(await result).toBe("stopped");
});

test("stopping waits for the child exit and never creates another child", async () => {
  const child = deferred<number | null>();
  const started = deferred<void>();
  const stopCalled = deferred<void>();
  const controller = new AbortController();
  let created = 0;
  let finished = false;
  const result = superviseLocal({ probe: async () => "absent", spawn() { created++; started.resolve(); return { exited: child.promise, stop: async () => { stopCalled.resolve(); } }; }, wait: async () => {}, report: () => {} }, controller.signal).then((v) => { finished = true; return v; });
  await started.promise;
  controller.abort();
  await stopCalled.promise;
  expect(finished).toBe(false);
  expect(created).toBe(1);
  child.resolve(0);
  expect(await result).toBe("stopped");
  expect(created).toBe(1);
});

test("a stop arriving during the probe prevents a late process creation", async () => {
  const pending = deferred<"absent">();
  const controller = new AbortController();
  let created = 0;
  const result = superviseLocal({ probe: () => pending.promise, spawn() { created++; throw new Error("forbidden"); }, wait: async () => {}, report: () => {} }, controller.signal);
  controller.abort(); pending.resolve("absent");
  expect(await result).toBe("stopped");
  expect(created).toBe(0);
});

test("repeated crashes are bounded and delayed, without an unlimited restart loop", async () => {
  let created = 0;
  const waits: number[] = [];
  const result = await superviseLocal({ maxRestarts: 2, probe: async () => "absent", spawn() { created++; return { exited: Promise.resolve(1), stop: async () => {} }; }, wait: async (ms) => { waits.push(ms); }, report: () => {} }, new AbortController().signal);
  expect(result).toBe("failed");
  expect(created).toBe(3);
  expect(waits).toEqual([5000, 10000]);
});

test("a healthy ten minute run renews the restart budget; a later crash burst remains bounded", async () => {
  let time = 0;
  let created = 0;
  const waits: number[] = [];
  const result = await superviseLocal({ now: () => time, maxRestarts: 2, probe: async () => "absent", spawn() {
    created++;
    // Two early crashes, one long healthy run, then another burst of three crashes.
    if (created === 3) time += 600_000;
    return { exited: Promise.resolve(1), stop: async () => {} };
  }, wait: async (ms) => { waits.push(ms); }, report: () => {} }, new AbortController().signal);
  expect(result).toBe("failed");
  expect(created).toBe(5);
  expect(waits).toEqual([5000, 10000, 5000, 10000]);
});

test("a child stuck in initialization does not earn a healthy restart reset without its ready message", async () => {
  let time = 0, created = 0;
  const neverReady = new Promise<void>(() => {});
  const result = await superviseLocal({ now: () => time, maxRestarts: 2, probe: async () => "absent", spawn() {
    created++; time += 600_000;
    return { ready: neverReady, exited: Promise.resolve(1), stop: async () => {} };
  }, wait: async () => {}, report: () => {} }, new AbortController().signal);
  expect(result).toBe("failed"); expect(created).toBe(3);
});

test("an abort while asynchronous artifact verification creates a child still stops that child", async () => {
  const pending = deferred<{ exited: Promise<number | null>; stop(): Promise<void> }>();
  const exited = deferred<number | null>();
  const entered = deferred<void>();
  const controller = new AbortController();
  let stops = 0;
  const result = superviseLocal({ probe: async () => "absent", spawn: () => { entered.resolve(); return pending.promise; }, wait: async () => {}, report: () => {} }, controller.signal);
  await entered.promise;
  controller.abort();
  pending.resolve({ exited: exited.promise, stop: async () => { stops++; exited.resolve(0); } });
  expect(await result).toBe("stopped");
  expect(stops).toBe(1);
});

test("an armed handoff waits for the existing app to exit and then supervises only its own child", async () => {
  const controller = new AbortController();
  const child = deferred<number | null>();
  let probes = 0, created = 0, stops = 0;
  const waits: number[] = [], reports: string[] = [];
  const result = await superviseLocal({ awaitExisting: true, probe: async () => ++probes <= 2 ? "ours" : "absent",
    spawn: () => { created++; return { exited: child.promise, stop: async () => { stops++; child.resolve(0); } }; },
    wait: async ms => { waits.push(ms); }, report: code => { reports.push(code); if (code === "local_started") controller.abort(); },
  }, controller.signal);
  expect(result).toBe("stopped");
  expect(waits).toEqual([5000, 5000]);
  expect(created).toBe(1); expect(stops).toBe(1);
  expect(reports.filter(code => code === "local_waiting")).toHaveLength(1);
});

test("cancelling an armed handoff neither stops the foreign app nor creates a replacement", async () => {
  const controller = new AbortController(); let created = 0;
  const result = await superviseLocal({ awaitExisting: true, probe: async () => "ours",
    spawn: () => { created++; throw new Error("must_not_spawn"); }, wait: async () => { controller.abort(); }, report: () => {},
  }, controller.signal);
  expect(result).toBe("stopped"); expect(created).toBe(0);
});

test("an armed handoff never replaces a different or unidentifiable process", async () => {
  let created = 0;
  const result = await superviseLocal({ awaitExisting: true, probe: async () => "other",
    spawn: () => { created++; throw new Error("must_not_spawn"); }, wait: async () => {}, report: () => {},
  }, new AbortController().signal);
  expect(result).toBe("busy"); expect(created).toBe(0);
});
