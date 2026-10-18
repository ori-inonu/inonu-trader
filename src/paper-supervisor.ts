import { createHash, randomBytes } from "node:crypto";
import { PaperCapital, type PaperCapitalConfig, type PaperCheckpoint, type PaperPlan, type PaperReceipt, type PaperSnapshot, type PaperStopReason } from "./paper-capital";

export type PaperSupervisorOwner = { token: string; pid: number };
export type PaperSupervisorAttempt = {
  attemptId: string;
  planId: string;
  planSha256: string;
  phase: "intent" | "observed" | "settled";
  observation: null | { evidenceId: string; receipt: PaperReceipt };
};
export type PaperSupervisorEnvelope = {
  version: 1;
  mode: "synthetic-paper";
  strategyQualified: false;
  financiallyAuthorized: false;
  generation: number;
  configSha256: string;
  adapterId: string;
  owner: PaperSupervisorOwner | null;
  capital: PaperCheckpoint;
  attempts: PaperSupervisorAttempt[];
  hold: "adapter_contract" | null;
  sha256: string;
};

export type PaperSupervisorAdapterRequest = { adapterId: string; attemptId: string; plan: PaperPlan };
export type PaperAdapterResult =
  | { kind: "terminal"; evidenceId: string; receipt: PaperReceipt }
  | { kind: "pending"; reason: string }
  | { kind: "unknown"; reason: string };
export interface PaperSupervisorAdapter {
  execute(request: PaperSupervisorAdapterRequest, signal: AbortSignal): Promise<PaperAdapterResult>;
  reconcile(request: PaperSupervisorAdapterRequest, signal: AbortSignal): Promise<PaperAdapterResult>;
  drain(signal: AbortSignal): Promise<{ drained: boolean }>;
  close(signal: AbortSignal): Promise<void>;
}
export interface PaperSupervisorStore {
  readonly createdFresh: boolean;
  load(): Promise<PaperSupervisorEnvelope>;
  publish(expectedGeneration: number, candidate: PaperSupervisorEnvelope): Promise<PaperSupervisorEnvelope>;
  assertOwner(expectedGeneration: number): Promise<void>;
  release(expectedGeneration: number): Promise<PaperSupervisorEnvelope>;
  close(): Promise<void>;
}
export interface PaperSupervisorClock {
  monotonicNowMs(): number;
  wallNowMs(): number;
  wait(ms: number, signal: AbortSignal): Promise<void>;
}
export type PaperSupervisorLimits = {
  maxTicks: number;
  maxDurationMs: number;
  cadenceMs: number;
  adapterTimeoutMs: number;
  drainTimeoutMs: number;
};
export type PaperSupervisorStage =
  | "initialized" | "reserved_saved" | "intent_saved" | "adapter_pending"
  | "observation_saved" | "settled_saved" | "stop_saved" | "cancel_saved"
  | "owner_released" | "closed";
export type PaperSupervisorOptions = {
  store: PaperSupervisorStore;
  adapter: PaperSupervisorAdapter;
  clock?: PaperSupervisorClock;
  limits?: Partial<PaperSupervisorLimits>;
  onStage?: (stage: PaperSupervisorStage, envelope: PaperSupervisorEnvelope) => void | Promise<void>;
};
export type PaperSupervisorTickResult =
  | { kind: "idle" | "busy" | "cancelled" | "duplicate" | "held" | "reconciled" | "settled"; attemptId?: string; reason?: string };
export type PaperSupervisorCloseResult = {
  kind: "closed" | "drain_incomplete";
  resourcesClosed: boolean;
  ownerReleased: boolean;
};
export type PaperSupervisorStatus = {
  mode: "synthetic-paper";
  strategyQualified: false;
  financiallyAuthorized: false;
  generation: number;
  operationalState: "ready" | "held" | "quarantined" | "closing" | "closed";
  holdReason: string | null;
  capital: PaperSnapshot;
  heldAttemptIds: string[];
  lastAdapterError: string | null;
  lastStoreError: string | null;
  completedTicks: number;
  elapsedMs: number;
  resourcesClosed: boolean;
  ownerReleased: boolean;
};

const ENVELOPE_KEYS = ["version", "mode", "strategyQualified", "financiallyAuthorized", "generation", "configSha256", "adapterId", "owner", "capital", "attempts", "hold", "sha256"] as const;
const ATTEMPT_KEYS = ["attemptId", "planId", "planSha256", "phase", "observation"] as const;
const OWNER_KEYS = ["token", "pid"] as const;
const OBSERVATION_KEYS = ["evidenceId", "receipt"] as const;
const RECEIPT_KEYS = ["receiptId", "planId", "asset", "inputAtoms", "returnedAtoms", "externalCostAtoms", "costsComplete", "outcome"] as const;
const MIN_GENERATION = 0;
const MAX_GENERATION = 1_000_000;
const MAX_ENVELOPE_BYTES = 1_048_576;
const MAX_EVENTS = 2_048;
const MAX_ATTEMPTS = 128;
const MAX_TEXT = 128;

export class PaperSupervisorError extends Error {
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.name = "PaperSupervisorError";
    this.code = code;
  }
}

function cloneSupervisorValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function canonicalJson(value: unknown, preserveCapital = false): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry, preserveCapital)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${preserveCapital && key === "capital" ? JSON.stringify(record[key]) : canonicalJson(record[key], preserveCapital)}`).join(",")}}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function canonicalEnvelope(envelope: PaperSupervisorEnvelope): string {
  return canonicalJson(envelope, true);
}

function envelopeBody(envelope: Omit<PaperSupervisorEnvelope, "sha256">): string {
  return canonicalJson(envelope, true);
}

function configSha256(config: PaperCapitalConfig): string {
  return sha256(canonicalJson(config));
}

export function sealEnvelope(body: Omit<PaperSupervisorEnvelope, "sha256">): PaperSupervisorEnvelope {
  const withHash = { ...body, sha256: "" } as PaperSupervisorEnvelope;
  withHash.sha256 = sha256(envelopeBody(body));
  return withHash;
}

export function createInitialEnvelope(input: {
  config: PaperCapitalConfig;
  adapterId: string;
  owner: PaperSupervisorOwner;
}): PaperSupervisorEnvelope {
  const capital = new PaperCapital(input.config).checkpoint();
  return sealEnvelope({
    version: 1,
    mode: "synthetic-paper",
    strategyQualified: false,
    financiallyAuthorized: false,
    generation: 0,
    configSha256: configSha256(input.config),
    adapterId: input.adapterId,
    owner: cloneSupervisorValue(input.owner),
    capital,
    attempts: [],
    hold: null,
  });
}

function exactRecord(value: unknown, keys: readonly string[], code = "invalid_envelope"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new PaperSupervisorError(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new PaperSupervisorError(code);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key as never))) throw new PaperSupervisorError(code);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new PaperSupervisorError(code);
  }
  return value as Record<string, unknown>;
}

function assertJsonData(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new PaperSupervisorError("invalid_envelope");
    return;
  }
  if (typeof value !== "object") throw new PaperSupervisorError("invalid_envelope");
  if (seen.has(value)) throw new PaperSupervisorError("invalid_envelope");
  seen.add(value);
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1) throw new PaperSupervisorError("invalid_envelope");
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new PaperSupervisorError("invalid_envelope");
      assertJsonData(descriptor.value, seen);
    }
  } else {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new PaperSupervisorError("invalid_envelope");
    for (const key of Reflect.ownKeys(record)) {
      if (typeof key !== "string") throw new PaperSupervisorError("invalid_envelope");
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new PaperSupervisorError("invalid_envelope");
      assertJsonData(descriptor.value, seen);
    }
  }
  seen.delete(value);
}

function checkMoney(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value) && value.length <= 4096;
}

function checkAsset(value: unknown): void {
  const record = exactRecord(value, ["chainId", "token", "decimals", "venue"]);
  if (typeof record.chainId !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(record.chainId) || record.chainId.length > 64) throw new PaperSupervisorError("invalid_envelope");
  if (typeof record.token !== "string" || record.token.length === 0 || record.token.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
  if (typeof record.venue !== "string" || record.venue.length === 0 || record.venue.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
  if (!Number.isInteger(record.decimals) || (record.decimals as number) < 0 || (record.decimals as number) > 255) throw new PaperSupervisorError("invalid_envelope");
}

function checkPlan(value: unknown): PaperPlan {
  const record = exactRecord(value, ["id", "asset", "inputAtoms", "costBudgetAtoms"]);
  if (typeof record.id !== "string" || record.id.length === 0 || record.id.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
  checkAsset(record.asset);
  if (!checkMoney(record.inputAtoms) || !checkMoney(record.costBudgetAtoms)) throw new PaperSupervisorError("invalid_envelope");
  return value as PaperPlan;
}

function checkReceipt(value: unknown): PaperReceipt {
  const record = exactRecord(value, RECEIPT_KEYS);
  if (typeof record.receiptId !== "string" || record.receiptId.length === 0 || record.receiptId.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
  if (typeof record.planId !== "string" || record.planId.length === 0 || record.planId.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
  checkAsset(record.asset);
  if (!checkMoney(record.inputAtoms) || !checkMoney(record.returnedAtoms)) throw new PaperSupervisorError("invalid_envelope");
  if (record.externalCostAtoms !== null && !checkMoney(record.externalCostAtoms)) throw new PaperSupervisorError("invalid_envelope");
  if (typeof record.costsComplete !== "boolean" || !["completed", "reverted"].includes(record.outcome as string)) throw new PaperSupervisorError("invalid_envelope");
  return value as PaperReceipt;
}

function validateCapitalTransport(value: unknown): void {
  const checkpoint = exactRecord(value, ["version", "mode", "strategyQualified", "financiallyAuthorized", "config", "events", "sha256"]);
  const config = exactRecord(checkpoint.config, ["asset", "initialAtoms", "maxCommittedAtoms", "maxDrawdownAtoms"]);
  checkAsset(config.asset);
  if (!checkMoney(config.initialAtoms) || !checkMoney(config.maxCommittedAtoms) || !checkMoney(config.maxDrawdownAtoms)) throw new PaperSupervisorError("invalid_envelope");
  if (!Array.isArray(checkpoint.events) || checkpoint.events.length > MAX_EVENTS) throw new PaperSupervisorError("invalid_envelope");

  const stopReasons: readonly PaperStopReason[] = ["plan_conflict", "unknown_cost", "invalid_receipt", "receipt_conflict", "unfunded_receipt"];
  for (const raw of checkpoint.events) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new PaperSupervisorError("invalid_envelope");
    const type = Object.getOwnPropertyDescriptor(raw, "type");
    if (!type || !type.enumerable || !("value" in type)) throw new PaperSupervisorError("invalid_envelope");
    switch (type.value) {
      case "reserve": {
        const event = exactRecord(raw, ["type", "plan"]);
        checkPlan(event.plan);
        break;
      }
      case "start":
      case "cancel": {
        const event = exactRecord(raw, ["type", "planId"]);
        if (typeof event.planId !== "string" || event.planId.length === 0 || event.planId.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
        break;
      }
      case "settle": {
        const event = exactRecord(raw, ["type", "receipt"]);
        checkReceipt(event.receipt);
        break;
      }
      case "stop": {
        const event = exactRecord(raw, ["type", "reason"]);
        if (typeof event.reason !== "string" || event.reason.length === 0 || event.reason.length > MAX_TEXT || !stopReasons.includes(event.reason as PaperStopReason)) throw new PaperSupervisorError("invalid_envelope");
        break;
      }
      default:
        throw new PaperSupervisorError("invalid_envelope");
    }
  }
}

function planMap(capital: PaperCapital): Map<string, PaperPlan & { status: string }> {
  return new Map(capital.snapshot().plans.map((plan) => [plan.id, plan]));
}

export function mandatoryGenerationBudget(envelope: PaperSupervisorEnvelope): number {
  const snapshot = PaperCapital.restore(envelope.capital).snapshot();
  const reserved = snapshot.plans.filter((plan) => plan.status === "reserved").length;
  const inflight = snapshot.plans.filter((plan) => plan.status === "inflight");
  const intents = inflight.filter((plan) => envelope.attempts.some((attempt) => attempt.planId === plan.id && attempt.phase === "intent")).length;
  const observed = inflight.filter((plan) => envelope.attempts.some((attempt) => attempt.planId === plan.id && attempt.phase === "observed")).length;
  const firstStop = snapshot.stopped ? 0 : 1;
  const firstHold = envelope.hold === null ? 1 : 0;
  return reserved + 2 * intents + observed + firstStop + firstHold;
}

export function assertRecoveryCapacity(envelope: PaperSupervisorEnvelope): void {
  assertByteEventCapacity(envelope);
  const required = envelope.generation + 1 + mandatoryGenerationBudget(envelope) + 1;
  if (required > MAX_GENERATION) throw new PaperSupervisorError("generation_capacity_exhausted");
}

export function assertOwnedCapacity(envelope: PaperSupervisorEnvelope): void {
  const required = envelope.generation + mandatoryGenerationBudget(envelope) + 1;
  if (required > MAX_GENERATION) throw new PaperSupervisorError("generation_capacity_exhausted");
}

export function assertFreshIntakeCapacity(envelope: PaperSupervisorEnvelope): void {
  const snapshot = PaperCapital.restore(envelope.capital).snapshot();
  const reserved = snapshot.plans.filter((plan) => plan.status === "reserved").length;
  const inflight = snapshot.plans.filter((plan) => plan.status === "inflight");
  const intents = inflight.filter((plan) => envelope.attempts.some((attempt) => attempt.planId === plan.id && attempt.phase === "intent")).length;
  const observed = inflight.filter((plan) => envelope.attempts.some((attempt) => attempt.planId === plan.id && attempt.phase === "observed")).length;
  if (envelope.generation + 8 * reserved + 6 * intents + 4 * observed + 4 > MAX_GENERATION) throw new PaperSupervisorError("generation_capacity_exhausted");
  assertByteEventCapacity(envelope);
}

export function assertByteEventCapacity(envelope: PaperSupervisorEnvelope): void {
  const snapshot = PaperCapital.restore(envelope.capital).snapshot();
  const reserved = snapshot.plans.filter((plan) => plan.status === "reserved").length;
  const inflight = snapshot.plans.filter((plan) => plan.status === "inflight");
  const intents = inflight.filter((plan) => envelope.attempts.some((attempt) => attempt.planId === plan.id && attempt.phase === "intent")).length;
  const observed = inflight.filter((plan) => envelope.attempts.some((attempt) => attempt.planId === plan.id && attempt.phase === "observed")).length;
  const bytes = Buffer.byteLength(canonicalEnvelope(envelope), "utf8");
  if (bytes + 98_304 * reserved + 65_536 * intents + 32_768 * observed + 4_096 > MAX_ENVELOPE_BYTES) throw new PaperSupervisorError("envelope_capacity_exhausted");
  if (snapshot.plans.length > MAX_ATTEMPTS || envelope.capital.events.length + 3 * reserved + 2 * intents + observed + 1 > MAX_EVENTS) throw new PaperSupervisorError("event_capacity_exhausted");
}

export function validateEnvelope(input: unknown, expected?: { config: PaperCapitalConfig; adapterId: string }): PaperSupervisorEnvelope {
  assertJsonData(input);
  const record = exactRecord(input, ENVELOPE_KEYS);
  if (Buffer.byteLength(canonicalEnvelope(input as PaperSupervisorEnvelope), "utf8") > MAX_ENVELOPE_BYTES) throw new PaperSupervisorError("envelope_too_large");
  if (record.version !== 1 || record.mode !== "synthetic-paper" || record.strategyQualified !== false || record.financiallyAuthorized !== false) throw new PaperSupervisorError("invalid_envelope");
  if (!Number.isSafeInteger(record.generation) || (record.generation as number) < MIN_GENERATION || (record.generation as number) > MAX_GENERATION) throw new PaperSupervisorError("invalid_envelope");
  if (typeof record.configSha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.configSha256)) throw new PaperSupervisorError("invalid_envelope");
  if (typeof record.adapterId !== "string" || record.adapterId.length === 0 || record.adapterId.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
  if (record.owner !== null) {
    const owner = exactRecord(record.owner, OWNER_KEYS);
    if (typeof owner.token !== "string" || !/^[0-9a-f]{32}$/.test(owner.token) || !Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0) throw new PaperSupervisorError("invalid_envelope");
  }
  if (record.hold !== null && record.hold !== "adapter_contract") throw new PaperSupervisorError("invalid_envelope");
  if (!Array.isArray(record.attempts) || record.attempts.length > MAX_ATTEMPTS) throw new PaperSupervisorError("invalid_envelope");
  if (!/^[0-9a-f]{64}$/.test(String(record.sha256))) throw new PaperSupervisorError("invalid_envelope");
  if (!record.capital || typeof record.capital !== "object" || Array.isArray(record.capital)) throw new PaperSupervisorError("invalid_envelope");
  const capitalRecord = record.capital as Record<string, unknown>;
  if (capitalRecord.events && Array.isArray(capitalRecord.events) && capitalRecord.events.length > MAX_EVENTS) throw new PaperSupervisorError("invalid_envelope");
  validateCapitalTransport(record.capital);
  const capital = PaperCapital.restore(record.capital);
  const checkpoint = capital.checkpoint();
  if (JSON.stringify(record.capital) !== JSON.stringify(checkpoint)) throw new PaperSupervisorError("invalid_envelope");
  if (record.configSha256 !== configSha256(checkpoint.config)) throw new PaperSupervisorError("invalid_envelope");
  if (expected && (record.configSha256 !== configSha256(expected.config) || record.adapterId !== expected.adapterId || canonicalJson(checkpoint.config) !== canonicalJson(expected.config))) throw new PaperSupervisorError("identity_mismatch");
  const planStatuses = planMap(capital);
  const attemptIds = new Set<string>();
  const attemptPlans = new Set<string>();
  for (const raw of record.attempts) {
    const attempt = exactRecord(raw, ATTEMPT_KEYS);
    if (typeof attempt.attemptId !== "string" || attempt.attemptId.length === 0 || attempt.attemptId.length > MAX_TEXT || attemptIds.has(attempt.attemptId)) throw new PaperSupervisorError("invalid_envelope");
    if (typeof attempt.planId !== "string" || attempt.planId.length === 0 || attempt.planId.length > MAX_TEXT || attemptPlans.has(attempt.planId)) throw new PaperSupervisorError("invalid_envelope");
    if (!/^[0-9a-f]{64}$/.test(String(attempt.planSha256))) throw new PaperSupervisorError("invalid_envelope");
    if (!["intent", "observed", "settled"].includes(attempt.phase as string)) throw new PaperSupervisorError("invalid_envelope");
    const plan = planStatuses.get(attempt.planId);
    if (!plan || (attempt.phase === "settled" ? plan.status !== "settled" : plan.status !== "inflight")) throw new PaperSupervisorError("invalid_envelope");
    const planHash = sha256(canonicalJson({ id: plan.id, asset: plan.asset, inputAtoms: plan.inputAtoms, costBudgetAtoms: plan.costBudgetAtoms }));
    if (planHash !== attempt.planSha256) throw new PaperSupervisorError("invalid_envelope");
    if (attempt.phase === "intent") {
      if (attempt.observation !== null) throw new PaperSupervisorError("invalid_envelope");
    } else {
      const observation = exactRecord(attempt.observation, OBSERVATION_KEYS);
      if (typeof observation.evidenceId !== "string" || observation.evidenceId.length === 0 || observation.evidenceId.length > MAX_TEXT) throw new PaperSupervisorError("invalid_envelope");
      const receipt = checkReceipt(observation.receipt);
      if (receipt.planId !== attempt.planId || canonicalJson(receipt) === "") throw new PaperSupervisorError("invalid_envelope");
      if (attempt.phase === "observed") {
        if (!plan || plan.status !== "inflight") throw new PaperSupervisorError("invalid_envelope");
        if (receipt.inputAtoms !== plan.inputAtoms || canonicalJson(receipt.asset) !== canonicalJson(plan.asset)) throw new PaperSupervisorError("invalid_envelope");
        try {
          PaperCapital.restore(record.capital).settle(receipt);
        } catch {
          throw new PaperSupervisorError("invalid_envelope");
        }
      } else {
        const settleEvent = checkpoint.events.find((event) => event.type === "settle" && event.receipt.receiptId === receipt.receiptId);
        if (!settleEvent || settleEvent.type !== "settle" || canonicalJson(settleEvent.receipt) !== canonicalJson(receipt)) throw new PaperSupervisorError("invalid_envelope");
      }
    }
    attemptIds.add(attempt.attemptId);
    attemptPlans.add(attempt.planId);
  }
  for (const plan of planStatuses.values()) {
    if ((plan.status === "inflight" || plan.status === "settled") !== attemptPlans.has(plan.id)) throw new PaperSupervisorError("invalid_envelope");
  }
  const withoutHash = { ...record, sha256: undefined } as Record<string, unknown>;
  delete withoutHash.sha256;
  const expectedHash = sha256(canonicalJson(withoutHash, true));
  if (expectedHash !== record.sha256) throw new PaperSupervisorError("invalid_envelope");
  const result = input as PaperSupervisorEnvelope;
  assertByteEventCapacity(result);
  return result;
}

function nextEnvelope(base: PaperSupervisorEnvelope, patch: Partial<Omit<PaperSupervisorEnvelope, "version" | "mode" | "strategyQualified" | "financiallyAuthorized" | "generation" | "configSha256" | "adapterId" | "sha256">>): PaperSupervisorEnvelope {
  if (base.generation >= MAX_GENERATION) throw new PaperSupervisorError("generation_capacity_exhausted");
  const body = {
    version: 1 as const,
    mode: "synthetic-paper" as const,
    strategyQualified: false as const,
    financiallyAuthorized: false as const,
    generation: base.generation + 1,
    configSha256: base.configSha256,
    adapterId: base.adapterId,
    owner: patch.owner === undefined ? cloneSupervisorValue(base.owner) : cloneSupervisorValue(patch.owner),
    capital: patch.capital === undefined ? cloneSupervisorValue(base.capital) : cloneSupervisorValue(patch.capital),
    attempts: patch.attempts === undefined ? cloneSupervisorValue(base.attempts) : cloneSupervisorValue(patch.attempts),
    hold: patch.hold === undefined ? base.hold : patch.hold,
  };
  return sealEnvelope(body);
}

function defaultClock(): PaperSupervisorClock {
  const { performance } = requirePerformance();
  return {
    monotonicNowMs: () => performance.now(),
    wallNowMs: () => Date.now(),
    wait: (ms, signal) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new PaperSupervisorError("aborted")); return; }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => { cleanup(); reject(new PaperSupervisorError("aborted")); };
      timer = setTimeout(() => { cleanup(); resolve(); }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    }),
  };
}

function requirePerformance(): { performance: { now(): number } } {
  // node:perf_hooks is loaded synchronously without consulting application state.
  return { performance: globalThis.performance };
}

const DEFAULT_LIMITS: PaperSupervisorLimits = { maxTicks: 3, maxDurationMs: 2_000, cadenceMs: 20, adapterTimeoutMs: 250, drainTimeoutMs: 250 };
function validatedLimits(limits?: Partial<PaperSupervisorLimits>): PaperSupervisorLimits {
  const result = { ...DEFAULT_LIMITS, ...limits };
  for (const [key, value] of Object.entries(result)) {
    const bounds: Record<string, [number, number]> = {
      maxTicks: [1, 20], maxDurationMs: [1, 10_000], cadenceMs: [1, 1_000], adapterTimeoutMs: [1, 2_000], drainTimeoutMs: [1, 2_000],
    };
    const range = bounds[key];
    if (!range || !Number.isSafeInteger(value) || value < range[0] || value > range[1]) throw new PaperSupervisorError("invalid_limits");
  }
  return result;
}

function sanitizeError(error: unknown): string {
  const raw = error instanceof PaperSupervisorError ? error.code : error instanceof Error ? error.name : "adapter_error";
  return raw.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64) || "adapter_error";
}

function isAbort(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

function exactPlanEqual(a: PaperPlan, b: PaperPlan): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function validAdapterResult(value: unknown): value is PaperAdapterResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "pending" || kind === "unknown") {
    const record = exactRecord(value, ["kind", "reason"], "adapter_contract");
    return typeof record.reason === "string" && record.reason.length > 0 && record.reason.length <= MAX_TEXT;
  }
  if (kind === "terminal") {
    const record = exactRecord(value, ["kind", "evidenceId", "receipt"], "adapter_contract");
    if (typeof record.evidenceId !== "string" || record.evidenceId.length === 0 || record.evidenceId.length > MAX_TEXT) return false;
    checkReceipt(record.receipt);
    return true;
  }
  return false;
}

export class PaperSupervisor {
  private readonly store: PaperSupervisorStore;
  private readonly adapter: PaperSupervisorAdapter;
  private readonly clock: PaperSupervisorClock;
  private readonly limits: PaperSupervisorLimits;
  private readonly onStage?: PaperSupervisorOptions["onStage"];
  private readonly startedAt: number;
  private acknowledged: PaperSupervisorEnvelope;
  private capital: PaperCapital;
  private busy = false;
  private closing = false;
  private closePromise: Promise<PaperSupervisorCloseResult> | null = null;
  private closedResult: PaperSupervisorCloseResult | null = null;
  private quarantined = false;
  private runtimeHold: string | null = null;
  private lastAdapterError: string | null = null;
  private lastStoreError: string | null = null;
  private completedTicks = 0;
  private lastMonotonic: number;
  private lastWall: number;
  private readonly outstanding = new Set<Promise<unknown>>();
  private activeController: AbortController | null = null;
  private operationDone: Promise<void> = Promise.resolve();
  private finishOperation: (() => void) | null = null;
  private readonly executed = new Set<string>();
  private resourcesClosed = false;
  private ownerReleased = false;

  private constructor(options: PaperSupervisorOptions, envelope: PaperSupervisorEnvelope, capital: PaperCapital, clock: PaperSupervisorClock, limits: PaperSupervisorLimits, initialMonotonic: number, initialWall: number) {
    this.store = options.store;
    this.adapter = options.adapter;
    this.clock = clock;
    this.limits = limits;
    this.onStage = options.onStage;
    this.acknowledged = cloneSupervisorValue(envelope);
    this.capital = capital;
    this.startedAt = initialMonotonic;
    this.lastMonotonic = this.startedAt;
    this.lastWall = initialWall;
  }

  static async open(options: PaperSupervisorOptions): Promise<PaperSupervisor> {
    const limits = validatedLimits(options.limits);
    const clock = options.clock ?? defaultClock();
    const initialMonotonic = clock.monotonicNowMs();
    const initialWall = clock.wallNowMs();
    if (!Number.isFinite(initialMonotonic) || initialMonotonic < 0 || !Number.isSafeInteger(initialWall) || initialWall < 0) throw new PaperSupervisorError("clock_invalid");
    const envelope = validateEnvelope(await options.store.load());
    if (!envelope.owner) throw new PaperSupervisorError("owner_missing");
    await options.store.assertOwner(envelope.generation);
    assertOwnedCapacity(envelope);
    const config = PaperCapital.restore(envelope.capital).checkpoint().config;
    const capital = options.store.createdFresh ? new PaperCapital(config) : PaperCapital.restore(envelope.capital);
    const supervisor = new PaperSupervisor(options, envelope, capital, clock, limits, initialMonotonic, initialWall);
    await supervisor.emitStage("initialized");
    return supervisor;
  }

  async tick(opportunity?: { plan: PaperPlan; expiresAtMs: number }, signal?: AbortSignal): Promise<PaperSupervisorTickResult> {
    if (this.busy) return { kind: "busy" };
    if (this.closing || this.closedResult) return { kind: "held", reason: "closing" };
    this.beginOperation();
    try { return await this.performTick(opportunity, signal); }
    finally { this.endOperation(); }
  }

  async run(input: { nextOpportunity: (index: number) => { plan: PaperPlan; expiresAtMs: number } | undefined | Promise<{ plan: PaperPlan; expiresAtMs: number } | undefined>; signal?: AbortSignal }): Promise<PaperSupervisorTickResult[]> {
    if (this.busy) throw new PaperSupervisorError("busy");
    if (this.closing || this.closedResult) throw new PaperSupervisorError("closing");
    this.beginOperation();
    const results: PaperSupervisorTickResult[] = [];
    const runStart = this.monotonicNow();
    try {
      for (let index = 0; index < this.limits.maxTicks; index++) {
        if (isAbort(input.signal)) { results.push({ kind: "cancelled" }); break; }
        const elapsed = this.monotonicNow() - runStart;
        if (this.runtimeHold === "clock_invalid") { results.push({ kind: "held", reason: "clock_invalid" }); break; }
        if (elapsed >= this.limits.maxDurationMs) break;
        const remaining = this.limits.maxDurationMs - elapsed;
        const supplied = await this.nextOpportunityBeforeDeadline(input.nextOpportunity, index, remaining, input.signal);
        if (supplied.kind === "aborted") { results.push({ kind: "cancelled" }); break; }
        if (supplied.kind === "deadline") break;
        const afterProvider = this.monotonicNow() - runStart;
        if (this.runtimeHold === "clock_invalid") { results.push({ kind: "held", reason: "clock_invalid" }); break; }
        if (afterProvider >= this.limits.maxDurationMs) break;
        results.push(await this.performTick(supplied.opportunity, input.signal));
        if (this.closing || isAbort(input.signal) || this.monotonicNow() - runStart >= this.limits.maxDurationMs) break;
        if (index + 1 < this.limits.maxTicks) {
          const remaining = this.limits.maxDurationMs - (this.monotonicNow() - runStart);
          if (remaining <= 0) break;
          await this.clock.wait(Math.min(this.limits.cadenceMs, remaining), input.signal ?? new AbortController().signal);
        }
      }
      return results;
    } finally { this.endOperation(); }
  }

  status(): PaperSupervisorStatus {
    const capital = PaperCapital.restore(this.acknowledged.capital).snapshot();
    const heldAttemptIds = this.acknowledged.attempts.filter((attempt) => attempt.phase !== "settled").map((attempt) => attempt.attemptId);
    const elapsed = Math.max(0, this.monotonicNow() - this.startedAt);
    const holdReason = this.quarantined ? "publication_uncertain" : this.acknowledged.hold ?? (capital.stopped ? capital.stopReason : this.runtimeHold);
    const hasWork = heldAttemptIds.length > 0 || capital.plans.some((plan) => plan.status === "reserved");
    const operationalState = this.closedResult?.kind === "closed" ? "closed" : this.closing ? "closing" : this.quarantined || this.closedResult?.kind === "drain_incomplete" ? "quarantined" : holdReason || hasWork || capital.recoveryRequired ? "held" : "ready";
    return {
      mode: "synthetic-paper",
      strategyQualified: false,
      financiallyAuthorized: false,
      generation: this.acknowledged.generation,
      operationalState,
      holdReason: holdReason ? String(holdReason).slice(0, 64) : null,
      capital,
      heldAttemptIds,
      lastAdapterError: this.lastAdapterError,
      lastStoreError: this.lastStoreError,
      completedTicks: this.completedTicks,
      elapsedMs: elapsed,
      resourcesClosed: this.resourcesClosed,
      ownerReleased: this.ownerReleased,
    };
  }

  close(): Promise<PaperSupervisorCloseResult> {
    if (this.closedResult) return Promise.resolve({ ...this.closedResult });
    if (this.closePromise) return this.closePromise.then((result) => ({ ...result }));
    this.closePromise = this.closeOnce();
    return this.closePromise.then((result) => ({ ...result }));
  }

  private async closeOnce(): Promise<PaperSupervisorCloseResult> {
    if (this.closedResult) return { ...this.closedResult };
    this.closing = true;
    this.activeController?.abort();
    if (this.busy) {
      const done = await this.withDeadline(this.operationDone.then(() => true), this.limits.drainTimeoutMs);
      if (done !== true) return this.finishIncomplete();
    }
    const controller = new AbortController();
    let drained = false;
    const drainStartedAt = this.monotonicNow();
    try {
      const result = await this.withDeadline(this.adapter.drain(controller.signal), this.limits.drainTimeoutMs, () => controller.abort());
      if (result?.drained === true) {
        if (this.outstanding.size === 0) drained = true;
        else {
          const remaining = Math.max(0, this.limits.drainTimeoutMs - (this.monotonicNow() - drainStartedAt));
          const settled = await this.withDeadline(Promise.allSettled([...this.outstanding]), remaining, () => controller.abort());
          drained = settled !== null && this.outstanding.size === 0;
        }
      }
    } catch (error) {
      this.lastAdapterError = sanitizeError(error);
    }
    if (!drained) return this.finishIncomplete();
    try {
      const closed = await this.withDeadline(this.adapter.close(controller.signal), this.limits.drainTimeoutMs, () => controller.abort());
      if (closed === null) return this.finishIncomplete();
    } catch (error) {
      this.lastAdapterError = sanitizeError(error);
      return this.finishIncomplete();
    }
    try {
      const disk = validateEnvelope(await this.store.load());
      if (canonicalEnvelope(disk) !== canonicalEnvelope(this.acknowledged)) throw new PaperSupervisorError("disk_diverged");
      await this.store.assertOwner(this.acknowledged.generation);
      const released = validateEnvelope(await this.store.release(this.acknowledged.generation));
      this.acknowledged = cloneSupervisorValue(released);
      this.ownerReleased = true;
      try { await this.emitStage("owner_released"); } catch { /* observer failure cannot undo a durable owner release */ }
      await this.store.close();
      this.resourcesClosed = true;
      this.closedResult = { kind: "closed", resourcesClosed: true, ownerReleased: true };
      this.closing = false;
      try { await this.emitStage("closed"); } catch { /* observer failure cannot undo completed closure */ }
      return { ...this.closedResult };
    } catch (error) {
      this.lastStoreError = sanitizeError(error);
      this.quarantined = true;
      this.resourcesClosed = false;
      try {
        await this.store.close();
        this.resourcesClosed = true;
      } catch { /* connection cleanup is best effort after uncertainty */ }
      this.closedResult = { kind: "drain_incomplete", resourcesClosed: this.resourcesClosed, ownerReleased: this.ownerReleased };
      this.closing = false;
      return { ...this.closedResult };
    }
  }

  private beginOperation(): void {
    this.busy = true;
    this.operationDone = new Promise<void>((resolve) => { this.finishOperation = resolve; });
  }

  private endOperation(): void {
    this.busy = false;
    this.finishOperation?.();
    this.finishOperation = null;
  }

  private async performTick(opportunity?: { plan: PaperPlan; expiresAtMs: number }, signal?: AbortSignal): Promise<PaperSupervisorTickResult> {
    this.completedTicks++;
    if (this.quarantined) return { kind: "held", reason: "publication_uncertain" };
    if (this.closing || isAbort(signal)) return this.cancelReservedIfNeeded(signal);
    try { await this.store.assertOwner(this.acknowledged.generation); }
    catch (error) { this.lastStoreError = sanitizeError(error); this.quarantined = true; return { kind: "held", reason: this.lastStoreError }; }
    const wall = this.clock.wallNowMs();
    const validWall = Number.isSafeInteger(wall) && wall >= 0 && wall >= this.lastWall;
    if (!validWall) this.runtimeHold = "clock_invalid";
    else this.lastWall = wall;
    const snapshot = this.capital.snapshot();
    const observed = this.acknowledged.attempts.find((attempt) => attempt.phase === "observed");
    if (observed) return this.settleObserved(observed);
    const inflight = this.acknowledged.attempts.find((attempt) => attempt.phase === "intent");
    if (inflight) return this.reconcileAttempt(inflight, signal);
    const reserved = snapshot.plans.find((plan) => plan.status === "reserved");
    if (reserved && (this.store.createdFresh === false || isAbort(signal) || this.closing)) return this.cancelReserved(reserved.id);
    if (!opportunity) return { kind: "idle" };
    if (this.acknowledged.hold || snapshot.stopped || snapshot.recoveryRequired || this.runtimeHold) return { kind: "held", reason: this.acknowledged.hold ?? snapshot.stopReason ?? this.runtimeHold ?? "recovery_required" };
    if (!validWall || !Number.isFinite(opportunity.expiresAtMs) || opportunity.expiresAtMs < wall) return { kind: "held", reason: "opportunity_expired" };
    const plan = checkPlan(opportunity.plan);
    const existing = snapshot.plans.find((candidate) => candidate.id === plan.id);
    if (existing) {
      if (existing.status === "settled" && exactPlanEqual(existing, plan)) return { kind: "duplicate" };
      if (!exactPlanEqual(existing, plan)) {
        try { this.capital.reserve(plan); }
        catch (error) {
          if (!await this.persistCapitalMutation("stop_saved")) return { kind: "held", reason: "publication_uncertain" };
          return { kind: "held", reason: "plan_conflict" };
        }
      }
      return { kind: "duplicate" };
    }
    if (isAbort(signal)) return { kind: "cancelled" };
    let reservationProbe: PaperCapital;
    try {
      reservationProbe = PaperCapital.restore(this.capital.checkpoint());
      reservationProbe.reserve(plan);
    } catch (error) {
      if (this.capital.snapshot().stopped !== PaperCapital.restore(this.capital.checkpoint()).snapshot().stopped) await this.persistCapitalMutation("stop_saved");
      return { kind: "held", reason: sanitizeError(error) };
    }
    const reservedEnvelope = nextEnvelope(this.acknowledged, { capital: reservationProbe.checkpoint() });
    assertFreshIntakeCapacity(reservedEnvelope);
    this.capital.reserve(plan);
    const savedReserve = await this.publishCandidate(reservedEnvelope, "reserved_saved");
    if (!savedReserve) return { kind: "held", reason: "publication_uncertain" };
    const afterReserveWall = this.clock.wallNowMs();
    if (!Number.isSafeInteger(afterReserveWall) || afterReserveWall < 0 || afterReserveWall < this.lastWall) {
      this.runtimeHold = "clock_invalid";
      return this.cancelReserved(plan.id);
    }
    this.lastWall = afterReserveWall;
    if (isAbort(signal) || this.closing || opportunity.expiresAtMs < afterReserveWall) return this.cancelReserved(plan.id);
    const afterReserveMonotonic = this.clock.monotonicNowMs();
    if (!Number.isFinite(afterReserveMonotonic) || afterReserveMonotonic < 0 || afterReserveMonotonic < this.lastMonotonic) {
      this.runtimeHold = "clock_invalid";
      return this.cancelReserved(plan.id);
    }
    this.lastMonotonic = afterReserveMonotonic;
    if (isAbort(signal)) return this.cancelReserved(plan.id);
    const attemptId = randomBytes(16).toString("hex");
    const planSha256 = sha256(canonicalJson(plan));
    const startProbe = PaperCapital.restore(this.capital.checkpoint());
    startProbe.start(plan.id);
    const started = nextEnvelope(this.acknowledged, {
      capital: startProbe.checkpoint(),
      attempts: [...this.acknowledged.attempts, { attemptId, planId: plan.id, planSha256, phase: "intent", observation: null }],
    });
    assertFreshIntakeCapacity(started);
    this.capital.start(plan.id);
    if (isAbort(signal)) return this.persistReservedCancellation(plan.id);
    if (this.executed.has(attemptId)) throw new PaperSupervisorError("duplicate_execute");
    const savedIntent = await this.publishCandidate(started, "intent_saved");
    if (!savedIntent) return { kind: "held", attemptId, reason: "publication_uncertain" };
    if (isAbort(signal) || this.closing) {
      return { kind: "held", attemptId, reason: this.closing ? "closing" : "adapter_aborted" };
    }
    this.executed.add(attemptId);
    const result = await this.invoke("execute", { adapterId: this.acknowledged.adapterId, attemptId, plan }, signal);
    if (!result) return { kind: "held", attemptId, reason: this.lastAdapterError ?? "adapter_unknown" };
    return this.handleAdapterResult(this.acknowledged.attempts.find((attempt) => attempt.attemptId === attemptId)!, result);
  }

  private async reconcileAttempt(attempt: PaperSupervisorAttempt, signal?: AbortSignal): Promise<PaperSupervisorTickResult> {
    const plan = this.capital.snapshot().plans.find((candidate) => candidate.id === attempt.planId);
    if (!plan || plan.status !== "inflight") { this.quarantined = true; this.lastStoreError = "attempt_link_mismatch"; return { kind: "held", reason: this.lastStoreError }; }
    const result = await this.invoke("reconcile", { adapterId: this.acknowledged.adapterId, attemptId: attempt.attemptId, plan }, signal);
    if (!result) return { kind: "held", attemptId: attempt.attemptId, reason: this.lastAdapterError ?? "adapter_unknown" };
    return this.handleAdapterResult(attempt, result);
  }

  private async handleAdapterResult(attempt: PaperSupervisorAttempt, result: unknown): Promise<PaperSupervisorTickResult> {
    let accepted: PaperAdapterResult | null = null;
    try { if (validAdapterResult(result)) accepted = result; } catch { /* malformed adapters are handled as contract violations */ }
    if (!accepted) {
      const held = nextEnvelope(this.acknowledged, { hold: "adapter_contract" });
      if (held.hold !== this.acknowledged.hold) {
        const saved = await this.publishCandidate(held, "adapter_pending");
        if (!saved) return { kind: "held", attemptId: attempt.attemptId, reason: "publication_uncertain" };
      }
      this.runtimeHold = "adapter_contract";
      return { kind: "held", attemptId: attempt.attemptId, reason: "adapter_contract" };
    }
    if (accepted.kind !== "terminal") {
      this.runtimeHold = accepted.kind === "pending" ? "outcome_pending" : "outcome_unknown";
      await this.emitStage("adapter_pending");
      return { kind: "held", attemptId: attempt.attemptId, reason: this.runtimeHold };
    }
    const plan = this.capital.snapshot().plans.find((candidate) => candidate.id === attempt.planId);
    if (!plan || !this.receiptMatches(accepted.receipt, plan)) {
      const held = nextEnvelope(this.acknowledged, { hold: "adapter_contract" });
      if (held.hold !== this.acknowledged.hold && !await this.publishCandidate(held, "adapter_pending")) return { kind: "held", attemptId: attempt.attemptId, reason: "publication_uncertain" };
      this.runtimeHold = "adapter_contract";
      return { kind: "held", attemptId: attempt.attemptId, reason: "adapter_contract" };
    }
    const accountingProbe = PaperCapital.restore(this.capital.checkpoint());
    try { accountingProbe.settle(accepted.receipt); }
    catch {
      const beforeAccounting = canonicalJson(this.capital.checkpoint());
      try { this.capital.settle(accepted.receipt); }
      catch { /* the live ledger records its first accounting stop before rejecting */ }
      if (canonicalJson(this.capital.checkpoint()) !== beforeAccounting && !await this.persistCapitalMutation("stop_saved")) {
        return { kind: "held", attemptId: attempt.attemptId, reason: "publication_uncertain" };
      }
      const held = nextEnvelope(this.acknowledged, { hold: "adapter_contract" });
      if (held.hold !== this.acknowledged.hold && !await this.publishCandidate(held, "adapter_pending")) return { kind: "held", attemptId: attempt.attemptId, reason: "publication_uncertain" };
      this.runtimeHold = "adapter_contract";
      return { kind: "held", attemptId: attempt.attemptId, reason: "adapter_contract" };
    }
    const evidenceId = accepted.evidenceId;
    const updatedAttempt = { ...attempt, phase: "observed" as const, observation: { evidenceId, receipt: cloneSupervisorValue(accepted.receipt) } };
    const observedEnvelope = nextEnvelope(this.acknowledged, {
      attempts: this.acknowledged.attempts.map((candidate) => candidate.attemptId === attempt.attemptId ? updatedAttempt : candidate),
    });
    try { validateEnvelope(observedEnvelope); }
    catch (error) {
      if (error instanceof PaperSupervisorError && ["envelope_capacity_exhausted", "envelope_too_large", "event_capacity_exhausted"].includes(error.code)) {
        const held = nextEnvelope(this.acknowledged, { hold: "adapter_contract" });
        if (held.hold !== this.acknowledged.hold) await this.publishCandidate(held, "adapter_pending");
        this.runtimeHold = "adapter_contract";
        return { kind: "held", attemptId: attempt.attemptId, reason: "adapter_contract" };
      }
      throw error;
    }
    if (!await this.publishCandidate(observedEnvelope, "observation_saved")) return { kind: "held", attemptId: attempt.attemptId, reason: "publication_uncertain" };
    const liveAttempt = this.acknowledged.attempts.find((candidate) => candidate.attemptId === attempt.attemptId)!;
    return this.settleObserved(liveAttempt);
  }

  private async settleObserved(attempt: PaperSupervisorAttempt): Promise<PaperSupervisorTickResult> {
    if (!attempt.observation) { this.quarantined = true; this.lastStoreError = "observation_missing"; return { kind: "held", attemptId: attempt.attemptId, reason: this.lastStoreError }; }
    const probe = PaperCapital.restore(this.capital.checkpoint());
    try { probe.settle(attempt.observation.receipt); }
    catch {
      const beforeAccounting = canonicalJson(this.capital.checkpoint());
      try { this.capital.settle(attempt.observation.receipt); }
      catch { /* accepted rejection may mutate the capital stop before throwing */ }
      if (canonicalJson(this.capital.checkpoint()) !== beforeAccounting && !await this.persistCapitalMutation("stop_saved")) {
        return { kind: "held", attemptId: attempt.attemptId, reason: "publication_uncertain" };
      }
      this.runtimeHold = this.capital.snapshot().stopReason ?? "accounting_rejected";
      return { kind: "held", attemptId: attempt.attemptId, reason: this.runtimeHold };
    }
    this.capital.settle(attempt.observation.receipt);
    const settledAttempts = this.acknowledged.attempts.map((candidate) => candidate.attemptId === attempt.attemptId ? { ...candidate, phase: "settled" as const } : candidate);
    const settled = nextEnvelope(this.acknowledged, { capital: this.capital.checkpoint(), attempts: settledAttempts });
    if (!await this.publishCandidate(settled, "settled_saved")) return { kind: "held", attemptId: attempt.attemptId, reason: "publication_uncertain" };
    if (this.runtimeHold !== "clock_invalid") this.runtimeHold = null;
    return { kind: "settled", attemptId: attempt.attemptId };
  }

  private receiptMatches(receipt: PaperReceipt, plan: PaperPlan & { status: string }): boolean {
    return receipt.planId === plan.id && receipt.inputAtoms === plan.inputAtoms && canonicalJson(receipt.asset) === canonicalJson(plan.asset);
  }

  private async cancelReserved(planId: string): Promise<PaperSupervisorTickResult> {
    return this.persistReservedCancellation(planId);
  }

  private async cancelReservedIfNeeded(signal?: AbortSignal): Promise<PaperSupervisorTickResult> {
    const reserved = this.capital.snapshot().plans.find((plan) => plan.status === "reserved");
    if (reserved && (isAbort(signal) || this.closing)) return this.cancelReserved(reserved.id);
    return { kind: "cancelled" };
  }

  private async persistReservedCancellation(planId: string): Promise<PaperSupervisorTickResult> {
    try {
      this.capital.cancel(planId);
      const candidate = nextEnvelope(this.acknowledged, { capital: this.capital.checkpoint() });
      assertOwnedCapacity(candidate);
      if (!await this.publishCandidate(candidate, "cancel_saved")) return { kind: "held", reason: "publication_uncertain" };
      return { kind: "cancelled" };
    } catch (error) {
      this.lastStoreError = sanitizeError(error);
      this.quarantined = true;
      return { kind: "held", reason: this.lastStoreError };
    }
  }

  private async persistCapitalMutation(stage: PaperSupervisorStage): Promise<boolean> {
    const candidate = nextEnvelope(this.acknowledged, { capital: this.capital.checkpoint() });
    assertOwnedCapacity(candidate);
    return this.publishCandidate(candidate, stage);
  }

  private async publishCandidate(candidate: PaperSupervisorEnvelope, stage: PaperSupervisorStage): Promise<boolean> {
    try {
      validateEnvelope(candidate);
      const saved = validateEnvelope(await this.store.publish(this.acknowledged.generation, candidate));
      if (canonicalEnvelope(saved) !== canonicalEnvelope(candidate)) throw new PaperSupervisorError("publication_mismatch");
      this.acknowledged = cloneSupervisorValue(saved);
      this.lastStoreError = null;
      await this.emitStage(stage);
      return true;
    } catch (error) {
      this.lastStoreError = sanitizeError(error);
      this.quarantined = true;
      return false;
    }
  }

  private async invoke(kind: "execute" | "reconcile", request: PaperSupervisorAdapterRequest, parentSignal?: AbortSignal): Promise<PaperAdapterResult | null> {
    const controller = new AbortController();
    this.activeController = controller;
    let parentAbortListener: (() => void) | undefined;
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else {
        parentAbortListener = () => controller.abort();
        parentSignal.addEventListener("abort", parentAbortListener, { once: true });
      }
    }
    const invocation = Promise.resolve().then(() => kind === "execute" ? this.adapter.execute(cloneSupervisorValue(request), controller.signal) : this.adapter.reconcile(cloneSupervisorValue(request), controller.signal));
    this.outstanding.add(invocation);
    void invocation.then(() => this.outstanding.delete(invocation), () => this.outstanding.delete(invocation));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => { controller.abort(); this.lastAdapterError = "adapter_timeout"; resolve(null); }, this.limits.adapterTimeoutMs); });
      const aborted = new Promise<null>((resolve) => {
        abortListener = () => { controller.abort(); resolve(null); };
        controller.signal.addEventListener("abort", abortListener, { once: true });
      });
      const result: PaperAdapterResult | null = await Promise.race<PaperAdapterResult | null>([invocation, timeout, aborted]);
      if (result === null) {
        if (this.lastAdapterError === null) this.lastAdapterError = "adapter_aborted";
        return null;
      }
      return result as PaperAdapterResult;
    } catch (error) {
      this.lastAdapterError = sanitizeError(error);
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      if (parentAbortListener) parentSignal?.removeEventListener("abort", parentAbortListener);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  private async withDeadline<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => { onTimeout?.(); resolve(null); }, timeoutMs); })]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  private async nextOpportunityBeforeDeadline(
    provider: (index: number) => { plan: PaperPlan; expiresAtMs: number } | undefined | Promise<{ plan: PaperPlan; expiresAtMs: number } | undefined>,
    index: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ kind: "value"; opportunity: { plan: PaperPlan; expiresAtMs: number } | undefined } | { kind: "deadline" } | { kind: "aborted" }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const supplied = Promise.resolve().then(() => provider(index)).then((opportunity) => ({ kind: "value" as const, opportunity }));
    const deadline = new Promise<{ kind: "deadline" }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "deadline" }), timeoutMs);
    });
    const aborted = new Promise<{ kind: "aborted" }>((resolve) => {
      if (!signal) return;
      abortListener = () => resolve({ kind: "aborted" });
      if (signal.aborted) resolve({ kind: "aborted" });
      else signal.addEventListener("abort", abortListener, { once: true });
    });
    try { return await Promise.race([supplied, deadline, aborted]); }
    finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abortListener) signal?.removeEventListener("abort", abortListener);
    }
  }

  private async finishIncomplete(): Promise<PaperSupervisorCloseResult> {
    this.quarantined = true;
    this.resourcesClosed = false;
    try { await this.store.close(); } catch { /* durable owner is intentionally retained */ }
    this.closedResult = { kind: "drain_incomplete", resourcesClosed: false, ownerReleased: this.ownerReleased };
    this.closing = false;
    return { ...this.closedResult };
  }

  private monotonicNow(): number {
    const current = this.clock.monotonicNowMs();
    if (!Number.isFinite(current) || current < 0 || current < this.lastMonotonic) {
      this.runtimeHold = "clock_invalid";
      return this.lastMonotonic;
    }
    this.lastMonotonic = current;
    return current;
  }

  private async emitStage(stage: PaperSupervisorStage): Promise<void> {
    if (!this.onStage) return;
    await this.onStage(stage, cloneSupervisorValue(this.acknowledged));
  }
}
