import type { LabPolicy } from "../../src/lab/policies.ts";

export const RESEARCH_CANDIDATE_ID = "research-candidate";

/**
 * Offline historical-lookback score penalized by a volatility proxy, not a forecast or JEV inference.
 * Unknown or invalid inputs are ignored.
 */
export function createCandidatePolicy(): LabPolicy {
 return {
  id: RESEARCH_CANDIDATE_ID,
  baseline: false,
  tested: true,
  passive: false,
  chooser: null,
  decide: (input) => {
   let choice = "hold";
   let bestScore = 0;

   for (const candidate of input.eligible) {
    if (candidate.modality !== "perp-directional" || (candidate.side !== "long" && candidate.side !== "short")) continue;

    const retLookbackBps = candidate.features.retLookbackBps;
    const costBps = candidate.features.costBps;
    const settlementsInHorizon = candidate.features.settlementsInHorizon;
    const volHorizonBps = candidate.features.volHorizonBps;
    if (
     typeof retLookbackBps !== "number" ||
     !Number.isFinite(retLookbackBps) ||
     typeof costBps !== "number" ||
     !Number.isFinite(costBps) ||
     costBps < 0 ||
     typeof settlementsInHorizon !== "number" ||
     !Number.isInteger(settlementsInHorizon) ||
     settlementsInHorizon < 0 ||
     typeof volHorizonBps !== "number" ||
     !Number.isFinite(volHorizonBps) ||
     volHorizonBps <= 0
    ) continue;

    const sideSign = candidate.side === "long" ? 1 : -1;
    let fundingPenaltyBps = 0;
    if (settlementsInHorizon > 0) {
     const fundingNextBps = candidate.features.fundingNextBps;
     if (typeof fundingNextBps !== "number" || !Number.isFinite(fundingNextBps)) continue;
     fundingPenaltyBps = Math.max(0, fundingNextBps * sideSign) * settlementsInHorizon;
    }

    const score = retLookbackBps * sideSign - costBps - fundingPenaltyBps - volHorizonBps;
    if (
     Number.isFinite(score) &&
     score > 0 &&
     (score > bestScore || (score === bestScore && candidate.id < choice))
    ) {
     choice = candidate.id;
     bestScore = score;
    }
   }

   const probabilities: Record<string, number> = { hold: choice === "hold" ? 1 : 0 };
   for (const candidate of input.eligible) probabilities[candidate.id] = candidate.id === choice ? 1 : 0;

   return {
    policyId: RESEARCH_CANDIDATE_ID,
    epochId: input.epochId,
    choice,
    probabilities,
    latencyMs: 0,
    inputTokens: 0,
    costUsd: 0,
    status: "ok",
    note: "Offline historical-lookback score penalized by volatility proxy; not a forecast or JEV inference.",
   };
  },
 };
}
