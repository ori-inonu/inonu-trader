import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsultCaptureStore, type ConsultCaptureStore } from "./capture-store";
import { sourceConsultDigest } from "./agent-episode";
import { observeDecisionJournal } from "./decision-journal";

const asset = "token:501:So11111111111111111111111111111111111111112";
const ids = [`buy:${asset}`, `hold:${asset}@agente`, `hold:${asset}@principal`];
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
// All source data in this file is synthetic. No outcomes or wallet authority.
function envelope(cycleId = "synthetic-journal", arm: "A" | "B" = "A") {
  const full = { v: 1, carteira: {}, chaves: {}, posicoes: {}, compras: {}, contexto: {}, historico: {}, mandato: null };
  const consultation = { cycleId, atMs: 1000, mode: arm === "A" ? "limitado" : "sombra", posture: "ofensiva", briefBytes: 10, briefVersion: 1, briefHash: sha(full).slice(0, 16), brief: { carteira: {}, chaves: {}, posicoes: {}, compras: {}, mandato: null }, contexto: {}, historico: {},
    candidates: ids.map((id, i) => ({ id, kind: i === 0 ? "buy" : "holding", stances: i === 0 ? ["skip", "buy_full"] : ["hold", "exit_all"], marks: [] })), criteria: "synthetic-v1", notes: [] as string[], valid: true, invalidReason: null,
    requested: Object.fromEntries(ids.map((id, i) => [id, i === 0 ? "buy_full" : "hold"])), stances: Object.fromEntries(ids.map((id, i) => [id, i === 0 ? "buy_full" : "hold"])) };
  return { schemaVersion: 1, consultation, decisionMetadata: { schemaVersion: 1, sourceRecordHash: sourceConsultDigest(consultation)!, snapshotHash: sha(full), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64), askedAtMs: 1200, answeredAtMs: 1400, recordedAtMs: 1450, factAvailableAtMs: 1100, arm } };
}
function setup() { const db = new Database(":memory:"), opened = createConsultCaptureStore(db); if (!opened.ok) throw new Error(opened.code); return { db, store: opened.store, sourcePath: join(mkdtempSync(join(tmpdir(), "synthetic-decision-journal-")), "decisions-meta.jsonl") }; }
const body = (...values: unknown[]) => values.map(v => JSON.stringify(v) + "\n").join("");

test("late producer metadata and repeated lines retain stable first availability and distinct pending roles", async () => {
  const { store, sourcePath } = setup(), raw = envelope(); store.capture("agent_briefs", raw.consultation, 2000); await Bun.write(sourcePath, body(raw, raw));
  const first = await observeDecisionJournal({ sourcePath, store, observedAtMs: 3000, arm: "A" });
  expect(first).toMatchObject({ ok: true, report: { validEnvelopeLines: 2, uniqueEnvelopes: 1, duplicateEnvelopeLines: 1, boundEnvelopes: 1, pendingExperienceCount: 3, sourceAuthenticated: false, financialExecutor: false, qualifiedABActive: false, matureOutcomes: 0, latest: { firstObservedAtMs: 2000, metadataFirstObservedAtMs: 3000 } } });
  if (!first.ok) throw new Error(first.code);
  expect(first.report.pendingExperiences.map(e => e.schemaVersion === 2 ? e.itemScope.sourceItemId : null)).toEqual(ids);
  expect(first.report.pendingExperiences.every(e => e.recordedAtMs === 3000 && e.outcome === null)).toBe(true);
  const again = await observeDecisionJournal({ sourcePath, store, observedAtMs: 9000, arm: "A" });
  if (!again.ok) throw new Error(again.code);
  expect(again.report.pendingExperiences).toEqual(first.report.pendingExperiences);
});

test("a later conflicting envelope suppresses every prior packet for that cycle", async () => {
  const { store, sourcePath } = setup(), a = envelope(), b = envelope(); b.decisionMetadata.decisionVersion = "c".repeat(64);
  await Bun.write(sourcePath, body(a, b));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: true, report: { uniqueEnvelopes: 2, quarantinedEnvelopes: 2, boundEnvelopes: 0, pendingExperiences: [], latest: null, conflictingCycleIds: [a.consultation.cycleId] } });
});

test("existing conflicts outside the bounded file remain quarantined", async () => {
  const { store, sourcePath } = setup(), raw = envelope(); store.capture("agent_briefs", raw.consultation, 2000); store.capture("agent_briefs", { ...raw.consultation, notes: ["synthetic_conflict"] }, 2100);
  await Bun.write(sourcePath, body(raw));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 3000, arm: "A" })).toMatchObject({ ok: true, report: { quarantinedEnvelopes: 1, pendingExperienceCount: 0, latest: null } });
});

test("bad hashes and impossible timing stay rejected diagnostics, never pending experiences", async () => {
  const { store, sourcePath } = setup(), hash = envelope("bad-hash"), time = envelope("bad-clock"); hash.decisionMetadata.sourceRecordHash = "d".repeat(64); time.decisionMetadata.factAvailableAtMs = 1201;
  await Bun.write(sourcePath, body(hash, time));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: true, report: { metadataRejectedEnvelopes: 2, pendingExperiences: [], latest: null } });
});

test("malformed JSON, non-envelope data, arm mismatch and partial lines are explicitly counted", async () => {
  const { store, sourcePath } = setup(); await Bun.write(sourcePath, '{bad}\n{}\n' + body(envelope("wrong-arm", "B"), envelope("valid")) + '{"partial":');
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: true, report: { invalidJsonLines: 1, invalidEnvelopes: 1, armMismatchLines: 1, boundEnvelopes: 1, source: { incompleteFinalLine: true } } });
  expect(store.list("shadow_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [] });
});

test("A and B use explicit independent namespaces and never reinterpret the envelope arm", async () => {
  const { store, sourcePath } = setup(); await Bun.write(sourcePath, body(envelope("same", "A")));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: true, report: { journals: { sourceId: "agent_briefs", metadataSourceId: "agent_decision_evidence" }, boundEnvelopes: 1 } });
  await Bun.write(sourcePath, body(envelope("same", "B")));
  const b = await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "B" });
  expect(b).toMatchObject({ ok: true, report: { journals: { sourceId: "shadow_briefs", metadataSourceId: "shadow_decision_evidence" }, boundEnvelopes: 1 } });
  if (!b.ok) throw new Error(b.code);
  expect(b.report.pendingExperiences.every(e => e.arm === "B" && e.outcome === null)).toBe(true);
});

test("storage failures and regressive observation clocks release no report or experiences", async () => {
  const { store, sourcePath } = setup(); await Bun.write(sourcePath, body(envelope()));
  const broken: ConsultCaptureStore = { list: store.list, capture() { throw new Error("private fixture path"); } };
  expect(await observeDecisionJournal({ sourcePath, store: broken, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: false, code: "capture_store_failed" });
  await observeDecisionJournal({ sourcePath, store, observedAtMs: 4000, arm: "A" });
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 3000, arm: "A" })).toMatchObject({ ok: false, code: "observation_invalid" });
});

test("a missing journal is a visible absence, and an exact tail boundary retains its envelope", async () => {
  const { store, sourcePath } = setup();
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: false, code: "source_missing" });
  const last = body(envelope("last")); await Bun.write(sourcePath, body(envelope("old")) + last);
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "A", maxBytes: new TextEncoder().encode(last).length })).toMatchObject({ ok: true, report: { uniqueEnvelopes: 1, source: { truncated: true }, latest: { cycleId: "last" } } });
});

test("a conflict discovered during another pair's final recheck suppresses older packets", async () => {
  const { store, sourcePath } = setup(), first = envelope("first"), second = envelope("second");
  await Bun.write(sourcePath, body(first, second)); let secondWrites = 0;
  const racing: ConsultCaptureStore = { list: store.list, capture(id, raw, at) {
    const result = store.capture(id, raw, at);
    if (id === "agent_decision_evidence" && (raw as { cycleId?: string }).cycleId === "second" && ++secondWrites === 3) {
      store.capture("agent_briefs", { ...first.consultation, notes: ["late_synthetic_conflict"] }, at);
    }
    return result;
  } };
  const result = await observeDecisionJournal({ sourcePath, store: racing, observedAtMs: 2000, arm: "A" });
  expect(result).toMatchObject({ ok: true, report: { quarantinedEnvelopes: 1, boundEnvelopes: 1, conflictingCycleIds: ["first"], latest: { cycleId: "second" } } });
  if (!result.ok) throw new Error(result.code);
  expect(result.report.pendingExperiences.every(e => e.cycleId === "second")).toBe(true);
});

test("a failure or regressive record during the final store scan releases no snapshot", async () => {
  const { store, sourcePath } = setup(); await Bun.write(sourcePath, body(envelope()));
  const failedList: ConsultCaptureStore = { capture: store.capture, list() { throw new Error("private store path"); } };
  expect(await observeDecisionJournal({ sourcePath, store: failedList, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: false, code: "capture_store_failed" });
  const future: ConsultCaptureStore = { capture: store.capture, list(id, page) {
    const listed = store.list(id, page); if (!listed.ok) return listed;
    return { ...listed, records: listed.records.map(r => ({ ...r, firstObservedAtMs: 9000 })) };
  } };
  expect(await observeDecisionJournal({ sourcePath, store: future, observedAtMs: 3000, arm: "A" })).toMatchObject({ ok: false, code: "observation_invalid" });
});

test("final conflict scans start at the oldest relevant capture instead of unrelated history", async () => {
  const { store, sourcePath } = setup();
  for (let i = 0; i < 20; i++) store.capture("agent_briefs", envelope(`old-${i}`).consultation, 2000);
  await Bun.write(sourcePath, body(envelope("current")));
  const reads: { id: string; after: number }[] = [];
  const monitored: ConsultCaptureStore = { capture: store.capture, readCycle: store.readCycle, list(id, page) { reads.push({ id, after: page.afterSequence }); return store.list(id, page); } };
  expect(await observeDecisionJournal({ sourcePath, store: monitored, observedAtMs: 3000, arm: "A" })).toMatchObject({ ok: true, report: { boundEnvelopes: 1 } });
  expect(reads.find(r => r.id === "agent_briefs")?.after).toBe(20);
  expect(reads.find(r => r.id === "agent_decision_evidence")?.after).toBe(21);
  expect(reads.every(r => r.after >= 20)).toBe(true);
  await Bun.write(sourcePath, "");
  const noReads: ConsultCaptureStore = { capture() { throw new Error("unexpected write"); }, list() { throw new Error("unexpected scan"); } };
  expect(await observeDecisionJournal({ sourcePath, store: noReads, observedAtMs: 4000, arm: "A" })).toMatchObject({ ok: true, report: { uniqueEnvelopes: 0, pendingExperienceCount: 0, latest: null } });
});

test("observer modules have no output creation, credentials, provider, model or financial execution ports", async () => {
  const reader = await Bun.file(new URL("./journal-reader.ts", import.meta.url)).text();
  const journal = await Bun.file(new URL("./decision-journal.ts", import.meta.url)).text();
  expect(reader + journal).not.toMatch(/\bfetch\s*\(|\bprocess\.|\bDate\.now\s*\(|Bun\.(?:write|spawn|serve)|mkdir|writeFile|renameSync|signer|from ["'][^"']*(?:executor|ledger|cli|service|wire)["']/);
});

test("real reference-only journal waits for raw source, then exports honest pending availability", async () => {
  const { store, sourcePath } = setup(), raw = envelope();
  const reference = { cycleId: raw.consultation.cycleId, atMs: raw.consultation.atMs, metadata: raw.decisionMetadata };
  await Bun.write(sourcePath, body(reference));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: true, report: { validReferenceLines: 1, uniqueReferences: 1, awaitingSourceReferences: 1, pendingExperienceCount: 0, latest: null } });
  store.capture("agent_briefs", raw.consultation, 4000);
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 5000, arm: "A" })).toMatchObject({ ok: true, report: { awaitingSourceReferences: 0, boundReferences: 1, pendingExperienceCount: 3, latest: { firstObservedAtMs: 4000, metadataFirstObservedAtMs: 5000 } } });
});

test("mixed full envelopes/references deduplicate experiences and preserve full-format counts", async () => {
  const { store, sourcePath } = setup(), raw = envelope(); store.capture("agent_briefs", raw.consultation, 2000); raw.decisionMetadata.recordedAtMs = 2500;
  const reference = { cycleId: raw.consultation.cycleId, atMs: raw.consultation.atMs, metadata: raw.decisionMetadata };
  await Bun.write(sourcePath, body(reference, reference, raw));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 3000, arm: "A" })).toMatchObject({ ok: true, report: { validEnvelopeLines: 1, uniqueEnvelopes: 1, boundEnvelopes: 1, validReferenceLines: 2, uniqueReferences: 1, duplicateReferenceLines: 1, boundReferences: 1, pendingExperienceCount: 3 } });
});

test("old reference conflicts outside the tail quarantine current full-envelope cycles too", async () => {
  const { store, sourcePath } = setup(), raw = envelope();
  const ref = { cycleId: raw.consultation.cycleId, atMs: raw.consultation.atMs, metadata: raw.decisionMetadata };
  store.capture("agent_decision_metadata_refs", ref, 2000);
  store.capture("agent_decision_metadata_refs", { ...ref, metadata: { ...ref.metadata, decisionVersion: "c".repeat(64) } }, 2100);
  await Bun.write(sourcePath, body(raw));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 3000, arm: "A" })).toMatchObject({ ok: true, report: { quarantinedEnvelopes: 1, pendingExperiences: [], latest: null, conflictingCycleIds: [raw.consultation.cycleId] } });
});

test("an archived early reference cannot be laundered by an identical full envelope observed later", async () => {
  const { store, sourcePath } = setup(), raw = envelope(); raw.decisionMetadata.recordedAtMs = 2500;
  store.capture("agent_decision_metadata_refs", { cycleId: raw.consultation.cycleId, atMs: raw.consultation.atMs, metadata: raw.decisionMetadata }, 2000);
  store.capture("agent_briefs", raw.consultation, 4000);
  await Bun.write(sourcePath, body(raw));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 5000, arm: "A" })).toMatchObject({ ok: true, report: { metadataRejectedEnvelopes: 1, boundEnvelopes: 0, pendingExperiences: [], latest: null } });
});

test("a late reference conflict during a different cycle join suppresses the earlier cycle", async () => {
  const { store, sourcePath } = setup(), first = envelope("first"), second = envelope("second");
  const ref = (full: ReturnType<typeof envelope>) => ({ cycleId: full.consultation.cycleId, atMs: full.consultation.atMs, metadata: full.decisionMetadata });
  store.capture("agent_briefs", first.consultation, 2000); store.capture("agent_briefs", second.consultation, 2000);
  await Bun.write(sourcePath, body(ref(first), ref(second))); let writes = 0;
  const racing: ConsultCaptureStore = { ...store, capture(id, raw, at) {
    const result = store.capture(id, raw, at);
    if (id === "agent_decision_evidence" && (raw as { cycleId?: string }).cycleId === "second" && ++writes === 5)
      store.capture("agent_decision_metadata_refs", { ...ref(first), metadata: { ...first.decisionMetadata, decisionVersion: "c".repeat(64) } }, at);
    return result;
  } };
  const result = await observeDecisionJournal({ sourcePath, store: racing, observedAtMs: 3000, arm: "A" });
  expect(result).toMatchObject({ ok: true, report: { boundReferences: 1, quarantinedReferences: 1, conflictingCycleIds: ["first"], pendingExperienceCount: 3, latest: { cycleId: "second" } } });
  if (!result.ok) throw new Error(result.code);
  expect(result.report.pendingExperiences.every(e => e.cycleId === "second")).toBe(true);
});

test("reference namespace failures and future clocks release no partial snapshot", async () => {
  const { store, sourcePath } = setup(), raw = envelope(); await Bun.write(sourcePath, body(raw));
  const broken: ConsultCaptureStore = { ...store, readCycle(id, cycle) { if (id === "agent_decision_metadata_refs") throw new Error("private fixture"); return store.readCycle(id, cycle); } };
  expect(await observeDecisionJournal({ sourcePath, store: broken, observedAtMs: 2000, arm: "A" })).toMatchObject({ ok: false, code: "capture_store_failed" });
  const ref = { cycleId: raw.consultation.cycleId, atMs: raw.consultation.atMs, metadata: raw.decisionMetadata };
  store.capture("agent_decision_metadata_refs", ref, 4000);
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 3000, arm: "A" })).toMatchObject({ ok: false, code: "observation_invalid" });
});

test("B references resolve only a B shadow source and malformed references stay visible", async () => {
  const { store, sourcePath } = setup(), raw = envelope("shadow", "B");
  const ref = { cycleId: raw.consultation.cycleId, atMs: raw.consultation.atMs, metadata: raw.decisionMetadata };
  store.capture("agent_briefs", raw.consultation, 2000); await Bun.write(sourcePath, body(ref, { ...ref, extra: true }));
  expect(await observeDecisionJournal({ sourcePath, store, observedAtMs: 3000, arm: "B" })).toMatchObject({ ok: true, report: { referenceSourceId: "shadow_decision_metadata_refs", awaitingSourceReferences: 1, invalidReferences: 1, pendingExperienceCount: 0 } });
  store.capture("shadow_briefs", raw.consultation, 4000);
  const observed = await observeDecisionJournal({ sourcePath, store, observedAtMs: 5000, arm: "B" });
  expect(observed).toMatchObject({ ok: true, report: { boundReferences: 1, pendingExperienceCount: 3 } });
  if (!observed.ok) throw new Error(observed.code);
  expect(observed.report.pendingExperiences.every(e => e.arm === "B" && e.recordedAtMs === 5000 && e.outcome === null)).toBe(true);
});
