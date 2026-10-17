import { expect, test } from "bun:test";
import { N, PORTFOLIO, generate, legacySizing, mulberry32, percentile } from "./bench-decision";

test("legacySizing: inteiro, não negativo e nunca acima do caixa reservado", () => {
  for (const o of generate(2_000)) {
    const usd = legacySizing(o);
    expect(Number.isInteger(usd)).toBe(true);
    expect(usd).toBeGreaterThanOrEqual(0);
    expect(usd).toBeLessThanOrEqual(PORTFOLIO.cashUsd * 0.8);
  }
});

test("mulberry32: mesma seed gera a mesma sequência, valores em [0,1)", () => {
  const a = mulberry32(123), b = mulberry32(123);
  const xs = Array.from({ length: 1000 }, () => a());
  expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
  expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
});

test("generate: determinístico, N >= 20000, oportunidades com campos válidos", () => {
  expect(N).toBeGreaterThanOrEqual(20_000);
  const opps = generate(N);
  expect(opps).toEqual(generate(N));
  expect(new Set(opps.map((o) => o.id)).size).toBe(N);
  for (const o of opps) {
    expect(o.pWin).toBeGreaterThanOrEqual(0);
    expect(o.pWin).toBeLessThanOrEqual(1);
    expect(o.riskScore).toBeGreaterThanOrEqual(0);
    expect(o.riskScore).toBeLessThanOrEqual(1);
    expect(o.quoteAtMs).toBeLessThanOrEqual(o.atMs);
    expect(o.costs.failProb).toBeGreaterThanOrEqual(0);
    expect(o.costs.failProb).toBeLessThanOrEqual(1);
    expect(o.liquidityUsd).toBeGreaterThan(0);
  }
});

test("percentile: nearest-rank sobre 1..100", () => {
  const xs = Float64Array.from({ length: 100 }, (_, i) => i + 1);
  expect(percentile(xs, 50)).toBe(50);
  expect(percentile(xs, 95)).toBe(95);
  expect(percentile(xs, 99)).toBe(99);
  expect(percentile(xs, 100)).toBe(100);
});
