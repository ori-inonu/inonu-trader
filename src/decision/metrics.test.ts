import { describe, expect, test } from "bun:test";
import { dist, maxDrawdown, percentile } from "./metrics";

describe("percentile", () => {
  test("nearest-rank sobre série ordenada", () => {
    const s = Float64Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(100);
    expect(percentile(s, 0)).toBe(10);
    expect(percentile(s, 100)).toBe(100);
  });
  test("série vazia é erro de programação", () => {
    expect(() => percentile([], 50)).toThrow("vazia");
  });
});

describe("dist", () => {
  test("resume uma série, ignora não finitos e devolve null sem dado", () => {
    const d = dist([5, 1, 3, Number.NaN, 2, 4, Number.POSITIVE_INFINITY]);
    expect(d).toEqual({ n: 5, min: 1, p50: 3, p95: 5, p99: 5, mean: 3, max: 5 });
    expect(dist([])).toBeNull();
    expect(dist([Number.NaN])).toBeNull();
  });
});

describe("maxDrawdown", () => {
  const at = (values: number[]) => values.map((value, i) => ({ atMs: i * 1000, value }));

  test("pico a vale em porcentagem do pico, com recuperação", () => {
    const d = maxDrawdown(at([100, 120, 90, 110, 125, 100]))!;
    expect(d.pct).toBe(25);
    expect(d.peak).toBe(120);
    expect(d.trough).toBe(90);
    expect(d.recoveredAtMs).toBe(4000);
  });

  test("sem recuperação o instante é null", () => {
    expect(maxDrawdown(at([100, 80, 90]))!.recoveredAtMs).toBeNull();
  });

  test("série só de alta tem drawdown zero; poucos pontos e valores inválidos não geram número", () => {
    expect(maxDrawdown(at([1, 2, 3]))!.pct).toBe(0);
    expect(maxDrawdown(at([100]))).toBeNull();
    expect(maxDrawdown(at([100, 0, -5, Number.NaN]))).toBeNull();
  });
});
