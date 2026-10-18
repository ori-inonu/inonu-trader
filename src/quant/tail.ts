/**
 * Tail statistics of a return sample: shape (skew, excess kurtosis, Hill index), historical VaR and
 * expected shortfall, and the Cornish Fisher VaR. Losses are positive fractions. A sample that cannot
 * support a statistic gives null; a tail estimate is never built from fewer than three observations.
 *
 * Pure: no I/O, no clock, no randomness.
 */

import { normalQuantile } from "./normal";
import { excessKurtosis, mean, quantile, sampleStdDev, skewness } from "./stats";
import { isFiniteNumber, QuantError } from "./types";

const MIN_TAIL_COUNT = 3;
const MIN_HILL_SAMPLE = 100;
const MIN_CORNISH_SAMPLE = 30;
/**
 * The Cornish Fisher expansion is only trustworthy for moderate shape: beyond these bounds it overshoots badly
 * (a Student t with 3 degrees of freedom gave twice the historical 99 percent VaR in this repository's tests),
 * so tailProfile reports null there and the historical VaR and ES carry the tail.
 */
const CORNISH_MAX_EXCESS_KURTOSIS = 3.5;
const CORNISH_MAX_ABS_SKEW = 1;
/** Excess kurtosis above which a sample is called heavy tailed (a gaussian has 0). */
const HEAVY_KURTOSIS = 1;

export interface VarEs {
  /** Loss at the confidence level, positive when the quantile is a loss. */
  readonly var: number | null;
  /** Mean loss beyond the VaR. */
  readonly es: number | null;
  readonly tailCount: number;
}

function checkConfidence(confidence: number): void {
  if (!isFiniteNumber(confidence) || !(confidence > 0.5) || !(confidence < 1)) throw new QuantError("confidence_invalid");
}

function allFinite(values: readonly number[]): boolean {
  for (const value of values) if (!isFiniteNumber(value)) return false;
  return true;
}

export function historicalVarEs(returns: readonly number[], confidence: number): VarEs {
  checkConfidence(confidence);
  if (returns.length === 0 || !allFinite(returns)) return { var: null, es: null, tailCount: 0 };
  const q = quantile(returns, 1 - confidence) as number;
  const tail = returns.filter((r) => r <= q);
  if (tail.length < MIN_TAIL_COUNT) return { var: null, es: null, tailCount: tail.length };
  return { var: -q, es: -(mean(tail) as number), tailCount: tail.length };
}

/** VaR with the Cornish Fisher expansion of the normal quantile for the sample skew and excess kurtosis. */
export function cornishFisherVar(returns: readonly number[], confidence: number): number | null {
  checkConfidence(confidence);
  const mu = mean(returns);
  const sigma = sampleStdDev(returns);
  const skew = skewness(returns);
  const kurt = excessKurtosis(returns);
  if (mu === null || sigma === null || skew === null || kurt === null || !(sigma > 0)) return null;
  const z = normalQuantile(1 - confidence);
  const zcf = z + ((z * z - 1) * skew) / 6 + ((z ** 3 - 3 * z) * kurt) / 24 - ((2 * z ** 3 - 5 * z) * skew * skew) / 36;
  return -(mu + sigma * zcf);
}

/** Hill estimator of the tail index of the magnitudes, from the k largest against the (k + 1)th. */
export function hillIndex(values: readonly number[], k: number): number | null {
  if (!Number.isInteger(k) || k < 1 || values.length < k + 1 || !allFinite(values)) return null;
  const sorted = values.map((v) => Math.abs(v)).sort((a, b) => b - a);
  const threshold = sorted[k] as number;
  if (!(threshold > 0)) return null;
  let sum = 0;
  for (let i = 0; i < k; i += 1) sum += Math.log((sorted[i] as number) / threshold);
  const meanLog = sum / k;
  return meanLog > 0 ? 1 / meanLog : null;
}

function cornishInRange(kurt: number | null, skew: number | null): boolean {
  return kurt !== null && skew !== null && kurt <= CORNISH_MAX_EXCESS_KURTOSIS && Math.abs(skew) <= CORNISH_MAX_ABS_SKEW;
}

export interface TailProfile {
  readonly n: number;
  readonly mean: number | null;
  readonly sigma: number | null;
  readonly skew: number | null;
  readonly excessKurtosis: number | null;
  /** Tail index of the magnitudes: about 2 to 4 for heavy tailed markets, much larger when the tails are thin. */
  readonly hill: number | null;
  readonly hillK: number | null;
  readonly var95: number | null;
  readonly es95: number | null;
  readonly var99: number | null;
  readonly es99: number | null;
  /** Cornish Fisher 99 percent VaR, null outside the shape range where the expansion holds. */
  readonly cfVar99: number | null;
  /** Excess kurtosis above 1. Null when kurtosis is unknown. */
  readonly heavyTailed: boolean | null;
}

export function tailProfile(returns: readonly number[]): TailProfile {
  const n = returns.length;
  const sound = n > 0 && allFinite(returns);
  const hillK = sound && n >= MIN_HILL_SAMPLE ? Math.max(10, Math.floor(0.1 * n)) : null;
  const kurt = sound ? excessKurtosis(returns) : null;
  const ve95 = sound ? historicalVarEs(returns, 0.95) : { var: null, es: null };
  const ve99 = sound ? historicalVarEs(returns, 0.99) : { var: null, es: null };
  return {
    n,
    mean: sound ? mean(returns) : null,
    sigma: sound ? sampleStdDev(returns) : null,
    skew: sound ? skewness(returns) : null,
    excessKurtosis: kurt,
    hill: hillK === null ? null : hillIndex(returns, hillK),
    hillK,
    var95: ve95.var,
    es95: ve95.es,
    var99: ve99.var,
    es99: ve99.es,
    cfVar99: sound && n >= MIN_CORNISH_SAMPLE && cornishInRange(kurt, skewness(returns)) ? cornishFisherVar(returns, 0.99) : null,
    heavyTailed: kurt === null ? null : kurt > HEAVY_KURTOSIS,
  };
}
