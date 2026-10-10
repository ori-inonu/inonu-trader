import { expect, test } from "bun:test";
import {
  calculateOpportunityScenario,
  normalizeOpportunity,
  screenOpportunity,
  validateOpportunityPolicy,
} from "./okx-opportunities";

const identity = {
  chainIndex: "1",
  tokenContractAddress: "0xabc",
};

const policy = {
  maxPriceAgeMs: 60_000,
  minPoolLiquidityUsd: 10_000,
  minHolders: 100,
  maxTop10HolderPercent: 50,
  maxRiskControlLevel: 2,
};

test("missing market and risk data remains unknown and never qualifies", () => {
  const normalized = normalizeOpportunity({
    identity,
    addressComparison: "case-sensitive",
    observedAtMs: 1_000_000,
  });
  const result = screenOpportunity(normalized, policy);

  expect(normalized.price).toBeNull();
  expect(normalized.priceAgeMs).toBeNull();
  expect(normalized.holders).toBeNull();
  expect(normalized.pools).toBeNull();
  expect(normalized.top10HolderPercent).toBeNull();
  expect(normalized.riskControlLevel).toBeNull();
  expect(normalized.honeypot).toBeNull();
  expect(result.status).toBe("unknown");
  expect(result.executionQualification).toBe("not_qualified");
  expect(result.reasons).toEqual([
    "price_missing",
    "price_time_missing",
    "holders_unknown",
    "pools_unknown",
    "honeypot_unknown",
    "top10_concentration_unknown",
    "risk_control_unknown",
  ]);
});

test("normalizes a matching token and admits only a fully screened research candidate", () => {
  const normalized = normalizeOpportunity({
    identity: { chainIndex: "1", tokenContractAddress: "0xAbC" },
    addressComparison: "case-insensitive",
    observedAtMs: 1_000_000,
    priceInfo: {
      chainIndex: "1",
      tokenContractAddress: "0xabc",
      price: "2.5",
      time: "940000",
      holders: "100",
    },
    honeypotAssessment: "not_detected",
    advancedInfo: {
      chainIndex: "1",
      tokenContractAddress: "0xabc",
      tokenTags: ["smartMoneyBuy"],
      top10HoldPercent: "50",
      riskControlLevel: "2",
    },
    pools: [{ pool: "TOKEN/USDC", poolAddress: "pool-1", liquidityUsd: "10000" }],
  });
  const result = screenOpportunity(normalized, policy);

  expect(normalized.identity).toEqual({ chainIndex: "1", tokenContractAddress: "0xAbC" });
  expect(normalized.price).toBe(2.5);
  expect(normalized.priceAgeMs).toBe(60_000);
  expect(normalized.holders).toBe(100);
  expect(normalized.pools).toEqual([{
    identity: { chainIndex: "1", tokenContractAddress: "0xAbC" },
    poolAddress: "pool-1",
    liquidityUsd: 10_000,
  }]);
  expect(normalized.honeypot).toBe(false);
  expect(normalized.tokenTags).toEqual(["smartMoneyBuy"]);
  expect(normalized.top10HolderPercent).toBe(50);
  expect(normalized.riskControlLevel).toBe(2);
  expect(result).toEqual({
    status: "research_candidate",
    executionQualification: "not_qualified",
    reasons: [],
  });
});

test("scenario costs are explicit, break-even is reported, and equality with the minimum does not pass", () => {
  const scenario = calculateOpportunityScenario({
    entryPriceUsd: 100,
    exitPriceUsd: 110,
    size: 2,
    entryTaxPercent: 1,
    exitTaxPercent: 2,
    entrySlippagePercent: 0.5,
    exitSlippagePercent: 1.5,
    tradingFeeUsd: 1,
    networkFeeUsd: 0.5,
    aiCostUsd: 0.25,
    otherCostUsd: 0.25,
    minimumNetUsd: 7.3,
  });

  expect(scenario.passesNetThreshold).toBe(false);
  expect(scenario.grossUsd).toBeCloseTo(20);
  expect(scenario.variableCostsUsd).toBeCloseTo(10.7);
  expect(scenario.fixedCostsUsd).toBeCloseTo(2);
  expect(scenario.totalCostsUsd).toBeCloseTo(12.7);
  expect(scenario.netUsd).toBeCloseTo(7.3);
  expect(scenario.breakEvenExitPriceUsd).toBeCloseTo(106.21761658031088);
  expect(scenario.executionQualification).toBe("not_qualified");
  expect(calculateOpportunityScenario({
    entryPriceUsd: 100,
    exitPriceUsd: 110,
    size: 2,
    entryTaxPercent: 1,
    exitTaxPercent: 2,
    entrySlippagePercent: 0.5,
    exitSlippagePercent: 1.5,
    tradingFeeUsd: 1,
    networkFeeUsd: 0.5,
    aiCostUsd: 0.25,
    otherCostUsd: 0.25,
    minimumNetUsd: 7.29,
  }).passesNetThreshold).toBe(true);
});

test("rejects invalid economic inputs instead of treating them as zero", () => {
  expect(() => calculateOpportunityScenario({
    entryPriceUsd: 100,
    exitPriceUsd: 110,
    size: 2,
    entryTaxPercent: 1,
    exitTaxPercent: 100,
    entrySlippagePercent: 0.5,
    exitSlippagePercent: 1.5,
    tradingFeeUsd: 1,
    networkFeeUsd: 0.5,
    aiCostUsd: 0.25,
    otherCostUsd: 0.25,
    minimumNetUsd: 0,
  })).toThrow("Invalid opportunity scenario");
});

test("invalid screening thresholds fail before a scan can run", () => {
  expect(() => validateOpportunityPolicy({ ...policy, minPoolLiquidityUsd: -1 })).toThrow(
    "Invalid opportunity screening policy",
  );
});

test("empty tags and risk level zero remain unknown rather than becoming safe defaults", () => {
  const normalized = normalizeOpportunity({
    identity,
    addressComparison: "case-sensitive",
    observedAtMs: 1_000_000,
    advancedInfo: {
      ...identity,
      tokenTags: [],
      riskControlLevel: "0",
      top10HoldPercent: "",
    },
  });

  expect(normalized.honeypot).toBeNull();
  expect(normalized.riskControlLevel).toBeNull();
  expect(normalized.top10HolderPercent).toBeNull();
});

test("OKX market tags do not prove honeypot safety without an explicit assessment", () => {
  const normalized = normalizeOpportunity({
    identity,
    addressComparison: "case-sensitive",
    observedAtMs: 1_000_000,
    advancedInfo: {
      ...identity,
      tokenTags: ["smartMoneyBuy"],
      riskControlLevel: "1",
      top10HoldPercent: "10",
    },
  });

  expect(normalized.tokenTags).toEqual(["smartMoneyBuy"]);
  expect(normalized.honeypot).toBeNull();
});

test("an explicit positive honeypot assessment blocks research screening", () => {
  const normalized = normalizeOpportunity({
    identity,
    addressComparison: "case-sensitive",
    observedAtMs: 1_000_000,
    priceInfo: { ...identity, price: "2.5", time: "940000", holders: "100" },
    advancedInfo: {
      ...identity,
      tokenTags: ["smartMoneyBuy"],
      riskControlLevel: "1",
      top10HoldPercent: "10",
    },
    pools: [{ poolAddress: "pool-1", liquidityUsd: "20000" }],
    honeypotAssessment: "detected",
  });
  const result = screenOpportunity(normalized, policy);

  expect(result.status).toBe("not_qualified");
  expect(result.reasons).toContain("honeypot_detected");
  expect(result.executionQualification).toBe("not_qualified");
});

test("a documented honeypot token tag is a positive block even without a separate assessment", () => {
  const normalized = normalizeOpportunity({
    identity,
    addressComparison: "case-sensitive",
    observedAtMs: 1_000_000,
    advancedInfo: {
      ...identity,
      tokenTags: ["honeypot"],
    },
  });

  expect(normalized.honeypot).toBe(true);
});

test("per-pool screening honors the Jev-selected one-pool rule and blocks stale or unsafe evidence", () => {
  const complete: Parameters<typeof normalizeOpportunity>[0] = {
    identity,
    addressComparison: "case-sensitive",
    observedAtMs: 1_000_000,
    priceInfo: { ...identity, price: "2.5", time: "940000", holders: "100" },
    advancedInfo: {
      ...identity,
      tokenTags: ["smartMoneyBuy"],
      riskControlLevel: "2",
      top10HoldPercent: "50",
    },
    pools: [
      { poolAddress: "pool-ok", liquidityUsd: "10000" },
      { poolAddress: "pool-small", liquidityUsd: "1" },
    ],
    honeypotAssessment: "not_detected",
  };
  const candidate = screenOpportunity(normalizeOpportunity(complete), policy);
  expect(candidate.status).toBe("research_candidate");
  expect(candidate.reasons).toEqual([]);

  const blockedCases: [Parameters<typeof normalizeOpportunity>[0], string][] = [
    [{ ...complete, priceInfo: { ...complete.priceInfo as object, chainIndex: "56" } }, "identity_mismatch"],
    [{ ...complete, priceInfo: { ...complete.priceInfo as object, time: "1000001" } }, "price_time_in_future"],
    [{ ...complete, priceInfo: { ...complete.priceInfo as object, time: "939999" } }, "price_stale"],
    [{ ...complete, priceInfo: { ...complete.priceInfo as object, holders: "99" } }, "holders_below_minimum"],
    [{ ...complete, pools: [{ poolAddress: "pool-small", liquidityUsd: "9999" }] }, "pool_liquidity_below_minimum"],
    [{ ...complete, advancedInfo: { ...complete.advancedInfo as object, top10HoldPercent: "50.1" } }, "top10_concentration_above_maximum"],
    [{ ...complete, advancedInfo: { ...complete.advancedInfo as object, riskControlLevel: "3" } }, "risk_control_above_maximum"],
    [{ ...complete, honeypotAssessment: "detected" }, "honeypot_detected"],
  ];
  for (const [input, reason] of blockedCases) {
    const result = screenOpportunity(normalizeOpportunity(input), policy);
    expect(result.status).toBe("not_qualified");
    expect(result.reasons).toContain(reason);
    expect(result.executionQualification).toBe("not_qualified");
  }
});
