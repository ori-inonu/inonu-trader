import { describe, expect, test } from "bun:test";
import { brierScore, logLoss, pairedBlockBootstrap, perStartMeanLoss, pooledByKey, reliability, walkForward, type ForecastRecord, type WalkRecord } from "./calibration";
import type { Forecaster } from "./forecasters";
import { simulateCandles } from "./test-support";
import { mulberry32, normalDraw, type Candle } from "./types";

const BAR = 900_000;
const T0 = 1_800_000_000_000;

const rec = (p: number, hit: 0 | 1): ForecastRecord => ({ p, hit });

describe("scores", () => {
  const records = [rec(0.9, 1), rec(0.2, 0), rec(0.5, 1), rec(0.1, 0)];
  test("Brier score by hand", () => {
    expect(brierScore(records)!).toBeCloseTo((0.01 + 0.04 + 0.25 + 0.01) / 4, 14);
  });
  test("log loss by hand", () => {
    expect(logLoss(records)!).toBeCloseTo(0.281752941, 8);
  });
  test("a confident miss is penalised but stays finite through the floor", () => {
    expect(logLoss([rec(0, 1)])!).toBeCloseTo(-Math.log(1e-4), 12);
    expect(logLoss([rec(1, 0)])!).toBeCloseTo(-Math.log(1e-4), 12);
    expect(logLoss([rec(0, 1)], 1e-6)!).toBeCloseTo(-Math.log(1e-6), 12);
  });
  test("empty and invalid", () => {
    expect(brierScore([])).toBeNull();
    expect(logLoss([])).toBeNull();
    expect(brierScore([rec(Number.NaN, 1)])).toBeNull();
    expect(brierScore([rec(1.2, 1)])).toBeNull();
    expect(() => logLoss(records, 0.7)).toThrow("option_invalid");
  });
});

describe("reliability", () => {
  test("bins forecasts and compares the mean forecast with the hit rate", () => {
    const records = [rec(0.05, 0), rec(0.07, 0), rec(0.06, 1), rec(0.6, 1), rec(0.7, 1), rec(0.9, 0)];
    const table = reliability(records, [0, 0.5, 1]);
    expect(table.length).toBe(2);
    expect(table[0]).toMatchObject({ lo: 0, hi: 0.5, n: 3 });
    expect(table[0]!.meanForecast).toBeCloseTo(0.06, 12);
    expect(table[0]!.hitRate).toBeCloseTo(1 / 3, 12);
    expect(table[1]).toMatchObject({ n: 3 });
    expect(table[1]!.hitRate).toBeCloseTo(2 / 3, 12);
  });
  test("a forecast of exactly 1 lands in the last bin", () => {
    expect(reliability([rec(1, 1)], [0, 0.5, 1])[1]!.n).toBe(1);
  });
  test("empty bins have null summaries instead of zeros", () => {
    const table = reliability([rec(0.1, 0)], [0, 0.5, 1]);
    expect(table[1]).toEqual({ lo: 0.5, hi: 1, n: 0, meanForecast: null, hitRate: null });
  });
  test("bad edges", () => {
    expect(() => reliability([], [0.5, 0.2])).toThrow("option_invalid");
  });
});

describe("pairedBlockBootstrap", () => {
  const options = { blockLength: 5, resamples: 800, seed: 3, level: 0.95 };
  test("identical series: zero difference and a zero width interval", () => {
    const a = Array.from({ length: 60 }, (_, i) => Math.sin(i));
    const r = pairedBlockBootstrap(a, a, options)!;
    expect(r.meanDiff).toBe(0);
    expect(r.ciLow).toBe(0);
    expect(r.ciHigh).toBe(0);
  });
  test("a constant gap is recovered exactly", () => {
    const b = Array.from({ length: 60 }, (_, i) => Math.cos(i));
    const a = b.map((x) => x + 0.1);
    const r = pairedBlockBootstrap(a, b, options)!;
    expect(r.meanDiff).toBeCloseTo(0.1, 12);
    expect(r.ciLow).toBeCloseTo(0.1, 12);
    expect(r.ciHigh).toBeCloseTo(0.1, 12);
  });
  test("a noisy gap gives an interval around the mean that excludes zero when the effect is clear", () => {
    const random = mulberry32(5);
    const b = Array.from({ length: 200 }, () => normalDraw(random));
    const a = b.map((x) => x + 0.5 + 0.1 * normalDraw(random));
    const r = pairedBlockBootstrap(a, b, options)!;
    expect(r.ciLow).toBeLessThanOrEqual(r.meanDiff);
    expect(r.ciHigh).toBeGreaterThanOrEqual(r.meanDiff);
    expect(r.ciLow).toBeGreaterThan(0.3);
  });
  test("with serially dependent differences, longer blocks give a wider interval", () => {
    const random = mulberry32(8);
    let x = 0;
    const diffs = Array.from({ length: 400 }, () => (x = 0.95 * x + normalDraw(random)));
    const zero = diffs.map(() => 0);
    const narrow = pairedBlockBootstrap(diffs, zero, { ...options, blockLength: 1 })!;
    const wide = pairedBlockBootstrap(diffs, zero, { ...options, blockLength: 40 })!;
    expect(wide.ciHigh - wide.ciLow).toBeGreaterThan(1.5 * (narrow.ciHigh - narrow.ciLow));
  });
  test("every start can be drawn, including the last block", () => {
    const a = [...new Array(9).fill(0), 1];
    const b = new Array(10).fill(0);
    const r = pairedBlockBootstrap(a, b, { blockLength: 1, resamples: 800, seed: 5, level: 0.95 })!;
    expect(r.meanDiff).toBeCloseTo(0.1, 12);
    expect(r.ciHigh).toBeGreaterThan(0);
  });
  test("deterministic for a seed", () => {
    const random = mulberry32(2);
    const a = Array.from({ length: 80 }, () => normalDraw(random));
    const b = Array.from({ length: 80 }, () => normalDraw(random));
    expect(JSON.stringify(pairedBlockBootstrap(a, b, options))).toBe(JSON.stringify(pairedBlockBootstrap(a, b, options)));
  });
  test("unusable input", () => {
    expect(pairedBlockBootstrap([], [], options)).toBeNull();
    expect(pairedBlockBootstrap([1, 2], [1], options)).toBeNull();
    expect(() => pairedBlockBootstrap([1, 2, 3], [1, 2, 3], { ...options, blockLength: 0 })).toThrow("option_invalid");
    expect(() => pairedBlockBootstrap([1, 2, 3], [1, 2, 3], { ...options, level: 1 })).toThrow("option_invalid");
  });
});

function flat(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({ startMs: T0 + i * BAR, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1, confirmed: true }));
}

const constant = (name: string, p: number): Forecaster => ({ name, prepare: () => () => p });

describe("walkForward", () => {
  const base = { barMs: BAR, horizonDays: 1 / 96 * 10, trainBars: 30, strideBars: 5, distances: [0.05, 0.2] as const, seed: 1 };

  test("outcomes are read from the lows and highs after the start, by side", () => {
    const candles = flat(120);
    candles[60] = { ...candles[60]!, low: 90 }; // a 10 percent dip for one bar
    const r = walkForward({ ...base, candles, forecasters: [constant("half", 0.5)] });
    const half = r.perForecaster.half!;
    // Starts are 29, 34, 39, ...; horizon is 10 bars, so starts 50..59 look at bar 60.
    const longHits = half.records.filter((x) => x.side === "long" && x.distance === 0.05 && x.hit === 1);
    expect(longHits.map((x) => x.startIndex)).toEqual([54, 59]);
    expect(half.records.some((x) => x.side === "long" && x.distance === 0.2 && x.hit === 1)).toBe(false);
    expect(half.records.some((x) => x.side === "short" && x.hit === 1)).toBe(false);
    expect(half.brier!).toBeGreaterThan(0.2);
    expect(r.baseRate).toBeGreaterThan(0);
  });

  test("a forecaster only ever sees bars up to the start, never the future", () => {
    const candles = flat(120);
    const seen: { lastStart: number; startOfBar: number }[] = [];
    const spy: Forecaster = {
      name: "spy",
      prepare: (train) => {
        seen.push({ lastStart: train[train.length - 1]!.startMs, startOfBar: train[0]!.startMs });
        return () => 0.3;
      },
    };
    const r = walkForward({ ...base, candles, forecasters: [spy] });
    expect(seen.length).toBe(r.starts);
    const starts = r.perForecaster.spy!.records.map((x) => x.startIndex);
    for (const s of new Set(starts)) expect(seen.some((x) => x.lastStart === candles[s]!.startMs)).toBe(true);
    for (const x of seen) expect(x.lastStart - x.startOfBar).toBe(29 * BAR);
  });

  test("changing the future leaves earlier forecasts untouched", () => {
    const candles = simulateCandles({ seed: 4, bars: 300, sigmaDaily: 0.05, barMs: BAR });
    const tampered = candles.map((c, i) => (i >= 200 ? { ...c, close: c.close * 3, high: c.high * 3, low: c.low * 3, open: c.open * 3 } : c));
    const probe: Forecaster = {
      name: "probe",
      prepare: (train) => {
        const last = train[train.length - 1]!.close;
        return (_side, d) => Math.min(0.99, (last % 1) * d);
      },
    };
    const a = walkForward({ ...base, candles, forecasters: [probe] }).perForecaster.probe!.records;
    const b = walkForward({ ...base, candles: tampered, forecasters: [probe] }).perForecaster.probe!.records;
    const early = (x: { startIndex: number }) => x.startIndex + 10 < 200;
    expect(a.filter(early).map((x) => x.p)).toEqual(b.filter(early).map((x) => x.p));
  });

  test("a start is dropped for everybody when any forecaster cannot produce a forecast", () => {
    const candles = flat(120);
    let n = 0;
    const flaky: Forecaster = { name: "flaky", prepare: () => (++n % 2 === 0 ? null : () => 0.1) };
    const r = walkForward({ ...base, candles, forecasters: [flaky, constant("steady", 0.2)] });
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.perForecaster.flaky!.records.length).toBe(r.perForecaster.steady!.records.length);
    expect(r.perForecaster.steady!.records.length).toBe(r.starts * 4);
  });

  test("per start losses line up across forecasters for the paired comparison", () => {
    const candles = simulateCandles({ seed: 6, bars: 400, sigmaDaily: 0.06, barMs: BAR });
    const r = walkForward({ ...base, candles, forecasters: [constant("a", 0.1), constant("b", 0.3)] });
    expect(r.perForecaster.a!.perStartBrier.length).toBe(r.starts);
    expect(r.perForecaster.b!.perStartBrier.length).toBe(r.starts);
    expect(r.perForecaster.a!.perStartLogLoss.length).toBe(r.starts);
  });

  test("argument errors", () => {
    const candles = flat(120);
    expect(() => walkForward({ ...base, candles, forecasters: [] })).toThrow("option_invalid");
    expect(() => walkForward({ ...base, candles, distances: [0], forecasters: [constant("x", 0.1)] })).toThrow("option_invalid");
    expect(() => walkForward({ ...base, candles, distances: [1.2], forecasters: [constant("x", 0.1)] })).toThrow("option_invalid");
    expect(() => walkForward({ ...base, candles, strideBars: 0, forecasters: [constant("x", 0.1)] })).toThrow("option_invalid");
    expect(() => walkForward({ ...base, candles, forecasters: [constant("x", 0.1), constant("x", 0.2)] })).toThrow("option_invalid");
  });

  test("a series too short for one start gives an empty result", () => {
    const r = walkForward({ ...base, candles: flat(20), forecasters: [constant("x", 0.1)] });
    expect(r.starts).toBe(0);
    expect(r.perForecaster.x!.brier).toBeNull();
  });
});


describe("walkForward exposes what the paired analysis needs", () => {
  const base = { barMs: BAR, horizonDays: 1 / 96 * 10, trainBars: 30, strideBars: 5, distances: [0.05, 0.2] as const, seed: 1 };

  test("each per start entry has the candle index of its start, ascending, one per start", () => {
    const r = walkForward({ ...base, candles: flat(120), forecasters: [constant("a", 0.1)] });
    const a = r.perForecaster.a!;
    expect(a.startIndexes).toEqual([29, 34, 39, 44, 49, 54, 59, 64, 69, 74, 79, 84, 89, 94, 99, 104, 109].slice(0, r.starts));
    expect(a.startIndexes.length).toBe(a.perStartBrier.length);
    expect(a.startIndexes.length).toBe(a.perStartLogLoss.length);
  });

  test("per start losses are the mean over that start's events, not their sum", () => {
    const candles = flat(120);
    candles[60] = { ...candles[60]!, low: 90 };
    const r = walkForward({ ...base, candles, forecasters: [constant("half", 0.5)] });
    const half = r.perForecaster.half!;
    const at54 = half.startIndexes.indexOf(54);
    // events at start 54: long 5% hit (p 0.5), long 20% no hit, short 5% no hit, short 20% no hit: every squared error is 0.25
    expect(half.perStartBrier[at54]).toBeCloseTo(0.25, 12);
    expect(half.perStartLogLoss[at54]).toBeCloseTo(Math.log(2), 12);
  });

  test("the per start log loss clips at the default floor of 1e-4, so a confident miss costs about 9.2 nats", () => {
    const candles = flat(120);
    candles[60] = { ...candles[60]!, low: 90 };
    const r = walkForward({ ...base, candles, forecasters: [constant("zero", 0)] });
    const zero = r.perForecaster.zero!;
    const at54 = zero.startIndexes.indexOf(54);
    // one hit forecast at 0 costs -ln(1e-4); three correct zeros cost -ln(1 - 1e-4) each
    expect(zero.perStartLogLoss[at54]).toBeCloseTo((-Math.log(1e-4) + 3 * -Math.log(1 - 1e-4)) / 4, 10);
  });

  test("the base rate is exactly the share of events that happened", () => {
    const candles = flat(120);
    candles[60] = { ...candles[60]!, low: 90 };
    const r = walkForward({ ...base, candles, forecasters: [constant("x", 0.5)] });
    const recs = r.perForecaster.x!.records;
    expect(r.baseRate).toBe(recs.filter((x) => x.hit === 1).length / recs.length);
    expect(r.baseRate).toBeGreaterThan(0);
  });

  test("the outcome window starts after the entry bar and ends exactly at the horizon", () => {
    const starts = (low: number) => {
      const candles = flat(120);
      candles[low] = { ...candles[low]!, low: 90 };
      const r = walkForward({ ...base, candles, forecasters: [constant("x", 0.5)] });
      return r.perForecaster.x!.records.filter((x) => x.side === "long" && x.distance === 0.05 && x.hit === 1).map((x) => x.startIndex);
    };
    // horizon is 10 bars; starts are 29, 34, ..., so a dip at bar 54 is seen by starts 49 and 44 only, never by start 54 itself
    expect(starts(54)).toEqual([44, 49]);
    // a dip at bar 64 is seen by starts 54 and 59, and start 64 does not see its own entry bar
    expect(starts(64)).toEqual([54, 59]);
    // the last bar of the window counts, one past it does not
    expect(starts(69)).toEqual([59, 64]);
  });

  test("the entry price is the close of the start bar, not the next open", () => {
    const candles = flat(120);
    // start 54: close 100, then bar 55 gaps down to open 95 with a low of 94
    candles[55] = { ...candles[55]!, open: 95, high: 95.5, low: 94, close: 95 };
    for (let i = 56; i < 66; i += 1) candles[i] = { ...candles[i]!, open: 95, high: 95.5, low: 94.5, close: 95 };
    const r = walkForward({ ...base, candles, forecasters: [constant("x", 0.5)] });
    const at54 = r.perForecaster.x!.records.filter((x) => x.startIndex === 54 && x.side === "long");
    // barrier 5 percent below the close of 100 is 95, and the low of 94 reaches it; measured from the next open of 95 it would be 90.25 and it would not
    expect(at54.find((x) => x.distance === 0.05)!.hit).toBe(1);
    expect(at54.find((x) => x.distance === 0.2)!.hit).toBe(0);
  });
});

describe("perStartMeanLoss", () => {
  const rec = (startIndex: number, p: number, hit: 0 | 1): WalkRecord => ({ p, hit, side: "long", distance: 0.1, startIndex });

  test("groups by start, ascending, with the chosen floor in the log loss", () => {
    const records = [rec(5, 0, 1), rec(5, 0.5, 0), rec(2, 0.9, 1), rec(2, 0.1, 0)];
    const brier = perStartMeanLoss(records, "brier");
    expect(brier.keys).toEqual([2, 5]);
    expect(brier.values[0]).toBeCloseTo((0.01 + 0.01) / 2, 12);
    expect(brier.values[1]).toBeCloseTo((1 + 0.25) / 2, 12);
    const loose = perStartMeanLoss(records, "logloss", 1e-2);
    const tight = perStartMeanLoss(records, "logloss", 1e-4);
    expect(loose.values[1]).toBeCloseTo((-Math.log(1e-2) + -Math.log(0.5)) / 2, 12);
    expect(tight.values[1]).toBeCloseTo((-Math.log(1e-4) + -Math.log(0.5)) / 2, 12);
    expect(tight.values[1]!).toBeGreaterThan(loose.values[1]!);
  });

  test("empty input and a bad floor", () => {
    expect(perStartMeanLoss([], "brier")).toEqual({ keys: [], values: [] });
    expect(() => perStartMeanLoss([rec(1, 0.5, 1)], "logloss", 0.9)).toThrow("option_invalid");
  });
});

describe("pooledByKey", () => {
  test("averages the series that have each key and keeps the keys in order", () => {
    const pooled = pooledByKey([
      { keys: [3, 1, 2], values: [30, 10, 20] },
      { keys: [2, 3, 4], values: [40, 50, 60] },
    ]);
    expect(pooled.keys).toEqual([1, 2, 3, 4]);
    expect(pooled.values).toEqual([10, 30, 40, 60]);
    expect(pooled.counts).toEqual([1, 2, 2, 1]);
  });

  test("one series passes through, nothing gives nothing, mismatched lengths are refused", () => {
    expect(pooledByKey([{ keys: [1, 2], values: [5, 6] }])).toEqual({ keys: [1, 2], values: [5, 6], counts: [1, 1] });
    expect(pooledByKey([])).toEqual({ keys: [], values: [], counts: [] });
    expect(() => pooledByKey([{ keys: [1], values: [1, 2] }])).toThrow("option_invalid");
  });

  test("the date level bootstrap is wider than treating every asset day as independent when assets move together", () => {
    // three assets with the same daily pattern: pooling by date keeps 60 days, stacking them pretends to have 180
    const random = mulberry32(4);
    const day = Array.from({ length: 60 }, () => normalDraw(random));
    const series = [0, 1, 2].map(() => ({ keys: day.map((_, i) => i), values: day.map((d) => d + 0.001) }));
    const zero = series.map((s) => ({ keys: s.keys, values: s.values.map(() => 0) }));
    const independent = pairedBlockBootstrap(series.flatMap((s) => s.values), zero.flatMap((s) => s.values), { blockLength: 1, resamples: 800, seed: 3, level: 0.95 })!;
    const dated = pairedBlockBootstrap(pooledByKey(series).values, pooledByKey(zero).values, { blockLength: 1, resamples: 800, seed: 3, level: 0.95 })!;
    expect(dated.ciHigh - dated.ciLow).toBeGreaterThan(1.4 * (independent.ciHigh - independent.ciLow));
  });

  test("the bootstrap interval has the stated level: an iid N(0, 1) difference of 400 points has a half width near 1.96 / 20", () => {
    const random = mulberry32(12);
    const a = Array.from({ length: 400 }, () => normalDraw(random));
    const r = pairedBlockBootstrap(a, a.map(() => 0), { blockLength: 1, resamples: 2000, seed: 5, level: 0.95 })!;
    const half = (r.ciHigh - r.ciLow) / 2;
    // a 95 percent interval has half width 1.96 / sqrt(400) = 0.098; a 90 percent one would be 0.082
    expect(half).toBeGreaterThan(0.09);
    expect(half).toBeLessThan(0.106);
    const narrow = pairedBlockBootstrap(a, a.map(() => 0), { blockLength: 1, resamples: 2000, seed: 5, level: 0.5 })!;
    // a 50 percent interval has half width 0.674 / 20 = 0.034
    expect((narrow.ciHigh - narrow.ciLow) / 2).toBeGreaterThan(0.028);
    expect((narrow.ciHigh - narrow.ciLow) / 2).toBeLessThan(0.040);
  });
});
