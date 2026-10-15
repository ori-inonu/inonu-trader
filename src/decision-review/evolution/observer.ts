import { Database } from "bun:sqlite";
import { closeSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { captureAgentConsult, type CapturedAgentConsult } from "./agent-episode";
import { createConsultCaptureStore, type ConsultCaptureStore } from "./capture-store";
import { readJournalTail, type JournalReadOptions } from "./journal-reader";
import { observeDecisionJournal, type DecisionJournalFailure, type DecisionJournalReport } from "./decision-journal";

/** Reads a source journal and writes only through a supplied capture store.
 * No market/provider requests, model, signer, executor or financial-state writer.
 * Legacy source timing is never upgraded into prospective memory evidence. */
export interface ConsultObservationReport {
  readonly schemaVersion: 1;
  readonly observedAtMs: number;
  readonly evidence: "local_journal_capture";
  readonly sourceAuthenticated: false;
  readonly source: { readonly id: string; readonly bytes: number; readonly modifiedAtMs: number; readonly truncated: boolean; readonly incompleteFinalLine: boolean; readonly stability: "metadata_unchanged" };
  readonly validConsultations: number;
  readonly invalidJsonLines: number;
  readonly invalidConsultations: number;
  readonly inserted: number;
  readonly deduplicated: number;
  readonly conflictingCycleIds: readonly string[];
  readonly memoryEpisodesProduced: 0;
  readonly latest: CapturedAgentConsult | null;
}
export type ObserverFailure = { readonly ok: false; readonly code: "request_invalid" | "source_missing" | "source_unreadable" | "source_changed_during_read" | "capture_store_failed" | "observation_invalid"; readonly capturedBeforeFailure: number };
type ConsultObservationResult = { readonly ok: true; readonly report: ConsultObservationReport } | ObserverFailure;
type CompactLatest = Pick<CapturedAgentConsult,"cycleId"|"cycleStartedAtMs"|"decisionAtMs"|"firstObservedAtMs"|"metadataFirstObservedAtMs"|"captureHash"|"sourceRecordHash"|"sourceSnapshotHash">;
export type ProspectiveObservationResult = { readonly ok: true; readonly status: "empty"|"partial"|"awaiting_source"|"observing_pending"|"quarantined"|"rejected"|"invalid"; readonly degraded: boolean;
  readonly report: Omit<DecisionJournalReport,"pendingExperiences"|"latest"> & {readonly latest:CompactLatest|null} } | DecisionJournalFailure;

/** One worker and one dedicated store, no financial executor. Keep the raw
 * stream's diagnostic contract while exposing prospective availability
 * separately. Reports omit full experience arrays to bound recurring I/O;
 * original immutable envelopes remain in the capture database. */
export async function observeEvolutionJournals(options: JournalReadOptions & {readonly decisionSourcePath:string;readonly store:ConsultCaptureStore}):Promise<{readonly consultation:ConsultObservationResult;readonly prospective:ProspectiveObservationResult}> {
  let consultation=await observeConsultJournal({...options,sourceId:"agent_briefs"});
  const result=await observeDecisionJournal({...options,sourcePath:options.decisionSourcePath,arm:"A"});
  // The prospective pass can discover a variant of a raw record already
  // captured above. Do not publish that earlier latest as conflict-free.
  if(consultation.ok && consultation.report.latest!==null) {
    const previous=consultation.report.latest;
    const checked=captureStored(options.store,"agent_briefs",previous.sourceRecord,consultation.report.observedAtMs);
    if(!checked.ok || checked.record.sourceRecordHash!==previous.sourceRecordHash)consultation=fail("capture_store_failed",consultation.report.inserted);
    else if(checked.record.firstObservedAtMs>consultation.report.observedAtMs)consultation=fail("observation_invalid",consultation.report.inserted);
    else if(checked.record.cycleConflict)consultation={ok:true,report:{...consultation.report,latest:null,conflictingCycleIds:[...new Set([...consultation.report.conflictingCycleIds,previous.cycleId])].sort()}};
  }
  if(!result.ok)return {consultation,prospective:result};
  const {pendingExperiences: _pending, latest, ...report}=result.report;
  const degraded=report.invalidJsonLines+report.invalidEnvelopes+report.armMismatchLines+report.metadataRejectedEnvelopes+report.quarantinedEnvelopes+report.invalidReferences+report.metadataRejectedReferences+report.quarantinedReferences>0;
  const status: Extract<ProspectiveObservationResult,{ok:true}>["status"] = report.boundEnvelopes+report.boundReferences>0 ? "observing_pending" : report.quarantinedEnvelopes+report.quarantinedReferences>0 ? "quarantined" : report.metadataRejectedEnvelopes+report.metadataRejectedReferences>0 ? "rejected" : degraded ? "invalid" : report.awaitingSourceReferences>0 ? "awaiting_source" : report.source.incompleteFinalLine ? "partial" : "empty";
  const compact:CompactLatest|null=latest===null?null:{cycleId:latest.cycleId,cycleStartedAtMs:latest.cycleStartedAtMs,decisionAtMs:latest.decisionAtMs,
    firstObservedAtMs:latest.firstObservedAtMs,metadataFirstObservedAtMs:latest.metadataFirstObservedAtMs,captureHash:latest.captureHash,
    sourceRecordHash:latest.sourceRecordHash,sourceSnapshotHash:latest.sourceSnapshotHash};
  return {consultation,prospective:{ok:true,status,degraded,report:{...report,latest:compact}}};
}
const fail = (code: ObserverFailure["code"], capturedBeforeFailure = 0): ObserverFailure => ({ ok: false, code, capturedBeforeFailure });
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const captureStored=(store:ConsultCaptureStore,id:string,raw:unknown,at:number):ReturnType<ConsultCaptureStore["capture"]>=>{
  try{return store.capture(id,raw,at);}catch{return{ok:false,code:"storage_unavailable"};}
};

export async function observeConsultJournal(options: {
  readonly sourcePath: string; readonly sourceId: string; readonly store: ConsultCaptureStore;
  /** Pass a function in a live host, evaluated AFTER the source read. A number
   * is a caller-reported clock for deterministic replay/tests. */
  readonly observedAtMs: number | (() => number); readonly maxBytes?: number;
}): Promise<ConsultObservationResult> {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(options.sourceId)) return fail("request_invalid");
  const tail=await readJournalTail(options);
  if(!tail.ok)return fail(tail.code);
  const {observedAtMs,lines}=tail;
  let invalidJsonLines = 0, invalidConsultations = 0, inserted = 0, deduplicated = 0;
  const captures: CapturedAgentConsult[] = [], conflicts = new Set<string>();
  for (const line of lines) {
    if (!line.trim()) continue;
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { invalidJsonLines++; continue; }
    const checked = captureAgentConsult(raw, { firstObservedAtMs: observedAtMs });
    if (!checked.ok) { invalidConsultations++; continue; }
    const saved = captureStored(options.store,options.sourceId, raw, observedAtMs);
    if (!saved.ok) return fail("capture_store_failed", inserted);
    if(saved.record.firstObservedAtMs>observedAtMs)return fail("observation_invalid",inserted);
    if (saved.inserted) inserted++; else deduplicated++;
    if (saved.record.cycleConflict) conflicts.add(saved.record.cycleId);
    const captured = captureAgentConsult(saved.record.rawRecord, { firstObservedAtMs: saved.record.firstObservedAtMs });
    if (!captured.ok || captured.capture.sourceRecordHash !== saved.record.sourceRecordHash) return fail("capture_store_failed", inserted);
    captures.push(captured.capture);
  }
  // A conflict discovered later in this read invalidates an earlier variant too.
  // Ordering is by source cycle clock, not JSONL arrival after a rewrite.
  const eligible = captures.filter(c => !conflicts.has(c.cycleId)).sort((a,b) => a.cycleStartedAtMs - b.cycleStartedAtMs || a.cycleId.localeCompare(b.cycleId));
  return { ok: true, report: { schemaVersion: 1, observedAtMs, evidence: "local_journal_capture", sourceAuthenticated: false,
    source: { id: options.sourceId, ...tail.source },
    validConsultations: captures.length, invalidJsonLines, invalidConsultations, inserted, deduplicated,
    conflictingCycleIds: [...conflicts].sort(), memoryEpisodesProduced: 0, latest: eligible.at(-1) ?? null } };
}

function physicalPath(path: string): string {
  try { lstatSync(path); return realpathSync.native(path); }
  catch (e) {
    if ((e as { code?: string }).code !== "ENOENT") throw e;
    // A dangling symlink must fail, rather than being treated as a new file.
    try { if (lstatSync(path).isSymbolicLink()) throw new Error("dangling_link"); } catch (e) { if ((e as { code?: string }).code !== "ENOENT") throw e; }
    const parent = dirname(path);
    if (parent === path) throw new Error("path_missing");
    return join(physicalPath(parent), basename(path));
  }
}
const inside = (home: string, target: string) => {
  const rel = relative(home, target);
  return rel === "" || !isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep);
};
/** Resolve existing symlinks/junctions before permitting any output creation. */
export function resolveObserverPaths(home: string, output: string): { readonly ok: true; readonly home: string; readonly output: string; readonly sourcePath: string;readonly decisionSourcePath:string; readonly databasePath: string; readonly reportPath: string } | { readonly ok: false; readonly code: "path_invalid" | "output_inside_financial_home" } {
  if (!isAbsolute(home) || !isAbsolute(output)) return { ok: false, code: "path_invalid" };
  try {
    const actualHome = realpathSync.native(home), actualOut = physicalPath(resolve(output));
    const names = ["consult-captures.sqlite", "latest.json", "latest.next.json", "observer.owner.lock", "observer.session.json", "consult-captures.sqlite-journal", "consult-captures.sqlite-wal", "consult-captures.sqlite-shm"];
    const paths = [actualOut, ...names.map(f => physicalPath(join(actualOut,f)))];
    if (paths.some(p => inside(actualHome, p))) return { ok: false, code: "output_inside_financial_home" };
    for (const name of names) {
      const target = join(actualOut,name), physical = physicalPath(target);
      if (relative(target,physical) !== "") return { ok: false, code: "path_invalid" };
      try {
        const info = lstatSync(target);
        if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) return { ok: false, code: "path_invalid" };
      } catch(e) { if ((e as {code?:string}).code !== "ENOENT") throw e; }
    }
    return { ok: true, home: actualHome, output: actualOut, sourcePath: join(actualHome,"data","agent","briefs.jsonl"),decisionSourcePath:join(actualHome,"data","agent","decisions-meta.jsonl"), databasePath: paths[1]!, reportPath: paths[2]! };
  } catch { return { ok: false, code: "path_invalid" }; }
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2), arg = (name: string) => { const at = args.indexOf(name); return at < 0 ? null : args[at+1] ?? null; };
  const home = arg("--home"), output = arg("--out");
  if (!home || !output) throw new Error("observer_paths_required");
  const interval = Number(arg("--interval-ms") ?? "5000");
  if (!clock(interval) || interval < 1000 || interval > 60000) throw new Error("observer_interval_invalid");
  let paths = resolveObserverPaths(home, output);
  if (!paths.ok) throw new Error(paths.code);
  mkdirSync(paths.output, { recursive: true });
  paths = resolveObserverPaths(home, output); // Recheck after directory creation.
  if (!paths.ok) throw new Error(paths.code);
  const lockPath = join(paths.output,"observer.owner.lock");
  let lock: number;
  try { lock = openSync(lockPath,"wx"); } catch { throw new Error("observer_already_owned"); }
  let db: Database | null = null;
  try {
    db = new Database(paths.databasePath);
    const opened = createConsultCaptureStore(db);
    if (!opened.ok) throw new Error(opened.code);
    await Bun.write(join(paths.output,"observer.session.json"), JSON.stringify({ schemaVersion: 1, pid: process.pid, startedAtMs: Date.now(), financialExecutor: false, intervalMs: interval,prospectiveObservation:true }));
    let stopping = false;
    const stop = () => { stopping = true; };
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
    do {
      const observation=await observeEvolutionJournals({sourcePath:paths.sourcePath,decisionSourcePath:paths.decisionSourcePath,store:opened.store,observedAtMs:()=>Date.now()});
      const result=observation.consultation;
      const recordedAtMs = Date.now();
      const next = join(paths.output,"latest.next.json");
      await Bun.write(next, JSON.stringify({ recordedAtMs, ...result,prospective:observation.prospective,financialExecutor:false,qualifiedABActive:false },null,2) + "\n");
      renameSync(next, paths.reportPath);
      console.log(JSON.stringify({...result.ok ? { ok: true, observedAtMs: result.report.observedAtMs, inserted: result.report.inserted, deduplicated: result.report.deduplicated, invalid: result.report.invalidConsultations + result.report.invalidJsonLines, conflicts: result.report.conflictingCycleIds.length, memoryEpisodesProduced: 0 } : result,
        prospectiveStatus:observation.prospective.ok?observation.prospective.status:observation.prospective.code,pendingExperienceCount:observation.prospective.ok?observation.prospective.report.pendingExperienceCount:0}));
      if (args.includes("--once") || stopping || await Bun.file(join(paths.output,"observer.stop")).exists()) break;
      await new Promise(r => setTimeout(r, interval));
    } while (!stopping);
    process.off("SIGINT",stop); process.off("SIGTERM",stop);
  } finally { db?.close(); closeSync(lock); unlinkSync(lockPath); }
}

if (import.meta.main) { try { await main(); } catch { console.error("evolution_observer_failed"); process.exitCode = 1; } }
