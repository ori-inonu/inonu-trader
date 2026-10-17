import { describe, expect, test } from "bun:test";
import { assessHypothesis, type HypothesisInputs } from "./hypothesis";

const measured: HypothesisInputs = {
  targetNetBps: 30,
  targetIntervalMs: 90,
  requiredPerSecond: 11.11,
  tradeRps: 1,
  requiredPerDay: 960_000,
  basicPerDay: 3226,
  quoteP50Ms: 1034,
  modelP50Ms: 373,
  localP95Ms: 0.006,
  entryImpactP50Pct: 0.23,
  entryShareWithinTarget: 0.3704,
  realized: { n: 7, wins: 0, atLeastTarget: 0, returnPct: -0.406 },
  forwardBuys: { n: 12, meanBps: -122.1, atLeastTarget: { k: 0, ci95: [0, 0.2425] } },
};

const byId = (a: ReturnType<typeof assessHypothesis>, id: string) => a.findings.find((f) => f.id === id)!;

describe("assessHypothesis", () => {
  test("com os números medidos: cadência inviável, custo de entrada não sustenta, retorno não demonstrado", () => {
    const a = assessHypothesis(measured);
    expect(byId(a, "vazao").status).toBe("inviavel");
    expect(byId(a, "vazao").evidence).toContain("11,1 requisições por segundo");
    expect(byId(a, "latencia").status).toBe("inviavel");
    expect(byId(a, "latencia").evidence).toContain("1407 ms");
    expect(byId(a, "latencia").evidence).toContain("não é o gargalo");
    expect(byId(a, "custo_de_entrada").status).toBe("nao_sustentada");
    expect(byId(a, "custo_de_entrada").evidence).toContain("46 bps");
    expect(byId(a, "retorno_realizado").status).toBe("nao_demonstrada");
    expect(byId(a, "retorno_das_compras").status).toBe("nao_demonstrada");
    expect(a.verdict).toContain("inviável no plano atual (vazao, latencia)");
    expect(a.verdict).toContain("não demonstrado");
    expect(a.verdict).toContain("NAO_OPERAR");
  });

  test("nenhum achado afirma lucro", () => {
    const text = JSON.stringify(assessHypothesis(measured));
    expect(text).not.toMatch(/lucro (garantido|certo)|vai lucrar|é lucrativ/i);
  });

  test("probabilidade exigida: custo de 46 bps e movimentos simétricos de 50 bps tornam o alvo impossível", () => {
    const table = assessHypothesis(measured).requiredPWinBySymmetricMove;
    expect(table.map((r) => r.moveBps)).toEqual([50, 100, 200, 400]);
    expect(table[0]!.pWin).toBeGreaterThan(1);
    expect(table[1]!.pWin).toBeCloseTo((30 + 46 + 100) / 200, 3);
    expect(table[3]!.pWin).toBeLessThan(table[2]!.pWin);
    expect(table.every((r) => r.costBps === 46)).toBe(true);
  });

  test("cadência que cabe nos tetos não é declarada inviável", () => {
    const a = assessHypothesis({ ...measured, requiredPerSecond: 0.5, requiredPerDay: 40_000, basicPerDay: 50_000, quoteP50Ms: 20, modelP50Ms: 30 });
    expect(byId(a, "vazao").status).toBe("nao_demonstrada");
    expect(byId(a, "latencia").status).toBe("nao_demonstrada");
    expect(a.verdict).toContain("sem impedimento declarado");
  });

  test("sem medida de latência ou de impacto o achado correspondente não é inventado", () => {
    const a = assessHypothesis({ ...measured, quoteP50Ms: null, entryImpactP50Pct: null, entryShareWithinTarget: null, forwardBuys: null });
    expect(a.findings.map((f) => f.id)).toEqual(["vazao", "retorno_realizado"]);
    expect(a.requiredPWinBySymmetricMove.every((r) => r.costBps === 0)).toBe(true);
  });

  test("o status das compras vem dos dados: amostra grande e boa não é 'não sustentada'", () => {
    const good = assessHypothesis({ ...measured, forwardBuys: { n: 200, meanBps: 150, atLeastTarget: { k: 180, ci95: [0.85, 0.94] } } });
    expect(byId(good, "retorno_das_compras").status).toBe("nao_demonstrada");
    const bad = assessHypothesis({ ...measured, forwardBuys: { n: 200, meanBps: -100, atLeastTarget: { k: 5, ci95: [0.01, 0.06] } } });
    expect(byId(bad, "retorno_das_compras").status).toBe("nao_sustentada");
    const small = assessHypothesis({ ...measured, forwardBuys: { n: 12, meanBps: -100, atLeastTarget: { k: 0, ci95: [0, 0.24] } } });
    expect(byId(small, "retorno_das_compras").status).toBe("nao_demonstrada");
  });

  test("amostra grande de vendas sem ganho passa a não sustentar o retorno", () => {
    const a = assessHypothesis({ ...measured, realized: { n: 60, wins: 5, atLeastTarget: 2, returnPct: -0.5 } });
    expect(byId(a, "retorno_realizado").status).toBe("nao_sustentada");
  });
});
