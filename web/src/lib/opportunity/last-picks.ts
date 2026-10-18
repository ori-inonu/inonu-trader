/**
 * The last picks the Inonu gave, kept for this tab only. A request costs a model call, and the bottom panel unmounts its tab when the person goes to another one (or reloads the page), so an
 * answer that was paid for must not vanish with it. It is read back only if it is exactly the closed shape of an answer, with the moment it arrived and the hash of the Brief it came from;
 * anything else in the storage is dropped and never trusted. The storage is the tab's own (it dies with the tab) and may be blocked or full: then the answer lives in memory for this page.
 *
 * Pure: no clock of its own, no network.
 */
import { type EcoAnswer, parseEcoAnswer } from "./picks";

export const LAST_PICKS_KEY = "inonu.picks.v1";

export interface LastPicks {
  readonly answer: EcoAnswer;
  /** When the answer reached this page. */
  readonly atMs: number;
  /** The hash of the Brief it came from, for the ticket draft; null when the core sent none. */
  readonly briefHash: string | null;
  /** Which model answered; provenance only. */
  readonly modelo: string | null;
}

export interface LastPicksStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const HASH = /^[A-Za-z0-9]{1,128}$/;
const KEYS = ["answer", "atMs", "briefHash", "modelo"];

function parseKept(raw: unknown): LastPicks | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join(",") !== KEYS.join(",")) return null;
  if (typeof r.atMs !== "number" || !Number.isFinite(r.atMs)) return null;
  if (r.briefHash !== null && (typeof r.briefHash !== "string" || !HASH.test(r.briefHash))) return null;
  if (r.modelo !== null && (typeof r.modelo !== "string" || r.modelo.length > 64)) return null;
  const answer = parseEcoAnswer(r.answer);
  return answer === null ? null : { answer, atMs: r.atMs, briefHash: r.briefHash, modelo: r.modelo };
}

export function createLastPicksStore(options: { readonly storage?: LastPicksStorage | null } = {}) {
  const storage = options.storage ?? null;
  let last: LastPicks | null = null;
  if (storage !== null) {
    try {
      const kept = storage.getItem(LAST_PICKS_KEY);
      last = kept === null ? null : parseKept(JSON.parse(kept));
    } catch {
      last = null;
    }
  }
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // a listener that fails must not keep the others from hearing
      }
    }
  };
  return {
    get: (): LastPicks | null => last,
    set(next: LastPicks): void {
      last = next;
      try {
        storage?.setItem(LAST_PICKS_KEY, JSON.stringify(next));
      } catch {
        // full or blocked: the answer lives in memory for this page
      }
      notify();
    },
    clear(): void {
      if (last === null) return;
      last = null;
      try {
        storage?.removeItem(LAST_PICKS_KEY);
      } catch {
        // blocked: nothing to undo
      }
      notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type LastPicksStore = ReturnType<typeof createLastPicksStore>;

let shared: LastPicksStore | null = null;

/** The one store of the page: the panel writes it when an answer arrives and reads it when it mounts. */
export function sharedLastPicks(): LastPicksStore {
  shared ??= createLastPicksStore({ storage: tabStorage() });
  return shared;
}

function tabStorage(): LastPicksStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
