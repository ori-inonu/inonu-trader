/**
 * Volatility estimators over audited OHLC bars and the band they form together.
 *
 * Per bar variances (before scaling to a day):
 *   close to close   sample variance of ln(c_i / c_{i-1})
 *   Parkinson        mean ln(h/l)^2 / (4 ln 2)
 *   Garman Klass     mean 0.5 ln(h/l)^2 - (2 ln 2 - 1) ln(c/o)^2
 *   Rogers Satchell  mean ln(h/c) ln(h/o) + ln(l/c) ln(l/o), robust to drift
 *   Yang Zhang       var(overnight) + k var(open to close) + (1 - k) Rogers Satchell, k = 0.34 / (1.34 + (N+1)/(N-1))
 *   EWMA             RiskMetrics recursion on squared returns, seeded with the first 20
 *   robust           MAD of log returns divided by 0.6745
 * Unknown stays unknown: any estimate that cannot be supported is null with a reason, never zero.
 *
 * Pure: no I/O, no clock, no randomness.
 */

import { candleDefect, type CandleAudit } from "./candles";
import { logReturnsOf, madSigma, median, sampleVariance } from "./stats";
import { DAY_MS, QuantError, requirePositive, type Candle } from "./types";

const LN2 = Math.LN2;
export const MIN_BAND_CANDLES = 21;
/** Recent over full sample volatility at or above which the regime reads stressed, at or below which calm. */
export const STRESSED_RATIO = 1.5;
export const CALM_RATIO = 1 / 1.5;
const EWMA_SEED = 20;

/** Recent over full sample volatility at or above STRESSED_RATIO reads stressed, at or below CALM_RATIO calm, otherwise normal. */
export function regimeOf(recentRatio: number | null): VolatilityRegime | null {
  if (recentRatio === null || !Number.isFinite(recentRatio)) return null;
  return recentRatio >= STRESSED_RATIO ? "stressed" : recentRatio <= CALM_RATIO ? "calm" : "normal";
}

export type EstimatorName = "closeToClose" | "parkinson" | "garmanKlass" | "rogersSatchell" | "yangZhang" | "ewma" | "robust";
export type VolatilityRegime = "calm" | "normal" | "stressed";

export interface SigmaEstimate {
  readonly sigmaDaily: number | null;
  readonly reason: string | null;
}

export interface SigmaBand {
  readonly barMs: number;
  readonly candlesUsed: number;
  readonly estimates: Readonly<Record<EstimatorName, SigmaEstimate>>;
  /** Smallest of the six non robust estimates (the five full sample ones and the EWMA), or null. */
  readonly low: number | null;
  /** Median of the five full sample estimators (EWMA and robust excluded), or null. */
  readonly central: number | null;
  /** Largest of the same six estimates, so a recent shock raises the upper side. */
  readonly high: number | null;
  /** (high - low) / central. */
  readonly dispersion: number | null;
  /** How many of the six band estimators are available. */
  readonly available: number;
  /** close to close over robust: well above 1 means a few extreme bars dominate the plain sigma. */
  readonly tailRatio: number | null;
  /** EWMA over central: above 1 means the present is rougher than the sample. */
  readonly recentRatio: number | null;
  readonly regime: VolatilityRegime | null;
}

export interface BandOptions {
  /** EWMA decay per bar, in (0, 1). Default 0.94, the RiskMetrics value. */
  readonly lambda?: number;
  readonly minCandles?: number;
}

function allSound(candles: readonly Candle[]): boolean {
  for (const candle of candles) if (candleDefect(candle) !== null) return false;
  return true;
}

function meanOf(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function closeToCloseVariance(candles: readonly Candle[]): number | null {
  if (candles.length < 3 || !allSound(candles)) return null;
  const returns = logReturnsOf(candles.map((c) => c.close));
  return returns === null ? null : sampleVariance(returns);
}

export function parkinsonVariance(candles: readonly Candle[]): number | null {
  if (candles.length < 1 || !allSound(candles)) return null;
  return meanOf(candles.map((c) => Math.log(c.high / c.low) ** 2)) / (4 * LN2);
}

export function garmanKlassVariance(candles: readonly Candle[]): number | null {
  if (candles.length < 1 || !allSound(candles)) return null;
  return meanOf(candles.map((c) => 0.5 * Math.log(c.high / c.low) ** 2 - (2 * LN2 - 1) * Math.log(c.close / c.open) ** 2));
}

function rogersSatchellTerm(c: Candle): number {
  return Math.log(c.high / c.close) * Math.log(c.high / c.open) + Math.log(c.low / c.close) * Math.log(c.low / c.open);
}

export function rogersSatchellVariance(candles: readonly Candle[]): number | null {
  if (candles.length < 1 || !allSound(candles)) return null;
  return meanOf(candles.map(rogersSatchellTerm));
}

/** Over the N = n - 1 bars that have a previous close. */
export function yangZhangVariance(candles: readonly Candle[]): number | null {
  if (candles.length < 3 || !allSound(candles)) return null;
  const bars = candles.slice(1);
  const n = bars.length;
  const overnight = bars.map((c, i) => Math.log(c.open / (candles[i] as Candle).close));
  const openToClose = bars.map((c) => Math.log(c.close / c.open));
  const varOvernight = sampleVariance(overnight);
  const varOpenClose = sampleVariance(openToClose);
  if (varOvernight === null || varOpenClose === null) return null;
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));
  return varOvernight + k * varOpenClose + (1 - k) * meanOf(bars.map(rogersSatchellTerm));
}

/** RiskMetrics recursion v = lambda v + (1 - lambda) r^2 over zero mean returns, seeded with the first 20 squared returns. */
export function ewmaVariance(returns: readonly number[], lambda: number): number | null {
  if (!(lambda > 0 && lambda < 1)) throw new QuantError("option_invalid");
  if (returns.length === 0 || returns.some((r) => !Number.isFinite(r))) return null;
  const seedCount = Math.min(EWMA_SEED, returns.length);
  let variance = meanOf(returns.slice(0, seedCount).map((r) => r * r));
  for (let i = seedCount; i < returns.length; i += 1) variance = lambda * variance + (1 - lambda) * (returns[i] as number) ** 2;
  return variance;
}

const NAMES: readonly EstimatorName[] = ["closeToClose", "parkinson", "garmanKlass", "rogersSatchell", "yangZhang", "ewma", "robust"];
const FULL_SAMPLE: readonly EstimatorName[] = ["closeToClose", "parkinson", "garmanKlass", "rogersSatchell", "yangZhang"];

function unavailable(barMs: number, candlesUsed: number, reason: string): SigmaBand {
  const estimates = Object.fromEntries(NAMES.map((name) => [name, { sigmaDaily: null, reason }])) as Record<EstimatorName, SigmaEstimate>;
  return { barMs, candlesUsed, estimates, low: null, central: null, high: null, dispersion: null, available: 0, tailRatio: null, recentRatio: null, regime: null };
}

function scaled(variance: number | null, barsPerDay: number): SigmaEstimate {
  if (variance === null || !Number.isFinite(variance)) return { sigmaDaily: null, reason: "variance_unavailable" };
  if (variance === 0) return { sigmaDaily: null, reason: "sigma_zero" };
  if (variance < 0) return { sigmaDaily: null, reason: "variance_negative" };
  return { sigmaDaily: Math.sqrt(variance * barsPerDay), reason: null };
}

/** The band over bars the caller already audited. Bars must be ascending and consecutive. */
export function sigmaBand(candles: readonly Candle[], barMs: number, options?: BandOptions): SigmaBand {
  requirePositive(barMs, "bar_invalid");
  const lambda = options?.lambda ?? 0.94;
  if (!(lambda > 0 && lambda < 1)) throw new QuantError("option_invalid");
  const minCandles = options?.minCandles ?? MIN_BAND_CANDLES;
  requirePositive(minCandles, "option_invalid");
  if (candles.length < minCandles) return unavailable(barMs, candles.length, "too_few_candles");
  if (!allSound(candles)) return unavailable(barMs, candles.length, "candle_invalid");

  const barsPerDay = DAY_MS / barMs;
  const returns = logReturnsOf(candles.map((c) => c.close)) as number[];
  const robust = madSigma(returns);
  const estimates: Record<EstimatorName, SigmaEstimate> = {
    closeToClose: scaled(closeToCloseVariance(candles), barsPerDay),
    parkinson: scaled(parkinsonVariance(candles), barsPerDay),
    garmanKlass: scaled(garmanKlassVariance(candles), barsPerDay),
    rogersSatchell: scaled(rogersSatchellVariance(candles), barsPerDay),
    yangZhang: scaled(yangZhangVariance(candles), barsPerDay),
    ewma: scaled(ewmaVariance(returns, lambda), barsPerDay),
    robust: scaled(robust === null ? null : robust * robust, barsPerDay),
  };

  const full = FULL_SAMPLE.map((name) => estimates[name].sigmaDaily).filter((v): v is number => v !== null);
  const ewma = estimates.ewma.sigmaDaily;
  const all = ewma === null ? full : [...full, ewma];
  const central = median(full);
  const low = all.length ? Math.min(...all) : null;
  const high = all.length ? Math.max(...all) : null;
  const robustSigma = estimates.robust.sigmaDaily;
  const close = estimates.closeToClose.sigmaDaily;
  const recentRatio = ewma !== null && central !== null ? ewma / central : null;
  const regime = regimeOf(recentRatio);

  return {
    barMs,
    candlesUsed: candles.length,
    estimates,
    low,
    central,
    high,
    dispersion: central !== null && low !== null && high !== null ? (high - low) / central : null,
    available: all.length,
    tailRatio: close !== null && robustSigma !== null ? close / robustSigma : null,
    recentRatio,
    regime,
  };
}

/** The band from an audit: a stale audit or one without enough usable bars gives no number. */
export function sigmaBandFromAudit(audit: CandleAudit, options?: BandOptions): SigmaBand {
  const minCandles = options?.minCandles ?? MIN_BAND_CANDLES;
  if (audit.usable.length < minCandles) return unavailable(audit.barMs, audit.usable.length, "too_few_candles");
  if (!audit.fresh) return unavailable(audit.barMs, audit.usable.length, "stale");
  return sigmaBand(audit.usable, audit.barMs, options);
}
