import { describe, expect, test } from "bun:test";
import type { Candle } from "./skip-backfill";
import { absMoves, shareOver } from "./move-vs-friction";

const T0 = 1_800_000_000 - (1_800_000_000 % 60);
const candle = (min: number, close: number): Candle => [T0 + min * 60, close, close, close, close, 1];

describe("the move report measures absolute moves and how often they exceed the friction", () => {
  test("a rise and a fall of the same size give the same absolute move", () => {
    const moves = absMoves([candle(0, 100), candle(1, 110), candle(2, 99)], 1);
    expect(moves.map((m) => Math.round(m * 100) / 100)).toEqual([10, 10]);
  });

  test("the share over the friction counts only moves strictly above it and an empty list has no share", () => {
    expect([shareOver([1, 2, 3, 5], 2), shareOver([], 2)]).toEqual([0.5, null]);
  });
});
