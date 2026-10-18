/**
 * Candle audit: tells what is wrong with a candle series and keeps the most recent contiguous, confirmed,
 * structurally valid stretch. It never repairs, interpolates or imputes a bar: a defect either marks a bar
 * (outliers stay in the series, flagged) or removes it and breaks continuity (everything structural).
 *
 * Pure: no I/O, no clock (the caller passes `nowMs`), no randomness.
 */

import { mad, median } from "./stats";
import { isFiniteNumber, QuantError, requirePositive, type Candle } from "./types";

export type CandleIssueKind =
  | "non_finite"
  | "non_positive"
  | "ohlc_incoherent"
  | "negative_volume"
  | "unconfirmed"
  | "future_candle"
  | "duplicate_start"
  | "duplicate_conflict"
  | "out_of_order"
  | "off_grid"
  | "gap"
  | "stale_tail"
  | "return_outlier"
  | "range_outlier"
  | "flat_run";

const ALL_KINDS: readonly CandleIssueKind[] = [
  "non_finite", "non_positive", "ohlc_incoherent", "negative_volume", "unconfirmed", "future_candle",
  "duplicate_start", "duplicate_conflict", "out_of_order", "off_grid", "gap", "stale_tail",
  "return_outlier", "range_outlier", "flat_run",
];

export interface CandleIssue {
  readonly kind: CandleIssueKind;
  /** Index in the input array, or null when the issue is about the series as a whole. */
  readonly index: number | null;
  readonly startMs: number | null;
  /** Missing bars for a gap, run length for flat_run, null otherwise. */
  readonly detail: number | null;
}

export type CandleGrade = "A" | "B" | "C" | "F";

export interface CandleAudit {
  readonly barMs: number;
  readonly inputCount: number;
  /** Ascending, consecutive, confirmed and valid bars ending at the most recent valid bar. */
  readonly usable: readonly Candle[];
  /** Input index of each usable bar. */
  readonly origin: readonly number[];
  readonly issues: readonly CandleIssue[];
  readonly counts: Readonly<Record<CandleIssueKind, number>>;
  /** True when the latest usable bar ended no more than `maxTailAgeBars` bars before now. */
  readonly fresh: boolean;
  /** Usable bars over the bars the source claimed to give (distinct, confirmed, already ended). */
  readonly coverage: number;
  /**
   * A: nothing wrong. B: only marks (outliers, flat runs, duplicates collapsed, unsorted input).
   * C: bars were lost or continuity broke. F: stale, or fewer than `minCandles` usable bars.
   */
  readonly grade: CandleGrade;
}

export interface AuditOptions {
  /** Robust z (median and MAD of log returns) above which a return is an outlier. Default 8. */
  readonly outlierZ?: number;
  /** Bar range over the median range above which a bar is a range outlier. Default 10. */
  readonly rangeFactor?: number;
  /** Consecutive zero range bars that make a flat run. Default 3. */
  readonly flatRunMin?: number;
  /** Bars of age past the end of the latest bar that still count as fresh. Default 1. */
  readonly maxTailAgeBars?: number;
  /** Usable bars below which the grade is F. Default 21, which gives the 20 returns a volatility needs. */
  readonly minCandles?: number;
}

const DEFAULTS = { outlierZ: 8, rangeFactor: 10, flatRunMin: 3, maxTailAgeBars: 1, minCandles: 21 } as const;
const MAD_TO_SIGMA = 0.6744897501960817;

function resolveOptions(options: AuditOptions | undefined): Required<AuditOptions> {
  const merged = { ...DEFAULTS, ...(options ?? {}) } as Required<AuditOptions>;
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) requirePositive(merged[key], "option_invalid");
  return merged;
}

function sameBar(a: Candle, b: Candle): boolean {
  return a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;
}

/** Structural verdict for one bar, or null when it is sound. */
export function candleDefect(candle: Candle): CandleIssueKind | null {
  const prices = [candle.open, candle.high, candle.low, candle.close];
  if (!isFiniteNumber(candle.startMs) || prices.some((price) => !isFiniteNumber(price))) return "non_finite";
  if (candle.volume !== null && !isFiniteNumber(candle.volume)) return "non_finite";
  if (prices.some((price) => !(price > 0))) return "non_positive";
  if (candle.high < Math.max(candle.open, candle.close, candle.low) || candle.low > Math.min(candle.open, candle.close, candle.high)) return "ohlc_incoherent";
  if (candle.volume !== null && candle.volume < 0) return "negative_volume";
  return null;
}

export function auditCandles(candles: readonly Candle[], barMs: number, nowMs: number, options?: AuditOptions): CandleAudit {
  requirePositive(barMs, "bar_invalid");
  if (!isFiniteNumber(nowMs)) throw new QuantError("now_invalid");
  const opts = resolveOptions(options);
  const issues: CandleIssue[] = [];
  const note = (kind: CandleIssueKind, index: number | null, startMs: number | null, detail: number | null = null): void => {
    issues.push({ kind, index, startMs, detail });
  };

  // 1. Order of the input as given. Strictly newest first is the exchange's own order and is not a defect;
  //    only an input that goes both up and down is reported.
  let sawUp = false;
  let sawDown = false;
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1]!.startMs;
    const next = candles[i]!.startMs;
    if (!isFiniteNumber(prev) || !isFiniteNumber(next) || next === prev) continue;
    if (next > prev) sawUp = true;
    else sawDown = true;
    if (sawUp && sawDown) {
      note("out_of_order", i, next);
      break;
    }
  }

  // 2. Structural validity, unconfirmed and not yet ended bars.
  interface Entry { candle: Candle; index: number }
  const confirmed: Entry[] = [];
  let claimed = 0;
  candles.forEach((candle, index) => {
    const defect = candleDefect(candle);
    if (defect !== null) {
      note(defect, index, isFiniteNumber(candle.startMs) ? candle.startMs : null);
      claimed += 1;
      return;
    }
    if (!candle.confirmed) {
      note("unconfirmed", index, candle.startMs);
      return;
    }
    if (candle.startMs + barMs > nowMs) {
      note("future_candle", index, candle.startMs);
      return;
    }
    confirmed.push({ candle, index });
  });

  // 3. Duplicates. Identical copies collapse, conflicting copies drop the start altogether.
  confirmed.sort((a, b) => a.candle.startMs - b.candle.startMs || a.index - b.index);
  const unique: Entry[] = [];
  for (let i = 0; i < confirmed.length; ) {
    let j = i + 1;
    while (j < confirmed.length && confirmed[j]!.candle.startMs === confirmed[i]!.candle.startMs) j += 1;
    const group = confirmed.slice(i, j);
    if (group.length === 1) {
      unique.push(group[0]!);
    } else if (group.every((entry) => sameBar(entry.candle, group[0]!.candle))) {
      note("duplicate_start", group[1]!.index, group[1]!.candle.startMs);
      unique.push(group[0]!);
    } else {
      note("duplicate_conflict", group[1]!.index, group[1]!.candle.startMs);
    }
    claimed += 1;
    i = j;
  }

  // 4. Continuity: the usable series starts after the last break.
  let start = 0;
  for (let i = 1; i < unique.length; i += 1) {
    const diff = unique[i]!.candle.startMs - unique[i - 1]!.candle.startMs;
    if (diff === barMs) continue;
    if (diff % barMs !== 0) note("off_grid", unique[i]!.index, unique[i]!.candle.startMs);
    else note("gap", unique[i]!.index, unique[i]!.candle.startMs, diff / barMs - 1);
    start = i;
  }
  const usableEntries = unique.slice(start);
  const usable = usableEntries.map((entry) => entry.candle);
  const origin = usableEntries.map((entry) => entry.index);

  // 5. Freshness of the latest usable bar.
  const last = usable[usable.length - 1];
  const fresh = last !== undefined && nowMs - (last.startMs + barMs) <= opts.maxTailAgeBars * barMs;
  if (last !== undefined && !fresh) note("stale_tail", origin[origin.length - 1]!, last.startMs);

  // 6. Marks that keep the bars: return outliers, range outliers, flat runs.
  const returns: number[] = [];
  for (let i = 1; i < usable.length; i += 1) returns.push(Math.log(usable[i]!.close / usable[i - 1]!.close));
  const returnMedian = median(returns);
  const returnMad = mad(returns);
  if (returnMedian !== null && returnMad !== null && returnMad > 0) {
    returns.forEach((value, k) => {
      if (Math.abs((MAD_TO_SIGMA * (value - returnMedian)) / returnMad) > opts.outlierZ) note("return_outlier", origin[k + 1]!, usable[k + 1]!.startMs);
    });
  }
  const ranges = usable.map((candle) => (candle.high - candle.low) / candle.close);
  const rangeMedian = median(ranges);
  if (rangeMedian !== null && rangeMedian > 0) {
    ranges.forEach((value, k) => {
      if (value > opts.rangeFactor * rangeMedian) note("range_outlier", origin[k]!, usable[k]!.startMs);
    });
  }
  for (let i = 0; i < usable.length; ) {
    if (usable[i]!.high !== usable[i]!.low) { i += 1; continue; }
    let j = i;
    while (j < usable.length && usable[j]!.high === usable[j]!.low) j += 1;
    if (j - i >= opts.flatRunMin) note("flat_run", origin[i]!, usable[i]!.startMs, j - i);
    i = j;
  }

  // 7. Summary.
  const counts = Object.fromEntries(ALL_KINDS.map((kind) => [kind, 0])) as Record<CandleIssueKind, number>;
  for (const issue of issues) counts[issue.kind] += 1;
  const coverage = claimed === 0 ? 0 : usable.length / claimed;
  const lossKinds: readonly CandleIssueKind[] = ["non_finite", "non_positive", "ohlc_incoherent", "negative_volume", "duplicate_conflict", "off_grid", "gap"];
  const lost = coverage < 1 || lossKinds.some((kind) => counts[kind] > 0);
  const marked = counts.return_outlier + counts.range_outlier + counts.flat_run + counts.duplicate_start + counts.out_of_order > 0;
  const grade: CandleGrade = !fresh || usable.length < opts.minCandles ? "F" : lost ? "C" : marked ? "B" : "A";

  return { barMs, inputCount: candles.length, usable, origin, issues, counts, fresh, coverage, grade };
}
