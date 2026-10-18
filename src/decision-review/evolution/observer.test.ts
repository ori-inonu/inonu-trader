import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { linkSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsultCaptureStore, type ConsultCaptureStore } from "./capture-store";
import { observeConsultJournal, observeEvolutionJournals, resolveObserverPaths } from "./observer";

function source(cycleId = "fixture-cycle") {
  const id = `buy:token:501:${"5".repeat(44)}`;
  const brief = { carteira: {}, chaves: {}, posicoes: {}, compras: {}, mandato: null };
  const full = { v: 1, carteira: {}, chaves: {}, posicoes: {}, compras: {}, contexto: null, historico: null, mandato: null };
  return { cycleId, atMs: 1000, mode: "limitado", posture: "ofensiva", candidates: [{ id, kind: "buy", stances: ["skip", "buy_tenth", "buy_full"], marks: [], families: [], triggers: [] }],
    brief, briefVersion: 1, briefHash: createHash("sha256").update(JSON.stringify(full)).digest("hex").slice(0,16), physicalRequests: 1,
    criteria: "rank-v1", legend: "scoped-v1", notes: [], valid: true, invalidReason: null, requested: { [id]: "buy_tenth" }, stances: { [id]: "buy_tenth" }, profiles: {}, facets: {}, verdicts: {}, contexto: null, historico: null };
}
function setup() {
  const db = new Database(":memory:"), opened = createConsultCaptureStore(db);
  if (!opened.ok) throw new Error(opened.code);
  return { db, store: opened.store, dir: mkdtempSync(join(tmpdir(), "inonu-observer-fixture-")) };
}

function envelopeOf(row = source()) {
  const full = { v:1,carteira:row.brief.carteira,chaves:row.brief.chaves,posicoes:row.brief.posicoes,compras:row.brief.compras,contexto:row.contexto,historico:row.historico,mandato:row.brief.mandato };
  const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
  return {schemaVersion:1,consultation:row,decisionMetadata:{schemaVersion:1,sourceRecordHash:hash(row),snapshotHash:hash(full),decisionVersion:"a".repeat(64),evaluatorHash:"b".repeat(64),askedAtMs:1200,answeredAtMs:1400,recordedAtMs:1450,factAvailableAtMs:1100,arm:"A"}};
}

test("the worker reports a missing producer stream without upgrading its legacy consultation", async () => {
  const {store,dir}=setup(), sourcePath=join(dir,"briefs.jsonl"), decisionSourcePath=join(dir,"decisions-meta.jsonl");
  await Bun.write(sourcePath,JSON.stringify(source())+"\n");
  const result=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:2000});
  expect(result.consultation).toMatchObject({ok:true,report:{inserted:1,memoryEpisodesProduced:0,latest:{decisionAtMs:null}}});
  expect(result.prospective).toMatchObject({ok:false,code:"source_missing"});
});

test("late real-shaped producer envelopes reach the compact worker report with stable availability", async () => {
  const {store,dir}=setup(), sourcePath=join(dir,"briefs.jsonl"), decisionSourcePath=join(dir,"decisions-meta.jsonl"), envelope=envelopeOf();
  await Bun.write(sourcePath,JSON.stringify(envelope.consultation)+"\n");
  await observeConsultJournal({sourcePath,sourceId:"agent_briefs",store,observedAtMs:2000});
  await Bun.write(decisionSourcePath,JSON.stringify(envelope)+"\n");
  const first=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:3000});
  expect(first.prospective).toMatchObject({ok:true,status:"observing_pending",degraded:false,report:{pendingExperienceCount:1,matureOutcomes:0,qualifiedABActive:false,financialExecutor:false,
    latest:{cycleId:"fixture-cycle",decisionAtMs:1400,firstObservedAtMs:2000,metadataFirstObservedAtMs:3000}}});
  if(!first.prospective.ok)throw new Error(first.prospective.code);
  expect(Object.hasOwn(first.prospective.report,"pendingExperiences")).toBe(false);
  const again=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:8000});
  if(!again.prospective.ok)throw new Error(again.prospective.code);
  expect(again.prospective.report.latest).toEqual(first.prospective.report.latest);
});

test("a producer reference waits for its exact source without being called invalid or exposing memory", async () => {
  const {store,dir}=setup(),sourcePath=join(dir,"briefs.jsonl"),decisionSourcePath=join(dir,"decisions-meta.jsonl"),e=envelopeOf();
  await Bun.write(sourcePath,"");
  await Bun.write(decisionSourcePath,JSON.stringify({cycleId:e.consultation.cycleId,atMs:e.consultation.atMs,metadata:e.decisionMetadata})+"\n");
  const result=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:2000});
  expect(result.prospective).toMatchObject({ok:true,status:"awaiting_source",degraded:false,report:{invalidEnvelopes:0,pendingExperienceCount:0,latest:null,qualifiedABActive:false}});
});

test("the worker joins real producer references even when metadata was recorded after the first raw capture", async () => {
  const {store,dir}=setup(),sourcePath=join(dir,"briefs.jsonl"),decisionSourcePath=join(dir,"decisions-meta.jsonl"),e=envelopeOf();
  await Bun.write(sourcePath,JSON.stringify(e.consultation)+"\n");
  await observeConsultJournal({sourcePath,sourceId:"agent_briefs",store,observedAtMs:2000});
  e.decisionMetadata.recordedAtMs=2500;
  await Bun.write(decisionSourcePath,JSON.stringify({cycleId:e.consultation.cycleId,atMs:e.consultation.atMs,metadata:e.decisionMetadata})+"\n");
  const first=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:3000});
  expect(first.prospective).toMatchObject({ok:true,status:"observing_pending",degraded:false,report:{pendingExperienceCount:1,matureOutcomes:0,qualifiedABActive:false,financialExecutor:false,
    latest:{cycleId:e.consultation.cycleId,decisionAtMs:1400,firstObservedAtMs:2000,metadataFirstObservedAtMs:3000}}});
  if(!first.prospective.ok)throw new Error(first.prospective.code);
  expect(Object.hasOwn(first.prospective.report,"pendingExperiences")).toBe(false);
  const again=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:9000});
  if(!again.prospective.ok)throw new Error(again.prospective.code);
  expect(again.prospective.report.latest).toEqual(first.prospective.report.latest);
});

test("empty, partial and invalid producer streams have explicit distinct report states", async () => {
  const {store,dir}=setup(), sourcePath=join(dir,"briefs.jsonl"), decisionSourcePath=join(dir,"decisions-meta.jsonl");
  await Bun.write(sourcePath,JSON.stringify(source())+"\n");
  for(const [body,status] of [["","empty"],["{partial","partial"],["{bad}\n","invalid"]] as const) {
    await Bun.write(decisionSourcePath,body);
    expect((await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:2000})).prospective).toMatchObject({ok:true,status,report:{pendingExperienceCount:0,qualifiedABActive:false}});
  }
});

test("a conflicting producer variant removes the previous eligible compact decision", async () => {
  const {store,dir}=setup(), sourcePath=join(dir,"briefs.jsonl"), decisionSourcePath=join(dir,"decisions-meta.jsonl"), a=envelopeOf();
  const b=structuredClone(a);b.decisionMetadata.decisionVersion="c".repeat(64);
  await Bun.write(sourcePath,JSON.stringify(a.consultation)+"\n");
  await Bun.write(decisionSourcePath,JSON.stringify(a)+"\n"+JSON.stringify(b)+"\n");
  expect((await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:2000})).prospective).toMatchObject({ok:true,status:"quarantined",degraded:true,report:{pendingExperienceCount:0,latest:null,conflictingCycleIds:[a.consultation.cycleId]}});
});

test("a source variant first discovered in prospective invalidates the earlier raw latest too", async () => {
  const {store,dir}=setup(),sourcePath=join(dir,"briefs.jsonl"),decisionSourcePath=join(dir,"decisions-meta.jsonl"),row=source();
  await Bun.write(sourcePath,JSON.stringify(row)+"\n");
  const variant={...row,physicalRequests:9};
  await Bun.write(decisionSourcePath,JSON.stringify(envelopeOf(variant))+"\n");
  const result=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:2000});
  expect(result.consultation).toMatchObject({ok:true,report:{latest:null,conflictingCycleIds:[row.cycleId]}});
  expect(result.prospective).toMatchObject({ok:true,status:"quarantined",report:{latest:null,pendingExperienceCount:0}});
});

test("a partial prospective write still invalidates the raw latest when source conflict was persisted", async () => {
  const {db,store,dir}=setup(),sourcePath=join(dir,"briefs.jsonl"),decisionSourcePath=join(dir,"decisions-meta.jsonl"),row=source();
  await Bun.write(sourcePath,JSON.stringify(row)+"\n");
  await Bun.write(decisionSourcePath,JSON.stringify(envelopeOf({...row,physicalRequests:9}))+"\n");
  db.exec("CREATE TRIGGER fail_metadata BEFORE INSERT ON evolution_consult_captures WHEN NEW.source_id='agent_decision_evidence' BEGIN SELECT RAISE(ABORT,'private error'); END");
  const result=await observeEvolutionJournals({sourcePath,decisionSourcePath,store,observedAtMs:2000});
  expect(result.consultation).toMatchObject({ok:true,report:{latest:null,conflictingCycleIds:[row.cycleId]}});
  expect(result.prospective).toMatchObject({ok:false,code:"capture_store_failed"});
});

test("a thrown capture port produces diagnostics for both streams instead of escaping", async () => {
  const {store,dir}=setup(),sourcePath=join(dir,"briefs.jsonl"),decisionSourcePath=join(dir,"decisions-meta.jsonl"),e=envelopeOf();
  await Bun.write(sourcePath,JSON.stringify(e.consultation)+"\n");
  await Bun.write(decisionSourcePath,JSON.stringify(e)+"\n");
  const throwing:ConsultCaptureStore={list:store.list,capture(){throw new Error("private database detail");}};
  const result=await observeEvolutionJournals({sourcePath,decisionSourcePath,store:throwing,observedAtMs:2000});
  expect(result.consultation).toMatchObject({ok:false,code:"capture_store_failed"});
  expect(result.prospective).toMatchObject({ok:false,code:"capture_store_failed"});
});

test("raw rereads with a clock before first local availability do not expose a future capture", async () => {
  const {store,dir}=setup(),sourcePath=join(dir,"briefs.jsonl");
  await Bun.write(sourcePath,JSON.stringify(source())+"\n");
  await observeConsultJournal({sourcePath,sourceId:"agent_briefs",store,observedAtMs:4000});
  expect(await observeConsultJournal({sourcePath,sourceId:"agent_briefs",store,observedAtMs:3000})).toMatchObject({ok:false,code:"observation_invalid"});
});

test("actual prefixed buy records flow through file, SQLite and adapter without financial outcomes", async () => {
  const { store, dir } = setup(), path = join(dir, "briefs.jsonl");
  const body = JSON.stringify(source()) + "\n";
  await Bun.write(path, body);
  const first = await observeConsultJournal({ sourcePath: path, sourceId: "agent_briefs", store, observedAtMs: 2000 });
  expect(first).toMatchObject({ ok: true, report: { inserted: 1, deduplicated: 0, validConsultations: 1, memoryEpisodesProduced: 0,
    latest: { cycleId: "fixture-cycle", cycleStartedAtMs: 1000, decisionAtMs: null, firstObservedAtMs: 2000, qualification: { status: "legacy" }, episodes: [{ requested: "buy_tenth", applied: "buy_tenth", experience: null }] } } });
  expect(await Bun.file(path).text()).toBe(body);
  const reread = await observeConsultJournal({ sourcePath: path, sourceId: "agent_briefs", store, observedAtMs: 8000 });
  expect(reread).toMatchObject({ ok: true, report: { inserted: 0, deduplicated: 1, latest: { firstObservedAtMs: 2000 } } });
});

test("a partial final line is deferred, malformed evidence is counted and a later completion is captured", async () => {
  const { store, dir } = setup(), path = join(dir, "briefs.jsonl");
  const second = JSON.stringify(source("second"));
  await Bun.write(path, JSON.stringify(source()) + "\n{bad}\n{}\n" + second.slice(0,50));
  expect(await observeConsultJournal({ sourcePath: path, sourceId: "agent_briefs", store, observedAtMs: 2000 })).toMatchObject({ ok: true, report: {
    inserted: 1, invalidJsonLines: 1, invalidConsultations: 1, source: { incompleteFinalLine: true } } });
  await Bun.write(path, JSON.stringify(source()) + "\n" + second + "\n");
  expect(await observeConsultJournal({ sourcePath: path, sourceId: "agent_briefs", store, observedAtMs: 8000 })).toMatchObject({ ok: true, report: {
    inserted: 1, deduplicated: 1, latest: { cycleId: "second", firstObservedAtMs: 8000 } } });
});

test("source conflicts remain visible and never become a memory eligible observation", async () => {
  const { store, dir } = setup(), path = join(dir, "briefs.jsonl"), changed = { ...source(), physicalRequests: 2 };
  await Bun.write(path, JSON.stringify(source()) + "\n" + JSON.stringify(changed) + "\n");
  expect(await observeConsultJournal({ sourcePath: path, sourceId: "agent_briefs", store, observedAtMs: 2000 })).toMatchObject({ ok: true, report: {
    inserted: 2, conflictingCycleIds: ["fixture-cycle"], memoryEpisodesProduced: 0, latest: null } });
});

test("bounded tails explicitly disclose omitted history and do not parse the cut first line", async () => {
  const { store, dir } = setup(), path = join(dir, "briefs.jsonl"), last = JSON.stringify(source("last")) + "\n";
  await Bun.write(path, JSON.stringify(source("old")) + "\n" + last);
  expect(await observeConsultJournal({ sourcePath: path, sourceId: "agent_briefs", store, observedAtMs: 2000, maxBytes: last.length + 20 })).toMatchObject({ ok: true, report: {
    inserted: 1, source: { truncated: true }, latest: { cycleId: "last" } } });
});

test("a bounded tail beginning exactly at a line boundary retains that complete record", async () => {
  const { store, dir } = setup(), path = join(dir, "briefs.jsonl"), last = JSON.stringify(source("last")) + "\n";
  await Bun.write(path, JSON.stringify(source("old")) + "\n" + last);
  expect(await observeConsultJournal({ sourcePath: path, sourceId: "agent_briefs", store, observedAtMs: 2000, maxBytes: new TextEncoder().encode(last).length })).toMatchObject({ ok: true, report: {
    inserted: 1, source: { truncated: true }, latest: { cycleId: "last" } } });
});

test("missing source and invalid observation options are failures, never a healthy empty journal", async () => {
  const { store, dir } = setup(), sourcePath = join(dir, "missing.jsonl");
  expect(await observeConsultJournal({ sourcePath, sourceId: "agent_briefs", store, observedAtMs: 2000 })).toMatchObject({ ok: false, code: "source_missing" });
  expect(await observeConsultJournal({ sourcePath, sourceId: "agent_briefs", store, observedAtMs: NaN })).toMatchObject({ ok: false, code: "request_invalid" });
});

test("worker output must resolve outside the financial home before any directory or file is created", () => {
  const { dir } = setup();
  expect(resolveObserverPaths(dir, join(dir, "data", "evolution"))).toEqual({ ok: false, code: "output_inside_financial_home" });
  expect(resolveObserverPaths(dir, dir)).toEqual({ ok: false, code: "output_inside_financial_home" });
  expect(resolveObserverPaths(dir, join(dir, "..", "separate-evolution-fixture"))).toMatchObject({ ok: true });
  expect(resolveObserverPaths("relative-home", "relative-output")).toMatchObject({ ok: false, code: "path_invalid" });
});

test("SQLite sidecars, linked artifacts and hardlinked files cannot escape the dedicated output", async () => {
  const home = mkdtempSync(join(tmpdir(), "inonu-observer-home-fixture-"));
  const out = mkdtempSync(join(tmpdir(), "inonu-observer-out-fixture-"));
  symlinkSync(home, join(out, "consult-captures.sqlite-journal"), "junction");
  expect(resolveObserverPaths(home, out)).toEqual({ ok: false, code: "output_inside_financial_home" });
  const out2 = mkdtempSync(join(tmpdir(), "inonu-observer-out-fixture-"));
  const original = join(home, "existing.sqlite");
  await Bun.write(original, "private fixture bytes");
  linkSync(original, join(out2, "consult-captures.sqlite"));
  expect(resolveObserverPaths(home, out2)).toEqual({ ok: false, code: "path_invalid" });
  expect(await Bun.file(original).text()).toBe("private fixture bytes");
});
