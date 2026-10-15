import type { ConsultCaptureStore } from "./capture-store";
import { captureAgentConsult, captureSourceObject, type CapturedAgentConsult, type ProducerDecisionMetadata } from "./agent-episode";
import type { ExperienceEpisode } from "./memory";

export interface DecisionEvidenceOptions {
  readonly store: ConsultCaptureStore;
  readonly observedAtMs: number;
  /** One immutable journal per source; use separate names for A and B. */
  readonly sourceId?: string;
  readonly metadataSourceId?: string;
}
export type DecisionEvidenceResult = {
  readonly ok: true;
  readonly status: "bound" | "metadata_rejected" | "quarantined";
  readonly capture: CapturedAgentConsult | null;
  readonly experiences: readonly ExperienceEpisode[];
  readonly local: {
    readonly sourceSequence: number;
    readonly metadataSequence: number;
    readonly sourceFirstObservedAtMs: number;
    readonly metadataFirstObservedAtMs: number;
    readonly sourceConflict: boolean;
    readonly metadataConflict: boolean;
  };
} | {
  readonly ok: false;
  readonly code: "envelope_invalid" | "source_invalid" | "observation_invalid" | "storage_failure";
  readonly stage?: "source" | "metadata" | "recheck";
  /** True means this call confirmed a source capture; false does not assert
   * that the database contains no earlier or damaged source row. */
  readonly sourceCaptureConfirmed?: boolean;
};

const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const sourceId = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(v);

/** Persist an ORIGINAL producer envelope, outside the financial home. The
 * source record is stored first, then its separately available metadata. A
 * partial write can only delay memory availability; a retry cannot backdate it.
 * Hash/clock consistency is not source authentication or a financial outcome.
 *
 * Conflict checks describe this observation, not an irrevocable publication:
 * consumers must check current store conflicts again before using older packets.
 * The caller must isolate A and B journals and supply their actual producer data.
 */
export function captureDecisionEvidence(raw: unknown, options: DecisionEvidenceOptions): DecisionEvidenceResult {
  if (!clock(options?.observedAtMs)) return { ok: false, code: "observation_invalid" };
  const rawId = options.sourceId ?? "agent_briefs";
  const metaId = options.metadataSourceId ?? "agent_decision_evidence";
  if (!sourceId(rawId) || !sourceId(metaId) || rawId === metaId) return { ok: false, code: "envelope_invalid" };
  // Use only the validated detached JSON clone. Serializing the original after
  // validation would invoke an external Proxy's toJSON property or function.
  const envelope = captureSourceObject(raw);
  if (envelope === null || envelope.schemaVersion !== 1 || Object.keys(envelope).length !== 3 || !Object.hasOwn(envelope, "consultation") || !Object.hasOwn(envelope, "decisionMetadata")) return { ok: false, code: "envelope_invalid" };
  const diagnostic = captureAgentConsult(envelope.consultation, { firstObservedAtMs: options.observedAtMs });
  if (!diagnostic.ok) return diagnostic;
  const record = diagnostic.capture;
  const persist = (id: string, value: unknown) => {
    try { return options.store.capture(id, value, options.observedAtMs); }
    catch { return { ok: false as const, code: "storage_unavailable" as const }; }
  };
  const first = persist(rawId, record.sourceRecord);
  if (!first.ok) return { ok: false, code: "storage_failure", stage: "source", sourceCaptureConfirmed: false };
  if (first.record.firstObservedAtMs > options.observedAtMs) return { ok: false, code: "observation_invalid" };
  // The wrapper atMs is the original cycle start, never a metadata write clock.
  const wrapper = { cycleId: record.cycleId, atMs: record.cycleStartedAtMs, envelope };
  const second = persist(metaId, wrapper);
  if (!second.ok) return { ok: false, code: "storage_failure", stage: "metadata", sourceCaptureConfirmed: true };
  // Re-read both after the two independent transactions, exposing any conflict
  // discovered while persisting the pair. A failure never releases experiences.
  const currentSource = persist(rawId, record.sourceRecord);
  const currentMetadata = persist(metaId, wrapper);
  if (!currentSource.ok || !currentMetadata.ok) return { ok: false, code: "storage_failure", stage: "recheck", sourceCaptureConfirmed: true };
  const s = currentSource.record, m = currentMetadata.record;
  if (s.firstObservedAtMs > options.observedAtMs || m.firstObservedAtMs > options.observedAtMs) return { ok: false, code: "observation_invalid" };
  const local = { sourceSequence: s.sequence, metadataSequence: m.sequence, sourceFirstObservedAtMs: s.firstObservedAtMs, metadataFirstObservedAtMs: m.firstObservedAtMs, sourceConflict: s.cycleConflict, metadataConflict: m.cycleConflict };
  if (s.cycleConflict || m.cycleConflict) return { ok: true, status: "quarantined", capture: null, experiences: [], local };
  const bound = captureAgentConsult(s.rawRecord, { firstObservedAtMs: s.firstObservedAtMs,
    // Adapter validates metadata semantics; malformed JSON remains diagnostic.
    prospective: { metadata: envelope.decisionMetadata as unknown as ProducerDecisionMetadata, firstObservedAtMs: m.firstObservedAtMs } });
  if (!bound.ok) return bound;
  const capture = bound.capture;
  return { ok: true, status: capture.qualification.status === "prospective_bound" ? "bound" : "metadata_rejected", capture,
    experiences: capture.episodes.flatMap(e => e.experience === null ? [] : [e.experience]), local };
}
