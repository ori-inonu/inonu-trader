import { createHash } from "node:crypto";
import type { ExecutionPlan, OperatorDecision, OperatorPolicy, OpportunityCandidate, PlanStep } from "./types";

export interface PlanGate {
  /** OPERATOR_EXECUTE=true */
  operatorExecute: boolean;
  /** OPERATOR_LIVE_ACK=OWN_FUNDS_RISK_OPERATOR */
  operatorLiveAck: boolean;
  /** The real Jev model made the choice (never the mock). */
  realModel: boolean;
  /** A signer built from the operator's own key exists for the plan's chain family. */
  signerAvailable: boolean;
}

/** Only kinds the executor can actually carry out may become live plans (R5 B7). */
const EXECUTABLE_KINDS = new Set<OpportunityCandidate["kind"]>(["dex_round_trip"]);

function stepsFor(candidate: OpportunityCandidate): PlanStep[] {
  switch (candidate.kind) {
    case "dex_round_trip":
      return [
        { kind: "approve", chainIndex: candidate.chainIndex, description: `Allow the OKX spender to use ${candidate.from.symbol} for this exact amount if not yet approved` },
        { kind: "swap", chainIndex: candidate.chainIndex, description: `Swap ${candidate.from.symbol} to ${candidate.to.symbol} with minReceiveAmount from the quote` },
        { kind: "swap", chainIndex: candidate.chainIndex, description: `Swap ${candidate.to.symbol} back to ${candidate.from.symbol} with minReceiveAmount from the quote` },
      ];
    case "cross_chain_rebalance":
      return [
        { kind: "approve", chainIndex: candidate.chainIndex, description: `Allow the OKX cross-chain spender to use ${candidate.from.symbol} if not yet approved` },
        { kind: "bridge", chainIndex: candidate.chainIndex, description: `Bridge ${candidate.from.symbol} on ${candidate.chainIndex} to ${candidate.to.symbol} on ${candidate.toChainIndex ?? "?"}` },
      ];
    case "kuru_spot_maker":
      return [{ kind: "kuru_mandate", chainIndex: candidate.chainIndex, description: "Keep MON/USDC inventory allocated to the every-block Jev maker on Kuru" }];
    case "defi_yield":
      return [{ kind: "defi_subscribe", chainIndex: candidate.chainIndex, description: `Subscribe ${candidate.from.symbol} to the listed DeFi product` }];
    case "perp_funding_carry":
    case "memepump_research":
      return [];
  }
}

export function buildExecutionPlan(candidate: OpportunityCandidate, decision: OperatorDecision, policy: OperatorPolicy, gate: PlanGate, nowMs: number): ExecutionPlan {
  if (decision.choice !== candidate.id) throw new Error("Plan candidate does not match the decision");
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new Error("Invalid plan clock");
  const steps = stepsFor(candidate);
  // Idempotency per candidate, quotes and size; the quote hash carries no timestamps (R5 F4).
  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify([candidate.id, candidate.quoteHash, candidate.sizeAtomic]))
    .digest("hex")
    .slice(0, 32);
  const executable = steps.length > 0 && !candidate.researchOnly;
  const live = executable && EXECUTABLE_KINDS.has(candidate.kind) && gate.operatorExecute && gate.operatorLiveAck && gate.realModel && gate.signerAvailable;
  return {
    planId: `plan_${idempotencyKey.slice(0, 12)}`,
    candidateId: candidate.id,
    kind: candidate.kind,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + policy.planTtlMs,
    steps,
    quoteHash: candidate.quoteHash,
    maxLossUsd: candidate.sizeUsd === null ? 0 : Math.min(candidate.sizeUsd, policy.maxPlanUsd),
    idempotencyKey,
    executionQualification: live ? "qualified_live" : executable ? "qualified_dry_run" : "not_qualified",
  };
}

export function planIsFresh(plan: ExecutionPlan, nowMs: number): boolean {
  return nowMs >= plan.createdAtMs && nowMs < plan.expiresAtMs;
}
