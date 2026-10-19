import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { workerEnvironment as safeWorkerEnvironment } from "./codex-adapter";
export interface WorkEntry { status: string; size: number | null; mtimeMs: number | null }
export type WorkSnapshot = Record<string, WorkEntry>;
const ignored = (path: string) => /(?:^|[\\/])(?:\.env[^\\/]*|data|\.git)(?:[\\/]|$)/i.test(path);
export function captureWorkspaceStatus(root: string): WorkSnapshot {
  const result = Bun.spawnSync(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all"], { cwd: root, env: safeWorkerEnvironment(), stdout: "pipe", stderr: "ignore" });
  if (result.exitCode !== 0) throw new Error("could not capture workspace status");
  const parts = result.stdout.toString().split("\0"), out: WorkSnapshot = {};
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]!; if (entry.length < 4) continue;
    const code = entry.slice(0, 2), path = entry.slice(3).replace(/\\/g, "/");
    if (!ignored(path)) { const absolute = join(root, path); let size: number | null = null, mtimeMs: number | null = null; try { if (existsSync(absolute)) { const stat = statSync(absolute); size = stat.size; mtimeMs = stat.mtimeMs; } } catch {} out[path] = { status: code, size, mtimeMs }; }
    if (code.includes("R") || code.includes("C")) i++;
  }
  return out;
}
export function allowedPath(path: string, patterns: string[]): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return patterns.some((pattern) => { const p = pattern.replace(/\\/g, "/").toLowerCase(); return p.endsWith("/**") ? normalized.startsWith(p.slice(0, -2)) : normalized === p; });
}
export function unauthorizedChanges(before: WorkSnapshot, after: WorkSnapshot, patterns: string[]): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter((path) => JSON.stringify(before[path] ?? null) !== JSON.stringify(after[path] ?? null) && !allowedPath(path, patterns)).sort();
}
