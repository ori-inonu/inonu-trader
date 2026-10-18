// The factors of the opportunity engine, on series built by hand so every number can be checked. origin: synthetic_fixture, tests only. No network, no clock.
import { describe, expect, test } from "bun:test";
import { attention, MIN_CANDLES, moveInAtr, OPPORTUNITY_RULES, readFactors, rsiWilder, type DayCandle } from "./factors";

const DAY = 86_400_000;

/** A candle around `close` with a 2% range and a given volume. */
const candle = (i: number, close: number, vol = 1_000_000, over: Partial<DayCandle> = {}): DayCandle => ({
  ts: i * DAY, open: close, high: close * 1.01, low: close * 0.99, close, volQuote: vol, ...over,
});

/** `n` days flat at `level`. */
const flat = (n: number, level = 100, vol = 1_000_000): DayCandle[] => Array.from({ length: n }, (_, i) => candle(i, level, vol));

/** 90 days that fall from 200 to `to` in a straight line, then the given tail. */
function fall(to: number, tail: readonly DayCandle[] = [candle(0, to)]): DayCandle[] {
  const body = Array.from({ length: 90 }, (_, i) => candle(i, 200 - ((200 - to) * i) / 89));
  return [...body, ...tail.map((c, k) => ({ ...c, ts: (90 + k) * DAY }))];
}

describe("the series it accepts", () => {
  test("too short a series is no read", () => {
    expect(readFactors(flat(MIN_CANDLES - 1))).toBeNull();
    expect(readFactors(flat(MIN_CANDLES))).not.toBeNull();
  });

  test("a broken number makes the whole series no read, never a guess", () => {
    for (const broken of [{ close: 0 }, { close: Number.NaN }, { low: -1 }, { high: 1, low: 2 }, { volQuote: -5 }] as const) {
      const series = flat(100);
      series[40] = { ...series[40]!, ...broken };
      expect(readFactors(series)).toBeNull();
    }
  });
});

describe("cheap against itself", () => {
  test("a pair that fell to the bottom of its 30 day range and 40% under its 90 day high holds the discount", () => {
    const read = readFactors(fall(120))!;
    expect(read.pos30).toBeLessThan(0.1);
    expect(read.drawdown90).toBeGreaterThan(0.38);
    expect(read.held.desconto).toBe(true);
  });

  test("a pair at its highs does not, and neither does one that is low in the 30 day range but only a little under its 90 day high", () => {
    const up = Array.from({ length: 100 }, (_, i) => candle(i, 100 + i));
    expect(readFactors(up)!.held.desconto).toBe(false);
    // 100 days at 100 with a dip to 85 inside the last 30 days: low in the range, but only 15% under the high
    const shallow = flat(100);
    for (let i = 80; i < 100; i += 1) shallow[i] = candle(i, 100 - (i - 79) * 0.75);
    const read = readFactors(shallow)!;
    expect(read.pos30).toBeLessThan(OPPORTUNITY_RULES.posMax);
    expect(read.drawdown90).toBeLessThan(OPPORTUNITY_RULES.drawdownMin);
    expect(read.held.desconto).toBe(false);
  });
});

describe("the fall seems to stop", () => {
  test("no new low for three days and a close above the mean of five holds it", () => {
    const tail = [100, 99, 98, 97, 96, 99].map((p, k) => candle(k, p));
    const read = readFactors(fall(100, tail))!;
    expect(read.noNewLow).toBe(false); // 96 undercut the lows of the days before
    const calmer = [100, 100, 100, 100.2, 100.5, 101].map((p, k) => candle(k, p));
    const calm = readFactors(fall(100, calmer))!;
    expect(calm.noNewLow).toBe(true);
    expect(calm.aboveSma5).toBe(true);
    expect(calm.held.virada).toBe(true);
  });

  test("a pair still making new lows does not hold it", () => {
    const sliding = [100, 98, 96, 94, 92, 90].map((p, k) => candle(k, p));
    const read = readFactors(fall(100, sliding))!;
    expect(read.noNewLow).toBe(false);
    expect(read.aboveSma5).toBe(false);
    expect(read.held.virada).toBe(false);
  });
});

describe("more money than usual", () => {
  test("a day with 1.3 times the mean of the seven days before holds it, and 1.29 does not", () => {
    const base = flat(99);
    expect(readFactors([...base, candle(99, 100, 1_300_000)])!.held.participacao).toBe(true);
    expect(readFactors([...base, candle(99, 100, 1_290_000)])!.held.participacao).toBe(false);
    expect(readFactors([...base, candle(99, 100, 1_300_000)])!.volRatio).toBeCloseTo(1.3, 9);
  });

  test("a mean of zero is no ratio, not an infinite one", () => {
    const dead = flat(99, 100, 0);
    expect(readFactors([...dead, candle(99, 100, 500)])!.volRatio).toBeNull();
    expect(readFactors([...dead, candle(99, 100, 500)])!.held.participacao).toBe(false);
  });
});

describe("the count and the geometry", () => {
  test("the count is how many of the three hold", () => {
    const calmer = [100, 100, 100, 100.2, 100.5, 101].map((p, k) => candle(k, p, k === 5 ? 3_000_000 : 1_000_000));
    const read = readFactors(fall(100, calmer))!;
    expect(read.held).toEqual({ desconto: true, virada: true, participacao: true });
    expect(read.count).toBe(3);
  });

  test("the room up and the gap down are fractions of the price, and the ratio is null at the low", () => {
    const read = readFactors(fall(100, [candle(0, 100)]))!;
    expect(read.roomToHigh30).toBeGreaterThan(0.2);
    expect(read.gapToLow30).toBeGreaterThan(0);
    expect(read.roomRatio).toBeCloseTo(read.roomToHigh30 / read.gapToLow30, 9);
    const atLow = flat(100);
    atLow[99] = candle(99, 100, 1_000_000, { low: 100, high: 100.5, close: 100 });
    for (let i = 70; i < 99; i += 1) atLow[i] = candle(i, 110);
    const low = readFactors(atLow)!;
    expect(low.gapToLow30).toBeCloseTo(0, 9);
    expect(low.roomRatio).toBeNull();
  });

  test("the liquidity the history shows is the mean daily volume of 30 days", () => {
    const series = flat(100);
    for (let i = 70; i < 100; i += 1) series[i] = candle(i, 100, 2_000_000);
    expect(readFactors(series)!.meanVol30).toBe(2_000_000);
  });
});

describe("how far out of the ordinary", () => {
  test("the move in units of the usual range plus the volume above the usual, direction blind", () => {
    // a 6% move for a pair that moves 3% a day is two ranges: half of the move part; a volume of twice the mean is a third of the volume part
    expect(attention(0.06, 0.03, 2)).toBeCloseTo(2 / 4 + 1 / 3, 9);
    expect(attention(-0.06, 0.03, 2)).toBeCloseTo(attention(0.06, 0.03, 2), 9);
  });

  test("both parts are capped, so one wild number does not own the board", () => {
    expect(attention(5, 0.01, 99)).toBeCloseTo(2, 9);
  });

  test("a volume under the usual adds nothing, and a missing number is nothing, not a guess", () => {
    expect(attention(0, 0.03, 0.4)).toBe(0);
    expect(attention(null, 0.03, null)).toBe(0);
    expect(attention(0.05, null, 1.5)).toBeCloseTo(0.5 / 3, 9);
    expect(attention(Number.NaN, 0.03, 1)).toBe(0);
    expect(attention(0.05, 0, 1)).toBe(0);
  });

  test("the move in ranges is signed and null without a range", () => {
    expect(moveInAtr(-0.06, 0.03)).toBeCloseTo(-2, 9);
    expect(moveInAtr(0.06, null)).toBeNull();
    expect(moveInAtr(null, 0.03)).toBeNull();
  });
});

describe("rsi", () => {
  test("a straight rise reads 100, a straight fall 0 and a flat line 50", () => {
    expect(rsiWilder(Array.from({ length: 30 }, (_, i) => 100 + i))).toBe(100);
    expect(rsiWilder(Array.from({ length: 30 }, (_, i) => 100 - i))).toBe(0);
    expect(rsiWilder(Array.from({ length: 30 }, () => 100))).toBe(50);
  });

  test("it needs period plus one closes", () => {
    expect(rsiWilder([1, 2, 3], 14)).toBeNull();
  });

  test("a known series: gains and losses smooth the way Wilder describes", () => {
    // 14 changes: seven +1 and seven -1 give a mean gain of 0.5 and a mean loss of 0.5, so 50
    const closes = [100];
    for (let i = 0; i < 14; i += 1) closes.push(closes[closes.length - 1]! + (i % 2 === 0 ? 1 : -1));
    expect(rsiWilder(closes)).toBeCloseTo(50, 9);
  });
});
