import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseSpec } from "../../src/consensus/spec";
import { specFingerprint, type DecisionSpec } from "../../src/consensus/engine";
import { runStatePath, loadRunState, saveRunState, createRunState, acquireRunLock, readRunControl, clearRunControl, setRunControl, watchRunControl, assertRunStatePath, assertRunIdentity, assertRunBinding, hasTaskVerification, type AutonomyState, type CodexResult } from "./runner-state";
import { projectRoot } from "./core";
import { loadTaskPlan, eligibleTaskSet, objectiveTerminal, propagateBlockedDependencies, type SddTask, type SddTaskPlan } from "./scheduler";
import { chooseNextTask, decideTaskSpec, type TaskChoice } from "./jev-client";
import { executeCodexTask, readCodexResultFile, workerEnvironment, type CodexRun } from "./codex-adapter";
import { allowedPath, captureWorkspaceStatus, unauthorizedChanges, type WorkSnapshot } from "./workspace-scope";


export interface VerifyResult { argv: string[]; exitCode: number | null; outputHash: string; summary: string }
export interface RunnerDependencies {
  execute: (request: CodexRun) => Promise<CodexResult>;
  chooseNext: (plan: SddTaskPlan, completed: string[], eligible: SddTask[]) => Promise<{ choice: TaskChoice; decisions: TaskChoice[] }>;
  decideSpec: (spec: DecisionSpec) => Promise<TaskChoice>;
  verify: (argv: string[], project: string) => Promise<VerifyResult>;
  processAlive: (pid: number) => boolean;
  captureScope: (project: string) => WorkSnapshot;
  failpoint?: (stage: string) => void;
}
const REPO = projectRoot(resolve(import.meta.dir, "../.."));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const redact = (value: string) => value.replace(/(?:sk-[A-Za-z0-9]{8,}|\b[A-Za-z0-9_-]{24,}\b)/g, "[redacted]").slice(0, 800);
export function taskResultSchemaPath(): string { return join(import.meta.dir, "runner-result.schema.json"); }
function taskById(plan: SddTaskPlan, id: string): SddTask { const task = plan.tasks.find((item) => item.id === id); if (!task) throw new Error("unknown active task"); return task; }
function workerPrompt(plan: SddTaskPlan, task: SddTask, recovery: boolean, project: string, decision?: unknown): string {
  return [
    `Authorized objective: ${plan.objective}`,
    `Objective id: ${plan.id}`,
    `Task id: ${task.id}`, `Task title: ${task.title}`,
    `Dependencies already done: ${task.dependsOn.join(",") || "none"}`,
    `Allowed write paths: ${task.writePaths.join(",")}`,
    `Acceptance: ${task.acceptance.join("; ")}`,
    `Verification argv (run by coordinator after this task): ${JSON.stringify(task.verifyArgv)}`,
    `Recovery: ${recovery ? "inspect current files and existing evidence; continue idempotently; do not repeat completed edits" : "new task session"}`,
    `Read ${join(project, "AGENTS.md")} if present. Read ${join(REPO, "tooling/sdd-harness/shared/WORKFLOW.md")} before making changes.`,
    ...(decision == null ? [] : [`Previously journaled coordinator decision: ${JSON.stringify(decision)}`]),
    "You are the only implementation agent for this ticket. Do not spawn subagents, call Jev or other paid MCP tools, inspect credentials/.env, touch data/trading/wallets, migrate schemas, change billing, or mutate Git history. The coordinator handles design decisions through consensus_plan then the Jev wrapper with an optional call cap, omitted by default.",
    "Do not write outside the listed paths. If a non-trivial design decision is needed, return outcome=decision_required with a sanitized spec, including facts.semJevFallbackOptionId naming the most reversible option. Do not guess.",
    "Finish with the required task-result JSON only. Use outcome completed only after implementation and evidence; use blocked/no_progress if stalled. Do not include secrets or full private file contents.",
  ].join("\n\n");
}
function semJevChoice(options: SddTask[], specHash: string, reason: string): TaskChoice {
  const selected = [...options].sort((a, b) => Number(b.reversible) - Number(a.reversible) || ["low", "medium", "high"].indexOf(a.risk) - ["low", "medium", "high"].indexOf(b.risk) || a.id.localeCompare(b.id))[0];
  if (!selected) throw new Error("no reversible non-fenced fallback exists");
  return { selectedId: selected.id, source: "sem-jev", status: "sem-jev", specHash, receiptHash: null, fallbackReason: reason };
}
function semJevOption(spec: DecisionSpec, reason: string): TaskChoice | null {
  const id = spec.facts.semJevFallbackOptionId; if (typeof id !== "string" || !spec.options.some((option) => option.id === id && !spec.forbidden?.includes(id))) return null;
  return { selectedId: id, source: "sem-jev", status: "sem-jev", specHash: specFingerprint(spec), receiptHash: null, fallbackReason: reason };
}
const providerFault = (reason?: string) => !!reason && /(unavailable|failed|closed|timeout|provider|credential|protocol|plannedCalls)/i.test(reason) && !/no consensus/i.test(reason);
function hydratePendingDecision(statePath: string, state: AutonomyState, record: AutonomyState["tasks"][number]): unknown | null {
  const pending = record.pendingDecision; if (!pending?.spec) return null;
  const spec = parseSpec(pending.spec);
  if (pending.status === "requesting") {
    pending.status = "ready"; pending.selectedId = pending.fallbackOptionId; pending.selectedSummary = pending.fallbackSummary; pending.method = "sem-jev"; pending.receiptHash = null; pending.fallbackReason = "coordinator interrupted during Jev request; no request repeated, reversible fallback used";
    if (!record.decisions.some((item) => item.specHash === pending.specHash)) record.decisions.push({ specHash: pending.specHash, selectedId: pending.selectedId, method: "sem-jev", receiptHash: null });
    state.decisions.push({ specHash: pending.specHash, selectedId: pending.selectedId, source: "sem-jev", receiptHash: null, at: Date.now(), fallbackReason: pending.fallbackReason });
    state.jevCircuitBroken = true; state.jevCircuitReason = pending.fallbackReason; saveRunState(statePath, state);
  }
  return { specHash: pending.specHash, selectedId: pending.selectedId, summary: redact(spec.options.find(option => option.id === pending.selectedId)!.what), method: pending.method, receiptHash: pending.receiptHash, fallbackReason: pending.fallbackReason };
}
function isPidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } }
async function runVerifier(argv: string[], project: string): Promise<VerifyResult> {
  if (!argv.length || argv.some((part) => typeof part !== "string" || part.includes("\0"))) throw new Error("invalid verification argv");
  const executable = argv[0]!.split(/[\\/]/).pop()!.toLowerCase();
  if (executable === "bun" || executable === "bun.exe") {
    if (argv[1] !== "--no-env-file") throw new Error("Bun verification commands must include --no-env-file");
  }
  const env = workerEnvironment();
  const child = Bun.spawn(argv, { cwd: project, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const digest = createHash("sha256"); let tail = "";
  const consume = async (stream: ReadableStream<Uint8Array>) => { for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) { digest.update(chunk); tail = (tail + new TextDecoder().decode(chunk)).slice(-2048); } };
  await Promise.all([consume(child.stdout as ReadableStream<Uint8Array>), consume(child.stderr as ReadableStream<Uint8Array>)]);
  return { argv, exitCode: await child.exited, outputHash: digest.digest("hex"), summary: redact(tail) };
}
function controlAction(state: AutonomyState, action: "pause" | "cancel"): void {
  state.status = action === "pause" ? "paused" : "cancelled";
  state.pauseRequested = action === "pause"; state.cancelRequested = action === "cancel";
}
function clearTaskClaim(state: AutonomyState): void {
  const task = state.tasks.find(t => t.id === state.activeTaskId);
  if (task && task.status !== "running") task.pendingDecision = undefined;
  state.activeTaskId = null; state.hostSessionId = null; state.activePid = null; state.activeResultPath = null; state.activeReturn = undefined;
}
export interface RunOptions { expectedProject: string; initialState?: AutonomyState; resumeRequested?: boolean }
export async function runAutonomous(plan: SddTaskPlan, statePath: string, deps: RunnerDependencies, options: RunOptions): Promise<AutonomyState> {
  if (!options || typeof options.expectedProject !== "string") throw new Error("explicit run context required");
  const expectedProject = projectRoot(options.expectedProject);
  assertRunStatePath(statePath, expectedProject, plan.id);
  const release = acquireRunLock(statePath);
  try {
    let state = loadRunState(statePath);
    if (state ?? options.initialState) assertRunBinding((state ?? options.initialState)!, plan, expectedProject, statePath);
    if (!state && options.initialState) { state = options.initialState; state.scopeBaseline = deps.captureScope(state.project); state.scopeCaptured = true; saveRunState(statePath, state); }
    else if (state && options.initialState) throw new Error("objective already exists; use resume/status or a fresh objective ID");
    if (!state) throw new Error("objective state missing; start the objective first");
    const taskRel = relative(state.project, plan.sourcePath); if (!taskRel || taskRel.startsWith("..")) throw new Error("task file is outside the active objective repo");
    if (state.taskPlanHash !== plan.sourceHash) throw new Error("objective task plan changed; start a new objective id");
    if (state.status === "cancelled") return state;
    if (state.status === "complete" || state.status === "blocked") return state;
    const initialControl = readRunControl(statePath);
    if (initialControl?.action === "cancel") { controlAction(state, "cancel"); state.lastError = "cancel requested before the next task"; saveRunState(statePath, state); return state; }
    if (initialControl?.action === "pause" || state.status === "paused") {
      if (!options.resumeRequested) { controlAction(state, "pause"); saveRunState(statePath, state); return state; }
      if (!clearRunControl(statePath)) { controlAction(state, "cancel"); state.lastError = "cancel won a concurrent resume race"; saveRunState(statePath, state); return state; }
      state.status = "running"; state.pauseRequested = false; state.cancelRequested = false;
    } else state.status = "running";
    if (state.scopeCaptured !== true) {
      if (state.activeTaskId === null && state.tasks.every(task => task.attempts === 0) && !Object.keys(state.scopeBaseline).length) state.scopeBaseline = deps.captureScope(state.project);
      state.scopeCaptured = true;
    }
    saveRunState(statePath, state);
    const runHost = async (request: Omit<CodexRun, "onSpawn" | "onSessionId">): Promise<CodexResult> => {
      let interrupt: () => void = () => {};
      const unwatch = watchRunControl(statePath, (control) => { if (control.action === "cancel" || control.action === "pause") interrupt(); });
      try {
        return await deps.execute({ ...request, onSpawn: (pid, stop) => { state.activePid = pid; interrupt = stop; saveRunState(statePath, state); if (["cancel", "pause"].includes(readRunControl(statePath)?.action ?? "")) interrupt(); }, onSessionId: (id) => { state.hostSessionId = id; saveRunState(statePath, state); } });
      } finally { unwatch(); }
    };
    for (;;) {
      const control = readRunControl(statePath);
      if (control?.action === "cancel") { controlAction(state, "cancel"); state.lastError = "cancel requested; no next task will start"; saveRunState(statePath, state); return state; }
      if (control?.action === "pause") { controlAction(state, "pause"); state.lastError = "pause requested at a safe task boundary"; saveRunState(statePath, state); return state; }
      propagateBlockedDependencies(plan, state);
      const terminal = objectiveTerminal(plan, state);
      if (terminal) { state.status = terminal; clearTaskClaim(state); saveRunState(statePath, state); return state; }
      let task = state.activeTaskId ? taskById(plan, state.activeTaskId) : null;
      if (!task) {
        const eligible = eligibleTaskSet(plan, state); if (!eligible.length) { state.status = "blocked"; state.lastError = "no eligible unblocked task remains"; saveRunState(statePath, state); return state; }
        const selected = state.jevCircuitBroken ? { choice: semJevChoice(eligible, hash(eligible.map((item) => item.id).join(",")), state.jevCircuitReason ?? "Jev unavailable"), decisions: [] } : await deps.chooseNext(plan, state.tasks.filter((item) => item.status === "done").map((item) => item.id), eligible);
        const chosen = eligible.find((item) => item.id === selected.choice.selectedId); if (!chosen) throw new Error("coordinator selected a task outside the eligible set");
        for (const decision of selected.decisions) {
          state.decisions.push({ specHash: decision.specHash, selectedId: decision.selectedId!, source: decision.source, receiptHash: decision.receiptHash, at: Date.now(), ...(decision.fallbackReason ? { fallbackReason: redact(decision.fallbackReason) } : {}) });
          if (decision.source === "sem-jev" && providerFault(decision.fallbackReason ?? "")) { state.jevCircuitBroken = true; state.jevCircuitReason = redact(decision.fallbackReason ?? "Jev provider failure"); }
        }
        task = chosen; state.activeTaskId = task.id; state.hostSessionId = null; state.activePid = null; state.activeResultPath = null;
        const record = state.tasks.find((item) => item.id === task!.id)!; record.status = "running"; record.attempts++; record.reason = undefined;
        saveRunState(statePath, state);
      }
      const record = state.tasks.find((item) => item.id === task!.id)!;
      if (state.activePid !== null && deps.processAlive(state.activePid)) { state.status = "paused"; state.lastError = `owned Codex process ${state.activePid} is still active; duplicate execution refused`; saveRunState(statePath, state); return state; }
      let result = state.activeReturn;
      if (!result) {
        if (record.pendingDecision && !record.pendingDecision.spec) { record.status = "blocked"; record.reason = "pending decision lacks original option proof; no host or paid request repeated"; clearTaskClaim(state); saveRunState(statePath, state); continue; }
        const resultPath = state.activeResultPath ?? join(dirname(statePath), `${state.objectiveId}-${task!.id}-${randomUUID()}.result.json`);
        state.activeResultPath = resultPath; saveRunState(statePath, state);
        const recoveryDecision = hydratePendingDecision(statePath, state, record);
        try {
          if (existsSync(resultPath)) result = readCodexResultFile(resultPath, task!, state.hostSessionId, null) ?? { exitCode: null, sessionId: state.hostSessionId, taskId: task!.id, outcome: "blocked", summary: "recovery result invalid", acceptanceCoverage: [], reason: "structured host output did not validate", evidence: [], decisionSpec: null, outputHash: hash("invalid-recovery") };
          else result = await runHost({ project: state.project, task: task!, plan, prompt: workerPrompt(plan, task!, record.attempts > 1, state.project, recoveryDecision), sessionId: state.hostSessionId, ...(recoveryDecision === null ? {} : { decisionContext: recoveryDecision }), resultSchema: taskResultSchemaPath(), resultPath });
        } catch (error) { state.lastError = redact(error instanceof Error ? error.message : "Codex execution interrupted"); saveRunState(statePath, state); throw error; }
        state.activePid = null; state.hostSessionId = result.sessionId; state.lastOutputHash = result.outputHash; state.activeReturn = result; saveRunState(statePath, state);
        deps.failpoint?.("host-return-persisted");
      }
      const requestedControl = readRunControl(statePath);
       if (requestedControl?.action === "cancel") { controlAction(state, "cancel"); state.lastError = "cancel requested during active Codex task"; saveRunState(statePath, state); return state; }
       if (requestedControl?.action === "pause") { controlAction(state, "pause"); state.lastError = "pause requested during active Codex task; owned subprocess interrupted and session retained"; saveRunState(statePath, state); return state; }
      const checkTaskScope = (): boolean => {
        const after = deps.captureScope(state.project), outOfScope = unauthorizedChanges(state.scopeBaseline, after, task!.writePaths);
        state.scopeBaseline = after;
        if (!outOfScope.length) return false;
        record.status = "blocked"; record.reason = `scope drift: ${outOfScope.slice(0, 8).join(",")}`; state.status = "blocked"; state.lastError = "workspace edits outside this task's allowlist; no automatic revert performed"; clearTaskClaim(state); saveRunState(statePath, state); return true;
      };
      if (checkTaskScope()) return state;
      if (result.taskId !== task!.id || (["completed", "decision_required"].includes(result.outcome) && result.exitCode !== 0) || (result.outcome === "decision_required" && !state.hostSessionId)) {
        record.status = "blocked"; record.reason = result.taskId !== task!.id ? "host result task id mismatch" : result.exitCode !== 0 ? "host return has no observed zero exit; no verification or decision dispatched" : "Codex returned a decision request without a resumable session id";
        clearTaskClaim(state); saveRunState(statePath, state); continue;
      }
      if (result.outcome === "decision_required") {
        let spec: DecisionSpec;
        try { spec = parseSpec(result.decisionSpec); } catch (error) { record.status = "blocked"; record.reason = `invalid decision request: ${redact(error instanceof Error ? error.message : "invalid")}`; record.pendingDecision = undefined; clearTaskClaim(state); saveRunState(statePath, state); continue; }
        const specHash = specFingerprint(spec), priorDecision = record.decisions.find((decision) => decision.specHash === specHash);
        if ((record.pendingDecision?.specHash === specHash && record.pendingDecision.status === "ready") || priorDecision) { record.status = "blocked"; record.reason = "repeated identical design request without implementation progress"; record.pendingDecision = undefined; clearTaskClaim(state); saveRunState(statePath, state); continue; }
        const fallbackId = spec.facts.semJevFallbackOptionId, fallbackOption = typeof fallbackId === "string" ? spec.options.find((option) => option.id === fallbackId && !spec.forbidden?.includes(option.id)) : undefined;
        if (!fallbackOption) { record.status = "blocked"; record.reason = "decision request has no reversible sem-jev fallback"; clearTaskClaim(state); saveRunState(statePath, state); continue; }
        record.pendingDecision = { specHash, spec, status: "requesting", fallbackOptionId: fallbackOption.id, fallbackSummary: redact(fallbackOption.what) };
        state.activeReturn = undefined; state.activeResultPath = null;
        saveRunState(statePath, state); deps.failpoint?.("decision-request-persisted");
        let decision: TaskChoice | null;
        if (state.jevCircuitBroken) decision = semJevOption(spec, state.jevCircuitReason ?? "Jev unavailable");
        else {
          try { decision = await deps.decideSpec(spec); }
          catch (error) { const reason = redact(error instanceof Error ? error.message : "decision failure"); decision = semJevOption(spec, reason); if (decision) { state.jevCircuitBroken = true; state.jevCircuitReason = reason; } }
        }
        if (!decision?.selectedId) { record.status = "blocked"; record.reason = "no reversible sem-jev fallback for unresolved design request"; record.pendingDecision = undefined; clearTaskClaim(state); saveRunState(statePath, state); continue; }
        const option = spec.options.find((item) => item.id === decision.selectedId && !spec.forbidden?.includes(item.id)); if (!option) { record.status = "blocked"; record.reason = "coordinator selected an option outside the allowed spec options"; record.pendingDecision = undefined; clearTaskClaim(state); saveRunState(statePath, state); continue; }
        record.pendingDecision = { specHash, spec, status: "ready", fallbackOptionId: fallbackOption.id, fallbackSummary: redact(fallbackOption.what), selectedId: decision.selectedId, selectedSummary: redact(option.what), method: decision.source, receiptHash: decision.receiptHash, fallbackReason: decision.fallbackReason ? redact(decision.fallbackReason) : undefined };
        record.decisions.push({ specHash, selectedId: decision.selectedId, method: decision.source, receiptHash: decision.receiptHash });
        state.decisions.push({ specHash, selectedId: decision.selectedId, source: decision.source, receiptHash: decision.receiptHash, at: Date.now(), ...(decision.fallbackReason ? { fallbackReason: redact(decision.fallbackReason) } : {}) });
        saveRunState(statePath, state);
        const decisionContext = hydratePendingDecision(statePath, state, record);
        record.pendingDecision!.continuationPrompt = workerPrompt(plan, task!, false, state.project, decisionContext);
        state.activeResultPath = join(dirname(statePath), `${state.objectiveId}-${task!.id}-${randomUUID()}.result.json`); saveRunState(statePath, state); deps.failpoint?.("decision-ready-persisted");
        continue;
      }
      record.pendingDecision = undefined;
      record.progressFingerprint = result.outputHash;
      if (result.outcome === "completed") {
        const invalidEvidence = result.evidence.filter((item) => !validEvidence(item, task!, state.project));
        if (invalidEvidence.length) { record.status = "blocked"; record.reason = `invalid evidence: ${invalidEvidence.map((e) => e.path).slice(0, 4).join(",")}`; }
        else {
          record.evidence.push(...result.evidence);
          record.verification = [];
          for (const argv of task!.verifyArgv) { const verification = await deps.verify(argv, state.project); record.verification.push(verification); if (checkTaskScope()) return state; if (verification.exitCode !== 0) break; }
          if (record.verification.length !== task!.verifyArgv.length || record.verification.some((item) => item.exitCode !== 0)) { record.status = "blocked"; record.reason = "task verification failed"; }
          else if (result.evidence.some(item => !validEvidence(item, task!, state.project))) { record.status = "blocked"; record.reason = "evidence changed during verification"; }
          else if (!hasTaskVerification(task!, { evidence: result.evidence, verification: record.verification, acceptanceCoverage: result.acceptanceCoverage })) { record.status = "blocked"; record.reason = "acceptance criteria were not individually evidenced by a passing verifier or hashed artifact"; }
          else { record.status = "done"; record.reason = undefined; record.acceptanceCoverage = result.acceptanceCoverage; }
        }
      } else { record.status = "blocked"; record.reason = result.reason ?? result.summary ?? result.outcome; }
      clearTaskClaim(state); state.lastError = record.status === "blocked" ? record.reason ?? null : null; saveRunState(statePath, state);
    }
  } finally { release(); }
}
function validEvidence(item: CodexResult["evidence"][number], task: SddTask, root: string): boolean {
  const rel = item.path.replace(/\\/g, "/"), path = resolve(root, rel), inside = relative(root, path).replace(/\\/g, "/");
  if (!inside || inside.startsWith("..") || rel.includes(":") || rel.includes("\0") || rel.split("/").includes("..") || /(?:^|\/)(?:\.env[^/]*|data|\.git)(?:\/|$)/i.test(inside) || !allowedPath(inside, task.writePaths)) return false;
  let descriptor: number | undefined;
  const key = (p: string) => process.platform === "win32" ? p.toLowerCase() : p;
  const sameFile = (a: BigIntStats, b: BigIntStats) => a.isFile() && b.isFile() && a.nlink === 1n && b.nlink === 1n && a.ino === b.ino && a.dev === b.dev && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || key(realpathSync(path)) !== key(path)) return false;
    descriptor = openSync(path, "r");
    if (!sameFile(before, fstatSync(descriptor, { bigint: true }))) return false;
    const digest = createHash("sha256"), bytes = Buffer.alloc(64 * 1024);
    let remaining = before.size;
    while (remaining > 0n) {
      const length = readSync(descriptor, bytes, 0, Number(remaining > BigInt(bytes.length) ? BigInt(bytes.length) : remaining), null);
      if (length === 0) return false;
      digest.update(bytes.subarray(0, length)); remaining -= BigInt(length);
    }
    return sameFile(before, fstatSync(descriptor, { bigint: true })) && sameFile(before, lstatSync(path, { bigint: true })) && key(realpathSync(path)) === key(path) && digest.digest("hex") === item.sha256;
  } catch { return false; }
  finally { if (descriptor !== undefined) try { closeSync(descriptor); } catch {} }
}
const mcpScript = join(REPO, "scripts", "sdd-harness", "mcp.ts");
const depsDefault: RunnerDependencies = { execute: (request) => executeCodexTask(request), chooseNext: (plan, completed, eligible) => chooseNextTask(plan, completed, eligible, REPO, mcpScript), decideSpec: (spec) => decideTaskSpec(spec, REPO, mcpScript), verify: runVerifier, processAlive: isPidAlive, captureScope: captureWorkspaceStatus };

async function runCli(argv: string[]): Promise<void> {
  const [mode, ...args] = argv;
  const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const project = projectRoot(flag("--project") ?? process.cwd()), id = flag("--objective-id");
  if (!mode) throw new Error("usage: runner.ts start|resume|status|pause|cancel --objective-id ID");
  if (mode === "start") {
    const objective = flag("--objective"), tasksPath = flag("--tasks"), expectedId = flag("--objective-id");
    if (!objective || !tasksPath || !expectedId) throw new Error("start requires --objective-id, --objective and --tasks");
    const plan = loadTaskPlan(tasksPath, project); if (plan.id !== expectedId || plan.objective !== objective) throw new Error("explicit objective does not match the authorized task plan");
    const path = runStatePath(project, plan.id);
    const final = await runAutonomous(plan, path, depsDefault, { expectedProject: project, initialState: createRunState(plan, project), resumeRequested: true }); console.log(JSON.stringify(safeSummary(final), null, 2)); return;
  }
  if (!id) throw new Error(`${mode} requires --objective-id`);
  const path = runStatePath(project, id), state = loadRunState(path); if (!state) throw new Error("objective not found");
  assertRunIdentity(state, project, id, path);
  if (mode === "status") { console.log(JSON.stringify(safeSummary(state), null, 2)); return; }
  if (mode === "pause" || mode === "cancel") { setRunControl(path, mode); console.log(JSON.stringify({ objectiveId: id, control: mode, appliesAt: "next safe task boundary" })); return; }
  if (mode === "resume" || mode === "run") {
    if (state.status === "cancelled") throw new Error("cancelled objectives are terminal; start a new authorized objective");

    const plan = loadTaskPlan(state.taskPath, project); if (plan.sourceHash !== state.taskPlanHash) throw new Error("task plan changed; do not resume against a different graph");
    const final = await runAutonomous(plan, path, depsDefault, { expectedProject: project, resumeRequested: true }); console.log(JSON.stringify(safeSummary(final), null, 2)); return;
  }
  throw new Error("usage: runner.ts start|resume|run|status|pause|cancel");
}
function safeSummary(state: AutonomyState) { return { objectiveId: state.objectiveId, status: state.status, activeTaskId: state.activeTaskId, tasks: state.tasks.map(({ id, status, reason }) => ({ id, status, reason: reason ? redact(reason) : undefined })), decisions: state.decisions.map(({ specHash, selectedId, source, receiptHash }) => ({ specHash, selectedId, source, receiptHash })), lastError: state.lastError ? redact(state.lastError) : null, userAction: state.status === "paused" ? `bun --no-env-file run scripts/sdd-harness/runner.ts resume --objective-id ${state.objectiveId}` : undefined }; }
if (import.meta.main) { try { await runCli(process.argv.slice(2)); } catch (error) { console.error(`sdd-harness runner stopped safely: ${redact(error instanceof Error ? error.message : "unknown error")}`); process.exitCode = 2; } }
