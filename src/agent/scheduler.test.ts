import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "./config";
import { createScheduler } from "./scheduler";
import { runState } from "./run-state.test-helper";
import type { CycleReport, CycleRunner } from "./cycle";

const report = (over: Partial<CycleReport> = {}): CycleReport => ({
  cycleId: "c1", atMs: 0, durationMs: 1, mode: "sombra", outcome: "mantido", reason: "sem_mudanca", consulted: false, modelo: null, usage: null, posture: null, stances: {}, profiles: {}, orders: [], dropped: [], considered: { holdings: 0, buys: 0, protected: 0 }, notes: [], ...over,
});

/** A clock and timers the test advances by hand. */
function clock() {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  return {
    now: () => now,
    schedule: (ms: number, fn: () => void) => {
      const t = { at: now + ms, fn, id: ++seq };
      timers.push(t);
      return () => {
        const i = timers.findIndex((x) => x.id === t.id);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    pending: () => timers.length,
    nextAt: () => (timers.length === 0 ? null : Math.min(...timers.map((t) => t.at))),
    /** Moves time to the next timer and runs it, waiting for the work it started. */
    async fire() {
      timers.sort((a, b) => a.at - b.at);
      const t = timers.shift();
      if (!t) return false;
      now = Math.max(now, t.at);
      t.fn();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      return true;
    },
  };
}

const live = () => runState("sombra");

describe("the scheduler", () => {
  test("it does nothing until started, and a start schedules the first cycle one interval away", () => {
    const c = clock();
    const s = createScheduler({ runner: { run: async () => report(), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule });
    expect(c.pending()).toBe(0);
    s.start();
    expect(c.pending()).toBe(1);
    expect(c.nextAt()).toBe(c.now() + DEFAULT_CONFIG.intervalMin * 60_000);
    expect(s.status()).toMatchObject({ started: true, nextAtMs: c.nextAt(), lastAtMs: null });
  });

  test("each tick runs one cycle, then waits for the next interval", async () => {
    const c = clock();
    let runs = 0;
    const runner: CycleRunner = { run: async () => (runs++, report()), last: () => null, running: () => false };
    const s = createScheduler({ runner, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule });
    s.start();
    await c.fire();
    expect(runs).toBe(1);
    expect(c.pending()).toBe(1);
    await c.fire();
    expect(runs).toBe(2);
    expect(s.status().lastAtMs).toBe(c.now());
  });

  test("while the agent is off or stopped the tick costs nothing: no cycle, no refresh", async () => {
    const c = clock();
    let runs = 0;
    let refreshes = 0;
    const state = runState("desligado");
    const s = createScheduler({ runner: { run: async () => (runs++, report()), last: () => null, running: () => false }, state, config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule, before: async () => void refreshes++ });
    s.start();
    await c.fire();
    expect(runs + refreshes).toBe(0);
    expect(c.pending()).toBe(1);
  });

  test("the context is refreshed before the cycle and the Placar settled after it", async () => {
    const c = clock();
    const order: string[] = [];
    const s = createScheduler({
      runner: { run: async () => (order.push("run"), report()), last: () => null, running: () => false },
      state: live(),
      config: () => DEFAULT_CONFIG,
      now: c.now,
      schedule: c.schedule,
      before: async () => void order.push("before"),
      after: async () => void order.push("after"),
    });
    s.start();
    await c.fire();
    expect(order).toEqual(["before", "run", "after"]);
  });

  test("a step that throws never stops the chain", async () => {
    const c = clock();
    let runs = 0;
    const s = createScheduler({
      runner: { run: async () => { runs++; throw new Error("boom"); }, last: () => null, running: () => false },
      state: live(),
      config: () => DEFAULT_CONFIG,
      now: c.now,
      schedule: c.schedule,
      before: async () => { throw new Error("context down"); },
      after: async () => { throw new Error("settle down"); },
    });
    s.start();
    await c.fire();
    expect(runs).toBe(1);
    expect(c.pending()).toBe(1);
  });

  test("a change of the interval takes effect at the next wait", async () => {
    const c = clock();
    let interval = 10;
    const s = createScheduler({ runner: { run: async () => report(), last: () => null, running: () => false }, state: live(), config: () => ({ ...DEFAULT_CONFIG, intervalMin: interval }), now: c.now, schedule: c.schedule });
    s.start();
    await c.fire();
    interval = 30;
    const before = c.now();
    await c.fire();
    expect(c.nextAt()).toBe(before + 10 * 60_000 + 30 * 60_000);
  });

  test("stop cancels the pending tick, and a stopped scheduler can start again", async () => {
    const c = clock();
    let runs = 0;
    const s = createScheduler({ runner: { run: async () => (runs++, report()), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule });
    s.start();
    s.stop();
    expect(c.pending()).toBe(0);
    expect(s.status().started).toBe(false);
    await c.fire();
    expect(runs).toBe(0);
    s.start();
    expect(c.pending()).toBe(1);
  });

  test("start twice schedules once", () => {
    const c = clock();
    const s = createScheduler({ runner: { run: async () => report(), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule });
    s.start();
    s.start();
    expect(c.pending()).toBe(1);
  });

  test("run now goes through the same single-flight runner and does not move the chain", async () => {
    const c = clock();
    let runs = 0;
    const s = createScheduler({ runner: { run: async () => (runs++, report()), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule, before: async () => {}, after: async () => {} });
    s.start();
    const at = c.nextAt();
    const out = await s.runNow();
    expect(out.outcome).toBe("mantido");
    expect(runs).toBe(1);
    expect(c.nextAt()).toBe(at);
  });
});

describe("the scheduler: one flight, and a stop that is waited for (the contracts of a server that runs for days)", () => {
  const defer = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const quiet = () => () => {};

  test("single-flight covers the step BEFORE the cycle too: two calls at once enter it once, and both get the same report", async () => {
    const wait = defer();
    let beforeCalls = 0;
    let runs = 0;
    const s = createScheduler({
      runner: { run: async () => (runs++, report()), last: () => null, running: () => false },
      state: live(),
      config: () => DEFAULT_CONFIG,
      now: () => 1,
      schedule: quiet,
      before: async () => {
        beforeCalls++;
        await wait.promise;
      },
    });
    const first = s.runNow();
    const second = s.runNow();
    await Promise.resolve();
    expect(beforeCalls).toBe(1);
    wait.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(runs).toBe(1);
    expect(a).toBe(b);
    // and when the flight is over the next call starts a new one
    await s.runNow();
    expect(runs).toBe(2);
  });

  test("a stop during the step before the cycle means the cycle never starts", async () => {
    const wait = defer();
    let runs = 0;
    const s = createScheduler({
      runner: { run: async () => (runs++, report()), last: () => null, running: () => false },
      state: live(),
      config: () => DEFAULT_CONFIG,
      now: () => 1,
      schedule: quiet,
      before: () => wait.promise,
    });
    s.start();
    const work = s.runNow();
    await Promise.resolve();
    s.stop();
    wait.resolve();
    const out = await work;
    expect(runs).toBe(0);
    expect(out).toMatchObject({ outcome: "bloqueado", reason: "parado", orders: [] });
  });

  test("idle() waits for the cycle in flight, the step after it included, and resolves at once when there is none", async () => {
    const wait = defer();
    const afterGate = defer();
    let afterDone = false;
    const s = createScheduler({
      runner: { run: async () => (await wait.promise, report()), last: () => null, running: () => false },
      state: live(),
      config: () => DEFAULT_CONFIG,
      now: () => 1,
      schedule: quiet,
      after: async () => {
        await afterGate.promise;
        afterDone = true;
      },
    });
    await s.idle();
    const work = s.runNow();
    // let the cycle begin: a stop that comes before it begins means it never begins (the test above), here the stop comes in the middle of it
    await Promise.resolve();
    await Promise.resolve();
    let idled = false;
    const idle = s.idle().then(() => {
      idled = true;
    });
    s.stop();
    await Promise.resolve();
    expect(idled).toBe(false);
    wait.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(idled).toBe(false);
    afterGate.resolve();
    await work;
    await idle;
    expect(afterDone).toBe(true);
    expect(idled).toBe(true);
  });

  test("after a stop a new start works again", async () => {
    let runs = 0;
    const s = createScheduler({ runner: { run: async () => (runs++, report()), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: () => 1, schedule: quiet });
    s.start();
    s.stop();
    s.start();
    await s.runNow();
    expect(runs).toBe(1);
  });
});

describe("the first cycle after a start", () => {
  test("comes after the delay the owner of the process says (a start must not leave the screen blind for a whole interval), and then the chain goes on at the interval", async () => {
    const c = clock();
    let runs = 0;
    const s = createScheduler({ runner: { run: async () => (runs++, report()), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule, firstDelayMs: () => 20_000 });
    s.start();
    expect(c.nextAt()).toBe(c.now() + 20_000);
    expect(s.status().nextAtMs).toBe(c.now() + 20_000);
    await c.fire();
    expect(runs).toBe(1);
    expect(c.nextAt()).toBe(c.now() + DEFAULT_CONFIG.intervalMin * 60_000);
  });

  test("no delay given, or a delay that is not usable, means the plain interval", () => {
    for (const first of [undefined, () => null, () => Number.NaN, () => -5]) {
      const c = clock();
      const s = createScheduler({ runner: { run: async () => report(), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule, ...(first === undefined ? {} : { firstDelayMs: first }) });
      s.start();
      expect(c.nextAt()).toBe(c.now() + DEFAULT_CONFIG.intervalMin * 60_000);
    }
  });
});

describe("the guard between the cycles", () => {
  const guarded = (over: { runs?: { n: number }; guard?: () => Promise<CycleReport>; guardEveryMs?: number; run?: () => Promise<CycleReport> } = {}) => {
    const c = clock();
    const counts = { main: 0, guard: 0 };
    const runner: CycleRunner = {
      run: over.run ?? (async () => (counts.main++, report())),
      guard: over.guard ?? (async () => (counts.guard++, report())),
      last: () => null,
      running: () => false,
    };
    const s = createScheduler({ runner, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule, guardEveryMs: over.guardEveryMs ?? 45_000 });
    return { c, s, counts };
  };

  test("it runs on its own chain, much faster than the cycles, and each run re-arms the next", async () => {
    const { c, s, counts } = guarded();
    s.start();
    // two timers: the cycle chain and the guard chain
    expect(c.pending()).toBe(2);
    await c.fire();
    expect(counts.guard).toBe(1);
    expect(c.pending()).toBe(2);
    await c.fire();
    expect(counts.guard).toBe(2);
    expect(counts.main).toBe(0);
  });

  test("without a guard interval there is no second chain (the plain scheduler of before)", () => {
    const c = clock();
    const s = createScheduler({ runner: { run: async () => report(), last: () => null, running: () => false }, state: live(), config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule });
    s.start();
    expect(c.pending()).toBe(1);
  });

  test("a guard tick during a cycle in flight is skipped, and a cycle waits for a guard in flight instead of being dropped", async () => {
    let releaseMain!: () => void;
    const mainGate = new Promise<void>((r) => {
      releaseMain = r;
    });
    const a = guarded({ run: async () => (await mainGate, report()) });
    a.s.start();
    const main = a.s.runNow();
    await Promise.resolve();
    await a.c.fire(); // the guard timer fires while the cycle is in flight
    expect(a.counts.guard).toBe(0);
    releaseMain();
    await main;

    let releaseGuard!: () => void;
    const guardGate = new Promise<void>((r) => {
      releaseGuard = r;
    });
    const order: string[] = [];
    const b = guarded({ guard: async () => (order.push("guard-start"), await guardGate, order.push("guard-end"), report()), run: async () => (order.push("main"), report()) });
    b.s.start();
    await b.c.fire();
    await Promise.resolve();
    const cycle = b.s.runNow();
    await Promise.resolve();
    expect(order).toEqual(["guard-start"]);
    releaseGuard();
    await cycle;
    expect(order).toEqual(["guard-start", "guard-end", "main"]);
  });

  test("a guard that throws does not stop the chain, a stop cancels it, and idle() waits for it", async () => {
    const t = guarded({ guard: async () => { throw new Error("boom"); } });
    t.s.start();
    await t.c.fire();
    expect(t.c.pending()).toBe(2);
    t.s.stop();
    expect(t.c.pending()).toBe(0);

    let releaseGuard!: () => void;
    const gate = new Promise<void>((r) => {
      releaseGuard = r;
    });
    const w = guarded({ guard: async () => (await gate, report()) });
    w.s.start();
    await w.c.fire();
    let idled = false;
    const idle = w.s.idle().then(() => {
      idled = true;
    });
    w.s.stop();
    await Promise.resolve();
    expect(idled).toBe(false);
    releaseGuard();
    await idle;
    expect(idled).toBe(true);
  });
});

describe("a cycle asked by an event", () => {
  const asked = (over: { run?: () => Promise<CycleReport>; guard?: () => Promise<CycleReport>; mode?: "sombra" | "desligado" } = {}) => {
    const c = clock();
    const counts = { main: 0, guard: 0 };
    const state = runState(over.mode ?? "sombra");
    const runner: CycleRunner = {
      run: over.run ?? (async () => (counts.main++, report({ consulted: true, outcome: "decidido" }))),
      guard: over.guard ?? (async () => (counts.guard++, report())),
      last: () => null,
      running: () => false,
    };
    const s = createScheduler({ runner, state, config: () => DEFAULT_CONFIG, now: c.now, schedule: c.schedule, guardEveryMs: 45_000 });
    return { c, s, counts, state };
  };

  test("it runs ONE cycle through the same flight and says true only when the model was consulted", async () => {
    const w = asked();
    w.s.start();
    expect(await w.s.requestCycle()).toBe(true);
    expect(w.counts.main).toBe(1);
    const w2 = asked({ run: async () => report({ consulted: false, outcome: "bloqueado", reason: "pausado" }) });
    w2.s.start();
    expect(await w2.s.requestCycle()).toBe(false);
  });

  test("it does not run before a start, after a stop, or while the agent is off", async () => {
    const w = asked();
    expect(await w.s.requestCycle()).toBe(false);
    w.s.start();
    w.s.stop();
    expect(await w.s.requestCycle()).toBe(false);
    const off = asked({ mode: "desligado" });
    off.s.start();
    expect(await off.s.requestCycle()).toBe(false);
    expect(w.counts.main + off.counts.main).toBe(0);
  });

  test("a cycle already in flight is NOT consumption: false, and nothing is run or shared", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let runs = 0;
    const w = asked({ run: async () => (runs++, await gate, report({ consulted: true, outcome: "decidido" })) });
    w.s.start();
    const running = w.s.runNow();
    await Promise.resolve();
    expect(await w.s.requestCycle()).toBe(false);
    release();
    await running;
    expect(runs).toBe(1);
  });

  test("a guard pass in flight is short: the cycle waits for it and then runs (an event raised by the guard itself must not be lost)", async () => {
    let releaseGuard!: () => void;
    const guardGate = new Promise<void>((r) => { releaseGuard = r; });
    const g = asked({ guard: async () => (await guardGate, report()) });
    g.s.start();
    await g.c.fire();
    await Promise.resolve();
    let done = false;
    const asking = g.s.requestCycle().then((v) => (done = true, v));
    await Promise.resolve();
    expect(g.counts.main).toBe(0);
    expect(done).toBe(false);
    releaseGuard();
    expect(await asking).toBe(true);
    expect(g.counts.main).toBe(1);
  });

  test("the chain is counted again from the end of that cycle, so the timer does not run a second cycle right behind it", async () => {
    const w = asked();
    w.s.start();
    await w.c.fire();
    expect(w.c.pending()).toBeGreaterThan(0);
    const before = w.s.status().nextAtMs!;
    expect(await w.s.requestCycle()).toBe(true);
    const after = w.s.status().nextAtMs!;
    expect(after).toBe(w.c.now() + DEFAULT_CONFIG.intervalMin * 60_000);
    expect(after).toBeGreaterThanOrEqual(before);
    // one chain timer and the guard timer: never two chain timers
    expect(w.c.pending()).toBe(2);
  });
});
