/**
 * The answers of the model that the chart draws (ASK-7). "Pedir ao Inonu" publishes an answer here when it arrives; the chart
 * subscribes. An answer the person ignored stops being drawn, a muted kind is not drawn, and the store lives on THIS machine for
 * a day. Only the documented fields are stored, never the model's free text; the verdict that came with the answer is kept too (its plan and its reasons, whose
 * words are the code's own dictionary over measured numbers) and only if it is exactly a verdict. A blocked or full storage changes nothing: the
 * answers then live until the page closes. Nothing here sends an order.
 */
import type { ChartDecision } from "../desk/chart/inonu-layer";
import { parseVeredito } from "../veredito/parse";
import type { CandidateKind } from "./view";

export const DECISIONS_KEY = "inonu.decisions.v1";
export const MAX_KEPT = 50;
const MAX_AGE_MS = 24 * 3_600_000;
const MAX_TRAIL = 20;
const KINDS: readonly string[] = ["zona", "token", "spot", "perp", "manter"];

export interface StoredDecision extends ChartDecision {
  readonly kind: CandidateKind;
  readonly status: "nova" | "aceita" | "ignorada";
}

export interface DecisionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isStored = (v: unknown): v is StoredDecision => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.atMs === "number" && Number.isFinite(e.atMs) && typeof e.instId === "string" && (e.action === "buy" || e.action === "sell" || e.action === "hold") &&
    (e.candidateId === null || typeof e.candidateId === "string") && typeof e.modelo === "string" && typeof e.kind === "string" && KINDS.includes(e.kind) &&
    (e.status === "nova" || e.status === "aceita" || e.status === "ignorada")
  );
};

/** What is kept of an answer: its fields, and its verdict only if it is exactly a verdict (the store lives in the browser and a hand edited one must not reach the screen). */
const clean = (d: StoredDecision): StoredDecision => {
  const veredito = d.veredito === undefined ? null : parseVeredito(d.veredito);
  return { action: d.action, candidateId: d.candidateId, atMs: d.atMs, instId: d.instId, modelo: d.modelo, kind: d.kind, status: d.status, ...(veredito === null ? {} : { veredito }) };
};

export function createDecisionStore(storage: DecisionStorage | null, now: () => number = Date.now) {
  const load = (): StoredDecision[] => {
    try {
      const raw = storage?.getItem(DECISIONS_KEY);
      if (raw === null || raw === undefined) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const floor = now() - MAX_AGE_MS;
      return parsed.filter(isStored).filter((d) => d.atMs >= floor).map(clean).sort((a, b) => a.atMs - b.atMs).slice(-MAX_KEPT);
    } catch {
      return [];
    }
  };

  let items: readonly StoredDecision[] = load();
  const listeners = new Set<() => void>();

  const commit = (next: readonly StoredDecision[]): void => {
    items = next;
    try {
      storage?.setItem(DECISIONS_KEY, JSON.stringify(items));
    } catch {
      // full or blocked: the answers last until the page closes
    }
    for (const listener of [...listeners]) listener();
  };

  return {
    /** The same array until something changes, so a screen can subscribe to it. */
    list: (): readonly StoredDecision[] => items,
    publish(entry: StoredDecision): void {
      commit([...items, clean(entry)].sort((a, b) => a.atMs - b.atMs).slice(-MAX_KEPT));
    },
    /** The person accepted or ignored one answer. An unknown one changes nothing. */
    resolve(instId: string, atMs: number, accepted: boolean): void {
      if (!items.some((d) => d.instId === instId && d.atMs === atMs)) return;
      commit(items.map((d) => (d.instId === instId && d.atMs === atMs ? { ...d, status: accepted ? ("aceita" as const) : ("ignorada" as const) } : d)));
    },
    /** Something the chart reads from elsewhere changed (a muted kind): notify with a new snapshot. */
    touch(): void {
      items = [...items];
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type DecisionStore = ReturnType<typeof createDecisionStore>;

let shared: DecisionStore | null = null;

/** The one store of the page, on top of the browser storage when there is one. */
export function sharedDecisionStore(): DecisionStore {
  if (shared === null) {
    let storage: DecisionStorage | null = null;
    try {
      storage = typeof window === "undefined" ? null : window.localStorage;
    } catch {
      storage = null;
    }
    shared = createDecisionStore(storage);
  }
  return shared;
}

/** What the chart draws for one instrument: the newest answer, and the older ones as the trail (oldest first). */
export function forInstrument(list: readonly StoredDecision[], instId: string, muted: ReadonlySet<CandidateKind>, nowMs: number): { readonly latest: ChartDecision | null; readonly trail: ChartDecision[] } {
  const drawn = list
    .filter((d) => d.instId === instId && d.status !== "ignorada" && d.atMs >= nowMs - MAX_AGE_MS && (d.kind === "manter" || !muted.has(d.kind)))
    .sort((a, b) => a.atMs - b.atMs)
    .map((d): ChartDecision => ({ action: d.action, candidateId: d.candidateId, atMs: d.atMs, instId: d.instId, modelo: d.modelo, ...(d.veredito === undefined ? {} : { veredito: d.veredito }) }));
  const latest = drawn.length === 0 ? null : drawn[drawn.length - 1]!;
  return { latest, trail: drawn.slice(0, Math.max(0, drawn.length - 1)).slice(-MAX_TRAIL) };
}
