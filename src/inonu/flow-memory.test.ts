// FLX-12: the adaptive thresholds need N closed minutes of the instrument's own flow. Remembering them on this machine means a
// restart does not throw away what the engine already learned. It is real data from the previous real run, labelled as such,
// kept for a few hours only, validated strictly on the way back, and a folder that cannot be written never breaks the engine.
// origin: synthetic_fixture, tests only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFlowMemory, FLOW_MEMORY_TTL_MS, type PersistedFlow } from "./flow-memory";

const NOW = 1_800_000_000_000;
let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inonu-flow-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const state = (over: Partial<PersistedFlow> = {}): PersistedFlow => ({
  binTicks: 2,
  history: [
    { binTicks: 2, levels: [{ c: 5, v: 3 }, { c: 0, v: 9 }] },
    { binTicks: 2, levels: [{ c: 7, v: 1 }] },
  ],
  tradeUnits: [1, 2, 3],
  ...over,
});

describe("each minute ages by itself", () => {
  const hour = 3_600_000;
  const put = (instId: string, body: unknown) => writeFileSync(join(dir, `flow-${instId}.json`), JSON.stringify(body));
  const candle = (closedAtMs: number | undefined) => ({ binTicks: 2, levels: [{ c: 1, v: 1 }], ...(closedAtMs === undefined ? {} : { closedAtMs }) });

  test("a minute that closed longer ago than the limit is dropped even though the file was saved a moment ago", () => {
    // restarting every few hours used to chain old minutes forever: the file's time is refreshed at every close, the minutes' times are not
    const memory = createFlowMemory({ dir, now: () => NOW });
    const written = createFlowMemory({ dir, now: () => NOW - 1_000 });
    written.write("BTC-USDT", state({ history: [candle(NOW - 7 * hour), candle(NOW - 6.5 * hour), candle(NOW - hour), candle(NOW - 60_000)] }));
    const read = memory.read("BTC-USDT")!;
    expect(read.history.map((c) => c.closedAtMs)).toEqual([NOW - hour, NOW - 60_000]);
  });

  test("a minute from a file written before the stamps existed counts as saved when the file was", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    memory.write("BTC-USDT", state({ history: [candle(undefined), candle(undefined)] }));
    expect(memory.read("BTC-USDT")!.history).toHaveLength(2);
  });

  test("a minute stamped in the future is not trusted: the file is refused", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    put("BTC-USDT", { v: 1, instId: "BTC-USDT", savedAtMs: NOW, binTicks: 2, history: [{ binTicks: 2, levels: [{ c: 1, v: 1 }], closedAtMs: NOW + hour }], tradeUnits: [1] });
    expect(memory.read("BTC-USDT")).toBeNull();
  });

  test("the units are whole numbers: a fractional volume would make the thresholds throw on every analysis, so the file is refused", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    put("BTC-USDT", { v: 1, instId: "BTC-USDT", savedAtMs: NOW, binTicks: 2, history: [{ binTicks: 2, levels: [{ c: 1.5, v: 1 }] }], tradeUnits: [1] });
    expect(memory.read("BTC-USDT")).toBeNull();
    put("BTC-USDT", { v: 1, instId: "BTC-USDT", savedAtMs: NOW, binTicks: 2, history: [{ binTicks: 2, levels: [{ c: 1, v: 1 }] }], tradeUnits: [2.5] });
    expect(memory.read("BTC-USDT")).toBeNull();
    put("BTC-USDT", { v: 1, instId: "BTC-USDT", savedAtMs: NOW, binTicks: 2, history: [{ binTicks: 2, levels: [{ c: 1e300, v: 1 }] }], tradeUnits: [1] });
    expect(memory.read("BTC-USDT")).toBeNull();
  });
});

describe("round trip", () => {
  test("what was written comes back, with the time it was saved", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    memory.write("BTC-USDT", state());
    expect(memory.read("BTC-USDT")).toEqual({ ...state(), savedAtMs: NOW });
  });

  test("nothing saved is null, and instruments do not share a file", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    expect(memory.read("BTC-USDT")).toBeNull();
    memory.write("BTC-USDT", state());
    expect(memory.read("ETH-USDT")).toBeNull();
  });

  test("a second write replaces the first, and no temporary file is left behind", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    memory.write("BTC-USDT", state({ tradeUnits: [1] }));
    memory.write("BTC-USDT", state({ tradeUnits: [9, 9] }));
    expect(memory.read("BTC-USDT")!.tradeUnits).toEqual([9, 9]);
    expect(readdirSync(dir)).toEqual(["flow-BTC-USDT.json"]);
  });
});

describe("age", () => {
  test("a memory older than the limit is not used (the market it learned from is gone)", () => {
    let clock = NOW;
    const memory = createFlowMemory({ dir, now: () => clock });
    memory.write("BTC-USDT", state());
    clock = NOW + FLOW_MEMORY_TTL_MS - 1;
    expect(memory.read("BTC-USDT")).not.toBeNull();
    clock = NOW + FLOW_MEMORY_TTL_MS + 1;
    expect(memory.read("BTC-USDT")).toBeNull();
  });

  test("a memory stamped in the future is not used either (a clock that moved back)", () => {
    let clock = NOW + 3_600_000;
    const memory = createFlowMemory({ dir, now: () => clock });
    memory.write("BTC-USDT", state());
    clock = NOW;
    expect(memory.read("BTC-USDT")).toBeNull();
  });
});

describe("validation on the way back", () => {
  const put = (instId: string, body: unknown) => writeFileSync(join(dir, `flow-${instId}.json`), typeof body === "string" ? body : JSON.stringify(body));
  const good = { v: 1, instId: "BTC-USDT", savedAtMs: NOW, ...state() };

  test("a good file is read, anything else is null and never throws", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    put("BTC-USDT", good);
    expect(memory.read("BTC-USDT")).not.toBeNull();
    const bad: unknown[] = [
      "{not json",
      "null",
      [],
      { ...good, v: 2 },
      { ...good, instId: "ETH-USDT" },
      { ...good, savedAtMs: "x" },
      { ...good, binTicks: 0 },
      { ...good, binTicks: 1.5 },
      { ...good, history: "x" },
      { ...good, history: [{ binTicks: 2, levels: [{ c: -1, v: 0 }] }] },
      { ...good, history: [{ binTicks: 2, levels: [{ c: Number.NaN, v: 0 }] }] },
      { ...good, history: [{ binTicks: 0, levels: [] }] },
      { ...good, tradeUnits: [1, "x"] },
      { ...good, tradeUnits: [-1] },
    ];
    for (const body of bad) {
      put("BTC-USDT", body as never);
      expect(memory.read("BTC-USDT")).toBeNull();
    }
  });

  test("a file that is too big is refused instead of trusted", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    put("BTC-USDT", { ...good, history: Array.from({ length: 200 }, () => ({ binTicks: 2, levels: [{ c: 1, v: 1 }] })) });
    expect(memory.read("BTC-USDT")).toBeNull();
    put("BTC-USDT", { ...good, tradeUnits: Array.from({ length: 5000 }, () => 1) });
    expect(memory.read("BTC-USDT")).toBeNull();
    put("BTC-USDT", { ...good, history: [{ binTicks: 2, levels: Array.from({ length: 5000 }, () => ({ c: 1, v: 1 })) }] });
    expect(memory.read("BTC-USDT")).toBeNull();
  });
});

describe("safety", () => {
  test("only plain instrument ids become a file name", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    for (const bad of ["../x", "a/b", "a\\b", "", "BTC USDT", "x".repeat(80), "BTC-USDT\0"]) {
      memory.write(bad, state());
      expect(memory.read(bad)).toBeNull();
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  test("a folder that cannot be written is silent: the engine keeps working from memory", () => {
    const blocked = join(dir, "blocked-file");
    writeFileSync(blocked, "a file where the folder should be");
    const memory = createFlowMemory({ dir: join(blocked, "flow"), now: () => NOW });
    expect(() => memory.write("BTC-USDT", state())).not.toThrow();
    expect(memory.read("BTC-USDT")).toBeNull();
  });

  test("the file holds only the documented fields: no key, no path, no free text", () => {
    const memory = createFlowMemory({ dir, now: () => NOW });
    memory.write("BTC-USDT", { ...state(), apiKey: "SENTINEL-KEY", note: "free text" } as never);
    const raw = readFileSync(join(dir, "flow-BTC-USDT.json"), "utf8");
    expect(raw).not.toContain("SENTINEL-KEY");
    expect(raw).not.toContain("free text");
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["binTicks", "history", "instId", "savedAtMs", "tradeUnits", "v"]);
  });

  test("creates its folder on the first write", () => {
    const nested = join(dir, "a", "b");
    const memory = createFlowMemory({ dir: nested, now: () => NOW });
    memory.write("BTC-USDT", state());
    expect(readdirSync(nested)).toEqual(["flow-BTC-USDT.json"]);
    mkdirSync(join(dir, "again"), { recursive: true });
  });
});
