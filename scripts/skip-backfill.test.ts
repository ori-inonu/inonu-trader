import { describe, expect, test } from "bun:test";
import { bucketOf, closeAtOrBefore, ratioVerdict, returnsFor, stats, type Candle } from "./skip-backfill";

/** A candle starting at `min` minutes after an anchor minute, with the given open and close. */
const T0 = 1_800_000_000 - (1_800_000_000 % 60);
const candle = (min: number, open: number, close: number): Candle => [T0 + min * 60, open, Math.max(open, close), Math.min(open, close), close, 1];
const ms = (min: number, sec = 0): number => (T0 + min * 60 + sec) * 1000;

describe("the backfilled return uses the public price path and never invents a price", () => {
  test("the base is the open of the minute of the skip and the exit is the close at the window, both read from the candles", () => {
    const candles = [candle(0, 1, 1.1), candle(15, 1.18, 1.2), candle(60, 1.4, 1.5)];
    const r = returnsFor(candles, ms(0, 20), ms(500));
    expect([r["15m"], r["1h"]]).toEqual([1.2 / 1 - 1, 1.5 / 1 - 1]);
  });

  test("a window whose minute has not closed yet is null instead of a guess", () => {
    const r = returnsFor([candle(0, 1, 1.1), candle(15, 1.18, 1.2)], ms(0), ms(10));
    expect(r["15m"]).toBeNull();
  });

  test("a window with no price within ten minutes of its time is null even when the window has closed", () => {
    const r = returnsFor([candle(0, 1, 1.1), candle(15, 1.18, 1.2)], ms(0), ms(500));
    expect([r["15m"], r["1h"]]).toEqual([1.2 / 1 - 1, null]);
  });

  test("a minute with no trade falls back to the last close, but only within ten minutes", () => {
    const asc = [candle(0, 1, 2)];
    expect([closeAtOrBefore(asc, T0 + 9 * 60), closeAtOrBefore(asc, T0 + 11 * 60)]).toEqual([2, null]);
  });

  test("a token whose history price is off from the price the agent recorded is flagged, one inside the band is trusted, and no entry price leaves it unchecked", () => {
    expect([ratioVerdict([1.02, 0.98, 1.1]).status, ratioVerdict([33, 32, 34]).status, ratioVerdict([]).status]).toEqual(["ok", "off", "unchecked"]);
  });

  test("one or two comparisons off the band are only weak evidence, because a volatile token moves between the agent price and the candle", () => {
    expect([ratioVerdict([0.7]).status, ratioVerdict([0.7, 0.72]).status]).toEqual(["weak", "weak"]);
  });

  test("the preference buckets and the stats match the skip outcome report", () => {
    expect([bucketOf(0.05), bucketOf(0.15), bucketOf(0.2), stats([0.1, -0.1, 0.3], 2)["medianPct"]]).toEqual(["preferencia ate 0,10", "preferencia de 0,10 a 0,20", "preferencia 0,20 ou mais", 10]);
  });
});
