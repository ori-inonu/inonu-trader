/**
 * Realized volatility from candle closes. Pure arithmetic, no I/O.
 *
 * sigma_bar is the sample standard deviation of log returns between consecutive closes;
 * sigma_daily scales it by sqrt(bars per day). Fewer than MIN_RETURNS returns or any non
 * positive close means "unknown", never zero: a zero sigma would make every leverage look safe.
 */

import { DAY_MS } from "../quant/types";

export const MIN_RETURNS = 20;

export interface RealizedVolatility {
  sigmaDaily: number | null;
  returnsUsed: number;
  reason: string | null;
}

export function logReturns(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1] as number;
    const next = closes[i] as number;
    if (!(prev > 0) || !(next > 0) || !Number.isFinite(prev) || !Number.isFinite(next)) return [];
    out.push(Math.log(next / prev));
  }
  return out;
}

export function sampleStdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function realizedVolatility(closes: readonly number[], barMs: number): RealizedVolatility {
  if (!(barMs > 0) || !Number.isFinite(barMs)) return { sigmaDaily: null, returnsUsed: 0, reason: "bar_unknown" };
  const returns = logReturns(closes);
  if (returns.length === 0 && closes.length > 1) return { sigmaDaily: null, returnsUsed: 0, reason: "close_invalid" };
  if (returns.length < MIN_RETURNS) return { sigmaDaily: null, returnsUsed: returns.length, reason: "too_few_returns" };
  const sigmaBar = sampleStdDev(returns);
  if (sigmaBar === null || !(sigmaBar > 0)) return { sigmaDaily: null, returnsUsed: returns.length, reason: "sigma_zero" };
  const barsPerDay = DAY_MS / barMs;
  return { sigmaDaily: sigmaBar * Math.sqrt(barsPerDay), returnsUsed: returns.length, reason: null };
}
