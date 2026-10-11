/**
 * Builds the leverage brief Jev reads: the envelope of the phase applied to the market and the
 * wallet, and every leverage candidate inside it. Pure: the same inputs always give the same brief.
 *
 * A candidate is eligible only when every one of these holds:
 *   the phase allows perpetual contracts (phase 2), even for 1x candidates,
 *   the leverage is within the ceiling and the cap of the phase,
 *   the liquidation distance respects the floor of the phase,
 *   the realized sigma is known (unknown sigma never counts as zero),
 *   the margin fits the order cap and the exposure cap of the phase,
 *   the wallet is flat or already on the same side (System One never flips a position in one step).
 */

import { deriveLimits, medianWealthNoEdge, touchLiquidationProbability, type DerivedLimits, type PhaseId } from "../policy/envelope";
import { isFreshReading, LEVERAGE_LADDER, SIDES, SYSTEM_ONE_SCHEMA_VERSION, type LeverageBrief, type LeverageCandidate, type MarketReading, type Side, type WalletReading } from "./types";

export const DEFAULT_HORIZON_DAYS = 7;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function floorTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

/** Funding carry per day from the side's point of view: longs pay a positive rate, shorts receive it. */
export function fundingCarryPerDay(side: Side, fundingRate: number | null, intervalMs: number | null): number | null {
  if (fundingRate === null || !Number.isFinite(fundingRate) || intervalMs === null || !Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  const settlementsPerDay = 86_400_000 / intervalMs;
  const perDay = fundingRate * settlementsPerDay;
  if (!Number.isFinite(perDay)) return null;
  return side === "long" ? -perDay : perDay;
}

export interface BuildBriefInput {
  market: MarketReading;
  wallet: WalletReading;
  phase: PhaseId;
  horizonDays?: number;
  /** Lower bound of the Kelly estimate from the lab, when it exists; closes the phase 2 cap. */
  kellyLowerBound?: number | null;
  nowMs: number;
}

export function buildLeverageCandidates(input: BuildBriefInput, limits: DerivedLimits): LeverageCandidate[] {
  const { market, wallet, phase } = input;
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const sigma = market.realizedSigmaDaily;
  const borrowingAllowed = phase === "fase-2";
  const candidates: LeverageCandidate[] = [];

  for (const side of SIDES) {
    for (const leverage of LEVERAGE_LADDER) {
      const reasons: string[] = [];
      const marginUsd = floorTo(Math.min(limits.orderCapUsd, limits.exposureCapUsd / Math.max(1, leverage)), 2);
      const notionalUsd = round(marginUsd * leverage, 2);
      const liquidationDistance = 1 / leverage;

      if (phase === "fase-0") reasons.push("phase_0_observes_only");
      if (phase === "fase-1") reasons.push("phase_requires_spot");
      if (leverage > 1 && !borrowingAllowed) reasons.push("borrowing_not_allowed_in_phase");
      if (leverage > limits.leverageCeiling) reasons.push("above_leverage_ceiling");
      if (limits.leverageCap !== null && leverage > limits.leverageCap) reasons.push("above_leverage_cap");
      if (limits.leverageCap === null && borrowingAllowed && leverage > 1) reasons.push("leverage_cap_undefined");
      if (limits.liquidationDistanceFloor !== null && liquidationDistance < limits.liquidationDistanceFloor) reasons.push("below_liquidation_floor");
      if (sigma === null) reasons.push("sigma_unknown");
      if (!isFreshReading(market.observedAtMs, input.nowMs)) reasons.push("market_stale");
      if (!isFreshReading(wallet.observedAtMs, input.nowMs)) reasons.push("inventory_stale");
      if (fundingCarryPerDay(side, market.fundingRate, market.fundingIntervalMs) === null) reasons.push("funding_unknown");
      if (market.markPrice === null || !Number.isFinite(market.markPrice) || market.markPrice <= 0) reasons.push("mark_price_unknown");
      if (!(marginUsd > 0)) reasons.push("margin_zero");
      if (!wallet.valueComplete) reasons.push("inventory_value_incomplete");
      if (!Number.isFinite(wallet.openNotionalUsd) || wallet.openNotionalUsd < 0 ||
          !Number.isFinite(wallet.knownValueUsd) || wallet.knownValueUsd < 0 ||
          (wallet.openNotionalUsd > 0 && wallet.openSide !== "long" && wallet.openSide !== "short")) reasons.push("inventory_invalid");
      if (wallet.openSide !== null && wallet.openSide !== side) reasons.push("would_flip_open_position");
      if (wallet.openNotionalUsd + notionalUsd > limits.exposureCapUsd + 1e-9) reasons.push("exposure_cap_reached");

      const touchProbability = sigma === null ? null : touchLiquidationProbability(leverage, sigma, horizonDays);
      const medianMultiple = sigma === null ? null : medianWealthNoEdge(leverage, sigma, horizonDays);
      const carryPerDay = fundingCarryPerDay(side, market.fundingRate, market.fundingIntervalMs);
      const carryUsd = carryPerDay === null ? null : round(carryPerDay * horizonDays * notionalUsd, 4);

      candidates.push({
        id: `${side}-${leverage}x`,
        side,
        leverage,
        marginUsd,
        notionalUsd,
        liquidationDistance: round(liquidationDistance, 4),
        touchProbability: touchProbability === null ? null : round(touchProbability, 6),
        medianMultipleNoEdge: medianMultiple === null ? null : round(medianMultiple, 6),
        fundingCarryPerDay: carryPerDay === null ? null : round(carryPerDay, 8),
        fundingCarryUsd: carryUsd,
        eligible: reasons.length === 0,
        reasons,
      });
    }
  }
  return candidates;
}

export function buildLeverageBrief(input: BuildBriefInput): LeverageBrief {
  const { market, wallet, phase } = input;
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const sigmaForLimits = market.realizedSigmaDaily ?? 0.0667;
  const limits = deriveLimits({
    capitalUsd: Math.max(wallet.capitalUsd, 0.01),
    sigmaDaily: sigmaForLimits,
    phase,
    kellyLowerBound: input.kellyLowerBound ?? null,
  });
  const candidates = buildLeverageCandidates(input, limits);
  const eligibleIds = candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.id);
  const notes: string[] = [];
  if (market.realizedSigmaDaily === null) notes.push("Realized volatility unknown: the envelope used the MON reference sigma and no candidate is eligible.");
  if (phase === "fase-0") notes.push("Phase 0 observes only: no candidate is eligible, the brief is for reading.");
  if (phase === "fase-1") notes.push("Phase 1 allows spot only: System One reads perpetual contracts, so no candidate is eligible.");
  if (phase === "fase-2" && limits.leverageCap === null) notes.push("Phase 2 leverage cap is undefined without a Kelly lower bound from the lab.");
  if (market.fundingRate === null) notes.push("Funding rate unknown: carry is not estimated.");
  if (!wallet.valueComplete) notes.push("Inventory value is incomplete: nothing is eligible until every balance has a price.");
  for (const missing of limits.unknown) notes.push(`Envelope input missing: ${missing}.`);
  notes.push("Probabilities are decision weights, not win rates. Touch probabilities assume no drift. System One never executes.");

  return {
    schemaVersion: SYSTEM_ONE_SCHEMA_VERSION,
    generatedAtMs: input.nowMs,
    phase,
    horizonDays,
    market,
    wallet,
    limits,
    candidates,
    eligibleIds,
    notes,
  };
}
