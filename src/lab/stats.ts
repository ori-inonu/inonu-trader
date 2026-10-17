/**
 * Statistics of the Jev Decision Lab. Specification: docs/JEV-LABORATORIO-DE-DECISAO.md sections 6 to 8.
 *
 * Inference of a mean uses NEWEY-WEST (Bartlett kernel) because decisions taken more often than their horizon share
 * the same stretch of price and are autocorrelated by construction. The lag is max(3K, floor(4 (n/100)^(2/9))) with
 * K = ceil(horizon / step), the variance is inflated by n/(n - lag) and p-values and intervals use Student t with
 * floor(n/(lag+1)) - 1 degrees of freedom. The null rejection rate was measured at 5% to 6% for a 5% test (tests LB19).
 * The MOVING BLOCK BOOTSTRAP (fixed seed) is used only to simulate paths of equity, never for the verdict: its
 * interval under-covers with overlap. Multiple policies and modalities are corrected with HOLM; the comparison with
 * baselines is an intersection-union test (all must be significant) and needs no further correction.
 *
 * Everything here is pure arithmetic: no clock, no randomness beyond the seeded generator, no I/O. The promotion gate
 * can only RECOMMEND the phase it is already in (fase-0); it grants nothing.
 */

import { deriveLimits, kellyLowerBound, medianWealthNoEdge, touchLiquidationProbability } from "../policy/envelope.ts";
import type { PolicyDescriptor } from "./policies.ts";
import { Rng } from "./rng.ts";
import {
 DAY_MS,
 LAB_MODALITIES,
 LEVERAGES,
 YEAR_DAYS,
 roundTo,
 type CalibrationReport,
 type Criterion,
 type CriterionStatus,
 type DecisionStatus,
 type EpochResult,
 type GateInput,
 type GateResult,
 type LabModality,
 type Leverage,
 type LeverageReportRow,
 type MeanTestReport,
 type MultipleTesting,
 type MultipleTestingEntry,
 type PairedReport,
 type PolicyReport,
 type ReliabilityBin,
} from "./types.ts";

/** Every number the statistics and the gate fix once. */
export const STATS_DEFAULTS = Object.freeze({
 alpha: 0.05,
 tThreshold: 2,
 minDays: 90,
 minEffectiveSamples: 30,
 minCompleteness: 0.95,
 minTradesForModality: 30,
 minInferenceSamples: 8,
 bootstrapResamples: 2000,
 bootstrapSeed: 20_261_011,
 ruinFraction: 0.5,
 reliabilityBins: 10,
 maxDecisionMs: 1500,
});

// ---------------------------------------------------------------------------
// Basic moments
// ---------------------------------------------------------------------------

export function mean(xs: readonly number[]): number {
 if (xs.length === 0) return 0;
 let sum = 0;
 for (const x of xs) sum += x;
 return sum / xs.length;
}

function sampleSd(xs: readonly number[]): number {
 if (xs.length < 2) return 0;
 const m = mean(xs);
 let sum = 0;
 for (const x of xs) sum += (x - m) * (x - m);
 return Math.sqrt(sum / (xs.length - 1));
}

/** Nearest-rank percentile of a copy of the values. */
export function percentile(values: readonly number[], q: number): number {
 if (values.length === 0) throw new RangeError("percentile of an empty list");
 const sorted = [...values].sort((a, b) => a - b);
 const rank = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length)));
 return sorted[rank - 1] as number;
}

// ---------------------------------------------------------------------------
// Student t distribution
// ---------------------------------------------------------------------------

function logGamma(x: number): number {
 const coefficients = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
 if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
 const shifted = x - 1;
 let sum = coefficients[0] as number;
 const t = shifted + 7.5;
 for (let i = 1; i < 9; i += 1) sum += (coefficients[i] as number) / (shifted + i);
 return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Continued fraction of the incomplete beta function (modified Lentz). */
function betaFraction(a: number, b: number, x: number): number {
 const tiny = 1e-300;
 const qab = a + b;
 const qap = a + 1;
 const qam = a - 1;
 let c = 1;
 let d = 1 - (qab * x) / qap;
 if (Math.abs(d) < tiny) d = tiny;
 d = 1 / d;
 let h = d;
 for (let m = 1; m <= 100_000; m += 1) {
  const m2 = 2 * m;
  let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
  d = 1 + aa * d;
  if (Math.abs(d) < tiny) d = tiny;
  c = 1 + aa / c;
  if (Math.abs(c) < tiny) c = tiny;
  d = 1 / d;
  h *= d * c;
  aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
  d = 1 + aa * d;
  if (Math.abs(d) < tiny) d = tiny;
  c = 1 + aa / c;
  if (Math.abs(c) < tiny) c = tiny;
  d = 1 / d;
  const delta = d * c;
  h *= delta;
  if (Math.abs(delta - 1) < 3e-16) break;
 }
 return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
 if (x <= 0) return 0;
 if (x >= 1) return 1;
 const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
 return x < (a + 1) / (a + b + 2) ? (front * betaFraction(a, b, x)) / a : 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

export function studentTCdf(t: number, df: number): number {
 if (typeof df !== "number" || !Number.isFinite(df) || df <= 0) throw new RangeError("df must be a positive number");
 if (typeof t !== "number" || Number.isNaN(t)) throw new RangeError("t must be a number");
 if (t === Infinity) return 1;
 if (t === -Infinity) return 0;
 const tail = 0.5 * regularizedBeta(df / (df + t * t), df / 2, 0.5);
 return t > 0 ? 1 - tail : tail;
}

/** Quantile by bisection on the cdf. */
export function studentTQuantile(p: number, df: number): number {
 if (typeof p !== "number" || !(p > 0 && p < 1)) throw new RangeError("p must be strictly between 0 and 1");
 if (p === 0.5) return 0;
 if (p < 0.5) return -studentTQuantile(1 - p, df);
 let low = 0;
 let high = 8;
 while (studentTCdf(high, df) < p && high < 1e12) high *= 2;
 for (let i = 0; i < 80; i += 1) {
  const mid = (low + high) / 2;
  if (studentTCdf(mid, df) < p) low = mid;
  else high = mid;
 }
 return (low + high) / 2;
}

const CRITICAL_975 = new Map<number, number>();

/** The 97.5% quantile, memoized by degrees of freedom: the same few values are asked for thousands of intervals. */
function criticalValue975(df: number): number {
 const cached = CRITICAL_975.get(df);
 if (cached !== undefined) return cached;
 const value = studentTQuantile(0.975, df);
 CRITICAL_975.set(df, value);
 return value;
}

// ---------------------------------------------------------------------------
// Newey-West
// ---------------------------------------------------------------------------

/** max(3K, floor(4 (n/100)^(2/9))), capped at n - 2. K is the overlap of the horizons. */
export function defaultLag(n: number, overlap: number): number {
 if (!Number.isInteger(overlap) || overlap < 1) throw new RangeError("overlap must be a positive integer");
 const plugIn = Math.floor(4 * (Math.max(n, 1) / 100) ** (2 / 9));
 return Math.max(0, Math.min(n - 2, Math.max(3 * overlap, plugIn)));
}

/**
 * Long-run variance of the mean with Bartlett weights: gamma_0 + 2 sum_j (1 - j/(lag+1)) gamma_j, times n/(n - lag)
 * unless the small sample inflation is switched off.
 */
export function neweyWestLrv(xs: readonly number[], lag: number, smallSampleInflation = true): number {
 const n = xs.length;
 if (!Number.isInteger(lag) || lag < 0 || lag >= n) throw new RangeError("lag must be an integer from 0 to n - 1");
 const m = mean(xs);
 const centered = xs.map((x) => x - m);
 let total = 0;
 for (let j = 0; j <= lag; j += 1) {
  let gamma = 0;
  for (let i = j; i < n; i += 1) gamma += (centered[i] as number) * (centered[i - j] as number);
  gamma /= n;
  total += j === 0 ? gamma : 2 * (1 - j / (lag + 1)) * gamma;
 }
 return smallSampleInflation ? (total * n) / (n - lag) : total;
}

export interface MeanTest {
 n: number;
 mean: number;
 sd: number;
 lag: number | null;
 effectiveSamples: number | null;
 lrv: number | null;
 se: number | null;
 t: number | null;
 df: number | null;
 pOneSided: number | null;
 ci95: [number, number] | null;
}

function meanTestCore(xs: readonly number[], overlap: number, lrvAtLag: (lag: number, center: number) => number): MeanTest {
 for (const x of xs) if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError("every value must be a finite number");
 if (!Number.isInteger(overlap) || overlap < 1) throw new RangeError("overlap must be a positive integer");
 const n = xs.length;
 const m = mean(xs);
 const sd = sampleSd(xs);
 const none: MeanTest = { n, mean: m, sd, lag: null, effectiveSamples: null, lrv: null, se: null, t: null, df: null, pOneSided: null, ci95: null };
 if (n < STATS_DEFAULTS.minInferenceSamples) return none;
 const lag = defaultLag(n, overlap);
 const lrv = lrvAtLag(lag, m);
 const effectiveSamples = Math.floor(n / (lag + 1));
 if (!(lrv > 1e-30)) return { ...none, lag, effectiveSamples };
 const se = Math.sqrt(lrv / n);
 const t = m / se;
 const df = Math.max(1, effectiveSamples - 1);
 const half = criticalValue975(df) * se;
 return { n, mean: m, sd, lag, effectiveSamples, lrv, se, t, df, pOneSided: 1 - studentTCdf(t, df), ci95: [m - half, m + half] };
}

/** One-sided test of "mean > 0" with dense Newey-West inference. */
export function meanTest(xs: readonly number[], overlap: number): MeanTest {
 return meanTestCore(xs, overlap, (lag) => neweyWestLrv(xs, lag));
}

function neweyWestLrvWithGaps(slots: readonly (number | null)[], n: number, center: number, lag: number): number {
 let total = 0;
 for (let j = 0; j <= lag; j += 1) {
  let gamma = 0;
  for (let i = j; i < slots.length; i += 1) {
   const current = slots[i];
   const previous = slots[i - j];
   if (current !== null && current !== undefined && previous !== null && previous !== undefined) gamma += (current - center) * (previous - center);
  }
  gamma /= n;
  total += j === 0 ? gamma : 2 * (1 - j / (lag + 1)) * gamma;
 }
 return (total * n) / (n - lag);
}

/**
 * Newey-West inference for epoch-aligned observations. Moments use only observed values, while each covariance
 * uses pairs separated by the requested distance in the original epoch sequence.
 */
function meanTestWithGaps(slots: readonly (number | null)[], overlap: number): MeanTest {
 const values = slots.filter((x): x is number => x !== null);
 return meanTestCore(values, overlap, (lag, center) => neweyWestLrvWithGaps(slots, values.length, center, lag));
}

const BPS = 1e4;

/** The test in basis points, rounded for the report. */
export function meanReport(test: MeanTest): MeanTestReport {
 return {
  n: test.n,
  meanBps: roundTo(test.mean * BPS, 6),
  sdBps: roundTo(test.sd * BPS, 6),
  lag: test.lag,
  effectiveSamples: test.effectiveSamples,
  seBps: test.se === null ? null : roundTo(test.se * BPS, 6),
  t: test.t === null ? null : roundTo(test.t, 9),
  df: test.df,
  pOneSided: test.pOneSided,
  ci95Bps: test.ci95 === null ? null : [roundTo(test.ci95[0] * BPS, 6), roundTo(test.ci95[1] * BPS, 6)],
 };
}

// ---------------------------------------------------------------------------
// Multiple testing
// ---------------------------------------------------------------------------

/** Holm-Bonferroni adjusted p-values in the original order: step-down, monotone, capped at one. */
export function holmAdjust(pValues: readonly number[]): number[] {
 for (const p of pValues) if (typeof p !== "number" || !(p >= 0 && p <= 1)) throw new RangeError("p-values must be numbers from 0 to 1");
 const m = pValues.length;
 const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p || a.index - b.index);
 const adjusted = new Array<number>(m);
 let running = 0;
 order.forEach((entry, rank) => {
  running = Math.max(running, Math.min(1, (m - rank) * entry.p));
  adjusted[entry.index] = running;
 });
 return adjusted;
}

// ---------------------------------------------------------------------------
// Equity curves and the block bootstrap
// ---------------------------------------------------------------------------

export interface EquityPath {
 final: number;
 minEquity: number;
 maxDrawdown: number;
 path: number[];
}

/**
 * Equity of K concurrent tranches. Each decision gets 1/K of the equity realized when it opens and applies its
 * multiple when it closes K steps later; at each step the closing tranche is settled first and then the new one opens.
 * K tranches at leverage L add up to a gross exposure of L, the constant leverage of the counterfactual.
 */
export function trancheEquity(multiples: readonly number[], holdSteps: number): EquityPath {
 if (!Number.isInteger(holdSteps) || holdSteps < 1) throw new RangeError("holdSteps must be a positive integer");
 for (const m of multiples) if (typeof m !== "number" || !Number.isFinite(m) || m < 0) throw new RangeError("equity multiples must be finite numbers at or above zero");
 const n = multiples.length;
 let equity = 1;
 const sizes = new Array<number>(n);
 const path: number[] = [];
 let minEquity = 1;
 let peak = 1;
 let maxDrawdown = 0;
 for (let j = 0; j < n + holdSteps; j += 1) {
  const closing = j - holdSteps;
  if (closing >= 0 && closing < n) equity += (sizes[closing] as number) * ((multiples[closing] as number) - 1);
  if (j < n) sizes[j] = equity / holdSteps;
  path.push(equity);
  if (equity < minEquity) minEquity = equity;
  if (equity > peak) peak = equity;
  if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
 }
 return { final: equity, minEquity, maxDrawdown, path };
}

/** Fills `target` (length n) with a moving block resample: ceil(n/b) blocks of consecutive indices, truncated to n. */
function fillMovingBlocks(target: Int32Array, blockLength: number, rng: Rng): void {
 const n = target.length;
 const blocks = Math.ceil(n / blockLength);
 let filled = 0;
 for (let block = 0; block < blocks; block += 1) {
  const start = rng.int(n - blockLength + 1);
  for (let k = 0; k < blockLength && filled < n; k += 1) target[filled++] = start + k;
 }
}

/** Indices of a moving block resample of length n: ceil(n/b) blocks of consecutive indices, truncated to n. */
export function movingBlockResample(n: number, blockLength: number, rng: Rng): number[] {
 if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
 if (!Number.isInteger(blockLength) || blockLength < 1 || blockLength > n) throw new RangeError("blockLength must be an integer from 1 to n");
 const target = new Int32Array(n);
 fillMovingBlocks(target, blockLength, rng);
 return Array.from(target);
}

/** Final and minimum equity of the tranche model over resampled indices, without building the whole path. */
function trancheFinalAndMin(multiples: ArrayLike<number>, order: Int32Array, holdSteps: number, sizes: Float64Array): { final: number; min: number } {
 const n = order.length;
 let equity = 1;
 let min = 1;
 for (let j = 0; j < n + holdSteps; j += 1) {
  const closing = j - holdSteps;
  if (closing >= 0 && closing < n) equity += (sizes[closing] as number) * ((multiples[order[closing] as number] as number) - 1);
  if (j < n) sizes[j] = equity / holdSteps;
  if (equity < min) min = equity;
 }
 return { final: equity, min };
}

export interface BootstrapSeries {
 leverage: Leverage;
 multiples: readonly number[];
 liquidated: readonly boolean[];
}

export interface BootstrapOptions {
 holdSteps: number;
 resamples: number;
 blockLength: number;
 seed: number;
 ruinFraction: number;
}

export interface BootstrapRow {
 leverage: Leverage;
 resamples: number;
 blockLength: number;
 ruinFraction: number;
 medianFinalEquity: number;
 p05FinalEquity: number;
 p95FinalEquity: number;
 probLiquidation: number;
 probRuin: number;
}

/**
 * Moving block bootstrap of the equity path for several leverages at once. The same resampled epochs are used for
 * every leverage, so the rows differ only by the multiples. The seed is fixed: same input, same output.
 */
export function bootstrapLeverage(series: readonly BootstrapSeries[], options: BootstrapOptions): BootstrapRow[] {
 if (series.length === 0) return [];
 const n = (series[0] as BootstrapSeries).multiples.length;
 for (const s of series) if (s.multiples.length !== n || s.liquidated.length !== n) throw new RangeError("all series must have the same length");
 if (n < 1) throw new RangeError("the series must have at least one epoch");
 const blockLength = Math.min(options.blockLength, n);
 const rng = new Rng(options.seed, "bootstrap");
 for (const s of series) for (const m of s.multiples) if (typeof m !== "number" || !Number.isFinite(m) || m < 0) throw new RangeError("equity multiples must be finite numbers at or above zero");
 if (!Number.isInteger(options.holdSteps) || options.holdSteps < 1) throw new RangeError("holdSteps must be a positive integer");
 const finals = series.map(() => new Array<number>(options.resamples));
 const liquidations = series.map(() => 0);
 const ruins = series.map(() => 0);
 const indices = new Int32Array(n);
 const sizes = new Float64Array(n);
 const anyLiquidation = series.map((s) => s.liquidated.some(Boolean));
 for (let r = 0; r < options.resamples; r += 1) {
  fillMovingBlocks(indices, blockLength, rng);
  series.forEach((s, k) => {
   const equity = trancheFinalAndMin(s.multiples, indices, options.holdSteps, sizes);
   (finals[k] as number[])[r] = equity.final;
   let any = false;
   if (anyLiquidation[k]) {
    for (let i = 0; i < n; i += 1) {
     if (s.liquidated[indices[i] as number] === true) {
      any = true;
      break;
     }
    }
   }
   if (any) liquidations[k] = (liquidations[k] as number) + 1;
   if (equity.min <= options.ruinFraction) ruins[k] = (ruins[k] as number) + 1;
  });
 }
 return series.map((s, k) => ({
  leverage: s.leverage,
  resamples: options.resamples,
  blockLength,
  ruinFraction: options.ruinFraction,
  medianFinalEquity: percentile(finals[k] as number[], 0.5),
  p05FinalEquity: percentile(finals[k] as number[], 0.05),
  p95FinalEquity: percentile(finals[k] as number[], 0.95),
  probLiquidation: (liquidations[k] as number) / options.resamples,
  probRuin: (ruins[k] as number) / options.resamples,
 }));
}

// ---------------------------------------------------------------------------
// Calibration, Sharpe and days to detect
// ---------------------------------------------------------------------------

const Z95 = 1.959963984540054;

/** Wilson score interval of a proportion at 95%. */
export function wilsonInterval(successes: number, n: number): [number, number] {
 if (!Number.isInteger(n) || n < 1 || !Number.isInteger(successes) || successes < 0 || successes > n) throw new RangeError("invalid counts");
 const p = successes / n;
 const z2 = Z95 * Z95;
 const denominator = 1 + z2 / n;
 const center = (p + z2 / (2 * n)) / denominator;
 const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
 return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function brierScore(ps: readonly number[], hits: readonly boolean[]): number {
 if (ps.length !== hits.length || ps.length === 0) throw new RangeError("brierScore needs equal, non empty lists");
 let sum = 0;
 ps.forEach((p, i) => {
  const y = hits[i] ? 1 : 0;
  sum += (p - y) * (p - y);
 });
 return sum / ps.length;
}

export function calibrationReport(pairs: ReadonlyArray<{ p: number; hit: boolean }>, bins: number = STATS_DEFAULTS.reliabilityBins): CalibrationReport | null {
 for (const pair of pairs) if (typeof pair.p !== "number" || !(pair.p >= 0 && pair.p <= 1)) throw new RangeError("probabilities must be numbers from 0 to 1");
 if (pairs.length === 0) return null;
 const ps = pairs.map((pair) => pair.p);
 const hits = pairs.map((pair) => pair.hit);
 const baseRate = hits.filter(Boolean).length / pairs.length;
 const brier = brierScore(ps, hits);
 const brierBaseRate = brierScore(new Array<number>(pairs.length).fill(baseRate), hits);
 const grouped: Array<Array<{ p: number; hit: boolean }>> = Array.from({ length: bins }, () => []);
 for (const pair of pairs) (grouped[Math.min(bins - 1, Math.floor(pair.p * bins + 1e-9))] as Array<{ p: number; hit: boolean }>).push(pair);
 const reliability: ReliabilityBin[] = grouped.map((group, index) => {
  const lower = index / bins;
  const upper = (index + 1) / bins;
  if (group.length === 0) return { lower, upper, n: 0, meanPredicted: null, observedFrequency: null, wilson95: null };
  const successes = group.filter((pair) => pair.hit).length;
  return {
   lower,
   upper,
   n: group.length,
   meanPredicted: mean(group.map((pair) => pair.p)),
   observedFrequency: successes / group.length,
   wilson95: wilsonInterval(successes, group.length),
  };
 });
 return { n: pairs.length, baseRate, brier, brierBaseRate, skill: brierBaseRate > 0 ? 1 - brier / brierBaseRate : null, reliability };
}

/** mean / sqrt(long-run variance) * sqrt(steps per year); equal to t * sqrt(steps per year / n). null without variance. */
export function sharpeAnnualized(meanPerStep: number, lrv: number, stepsPerYear: number): number | null {
 if (!(lrv > 0) || !Number.isFinite(meanPerStep) || !(stepsPerYear > 0)) return null;
 return (meanPerStep / Math.sqrt(lrv)) * Math.sqrt(stepsPerYear);
}

/** Days of data to detect an annualized Sharpe with the given t: (t * sqrt(365) / S)^2. null for S at or below zero. */
export function daysToDetectSharpe(sharpeAnnual: number, t: number = STATS_DEFAULTS.tThreshold): number | null {
 if (!Number.isFinite(sharpeAnnual) || sharpeAnnual <= 0) return null;
 return ((t * t) * YEAR_DAYS) / (sharpeAnnual * sharpeAnnual);
}

/** Daily mean and sd of the tranche portfolio: mean / K * steps per day and sqrt(lrv * steps per day) / K. */
export function portfolioDaily(meanPerStep: number, lrv: number, overlap: number, stepsPerDay: number): { dailyMean: number; dailySd: number } {
 return { dailyMean: (meanPerStep / overlap) * stepsPerDay, dailySd: Math.sqrt(lrv * stepsPerDay) / overlap };
}

// ---------------------------------------------------------------------------
// Policy level assembly
// ---------------------------------------------------------------------------

export interface StatsContext {
 stepMs: number;
 horizonMs: number;
 maxDecisionMs: number;
 bootstrap: { resamples: number; seed: number; ruinFraction: number };
 /** Maintenance margin rate of the cost table, for the closed form reference. */
 maintenanceMarginRate: number;
 alpha: number;
}

export interface PolicyInputs {
 descriptor: PolicyDescriptor;
 /** One entry per epoch of the journal; null: the chosen outcome is incomplete and the epoch is excluded. */
 results: ReadonlyArray<EpochResult | null>;
 statuses: Record<DecisionStatus, number>;
 /** Decisions in which the chooser was actually asked. */
 consulted: number;
 costUsd: ReadonlyArray<number | null>;
 inputTokens: ReadonlyArray<number | null>;
 latencyMs: ReadonlyArray<number>;
 calibrationPairs: ReadonlyArray<{ p: number; hit: boolean }>;
 /** Daily volatility of what was traded, from the candidates' features; null when unknown. */
 sigmaDailyReference: number | null;
}

export function overlapOf(ctx: Pick<StatsContext, "stepMs" | "horizonMs">): number {
 return Math.max(1, Math.ceil(ctx.horizonMs / ctx.stepMs));
}

export const SHARPE_CAVEAT =
 "Extrapola uma janela curta para um ano; o erro-padrão do Sharpe amostral é grande; não inclui impacto de mercado; escolher o melhor entre várias políticas infla o valor; não é previsão.";

function usableOf(results: ReadonlyArray<EpochResult | null>): EpochResult[] {
 return results.filter((r): r is EpochResult => r !== null);
}

function leverageRows(usable: EpochResult[], trades: number, overlap: number, spanDays: number, ctx: StatsContext, sigma: number | null): LeverageReportRow[] {
 const leveredTrades = usable.filter((r) => r.trade && r.levered).length;
 const blockLength = Math.max(3 * overlap, 4);
 const bootstrap =
  trades > 0 && usable.length >= 2
   ? bootstrapLeverage(
    LEVERAGES.map((leverage) => ({ leverage, multiples: usable.map((r) => r.equityMultiple[leverage]), liquidated: usable.map((r) => r.liquidated[leverage]) })),
    { holdSteps: overlap, resamples: ctx.bootstrap.resamples, blockLength, seed: ctx.bootstrap.seed, ruinFraction: ctx.bootstrap.ruinFraction },
   )
   : null;
 return LEVERAGES.map((leverage, index): LeverageReportRow => {
  const curve = trancheEquity(usable.map((r) => r.equityMultiple[leverage]), overlap);
  const liquidations = usable.filter((r) => r.liquidated[leverage]).length;
  const sigmaOk = sigma !== null && sigma > 0 && sigma < 1 && spanDays > 0;
  return {
   leverage,
   applicableShare: trades > 0 ? leveredTrades / trades : null,
   observed: { finalEquity: curve.final, maxDrawdown: curve.maxDrawdown, minEquity: curve.minEquity, liquidations, liquidationRate: leveredTrades > 0 ? liquidations / leveredTrades : null },
   bootstrap: bootstrap === null ? null : (({ leverage: _ignored, ...rest }) => rest)(bootstrap[index] as BootstrapRow),
   reference: sigmaOk
    ? {
     sigmaDaily: sigma as number,
     medianWealthNoEdge: medianWealthNoEdge(leverage, sigma as number, spanDays),
     touchLiquidationProbability: touchLiquidationProbability(leverage, sigma as number, ctx.horizonMs / DAY_MS, ctx.maintenanceMarginRate),
    }
    : null,
  };
 });
}

export function buildPolicyReport(inputs: PolicyInputs, ctx: StatsContext): PolicyReport {
 const overlap = overlapOf(ctx);
 const stepsPerDay = DAY_MS / ctx.stepMs;
 const stepsPerYear = YEAR_DAYS * stepsPerDay;
 const epochs = inputs.results.length;
 const spanDays = (epochs * ctx.stepMs) / DAY_MS;
 const usable = usableOf(inputs.results);
 const raw = meanTestWithGaps(inputs.results.map((r) => (r === null ? null : r.returnOnCapital)), overlap);
 const tradeResults = usable.filter((r) => r.trade);
 const trades = tradeResults.length;

 const sharpe = raw.lrv === null ? null : sharpeAnnualized(raw.mean, raw.lrv, stepsPerYear);
 let portfolio: PolicyReport["portfolio"] = { dailyMean: null, dailySd: null, kellyLowerBound: null, leverageCapPhase2: null };
 if (raw.lrv !== null) {
  const daily = portfolioDaily(raw.mean, raw.lrv, overlap, stepsPerDay);
  let bound: number | null = null;
  let cap: number | null = null;
  if (daily.dailySd > 0 && daily.dailySd < 1 && spanDays > 0) {
   bound = kellyLowerBound(daily.dailyMean, daily.dailySd, spanDays);
   cap = deriveLimits({ capitalUsd: 1, sigmaDaily: daily.dailySd, phase: "fase-2", kellyLowerBound: bound }).leverageCap;
  }
  portfolio = { dailyMean: daily.dailyMean, dailySd: daily.dailySd, kellyLowerBound: bound, leverageCapPhase2: cap };
 }

 const byModality: PolicyReport["byModality"] = [];
 for (const modality of LAB_MODALITIES) {
  const count = usable.filter((r) => r.modality === modality).length;
  if (count === 0) continue;
  const contribution = inputs.results.map((r) => (r === null ? null : r.modality === modality ? r.returnOnCapital : 0));
  byModality.push({ modality, trades: count, mean: meanReport(meanTestWithGaps(contribution, overlap)), adjustedP: null });
 }

 const priced = inputs.costUsd.length === inputs.consulted && inputs.costUsd.every((c) => c !== null);
 const tokensKnown = inputs.inputTokens.length === inputs.consulted && inputs.inputTokens.every((c) => c !== null);
 const latencies = inputs.latencyMs;
 const rows = leverageRows(usable, trades, overlap, spanDays, ctx, inputs.sigmaDailyReference);

 return {
  id: inputs.descriptor.id,
  baseline: inputs.descriptor.baseline,
  tested: inputs.descriptor.tested,
  passive: inputs.descriptor.passive,
  chooser: inputs.descriptor.chooser,
  epochs,
  usableEpochs: usable.length,
  incompleteDecisions: epochs - usable.length,
  trades,
  holds: usable.length - trades,
  statuses: { ...inputs.statuses },
  tradeRate: usable.length > 0 ? trades / usable.length : null,
  tradesPerDay: usable.length > 0 ? (trades / usable.length) * stepsPerDay : null,
  hitRate: trades > 0 ? tradeResults.filter((r) => r.returnOnCapital > 0).length / trades : null,
  mean: meanReport(raw),
  adjustedP: null,
  maxDrawdown: usable.length > 0 ? (rows[0]?.observed?.maxDrawdown ?? null) : null,
  sharpe: { annualized: sharpe, daysToDetect: sharpe === null ? null : daysToDetectSharpe(sharpe), caveat: SHARPE_CAVEAT },
  portfolio,
  byModality,
  inference: {
   costKnown: priced,
   consulted: inputs.consulted,
   costUsdTotal: priced ? inputs.costUsd.reduce<number>((sum, c) => sum + (c as number), 0) : null,
   inputTokensTotal: tokensKnown ? inputs.inputTokens.reduce<number>((sum, c) => sum + (c as number), 0) : null,
   latencyMs: latencies.length > 0 ? { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99) } : null,
   shareAboveMaxDecision: latencies.length > 0 ? latencies.filter((l) => l > ctx.maxDecisionMs).length / latencies.length : null,
  },
  calibration: calibrationReport(inputs.calibrationPairs),
  leverage: rows,
 };
}

/** Policy minus baseline over the epochs usable for both; significant when t >= 2 and the lower bound is above zero. */
export function buildPairedReport(policy: PolicyInputs, baseline: PolicyInputs, ctx: StatsContext): PairedReport {
 const overlap = overlapOf(ctx);
 const epochs = Math.min(policy.results.length, baseline.results.length);
 const differences: Array<number | null> = Array(epochs).fill(null);
 for (let i = 0; i < epochs; i += 1) {
  const a = policy.results[i];
  const b = baseline.results[i];
  if (a !== null && a !== undefined && b !== null && b !== undefined) differences[i] = a.returnOnCapital - b.returnOnCapital;
 }
 const test = meanTestWithGaps(differences, overlap);
 const report = meanReport(test);
 const decided = report.t !== null && report.ci95Bps !== null;
 return {
  policy: policy.descriptor.id,
  baseline: baseline.descriptor.id,
  n: test.n,
  mean: report,
  significantlyBetter: decided ? (report.t as number) >= STATS_DEFAULTS.tThreshold && (report.ci95Bps as [number, number])[0] > 0 : null,
 };
}

/**
 * Holm correction over every defined test of the family: the "mean > 0" test of each policy and of each (policy,
 * modality) with enough trades. Writes adjustedP into the reports and returns the family.
 */
export function assignHolm(policies: PolicyReport[], alpha: number, minTradesForModality: number): MultipleTesting {
 type Slot = { entry: MultipleTestingEntry; set: (value: number) => void };
 const slots: Slot[] = [];
 for (const policy of policies) {
  if (policy.mean !== null && policy.mean.pOneSided !== null) {
   slots.push({ entry: { policy: policy.id, modality: null, p: policy.mean.pOneSided, adjustedP: null, rejected: false }, set: (value) => (policy.adjustedP = value) });
  }
  for (const part of policy.byModality) {
   if (part.trades >= minTradesForModality && part.mean !== null && part.mean.pOneSided !== null) {
    slots.push({ entry: { policy: policy.id, modality: part.modality as LabModality, p: part.mean.pOneSided, adjustedP: null, rejected: false }, set: (value) => (part.adjustedP = value) });
   }
  }
 }
 const adjusted = holmAdjust(slots.map((slot) => slot.entry.p as number));
 slots.forEach((slot, index) => {
  const value = adjusted[index] as number;
  slot.entry.adjustedP = value;
  slot.entry.rejected = value < alpha;
  slot.set(value);
 });
 return { method: "holm", alpha, family: slots.map((slot) => slot.entry) };
}

// ---------------------------------------------------------------------------
// Promotion gate
// ---------------------------------------------------------------------------

export const CRITERION_IDS = [
 "dados-reais",
 "dias-minimos",
 "amostra-efetiva",
 "resultados-completos",
 "custo-de-inferencia",
 "t-newey-west",
 "limite-inferior-positivo",
 "correcao-holm",
 "contra-baselines",
 "kelly-alavancagem",
 "janela-fora-da-amostra",
 "fills-reais-conciliados",
 "autorizacao-e-assinante",
] as const;
export type CriterionId = (typeof CRITERION_IDS)[number];

const STATISTICAL_IDS: readonly CriterionId[] = [
 "dias-minimos",
 "amostra-efetiva",
 "resultados-completos",
 "custo-de-inferencia",
 "t-newey-west",
 "limite-inferior-positivo",
 "correcao-holm",
 "contra-baselines",
 "kelly-alavancagem",
];

function round2(value: number): number {
 return Math.round(value * 100) / 100;
}

/**
 * Recommends the phase the lab is already in. The recommendation can never be anything but fase-0 and never grants
 * permission: even with every statistical criterion met, fills, authorization and signer are not evaluable here.
 * The subject is the policy that is tested and not a baseline (the Jev policy).
 */
export function promotionGate(input: GateInput): GateResult {
 const subject = input.policies.find((policy) => policy.tested && !policy.baseline) ?? null;
 const rows = subject === null ? [] : input.paired.filter((row) => row.policy === subject.id);
 const entries = new Map<CriterionId, { status: CriterionStatus; criterion: Criterion }>();
 const put = (id: CriterionId, status: CriterionStatus, description: string, requirement: string, observed: number | string | null): void => {
  entries.set(id, { status, criterion: { id, description, requirement, observed } });
 };

 put("dados-reais", input.mode === "synthetic" ? "failed" : "unknown", "A origem dos dados é um mercado real e verificável", "captura real; dados sintéticos nunca atendem e a origem de uma captura não é verificável pelo laboratório", input.mode);

 const days = input.run.spanDays;
 put("dias-minimos", days >= STATS_DEFAULTS.minDays ? "passed" : "failed", "Janela com dias suficientes", `dias cobertos >= ${STATS_DEFAULTS.minDays} (R3, seção 6)`, round2(days));

 const effective = subject?.mean?.effectiveSamples ?? null;
 put("amostra-efetiva", effective === null ? "unknown" : effective >= STATS_DEFAULTS.minEffectiveSamples ? "passed" : "failed", "Amostra efetiva suficiente para o t de Student", `floor(n / (lag + 1)) >= ${STATS_DEFAULTS.minEffectiveSamples}`, effective);

 const completeness = input.run.completeness;
 put("resultados-completos", completeness === null ? "unknown" : completeness >= STATS_DEFAULTS.minCompleteness ? "passed" : "failed", "Resultados completos", `fração de épocas com resultado utilizável >= ${STATS_DEFAULTS.minCompleteness}`, completeness);

 const costKnown = subject?.inference.costKnown ?? null;
 put("custo-de-inferencia", costKnown === null ? "unknown" : costKnown ? "passed" : "unknown", "Custo de inferência conhecido", "todo custo de inferência informado; desconhecido nunca vira zero", costKnown === null ? null : costKnown ? "conhecido" : "desconhecido");

 const t = subject?.mean?.t ?? null;
 put("t-newey-west", t === null ? "unknown" : t >= STATS_DEFAULTS.tThreshold ? "passed" : "failed", "t de Newey-West da média líquida por época", `t >= ${STATS_DEFAULTS.tThreshold} (R3, seção 6)`, t);

 const lower = subject?.mean?.ci95Bps?.[0] ?? null;
 put("limite-inferior-positivo", lower === null ? "unknown" : lower > 0 ? "passed" : "failed", "Limite inferior do IC de 95% da média líquida por época", "limite inferior > 0 (R3, seção 6)", lower);

 const adjusted = subject?.adjustedP ?? null;
 put("correcao-holm", adjusted === null ? "unknown" : adjusted < input.multipleTesting.alpha ? "passed" : "failed", "Significância após a correção de Holm", `p ajustado < ${input.multipleTesting.alpha}`, adjusted);

 const better = rows.filter((row) => row.significantlyBetter === true).length;
 const worse = rows.filter((row) => row.significantlyBetter === false).length;
 put("contra-baselines", rows.length === 0 ? "unknown" : worse > 0 ? "failed" : better === rows.length ? "passed" : "unknown", "Supera todas as linhas de base", "todas as comparações pareadas com t >= 2 e limite inferior > 0", rows.length === 0 ? null : `${better} de ${rows.length}`);

 const bound = subject?.portfolio.kellyLowerBound ?? null;
 const cap = subject?.portfolio.leverageCapPhase2 ?? null;
 put(
  "kelly-alavancagem",
  bound === null ? "unknown" : bound > 0 ? "passed" : "failed",
  "Há base estatística para alguma alavancagem",
  "kellyLowerBound(mu diário, sigma diário, dias) > 0 (src/policy/envelope.ts); sem isso a alavancagem fica em 0x",
  bound === null ? null : `limite inferior do Kelly ${round2(bound)}, teto de alavancagem da fase 2 ${cap === null ? "indefinido" : cap}x`,
 );

 const frozen = input.run.frozenAtMs;
 put(
  "janela-fora-da-amostra",
  frozen === null ? "unknown" : input.run.firstEpochMs >= frozen ? "passed" : "failed",
  "Janela congelada: a configuração foi registrada antes do primeiro epoch avaliado",
  "frozenAtMs declarado pelo operador e anterior ao primeiro epoch (atestado, não verificável pelo laboratório)",
  frozen,
 );
 put("fills-reais-conciliados", "unknown", "Fills reais conciliados", "execução real conciliada; o laboratório não executa e nunca avalia este critério", null);
 put("autorizacao-e-assinante", "unknown", "Autorização financeira explícita e assinante separado", "decisão do dono (D11); o laboratório não avalia este critério", null);

 const passed: Criterion[] = [];
 const failed: Criterion[] = [];
 const unknown: Criterion[] = [];
 for (const id of CRITERION_IDS) {
  const entry = entries.get(id) as { status: CriterionStatus; criterion: Criterion };
  (entry.status === "passed" ? passed : entry.status === "failed" ? failed : unknown).push(entry.criterion);
 }

 const allStatistical = STATISTICAL_IDS.every((id) => (entries.get(id) as { status: CriterionStatus }).status === "passed");
 const parts: string[] = ["Recomendação: permanecer na fase-0 (paper e leitura)."];
 if (allStatistical && failed.length === 0) {
  parts.push(
   "Os critérios estatísticos desta janela foram atendidos. Isto não concede nada: o dono decide com o checklist de qualificação real (bun run qualify:live), a autorização explícita, o assinante separado e fills reais conciliados, que este laboratório não avalia.",
  );
 } else {
  parts.push(`Evidência insuficiente nesta janela: ${failed.length} critério(s) reprovado(s) e ${unknown.length} desconhecido(s).`);
 }
 parts.push("Alavancagem permanece em 0x na fase-0.");
 if (bound !== null && bound > 0) {
  parts.push(`Limite inferior do Kelly ${round2(bound)}; teto da fase 2, se um dia aplicável: ${cap === null ? "indefinido" : cap}x (informativo, não concede nada).`);
 }
 parts.push("Nada aqui prova lucro.");
 return { recommendation: parts.join(" "), recommendedPhase: "fase-0", passed, failed, unknown, grantsPermission: false };
}
