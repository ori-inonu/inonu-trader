import { expect, test } from "bun:test";
import { replay } from "./replay-real";
import type { Portfolio } from "../src/decision/types";

const PORTFOLIO: Portfolio = {
  equityUsd: 100_000, peakEquityUsd: 100_000, cashUsd: 100_000, dayPnlUsd: 0, exposureUsd: {}, correlation: () => 0,
};

/** Evento completo: todos os campos que o Opportunity exige, com valores de teste (não dados reais). */
function evento(i: number): Record<string, unknown> {
  return {
    block: i, ts: 1_000_000 + i * 250, mid: 2, bestBid: 1.99, bestAsk: 2.01, spreadBps: 100,
    decision: { action: i % 2 === 0 ? "buy" : "sell", probabilities: { buy: 0, sell: 0, hold: 0 }, upIn10: 0.5 + (i % 10) * 0.03, latencyMs: 0, late: false },
    venue: "kuru", chain: "monad", symbol: "MON", priceUsd: 2, upBps: 50 + (i % 10) * 40, downBps: 30,
    horizonMs: 60_000, liquidityUsd: 1_000_000, riskScore: 0.1,
    costs: { dexFeeBps: 10, slippageBps: 5, impactBps: 2, mevBps: 1, exitExtraBps: 3, gasUsd: 0.01, failProb: 0.01, failCostUsd: 0.05 },
  };
}

test("linha malformada é ignorada e contada; linha em branco não conta", async () => {
  const lines = [JSON.stringify(evento(0)), "{ruim", "", "[1,2]", "null", JSON.stringify(evento(1))];
  const r = await replay(lines, { portfolio: PORTFOLIO });
  expect(r.lidos).toBe(5);
  expect(r.malformados).toBe(3);
  expect(r.validos).toBe(2);
  expect(r.avaliadosPeloPipeline).toBe(2);
});

test("evento sem custo marca os campos de custo como ausentes e não entra no pipeline", async () => {
  const semCusto = { ...evento(0), costs: undefined };
  const r = await replay([JSON.stringify(semCusto)], { portfolio: PORTFOLIO });
  expect(r.comDadoSuficiente).toBe(0);
  expect(r.avaliadosPeloPipeline).toBe(0);
  expect(r.camposAusentes["costs.slippageBps"]).toBe(1);
  expect(r.camposAusentes["costs.gasUsd"]).toBe(1);
  expect(r.edgeLiquido.fracao).toBeNull();
  expect(r.edgeLiquido.ic95).toBeNull();
});

test("evento completo não marca ausência e a contagem de NAO_OPERAR bate com o total", async () => {
  const lines = Array.from({ length: 60 }, (_, i) => JSON.stringify(evento(i)));
  const r = await replay(lines, { portfolio: PORTFOLIO });
  expect(r.comDadoSuficiente).toBe(60);
  expect(r.camposAusentes).toEqual({});
  const p = r.decisoesPipeline;
  expect(p.COMPRAR + p.VENDER + p.NAO_OPERAR).toBe(r.avaliadosPeloPipeline);
  expect(r.avaliadosPeloPipeline).toBe(60);
  const motivos = Object.values(r.naoOperarPorMotivo).reduce((a, b) => a + b, 0);
  expect(motivos).toBe(p.NAO_OPERAR);
  expect(r.edgeLiquido.n).toBe(60);
  expect(r.edgeLiquido.fracao).toBe(r.edgeLiquido.acima / 60);
  expect(r.edgeLiquido.ic95).not.toBeNull();
});

test("sem portfólio nenhuma oportunidade é avaliada e 'portfolio' aparece como ausente", async () => {
  const r = await replay([JSON.stringify(evento(0)), JSON.stringify(evento(1))]);
  expect(r.comDadoSuficiente).toBe(0);
  expect(r.avaliadosPeloPipeline).toBe(0);
  expect(r.camposAusentes.portfolio).toBe(2);
  expect(r.source).toBe("data/events.jsonl");
});

test("decisão original é contada separadamente e hold não vira oportunidade", async () => {
  const hold = { ...evento(0), decision: { action: "hold", probabilities: {}, upIn10: 0.5, latencyMs: 0, late: false } };
  const r = await replay([JSON.stringify(hold), JSON.stringify({ block: 1 })], { portfolio: PORTFOLIO });
  expect(r.decisaoOriginal.hold).toBe(1);
  expect(r.semDecisao).toBe(1);
  expect(r.avaliadosPeloPipeline).toBe(0);
  expect(r.camposAusentes.side).toBe(2);
});

test("divergência entre spreadBps e bid/ask é contada", async () => {
  const ev = { ...evento(0), spreadBps: 5000 };
  const r = await replay([JSON.stringify(ev)], { portfolio: PORTFOLIO });
  expect(r.divergenciaSpread).toBe(1);
});
