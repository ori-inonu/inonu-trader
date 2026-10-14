/**
 * Decision history for the chart markers. The producer board keeps only a short recent window, so real reads
 * with a real decision (status "ok", state present) are accumulated here: merged from every board refresh,
 * deduplicated by readId, capped to the newest entries and persisted in localStorage. Entries are written back
 * through the same parser as the wire, so a malformed store is simply forgotten. Nothing here creates or
 * repairs a decision: reads without one, or with a failed status, are never stored.
 */

import { parseJevRead, type JevReadBoardView, type JevReadView } from "../../jev-read";

export const DECISION_HISTORY_KEY = "jev.decisions.v1";
export const DECISION_HISTORY_CAP = 400;
export const DECISION_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export type DecisionStorage = Pick<Storage, "getItem" | "setItem">;

/** A read worth remembering: a real state and a real ok decision. */
export function isStorableRead(read: JevReadView): boolean {
  return read.state !== null && read.decision !== null && read.decision.status === "ok";
}

/**
 * Merge `reads` into `map` (keyed by readId), dropping entries older than nowMs - maxAgeMs and keeping at most
 * `cap` newest by atMs. The map is mutated; the same readId arriving twice keeps the newest object.
 */
export function mergeDecisionHistory(
  map: Map<string, JevReadView>,
  reads: readonly JevReadView[],
  nowMs: number,
  cap = DECISION_HISTORY_CAP,
  maxAgeMs = DECISION_HISTORY_MAX_AGE_MS,
): Map<string, JevReadView> {
  for (const read of reads) {
    if (!isStorableRead(read)) continue;
    if (nowMs - read.atMs > maxAgeMs) continue;
    map.set(read.readId, read);
  }
  for (const [id, read] of map) {
    if (nowMs - read.atMs > maxAgeMs) map.delete(id);
  }
  if (map.size > cap) {
    const byAge = [...map.values()].sort((a, b) => b.atMs - a.atMs).slice(0, cap);
    map.clear();
    for (const read of byAge) map.set(read.readId, read);
  }
  return map;
}

/** Every read of a board that could hold a decision: the per-instrument latest plus the recent journal. */
export function boardReads(board: JevReadBoardView): readonly JevReadView[] {
  const seen = new Map<string, JevReadView>();
  for (const read of board.recent) seen.set(read.readId, read);
  for (const read of Object.values(board.reads)) seen.set(read.readId, read);
  return [...seen.values()];
}

/** Newest first: the order the chart consumes. */
export function historyList(map: Map<string, JevReadView>): JevReadView[] {
  return [...map.values()].sort((a, b) => b.atMs - a.atMs);
}

/** Read the store: every entry is parsed like a wire read, so corrupt or foreign data is ignored wholesale. */
export function loadDecisionHistory(storage: DecisionStorage, nowMs: number): Map<string, JevReadView> {
  const map = new Map<string, JevReadView>();
  let raw: string | null;
  try {
    raw = storage.getItem(DECISION_HISTORY_KEY);
  } catch {
    return map;
  }
  if (raw === null) return map;
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed as { reads?: unknown })?.reads;
    if (!Array.isArray(list)) return map;
    for (const item of list) {
      const read = parseJevRead(item);
      if (read !== null && isStorableRead(read) && nowMs - read.atMs <= DECISION_HISTORY_MAX_AGE_MS) map.set(read.readId, read);
    }
  } catch {
    map.clear();
  }
  if (map.size > DECISION_HISTORY_CAP) {
    return mergeDecisionHistory(new Map(), historyList(map), nowMs);
  }
  return map;
}

/** Persist the map; a full or failing store only means the history is shorter next time. */
export function saveDecisionHistory(storage: DecisionStorage, map: Map<string, JevReadView>): void {
  try {
    // Re-add the wire envelope so a stored entry parses exactly like a read from the API.
    const reads = historyList(map).map((read) => ({ schemaVersion: 1, advisory: true, execution: "never", ...read }));
    storage.setItem(DECISION_HISTORY_KEY, JSON.stringify({ reads }));
  } catch {
    // Storage is a cache: never let it break the desk.
  }
}
