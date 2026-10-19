import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCodexArgs, executeCodexTask, readCodexResultFile, workerEnvironment, type CodexRun } from "./codex-adapter";
import type { SddTask, SddTaskPlan } from "./scheduler";

const task: SddTask = { id: "F03-T01", title: "bounded task", acceptance: ["outputs verified"], dependsOn: [], writePaths: ["scripts/sdd-harness/**"], verifyArgv: [["bun", "--no-env-file", "test"]], risk: "low", reversible: true };
const plan: SddTaskPlan = { version: 1, id: "f03", objective: "test host adapter", authorizedScope: "mock only", sourcePath: "task.json", sourceHash: "a".repeat(64), tasks: [task] };
function request(dir: string, sessionId: string | null): CodexRun { return { project: dir, task, plan, prompt: "one task", sessionId, resultSchema: join(process.cwd(), "scripts/sdd-harness/runner-result.schema.json"), resultPath: join(dir, "last.json"), onSpawn: () => {}, onSessionId: () => {} }; }
const validWireResult = () => ({ task_id: task.id, outcome: "completed", summary: "done", acceptance_coverage: [{ criterion: "A accepted", verification_indices: [0], evidence_paths: [] }], reason: null, evidence: [], decision_spec: null });

test("structured result remains recoverable until the coordinator persists its checkpoint", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-result-retained-")), path = join(dir, "result.json");
  const raw = JSON.stringify(validWireResult());
  try {
    writeFileSync(path, raw);
    expect(readCodexResultFile(path, task, "thread-1", 0)?.outcome).toBe("completed");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(raw);
    expect(readCodexResultFile(path, task, "thread-1", null)?.outcome).toBe("blocked");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a nonregular result is safely refused and retained", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-result-nonregular-")), path = join(dir, "result.json");
  try {
    mkdirSync(path);
    const parsed = readCodexResultFile(path, task, "thread-1", 0);
    expect(parsed?.outcome).toBe("blocked");
    expect(parsed?.summary).toBe("Codex task result is not a regular file");
    expect(existsSync(path)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("result byte budget accepts 64 KiB exactly and refuses one extra byte without deleting either output", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-result-byte-boundary-")), path = join(dir, "result.json");
  const raw = JSON.stringify(validWireResult());
  try {
    writeFileSync(path, raw + " ".repeat(65536 - Buffer.byteLength(raw)));
    expect(readCodexResultFile(path, task, "thread-1", 0)?.outcome).toBe("completed");
    writeFileSync(path, raw + " ".repeat(65537 - Buffer.byteLength(raw)));
    const refused = readCodexResultFile(path, task, "thread-1", 0);
    expect(refused?.outcome).toBe("blocked");
    expect(refused?.summary).toBe("Codex task result exceeded 64 KiB");
    expect(existsSync(path)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a result path redirected by a junction is left untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-result-junction-")), target = join(dir, "target"), path = join(dir, "result.json");
  mkdirSync(target); symlinkSync(target, path, "junction");
  try {
    expect(readCodexResultFile(path, task, "thread-1", 0)).toBeNull();
    expect(existsSync(path)).toBe(true);
    expect(existsSync(target)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("schema string limits admit valid Unicode and exact field boundaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-result-schema-boundary-")), path = join(dir, "result.json");
  try {
    writeFileSync(path, JSON.stringify({ ...validWireResult(), summary: "😀".repeat(1200), reason: "r".repeat(600),
      evidence: [{ path: "p".repeat(500), sha256: "a".repeat(64), summary: "m".repeat(500) }],
      acceptance_coverage: [{ criterion: "c".repeat(500), verification_indices: [0], evidence_paths: ["p".repeat(500)] }],
    }));
    const parsed = readCodexResultFile(path, task, "thread-1", 0);
    expect(parsed?.outcome).toBe("completed");
    expect(parsed?.reason).toBe("[redacted]");
    expect(parsed?.acceptanceCoverage[0]?.criterion.length).toBe(500);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test.each([
  ["verification indices", { acceptance_coverage: [{ criterion: "A accepted", verification_indices: ["0"], evidence_paths: [] }] }],
  ["evidence paths", { acceptance_coverage: [{ criterion: "A accepted", verification_indices: [0], evidence_paths: [123] }] }],
  ["null coverage", { acceptance_coverage: [null] }],
  ["null evidence", { evidence: [null] }],
  ["decision array", { decision_spec: [] }],
  ["extra property", { unexpected: true }],
  ["summary length", { summary: "x".repeat(1201) }],
  ["reason length", { reason: "x".repeat(601) }],
  ["coverage property", { acceptance_coverage: [{ criterion: "A accepted", verification_indices: [0], evidence_paths: [], unexpected: true }] }],
  ["negative index", { acceptance_coverage: [{ criterion: "A accepted", verification_indices: [-1], evidence_paths: [] }] }],
] as const)("structured result safely refuses invalid %s declared by the schema", (_name, invalid) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-result-schema-")), path = join(dir, "result.json");
  try {
    writeFileSync(path, JSON.stringify({ ...validWireResult(), ...invalid }));
    const parsed = readCodexResultFile(path, task, "thread-1", 0);
    expect(parsed?.outcome).toBe("blocked");
    expect(parsed?.summary).toBe("Codex task result violates the result schema");
    expect(parsed?.evidence).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Codex argv uses workspace-write and omits all approval bypass flags", () => {
  const start = buildCodexArgs("C:/codex.exe", request("C:/repo", null), "C:/state/result.json");
  expect(start.slice(0, 4)).toEqual(["C:/codex.exe", "-C", "C:/repo", "exec"]);
  expect(start).toContain("--sandbox"); expect(start).toContain("workspace-write"); expect(start).toContain("--ignore-user-config");
  for (const forbidden of ["--dangerously-bypass-approvals-and-sandbox", "--approve-for-me", "--auto", "--yolo"]) expect(start).not.toContain(forbidden);
  const resume = buildCodexArgs("C:/codex.exe", request("C:/repo", "thread-1"), "C:/state/result.json");
  expect(resume.slice(0, 6)).toEqual(["C:/codex.exe", "-C", "C:/repo", "exec", "resume", "thread-1"]);
  expect(resume).toContain('sandbox_mode="workspace-write"');
});

test("a session identifier cannot introduce CLI options", () => {
  expect(() => buildCodexArgs("C:/codex.exe", request("C:/repo", "--dangerously-bypass-approvals-and-sandbox"), "C:/state/result.json")).toThrow("invalid Codex session id");
});

test("Codex worker environment omits the Jev key", () => {
  const filtered = workerEnvironment({ PATH: "fixture-path", CODEX_HOME: "C:/fixture/.codex", TYPESAFE_AI_API_KEY: "fake-jev-secret", OPENAI_API_KEY: "fake-openai-secret", DATABASE_URL: "fake-db-secret" });
  expect(filtered).toEqual({ PATH: "fixture-path", CODEX_HOME: "C:/fixture/.codex" });
  expect(Object.prototype.hasOwnProperty.call(filtered, "TYPESAFE_AI_API_KEY")).toBe(false);
});

test.each(["spawn", "session"] as const)("a %s checkpoint failure blocks the result and interrupts only its owned host handle", async phase => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-host-checkpoint-")); let interruptions = 0;
  const raw = JSON.stringify(validWireResult());
  try {
    const fakeSpawn = ((_argv: string[], _options: unknown) => {
      writeFileSync(join(dir, "last.json"), raw);
      const stdout = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"thread.started","thread_id":"thread-1"}\n')); controller.close(); } });
      const stderr = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
      return { pid: 12, stdout, stderr, exited: Promise.resolve(0), kill: () => { interruptions++; } } as never;
    }) as unknown as typeof Bun.spawn;
    const fail = () => { throw new Error("synthetic checkpoint unavailable"); };
    const parsed = await executeCodexTask({ ...request(dir, null), onSpawn: phase === "spawn" ? fail : () => {}, onSessionId: phase === "session" ? fail : () => {} }, "C:/codex.exe", fakeSpawn);
    expect(parsed.outcome).toBe("blocked");
    expect(parsed.summary).toBe("Codex host process failed");
    expect(interruptions).toBe(1);
    expect(readFileSync(join(dir, "last.json"), "utf8")).toBe(raw);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test.each([
  ["thread-1", ["thread-1"], "thread-1"],
  ["--dangerously-bypass-approvals-and-sandbox", [], null],
] as const)("Codex adapter handles session %s without launching a CLI", async (incoming, expectedEvents, expectedSession) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-codex-adapter-")), session: string[] = [];
  try {
    const response = { task_id: task.id, outcome: "completed", summary: "done", acceptance_coverage: [{ criterion: "A accepted", verification_indices: [0], evidence_paths: [] }], reason: null, evidence: [], decision_spec: null };
    const fakeSpawn = ((args: string[], options: any) => {
      const outputPath = args[args.indexOf("--output-last-message") + 1]!; writeFileSync(outputPath, JSON.stringify(response));
      expect(Object.prototype.hasOwnProperty.call(options.env, "TYPESAFE_AI_API_KEY")).toBe(false); expect(Object.prototype.hasOwnProperty.call(options.env, "OPENAI_API_KEY")).toBe(false);
      const stdout = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "thread.started", thread_id: incoming }) + "\n")); controller.close(); } });
      const empty = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
      return { pid: 12, stdout, stderr: empty, exited: Promise.resolve(0) } as any;
    }) as typeof Bun.spawn;
    const result = await executeCodexTask({ ...request(dir, null), onSessionId: (id) => session.push(id) }, "C:/codex.exe", fakeSpawn);
    expect(result.outcome).toBe("completed"); expect(session).toEqual([...expectedEvents]); expect(result.sessionId).toBe(expectedSession);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
