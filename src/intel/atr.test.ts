// T6.1 support: the ATR the zones are measured in (Wilder, 14 periods, closed candles only), the same definition the SMC of
// docs/sdd/grafico-jev uses. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { atrWilder, trueRange, type OhlcBar } from "./atr";

const bar = (open: number, high: number, low: number, close: number): OhlcBar => ({ open, high, low, close });

describe("trueRange", () => {
  test("the largest of the range and the gaps to the previous close", () => {
    expect(trueRange(bar(10, 12, 9, 11), null)).toBe(3);
    expect(trueRange(bar(10, 12, 9, 11), 8)).toBe(4); // |12 - 8|
    expect(trueRange(bar(10, 12, 9, 11), 14)).toBe(5); // |9 - 14|
    expect(trueRange(bar(10, 12, 9, 11), 10.5)).toBe(3);
  });
});

describe("atrWilder", () => {
  test("a constant range of 2 with no gaps is an ATR of exactly 2", () => {
    const bars = Array.from({ length: 20 }, () => bar(10, 11, 9, 10));
    expect(atrWilder(bars, 14)).toBe(2);
  });

  test("needs period + 1 bars: the first has no previous close for a gap", () => {
    expect(atrWilder(Array.from({ length: 14 }, () => bar(10, 11, 9, 10)), 14)).toBeNull();
    expect(atrWilder(Array.from({ length: 15 }, () => bar(10, 11, 9, 10)), 14)).toBe(2);
  });

  test("after the first average, each bar smooths in: ATR = (previous * 13 + TR) / 14", () => {
    const bars = [...Array.from({ length: 15 }, () => bar(10, 11, 9, 10)), bar(10, 16, 10, 15)]; // a true range of 6
    expect(atrWilder(bars, 14)).toBeCloseTo((2 * 13 + 6) / 14, 12);
  });

  test("a gap counts: the first average already includes it", () => {
    const flat = Array.from({ length: 15 }, () => bar(10, 11, 9, 10));
    flat[8] = bar(20, 21, 19, 20); // previous close 10: true range |21 - 10| = 11
    // 14 true ranges from bar 1 to 14: bar 8 is 11 and bar 9 gaps back down (|9 - 20| = 11); the rest are 2
    const trs = flat.slice(1).map((b, i) => trueRange(b, flat[i]!.close));
    expect(atrWilder(flat, 14)).toBeCloseTo(trs.reduce((a, b) => a + b, 0) / 14, 12);
  });

  test("invalid bars (high under low, not finite) make it null rather than a number built on nothing", () => {
    const bars = Array.from({ length: 16 }, () => bar(10, 11, 9, 10));
    bars[5] = bar(10, 8, 9, 10);
    expect(atrWilder(bars, 14)).toBeNull();
    bars[5] = bar(10, Number.NaN, 9, 10);
    expect(atrWilder(bars, 14)).toBeNull();
  });

  test("the period must be a positive whole number", () => {
    for (const bad of [0, -1, 2.5]) expect(() => atrWilder([], bad)).toThrow();
  });
});
