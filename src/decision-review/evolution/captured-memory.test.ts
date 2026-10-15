import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { createConsultCaptureStore, type ConsultCaptureStore } from "./capture-store";
import { captureMetadataReference } from "./metadata-reference";
import { readCapturedExperienceMemory, readCapturedExperienceMemories } from "./captured-memory";

const asset = "token:501:So11111111111111111111111111111111111111112";
const ids = [`buy:${asset}`, `hold:${asset}@agente`, `hold:${asset}@principal`];
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
// Synthetic source/market evidence only. No financial account, outcome or IO
// beyond this test's private in-memory database.
function fixture(cycleId = "past", arm: "A" | "B" = "A") {
  const brief = { v: 1, carteira: {}, chaves: {}, posicoes: {}, compras: {}, contexto: {}, historico: {}, mandato: null };
  const consultation = { cycleId, atMs: 1000, mode: arm === "A" ? "limitado" : "sombra", posture: "ofensiva", briefVersion: 1, briefHash: sha(brief).slice(0, 16), brief: { carteira: {}, chaves: {}, posicoes: {}, compras: {}, mandato: null }, contexto: {}, historico: {},
    candidates: ids.map((id, i) => ({ id, kind: i === 0 ? "buy" : "holding", stances: i === 0 ? ["skip", "buy_full"] : ["hold", "exit_all"], marks: [] })), notes: [] as string[], valid: true, invalidReason: null, requested: Object.fromEntries(ids.map((id, i) => [id, i === 0 ? "buy_full" : "hold"])), stances: Object.fromEntries(ids.map((id, i) => [id, i === 0 ? "buy_full" : "hold"])) };
  const metadata = { schemaVersion: 1, sourceRecordHash: sha(consultation), snapshotHash: sha(brief), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64), askedAtMs: 1200, answeredAtMs: 1400, recordedAtMs: 2500, factAvailableAtMs: 1100, arm };
  return { consultation, metadata, envelope: { schemaVersion: 1, consultation, decisionMetadata: metadata }, reference: { cycleId, atMs: 1000, metadata } };
}
function setup() { const db = new Database(":memory:"), opened = createConsultCaptureStore(db); if (!opened.ok) throw new Error(opened.code); return { db, store: opened.store }; }
const query = (at = 5000, cycleId = "current") => ({ cycleId, candidateId: asset, snapshotHash: "c".repeat(64), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64), decidedAtMs: at, context: { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] }, maxExperiences: 9 });
function scopedQuery(sourceItemId = ids[0]!, at = 5000, cycleId = "current") {
  const holding = /^hold:(.+)@(agente|principal)$/.exec(sourceItemId), assetKey = holding?.[1] ?? sourceItemId.slice(4);
  return { ...query(at, cycleId), schemaVersion: 2 as const, candidateId: assetKey, itemScope: { sourceItemId, kind: holding ? "holding" as const : "buy" as const, assetKey, walletRole: holding ? holding[2] as "agente" | "principal" : null, physicalWalletIdentity: "unknown" as const, walletAddress: null } };
}
function full(store: ConsultCaptureStore, value = fixture(), rawAt = 2000, metadataAt = 3000) {
  const prefix = value.metadata.arm === "A" ? "agent" : "shadow";
  store.capture(`${prefix}_briefs`, value.consultation, rawAt);
  store.capture(`${prefix}_decision_evidence`, { cycleId: value.consultation.cycleId, atMs: 1000, envelope: value.envelope }, metadataAt);
  return value;
}
function scalarSuccess(options: Parameters<typeof readCapturedExperienceMemory>[0]) {
  const result = readCapturedExperienceMemory(options); if (!result.ok) throw new Error(result.code); return result;
}

test("query validation precedes every store read and legacy ports are unavailable", () => {
  let reads = 0; const { store } = setup();
  const port: ConsultCaptureStore = { ...store, readCycle() { reads++; throw new Error("private"); } };
  expect(readCapturedExperienceMemory({ store: port, arm: "A", cycleIds: ["past"], query: {} })).toMatchObject({ ok: false, code: "query_invalid" });
  expect(reads).toBe(0);
  expect(readCapturedExperienceMemory({ store: { capture: store.capture, list: store.list }, arm: "A", cycleIds: ["past"], query: query() })).toMatchObject({ ok: false, code: "read_cycle_unavailable" });
});

test("only host-requested cycles become pending memory after proven full-envelope availability", () => {
  const { store } = setup(); full(store); full(store, fixture("not-requested"));
  const before = readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query(2999) });
  expect(before).toMatchObject({ ok: true, coverage: "requested_cycles_only", memory: { experiences: [] }, diagnostics: [{ cycleId: "past", status: "awaiting_metadata" }] });
  const after = readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past", "past"], query: query(3000) });
  expect(after).toMatchObject({ ok: true, requestedCycleIds: ["past"], sourceAuthenticated: false, financialExecution: false, matureOutcomes: 0 });
  if (!after.ok) throw new Error(after.code);
  expect(after.memory.experiences).toHaveLength(3);
  expect(after.memory.experiences.every(e => e.cycleId === "past" && e.recordedAtMs === 3000 && e.outcome.status === "pending" && e.outcome.returnPct === null)).toBe(true);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query(5000, "past") })).toMatchObject({ ok: true, memory: { experiences: [] } });
});

test("actual bridge capture is read without persistence and raw/reference alone cannot backdate it", () => {
  const { store } = setup(), value = fixture(); store.capture("agent_briefs", value.consultation, 2000); store.capture("agent_decision_metadata_refs", value.reference, 3000);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query(3500) })).toMatchObject({ ok: true, memory: { experiences: [] }, diagnostics: [{ status: "awaiting_metadata" }] });
  captureMetadataReference(value.reference, { store, arm: "A", observedAtMs: 4000 });
  const readonlyPort: ConsultCaptureStore = { ...store, capture() { throw new Error("unexpected write"); }, list() { throw new Error("unexpected list"); }, lookup() { throw new Error("unexpected lookup"); } };
  expect(readCapturedExperienceMemory({ store: readonlyPort, arm: "A", cycleIds: ["past"], query: query(3999) })).toMatchObject({ ok: true, memory: { experiences: [] } });
  const result = readCapturedExperienceMemory({ store: readonlyPort, arm: "A", cycleIds: ["past"], query: query(4000) });
  expect(result).toMatchObject({ ok: true, diagnostics: [{ status: "bound" }] });
  if (!result.ok) throw new Error(result.code);
  expect(result.memory.experiences.every(e => e.recordedAtMs === 4000)).toBe(true);
});

test("future variants and their present conflict flags cannot censor historical memory", () => {
  const { store } = setup(), value = full(store);
  const initial = readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query(5000) });
  store.capture("agent_briefs", { ...value.consultation, notes: ["future"] }, 6000);
  store.capture("agent_decision_metadata_refs", { ...value.reference, metadata: { ...value.metadata, decisionVersion: "e".repeat(64) } }, 6000);
  store.capture("agent_decision_evidence", { cycleId: "past", atMs: 1000, envelope: { ...value.envelope, decisionMetadata: { ...value.metadata, snapshotHash: "d".repeat(64) } } }, 6000);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query(5000) })).toEqual(initial);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query(7000) })).toMatchObject({ ok: true, memory: { experiences: [] }, diagnostics: [{ status: "quarantined" }] });
});

test("all historical reference variants and original reference clocks remain binding", () => {
  const { store } = setup(), value = full(store);
  store.capture("agent_decision_metadata_refs", value.reference, 2000);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query() })).toMatchObject({ ok: true, memory: { experiences: [] }, diagnostics: [{ status: "metadata_rejected" }] });
  store.capture("agent_decision_metadata_refs", { ...value.reference, metadata: { ...value.metadata, decisionVersion: "f".repeat(64) } }, 3000);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query() })).toMatchObject({ ok: true, memory: { experiences: [] }, diagnostics: [{ status: "quarantined" }] });
});

test("missing source, mismatching exact hashes, Brief and wrapper clocks never become known outcomes", () => {
  const { store } = setup(), absent = fixture("absent"), hash = fixture("hash"), brief = fixture("brief"), wrap = fixture("wrap");
  store.capture("agent_decision_evidence", { cycleId: "absent", atMs: 1000, envelope: absent.envelope }, 3000);
  hash.metadata.sourceRecordHash = "d".repeat(64); full(store, hash);
  brief.metadata.snapshotHash = "d".repeat(64); full(store, brief);
  store.capture("agent_briefs", wrap.consultation, 2000); store.capture("agent_decision_evidence", { cycleId: "wrap", atMs: 999, envelope: wrap.envelope }, 3000);
  const result = readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["absent", "hash", "brief", "wrap"], query: query() });
  expect(result).toMatchObject({ ok: true, memory: { experiences: [] } });
  if (!result.ok) throw new Error(result.code);
  expect(result.diagnostics.map(d => d.status)).toEqual(["awaiting_source", "metadata_rejected", "metadata_rejected", "metadata_invalid"]);
});

test("A and B namespaces are explicit and payload arm must match", () => {
  const { store } = setup(); full(store); full(store, fixture("past", "B"));
  const result = readCapturedExperienceMemory({ store, arm: "B", cycleIds: ["past"], query: query() });
  if (!result.ok) throw new Error(result.code);
  expect(result.memory.experiences.every(e => e.arm === "B" && e.source === "shadow_journal")).toBe(true);
  const wrong = fixture("wrong", "B"); store.capture("agent_briefs", wrong.consultation, 2000); store.capture("agent_decision_evidence", { cycleId: "wrong", atMs: 1000, envelope: wrong.envelope }, 3000);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["wrong"], query: query() })).toMatchObject({ ok: true, memory: { experiences: [] }, diagnostics: [{ status: "metadata_rejected" }] });
});

test("read failures, corruption and a changed eligible snapshot release no memory", () => {
  const { db, store } = setup(), value = full(store); let reads = 0;
  const racing: ConsultCaptureStore = { ...store, readCycle(id, cycle) {
    const result = store.readCycle(id, cycle);
    if (++reads === 3) store.capture("agent_briefs", { ...value.consultation, notes: ["concurrent"] }, 4000);
    return result;
  } };
  expect(readCapturedExperienceMemory({ store: racing, arm: "A", cycleIds: ["past"], query: query() })).toMatchObject({ ok: false, code: "snapshot_changed" });
  const failed: ConsultCaptureStore = { ...store, readCycle() { throw new Error("private path/credential"); } };
  expect(readCapturedExperienceMemory({ store: failed, arm: "A", cycleIds: ["past"], query: query() })).toEqual({ ok: false, code: "storage_unavailable" });
  db.query("UPDATE evolution_consult_captures SET raw_payload='{}' WHERE source_id='agent_briefs'").run();
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query() })).toEqual({ ok: false, code: "storage_unavailable" });
});

test("future-only writes during recheck leave the complete historical result unchanged", () => {
  const { store } = setup(), value = full(store);
  const baseline = readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query() }); let reads = 0;
  const port: ConsultCaptureStore = { ...store, readCycle(id, cycle) {
    const found = store.readCycle(id, cycle);
    if (++reads === 3) {
      store.capture("agent_briefs", { ...value.consultation, notes: ["future during recheck"] }, 6000);
      store.capture("agent_decision_metadata_refs", { ...value.reference, metadata: { ...value.metadata, decisionVersion: "e".repeat(64) } }, 6000);
      store.capture("agent_decision_evidence", { cycleId: "past", atMs: 1000, envelope: { ...value.envelope, decisionMetadata: { ...value.metadata, snapshotHash: "d".repeat(64) } } }, 6000);
    }
    return found;
  } };
  expect(readCapturedExperienceMemory({ store: port, arm: "A", cycleIds: ["past"], query: query() })).toEqual(baseline);
});

test("known impossible decision clocks reject metadata without fabricating learning outcomes", () => {
  for (const mutate of [
    (v: ReturnType<typeof fixture>) => { v.metadata.factAvailableAtMs = 1201; },
    (v: ReturnType<typeof fixture>) => { v.metadata.askedAtMs = 999; },
    (v: ReturnType<typeof fixture>) => { v.metadata.answeredAtMs = 2001; },
    (v: ReturnType<typeof fixture>) => { v.metadata.recordedAtMs = 3001; },
  ]) {
    const { store } = setup(), value = fixture(); mutate(value); full(store, value);
    expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query() })).toMatchObject({ ok: true, memory: { experiences: [] }, diagnostics: [{ status: "metadata_rejected" }] });
  }
  const { store } = setup(); full(store, fixture(), 4000, 3000);
  expect(readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query() })).toMatchObject({ ok: true, memory: { experiences: [] }, diagnostics: [{ status: "metadata_rejected" }] });
});

test("invalid cohorts and resource bounds are explicit and cause no store reads", () => {
  const { store } = setup(); let reads = 0;
  const port: ConsultCaptureStore = { ...store, readCycle(id, cycle) { reads++; return store.readCycle(id, cycle); } };
  expect(readCapturedExperienceMemory({ store: port, arm: "A", cycleIds: ["bad:cycle"], query: query() })).toMatchObject({ ok: false, code: "request_invalid" });
  expect(readCapturedExperienceMemory({ store: port, arm: "A", cycleIds: Array.from({ length: 513 }, (_, i) => `cycle-${i}`), query: query() })).toMatchObject({ ok: false, code: "payload_limit" });
  expect(reads).toBe(0);
  expect(readCapturedExperienceMemory({ store: port, arm: "A", cycleIds: [], query: query() })).toMatchObject({ ok: true, coverage: "requested_cycles_only", requestedCycleIds: [], memory: { experiences: [] } });
  expect(reads).toBe(0);
});

test("availability filtering never invokes row getters and ignores future payload accessors", () => {
  const { store } = setup(); full(store); let called = 0;
  const poisoned: ConsultCaptureStore = { ...store, readCycle(id, cycle) {
    const found = store.readCycle(id, cycle); if (!found.ok) return found;
    return { ...found, records: found.records.map(row => Object.defineProperty({ ...row }, "firstObservedAtMs", { enumerable: true, get() { called++; throw new Error("private getter"); } })) };
  } };
  expect(readCapturedExperienceMemory({ store: poisoned, arm: "A", cycleIds: ["past"], query: query() })).toEqual({ ok: false, code: "storage_unavailable" });
  expect(called).toBe(0);
  const baseline = readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["past"], query: query() });
  const futurePort: ConsultCaptureStore = { ...store, readCycle(id, cycle) {
    const found = store.readCycle(id, cycle); if (!found.ok || id !== "agent_briefs") return found;
    const row = Object.defineProperty({ ...found.records[0]!, firstObservedAtMs: 6000 }, "rawRecord", { enumerable: true, get() { called++; throw new Error("future private getter"); } });
    return { ...found, records: [...found.records, row] };
  } };
  expect(readCapturedExperienceMemory({ store: futurePort, arm: "A", cycleIds: ["past"], query: query() })).toEqual(baseline);
  expect(called).toBe(0);
});

test("batch shares real collection and recheck once for seven queries over twenty-two cycles", () => {
  const { store } = setup(), cycleIds = Array.from({ length: 22 }, (_, i) => `batch-${i}`);
  cycleIds.forEach(cycle => full(store, fixture(cycle)));
  const itemIds = [...ids, ...Array.from({ length: 4 }, (_, i) => `buy:token:1:0x${(i + 1).toString(16).padStart(40, "0")}`)];
  const queries = itemIds.map((id, i) => ({ ...scopedQuery(id), maxExperiences: i + 3 }));
  const expected = queries.map(query => scalarSuccess({ store, arm: "A", cycleIds, query }));
  const calls: { source: string; cycle: string }[] = [];
  const port: ConsultCaptureStore = { ...store, readCycle(source, cycle) { calls.push({ source, cycle }); return store.readCycle(source, cycle); } };
  const actual = readCapturedExperienceMemories({ store: port, arm: "A", cycleIds, queries });
  expect(actual).toEqual({ ok: true, results: expected });
  expect(calls).toHaveLength(2 * 3 * cycleIds.length);
  for (const cycle of cycleIds) for (const source of ["agent_briefs", "agent_decision_evidence", "agent_decision_metadata_refs"])
    expect(calls.filter(c => c.source === source && c.cycle === cycle)).toHaveLength(2);
});

test("batch validates every V2 query and common frame before any I/O", () => {
  const { store } = setup(); let reads = 0;
  const port: ConsultCaptureStore = { ...store, readCycle(source, cycle) { reads++; return store.readCycle(source, cycle); } };
  for (const queries of [[scopedQuery(), {}], [scopedQuery(), scopedQuery(ids[1], 5001)], [scopedQuery(), scopedQuery(ids[1], 5000, "other")], [query()]])
    expect(readCapturedExperienceMemories({ store: port, arm: "A", cycleIds: ["past"], queries })).toEqual({ ok: false, code: "query_invalid" });
  expect(readCapturedExperienceMemories({ store: port, arm: "A", cycleIds: ["past"], queries: Array.from({ length: 65 }, () => scopedQuery()) })).toEqual({ ok: false, code: "payload_limit" });
  expect(reads).toBe(0);
  expect(readCapturedExperienceMemories({ store: port, arm: "A", cycleIds: [], queries: [] })).toEqual({ ok: true, results: [] });
  expect(readCapturedExperienceMemories({ store: port, arm: "A", cycleIds: ["invalid:cycle"], queries: [] })).toEqual({ ok: false, code: "request_invalid" });
  expect(readCapturedExperienceMemories({ store: port, arm: "bad" as "A", cycleIds: [], queries: [] })).toEqual({ ok: false, code: "request_invalid" });
  expect(readCapturedExperienceMemories({ store: port, arm: "A", cycleIds: Array.from({ length: 513 }, (_, i) => `cycle-${i}`), queries: [] })).toEqual({ ok: false, code: "payload_limit" });
  let getters = 0; const accessor = Object.defineProperty({}, "cycleId", { enumerable: true, get() { getters++; throw new Error("private"); } });
  expect(readCapturedExperienceMemories({ store: port, arm: "A", cycleIds: ["past"], queries: [scopedQuery(), accessor] })).toEqual({ ok: false, code: "query_invalid" });
  expect(getters).toBe(0);
  expect(reads).toBe(0);
});

test("batch matches scalar availability replay and preserves roles, arm and future filtering", () => {
  const { store } = setup(), value = full(store), shadow = full(store, fixture("past", "B"));
  for (const arm of ["A", "B"] as const) for (const at of [2999, 3000, 5000]) {
    const queries = ids.map(id => scopedQuery(id, at));
    expect(readCapturedExperienceMemories({ store, arm, cycleIds: ["past"], queries })).toEqual({ ok: true, results: queries.map(query => scalarSuccess({ store, arm, cycleIds: ["past"], query })) });
  }
  const queries = ids.map(id => scopedQuery(id));
  const before = readCapturedExperienceMemories({ store, arm: "A", cycleIds: ["past"], queries });
  store.capture("agent_briefs", { ...value.consultation, notes: ["future"] }, 6000);
  store.capture("agent_decision_metadata_refs", { ...value.reference, metadata: { ...value.metadata, decisionVersion: "e".repeat(64) } }, 6000);
  store.capture("agent_decision_evidence", { cycleId: "past", atMs: 1000, envelope: { ...value.envelope, decisionMetadata: { ...value.metadata, snapshotHash: "d".repeat(64) } } }, 6000);
  expect(readCapturedExperienceMemories({ store, arm: "A", cycleIds: ["past"], queries })).toEqual(before);
  expect(readCapturedExperienceMemories({ store, arm: "A", cycleIds: ["past"], queries: ids.map(id => scopedQuery(id, 7000)) })).toEqual({ ok: true, results: ids.map(id => scalarSuccess({ store, arm: "A", cycleIds: ["past"], query: scopedQuery(id, 7000) })) });
  expect(shadow.metadata.arm).toBe("B");
});

test("batch final recheck is real and detects a new variant in its last namespace", () => {
  const { store } = setup(), value = full(store); let reads = 0;
  const port: ConsultCaptureStore = { ...store, readCycle(source, cycle) {
    if (++reads === 6) store.capture("agent_decision_metadata_refs", value.reference, 4000);
    return store.readCycle(source, cycle);
  } };
  expect(readCapturedExperienceMemories({ store: port, arm: "A", cycleIds: ["past"], queries: ids.map(id => scopedQuery(id)) })).toEqual({ ok: false, code: "snapshot_changed" });
  expect(reads).toBe(6);
});

test("batch failures return no partial results and success frames do not alias mutable host fields", () => {
  const { store, db } = setup(); full(store);
  const queries = ids.map(id => scopedQuery(id)), failed: ConsultCaptureStore = { ...store, readCycle() { throw new Error("private fixture path"); } };
  expect(readCapturedExperienceMemories({ store: failed, arm: "A", cycleIds: ["past"], queries })).toEqual({ ok: false, code: "storage_unavailable" });
  const result = readCapturedExperienceMemories({ store, arm: "A", cycleIds: ["past"], queries });
  if (!result.ok) throw new Error(result.code);
  const second = JSON.stringify(result.results[1]);
  (result.results[0]!.requestedCycleIds as string[]).push("host-mutation");
  (result.results[0]!.diagnostics as unknown[]).pop();
  expect(JSON.stringify(result.results[1])).toBe(second);
  db.query("UPDATE evolution_consult_captures SET raw_payload='{}' WHERE source_id='agent_briefs'").run();
  expect(readCapturedExperienceMemories({ store, arm: "A", cycleIds: ["past"], queries })).toEqual({ ok: false, code: "storage_unavailable" });
});

test("module has no persistence, host clock, network, model, execution or financial-home ports", async () => {
  const source = await Bun.file(new URL("./captured-memory.ts", import.meta.url)).text();
  expect(source).not.toMatch(/\bfetch\s*\(|\bprocess\.|\bDate\.now\s*\(|Bun\.|\.capture\s*\(|\.lookup\s*\(|\.list\s*\(|\bcaptureDecisionEvidence\b|\bcaptureMetadataReference\b|from ["'][^"']*(?:executor|ledger|cli|service|wire|node:fs)["']/);
});
