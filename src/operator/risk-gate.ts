import type { InventorySnapshot } from "../okx-wallet/portfolio";
import { chainByIndex } from "../okx-wallet/chains";
import type { GateVerdict, OperatorPolicy, OpportunityCandidate } from "./types";

/**
 * Deterministic eligibility. Every rejection carries a reason so the dashboard and
 * the journal can explain why Jev was not asked about a candidate. Unknown values
 * block: a missing cost, price or balance is never treated as zero.
 */
export function validateOperatorPolicy(policy: OperatorPolicy): void {
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  if (!finite(policy.maxPlanUsd) || policy.maxPlanUsd <= 0 || !finite(policy.maxCapitalFraction) || policy.maxCapitalFraction <= 0 || policy.maxCapitalFraction > 1 ||
    !finite(policy.minNetUsd) || policy.minNetUsd < 0 || !finite(policy.maxPriceImpactPercent) || policy.maxPriceImpactPercent < 0 || policy.maxPriceImpactPercent > 100 ||
    !Number.isSafeInteger(policy.maxQuoteAgeMs) || policy.maxQuoteAgeMs < 1 || !finite(policy.inferenceUsdPerCandidate) || policy.inferenceUsdPerCandidate < 0 ||
    !Number.isSafeInteger(policy.planTtlMs) || policy.planTtlMs < 1 || !Number.isSafeInteger(policy.exitWindowMs) || policy.exitWindowMs < 0 || typeof policy.gasReserveNative !== "object" || policy.gasReserveNative === null ||
    !finite(policy.maxDailyNotionalUsd) || policy.maxDailyNotionalUsd <= 0 || !Number.isSafeInteger(policy.maxDailyPlans) || policy.maxDailyPlans < 1 ||
    !Number.isSafeInteger(policy.cooldownMs) || policy.cooldownMs < 0 || typeof policy.killSwitchPath !== "string" || !policy.killSwitchPath ||
    !Number.isSafeInteger(policy.staleLegMs) || policy.staleLegMs < 1 || typeof policy.routerAllowlist !== "object" || policy.routerAllowlist === null ||
    !finite(policy.maxFeeGwei) || policy.maxFeeGwei <= 0 || !finite(policy.maxDailyLossUsd) || policy.maxDailyLossUsd <= 0 ||
    typeof policy.spenderAllowlist !== "object" || policy.spenderAllowlist === null || typeof policy.selectorAllowlist !== "object" || policy.selectorAllowlist === null ||
    !Number.isSafeInteger(policy.maxGasLimit) || policy.maxGasLimit < 21_000 || !finite(policy.maxWeeklyLossUsd) || policy.maxWeeklyLossUsd <= 0 ||
    !finite(policy.maxDrawdownUsd) || policy.maxDrawdownUsd <= 0 || !Array.isArray(policy.stablecoinPriceBand) || policy.stablecoinPriceBand.length !== 2 ||
    !finite(policy.stablecoinPriceBand[0]) || !finite(policy.stablecoinPriceBand[1]) || policy.stablecoinPriceBand[0] <= 0 || policy.stablecoinPriceBand[0] >= policy.stablecoinPriceBand[1])
    throw new Error("Invalid operator policy");
  for (const reserve of Object.values(policy.gasReserveNative)) if (!finite(reserve) || reserve < 0) throw new Error("Invalid operator policy");
}

function chainOf(inventory: InventorySnapshot, chainIndex: string) {
  return inventory.chains.find((chain) => chain.chainIndex === chainIndex) ?? null;
}

function sameToken(chainIndex: string, left: string, right: string): boolean {
  const evm = chainByIndex(chainIndex)?.kind === "evm";
  return evm ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function gateCandidate(candidate: OpportunityCandidate, inventory: InventorySnapshot, policy: OperatorPolicy): GateVerdict {
  validateOperatorPolicy(policy);
  const reasons: string[] = [];
  if (candidate.researchOnly) reasons.push("research_only");

  const chain = chainOf(inventory, candidate.chainIndex);
  if (!chain) {
    reasons.push("chain_not_in_inventory");
  } else {
    const asset = chain.assets.find((entry) => sameToken(candidate.chainIndex, entry.tokenContractAddress, candidate.from.tokenContractAddress));
    if (!asset || asset.balance === null) reasons.push("source_balance_unknown");
    else if (candidate.sizeUsd !== null && asset.valueUsd !== null && candidate.sizeUsd > asset.valueUsd + 1e-9) reasons.push("source_balance_insufficient");
    const reserve = policy.gasReserveNative[candidate.chainIndex];
    if (chain.nativeBalance === null) reasons.push("gas_balance_unknown");
    else if (reserve !== undefined && chain.nativeBalance < reserve) reasons.push("gas_below_reserve");
    else if (asset?.native && candidate.sizeUsd !== null && asset.priceUsd) {
      const sizeNative = candidate.sizeUsd / asset.priceUsd;
      if (reserve !== undefined && chain.nativeBalance - sizeNative < reserve) reasons.push("gas_reserve_would_be_spent");
    }
  }
  if (candidate.toChainIndex) {
    const target = chainByIndex(candidate.toChainIndex);
    if (!target) reasons.push("destination_chain_unknown");
  }

  if (candidate.kind !== "kuru_spot_maker") {
    // Stablecoin bases must price near one USD; a wrong price would scale the plan size (R5 M4).
    const baseAsset = chain?.assets.find((entry) => sameToken(candidate.chainIndex, entry.tokenContractAddress, candidate.from.tokenContractAddress));
    if (baseAsset && !baseAsset.native && baseAsset.priceUsd !== null && (baseAsset.priceUsd < policy.stablecoinPriceBand[0] || baseAsset.priceUsd > policy.stablecoinPriceBand[1])) reasons.push("base_price_implausible");
    if (candidate.sizeUsd === null) reasons.push("size_usd_unknown");
    else {
      if (candidate.sizeUsd > policy.maxPlanUsd) reasons.push("size_above_max_plan");
      if (inventory.knownValueUsd > 0 && candidate.sizeUsd > inventory.knownValueUsd * policy.maxCapitalFraction) reasons.push("size_above_capital_fraction");
      if (inventory.knownValueUsd === 0) reasons.push("inventory_value_unknown");
    }
    if (!candidate.costs.complete) reasons.push("costs_incomplete");
    if (candidate.netUsd === null) reasons.push("net_unknown");
    else if (candidate.netUsd < policy.minNetUsd) reasons.push("net_below_minimum");
    if (candidate.priceImpactPercent === null) reasons.push("price_impact_unknown");
    else if (Math.abs(candidate.priceImpactPercent) > policy.maxPriceImpactPercent) reasons.push("price_impact_above_maximum");
    if (candidate.quoteAgeMs === null) reasons.push("quote_age_unknown");
    else if (candidate.quoteAgeMs < 0) reasons.push("quote_time_in_future");
    else if (candidate.quoteAgeMs > policy.maxQuoteAgeMs) reasons.push("quote_stale");
    if (candidate.quoteHash === null) reasons.push("quote_hash_missing");
  }
  return { candidateId: candidate.id, eligible: reasons.length === 0, reasons };
}

export function gateCandidates(candidates: OpportunityCandidate[], inventory: InventorySnapshot, policy: OperatorPolicy): GateVerdict[] {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!/^[a-z0-9_]{1,64}$/.test(candidate.id) || candidate.id === "hold" || ids.has(candidate.id)) throw new Error(`Invalid candidate id: ${candidate.id}`);
    ids.add(candidate.id);
  }
  return candidates.map((candidate) => gateCandidate(candidate, inventory, policy));
}
