import type { Costs, Limits, Opportunity, Portfolio } from "./types";

/** Fixtures compartilhadas pelos testes do módulo. Sem I/O: só valores. */
export const NOW = 1_000_000;

// Por perna: 15 + 10 + 2,5 + 2,5 = 30 bps. Spread cheio 10. Gas 1 USD e falha 0,1 x 0,5 USD por perna.
export const costs: Costs = { dexFeeBps: 15, spreadBps: 10, slippageBps: 10, impactBps: 2.5, mevBps: 2.5, exitExtraBps: 0, gasUsd: 1, failProb: 0.1, failCostUsd: 0.5 };

/** Bruto 200 bps; no teto de 1000 USD o custo é 95 bps e o líquido 105 bps. Passa em todo filtro. */
export const opportunity = (id: string, patch: Partial<Opportunity> = {}): Opportunity => ({
  id, venue: "dex", chain: "base", symbol: "TOKEN", side: "buy", atMs: NOW, quoteAtMs: NOW - 500, priceUsd: 2,
  upBps: 400, downBps: 100, pWin: 0.6, horizonMs: 3_600_000, liquidityUsd: 1_000_000, riskScore: 0.2, costs, ...patch,
});

export const limits: Limits = {
  minNetEdgeBps: 10, maxQuoteAgeMs: 5000, maxSlippageBps: 50, maxGasUsd: 5, maxRiskScore: 0.5, minLiquidityMultiple: 2,
  maxPositionPct: 0.05, maxGrossExposurePct: 0.5, maxDayLossPct: 0.05, maxDrawdownPct: 0.25, maxCorrelation: 0.8, kellyFraction: 0.5,
};

export const portfolio = (patch: Partial<Portfolio> = {}): Portfolio => ({
  equityUsd: 20_000, peakEquityUsd: 20_000, cashUsd: 20_000, dayPnlUsd: 0, exposureUsd: {}, correlation: () => 0, ...patch,
});
