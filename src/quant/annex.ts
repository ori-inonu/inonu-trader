/**
 * The quant annex: the numerical evidence the System One brief can carry next to the envelope figures.
 * It describes the data (quality grade, volatility band, tail shape, clustering) and gives two touch
 * probabilities per candidate by side (closed form and filtered simulation). It never ranks, selects or
 * recommends a candidate and never changes eligibility: the envelope stays the wall and Jev stays the
 * decider. When the data cannot support a number the annex says so and carries none.
 *
 * Pure: no I/O, no clock (the caller passes `nowMs`), randomness only from the explicit seed.
 */

import { auditCandles, type CandleGrade } from "./candles";
import { logReturnsOf } from "./stats";
import { tailProfile } from "./tail";
import { gaussianTouchProbability, simulateExtremes, touchFromExtremes, type ExtremeSample } from "./touch";
import { isFiniteNumber, QuantError, requirePositive, type Candle, type Side } from "./types";
import { MIN_BAND_CANDLES, sigmaBand, type VolatilityRegime } from "./volatility";

export const QUANT_ANNEX_SCHEMA = 1;

export interface AnnexCandidateInput {
  readonly id: string;
  readonly side: Side;
  readonly leverage: number;
}

export interface QuantAnnexInput {
  /** Raw bars as read, in any order; the audit decides what is usable. */
  readonly candles: readonly Candle[];
  readonly barMs: number;
  readonly nowMs: number;
  readonly horizonDays: number;
  readonly candidates: readonly AnnexCandidateInput[];
  readonly maintenanceMargin?: number;
  readonly seed: number;
  readonly paths?: number;
}

export interface AnnexQuality {
  readonly grade: CandleGrade;
  readonly coverage: number;
  readonly usable: number;
  readonly fresh: boolean;
  /** Issue kinds that occurred, with their counts. */
  readonly issues: Readonly<Record<string, number>>;
}

export interface AnnexCandidate {
  readonly id: string;
  /** Closed form Brownian motion with the side's log barrier and the band's central sigma. */
  readonly sideAwareTouch: number | null;
  /** Filtered historical simulation (GARCH(1,1) clustering, residuals bootstrapped, bridge corrected). */
  readonly simulatedTouch: number | null;
  readonly simulatedStdError: number | null;
}

export type QuantAnnex =
  | {
      readonly schemaVersion: typeof QUANT_ANNEX_SCHEMA;
      readonly status: "ok";
      readonly horizonDays: number;
      readonly quality: AnnexQuality;
      readonly sigma: {
        readonly low: number | null;
        readonly central: number | null;
        readonly high: number | null;
        readonly dispersion: number | null;
        readonly regime: VolatilityRegime | null;
        readonly tailRatio: number | null;
        readonly recentRatio: number | null;
      };
      readonly tail: {
        readonly returns: number;
        readonly excessKurtosis: number | null;
        readonly hillIndex: number | null;
        readonly es99: number | null;
        readonly heavyTailed: boolean | null;
      };
      /** GARCH(1,1) fit. At the edge of the search grid the optimum may lie beyond it, so the half life is withheld. */
      readonly clustering: { readonly alpha: number; readonly beta: number; readonly persistence: number; readonly halfLifeBars: number | null; readonly atBoundary: boolean } | null;
      readonly simulation: { readonly paths: number; readonly steps: number; readonly seed: number; readonly sigmaStartDaily: number } | null;
      /** Why the simulation did not run, or null when it did. The closed form is still present. */
      readonly simulationSkipped: "too_few_returns" | "returns_invalid" | "sigma_zero" | "budget_exceeded" | null;
      readonly candidates: readonly AnnexCandidate[];
    }
  | {
      readonly schemaVersion: typeof QUANT_ANNEX_SCHEMA;
      readonly status: "unavailable";
      readonly reason: "too_few_candles" | "stale" | "sigma_unknown";
      readonly quality: AnnexQuality;
    };

const round = (value: number | null, decimals: number): number | null => {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function buildQuantAnnex(input: QuantAnnexInput): QuantAnnex {
  requirePositive(input.barMs, "bar_invalid");
  if (!isFiniteNumber(input.horizonDays) || !(input.horizonDays > 0)) throw new QuantError("horizon_invalid");
  if (!isFiniteNumber(input.seed)) throw new QuantError("option_invalid");
  for (const candidate of input.candidates) {
    if (typeof candidate.id !== "string" || (candidate.side !== "long" && candidate.side !== "short")) throw new QuantError("side_invalid");
    requirePositive(candidate.leverage, "leverage_invalid");
  }

  const audit = auditCandles(input.candles, input.barMs, input.nowMs);
  const quality: AnnexQuality = {
    grade: audit.grade,
    coverage: round(audit.coverage, 6) as number,
    usable: audit.usable.length,
    fresh: audit.fresh,
    issues: Object.fromEntries(Object.entries(audit.counts).filter(([, count]) => count > 0)),
  };
  if (audit.usable.length < MIN_BAND_CANDLES) return { schemaVersion: QUANT_ANNEX_SCHEMA, status: "unavailable", reason: "too_few_candles", quality };
  if (!audit.fresh) return { schemaVersion: QUANT_ANNEX_SCHEMA, status: "unavailable", reason: "stale", quality };

  const band = sigmaBand(audit.usable, input.barMs);
  if (band.central === null) return { schemaVersion: QUANT_ANNEX_SCHEMA, status: "unavailable", reason: "sigma_unknown", quality };

  const returns = logReturnsOf(audit.usable.map((c) => c.close)) as number[];
  const tail = tailProfile(returns);
  // An evidence layer must never suppress a cycle: a simulation over the work budget degrades to the closed form.
  let sample: ExtremeSample;
  try {
    sample = simulateExtremes({ returns, barMs: input.barMs, horizonDays: input.horizonDays, seed: input.seed, ...(input.paths === undefined ? {} : { paths: input.paths }) });
  } catch (error) {
    if (!(error instanceof QuantError) || error.code !== "budget_exceeded") throw error;
    sample = { status: "unavailable", reason: "budget_exceeded" };
  }
  const closedFormUsable = band.central < 1;

  const candidates: AnnexCandidate[] = input.candidates.map((candidate) => {
    const sideAware = closedFormUsable
      ? gaussianTouchProbability({ side: candidate.side, leverage: candidate.leverage, sigmaDaily: band.central as number, horizonDays: input.horizonDays, ...(input.maintenanceMargin === undefined ? {} : { maintenanceMargin: input.maintenanceMargin }) })
      : null;
    const simulated = sample.status === "ok" ? touchFromExtremes(sample, candidate.side, candidate.leverage, input.maintenanceMargin) : null;
    return {
      id: candidate.id,
      sideAwareTouch: round(sideAware, 6),
      simulatedTouch: simulated === null ? null : round(simulated.probability, 6),
      simulatedStdError: simulated === null ? null : round(simulated.stdError, 6),
    };
  });

  return {
    schemaVersion: QUANT_ANNEX_SCHEMA,
    status: "ok",
    horizonDays: input.horizonDays,
    quality,
    sigma: {
      low: round(band.low, 6),
      central: round(band.central, 6),
      high: round(band.high, 6),
      dispersion: round(band.dispersion, 4),
      regime: band.regime,
      tailRatio: round(band.tailRatio, 3),
      recentRatio: round(band.recentRatio, 3),
    },
    tail: {
      returns: returns.length,
      excessKurtosis: round(tail.excessKurtosis, 3),
      hillIndex: round(tail.hill, 3),
      es99: round(tail.es99, 6),
      heavyTailed: tail.heavyTailed,
    },
    clustering: sample.status === "ok" && sample.garch !== null
      ? { alpha: sample.garch.alpha, beta: sample.garch.beta, persistence: round(sample.garch.persistence, 4) as number, halfLifeBars: sample.garch.atBoundary ? null : round(sample.garch.halfLifeBars, 2), atBoundary: sample.garch.atBoundary }
      : null,
    simulation: sample.status === "ok"
      ? { paths: sample.paths, steps: sample.steps, seed: sample.seed, sigmaStartDaily: round(sample.sigmaStartDaily, 6) as number }
      : null,
    simulationSkipped: sample.status === "ok" ? null : sample.reason,
    candidates,
  };
}
