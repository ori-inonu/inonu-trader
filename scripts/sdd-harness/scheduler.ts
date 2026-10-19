import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export type Risk = "low" | "medium" | "high";
export interface SddTask {
  id: string;
  title: string;
  acceptance: string[];
  dependsOn: string[];
  writePaths: string[];
  verifyArgv: string[][];
  risk: Risk;
  reversible: boolean;
  fenced?: boolean;
  initialStatus?: "todo" | "done" | "blocked";
}
export interface SddTaskPlan { version: 1; id: string; objective: string; authorizedScope: string; tasks: SddTask[]; sourcePath: string; sourceHash: string }
const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const idValid = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id);
function safeRelative(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes(":") || path.includes("\0") || path.split(/[\\/]/).includes("..")) return false;
  return !/(?:^|[\\/])(?:\.env[^\\/]*|data|\.git)(?:[\\/]|$)/i.test(path);
}
function validateDag(tasks: SddTask[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) for (const dependency of task.dependsOn) if (!byId.has(dependency) || dependency === task.id) throw new Error(`invalid dependency for ${task.id}`);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => { if (visiting.has(id)) throw new Error("task plan contains a dependency cycle"); if (visited.has(id)) return; visiting.add(id); for (const dep of byId.get(id)!.dependsOn) visit(dep); visiting.delete(id); visited.add(id); };
  for (const task of tasks) visit(task.id);
}
function parseTaskPlan(raw: unknown, sourcePath: string, sourceHash: string): SddTaskPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("task plan must be an object");
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || typeof value.id !== "string" || !idValid(value.id) || typeof value.objective !== "string" || !value.objective.trim() || value.objective.length > 600 || typeof value.authorizedScope !== "string" || !value.authorizedScope.trim() || !Array.isArray(value.tasks) || value.tasks.length === 0) throw new Error("invalid task plan header");
  const tasks = value.tasks.map((entry: any): SddTask => {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !idValid(entry.id) || typeof entry.title !== "string" || !entry.title.trim() || !Array.isArray(entry.acceptance) || entry.acceptance.some((x: unknown) => typeof x !== "string") || !Array.isArray(entry.dependsOn) || entry.dependsOn.some((x: unknown) => typeof x !== "string") || !Array.isArray(entry.writePaths) || entry.writePaths.length === 0 || entry.writePaths.some((x: unknown) => typeof x !== "string" || !safeRelative(x)) || !Array.isArray(entry.verifyArgv) || entry.verifyArgv.length === 0 || entry.verifyArgv.some((argv: unknown) => !Array.isArray(argv) || argv.length === 0 || argv.some((x) => typeof x !== "string" || x.length === 0)) || !["low", "medium", "high"].includes(entry.risk) || typeof entry.reversible !== "boolean" || (entry.initialStatus !== undefined && !["todo", "done", "blocked"].includes(entry.initialStatus))) throw new Error(`invalid task definition: ${String(entry?.id ?? "unknown")}`);
    return { id: entry.id, title: entry.title, acceptance: [...entry.acceptance], dependsOn: [...entry.dependsOn], writePaths: [...entry.writePaths], verifyArgv: entry.verifyArgv.map((a: string[]) => [...a]), risk: entry.risk, reversible: entry.reversible, ...(entry.fenced === true ? { fenced: true } : {}), ...(entry.initialStatus === undefined ? {} : { initialStatus: entry.initialStatus }) };
  });
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) throw new Error("duplicate task id");
  validateDag(tasks);
  return { version: 1, id: value.id, objective: value.objective, authorizedScope: value.authorizedScope, tasks, sourcePath, sourceHash };
}
export function loadTaskPlan(path: string, root: string): SddTaskPlan {
  const key = (p: string) => process.platform === "win32" ? p.toLowerCase() : p;
  const same = (a: BigIntStats, b: BigIntStats) => a.isFile() && b.isFile() && a.nlink === 1n && b.nlink === 1n && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
  let descriptor: number | undefined, source: Buffer, canonicalFile: string;
  try {
    const resolved = resolve(path), canonicalRoot = realpathSync(root);
    canonicalFile = realpathSync(resolved);
    const rel = relative(canonicalRoot, canonicalFile), before = lstatSync(resolved, { bigint: true });
    if (!rel || !safeRelative(rel) || !before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || key(resolved) !== key(canonicalFile)) throw new Error();
    descriptor = openSync(resolved, "r");
    if (!same(before, fstatSync(descriptor, { bigint: true }))) throw new Error();
    source = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < source.length) { const count = readSync(descriptor, source, offset, source.length - offset, offset); if (!count) throw new Error(); offset += count; }
    if (!same(before, fstatSync(descriptor, { bigint: true })) || !same(before, lstatSync(resolved, { bigint: true })) || key(realpathSync(resolved)) !== key(canonicalFile)) throw new Error();
  } catch { throw new Error("task file binding invalid"); }
  finally { if (descriptor !== undefined) try { closeSync(descriptor); } catch {} }
  let raw: unknown; try { raw = JSON.parse(source.toString("utf8").replace(/^\uFEFF/, "")); } catch { throw new Error("task plan invalid JSON"); }
  return parseTaskPlan(raw, canonicalFile, hash(source));
}
export function nextEligibleTask(plan: SddTaskPlan, state: TaskGraphView): SddTask | null {
  const statuses = new Map(state.tasks.map((task) => [task.id, task.status]));
  return plan.tasks.find((task) => statuses.get(task.id) === "todo" && task.dependsOn.every((dependency) => statuses.get(dependency) === "done")) ?? null;
}
export function propagateBlockedDependencies(plan: SddTaskPlan, state: TaskGraphView): boolean {
  let changed = false, again = true;
  while (again) {
    again = false; const statuses = new Map(state.tasks.map((task) => [task.id, task.status]));
    for (const task of plan.tasks) {
      const current = state.tasks.find((candidate) => candidate.id === task.id)!;
      const blocker = task.dependsOn.find((dependency) => statuses.get(dependency) === "blocked");
      if (current.status === "todo" && blocker) { current.status = "blocked"; current.reason = `dependency ${blocker} is blocked`; changed = true; again = true; }
    }
  }
  return changed;
}
export function objectiveTerminal(plan: SddTaskPlan, state: TaskGraphView): "complete" | "blocked" | null {
  if (state.tasks.some((task) => task.status === "running")) return null;
  if (state.tasks.every((task) => task.status === "done")) return "complete";
  if (state.tasks.every((task) => task.status === "done" || task.status === "blocked")) return "blocked";
  if (nextEligibleTask(plan, state) === null) return "blocked";
  return null;
}
export interface TaskGraphView { tasks: { id: string; status: "todo" | "running" | "done" | "blocked"; reason?: string }[] }
export function eligibleTaskSet(plan: SddTaskPlan, state: TaskGraphView): SddTask[] {
  const statuses = new Map(state.tasks.map((task) => [task.id, task.status]));
  return plan.tasks.filter((task) => statuses.get(task.id) === "todo" && task.dependsOn.every((dependency) => statuses.get(dependency) === "done"));
}
