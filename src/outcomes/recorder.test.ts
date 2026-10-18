import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze, type AnalystInput } from "../intel/analyst";
import type { InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";
import type { ThresholdCandle } from "../intel/thresholds";
import { INTERVAL_MS, type Bar, type Interval } from "../intel/features/types";
import { OkxPublicError } from "../inonu/okx-public";
import type { OkxBars, Quote } from "./okx-bars";
import { GIVE_UP_AGE_MS, createRecorder, msToNextPass, startRecorder, type RecorderDeps, type Scheduler } from "./recorder";
import { createOutcomeStore } from "./store";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "inonu-recorder-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T0 = 1_800_000_000_000 - (1_800_000_000_000 % INTERVAL_MS["4h"]);

/** Closed bars ending right before `endTs`, drifting a little so features are not degenerate. */
function series(interval: Interval, endTs: number, count: number, base = 100): Bar[] {
  const ms = INTERVAL_MS[interval];
  return Array.from({ length: count }, (_, i) => {
    const close = base + Math.sin(i / 9) * 2 + i * 0.005;
    return { ts: endTs - (count - i) * ms, open: close - 0.15, high: close + 0.5, low: close - 0.5, close, volume: 5, confirmed: true };
  });
}

interface Fake {
  readonly api: OkxBars;
  readonly calls: string[];
  failQuote?: boolean;
  /** The "market" ends at this time: bars after it do not exist yet. */
  clock: { now: number };
}

function fakeBars(clock: { now: number }): Fake {
  const calls: string[] = [];
  const fake: Fake = {
    calls,
    clock,
    api: {
      async bars(instId, interval, limit) {
        calls.push(`bars:${instId}:${interval}`);
        const end = clock.now - (clock.now % INTERVAL_MS[interval]);
        return series(interval, end, Math.min(limit, 300), instId.startsWith("BTC") ? 5000 : 100);
      },
      async history(instId, interval, beforeMs, limit) {
        calls.push(`history:${instId}:${interval}`);
        return series(interval, beforeMs, Math.min(limit, 100), instId.startsWith("BTC") ? 5000 : 100);
      },
      async quote(instId): Promise<Quote> {
        calls.push(`quote:${instId}`);
        if (fake.failQuote) throw new OkxPublicError("timeout");
        return { last: 100.4, bid: 100.39, ask: 100.41, mid: 100.4, spreadBps: 2 };
      },
    },
  };
  return fake;
}

const META: InstrumentMeta = { instId: "ETH-USDT", instType: "SPOT", tickSz: "0.5", lotSz: "1" };
const candles1m = Array.from({ length: 21 }, (_, i) => ({ ts: T0 - (21 - i) * 60_000, open: "100", high: "101", low: "99", close: "100" }));
const trade = (ts: number, px: string, sz: number, side: "buy" | "sell"): Trade => ({ ts, px, sz: String(sz), side });
const trades = [trade(T0 + 1_000, "99.0", 60, "buy"), trade(T0 + 1_100, "99.0", 10, "sell"), trade(T0 + 2_000, "99.5", 90, "buy"), trade(T0 + 2_100, "99.5", 10, "sell"), trade(T0 + 3_000, "100.0", 50, "buy"), trade(T0 + 3_100, "100.0", 8, "sell")];
const history: ThresholdCandle[] = [0, 1, 2].map(() => ({ binTicks: 1, levels: [{ c: 10, v: 10 }, { c: 30, v: 10 }, { c: 20, v: 20 }] }));
const realAnalysis = () => analyze({ meta: META, trades, candles: candles1m, history, nowMs: T0 + 5_000, prevZones: [], warmupCandles: 3 } satisfies AnalystInput);

/**
 * The engine read the market at T0 + 5000 and its last trade is at T0 + 3100. The instant of a snapshot is the end of its collection
 * (REC-4), so a snapshot that is to carry this flow must be taken at or after that reading: the default clock is there.
 */
const READ_AT = T0 + 5_000;

function build(over: Partial<RecorderDeps> = {}, clock = { now: READ_AT }) {
  const store = createOutcomeStore({ dir: tmp(), now: () => clock.now });
  const fake = fakeBars(clock);
  let n = 0;
  const deps: RecorderDeps = {
    store,
    bars: fake.api,
    analysis: async () => ({ analysis: realAnalysis(), nowMs: clock.now }),
    regime: async () => null,
    instruments: () => ["ETH-USDT", "BTC-USDT"],
    now: () => clock.now,
    newId: () => `id${++n}`,
    feeAndSlippageRoundTripBps: { spot: 22, perp: 12 },
    enabled: () => true,
    ...over,
  };
  return { recorder: createRecorder(deps), store, fake, clock, deps };
}

describe("a snapshot (REC-1)", () => {
  test("carries the price at the book mid, the cost with the quoted spread, the ATR of the 15 minute bars and the features", async () => {
    const { recorder, store } = build();
    const s = await recorder.snapshotNow("ETH-USDT", "relogio");
    expect(s).not.toBeNull();
    expect(s!.price).toBe(100.4);
    expect(s!.market).toBe("spot");
    expect(s!.costRoundTripBps).toBe(24); // 22 of fees and slippage plus the 2 bps spread
    expect(s!.atr15m).toBeGreaterThan(0);
    expect(s!.features.values["cost.roundTripBps"]).toBe(24);
    expect(s!.features.values["flow.warm"]).toBe(1);
    expect(s!.features.values["x.betaBtc48h"]).not.toBeNull();
    expect(store.snapshots()).toEqual([s!]);
    // every zone the engine offered travels with its id, so an answer that chose one can be joined to its limits
    expect(s!.zones.todas!.length).toBeGreaterThan(0);
    for (const z of s!.zones.todas!) expect(z.id).toMatch(/^[0-9a-f]{12}$/);
  });

  test("an interval the exchange could not give says so in the vector, and the snapshot still reads back from the store", async () => {
    const { store, deps } = build();
    const missing4h: OkxBars = { ...deps.bars, bars: async (instId, interval, limit, signal) => (interval === "4h" ? Promise.reject(new OkxPublicError("timeout")) : deps.bars.bars(instId, interval, limit, signal)) };
    const recorder = createRecorder({ ...deps, bars: missing4h });
    const s = await recorder.snapshotNow("ETH-USDT", "relogio");
    expect(s!.features.nulos.bars4h).toBe("sem_velas");
    expect(recorder.status().skipped.velas_4h_okx_timeout).toBe(1);
    expect(store.snapshots()).toEqual([s!]); // a snapshot that was written is a snapshot that can be read
    expect(store.stats().corruptLines).toBe(0);
  });

  test("a perpetual uses the perpetual fees", async () => {
    const { recorder } = build();
    const s = await recorder.snapshotNow("ETH-USDT-SWAP", "relogio");
    expect(s!.market).toBe("perp");
    expect(s!.costRoundTripBps).toBe(14);
  });

  test("no price, no snapshot: it is counted and nothing is written", async () => {
    const { recorder, store, fake } = build();
    fake.failQuote = true;
    expect(await recorder.snapshotNow("ETH-USDT", "relogio")).toBeNull();
    expect(recorder.status().skipped.cotacao_okx_timeout).toBe(1);
    expect(store.snapshots()).toEqual([]);
  });

  test("a failing flow engine does not stop the snapshot: the flow block says why it is null", async () => {
    const { recorder } = build({ analysis: async () => Promise.reject(new Error("SENTINEL")) });
    const s = await recorder.snapshotNow("ETH-USDT", "pedido");
    expect(s!.origem).toBe("pedido");
    expect(s!.features.nulos["flow.deltaRatio"]).toBe("sem_motor_de_fluxo");
    expect(recorder.status().skipped.fluxo_falhou).toBe(1);
    expect(JSON.stringify(recorder.status())).not.toContain("SENTINEL");
  });

  test("disabled writes nothing and asks the exchange for nothing (REC-5)", async () => {
    let on = false;
    const { recorder, store, fake } = build({ enabled: () => on });
    expect(await recorder.snapshotNow("ETH-USDT", "relogio")).toBeNull();
    await recorder.tick();
    expect(await recorder.label()).toBe(0);
    expect(store.stats().snapshots).toBe(0);
    expect(fake.calls).toEqual([]);
    on = true; // the switch is read at the moment of each pass: no restart
    expect(await recorder.snapshotNow("ETH-USDT", "relogio")).not.toBeNull();
  });

  test("the slow intervals are reused inside a pass", async () => {
    const { recorder, fake } = build();
    await recorder.tick(); // ETH then BTC
    const fourHour = fake.calls.filter((c) => c === "bars:BTC-USDT:4h").length;
    expect(fourHour).toBe(1); // BTC was read for its own snapshot and again as the reference for ETH: once
  });
});

describe("the pass over the followed instruments", () => {
  test("one snapshot each, and a slow pass makes the next one skip instead of piling up", async () => {
    const { recorder, store } = build();
    await Promise.all([recorder.tick(), recorder.tick()]);
    expect(store.snapshots().map((s) => s.instId).sort()).toEqual(["BTC-USDT", "ETH-USDT"]);
    expect(recorder.status().snapshotsWritten).toBe(2);
  });
});

describe("labeling (REC-3)", () => {
  test("a snapshot gets each horizon as soon as its window is over, and never twice", async () => {
    const clock = { now: T0 };
    const { recorder, store } = build({}, clock);
    await recorder.snapshotNow("ETH-USDT", "relogio");
    clock.now = T0 + 10 * 60_000;
    expect(await recorder.label()).toBe(0);
    clock.now = T0 + 20 * 60_000;
    expect(await recorder.label()).toBe(1);
    expect(store.labels().map((l) => l.horizonte)).toEqual(["15m"]);
    expect(await recorder.label()).toBe(0); // done is done
    clock.now = T0 + 4 * 3_600_000 + 10 * 60_000;
    expect(await recorder.label()).toBe(2);
    expect(store.labels().map((l) => l.horizonte).sort()).toEqual(["15m", "1h", "4h"]);
  });

  test("a window with a hole is tried again, and given up for good only after 48 hours", async () => {
    const clock = { now: T0 };
    const { recorder, store, deps } = build({}, clock);
    await recorder.snapshotNow("ETH-USDT", "relogio");
    // the exchange returns no bars at all for this snapshot's window
    const holey: OkxBars = { ...deps.bars, bars: async () => [{ ts: 1, open: 1, high: 1, low: 1, close: 1, volume: 1, confirmed: true }], history: async () => [] };
    const second = createRecorder({ ...deps, bars: holey });
    clock.now = T0 + 20 * 60_000;
    expect(await second.label()).toBe(0);
    expect(store.labels()).toEqual([]);
    clock.now = T0 + GIVE_UP_AGE_MS + 3_600_000;
    expect(await second.label()).toBeGreaterThan(0);
    const l = store.labels();
    expect(l.every((x) => !x.completo && x.motivoIncompleto === "lacuna_de_velas")).toBe(true);
    expect(await second.label()).toBe(0); // given up is final: it is not appended again every pass
  });

  test("older windows are paged in from the history", async () => {
    const clock = { now: T0 };
    const { recorder, store, fake } = build({}, clock);
    await recorder.snapshotNow("ETH-USDT", "relogio");
    clock.now = T0 + 3 * 86_400_000; // the newest page (300 bars, 25 hours) no longer reaches the snapshot
    await recorder.label();
    expect(fake.calls.some((c) => c.startsWith("history:ETH-USDT:5m"))).toBe(true);
    expect(store.labels().length).toBeLessThanOrEqual(3);
  });
});

describe("the clock", () => {
  test("the first pass is two seconds after the next five minute boundary", () => {
    expect(msToNextPass(1_000)).toBe(301_000);
    expect(msToNextPass(299_999)).toBe(2_001);
    expect(msToNextPass(300_000)).toBe(302_000);
  });

  test("startRecorder waits for the boundary, then runs every five minutes, and stops cleanly", async () => {
    const events: string[] = [];
    const cancelled: string[] = [];
    let afterFn: (() => void) | null = null;
    let everyFn: (() => void) | null = null;
    const schedule: Scheduler = {
      after: (ms, fn) => {
        events.push(`after:${ms}`);
        afterFn = fn;
        return () => cancelled.push("after");
      },
      every: (ms, fn) => {
        events.push(`every:${ms}`);
        everyFn = fn;
        return () => cancelled.push("every");
      },
    };
    let ticks = 0;
    const recorder = { tick: async () => void (ticks += 1), label: async () => 0, snapshotNow: async () => null, status: () => ({}) as never };
    const stop = startRecorder(recorder, schedule, () => 1_000);
    expect(events).toEqual(["after:301000"]);
    afterFn!();
    expect(events).toEqual(["after:301000", "every:300000"]);
    everyFn!();
    await Promise.resolve();
    await Promise.resolve();
    expect(ticks).toBe(2);
    stop();
    expect(cancelled).toEqual(["after", "every"]);
  });
});
