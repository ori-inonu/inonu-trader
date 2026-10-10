import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Persistent operator ledger: cumulative limits, executed idempotency keys and
 * open legs. It survives restarts so a loop can never resend a plan or open a
 * second position on a pair whose first leg is still unreconciled.
 */
export interface OpenLeg {
  planId: string;
  candidateId: string;
  pairKey: string;
  chainIndex: string;
  openedAtMs: number;
  txHash: string;
  /** Atomic amount of the intermediate asset expected from leg 1 (minimum). */
  intermediateAtomic: string;
  status: "leg1_sent" | "leg1_confirmed" | "leg2_sent" | "closed" | "failed";
  closeTxHash: string | null;
  note: string | null;
}

export interface OperatorLedgerState {
  version: 1;
  executedKeys: string[];
  /** YYYY-MM-DD (UTC) -> committed notional in USD. */
  dailyNotionalUsd: Record<string, number>;
  dailyPlans: Record<string, number>;
  /** YYYY-MM-DD (UTC) -> realized result in USD, reconciled from inventory deltas after completed plans. */
  dailyRealizedUsd: Record<string, number>;
  openLegs: OpenLeg[];
  lastExecutionAtMs: number | null;
}

export interface CumulativeLimits {
  maxDailyNotionalUsd: number;
  maxDailyPlans: number;
  cooldownMs: number;
  /** When this file exists, every execution is blocked. */
  killSwitchPath: string;
  /** Open legs older than this are reported, never silently dropped. */
  staleLegMs: number;
  /** Once today's reconciled result is at or below minus this, nothing else executes today. */
  maxDailyLossUsd: number;
}

export function validateCumulativeLimits(limits: CumulativeLimits): void {
  if (!Number.isFinite(limits.maxDailyNotionalUsd) || limits.maxDailyNotionalUsd <= 0 || !Number.isSafeInteger(limits.maxDailyPlans) || limits.maxDailyPlans < 1 ||
    !Number.isSafeInteger(limits.cooldownMs) || limits.cooldownMs < 0 || typeof limits.killSwitchPath !== "string" || !limits.killSwitchPath ||
    !Number.isSafeInteger(limits.staleLegMs) || limits.staleLegMs < 1 || !Number.isFinite(limits.maxDailyLossUsd) || limits.maxDailyLossUsd <= 0) throw new Error("Invalid cumulative limits");
}

export function emptyLedger(): OperatorLedgerState {
  return { version: 1, executedKeys: [], dailyNotionalUsd: {}, dailyPlans: {}, dailyRealizedUsd: {}, openLegs: [], lastExecutionAtMs: null };
}

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLedger(value: unknown): OperatorLedgerState {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.executedKeys) || !isRecord(value.dailyNotionalUsd) || !isRecord(value.dailyPlans) || !Array.isArray(value.openLegs))
    throw new Error("Corrupt operator ledger");
  if (value.dailyRealizedUsd !== undefined && !isRecord(value.dailyRealizedUsd)) throw new Error("Corrupt operator ledger");
  return { ...(value as unknown as OperatorLedgerState), dailyRealizedUsd: (value.dailyRealizedUsd as Record<string, number> | undefined) ?? {} };
}

export interface OperatorLedger {
  state(): OperatorLedgerState;
  /** Reasons that block a new execution now; empty means allowed. */
  checkBeforeExecute(input: { idempotencyKey: string; pairKey: string; sizeUsd: number; nowMs: number; killSwitchExists: boolean }, limits: CumulativeLimits): string[];
  recordExecution(input: { idempotencyKey: string; sizeUsd: number; nowMs: number; leg: OpenLeg | null }): void;
  updateLeg(planId: string, patch: Partial<OpenLeg>): void;
  openLegs(): OpenLeg[];
  /** Adds a reconciled realized result (USD, signed) to the day's total. */
  recordRealized(nowMs: number, realizedUsd: number): void;
  dayRealizedUsd(nowMs: number): number;
}

export function createOperatorLedger(initial: OperatorLedgerState, persist: (state: OperatorLedgerState) => void): OperatorLedger {
  let state = initial;
  const save = () => persist(state);
  return {
    state: () => state,
    checkBeforeExecute(input, limits) {
      validateCumulativeLimits(limits);
      const reasons: string[] = [];
      if (input.killSwitchExists) reasons.push("kill_switch_present");
      if (state.executedKeys.includes(input.idempotencyKey)) reasons.push("idempotency_key_already_executed");
      const day = dayKey(input.nowMs);
      if ((state.dailyNotionalUsd[day] ?? 0) + input.sizeUsd > limits.maxDailyNotionalUsd) reasons.push("daily_notional_cap");
      if ((state.dailyPlans[day] ?? 0) + 1 > limits.maxDailyPlans) reasons.push("daily_plan_cap");
      if (state.lastExecutionAtMs !== null && input.nowMs - state.lastExecutionAtMs < limits.cooldownMs) reasons.push("cooldown_active");
      if ((state.dailyRealizedUsd[day] ?? 0) <= -limits.maxDailyLossUsd) reasons.push("daily_loss_stop");
      const open = state.openLegs.filter((leg) => leg.status !== "closed");
      if (open.some((leg) => leg.pairKey === input.pairKey)) reasons.push("open_leg_on_pair");
      if (open.some((leg) => leg.status === "failed")) reasons.push("failed_leg_requires_manual_reconciliation");
      if (open.some((leg) => input.nowMs - leg.openedAtMs > limits.staleLegMs)) reasons.push("stale_open_leg");
      return reasons;
    },
    recordExecution(input) {
      const day = dayKey(input.nowMs);
      state = {
        ...state,
        executedKeys: [...state.executedKeys, input.idempotencyKey].slice(-5_000),
        dailyNotionalUsd: { ...state.dailyNotionalUsd, [day]: (state.dailyNotionalUsd[day] ?? 0) + input.sizeUsd },
        dailyPlans: { ...state.dailyPlans, [day]: (state.dailyPlans[day] ?? 0) + 1 },
        lastExecutionAtMs: input.nowMs,
        openLegs: input.leg ? [...state.openLegs, input.leg] : state.openLegs,
      };
      save();
    },
    updateLeg(planId, patch) {
      state = { ...state, openLegs: state.openLegs.map((leg) => leg.planId === planId ? { ...leg, ...patch } : leg) };
      save();
    },
    openLegs: () => state.openLegs.filter((leg) => leg.status !== "closed"),
    recordRealized(nowMs, realizedUsd) {
      if (!Number.isFinite(realizedUsd)) throw new Error("Invalid realized result");
      const day = dayKey(nowMs);
      state = { ...state, dailyRealizedUsd: { ...state.dailyRealizedUsd, [day]: (state.dailyRealizedUsd[day] ?? 0) + realizedUsd } };
      save();
    },
    dayRealizedUsd: (nowMs) => state.dailyRealizedUsd[dayKey(nowMs)] ?? 0,
  };
}

export function loadLedgerFile(path: string): OperatorLedgerState {
  if (!existsSync(path)) return emptyLedger();
  return parseLedger(JSON.parse(readFileSync(path, "utf8")));
}

export function ledgerFilePersister(path: string): (state: OperatorLedgerState) => void {
  return (state) => {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    writeFileSync(path, readFileSync(tmp));
  };
}
