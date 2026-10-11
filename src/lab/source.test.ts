import { describe, expect, test } from "bun:test";
import { serializeCapture, serializeCaptureRecord, validateCaptureRecord, type CaptureKind, type CaptureRecord } from "./capture-format.ts";
import { Rng } from "./rng.ts";
import { LeakError, RecordStore, ReplaySource, SyntheticSource, sampleBarExtremes, syntheticConfig, type DataSource } from "./source.ts";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "./types.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md sections 3.3 and 4. Titles start with the acceptance id (LB4, LB5).
// Everything is synthetic.

const T0 = 1_800_000_000_000;

function rec(kind: CaptureKind, t: number, inst: string, data: Record<string, unknown>): CaptureRecord {
  return validateCaptureRecord({ t, kind, inst, data });
}

function fixtureRecords(): CaptureRecord[] {
  return [
    rec("ticker", T0, "SYNA-USDT", { bid: 99, ask: 101, last: 100 }),
    rec("ticker", T0 + 10, "SYNA-USDT", { bid: 100, ask: 102, last: 101 }),
    rec("ticker", T0 + 20, "SYNA-USDT", { bid: 101, ask: 103, last: 102 }),
    rec("ticker", T0 + 20, "SYNB-USDT", { bid: 9, ask: 11, last: 10 }),
    rec("funding", T0 + 5, "SYNA-USDT-SWAP", { rate: 0.0001, settleMs: T0 + 100, intervalMs: 28_800_000 }),
    rec("candle", T0 + 60_000, "SYNA-USDT", { startMs: T0, barMs: 60_000, open: 100, high: 101, low: 99, close: 100.5 }),
    rec("candle", T0 + 120_000, "SYNA-USDT", { startMs: T0 + 60_000, barMs: 60_000, open: 100.5, high: 102, low: 100, close: 101 }),
  ];
}

const SMALL = syntheticConfig({ seed: 7, epochs: 24, stepMs: 6 * HOUR_MS, horizonMs: 24 * HOUR_MS });

describe("LB4 point in time over a hand-made capture", () => {
  const store = new ReplaySource(fixtureRecords(), "replay:test");

  test("LB4 asOf(t) includes a record stamped exactly t and excludes one stamped t + 1", () => {
    expect(store.asOf(T0 + 9).latest("ticker", "SYNA-USDT")?.t).toBe(T0);
    expect(store.asOf(T0 + 10).latest("ticker", "SYNA-USDT")?.t).toBe(T0 + 10);
    expect(store.asOf(T0 - 1).latest("ticker", "SYNA-USDT")).toBeNull();
  });

  test("LB4 history returns oldest first, bounded by sinceMs and by the cut-off", () => {
    const view = store.asOf(T0 + 15);
    expect(view.history("ticker", "SYNA-USDT").map((r) => r.t)).toEqual([T0, T0 + 10]);
    expect(view.history("ticker", "SYNA-USDT", T0 + 10).map((r) => r.t)).toEqual([T0 + 10]);
    expect(view.history("ticker", "SYNA-USDT", T0 + 11)).toEqual([]);
    expect(view.history("ticker", "NOPE-USDT")).toEqual([]);
  });

  test("LB4 a candle is invisible until it closes", () => {
    expect(store.asOf(T0 + 59_999).latest("candle", "SYNA-USDT")).toBeNull();
    expect(store.asOf(T0 + 60_000).latest("candle", "SYNA-USDT")?.data.close).toBe(100.5);
  });

  test("LB4 instruments appear only after their first record and are sorted", () => {
    expect(store.asOf(T0 + 5).instruments()).toEqual(["SYNA-USDT", "SYNA-USDT-SWAP"]);
    expect(store.asOf(T0 + 25).instruments()).toEqual(["SYNA-USDT", "SYNA-USDT-SWAP", "SYNB-USDT"]);
    expect(store.asOf(T0 + 25).instruments("funding")).toEqual(["SYNA-USDT-SWAP"]);
    expect(store.asOf(T0 - 1).instruments()).toEqual([]);
  });

  test("LB4 coverage is the first and last record instant, and an empty capture is refused", () => {
    expect(store.coverage).toEqual({ firstMs: T0, lastMs: T0 + 120_000 });
    expect(() => new ReplaySource([], "replay:empty")).toThrow(RangeError);
  });

  test("LB4 the records are shared but frozen: a view cannot be used to edit the capture", () => {
    const first = store.asOf(T0 + 20).latest("ticker", "SYNA-USDT");
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as unknown as { t: number }).t = 0;
    }).toThrow();
  });

  test("LB4 fromText parses the capture format and fromBytes refuses invalid UTF-8", () => {
    const text = serializeCapture(store.records);
    const parsed = ReplaySource.fromText(text, "replay:text");
    expect(parsed.coverage).toEqual(store.coverage);
    const bytes = new TextEncoder().encode(text);
    expect(ReplaySource.fromBytes(bytes, "replay:bytes").coverage).toEqual(store.coverage);
    expect(() => ReplaySource.fromBytes(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d]), "replay:bad")).toThrow();
  });
});

describe("LB4 point in time over the synthetic source", () => {
  const source = new SyntheticSource(SMALL);

  function seenRecords(view: ReturnType<DataSource["asOf"]>): CaptureRecord[] {
    const out: CaptureRecord[] = [];
    for (const inst of view.instruments()) {
      for (const kind of ["ticker", "funding", "mark", "candle", "book", "oi"] as const) out.push(...view.history(kind, inst));
    }
    return out;
  }

  test("LB4 for many random instants no reachable record is stamped after the cut-off, in latest() and in history()", () => {
    const rng = new Rng(99, "pit");
    const { firstMs, lastMs } = source.coverage;
    for (let i = 0; i < 150; i += 1) {
      const t = firstMs + Math.floor(rng.next() * (lastMs - firstMs));
      const view = source.asOf(t);
      for (const record of seenRecords(view)) expect(record.t <= t).toBe(true);
      for (const inst of view.instruments()) {
        for (const kind of ["ticker", "candle", "funding"] as const) {
          const latest = view.latest(kind, inst);
          if (latest !== null) expect(latest.t <= t).toBe(true);
        }
      }
    }
  });

  test("LB4 monotonic: what was known at t1 is still known, unchanged, at t2 > t1", () => {
    const { firstMs, lastMs } = source.coverage;
    const t1 = firstMs + Math.floor((lastMs - firstMs) * 0.3);
    const t2 = firstMs + Math.floor((lastMs - firstMs) * 0.7);
    const before = seenRecords(source.asOf(t1)).map(serializeCaptureRecord);
    const after = new Set(seenRecords(source.asOf(t2)).map(serializeCaptureRecord));
    expect(before.length).toBeGreaterThan(100);
    for (const line of before) expect(after.has(line)).toBe(true);
    expect(after.size).toBeGreaterThan(before.length);
  });

  test("LB4 the same cut-off gives the same view whenever it is asked", () => {
    const t = SMALL.startMs + 5 * DAY_MS;
    expect(seenRecords(source.asOf(t)).map(serializeCaptureRecord)).toEqual(seenRecords(source.asOf(t)).map(serializeCaptureRecord));
  });

  test("LB4 a replay of the exported synthetic capture shows exactly the same view at sampled instants", () => {
    const replay = ReplaySource.fromText(serializeCapture(source.records), "replay:synthetic-export");
    expect(replay.coverage).toEqual(source.coverage);
    const rng = new Rng(5, "eq");
    const { firstMs, lastMs } = source.coverage;
    for (let i = 0; i < 20; i += 1) {
      const t = firstMs + Math.floor(rng.next() * (lastMs - firstMs));
      expect(seenRecords(replay.asOf(t)).map(serializeCaptureRecord)).toEqual(seenRecords(source.asOf(t)).map(serializeCaptureRecord));
    }
  });
});

describe("LB5 the decision window is a trap for the future", () => {
  function fresh(): { source: SyntheticSource; t: number } {
    const source = new SyntheticSource(SMALL);
    return { source, t: source.epochTimes()[3] as number };
  }

  test("LB5 outside a decision window future() works and returns only (t0, t1]", () => {
    const { source, t } = fresh();
    const window = source.future(t, t + HOUR_MS, ["candle"]);
    expect(window.records.length).toBeGreaterThan(0);
    for (const record of window.records) {
      expect(record.kind).toBe("candle");
      expect(record.t > t && record.t <= t + HOUR_MS).toBe(true);
    }
    expect(window.fromMs).toBe(t);
    expect(window.toMs).toBe(t + HOUR_MS);
    expect(window.coversUntilMs).toBe(source.coverage.lastMs);
  });

  test("LB5 future() can be filtered by instrument and by kind", () => {
    const { source, t } = fresh();
    const only = source.future(t, t + 2 * HOUR_MS, ["candle", "ticker"], ["SYNA-USDT"]);
    expect(only.records.length).toBeGreaterThan(0);
    for (const record of only.records) expect(record.inst).toBe("SYNA-USDT");
    expect(new Set(only.records.map((r) => r.kind))).toEqual(new Set(["candle", "ticker"]));
    const sorted = [...only.records].sort((a, b) => a.t - b.t);
    expect(only.records.map((r) => r.t)).toEqual(sorted.map((r) => r.t));
  });

  test("LB5 inside the window future() and asOf of a later instant throw LeakError, asOf of the past does not", () => {
    const { source, t } = fresh();
    source.openDecision(t);
    try {
      expect(() => source.future(t, t + HOUR_MS)).toThrow(LeakError);
      expect(() => source.asOf(t + 1)).toThrow(LeakError);
      expect(() => source.asOf(t + DAY_MS)).toThrow(LeakError);
      expect(() => source.asOf(t)).not.toThrow();
      expect(() => source.asOf(t - HOUR_MS)).not.toThrow();
    } finally {
      source.closeDecision();
    }
    expect(() => source.future(t, t + HOUR_MS)).not.toThrow();
    expect(() => source.asOf(t + HOUR_MS)).not.toThrow();
  });

  test("LB5 a view obtained before the window cannot reach past its own cut-off either", () => {
    const { source, t } = fresh();
    const view = source.asOf(t);
    source.openDecision(t);
    try {
      for (const record of view.history("ticker", "SYNA-USDT")) expect(record.t <= t).toBe(true);
    } finally {
      source.closeDecision();
    }
  });

  test("LB5 opening twice, or closing without opening, is a programming error", () => {
    const { source, t } = fresh();
    expect(() => source.closeDecision()).toThrow();
    source.openDecision(t);
    expect(() => source.openDecision(t)).toThrow();
    source.closeDecision();
    expect(() => source.openDecision(Number.NaN)).toThrow(RangeError);
  });

  test("LB5 invalid time arguments are refused", () => {
    const { source, t } = fresh();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => source.asOf(bad)).toThrow(RangeError);
      expect(() => source.future(bad, t)).toThrow(RangeError);
    }
    expect(() => source.future(t + 10, t)).toThrow(RangeError);
  });
});

describe("LB4 the synthetic generator", () => {
  test("LB4 the same config gives the same records, another seed gives other records", () => {
    const a = new SyntheticSource(SMALL);
    const b = new SyntheticSource(SMALL);
    const c = new SyntheticSource(syntheticConfig({ ...SMALL, seed: 8 }));
    expect(serializeCapture(a.records)).toBe(serializeCapture(b.records));
    expect(serializeCapture(c.records)).not.toBe(serializeCapture(a.records));
  });

  test("LB4 every synthetic record passes the strict capture validation and the file is ordered in time", () => {
    const source = new SyntheticSource(SMALL);
    expect(source.records.length).toBeGreaterThan(5000);
    let previous = -1;
    for (const record of source.records) {
      expect(record.t >= previous).toBe(true);
      previous = record.t;
      expect(validateCaptureRecord(JSON.parse(serializeCaptureRecord(record)))).toEqual(record);
    }
  });

  test("LB4 the generator emits ticker, candle, funding and oi, with a spot and a perp per asset", () => {
    const source = new SyntheticSource(SMALL);
    const kinds = new Set(source.records.map((r) => r.kind));
    expect(kinds).toEqual(new Set(["ticker", "candle", "funding", "oi"]));
    const insts = new Set(source.records.map((r) => r.inst));
    expect(insts).toEqual(new Set(["SYNA-USDT", "SYNA-USDT-SWAP", "SYNB-USDT", "SYNB-USDT-SWAP"]));
  });

  test("LB4 funding has an announcement at the start of the period and the settled value at the settlement, final value wins", () => {
    const source = new SyntheticSource(SMALL);
    const funding = source.records.filter((r) => r.kind === "funding" && r.inst === "SYNA-USDT-SWAP");
    const bySettlement = new Map<number, typeof funding>();
    for (const record of funding) {
      if (record.kind !== "funding") continue;
      bySettlement.set(record.data.settleMs, [...(bySettlement.get(record.data.settleMs) ?? []), record]);
    }
    let checked = 0;
    for (const [settleMs, group] of bySettlement) {
      if (group.length < 2) continue;
      expect(group.length).toBe(2);
      const [announcement, settled] = group as [CaptureRecord, CaptureRecord];
      expect(announcement.t).toBe(settleMs - 8 * HOUR_MS);
      expect(settled.t).toBe(settleMs);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("LB4 the price is a driftless GBM: log-return variance per bar matches dailyVol and the simple return has mean near zero", () => {
    const config = syntheticConfig({ seed: 21, epochs: 400, stepMs: HOUR_MS, horizonMs: HOUR_MS, barMs: 5 * MINUTE_MS });
    const source = new SyntheticSource(config);
    const closes = source.records.filter((r) => r.kind === "candle" && r.inst === "SYNA-USDT").map((r) => (r.kind === "candle" ? r.data.close : 0));
    const logReturns: number[] = [];
    for (let i = 1; i < closes.length; i += 1) logReturns.push(Math.log(closes[i]! / closes[i - 1]!));
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
    const expected = (config.assets[0]!.dailyVol ** 2 * config.barMs) / DAY_MS;
    expect(Math.abs(variance / expected - 1)).toBeLessThan(0.06);
    // martingale: E[S1/S0] = 1, so the log drift is -sigma^2/2 per unit time
    expect(Math.abs(mean + expected / 2)).toBeLessThan(4 * Math.sqrt(expected / logReturns.length));
  });

  test("LB4 candles are coherent and highs and lows come from the exact bridge, so extremes exceed the endpoints", () => {
    const source = new SyntheticSource(SMALL);
    let wider = 0;
    let total = 0;
    for (const record of source.records) {
      if (record.kind !== "candle") continue;
      const { open, high, low, close } = record.data;
      expect(high >= Math.max(open, close)).toBe(true);
      expect(low <= Math.min(open, close)).toBe(true);
      total += 1;
      if (high > Math.max(open, close) * (1 + 1e-9) && low < Math.min(open, close) * (1 - 1e-9)) wider += 1;
    }
    expect(wider / total).toBeGreaterThan(0.99);
  });

  test("LB4 invalid configurations are refused", () => {
    for (const bad of [
      { stepMs: 7 * MINUTE_MS },
      { horizonMs: 7 * MINUTE_MS },
      { epochs: 0 },
      { epochs: 1.5 },
      { seed: -1 },
      { plantedEdgeBps: -1 },
      { plantedEdgeBps: Number.NaN },
      { plantedEdgeBps: 5000 },
      { barMs: 0 },
    ]) {
      expect(() => syntheticConfig(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });

  test("LB4 epoch times are the grid first + i * step and the data covers the last horizon plus one bar", () => {
    const source = new SyntheticSource(SMALL);
    const times = source.epochTimes();
    expect(times.length).toBe(SMALL.epochs);
    expect(times[0]).toBe(SMALL.startMs + SMALL.warmupMs);
    expect(times[1]! - times[0]!).toBe(SMALL.stepMs);
    const lastExit = Math.ceil((times[times.length - 1]! + SMALL.executionDelayMs) / SMALL.barMs) * SMALL.barMs + SMALL.horizonMs;
    expect(source.coverage.lastMs).toBeGreaterThanOrEqual(lastExit + SMALL.barMs);
  });
});

describe("LB4 the planted edge", () => {
  test("LB4 plantedEdgeBps 0 plants nothing: no extras at all", () => {
    const source = new SyntheticSource(SMALL);
    for (const t of source.epochTimes()) expect(source.asOf(t).extras).toEqual({});
  });

  test("LB4 extras exist only at exact grid epochs and name the spot and the perp of each asset", () => {
    const source = new SyntheticSource(syntheticConfig({ ...SMALL, plantedEdgeBps: 20 }));
    const t = source.epochTimes()[2] as number;
    const extras = source.asOf(t).extras;
    expect(Object.keys(extras).sort()).toEqual(["signalZ:SYNA-USDT", "signalZ:SYNA-USDT-SWAP", "signalZ:SYNB-USDT", "signalZ:SYNB-USDT-SWAP"]);
    expect(extras["signalZ:SYNA-USDT"]).toBe(extras["signalZ:SYNA-USDT-SWAP"]!);
    expect(source.asOf(t + 1).extras).toEqual({});
    expect(source.asOf(t - 1).extras).toEqual({});
  });

  test("LB4 the planted signal has the documented size: sign rule earns the planted edge and correlates by rho with the realized window", () => {
    const planted = 30;
    const config = syntheticConfig({ seed: 77, epochs: 1500, stepMs: HOUR_MS, horizonMs: HOUR_MS, barMs: 10 * MINUTE_MS, plantedEdgeBps: planted, assets: [{ base: "SYNA", dailyVol: 0.025, startPrice: 100 }] });
    const source = new SyntheticSource(config);
    const closes = new Map<number, number>();
    for (const record of source.records) {
      if (record.kind === "candle" && record.inst === "SYNA-USDT") closes.set(record.data.startMs + record.data.barMs, record.data.close);
    }
    const sigma = config.assets[0]!.dailyVol;
    const horizonDays = config.horizonMs / DAY_MS;
    const sigmaH = sigma * Math.sqrt(horizonDays);
    const rho = planted / 1e4 / (sigmaH * Math.sqrt(2 / Math.PI));
    expect(rho).toBeGreaterThan(0);
    expect(rho).toBeLessThan(0.95);
    let sumSigned = 0;
    let sumXZ = 0;
    let sumZ = 0;
    let sumX = 0;
    let sumZZ = 0;
    let sumXX = 0;
    let n = 0;
    for (const t of source.epochTimes()) {
      const z = source.asOf(t).extras["signalZ:SYNA-USDT"] as number;
      const entry = Math.ceil((t + config.executionDelayMs) / config.barMs) * config.barMs;
      const p0 = closes.get(entry);
      const p1 = closes.get(entry + config.horizonMs);
      if (p0 === undefined || p1 === undefined) continue;
      const x = Math.log(p1 / p0);
      sumSigned += Math.sign(z) * x;
      sumXZ += x * z;
      sumZ += z;
      sumX += x;
      sumZZ += z * z;
      sumXX += x * x;
      n += 1;
    }
    expect(n).toBeGreaterThan(1450);
    const meanSigned = (sumSigned / n) * 1e4;
    const standardError = ((sigmaH * 1e4) / Math.sqrt(n)) * 1.0;
    expect(Math.abs(meanSigned - planted)).toBeLessThan(4 * standardError);
    const corr = (sumXZ / n - (sumX / n) * (sumZ / n)) / Math.sqrt((sumXX / n - (sumX / n) ** 2) * (sumZZ / n - (sumZ / n) ** 2));
    expect(Math.abs(corr - rho)).toBeLessThan(4 / Math.sqrt(n));
    expect(Math.abs(sumZ / n)).toBeLessThan(4 / Math.sqrt(n));
    expect(Math.abs(sumZZ / n - 1)).toBeLessThan(0.1);
  });
});

describe("LB13 the exact bridge sampler", () => {
  test("LB13 extremes always bracket the endpoints and match the reflection-principle probability", () => {
    const rng = new Rng(3, "bridge");
    const a = 0;
    const b = 0.01;
    const variance = 0.0004;
    const level = 0.03;
    let hit = 0;
    const n = 40000;
    for (let i = 0; i < n; i += 1) {
      const { max, min } = sampleBarExtremes(a, b, variance, rng.nextOpen(), rng.nextOpen());
      expect(max >= Math.max(a, b)).toBe(true);
      expect(min <= Math.min(a, b)).toBe(true);
      if (max >= level) hit += 1;
    }
    // P(max >= m) = exp(-2 (m - a)(m - b) / variance) for m above both endpoints
    const expected = Math.exp((-2 * (level - a) * (level - b)) / variance);
    const standardError = Math.sqrt((expected * (1 - expected)) / n);
    expect(Math.abs(hit / n - expected)).toBeLessThan(4 * standardError + 1e-4);
  });
});

describe("LB4 RecordStore", () => {
  test("LB4 unsorted input is sorted stably by time and the original objects are not mutated", () => {
    const input = [rec("mark", T0 + 5, "SYNA-USDT-SWAP", { price: 1 }), rec("mark", T0 + 1, "SYNA-USDT-SWAP", { price: 2 }), rec("mark", T0 + 5, "SYNA-USDT-SWAP", { price: 3 })];
    const store = new RecordStore(input, { id: "x", kind: "replay" });
    expect(store.records.map((r) => (r.kind === "mark" ? r.data.price : 0))).toEqual([2, 1, 3]);
    expect(input.map((r) => r.t)).toEqual([T0 + 5, T0 + 1, T0 + 5]);
  });
});
