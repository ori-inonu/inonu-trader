/**
 * Small, dependency free descriptive statistics. Pure and deterministic. Every function returns null
 * (never zero or NaN) when the sample cannot support the statistic.
 */

import { isFiniteNumber } from "./types";

function allFinite(values: readonly number[]): boolean {
  for (const value of values) if (!isFiniteNumber(value)) return false;
  return true;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0 || !allFinite(values)) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Sample variance with the n - 1 denominator. */
export function sampleVariance(values: readonly number[]): number | null {
  if (values.length < 2 || !allFinite(values)) return null;
  const m = mean(values) as number;
  let sum = 0;
  for (const value of values) sum += (value - m) ** 2;
  return sum / (values.length - 1);
}

export function sampleStdDev(values: readonly number[]): number | null {
  const variance = sampleVariance(values);
  return variance === null ? null : Math.sqrt(variance);
}

/** Linear interpolation quantile (type 7, the default of R and NumPy) of an unsorted sample, q in [0, 1]. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0 || !allFinite(values) || !isFiniteNumber(q) || q < 0 || q > 1) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (position - lower);
}

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

/** Median absolute deviation, unscaled. */
export function mad(values: readonly number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((value) => Math.abs(value - m)));
}

/** MAD scaled to be consistent with the standard deviation of a normal sample (divide by 0.6745). */
export function madSigma(values: readonly number[]): number | null {
  const value = mad(values);
  return value === null ? null : value / 0.6744897501960817;
}

/**
 * True when the second moment is real dispersion and not the rounding error of a constant series: the standard
 * deviation must exceed a few units of floating point resolution at the magnitude of the data.
 */
function hasDispersion(m2: number, values: readonly number[]): boolean {
  let scale = 0;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return m2 > 0 && Math.sqrt(m2) > 1e-10 * scale;
}

/** Fisher-Pearson sample skewness (population moments), null below 3 points or without dispersion. */
export function skewness(values: readonly number[]): number | null {
  if (values.length < 3 || !allFinite(values)) return null;
  const m = mean(values) as number;
  let m2 = 0;
  let m3 = 0;
  for (const value of values) {
    const d = value - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= values.length;
  m3 /= values.length;
  if (!hasDispersion(m2, values)) return null;
  return m3 / m2 ** 1.5;
}

/** Excess kurtosis (population moments minus 3), null below 4 points or without dispersion. */
export function excessKurtosis(values: readonly number[]): number | null {
  if (values.length < 4 || !allFinite(values)) return null;
  const m = mean(values) as number;
  let m2 = 0;
  let m4 = 0;
  for (const value of values) {
    const d = value - m;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= values.length;
  m4 /= values.length;
  if (!hasDispersion(m2, values)) return null;
  return m4 / (m2 * m2) - 3;
}

/** Natural log returns of consecutive closes, or null when any close is not a positive finite number. */
export function logReturnsOf(closes: readonly number[]): number[] | null {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1] as number;
    const next = closes[i] as number;
    if (!isFiniteNumber(prev) || !isFiniteNumber(next) || !(prev > 0) || !(next > 0)) return null;
    out.push(Math.log(next / prev));
  }
  return out;
}
