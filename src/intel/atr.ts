/**
 * The ATR the zones are measured in (Wilder, 14 periods) over CLOSED candles of one interval. The first value is the plain
 * mean of the first `period` true ranges; each later bar smooths in as (previous * (period - 1) + TR) / period. Needs
 * `period + 1` bars, because the first bar has no previous close to gap from. Pure.
 */
export interface OhlcBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export function trueRange(bar: OhlcBar, previousClose: number | null): number {
  const range = bar.high - bar.low;
  if (previousClose === null) return range;
  return Math.max(range, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
}

export function atrWilder(bars: readonly OhlcBar[], period = 14): number | null {
  if (!Number.isSafeInteger(period) || period < 1) throw new RangeError("period must be a positive whole number");
  if (bars.length < period + 1) return null;
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const prev = bars[i - 1]!;
    if (![bar.high, bar.low, prev.close].every(Number.isFinite) || bar.high < bar.low) return null;
    ranges.push(trueRange(bar, prev.close));
  }
  let atr = ranges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  for (let i = period; i < ranges.length; i += 1) atr = (atr * (period - 1) + ranges[i]!) / period;
  return atr;
}
