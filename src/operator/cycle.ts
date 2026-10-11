import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { InventoryAsset, InventorySnapshot } from "../okx-wallet/portfolio";
import { chainByIndex, isAddressForChain } from "../okx-wallet/chains";
import { buildCandidates, type CandidateContext } from "./candidates";
import { executePlan, type ExecutorDeps } from "./executor";
import { buildOperatorState, validateOperatorDecision, type OperatorModel, type OperatorState } from "./jev-selector";
import { buildExecutionPlan, type PlanGate } from "./plan";
import { gateCandidates } from "./risk-gate";
import type { OperatorLedger } from "./ledger";
import type { ExecutionOutcome, OperatorCycle, OperatorDecision, OperatorPolicy, OpportunityCandidate } from "./types";

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
  /** Decision deadline in milliseconds, default 10000; integer from 1 to 30000. */
  decisionTimeoutMs?: number;
}

type DecisionAttempt = { decision: OperatorDecision; reason: null } | {
  decision: null;
  reason: "decision_failed" | "decision_invalid" | "decision_timeout";
};

async function boundedDecision(model: OperatorModel, state: OperatorState, eligible: OpportunityCandidate[], timeoutMs: number): Promise<DecisionAttempt> {
  const controller = new AbortController();
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Both rejection handlers stay attached when a model ignores cancellation.
    const answer = Promise.resolve().then(() => model.choose(state, eligible, { signal: controller.signal }))
      .then((value) => ({ kind: "answer" as const, value }), () => ({ kind: "failed" as const }));
    const deadline = new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: "timeout" });
      }, timeoutMs);
    });
    const result = await Promise.race([answer, deadline]);
    // A blocked event loop can postpone the timer past a late model response.
    if (result.kind === "timeout" || performance.now() - started >= timeoutMs) {
      controller.abort();
      return { decision: null, reason: "decision_timeout" };
    }
    if (result.kind === "failed") return { decision: null, reason: "decision_failed" };
    try {
      return { decision: validateOperatorDecision(result.value, eligible), reason: null };
    } catch {
      return { decision: null, reason: "decision_invalid" };
    }
  } finally {
    clearTimeout(timer);
  }
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

function decimalQuantity(asset: InventoryAsset): { units: bigint; places: number } | null {
  // Bound integer and fractional digits before BigInt construction.
  if (typeof asset.balanceText !== "string" || !/^\d{1,80}(\.\d{1,80})?$/.test(asset.balanceText) ||
    asset.balance === null || !Number.isFinite(asset.balance) || Number(asset.balanceText) !== asset.balance) return null;
  const [whole, fraction = ""] = asset.balanceText.split(".");
  return { units: BigInt(whole! + fraction), places: fraction.length };
}

function quantityDelta(before: InventoryAsset, after: InventoryAsset): number | null {
  const previous = decimalQuantity(before);
  const current = decimalQuantity(after);
  if (!previous || !current) return null;
  const places = Math.max(previous.places, current.places);
  const units = current.units * 10n ** BigInt(places - current.places) - previous.units * 10n ** BigInt(places - previous.places);
  return Number(units) / 10 ** places;
}

/**
 * Observed quantity change across the selected chain, valued at prior prices.
 * Includes native gas already paid on chain; do not subtract estimated fees again.
 * This compatibility export does not establish attributable realized profit.
 */
export function reconcileRealizedUsd(before: InventorySnapshot, after: InventorySnapshot, chainIndex: string, tokenContractAddress: string): number | null {
  const spec = chainByIndex(chainIndex);
  if (!spec || before.riskTokensExcluded !== false || after.riskTokensExcluded !== false || before.source !== after.source ||
    !["synthetic", "okx_balance_api"].includes(before.source) ||
    !Number.isSafeInteger(before.observedAtMs) || before.observedAtMs <= 0 || !Number.isSafeInteger(after.observedAtMs) || after.observedAtMs <= before.observedAtMs ||
    !isAddressForChain(chainIndex, before.address) || !isAddressForChain(chainIndex, after.address)) return null;
  const identity = (address: string) => spec.kind === "evm" ? address.toLowerCase() : address;
  if (identity(before.address) !== identity(after.address)) return null;
  const selected = (snapshot: InventorySnapshot): Map<string, InventoryAsset> | null => {
    if (snapshot.queriedChains.filter((index) => index === chainIndex).length !== 1) return null;
    const chains = snapshot.chains.filter((chain) => chain.chainIndex === chainIndex);
    const chain = chains[0];
    if (chains.length !== 1 || !chain || !chain.valueComplete || chain.chainName !== spec.name || chain.kind !== spec.kind || chain.nativeSymbol !== spec.nativeSymbol ||
      chain.nativeBalance === null || !Number.isFinite(chain.nativeBalance) || chain.nativeBalance < 0) return null;
    const assets = new Map<string, InventoryAsset>();
    for (const asset of chain.assets) {
      if (asset.chainIndex !== chainIndex || asset.chainName !== spec.name || asset.native !== (asset.tokenContractAddress === "") ||
        (!asset.native && !isAddressForChain(chainIndex, asset.tokenContractAddress)) ||
        asset.priceUsd === null || !Number.isFinite(asset.priceUsd) || asset.priceUsd <= 0 || !decimalQuantity(asset)) return null;
      const key = identity(asset.tokenContractAddress);
      if (assets.has(key)) return null;
      assets.set(key, asset);
    }
    const native = assets.get("");
    if (!native || native.symbol !== spec.nativeSymbol || native.balance !== chain.nativeBalance) return null;
    return assets;
  };
  const previous = selected(before);
  const current = selected(after);
  const nativeAlias = spec.kind === "evm" ? "0x" + "e".repeat(40) : spec.kind === "solana" ? "1".repeat(32) : "";
  const baseKey = tokenContractAddress === "" || identity(tokenContractAddress) === nativeAlias ? "" : identity(tokenContractAddress);
  if (!previous || !current || previous.size !== current.size || !previous.has(baseKey)) return null;
  let result = 0;
  for (const [key, asset] of previous) {
    const next = current.get(key);
    if (!next || asset.symbol !== next.symbol) return null;
    const delta = quantityDelta(asset, next);
    if (delta === null) return null;
    result += delta * asset.priceUsd!;
  }
  return Number.isFinite(result) ? result : null;
}

/**
 * One operator cycle: inventory, candidates, gates, one Jev choice, one plan, one
 * execution attempt. Jev is only asked when at least one candidate is eligible;
 * an empty eligible set is journaled as hold without inference cost.
 */
export async function runOperatorCycle(deps: CycleDeps): Promise<OperatorCycle> {
  const timeoutMs = deps.decisionTimeoutMs === undefined ? 10_000 : deps.decisionTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("Invalid decision timeout");
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
    const attempt = await boundedDecision(deps.model, state, eligible, timeoutMs);
    decision = attempt.decision;
    if (attempt.reason !== null) {
      inferenceUsd = null;
      warnings.push(attempt.reason);
      execution = { status: "blocked", reasons: [attempt.reason], txHash: null, orderId: null };
    } else if (decision) {
      inferenceUsd = decision.inputTokens === null || deps.jevUsdPerMTok === null ? null : (decision.inputTokens / 1_000_000) * deps.jevUsdPerMTok;
      if (decision.choice !== "hold") {
        const chosen = eligible.find((candidate) => candidate.id === decision!.choice)!;
        plan = buildExecutionPlan(chosen, decision, deps.policy, deps.gate, deps.now());
        execution = deps.executor
          ? await executePlan(plan, chosen, deps.executor, { model: deps.model.name, decision, eligible })
          : { status: plan.executionQualification === "qualified_dry_run" ? "dry_run" : "blocked", reasons: ["no_executor_attached"], txHash: null, orderId: null };
      if (execution.status === "completed" && deps.executor) {
        deps.executor.ledger.updateLeg(plan.planId, { status: "reconciliation_required", note: "result_attribution_unverified" });
        execution = { ...execution, observedBalanceDeltaUsd: null, resultBasis: "inventory_only", realizedUsd: null };
        warnings.push("realized_result_unknown", "result_attribution_unverified");
        try {
          const after = await deps.inventorySource();
          const observedBalanceDeltaUsd = reconcileRealizedUsd(inventory, after, chosen.chainIndex, chosen.from.tokenContractAddress);
          execution = { ...execution, observedBalanceDeltaUsd };
        } catch {
          warnings.push("reconciliation_failed");
        }
      }
      } else {
        execution = { status: "blocked", reasons: ["jev_chose_hold"], txHash: null, orderId: null };
      }
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
