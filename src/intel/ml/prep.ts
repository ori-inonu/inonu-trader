/**
 * The preparation of the columns for a learner (INT-3.1): which columns are kept, how a missing value is filled, and how each is
 * scaled. Fitted ONLY on the training rows and then applied to any row, so nothing of the test leaks into the scale of the columns.
 * Plain data (it survives JSON) and pure.
 *
 *  - a column that is missing in more than 95 percent of the training rows, or that never changes, is dropped;
 *  - a missing value is replaced by the training median and, when the column was missing in 2 to 95 percent of the rows, a
 *    column "was missing" (0 or 1) is added, because that a number is unknown can itself say something;
 *  - the columns are scaled to a mean of 0 and a standard deviation of 1 of the training rows (for the linear model); the trees
 *    read the raw kept columns, with the missing values left as they are.
 */
export interface Prep {
  /** The columns kept, by index into the full list, in order. */
  readonly kept: readonly number[];
  readonly names: readonly string[];
  readonly median: readonly number[];
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  /** Of the kept columns, the positions that also get a "was missing" column. */
  readonly indicator: readonly number[];
}

export const MAX_MISSING_SHARE = 0.95;
const MIN_INDICATOR_SHARE = 0.02;

export function fitPrep(rows: readonly ArrayLike<number>[], names: readonly string[]): Prep {
  const n = rows.length;
  if (n === 0) throw new RangeError("no rows to fit on");
  const kept: number[] = [];
  const median: number[] = [];
  const mean: number[] = [];
  const sd: number[] = [];
  const indicator: number[] = [];
  for (let j = 0; j < names.length; j += 1) {
    const values: number[] = [];
    for (const row of rows) if (Number.isFinite(row[j]!)) values.push(row[j]!);
    const missingShare = 1 - values.length / n;
    if (missingShare > MAX_MISSING_SHARE || values.length < 2) continue;
    const m = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length;
    if (!(variance > 1e-18)) continue;
    const sorted = [...values].sort((a, b) => a - b);
    kept.push(j);
    median.push(sorted[Math.floor(sorted.length / 2)]!);
    mean.push(m);
    sd.push(Math.sqrt(variance));
    if (missingShare >= MIN_INDICATOR_SHARE) indicator.push(kept.length - 1);
  }
  return { kept, names: kept.map((j) => names[j]!), median, mean, sd, indicator };
}

/** Width of a row after `standardize`. */
export const widthOf = (prep: Prep): number => prep.kept.length + prep.indicator.length;

/** Names of the columns after `standardize`, in order. */
export const standardizedNames = (prep: Prep): string[] => [...prep.names, ...prep.indicator.map((k) => `${prep.names[k]}?`)];

/** The row for the linear model: filled, scaled, with the "was missing" columns after the kept ones. */
export function standardize(prep: Prep, row: ArrayLike<number>, out: Float64Array = new Float64Array(widthOf(prep))): Float64Array {
  const k = prep.kept.length;
  for (let c = 0; c < k; c += 1) {
    const v = row[prep.kept[c]!]!;
    out[c] = ((Number.isFinite(v) ? v : prep.median[c]!) - prep.mean[c]!) / prep.sd[c]!;
  }
  prep.indicator.forEach((c, i) => {
    out[k + i] = Number.isFinite(row[prep.kept[c]!]!) ? 0 : 1;
  });
  return out;
}

/** The row for the trees: only the kept columns, with a missing value left as NaN. */
export function selectKept(prep: Prep, row: ArrayLike<number>, out: Float64Array = new Float64Array(prep.kept.length)): Float64Array {
  for (let c = 0; c < prep.kept.length; c += 1) {
    const v = row[prep.kept[c]!]!;
    out[c] = Number.isFinite(v) ? v : Number.NaN;
  }
  return out;
}
