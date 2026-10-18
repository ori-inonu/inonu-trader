/**
 * Portfolio risk from valued positions and aligned return series: concentration, Ledoit and Wolf (2004) shrunk
 * covariance, volatility, risk contributions, diversification ratio, VaR and expected shortfall (normal and
 * historical, on overlapping horizon sums), maximum drawdown and a stated scenario loss.
 *
 * Unknown stays unknown: a position without a value is excluded and named, never counted as zero; a position
 * without usable returns drops out of the risk and the rest is renormalised, with the share of value that the
 * risk actually covers reported. Returns are per bar log returns and the portfolio return is their weighted
 * sum at constant weights, which is exact to first order for the small per bar moves of intraday data.
 *
 * Pure: no I/O, no clock, no randomness.
 */

import { normalQuantile } from "./normal";
import { historicalVarEs } from "./tail";
import { DAY_MS, isFiniteNumber, QuantError, requirePositive } from "./types";

export type ExclusionReason = "value_unknown" | "value_invalid" | "duplicate_key";

export interface PositionInput {
  readonly key: string;
  /** Value in USD, or null when it is not known. */
  readonly valueUsd: number | null;
}

export interface ConcentrationReport {
  /** Valued positions by weight, largest first. */
  readonly weights: readonly { readonly key: string; readonly weight: number }[];
  /** Sum of the valid values, or null when there is no valid value at all. */
  readonly totalValueUsd: number | null;
  readonly hhi: number | null;
  readonly effectiveN: number | null;
  readonly topShare: number | null;
  readonly top3Share: number | null;
  readonly excluded: readonly { readonly key: string; readonly reason: ExclusionReason }[];
  /** True when no position was excluded. */
  readonly complete: boolean;
}

interface Valued {
  readonly key: string;
  readonly value: number;
}

function classify(positions: readonly PositionInput[]): { valued: Valued[]; excluded: { key: string; reason: ExclusionReason }[] } {
  const valued: Valued[] = [];
  const excluded: { key: string; reason: ExclusionReason }[] = [];
  const seen = new Set<string>();
  for (const position of positions) {
    if (seen.has(position.key)) { excluded.push({ key: position.key, reason: "duplicate_key" }); continue; }
    seen.add(position.key);
    if (position.valueUsd === null) { excluded.push({ key: position.key, reason: "value_unknown" }); continue; }
    if (!isFiniteNumber(position.valueUsd) || position.valueUsd < 0) { excluded.push({ key: position.key, reason: "value_invalid" }); continue; }
    valued.push({ key: position.key, value: position.valueUsd });
  }
  return { valued, excluded };
}

export function concentration(positions: readonly PositionInput[]): ConcentrationReport {
  const { valued, excluded } = classify(positions);
  const total = valued.length === 0 ? null : valued.reduce((s, p) => s + p.value, 0);
  if (total === null || !(total > 0)) {
    return { weights: [], totalValueUsd: total, hhi: null, effectiveN: null, topShare: null, top3Share: null, excluded, complete: excluded.length === 0 };
  }
  const weights = valued.map((p) => ({ key: p.key, weight: p.value / total })).sort((a, b) => b.weight - a.weight);
  const hhi = weights.reduce((s, w) => s + w.weight * w.weight, 0);
  return {
    weights,
    totalValueUsd: total,
    hhi,
    effectiveN: 1 / hhi,
    topShare: weights[0]!.weight,
    top3Share: weights.slice(0, 3).reduce((s, w) => s + w.weight, 0),
    excluded,
    complete: excluded.length === 0,
  };
}

export interface ShrunkCovariance {
  readonly cov: number[][];
  /** Weight put on the scaled identity target, in [0, 1]. */
  readonly shrinkage: number;
  readonly observations: number;
  readonly assets: number;
}

/**
 * Ledoit and Wolf (2004) linear shrinkage of the sample covariance (divisor n) toward mu * I with mu the mean
 * variance. Rows are observations, columns are assets. Null for fewer than two observations, ragged or non finite input.
 */
export function ledoitWolf(matrix: readonly (readonly number[])[]): ShrunkCovariance | null {
  const n = matrix.length;
  if (n < 2) return null;
  const p = matrix[0]!.length;
  if (p < 1) return null;
  for (const row of matrix) {
    if (row.length !== p) return null;
    for (const v of row) if (!isFiniteNumber(v)) return null;
  }
  const mean = new Array<number>(p).fill(0);
  for (const row of matrix) for (let j = 0; j < p; j += 1) mean[j]! += row[j]! / n;
  const centered = matrix.map((row) => row.map((v, j) => v - mean[j]!));
  const S: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (const x of centered) for (let i = 0; i < p; i += 1) for (let j = 0; j < p; j += 1) S[i]![j]! += (x[i]! * x[j]!) / n;
  const mu = S.reduce((s, row, i) => s + row[i]!, 0) / p;
  let d2 = 0;
  for (let i = 0; i < p; i += 1) for (let j = 0; j < p; j += 1) d2 += (S[i]![j]! - (i === j ? mu : 0)) ** 2;
  d2 /= p;
  let shrinkage = 0;
  if (p > 1 && d2 > 0) {
    let b2bar = 0;
    for (const x of centered) for (let i = 0; i < p; i += 1) for (let j = 0; j < p; j += 1) b2bar += (x[i]! * x[j]! - S[i]![j]!) ** 2;
    b2bar /= n * n * p;
    shrinkage = Math.min(b2bar, d2) / d2;
  }
  const cov = S.map((row, i) => row.map((v, j) => shrinkage * (i === j ? mu : 0) + (1 - shrinkage) * v));
  return { cov, shrinkage, observations: n, assets: p };
}

export interface AssetReturnsInput {
  readonly key: string;
  /** Per bar log returns on the common grid, or null when not available. */
  readonly returns: readonly number[] | null;
}

export type RiskExclusionReason = "no_returns" | "returns_length_mismatch" | "returns_invalid";

export interface PortfolioRisk {
  readonly status: "ok";
  readonly barMs: number;
  readonly observations: number;
  readonly horizonBars: number;
  readonly assets: readonly { readonly key: string; readonly weight: number; readonly sigmaDaily: number }[];
  /** Share of the valued portfolio that the risk covers. */
  readonly riskedShare: number;
  readonly excluded: readonly { readonly key: string; readonly reason: RiskExclusionReason }[];
  readonly sigmaBar: number;
  readonly sigmaDaily: number;
  readonly shrinkage: number;
  /** Weighted average asset volatility over portfolio volatility: 1 means no diversification. */
  readonly diversificationRatio: number | null;
  /** Share of portfolio variance per asset; they sum to 1 and a negative share offsets risk. */
  readonly contributions: readonly { readonly key: string; readonly share: number }[];
  /** Zero mean normal loss over the horizon, as a fraction of the portfolio value. */
  readonly normal: { readonly var95: number; readonly var99: number; readonly es99: number };
  /** Historical loss over overlapping horizon sums; null when the tail has fewer than three points. */
  readonly historical: { readonly var95: number | null; readonly es95: number | null; readonly var99: number | null; readonly es99: number | null };
  /** Historical over normal expected shortfall at 99 percent: above 1 means the normal model understates the tail. */
  readonly tailRatioEs99: number | null;
  readonly maxDrawdown: number;
}

export type PortfolioRiskResult = PortfolioRisk | { readonly status: "unavailable"; readonly reason: "no_value" | "no_returns" | "too_few_observations" };

export interface PortfolioInput {
  readonly positions: readonly PositionInput[];
  readonly returns: readonly AssetReturnsInput[];
  readonly barMs: number;
  /** Bars in the loss horizon. Default one day. */
  readonly horizonBars?: number;
  /** Observations below which the risk is unavailable. Default 30, at least 10. */
  readonly minObservations?: number;
}

export interface PortfolioAnalysis {
  readonly concentration: ConcentrationReport;
  readonly risk: PortfolioRiskResult;
}

function modalLength(lengths: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const length of lengths) counts.set(length, (counts.get(length) ?? 0) + 1);
  let best = lengths[0] as number;
  for (const [length, count] of counts) if (count > (counts.get(best) as number) || (count === counts.get(best) && length > best)) best = length;
  return best;
}

export function analyzePortfolio(input: PortfolioInput): PortfolioAnalysis {
  const barMs = requirePositive(input.barMs, "bar_invalid");
  const barsPerDay = DAY_MS / barMs;
  const horizonBars = input.horizonBars ?? Math.max(1, Math.round(barsPerDay));
  const minObservations = input.minObservations ?? 30;
  if (!Number.isInteger(horizonBars) || horizonBars < 1 || !Number.isInteger(minObservations) || minObservations < 10) throw new QuantError("option_invalid");

  const conc = concentration(input.positions);
  const total = conc.totalValueUsd;
  if (total === null || !(total > 0)) return { concentration: conc, risk: { status: "unavailable", reason: "no_value" } };

  const weightOf = new Map(conc.weights.map((w) => [w.key, w.weight]));
  const returnsOf = new Map(input.returns.map((r) => [r.key, r.returns]));
  const live = conc.weights.filter((w) => w.weight > 0).map((w) => w.key);
  // Keep the caller's order of the positions for reporting.
  const ordered = input.positions.map((p) => p.key).filter((key, i, all) => all.indexOf(key) === i && live.includes(key));

  const excluded: { key: string; reason: RiskExclusionReason }[] = [];
  const candidates = ordered.filter((key) => {
    const series = returnsOf.get(key);
    if (series === null || series === undefined) { excluded.push({ key, reason: "no_returns" }); return false; }
    return true;
  });
  if (candidates.length === 0) return { concentration: conc, risk: { status: "unavailable", reason: "no_returns" } };

  const length = modalLength(candidates.map((key) => (returnsOf.get(key) as readonly number[]).length));
  const kept = candidates.filter((key) => {
    const series = returnsOf.get(key) as readonly number[];
    if (series.length !== length) { excluded.push({ key, reason: "returns_length_mismatch" }); return false; }
    if (series.some((v) => !isFiniteNumber(v))) { excluded.push({ key, reason: "returns_invalid" }); return false; }
    return true;
  });
  // Report exclusions in the order of the positions.
  excluded.sort((a, b) => ordered.indexOf(a.key) - ordered.indexOf(b.key));
  if (kept.length === 0) return { concentration: conc, risk: { status: "unavailable", reason: "no_returns" } };
  if (length < minObservations) return { concentration: conc, risk: { status: "unavailable", reason: "too_few_observations" } };

  const keptWeight = kept.reduce((s, key) => s + (weightOf.get(key) as number), 0);
  const w = kept.map((key) => (weightOf.get(key) as number) / keptWeight);
  const matrix = Array.from({ length }, (_, t) => kept.map((key) => (returnsOf.get(key) as readonly number[])[t] as number));
  const lw = ledoitWolf(matrix) as ShrunkCovariance;
  const cov = lw.cov;
  const covW = cov.map((row) => row.reduce((s, v, j) => s + v * (w[j] as number), 0));
  const variance = w.reduce((s, wi, i) => s + wi * (covW[i] as number), 0);
  if (!(variance > 0)) return { concentration: conc, risk: { status: "unavailable", reason: "no_returns" } };
  const sigmaBar = Math.sqrt(variance);
  const assetSigmaBar = cov.map((row, i) => Math.sqrt(row[i] as number));
  const weightedSigma = w.reduce((s, wi, i) => s + wi * (assetSigmaBar[i] as number), 0);

  const portfolioReturns = matrix.map((row) => row.reduce((s, v, j) => s + v * (w[j] as number), 0));
  const rolling: number[] = [];
  if (portfolioReturns.length >= horizonBars) {
    let window = 0;
    for (let t = 0; t < portfolioReturns.length; t += 1) {
      window += portfolioReturns[t] as number;
      if (t >= horizonBars) window -= portfolioReturns[t - horizonBars] as number;
      if (t >= horizonBars - 1) rolling.push(window);
    }
  }
  const h95 = rolling.length ? historicalVarEs(rolling, 0.95) : { var: null, es: null };
  const h99 = rolling.length ? historicalVarEs(rolling, 0.99) : { var: null, es: null };

  const sigmaH = sigmaBar * Math.sqrt(horizonBars);
  const z95 = normalQuantile(0.95);
  const z99 = normalQuantile(0.99);
  const normalEs99 = (sigmaH * Math.exp(-0.5 * z99 * z99)) / Math.sqrt(2 * Math.PI) / 0.01;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of portfolioReturns) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const drawdown = 1 - Math.exp(cumulative - peak);
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    concentration: conc,
    risk: {
      status: "ok",
      barMs,
      observations: length,
      horizonBars,
      assets: kept.map((key, i) => ({ key, weight: w[i] as number, sigmaDaily: (assetSigmaBar[i] as number) * Math.sqrt(barsPerDay) })),
      riskedShare: keptWeight,
      excluded,
      sigmaBar,
      sigmaDaily: sigmaBar * Math.sqrt(barsPerDay),
      shrinkage: lw.shrinkage,
      diversificationRatio: weightedSigma / sigmaBar,
      contributions: kept.map((key, i) => ({ key, share: ((w[i] as number) * (covW[i] as number)) / variance })),
      normal: { var95: z95 * sigmaH, var99: z99 * sigmaH, es99: normalEs99 },
      historical: { var95: h95.var, es95: h95.es, var99: h99.var, es99: h99.es },
      tailRatioEs99: h99.es !== null && normalEs99 > 0 ? h99.es / normalEs99 : null,
      maxDrawdown,
    },
  };
}

export interface ScenarioLoss {
  /** Loss as a fraction of the valued portfolio, positive when the portfolio loses. */
  readonly lossFraction: number | null;
  readonly lossUsd: number | null;
  /** Valued positions the scenario says nothing about; they contribute no loss. */
  readonly unshocked: readonly string[];
  readonly excluded: readonly { readonly key: string; readonly reason: ExclusionReason }[];
}

/** Loss of a stated scenario: each shock is a price change fraction strictly above -1. */
export function scenarioLoss(positions: readonly PositionInput[], shocks: Readonly<Record<string, number>>): ScenarioLoss {
  for (const shock of Object.values(shocks)) if (!isFiniteNumber(shock) || !(shock > -1)) throw new QuantError("shock_invalid");
  const conc = concentration(positions);
  if (conc.totalValueUsd === null || !(conc.totalValueUsd > 0)) return { lossFraction: null, lossUsd: null, unshocked: [], excluded: conc.excluded };
  let loss = 0;
  const unshocked: string[] = [];
  for (const { key, weight } of conc.weights) {
    if (weight <= 0) continue;
    const shock = Object.hasOwn(shocks, key) ? (shocks[key] as number) : null;
    if (shock === null) unshocked.push(key);
    else loss -= weight * shock;
  }
  return { lossFraction: loss, lossUsd: loss * conc.totalValueUsd, unshocked, excluded: conc.excluded };
}
