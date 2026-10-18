/**
 * Calibration of probability forecasts against what actually happened, and a walk forward harness that
 * cannot look ahead. Scores are the proper ones: Brier and log loss (lower is better), plus a reliability
 * table. Paired comparisons use a moving block bootstrap over start times because overlapping horizons
 * make neighbouring events dependent.
 *
 * Pure: no I/O, no clock; the only randomness is the explicit bootstrap seed.
 */

import type { Forecaster } from "./forecasters";
import { candleDefect } from "./candles";
import { quantile } from "./stats";
import { DAY_MS, isFiniteNumber, mulberry32, QuantError, requirePositive, type Candle, type Side } from "./types";

export interface ForecastRecord {
  /** Forecast probability of the event. */
  readonly p: number;
  /** 1 when the event happened, 0 when not. */
  readonly hit: 0 | 1;
}

const DEFAULT_LOG_FLOOR = 1e-4;
const DEFAULT_EDGES: readonly number[] = Object.freeze([0, 0.01, 0.03, 0.1, 0.3, 0.6, 1]);

function validProbability(p: number): boolean {
  return isFiniteNumber(p) && p >= 0 && p <= 1;
}

export function brierScore(records: readonly ForecastRecord[]): number | null {
  if (records.length === 0) return null;
  let sum = 0;
  for (const r of records) {
    if (!validProbability(r.p)) return null;
    sum += (r.p - r.hit) ** 2;
  }
  return sum / records.length;
}

function lossOne(p: number, hit: 0 | 1, floor: number): number {
  const clipped = Math.min(1 - floor, Math.max(floor, p));
  return -(hit === 1 ? Math.log(clipped) : Math.log(1 - clipped));
}

export function logLoss(records: readonly ForecastRecord[], floor: number = DEFAULT_LOG_FLOOR): number | null {
  if (!isFiniteNumber(floor) || !(floor > 0) || !(floor < 0.5)) throw new QuantError("option_invalid");
  if (records.length === 0) return null;
  let sum = 0;
  for (const r of records) {
    if (!validProbability(r.p)) return null;
    sum += lossOne(r.p, r.hit, floor);
  }
  return sum / records.length;
}

export interface ReliabilityBin {
  readonly lo: number;
  readonly hi: number;
  readonly n: number;
  readonly meanForecast: number | null;
  readonly hitRate: number | null;
}

/** Bins are [lo, hi) except the last, which is [lo, hi]. */
export function reliability(records: readonly ForecastRecord[], edges: readonly number[] = DEFAULT_EDGES): ReliabilityBin[] {
  if (edges.length < 2 || edges.some((e, i) => !isFiniteNumber(e) || (i > 0 && !(e > (edges[i - 1] as number))))) throw new QuantError("option_invalid");
  const bins = edges.slice(1).map((hi, i) => ({ lo: edges[i] as number, hi, n: 0, sumP: 0, sumHit: 0 }));
  for (const r of records) {
    if (!validProbability(r.p)) continue;
    let k = bins.findIndex((b, i) => r.p >= b.lo && (r.p < b.hi || (i === bins.length - 1 && r.p <= b.hi)));
    if (k < 0) k = bins.length - 1;
    const bin = bins[k] as (typeof bins)[number];
    bin.n += 1;
    bin.sumP += r.p;
    bin.sumHit += r.hit;
  }
  return bins.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, meanForecast: b.n ? b.sumP / b.n : null, hitRate: b.n ? b.sumHit / b.n : null }));
}

export interface BootstrapOptions {
  /** Consecutive start times kept together, at least the horizon in start steps. */
  readonly blockLength: number;
  readonly resamples: number;
  readonly seed: number;
  /** Two sided confidence level, for example 0.95. */
  readonly level: number;
}

export interface PairedDifference {
  readonly n: number;
  /** Mean of a - b. Positive means b has the lower loss, so b is better. */
  readonly meanDiff: number;
  readonly ciLow: number;
  readonly ciHigh: number;
}

export function pairedBlockBootstrap(a: readonly number[], b: readonly number[], options: BootstrapOptions): PairedDifference | null {
  const { blockLength, resamples, seed, level } = options;
  if (!Number.isInteger(blockLength) || blockLength < 1 || !Number.isInteger(resamples) || resamples < 100 || resamples > 20_000 ||
      !isFiniteNumber(seed) || !isFiniteNumber(level) || !(level > 0) || !(level < 1)) throw new QuantError("option_invalid");
  if (a.length === 0 || a.length !== b.length) return null;
  const n = a.length;
  const diffs: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = (a[i] as number) - (b[i] as number);
    if (!isFiniteNumber(d)) return null;
    diffs.push(d);
  }
  const meanDiff = diffs.reduce((s, d) => s + d, 0) / n;
  const length = Math.min(blockLength, n);
  const random = mulberry32(seed);
  const means: number[] = [];
  for (let r = 0; r < resamples; r += 1) {
    let sum = 0;
    let taken = 0;
    while (taken < n) {
      const start = Math.floor(random() * (n - length + 1));
      for (let k = 0; k < length && taken < n; k += 1, taken += 1) sum += diffs[start + k] as number;
    }
    means.push(sum / n);
  }
  const tail = (1 - level) / 2;
  return { n, meanDiff, ciLow: quantile(means, tail) as number, ciHigh: quantile(means, 1 - tail) as number };
}

export interface WalkRecord extends ForecastRecord {
  readonly side: Side;
  /** Adverse price move as a fraction of the entry price. */
  readonly distance: number;
  /** Index in the candle array of the bar the forecast was made at. */
  readonly startIndex: number;
}

export interface WalkForwardConfig {
  /** Audited, ascending, consecutive bars. */
  readonly candles: readonly Candle[];
  readonly barMs: number;
  readonly horizonDays: number;
  /** Bars of history each forecaster is given, ending at the start bar. */
  readonly trainBars: number;
  /** Bars between start times. */
  readonly strideBars: number;
  /** Adverse moves, each strictly between 0 and 1. */
  readonly distances: readonly number[];
  readonly sides?: readonly Side[];
  readonly forecasters: readonly Forecaster[];
  readonly seed: number;
}

export interface ForecasterResult {
  readonly records: readonly WalkRecord[];
  /** Candle index of each start, parallel to the per start loss arrays. */
  readonly startIndexes: readonly number[];
  readonly brier: number | null;
  readonly logLoss: number | null;
  readonly reliability: readonly ReliabilityBin[];
  /** Mean Brier loss of the events at each start time, in start order. */
  readonly perStartBrier: readonly number[];
  readonly perStartLogLoss: readonly number[];
}

export interface WalkForwardResult {
  readonly starts: number;
  readonly skipped: number;
  readonly horizonBars: number;
  /** Share of events that happened, the same for every forecaster. */
  readonly baseRate: number | null;
  readonly perForecaster: Readonly<Record<string, ForecasterResult>>;
}

export function walkForward(config: WalkForwardConfig): WalkForwardResult {
  const barMs = requirePositive(config.barMs, "bar_invalid");
  const horizonDays = requirePositive(config.horizonDays, "option_invalid");
  const sides: readonly Side[] = config.sides ?? ["long", "short"];
  if (config.forecasters.length === 0 || new Set(config.forecasters.map((f) => f.name)).size !== config.forecasters.length ||
      !Number.isInteger(config.trainBars) || config.trainBars < 2 || !Number.isInteger(config.strideBars) || config.strideBars < 1 ||
      config.distances.length === 0 || config.distances.some((d) => !isFiniteNumber(d) || !(d > 0) || !(d < 1)) ||
      sides.length === 0 || !isFiniteNumber(config.seed)) throw new QuantError("option_invalid");
  for (const candle of config.candles) if (candleDefect(candle) !== null) throw new QuantError("candles_invalid");

  const candles = config.candles;
  const horizonBars = Math.max(1, Math.round((horizonDays * DAY_MS) / barMs));
  const names = config.forecasters.map((f) => f.name);
  const records: Record<string, WalkRecord[]> = Object.fromEntries(names.map((name) => [name, [] as WalkRecord[]]));
  const perBrier: Record<string, number[]> = Object.fromEntries(names.map((name) => [name, [] as number[]]));
  const perLog: Record<string, number[]> = Object.fromEntries(names.map((name) => [name, [] as number[]]));
  const startIndexes: number[] = [];
  let starts = 0;
  let skipped = 0;
  let hits = 0;
  let events = 0;

  for (let i = config.trainBars - 1; i + horizonBars <= candles.length - 1; i += config.strideBars) {
    const train = candles.slice(i - config.trainBars + 1, i + 1);
    const predictors = config.forecasters.map((f) => f.prepare(train, { barMs, horizonDays, seed: config.seed + i }));
    if (predictors.some((p) => p === null)) { skipped += 1; continue; }

    const entry = (candles[i] as Candle).close;
    let lowest = Infinity;
    let highest = -Infinity;
    for (let j = i + 1; j <= i + horizonBars; j += 1) {
      const c = candles[j] as Candle;
      if (c.low < lowest) lowest = c.low;
      if (c.high > highest) highest = c.high;
    }

    const brierAt: Record<string, number> = {};
    const logAt: Record<string, number> = {};
    config.forecasters.forEach((f, k) => {
      const predict = predictors[k] as NonNullable<(typeof predictors)[number]>;
      let b = 0;
      let l = 0;
      let count = 0;
      for (const side of sides) {
        for (const distance of config.distances) {
          const p = predict(side, distance);
          if (!validProbability(p)) throw new QuantError("forecast_invalid");
          const hit: 0 | 1 = side === "long" ? (lowest <= entry * (1 - distance) ? 1 : 0) : (highest >= entry * (1 + distance) ? 1 : 0);
          (records[f.name] as WalkRecord[]).push({ p, hit, side, distance, startIndex: i });
          b += (p - hit) ** 2;
          l += lossOne(p, hit, DEFAULT_LOG_FLOOR);
          count += 1;
          if (k === 0) { hits += hit; events += 1; }
        }
      }
      brierAt[f.name] = b / count;
      logAt[f.name] = l / count;
    });
    for (const name of names) {
      (perBrier[name] as number[]).push(brierAt[name] as number);
      (perLog[name] as number[]).push(logAt[name] as number);
    }
    startIndexes.push(i);
    starts += 1;
  }

  const perForecaster = Object.fromEntries(names.map((name) => {
    const recs = records[name] as WalkRecord[];
    const result: ForecasterResult = {
      records: recs,
      startIndexes,
      brier: brierScore(recs),
      logLoss: logLoss(recs),
      reliability: reliability(recs),
      perStartBrier: perBrier[name] as number[],
      perStartLogLoss: perLog[name] as number[],
    };
    return [name, result];
  }));
  return { starts, skipped, horizonBars, baseRate: events === 0 ? null : hits / events, perForecaster };
}

/**
 * Mean loss of the events at each start, with the log loss floor chosen by the caller, ascending by start index.
 * The floor decides how much a confident miss costs, so a report should show more than one.
 */
export function perStartMeanLoss(records: readonly WalkRecord[], loss: "brier" | "logloss", floor: number = DEFAULT_LOG_FLOOR): { keys: number[]; values: number[] } {
  if (!isFiniteNumber(floor) || !(floor > 0) || !(floor < 0.5)) throw new QuantError("option_invalid");
  const sums = new Map<number, { sum: number; n: number }>();
  for (const r of records) {
    const cell = sums.get(r.startIndex) ?? { sum: 0, n: 0 };
    cell.sum += loss === "brier" ? (r.p - r.hit) ** 2 : lossOne(r.p, r.hit, floor);
    cell.n += 1;
    sums.set(r.startIndex, cell);
  }
  const keys = [...sums.keys()].sort((a, b) => a - b);
  return { keys, values: keys.map((k) => (sums.get(k) as { sum: number; n: number }).sum / (sums.get(k) as { sum: number; n: number }).n) };
}

/**
 * Pools several keyed series (for example the per day losses of several assets) into one series by averaging the
 * values that share a key. This is the unit of the date level bootstrap: assets that move together count once per day.
 */
export function pooledByKey(series: readonly { readonly keys: readonly number[]; readonly values: readonly number[] }[]): { keys: number[]; values: number[]; counts: number[] } {
  const cells = new Map<number, { sum: number; n: number }>();
  for (const s of series) {
    if (s.keys.length !== s.values.length) throw new QuantError("option_invalid");
    s.keys.forEach((key, i) => {
      const cell = cells.get(key) ?? { sum: 0, n: 0 };
      cell.sum += s.values[i] as number;
      cell.n += 1;
      cells.set(key, cell);
    });
  }
  const keys = [...cells.keys()].sort((a, b) => a - b);
  const at = (k: number) => cells.get(k) as { sum: number; n: number };
  return { keys, values: keys.map((k) => at(k).sum / at(k).n), counts: keys.map((k) => at(k).n) };
}
