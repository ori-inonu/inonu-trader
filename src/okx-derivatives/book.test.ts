import { expect, test } from "bun:test";
import { isCrossed, midPrice, slippagePpm, walkDepth } from "./book.ts";
import { parseDecimal, ratInt } from "./decimal.ts";
import type { Level } from "./types.ts";

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

function levels(rows: Array<[string, string]>): Level[] {
  return rows.map(([price, size]) => ({ price: dec(price), size: dec(size) }));
}

const asks = levels([["100", "2"], ["101", "3"], ["103", "10"]]);

test("OKX-DERIV D3: the walk consumes levels best first and reports average, worst and touch price", () => {
  const one = walkDepth(asks, dec("2"));
  expect(one).toEqual({ filled: true, requested: dec("2"), cost: ratInt(200), avgPrice: ratInt(100), worstPrice: ratInt(100), touchPrice: ratInt(100), levelsUsed: 1 });

  const two = walkDepth(asks, dec("4"));
  expect(two.filled).toBe(true);
  if (two.filled) {
    expect(two.cost).toEqual(ratInt(402));
    expect(two.avgPrice).toEqual(dec("100.5"));
    expect(two.worstPrice).toEqual(ratInt(101));
    expect(two.touchPrice).toEqual(ratInt(100));
    expect(two.levelsUsed).toBe(2);
  }

  const all = walkDepth(asks, dec("15"));
  expect(all.filled).toBe(true);
  if (all.filled) {
    expect(all.cost).toEqual(ratInt(1533));
    expect(all.avgPrice).toEqual(dec("102.2"));
    expect(all.worstPrice).toEqual(ratInt(103));
    expect(all.levelsUsed).toBe(3);
  }
});

test("OKX-DERIV D3: the last level is consumed partially with exact fractions", () => {
  const walk = walkDepth(asks, dec("2.5"));
  expect(walk.filled).toBe(true);
  if (walk.filled) {
    expect(walk.cost).toEqual(dec("250.5"));
    expect(walk.avgPrice).toEqual(dec("100.2"));
    expect(walk.worstPrice).toEqual(ratInt(101));
  }
});

test("OKX-DERIV D3: insufficient depth is reported as unfilled, never extrapolated", () => {
  const thin = walkDepth(asks, dec("15.000000000000000001"));
  expect(thin).toEqual({ filled: false, requested: dec("15.000000000000000001"), available: ratInt(15) });
  expect(walkDepth([], dec("1"))).toEqual({ filled: false, requested: ratInt(1), available: ratInt(0) });
  expect(() => walkDepth(asks, ratInt(0))).toThrow(RangeError);
  expect(() => walkDepth(asks, dec("-1"))).toThrow(RangeError);
});

test("OKX-DERIV D3: slippage is measured against the touch and rounded up, against the trader", () => {
  expect(slippagePpm("buy", dec("100.5"), ratInt(100))).toBe(5000n);
  expect(slippagePpm("sell", dec("99.5"), ratInt(100))).toBe(5000n);
  expect(slippagePpm("buy", ratInt(100), ratInt(100))).toBe(0n);
  // 0.004 ppm is rounded up to 1 ppm instead of vanishing
  expect(slippagePpm("buy", dec("100.0000004"), ratInt(100))).toBe(1n);
  expect(slippagePpm("sell", dec("99.9999996"), ratInt(100))).toBe(1n);
  // a fill better than the touch never produces negative slippage
  expect(slippagePpm("buy", dec("99.9"), ratInt(100))).toBe(0n);
});

test("OKX-DERIV D3: a mid price requires both sides and an uncrossed book", () => {
  const bids = levels([["99", "1"], ["98", "5"]]);
  const normalAsks = levels([["101", "1"]]);
  expect(midPrice(bids, normalAsks)).toEqual(ratInt(100));
  expect(isCrossed(bids, normalAsks)).toBe(false);
  expect(midPrice([], normalAsks)).toBeNull();
  expect(midPrice(bids, [])).toBeNull();
  expect(isCrossed([], normalAsks)).toBe(false);

  const crossed = levels([["101", "1"]]);
  const lowAsk = levels([["100", "1"]]);
  expect(midPrice(crossed, lowAsk)).toBeNull();
  expect(isCrossed(crossed, lowAsk)).toBe(true);
  // a locked book (bid equal to ask) is not tradeable either
  expect(midPrice(levels([["100", "1"]]), levels([["100", "1"]]))).toBeNull();
  expect(isCrossed(levels([["100", "1"]]), levels([["100", "1"]]))).toBe(true);
});
