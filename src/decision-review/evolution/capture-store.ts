import type { Database } from "bun:sqlite";
import { sourceConsultDigest } from "./agent-episode";

/** Durable local observation, not a producer signature or a financial result.
 * The host supplies a dedicated SQLite database outside the financial home.
 * A reread never changes the first availability of the captured revision. */
export interface StoredConsultCapture {
  readonly sequence: number;
  readonly sourceId: string;
  readonly cycleId: string;
  readonly sourceRecordHash: string;
  readonly cycleStartedAtMs: number;
  readonly firstObservedAtMs: number;
  readonly cycleConflict: boolean;
  readonly rawRecord: unknown;
}
type Failure = { readonly ok: false; readonly code: "request_invalid" | "capture_invalid" | "stored_capture_invalid" | "storage_unavailable" };
export type ConsultCaptureLookupResult = { readonly ok: true; readonly record: StoredConsultCapture | null } | Failure;
export type ConsultCaptureCycleReadResult = { readonly ok: true; readonly records: readonly StoredConsultCapture[] } | Failure;
export interface ConsultCaptureStore {
  capture(sourceId: string, raw: unknown, observedAtMs: number): { readonly ok: true; readonly inserted: boolean; readonly record: StoredConsultCapture } | Failure;
  list(sourceId: string, page: { readonly afterSequence: number; readonly limit: number }): { readonly ok: true; readonly records: readonly StoredConsultCapture[]; readonly nextSequence: number } | Failure;
  /** Optional on injected legacy stores; real stores always support exact,
   * read-only lookup. Absence is never permission to guess another record. */
  lookup?(sourceId: string, cycleId: string, sourceRecordHash: string): ConsultCaptureLookupResult;
  /** Read every validated variant of only this source cycle. Optional on
   * injected legacy stores; never infer a cycle through a sentinel hash. */
  readCycle?(sourceId: string, cycleId: string): ConsultCaptureCycleReadResult;
}
export interface ConsultCaptureStoreWithLookup extends ConsultCaptureStore {
  lookup(sourceId: string, cycleId: string, sourceRecordHash: string): ConsultCaptureLookupResult;
  readCycle(sourceId: string, cycleId: string): ConsultCaptureCycleReadResult;
}
type Row = { sequence: number; source_id: string; cycle_id: string; source_hash: string; raw_payload: string; first_observed_ms: number; observation_hash: string };
const source = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(v);
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const cycle = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function identity(raw: unknown): { cycleId: string; atMs: number } | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return cycle(r.cycleId) && clock(r.atMs) ? { cycleId: r.cycleId, atMs: r.atMs } : null;
}
class InvalidStoredCapture extends Error {}
const failure = (e: unknown): Failure => ({ ok: false, code: e instanceof InvalidStoredCapture ? "stored_capture_invalid" : "storage_unavailable" });
const observationHash = (sourceId: string, cycleId: string, sourceHash: string, firstObservedAtMs: number) => sourceConsultDigest({ sourceId, cycleId, sourceRecordHash: sourceHash, firstObservedAtMs });

export function createConsultCaptureStore(db: Database): { readonly ok: true; readonly store: ConsultCaptureStoreWithLookup } | Failure {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS evolution_consult_captures (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL, cycle_id TEXT NOT NULL, source_hash TEXT NOT NULL,
      raw_payload TEXT NOT NULL, first_observed_ms INTEGER NOT NULL, observation_hash TEXT NOT NULL,
      UNIQUE(source_id,cycle_id,source_hash));`);
  } catch { return { ok: false, code: "storage_unavailable" }; }
  const decode = (r: Row, conflict: boolean): StoredConsultCapture => {
    if (!clock(r.sequence) || r.sequence < 1 || !source(r.source_id) || !cycle(r.cycle_id) || !hash(r.source_hash) || !clock(r.first_observed_ms) || typeof r.raw_payload !== "string" || !hash(r.observation_hash) || observationHash(r.source_id, r.cycle_id, r.source_hash, r.first_observed_ms) !== r.observation_hash) throw new InvalidStoredCapture();
    let raw: unknown;
    try { raw = JSON.parse(r.raw_payload); } catch { throw new InvalidStoredCapture(); }
    const id = identity(raw);
    if (id === null || id.cycleId !== r.cycle_id || id.atMs > r.first_observed_ms || sourceConsultDigest(raw) !== r.source_hash || JSON.stringify(raw) !== r.raw_payload) throw new InvalidStoredCapture();
    return { sequence: r.sequence, sourceId: r.source_id, cycleId: r.cycle_id, sourceRecordHash: r.source_hash,
      cycleStartedAtMs: id.atMs, firstObservedAtMs: r.first_observed_ms, cycleConflict: conflict, rawRecord: raw };
  };
  const readCycle = (sourceId: string, cycleId: string): ConsultCaptureCycleReadResult => {
    if (!source(sourceId) || !cycle(cycleId)) return { ok: false, code: "request_invalid" };
    try {
      return db.transaction(() => {
        // The existing unique index starts with source_id and cycle_id. Read
        // every variant of only this cycle: no intact target may hide damage
        // elsewhere in the same cycle, even when an exact hash is absent.
        const rows = db.query("SELECT * FROM evolution_consult_captures WHERE source_id=? AND cycle_id=? ORDER BY sequence").all(sourceId, cycleId) as Row[];
        return { ok: true as const, records: rows.map(r => decode(r, rows.length > 1)) };
      }).deferred();
    } catch (e) { return failure(e); }
  };
  const store: ConsultCaptureStoreWithLookup = {
    capture(sourceId, raw, observedAtMs) {
      if (!source(sourceId) || !clock(observedAtMs)) return { ok: false, code: "request_invalid" };
      try {
        const digest = sourceConsultDigest(raw);
        if (digest === null) return { ok: false, code: "capture_invalid" };
        const id = identity(raw);
        if (id === null || id.atMs > observedAtMs) return { ok: false, code: "capture_invalid" };
        const payload = JSON.stringify(raw);
        return db.transaction(() => {
          const previous = db.query("SELECT * FROM evolution_consult_captures WHERE source_id=? AND cycle_id=? ORDER BY sequence").all(sourceId, id.cycleId) as Row[];
          // Never hide an earlier damaged variant by recording a new one.
          for (const r of previous) decode(r, previous.length > 1);
          const same = previous.find(r => r.source_hash === digest);
          if (same !== undefined) {
            if (same.raw_payload !== payload) throw new InvalidStoredCapture();
            return { ok: true as const, inserted: false, record: decode(same, previous.length > 1) };
          }
          db.query("INSERT INTO evolution_consult_captures(source_id,cycle_id,source_hash,raw_payload,first_observed_ms,observation_hash) VALUES (?,?,?,?,?,?)").run(sourceId, id.cycleId, digest, payload, observedAtMs, observationHash(sourceId, id.cycleId, digest, observedAtMs));
          const saved = db.query("SELECT * FROM evolution_consult_captures WHERE source_id=? AND cycle_id=? AND source_hash=?").get(sourceId, id.cycleId, digest) as Row | null;
          if (saved === null) throw new InvalidStoredCapture();
          return { ok: true as const, inserted: true, record: decode(saved, previous.length > 0) };
        }).immediate();
      } catch (e) { return failure(e); }
    },
    list(sourceId, page) {
      if (!source(sourceId) || !page || !clock(page.afterSequence) || !clock(page.limit) || page.limit < 1 || page.limit > 1000) return { ok: false, code: "request_invalid" };
      try {
        return db.transaction(() => {
          const rows = db.query("SELECT * FROM evolution_consult_captures WHERE source_id=? AND sequence>? ORDER BY sequence LIMIT ?").all(sourceId, page.afterSequence, page.limit) as Row[];
          const records = rows.map(r => {
            const n = db.query("SELECT count(*) AS n FROM evolution_consult_captures WHERE source_id=? AND cycle_id=?").get(sourceId, r.cycle_id) as { n: number };
            return decode(r, n.n > 1);
          });
          return { ok: true as const, records, nextSequence: records.at(-1)?.sequence ?? page.afterSequence };
        }).deferred();
      } catch (e) { return failure(e); }
    },
    lookup(sourceId, cycleId, sourceRecordHash) {
      if (!source(sourceId) || !cycle(cycleId) || !hash(sourceRecordHash)) return { ok: false, code: "request_invalid" };
      const found = readCycle(sourceId, cycleId);
      return found.ok ? { ok: true, record: found.records.find(r => r.sourceRecordHash === sourceRecordHash) ?? null } : found;
    },
    readCycle,
  };
  return { ok: true, store };
}
