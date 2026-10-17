import type { Limits, Opportunity, Portfolio } from "./types";

/** Tolerância para uma cotação marcada ligeiramente no futuro por diferença de relógio entre fonte e motor. */
export const MAX_QUOTE_FUTURE_MS = 1000;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const prob = (v: unknown): boolean => finite(v) && v >= 0 && v <= 1;
const nonNeg = (v: unknown): boolean => finite(v) && v >= 0;
const text = (v: unknown): boolean => typeof v === "string" && v.length > 0;

/**
 * Qualidade do dado: a oportunidade só entra no pipeline se todo número usado na conta for finito e dentro do seu
 * domínio. Dado ausente ou corrompido nunca vira zero nem é completado: a oportunidade é recusada com `bad_data`.
 * Devolve os nomes dos campos inválidos (vazio quando está tudo certo).
 */
export function invalidFields(opp: Opportunity): string[] {
  const c = opp.costs as Opportunity["costs"] | undefined;
  const checks: Array<[string, boolean]> = [
    ["id", text(opp.id)],
    ["venue", text(opp.venue)],
    ["chain", text(opp.chain)],
    ["symbol", text(opp.symbol)],
    ["side", opp.side === "buy" || opp.side === "sell"],
    ["legs", opp.legs === undefined || opp.legs === 1 || opp.legs === 2],
    ["atMs", finite(opp.atMs)],
    ["quoteAtMs", finite(opp.quoteAtMs) && (!finite(opp.atMs) || opp.quoteAtMs <= opp.atMs + MAX_QUOTE_FUTURE_MS)],
    ["priceUsd", finite(opp.priceUsd) && opp.priceUsd > 0],
    ["upBps", nonNeg(opp.upBps)],
    ["downBps", nonNeg(opp.downBps)],
    ["pWin", prob(opp.pWin)],
    ["horizonMs", finite(opp.horizonMs) && opp.horizonMs > 0],
    ["liquidityUsd", nonNeg(opp.liquidityUsd)],
    ["riskScore", prob(opp.riskScore)],
    ["costs", c !== undefined && c !== null],
  ];
  if (c !== undefined && c !== null) {
    for (const key of ["dexFeeBps", "spreadBps", "slippageBps", "impactBps", "mevBps", "exitExtraBps", "gasUsd", "failCostUsd"] as const) checks.push([`costs.${key}`, nonNeg(c[key])]);
    checks.push(["costs.failProb", prob(c.failProb)]);
  }
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const unit = (v: unknown): boolean => finite(v) && v >= 0 && v <= 1;

/** Carteira com número corrompido desligaria limites sem aviso (NaN nunca é maior que nada): recusar é o único jeito seguro. */
export function invalidPortfolio(port: Portfolio): string[] {
  const checks: Array<[string, boolean]> = [
    ["equityUsd", finite(port.equityUsd) && port.equityUsd > 0],
    ["peakEquityUsd", finite(port.peakEquityUsd) && port.peakEquityUsd > 0],
    ["cashUsd", nonNeg(port.cashUsd)],
    ["dayPnlUsd", finite(port.dayPnlUsd)],
    ["gasBalanceUsd", port.gasBalanceUsd === undefined || nonNeg(port.gasBalanceUsd)],
    ["exposureUsd", port.exposureUsd !== null && typeof port.exposureUsd === "object" && Object.values(port.exposureUsd).every(finite)],
    ["correlation", typeof port.correlation === "function"],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => "portfolio." + name);
}

export function invalidLimits(limits: Limits): string[] {
  const checks: Array<[string, boolean]> = [
    ["minNetEdgeBps", finite(limits.minNetEdgeBps)],
    ["maxQuoteAgeMs", nonNeg(limits.maxQuoteAgeMs)],
    ["maxSlippageBps", nonNeg(limits.maxSlippageBps)],
    ["maxGasUsd", nonNeg(limits.maxGasUsd)],
    ["minGasBalanceUsd", limits.minGasBalanceUsd === undefined || nonNeg(limits.minGasBalanceUsd)],
    ["maxRiskScore", unit(limits.maxRiskScore)],
    ["minLiquidityMultiple", nonNeg(limits.minLiquidityMultiple)],
    ["maxPositionPct", unit(limits.maxPositionPct)],
    ["maxGrossExposurePct", nonNeg(limits.maxGrossExposurePct)],
    ["maxDayLossPct", unit(limits.maxDayLossPct)],
    ["maxDrawdownPct", unit(limits.maxDrawdownPct)],
    ["maxCorrelation", unit(limits.maxCorrelation)],
    ["kellyFraction", unit(limits.kellyFraction)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => "limits." + name);
}
