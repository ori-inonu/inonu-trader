import type { DeskTrade } from "../types";

/** Height of one tape row and of the column header, in CSS px. The panel CSS uses the same numbers. */
export const TAPE_ROW_H = 17;
export const TAPE_HEADER_H = 18;

/** A print counts as large above this multiple of the median size of the visible window. */
export const LARGE_PRINT_MULTIPLE = 3;
/** Below this many prints the median is not a meaningful reference, so nothing is flagged. */
export const LARGE_PRINT_MIN_SAMPLE = 5;

export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** For each size, whether it is a large print relative to the median of the whole window. */
export function flagLargePrints(
  sizes: readonly number[],
  multiple = LARGE_PRINT_MULTIPLE,
  minSample = LARGE_PRINT_MIN_SAMPLE,
): boolean[] {
  if (sizes.length < minSample) return sizes.map(() => false);
  const reference = median(sizes);
  if (reference === null || reference <= 0) return sizes.map(() => false);
  const threshold = reference * multiple;
  return sizes.map((s) => s > threshold);
}

/** How many rows fit under the column header. At least 1, at most `max`. */
export function tapeRowCount(bodyHeight: number, max = 200): number {
  const room = bodyHeight - TAPE_HEADER_H;
  if (!Number.isFinite(room) || room <= 0) return 1;
  return Math.max(1, Math.min(max, Math.floor(room / TAPE_ROW_H)));
}

export interface TapeRow {
  readonly trade: DeskTrade;
  readonly large: boolean;
}

/** The newest `count` prints, with duplicate ids dropped (a reconnect can replay a trade), flagged for size. */
export function buildTape(trades: readonly DeskTrade[], count: number): TapeRow[] {
  const seen = new Set<string>();
  const window: DeskTrade[] = [];
  for (const trade of trades) {
    if (window.length >= count) break;
    if (seen.has(trade.id)) continue;
    seen.add(trade.id);
    window.push(trade);
  }
  const flags = flagLargePrints(window.map((t) => t.sz));
  return window.map((trade, i) => ({ trade, large: flags[i] }));
}
