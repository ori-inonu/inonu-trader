import { describe, expect, test } from "bun:test";
import { contiguousSuffixStart, mergeCandles } from "./history";
import { QuantError, type Candle } from "./types";

const BAR = 900_000;
const T0 = 1_800_000_000_000;
const bar = (i: number, close = 100, extra: Partial<Candle> = {}): Candle =>
  ({ startMs: T0 + i * BAR, open: close, high: close + 1, low: close - 1, close, volume: 1, confirmed: true, ...extra });

describe("mergeCandles", () => {
  test("merges two overlapping windows into one ascending series without duplicates", () => {
    const older = [0, 1, 2, 3].map((i) => bar(i));
    const newer = [2, 3, 4, 5].map((i) => bar(i));
    const r = mergeCandles(older, newer, 100);
    expect(r.candles.map((c) => c.startMs)).toEqual([0, 1, 2, 3, 4, 5].map((i) => T0 + i * BAR));
    expect(r.droppedNonFinite).toBe(0);
  });

  test("accepts the exchange order, newest first", () => {
    const r = mergeCandles([], [3, 2, 1, 0].map((i) => bar(i)), 100);
    expect(r.candles.map((c) => c.startMs)).toEqual([0, 1, 2, 3].map((i) => T0 + i * BAR));
  });

  test("the incoming bar replaces the stored one at the same start", () => {
    const r = mergeCandles([bar(0, 100)], [bar(0, 105)], 100);
    expect(r.candles).toHaveLength(1);
    expect(r.candles[0]!.close).toBe(105);
  });

  test("a confirmed bar restated by another confirmed bar with different values is counted, not hidden", () => {
    const r = mergeCandles([bar(5, 100), bar(6, 100)], [bar(5, 101), bar(6, 100)], 100);
    expect(r.restated).toBe(1);
    expect(r.candles[0]!.close).toBe(101);
    expect(r.candles[1]!.close).toBe(100);
  });

  test("an identical confirmed copy and the confirmation of an unconfirmed bar are not restatements", () => {
    expect(mergeCandles([bar(5, 100)], [bar(5, 100)], 100).restated).toBe(0);
    expect(mergeCandles([bar(5, 100, { confirmed: false })], [bar(5, 101)], 100).restated).toBe(0);
    expect(mergeCandles([], [bar(1), bar(2)], 100).restated).toBe(0);
  });

  test("an unconfirmed bar becomes confirmed when its final version arrives", () => {
    const r = mergeCandles([bar(5, 100, { confirmed: false })], [bar(5, 101, { confirmed: true })], 100);
    expect(r.candles[0]).toMatchObject({ close: 101, confirmed: true });
  });

  test("a confirmed bar is never downgraded by a later unconfirmed copy", () => {
    const r = mergeCandles([bar(5, 101, { confirmed: true })], [bar(5, 99, { confirmed: false })], 100);
    expect(r.candles[0]).toMatchObject({ close: 101, confirmed: true });
  });

  test("keeps only the newest maxBars", () => {
    const r = mergeCandles([], [0, 1, 2, 3, 4, 5, 6, 7].map((i) => bar(i)), 5);
    expect(r.candles.map((c) => c.startMs)).toEqual([3, 4, 5, 6, 7].map((i) => T0 + i * BAR));
  });

  test("rows without a usable start time are counted, not silently lost", () => {
    const r = mergeCandles([], [bar(0), { ...bar(1), startMs: Number.NaN }, bar(2)], 100);
    expect(r.candles).toHaveLength(2);
    expect(r.droppedNonFinite).toBe(1);
  });

  test("does not mutate its inputs", () => {
    const a = Object.freeze([bar(0), bar(1)].map((c) => Object.freeze({ ...c })));
    const b = Object.freeze([bar(1, 7), bar(2)].map((c) => Object.freeze({ ...c })));
    expect(() => mergeCandles(a, b, 10)).not.toThrow();
  });

  test("an invalid cap is refused", () => {
    expect(() => mergeCandles([], [], 0)).toThrow(QuantError);
    expect(() => mergeCandles([], [], 1.5)).toThrow("option_invalid");
  });
});

describe("contiguousSuffixStart", () => {
  test("is the start of the newest run of consecutive bars", () => {
    const candles = [0, 1, 2, 5, 6, 7].map((i) => bar(i));
    expect(contiguousSuffixStart(candles, BAR)).toBe(T0 + 5 * BAR);
  });
  test("a fully consecutive series starts at its first bar", () => {
    expect(contiguousSuffixStart([0, 1, 2].map((i) => bar(i)), BAR)).toBe(T0);
  });
  test("bars closer than one bar apart end the run too, not only gaps", () => {
    const candles = [0, 1, 2].map((i) => bar(i));
    const overlapping = [...candles, { ...bar(3), startMs: T0 + 2 * BAR + BAR / 2 }, { ...bar(4), startMs: T0 + 3 * BAR + BAR / 2 }];
    expect(contiguousSuffixStart(overlapping, BAR)).toBe(T0 + 2 * BAR + BAR / 2);
  });
  test("a single bar and an empty series", () => {
    expect(contiguousSuffixStart([bar(4)], BAR)).toBe(T0 + 4 * BAR);
    expect(contiguousSuffixStart([], BAR)).toBeNull();
  });
  test("a bad bar length is refused", () => {
    expect(() => contiguousSuffixStart([bar(0)], 0)).toThrow("bar_invalid");
  });
});
