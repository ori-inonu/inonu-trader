import { describe, expect, test } from "bun:test";
import type { Candle } from "./skip-backfill";
import { returnOver, summarizePairs } from "./brief-freshness";

const T0 = 1_800_000_000 - (1_800_000_000 % 60);
const candle = (min: number, close: number): Candle => [T0 + min * 60, close, close, close, close, 1];
const ms = (min: number): number => (T0 + min * 60) * 1000;

describe("the brief freshness report compares the return the Jev saw with the market return at the look time", () => {
  test("the return over a window is the close before the look minute over the close that many minutes earlier", () => {
    const asc = [candle(0, 100), candle(4, 100), candle(5, 105), candle(9, 110)];
    expect(returnOver(asc, ms(10), 5)?.toFixed(2)).toBe("10.00");
  });

  test("a window with no price within ten minutes of its start is null instead of a guess", () => {
    expect(returnOver([candle(30, 100)], ms(40), 15)).toBeNull();
  });

  test("the summary reports the median difference in points and the share where the sign differs", () => {
    const s = summarizePairs([
      { window: "r5", briefPct: 1, marketPct: 1.5 },
      { window: "r5", briefPct: -2, marketPct: 3 },
      { window: "r5", briefPct: 0.5, marketPct: 0.5 },
    ]) as Record<string, { n: number; medianAbsDiffPoints: number; shareSignDiffers: number }>;
    expect([s["r5"]!.n, s["r5"]!.medianAbsDiffPoints, s["r5"]!.shareSignDiffers]).toEqual([3, 0.5, 0.333]);
  });
});
