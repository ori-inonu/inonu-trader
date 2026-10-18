/**
 * Where the goal of a session lives on disk, and the two reads the hooks need: the state and the progress file (Anthropic's `claude-progress.txt`) in `.claude/goal/` of the project, and a digest of the work in the folder.
 * Writes are atomic (a temporary file and a rename), a state that cannot be read is treated as absent and never as an error that stops a hook, and nothing here reaches the network or the environment.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GoalState } from "./loop";

export const goalDir = (projectDir: string): string => join(projectDir, ".claude", "goal");

export function loadState(projectDir: string): GoalState | null {
  try {
    const path = join(goalDir(projectDir), "state.json");
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8")) as GoalState;
    return raw !== null && typeof raw === "object" && raw.v === 1 && typeof raw.sessionId === "string" && Array.isArray(raw.queue) ? raw : null;
  } catch {
    return null;
  }
}

export function saveState(projectDir: string, state: GoalState): void {
  const dir = goalDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `state.json.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, join(dir, "state.json"));
}

export function appendProgress(projectDir: string, line: string, nowMs: number): void {
  const dir = goalDir(projectDir);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "progress.txt"), `${new Date(nowMs).toISOString()} ${line.replace(/\s+/g, " ").trim()}\n`);
}

/** The last lines of the progress file, for the bearings of a new session. */
export function progressTail(projectDir: string, lines = 8): string[] {
  try {
    const path = join(goalDir(projectDir), "progress.txt");
    return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).slice(-lines) : [];
  } catch {
    return [];
  }
}

/** A digest of what changed in the folder: the commit, and the size and time of every modified or new file git sees (at most 4000). Equal digests mean nothing new was made between two stops. */
export function workDigest(projectDir: string): string {
  const run = (args: string[]): string => {
    try {
      const r = Bun.spawnSync(["git", ...args], { cwd: projectDir, stdout: "pipe", stderr: "ignore" });
      return r.exitCode === 0 ? r.stdout.toString() : "";
    } catch {
      return "";
    }
  };
  const head = run(["rev-parse", "HEAD"]).trim();
  const files = run(["ls-files", "-m", "-o", "--exclude-standard"]).split("\n").filter(Boolean).slice(0, 4000).sort();
  const lines = files.map((f) => {
    try {
      const s = statSync(join(projectDir, f));
      return `${f}:${s.size}:${Math.floor(s.mtimeMs)}`;
    } catch {
      return `${f}:gone`;
    }
  });
  return createHash("sha256").update([head, ...lines].join("\n")).digest("hex");
}

/** Runs a command line in a shell with a time limit; the exit code is null when it was killed by the limit or could not start. Output is stdout then stderr, cut to the last 4000 characters. */
export function runShell(command: string, cwd: string, timeoutMs: number): { exitCode: number | null; output: string } {
  try {
    const r = Bun.spawnSync(["bash", "-c", command], { cwd, stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
    const text = `${r.stdout.toString()}${r.stderr.toString()}`;
    return { exitCode: r.exitCode, output: text.length > 4000 ? text.slice(-4000) : text };
  } catch {
    return { exitCode: null, output: "" };
  }
}

/** What a check command printed, as a verdict: "NAO ATINGIDO" is false, "ATINGIDO" is true, and with neither the exit code decides (0 is true). Null when it could not be run. */
export function verdictOf(output: string, exitCode: number | null): boolean | null {
  if (exitCode === null) return null;
  if (/NAO ATINGIDO/i.test(output)) return false;
  if (/\bATINGIDO\b/i.test(output)) return true;
  return exitCode === 0;
}
