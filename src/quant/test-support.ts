/**
 * Test only helpers: deterministic synthetic OHLC paths. Everything here is labeled synthetic by its caller;
 * nothing in production code imports this file.
 */

import { DAY_MS, mulberry32, normalDraw, type Candle } from "./types";

export interface SimulateOptions {
  readonly seed: number;
  readonly bars: number;
  readonly sigmaDaily: number;
  readonly barMs: number;
  /** Sub steps per bar used to build a realistic high and low. Default 60. */
  readonly substeps?: number;
  readonly startPrice?: number;
  readonly startMs?: number;
  /** Degrees of freedom of a unit variance Student t innovation; omit for gaussian. Integer, at least 3. */
  readonly tDf?: number;
  /** Multiplies the volatility of bar `i`; models clustering or a late shock. */
  readonly sigmaMultiplier?: (barIndex: number) => number;
  /** Constant log drift per day. */
  readonly driftDaily?: number;
}

/** Unit variance Student t draw with integer degrees of freedom. */
function studentDraw(random: () => number, df: number): number {
  const z = normalDraw(random);
  let chi = 0;
  for (let i = 0; i < df; i += 1) chi += normalDraw(random) ** 2;
  return (z / Math.sqrt(chi / df)) * Math.sqrt((df - 2) / df);
}

/** Continuous market: each open equals the previous close. */
export function simulateCandles(options: SimulateOptions): Candle[] {
  const random = mulberry32(options.seed);
  const m = options.substeps ?? 60;
  const barsPerDay = DAY_MS / options.barMs;
  const sigmaBar = options.sigmaDaily / Math.sqrt(barsPerDay);
  const driftBar = (options.driftDaily ?? 0) / barsPerDay;
  const startMs = options.startMs ?? 1_800_000_000_000;
  const out: Candle[] = [];
  let price = options.startPrice ?? 100;
  for (let i = 0; i < options.bars; i += 1) {
    const sigmaSub = (sigmaBar * (options.sigmaMultiplier?.(i) ?? 1)) / Math.sqrt(m);
    const open = price;
    let high = price;
    let low = price;
    for (let s = 0; s < m; s += 1) {
      const z = options.tDf === undefined ? normalDraw(random) : studentDraw(random, options.tDf);
      price *= Math.exp(driftBar / m + sigmaSub * z);
      if (price > high) high = price;
      if (price < low) low = price;
    }
    out.push({ startMs: startMs + i * options.barMs, open, high, low, close: price, volume: 1, confirmed: true });
  }
  return out;
}

/** i.i.d. gaussian returns with the given standard deviation. */
export function gaussianDraws(seed: number, count: number, sigma: number): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => sigma * normalDraw(random));
}

/** i.i.d. Student t returns scaled to the given standard deviation (unit variance times sigma). */
export function studentDraws(seed: number, count: number, df: number, sigma: number): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => sigma * studentDraw(random, df));
}

export interface GarchSimOptions {
  readonly alpha: number;
  readonly beta: number;
  /** Unconditional standard deviation per observation. */
  readonly sigma: number;
  readonly tDf?: number;
}

/** GARCH(1,1) returns with variance targeting; 200 burn in observations are discarded. */
export function simulateGarchReturns(seed: number, count: number, options: GarchSimOptions): number[] {
  const random = mulberry32(seed);
  const longRun = options.sigma ** 2;
  const omega = (1 - options.alpha - options.beta) * longRun;
  let variance = longRun;
  const out: number[] = [];
  for (let i = 0; i < count + 200; i += 1) {
    const eps = options.tDf === undefined ? normalDraw(random) : studentDraw(random, options.tDf);
    const r = Math.sqrt(variance) * eps;
    variance = omega + options.alpha * r * r + options.beta * variance;
    if (i >= 200) out.push(r);
  }
  return out;
}

export function sigmaOfEstimates(values: readonly number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}
