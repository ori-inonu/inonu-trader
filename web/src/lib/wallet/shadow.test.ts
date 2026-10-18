import { expect, test } from "bun:test";
import { reconcileValue, markShadow, compareShadow } from "./shadow";
import type { PortfolioAnswer } from "../inonu/portfolio";

const row = { chainIndex: "501", tokenAddress: "Mint", symbol: "A", balance: 20, priceUsd: 2, valueUsd: 40, flaggedRisk: false };
const plan = (action: "buy" | "sell" | "hold" = "buy"): PortfolioAnswer => ({
  chainIndex: "501", observedAtMs: 1_000, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: false,
  assets: [{ contract: "Mint", symbol: "A", balance: "20", candidateId: "token:501:Mint", action, model: "fixture", evidence: { origin: "onchainos", ageMs: 0, gaps: [], flow: null, risk: null, market: { priceUsd: 2, liquidityUsd: null, changePct: { m5: null, h1: null, h4: null, h24: null }, volumeUsd: { m5: null, h1: null, h4: null, h24: null }, ageMs: 0, stale: false } } }],
});
test("reconciliation keeps missing prices and provider divergence visible", () => {
  expect(reconcileValue([row, { ...row, tokenAddress: "Other", valueUsd: null, priceUsd: null }], 2, 80)).toEqual({ knownUsd: 40, unpriced: 1, omitted: 0, providerUsd: 80, differenceUsd: 40 });
  expect(reconcileValue([], 0, null).knownUsd).toBe(0);
});
test("shadow waits for a later fresh observation, identifies token and keeps unknown cost null", () => {
  const marks = markShadow(plan(), 1, 1_000);
  expect(compareShadow(marks[0]!, [row], 1_000, 0, 1_000, null, 1_000).grossVsHoldUsd).toBeNull();
  expect(compareShadow(marks[0]!, [{ ...row, priceUsd: 3 }], 2_000, 0, 2_000, null, 2_000)).toMatchObject({ grossVsHoldUsd: 0.5, netVsHoldUsd: null });
  expect(compareShadow(marks[0]!, [{ ...row, tokenAddress: "Other", priceUsd: 3 }], 2_000, 0, 2_000, null, 2_000).grossVsHoldUsd).toBeNull();
  expect(compareShadow(marks[0]!, [row], 70_000, 61_000, 70_000, null, 9_000).grossVsHoldUsd).toBeNull();
});
test("sell comparator is bounded by held value; hold does not earn an artificial return", () => {
  const sale = markShadow(plan("sell"), 100, 1_000)[0]!;
  expect(sale.exposureUsd).toBe(40);
  expect(compareShadow(sale, [{ ...row, priceUsd: 1 }], 2_000, 0, 2_000, null, 2_000).grossVsHoldUsd).toBe(20);
  expect(compareShadow(markShadow(plan("hold"), 1, 1_000)[0]!, [row], 2_000, 0, 2_000, null, 2_000).netVsHoldUsd).toBe(0);
});
test("unknown quote units never certify net, price impact is not charged again", () => {
  const mark = markShadow(plan(), 1, 1_000)[0]!;
  expect(compareShadow(mark, [{ ...row, priceUsd: 3 }], 2_000, 0, 2_000, { outputUnitVerified: false, executionDragUsd: 0.1, networkFeeUsd: 0.01 }, 2_000).netVsHoldUsd).toBeNull();
  expect(compareShadow(mark, [{ ...row, priceUsd: 3 }], 2_000, 0, 2_000, { outputUnitVerified: true, executionDragUsd: 0.1, networkFeeUsd: 0.01 }, 2_000).netVsHoldUsd).toBeCloseTo(0.39);
});

test("a delayed response cannot promote a cache from before the shadow mark", () => {
  const mark = markShadow(plan(), 1, 1_500)[0]!;
  expect(compareShadow(mark, [{ ...row, priceUsd: 3 }], 1_600, 0, 1_600,
    { outputUnitVerified: true, executionDragUsd: 0.1, networkFeeUsd: 0.01 }, 1_490))
    .toEqual({ grossVsHoldUsd: null, netVsHoldUsd: null });
});

test("a later cache remains eligible without subtracting its age twice", () => {
  const mark = markShadow(plan(), 1, 1_500)[0]!;
  expect(compareShadow(mark, [{ ...row, priceUsd: 3 }], 1_800, 200, 1_800, null, 1_510))
    .toEqual({ grossVsHoldUsd: 0.5, netVsHoldUsd: null });
});

test.each([
  { reason: "repeated cache at the mark", cachedAtMs: 1_500, ageMs: 0, receivedAtMs: 1_600, nowMs: 1_600 },
  { reason: "unknown cache time", cachedAtMs: null, ageMs: 0, receivedAtMs: 1_600, nowMs: 1_600 },
  { reason: "invalid cache time", cachedAtMs: NaN, ageMs: 0, receivedAtMs: 1_600, nowMs: 1_600 },
  { reason: "cache time after receipt", cachedAtMs: 1_700, ageMs: 0, receivedAtMs: 1_600, nowMs: 1_700 },
  { reason: "receipt after the current clock", cachedAtMs: 1_510, ageMs: 0, receivedAtMs: 1_600, nowMs: 1_550 },
  { reason: "age implies a pre-mark observation", cachedAtMs: 1_510, ageMs: 110, receivedAtMs: 1_600, nowMs: 1_600 },
  { reason: "expired cache despite a later response", cachedAtMs: 1_510, ageMs: 0, receivedAtMs: 61_511, nowMs: 61_511 },
])("shadow rejects $reason", ({ cachedAtMs, ageMs, receivedAtMs, nowMs }: { cachedAtMs: number | null; ageMs: number; receivedAtMs: number; nowMs: number }) => {
  const mark = markShadow(plan(), 1, 1_500)[0]!;
  expect(compareShadow(mark, [{ ...row, priceUsd: 3 }], receivedAtMs, ageMs, nowMs,
    { outputUnitVerified: true, executionDragUsd: 0.1, networkFeeUsd: 0.01 }, cachedAtMs))
    .toEqual({ grossVsHoldUsd: null, netVsHoldUsd: null });
});
