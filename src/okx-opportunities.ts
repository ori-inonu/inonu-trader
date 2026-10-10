import type { TokenIdentity } from "./okx-api";
import { tokenAddressesEqual } from "./okx-market/token-identity";

export type AddressComparison = "case-sensitive" | "case-insensitive";
export type OpportunityStatus = "research_candidate" | "not_qualified" | "unknown";

export interface OpportunityPolicy {
  maxPriceAgeMs: number;
  minPoolLiquidityUsd: number;
  minHolders: number;
  maxTop10HolderPercent: number;
  maxRiskControlLevel: number;
}

export interface OpportunityInput {
  identity: TokenIdentity;
  /** Retained for compatibility; chain identity policy determines address matching. */
  addressComparison: AddressComparison;
  observedAtMs: number;
  priceInfo?: unknown;
  advancedInfo?: unknown;
  pools?: unknown;
  /** Independent security evidence; OKX market tags alone cannot establish this verdict. */
  honeypotAssessment?: "detected" | "not_detected" | null;
}

export interface NormalizedPool {
  identity: TokenIdentity;
  poolAddress: string | null;
  liquidityUsd: number | null;
}

export interface NormalizedOpportunity {
  identity: TokenIdentity;
  observedAtMs: number;
  identityCompatible: boolean;
  price: number | null;
  priceTimeMs: number | null;
  priceAgeMs: number | null;
  holders: number | null;
  pools: NormalizedPool[] | null;
  tokenTags: string[] | null;
  honeypot: boolean | null;
  top10HolderPercent: number | null;
  riskControlLevel: number | null;
}

export interface OpportunityScreening {
  status: OpportunityStatus;
  executionQualification: "not_qualified";
  reasons: string[];
}

export interface OpportunityScenarioInput {
  entryPriceUsd: number;
  exitPriceUsd: number;
  size: number;
  entryTaxPercent: number;
  exitTaxPercent: number;
  entrySlippagePercent: number;
  exitSlippagePercent: number;
  tradingFeeUsd: number;
  networkFeeUsd: number;
  aiCostUsd: number;
  otherCostUsd: number;
  minimumNetUsd: number;
}

export interface OpportunityScenario {
  passesNetThreshold: boolean;
  grossUsd: number;
  variableCostsUsd: number;
  fixedCostsUsd: number;
  totalCostsUsd: number;
  netUsd: number;
  breakEvenExitPriceUsd: number;
  executionQualification: "not_qualified";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && (value.length === 0 || value.trim() !== value)) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesIdentity(value: unknown, identity: TokenIdentity): boolean {
  if (!isRecord(value) || typeof value.chainIndex !== "string" || typeof value.tokenContractAddress !== "string")
    return false;
  return value.chainIndex === identity.chainIndex &&
    tokenAddressesEqual(identity.chainIndex, value.tokenContractAddress, identity.tokenContractAddress);
}

function validIdentity(identity: TokenIdentity): boolean {
  return typeof identity.chainIndex === "string" && /^\d{1,12}$/.test(identity.chainIndex) &&
    typeof identity.tokenContractAddress === "string" && identity.tokenContractAddress.length > 0 &&
    identity.tokenContractAddress.trim() === identity.tokenContractAddress;
}

function parsedPercent(value: unknown): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parsedCount(value: unknown): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parsedRiskLevel(value: unknown): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

export function normalizeOpportunity(input: OpportunityInput): NormalizedOpportunity {
  const { identity, observedAtMs } = input;
  const identityCopy = { ...identity };
  const rawPriceInfo = isRecord(input.priceInfo) ? input.priceInfo : null;
  const rawAdvancedInfo = isRecord(input.advancedInfo) ? input.advancedInfo : null;
  const priceInfo = matchesIdentity(rawPriceInfo, identity) ? rawPriceInfo : null;
  const advancedInfo = matchesIdentity(rawAdvancedInfo, identity) ? rawAdvancedInfo : null;
  let identityCompatible = validIdentity(identity) &&
    (input.addressComparison === "case-sensitive" || input.addressComparison === "case-insensitive");

  if (input.priceInfo !== undefined && !priceInfo)
    identityCompatible = false;
  if (input.advancedInfo !== undefined && !advancedInfo)
    identityCompatible = false;

  const price = priceInfo ? parseNumber(priceInfo.price) : null;
  const normalizedPrice = price !== null && price > 0 ? price : null;
  const rawPriceTime = priceInfo ? parsedCount(priceInfo.time) : null;
  const priceTimeMs = rawPriceTime;
  const priceAgeMs = priceTimeMs !== null && Number.isSafeInteger(observedAtMs) && observedAtMs >= 0
    ? observedAtMs - priceTimeMs
    : null;
  const holders = priceInfo ? parsedCount(priceInfo.holders) : null;
  const rawTags = advancedInfo?.tokenTags;
  const tokenTags = Array.isArray(rawTags) && rawTags.length > 0 && rawTags.every((tag) =>
    typeof tag === "string" && tag.length > 0 && tag.trim() === tag,
  ) ? [...rawTags] as string[] : null;
  const taggedHoneypot = tokenTags?.some((tag) => tag.toLowerCase() === "honeypot") ?? false;
  const honeypot = input.honeypotAssessment === "detected" || taggedHoneypot
    ? true
    : input.honeypotAssessment === "not_detected" ? false : null;
  const riskControlLevel = advancedInfo ? parsedRiskLevel(advancedInfo.riskControlLevel) : null;
  const top10HolderPercent = advancedInfo ? parsedPercent(advancedInfo.top10HoldPercent) : null;
  const pools = Array.isArray(input.pools)
    ? input.pools.map((value): NormalizedPool => {
      const pool = isRecord(value) ? value : null;
      const poolAddress = typeof pool?.poolAddress === "string" && pool.poolAddress.length > 0 &&
        pool.poolAddress.trim() === pool.poolAddress ? pool.poolAddress : null;
      const liquidity = pool ? parseNumber(pool.liquidityUsd) : null;
      return {
        identity: { ...identityCopy },
        poolAddress,
        liquidityUsd: liquidity !== null && liquidity >= 0 ? liquidity : null,
      };
    })
    : null;

  return {
    identity: identityCopy,
    observedAtMs,
    identityCompatible,
    price: normalizedPrice,
    priceTimeMs,
    priceAgeMs,
    holders,
    pools,
    tokenTags,
    honeypot,
    top10HolderPercent,
    riskControlLevel,
  };
}

export function validateOpportunityPolicy(value: unknown): asserts value is OpportunityPolicy {
  if (!isRecord(value) || typeof value.maxPriceAgeMs !== "number" || !Number.isSafeInteger(value.maxPriceAgeMs) || value.maxPriceAgeMs < 0 ||
    typeof value.minPoolLiquidityUsd !== "number" || !Number.isFinite(value.minPoolLiquidityUsd) || value.minPoolLiquidityUsd < 0 ||
    typeof value.minHolders !== "number" || !Number.isSafeInteger(value.minHolders) || value.minHolders < 0 ||
    typeof value.maxTop10HolderPercent !== "number" || !Number.isFinite(value.maxTop10HolderPercent) ||
    value.maxTop10HolderPercent < 0 || value.maxTop10HolderPercent > 100 ||
    typeof value.maxRiskControlLevel !== "number" || !Number.isInteger(value.maxRiskControlLevel) ||
    value.maxRiskControlLevel < 1 || value.maxRiskControlLevel > 5)
    throw new Error("Invalid opportunity screening policy");
}

export function screenOpportunity(
  opportunity: NormalizedOpportunity,
  policy: OpportunityPolicy,
): OpportunityScreening {
  validateOpportunityPolicy(policy);
  const reasons: string[] = [];
  let blocked = false;
  if (!opportunity.identityCompatible) {
    reasons.push("identity_mismatch");
    blocked = true;
  }
  if (opportunity.price === null) reasons.push("price_missing");
  if (opportunity.priceTimeMs === null) {
    reasons.push("price_time_missing");
  } else if (opportunity.priceAgeMs === null) {
    reasons.push("observation_time_unknown");
  } else if (opportunity.priceAgeMs < 0) {
    reasons.push("price_time_in_future");
    blocked = true;
  } else if (opportunity.priceAgeMs > policy.maxPriceAgeMs) {
    reasons.push("price_stale");
    blocked = true;
  }
  if (opportunity.holders === null) reasons.push("holders_unknown");
  else if (opportunity.holders < policy.minHolders) {
    reasons.push("holders_below_minimum");
    blocked = true;
  }
  if (opportunity.pools === null || opportunity.pools.length === 0) {
    reasons.push("pools_unknown");
  } else {
    const usablePools = opportunity.pools.filter((pool) => pool.poolAddress !== null && pool.liquidityUsd !== null);
    if (usablePools.some((pool) => pool.liquidityUsd! >= policy.minPoolLiquidityUsd)) {
      // One identified pool meeting the explicit floor is enough for research screening.
    } else if (usablePools.length === opportunity.pools.length) {
      reasons.push("pool_liquidity_below_minimum");
      blocked = true;
    } else {
      reasons.push("pool_liquidity_unknown");
    }
  }
  if (opportunity.honeypot === null) reasons.push("honeypot_unknown");
  else if (opportunity.honeypot) {
    reasons.push("honeypot_detected");
    blocked = true;
  }
  if (opportunity.top10HolderPercent === null) reasons.push("top10_concentration_unknown");
  else if (opportunity.top10HolderPercent > policy.maxTop10HolderPercent) {
    reasons.push("top10_concentration_above_maximum");
    blocked = true;
  }
  if (opportunity.riskControlLevel === null) reasons.push("risk_control_unknown");
  else if (opportunity.riskControlLevel > policy.maxRiskControlLevel) {
    reasons.push("risk_control_above_maximum");
    blocked = true;
  }
  const hasUnknown = reasons.some((reason) => reason.endsWith("_unknown") || reason === "price_missing" ||
    reason === "price_time_missing" || reason === "observation_time_unknown");
  return {
    status: blocked ? "not_qualified" : hasUnknown ? "unknown" : "research_candidate",
    executionQualification: "not_qualified",
    reasons,
  };
}

/**
 * Hypothetical full-fill cost screen. Percent costs are added on each leg's
 * USD notional; it is not a forecast and never qualifies execution.
 */
export function calculateOpportunityScenario(input: OpportunityScenarioInput): OpportunityScenario {
  const numericValues = Object.values(input);
  const entryPercent = input.entryTaxPercent + input.entrySlippagePercent;
  const exitPercent = input.exitTaxPercent + input.exitSlippagePercent;
  if (!numericValues.every(Number.isFinite) || input.entryPriceUsd <= 0 || input.exitPriceUsd <= 0 || input.size <= 0 ||
    input.entryTaxPercent < 0 || input.entryTaxPercent > 100 || input.exitTaxPercent < 0 || input.exitTaxPercent > 100 ||
    input.entrySlippagePercent < 0 || input.entrySlippagePercent > 100 ||
    input.exitSlippagePercent < 0 || input.exitSlippagePercent > 100 || entryPercent >= 100 || exitPercent >= 100 ||
    input.tradingFeeUsd < 0 || input.networkFeeUsd < 0 || input.aiCostUsd < 0 || input.otherCostUsd < 0 ||
    input.minimumNetUsd < 0)
    throw new Error("Invalid opportunity scenario");

  const grossUsd = (input.exitPriceUsd - input.entryPriceUsd) * input.size;
  const variableCostsUsd = input.entryPriceUsd * input.size * entryPercent / 100 +
    input.exitPriceUsd * input.size * exitPercent / 100;
  const fixedCostsUsd = input.tradingFeeUsd + input.networkFeeUsd + input.aiCostUsd + input.otherCostUsd;
  const totalCostsUsd = variableCostsUsd + fixedCostsUsd;
  const netUsd = grossUsd - totalCostsUsd;
  const breakEvenExitPriceUsd =
    (input.entryPriceUsd * (1 + entryPercent / 100) + fixedCostsUsd / input.size) / (1 - exitPercent / 100);
  if (![grossUsd, variableCostsUsd, fixedCostsUsd, totalCostsUsd, netUsd, breakEvenExitPriceUsd].every(Number.isFinite))
    throw new Error("Invalid opportunity scenario");

  const comparisonEpsilon = Number.EPSILON * Math.max(1, Math.abs(netUsd), Math.abs(input.minimumNetUsd)) * 8;
  return {
    passesNetThreshold: netUsd - input.minimumNetUsd > comparisonEpsilon,
    grossUsd,
    variableCostsUsd,
    fixedCostsUsd,
    totalCostsUsd,
    netUsd,
    breakEvenExitPriceUsd,
    executionQualification: "not_qualified",
  };
}
