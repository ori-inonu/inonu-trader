import { tokenAddressesEqual } from "./token-identity";

export type OpportunityIdentity = { chainIndex: string; tokenContractAddress: string };
type Raw = Record<string, unknown>;
export type OpportunityInput = { identity: OpportunityIdentity; listed?: Raw; price?: Raw | null; advanced?: Raw | null; pools?: Raw[] | null };
export type PoolFees = { providerPercent: number | null; hookBuyPercent: number | null; hookSellPercent: number | null; sniperBuyPercent: number | null; sniperSellPercent: number | null };
export type Opportunity = {
  identity: OpportunityIdentity; symbol: string | null; priceUsd: number | null; priceTimeMs: number | null;
  holders: number | null; top10HoldPercent: number | null; riskLevel: number | null; tags: string[] | null;
  poolLiquidityUsd: number | null; poolFees: PoolFees[]; issues: string[];
};

function record(value: unknown): Raw | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Raw : null; }
function numeric(value: unknown, max = Infinity, integer = false): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max && (!integer || Number.isSafeInteger(n)) ? n : null;
}
function percent(value: unknown): number | null {
  return typeof value === "string" && /^\d+(?:\.\d+)?%$/.test(value.trim()) ? numeric(value.trim().slice(0, -1), 100) : null;
}
function sameIdentity(value: Raw | null | undefined, expected: OpportunityIdentity): boolean {
  if (value?.chainIndex !== expected.chainIndex || typeof value?.tokenContractAddress !== 'string') return false;
  return tokenAddressesEqual(expected.chainIndex, value.tokenContractAddress, expected.tokenContractAddress);
}
export function normalizeOpportunity(input: OpportunityInput): Opportunity {
  if (!/^[1-9]\d*$/.test(input.identity.chainIndex) || !input.identity.tokenContractAddress.trim() || input.identity.tokenContractAddress !== input.identity.tokenContractAddress.trim() || /[\s,]/.test(input.identity.tokenContractAddress)) throw new Error("Invalid token identity");
  const issues: string[] = [];
  const price = sameIdentity(input.price, input.identity) ? input.price : null;
  if (input.price && !price) issues.push("price_identity_mismatch");
  const listed = sameIdentity(input.listed, input.identity) ? input.listed : null;
  const advanced = sameIdentity(input.advanced, input.identity) ? input.advanced : null;
  if (input.listed && !listed) issues.push("listed_identity_mismatch");
  if (input.advanced && !advanced) issues.push("advanced_identity_mismatch");
  const tags = Array.isArray(advanced?.tokenTags) && advanced.tokenTags.every(x => typeof x === "string" && x.trim().length > 0) ? advanced.tokenTags as string[] : null;
  const risk = numeric(advanced?.riskControlLevel, 5, true);
  const pools = (input.pools ?? []).filter(pool => {
    if (!Array.isArray(pool.liquidityAmount) || !pool.liquidityAmount.length) { issues.push("unknown:pool_membership"); return false; }
    const members = pool.liquidityAmount.map(record);
    if (!members.every(x => typeof x?.tokenContractAddress === "string" && x.tokenContractAddress.length > 0)) { issues.push("unknown:pool_membership"); return false; }
    if (!members.some(x => sameIdentity({ ...x, chainIndex: input.identity.chainIndex }, input.identity))) { issues.push("pool_identity_mismatch"); return false; }
    return true;
  });
  const liquidities = pools.map(x => numeric(x.liquidityUsd)).filter((x): x is number => x !== null);
  return {
    identity: { ...input.identity }, symbol: typeof listed?.symbol === "string" ? listed.symbol : null,
    priceUsd: numeric(price?.price), priceTimeMs: numeric(price?.time, Number.MAX_SAFE_INTEGER, true),
    holders: numeric(price?.holders, Number.MAX_SAFE_INTEGER, true),
    top10HoldPercent: numeric(advanced?.top10HoldPercent, 100),
    riskLevel: risk !== null && risk > 0 ? risk : null, tags: tags ? [...tags] : null,
    poolLiquidityUsd: liquidities.length ? Math.max(...liquidities) : null,
    poolFees: pools.map(pool => ({
      providerPercent: percent(pool.liquidityProviderFeePercent),
      hookBuyPercent: percent(record(pool.hookFeePercent)?.buy), hookSellPercent: percent(record(pool.hookFeePercent)?.sell),
      sniperBuyPercent: percent(record(pool.sniperTaxPercent)?.buy), sniperSellPercent: percent(record(pool.sniperTaxPercent)?.sell),
    })), issues,
  };
}

export type ResearchPolicy = { maxPriceAgeMs: number; minPoolLiquidityUsd: number; minHolders: number; maxTop10HoldPercent: number; maxRiskLevel: number };
export const DEFAULT_RESEARCH_POLICY: Readonly<ResearchPolicy> = Object.freeze({ maxPriceAgeMs: 60_000, minPoolLiquidityUsd: 100_000, minHolders: 1_000, maxTop10HoldPercent: 20, maxRiskLevel: 2 });
export type ResearchAssessment = { status: "blocked" | "unknown" | "research_candidate"; reasons: string[]; execution: "not_qualified"; dependencies: string[] };
export function assessOpportunity(x: Opportunity, policy: ResearchPolicy, now: number): ResearchAssessment {
  if (![policy.maxPriceAgeMs, policy.minPoolLiquidityUsd, policy.minHolders, policy.maxTop10HoldPercent, policy.maxRiskLevel].every(Number.isFinite) || policy.maxPriceAgeMs <= 0 || policy.minPoolLiquidityUsd <= 0 || !Number.isSafeInteger(policy.minHolders) || policy.minHolders < 1 || policy.maxTop10HoldPercent < 0 || policy.maxTop10HoldPercent > 100 || !Number.isInteger(policy.maxRiskLevel) || policy.maxRiskLevel < 1 || policy.maxRiskLevel > 5 || !Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid research policy");
  const reasons: string[] = [...x.issues];
  let blocked = x.issues.some(reason => reason.endsWith("identity_mismatch"));
  let unknown = x.issues.some(reason => reason.startsWith("unknown:"));
  function check(value: number | null, name: string, fails: (n: number) => boolean, reason: string, valid: (n: number) => boolean = () => true) {
    if (value === null || !Number.isFinite(value) || value < 0 || !valid(value)) { unknown = true; reasons.push("unknown:" + name); }
    else if (fails(value)) { blocked = true; reasons.push(reason); }
  }
  check(x.priceUsd, "price", n => n <= 0, "invalid_price");
  check(x.priceTimeMs, "price_time", n => n > now, "future_price", n => Number.isSafeInteger(n) && n > 0);
  if (x.priceTimeMs !== null && x.priceTimeMs <= now && now - x.priceTimeMs > policy.maxPriceAgeMs) { blocked = true; reasons.push("stale_price"); }
  check(x.poolLiquidityUsd, "pool_liquidity", n => n < policy.minPoolLiquidityUsd, "low_pool_liquidity");
  check(x.holders, "holders", n => n < policy.minHolders, "low_holders", Number.isSafeInteger);
  check(x.top10HoldPercent, "top10_concentration", n => n > policy.maxTop10HoldPercent, "high_concentration", n => n <= 100);
  check(x.riskLevel, "risk_level", n => n > policy.maxRiskLevel, "high_risk_level", n => Number.isInteger(n) && n >= 1 && n <= 5);
  if (x.tags === null) { unknown = true; reasons.push("unknown:risk_tags"); }
  else for (const tag of x.tags) {
    if (["honeypot", "lowliquidity"].includes(tag.trim().toLowerCase())) { blocked = true; reasons.push("risk_tag:" + tag.trim()); }
  }
  return { status: blocked ? "blocked" : unknown ? "unknown" : "research_candidate", reasons, execution: "not_qualified", dependencies: ["current_security", "sellability", "actual_costs"] };
}

export type HypotheticalScenario = {
  capitalUsd: number; exitGrossReturnPercent: number;
  buyFeePercent: number; sellFeePercent: number; buyTaxPercent: number; sellTaxPercent: number;
  buySlippagePercent: number; sellSlippagePercent: number; networkUsd: number; inferenceUsd: number; otherUsd: number; bufferUsd: number;
};
/** A user-supplied scenario, never an expected return or a transaction gate. */
export function scenarioEconomics(x: HypotheticalScenario) {
  const percentages = [x.buyFeePercent, x.sellFeePercent, x.buyTaxPercent, x.sellTaxPercent, x.buySlippagePercent, x.sellSlippagePercent];
  const fixedCosts = [x.networkUsd, x.inferenceUsd, x.otherUsd, x.bufferUsd];
  if (![x.capitalUsd, x.exitGrossReturnPercent, ...percentages, ...fixedCosts].every(Number.isFinite) || x.capitalUsd <= 0 || x.exitGrossReturnPercent < -100 || percentages.some(p => p < 0 || p >= 100) || fixedCosts.some(n => n < 0)) throw new Error("Invalid hypothetical scenario");
  const factor = percentages.reduce((product, percent) => product * (1 - percent / 100), 1);
  const fixedUsd = x.networkUsd + x.inferenceUsd + x.otherUsd;
  const grossProceedsUsd = x.capitalUsd * (1 + x.exitGrossReturnPercent / 100);
  const proceedsUsd = grossProceedsUsd * factor;
  const costUsd = grossProceedsUsd - proceedsUsd + fixedUsd;
  const netUsd = proceedsUsd - fixedUsd - x.capitalUsd;
  const breakevenReturnPercent = ((1 + fixedUsd / x.capitalUsd) / factor - 1) * 100;
  if (![proceedsUsd, costUsd, netUsd, breakevenReturnPercent].every(Number.isFinite)) throw new Error("Invalid hypothetical scenario");
  const tolerance = Number.EPSILON * Math.max(x.capitalUsd, proceedsUsd, x.bufferUsd) * 8;
  return { hypothetical: true, netUsd, costUsd, fixedUsd, breakevenReturnPercent, eligible: netUsd - x.bufferUsd > tolerance, execution: "not_qualified" as const };
}
