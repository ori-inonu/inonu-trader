/**
 * Extreme value tails for the residuals of the filtered historical simulation.
 *
 * An empirical residual pool cannot produce anything larger than what it has seen, so a pool of a few hundred
 * residuals has no one in a thousand event. The standard remedy (peaks over threshold, McNeil and Frey 2000) keeps the
 * empirical centre and replaces the tails by generalized Pareto distributions fitted to the points beyond a threshold.
 * The fit is by probability weighted moments (Hosking and Wallis 1987), closed form and stable for the 20 to 150
 * excesses a few days of bars give, with the shape clamped to a range that keeps the variance finite.
 *
 * Pure: no I/O, no clock; randomness only through the generator the caller passes in.
 */

import { isFiniteNumber, QuantError } from "./types";

export const MIN_EXCESSES = 20;
const XI_MIN = -0.25;
const XI_MAX = 0.45;

export interface GpdFit {
  /** Shape: positive means a heavy tail. Clamped to [-0.25, 0.45]. */
  readonly xi: number;
  /** Scale, from the sample mean and the clamped shape. */
  readonly sigma: number;
  readonly n: number;
  /** Mean of the excesses. */
  readonly mean: number;
}

export function fitGpd(excesses: readonly number[], options?: { minExcesses?: number }): GpdFit | null {
  const minExcesses = options?.minExcesses ?? MIN_EXCESSES;
  const n = excesses.length;
  if (n < minExcesses || n < 2) return null;
  for (const x of excesses) if (!isFiniteNumber(x) || x < 0) return null;
  const sorted = [...excesses].sort((a, b) => a - b);
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) {
    sum += sorted[i] as number;
    weighted += (1 - (i + 1 - 0.35) / n) * (sorted[i] as number);
  }
  const a0 = sum / n;
  const a1 = weighted / n;
  if (!(a0 > 0)) return null;
  const denominator = a0 - 2 * a1;
  const raw = denominator > 0 ? -(a0 / denominator - 2) : XI_MAX;
  const xi = Math.min(XI_MAX, Math.max(XI_MIN, raw));
  return { xi, sigma: a0 * (1 - xi), n, mean: a0 };
}

/** Size of an excess at cumulative probability `u` in [0, 1). */
export function gpdQuantile(u: number, xi: number, sigma: number): number {
  if (!isFiniteNumber(u) || !(u >= 0) || !(u < 1)) throw new QuantError("probability_invalid");
  if (!isFiniteNumber(xi) || !isFiniteNumber(sigma) || !(sigma > 0)) throw new QuantError("option_invalid");
  const y = Math.abs(xi) < 1e-9 ? -sigma * Math.log(1 - u) : (sigma / xi) * ((1 - u) ** -xi - 1);
  return y === 0 ? 0 : y;
}

/** About 30 points per tail, never fewer than 5 percent nor more than 15 percent of the sample. */
export function tailFraction(n: number): number {
  return Math.min(0.15, Math.max(0.05, 30 / n));
}

export interface TailFit {
  readonly threshold: number;
  readonly xi: number;
  readonly sigma: number;
  readonly n: number;
}

export interface Tails {
  readonly k: number;
  readonly lower: TailFit;
  readonly upper: TailFit;
  /** Residuals between the two thresholds, inclusive. */
  readonly central: Float64Array;
}

/** Splits a residual sample into an empirical centre and two fitted tails, or null when a tail has too few points. */
export function fitTails(residuals: readonly number[]): Tails | null {
  const n = residuals.length;
  for (const z of residuals) if (!isFiniteNumber(z)) return null;
  const k = Math.round(tailFraction(n) * n);
  if (k < MIN_EXCESSES || n - 2 * k < 2) return null;
  const sorted = [...residuals].sort((a, b) => a - b);
  const lowerThreshold = sorted[k] as number;
  const upperThreshold = sorted[n - k - 1] as number;
  const lowerFit = fitGpd(sorted.slice(0, k).map((z) => lowerThreshold - z));
  const upperFit = fitGpd(sorted.slice(n - k).map((z) => z - upperThreshold));
  if (lowerFit === null || upperFit === null) return null;
  return {
    k,
    lower: { threshold: lowerThreshold, xi: lowerFit.xi, sigma: lowerFit.sigma, n: k },
    upper: { threshold: upperThreshold, xi: upperFit.xi, sigma: upperFit.sigma, n: k },
    central: Float64Array.from(sorted.slice(k, n - k)),
  };
}

export type TailModel = "empirical" | "evt";

export interface ResidualSampler {
  /** The model actually in use: "evt" falls back to "empirical" when the tails cannot be fitted. */
  readonly model: TailModel;
  draw(random: () => number): number;
}

export function makeResidualSampler(residuals: readonly number[], tail: TailModel): ResidualSampler {
  if (residuals.length === 0 || residuals.some((z) => !isFiniteNumber(z))) throw new QuantError("option_invalid");
  const tails = tail === "evt" ? fitTails(residuals) : null;
  if (tails === null) {
    const pool = Float64Array.from(residuals);
    const size = pool.length;
    return { model: "empirical", draw: (random) => pool[Math.floor(random() * size)] as number };
  }
  const pk = tails.k / residuals.length;
  const { lower, upper, central } = tails;
  const size = central.length;
  return {
    model: "evt",
    draw(random) {
      const u = random();
      if (u < pk) return lower.threshold - gpdQuantile(random(), lower.xi, lower.sigma);
      if (u >= 1 - pk) return upper.threshold + gpdQuantile(random(), upper.xi, upper.sigma);
      return central[Math.floor(random() * size)] as number;
    },
  };
}
