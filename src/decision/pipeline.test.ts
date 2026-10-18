import { expect, test } from "bun:test";
import { netEdgeBps } from "./edge";
import { evaluate } from "./pipeline";
import { sizeUsd } from "./sizing";
import type { Costs, Limits, Opportunity, Portfolio, Reason } from "./types";

const NOW = 1_000_000;
const clock = { now: () => NOW };

// Custos: fixos 30+10+20+5+5+0 = 70 bps; gas 2 USD; falha 0,1 * 1 USD.
const costs: Costs = {
  dexFeeBps: 15, spreadBps: 10, slippageBps: 10, impactBps: 2.5, mevBps: 2.5, exitExtraBps: 0,
  gasUsd: 1, failProb: 0.1, failCostUsd: 0.5,
};
// gross = 0,7*200 - 0,3*100 = 110 bps. Com teto de 1000 USD: custo = 70 + 20 + 1 = 91, líquido = 19 bps.
const base: Opportunity = {
  id: "opp-1", venue: "dex", chain: "base", symbol: "TOKEN", side: "buy",
  atMs: NOW, quoteAtMs: NOW - 1000, priceUsd: 1, upBps: 200, downBps: 100, pWin: 0.7,
  horizonMs: 3_600_000, liquidityUsd: 100_000, riskScore: 0.2, costs,
};
const limits: Limits = {
  minNetEdgeBps: 10, maxQuoteAgeMs: 5000, maxSlippageBps: 50, maxGasUsd: 5, maxRiskScore: 0.5,
  minLiquidityMultiple: 2, maxPositionPct: 0.05, maxGrossExposurePct: 0.5, maxDayLossPct: 0.05,
  maxDrawdownPct: 0.25, maxCorrelation: 0.8, kellyFraction: 0.5,
};
const port: Portfolio = {
  equityUsd: 20_000, peakEquityUsd: 20_000, cashUsd: 20_000, dayPnlUsd: 0, exposureUsd: {},
  correlation: () => 0,
};

test("caso feliz COMPRAR com tamanho no teto de posição e edge líquido exato", () => {
  const d = evaluate(base, port, limits, clock);
  expect(d.action).toBe("COMPRAR");
  expect(d.reasons).toEqual(["ok"]);
  expect(d.sizeUsd).toBeCloseTo(1000, 9);
  expect(d.grossEdgeBps).toBeCloseTo(110, 9);
  expect(d.costBps).toBeCloseTo(91, 9);
  expect(d.netEdgeBps).toBeCloseTo(19, 9);
  expect(d.stages.map((s) => s.name)).toEqual(["filtro", "edge", "sizing", "controles"]);
  expect(d.stages.every((s) => s.ok)).toBe(true);
});

test("lado sell vira VENDER com o mesmo caminho", () => {
  expect(evaluate({ ...base, side: "sell" }, port, limits, clock).action).toBe("VENDER");
});

test("edge líquido à mão: custo de gas e falha em bps do notional", () => {
  // 2 USD de gas + 0,1 * 1 USD de falha = 2,1 USD; em 1000 USD são 21 bps (20 + 1).
  expect(netEdgeBps(base, 1000)).toBeCloseTo(19, 9);
  // Sem notional, só os custos fixos valem: 110 - 70.
  expect(netEdgeBps(base, 0)).toBeCloseTo(40, 9);
});

test("tamanho pelo Kelly fracionado quando é menor que o teto", () => {
  // net 19 bps, downBps 100: fração = 0,01 * 0,19 = 0,0019; * 20000 = 38 USD.
  const size = sizeUsd(base, port, { ...limits, kellyFraction: 0.01 });
  expect(size).toBeCloseTo(38, 9);
});

test("edge final vale no tamanho menor: gas fixo pesa mais em bps e muda a decisão", () => {
  // No teto (1000 USD) o líquido é 19 bps e passa. Kelly 0,01 leva a 38 USD: gas e falha viram 2,1/38 = 552 bps.
  expect(evaluate(base, port, limits, clock).action).toBe("COMPRAR");
  const d = evaluate(base, port, { ...limits, kellyFraction: 0.01 }, clock);
  expect(d.sizeUsd).toBeCloseTo(38, 9);
  expect(d.costBps).toBeCloseTo(70 + (2.1 / 38) * 1e4, 6);
  expect(d.netEdgeBps).toBeLessThan(0);
  expect(d.action).toBe("NAO_OPERAR");
  expect(d.reasons).toEqual(["no_edge"]);
  expect(d.stages.at(-1)).toMatchObject({ name: "sizing", ok: false, reason: "no_edge" });
});

test("sizing nunca excede maxPositionPct do equity", () => {
  for (const pWin of [0.55, 0.7, 0.9, 0.99]) {
    for (const kellyFraction of [0.1, 0.5, 1]) {
      for (const equityUsd of [1_000, 20_000, 500_000]) {
        const opp = { ...base, pWin, upBps: 500 };
        const p = { ...port, equityUsd, peakEquityUsd: equityUsd };
        const size = sizeUsd(opp, p, { ...limits, kellyFraction });
        expect(size).toBeLessThanOrEqual(limits.maxPositionPct * equityUsd + 1e-9);
      }
    }
  }
});

test("sizing é zero sem edge líquido positivo", () => {
  expect(sizeUsd({ ...base, pWin: 0.3 }, port, limits)).toBe(0);
});

// Cada caso muda uma única condição sobre a oportunidade base, que passa em tudo.
const cases: Array<{ reason: Reason; stage: string; opp?: Partial<Opportunity>; port?: Partial<Portfolio>; limits?: Partial<Limits> }> = [
  { reason: "blocked_token", stage: "filtro", opp: { blocked: "honeypot" } },
  { reason: "risk_score_high", stage: "filtro", opp: { riskScore: 0.9 } },
  { reason: "quote_stale", stage: "filtro", opp: { quoteAtMs: NOW - 10_000 } },
  { reason: "liquidity_thin", stage: "filtro", opp: { liquidityUsd: 1500 } },
  { reason: "slippage_over_cap", stage: "filtro", opp: { costs: { ...costs, slippageBps: 60 } } },
  { reason: "gas_over_cap", stage: "filtro", opp: { costs: { ...costs, gasUsd: 6 } } },
  { reason: "correlation_high", stage: "filtro", port: { exposureUsd: { OTHER: 500 }, correlation: () => 0.95 } },
  { reason: "no_edge", stage: "edge", opp: { pWin: 0.3 } },
  { reason: "edge_below_min", stage: "edge", limits: { minNetEdgeBps: 25 } },
  { reason: "size_zero", stage: "sizing", port: { exposureUsd: { OTHER: 10_000 } } },
  { reason: "day_loss_limit", stage: "controles", port: { dayPnlUsd: -1100 } },
  { reason: "drawdown_limit", stage: "controles", port: { peakEquityUsd: 30_000 } },
];

for (const c of cases) {
  test(`NAO_OPERAR isolado por ${c.reason}`, () => {
    const d = evaluate(
      { ...base, ...c.opp },
      { ...port, ...c.port },
      { ...limits, ...c.limits },
      clock,
    );
    expect(d.action).toBe("NAO_OPERAR");
    expect(d.reasons).toEqual([c.reason]);
    expect(d.stages.at(-1)).toMatchObject({ name: c.stage, ok: false, reason: c.reason });
    expect(d.stages.slice(0, -1).every((s) => s.ok)).toBe(true);
  });
}

test("stage trace mede a duração com o relógio injetado", () => {
  let t = 0;
  const ticking = { now: () => (t += 3) };
  const d = evaluate(base, port, limits, ticking);
  expect(d.stages.every((s) => s.ms === 3)).toBe(true);
});
