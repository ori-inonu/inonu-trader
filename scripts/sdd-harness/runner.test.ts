import { expect, test } from "bun:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRunState, runStatePath, loadRunState, saveRunState, setRunControl, readRunControl, acquireRunLock } from "./runner-state";
import { runAutonomous, type RunnerDependencies } from "./runner";
import { loadTaskPlan, type SddTask } from "./scheduler";
import type { CodexResult } from "./runner-state";
import type { WorkSnapshot } from "./workspace-scope";
import { workerEnvironment } from "./codex-adapter";
import { specFingerprint } from "../../src/consensus/engine";

const task = (id: string, dependsOn: string[] = []): SddTask => ({ id, title: `Ticket ${id}`, acceptance: [`${id} accepted`], dependsOn, writePaths: ["scripts/sdd-harness/**"], verifyArgv: [["bun", "--no-env-file", "test"]], risk: "low", reversible: true });
const result = (id: string, outcome: CodexResult["outcome"] = "completed"): CodexResult => ({ exitCode: 0, sessionId: `session-${id}`, taskId: id, outcome, summary: outcome, reason: null, acceptanceCoverage: [{ criterion: `${id} accepted`, verificationIndices: [0], evidencePaths: [] }], evidence: [], decisionSpec: null, outputHash: "1".repeat(64) });
function fixture(tasks: SddTask[]) {
  const home = mkdtempSync(join(tmpdir(), "sdd-runner-integration-")), repo = join(home, "repo"), source = join(repo, "tasks.json");
  mkdirSync(repo);
  writeFileSync(source, JSON.stringify({ version: 1, id: "f03-runner-test", objective: "Exercise autonomous task selection without a model", authorizedScope: "test fixture only", tasks }));
  const graph = loadTaskPlan(source, repo), path = runStatePath(repo, graph.id, home), state = createRunState(graph, repo);
  saveRunState(path, state); return { home, repo, graph, path };
}
function deps(overrides: Partial<RunnerDependencies> = {}): RunnerDependencies {
  return {
    execute: async () => { throw new Error("fake executor not configured"); },
    chooseNext: async (_plan, _done, ready) => ({ choice: { selectedId: ready[0]!.id, source: "sem-jev", status: "sem-jev", specHash: "4".repeat(64), receiptHash: null }, decisions: [] }),
    decideSpec: async () => { throw new Error("no paid Jev in integration tests"); },
    verify: async (argv) => ({ argv, exitCode: 0, outputHash: "2".repeat(64), summary: "verification passed" }),
    processAlive: () => false,
    captureScope: () => ({}),
    ...overrides,
  };
}

test("invalid state JSON yields a coded refusal and preserves the original bytes", () => {
  const { home, path } = fixture([task("A")]), raw = '{"fixture":unparsed_placeholder}';
  try {
    writeFileSync(path, raw);
    expect(() => loadRunState(path)).toThrow("run state invalid");
    expect(readFileSync(path, "utf8")).toBe(raw);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(["outside", "redirect", "shared"] as const)("source preflight rejects %s before parsing any bytes", alias => {
  const { home, repo } = fixture([task("A")]), outside = join(home, "outside.json"), parent = join(repo, "redirect"), inside = alias === "redirect" ? join(parent, "outside.json") : join(repo, "aliased-plan.json"), raw = '{unparsed_placeholder}';
  writeFileSync(outside, raw);
  if (alias === "redirect") symlinkSync(home, parent, "junction");
  if (alias === "shared") linkSync(outside, inside);
  try {
    expect(() => loadTaskPlan(alias === "outside" ? outside : inside, repo)).toThrow("task file binding invalid");
    expect(readFileSync(outside, "utf8")).toBe(raw);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a forged ancestor project in persisted state is refused before any dependency or state rewrite", async () => {
  const { home, repo, graph, path } = fixture([task("A")]);
  const state = loadRunState(path)!; state.project = dirname(repo); saveRunState(path, state);
  const before = readFileSync(path, "utf8"); let calls = 0;
  const forbidden = () => { calls++; };
  try {
    await expect(runAutonomous(graph, path, deps({
      execute: async () => { forbidden(); return result("A"); },
      chooseNext: async (_plan, _done, ready) => { forbidden(); return { choice: { selectedId: ready[0]!.id, source: "sem-jev", status: "sem-jev", specHash: "4".repeat(64), receiptHash: null }, decisions: [] }; },
      captureScope: () => { forbidden(); return {}; },
    }), { expectedProject: repo })).rejects.toThrow("run state binding invalid");
    expect(calls).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(before);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a result claim using a redirected parent and dot segments is refused before dispatch", async () => {
  const { home, repo, graph, path } = fixture([task("A")]);
  const target = join(home, "outside", "child"), redirect = join(dirname(path), "redirect");
  mkdirSync(target, { recursive: true }); symlinkSync(target, redirect, "junction");
  const state = loadRunState(path)!;
  state.activeTaskId = "A"; state.tasks[0]!.status = "running"; state.tasks[0]!.attempts = 1;
  state.activeResultPath = `${redirect}/../${graph.id}-A-00000000-0000-4000-8000-000000000001.result.json`;
  saveRunState(path, state);
  const before = readFileSync(path, "utf8"); let dispatched = 0;
  try {
    await expect(runAutonomous(graph, path, deps({ execute: async () => { dispatched++; return result("A"); } }), { expectedProject: repo })).rejects.toThrow("run state binding invalid");
    expect(dispatched).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(before);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(["state", "result"] as const)("a %s file shared with another path is refused before consuming the claim", async shared => {
  const { home, repo, graph, path } = fixture([task("A")]);
  if (shared === "state") linkSync(path, join(home, "state-alias.json"));
  else {
    const state = loadRunState(path)!;
    state.activeTaskId = "A"; state.tasks[0]!.status = "running"; state.tasks[0]!.attempts = 1;
    state.activeResultPath = join(dirname(path), `${graph.id}-A-00000000-0000-4000-8000-000000000001.result.json`);
    const external = join(home, "external-result.json");
    writeFileSync(external, JSON.stringify({ task_id: "A", outcome: "blocked", summary: "synthetic unowned output", acceptance_coverage: [], evidence: [], reason: null, decision_spec: null }));
    linkSync(external, state.activeResultPath); saveRunState(path, state);
  }
  const before = readFileSync(path, "utf8"); let executions = 0;
  try {
    await expect(runAutonomous(graph, path, deps({ execute: async () => { executions++; return result("A"); } }), { expectedProject: repo })).rejects.toThrow("run state binding invalid");
    expect(executions).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(before);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(["junction", "hardlink"] as const)("evidence behind a %s alias cannot complete a task", async alias => {
  const { home, repo, graph, path } = fixture([task("A")]);
  const target = join(home, "outside"), parent = join(repo, "scripts");
  mkdirSync(target); mkdirSync(parent); writeFileSync(join(target, "proof.txt"), "hello");
  if (alias === "junction") symlinkSync(target, join(parent, "sdd-harness"), "junction");
  else { mkdirSync(join(parent, "sdd-harness")); linkSync(join(target, "proof.txt"), join(parent, "sdd-harness", "proof.txt")); }
  let verifications = 0;
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async () => ({ ...result("A"), evidence: [{ path: "scripts/sdd-harness/proof.txt", sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", summary: "synthetic fixture" }] }),
      verify: async argv => { verifications++; return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "verification passed" }; },
    }), { expectedProject: repo });
    expect(state.tasks[0]!.status).toBe("blocked");
    expect(verifications).toBe(0);
    expect(readFileSync(join(target, "proof.txt"), "utf8")).toBe("hello");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("an exclusive canonical evidence file still completes its authorized task", async () => {
  const { home, repo, graph, path } = fixture([task("A")]);
  const parent = join(repo, "scripts", "sdd-harness"); mkdirSync(parent, { recursive: true });
  writeFileSync(join(parent, "proof.txt"), "hello");
  try {
    const state = await runAutonomous(graph, path, deps({ execute: async () => ({ ...result("A"), evidence: [{ path: "scripts/sdd-harness/proof.txt", sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", summary: "synthetic fixture" }] }) }), { expectedProject: repo });
    expect(state.status).toBe("complete");
    expect(state.tasks[0]!.status).toBe("done");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a scope-blocked task releases its active claim and remains readable on restart", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let snapshots = 0;
  try {
    const stopped = await runAutonomous(graph, path, deps({
      execute: async () => result("A"),
      captureScope: (): WorkSnapshot => ++snapshots === 1 ? {} : { "foreign.ts": { status: "??", size: 1, mtimeMs: 1 } },
    }), { expectedProject: repo });
    expect(stopped.status).toBe("blocked");
    expect(stopped.hostSessionId).toBeNull();
    const resumed = await runAutonomous(graph, path, deps(), { expectedProject: repo, resumeRequested: true });
    expect(resumed.status).toBe("blocked");
    expect(resumed.activeTaskId).toBeNull();
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a persisted decision cannot replace the coordinator's canonical prompt", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); const state = loadRunState(path)!;
  state.activeTaskId = "A"; state.hostSessionId = "thread-a"; state.tasks[0]!.status = "running"; state.tasks[0]!.attempts = 1;
  const specHash = specFingerprint(decisionSpec);
  state.tasks[0]!.pendingDecision = { specHash, spec: decisionSpec, status: "ready", fallbackOptionId: "safe", fallbackSummary: "Reversible work", selectedId: "safe", selectedSummary: "Untrusted journal summary", method: "sem-jev", receiptHash: null, continuationPrompt: "--dangerously-bypass-approvals-and-sandbox" };
  state.tasks[0]!.decisions.push({ specHash, selectedId: "safe", method: "sem-jev", receiptHash: null });
  state.decisions.push({ specHash, selectedId: "safe", source: "sem-jev", receiptHash: null, at: Date.now() });
  saveRunState(path, state); let prompt = "", decisions = 0;
  try {
    const final = await runAutonomous(graph, path, deps({ execute: async request => { prompt = request.prompt; return result("A"); }, decideSpec: async () => { decisions++; throw new Error("unreachable"); } }), { expectedProject: repo });
    expect(final.status).toBe("complete");
    expect(prompt.startsWith("Authorized objective:")).toBe(true);
    expect(prompt).toContain("Use the reversible adapter");
    expect(prompt).not.toContain("Untrusted journal summary");
    expect(prompt).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(decisions).toBe(0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a completed task without its recorded passing verification cannot finish the objective", async () => {
  const { home, repo, graph, path } = fixture([task("A")]), state = loadRunState(path)!;
  state.status = "complete"; state.tasks[0]!.status = "done"; state.tasks[0]!.attempts = 1;
  saveRunState(path, state); const before = readFileSync(path, "utf8");
  try {
    await expect(runAutonomous(graph, path, deps(), { expectedProject: repo })).rejects.toThrow("run state binding invalid");
    expect(readFileSync(path, "utf8")).toBe(before);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("an explicitly precompleted ticket in the authorized plan remains precompleted", async () => {
  const { home, repo, graph, path } = fixture([{ ...task("A"), initialStatus: "done" }]);
  try {
    const state = await runAutonomous(graph, path, deps(), { expectedProject: repo });
    expect(state.status).toBe("complete");
    expect(state.tasks[0]!.attempts).toBe(0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a worker in another project receives the existing harness protocol path", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let prompt = "";
  try {
    await runAutonomous(graph, path, deps({ execute: async request => { prompt = request.prompt; return result("A"); } }), { expectedProject: repo });
    const protocol = resolve(import.meta.dir, "../../tooling/sdd-harness/shared/WORKFLOW.md");
    expect(prompt).toContain(protocol); expect(existsSync(protocol)).toBe(true);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each([
  ["objective id", { objectiveId: "another-objective" }],
  ["objective text", { objective: "Different objective" }],
  ["task source", { taskPath: join(tmpdir(), "different-task-source.json") }],
  ["task digest", { taskPlanHash: "f".repeat(64) }],
  ["premature completion", { status: "complete" }],
  ["empty task set", { tasks: [] }],
  ["unknown task", { tasks: [{ id: "unknown", status: "todo", attempts: 0, evidence: [], decisions: [] }] }],
  ["null task", { tasks: [null] }],
  ["invalid decisions", { decisions: null }],
  ["status object", { status: { toString: "invalid" } }],
  ["unclaimed running task", { activeTaskId: "A" }],
  ["unclaimed PID", { activePid: 987654321 }],
  ["option-shaped session", { hostSessionId: "--dangerously-bypass-approvals-and-sandbox" }],
  ["unclaimed result path", { activeResultPath: join(tmpdir(), "unowned-result.json") }],
  ["unclaimed decision", { tasks: [{ id: "A", status: "todo", attempts: 0, evidence: [], decisions: [], pendingDecision: { specHash: "6".repeat(64), status: "ready", fallbackOptionId: "safe", fallbackSummary: "Reversible work", selectedId: "safe", selectedSummary: "Safe choice", method: "sem-jev", receiptHash: null } }] }],
] as const)("persisted %s is refused without dependencies or rewriting state", async (_name, invalid) => {
  const { home, repo, graph, path } = fixture([task("A")]);
  writeFileSync(path, JSON.stringify({ ...loadRunState(path), ...invalid }));
  const before = readFileSync(path, "utf8"); let calls = 0;
  try {
    await expect(runAutonomous(graph, path, deps({
      execute: async () => { calls++; return result("A"); },
      captureScope: () => { calls++; return {}; },
      chooseNext: async (_plan, _done, ready) => { calls++; return { choice: { selectedId: ready[0]!.id, source: "sem-jev", status: "sem-jev", specHash: "4".repeat(64), receiptHash: null }, decisions: [] }; },
    }), { expectedProject: repo })).rejects.toThrow(/run state (?:binding )?invalid/);
    expect(calls).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(before);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("autonomous runner handles three tickets, blocks failed verification, and proceeds independently", async () => {
  const { home, repo, graph, path } = fixture([task("A"), { ...task("B", ["A"]), verifyArgv: [["bun", "--no-env-file", "test", "fail-B"]] }, task("C"), task("D", ["B"])]), executed: string[] = [];
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async (request) => { executed.push(request.task.id); return result(request.task.id); },
      verify: async (argv) => ({ argv, exitCode: argv.includes("fail-B") ? 1 : 0, outputHash: "2".repeat(64), summary: "check output" }),
      chooseNext: async (_plan, _done, ready) => ({ choice: { selectedId: ready.find((item) => item.id === "B")?.id ?? ready[0]!.id, source: "sem-jev", status: "sem-jev", specHash: "4".repeat(64), receiptHash: null }, decisions: [] }),
    }), { expectedProject: repo });
    expect(executed).toEqual(["A", "B", "C"]);
    expect(state.tasks.find((item) => item.id === "A")?.status).toBe("done");
    expect(state.tasks.find((item) => item.id === "B")?.status).toBe("blocked");
    expect(state.tasks.find((item) => item.id === "D")?.reason).toContain("dependency B");
    expect(state.tasks.find((item) => item.id === "C")?.status).toBe("done");
    expect(state.status).toBe("blocked");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("cancel request after one ticket prevents dispatching the next eligible task", async () => {
  const { home, repo, graph, path } = fixture([task("A"), task("B")]), executed: string[] = [];
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async (request) => { executed.push(request.task.id); setRunControl(path, "cancel"); return result(request.task.id); },
    }), { expectedProject: repo });
    expect(executed).toEqual(["A"]); expect(state.status).toBe("cancelled");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("cancel event interrupts only the active Codex handle and starts no next ticket", async () => {
  const { home, repo, graph, path } = fixture([task("A"), task("B")]); let interrupted = false, executions = 0;
  try {
    const state = await runAutonomous(graph, path, deps({ execute: async (request) => { executions++; await new Promise<void>((resolve) => { request.onSpawn(454545, () => { interrupted = true; resolve(); }); setTimeout(() => setRunControl(path, "cancel"), 25); setTimeout(resolve, 1000); }); return result(request.task.id, "blocked"); } }), { expectedProject: repo });
    expect(interrupted).toBe(true); expect(executions).toBe(1); expect(state.status).toBe("cancelled");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("crash recovery resumes the owned task session rather than starting a duplicate", async () => {
  const { home, repo, graph, path } = fixture([task("A")]);
  try {
    const first = deps({ execute: async (request) => { request.onSpawn(424242, () => {}); request.onSessionId("thread-123"); throw new Error("simulated runner crash"); } });
    await expect(runAutonomous(graph, path, first, { expectedProject: repo })).rejects.toThrow(/simulated runner crash/);
    const saved = loadRunState(path)!; expect(saved.activeTaskId).toBe("A"); expect(saved.hostSessionId).toBe("thread-123");
    let resumedSession: string | null = null;
    const after = await runAutonomous(graph, path, deps({ execute: async (request) => { resumedSession = request.sessionId; return result(request.task.id); } }), { expectedProject: repo });
    expect(String(resumedSession)).toBe("thread-123"); expect(after.tasks[0]!.status).toBe("done"); expect(after.status).toBe("complete");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("missing criterion evidence blocks a completed claim but continues an independent ticket", async () => {
  const { home, repo, graph, path } = fixture([task("unproved"), task("independent")]), executed: string[] = [];
  try {
    const state = await runAutonomous(graph, path, deps({
      chooseNext: async (_plan, _done, ready) => ({ choice: { selectedId: ready.find((item) => item.id === "unproved")?.id ?? ready[0]!.id, source: "sem-jev", status: "sem-jev", specHash: "fixture", receiptHash: null }, decisions: [] }),
      execute: async (request) => { executed.push(request.task.id); return request.task.id === "unproved" ? { ...result(request.task.id), acceptanceCoverage: [] } : result(request.task.id); },
    }), { expectedProject: repo });
    expect(executed).toEqual(["unproved", "independent"]);
    expect(state.tasks.find((item) => item.id === "unproved")?.status).toBe("blocked");
    expect(state.tasks.find((item) => item.id === "independent")?.status).toBe("done");
    expect(state.tasks.find((item) => item.id === "unproved")?.reason).toContain("acceptance criteria");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("resume cannot clear a concurrent pause/cancel before acquiring the run lock", async () => {
  const { home, repo, graph, path } = fixture([task("A")]);
  try {
    const saved = loadRunState(path)!; saved.status = "paused"; saveRunState(path, saved); setRunControl(path, "pause");
    const release = acquireRunLock(path);
    await expect(runAutonomous(graph, path, deps(), { expectedProject: repo, resumeRequested: true })).rejects.toThrow();
    expect(readRunControl(path)?.action).toBe("pause"); release();
    setRunControl(path, "cancel");
    const state = await runAutonomous(graph, path, deps(), { expectedProject: repo, resumeRequested: true });
    expect(state.status).toBe("cancelled"); expect(readRunControl(path)?.action).toBe("cancel");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

const decisionSpec = { id: "decision-a", goal: "Choose a safe next implementation step", facts: { semJevFallbackOptionId: "safe" }, rails: ["No trading or credentials"], options: [{ id: "safe", label: "Safe reversible", what: "Use the reversible adapter" }, { id: "wait", label: "Wait", what: "Block the ticket" }] };

test("a forbidden fallback blocks a fresh decision request before Jev or continuation", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let executions = 0, decisions = 0;
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async () => ++executions === 1 ? { ...result("A", "decision_required"), decisionSpec: { ...decisionSpec, forbidden: ["safe"] } } : result("A"),
      decideSpec: async () => { decisions++; throw new Error("provider unavailable"); },
    }), { expectedProject: repo });
    expect(state.status).toBe("blocked"); expect(executions).toBe(1); expect(decisions).toBe(0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(["requesting", "ready"] as const)("a legacy %s decision without original option proof blocks without replay", async status => {
  const { home, repo, graph, path } = fixture([task("A")]), state = loadRunState(path)!; let executions = 0, decisions = 0;
  state.activeTaskId = "A"; state.hostSessionId = "session-A"; state.tasks[0]!.status = "running"; state.tasks[0]!.attempts = 1;
  state.tasks[0]!.pendingDecision = { specHash: "6".repeat(64), status, fallbackOptionId: "safe", fallbackSummary: "Missing original spec", ...(status === "ready" ? { selectedId: "safe", selectedSummary: "Missing original spec", method: "sem-jev" as const, receiptHash: null } : {}) };
  if (status === "ready") state.tasks[0]!.decisions.push({ specHash: "6".repeat(64), selectedId: "safe", method: "sem-jev", receiptHash: null });
  saveRunState(path, state);
  try {
    const final = await runAutonomous(graph, path, deps({ execute: async () => { executions++; return result("A"); }, decideSpec: async () => { decisions++; throw new Error("unexpected replay"); } }), { expectedProject: repo });
    expect(final.status).toBe("blocked"); expect(executions).toBe(0); expect(decisions).toBe(0); expect(final.tasks[0]!.reason).toContain("original option proof");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(["fingerprint", "fallback", "selected"] as const)("a pending decision with invalid %s proof is refused before replay", async invalid => {
  const { home, repo, graph, path } = fixture([task("A")]), state = loadRunState(path)!;
  const spec = { ...decisionSpec, ...(invalid === "fingerprint" ? {} : { forbidden: [invalid === "fallback" ? "safe" : "wait"] }) }, specHash = invalid === "fingerprint" ? "6".repeat(64) : specFingerprint(spec), selectedId = invalid === "selected" ? "wait" : "safe";
  state.activeTaskId = "A"; state.hostSessionId = "session-A"; state.tasks[0]!.status = "running"; state.tasks[0]!.attempts = 1;
  state.tasks[0]!.pendingDecision = { specHash, spec, status: "ready", fallbackOptionId: "safe", fallbackSummary: "Fixture", selectedId, selectedSummary: "Fixture", method: "sem-jev", receiptHash: null };
  state.tasks[0]!.decisions.push({ specHash, selectedId, method: "sem-jev", receiptHash: null }); saveRunState(path, state); const before = readFileSync(path, "utf8");
  try {
    await expect(runAutonomous(graph, path, deps(), { expectedProject: repo })).rejects.toThrow("run state binding invalid");
    expect(readFileSync(path, "utf8")).toBe(before);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a paused completed return resumes verification without executing the host again", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let executions = 0, verifications = 0;
  const dep = deps({
    execute: async () => { if (++executions > 1) throw new Error("completed host was dispatched twice"); setRunControl(path, "pause"); return result("A"); },
    verify: async argv => { verifications++; return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "check passed" }; },
  });
  try {
    const paused = await runAutonomous(graph, path, dep, { expectedProject: repo });
    expect(paused.status).toBe("paused"); expect(verifications).toBe(0);
    const resumed = await runAutonomous(graph, path, dep, { expectedProject: repo, resumeRequested: true });
    expect(resumed.status).toBe("complete"); expect(executions).toBe(1); expect(verifications).toBe(1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each([false, true])("a paused foreign edit cannot replace an empty scope baseline, legacy=%s", async legacy => {
  const { home, repo, graph, path } = fixture([task("A")]), foreign = join(repo, "foreign.txt"); let verifications = 0, executions = 0;
  const dep = deps({
    execute: async () => { executions++; writeFileSync(foreign, "foreign edit"); setRunControl(path, "pause"); return result("A"); },
    captureScope: (): WorkSnapshot => existsSync(foreign) ? { "foreign.txt": { status: "??", size: 12, mtimeMs: 1 } } : {},
    verify: async argv => { verifications++; return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "check passed" }; },
  });
  try {
    const paused = await runAutonomous(graph, path, dep, { expectedProject: repo });
    expect(paused.status).toBe("paused"); expect(paused.scopeBaseline).toEqual({});
    if (legacy) { const saved = loadRunState(path)!; delete (saved as any).scopeCaptured; saveRunState(path, saved); }
    const resumed = await runAutonomous(graph, path, dep, { expectedProject: repo, resumeRequested: true });
    expect(resumed.status).toBe("blocked"); expect(resumed.tasks[0]!.reason).toContain("scope drift"); expect(verifications).toBe(0); expect(executions).toBe(1); expect(readFileSync(foreign, "utf8")).toBe("foreign edit");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(['{"action":"unexpected","nonce":"test","requestedAt":1}', '{"broken":unparsed_placeholder}'])("an invalid control is refused before dispatch and preserved verbatim: %s", async raw => {
  const { home, repo, graph, path } = fixture([task("A")]); let executions = 0;
  writeFileSync(path + ".control.json", raw); const before = readFileSync(path, "utf8");
  try {
    await expect(runAutonomous(graph, path, deps({ execute: async () => { executions++; return result("A"); } }), { expectedProject: repo })).rejects.toThrow("run control invalid");
    expect(executions).toBe(0); expect(readFileSync(path, "utf8")).toBe(before); expect(readFileSync(path + ".control.json", "utf8")).toBe(raw);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(["pause", "cancel"] as const)("a %s during decision continuation is checked before any verifier", async action => {
  const { home, repo, graph, path } = fixture([task("A")]); let executions = 0, decisions = 0, verifications = 0;
  const dep = deps({
    execute: async () => { executions++; if (executions === 1) return { ...result("A", "decision_required"), decisionSpec }; setRunControl(path, action); return result("A"); },
    decideSpec: async () => { decisions++; return { selectedId: "safe", source: "jev", status: "consenso", specHash: "5".repeat(64), receiptHash: "3".repeat(64) }; },
    verify: async argv => { verifications++; return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "check passed" }; },
  });
  try {
    const stopped = await runAutonomous(graph, path, dep, { expectedProject: repo });
    expect(stopped.status).toBe(action === "pause" ? "paused" : "cancelled"); expect(verifications).toBe(0);
    expect(stopped.activeReturn?.exitCode).toBe(0); expect(decisions).toBe(1); expect(executions).toBe(2);
    const resumed = await runAutonomous(graph, path, dep, { expectedProject: repo, resumeRequested: true });
    expect(resumed.status).toBe(action === "pause" ? "complete" : "cancelled"); expect(executions).toBe(2); expect(decisions).toBe(1); expect(verifications).toBe(action === "pause" ? 1 : 0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("scope drift during continuation blocks verification and preserves foreign edits", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let executions = 0, verifications = 0;
  const foreign = join(repo, "foreign.txt");
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async () => { if (++executions === 1) return { ...result("A", "decision_required"), decisionSpec }; writeFileSync(foreign, "foreign edit"); return result("A"); },
      decideSpec: async () => ({ selectedId: "safe", source: "sem-jev", status: "sem-jev", specHash: "5".repeat(64), receiptHash: null }),
      captureScope: (): WorkSnapshot => existsSync(foreign) ? { "foreign.txt": { status: "??", size: 12, mtimeMs: 1 } } : {},
      verify: async argv => { verifications++; return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "check passed" }; },
    }), { expectedProject: repo });
    expect(state.status).toBe("blocked"); expect(state.tasks[0]!.reason).toContain("scope drift"); expect(verifications).toBe(0); expect(readFileSync(foreign, "utf8")).toBe("foreign edit");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("scope drift from a passing verifier cannot complete the final task", async () => {
  const { home, repo, graph, path } = fixture([task("A")]), foreign = join(repo, "foreign.txt");
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async () => result("A"),
      captureScope: (): WorkSnapshot => existsSync(foreign) ? { "foreign.txt": { status: "??", size: 12, mtimeMs: 1 } } : {},
      verify: async argv => { writeFileSync(foreign, "foreign edit"); return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "check passed" }; },
    }), { expectedProject: repo });
    expect(state.status).toBe("blocked"); expect(state.tasks[0]!.status).toBe("blocked"); expect(state.tasks[0]!.reason).toContain("scope drift"); expect(readFileSync(foreign, "utf8")).toBe("foreign edit");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a passing verifier cannot leave a completed task with an outdated evidence hash", async () => {
  const { home, repo, graph, path } = fixture([task("A")]), parent = join(repo, "scripts", "sdd-harness"), proof = join(parent, "proof.txt");
  mkdirSync(parent, { recursive: true }); writeFileSync(proof, "hello");
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async () => ({ ...result("A"), acceptanceCoverage: [{ criterion: "A accepted", verificationIndices: [], evidencePaths: ["scripts/sdd-harness/proof.txt"] }], evidence: [{ path: "scripts/sdd-harness/proof.txt", sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", summary: "synthetic proof" }] }),
      verify: async argv => { writeFileSync(proof, "different"); return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "check passed" }; },
    }), { expectedProject: repo });
    expect(state.status).toBe("blocked"); expect(state.tasks[0]!.reason).toContain("evidence changed during verification"); expect(readFileSync(proof, "utf8")).toBe("different");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each([null, 7])("a completed or decision return with exit %s cannot dispatch verifiers or Jev", async exitCode => {
  for (const outcome of ["completed", "decision_required"] as const) {
    const { home, repo, graph, path } = fixture([task("A")]); let verifications = 0, decisions = 0;
    try {
      const state = await runAutonomous(graph, path, deps({
        execute: async () => ({ ...result("A", outcome), exitCode, decisionSpec }),
        decideSpec: async () => { decisions++; throw new Error("unconfirmed host result reached Jev"); },
        verify: async argv => { verifications++; return { argv, exitCode: 0, outputHash: "2".repeat(64), summary: "check passed" }; },
      }), { expectedProject: repo });
      expect(state.status).toBe("blocked"); expect(verifications).toBe(0); expect(decisions).toBe(0);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
});

test("a crash after persisting a known return reuses it even with a retained result file", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let executions = 0, resultPath = "";
  const raw = JSON.stringify({ task_id: "A", outcome: "completed", summary: "completed", acceptance_coverage: [{ criterion: "A accepted", verification_indices: [0], evidence_paths: [] }], evidence: [], reason: null, decision_spec: null });
  const dep = deps({
    execute: async request => { executions++; resultPath = request.resultPath; writeFileSync(resultPath, raw); return result("A"); },
    failpoint: stage => { if (stage === "host-return-persisted") throw new Error("crash after known return"); },
  });
  try {
    await expect(runAutonomous(graph, path, dep, { expectedProject: repo })).rejects.toThrow("crash after known return");
    const final = await runAutonomous(graph, path, { ...dep, failpoint: undefined }, { expectedProject: repo });
    expect(final.status).toBe("complete"); expect(executions).toBe(1); expect(readFileSync(resultPath, "utf8")).toBe(raw); expect(final.activeReturn).toBeUndefined();
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("an old result file without observed exit is refused without replay or paid decision", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); const state = loadRunState(path)!; let executions = 0, decisions = 0;
  state.activeTaskId = "A"; state.hostSessionId = "session-A"; state.tasks[0]!.status = "running"; state.tasks[0]!.attempts = 1;
  state.activeResultPath = join(dirname(path), `${graph.id}-A-00000000-0000-4000-8000-000000000001.result.json`);
  const raw = JSON.stringify({ task_id: "A", outcome: "decision_required", summary: "choose", acceptance_coverage: [], evidence: [], reason: null, decision_spec: decisionSpec });
  writeFileSync(state.activeResultPath, raw); saveRunState(path, state);
  try {
    const final = await runAutonomous(graph, path, deps({ execute: async () => { executions++; return result("A"); }, decideSpec: async () => { decisions++; throw new Error("unknown exit"); } }), { expectedProject: repo });
    expect(final.status).toBe("blocked"); expect(executions).toBe(0); expect(decisions).toBe(0); expect(readFileSync(state.activeResultPath!, "utf8")).toBe(raw);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test.each(["orphan", "task", "session", "hash", "exit"] as const)("a retained return with invalid %s binding is refused without rewriting", async invalid => {
  const { home, repo, graph, path } = fixture([task("A")]); const state = loadRunState(path)!;
  state.activeTaskId = "A"; state.hostSessionId = "session-A"; state.tasks[0]!.status = "running"; state.tasks[0]!.attempts = 1;
  state.activeResultPath = join(dirname(path), `${graph.id}-A-00000000-0000-4000-8000-000000000001.result.json`); state.lastOutputHash = "1".repeat(64); state.activeReturn = result("A");
  const rawState: any = state;
  if (invalid === "orphan") rawState.activeResultPath = null;
  else if (invalid === "task") rawState.activeReturn.taskId = "B";
  else if (invalid === "session") rawState.activeReturn.sessionId = "other-session";
  else if (invalid === "hash") rawState.activeReturn.outputHash = "2".repeat(64);
  else rawState.activeReturn.exitCode = "0";
  const raw = JSON.stringify(rawState); writeFileSync(path, raw);
  try {
    await expect(runAutonomous(graph, path, deps(), { expectedProject: repo })).rejects.toThrow(/run state (?:binding )?invalid/);
    expect(readFileSync(path, "utf8")).toBe(raw);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("CLI start cannot initialize state while another coordinator holds the lease", async () => {
  const { home, repo, graph, path } = fixture([{ ...task("A"), initialStatus: "done" }]); unlinkSync(path);
  const release = acquireRunLock(path), env = { ...workerEnvironment(), USERPROFILE: home, HOME: home, CODEX_HOME: join(home, ".codex"), APPDATA: join(home, "roaming"), LOCALAPPDATA: join(home, "local") };
  try {
    const probe = Bun.spawnSync([process.execPath, "--no-env-file", "-e", 'console.log(require("node:os").homedir())'], { cwd: repo, env, stdout: "pipe", stderr: "pipe" });
    expect(probe.exitCode).toBe(0); expect(probe.stdout.toString().trim().toLowerCase()).toBe(home.toLowerCase());
    const child = Bun.spawnSync([process.execPath, "--no-env-file", join(import.meta.dir, "runner.ts"), "start", "--project", repo, "--objective-id", graph.id, "--objective", graph.objective, "--tasks", graph.sourcePath], { cwd: repo, env, stdout: "pipe", stderr: "pipe" });
    expect(child.exitCode).toBe(2); expect(existsSync(path)).toBe(false);
  } finally { release(); rmSync(home, { recursive: true, force: true }); }
});

test("a ready Jev decision is persisted and reused after a crash before worker dispatch", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let decisionCalls = 0, crashed = false, resumedPrompt = "";
  const dep = deps({
    execute: async (request) => { if (!request.prompt.includes("Previously journaled coordinator decision")) return { ...result("A", "decision_required"), sessionId: "thread-a", decisionSpec }; resumedPrompt = request.prompt; return result("A"); },
    decideSpec: async () => { decisionCalls++; return { selectedId: "safe", source: "jev", status: "consenso", specHash: "5".repeat(64), receiptHash: "3".repeat(64) }; },
    failpoint: (stage) => { if (stage === "decision-ready-persisted" && !crashed) { crashed = true; throw new Error("simulated crash after Jev decision"); } },
  });
  try {
    await expect(runAutonomous(graph, path, dep, { expectedProject: repo })).rejects.toThrow(/simulated crash/);
    const saved = loadRunState(path)!; expect(saved.tasks[0]!.pendingDecision?.status).toBe("ready"); expect(saved.tasks[0]!.pendingDecision?.selectedId).toBe("safe"); expect(saved.tasks[0]!.pendingDecision?.continuationPrompt).toContain("Use the reversible adapter"); expect(saved.activeResultPath).not.toBeNull();
    const recovered = await runAutonomous(graph, path, { ...dep, failpoint: undefined }, { expectedProject: repo });
    expect(decisionCalls).toBe(1); expect(resumedPrompt).toContain("Use the reversible adapter"); expect(recovered.tasks[0]!.status).toBe("done");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a crash during the Jev request resumes with sem-jev instead of repeating the request", async () => {
  const { home, repo, graph, path } = fixture([task("A")]); let decisionCalls = 0, taskCalls = 0;
  const dep = deps({
    execute: async (request) => { taskCalls++; if (!request.prompt.includes("Previously journaled coordinator decision")) return { ...result("A", "decision_required"), sessionId: "thread-b", decisionSpec }; return result("A"); },
    decideSpec: async () => { decisionCalls++; return { selectedId: "safe", source: "jev", status: "consenso", specHash: "5".repeat(64), receiptHash: "3".repeat(64) }; },
    failpoint: (stage) => { if (stage === "decision-request-persisted") throw new Error("crash before Jev response"); },
  });
  try {
    await expect(runAutonomous(graph, path, dep, { expectedProject: repo })).rejects.toThrow(/crash before Jev/);
    const pending = loadRunState(path)!; expect(pending.tasks[0]!.pendingDecision?.status).toBe("requesting");
    const recovered = await runAutonomous(graph, path, { ...dep, failpoint: undefined }, { expectedProject: repo });
    expect(decisionCalls).toBe(0); expect(taskCalls).toBe(2); expect(recovered.tasks[0]!.decisions[0]?.method).toBe("sem-jev"); expect(recovered.tasks[0]!.status).toBe("done");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("no-progress ticket is blocked and an independent eligible ticket still runs", async () => {
  const { home, repo, graph, path } = fixture([task("stuck"), task("independent")]), executed: string[] = [];
  try {
    const state = await runAutonomous(graph, path, deps({
      execute: async (request) => { executed.push(request.task.id); return result(request.task.id, request.task.id === "stuck" ? "no_progress" : "completed"); },
    }), { expectedProject: repo });
    expect(executed).toEqual(["stuck", "independent"]); expect(state.tasks[0]!.status).toBe("blocked"); expect(state.tasks[1]!.status).toBe("done"); expect(state.status).toBe("blocked");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
