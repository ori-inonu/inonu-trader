import { describe, expect, test } from "bun:test";
import { auc, baseRate, brier, brierSkill, ece, logLoss, reliabilityTable, spearman } from "./scoring.ts";
import { createRng } from "./rng.ts";

describe("Brier, log loss e taxa-base", () => {
  test("valores conhecidos", () => {
    expect(brier([0.5, 0.5], [1, 0])).toBe(0.25);
    expect(brier([1, 0], [1, 0])).toBe(0);
    expect(logLoss([0.5], [1])).toBeCloseTo(Math.LN2, 10);
    expect(baseRate([1, 0, 0, 1, 1])).toBeCloseTo(0.6, 12);
  });

  test("log loss limita 0 e 1 em vez de dar infinito", () => {
    const v = logLoss([0], [1]) as number;
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(20);
  });

  test("vazio devolve null; entrada inválida lança", () => {
    expect(brier([], [])).toBeNull();
    expect(logLoss([], [])).toBeNull();
    expect(baseRate([])).toBeNull();
    expect(ece([], [])).toBeNull();
    expect(() => brier([1.2], [1])).toThrow(RangeError);
    expect(() => brier([Number.NaN], [1])).toThrow(RangeError);
    expect(() => brier([0.5], [2])).toThrow(RangeError);
    expect(() => brier([0.5], [1, 0])).toThrow(RangeError);
  });
});

describe("Brier skill", () => {
  test("igual à referência dá zero; perfeito dá um; pior que a referência dá negativo", () => {
    const y = [1, 0, 1, 0];
    expect(brierSkill([0.5, 0.5, 0.5, 0.5], y, 0.5)).toBeCloseTo(0, 12);
    expect(brierSkill([1, 0, 1, 0], y, 0.5)).toBeCloseTo(1, 12);
    expect(brierSkill([0, 1, 0, 1], y, 0.5) as number).toBeLessThan(0);
  });

  test("referência que acerta tudo ou ausência de dados: null", () => {
    expect(brierSkill([1, 1], [1, 1], 1)).toBeNull();
    expect(brierSkill([], [], 0.5)).toBeNull();
    expect(() => brierSkill([0.5], [1], 1.5)).toThrow(RangeError);
  });
});

describe("AUC", () => {
  test("caso clássico e inversão", () => {
    expect(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBe(0.75);
    expect(auc([0.8, 0.35, 0.4, 0.1], [0, 0, 1, 1])).toBe(0.25);
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
  });

  test("empates valem posto médio: escores iguais dão 0,5", () => {
    expect(auc([0.3, 0.3, 0.3, 0.3], [0, 1, 0, 1])).toBe(0.5);
    // um empate parcial: (0,1) vs (0,1) com escores [0.2,0.5,0.5,0.9] y [0,0,1,1] => (0.5 + 1 + 0.5... ) = 0.875
    expect(auc([0.2, 0.5, 0.5, 0.9], [0, 0, 1, 1])).toBe(0.875);
  });

  test("sem as duas classes: null", () => {
    expect(auc([0.1, 0.2], [0, 0])).toBeNull();
    expect(auc([0.1, 0.2], [1, 1])).toBeNull();
    expect(auc([], [])).toBeNull();
  });

  test("escores aleatórios ficam perto de 0,5 e escores informativos acima", () => {
    const rng = createRng(21);
    const y = Array.from({ length: 2000 }, () => (rng() < 0.4 ? 1 : 0));
    const noise = y.map(() => rng());
    const signal = y.map((v) => 0.3 * v + rng());
    expect(Math.abs((auc(noise, y) as number) - 0.5)).toBeLessThan(0.05);
    expect(auc(signal, y) as number).toBeGreaterThan(0.6);
  });
});

describe("tabela de confiabilidade e ECE", () => {
  const p = [0.05, 0.05, 0.05, 0.95, 0.95, 0.95];
  const y = [0, 0, 0, 1, 1, 0];

  test("faixas com amostra suficiente trazem frequência e Wilson; as ralas devolvem null", () => {
    const table = reliabilityTable(p, y, { bins: 10, minPerBin: 3 });
    expect(table).toHaveLength(10);
    expect(table[0]?.n).toBe(3);
    expect(table[0]?.observed).toBe(0);
    expect(table[0]?.wilson).not.toBeNull();
    expect(table[9]?.observed).toBeCloseTo(2 / 3, 12);
    expect(table[4]?.n).toBe(0);
    expect(table[4]?.meanP).toBeNull();
    expect(table[4]?.observed).toBeNull();
    const sparse = reliabilityTable(p, y, { bins: 10, minPerBin: 4 });
    expect(sparse[0]?.observed).toBeNull();
    expect(sparse[0]?.sufficient).toBe(false);
    expect(sparse[0]?.n).toBe(3);
  });

  test("p igual a 1 cai na última faixa", () => {
    const table = reliabilityTable([1], [1], { bins: 5, minPerBin: 1 });
    expect(table[4]?.n).toBe(1);
  });

  test("ECE conhecido", () => {
    // faixa 0: média 0.05, observado 0; faixa 9: média 0.95, observado 2/3
    const expected = (3 * Math.abs(0 - 0.05) + 3 * Math.abs(2 / 3 - 0.95)) / 6;
    expect(ece(p, y, 10) as number).toBeCloseTo(expected, 12);
  });
});

describe("Spearman", () => {
  test("monotônico, inverso, constante e pequeno", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 400])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
    expect(spearman([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
});
