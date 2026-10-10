import { createHash } from "node:crypto";
export type PaperAsset = {
  chainId: string;
  token: string;
  decimals: number;
  venue: string;
};

export type PaperCapitalConfig = {
  asset: PaperAsset;
  initialAtoms: string;
  maxCommittedAtoms: string;
  maxDrawdownAtoms: string;
};

export type PaperPlan = {
  id: string;
  asset: PaperAsset;
  inputAtoms: string;
  costBudgetAtoms: string;
};

export type PaperReceipt = {
  receiptId: string;
  planId: string;
  asset: PaperAsset;
  inputAtoms: string;
  returnedAtoms: string;
  externalCostAtoms: string | null;
  costsComplete: boolean;
  outcome: "completed" | "reverted";
};

export type PaperPlanStatus = "reserved" | "inflight" | "settled" | "cancelled";
export type PaperStopReason =
  | "plan_conflict"
  | "unknown_cost"
  | "invalid_receipt"
  | "receipt_conflict"
  | "unfunded_receipt"
  | "cost_overrun"
  | "drawdown_limit"
  | "reservation_deficit";

export type PaperSnapshot = {
  mode: "synthetic-paper";
  strategyQualified: false;
  financiallyAuthorized: false;
  asset: PaperAsset;
  initialAtoms: string;
  balanceAtoms: string;
  committedAtoms: string;
  availableAtoms: string;
  deficitAtoms: string;
  realizedNetAtoms: string;
  peakBalanceAtoms: string;
  maxObservedDrawdownAtoms: string;
  maxCommittedAtoms: string;
  maxDrawdownAtoms: string;
  stopped: boolean;
  stopReason: PaperStopReason | null;
  recoveryRequired: boolean;
  plans: Array<PaperPlan & { status: PaperPlanStatus }>;
};

export type PaperJournalEvent =
  | { type: "reserve"; plan: PaperPlan }
  | { type: "start"; planId: string }
  | { type: "cancel"; planId: string }
  | { type: "settle"; receipt: PaperReceipt }
  | { type: "stop"; reason: PaperStopReason };

export type PaperCheckpoint = {
  version: 1;
  mode: "synthetic-paper";
  strategyQualified: false;
  financiallyAuthorized: false;
  config: PaperCapitalConfig;
  events: PaperJournalEvent[];
  sha256: string;
};

const MODE = "synthetic-paper" as const;
const INVALID_INPUT = "Invalid paper capital input";
const RECORD = Object.prototype;
const CONFIG_KEYS = ["asset", "initialAtoms", "maxCommittedAtoms", "maxDrawdownAtoms"] as const;
const ASSET_KEYS = ["chainId", "token", "decimals", "venue"] as const;
const PLAN_KEYS = ["id", "asset", "inputAtoms", "costBudgetAtoms"] as const;
const RECEIPT_KEYS = ["receiptId", "planId", "asset", "inputAtoms", "returnedAtoms", "externalCostAtoms", "costsComplete", "outcome"] as const;
const CHECKPOINT_KEYS = ["version", "mode", "strategyQualified", "financiallyAuthorized", "config", "events", "sha256"] as const;
const JOURNAL_STOPS: readonly PaperStopReason[] = ["plan_conflict", "unknown_cost", "invalid_receipt", "receipt_conflict", "unfunded_receipt"];

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID_INPUT);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== RECORD && prototype !== null) throw new Error(INVALID_INPUT);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw new Error(INVALID_INPUT);
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error(INVALID_INPUT);
    result[key] = descriptor.value;
  }
  return result;
}

function unsigned(value: unknown, positive = false): bigint {
  if (typeof value !== "string" || !(positive ? /^[1-9][0-9]*$/ : /^(0|[1-9][0-9]*)$/).test(value)) {
    throw new Error(INVALID_INPUT);
  }
  return BigInt(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function copiedAsset(value: unknown): PaperAsset {
  const record = exactRecord(value, ASSET_KEYS);
  if (typeof record.chainId !== "string" || !/^[1-9][0-9]*$/.test(record.chainId)) throw new Error(INVALID_INPUT);
  if (typeof record.token !== "string" || !(record.token === "native" || /^0x[0-9a-f]{40}$/.test(record.token))) throw new Error(INVALID_INPUT);
  if (typeof record.decimals !== "number" || !Number.isInteger(record.decimals) || record.decimals < 0 || record.decimals > 36) {
    throw new Error(INVALID_INPUT);
  }
  if (typeof record.venue !== "string" || record.venue.length === 0 || record.venue.trim() !== record.venue) throw new Error(INVALID_INPUT);
  return { chainId: record.chainId, token: record.token, decimals: record.decimals, venue: record.venue };
}

function detachedAsset(asset: PaperAsset): PaperAsset {
  return { chainId: asset.chainId, token: asset.token, decimals: asset.decimals, venue: asset.venue };
}

function sameAsset(left: PaperAsset, right: PaperAsset): boolean {
  return left.chainId === right.chainId && left.token === right.token && left.decimals === right.decimals && left.venue === right.venue;
}

function copiedPlan(value: unknown): PaperPlan {
  const record = exactRecord(value, PLAN_KEYS);
  if (!validId(record.id)) throw new Error(INVALID_INPUT);
  const asset = copiedAsset(record.asset);
  const inputAtoms = unsigned(record.inputAtoms, true).toString();
  const costBudgetAtoms = unsigned(record.costBudgetAtoms).toString();
  return { id: record.id, asset, inputAtoms, costBudgetAtoms };
}

function samePlan(left: PaperPlan, right: PaperPlan): boolean {
  return left.id === right.id && sameAsset(left.asset, right.asset) && left.inputAtoms === right.inputAtoms && left.costBudgetAtoms === right.costBudgetAtoms;
}

function copiedReceipt(value: unknown): PaperReceipt {
  const record = exactRecord(value, RECEIPT_KEYS);
  if (!validId(record.receiptId) || !validId(record.planId)) throw new Error(INVALID_INPUT);
  const asset = copiedAsset(record.asset);
  const inputAtoms = unsigned(record.inputAtoms, true).toString();
  const returnedAtoms = unsigned(record.returnedAtoms).toString();
  const externalCostAtoms = record.externalCostAtoms === null ? null : unsigned(record.externalCostAtoms).toString();
  if (typeof record.costsComplete !== "boolean") throw new Error(INVALID_INPUT);
  if (record.outcome !== "completed" && record.outcome !== "reverted") throw new Error(INVALID_INPUT);
  return { receiptId: record.receiptId, planId: record.planId, asset, inputAtoms, returnedAtoms, externalCostAtoms, costsComplete: record.costsComplete, outcome: record.outcome };
}

function sameReceipt(left: PaperReceipt, right: PaperReceipt): boolean {
  return left.receiptId === right.receiptId && left.planId === right.planId && sameAsset(left.asset, right.asset) && left.inputAtoms === right.inputAtoms && left.returnedAtoms === right.returnedAtoms && left.externalCostAtoms === right.externalCostAtoms && left.costsComplete === right.costsComplete && left.outcome === right.outcome;
}

function cloneReceipt(receipt: PaperReceipt): PaperReceipt {
  return { receiptId: receipt.receiptId, planId: receipt.planId, asset: detachedAsset(receipt.asset), inputAtoms: receipt.inputAtoms, returnedAtoms: receipt.returnedAtoms, externalCostAtoms: receipt.externalCostAtoms, costsComplete: receipt.costsComplete, outcome: receipt.outcome };
}
function assertJsonCompatible(value: unknown, active = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(INVALID_INPUT);
    return;
  }
  if (typeof value !== "object") throw new Error(INVALID_INPUT);
  if (active.has(value)) throw new Error(INVALID_INPUT);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error(INVALID_INPUT);
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1 || ownKeys.some((key) => typeof key !== "string")) throw new Error(INVALID_INPUT);
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (!lengthDescriptor || lengthDescriptor.enumerable || !("value" in lengthDescriptor) || lengthDescriptor.value !== value.length) throw new Error(INVALID_INPUT);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error(INVALID_INPUT);
        assertJsonCompatible(descriptor.value, active);
      }
      for (const key of ownKeys) {
        if (key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) throw new Error(INVALID_INPUT);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== RECORD && prototype !== null) throw new Error(INVALID_INPUT);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error(INVALID_INPUT);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error(INVALID_INPUT);
      assertJsonCompatible(descriptor.value, active);
    }
  } finally {
    active.delete(value);
  }
}

function jsonDigest(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error(INVALID_INPUT);
  return createHash("sha256").update(json).digest("hex");
}

function journalTag(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID_INPUT);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== RECORD && prototype !== null) throw new Error(INVALID_INPUT);
  const descriptor = Object.getOwnPropertyDescriptor(value, "type");
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") throw new Error(INVALID_INPUT);
  return descriptor.value;
}

function cloneEvent(event: PaperJournalEvent): PaperJournalEvent {
  switch (event.type) {
    case "reserve": return { type: "reserve", plan: { id: event.plan.id, asset: detachedAsset(event.plan.asset), inputAtoms: event.plan.inputAtoms, costBudgetAtoms: event.plan.costBudgetAtoms } };
    case "start": return { type: "start", planId: event.planId };
    case "cancel": return { type: "cancel", planId: event.planId };
    case "settle": return { type: "settle", receipt: cloneReceipt(event.receipt) };
    case "stop": return { type: "stop", reason: event.reason };
  }
}
function recognizedReceiptId(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== RECORD && prototype !== null) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, "receiptId");
    return descriptor && "value" in descriptor && validId(descriptor.value) ? descriptor.value : null;
  } catch {
    return null;
  }
}
type StoredPlan = { plan: PaperPlan; status: PaperPlanStatus };

export class PaperCapital {
  private readonly config: PaperCapitalConfig;
  private readonly initial: bigint;
  private balance: bigint;
  private readonly maximumCommitted: bigint;
  private readonly maximumDrawdown: bigint;
  private readonly plans = new Map<string, StoredPlan>();
  private readonly receipts = new Map<string, PaperReceipt>();
  private events: PaperJournalEvent[] = [];
  private peak: bigint;
  private maximumObservedDrawdown = 0n;
  private stoppedFor: PaperStopReason | null = null;
  private recovery = false;

  constructor(config: PaperCapitalConfig) {
    const record = exactRecord(config, CONFIG_KEYS);
    const asset = copiedAsset(record.asset);
    const initialAtoms = unsigned(record.initialAtoms, true);
    const maxCommittedAtoms = unsigned(record.maxCommittedAtoms, true);
    const maxDrawdownAtoms = unsigned(record.maxDrawdownAtoms, true);
    this.initial = initialAtoms;
    this.balance = initialAtoms;
    this.peak = initialAtoms;
    this.maximumCommitted = maxCommittedAtoms;
    this.maximumDrawdown = maxDrawdownAtoms;
    this.config = {
      asset,
      initialAtoms: initialAtoms.toString(),
      maxCommittedAtoms: maxCommittedAtoms.toString(),
      maxDrawdownAtoms: maxDrawdownAtoms.toString(),
    };
  }

  reserve(planInput: PaperPlan): PaperSnapshot {
    const plan = copiedPlan(planInput);
    const existing = this.plans.get(plan.id);
    if (existing) {
      if (samePlan(existing.plan, plan)) return this.snapshot();
      this.rejectWithStop("plan_conflict");
      throw new Error("Plan ID conflicts with an existing plan");
    }
    if (!sameAsset(plan.asset, this.config.asset)) throw new Error(INVALID_INPUT);
    if (this.stoppedFor !== null || this.recovery) throw new Error("Paper account is stopped or requires reconciliation");

    const inputAtoms = BigInt(plan.inputAtoms);
    const costBudgetAtoms = BigInt(plan.costBudgetAtoms);
    const commitment = inputAtoms + costBudgetAtoms;
    const committed = this.committedAmount();
    if (commitment > this.availableAmount() || committed + commitment > this.maximumCommitted) {
      throw new Error("Reservation is not funded within configured limits");
    }

    this.plans.set(plan.id, { plan, status: "reserved" });
    this.events.push({ type: "reserve", plan: this.clonePlan(plan) });
    return this.snapshot();
  }

  start(planId: string): PaperSnapshot {
    if (!validId(planId)) throw new Error(INVALID_INPUT);
    const entry = this.plans.get(planId);
    if (!entry) throw new Error("Unknown plan");
    if (entry.status === "inflight") return this.snapshot();
    if (entry.status !== "reserved") throw new Error("Plan cannot be started in its current state");
    if (this.stoppedFor !== null || this.recovery) throw new Error("Paper account is stopped or requires reconciliation");
    entry.status = "inflight";
    this.events.push({ type: "start", planId });
    return this.snapshot();
  }

  cancel(planId: string): PaperSnapshot {
    if (!validId(planId)) throw new Error(INVALID_INPUT);
    const entry = this.plans.get(planId);
    if (!entry) throw new Error("Unknown plan");
    if (entry.status === "cancelled") return this.snapshot();
    if (entry.status !== "reserved") throw new Error("Only a reserved plan can be cancelled");
    entry.status = "cancelled";
    this.events.push({ type: "cancel", planId });
    return this.snapshot();
  }

  settle(receiptInput: PaperReceipt): PaperSnapshot {
    const recognizedId = recognizedReceiptId(receiptInput);
    const recognized = recognizedId === null ? undefined : this.receipts.get(recognizedId);
    if (recognized) {
      try {
        if (sameReceipt(recognized, copiedReceipt(receiptInput))) return this.snapshot();
      } catch {
        // Once an ID has succeeded, malformed data with that ID is a conflict.
      }
      this.rejectWithStop("receipt_conflict");
      throw new Error("Receipt ID conflicts with a successful receipt");
    }

    let receipt: PaperReceipt;
    try {
      receipt = copiedReceipt(receiptInput);
    } catch {
      this.rejectWithStop("invalid_receipt");
      throw new Error("Invalid receipt");
    }

    const entry = this.plans.get(receipt.planId);
    if (!entry || entry.status === "reserved" || entry.status === "cancelled") {
      this.rejectWithStop("invalid_receipt");
      throw new Error("Receipt does not target an inflight plan");
    }
    if (entry.status === "settled") {
      this.rejectWithStop("receipt_conflict");
      throw new Error("Plan already has a successful receipt");
    }
    if (!sameAsset(receipt.asset, this.config.asset) || !sameAsset(receipt.asset, entry.plan.asset) || receipt.inputAtoms !== entry.plan.inputAtoms) {
      this.rejectWithStop("invalid_receipt");
      throw new Error("Receipt does not match the inflight plan");
    }
    if (receipt.outcome === "reverted" && receipt.returnedAtoms !== receipt.inputAtoms) {
      this.rejectWithStop("invalid_receipt");
      throw new Error("A reverted receipt must return its full principal");
    }
    if (receipt.externalCostAtoms === null || !receipt.costsComplete) {
      this.rejectWithStop("unknown_cost");
      throw new Error("Receipt costs are incomplete");
    }

    const returned = BigInt(receipt.returnedAtoms);
    const principal = BigInt(receipt.inputAtoms);
    const externalCost = BigInt(receipt.externalCostAtoms);
    const nextBalance = this.balance + returned - principal - externalCost;
    if (nextBalance < 0n) {
      this.rejectWithStop("unfunded_receipt");
      throw new Error("Receipt would create a negative cash balance");
    }

    this.balance = nextBalance;
    entry.status = "settled";
    if (this.recovery) this.recovery = [...this.plans.values()].some((candidate) => candidate.status === "inflight");
    this.receipts.set(receipt.receiptId, cloneReceipt(receipt));
    this.events.push({ type: "settle", receipt: cloneReceipt(receipt) });
    if (this.balance > this.peak) this.peak = this.balance;
    const drawdown = this.peak - this.balance;
    if (drawdown > this.maximumObservedDrawdown) this.maximumObservedDrawdown = drawdown;

    if (externalCost > BigInt(entry.plan.costBudgetAtoms)) this.rejectWithStop("cost_overrun", false);
    else if (drawdown >= this.maximumDrawdown) this.rejectWithStop("drawdown_limit", false);
    else if (this.committedAmount() > this.balance) this.rejectWithStop("reservation_deficit", false);
    return this.snapshot();
  }
  checkpoint(): PaperCheckpoint {
    const config: PaperCapitalConfig = {
      asset: detachedAsset(this.config.asset),
      initialAtoms: this.config.initialAtoms,
      maxCommittedAtoms: this.config.maxCommittedAtoms,
      maxDrawdownAtoms: this.config.maxDrawdownAtoms,
    };
    const events = this.events.map(cloneEvent);
    const body = { version: 1 as const, mode: MODE, strategyQualified: false as const, financiallyAuthorized: false as const, config, events };
    return { ...body, sha256: jsonDigest(body) };
  }

  static restore(checkpoint: unknown): PaperCapital {
    assertJsonCompatible(checkpoint);
    const record = exactRecord(checkpoint, CHECKPOINT_KEYS);
    if (record.version !== 1 || record.mode !== MODE || record.strategyQualified !== false || record.financiallyAuthorized !== false) throw new Error(INVALID_INPUT);
    if (typeof record.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.sha256)) throw new Error(INVALID_INPUT);
    if (!Array.isArray(record.events)) throw new Error(INVALID_INPUT);
    const body = {
      version: record.version,
      mode: record.mode,
      strategyQualified: record.strategyQualified,
      financiallyAuthorized: record.financiallyAuthorized,
      config: record.config,
      events: record.events,
    };
    if (jsonDigest(body) !== record.sha256) throw new Error("Checkpoint checksum mismatch");

    const account = new PaperCapital(record.config as PaperCapitalConfig);
    const sourceEvents = record.events as unknown[];
    for (const sourceEvent of sourceEvents) {
      const before = account.events.length;
      let expected: PaperJournalEvent;
      switch (journalTag(sourceEvent)) {
        case "reserve": {
          const event = exactRecord(sourceEvent, ["type", "plan"]);
          if (event.type !== "reserve") throw new Error(INVALID_INPUT);
          const plan = copiedPlan(event.plan);
          account.reserve(plan);
          expected = { type: "reserve", plan };
          break;
        }
        case "start": {
          const event = exactRecord(sourceEvent, ["type", "planId"]);
          if (event.type !== "start" || !validId(event.planId)) throw new Error(INVALID_INPUT);
          account.start(event.planId);
          expected = { type: "start", planId: event.planId };
          break;
        }
        case "cancel": {
          const event = exactRecord(sourceEvent, ["type", "planId"]);
          if (event.type !== "cancel" || !validId(event.planId)) throw new Error(INVALID_INPUT);
          account.cancel(event.planId);
          expected = { type: "cancel", planId: event.planId };
          break;
        }
        case "settle": {
          const event = exactRecord(sourceEvent, ["type", "receipt"]);
          if (event.type !== "settle") throw new Error(INVALID_INPUT);
          const receipt = copiedReceipt(event.receipt);
          account.settle(receipt);
          expected = { type: "settle", receipt };
          break;
        }
        case "stop": {
          const event = exactRecord(sourceEvent, ["type", "reason"]);
          if (event.type !== "stop" || typeof event.reason !== "string" || !JOURNAL_STOPS.includes(event.reason as PaperStopReason)) throw new Error(INVALID_INPUT);
          if (account.stoppedFor !== null) throw new Error(INVALID_INPUT);
          account.stoppedFor = event.reason as PaperStopReason;
          account.events.push({ type: "stop", reason: account.stoppedFor });
          expected = { type: "stop", reason: account.stoppedFor };
          break;
        }
        default:
          throw new Error(INVALID_INPUT);
      }
      if (account.events.length !== before + 1 || JSON.stringify(account.events[before]) !== JSON.stringify(expected)) throw new Error(INVALID_INPUT);
    }
    if (account.events.length !== sourceEvents.length) throw new Error(INVALID_INPUT);
    account.recovery = [...account.plans.values()].some((entry) => entry.status === "inflight");
    return account;
  }

  snapshot(): PaperSnapshot {
    const committed = this.committedAmount();
    const available = this.balance > committed ? this.balance - committed : 0n;
    const deficit = committed > this.balance ? committed - this.balance : 0n;
    return {
      mode: MODE,
      strategyQualified: false,
      financiallyAuthorized: false,
      asset: detachedAsset(this.config.asset),
      initialAtoms: this.initial.toString(),
      balanceAtoms: this.balance.toString(),
      committedAtoms: committed.toString(),
      availableAtoms: available.toString(),
      deficitAtoms: deficit.toString(),
      realizedNetAtoms: (this.balance - this.initial).toString(),
      peakBalanceAtoms: this.peak.toString(),
      maxObservedDrawdownAtoms: this.maximumObservedDrawdown.toString(),
      maxCommittedAtoms: this.maximumCommitted.toString(),
      maxDrawdownAtoms: this.maximumDrawdown.toString(),
      stopped: this.stoppedFor !== null,
      stopReason: this.stoppedFor,
      recoveryRequired: this.recovery,
      plans: [...this.plans.values()].map(({ plan, status }) => ({ ...this.clonePlan(plan), status })),
    };
  }

  private committedAmount(): bigint {
    let result = 0n;
    for (const entry of this.plans.values()) {
      if (entry.status === "reserved" || entry.status === "inflight") {
        result += BigInt(entry.plan.inputAtoms) + BigInt(entry.plan.costBudgetAtoms);
      }
    }
    return result;
  }

  private availableAmount(): bigint {
    const committed = this.committedAmount();
    return this.balance > committed ? this.balance - committed : 0n;
  }

  private rejectWithStop(reason: PaperStopReason, journal = true): void {
    if (this.stoppedFor === null) {
      this.stoppedFor = reason;
      if (journal) this.events.push({ type: "stop", reason });
    }
  }

  private clonePlan(plan: PaperPlan): PaperPlan {
    return {
      id: plan.id,
      asset: detachedAsset(plan.asset),
      inputAtoms: plan.inputAtoms,
      costBudgetAtoms: plan.costBudgetAtoms,
    };
  }
}




