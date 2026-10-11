import type { InventorySnapshot } from "../okx-wallet/portfolio";

/**
 * Jev as financial operator: typed candidates, deterministic gates, one Jev choice,
 * one bounded plan. Code gathers and filters; Jev chooses; execution stays behind
 * its own gate.
 */
export type CandidateKind =
  | "dex_round_trip"
  | "cross_chain_rebalance"
  | "kuru_spot_maker"
  | "defi_yield"
  | "perp_funding_carry"
  | "memepump_research";

export interface AssetRef {
  chainIndex: string;
  /** Empty string = native coin. */
  tokenContractAddress: string;
  symbol: string;
  decimals: number | null;
}

export interface CostBreakdown {
  /** Estimated network fee in USD when the source provided it. */
  networkFeeUsd: number | null;
  /** Explicit trading fees, taxes or bridge fees in USD. */
  tradingFeeUsd: number | null;
  /** Inference allowance charged to this candidate (amortized). */
  inferenceUsd: number;
  /** True only when every cost component is known. */
  complete: boolean;
}

export interface OpportunityCandidate {
  /** Stable, filesystem-safe identifier; also the choice key shown to Jev. */
  id: string;
  kind: CandidateKind;
  title: string;
  chainIndex: string;
  /** Destination chain for cross-chain candidates. */
  toChainIndex?: string;
  from: AssetRef;
  to: AssetRef;
  /** Capital committed by this candidate, in USD when convertible. */
  sizeUsd: number | null;
  sizeAtomic: string;
  /** Expected output, same unit family as `from` for round trips. */
  expectedOutAtomic: string | null;
  /** Expected output of the first leg (intermediate asset), used to check the prepared tx. */
  expectedLeg1OutAtomic: string | null;
  /** Stable key for "same pair on the same chain", used by the ledger to block overlapping legs. */
  pairKey: string;
  /** Conservative net result after all known costs; null when it cannot be computed. */
  netUsd: number | null;
  priceImpactPercent: number | null;
  costs: CostBreakdown;
  /** Milliseconds since the newest quote this candidate depends on was received. */
  quoteAgeMs: number | null;
  /** Hash of the quotes used, so a plan can prove it derives from these numbers. */
  quoteHash: string | null;
  /** Human-readable, non-executable notes (advertised APY, research tags). */
  notes: string[];
  /** Research-only candidates are informational and never eligible for execution. */
  researchOnly: boolean;
}

export interface GateVerdict {
  candidateId: string;
  eligible: boolean;
  reasons: string[];
}

export interface OperatorPolicy {
  /** Largest capital one plan may commit. */
  maxPlanUsd: number;
  /** Fraction of the known inventory value one plan may commit. */
  maxCapitalFraction: number;
  /** Net USD a candidate must clear after costs and buffer. */
  minNetUsd: number;
  maxPriceImpactPercent: number;
  maxQuoteAgeMs: number;
  /** Native balance to keep untouched for fees, per chain, in native units. */
  gasReserveNative: Record<string, number>;
  /** Inference allowance in USD charged to every candidate shown to Jev. */
  inferenceUsdPerCandidate: number;
  /** Plans expire this many milliseconds after the decision. */
  planTtlMs: number;
  /** Cumulative caps enforced by the persistent ledger. */
  maxDailyNotionalUsd: number;
  maxDailyPlans: number;
  cooldownMs: number;
  killSwitchPath: string;
  staleLegMs: number;
  /** Allowed OKX router contracts per chainIndex; live execution needs a match. */
  routerAllowlist: Record<string, string[]>;
  /** Allowed approval spenders per chainIndex (the address OKX reports for approve-transaction). */
  spenderAllowlist: Record<string, string[]>;
  /** Allowed 4-byte selectors per chainIndex for router calldata; mandatory for live. */
  selectorAllowlist: Record<string, string[]>;
  /** Gas price cap for EVM sends, gwei. */
  maxFeeGwei: number;
  /** Gas limit cap per transaction. */
  maxGasLimit: number;
  /** Daily loss stop on reconciled realized results, USD. */
  maxDailyLossUsd: number;
  maxWeeklyLossUsd: number;
  maxDrawdownUsd: number;
  /** Accepted USD price band for stablecoin base assets; outside it the candidate is rejected. */
  stablecoinPriceBand: [number, number];
}

export interface OperatorDecision {
  /** "hold" or a candidate id present in the eligible set. */
  choice: string;
  probabilities: Record<string, number>;
  /** TypeSafe confidence when supplied; not a calibrated win rate. */
  confidence: number | null;
  latencyMs: number;
  inputTokens: number | null;
  model: string;
}

export interface PlanStep {
  kind: "approve" | "swap" | "bridge" | "kuru_mandate" | "defi_subscribe";
  chainIndex: string;
  description: string;
}

export interface ExecutionPlan {
  planId: string;
  candidateId: string;
  kind: CandidateKind;
  createdAtMs: number;
  expiresAtMs: number;
  steps: PlanStep[];
  quoteHash: string | null;
  maxLossUsd: number;
  /** Deterministic key so a retried plan is never executed twice. */
  idempotencyKey: string;
  executionQualification: "not_qualified" | "qualified_dry_run" | "qualified_live";
}

export interface ExecutionOutcome {
  status: "blocked" | "dry_run" | "prepared" | "sent" | "completed" | "failed";
  reasons: string[];
  txHash: string | null;
  orderId: string | null;
  /** Second-leg hash for round trips when it was sent. */
  closeTxHash?: string | null;
  /** Reconciled realized result in USD after a completed plan, gas included; null until reconciled. */
  realizedUsd?: number | null;
  /** Native gas paid across the plan's transactions when receipts reported it. */
  gasCostNative?: number;
}

export interface OperatorCycle {
  cycleId: string;
  startedAtMs: number;
  completedAtMs: number;
  inventory: InventorySnapshot;
  candidates: OpportunityCandidate[];
  verdicts: GateVerdict[];
  eligibleIds: string[];
  decision: OperatorDecision | null;
  plan: ExecutionPlan | null;
  execution: ExecutionOutcome;
  /** Inference cost charged to this cycle, USD, when known. */
  inferenceUsd: number | null;
  warnings: string[];
  /** Ledger view: cumulative usage today and legs awaiting reconciliation. */
  ledger: { dayNotionalUsd: number; dayPlans: number; dayRealizedUsd: number; weekRealizedUsd: number; drawdownUsd: number; openLegs: { planId: string; pairKey: string; status: string; openedAtMs: number; txHash: string }[]; killSwitch: boolean } | null;
}
