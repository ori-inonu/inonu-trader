import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

/** SQLite persistence for intelligence ONLY. The host supplies a dedicated DB
 * outside the financial home and the engine's full state validator. This layer
 * cannot assess improvements, choose trades or perform a promotion by itself. */
export interface StoredEvolutionState { readonly revision: number; readonly active: { readonly version: string } }
export type StoreCode = "state_invalid" | "transition_invalid" | "revision_invalid" | "stored_state_invalid" | "compare_and_swap_conflict" | "storage_unavailable";
export type StoreReason = "initialize" | "observe" | "hypothesis" | "seal" | "assess" | "promote" | "reject" | "rollback";
type Failure = { readonly ok: false; readonly code: StoreCode };
type Loaded<T> = { readonly ok: true; readonly state: T | null } | Failure;
export interface EvolutionStore<T extends StoredEvolutionState> {
  load(): Loaded<T>;
  revision(revision: number): Loaded<T>;
  /** Persist an engine transition; expected=null initializes revision zero. */
  commit(expected: { readonly revision: number; readonly activeVersion: string } | null, next: T, reason: StoreReason): { readonly ok: true; readonly alreadyCommitted: boolean; readonly sha256: string } | Failure;
}
type Row = { revision: number; active_version: string; payload: string; sha256: string };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const revision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const reasons = new Set(["initialize", "observe", "hypothesis", "seal", "assess", "promote", "reject", "rollback"]);
class AbortStore extends Error { constructor(readonly code: StoreCode) { super(code); } }

export function createEvolutionStore<T extends StoredEvolutionState>(db: Database, validateState: (raw: unknown) => T | null, validateTransition: (previous: T | null, next: T, reason: StoreReason) => boolean): { readonly ok: true; readonly store: EvolutionStore<T> } | Failure {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS evolution_state (
      id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, active_version TEXT NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evolution_state_history (
      revision INTEGER PRIMARY KEY, active_version TEXT NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL, reason TEXT NOT NULL);`);
  } catch { return { ok: false, code: "storage_unavailable" }; }

  const validated = (raw: unknown): T | null => {
    try {
      const s = validateState(raw);
      return s !== null && revision(s.revision) && hash(s.active?.version) ? s : null;
    } catch { return null; }
  };
  const decode = (row: Row): T => {
    if (!revision(row.revision) || !hash(row.active_version) || !hash(row.sha256) || typeof row.payload !== "string" || sha(row.payload) !== row.sha256) throw new AbortStore("stored_state_invalid");
    let raw: unknown; try { raw = JSON.parse(row.payload); } catch { throw new AbortStore("stored_state_invalid"); }
    const s = validated(raw);
    if (s === null || s.revision !== row.revision || s.active.version !== row.active_version) throw new AbortStore("stored_state_invalid");
    return s;
  };
  const current = (): Row | null => {
    const row = db.query("SELECT revision, active_version, payload, sha256 FROM evolution_state WHERE id=1").get() as Row | null;
    const latest = db.query("SELECT revision, active_version, payload, sha256 FROM evolution_state_history ORDER BY revision DESC LIMIT 1").get() as Row | null;
    if (row === null && latest === null) return null;
    if (row === null || latest === null || row.revision !== latest.revision || row.active_version !== latest.active_version || row.sha256 !== latest.sha256 || row.payload !== latest.payload) throw new AbortStore("stored_state_invalid");
    const span = db.query("SELECT count(*) AS n, min(revision) AS first FROM evolution_state_history").get() as { n: number; first: number };
    if (span.first !== 0 || span.n !== row.revision + 1) throw new AbortStore("stored_state_invalid");
    decode(row); return row;
  };
  const fail = (e: unknown): Failure => ({ ok: false, code: e instanceof AbortStore ? e.code : "storage_unavailable" });
  const store: EvolutionStore<T> = {
    load() {
      try { const row = db.transaction(current).deferred(); return { ok: true, state: row === null ? null : decode(row) }; }
      catch (e) { return fail(e); }
    },
    revision(n) {
      if (!revision(n)) return { ok: false, code: "revision_invalid" };
      try {
        const row = db.query("SELECT revision, active_version, payload, sha256 FROM evolution_state_history WHERE revision=?").get(n) as Row | null;
        return { ok: true, state: row === null ? null : decode(row) };
      } catch (e) { return fail(e); }
    },
    commit(expected, next, reason) {
      try {
        const s = validated(next);
        if (s === null || !reasons.has(reason)) return { ok: false, code: "state_invalid" };
        if (expected !== null && (!revision(expected.revision) || !hash(expected.activeVersion))) return { ok: false, code: "revision_invalid" };
        const wanted = expected === null ? 0 : expected.revision + 1;
        if (!revision(wanted) || s.revision !== wanted) return { ok: false, code: "revision_invalid" };
        const payload = JSON.stringify(s), digest = sha(payload);
        return db.transaction(() => {
          const row = current();
          const verifyTransition = (previous: T | null): void => {
            try { if (validateTransition(previous, s, reason) === true) return; } catch { /* closed constant below */ }
            throw new AbortStore("transition_invalid");
          };
          // A lost reply after commit can be retried without adding a second event.
          if (row !== null && row.revision === s.revision && row.sha256 === digest && row.payload === payload) {
            if (expected !== null) {
              const previous = db.query("SELECT revision, active_version, payload, sha256 FROM evolution_state_history WHERE revision=?").get(expected.revision) as Row | null;
              if (previous === null || decode(previous).active.version !== expected.activeVersion) throw new AbortStore("compare_and_swap_conflict");
              verifyTransition(decode(previous));
            } else verifyTransition(null);
            return { ok: true as const, alreadyCommitted: true, sha256: digest };
          }
          if (expected === null ? row !== null : row === null || row.revision !== expected.revision || row.active_version !== expected.activeVersion) throw new AbortStore("compare_and_swap_conflict");
          verifyTransition(row === null ? null : decode(row));
          db.query("INSERT INTO evolution_state_history (revision,active_version,payload,sha256,reason) VALUES (?,?,?,?,?)").run(s.revision, s.active.version, payload, digest, reason);
          db.query("INSERT INTO evolution_state (id,revision,active_version,payload,sha256) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,active_version=excluded.active_version,payload=excluded.payload,sha256=excluded.sha256").run(s.revision, s.active.version, payload, digest);
          return { ok: true as const, alreadyCommitted: false, sha256: digest };
        }).immediate();
      } catch (e) { return fail(e); }
    },
  };
  return { ok: true, store };
}
