/**
 * What the person did with an answer of Inonu (ASK-7, ASK-14), kept on THIS machine in the browser storage: accept, ignore,
 * or mute a kind of answer. Accepting writes a line in this journal; it never sends an order (there is no order path in the
 * desk). Only the documented fields of an entry are stored, never a key and never anything the model wrote freely: the reason kept for
 * a zone or a hold (ASK-14) is the sentence the core itself wrote, cut to 200 characters. The storage may be
 * missing, blocked or full: every access is guarded, so the screen keeps working without it.
 *
 * Also the small state machine of one request on the screen.
 */
import type { AskAction, AskAnswer } from "./client";
import type { AskViewState, CandidateKind } from "./view";

const JOURNAL_KEY = "inonu.journal.v1";
const MUTED_KEY = "inonu.muted.v1";
const DEFAULT_MAX = 200;
const KINDS: readonly string[] = ["zona", "token", "spot", "perp", "manter"];

export interface JournalEntry {
  readonly atMs: number;
  readonly instId: string;
  readonly action: AskAction;
  readonly candidateId: string | null;
  readonly kind: CandidateKind;
  readonly briefHash: string | null;
  /** True when the person accepted it, false when they ignored it. Neither sends an order. */
  readonly accepted: boolean;
  readonly modelo: string;
  /** The reason the core wrote, kept for a zone and for a hold (ASK-14); null for the other families and for entries written before it existed. */
  readonly razao?: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isEntry = (v: unknown): v is JournalEntry => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.atMs === "number" && Number.isFinite(e.atMs) && typeof e.instId === "string" && (e.action === "buy" || e.action === "sell" || e.action === "hold") &&
    (e.candidateId === null || typeof e.candidateId === "string") && typeof e.kind === "string" && KINDS.includes(e.kind) &&
    (e.briefHash === null || typeof e.briefHash === "string") && typeof e.accepted === "boolean" && typeof e.modelo === "string" &&
    (e.razao === undefined || e.razao === null || typeof e.razao === "string")
  );
};

export function createInonuJournal(storage: StorageLike | null, options: { readonly max?: number } = {}) {
  const max = options.max ?? DEFAULT_MAX;
  const read = (key: string): unknown => {
    try {
      const raw = storage?.getItem(key);
      return raw === null || raw === undefined ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: unknown): void => {
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      // full or blocked: the click still works, the line is just not kept
    }
  };
  const list = (): JournalEntry[] => {
    const stored = read(JOURNAL_KEY);
    return Array.isArray(stored) ? stored.filter(isEntry) : [];
  };
  const muted = (): Set<CandidateKind> => {
    const stored = read(MUTED_KEY);
    return new Set(Array.isArray(stored) ? (stored.filter((k): k is CandidateKind => typeof k === "string" && KINDS.includes(k)) as CandidateKind[]) : []);
  };
  return {
    list,
    add(entry: JournalEntry): void {
      const clean: JournalEntry = { atMs: entry.atMs, instId: entry.instId, action: entry.action, candidateId: entry.candidateId, kind: entry.kind, briefHash: entry.briefHash, accepted: entry.accepted, modelo: entry.modelo, razao: entry.razao === undefined || entry.razao === null ? null : entry.razao.slice(0, 200) };
      write(JOURNAL_KEY, [...list(), clean].slice(-max));
    },
    mutedKinds: muted,
    mute(kind: CandidateKind): void {
      write(MUTED_KEY, [...new Set([...muted(), kind])]);
    },
    unmute(kind: CandidateKind): void {
      write(MUTED_KEY, [...muted()].filter((k) => k !== kind));
    },
  };
}

export type AskEvent =
  | { readonly type: "ask" }
  | { readonly type: "answer"; readonly answer: AskAnswer; readonly nowMs: number }
  | { readonly type: "cancelled" }
  | { readonly type: "dismiss" };

export function askReducer(state: AskViewState, event: AskEvent): AskViewState {
  switch (event.type) {
    case "ask":
      return state.phase === "asking" ? state : { phase: "asking" };
    case "answer":
      if (state.phase !== "asking") return state;
      return event.answer.status === "respondido" ? { phase: "answered", answer: event.answer, atMs: event.nowMs } : { phase: "failed", answer: event.answer };
    case "cancelled":
      return { phase: "idle" };
    case "dismiss":
      return state.phase === "answered" || state.phase === "failed" ? { phase: "idle" } : state;
  }
}
