import { describe, expect, test } from "bun:test";
import { fitLogistic, signedLog1p } from "./logistic.ts";
import { auc } from "./scoring.ts";
import { createRng } from "./rng.ts";

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** x1 informativo, x2 ruído, x3 constante, x4 totalmente ausente, x5 informativo e ausente em 40% das linhas. */
function dataset(n: number, seed: number): { rows: Array<Array<number | null>>; y: number[] } {
  const rng = createRng(seed);
  const rows: Array<Array<number | null>> = [];
  const y: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const x1 = (rng() - 0.5) * 6;
    const x2 = (rng() - 0.5) * 6;
    const x5raw = (rng() - 0.5) * 6;
    const missing5 = rng() < 0.4;
    const z = 1.2 * x1 + (missing5 ? 0 : 0.8 * x5raw);
    y.push(rng() < sigmoid(z) ? 1 : 0);
    rows.push([x1, x2, 7, null, missing5 ? null : x5raw]);
  }
  return { rows, y };
}
const NAMES = ["x1", "x2", "x3", "x4", "x5"];

describe("regressão logística regularizada", () => {
  const { rows, y } = dataset(1200, 31);

  test("aprende o sinal, descarta coluna constante e sem dado, e cria indicador de ausente", () => {
    const model = fitLogistic(rows, y, NAMES, { lambda: 1 }) as NonNullable<ReturnType<typeof fitLogistic>>;
    expect(model).not.toBeNull();
    expect(model.dropped).toEqual([
      { column: "x3", reason: "constante" },
      { column: "x4", reason: "sem_dado" },
    ]);
    expect(model.features).toContain("x5__ausente");
    expect(model.features).not.toContain("x1__ausente");
    const weight = (name: string): number => model.weights[model.features.indexOf(name)] as number;
    expect(weight("x1")).toBeGreaterThan(0.8);
    expect(Math.abs(weight("x2"))).toBeLessThan(0.25);
    const test = dataset(800, 99);
    const preds = test.rows.map((r) => model.predict(r));
    expect(auc(preds, test.y) as number).toBeGreaterThan(0.8);
    for (const p of preds) expect(p > 0 && p < 1).toBe(true);
  });

  test("é determinístico", () => {
    const a = fitLogistic(rows, y, NAMES);
    const b = fitLogistic(rows, y, NAMES);
    expect(a?.weights).toEqual(b?.weights);
    expect(a?.bias).toBe(b?.bias);
  });

  test("crista maior encolhe os pesos", () => {
    const light = fitLogistic(rows, y, NAMES, { lambda: 0.1 }) as NonNullable<ReturnType<typeof fitLogistic>>;
    const heavy = fitLogistic(rows, y, NAMES, { lambda: 500 }) as NonNullable<ReturnType<typeof fitLogistic>>;
    const norm = (m: typeof light): number => Math.sqrt(m.weights.reduce((s, w) => s + w * w, 0));
    expect(norm(heavy)).toBeLessThan(norm(light) * 0.5);
  });

  test("linha com valor ausente ou fora da faixa não quebra a previsão", () => {
    const model = fitLogistic(rows, y, NAMES) as NonNullable<ReturnType<typeof fitLogistic>>;
    expect(Number.isFinite(model.predict([null, null, 7, null, null]))).toBe(true);
    const extreme = model.predict([1e9, -1e9, 7, null, 1e9]);
    expect(extreme >= 0 && extreme <= 1).toBe(true);
    expect(() => model.predict([1, 2])).toThrow(RangeError);
  });

  test("sem as duas classes ou poucas linhas: null; coeficientes ordenados por magnitude", () => {
    expect(fitLogistic(rows.slice(0, 20), y.slice(0, 20), NAMES)).toBeNull();
    expect(fitLogistic(rows, new Array(rows.length).fill(1), NAMES)).toBeNull();
    const model = fitLogistic(rows, y, NAMES) as NonNullable<ReturnType<typeof fitLogistic>>;
    const coefs = model.coefficients();
    expect(coefs[0]?.feature).toBe("x1");
    for (let i = 1; i < coefs.length; i += 1) expect(Math.abs(coefs[i - 1]?.weight as number)).toBeGreaterThanOrEqual(Math.abs(coefs[i]?.weight as number));
  });

  test("com todas as colunas descartadas devolve a taxa-base", () => {
    const flat = Array.from({ length: 40 }, () => [1, null] as Array<number | null>);
    const labels = Array.from({ length: 40 }, (_, i) => (i < 10 ? 1 : 0));
    const model = fitLogistic(flat, labels, ["a", "b"]) as NonNullable<ReturnType<typeof fitLogistic>>;
    expect(model.features).toHaveLength(0);
    expect(model.predict([1, null])).toBeCloseTo(0.25, 10);
  });

  test("entrada malformada lança", () => {
    expect(() => fitLogistic([[1, 2]], [1, 0], ["a", "b"])).toThrow(RangeError);
    expect(() => fitLogistic([[1]], [1], ["a", "b"])).toThrow(RangeError);
    expect(() => fitLogistic(rows, rows.map(() => 2), NAMES)).toThrow(RangeError);
  });

  test("signedLog1p preserva o sinal e comprime a cauda", () => {
    expect(signedLog1p(0)).toBe(0);
    expect(signedLog1p(-3)).toBeCloseTo(-Math.log(4), 12);
    expect(signedLog1p(1000)).toBeLessThan(8);
  });
});
