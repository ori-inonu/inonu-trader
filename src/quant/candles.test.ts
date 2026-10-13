import { describe, expect, test } from "bun:test";
import { auditCandles, type CandleIssueKind } from "./candles";
import { QuantError, type Candle } from "./types";

const BAR = 900_000;
const T0 = 1_800_000_000_000;

function bar(i: number, close = 100, overrides: Partial<Candle> = {}): Candle {
  return { startMs: T0 + i * BAR, open: close, high: close * 1.001, low: close * 0.999, close, volume: 10, confirmed: true, ...overrides };
}

/** n consecutive clean bars with a gentle deterministic wiggle. */
function series(n: number, from = 0): Candle[] {
  return Array.from({ length: n }, (_, k) => bar(from + k, 100 + Math.sin(k / 3)));
}

const nowAfter = (candles: readonly Candle[]) => candles[candles.length - 1]!.startMs + BAR + 1_000;
const kinds = (audit: { issues: readonly { kind: CandleIssueKind }[] }) => audit.issues.map((issue) => issue.kind);

describe("auditCandles", () => {
  test("a clean consecutive series is grade A with every bar usable and no issues", () => {
    const candles = series(40);
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    expect(audit.grade).toBe("A");
    expect(audit.usable.length).toBe(40);
    expect(audit.issues).toEqual([]);
    expect(audit.fresh).toBe(true);
    expect(audit.coverage).toBe(1);
  });

  test("newest first is the exchange's own order: accepted without an issue and the usable series is ascending", () => {
    const candles = series(30);
    const audit = auditCandles([...candles].reverse(), BAR, nowAfter(candles));
    expect(kinds(audit)).not.toContain("out_of_order");
    expect(audit.grade).toBe("A");
    expect(audit.usable.map((c) => c.startMs)).toEqual(candles.map((c) => c.startMs));
  });

  test("an input that is neither ascending nor descending is reported as out_of_order and still sorted", () => {
    const candles = series(30);
    const mixed = [...candles.slice(10), ...candles.slice(0, 10)];
    const audit = auditCandles(mixed, BAR, nowAfter(candles));
    expect(kinds(audit)).toContain("out_of_order");
    expect(audit.grade).toBe("B");
    expect(audit.usable.map((c) => c.startMs)).toEqual(candles.map((c) => c.startMs));
  });

  test("an identical duplicate is collapsed and reported", () => {
    const candles = series(30);
    const audit = auditCandles([...candles, candles[10]!], BAR, nowAfter(candles));
    expect(kinds(audit)).toContain("duplicate_start");
    expect(audit.usable.length).toBe(30);
  });

  test("a conflicting duplicate drops that start and breaks continuity", () => {
    const candles = series(40);
    const conflicting = { ...candles[30]!, close: candles[30]!.close * 1.01, high: candles[30]!.high * 1.02 };
    const audit = auditCandles([...candles, conflicting], BAR, nowAfter(candles));
    expect(kinds(audit)).toContain("duplicate_conflict");
    expect(audit.usable.length).toBe(9);
    expect(audit.usable[0]!.startMs).toBe(candles[31]!.startMs);
  });

  test("a gap keeps only the contiguous suffix and reports how many bars are missing", () => {
    const candles = [...series(20), ...series(25, 23)];
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    const gap = audit.issues.find((issue) => issue.kind === "gap");
    expect(gap?.detail).toBe(3);
    expect(audit.usable.length).toBe(25);
    expect(audit.coverage).toBeCloseTo(25 / 45, 12);
    expect(audit.grade).toBe("C");
  });

  test("a start that is not a multiple of the bar after the previous one is off_grid and breaks the series", () => {
    const candles = series(40);
    const shifted = candles.map((c, i) => (i >= 25 ? { ...c, startMs: c.startMs + 1_000 } : c));
    const audit = auditCandles(shifted, BAR, nowAfter(shifted));
    expect(kinds(audit)).toContain("off_grid");
    expect(audit.usable.length).toBe(15);
  });

  test("a bar that starts less than one bar after the previous one is off_grid and breaks the series", () => {
    const candles = series(40);
    const overlapping = candles.map((c, i) => (i >= 20 ? { ...c, startMs: c.startMs - BAR / 2 } : c));
    const audit = auditCandles(overlapping, BAR, nowAfter(overlapping));
    expect(kinds(audit)).toContain("off_grid");
    expect(audit.usable.length).toBe(20);
  });

  test("an alignment that is not the UTC grid is accepted when the spacing is consistent", () => {
    const base = T0 + 16 * 3_600_000;
    const candles = Array.from({ length: 30 }, (_, k) => ({ ...bar(0, 100 + Math.cos(k)), startMs: base + k * 86_400_000 }));
    const audit = auditCandles(candles, 86_400_000, base + 30 * 86_400_000 + 1_000);
    expect(audit.issues).toEqual([]);
    expect(audit.usable.length).toBe(30);
  });

  test("incoherent OHLC is excluded and breaks continuity", () => {
    const candles = series(40);
    candles[20] = { ...candles[20]!, high: candles[20]!.close * 0.99 };
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    expect(audit.issues.some((issue) => issue.kind === "ohlc_incoherent" && issue.index === 20)).toBe(true);
    expect(audit.usable.length).toBe(19);
  });

  test("low above the open is incoherent too, and a bad latest bar leaves a stale suffix", () => {
    const candles = series(30);
    candles[29] = { ...candles[29]!, low: candles[29]!.open * 1.01, high: candles[29]!.open * 1.02, close: candles[29]!.open * 1.015 };
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    expect(kinds(audit)).toContain("ohlc_incoherent");
    expect(audit.usable.length).toBe(29);
    expect(audit.fresh).toBe(false);
    expect(audit.grade).toBe("F");
  });

  test("non finite and non positive prices are rejected without throwing", () => {
    const candles = series(40);
    candles[10] = { ...candles[10]!, close: Number.NaN };
    candles[30] = { ...candles[30]!, low: 0 };
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    expect(kinds(audit)).toContain("non_finite");
    expect(kinds(audit)).toContain("non_positive");
    expect(audit.usable.length).toBe(9);
  });

  test("negative volume is a structural defect, null volume is not", () => {
    const candles = series(30);
    candles[5] = { ...candles[5]!, volume: null };
    expect(kinds(auditCandles(candles, BAR, nowAfter(candles)))).not.toContain("negative_volume");
    candles[6] = { ...candles[6]!, volume: -1 };
    expect(kinds(auditCandles(candles, BAR, nowAfter(candles)))).toContain("negative_volume");
  });

  test("an unconfirmed latest bar is excluded and reported but does not make the series stale", () => {
    const candles = series(30);
    candles.push(bar(30, 100, { confirmed: false }));
    const audit = auditCandles(candles, BAR, T0 + 30 * BAR + BAR / 2);
    expect(kinds(audit)).toContain("unconfirmed");
    expect(audit.usable.length).toBe(30);
    expect(audit.fresh).toBe(true);
  });

  test("a confirmed bar that has not ended yet is a future_candle and is excluded", () => {
    const candles = series(30);
    const audit = auditCandles(candles, BAR, candles[29]!.startMs + BAR / 2);
    expect(kinds(audit)).toContain("future_candle");
    expect(audit.usable.length).toBe(29);
  });

  test("a tail older than one bar past its end is stale and the grade is F", () => {
    const candles = series(30);
    const audit = auditCandles(candles, BAR, candles[29]!.startMs + BAR + 2 * BAR + 1);
    expect(audit.fresh).toBe(false);
    expect(kinds(audit)).toContain("stale_tail");
    expect(audit.grade).toBe("F");
  });

  test("a tail exactly one bar past its end is still fresh", () => {
    const candles = series(30);
    const audit = auditCandles(candles, BAR, candles[29]!.startMs + 2 * BAR);
    expect(audit.fresh).toBe(true);
  });

  test("too few usable bars is grade F", () => {
    const candles = series(10);
    expect(auditCandles(candles, BAR, nowAfter(candles)).grade).toBe("F");
  });

  test("a spike that reverts is flagged as two return outliers and the bars stay usable", () => {
    const candles = series(60);
    candles[30] = bar(30, 150);
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    const outliers = audit.issues.filter((issue) => issue.kind === "return_outlier");
    expect(outliers.map((issue) => issue.index)).toEqual([30, 31]);
    expect(audit.usable.length).toBe(60);
    expect(audit.grade).toBe("B");
  });

  test("the outlier threshold is in robust sigma units: a return ten MADs out is below 8 sigma and above 5", () => {
    // 60 alternating +-0.001 returns (median 0.001, MAD 0.002) and a last return of 0.021, which is 10 MADs from the median
    const returns = [...Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0.001 : -0.001)), 0.021];
    let price = 100;
    const candles: Candle[] = [bar(0, price)];
    returns.forEach((r, i) => {
      const open = price;
      price *= Math.exp(r);
      candles.push({ startMs: T0 + (i + 1) * BAR, open, high: Math.max(open, price) * 1.0001, low: Math.min(open, price) * 0.9999, close: price, volume: 1, confirmed: true });
    });
    candles[0] = { ...candles[0]!, high: 100.01, low: 99.99 };
    const now = nowAfter(candles);
    expect(kinds(auditCandles(candles, BAR, now))).not.toContain("return_outlier");
    expect(kinds(auditCandles(candles, BAR, now, { outlierZ: 5 }))).toContain("return_outlier");
  });

  test("a confirmed bar that ends exactly now is not in the future", () => {
    const candles = series(30);
    const audit = auditCandles(candles, BAR, candles[29]!.startMs + BAR);
    expect(kinds(audit)).not.toContain("future_candle");
    expect(audit.usable.length).toBe(30);
  });

  test("a flat run is reported from exactly the minimum length, not below it", () => {
    const flatten = (count: number) => {
      const candles = series(60);
      for (let i = 20; i < 20 + count; i += 1) candles[i] = { ...candles[i]!, open: 100, high: 100, low: 100, close: 100 };
      return candles;
    };
    const three = flatten(3);
    const two = flatten(2);
    expect(auditCandles(three, BAR, nowAfter(three)).issues.find((issue) => issue.kind === "flat_run")?.detail).toBe(3);
    expect(kinds(auditCandles(two, BAR, nowAfter(two)))).not.toContain("flat_run");
  });

  test("the range outlier factor is 10 times the median range: 9 times is fine, 11 times is flagged", () => {
    const wick = (ratio: number) => {
      const candles = series(60);
      // series() bars have a range of 0.2 percent of the close (low at -0.1 percent); widen one bar to ratio times that range
      candles[40] = { ...candles[40]!, high: candles[40]!.close * (1 + 0.002 * ratio - 0.001), low: candles[40]!.close * 0.999 };
      return auditCandles(candles, BAR, nowAfter(candles)).issues.some((issue) => issue.kind === "range_outlier");
    };
    expect(wick(9)).toBe(false);
    expect(wick(11)).toBe(true);
  });

  test("a bar with zero volume is valid and a duplicate that differs only in volume is a conflict", () => {
    const candles = series(40);
    candles[10] = { ...candles[10]!, volume: 0 };
    expect(kinds(auditCandles(candles, BAR, nowAfter(candles)))).toEqual([]);
    const conflicting = [...candles, { ...candles[20]!, volume: 99 }];
    expect(kinds(auditCandles(conflicting, BAR, nowAfter(candles)))).toContain("duplicate_conflict");
  });

  test("an absurd wick is flagged as range_outlier", () => {
    const candles = series(60);
    candles[40] = { ...candles[40]!, high: candles[40]!.close * 1.6 };
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    expect(audit.issues.some((issue) => issue.kind === "range_outlier" && issue.index === 40)).toBe(true);
  });

  test("a run of zero range bars is reported once with its length", () => {
    const candles = series(60);
    for (let i = 20; i < 24; i += 1) candles[i] = { ...candles[i]!, open: 100, high: 100, low: 100, close: 100 };
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    const runs = audit.issues.filter((issue) => issue.kind === "flat_run");
    expect(runs.length).toBe(1);
    expect(runs[0]!.detail).toBe(4);
  });

  test("a series that never moves has no outlier verdict instead of dividing by zero", () => {
    const candles = Array.from({ length: 40 }, (_, k) => bar(k, 100, { high: 100, low: 100, open: 100 }));
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    expect(kinds(audit)).not.toContain("return_outlier");
    expect(kinds(audit)).toContain("flat_run");
  });

  test("counts match the issues", () => {
    const candles = [...series(20), ...series(25, 23)];
    const audit = auditCandles(candles, BAR, nowAfter(candles));
    expect(audit.counts.gap).toBe(1);
    expect(audit.counts.return_outlier).toBe(0);
  });

  test("the audit is deterministic and never mutates or reorders its input", () => {
    const candles = Object.freeze(series(40).map((c) => Object.freeze({ ...c })));
    const a = auditCandles(candles, BAR, nowAfter(candles));
    const b = auditCandles(candles, BAR, nowAfter(candles));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("empty input is grade F with no exception", () => {
    const audit = auditCandles([], BAR, T0);
    expect(audit.grade).toBe("F");
    expect(audit.usable).toEqual([]);
    expect(audit.coverage).toBe(0);
  });

  test("invalid contract arguments fail with a constant code", () => {
    expect(() => auditCandles(series(3), 0, T0)).toThrow(QuantError);
    expect(() => auditCandles(series(3), Number.NaN, T0)).toThrow("bar_invalid");
    expect(() => auditCandles(series(3), BAR, Number.NaN)).toThrow("now_invalid");
    expect(() => auditCandles(series(3), BAR, T0, { outlierZ: -1 })).toThrow("option_invalid");
  });
});
