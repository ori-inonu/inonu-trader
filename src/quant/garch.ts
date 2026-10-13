/**
 * GARCH(1,1) with variance targeting, fitted by quasi maximum likelihood on a coarse grid, plus the
 * filter that turns returns into standardized residuals for filtered historical simulation.
 *
 *   v[t+1] = omega + alpha r[t]^2 + beta v[t],   omega = (1 - alpha - beta) V   (V is the sample mean of r^2)
 *   logLik = sum -0.5 (ln v[t] + r[t]^2 / v[t])
 *
 * The grid keeps the fit deterministic and robust on the short samples a 15 minute feed gives: no
 * optimizer, no starting values, no failure to converge. Pure: no I/O, no clock, no randomness.
 */

import { mean } from "./stats";
import { isFiniteNumber } from "./types";

export const MIN_FIT_RETURNS = 100;
export const MAX_FIT_RETURNS = 5000;
const ALPHA_GRID = { min: 0.01, max: 0.3, step: 0.01 } as const;
const BETA_GRID = { min: 0.4, max: 0.98, step: 0.01 } as const;
const MAX_PERSISTENCE = 0.995;

export interface GarchParams {
  readonly omega: number;
  readonly alpha: number;
  readonly beta: number;
}

export interface GarchFilter {
  /** Conditional variance each return was drawn under (known before the return). */
  readonly variances: readonly number[];
  /** r[t] / sqrt(v[t]). */
  readonly residuals: readonly number[];
  readonly logLik: number;
  /** The one step ahead conditional variance after the last return. */
  readonly nextVariance: number;
  /** Variance the recursion started from. */
  readonly longRunVariance: number;
}

function allFinite(values: readonly number[]): boolean {
  for (const value of values) if (!isFiniteNumber(value)) return false;
  return true;
}

function meanSquare(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return sum / values.length;
}

export function garchFilter(returns: readonly number[], params: GarchParams, longRunVariance?: number): GarchFilter | null {
  if (returns.length === 0 || !allFinite(returns)) return null;
  const { omega, alpha, beta } = params;
  if (![omega, alpha, beta].every(isFiniteNumber) || omega < 0 || alpha < 0 || beta < 0 || alpha + beta >= 1) return null;
  const start = longRunVariance ?? meanSquare(returns);
  if (!isFiniteNumber(start) || !(start > 0)) return null;
  const variances: number[] = [];
  const residuals: number[] = [];
  let v = start;
  let logLik = 0;
  for (const r of returns) {
    variances.push(v);
    residuals.push(r / Math.sqrt(v));
    logLik += -0.5 * (Math.log(v) + (r * r) / v);
    v = omega + alpha * r * r + beta * v;
    if (!(v > 0) || !Number.isFinite(v)) return null;
  }
  return { variances, residuals, logLik, nextVariance: v, longRunVariance: start };
}

/** Centers and rescales residuals to mean 0 and second moment 1, or null when there is no shape to keep. */
export function standardize(residuals: readonly number[]): number[] | null {
  if (residuals.length < 2 || !allFinite(residuals)) return null;
  const m = mean(residuals) as number;
  const centered = residuals.map((z) => z - m);
  const scale = Math.sqrt(meanSquare(centered));
  if (!(scale > 1e-12)) return null;
  return centered.map((z) => z / scale);
}

export interface GarchFit extends GarchParams {
  readonly persistence: number;
  /** Bars for a variance shock to decay by half, or null when there is no decay. */
  readonly halfLifeBars: number | null;
  readonly logLik: number;
  readonly longRunVariance: number;
  /** True when the best grid point sits on an edge of the grid, so the optimum may lie beyond it. */
  readonly atBoundary: boolean;
  readonly n: number;
}

function logLikelihood(returns: readonly number[], omega: number, alpha: number, beta: number, start: number): number {
  let v = start;
  let ll = 0;
  for (let i = 0; i < returns.length; i += 1) {
    const r = returns[i] as number;
    ll += -0.5 * (Math.log(v) + (r * r) / v);
    v = omega + alpha * r * r + beta * v;
  }
  return ll;
}

export function fitGarch11(allReturns: readonly number[]): GarchFit | null {
  if (allReturns.length < MIN_FIT_RETURNS || !allFinite(allReturns)) return null;
  const returns = allReturns.length > MAX_FIT_RETURNS ? allReturns.slice(allReturns.length - MAX_FIT_RETURNS) : allReturns;
  const longRun = meanSquare(returns);
  if (!(longRun > 0)) return null;
  let best: { alpha: number; beta: number; ll: number } | null = null;
  const alphaSteps = Math.round((ALPHA_GRID.max - ALPHA_GRID.min) / ALPHA_GRID.step);
  const betaSteps = Math.round((BETA_GRID.max - BETA_GRID.min) / BETA_GRID.step);
  for (let i = 0; i <= alphaSteps; i += 1) {
    const alpha = Math.round((ALPHA_GRID.min + i * ALPHA_GRID.step) * 1e6) / 1e6;
    for (let j = 0; j <= betaSteps; j += 1) {
      const beta = Math.round((BETA_GRID.min + j * BETA_GRID.step) * 1e6) / 1e6;
      if (alpha + beta > MAX_PERSISTENCE) continue;
      const ll = logLikelihood(returns, (1 - alpha - beta) * longRun, alpha, beta, longRun);
      if (Number.isFinite(ll) && (best === null || ll > best.ll)) best = { alpha, beta, ll };
    }
  }
  if (best === null) return null;
  const persistence = best.alpha + best.beta;
  return {
    omega: (1 - persistence) * longRun,
    alpha: best.alpha,
    beta: best.beta,
    persistence,
    halfLifeBars: persistence > 0 && persistence < 1 ? Math.log(0.5) / Math.log(persistence) : null,
    logLik: best.ll,
    longRunVariance: longRun,
    atBoundary: best.alpha >= ALPHA_GRID.max - 1e-9 || best.beta >= BETA_GRID.max - 1e-9 || persistence >= MAX_PERSISTENCE - 1e-9 || best.beta <= BETA_GRID.min + 1e-9,
    n: returns.length,
  };
}
