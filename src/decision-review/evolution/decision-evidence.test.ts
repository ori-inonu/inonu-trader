import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { createConsultCaptureStore, type ConsultCaptureStore } from "./capture-store";
import { sourceConsultDigest } from "./agent-episode";
import { buildExperienceMemory } from "./memory";
import { captureDecisionEvidence } from "./decision-evidence";

const asset = "token:501:So11111111111111111111111111111111111111112";
const buy = `buy:${asset}`, hold = `hold:${asset}@agente`;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
// Synthetic fixture, never a source of market performance or wallet authority.
function envelope() {
  const fullBrief = { v: 1, carteira: {}, chaves: {}, posicoes: {}, compras: {}, contexto: {}, historico: {}, mandato: null };
  const consultation = { cycleId: "synthetic-evidence", atMs: 1000, mode: "limitado", posture: "ofensiva", briefBytes: 10,
    briefVersion: 1, briefHash: sha(fullBrief).slice(0, 16), brief: { carteira: {}, chaves: {}, posicoes: {}, compras: {}, mandato: null }, contexto: {}, historico: {},
    candidates: [
      { id: buy, kind: "buy", stances: ["skip", "buy_full"], marks: [] },
      { id: hold, kind: "holding", stances: ["hold", "exit_all"], marks: [] },
    ], criteria: "synthetic-v1", notes: [], valid: true, invalidReason: null,
    requested: { [buy]: "buy_full", [hold]: "hold" }, stances: { [buy]: "buy_full", [hold]: "hold" },
  };
  return { schemaVersion: 1, consultation, decisionMetadata: { schemaVersion: 1,
    sourceRecordHash: sourceConsultDigest(consultation)!, snapshotHash: sha(fullBrief), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64),
    askedAtMs: 1200, answeredAtMs: 1400, recordedAtMs: 1450, factAvailableAtMs: 1100, arm: "A" } };
}
function setup() {
  const db = new Database(":memory:");
  const value = createConsultCaptureStore(db);
  if (!value.ok) throw new Error(value.code);
  return { db, store: value.store };
}

test("producer envelope durably binds distinct same-asset decision items with pending outcomes", () => {
  const { store } = setup();
  const value = captureDecisionEvidence(envelope(), { store, observedAtMs: 2000 });
  expect(value).toMatchObject({ ok: true, status: "bound", local: { sourceSequence:1,metadataSequence:2,sourceFirstObservedAtMs: 2000, metadataFirstObservedAtMs: 2000, sourceConflict: false, metadataConflict: false } });
  if (!value.ok) throw new Error(value.code);
  expect(value.capture?.qualification).toMatchObject({ status: "prospective_bound", sourceAuthenticated: false });
  expect(value.experiences).toHaveLength(2);
  expect(value.experiences.map(e => e.schemaVersion === 2 ? e.itemScope.sourceItemId : null)).toEqual([buy, hold]);
  expect(value.experiences.every(e => e.outcome === null && e.decidedAtMs === 1400 && e.recordedAtMs === 2000)).toBe(true);
  const saved = store.list("agent_decision_evidence", { afterSequence: 0, limit: 10 });
  expect(saved).toMatchObject({ ok: true, records: [{ cycleStartedAtMs: 1000, firstObservedAtMs: 2000 }] });
});

test("late metadata and rereads retain separate first availability without future leakage", () => {
  const { store } = setup(), raw = envelope();
  store.capture("agent_briefs", raw.consultation, 2000);
  const first = captureDecisionEvidence(raw, { store, observedAtMs: 3000 });
  const again = captureDecisionEvidence(raw, { store, observedAtMs: 9000 });
  expect(again).toEqual(first);
  if (!first.ok) throw new Error(first.code);
  expect(first.local).toMatchObject({ sourceFirstObservedAtMs: 2000, metadataFirstObservedAtMs: 3000 });
  expect(first.experiences[0]?.recordedAtMs).toBe(3000);
  const query = { cycleId: "next", candidateId: asset, snapshotHash: "a".repeat(64), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64), decidedAtMs: 2999,
    context: { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] }, maxExperiences: 5 };
  expect(buildExperienceMemory(first.experiences, query)).toMatchObject({ ok: true, value: { experiences: [] } });
});

test("source conflict quarantines all variants, including later reread of the original", () => {
  const { store } = setup(), raw = envelope();
  expect(captureDecisionEvidence(raw, { store, observedAtMs: 2000 }).ok).toBe(true);
  store.capture("agent_briefs", { ...raw.consultation, notes: ["different source revision"] }, 3000);
  for (const at of [4000, 8000]) {
    expect(captureDecisionEvidence(raw, { store, observedAtMs: at })).toMatchObject({ ok: true, status: "quarantined", capture: null, experiences: [], local: { sourceConflict: true } });
  }
});

test("different metadata for the same cycle quarantines every envelope instead of choosing the last", () => {
  const { store } = setup(), raw = envelope();
  captureDecisionEvidence(raw, { store, observedAtMs: 2000 });
  const changed = structuredClone(raw); changed.decisionMetadata.decisionVersion = "c".repeat(64);
  expect(captureDecisionEvidence(changed, { store, observedAtMs: 3000 })).toMatchObject({ ok: true, status: "quarantined", capture: null, experiences: [], local: { metadataConflict: true } });
  expect(captureDecisionEvidence(raw, { store, observedAtMs: 9000 })).toMatchObject({ ok: true, status: "quarantined", capture: null, experiences: [] });
});

test("wrong hash, future fact and invalid metadata remain captured diagnostics without experiences", () => {
  for (const change of [{ sourceRecordHash: "d".repeat(64) }, { factAvailableAtMs: 1201 }, { evaluatorHash: "unknown" }, { recordedAtMs: 2001 }]) {
    const { store } = setup(), raw = envelope();
    Object.assign(raw.decisionMetadata, change);
    const value = captureDecisionEvidence(raw, { store, observedAtMs: 2000 });
    expect(value).toMatchObject({ ok: true, status: "metadata_rejected", experiences: [], capture: { decisionAtMs: null, qualification: { status: "metadata_rejected" } } });
    expect(store.list("agent_decision_evidence", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [{}] });
  }
});

test("metadata write failure leaves only raw capture and retry cannot backdate availability", () => {
  const { db, store } = setup(), raw = envelope();
  db.exec("CREATE TRIGGER fail_metadata BEFORE INSERT ON evolution_consult_captures WHEN NEW.source_id='agent_decision_evidence' BEGIN SELECT RAISE(ABORT, 'private detail'); END");
  expect(captureDecisionEvidence(raw, { store, observedAtMs: 2000 })).toEqual({ ok: false, code: "storage_failure", stage: "metadata", sourceCaptureConfirmed: true });
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [{ firstObservedAtMs: 2000 }] });
  db.exec("DROP TRIGGER fail_metadata");
  expect(captureDecisionEvidence(raw, { store, observedAtMs: 4000 })).toMatchObject({ ok: true, status: "bound", local: { sourceFirstObservedAtMs: 2000, metadataFirstObservedAtMs: 4000 }, experiences: [{ recordedAtMs: 4000 }, { recordedAtMs: 4000 }] });
});

test("source write failure never publishes metadata or a qualified packet", () => {
  const { db, store } = setup();
  db.exec("CREATE TRIGGER fail_source BEFORE INSERT ON evolution_consult_captures BEGIN SELECT RAISE(ABORT, 'private detail'); END");
  expect(captureDecisionEvidence(envelope(), { store, observedAtMs: 2000 })).toEqual({ ok: false, code: "storage_failure", stage: "source", sourceCaptureConfirmed: false });
  expect(store.list("agent_decision_evidence", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [] });
});

test("getter/non-JSON envelopes and malformed consultations are rejected before any persistence", () => {
  const { store } = setup(); let reads = 0;
  const getter = { get schemaVersion() { reads++; throw new Error("must not execute"); } };
  for (const raw of [getter, { ...envelope(), extra: true }, { ...envelope(), schemaVersion: 2 }, { ...envelope(), decisionMetadata: undefined }, { ...envelope(), consultation: {} }]) {
    expect(captureDecisionEvidence(raw, { store, observedAtMs: 2000 }).ok).toBe(false);
  }
  expect(reads).toBe(0);
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [] });
});

test("backward observation clocks never release data that had not yet become locally available", () => {
  const { store } = setup(), raw = envelope();
  captureDecisionEvidence(raw, { store, observedAtMs: 4000 });
  expect(captureDecisionEvidence(raw, { store, observedAtMs: 3000 })).toMatchObject({ ok: false, code: "observation_invalid" });
});

test("recheck catches a conflicting source inserted between raw and metadata writes", () => {
  const { store } = setup(), raw = envelope(); let written = false;
  const racing: ConsultCaptureStore = { list: store.list, capture(id, payload, at) {
    const result = store.capture(id, payload, at);
    if (id === "agent_decision_evidence" && !written) {
      written = true;
      store.capture("agent_briefs", { ...raw.consultation, notes: ["racing revision"] }, at);
    }
    return result;
  } };
  expect(captureDecisionEvidence(raw, { store: racing, observedAtMs: 2000 })).toMatchObject({ ok: true, status: "quarantined", capture: null, experiences: [] });
});

test("separate configured journals do not combine an A cycle and B shadow cycle", () => {
  const { store } = setup(), a = envelope(), b = envelope();
  b.consultation.mode = "sombra"; b.decisionMetadata.arm = "B";
  b.decisionMetadata.sourceRecordHash = sourceConsultDigest(b.consultation)!;
  expect(captureDecisionEvidence(a, { store, observedAtMs: 2000 })).toMatchObject({ ok: true, status: "bound" });
  expect(captureDecisionEvidence(b, { store, observedAtMs: 2000, sourceId: "shadow_briefs", metadataSourceId: "shadow_decision_evidence" })).toMatchObject({ ok: true, status: "bound", experiences: [{ arm: "B" }, { arm: "B" }] });
  expect(captureDecisionEvidence(a, { store, observedAtMs: 5000 })).toMatchObject({ ok: true, status: "bound" });
});

test("persisted capture corruption fails closed before another metadata observation", () => {
  const { db, store } = setup(), raw = envelope();
  captureDecisionEvidence(raw, { store, observedAtMs: 2000 });
  db.exec("UPDATE evolution_consult_captures SET first_observed_ms=1001 WHERE source_id='agent_briefs'");
  expect(captureDecisionEvidence(raw, { store, observedAtMs: 9000 })).toEqual({ ok: false, code: "storage_failure", stage: "source", sourceCaptureConfirmed: false });
});

test("metadata conflict arriving during pair recheck releases no capture", () => {
  const { store } = setup(), raw = envelope(); let written = false;
  const racing: ConsultCaptureStore = { list: store.list, capture(id, payload, at) {
    const result = store.capture(id, payload, at);
    if (id === "agent_decision_evidence" && !written) {
      written = true;
      const changed = structuredClone(raw); changed.decisionMetadata.evaluatorHash = "e".repeat(64);
      store.capture(id, { cycleId: raw.consultation.cycleId, atMs: raw.consultation.atMs, envelope: changed }, at);
    }
    return result;
  } };
  expect(captureDecisionEvidence(raw, { store: racing, observedAtMs: 2000 })).toMatchObject({ ok: true, status: "quarantined", capture: null, experiences: [], local: { metadataConflict: true } });
});

test("bad observation clocks and overlapping journal identities are rejected without persistence", () => {
  const { store } = setup();
  for (const observedAtMs of [NaN, -1, Infinity, 999, 2000.5]) {
    expect(captureDecisionEvidence(envelope(), { store, observedAtMs })).toMatchObject({ ok: false, code: "observation_invalid" });
  }
  for (const ids of [{ sourceId: "same", metadataSourceId: "same" }, { sourceId: "../escape" }, { metadataSourceId: "Bad Name" }]) {
    expect(captureDecisionEvidence(envelope(), { store, observedAtMs: 2000, ...ids })).toEqual({ ok: false, code: "envelope_invalid" });
  }
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [] });
});

test("a thrown storage exception exposes no private detail or qualified packet", () => {
  const { store } = setup();
  const throwing: ConsultCaptureStore = { list: store.list, capture() { throw new Error("private SQLite path or value"); } };
  expect(captureDecisionEvidence(envelope(), { store: throwing, observedAtMs: 2000 })).toEqual({ ok: false, code: "storage_failure", stage: "source", sourceCaptureConfirmed: false });
});

test("producer envelope is detached without invoking an original Proxy toJSON", () => {
  const { store } = setup(); let calls = 0;
  const raw = new Proxy(envelope(), { get(target, property, receiver) {
    if (property === "toJSON") { calls++; return () => { throw new Error("untrusted execution"); }; }
    return Reflect.get(target, property, receiver);
  } });
  expect(captureDecisionEvidence(raw, { store, observedAtMs: 2000 })).toMatchObject({ ok: true, status: "bound", experiences: [{ outcome: null }, { outcome: null }] });
  expect(calls).toBe(0);
});
