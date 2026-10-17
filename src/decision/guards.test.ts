import { describe, expect, test } from "bun:test";
import { grossEdgeBps, netEdgeBps, requiredPWin, totalCostBps } from "./edge";
import { evaluate } from "./pipeline";
import type { Costs, Limits, Opportunity, Portfolio } from "./types";
import { invalidFields } from "./validate";

const NOW = 1_000_000;
const clock = { now: () => NOW };
// Por perna: 15 + 10 + 2,5 + 2,5 = 30 bps. Spread cheio 10. Gas 1 USD e falha 0,1 x 0,5 USD por perna.
const costs: Costs = { dexFeeBps: 15, spreadBps: 10, slippageBps: 10, impactBps: 2.5, mevBps: 2.5, exitExtraBps: 4, gasUsd: 1, failProb: 0.1, failCostUsd: 0.5 };
const base: Opportunity = {
  id: "g-1", venue: "dex", chain: "base", symbol: "TOKEN", side: "buy", atMs: NOW, quoteAtMs: NOW - 500, priceUsd: 1,
  upBps: 400, downBps: 100, pWin: 0.6, horizonMs: 3_600_000, liquidityUsd: 1_000_000, riskScore: 0.2, costs,
};
const limits: Limits = {
  minNetEdgeBps: 10, maxQuoteAgeMs: 5000, maxSlippageBps: 50, maxGasUsd: 5, maxRiskScore: 0.5, minLiquidityMultiple: 2,
  maxPositionPct: 0.05, maxGrossExposurePct: 0.5, maxDayLossPct: 0.05, maxDrawdownPct: 0.25, maxCorrelation: 0.8, kellyFraction: 0.5,
};
const port: Portfolio = { equityUsd: 20_000, peakEquityUsd: 20_000, cashUsd: 20_000, dayPnlUsd: 0, exposureUsd: {}, correlation: () => 0 };

describe("custo por perna", () => {
  test("operação completa paga duas pernas, spread cheio uma vez e a saída uma vez", () => {
    // 2 x 30 + 10 + 4 = 74 bps; gas e falha: 2 x (1 + 0,05) = 2,1 USD em 1000 USD = 21 bps.
    expect(totalCostBps(base, 0)).toBeCloseTo(74, 9);
    expect(totalCostBps(base, 1000)).toBeCloseTo(95, 9);
  });

  test("só fechar uma posição existente paga uma perna e meio spread", () => {
    // 30 + 5 + 4 = 39 bps; gas e falha: 1,05 USD em 1000 USD = 10,5 bps.
    const exit: Opportunity = { ...base, side: "sell", legs: 1 };
    expect(totalCostBps(exit, 0)).toBeCloseTo(39, 9);
    expect(totalCostBps(exit, 1000)).toBeCloseTo(49.5, 9);
  });

  test("edge líquido é o bruto menos o custo das duas pernas", () => {
    expect(grossEdgeBps(base)).toBeCloseTo(200, 9);
    expect(netEdgeBps(base, 1000)).toBeCloseTo(105, 9);
  });

  test("a mesma oportunidade que passa fechando uma perna é recusada abrindo e fechando", () => {
    // bruto 0,6 x 250 - 0,4 x 100 = 110 bps. No teto de 1000 USD: uma perna custa 49,5 (líquido 60,5); duas custam 95 (líquido 15).
    const thin: Opportunity = { ...base, upBps: 250, downBps: 100, pWin: 0.6 };
    const strict = { ...limits, minNetEdgeBps: 30 };
    const holding = { ...port, exposureUsd: { TOKEN: 1000 } };
    const one = evaluate({ ...thin, legs: 1, side: "sell" }, holding, strict, clock);
    expect(one.action).toBe("VENDER");
    expect(one.netEdgeBps).toBeCloseTo(60.5, 9);
    const both = evaluate(thin, port, strict, clock);
    expect(both.action).toBe("NAO_OPERAR");
    expect(both.reasons).toEqual(["edge_below_min"]);
    expect(both.netEdgeBps).toBeCloseTo(15, 9);
  });
});

describe("probabilidade mínima para o alvo", () => {
  test("requiredPWin resolve p x up - (1-p) x down - custo = alvo", () => {
    const p = requiredPWin(400, 100, 95, 30);
    expect(p).toBeCloseTo((30 + 95 + 100) / 500, 12);
    const check = p * 400 - (1 - p) * 100 - 95;
    expect(check).toBeCloseTo(30, 9);
  });

  test("com movimento menor que o custo nenhuma probabilidade basta", () => {
    expect(requiredPWin(50, 50, 120, 30)).toBeGreaterThan(1);
  });
});

describe("qualidade do dado", () => {
  test("oportunidade válida não tem campo inválido", () => {
    expect(invalidFields(base)).toEqual([]);
  });

  test("campos não finitos, fora do domínio ou ausentes são nomeados", () => {
    expect(invalidFields({ ...base, pWin: 1.2 })).toEqual(["pWin"]);
    expect(invalidFields({ ...base, priceUsd: 0 })).toEqual(["priceUsd"]);
    expect(invalidFields({ ...base, upBps: Number.NaN })).toEqual(["upBps"]);
    expect(invalidFields({ ...base, riskScore: -0.1 })).toEqual(["riskScore"]);
    expect(invalidFields({ ...base, costs: { ...costs, failProb: 2 } })).toEqual(["costs.failProb"]);
    expect(invalidFields({ ...base, costs: { ...costs, gasUsd: -1 } })).toEqual(["costs.gasUsd"]);
    expect(invalidFields({ ...base, id: "" })).toEqual(["id"]);
    expect(invalidFields({ ...base, costs: undefined as unknown as Costs })).toContain("costs");
  });

  test("cotação do futuro além da tolerância é dado ruim; dentro da tolerância passa", () => {
    expect(invalidFields({ ...base, quoteAtMs: NOW + 5000 })).toEqual(["quoteAtMs"]);
    expect(invalidFields({ ...base, quoteAtMs: NOW + 500 })).toEqual([]);
  });

  test("dado ruim é recusado antes de qualquer conta, sem NaN no resultado", () => {
    const d = evaluate({ ...base, upBps: Number.NaN }, port, limits, clock);
    expect(d.action).toBe("NAO_OPERAR");
    expect(d.reasons).toEqual(["bad_data"]);
    expect(d.netEdgeBps).toBe(0);
    expect(d.stages).toEqual([{ name: "filtro", ok: false, reason: "bad_data", ms: 0 }]);
    expect(JSON.stringify(d)).not.toContain("null");
  });
});

describe("controles de ambiente", () => {
  test("executor indisponível recusa mesmo com edge de sobra", () => {
    expect(evaluate(base, port, limits, clock).action).toBe("COMPRAR");
    const d = evaluate(base, { ...port, executorAvailable: false }, limits, clock);
    expect(d.action).toBe("NAO_OPERAR");
    expect(d.reasons).toEqual(["executor_unavailable"]);
  });

  test("saldo de gas abaixo do mínimo recusa; sem a informação, com o controle ligado, também", () => {
    const on = { ...limits, minGasBalanceUsd: 3 };
    expect(evaluate(base, { ...port, gasBalanceUsd: 5 }, on, clock).action).toBe("COMPRAR");
    expect(evaluate(base, { ...port, gasBalanceUsd: 2.99 }, on, clock).reasons).toEqual(["gas_balance_low"]);
    expect(evaluate(base, port, on, clock).reasons).toEqual(["gas_balance_low"]);
    // Controle desligado: o saldo não importa.
    expect(evaluate(base, { ...port, gasBalanceUsd: 0 }, limits, clock).action).toBe("COMPRAR");
  });
});

describe("dado ruim na carteira e nos limites", () => {
  test("campo não finito em qualquer um dos três lados recusa com bad_data, em vez de desligar um limite", () => {
    const refused = (o: Opportunity, p: Portfolio, l: Limits) => evaluate(o, p, l, clock);
    expect(refused(base, { ...port, dayPnlUsd: Number.NaN }, limits).reasons).toEqual(["bad_data"]);
    expect(refused(base, { ...port, peakEquityUsd: Number.NaN }, limits).reasons).toEqual(["bad_data"]);
    expect(refused(base, { ...port, equityUsd: 0 }, limits).reasons).toEqual(["bad_data"]);
    expect(refused(base, { ...port, exposureUsd: { X: Number.NaN } }, limits).reasons).toEqual(["bad_data"]);
    expect(refused(base, { ...port, gasBalanceUsd: Number.NaN }, limits).reasons).toEqual(["bad_data"]);
    expect(refused(base, port, { ...limits, kellyFraction: Number.NaN }).reasons).toEqual(["bad_data"]);
    expect(refused(base, port, { ...limits, maxDayLossPct: Number.NaN }).reasons).toEqual(["bad_data"]);
    expect(refused(base, port, { ...limits, maxPositionPct: 2 }).reasons).toEqual(["bad_data"]);
  });

  test("correlação não finita é dado ruim, nunca ausência de correlação", () => {
    const d = evaluate(base, { ...port, exposureUsd: { OTHER: 500 }, correlation: () => Number.NaN }, limits, clock);
    expect(d.action).toBe("NAO_OPERAR");
    expect(d.reasons).toEqual(["bad_data"]);
  });

  test("tamanho nunca sai NaN: o resultado do sizing é sempre finito e positivo ou zero", () => {
    const d = evaluate(base, port, limits, clock);
    expect(Number.isFinite(d.sizeUsd) && d.sizeUsd > 0).toBe(true);
  });
});

describe("fechar posição é redução de risco", () => {
  const sell: Opportunity = { ...base, side: "sell", legs: 1, upBps: 250, downBps: 100, pWin: 0.6 };
  const loose = { ...limits, minNetEdgeBps: 10 };
  const held = (usd: number, extra: Partial<Portfolio> = {}): Portfolio => ({ ...port, exposureUsd: { TOKEN: usd }, ...extra });

  test("posição que valorizou acima do limite de posição ainda pode ser fechada, por inteiro", () => {
    // maxPositionPct 5% de 20 mil = 1000 USD. Com 1500 abertos, abrir daria size_zero; fechar sai por inteiro.
    expect(evaluate({ ...sell, side: "buy", legs: 2 }, held(1500), loose, clock).reasons).toEqual(["size_zero"]);
    const d = evaluate(sell, held(1500), loose, clock);
    expect(d.action).toBe("VENDER");
    expect(d.sizeUsd).toBe(1500);
  });

  test("perda do dia e drawdown acima do limite impedem abrir, não fechar", () => {
    const bad = held(800, { dayPnlUsd: -5000, peakEquityUsd: 40_000 });
    expect(evaluate({ ...sell, side: "buy", legs: 2 }, bad, loose, clock).action).toBe("NAO_OPERAR");
    expect(evaluate(sell, bad, loose, clock)).toMatchObject({ action: "VENDER", sizeUsd: 800 });
  });

  test("correlação alta com outra posição não prende a saída, mas prende a entrada", () => {
    const p = { ...held(800), exposureUsd: { TOKEN: 800, OTHER: 500 }, correlation: () => 0.95 };
    expect(evaluate(sell, p, loose, clock).action).toBe("VENDER");
    expect(evaluate({ ...base, symbol: "NEW" }, p, loose, clock).reasons).toEqual(["correlation_high"]);
  });

  test("liquidez rasa limita o tamanho da saída em vez de recusá-la", () => {
    // liquidez 1500 e múltiplo 2: no máximo 750 USD saem de uma vez.
    const d = evaluate({ ...sell, liquidityUsd: 1500 }, held(2000), loose, clock);
    expect(d).toMatchObject({ action: "VENDER", sizeUsd: 750 });
  });

  test("sem posição aberta não há o que fechar", () => {
    const d = evaluate(sell, port, loose, clock);
    expect(d.action).toBe("NAO_OPERAR");
    expect(d.reasons).toEqual(["size_zero"]);
  });

  test("risco do token, cotação velha e executor indisponível continuam valendo para a saída", () => {
    expect(evaluate({ ...sell, riskScore: 0.9 }, held(800), loose, clock).reasons).toEqual(["risk_score_high"]);
    expect(evaluate({ ...sell, quoteAtMs: NOW - 10_000 }, held(800), loose, clock).reasons).toEqual(["quote_stale"]);
    expect(evaluate(sell, held(800, { executorAvailable: false }), loose, clock).reasons).toEqual(["executor_unavailable"]);
  });
});
