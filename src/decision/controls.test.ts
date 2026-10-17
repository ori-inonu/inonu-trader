import { expect, test } from "bun:test";
import {
  assertPaperOrReplay,
  breakerAllow,
  breakerRecord,
  checkControls,
  checkLimits,
  createGuard,
  nextNonce,
} from "./controls";
import type { Costs, Limits, Mode, Opportunity, Portfolio } from "./types";

const NOW = 1_000_000;
const clock = { now: () => NOW };
const costs: Costs = {
  dexFeeBps: 15, spreadBps: 10, slippageBps: 10, impactBps: 2.5, mevBps: 2.5, exitExtraBps: 0,
  gasUsd: 1, failProb: 0.1, failCostUsd: 0.5,
};
const opp: Opportunity = {
  id: "opp-1", venue: "dex", chain: "base", symbol: "TOKEN", side: "buy",
  atMs: NOW, quoteAtMs: NOW, priceUsd: 1, upBps: 200, downBps: 100, pWin: 0.7,
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

test("live é recusado; replay e paper passam", () => {
  expect(() => assertPaperOrReplay("live")).toThrow();
  expect(() => createGuard({ mode: "live" as Mode, failureThreshold: 3, cooldownMs: 1000 })).toThrow();
  expect(() => assertPaperOrReplay("replay")).not.toThrow();
  expect(() => assertPaperOrReplay("paper")).not.toThrow();
});

test("breaker abre após N falhas consecutivas e fica fechado antes disso", () => {
  const b = createGuard({ mode: "paper", failureThreshold: 3, cooldownMs: 1000 }).breaker;
  breakerRecord(b, false, 0);
  breakerRecord(b, false, 0);
  breakerRecord(b, true, 0); // sucesso zera a contagem
  breakerRecord(b, false, 0);
  breakerRecord(b, false, 0);
  expect(breakerAllow(b, 0)).toBe(true);
  breakerRecord(b, false, 0); // terceira seguida
  expect(breakerAllow(b, 0)).toBe(false);
});

test("breaker vai a meio-aberto após o cooldown e reabre na falha da prova", () => {
  const b = createGuard({ mode: "paper", failureThreshold: 1, cooldownMs: 1000 }).breaker;
  breakerRecord(b, false, 0);
  expect(breakerAllow(b, 999)).toBe(false);
  expect(breakerAllow(b, 1000)).toBe(true);
  expect(b.state).toBe("half-open");
  breakerRecord(b, false, 1000);
  expect(breakerAllow(b, 1999)).toBe(false);
  expect(breakerAllow(b, 2000)).toBe(true);
});

test("sucesso em meio-aberto fecha o breaker", () => {
  const b = createGuard({ mode: "paper", failureThreshold: 1, cooldownMs: 1000 }).breaker;
  breakerRecord(b, false, 0);
  breakerAllow(b, 1000);
  breakerRecord(b, true, 1000);
  expect(b.state).toBe("closed");
});

test("breaker aberto bloqueia checkControls sem consumir o id", () => {
  const guard = createGuard({ mode: "paper", failureThreshold: 1, cooldownMs: 1000 });
  breakerRecord(guard.breaker, false, NOW);
  expect(checkControls(opp, port, limits, guard, clock)).toBe("breaker_open");
  expect(guard.decided.has(opp.id)).toBe(false);
});

test("oportunidade duplicada é rejeitada com 'duplicate'", () => {
  const guard = createGuard({ mode: "paper", failureThreshold: 3, cooldownMs: 1000 });
  expect(checkControls(opp, port, limits, guard, clock)).toBe("ok");
  expect(checkControls(opp, port, limits, guard, clock)).toBe("duplicate");
  expect(checkControls({ ...opp, id: "opp-2" }, port, limits, guard, clock)).toBe("ok");
});

test("exposição por símbolo acima do teto vira exposure_limit", () => {
  expect(checkLimits(200, "TOKEN", { ...port, exposureUsd: { TOKEN: 900 } }, limits)).toBe("exposure_limit");
  expect(checkLimits(100, "TOKEN", { ...port, exposureUsd: { TOKEN: 900 } }, limits)).toBe("ok");
});

test("exposição bruta acima do teto vira exposure_limit", () => {
  expect(checkLimits(600, "TOKEN", { ...port, exposureUsd: { OTHER: 9_500 } }, limits)).toBe("exposure_limit");
});

test("nextNonce é monotônico e puro", () => {
  const first = nextNonce({ last: 0 });
  expect(first.nonce).toBe(1);
  expect(nextNonce({ last: 0 }).nonce).toBe(1);
  expect(nextNonce(first.state).nonce).toBe(2);
});
