import { describe, expect, test } from "bun:test";
import { clusterBootstrap, clusterBootstrapDraws, doubleClusterCi, intervalFromDraws, mean, median, quantile, wilson } from "./intervals.ts";
import { createRng } from "./rng.ts";

describe("wilson", () => {
  test("valores conhecidos", () => {
    const zero = wilson(0, 10) as [number, number];
    expect(zero[0]).toBe(0);
    expect(zero[1]).toBeCloseTo(0.2775, 3);
    const half = wilson(5, 10) as [number, number];
    expect(half[0]).toBeCloseTo(0.2366, 3);
    expect(half[1]).toBeCloseTo(0.7634, 3);
  });

  test("sem amostra devolve null e contagem inválida lança", () => {
    expect(wilson(0, 0)).toBeNull();
    expect(() => wilson(3, 2)).toThrow(RangeError);
    expect(() => wilson(1.5, 4)).toThrow(RangeError);
  });
});

describe("quantis e médias", () => {
  test("interpolação linear e null para vazio", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([], 0.5)).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(mean([])).toBeNull();
    expect(mean([1, 2, Number.NaN, 3])).toBe(2);
  });
});

describe("cluster bootstrap", () => {
  const rng = createRng(11);
  // 12 tokens, cada um com 8 linhas; o nível do token varia (dependência dentro do token)
  const rows: Array<{ token: string; v: number }> = [];
  for (let t = 0; t < 12; t += 1) {
    const level = (rng() - 0.5) * 2;
    for (let i = 0; i < 8; i += 1) rows.push({ token: `T${t}`, v: level + (rng() - 0.5) * 0.2 });
  }
  const statistic = (rs: readonly { v: number }[]): number | null => (rs.length === 0 ? null : rs.reduce((s, r) => s + r.v, 0) / rs.length);

  test("é determinístico para a mesma semente e muda com outra", () => {
    const a = clusterBootstrap(rows, (r) => r.token, statistic, { resamples: 300, seed: 5 });
    const b = clusterBootstrap(rows, (r) => r.token, statistic, { resamples: 300, seed: 5 });
    const c = clusterBootstrap(rows, (r) => r.token, statistic, { resamples: 300, seed: 6 });
    expect(a).toEqual(b);
    expect(a.lo).not.toBe(c.lo);
    expect(a.reason).toBeNull();
    expect(a.clusters).toBe(12);
  });

  test("o intervalo por token é mais largo que o intervalo que trata linhas como independentes", () => {
    const byToken = clusterBootstrap(rows, (r) => r.token, statistic, { resamples: 500, seed: 3 });
    const byRow = clusterBootstrap(rows, (r) => `${r.token}${r.v}`, statistic, { resamples: 500, seed: 3 });
    const widthToken = (byToken.hi as number) - (byToken.lo as number);
    const widthRow = (byRow.hi as number) - (byRow.lo as number);
    expect(widthToken).toBeGreaterThan(widthRow * 1.5);
    expect(byToken.estimate as number).toBeGreaterThanOrEqual(byToken.lo as number);
    expect(byToken.estimate as number).toBeLessThanOrEqual(byToken.hi as number);
  });

  test("poucos agrupamentos ou estatística indefinida: sem intervalo, com motivo", () => {
    const few = clusterBootstrap(rows.slice(0, 16), (r) => r.token, statistic, { resamples: 100, seed: 1 });
    expect(few.lo).toBeNull();
    expect(few.reason).toBe("poucos_agrupamentos");
    const none = clusterBootstrap(rows, (r) => r.token, () => null, { resamples: 100, seed: 1 });
    expect(none.reason).toBe("sem_estimativa");
    const empty = clusterBootstrap([], (r: { token: string }) => r.token, statistic as never, { resamples: 10, seed: 1 });
    expect(empty.estimate).toBeNull();
  });

  test("réplicas inválidas demais anulam o intervalo", () => {
    let calls = 0;
    const flaky = (rs: readonly unknown[]): number | null => {
      calls += 1;
      return calls === 1 ? 0.5 : rs.length > 1_000_000 ? 1 : null;
    };
    const result = clusterBootstrap(rows, (r) => r.token, flaky, { resamples: 50, seed: 2 });
    expect(result.reason).toBe("poucas_replicas_validas");
    expect(result.lo).toBeNull();
  });

  test("duplo agrupamento devolve a envoltória", () => {
    const withBlock = rows.map((r, i) => ({ ...r, block: `B${i % 4}` }));
    const ci = doubleClusterCi(withBlock, (r) => r.token, (r) => r.block, statistic, { resamples: 300, seed: 9 });
    expect(ci.byToken.lo).not.toBeNull();
    expect(ci.byTime.lo).not.toBeNull();
    const conservative = ci.conservative as [number, number];
    expect(conservative[0]).toBeLessThanOrEqual(Math.min(ci.byToken.lo as number, ci.byTime.lo as number) + 1e-12);
    expect(conservative[1]).toBeGreaterThanOrEqual(Math.max(ci.byToken.hi as number, ci.byTime.hi as number) - 1e-12);
  });

  test("níveis extras saem do mesmo sorteio: alfa menor dá intervalo mais largo", () => {
    const withBlock = rows.map((r, i) => ({ ...r, block: `B${i % 4}` }));
    const ci = doubleClusterCi(withBlock, (r) => r.token, (r) => r.block, statistic, { resamples: 400, seed: 9, extraAlphas: [0.01, 0.001] });
    expect(ci.extra).toHaveLength(2);
    const base = ci.conservative as [number, number];
    const wide = ci.extra[0]!.conservative as [number, number];
    const wider = ci.extra[1]!.conservative as [number, number];
    expect(wide[0]).toBeLessThanOrEqual(base[0]);
    expect(wide[1]).toBeGreaterThanOrEqual(base[1]);
    expect(wider[0]).toBeLessThanOrEqual(wide[0]);
    expect(wider[1]).toBeGreaterThanOrEqual(wide[1]);
  });

  test("intervalFromDraws: null com sorteio sem intervalo e erro com alfa inválido", () => {
    const draws = clusterBootstrapDraws(rows, (r) => r.token, statistic, { resamples: 100, seed: 1 });
    expect(intervalFromDraws(draws, 0.1)).not.toBeNull();
    const none = clusterBootstrapDraws(rows.slice(0, 16), (r) => r.token, statistic, { resamples: 100, seed: 1 });
    expect(none.reason).toBe("poucos_agrupamentos");
    expect(intervalFromDraws(none)).toBeNull();
    expect(() => intervalFromDraws(draws, 1.5)).toThrow(RangeError);
    expect(() => clusterBootstrap(rows, (r) => r.token, statistic, { resamples: 0, seed: 1 })).toThrow(RangeError);
  });
});
