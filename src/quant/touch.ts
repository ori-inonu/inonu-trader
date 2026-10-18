/**
 * Probability that a leveraged position touches its liquidation price inside a horizon.
 *
 * The barrier is a price move, so in log price it depends on the side:
 *   long   liquidated when price falls by d = 1/L - m          log barrier ln(1 - d)   (unreachable when d >= 1)
 *   short  liquidated when price rises by d                     log barrier ln(1 + d)
 * where L is the leverage and m the maintenance margin fraction. The short barrier is always closer in log
 * price than the long one, which a side blind formula cannot show.
 *
 * Two estimates, both under "no drift" unless a log drift is given:
 *   gaussianTouchProbability  closed form for Brownian motion with constant volatility (continuous monitoring)
 *   simulateExtremes          filtered historical simulation: GARCH(1,1) fitted to the audited returns, residuals
 *                             resampled from the sample itself (fat tails kept), the running minimum and maximum
 *                             of every path drawn exactly between steps with the Brownian bridge so that a
 *                             touch inside a bar is not missed
 *
 * Probabilities are decision weights under a stated model, not forecasts of an event. Pure: no I/O, no clock;
 * randomness only from the explicit seed.
 */

import { fitGarch11, garchFilter, standardize, MAX_FIT_RETURNS, MIN_FIT_RETURNS, type GarchFit } from "./garch";
import { makeResidualSampler, type TailModel } from "./evt";
import { normalCdf } from "./normal";
import { DAY_MS, isFiniteNumber, mulberry32, QuantError, requirePositive, type Side } from "./types";

export type Barrier =
  | { readonly state: "immediate" }
  | { readonly state: "unreachable" }
  | { readonly state: "level"; readonly log: number };

function checkSide(side: unknown): asserts side is Side {
  if (side !== "long" && side !== "short") throw new QuantError("side_invalid");
}

function checkLeverage(leverage: unknown): number {
  if (!isFiniteNumber(leverage) || !(leverage > 0)) throw new QuantError("leverage_invalid");
  return leverage;
}

function checkMargin(maintenanceMargin: unknown): number {
  if (maintenanceMargin === undefined) return 0;
  if (!isFiniteNumber(maintenanceMargin) || maintenanceMargin < 0 || maintenanceMargin >= 1) throw new QuantError("margin_invalid");
  return maintenanceMargin;
}

export function liquidationBarrier(side: Side, leverage: number, maintenanceMargin?: number): Barrier {
  checkSide(side);
  const l = checkLeverage(leverage);
  const m = checkMargin(maintenanceMargin);
  const distance = 1 / l - m;
  if (distance <= 0) return { state: "immediate" };
  if (side === "long") return distance >= 1 ? { state: "unreachable" } : { state: "level", log: Math.log(1 - distance) };
  return { state: "level", log: Math.log(1 + distance) };
}

export interface GaussianTouchInput {
  readonly side: Side;
  readonly leverage: number;
  readonly sigmaDaily: number;
  readonly horizonDays: number;
  readonly maintenanceMargin?: number;
  /** Drift of the log price per day. Default 0 (the median price does not move). */
  readonly logDriftDaily?: number;
}

/** Below this the variance underflows long before it means anything; a daily sigma of 1e-8 is already a flat market. */
const MIN_SIGMA_DAILY = 1e-8;

function checkSigma(sigmaDaily: unknown): number {
  if (!isFiniteNumber(sigmaDaily) || !(sigmaDaily > MIN_SIGMA_DAILY) || sigmaDaily >= 1) throw new QuantError("sigma_invalid");
  return sigmaDaily;
}

function checkHorizon(horizonDays: unknown): number {
  if (!isFiniteNumber(horizonDays) || !(horizonDays > 0)) throw new QuantError("horizon_invalid");
  return horizonDays;
}

export function gaussianTouchProbability(input: GaussianTouchInput): number {
  checkSide(input.side);
  const sigma = checkSigma(input.sigmaDaily);
  const days = checkHorizon(input.horizonDays);
  const mu = input.logDriftDaily ?? 0;
  if (!isFiniteNumber(mu)) throw new QuantError("drift_out_of_range");
  const barrier = liquidationBarrier(input.side, input.leverage, input.maintenanceMargin);
  if (barrier.state === "immediate") return 1;
  if (barrier.state === "unreachable") return 0;
  const b = barrier.log;
  const exponent = (2 * mu * b) / (sigma * sigma);
  if (Math.abs(exponent) > 600) throw new QuantError("drift_out_of_range");
  const s = sigma * Math.sqrt(days);
  const p = input.side === "long"
    ? normalCdf((b - mu * days) / s) + Math.exp(exponent) * normalCdf((b + mu * days) / s)
    : normalCdf((-b + mu * days) / s) + Math.exp(exponent) * normalCdf((-b - mu * days) / s);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

const MIN_PATHS = 100;
const MAX_PATHS = 50_000;
const MAX_WORK = 20_000_000;
const MAX_STEPS = 50_000;

export interface SimulationOptions {
  /** Log returns per bar, ascending, from audited consecutive bars. */
  readonly returns: readonly number[];
  readonly barMs: number;
  readonly horizonDays: number;
  /** Required: the only source of randomness. */
  readonly seed: number;
  /** Default 4000, between 100 and 50000. */
  readonly paths?: number;
  /** Starting daily volatility. Dynamic: the conditional level the paths start from (default: the filter's next variance). Static: the constant level. */
  readonly sigmaStartDaily?: number;
  /** GARCH(1,1) clustering when true (default), constant volatility when false. */
  readonly dynamic?: boolean;
  /**
   * Residual model. "empirical" (default) resamples the standardized residuals as they are; "evt" keeps the empirical
   * centre and replaces both tails by fitted generalized Pareto tails, so a residual larger than any observed can occur.
   * It falls back to "empirical" when the tails cannot be fitted; the sample says which one ran.
   */
  readonly tail?: TailModel;
}

export type ExtremeSample =
  | {
      readonly status: "ok";
      readonly paths: number;
      readonly steps: number;
      /** Lowest log price reached on each path, including inside bars. */
      readonly minLog: Float64Array;
      /** Highest log price reached on each path, including inside bars. */
      readonly maxLog: Float64Array;
      readonly sigmaStartDaily: number;
      readonly dynamic: boolean;
      readonly seed: number;
      readonly residualCount: number;
      /** The residual model that actually ran. */
      readonly tailModel: TailModel;
      readonly garch: GarchFit | null;
    }
  | { readonly status: "unavailable"; readonly reason: "too_few_returns" | "returns_invalid" | "sigma_zero" | "budget_exceeded" };

export function simulateExtremes(options: SimulationOptions): ExtremeSample {
  const barMs = requirePositive(options.barMs, "bar_invalid");
  const days = checkHorizon(options.horizonDays);
  if (!isFiniteNumber(options.seed)) throw new QuantError("option_invalid");
  const paths = options.paths ?? 4000;
  if (!Number.isInteger(paths) || paths < MIN_PATHS || paths > MAX_PATHS) throw new QuantError("option_invalid");
  const dynamic = options.dynamic ?? true;
  const barsPerDay = DAY_MS / barMs;
  const steps = Math.max(1, Math.round(days * barsPerDay));
  if (steps > MAX_STEPS || steps * paths > MAX_WORK) throw new QuantError("budget_exceeded");
  const startDaily = options.sigmaStartDaily === undefined ? null : checkSigma(options.sigmaStartDaily);

  const returns = options.returns;
  for (const r of returns) if (!isFiniteNumber(r)) return { status: "unavailable", reason: "returns_invalid" };
  if (returns.length < MIN_FIT_RETURNS) return { status: "unavailable", reason: "too_few_returns" };

  // The fit, the filter and the residual pool all use the same window: the newest MAX_FIT_RETURNS returns.
  const window = returns.length > MAX_FIT_RETURNS ? returns.slice(returns.length - MAX_FIT_RETURNS) : returns;
  let sum2 = 0;
  for (const r of window) sum2 += r * r;
  const longRun = sum2 / window.length;
  if (!(longRun > 0)) return { status: "unavailable", reason: "sigma_zero" };

  let garch: GarchFit | null = null;
  let residuals: number[] | null;
  let startVariance: number;
  if (dynamic) {
    garch = fitGarch11(window);
    const filter = garch === null ? null : garchFilter(window, garch, garch.longRunVariance);
    residuals = filter === null ? null : standardize(filter.residuals);
    startVariance = startDaily === null ? (filter?.nextVariance ?? longRun) : (startDaily * startDaily) / barsPerDay;
  } else {
    residuals = standardize(window);
    startVariance = startDaily === null ? longRun : (startDaily * startDaily) / barsPerDay;
  }
  if (residuals === null) return { status: "unavailable", reason: "sigma_zero" };

  const sampler = makeResidualSampler(residuals, options.tail ?? "empirical");
  const residualCount = residuals.length;
  const omega = garch?.omega ?? 0;
  const alpha = garch?.alpha ?? 0;
  const beta = garch?.beta ?? 0;
  const random = mulberry32(options.seed);
  const minLog = new Float64Array(paths);
  const maxLog = new Float64Array(paths);

  for (let p = 0; p < paths; p += 1) {
    let x = 0;
    let lo = 0;
    let hi = 0;
    let v = startVariance;
    for (let t = 0; t < steps; t += 1) {
      const z = sampler.draw(random);
      const r = Math.sqrt(v) * z;
      const next = x + r;
      // Extremes of the Brownian bridge from x to next with the step variance v (inverse cdf draws).
      const u1 = Math.max(1e-12, random());
      const u2 = Math.max(1e-12, random());
      const spread = r * r;
      const top = (x + next + Math.sqrt(spread - 2 * v * Math.log(u1))) / 2;
      const bottom = (x + next - Math.sqrt(spread - 2 * v * Math.log(u2))) / 2;
      if (top > hi) hi = top;
      if (bottom < lo) lo = bottom;
      x = next;
      if (dynamic) v = omega + alpha * spread + beta * v;
    }
    minLog[p] = lo;
    maxLog[p] = hi;
  }

  return {
    status: "ok",
    paths,
    steps,
    minLog,
    maxLog,
    sigmaStartDaily: Math.sqrt(startVariance * barsPerDay),
    dynamic,
    seed: options.seed,
    residualCount,
    tailModel: sampler.model,
    garch,
  };
}

export interface SimulatedTouch {
  readonly probability: number;
  /** Binomial standard error, floored at one path so a zero count still shows the resolution. */
  readonly stdError: number;
}

export function touchFromExtremes(sample: Extract<ExtremeSample, { status: "ok" }>, side: Side, leverage: number, maintenanceMargin?: number): SimulatedTouch {
  const barrier = liquidationBarrier(side, leverage, maintenanceMargin);
  if (barrier.state === "immediate") return { probability: 1, stdError: 0 };
  if (barrier.state === "unreachable") return { probability: 0, stdError: 0 };
  let hits = 0;
  if (side === "long") {
    for (let i = 0; i < sample.paths; i += 1) if ((sample.minLog[i] as number) <= barrier.log) hits += 1;
  } else {
    for (let i = 0; i < sample.paths; i += 1) if ((sample.maxLog[i] as number) >= barrier.log) hits += 1;
  }
  const probability = hits / sample.paths;
  return { probability, stdError: Math.sqrt(Math.max(probability * (1 - probability), 1 / sample.paths) / sample.paths) };
}
