import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync, type BigIntStats } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import type { SddTask, SddTaskPlan } from "./scheduler";
import type { CodexResult } from "./runner-state";

export interface CodexRun { project: string; task: SddTask; plan: SddTaskPlan; prompt: string; sessionId: string | null; decisionContext?: unknown; resultSchema: string; resultPath: string; onSpawn: (pid: number, interrupt: () => void) => void; onSessionId: (id: string) => void }
interface CodexWireResult { task_id: string; outcome: CodexResult["outcome"]; summary: string; acceptance_coverage: { criterion: string; verification_indices: number[]; evidence_paths: string[] }[]; reason: string | null; evidence: NonNullable<CodexResult["evidence"]>; decision_spec: unknown | null }
export function resolveCodexBinary(home = homedir(), override = process.env.SDD_CODEX_BIN): string {
  if (override !== undefined) { if (!isAbsolute(override) || !existsSync(override)) throw new Error("SDD_CODEX_BIN must be an existing absolute executable"); return realpathSync(override); }
  const extensions = join(home, ".vscode", "extensions");
  if (!existsSync(extensions)) throw new Error("OpenAI VS Code extension not found; configure SDD_CODEX_BIN");
  const candidates = readdirSync(extensions, { withFileTypes: true }).filter((item) => item.isDirectory() && /^openai\.chatgpt-.*win32-x64$/i.test(item.name)).map((item) => join(extensions, item.name)).filter((dir) => {
    try { const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); return pkg.publisher === "openai" && pkg.name === "chatgpt"; } catch { return false; }
  }).sort().reverse();
  const binary = candidates.map((dir) => join(dir, "bin", "windows-x86_64", "codex.exe")).find(existsSync);
  if (!binary) throw new Error("installed OpenAI extension has no Codex executable");
  return realpathSync(binary);
}
const validSessionId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
export function buildCodexArgs(binary: string, task: CodexRun, resultPath: string): string[] {
  if (task.sessionId !== null && !validSessionId(task.sessionId)) throw new Error("invalid Codex session id");
  const prefix = [binary, "-C", task.project, "exec"];
  const common = ["--json", "--ignore-user-config", "--output-schema", task.resultSchema, "--output-last-message", resultPath];
  return task.sessionId === null
    ? [...prefix, "--sandbox", "workspace-write", ...common, task.prompt]
    : [...prefix, "resume", task.sessionId, ...common, "-c", 'sandbox_mode="workspace-write"', task.prompt];
}
const redact = (text: string) => text.replace(/(?:sk-[A-Za-z0-9]{8,}|\b[A-Za-z0-9_-]{24,}\b)/g, "[redacted]").slice(-1200);
const WORKER_ENV_ALLOWLIST = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "HOME", "CODEX_HOME", "BUN_INSTALL", "BUN_BIN", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS", "OS", "COMSPEC", "LANG", "TERM", "CI", "NODE_ENV"]);
export const workerEnvironment = (source: NodeJS.ProcessEnv = process.env): Record<string, string> => Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined && WORKER_ENV_ALLOWLIST.has(entry[0].toUpperCase())));
function parseEvent(line: string, onSessionId: (id: string) => void): void {
  if (Buffer.byteLength(line) > 1024 * 1024) throw new Error("Codex event line exceeds 1 MiB");
  let event: unknown;
  try { event = JSON.parse(line); } catch { return; }
  if (!isRecord(event)) return;
  const thread = isRecord(event.thread) ? event.thread : null;
  const session = event.thread_id ?? thread?.id ?? event.session_id;
  if (validSessionId(session)) onSessionId(session);
}
export function parseCodexResult(raw: string, task: SddTask, sessionId: string | null, exitCode: number | null): CodexResult {
  const outputHash = createHash("sha256").update(raw).digest("hex");
  if (Buffer.byteLength(raw) > 64 * 1024) return { exitCode, sessionId, taskId: task.id, outcome: "blocked", summary: "Codex task result exceeded 64 KiB", acceptanceCoverage: [], reason: null, evidence: [], decisionSpec: null, outputHash };
  let value: unknown; try { value = JSON.parse(raw.replace(/^\uFEFF/, "")); } catch { return { exitCode, sessionId, taskId: task.id, outcome: "blocked", summary: "Codex task result is invalid JSON", acceptanceCoverage: [], reason: null, evidence: [], decisionSpec: null, outputHash }; }
  if (!validResult(value, task)) return { exitCode, sessionId, taskId: task.id, outcome: "blocked", summary: "Codex task result violates the result schema", acceptanceCoverage: [], reason: null, evidence: [], decisionSpec: null, outputHash };
  if (exitCode !== 0 && value.outcome === "completed") return { exitCode, sessionId, taskId: task.id, outcome: "blocked", summary: "Codex exited nonzero after reporting completion", acceptanceCoverage: value.acceptance_coverage.map((item) => ({ criterion: item.criterion, verificationIndices: item.verification_indices, evidencePaths: item.evidence_paths })), reason: `exit=${exitCode}`, evidence: value.evidence, decisionSpec: value.decision_spec, outputHash };
  return { exitCode, sessionId, taskId: value.task_id, outcome: value.outcome, summary: redact(value.summary), acceptanceCoverage: value.acceptance_coverage.map((item) => ({ criterion: item.criterion, verificationIndices: item.verification_indices, evidencePaths: item.evidence_paths })), reason: value.reason === null ? null : redact(value.reason), evidence: value.evidence.map((item) => ({ ...item, summary: redact(item.summary) })), decisionSpec: value.decision_spec, outputHash };
}
const MAX_RESULT_BYTES = 64 * 1024;
const sameFileVersion = (a: BigIntStats, b: BigIntStats): boolean => a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const refusedFile = (task: SddTask, sessionId: string | null, exitCode: number | null, summary: string): CodexResult => ({ exitCode, sessionId, taskId: task.id, outcome: "blocked", summary, acceptanceCoverage: [], reason: null, evidence: [], decisionSpec: null, outputHash: createHash("sha256").update(summary).digest("hex") });
/** Reads bounded bytes from one stable file; retained output supports recovery. */
export function readCodexResultFile(path: string, task: SddTask, sessionId: string | null, exitCode: number | null): CodexResult | null {
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path, { bigint: true });
    if (before.isSymbolicLink()) return null;
    if (!before.isFile()) return refusedFile(task, sessionId, exitCode, "Codex task result is not a regular file");
    descriptor = openSync(path, "r");
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFileVersion(before, opened)) return refusedFile(task, sessionId, exitCode, "Codex task result changed during reading");
    if (opened.size > BigInt(MAX_RESULT_BYTES)) return refusedFile(task, sessionId, exitCode, "Codex task result exceeded 64 KiB");
    const bytes = Buffer.alloc(MAX_RESULT_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_RESULT_BYTES) return refusedFile(task, sessionId, exitCode, "Codex task result exceeded 64 KiB");
    if (!sameFileVersion(opened, fstatSync(descriptor, { bigint: true })) || !sameFileVersion(opened, lstatSync(path, { bigint: true }))) return refusedFile(task, sessionId, exitCode, "Codex task result changed during reading");
    return parseCodexResult(bytes.subarray(0, length).toString("utf8"), task, sessionId, exitCode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return refusedFile(task, sessionId, exitCode, "Codex task result could not be read safely");
  } finally { if (descriptor !== undefined) try { closeSync(descriptor); } catch {} }
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactFields = (value: unknown, fields: readonly string[]): value is Record<string, unknown> => isRecord(value) && Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));
const textWithin = (value: unknown, max: number): value is string => typeof value === "string" && [...value].length <= max;
function validResult(value: unknown, task: SddTask): value is CodexWireResult {
  if (!exactFields(value, ["task_id", "outcome", "summary", "acceptance_coverage", "reason", "evidence", "decision_spec"]) || value.task_id !== task.id || typeof value.outcome !== "string" || !["completed", "blocked", "no_progress", "decision_required"].includes(value.outcome) || !textWithin(value.summary, 1200)) return false;
  if (!Array.isArray(value.acceptance_coverage) || !value.acceptance_coverage.every((item: unknown) =>
    exactFields(item, ["criterion", "verification_indices", "evidence_paths"]) && textWithin(item.criterion, 500) &&
    Array.isArray(item.verification_indices) && item.verification_indices.every((index: unknown) => typeof index === "number" && Number.isInteger(index) && index >= 0) &&
    Array.isArray(item.evidence_paths) && item.evidence_paths.every((path: unknown) => textWithin(path, 500)))) return false;
  if (!Array.isArray(value.evidence) || !value.evidence.every((item: unknown) =>
    exactFields(item, ["path", "sha256", "summary"]) && textWithin(item.path, 500) && typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256) && textWithin(item.summary, 500))) return false;
  return (value.reason === null || textWithin(value.reason, 600)) && (value.decision_spec === null || isRecord(value.decision_spec));
}
export async function executeCodexTask(input: CodexRun, binary = resolveCodexBinary(), spawn: typeof Bun.spawn = Bun.spawn): Promise<CodexResult> {
  const outputPath = input.resultPath;
  if (existsSync(outputPath)) throw new Error("unique Codex output path collision");
  const child = spawn(buildCodexArgs(binary, input, outputPath), { cwd: input.project, env: workerEnvironment(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let buffer = "", stderrTail = "", sessionId = input.sessionId;
  const idleTimeout = Number(process.env.SDD_IDLE_TIMEOUT_MS);
  const watchdogEnabled = Number.isSafeInteger(idleTimeout) && idleTimeout >= 1000;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const armWatchdog = () => { if (!watchdogEnabled) return; if (watchdog) clearTimeout(watchdog); watchdog = setTimeout(() => { try { child.kill("SIGINT"); } catch {} }, idleTimeout); };
  const clearWatchdog = () => { if (watchdog) clearTimeout(watchdog); };
  armWatchdog();
  const onSessionId = (id: string) => { sessionId = id; input.onSessionId(id); };
  const drainErr = (async () => { for await (const chunk of child.stderr) { armWatchdog(); stderrTail = redact(stderrTail + new TextDecoder().decode(chunk)); } })();
  try {
    input.onSpawn(child.pid, () => { try { child.kill("SIGINT"); } catch {} });
    for await (const chunk of child.stdout) {
      armWatchdog();
      buffer += new TextDecoder().decode(chunk, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) { parseEvent(buffer.slice(0, newline), onSessionId); buffer = buffer.slice(newline + 1); }
      if (Buffer.byteLength(buffer) > 1024 * 1024) throw new Error("Codex event line exceeds 1 MiB");
    }
    buffer += new TextDecoder().decode(new Uint8Array()); if (buffer) parseEvent(buffer, onSessionId);
    const exitCode = await child.exited; clearWatchdog(); await drainErr;
    if (!existsSync(outputPath)) return { exitCode, sessionId, taskId: input.task.id, outcome: "blocked", summary: "Codex produced no structured result", acceptanceCoverage: [], reason: `exit=${exitCode}; ${stderrTail}`.slice(0, 600), evidence: [], decisionSpec: null, outputHash: createHash("sha256").update(stderrTail).digest("hex") };
    const parsed = readCodexResultFile(outputPath, input.task, sessionId, exitCode);
    return parsed ?? { exitCode, sessionId, taskId: input.task.id, outcome: "blocked", summary: "Codex result disappeared", acceptanceCoverage: [], reason: null, evidence: [], decisionSpec: null, outputHash: createHash("sha256").update("missing").digest("hex") };
  } catch (error) {
    clearWatchdog();
    try { child.kill("SIGINT"); } catch {}
    const exitCode = await child.exited; clearWatchdog(); await drainErr;
    return { exitCode, sessionId, taskId: input.task.id, outcome: "blocked", summary: "Codex host process failed", acceptanceCoverage: [], reason: redact(`${error instanceof Error ? error.message : "host failure"}; exit=${exitCode}; ${stderrTail}`), evidence: [], decisionSpec: null, outputHash: createHash("sha256").update(stderrTail).digest("hex") };
  }
}
