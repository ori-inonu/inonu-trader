/**
 * The stored model (INT-3.6, ML-5): everything needed to score one row later, as plain data that survives JSON: the column
 * preparation, the model, the isotonic calibration, the trading threshold and where the rows came from. Training mirrors the last
 * block of the walk-forward: the final slice of time is the validation block that stops the trees, fits the calibration and sets the
 * threshold, and the rows before it (purged by the horizon and an embargo) are the fit.
 *
 * A model is only ever USED when its card says it was promoted by the gate; this module trains and scores, the gate decides.
 */
import type { Dataset, Side } from "./dataset";
import type { GbdtModel } from "./gbdt";
import { applyIsotonic, fitIsotonic, type Isotonic } from "./isotonic";
import type { LogisticModel } from "./logistic";
import type { Prep } from "./prep";
import { fitModel, predictorOf, quantile, type ModelKind, type WalkOptions } from "./walkforward";
import type { Horizon } from "../../outcomes/types";

export interface Artifact {
  readonly v: 1;
  readonly kind: ModelKind;
  readonly side: Side;
  readonly horizon: Horizon;
  readonly names: readonly string[];
  readonly prep: Prep;
  readonly model: LogisticModel | GbdtModel;
  readonly iso: Isotonic;
  /** Trade when the calibrated probability is at or above this. From the validation block, never from a test. */
  readonly tau: number;
  readonly fromMs: number;
  readonly toMs: number;
  readonly rows: number;
  /** The share of rows that ended above zero after costs, in the rows it was fitted on: the base rate to compare any probability with. */
  readonly baseRate: number;
}

export type TrainOptions = Pick<WalkOptions, "horizonMs" | "embargoMs" | "validationShare" | "thresholdQuantile" | "minTrain" | "minValidation" | "l2" | "gbdt" | "seed">;

export function trainArtifact(dataset: Dataset, kind: ModelKind, o: TrainOptions): Artifact | null {
  const embargo = o.embargoMs ?? o.horizonMs;
  const share = o.validationShare ?? 0.2;
  const samples = dataset.samples;
  if (samples.length === 0) return null;
  const start = samples[0]!.t;
  const end = samples[samples.length - 1]!.t;
  const cut = start + (1 - share) * (end - start);
  const validation = samples.filter((s) => s.t >= cut);
  const fit = samples.filter((s) => s.t + o.horizonMs + embargo <= cut);
  if (fit.length < (o.minTrain ?? 200) || validation.length < (o.minValidation ?? 50) || fit.every((s) => s.y === fit[0]!.y)) return null;
  const fitted = fitModel(kind, fit, validation, dataset.names, o);
  const raw = validation.map((s) => fitted.predict(s.x));
  const iso = fitIsotonic(raw, validation.map((s) => s.y));
  const calibrated = raw.map((p) => applyIsotonic(iso, p)).sort((a, b) => a - b);
  return {
    v: 1,
    kind,
    side: dataset.side,
    horizon: dataset.horizon,
    names: dataset.names,
    prep: fitted.prep,
    model: fitted.model,
    iso,
    tau: quantile(calibrated, o.thresholdQuantile ?? 0.8),
    fromMs: start,
    toMs: end,
    rows: samples.length,
    baseRate: fit.reduce((s, x) => s + x.y, 0) / fit.length,
  };
}

/** The calibrated probability that this side ends above zero after costs at the horizon. */
export function scoreArtifact(a: Artifact, row: ArrayLike<number>): number {
  return applyIsotonic(a.iso, predictorOf(a.prep, a.model)(row));
}

export interface Contribution {
  readonly feature: string;
  /** How much the probability moves when this column is replaced by its usual value: positive means it was pushing the probability up. */
  readonly delta: number;
}

/**
 * The columns that moved the probability most for this row, by ablation: each column in turn is set to the training median (and a
 * missing value to missing) and the probability is recomputed. Honest about being a local, one at a time reading, not a causal one.
 */
export function explainArtifact(a: Artifact, row: ArrayLike<number>, max = 3): Contribution[] {
  const predict = predictorOf(a.prep, a.model);
  const base = applyIsotonic(a.iso, predict(row));
  const copy = Float64Array.from(row);
  const out: Contribution[] = [];
  a.prep.kept.forEach((j, c) => {
    const keep = copy[j]!;
    copy[j] = a.prep.median[c]!;
    out.push({ feature: a.prep.names[c]!, delta: Math.round((base - applyIsotonic(a.iso, predict(copy))) * 1e4) / 1e4 });
    copy[j] = keep;
  });
  return out.filter((x) => x.delta !== 0).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || (x.feature < y.feature ? -1 : 1)).slice(0, max);
}
