// T5.5 / FLX-8, FLX-12, AC-FLX-4, AC-FLX-5: adaptive thresholds from moving percentiles, with a warm-up state. No market
// constant is fixed: minVol, Q and T come from the instrument's own recent candles. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { adaptiveThresholds, percentile, percentileRatio, type ThresholdCandle } from "./thresholds";

describe("percentile (nearest rank, no interpolation)", () => {
  const sorted = [5, 10, 10, 20, 30, 30, 50, 60];

  test("the vectors of V-POC-1: P80 of eight values is the 7th, P20 the 2nd", () => {
    expect(percentile(sorted, 80)).toBe(50);
    expect(percentile(sorted, 20)).toBe(10);
  });

  test("rank = ceil(P * N / 100), at least 1, on the ascending order whatever the input order", () => {
    expect(percentile([60, 5, 30, 10, 50, 30, 10, 20], 50)).toBe(20); // rank 4
    expect(percentile(sorted, 100)).toBe(60);
    expect(percentile(sorted, 0)).toBe(5); // rank floors at 1
    expect(percentile([7], 99)).toBe(7);
  });

  test("an empty list has no percentile, and P must be a whole number from 0 to 100", () => {
    expect(percentile([], 50)).toBeNull();
    for (const bad of [-1, 101, 50.5, Number.NaN]) expect(() => percentile(sorted, bad)).toThrow();
  });
});

describe("percentileRatio compares fractions exactly", () => {
  test("volume per tick is a ratio: 20 over 2 ticks ranks as 10, and ties keep the first", () => {
    const values = [{ num: 20, den: 2 }, { num: 9, den: 1 }, { num: 33, den: 3 }, { num: 5, den: 1 }];
    // per tick: 10, 9, 11, 5 -> ascending 5, 9, 10, 11
    expect(percentileRatio(values, 50)).toEqual({ num: 9, den: 1 }); // rank 2
    expect(percentileRatio(values, 75)).toEqual({ num: 20, den: 2 }); // rank 3
    expect(percentileRatio(values, 100)).toEqual({ num: 33, den: 3 });
    expect(percentileRatio([], 50)).toBeNull();
  });
});

describe("adaptiveThresholds", () => {
  const candle = (binTicks: number, levels: [number, number][]): ThresholdCandle => ({ binTicks, levels: levels.map(([c, v]) => ({ c, v })) });
  const three = (binTicks = 1) => [0, 1, 2].map(() => candle(binTicks, [[10, 0], [20, 10], [5, 5]]));
  const trades = Array.from({ length: 100 }, (_, i) => i + 1);

  test("before N closed candles everything is null with the reason aquecimento, and how far it is", () => {
    expect(adaptiveThresholds({ candles: three().slice(0, 2), currentBinTicks: 1, tradeUnits: trades, warmupCandles: 3 })).toEqual({ ok: false, reason: "aquecimento", have: 2, need: 3 });
    expect(adaptiveThresholds({ candles: [], currentBinTicks: 1, tradeUnits: trades })).toEqual({ ok: false, reason: "aquecimento", have: 0, need: 50 });
  });

  test("minVol is P50 of the total per level, Q is P90 of the aggressed volume per level and side, T is P99 of single trades", () => {
    const t = adaptiveThresholds({ candles: three(), currentBinTicks: 1, tradeUnits: trades, warmupCandles: 3 });
    // totals per level: 10, 30, 10 three times -> nine values, P50 is the 5th -> 10
    // positive sides: 10, 20, 5, 10, 5 per candle -> fifteen values, P90 is the 14th -> 20
    // trades 1..100 -> P99 is the 99th -> 99
    expect(t).toEqual({ ok: true, minVol: 10, q: 20, t: 99 });
  });

  test("only the last N candles count", () => {
    const old = [0, 1, 2, 3].map(() => candle(1, [[1000, 1000]]));
    const t = adaptiveThresholds({ candles: [...old, ...three()], currentBinTicks: 1, tradeUnits: trades, warmupCandles: 3 });
    expect(t).toMatchObject({ ok: true, minVol: 10, q: 20 });
  });

  test("volume is compared per tick, so a wider bin neither inflates nor deflates the threshold", () => {
    // a level of width 2 ticks with 20 units is 10 per tick: read back at width 1 it is 10, at width 2 it is 20
    const wide = [0, 1, 2].map(() => candle(2, [[20, 0]]));
    expect(adaptiveThresholds({ candles: wide, currentBinTicks: 1, tradeUnits: trades, warmupCandles: 3 })).toMatchObject({ minVol: 10, q: 10 });
    expect(adaptiveThresholds({ candles: wide, currentBinTicks: 2, tradeUnits: trades, warmupCandles: 3 })).toMatchObject({ minVol: 20, q: 20 });
  });

  test("a threshold never goes below one unit (the lot is the floor)", () => {
    const tiny = [0, 1, 2].map(() => candle(10, [[1, 0]])); // 0.1 per tick at width 1
    expect(adaptiveThresholds({ candles: tiny, currentBinTicks: 1, tradeUnits: [1], warmupCandles: 3 })).toMatchObject({ minVol: 1, q: 1, t: 1 });
  });

  test("without recent trades T is null with its own reason, the other two still stand", () => {
    const t = adaptiveThresholds({ candles: three(), currentBinTicks: 1, tradeUnits: [], warmupCandles: 3 });
    expect(t).toEqual({ ok: true, minVol: 10, q: 20, t: null, tReason: "sem_negocios" });
  });

  test("levels with no volume are not samples", () => {
    const withEmpty = [0, 1, 2].map(() => candle(1, [[0, 0], [10, 0], [0, 0]]));
    expect(adaptiveThresholds({ candles: withEmpty, currentBinTicks: 1, tradeUnits: trades, warmupCandles: 3 })).toMatchObject({ minVol: 10, q: 10 });
  });

  test("bad parameters are errors at the call", () => {
    for (const bad of [0, -1, 1.5]) expect(() => adaptiveThresholds({ candles: [], currentBinTicks: bad, tradeUnits: [] })).toThrow();
    expect(() => adaptiveThresholds({ candles: [], currentBinTicks: 1, tradeUnits: [], warmupCandles: 0 })).toThrow();
  });

  test("the module holds no market constant: the only numbers in the source are the documented defaults", async () => {
    const source = await Bun.file(new URL("./thresholds.ts", import.meta.url)).text();
    const numbers = new Set((source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").match(/\b\d+(?:_\d+)*\b/g) ?? []));
    // 0, 1, 2, 100 are structure (rank maths and the floor); 50 90 99 are the percentiles of the table; 2000 and 50 the windows
    for (const n of numbers) expect(["0", "1", "2", "50", "90", "99", "100", "2_000"]).toContain(n);
  });
});
