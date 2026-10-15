import { captureSourceObject, type CapturedObject } from "./agent-episode";
import type { ConsultCaptureStore, ConsultCaptureCycleReadResult, StoredConsultCapture } from "./capture-store";
import { captureDecisionEvidence, type DecisionEvidenceResult } from "./decision-evidence";

export const DECISION_REFERENCE_JOURNALS = Object.freeze({
  A: Object.freeze({ sourceId: "agent_briefs", metadataSourceId: "agent_decision_evidence", referenceSourceId: "agent_decision_metadata_refs" }),
  B: Object.freeze({ sourceId: "shadow_briefs", metadataSourceId: "shadow_decision_evidence", referenceSourceId: "shadow_decision_metadata_refs" }),
} as const);
type Evidence = Extract<DecisionEvidenceResult, { ok: true }>;
export type MetadataReferenceResult = {
  readonly ok: true;
  readonly status: "awaiting_source" | "bound" | "metadata_rejected" | "quarantined";
  readonly evidence: Evidence | null;
  readonly local: { readonly referenceSequence: number; readonly referenceFirstObservedAtMs: number; readonly referenceConflict: boolean };
} | { readonly ok: false; readonly code: "reference_invalid" | "observation_invalid" | "lookup_unavailable" | "storage_failure" };
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const metadataKeys = ["schemaVersion", "sourceRecordHash", "snapshotHash", "decisionVersion", "evaluatorHash", "askedAtMs", "answeredAtMs", "recordedAtMs", "factAvailableAtMs", "arm"];

/** Only this exact reported format is a reference. Detachment never invokes a
 * source getter/toJSON. This validation establishes no source authentication. */
export function decisionMetadataReference(raw: unknown): CapturedObject | null {
  const r = captureSourceObject(raw);
  if (!r || Object.keys(r).length !== 3 || !Object.hasOwn(r, "metadata") || typeof r.cycleId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(r.cycleId) || !clock(r.atMs)) return null;
  const m = r.metadata;
  if (m === null || typeof m !== "object" || Array.isArray(m)) return null;
  const metadata = m as CapturedObject;
  if (Object.keys(metadata).length !== metadataKeys.length || !metadataKeys.every(k => Object.hasOwn(metadata, k)) || metadata.schemaVersion !== 1 || ![metadata.sourceRecordHash, metadata.snapshotHash, metadata.decisionVersion, metadata.evaluatorHash].every(hash) || ![metadata.askedAtMs, metadata.answeredAtMs, metadata.recordedAtMs, metadata.factAvailableAtMs].every(clock) || metadata.arm !== "A" && metadata.arm !== "B") return null;
  return r;
}

/** Coherence of a metadata report with its independently retained first local
 * reference observation. No later join may make an earlier invalid clock true. */
export function metadataReferenceAvailable(raw: unknown, firstObservedAtMs: number): boolean {
  const ref = decisionMetadataReference(raw);
  if (!ref || !clock(firstObservedAtMs)) return false;
  const m = ref.metadata as CapturedObject;
  return (ref.atMs as number) <= (m.askedAtMs as number) && (m.factAvailableAtMs as number) <= (m.askedAtMs as number) && (m.askedAtMs as number) <= (m.answeredAtMs as number) && (m.answeredAtMs as number) <= (m.recordedAtMs as number) && (m.recordedAtMs as number) <= firstObservedAtMs;
}

/** Production stores use an indexed, validated cycle read. The compatibility
 * fallback is only for older injected ports; it never guesses a source hash. */
export function readDecisionCycle(store: ConsultCaptureStore, sourceId: string, cycleId: string): ConsultCaptureCycleReadResult {
  try {
    if (store.readCycle) return store.readCycle(sourceId, cycleId);
    const records: StoredConsultCapture[] = [];
    let afterSequence = 0;
    for (;;) {
      const page = store.list(sourceId, { afterSequence, limit: 1000 });
      if (!page.ok) return page;
      if (!clock(page.nextSequence) || page.nextSequence < afterSequence || page.records.length > 0 && page.nextSequence <= afterSequence) return { ok: false, code: "stored_capture_invalid" };
      records.push(...page.records.filter(r => r.cycleId === cycleId));
      if (page.records.length === 0) return { ok: true, records };
      afterSequence = page.nextSequence;
    }
  } catch { return { ok: false, code: "storage_unavailable" }; }
}

/** Retain the original reference before resolving its exact source hash. A
 * derived full envelope becomes available at this resolution, never retroactively
 * at the first reference clock. Self-reported metadata must also have existed by
 * that FIRST reference observation, even when resolution is much later. */
export function captureMetadataReference(raw: unknown, options: { readonly store: ConsultCaptureStore; readonly observedAtMs: number; readonly arm: "A" | "B" }): MetadataReferenceResult {
  if (!clock(options?.observedAtMs)) return { ok: false, code: "observation_invalid" };
  const ref = decisionMetadataReference(raw);
  if (!ref || options.arm !== "A" && options.arm !== "B" || (ref.metadata as CapturedObject).arm !== options.arm) return { ok: false, code: "reference_invalid" };
  if (!options.store.lookup) return { ok: false, code: "lookup_unavailable" };
  const ids = DECISION_REFERENCE_JOURNALS[options.arm], cycleId = ref.cycleId as string, m = ref.metadata as CapturedObject;
  try {
    if ((ref.atMs as number) > options.observedAtMs) return { ok: false, code: "observation_invalid" };
    const saved = options.store.capture(ids.referenceSourceId, ref, options.observedAtMs);
    if (!saved.ok) return { ok: false, code: "storage_failure" };
    const local = { referenceSequence: saved.record.sequence, referenceFirstObservedAtMs: saved.record.firstObservedAtMs, referenceConflict: saved.record.cycleConflict };
    if (local.referenceFirstObservedAtMs > options.observedAtMs) return { ok: false, code: "observation_invalid" };
    const inspect = () => {
      let conflicting = local.referenceConflict;
      for (const id of [ids.referenceSourceId, ids.sourceId, ids.metadataSourceId]) {
        const rows = readDecisionCycle(options.store, id, cycleId);
        if (!rows.ok) return { ok: false as const, code: "storage_failure" as const };
        if (rows.records.some(r => r.firstObservedAtMs > options.observedAtMs)) return { ok: false as const, code: "observation_invalid" as const };
        if (rows.records.length > 1 || rows.records.some(r => r.cycleConflict)) conflicting = true;
      }
      return { ok: true as const, conflicting };
    };
    const checked = inspect();
    if (!checked.ok) return checked;
    if (checked.conflicting) return { ok: true, status: "quarantined", evidence: null, local };
    if (!metadataReferenceAvailable(ref, local.referenceFirstObservedAtMs)) return { ok: true, status: "metadata_rejected", evidence: null, local };
    const found = options.store.lookup(ids.sourceId, cycleId, m.sourceRecordHash as string);
    if (!found.ok) return { ok: false, code: "storage_failure" };
    if (!found.record) return { ok: true, status: "awaiting_source", evidence: null, local };
    if (found.record.firstObservedAtMs > options.observedAtMs) return { ok: false, code: "observation_invalid" };
    if (found.record.cycleConflict || found.record.cycleStartedAtMs !== ref.atMs || found.record.cycleId !== cycleId) return { ok: true, status: "quarantined", evidence: null, local };
    const evidence = captureDecisionEvidence({ schemaVersion: 1, consultation: found.record.rawRecord, decisionMetadata: m }, { store: options.store, observedAtMs: options.observedAtMs, sourceId: ids.sourceId, metadataSourceId: ids.metadataSourceId });
    if (!evidence.ok) return { ok: false, code: evidence.code === "observation_invalid" ? "observation_invalid" : evidence.code === "storage_failure" ? "storage_failure" : "reference_invalid" };
    const final = inspect();
    if (!final.ok) return final;
    if (final.conflicting) return { ok: true, status: "quarantined", evidence: null, local };
    return { ok: true, status: evidence.status, evidence, local };
  } catch { return { ok: false, code: "storage_failure" }; }
}
