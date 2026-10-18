import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync, type Stats } from "node:fs";
import { dirname, isAbsolute } from "node:path";

/**
 * Persistent operator ledger: cumulative limits, executed idempotency keys and
 * open legs. It survives restarts so a loop can never resend a plan or open a
 * second position on a pair whose first leg is still unreconciled.
 *
 * Fail closed (R5 A3, F3): the file is created only by an explicit init; a
 * missing file while history exists blocks execution; a corrupt or loosely
 * typed file throws; writes are atomic (temp file plus rename); callers hold a
 * process lock so two loops never share one ledger.
 */
export interface OpenLeg {
  planId: string;
  candidateId: string;
  pairKey: string;
  chainIndex: string;
  openedAtMs: number;
  txHash: string;
  /** Known first ERC20 approval identity; omission/null means unavailable. */
  approveTxHash?: string | null;
  /** Atomic amount of the intermediate asset expected from leg 1 (minimum). */
  intermediateAtomic: string;
  status: "leg1_sent" | "leg1_confirmed" | "leg2_sent" | "reconciliation_required" | "closed" | "failed";
  closeTxHash: string | null;
  /** Known closing ERC20 approval identity; omission/null means unavailable. */
  closeApproveTxHash?: string | null;
  /** Signed realized result in USD, gas included, recorded once by the manual reconcile; absent means none recorded. */
  realizedUsd?: number;
  note: string | null;
}

export interface OperatorLedgerState {
  version: 1;
  executedKeys: string[];
  /** YYYY-MM-DD (UTC) -> committed notional in USD. */
  dailyNotionalUsd: Record<string, number>;
  dailyPlans: Record<string, number>;
  /** YYYY-MM-DD (UTC) -> separately qualified attributable realized result in USD. */
  dailyRealizedUsd: Record<string, number>;
  /** Running sum of realized results and the highest value it reached, for the drawdown stop. */
  cumulativeRealizedUsd: number;
  peakRealizedUsd: number;
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
  /** Same over the ISO week. */
  maxWeeklyLossUsd: number;
  /** Peak-to-current fall of the cumulative realized result that stops the operator. */
  maxDrawdownUsd: number;
}

const LEG_STATUSES = new Set(["leg1_sent", "leg1_confirmed", "leg2_sent", "reconciliation_required", "closed", "failed"]);

export function validateCumulativeLimits(limits: CumulativeLimits): void {
  const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!positive(limits.maxDailyNotionalUsd) || !Number.isSafeInteger(limits.maxDailyPlans) || limits.maxDailyPlans < 1 ||
    !Number.isSafeInteger(limits.cooldownMs) || limits.cooldownMs < 0 || typeof limits.killSwitchPath !== "string" || !limits.killSwitchPath ||
    !Number.isSafeInteger(limits.staleLegMs) || limits.staleLegMs < 1 || !positive(limits.maxDailyLossUsd) || !positive(limits.maxWeeklyLossUsd) || !positive(limits.maxDrawdownUsd))
    throw new Error("Invalid cumulative limits");
}

export function emptyLedger(): OperatorLedgerState {
  return { version: 1, executedKeys: [], dailyNotionalUsd: {}, dailyPlans: {}, dailyRealizedUsd: {}, cumulativeRealizedUsd: 0, peakRealizedUsd: 0, openLegs: [], lastExecutionAtMs: null };
}

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** ISO week key, YYYY-Www, UTC. */
export function weekKey(nowMs: number): string {
  const source = new Date(nowMs);
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.entries(value).every(([key, entry]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && typeof entry === "number" && Number.isFinite(entry));
}

/** Notional per day: never negative; fractions are legitimate (sizes are in USD with cents). */
function notionalMap(value: unknown): value is Record<string, number> {
  return finiteMap(value) && Object.values(value).every((entry) => entry >= 0);
}

/** Plans per day: a count, so a non-negative integer. */
function countMap(value: unknown): value is Record<string, number> {
  return finiteMap(value) && Object.values(value).every((entry) => Number.isSafeInteger(entry) && entry >= 0);
}

/** A plan id names one leg: updateLeg and the reconcile patch every leg that carries it. */
function distinctPlanIds(legs: OpenLeg[]): boolean {
  return new Set(legs.map((leg) => leg.planId)).size === legs.length;
}

function validLeg(value: unknown): value is OpenLeg {
  return isRecord(value) && typeof value.planId === "string" && typeof value.candidateId === "string" && typeof value.pairKey === "string" &&
    typeof value.chainIndex === "string" && Number.isSafeInteger(value.openedAtMs) && typeof value.txHash === "string" &&
    typeof value.intermediateAtomic === "string" && typeof value.status === "string" && LEG_STATUSES.has(value.status) &&
    (!Object.prototype.hasOwnProperty.call(value, "approveTxHash") || value.approveTxHash === null ||
      (typeof value.approveTxHash === "string" && value.approveTxHash.length > 0)) &&
    (!Object.prototype.hasOwnProperty.call(value, "closeApproveTxHash") || value.closeApproveTxHash === null ||
      (typeof value.closeApproveTxHash === "string" && value.closeApproveTxHash.length > 0)) &&
    (!Object.prototype.hasOwnProperty.call(value, "realizedUsd") || (typeof value.realizedUsd === "number" && Number.isFinite(value.realizedUsd))) &&
    (value.closeTxHash === null || typeof value.closeTxHash === "string") && (value.note === null || typeof value.note === "string");
}

/** Strict parse (R5 A3): every field must have its exact type; nothing defaults silently. */
export function parseLedger(value: unknown): OperatorLedgerState {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.executedKeys) || !value.executedKeys.every((key) => typeof key === "string") ||
    !notionalMap(value.dailyNotionalUsd) || !countMap(value.dailyPlans) || !finiteMap(value.dailyRealizedUsd) ||
    typeof value.cumulativeRealizedUsd !== "number" || !Number.isFinite(value.cumulativeRealizedUsd) ||
    typeof value.peakRealizedUsd !== "number" || !Number.isFinite(value.peakRealizedUsd) ||
    !Array.isArray(value.openLegs) || !value.openLegs.every(validLeg) || !distinctPlanIds(value.openLegs) ||
    !(value.lastExecutionAtMs === null || Number.isSafeInteger(value.lastExecutionAtMs)))
    throw new Error("Corrupt operator ledger");
  return value as unknown as OperatorLedgerState;
}

export interface OperatorLedger {
  state(): OperatorLedgerState;
  /** Reasons that block a new execution now; empty means allowed. */
  checkBeforeExecute(input: { idempotencyKey: string; pairKey: string; sizeUsd: number; nowMs: number; killSwitchExists: boolean }, limits: CumulativeLimits): string[];
  recordExecution(input: { idempotencyKey: string; sizeUsd: number; nowMs: number; leg: OpenLeg | null }): void;
  updateLeg(planId: string, patch: Partial<OpenLeg>): void;
  openLegs(): OpenLeg[];
  /** Adds a reconciled realized result (USD, signed, gas included) to the day, the week and the running total. */
  recordRealized(nowMs: number, realizedUsd: number): void;
  /**
   * Manual reconcile of one open leg in a SINGLE write: the new status and note and, the first time, the signed
   * realized result, which also feeds the day, the week and the running total (R10 M1, M2). A leg takes at most one
   * result: a second value is refused, and without a value the leg must already carry one. Memory is replaced only
   * after the write succeeded, so a failed write can be repeated without doubling the result.
   */
  reconcileLeg(planId: string, status: "closed" | "failed", realizedUsd: number | null, nowMs: number, note: string): void;
  dayRealizedUsd(nowMs: number): number;
  weekRealizedUsd(nowMs: number): number;
  drawdownUsd(): number;
}

export function createOperatorLedger(initial: OperatorLedgerState, persist: (state: OperatorLedgerState) => void): OperatorLedger {
  let state = parseLedger(initial);
  const save = () => persist(state);
  const weekSum = (nowMs: number) => {
    const week = weekKey(nowMs);
    return Object.entries(state.dailyRealizedUsd).filter(([day]) => weekKey(Date.parse(`${day}T00:00:00Z`)) === week).reduce((sum, [, value]) => sum + value, 0);
  };
  return {
    state: () => state,
    checkBeforeExecute(input, limits) {
      validateCumulativeLimits(limits);
      if (!Number.isFinite(input.sizeUsd) || input.sizeUsd <= 0 || !Number.isSafeInteger(input.nowMs)) return ["invalid_execution_input"];
      const reasons: string[] = [];
      if (input.killSwitchExists) reasons.push("kill_switch_present");
      if (state.executedKeys.includes(input.idempotencyKey)) reasons.push("idempotency_key_already_executed");
      const day = dayKey(input.nowMs);
      if ((state.dailyNotionalUsd[day] ?? 0) + input.sizeUsd > limits.maxDailyNotionalUsd) reasons.push("daily_notional_cap");
      if ((state.dailyPlans[day] ?? 0) + 1 > limits.maxDailyPlans) reasons.push("daily_plan_cap");
      if (state.lastExecutionAtMs !== null && input.nowMs - state.lastExecutionAtMs < limits.cooldownMs) reasons.push("cooldown_active");
      if ((state.dailyRealizedUsd[day] ?? 0) <= -limits.maxDailyLossUsd) reasons.push("daily_loss_stop");
      if (weekSum(input.nowMs) <= -limits.maxWeeklyLossUsd) reasons.push("weekly_loss_stop");
      if (state.peakRealizedUsd - state.cumulativeRealizedUsd >= limits.maxDrawdownUsd) reasons.push("drawdown_stop");
      const open = state.openLegs.filter((leg) => leg.status !== "closed");
      if (open.some((leg) => leg.pairKey === input.pairKey)) reasons.push("open_leg_on_pair");
      if (open.some((leg) => leg.status === "reconciliation_required")) reasons.push("unattributed_result_requires_reconciliation");
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
      const cumulative = state.cumulativeRealizedUsd + realizedUsd;
      state = {
        ...state,
        dailyRealizedUsd: { ...state.dailyRealizedUsd, [day]: (state.dailyRealizedUsd[day] ?? 0) + realizedUsd },
        cumulativeRealizedUsd: cumulative,
        peakRealizedUsd: Math.max(state.peakRealizedUsd, cumulative),
      };
      save();
    },
    reconcileLeg(planId, status, realizedUsd, nowMs, note) {
      if (status !== "closed" && status !== "failed") throw new Error("Invalid reconcile status");
      const leg = state.openLegs.find((entry) => entry.planId === planId);
      if (!leg || leg.status === "closed") throw new Error(`No open leg with planId ${planId}`);
      if (realizedUsd === null) {
        if (leg.realizedUsd === undefined) throw new Error("Realized result required: this leg has none recorded");
      } else {
        if (!Number.isFinite(realizedUsd)) throw new Error("Invalid realized result");
        if (leg.realizedUsd !== undefined) throw new Error("Realized result already recorded for this leg");
      }
      const patch: Partial<OpenLeg> = realizedUsd === null ? { status, note } : { status, note, realizedUsd };
      const openLegs = state.openLegs.map((entry) => entry.planId === planId ? { ...entry, ...patch } : entry);
      let next: OperatorLedgerState = { ...state, openLegs };
      if (realizedUsd !== null) {
        const day = dayKey(nowMs);
        const cumulative = state.cumulativeRealizedUsd + realizedUsd;
        next = {
          ...next,
          dailyRealizedUsd: { ...state.dailyRealizedUsd, [day]: (state.dailyRealizedUsd[day] ?? 0) + realizedUsd },
          cumulativeRealizedUsd: cumulative,
          peakRealizedUsd: Math.max(state.peakRealizedUsd, cumulative),
        };
      }
      persist(next);
      state = next;
    },
    dayRealizedUsd: (nowMs) => state.dailyRealizedUsd[dayKey(nowMs)] ?? 0,
    weekRealizedUsd: (nowMs) => weekSum(nowMs),
    drawdownUsd: () => state.peakRealizedUsd - state.cumulativeRealizedUsd,
  };
}

/* ---------- Files ---------- */

function requireAbsolute(path: string): void {
  if (!isAbsolute(path)) throw new Error("Ledger paths must be absolute");
}

export type LedgerFileStatus = { status: "ready"; state: OperatorLedgerState } | { status: "missing" } | { status: "corrupt"; message: string };

/** Reads without creating. A missing file is reported, never replaced by an empty ledger. */
export function readLedgerFile(path: string): LedgerFileStatus {
  requireAbsolute(path);
  if (!existsSync(path)) return { status: "missing" };
  try {
    return { status: "ready", state: parseLedger(JSON.parse(readFileSync(path, "utf8"))) };
  } catch (error) {
    return { status: "corrupt", message: error instanceof Error ? error.message : "unreadable" };
  }
}

/** Creates an empty ledger file; refuses to overwrite an existing one. */
export function initLedgerFile(path: string): OperatorLedgerState {
  requireAbsolute(path);
  if (existsSync(path)) throw new Error("Ledger already exists; refusing to overwrite");
  const state = emptyLedger();
  ledgerFilePersister(path)(state);
  return state;
}

/**
 * Bounded replacement of `path` by the already written `tmp` (R5 A3, B6; R8 N9). On Windows a rename onto a
 * file another process holds open (the dashboard reads latest.json on every request, antivirus, indexers) fails
 * with EPERM, EBUSY or EACCES for a moment: those three are retried, at most four attempts in total with waits
 * of 10, 20 and 40 ms, and only on win32. Any other error, and every error elsewhere, propagates at once. The
 * same tmp file is reused by every attempt and the destination is never removed, so a failure leaves the prior
 * bytes in place. `beforeAttempt` runs before each attempt, so a caller can revalidate a destination that may
 * have changed during a wait; whatever it throws ends the retries.
 */
export interface BoundedReplaceOptions {
  platform?: string;
  rename?: typeof renameSync;
  wait?: (milliseconds: number) => void;
  beforeAttempt?: () => void;
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function replaceFileBounded(tmp: string, path: string, options: BoundedReplaceOptions = {}): void {
  const rename = options.rename ?? renameSync;
  const wait = options.wait ?? sleepSync;
  for (let attempt = 0; ; attempt++) {
    options.beforeAttempt?.();
    try { rename(tmp, path); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if ((options.platform ?? process.platform) !== "win32" ||
        !["EPERM", "EBUSY", "EACCES"].includes(code ?? "") || attempt >= 3) throw error;
      wait(10 * 2 ** attempt);
    }
  }
}

/** Atomic write: temp file in the same directory, then rename (R5 A3, B6). */
export interface LedgerPersistenceOptions {
  platform?: string;
  rename?: typeof renameSync;
  wait?: (milliseconds: number) => void;
  lstat?: (path: string) => Pick<Stats, "isDirectory" | "isSymbolicLink">;
}

export function ledgerFilePersister(path: string, options: LedgerPersistenceOptions = {}): (state: OperatorLedgerState) => void {
  requireAbsolute(path);
  const lstat = options.lstat ?? lstatSync;
  const validateDestination = () => {
    let destination;
    try { destination = lstat(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code !== "ENOENT") throw error;
    }
    if (destination?.isDirectory() || destination?.isSymbolicLink())
      throw Object.assign(new Error("Invalid ledger destination: directory or symbolic link"), { code: "EINVAL" });
  };
  return (state) => {
    validateDestination();
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    replaceFileBounded(tmp, path, { platform: options.platform, rename: options.rename, wait: options.wait, beforeAttempt: validateDestination });
  };
}

/** Process lock: created exclusively with the pid inside; a stale lock must be removed by a human. */
export function acquireLock(path: string): () => void {
  requireAbsolute(path);
  mkdirSync(dirname(path), { recursive: true });
  let fd: number;
  try {
    fd = openSync(path, "wx");
  } catch {
    throw new Error(`Operator lock present at ${path}; another operator may be running. Remove it only after checking.`);
  }
  writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
  closeSync(fd);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { unlinkSync(path); } catch { /* already gone */ }
  };
}
