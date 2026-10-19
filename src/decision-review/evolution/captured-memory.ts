import { createHash } from "node:crypto";
import { captureAgentConsult, captureSourceObject, sourceConsultDigest, type CapturedObject, type ProducerDecisionMetadata } from "./agent-episode";
import type { ConsultCaptureStore } from "./capture-store";
import { buildExperienceMemory, type ExperienceEpisode, type ExperienceMemory, type MemoryQuery } from "./memory";
import { DECISION_REFERENCE_JOURNALS, decisionMetadataReference, metadataReferenceAvailable } from "./metadata-reference";

/** Resource protection for one requested payload, never trading/risk limits. */
const CAPTURED_MEMORY_LIMITS = Object.freeze({ requestedCycles: 512, eligibleVariantsPerNamespace: 128, eligiblePayloadBytes: 8 * 1024 * 1024, queries: 64 });
export interface CapturedMemoryOptions {
  readonly store: ConsultCaptureStore;
  readonly arm: "A" | "B";
  readonly cycleIds: readonly string[];
  readonly query: unknown;
}
export interface CapturedMemoryBatchOptions extends Omit<CapturedMemoryOptions, "query"> { readonly queries: readonly unknown[] }
export interface CapturedMemoryDiagnostic {
  readonly cycleId: string;
  readonly status: "bound" | "awaiting_source" | "awaiting_metadata" | "quarantined" | "source_invalid" | "metadata_invalid" | "metadata_rejected";
  readonly rawVariants: number;
  readonly metadataVariants: number;
  readonly referenceVariants: number;
  readonly pendingItems: number;
  readonly excludedQueryCycle: boolean;
}
type FailureCode = "query_invalid" | "request_invalid" | "read_cycle_unavailable" | "storage_unavailable" | "snapshot_changed" | "payload_limit" | "memory_invalid";
export type CapturedMemoryResult = {
  readonly ok: true;
  readonly coverage: "requested_cycles_only";
  readonly requestedCycleIds: readonly string[];
  readonly arm: "A" | "B";
  readonly memory: ExperienceMemory;
  readonly diagnostics: readonly CapturedMemoryDiagnostic[];
  readonly sourceAuthenticated: false;
  readonly financialExecution: false;
  readonly qualifiedABActive: false;
  readonly matureOutcomes: 0;
  readonly consistency: "eligible_snapshots_rechecked";
} | { readonly ok: false; readonly code: FailureCode };
export type CapturedMemoryBatchResult = { readonly ok: true; readonly results: readonly Extract<CapturedMemoryResult, { ok: true }>[] } | Extract<CapturedMemoryResult, { ok: false }>;
/** V2 queries from one decision frame share one collection/interpretation and
 * one REAL final store recheck. No cross-call cache or fabricated recheck exists.
 * Every query is validated before any store call. Results keep input order and
 * own their mutable diagnostics/cohort arrays independently of other results. */
export function readCapturedExperienceMemories(options: CapturedMemoryBatchOptions): CapturedMemoryBatchResult {
  let input: CapturedObject | null;
  try { input = captureSourceObject({ queries: options?.queries }); } catch { return fail("query_invalid"); }
  if (!input || !Array.isArray(input.queries)) return fail("query_invalid");
  if (input.queries.length > CAPTURED_MEMORY_LIMITS.queries) return fail("payload_limit");
  const queries: MemoryQuery[] = [];
  for (const raw of input.queries) {
    const parsed = buildExperienceMemory([], raw);
    if (!parsed.ok || !("schemaVersion" in parsed.value.query) || parsed.value.query.schemaVersion !== 2) return fail("query_invalid");
    const q = parsed.value.query, first = queries[0];
    if (first && (first.cycleId !== q.cycleId || first.decidedAtMs !== q.decidedAtMs)) return fail("query_invalid");
    queries.push(q);
  }
  return readCapturedCohort(options, queries);
}
const fail = (code: FailureCode): Extract<CapturedMemoryResult, { ok: false }> => ({ ok: false, code });
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const object = (v: unknown): v is CapturedObject => v !== null && typeof v === "object" && !Array.isArray(v);
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
interface Row { readonly sequence: number; readonly sourceId: string; readonly cycleId: string; readonly sourceRecordHash: string; readonly cycleStartedAtMs: number; readonly firstObservedAtMs: number; readonly rawRecord: CapturedObject }
interface Snapshot { readonly rows: readonly Row[]; readonly hash: string }
type NamespaceRead = { readonly ok: true; readonly snapshot: Snapshot } | Extract<CapturedMemoryResult, { ok: false }>;

/** Read a HOST-SELECTED cohort only. No observation clock is invented here and
 * no source/ref pair is materialized into a new envelope. A full envelope must
 * already have its own captured first availability. Rechecking is a local
 * consistency observation, not source authentication or a permanent lease. */
export function readCapturedExperienceMemory(options: CapturedMemoryOptions): CapturedMemoryResult {
  // Validate the query with the same builder before touching any store port.
  let empty: ReturnType<typeof buildExperienceMemory>;
  try { empty = buildExperienceMemory([], captureSourceObject(options?.query)); }
  catch { return fail("query_invalid"); }
  if (!empty.ok) return fail("query_invalid");
  const batch = readCapturedCohort(options, [empty.value.query]);
  return batch.ok ? batch.results[0] ?? fail("memory_invalid") : batch;
}

function readCapturedCohort(options: Omit<CapturedMemoryOptions, "query">, queries: readonly MemoryQuery[]): CapturedMemoryBatchResult {
  const requested = captureSourceObject({ cycleIds: options?.cycleIds });
  if (options?.arm !== "A" && options?.arm !== "B" || !requested || !Array.isArray(requested.cycleIds) || !requested.cycleIds.every(code)) return fail("request_invalid");
  if (requested.cycleIds.length > CAPTURED_MEMORY_LIMITS.requestedCycles) return fail("payload_limit");
  const cycleIds = [...new Set(requested.cycleIds as readonly string[])].sort();
  if (queries.length === 0) return { ok: true, results: [] };
  const q = queries[0]!;
  if (typeof options.store?.readCycle !== "function") return fail("read_cycle_unavailable");
  const ids = DECISION_REFERENCE_JOURNALS[options.arm];
  const sourceIds = [ids.sourceId, ids.metadataSourceId, ids.referenceSourceId];
  let payloadBytes = 0;
  const read = (sourceId: string, cycleId: string): NamespaceRead => {
    try {
      const got = options.store.readCycle!(sourceId, cycleId);
      if (!got.ok || !Array.isArray(got.records)) return fail("storage_unavailable");
      const rows: Row[] = [], sequences = new Set<number>(), hashes = new Set<string>();
      for (const original of got.records) {
        // Read the temporal header through a data descriptor, before touching
        // payload. Accessors are never an availability clock. Proxy descriptor
        // traps may still throw; this port boundary is not an object sandbox.
        const first = Object.getOwnPropertyDescriptor(original, "firstObservedAtMs");
        if (!first || !first.enumerable || !Object.hasOwn(first, "value") || !clock(first.value)) return fail("storage_unavailable");
        // A later variant and its now-true cycleConflict flag do not censor a
        // historical query. Filter availability BEFORE interpreting its payload.
        if (first.value > q.decidedAtMs) continue;
        if (rows.length >= CAPTURED_MEMORY_LIMITS.eligibleVariantsPerNamespace) return fail("payload_limit");
        const r = captureSourceObject(original);
        if (!r || !clock(r.sequence) || r.sequence < 1 || r.sourceId !== sourceId || r.cycleId !== cycleId || !clock(r.cycleStartedAtMs) || !clock(r.firstObservedAtMs) || r.cycleStartedAtMs > r.firstObservedAtMs || !object(r.rawRecord) || r.rawRecord.cycleId !== cycleId || r.rawRecord.atMs !== r.cycleStartedAtMs || sourceConsultDigest(r.rawRecord) !== r.sourceRecordHash || typeof r.cycleConflict !== "boolean") return fail("storage_unavailable");
        if (sequences.has(r.sequence) || hashes.has(r.sourceRecordHash as string)) return fail("storage_unavailable");
        sequences.add(r.sequence); hashes.add(r.sourceRecordHash as string);
        const row: Row = { sequence: r.sequence, sourceId, cycleId, sourceRecordHash: r.sourceRecordHash as string, cycleStartedAtMs: r.cycleStartedAtMs, firstObservedAtMs: r.firstObservedAtMs, rawRecord: r.rawRecord };
        payloadBytes += new TextEncoder().encode(JSON.stringify(row)).byteLength;
        if (payloadBytes > CAPTURED_MEMORY_LIMITS.eligiblePayloadBytes) return fail("payload_limit");
        rows.push(row);
      }
      rows.sort((a, b) => a.sequence - b.sequence);
      return { ok: true, snapshot: { rows, hash: digest(rows) } };
    } catch { return fail("storage_unavailable"); }
  };
  const snapshots = new Map<string, Snapshot>();
  for (const cycleId of cycleIds) for (const sourceId of sourceIds) {
    const got = read(sourceId, cycleId);
    if (!got.ok) return got;
    snapshots.set(`${sourceId}:${cycleId}`, got.snapshot);
  }
  const episodes: ExperienceEpisode[] = [], diagnostics: CapturedMemoryDiagnostic[] = [];
  for (const cycleId of cycleIds) {
    const raw = snapshots.get(`${ids.sourceId}:${cycleId}`)!.rows, full = snapshots.get(`${ids.metadataSourceId}:${cycleId}`)!.rows, refs = snapshots.get(`${ids.referenceSourceId}:${cycleId}`)!.rows;
    const base = { cycleId, rawVariants: raw.length, metadataVariants: full.length, referenceVariants: refs.length, excludedQueryCycle: cycleId === q.cycleId };
    const report = (status: CapturedMemoryDiagnostic["status"], pendingItems = 0) => diagnostics.push({ ...base, status, pendingItems });
    if ([raw, full, refs].some(rows => rows.length > 1)) { report("quarantined"); continue; }
    const s = raw[0], m = full[0], r = refs[0];
    if (!s) { report("awaiting_source"); continue; }
    const source = captureAgentConsult(s.rawRecord, { firstObservedAtMs: s.firstObservedAtMs });
    if (!source.ok) { report("source_invalid"); continue; }
    const ref = r ? decisionMetadataReference(r.rawRecord) : null;
    if (r && (!ref || (ref.metadata as CapturedObject).arm !== options.arm)) { report("metadata_invalid"); continue; }
    if (r && !metadataReferenceAvailable(ref, r.firstObservedAtMs)) { report("metadata_rejected"); continue; }
    if (ref && (ref.atMs !== s.cycleStartedAtMs || (ref.metadata as CapturedObject).sourceRecordHash !== s.sourceRecordHash)) { report("quarantined"); continue; }
    if (!m) { report("awaiting_metadata"); continue; }
    const wrapper = m.rawRecord, envelope = wrapper.envelope;
    if (Object.keys(wrapper).length !== 3 || !Object.hasOwn(wrapper, "envelope") || wrapper.atMs !== s.cycleStartedAtMs || !object(envelope) || Object.keys(envelope).length !== 3 || envelope.schemaVersion !== 1 || !Object.hasOwn(envelope, "consultation") || !Object.hasOwn(envelope, "decisionMetadata") || !object(envelope.consultation) || envelope.consultation.cycleId !== cycleId || envelope.consultation.atMs !== s.cycleStartedAtMs || sourceConsultDigest(envelope.consultation) !== s.sourceRecordHash) { report("metadata_invalid"); continue; }
    if (ref && sourceConsultDigest(ref.metadata) !== sourceConsultDigest(envelope.decisionMetadata)) { report("quarantined"); continue; }
    if (!object(envelope.decisionMetadata) || envelope.decisionMetadata.arm !== options.arm) { report("metadata_rejected"); continue; }
    const bound = captureAgentConsult(s.rawRecord, { firstObservedAtMs: s.firstObservedAtMs, prospective: { metadata: envelope.decisionMetadata as unknown as ProducerDecisionMetadata, firstObservedAtMs: m.firstObservedAtMs } });
    if (!bound.ok || bound.capture.qualification.status !== "prospective_bound") { report("metadata_rejected"); continue; }
    const pending = bound.capture.episodes.flatMap(e => e.experience ? [e.experience] : []);
    // The builder independently excludes the querying cycle and future answers.
    episodes.push(...pending); report("bound", pending.length);
  }
  const memories: ExperienceMemory[] = [];
  for (const query of queries) {
    const built = buildExperienceMemory(episodes, query);
    if (!built.ok) return fail("memory_invalid");
    memories.push(built.value);
  }
  payloadBytes = 0;
  for (const cycleId of cycleIds) for (const sourceId of sourceIds) {
    const got = read(sourceId, cycleId);
    if (!got.ok) return got;
    if (got.snapshot.hash !== snapshots.get(`${sourceId}:${cycleId}`)!.hash) return fail("snapshot_changed");
  }
  return { ok: true, results: memories.map(memory => ({ ok: true, coverage: "requested_cycles_only", requestedCycleIds: [...cycleIds], arm: options.arm, memory, diagnostics: diagnostics.map(d => ({ ...d })),
    sourceAuthenticated: false, financialExecution: false, qualifiedABActive: false, matureOutcomes: 0, consistency: "eligible_snapshots_rechecked" })) };
}
