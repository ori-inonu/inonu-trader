import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, watch as watchFs, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { acquireLease } from "./lease-lock";
import { projectRoot, resolveSafeStateDirectory } from "./core";
import type { SddTask, SddTaskPlan } from "./scheduler";
import { specFingerprint, type DecisionSpec } from "../../src/consensus/engine";
import { parseSpec } from "../../src/consensus/spec";

export interface CodexEvidence { path: string; sha256: string; summary: string }
export interface AcceptanceCoverage { criterion: string; verificationIndices: number[]; evidencePaths: string[] }
export interface CodexResult { exitCode: number | null; sessionId: string | null; taskId: string; outcome: "completed" | "blocked" | "no_progress" | "decision_required"; summary: string; acceptanceCoverage: AcceptanceCoverage[]; evidence: CodexEvidence[]; reason: string | null; decisionSpec: unknown | null; outputHash: string }
export interface PendingDecision { specHash: string; status: "requesting" | "ready"; fallbackOptionId: string; fallbackSummary: string; spec?: DecisionSpec; selectedId?: string; selectedSummary?: string; method?: "jev" | "sem-jev"; receiptHash?: string | null; fallbackReason?: string; continuationPrompt?: string }
export interface RunTaskState { id: string; status: "todo" | "running" | "done" | "blocked"; attempts: number; evidence: CodexEvidence[]; decisions: { specHash: string; selectedId: string; method: "jev" | "sem-jev"; receiptHash: string | null }[]; pendingDecision?: PendingDecision; reason?: string; progressFingerprint?: string; verification?: { argv: string[]; exitCode: number | null; outputHash: string; summary: string }[]; acceptanceCoverage?: AcceptanceCoverage[] }
export interface RunDecision { specHash: string; selectedId: string; source: "jev" | "sem-jev"; receiptHash: string | null; at: number; fallbackReason?: string }
export interface AutonomyState {
  version: 1; project: string; objectiveId: string; objective: string; taskPath: string; taskPlanHash: string;
  status: "running" | "paused" | "cancelled" | "complete" | "blocked"; tasks: RunTaskState[];
  activeTaskId: string | null; hostSessionId: string | null; activePid: number | null; activeResultPath: string | null;
  activeReturn?: CodexResult;
  decisions: RunDecision[]; startedAt: number; updatedAt: number; lastOutputHash: string | null; lastError: string | null;
  scopeBaseline: Record<string, { status: string; size: number | null; mtimeMs: number | null }>;
  scopeCaptured?: boolean;
  cancelRequested: boolean; pauseRequested: boolean; jevCircuitBroken: boolean; jevCircuitReason: string | null;
}
export interface ControlRequest { action: "pause" | "cancel" | "resume"; nonce: string; requestedAt: number }
const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const safeId = (id: string) => { if (!/^[A-Za-z0-9_-]{1,48}$/.test(id)) throw new Error("invalid objective id"); return id; };
const runFileName = (canonicalProject: string, objectiveId: string) => hash(canonicalProject.toLowerCase()).slice(0, 24) + "." + safeId(objectiveId) + ".run.json";
export function runStatePath(project: string, objectiveId: string, home = homedir()): string {
  const canonical = projectRoot(project), stateDir = resolveSafeStateDirectory(true, canonical, home)!;
  return join(stateDir, runFileName(canonical, objectiveId));
}
const atomicWrite = (path: string, contents: string) => { const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`; writeFileSync(tmp, contents, { flag: "wx", mode: 0o600 }); try { renameSync(tmp, path); } finally { try { unlinkSync(tmp); } catch {} } };
export function createRunState(plan: SddTaskPlan, project: string, now = Date.now()): AutonomyState {
  return { version: 1, project: projectRoot(project), objectiveId: plan.id, objective: plan.objective, taskPath: plan.sourcePath, taskPlanHash: plan.sourceHash, status: "running", tasks: plan.tasks.map((task) => ({ id: task.id, status: task.fenced ? "blocked" : task.initialStatus ?? "todo", attempts: 0, evidence: [], decisions: [], ...(task.fenced ? { reason: "fenced task requires owner authorization" } : task.initialStatus === "blocked" ? { reason: "blocked in authorized plan" } : {}) })), activeTaskId: null, hostSessionId: null, activePid: null, activeResultPath: null, decisions: [], startedAt: now, updatedAt: now, lastOutputHash: null, lastError: null, scopeBaseline: {}, cancelRequested: false, pauseRequested: false, jevCircuitBroken: false, jevCircuitReason: null };
}
export function loadRunState(path: string): AutonomyState | null {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) throw new Error("run state invalid");
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("run state invalid"); }
  assertStateShape(value);
  return value;
}
export function saveRunState(path: string, state: AutonomyState): void { assertStateShape(state); if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("run state symlink refused"); state.updatedAt = Date.now(); atomicWrite(path, JSON.stringify(state, null, 2) + "\n"); }
export const acquireRunLock = (path: string) => acquireLease(path + ".runner.lock", { leaseMs: 30_000 });
const controlPath = (path: string) => path + ".control.json";
export function setRunControl(path: string, action: ControlRequest["action"]): void {
  const file = controlPath(path), release = acquireLease(file + ".lock");
  try { const existing = readRunControl(path); if (existing?.action === "cancel" && action !== "cancel") throw new Error("cancel request is terminal"); atomicWrite(file, JSON.stringify({ action, nonce: randomUUID(), requestedAt: Date.now() }) + "\n"); }
  finally { release(); }
}
export function readRunControl(path: string): ControlRequest | null {
  const file = controlPath(path); if (!existsSync(file)) return null;
  try {
    const stat = lstatSync(file, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) throw new Error();
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!fields(value, ["action", "nonce", "requestedAt"]) || !["pause", "cancel", "resume"].includes(value.action as string) || !string(value.nonce) || !value.nonce || !timestamp(value.requestedAt)) throw new Error();
    return value as unknown as ControlRequest;
  } catch { throw new Error("run control invalid"); }
}
export function clearRunControl(path: string): boolean {
  const file = controlPath(path), release = acquireLease(file + ".lock");
  try { const request = readRunControl(path); if (request?.action === "cancel") return false; if (existsSync(file) && !lstatSync(file).isSymbolicLink()) unlinkSync(file); return true; }
  finally { release(); }
}
export function listRunStates(project: string, home = homedir()): Pick<AutonomyState, "objectiveId" | "status" | "tasks" | "activeTaskId">[] {
  const canonical = projectRoot(project), dir = resolveSafeStateDirectory(false, canonical, home); if (!dir) return [];
  const prefix = hash(canonical.toLowerCase()).slice(0, 24) + ".", output: Pick<AutonomyState, "objectiveId" | "status" | "tasks" | "activeTaskId">[] = [];
  for (const name of readdirSync(dir).filter((item) => item.startsWith(prefix) && item.endsWith(".run.json"))) {
    try { const state = loadRunState(join(dir, name)); if (state && state.project === canonical) output.push({ objectiveId: state.objectiveId, status: state.status, tasks: state.tasks, activeTaskId: state.activeTaskId }); } catch { /* skip invalid private state */ }
  }
  return output;
}

export function watchRunControl(path: string, callback: (request: ControlRequest) => void): () => void {
  const file = controlPath(path), watcher = watchFs(dirname(file), { persistent: false }, () => { try { const request = readRunControl(path); if (request) callback(request); } catch {} });
  return () => watcher.close();
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fields = (v: unknown, required: string[], optional: string[] = []): v is Record<string, unknown> => object(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const string = (v: unknown): v is string => typeof v === "string";
const id = (v: unknown): v is string => string(v) && /^[A-Za-z0-9_-]{1,40}$/.test(v);
const digest = (v: unknown): v is string => string(v) && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const timestamp = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const nullableString = (v: unknown) => v === null || string(v);
const nullableHash = (v: unknown) => v === null || digest(v);
const session = (v: unknown) => v === null || (string(v) && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v));
const method = (v: unknown) => v === "jev" || v === "sem-jev";
const optional = (v: Record<string, unknown>, key: string, valid: (value: unknown) => boolean) => v[key] === undefined || valid(v[key]);
const safeRelative = (path: string) => path.length > 0 && !isAbsolute(path) && !path.includes(":") && !path.includes("\0") && !path.split(/[\\/]/).includes("..") && !/(?:^|[\\/])(?:\.env[^\\/]*|data|\.git)(?:[\\/]|$)/i.test(path);
const evidence = (v: unknown) => fields(v, ["path", "sha256", "summary"]) && string(v.path) && safeRelative(v.path) && digest(v.sha256) && string(v.summary);
const coverage = (v: unknown) => fields(v, ["criterion", "verificationIndices", "evidencePaths"]) && string(v.criterion) && Array.isArray(v.verificationIndices) && v.verificationIndices.every(integer) && Array.isArray(v.evidencePaths) && v.evidencePaths.every(p => string(p) && safeRelative(p));
const verification = (v: unknown) => fields(v, ["argv", "exitCode", "outputHash", "summary"]) && Array.isArray(v.argv) && v.argv.length > 0 && v.argv.every(string) && (v.exitCode === null || (typeof v.exitCode === "number" && Number.isSafeInteger(v.exitCode))) && digest(v.outputHash) && string(v.summary);
const taskDecision = (v: unknown) => fields(v, ["specHash", "selectedId", "method", "receiptHash"]) && digest(v.specHash) && id(v.selectedId) && method(v.method) && nullableHash(v.receiptHash);
function pendingDecision(v: unknown): boolean {
  const validSpec = (value: unknown) => { try { parseSpec(value); return true; } catch { return false; } };
  if (!fields(v, ["specHash", "status", "fallbackOptionId", "fallbackSummary"], ["spec", "selectedId", "selectedSummary", "method", "receiptHash", "fallbackReason", "continuationPrompt"]) || !digest(v.specHash) || !id(v.fallbackOptionId) || !string(v.fallbackSummary) || !optional(v, "fallbackReason", string) || !optional(v, "continuationPrompt", string) || !optional(v, "spec", validSpec)) return false;
  if (v.status === "requesting") return ["selectedId", "selectedSummary", "method", "receiptHash", "continuationPrompt"].every(k => v[k] === undefined);
  return v.status === "ready" && id(v.selectedId) && string(v.selectedSummary) && method(v.method) && nullableHash(v.receiptHash);
}
function taskState(v: unknown): boolean {
  return fields(v, ["id", "status", "attempts", "evidence", "decisions"], ["pendingDecision", "reason", "progressFingerprint", "verification", "acceptanceCoverage"]) && id(v.id) && string(v.status) && ["todo", "running", "done", "blocked"].includes(v.status) && integer(v.attempts) &&
    Array.isArray(v.evidence) && v.evidence.every(evidence) && Array.isArray(v.decisions) && v.decisions.every(taskDecision) && optional(v, "pendingDecision", pendingDecision) && optional(v, "reason", string) && optional(v, "progressFingerprint", digest) &&
    optional(v, "verification", x => Array.isArray(x) && x.every(verification)) && optional(v, "acceptanceCoverage", x => Array.isArray(x) && x.every(coverage));
}
const runDecision = (v: unknown) => fields(v, ["specHash", "selectedId", "source", "receiptHash", "at"], ["fallbackReason"]) && digest(v.specHash) && id(v.selectedId) && method(v.source) && nullableHash(v.receiptHash) && timestamp(v.at) && optional(v, "fallbackReason", string);
const scopeEntry = (v: unknown) => fields(v, ["status", "size", "mtimeMs"]) && string(v.status) && (v.size === null || integer(v.size)) && (v.mtimeMs === null || (typeof v.mtimeMs === "number" && Number.isFinite(v.mtimeMs)));
function returnedResult(v: unknown): boolean {
  return fields(v, ["exitCode", "sessionId", "taskId", "outcome", "summary", "acceptanceCoverage", "evidence", "reason", "decisionSpec", "outputHash"]) &&
    (v.exitCode === null || (typeof v.exitCode === "number" && Number.isSafeInteger(v.exitCode))) && session(v.sessionId) && id(v.taskId) &&
    string(v.outcome) && ["completed", "blocked", "no_progress", "decision_required"].includes(v.outcome) && string(v.summary) && nullableString(v.reason) && digest(v.outputHash) &&
    (v.decisionSpec === null || object(v.decisionSpec)) && Array.isArray(v.evidence) && v.evidence.every(e => fields(e, ["path", "sha256", "summary"]) && string(e.path) && digest(e.sha256) && string(e.summary)) &&
    Array.isArray(v.acceptanceCoverage) && v.acceptanceCoverage.every(c => fields(c, ["criterion", "verificationIndices", "evidencePaths"]) && string(c.criterion) && Array.isArray(c.verificationIndices) && c.verificationIndices.every(integer) && Array.isArray(c.evidencePaths) && c.evidencePaths.every(string));
}
function assertStateShape(v: unknown): asserts v is AutonomyState {
  if (!fields(v, ["version", "project", "objectiveId", "objective", "taskPath", "taskPlanHash", "status", "tasks", "activeTaskId", "hostSessionId", "activePid", "activeResultPath", "decisions", "startedAt", "updatedAt", "lastOutputHash", "lastError", "scopeBaseline", "cancelRequested", "pauseRequested", "jevCircuitBroken", "jevCircuitReason"], ["activeReturn", "scopeCaptured"]) || !optional(v, "activeReturn", returnedResult) || !optional(v, "scopeCaptured", x => typeof x === "boolean") || v.version !== 1 || !string(v.project) || !isAbsolute(v.project) || !string(v.objectiveId) || !/^[A-Za-z0-9_-]{1,48}$/.test(v.objectiveId) || !string(v.objective) || !string(v.taskPath) || !isAbsolute(v.taskPath) || !digest(v.taskPlanHash) || !string(v.status) || !["running", "paused", "cancelled", "complete", "blocked"].includes(v.status) ||
    !Array.isArray(v.tasks) || v.tasks.length === 0 || !v.tasks.every(taskState) || !(v.activeTaskId === null || id(v.activeTaskId)) || !session(v.hostSessionId) || !(v.activePid === null || (integer(v.activePid) && v.activePid > 0)) || !(v.activeResultPath === null || (string(v.activeResultPath) && isAbsolute(v.activeResultPath))) ||
    !Array.isArray(v.decisions) || !v.decisions.every(runDecision) || !timestamp(v.startedAt) || !timestamp(v.updatedAt) || !nullableHash(v.lastOutputHash) || !nullableString(v.lastError) || !object(v.scopeBaseline) || !Object.entries(v.scopeBaseline).every(([path, entry]) => safeRelative(path) && scopeEntry(entry)) || typeof v.cancelRequested !== "boolean" || typeof v.pauseRequested !== "boolean" || typeof v.jevCircuitBroken !== "boolean" || !nullableString(v.jevCircuitReason)) throw new Error("run state invalid");
}

const pathKey = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
const spelling = (path: string) => process.platform === "win32" ? path.replace(/\\/g, "/").toLowerCase() : path;
export function assertRunStatePath(path: string, expectedProject: string, objectiveId: string): void {
  try {
    const dir = dirname(path);
    const stat = existsSync(path) ? lstatSync(path, { bigint: true }) : null;
    if (!isAbsolute(path) || spelling(path) !== spelling(resolve(path)) || basename(path) !== runFileName(expectedProject, objectiveId) || basename(dir) !== "projects" || basename(dirname(dir)) !== ".sdd-harness" || pathKey(realpathSync(dir)) !== pathKey(dir) || (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n))) throw new Error();
  } catch { throw new Error("run state binding invalid"); }
}
export function assertRunIdentity(state: AutonomyState, expectedProject: string, objectiveId: string, statePath: string): void {
  assertRunStatePath(statePath, expectedProject, objectiveId);
  if (state.project !== expectedProject || state.objectiveId !== objectiveId) throw new Error("run state binding invalid");
}
export function hasTaskVerification(task: SddTask, proof: Pick<RunTaskState, "evidence" | "verification" | "acceptanceCoverage">): boolean {
  const verifiers = proof.verification ?? [], coverage = proof.acceptanceCoverage ?? [];
  if (verifiers.length !== task.verifyArgv.length || verifiers.some((v, i) => v.exitCode !== 0 || JSON.stringify(v.argv) !== JSON.stringify(task.verifyArgv[i])) || coverage.length !== task.acceptance.length) return false;
  const seen = new Set<string>();
  for (const item of coverage) {
    if (!task.acceptance.includes(item.criterion) || seen.has(item.criterion)) return false;
    seen.add(item.criterion);
    const verified = item.verificationIndices.some(index => Number.isInteger(index) && index >= 0 && index < verifiers.length && verifiers[index]!.exitCode === 0);
    const evidenced = item.evidencePaths.some(path => proof.evidence.some(e => e.path.replace(/\\/g, "/") === path.replace(/\\/g, "/")));
    if (!verified && !evidenced) return false;
  }
  return seen.size === task.acceptance.length;
}
export function assertRunBinding(state: AutonomyState, plan: SddTaskPlan, expectedProject: string, statePath: string): void {
  assertStateShape(state);
  assertRunIdentity(state, expectedProject, plan.id, statePath);
  const source = relative(expectedProject, plan.sourcePath).replace(/\\/g, "/"), tasks = new Map(state.tasks.map(t => [t.id, t]));
  if (!safeRelative(source) || state.objective !== plan.objective || state.taskPath !== plan.sourcePath || state.taskPlanHash !== plan.sourceHash || tasks.size !== plan.tasks.length || state.tasks.length !== plan.tasks.length || plan.tasks.some(t => !tasks.has(t.id) || (t.fenced && tasks.get(t.id)!.status !== "blocked"))) throw new Error("run state binding invalid");
  for (const task of plan.tasks) {
    const record = tasks.get(task.id)!;
    if (record.status === "done" && task.initialStatus !== "done" && (record.attempts < 1 || !hasTaskVerification(task, record))) throw new Error("run state binding invalid");
  }
  const running = state.tasks.filter(t => t.status === "running");
  if (state.activeTaskId === null) {
    if (running.length || state.activePid !== null || state.hostSessionId !== null || state.activeResultPath !== null) throw new Error("run state binding invalid");
  } else if (running.length !== 1 || running[0]!.id !== state.activeTaskId || running[0]!.attempts < 1 || ["complete", "blocked"].includes(state.status) || (state.activePid !== null && state.activeResultPath === null)) throw new Error("run state binding invalid");
  if (state.status === "complete" && state.tasks.some(t => t.status !== "done")) throw new Error("run state binding invalid");
  if (state.activeReturn && (state.activeTaskId === null || state.activeResultPath === null || state.activePid !== null || state.activeReturn.taskId !== state.activeTaskId || state.activeReturn.sessionId !== state.hostSessionId || state.activeReturn.outputHash !== state.lastOutputHash)) throw new Error("run state binding invalid");
  for (const task of state.tasks) {
    const pending = task.pendingDecision;
    if (!pending) continue;
    if (pending.spec) {
      const spec = parseSpec(pending.spec), allowed = (id: string | undefined) => spec.options.some(option => option.id === id && !spec.forbidden?.includes(option.id));
      if (specFingerprint(spec) !== pending.specHash || pending.fallbackOptionId !== spec.facts.semJevFallbackOptionId || !allowed(pending.fallbackOptionId) || (pending.status === "ready" && !allowed(pending.selectedId))) throw new Error("run state binding invalid");
    }
    if (task.id !== state.activeTaskId || task.status !== "running" || state.hostSessionId === null ||
      (pending.status === "requesting" && task.decisions.some(d => d.specHash === pending.specHash)) ||
      (pending.status === "ready" && !task.decisions.some(d => d.specHash === pending.specHash && d.selectedId === pending.selectedId && d.method === pending.method && d.receiptHash === pending.receiptHash))) throw new Error("run state binding invalid");
  }
  if (state.activeResultPath !== null) {
    const path = state.activeResultPath, prefix = `${plan.id}-${state.activeTaskId}-`, name = basename(path);
    if (spelling(path) !== spelling(join(dirname(statePath), name)) || !name.startsWith(prefix) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.result\.json$/.test(name.slice(prefix.length))) throw new Error("run state binding invalid");
    if (existsSync(path)) {
      const stat = lstatSync(path, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || pathKey(realpathSync(path)) !== pathKey(path)) throw new Error("run state binding invalid");
    }
  }
}
