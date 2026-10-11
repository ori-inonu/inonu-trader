import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { InventorySnapshot } from "../okx-wallet/portfolio";
import { buildCandidates, type CandidateContext } from "./candidates";
import { executePlan, type ExecutorDeps } from "./executor";
import { buildOperatorState, type OperatorModel } from "./jev-selector";
import { buildExecutionPlan, type PlanGate } from "./plan";
import { gateCandidates } from "./risk-gate";
import type { OperatorLedger } from "./ledger";
import type { ExecutionOutcome, OperatorCycle, OperatorPolicy } from "./types";

export interface CycleDeps {
  inventorySource: () => Promise<InventorySnapshot>;
  model: OperatorModel;
  policy: OperatorPolicy;
  gate: PlanGate;
  now: () => number;
  candidateContext?: Omit<CandidateContext, "inventory" | "policy" | "nowMs">;
  executor?: ExecutorDeps;
  /** Ledger to report even when no executor is attached. */
  ledger?: OperatorLedger;
  killSwitchExists?: () => boolean;
  /** USD per million input tokens for the inference allowance; null when unknown. */
  jevUsdPerMTok: number | null;
}

function ledgerView(ledger: OperatorLedger | undefined, nowMs: number, killSwitch: boolean): OperatorCycle["ledger"] {
  if (!ledger) return null;
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const state = ledger.state();
  return {
    dayNotionalUsd: state.dailyNotionalUsd[day] ?? 0,
    dayPlans: state.dailyPlans[day] ?? 0,
    dayRealizedUsd: ledger.dayRealizedUsd(nowMs),
    weekRealizedUsd: ledger.weekRealizedUsd(nowMs),
    drawdownUsd: ledger.drawdownUsd(),
    openLegs: ledger.openLegs().map((leg) => ({ planId: leg.planId, pairKey: leg.pairKey, status: leg.status, openedAtMs: leg.openedAtMs, txHash: leg.txHash })),
    killSwitch,
  };
}

/**
 * Realized result of a completed plan: the change in the plan's base asset,
 * valued at the price observed before the plan, minus nothing else (fees were
 * paid on chain and are already reflected in the balance). Unknown balances or
 * prices leave the result null; a null result is never counted as zero.
 */
export function reconcileRealizedUsd(before: InventorySnapshot, after: InventorySnapshot, chainIndex: string, tokenContractAddress: string): number | null {
  const find = (snapshot: InventorySnapshot) => snapshot.chains.find((chain) => chain.chainIndex === chainIndex)?.assets
    .find((asset) => asset.tokenContractAddress.toLowerCase() === tokenContractAddress.toLowerCase() || (tokenContractAddress.toLowerCase().startsWith("0xeeee") && asset.native));
  const previous = find(before);
  const current = find(after);
  if (!previous || !current || previous.balance === null || current.balance === null || previous.priceUsd === null) return null;
  return (current.balance - previous.balance) * previous.priceUsd;
}

/**
 * One operator cycle: inventory, candidates, gates, one Jev choice, one plan, one
 * execution attempt. Jev is only asked when at least one candidate is eligible;
 * an empty eligible set is journaled as hold without inference cost.
 */
export async function runOperatorCycle(deps: CycleDeps): Promise<OperatorCycle> {
  const startedAtMs = deps.now();
  const warnings: string[] = [];
  const inventory = await deps.inventorySource();
  if (!inventory.valueComplete) warnings.push("inventory_value_incomplete");
  const candidates = await buildCandidates({ ...deps.candidateContext, inventory, policy: deps.policy, nowMs: deps.now(), now: deps.now });
  const verdicts = gateCandidates(candidates, inventory, deps.policy);
  const eligibleIds = verdicts.filter((verdict) => verdict.eligible).map((verdict) => verdict.candidateId);
  const eligible = candidates.filter((candidate) => eligibleIds.includes(candidate.id));
  const cycleId = createHash("sha256").update(JSON.stringify([startedAtMs, inventory.address, candidates.map((candidate) => candidate.id)])).digest("hex").slice(0, 16);

  let decision: OperatorCycle["decision"] = null;
  let plan: OperatorCycle["plan"] = null;
  let execution: ExecutionOutcome = { status: "blocked", reasons: ["no_eligible_candidate"], txHash: null, orderId: null };
  let inferenceUsd: number | null = 0;
  if (eligible.length > 0) {
    const state = buildOperatorState(inventory, eligible);
    decision = await deps.model.choose(state, eligible);
    inferenceUsd = decision.inputTokens === null || deps.jevUsdPerMTok === null ? null : (decision.inputTokens / 1_000_000) * deps.jevUsdPerMTok;
    if (decision.choice !== "hold") {
      const chosen = eligible.find((candidate) => candidate.id === decision!.choice)!;
      plan = buildExecutionPlan(chosen, decision, deps.policy, deps.gate, deps.now());
      execution = deps.executor
        ? await executePlan(plan, chosen, deps.executor)
        : { status: plan.executionQualification === "qualified_dry_run" ? "dry_run" : "blocked", reasons: ["no_executor_attached"], txHash: null, orderId: null };
      if (execution.status === "completed" && deps.executor) {
        try {
          const after = await deps.inventorySource();
          const baseDelta = reconcileRealizedUsd(inventory, after, chosen.chainIndex, chosen.from.tokenContractAddress);
          // Gas paid is subtracted at the native price observed before the plan; unknown gas or price leaves the result unknown (R5 M3).
          const nativePrice = inventory.chains.find((chain) => chain.chainIndex === chosen.chainIndex)?.assets.find((asset) => asset.native)?.priceUsd ?? null;
          const gasUsd = execution.gasCostNative !== undefined && nativePrice !== null ? execution.gasCostNative * nativePrice : null;
          const realizedUsd = baseDelta === null || gasUsd === null ? null : baseDelta - gasUsd;
          execution = { ...execution, realizedUsd };
          if (realizedUsd === null) warnings.push("realized_result_unknown");
          else deps.executor.ledger.recordRealized(deps.now(), realizedUsd);
        } catch {
          execution = { ...execution, realizedUsd: null };
          warnings.push("reconciliation_failed");
        }
      }
    } else {
      execution = { status: "blocked", reasons: ["jev_chose_hold"], txHash: null, orderId: null };
    }
  }
  const ledger = deps.ledger ?? deps.executor?.ledger;
  const killSwitch = (deps.killSwitchExists ?? deps.executor?.killSwitchExists ?? (() => false))();
  if (ledger && ledger.openLegs().length > 0) warnings.push("open_legs_awaiting_reconciliation");
  if (killSwitch) warnings.push("kill_switch_present");
  return {
    cycleId, startedAtMs, completedAtMs: deps.now(), inventory, candidates, verdicts, eligibleIds, decision, plan, execution, inferenceUsd, warnings,
    ledger: ledgerView(ledger, deps.now(), killSwitch),
  };
}

/** Public view of a cycle: the wallet address is shortened; balances stay because the dashboard shows them. */
export function redactCycle(cycle: OperatorCycle): OperatorCycle {
  const address = cycle.inventory.address;
  const shortAddress = address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : "redacted";
  return { ...cycle, inventory: { ...cycle.inventory, address: shortAddress } };
}

export function persistCycle(cycle: OperatorCycle, statePath: string, journalPath: string): void {
  mkdirSync(dirname(statePath), { recursive: true });
  mkdirSync(dirname(journalPath), { recursive: true });
  const redacted = redactCycle(cycle);
  const tmp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(redacted, null, 2));
  renameSync(tmp, statePath);
  appendFileSync(journalPath, JSON.stringify(redacted) + "\n");
}
