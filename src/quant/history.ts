/**
 * Pure bookkeeping for a rolling candle history: merge windows read at different times into one ascending
 * series, never downgrading a confirmed bar, and find where the newest consecutive run starts. The reader that
 * actually fetches pages lives outside src/quant (src/system-one/quant-history.ts) so this module stays pure.
 */

import { isFiniteNumber, QuantError, requirePositive, type Candle } from "./types";

export interface MergeResult {
  readonly candles: Candle[];
  /** Incoming or stored rows whose start time is not a finite number; they cannot be placed in time. */
  readonly droppedNonFinite: number;
  /**
   * Confirmed bars that an incoming confirmed bar replaced with different values. An exchange does not normally
   * restate a closed bar, so a non zero count is surfaced instead of being repaired in silence.
   */
  readonly restated: number;
}

/**
 * Union of two windows keyed by start time. The incoming bar wins, except that a confirmed bar is never replaced
 * by an unconfirmed copy. Returns the newest `maxBars` in ascending order. Any input order is accepted.
 */
export function mergeCandles(existing: readonly Candle[], incoming: readonly Candle[], maxBars: number): MergeResult {
  if (!Number.isInteger(maxBars) || maxBars < 1) throw new QuantError("option_invalid");
  const byStart = new Map<number, Candle>();
  let droppedNonFinite = 0;
  let restated = 0;
  const sameValues = (a: Candle, b: Candle): boolean => a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;
  const place = (candle: Candle, countRestatement: boolean): void => {
    if (!isFiniteNumber(candle.startMs)) { droppedNonFinite += 1; return; }
    const stored = byStart.get(candle.startMs);
    if (stored !== undefined && stored.confirmed && !candle.confirmed) return;
    if (countRestatement && stored !== undefined && stored.confirmed && candle.confirmed && !sameValues(stored, candle)) restated += 1;
    byStart.set(candle.startMs, candle);
  };
  for (const candle of existing) place(candle, false);
  for (const candle of incoming) place(candle, true);
  const sorted = [...byStart.values()].sort((a, b) => a.startMs - b.startMs);
  return { candles: sorted.length > maxBars ? sorted.slice(sorted.length - maxBars) : sorted, droppedNonFinite, restated };
}

/** Start time of the newest run of bars spaced exactly `barMs` apart, or null for an empty series. Input ascending. */
export function contiguousSuffixStart(candles: readonly Candle[], barMs: number): number | null {
  requirePositive(barMs, "bar_invalid");
  if (candles.length === 0) return null;
  let start = (candles[candles.length - 1] as Candle).startMs;
  for (let i = candles.length - 2; i >= 0; i -= 1) {
    const here = (candles[i] as Candle).startMs;
    if (start - here !== barMs) break;
    start = here;
  }
  return start;
}
