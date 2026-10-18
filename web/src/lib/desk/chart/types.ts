/**
 * Series model of the desk chart. A ChartBar is one drawable slot on the x axis: for time based
 * chart types it is a candle, for Renko (phase F2) it is a brick built from many candles. The x
 * position is the bar INDEX inside the series, never the timestamp, so a brick series and a time
 * series share the same geometry. `sourceIndex` points back at the row of the raw candle series
 * the bar came from: time candles map 1:1, and the F2 Renko transform will record which source
 * candle completed each brick so decision markers can be reanchored with one pure function.
 */
export interface ChartBar {
  readonly tsMs: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volBase: number;
  /** false while the bar is still forming. */
  readonly confirmed: boolean;
  /** Index of the source candle this bar was built from (the completing candle for Renko bricks). */
  readonly sourceIndex: number;
}

/** Chart types: time candles, Heikin Ashi, OHLC bars, close line, close area and Renko bricks. */
export type ChartKind = "candles" | "heikin" | "ohlc" | "line" | "area" | "renko";

/** Time candles map one to one onto ChartBar rows. */
export function toChartBars(candles: readonly { tsMs: number; open: number; high: number; low: number; close: number; volBase: number; confirmed: boolean }[]): ChartBar[] {
  return candles.map((c, i) => ({ ...c, sourceIndex: i }));
}
