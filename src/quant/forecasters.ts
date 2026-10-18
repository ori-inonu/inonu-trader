/**
 * The touch probability forecasters that the calibration harness compares. Each one is built from the
 * bars up to the start time only, then answers for any side and adverse price move.
 *
 *   envelope      the production formula (src/policy/envelope.ts) fed by the production sigma
 *                 (src/system-one/volatility.ts): close to close, side blind, linear distance
 *   side-aware    closed form Brownian motion with the log barrier of each side, sigma from the band
 *   fhs           filtered historical simulation (GARCH(1,1) + bootstrapped residuals + bridge)
 *
 * Pure: no I/O, no clock; randomness only through the seed the harness passes in.
 */

import { touchLiquidationProbability } from "../policy/envelope";
import { realizedVolatility } from "../system-one/volatility";
import { sigmaBand } from "./volatility";
import { logReturnsOf } from "./stats";
import type { TailModel } from "./evt";
import { gaussianTouchProbability, simulateExtremes, touchFromExtremes } from "./touch";
import type { Candle, Side } from "./types";

export interface PrepareContext {
  readonly barMs: number;
  readonly horizonDays: number;
  readonly seed: number;
}

/** Probability that the position is liquidated by an adverse price move of `distance` (a fraction, for example 0.2). */
export type Predictor = (side: Side, distance: number) => number;

export interface Forecaster {
  readonly name: string;
  /** Null when the history cannot support a forecast. */
  prepare(train: readonly Candle[], context: PrepareContext): Predictor | null;
}

const usableSigma = (sigma: number | null): sigma is number => sigma !== null && Number.isFinite(sigma) && sigma > 0 && sigma < 1;

export function envelopeForecaster(): Forecaster {
  return {
    name: "envelope",
    prepare(train, { barMs, horizonDays }) {
      const sigma = realizedVolatility(train.map((c) => c.close), barMs).sigmaDaily;
      if (!usableSigma(sigma)) return null;
      return (_side, distance) => touchLiquidationProbability(1 / distance, sigma, horizonDays);
    },
  };
}

export function sideAwareForecaster(pick: "central" | "high"): Forecaster {
  return {
    name: pick === "central" ? "side-aware" : "side-aware-high",
    prepare(train, { barMs, horizonDays }) {
      const band = sigmaBand(train, barMs);
      const sigma = pick === "central" ? band.central : band.high;
      if (!usableSigma(sigma)) return null;
      return (side, distance) => gaussianTouchProbability({ side, leverage: 1 / distance, sigmaDaily: sigma, horizonDays });
    },
  };
}

export function filteredSimulationForecaster(paths = 3000, tail: TailModel = "empirical"): Forecaster {
  return {
    name: tail === "evt" ? "fhs-evt" : "fhs",
    prepare(train, { barMs, horizonDays, seed }) {
      const returns = logReturnsOf(train.map((c) => c.close));
      if (returns === null) return null;
      const sample = simulateExtremes({ returns, barMs, horizonDays, seed, paths, tail });
      if (sample.status !== "ok") return null;
      return (side, distance) => touchFromExtremes(sample, side, 1 / distance).probability;
    },
  };
}
