import { PaperCapital, type PaperCapitalConfig, type PaperPlan, type PaperReceipt, type PaperSnapshot } from "./paper-capital";

export interface PaperDecisionFrame {
  readonly id: string;
  readonly atMs: number;
  readonly model: string;
  readonly isMock: boolean;
  readonly candidates: readonly PaperPlan[];
  readonly choice: string;
  readonly receipt: PaperReceipt | null;
}

export interface PaperDecisionReplayInput {
  readonly origin: "synthetic_fixture" | "captured_replay";
  readonly config: PaperCapitalConfig;
  readonly frames: readonly PaperDecisionFrame[];
}

export type PaperReplayReason = "frame_invalid" | "candidate_invalid" | "choice_invalid" | "receipt_missing" | "receipt_unexpected" | "settlement_refused" | "capital_stopped";

export interface PaperReplayStep {
  readonly frameId: string | null;
  readonly atMs: number | null;
  readonly model: string | null;
  readonly isMock: boolean | null;
  readonly choice: string | null;
  readonly outcome: "held" | "settled" | "blocked";
  readonly reason: PaperReplayReason | null;
  readonly balanceAtoms: string;
  readonly realizedNetAtoms: string;
}

export interface PaperDecisionReplayResult {
  readonly schemaVersion: 1;
  readonly origin: PaperDecisionReplayInput["origin"];
  readonly mode: "synthetic-paper";
  readonly execution: "never";
  readonly financiallyAuthorized: false;
  readonly strategyQualified: false;
  readonly status: "completed" | "blocked";
  readonly reason: PaperReplayReason | null;
  readonly steps: readonly PaperReplayStep[];
  readonly capital: PaperSnapshot;
}

const PAPER_REPLAY_MAX_FRAMES = 1_000;
const PAPER_REPLAY_MAX_CANDIDATES = 254;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const FRAME_KEYS = ["id", "atMs", "model", "isMock", "candidates", "choice", "receipt"];

function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== "string" || !keys.includes(key))) return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (field === undefined || !field.enumerable || !("value" in field)) return null;
    out[key] = field.value;
  }
  return out;
}

function list(value: unknown, max: number): unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) return null;
  const out: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = Object.getOwnPropertyDescriptor(value, String(i));
    if (item === undefined || !item.enumerable || !("value" in item)) return null;
    out.push(item.value);
  }
  return out;
}

export function replayPaperDecisions(input: PaperDecisionReplayInput): PaperDecisionReplayResult {
  const header = record(input, ["origin", "config", "frames"]);
  if (header === null || (header.origin !== "synthetic_fixture" && header.origin !== "captured_replay")) throw new Error("invalid_paper_replay");
  const frames = list(header.frames, PAPER_REPLAY_MAX_FRAMES);
  if (frames === null) throw new Error("invalid_paper_replay");
  let account: PaperCapital;
  try {
    account = new PaperCapital(header.config as PaperCapitalConfig);
  } catch {
    throw new Error("invalid_paper_replay");
  }
  const steps: PaperReplayStep[] = [];
  const seen = new Set<string>();
  let previousAtMs = -1;
  const finish = (reason: PaperReplayReason | null): PaperDecisionReplayResult => ({
    schemaVersion: 1,
    origin: header.origin as PaperDecisionReplayInput["origin"],
    mode: "synthetic-paper",
    execution: "never",
    financiallyAuthorized: false,
    strategyQualified: false,
    status: reason === null ? "completed" : "blocked",
    reason,
    steps,
    capital: account.snapshot(),
  });
  for (const raw of frames) {
    let meta: Pick<PaperReplayStep, "frameId" | "atMs" | "model" | "isMock" | "choice"> = { frameId: null, atMs: null, model: null, isMock: null, choice: null };
    const note = (outcome: PaperReplayStep["outcome"], reason: PaperReplayReason | null): void => {
      const snapshot = account.snapshot();
      steps.push({ ...meta, outcome, reason, balanceAtoms: snapshot.balanceAtoms, realizedNetAtoms: snapshot.realizedNetAtoms });
    };
    const block = (reason: PaperReplayReason): PaperDecisionReplayResult => {
      note("blocked", reason);
      return finish(reason);
    };
    const frame = record(raw, FRAME_KEYS);
    if (frame === null || typeof frame.id !== "string" || !ID.test(frame.id) || seen.has(frame.id) || typeof frame.atMs !== "number" || !Number.isSafeInteger(frame.atMs) || frame.atMs < 0 || frame.atMs < previousAtMs || typeof frame.model !== "string" || !MODEL.test(frame.model) || typeof frame.isMock !== "boolean" || (header.origin === "synthetic_fixture" && !frame.isMock) || typeof frame.choice !== "string" || !ID.test(frame.choice)) return block("frame_invalid");
    meta = { frameId: frame.id, atMs: frame.atMs, model: frame.model, isMock: frame.isMock, choice: frame.choice };
    seen.add(frame.id);
    previousAtMs = frame.atMs;
    const candidates = list(frame.candidates, PAPER_REPLAY_MAX_CANDIDATES);
    if (candidates === null) return block("candidate_invalid");
    const normalized = new Map<string, PaperPlan>();
    const checkpoint = account.checkpoint();
    const used = new Set(account.snapshot().plans.map((p) => p.id));
    for (const rawCandidate of candidates) {
      try {
        const probe = PaperCapital.restore(checkpoint);
        const candidate = probe.reserve(rawCandidate as PaperPlan).plans.find((p) => !used.has(p.id));
        if (candidate === undefined || candidate.id === "hold" || !ID.test(candidate.id) || normalized.has(candidate.id)) return block("candidate_invalid");
        normalized.set(candidate.id, { id: candidate.id, asset: candidate.asset, inputAtoms: candidate.inputAtoms, costBudgetAtoms: candidate.costBudgetAtoms });
      } catch {
        return block("candidate_invalid");
      }
    }
    if (frame.choice === "hold") {
      if (frame.receipt !== null) return block("receipt_unexpected");
      note("held", null);
      continue;
    }
    const selected = normalized.get(frame.choice);
    if (selected === undefined) return block("choice_invalid");
    account.reserve(selected);
    account.start(selected.id);
    if (frame.receipt === null) return block("receipt_missing");
    try {
      account.settle(frame.receipt as PaperReceipt);
    } catch {
      return block("settlement_refused");
    }
    note("settled", null);
    if (account.snapshot().stopped) return finish("capital_stopped");
  }
  return finish(null);
}
