import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { mkdirSync, renameSync, unlinkSync, writeFileSync, readFileSync, existsSync, realpathSync, lstatSync } from "node:fs";
import { parseSpec, planOf } from "../../src/consensus/spec";
import { validateRunLimit } from "./limits";
import { acquireLease } from "./lease-lock";

export const projectRoot = (root = process.cwd()): string => realpathSync(resolve(root));
const stateRoot = (): string => join(realpathSync(homedir()), ".sdd-harness", "projects");
export const stateFile = (root: string): string => join(stateRoot(), `${createHash("sha256").update(projectRoot(root).toLowerCase()).digest("hex")}.json`);
export function assertSafeStateDirectory(expected: string, actual: string, repository: string): void {
  const normalize = (path: string) => resolve(path).replace(/[\\/]+$/, "").toLowerCase();
  const target = normalize(actual), expectedPath = normalize(expected), repo = normalize(repository);
  if (target !== expectedPath || target === repo || target.startsWith(repo + sep) || /(?:^|[\\/])(?:\.env[^\\/]*|data)(?:[\\/]|$)/i.test(actual)) throw new Error("caminho de estado recusado");
}
export function resolveSafeStateDirectory(create: boolean, repository = realpathSync(resolve(import.meta.dir, "../..")), home = homedir()): string | null {
  let dir = realpathSync(home);
  for (const component of [".sdd-harness", "projects"]) {
    dir = join(dir, component);
    if (!existsSync(dir)) { if (!create) return null; mkdirSync(dir); }
    if (lstatSync(dir).isSymbolicLink() || realpathSync(dir).toLowerCase() !== resolve(dir).toLowerCase()) throw new Error("caminho de estado redirecionado recusado");
  }
  assertSafeStateDirectory(dir, realpathSync(dir), repository);
  return dir;
}
export interface Checkpoint { v: 1; project: string; objective: string; iteration?: number; maxIterations?: number; deadlineMs?: number; updatedAt: number }
export function validateCheckpoint(value: unknown, root: string): Checkpoint {
  if (!value || typeof value !== "object") throw new Error("checkpoint invalido");
  const s = value as Record<string, unknown>;
  if (s.v !== 1 || s.project !== projectRoot(root) || typeof s.objective !== "string" || !s.objective.trim() || s.objective.length > 500 || (s.iteration !== undefined && (!Number.isSafeInteger(s.iteration) || (s.iteration as number) < 0)) || (s.maxIterations !== undefined && (!Number.isSafeInteger(s.maxIterations) || (s.maxIterations as number) < 1)) || (s.deadlineMs !== undefined && (!Number.isFinite(s.deadlineMs) || (s.deadlineMs as number) <= 0)) || !Number.isFinite(s.updatedAt)) throw new Error("checkpoint invalido");
  return s as unknown as Checkpoint;
}
export function loadCheckpoint(root: string): Checkpoint | null {
  const dir = resolveSafeStateDirectory(false), path = stateFile(root);
  if (!dir || !existsSync(path)) return null;
  if (lstatSync(path).isSymbolicLink()) throw new Error("checkpoint invalido");
  return validateCheckpoint(JSON.parse(readFileSync(path, "utf8")), root);
}
export function saveCheckpoint(root: string, state: Checkpoint): void {
  const dir = resolveSafeStateDirectory(true)!, name = createHash("sha256").update(projectRoot(root).toLowerCase()).digest("hex") + ".json", path = join(dir, name), lock = path + ".lock", temp = path + "." + process.pid + "." + randomUUID() + ".tmp";
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("checkpoint invalido");
  const release = acquireLease(lock);
  try {
    writeFileSync(temp, JSON.stringify(validateCheckpoint(state, root), null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temp, path);
  } finally {
    try { unlinkSync(temp); } catch {}
    release();
  }
}
export function planSpec(raw: unknown) { const spec = parseSpec(raw); return { spec, plan: planOf(spec) }; }
export function enforceCallLimit(raw: unknown, requested: unknown) {
  const { spec, plan } = planSpec(raw), maxCalls = validateRunLimit(requested);
  if (maxCalls !== undefined && plan.plannedCalls > maxCalls) throw new Error(`chamadas planejadas excedem teto da invocacao (${plan.plannedCalls} > ${maxCalls})`);
  return { parsed: spec, maxCalls, plannedCalls: plan.plannedCalls };
}
