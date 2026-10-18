/**
 * E1 of ADENDO-E: the short-horizon regime of a market, from its CLOSED one-minute bars. Four numbers a model can read at a glance: the move of the last minute and of the last five, the balance of aggressor volume over
 * five minutes, and the realized volatility over fifteen. Pure: no clock, no network; the time arrives as a parameter.
 *
 * A measure that needs a minute that is not there is null, never bridged or filled; a series whose last bar closed too long ago says nothing at all (null), because a stale calm would read as a calm market. Bars that are not
 * valid (a time off the minute grid, a price that is not positive and finite, a negative volume) or have not closed yet at `nowMs` are dropped, and a repeated minute keeps the last one given.
 */

export const MINUTE = 60_000;
/** How long after the last bar closed the series is still taken as current: two and a half minutes. */
export const STALE_AFTER_MS = 150_000;

export interface MinuteBar {
  /** Start of the minute in epoch milliseconds, on the minute grid. */
  readonly start: number;
  readonly close: number;
  /** Aggressor volume bought and sold in that minute, in the units of the instrument. */
  readonly buyVolume: number;
  readonly sellVolume: number;
}

export interface Regime {
  /** Percent move from the previous minute's close; null when that minute is missing. */
  readonly ret1m: number | null;
  /** Percent move from the close five minutes before the last bar; null when that bar is missing. */
  readonly ret5m: number | null;
  /** (buy - sell) / (buy + sell) over the last five consecutive minutes, from -1 to 1; null with a hole or no volume. */
  readonly flow5m: number | null;
  /** Sample standard deviation of the one-minute log returns of the last fifteen minutes, in percent per minute; null with fewer than ten returns. */
  readonly rv15m: number | null;
}

const MIN_RETURNS = 10;
const RV_WINDOW = 14;
const FLOW_WINDOW = 5;
const round = (value: number, places: number): number => {
  const factor = 10 ** places;
  const out = Math.round(value * factor) / factor;
  return Object.is(out, -0) ? 0 : out;
};

const valid = (b: MinuteBar): boolean =>
  b !== null && typeof b === "object" && Number.isSafeInteger(b.start) && b.start >= 0 && b.start % MINUTE === 0 && Number.isFinite(b.close) && b.close > 0 && Number.isFinite(b.buyVolume) && b.buyVolume >= 0 && Number.isFinite(b.sellVolume) && b.sellVolume >= 0;

/** The regime now, or null when there is nothing current to say. */
export function regimeOf(bars: readonly MinuteBar[], nowMs: number): Regime | null {
  if (!Number.isFinite(nowMs)) return null;
  const byStart = new Map<number, MinuteBar>();
  // only minutes that have CLOSED at `nowMs` count: a bar whose end is still ahead is not yet a fact about the past
  for (const bar of bars) if (valid(bar) && bar.start + MINUTE <= nowMs) byStart.set(bar.start, bar);
  if (byStart.size === 0) return null;
  const lastStart = Math.max(...byStart.keys());
  if (nowMs - (lastStart + MINUTE) > STALE_AFTER_MS) return null;
  const last = byStart.get(lastStart)!;
  const at = (back: number): MinuteBar | undefined => byStart.get(lastStart - back * MINUTE);

  const prev = at(1);
  const ref = at(5);
  const ret1m = prev === undefined ? null : round((last.close / prev.close - 1) * 100, 2);
  const ret5m = ref === undefined ? null : round((last.close / ref.close - 1) * 100, 2);

  let buy = 0;
  let sell = 0;
  let whole = true;
  for (let k = 0; k < FLOW_WINDOW; k++) {
    const b = at(k);
    if (b === undefined) {
      whole = false;
      break;
    }
    buy += b.buyVolume;
    sell += b.sellVolume;
  }
  const flow5m = whole && buy + sell > 0 ? round((buy - sell) / (buy + sell), 2) : null;

  const returns: number[] = [];
  for (let k = 0; k < RV_WINDOW; k++) {
    const now = at(k);
    const before = at(k + 1);
    if (now !== undefined && before !== undefined) returns.push(Math.log(now.close / before.close));
  }
  let rv15m: number | null = null;
  if (returns.length >= MIN_RETURNS) {
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    rv15m = round(Math.sqrt(variance) * 100, 3);
  }
  return { ret1m, ret5m, flow5m, rv15m };
}
