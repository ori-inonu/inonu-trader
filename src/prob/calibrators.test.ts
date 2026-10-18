import { describe, expect, test } from "bun:test";
import { fitBinned, fitIsotonic, fitPlatt } from "./calibrators.ts";
import { createRng } from "./rng.ts";

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));
const logit = (p: number): number => Math.log(p / (1 - p));

/** Escores uniformes em (0.02, 0.98) e desfechos com P(y=1) = sigmoid(slope * logit(p) + intercept). */
function synthetic(n: number, slope: number, intercept: number, seed: number): { p: number[]; y: number[] } {
  const rng = createRng(seed);
  const p: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const s = 0.02 + 0.96 * rng();
    p.push(s);
    y.push(rng() < sigmoid(slope * logit(s) + intercept) ? 1 : 0);
  }
  return { p, y };
}

describe("calibrador por faixas", () => {
  test("frequência por faixa com cortes explícitos; faixa rala devolve null", () => {
    const p = [0.1, 0.1, 0.2, 0.2, 0.8, 0.8, 0.9, 0.95];
    const y = [0, 0, 0, 1, 1, 1, 1, 0];
    const cal = fitBinned(p, y, { edges: [0.5], minPerBin: 4 });
    expect(cal).not.toBeNull();
    expect(cal?.predict(0.15)).toBe(0.25);
    expect(cal?.predict(0.85)).toBe(0.75);
    const strict = fitBinned(p, y, { edges: [0.5, 0.9], minPerBin: 4 });
    // a faixa (0.9, 1] tem só 1 amostra: sem base para responder
    expect(strict?.predict(0.99)).toBeNull();
    expect(strict?.predict(0.15)).toBe(0.25);
    expect(strict?.predict(Number.NaN)).toBeNull();
  });

  test("faixas por quantis e cortes duplicados são fundidos", () => {
    const rng = createRng(3);
    const p = Array.from({ length: 200 }, () => rng());
    const y = p.map((v) => (rng() < v ? 1 : 0));
    const cal = fitBinned(p, y, { bins: 4, minPerBin: 20 }) as NonNullable<ReturnType<typeof fitBinned>>;
    const edges = cal.describe().edges as number[];
    expect(edges).toHaveLength(3);
    for (let i = 1; i < edges.length; i += 1) expect(edges[i] as number).toBeGreaterThan(edges[i - 1] as number);
    const flat = fitBinned(new Array(40).fill(0.5).map((v, i) => (i % 2 === 0 ? v : 0.5)), Array.from({ length: 40 }, (_, i) => i % 2), { bins: 5, minPerBin: 10 });
    expect((flat?.describe().edges as number[]).length).toBeLessThanOrEqual(1);
  });

  test("pseudo-contagens puxam para a taxa-base e a amostra mínima é respeitada", () => {
    const p = [0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9];
    const y = [0, 0, 0, 0, 1, 1, 1, 1];
    const raw = fitBinned(p, y, { edges: [0.5], minPerBin: 2 });
    const shrunk = fitBinned(p, y, { edges: [0.5], minPerBin: 2, priorStrength: 4 });
    expect(raw?.predict(0.1)).toBe(0);
    expect(shrunk?.predict(0.1)).toBeCloseTo((0 + 4 * 0.5) / (4 + 4), 12);
  });

  test("sem as duas classes ou sem dados: null; entrada inválida lança", () => {
    expect(fitBinned([0.2, 0.3], [0, 0])).toBeNull();
    expect(fitBinned([], [])).toBeNull();
    expect(() => fitBinned([1.5], [1])).toThrow(RangeError);
    expect(() => fitBinned([0.5, 0.6], [1])).toThrow(RangeError);
    expect(() => fitBinned([0.5, 0.6], [0, 1], { edges: [0.5, 0.5] })).toThrow(RangeError);
  });
});

describe("calibrador isotônico", () => {
  test("PAV conhecido: [0,1,0,1,1,1] funde o par violador em 0,5", () => {
    const p = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const y = [0, 1, 0, 1, 1, 1];
    const cal = fitIsotonic(p, y, { minSamples: 6 }) as NonNullable<ReturnType<typeof fitIsotonic>>;
    expect(cal.predict(0.1)).toBe(0);
    expect(cal.predict(0.2)).toBe(0.5);
    expect(cal.predict(0.3)).toBe(0.5);
    expect(cal.predict(0.5)).toBe(1);
    // clipe nas pontas
    expect(cal.predict(0)).toBe(0);
    expect(cal.predict(1)).toBe(1);
  });

  test("a saída é monotônica não decrescente em toda a grade, mesmo com dado ruidoso", () => {
    const { p, y } = synthetic(400, 1, 0, 8);
    const cal = fitIsotonic(p, y) as NonNullable<ReturnType<typeof fitIsotonic>>;
    let last = -1;
    for (let i = 0; i <= 200; i += 1) {
      const v = cal.predict(i / 200) as number;
      expect(v).toBeGreaterThanOrEqual(last - 1e-12);
      expect(v >= 0 && v <= 1).toBe(true);
      last = v;
    }
  });

  test("escores empatados entram como um só ponto e pouca amostra devolve null", () => {
    const p = [0.3, 0.3, 0.3, 0.3, 0.7, 0.7, 0.7, 0.7];
    const y = [0, 0, 1, 0, 1, 1, 1, 0];
    const cal = fitIsotonic(p, y, { minSamples: 8 });
    expect(cal?.predict(0.3)).toBe(0.25);
    expect(cal?.predict(0.7)).toBe(0.75);
    expect(fitIsotonic(p, y)).toBeNull();
    expect(fitIsotonic([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1], { minSamples: 4 })).toBeNull();
  });
});

describe("Platt", () => {
  test("recupera inclinação e intercepto de um gerador conhecido", () => {
    const { p, y } = synthetic(6000, 2, 0.5, 4);
    const cal = fitPlatt(p, y) as NonNullable<ReturnType<typeof fitPlatt>>;
    const params = cal.describe() as { slope: number; intercept: number };
    expect(Math.abs(params.slope - 2)).toBeLessThan(0.3);
    expect(Math.abs(params.intercept - 0.5)).toBeLessThan(0.2);
    expect(cal.predict(0.5) as number).toBeGreaterThan(0.55);
  });

  test("escores já calibrados ficam quase inalterados", () => {
    const { p, y } = synthetic(6000, 1, 0, 5);
    const cal = fitPlatt(p, y) as NonNullable<ReturnType<typeof fitPlatt>>;
    for (const v of [0.1, 0.3, 0.5, 0.7, 0.9]) expect(Math.abs((cal.predict(v) as number) - v)).toBeLessThan(0.06);
  });

  test("amostra pequena, classe única e entrada inválida", () => {
    expect(fitPlatt([0.1, 0.9], [0, 1])).toBeNull();
    expect(fitPlatt(new Array(50).fill(0.5), new Array(50).fill(1))).toBeNull();
    const { p, y } = synthetic(100, 1, 0, 6);
    const cal = fitPlatt(p, y);
    expect(cal?.predict(-0.1)).toBeNull();
    expect(cal?.predict(Number.NaN)).toBeNull();
    // escore exatamente 0 ou 1 não explode
    expect(Number.isFinite(cal?.predict(0) as number)).toBe(true);
    expect(Number.isFinite(cal?.predict(1) as number)).toBe(true);
  });

  test("separação perfeita não diverge (alvos suavizados)", () => {
    const p = Array.from({ length: 60 }, (_, i) => (i < 30 ? 0.1 : 0.9));
    const y = Array.from({ length: 60 }, (_, i) => (i < 30 ? 0 : 1));
    const cal = fitPlatt(p, y) as NonNullable<ReturnType<typeof fitPlatt>>;
    const hi = cal.predict(0.9) as number;
    const lo = cal.predict(0.1) as number;
    expect(hi).toBeLessThan(1);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(0.9);
    expect(lo).toBeLessThan(0.1);
  });
});
