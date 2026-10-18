// The collector: it keeps, per instrument, the memory the flow engine learns its thresholds from. Trades arrive from the live
// feed; each closed one minute candle leaves a footprint behind, so after enough minutes the thresholds exist (FLX-12).
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { AnalystCandle } from "../intel/analyst";
import type { InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";
import { createCollector } from "./collector";
import type { OkxPublic } from "./okx-public";

const T0 = 1_800_000_000_000; // aligned to the minute
const MIN = 60_000;
const SPOT: InstrumentMeta = { instId: "TEST-USDT", instType: "SPOT", tickSz: "0.5", lotSz: "1" };
const candles: AnalystCandle[] = Array.from({ length: 30 }, (_, i) => ({ ts: T0 - (30 - i) * MIN, open: "100", high: "101", low: "99", close: "100" }));

function fakeRest(over: Partial<OkxPublic> = {}) {
  const calls: string[] = [];
  const rest: OkxPublic = {
    instrument: async () => (calls.push("instrument"), SPOT),
    candles: async () => (calls.push("candles"), candles),
    trades: async () => (calls.push("trades"), { trades: [], rejected: 0 }),
    ...over,
  };
  return { rest, calls };
}

const trade = (ms: number, px: string, sz: number, side: "buy" | "sell"): Trade => ({ ts: T0 + ms, px, sz: String(sz), side });

async function ready(over: { rest?: OkxPublic; now?: () => number; maxHistory?: number } = {}) {
  const { rest, calls } = fakeRest();
  const collector = createCollector({ rest: over.rest ?? rest, now: over.now ?? (() => T0), ...(over.maxHistory === undefined ? {} : { maxHistory: over.maxHistory }) });
  await collector.watch("TEST-USDT");
  return { collector, calls };
}

describe("watching an instrument", () => {
  test("loading the metadata and the candles once, and nothing is known about an instrument nobody watches", async () => {
    const { collector, calls } = await ready();
    expect(calls.sort()).toEqual(["candles", "instrument"]);
    await collector.watch("TEST-USDT");
    expect(calls).toHaveLength(2); // already watched
    expect(collector.snapshot("OTHER-USDT")).toBeNull();
    expect(collector.instruments()).toEqual(["TEST-USDT"]);
  });

  test("the bin width is decided once, from the last twenty candles, in ticks", async () => {
    const { collector } = await ready();
    expect(collector.snapshot("TEST-USDT")!.binTicks).toBe(1); // 4 ticks of range -> ceil(4/30) = 1
    const wide: AnalystCandle[] = candles.map((c) => ({ ...c, high: "160", low: "100" })); // 120 ticks -> ceil(120/30) = 4
    const { rest } = fakeRest({ candles: async () => wide });
    const other = createCollector({ rest, now: () => T0 });
    await other.watch("TEST-USDT");
    expect(other.snapshot("TEST-USDT")!.binTicks).toBe(4);
  });

  test("a metadata or candle failure leaves the instrument unwatched and says so; it can be tried again", async () => {
    let fail = true;
    const { rest } = fakeRest({ instrument: async () => (fail ? Promise.reject(new Error("down SENTINEL-x")) : SPOT) });
    const collector = createCollector({ rest, now: () => T0 });
    await expect(collector.watch("TEST-USDT")).resolves.toEqual({ ok: false, reason: "load_failed" });
    expect(collector.snapshot("TEST-USDT")).toBeNull();
    fail = false;
    await expect(collector.watch("TEST-USDT")).resolves.toEqual({ ok: true });
  });
});

describe("ingesting trades", () => {
  test("the recent window keeps the newest trades by event time, bounded", async () => {
    const { rest } = fakeRest();
    const collector = createCollector({ rest, now: () => T0, maxWindow: 5 });
    await collector.watch("TEST-USDT");
    collector.ingest("TEST-USDT", Array.from({ length: 8 }, (_, i) => trade(i * 100, "100.0", 1, "buy")));
    const window = collector.snapshot("TEST-USDT")!.window;
    expect(window.map((t) => t.ts - T0)).toEqual([300, 400, 500, 600, 700]);
  });

  test("a trade for an instrument that is not watched is ignored", async () => {
    const { collector } = await ready();
    collector.ingest("OTHER-USDT", [trade(0, "100", 1, "buy")]);
    expect(collector.snapshot("OTHER-USDT")).toBeNull();
  });

  test("a closed minute leaves its footprint in the history, and the minute in progress does not", async () => {
    const { collector } = await ready();
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 60, "buy"), trade(2_000, "99.0", 10, "sell"), trade(3_000, "99.5", 20, "buy")]);
    expect(collector.snapshot("TEST-USDT")!.history).toEqual([]); // still inside the first minute
    collector.ingest("TEST-USDT", [trade(MIN + 500, "100.0", 5, "buy")]); // the next minute: the first one closes
    const snap = collector.snapshot("TEST-USDT")!;
    expect(snap.history).toEqual([{ binTicks: 1, levels: [{ c: 60, v: 10 }, { c: 20, v: 0 }] }]);
    expect(snap.closedCandles).toBe(1);
  });

  test("a minute with no trades leaves no footprint, and a gap does not invent candles", async () => {
    const { collector } = await ready();
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 1, "buy")]);
    collector.ingest("TEST-USDT", [trade(5 * MIN + 1_000, "99.0", 1, "buy")]); // four silent minutes in between
    expect(collector.snapshot("TEST-USDT")!.history).toHaveLength(1);
  });

  test("a late trade (from a minute already closed) goes to the window but cannot reopen the footprint", async () => {
    const { collector } = await ready();
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 1, "buy"), trade(MIN + 1_000, "99.0", 1, "buy")]);
    collector.ingest("TEST-USDT", [trade(2_000, "99.0", 500, "sell")]);
    const snap = collector.snapshot("TEST-USDT")!;
    expect(snap.history[0]!.levels).toEqual([{ c: 1, v: 0 }]);
    expect(snap.late).toBe(1);
  });

  test("the history is bounded: only the newest closed candles are kept", async () => {
    const { collector } = await ready({ maxHistory: 3 });
    for (let m = 0; m < 6; m += 1) collector.ingest("TEST-USDT", [trade(m * MIN + 1_000, "99.0", m + 1, "buy")]);
    const snap = collector.snapshot("TEST-USDT")!;
    expect(snap.history.map((h) => h.levels[0]!.c)).toEqual([3, 4, 5]); // minutes 2, 3, 4 (minute 5 is still open)
    expect(snap.closedCandles).toBe(5);
  });

  test("trades the footprint cannot read (not a whole number of lots) do not poison the candle and are counted", async () => {
    const { collector } = await ready();
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 10, "buy"), { ts: T0 + 2_000, px: "99.0", sz: "1.5", side: "buy" }, trade(MIN + 1, "99.0", 1, "buy")]);
    const snap = collector.snapshot("TEST-USDT")!;
    expect(snap.history[0]!.levels).toEqual([{ c: 10, v: 0 }]);
    expect(snap.rejected).toBe(1);
  });

  test("the sizes of the latest trades are kept in units for the threshold T", async () => {
    const { collector } = await ready();
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 7, "buy"), trade(1_100, "99.0", 3, "sell")]);
    expect(collector.snapshot("TEST-USDT")!.tradeUnits).toEqual([7, 3]);
  });
});

describe("the snapshot the engine reads", () => {
  test("is a copy: changing it changes nothing inside", async () => {
    const { collector } = await ready();
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 1, "buy")]);
    const snap = collector.snapshot("TEST-USDT")!;
    snap.window.length = 0;
    expect(collector.snapshot("TEST-USDT")!.window).toHaveLength(1);
  });

  test("says when the first and the last trade were seen", async () => {
    const { collector } = await ready();
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 1, "buy"), trade(9_000, "99.5", 1, "sell")]);
    expect(collector.snapshot("TEST-USDT")).toMatchObject({ lastTradeTs: T0 + 9_000, firstTradeTs: T0 + 1_000 });
  });
});

describe("how many instruments it holds", () => {
  test("past the bound a new instrument is not followed (it is read from the exchange on each click), and the ones already followed keep working", async () => {
    const { rest } = fakeRest();
    const collector = createCollector({ rest, now: () => T0, maxInstruments: 2 });
    expect(await collector.watch("A-USDT")).toEqual({ ok: true });
    expect(await collector.watch("B-USDT")).toEqual({ ok: true });
    expect(await collector.watch("C-USDT")).toEqual({ ok: false, reason: "limit" });
    expect(collector.snapshot("C-USDT")).toBeNull();
    expect(await collector.watch("A-USDT")).toEqual({ ok: true });
    expect(collector.instruments().sort()).toEqual(["A-USDT", "B-USDT"]);
  });

  test("two instruments loading at once count against the bound before either has finished", async () => {
    const { rest } = fakeRest();
    const collector = createCollector({ rest, now: () => T0, maxInstruments: 1 });
    const [first, second] = await Promise.all([collector.watch("A-USDT"), collector.watch("B-USDT")]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
  });

  test("the default bound is a few dozen, not unlimited", async () => {
    const { rest } = fakeRest();
    const collector = createCollector({ rest, now: () => T0 });
    let refused = 0;
    for (let i = 0; i < 40; i += 1) if (!(await collector.watch(`I${i}-USDT`)).ok) refused += 1;
    expect(refused).toBeGreaterThan(0);
    expect(collector.instruments().length).toBeLessThanOrEqual(64);
  });
});

describe("memory of the previous run (FLX-12)", () => {
  const saved = (n: number) => ({
    binTicks: 1,
    history: Array.from({ length: n }, (_, i) => ({ binTicks: 1, levels: [{ c: i + 1, v: 1 }] })),
    tradeUnits: [5, 6, 7],
    savedAtMs: T0 - 5_000,
  });

  function withMemory(restored: ReturnType<typeof saved> | null, over: { maxHistory?: number } = {}) {
    const written: Array<{ instId: string; history: number; tradeUnits: number[]; binTicks: number }> = [];
    const memory = {
      read: (instId: string) => (instId === "TEST-USDT" ? restored : null),
      write: (instId: string, state: { binTicks: number; history: readonly unknown[]; tradeUnits: readonly number[] }) => {
        written.push({ instId, history: state.history.length, tradeUnits: [...state.tradeUnits], binTicks: state.binTicks });
      },
    };
    const { rest } = fakeRest();
    const collector = createCollector({ rest, now: () => T0, memory, ...(over.maxHistory === undefined ? {} : { maxHistory: over.maxHistory }) });
    return { collector, written };
  }

  test("what the previous run learned is the starting point: the history, the trade sizes and the count of closed minutes", async () => {
    const { collector } = withMemory(saved(30));
    await collector.watch("TEST-USDT");
    const snap = collector.snapshot("TEST-USDT")!;
    expect(snap.history).toHaveLength(30);
    expect(snap.tradeUnits).toEqual([5, 6, 7]);
    expect(snap.closedCandles).toBe(30);
    expect(snap.restored).toBe(30);
    expect(snap.window).toEqual([]); // the trades themselves are never restored
  });

  test("with nothing remembered it starts empty, exactly as before", async () => {
    const { collector } = withMemory(null);
    await collector.watch("TEST-USDT");
    expect(collector.snapshot("TEST-USDT")).toMatchObject({ closedCandles: 0, restored: 0, history: [], tradeUnits: [] });
  });

  test("a closing minute is written to the memory with the whole history and the trade sizes", async () => {
    const { collector, written } = withMemory(saved(2));
    await collector.watch("TEST-USDT");
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 8, "buy")]);
    expect(written).toEqual([]); // the minute is still open
    collector.ingest("TEST-USDT", [trade(MIN + 1_000, "99.0", 1, "buy")]);
    expect(written).toEqual([{ instId: "TEST-USDT", history: 3, tradeUnits: [5, 6, 7, 8], binTicks: 1 }]);
  });

  test("every closed minute carries the time it closed, so the memory can age it by itself", async () => {
    const seen: Array<{ closedAtMs?: number }[]> = [];
    const memory = { read: () => null, write: (_id: string, state: { history: readonly { closedAtMs?: number }[] }) => void seen.push(state.history.map((c) => ({ ...(c.closedAtMs === undefined ? {} : { closedAtMs: c.closedAtMs }) }))) };
    const { rest } = fakeRest();
    const collector = createCollector({ rest, now: () => T0, memory });
    await collector.watch("TEST-USDT");
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 8, "buy")]);
    collector.ingest("TEST-USDT", [trade(MIN + 1_000, "99.0", 1, "buy")]);
    expect(seen).toEqual([[{ closedAtMs: T0 }]]);
  });

  test("the part that still comes from the previous run shrinks as live minutes push it out of the bounded history", async () => {
    const { collector } = withMemory(saved(3), { maxHistory: 4 });
    await collector.watch("TEST-USDT");
    expect(collector.snapshot("TEST-USDT")!.restored).toBe(3);
    for (let m = 0; m < 4; m += 1) collector.ingest("TEST-USDT", [trade(m * MIN + 1_000, "99.0", 2, "buy")]);
    // three live minutes closed (the fourth is open): 4 kept = 1 restored + 3 live
    expect(collector.snapshot("TEST-USDT")!.restored).toBe(1);
    for (let m = 4; m < 7; m += 1) collector.ingest("TEST-USDT", [trade(m * MIN + 1_000, "99.0", 2, "buy")]);
    expect(collector.snapshot("TEST-USDT")!.restored).toBe(0);
  });

  test("a memory that throws, on read or on write, never breaks the collector", async () => {
    const { rest } = fakeRest();
    const memory = {
      read: () => {
        throw new Error("disk");
      },
      write: () => {
        throw new Error("disk");
      },
    };
    const collector = createCollector({ rest, now: () => T0, memory });
    await expect(collector.watch("TEST-USDT")).resolves.toEqual({ ok: true });
    collector.ingest("TEST-USDT", [trade(1_000, "99.0", 1, "buy"), trade(MIN + 1_000, "99.0", 1, "buy")]);
    expect(collector.snapshot("TEST-USDT")!.history).toHaveLength(1);
  });

  test("the memory is only handed back what is bounded: more than the cap is cut to the newest", async () => {
    const { collector } = withMemory(saved(100), { maxHistory: 60 });
    await collector.watch("TEST-USDT");
    const snap = collector.snapshot("TEST-USDT")!;
    expect(snap.history).toHaveLength(60);
    expect(snap.history[0]!.levels[0]!.c).toBe(41);
    expect(snap.restored).toBe(60);
  });
});
