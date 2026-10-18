import { describe, expect, test } from "bun:test";
import type { Candle } from "./skip-backfill";
import { bestMovesPerInterval, lastHours, multipleOf, requiredCapture } from "./oracle-bound";

const T0 = 1_800_000_000 - (1_800_000_000 % 60);
const candle = (min: number, close: number): Candle => [T0 + min * 60, close, close, close, close, 1];

describe("the hindsight bound separates the opportunity in the data from the skill needed to use it", () => {
  test("the best move of an interval is the best rise among the tokens that have a real candle at both ends, and never negative", () => {
    const cache: Record<string, Candle[]> = {
      A: [candle(0, 100), candle(5, 110), candle(10, 99)],
      B: [candle(0, 100), candle(5, 104), candle(10, 105)],
    };
    const best = bestMovesPerInterval(cache, 5);
    expect(best.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.1, 0.01]);
  });

  test("a token with no candle at an end of the interval does not count for that interval", () => {
    const cache: Record<string, Candle[]> = { A: [candle(0, 100), candle(4, 200), candle(10, 100)] };
    expect(bestMovesPerInterval(cache, 5)).toEqual([]);
  });

  test("capturing a fraction of the best move pays the friction each time and stays in cash when the capture does not beat it", () => {
    const m = multipleOf([0.1, 0.01], 1, 0.02);
    const small = multipleOf([0.1, 0.01], 0.1, 0.02);
    expect([Math.round(m * 10000) / 10000, small]).toEqual([1.08, 1]);
  });

  test("the required capture is the smallest fraction of the best moves that reaches the target multiple, and null when even all of them cannot", () => {
    const bests = Array.from({ length: 10 }, () => 0.1);
    const phi = requiredCapture(bests, 0.02, 2);
    expect([phi !== null && phi > 0.2 && phi < 1, requiredCapture([0.001], 0.02, 10)]).toEqual([true, null]);
  });

  test("the common window keeps only the candles of the last hours before the newest candle of any token", () => {
    const cache: Record<string, Candle[]> = { A: [candle(0, 1), candle(120, 1), candle(180, 1)], B: [candle(10, 1)] };
    const w = lastHours(cache, 1.5);
    expect([w["A"]!.length, w["B"]!.length]).toEqual([2, 0]);
  });
});
