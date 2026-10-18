import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";
import { buildExperienceMemory, type ExperienceEpisodeV2, type MemoryQueryV2 } from "./memory";
import { createConsultCaptureStore } from "./capture-store";
import { readCapturedExperienceMemory } from "./captured-memory";
import { projectBriefMemory, BRIEF_MEMORY_LEGEND, BRIEF_MEMORY_VERSION_HASH, BRIEF_MEMORY_LIMITS } from "./brief-memory";

const AT = 1_800_000_000_000, asset = "token:501:So11111111111111111111111111111111111111112", id = `buy:${asset}`;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const context = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] } as const;
const scope = (sourceItemId = id, assetKey = asset) => ({ sourceItemId, kind: sourceItemId.startsWith("buy:") ? "buy" as const : "holding" as const, assetKey, walletRole: sourceItemId.startsWith("buy:") ? null : sourceItemId.endsWith("@agente") ? "agente" as const : "principal" as const, physicalWalletIdentity: "unknown" as const, walletAddress: null });
// Synthetic pending observations, generated through the actual memory builder.
// No realized outcome, price, physical wallet identity or financial authority.
function frame(sourceItemId = id, arm: "A" | "B" = "A", count = 3, assetKey = asset) {
  const query: MemoryQueryV2 = { schemaVersion: 2, cycleId: "current", candidateId: assetKey, itemScope: scope(sourceItemId, assetKey), snapshotHash: "a".repeat(64), decisionVersion: "b".repeat(64), evaluatorHash: "c".repeat(64), decidedAtMs: AT, context, maxExperiences: Math.max(count, 3) };
  const episodes: ExperienceEpisodeV2[] = Array.from({ length: count }, (_, i) => ({ schemaVersion: 2, cycleId: `past-${i}`, candidateId: assetKey, itemScope: scope(sourceItemId, assetKey), snapshotHash: "d".repeat(64), decisionVersion: "b".repeat(64), evaluatorHash: "c".repeat(64), episodeVersion: 1, decidedAtMs: 1000 + i, recordedAtMs: 2000 + i, factAvailableAtMs: 500, arm, action: i === 0 ? "buy" : "hold", source: arm === "A" ? "decision_journal" : "shadow_journal", context, observations: [], outcome: null, counterfactuals: [] }));
  const built = buildExperienceMemory(episodes, query); if (!built.ok) throw new Error(built.reason);
  return { ok: true as const, coverage: "requested_cycles_only" as const, requestedCycleIds: episodes.map(e => e.cycleId).sort(), arm, memory: built.value, diagnostics: episodes.map(e => ({ cycleId: e.cycleId, status: "bound" as const, rawVariants: 1, metadataVariants: 1, referenceVariants: 0, pendingItems: 1, excludedQueryCycle: false })), sourceAuthenticated: false as const, financialExecution: false as const, qualifiedABActive: false as const, matureOutcomes: 0 as const, consistency: "eligible_snapshots_rechecked" as const };
}
const options = (result: unknown = frame(), sourceItemId = id, arm: "A" | "B" = "A") => ({ asOfMs: AT, cycleId: "current", arm, items: [{ sourceItemId, result }] });
// Adversarial detached copies intentionally permit mutation of a frozen builder
// result; rehash emulates coherent local claims, never source authentication.
const mutable = (v: unknown): any => JSON.parse(JSON.stringify(v));
function rehash(v: ReturnType<typeof mutable>) { const { snapshotHash: _old, ...body } = v.memory; v.memory.snapshotHash = sha(body); return v; }

test("compact pending projection preserves original actions, times, hashes and explicit cohort", () => {
  const result = frame(), projected = projectBriefMemory(options(result));
  expect(projected).toMatchObject({ ok: true, value: { v: 1, t: AT, c: "current", b: "A", sourceAuthenticated: false, financialExecution: false } });
  if (!projected.ok) throw new Error(projected.code);
  const item = projected.value.items[id]!;
  expect(item).toMatchObject({ st: "available", reason: null, h: result.memory.snapshotHash });
  expect(projected.value.cohorts[item.k!]).toEqual(result.requestedCycleIds);
  expect(item.x).toHaveLength(3);
  for (let i = 0; i < item.x.length; i++) {
    const e = item.x[i]!, original = result.memory.experiences[i]!;
    expect(e).toMatchObject({ c: original.cycleId, action: original.action, dt: original.decidedAtMs, rt: original.recordedAtMs });
    expect(e.i).toBeUndefined();
    expect(projected.value.versions.d[e.d]!).toBe(original.decisionVersion!);
    expect(projected.value.versions.e[e.e]!).toBe(original.evaluatorHash!);
    expect(projected.value.versions.s[e.s]!).toBe(original.snapshotHash!);
  }
  const { h, ...body } = projected.value; expect(h).toBe(sha(body));
  expect(projected.value.evaluation).toBe("pending_only");
  expect(projected.value.coverage).toBe("requested_cycles_only");
  expect(BRIEF_MEMORY_VERSION_HASH).toMatch(/^[a-f0-9]{64}$/);
  expect(BRIEF_MEMORY_LEGEND).toContain("not evidence of profit or success");
  expect(BRIEF_MEMORY_LEGEND).toContain("does not recommend");
});

test("V2 query item, current cycle, exact time and arm must match the host frame", () => {
  for (const change of [
    (v: ReturnType<typeof mutable>) => { v.memory.query.itemScope.sourceItemId = `hold:${asset}@agente`; },
    (v: ReturnType<typeof mutable>) => { v.memory.query.cycleId = "different"; },
    (v: ReturnType<typeof mutable>) => { v.memory.query.decidedAtMs = AT - 1; },
    (v: ReturnType<typeof mutable>) => { v.arm = "B"; },
  ]) {
    const value = mutable(frame()); change(value); rehash(value);
    expect(projectBriefMemory(options(value))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: "frame_mismatch", x: [] } } } });
  }
});

test("incoherent memory hash cannot masquerade as a reader frame", () => {
  const value = mutable(frame()); value.memory.experiences[0].action = "sell";
  expect(projectBriefMemory(options(value))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: "memory_snapshot_mismatch", h: null, x: [] } } } });
});

test("future answers, future availability and current-cycle leakage are rejected even after rehash", () => {
  for (const change of [
    (v: ReturnType<typeof mutable>) => { v.memory.experiences[0].decidedAtMs = AT; },
    (v: ReturnType<typeof mutable>) => { v.memory.experiences[0].recordedAtMs = AT + 1; },
    (v: ReturnType<typeof mutable>) => { v.memory.experiences[0].cycleId = "current"; },
  ]) {
    const value = mutable(frame()); change(value); rehash(value);
    expect(projectBriefMemory(options(value))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: "experience_invalid", x: [] } } } });
  }
});

test("unknown pending outcomes never become zero return, confidence or success", () => {
  const projected = projectBriefMemory(options()); if (!projected.ok) throw new Error(projected.code);
  const text = JSON.stringify(projected.value);
  expect(text).not.toMatch(/returnPct|confidence|probability|walletAddress|physicalWalletIdentity|reflectionCodes|observations/);
  const measured = mutable(frame()); measured.memory.experiences[0].outcome.returnPct = 0; rehash(measured);
  expect(projectBriefMemory(options(measured))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: "unsupported_outcome", x: [] } } } });
});

test("reported holding roles and B identity remain distinct without physical wallet claims", () => {
  const holding = `hold:${asset}@principal`, input = frame(holding, "B"), projected = projectBriefMemory(options(input, holding, "B"));
  expect(projected).toMatchObject({ ok: true, value: { b: "B", items: { [holding]: { st: "available" } } } });
  if (!projected.ok) throw new Error(projected.code);
  expect(projected.value.items[holding]!.x[0]!.c).toBe("past-2");
  const foreign = mutable(input); foreign.memory.experiences[0].arm = "A"; rehash(foreign);
  expect(projectBriefMemory(options(foreign, holding, "B"))).toMatchObject({ ok: true, value: { items: { [holding]: { st: "unavailable", reason: "experience_invalid" } } } });
});

test("empty and unavailable are explicit and representation overflow is never silently sliced", () => {
  expect(projectBriefMemory(options(frame(id, "A", 0)))).toMatchObject({ ok: true, value: { items: { [id]: { st: "empty", x: [] } } } });
  expect(projectBriefMemory(options({ ok: false, code: "storage_unavailable" }))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: "storage_unavailable", h: null, k: null, x: [] } } } });
  expect(projectBriefMemory(options(frame(id, "A", 4)))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: "representation_limit", x: [] } } } });
  expect(BRIEF_MEMORY_LIMITS.experiencesPerItem).toBe(3);
});

test("accessors, malformed host shapes and duplicate item ids do not execute or leak content", () => {
  let called = 0; const getter = Object.defineProperty({}, "asOfMs", { enumerable: true, get() { called++; throw new Error("private"); } });
  expect(projectBriefMemory(getter)).toEqual({ ok: false, code: "input_invalid" }); expect(called).toBe(0);
  const input = options(); input.items.push(input.items[0]!);
  expect(projectBriefMemory(input)).toEqual({ ok: false, code: "input_invalid" });
  expect(projectBriefMemory({ ...options(), extra: "private text" })).toEqual({ ok: false, code: "input_invalid" });
});

test("seven items with three pending experiences use shared version tables and fit the payload budget", () => {
  const items = Array.from({ length: 7 }, (_, i) => { const assetKey = `token:1:0x${(i + 1).toString(16).padStart(40, "0")}`, sourceItemId = `buy:${assetKey}`, result = mutable(frame(sourceItemId, "A", 3, assetKey)); result.requestedCycleIds = Array.from({ length: 12 }, (_, j) => j < 3 ? `past-${j}` : `cohort-cycle-000000-${j}`).sort(); result.diagnostics = result.requestedCycleIds.map((cycleId: string) => ({ cycleId, status: "bound", rawVariants: 1, metadataVariants: 1, referenceVariants: 0, pendingItems: cycleId.startsWith("past-") ? 1 : 0, excludedQueryCycle: false })); for (const e of result.memory.experiences) { e.decidedAtMs += AT - 10_000; e.recordedAtMs += AT - 10_000; e.ageMs = AT - e.decidedAtMs; } rehash(result); return { sourceItemId, result }; });
  const projected = projectBriefMemory({ asOfMs: AT, cycleId: "current", arm: "A", items });
  if (!projected.ok) throw new Error(projected.code);
  expect(Object.values(projected.value.items).every(i => i.st === "available" && i.x.length === 3)).toBe(true);
  expect(projected.value.versions.d).toHaveLength(1); expect(projected.value.versions.e).toHaveLength(1);
  expect(projected.value.cohorts).toHaveLength(1);
  const bytes = new TextEncoder().encode(JSON.stringify(projected.value)).byteLength;
  expect(bytes).toBeLessThan(6_144);
  console.info(JSON.stringify({ fixture: "synthetic_projection_benchmark", items: 7, rowsPerItem: 3, cohortCycles: 12, timestampDigits: 13, bytes }));
});

test("other reported item origins retain their exact role through the shared origin table", () => {
  const value = mutable(frame()), other = `hold:${asset}@principal`;
  value.memory.experiences[0].itemScope = scope(other); rehash(value);
  const projected = projectBriefMemory(options(value));
  if (!projected.ok) throw new Error(projected.code);
  const row = projected.value.items[id]!.x[0]!;
  expect(projected.value.origins[row.i!]).toBe(other);
  expect(projected.value.items[id]!.x[1]!.i).toBeUndefined();
  expect(JSON.stringify(projected.value)).not.toContain("walletAddress");
});

test("free text stays outside the projection and outputs are detached and frozen", () => {
  const value = mutable(frame()); value.memory.experiences[0].observations = [{ code: "arbitrary_instruction", text: "private prompt text" }]; rehash(value);
  const input = options(value), projected = projectBriefMemory(input);
  if (!projected.ok) throw new Error(projected.code);
  expect(JSON.stringify(projected.value)).not.toContain("private prompt text");
  const before = JSON.stringify(projected.value); input.items[0]!.sourceItemId = "changed";
  expect(JSON.stringify(projected.value)).toBe(before); expect(Object.isFrozen(projected.value.items[id]!.x)).toBe(true);
});

test("synthetic capture-store to qualified reader to projector preserves the actual interfaces", () => {
  const db = new Database(":memory:"), opened = createConsultCaptureStore(db); if (!opened.ok) throw new Error(opened.code);
  const store = opened.store, fullBrief = { v: 1, carteira: {}, chaves: {}, posicoes: {}, compras: {}, contexto: {}, historico: {}, mandato: null };
  const consultation = { cycleId: "pipeline", atMs: 1000, mode: "limitado", posture: "ofensiva", briefVersion: 1, briefHash: sha(fullBrief).slice(0, 16), brief: { carteira: {}, chaves: {}, posicoes: {}, compras: {}, mandato: null }, contexto: {}, historico: {},
    candidates: [{ id, kind: "buy", stances: ["skip", "buy_full"], marks: [] }], notes: [], valid: true, invalidReason: null, requested: { [id]: "buy_full" }, stances: { [id]: "buy_full" } };
  const metadata = { schemaVersion: 1, sourceRecordHash: sha(consultation), snapshotHash: sha(fullBrief), decisionVersion: "b".repeat(64), evaluatorHash: "c".repeat(64), askedAtMs: 1200, answeredAtMs: 1400, recordedAtMs: 2500, factAvailableAtMs: 1100, arm: "A" };
  store.capture("agent_briefs", consultation, 2000);
  store.capture("agent_decision_evidence", { cycleId: "pipeline", atMs: 1000, envelope: { schemaVersion: 1, consultation, decisionMetadata: metadata } }, 3000);
  const result = readCapturedExperienceMemory({ store, arm: "A", cycleIds: ["pipeline"], query: frame().memory.query });
  if (!result.ok) throw new Error(result.code);
  const projected = projectBriefMemory(options(result)); if (!projected.ok) throw new Error(projected.code);
  expect(projected.value.items[id]).toMatchObject({ st: "available", h: result.memory.snapshotHash, x: [{ c: "pipeline", action: "buy", dt: 1400, rt: 3000, r: 1 }] });
  const contradictory = mutable(result); contradictory.diagnostics[0].pendingItems = 0;
  expect(projectBriefMemory(options(contradictory))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", q: "unknown", reason: "diagnostics_invalid", x: [] } } } });
  db.close();
});

test("actual reader unavailable cohort is never labeled as healthy empty memory", () => {
  const db = new Database(":memory:"), opened = createConsultCaptureStore(db); if (!opened.ok) throw new Error(opened.code);
  const result = readCapturedExperienceMemory({ store: opened.store, arm: "A", cycleIds: ["missing"], query: frame().memory.query });
  const projected = projectBriefMemory(options(result));
  expect(projected).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: "awaiting_source", q: "unavailable", x: [] } } } });
  if (!projected.ok) throw new Error(projected.code);
  expect(projected.value.gaps[projected.value.items[id]!.k!]).toEqual({ missing: "awaiting_source" });
  db.close();
});

test("all unavailable statuses and partially available cohorts preserve exact allowlisted gaps", () => {
  for (const status of ["awaiting_source", "awaiting_metadata", "quarantined", "source_invalid", "metadata_invalid", "metadata_rejected"]) {
    const value = mutable(frame(id, "A", 0)); value.requestedCycleIds = ["missing"];
    value.diagnostics = [{ cycleId: "missing", status, rawVariants: 0, metadataVariants: 0, referenceVariants: 0, pendingItems: 0, excludedQueryCycle: false }];
    expect(projectBriefMemory(options(value))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", reason: status, q: "unavailable", x: [] } } } });
  }
  const partial = mutable(frame()); partial.requestedCycleIds.push("missing"); partial.requestedCycleIds.sort(); partial.diagnostics.push({ cycleId: "missing", status: "awaiting_metadata", rawVariants: 1, metadataVariants: 0, referenceVariants: 0, pendingItems: 0, excludedQueryCycle: false });
  const projected = projectBriefMemory(options(partial));
  expect(projected).toMatchObject({ ok: true, value: { items: { [id]: { st: "available", q: "partial", reason: "cohort_incomplete" } } } });
  if (!projected.ok) throw new Error(projected.code);
  expect(projected.value.items[id]!.x).toHaveLength(3);
  expect(projected.value.gaps[projected.value.items[id]!.k!]).toEqual({ missing: "awaiting_metadata" });
});

test("missing, duplicate and contradictory diagnostic coverage cannot masquerade as complete", () => {
  for (const change of [
    (v: ReturnType<typeof mutable>) => { v.diagnostics.pop(); },
    (v: ReturnType<typeof mutable>) => { v.diagnostics[0] = v.diagnostics[1]; },
    (v: ReturnType<typeof mutable>) => { v.diagnostics[0].status = "awaiting_source"; v.diagnostics[0].pendingItems = 0; },
    (v: ReturnType<typeof mutable>) => { v.diagnostics[0].pendingItems = 0; },
  ]) {
    const value = mutable(frame()); change(value);
    expect(projectBriefMemory(options(value))).toMatchObject({ ok: true, value: { items: { [id]: { st: "unavailable", q: "unknown", reason: "diagnostics_invalid", x: [] } } } });
  }
  // The source count includes items retrieval may not select. Equality would
  // incorrectly erase an otherwise valid partially retrieved pending history.
  const moreThanRetrieved = mutable(frame()); moreThanRetrieved.diagnostics.forEach((d: { pendingItems: number }) => { d.pendingItems = 9; });
  expect(projectBriefMemory(options(moreThanRetrieved))).toMatchObject({ ok: true, value: { items: { [id]: { st: "available", q: "complete" } } } });
});

test("projector has no I/O, model, clock, execution, persistence or financial gate", async () => {
  const source = await Bun.file(new URL("./brief-memory.ts", import.meta.url)).text();
  expect(source).not.toMatch(/\bfetch\s*\(|\bprocess\.|\bDate\.now\s*\(|Bun\.|\.capture\s*\(|\.readCycle\s*\(|from ["'][^"']*(?:executor|ledger|cli|service|wire|node:fs)["']/);
});
