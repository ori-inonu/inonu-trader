import { captureSourceObject, sourceConsultDigest, type CapturedAgentConsult, type CapturedObject } from "./agent-episode";
import type { ConsultCaptureStore } from "./capture-store";
import { captureDecisionEvidence, type DecisionEvidenceResult } from "./decision-evidence";
import { readJournalTail, type JournalReadFailure, type JournalReadOptions, type JournalTailSource } from "./journal-reader";
import type { ExperienceEpisode } from "./memory";
import { captureMetadataReference, decisionMetadataReference, metadataReferenceAvailable, DECISION_REFERENCE_JOURNALS, readDecisionCycle, type MetadataReferenceResult } from "./metadata-reference";

const DECISION_JOURNALS = Object.freeze({
  A: Object.freeze({ sourceId: "agent_briefs", metadataSourceId: "agent_decision_evidence" }),
  B: Object.freeze({ sourceId: "shadow_briefs", metadataSourceId: "shadow_decision_evidence" }),
} as const);
export interface DecisionJournalOptions extends JournalReadOptions { readonly store: ConsultCaptureStore; readonly arm: "A" | "B" }
export interface DecisionJournalReport {
  readonly schemaVersion: 1;
  readonly evidence: "local_prospective_decision_journal";
  readonly observedAtMs: number;
  readonly arm: "A" | "B";
  readonly journals: { readonly sourceId: string; readonly metadataSourceId: string };
  readonly source: JournalTailSource;
  readonly nonblankLines: number;
  readonly validEnvelopeLines: number;
  readonly invalidJsonLines: number;
  readonly invalidEnvelopes: number;
  readonly armMismatchLines: number;
  readonly uniqueEnvelopes: number;
  readonly duplicateEnvelopeLines: number;
  readonly referenceSourceId: string;
  readonly validReferenceLines: number;
  readonly invalidReferences: number;
  readonly uniqueReferences: number;
  readonly duplicateReferenceLines: number;
  readonly awaitingSourceReferences: number;
  readonly boundReferences: number;
  readonly metadataRejectedReferences: number;
  readonly quarantinedReferences: number;
  readonly boundEnvelopes: number;
  readonly metadataRejectedEnvelopes: number;
  readonly quarantinedEnvelopes: number;
  readonly conflictingCycleIds: readonly string[];
  readonly unavailableExperienceItems: number;
  readonly pendingExperienceCount: number;
  readonly pendingExperiences: readonly ExperienceEpisode[];
  readonly latest: CapturedAgentConsult | null;
  readonly sourceAuthenticated: false;
  readonly financialExecutor: false;
  readonly qualifiedABActive: false;
  readonly matureOutcomes: 0;
}
export type DecisionJournalFailure = { readonly ok: false; readonly code: JournalReadFailure["code"] | "capture_store_failed" | "observation_invalid"; readonly processedBeforeFailure: number };
export type DecisionJournalResult = { readonly ok: true; readonly report: DecisionJournalReport } | DecisionJournalFailure;
const fail = (code: DecisionJournalFailure["code"], processedBeforeFailure = 0): DecisionJournalFailure => ({ ok: false, code, processedBeforeFailure });
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
type Packet = Extract<DecisionEvidenceResult, { ok: true }>;

/** Observe explicit producer envelopes or exact references to captured sources. A missing journal is an absence,
 * never a synthetic upgrade of legacy records. Persistence goes exclusively
 * through the host-supplied dedicated store. The returned snapshot is not an
 * irrevocable publication: a later observation must check conflicts again. */
export async function observeDecisionJournal(options: DecisionJournalOptions): Promise<DecisionJournalResult> {
  if (options?.arm !== "A" && options?.arm !== "B") return fail("request_invalid");
  const tail = await readJournalTail(options);
  if (!tail.ok) return fail(tail.code);
  const { observedAtMs } = tail, journals = DECISION_JOURNALS[options.arm], { referenceSourceId } = DECISION_REFERENCE_JOURNALS[options.arm];
  let nonblankLines = 0, validEnvelopeLines = 0, invalidJsonLines = 0, invalidEnvelopes = 0, armMismatchLines = 0, processed = 0;
  let validReferenceLines = 0, invalidReferences = 0;
  const unique = new Map<string, CapturedObject>(), references = new Map<string, CapturedObject>();
  const receive = (envelope: CapturedObject) => captureDecisionEvidence(envelope, { store: options.store, observedAtMs, ...journals });
  const receiveReference = (ref: CapturedObject) => captureMetadataReference(ref, { store: options.store, observedAtMs, arm: options.arm });
  for (const line of tail.lines) {
    if (!line.trim()) continue;
    nonblankLines++;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { invalidJsonLines++; continue; }
    const envelope = captureSourceObject(parsed);
    if (envelope && Object.hasOwn(envelope, "metadata")) {
      const ref = decisionMetadataReference(envelope);
      if (!ref) { invalidReferences++; continue; }
      if ((ref.metadata as CapturedObject).arm !== options.arm) { armMismatchLines++; continue; }
      const received = receiveReference(ref);
      if (!received.ok) {
        if (received.code === "observation_invalid") return fail("observation_invalid", processed);
        if (received.code === "storage_failure" || received.code === "lookup_unavailable") return fail("capture_store_failed", processed);
        invalidReferences++; continue;
      }
      processed++; validReferenceLines++;
      references.set(sourceConsultDigest(ref)!, ref);
      continue;
    }
    if (envelope === null || envelope.schemaVersion !== 1 || Object.keys(envelope).length !== 3 || !Object.hasOwn(envelope, "consultation") || !Object.hasOwn(envelope, "decisionMetadata")) { invalidEnvelopes++; continue; }
    const metadata = envelope.decisionMetadata;
    if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata) || !("arm" in metadata)) { invalidEnvelopes++; continue; }
    if (metadata.arm !== options.arm) {
      if (metadata.arm === "A" || metadata.arm === "B") armMismatchLines++; else invalidEnvelopes++;
      continue;
    }
    const result = receive(envelope);
    if (!result.ok) {
      if (result.code === "storage_failure") return fail("capture_store_failed", processed);
      if (result.code === "observation_invalid") return fail("observation_invalid", processed);
      invalidEnvelopes++; continue;
    }
    processed++; validEnvelopeLines++;
    unique.set(sourceConsultDigest(envelope)!, envelope);
  }
  // Process ALL lines first. Earlier packets cannot escape before a later
  // variant in this same tail has had the chance to quarantine its cycle.
  const packets: Packet[] = [];
  const envelopes = [...unique.values()];
  const refPackets: Extract<MetadataReferenceResult, { ok: true }>[] = [], refs = [...references.values()];
  const cycles = new Set<string>();
  const conflicts = new Set<string>(), rejectedCycles = new Set<string>();
  for (const envelope of envelopes) {
    const result = receive(envelope);
    if (!result.ok) return fail(result.code === "observation_invalid" ? "observation_invalid" : "capture_store_failed", processed);
    const consultation = envelope.consultation as CapturedObject;
    const cycleId = consultation.cycleId as string;
    cycles.add(cycleId);
    if (result.status === "quarantined") conflicts.add(cycleId);
    packets.push(result);
  }
  for (const ref of refs) {
    const result = receiveReference(ref);
    if (!result.ok) return fail(result.code === "observation_invalid" ? "observation_invalid" : "capture_store_failed", processed);
    cycles.add(ref.cycleId as string);
    if (result.status === "quarantined") conflicts.add(ref.cycleId as string);
    refPackets.push(result);
  }
  // References may already have left this bounded tail. Inspect their original
  // first clocks for every current cycle, including full-envelope-only cycles.
  // Joining them can reveal a conflict with a full envelope written later.
  const historicalPackets: Packet[] = [];
  for (const cycleId of cycles) {
    const rows = readDecisionCycle(options.store, referenceSourceId, cycleId);
    if (!rows.ok) return fail("capture_store_failed", processed);
    if (rows.records.some(r => r.firstObservedAtMs > observedAtMs)) return fail("observation_invalid", processed);
    if (rows.records.length > 1 || rows.records.some(r => r.cycleConflict)) conflicts.add(cycleId);
    for (const row of rows.records) {
      const ref = decisionMetadataReference(row.rawRecord);
      if (!ref || (ref.metadata as CapturedObject).arm !== options.arm) { conflicts.add(cycleId); continue; }
      // A single old reference can disagree with a current full envelope even
      // when its exact source hash is absent. Absence must not hide disagreement.
      for (const full of envelopes) if ((full.consultation as CapturedObject).cycleId === cycleId &&
        ((full.consultation as CapturedObject).atMs !== ref.atMs || sourceConsultDigest(full.decisionMetadata) !== sourceConsultDigest(ref.metadata))) conflicts.add(cycleId);
      const result = receiveReference(ref);
      if (!result.ok) return fail(result.code === "observation_invalid" ? "observation_invalid" : "capture_store_failed", processed);
      if (result.status === "quarantined") conflicts.add(cycleId);
      if (result.status === "metadata_rejected") rejectedCycles.add(cycleId);
      if (result.evidence) historicalPackets.push(result.evidence);
    }
  }
  // Check current store conflicts AFTER every pair has been rechecked. This
  // catches previously stored variants outside the bounded file, and variants
  // discovered by another pair's late write during the recheck pass.
  const allPackets = [...packets, ...refPackets.flatMap(p => p.evidence ? [p.evidence] : []), ...historicalPackets];
  const scanBounds = allPackets.length === 0 ? [] : [
    { id: journals.sourceId, firstSequence: Math.min(...allPackets.map(p => p.local.sourceSequence)) },
    { id: journals.metadataSourceId, firstSequence: Math.min(...allPackets.map(p => p.local.metadataSequence)) },
  ];
  for (const { id, firstSequence } of scanBounds) {
    if (!clock(firstSequence) || firstSequence < 1) return fail("capture_store_failed", processed);
    // Older variants of a relevant cycle were already validated and flagged by
    // captureDecisionEvidence. Scan its oldest relevant row plus later rows,
    // rather than repeatedly decoding months of unrelated captured history.
    let afterSequence = firstSequence - 1;
    for (;;) {
      let listed;
      try { listed = options.store.list(id, { afterSequence, limit: 1000 }); }
      catch { return fail("capture_store_failed", processed); }
      if (!listed.ok || !clock(listed.nextSequence) || listed.nextSequence < afterSequence || listed.records.length > 0 && listed.nextSequence <= afterSequence) return fail("capture_store_failed", processed);
      for (const r of listed.records) {
        if (!cycles.has(r.cycleId)) continue;
        if (r.firstObservedAtMs > observedAtMs) return fail("observation_invalid", processed);
        if (r.cycleConflict) conflicts.add(r.cycleId);
      }
      if (listed.records.length === 0) break;
      afterSequence = listed.nextSequence;
    }
  }
  // A later join of a DIFFERENT cycle can reveal a new reference variant for
  // one already inspected above. This last pass is read-only and includes
  // cycles that had no reference at all during their earlier inspection.
  for (const cycleId of cycles) {
    const rows = readDecisionCycle(options.store, referenceSourceId, cycleId);
    if (!rows.ok) return fail("capture_store_failed", processed);
    if (rows.records.some(r => r.firstObservedAtMs > observedAtMs)) return fail("observation_invalid", processed);
    if (rows.records.length > 1 || rows.records.some(r => r.cycleConflict)) conflicts.add(cycleId);
    for (const row of rows.records) {
      const ref = decisionMetadataReference(row.rawRecord);
      if (!ref || (ref.metadata as CapturedObject).arm !== options.arm) { conflicts.add(cycleId); continue; }
      if (!metadataReferenceAvailable(ref, row.firstObservedAtMs)) rejectedCycles.add(cycleId);
      for (const full of envelopes) if ((full.consultation as CapturedObject).cycleId === cycleId &&
        ((full.consultation as CapturedObject).atMs !== ref.atMs || sourceConsultDigest(full.decisionMetadata) !== sourceConsultDigest(ref.metadata))) conflicts.add(cycleId);
    }
  }
  let boundEnvelopes = 0, metadataRejectedEnvelopes = 0, quarantinedEnvelopes = 0, unavailableExperienceItems = 0;
  let awaitingSourceReferences = 0, boundReferences = 0, metadataRejectedReferences = 0, quarantinedReferences = 0;
  const pending = new Map<string, ExperienceEpisode>(), captures: CapturedAgentConsult[] = [];
  const captureHashes = new Set<string>();
  const collect = (packet: Packet) => {
    if (packet.capture === null) return false;
    if (!captureHashes.has(packet.capture.captureHash)) {
      captureHashes.add(packet.capture.captureHash); captures.push(packet.capture);
      unavailableExperienceItems += packet.capture.episodes.filter(e => e.experience === null).length;
    }
    for (const experience of packet.experiences) pending.set(JSON.stringify(experience), experience);
    return true;
  };
  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i]!, envelope = envelopes[i]!, cycleId = (envelope.consultation as CapturedObject).cycleId as string;
    if (packet.status === "quarantined" || conflicts.has(cycleId)) { quarantinedEnvelopes++; continue; }
    if (packet.status === "metadata_rejected" || rejectedCycles.has(cycleId)) { metadataRejectedEnvelopes++; continue; }
    if (!collect(packet)) return fail("capture_store_failed", processed);
    boundEnvelopes++;
  }
  for (let i = 0; i < refPackets.length; i++) {
    const packet = refPackets[i]!, cycleId = refs[i]!.cycleId as string;
    if (packet.status === "quarantined" || conflicts.has(cycleId)) { quarantinedReferences++; continue; }
    if (packet.status === "metadata_rejected" || rejectedCycles.has(cycleId)) { metadataRejectedReferences++; continue; }
    if (packet.status === "awaiting_source") { awaitingSourceReferences++; continue; }
    if (!packet.evidence || !collect(packet.evidence)) return fail("capture_store_failed", processed);
    boundReferences++;
  }
  captures.sort((a, b) => a.decisionAtMs! - b.decisionAtMs! || a.cycleId.localeCompare(b.cycleId));
  const pendingExperiences = [...pending.values()].sort((a, b) => a.decidedAtMs - b.decidedAtMs || a.cycleId.localeCompare(b.cycleId) || (a.schemaVersion === 2 ? a.itemScope.sourceItemId : a.candidateId).localeCompare(b.schemaVersion === 2 ? b.itemScope.sourceItemId : b.candidateId));
  return { ok: true, report: { schemaVersion: 1, evidence: "local_prospective_decision_journal", observedAtMs, arm: options.arm, journals, source: tail.source,
    nonblankLines, validEnvelopeLines, invalidJsonLines, invalidEnvelopes, armMismatchLines, uniqueEnvelopes: unique.size, duplicateEnvelopeLines: validEnvelopeLines - unique.size,
    referenceSourceId, validReferenceLines, invalidReferences, uniqueReferences: references.size, duplicateReferenceLines: validReferenceLines - references.size,
    awaitingSourceReferences, boundReferences, metadataRejectedReferences, quarantinedReferences,
    boundEnvelopes, metadataRejectedEnvelopes, quarantinedEnvelopes, conflictingCycleIds: [...conflicts].sort(), unavailableExperienceItems, pendingExperienceCount: pendingExperiences.length,
    pendingExperiences, latest: captures.at(-1) ?? null, sourceAuthenticated: false, financialExecutor: false, qualifiedABActive: false, matureOutcomes: 0 } };
}
