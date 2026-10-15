/**
 * One agent per data folder. Two processes on the same folder would each hold their own memory of the ledger and could both send the same exit or purchase, so the process that holds the folder writes a
 * lock file with its pid; another process refuses to run cycles while that pid is alive, and takes the lock over when it is not (a process that died, or was restarted by the watcher). A lock that cannot be
 * written is no lock: the agent does not run. Reads and a status are still allowed from either process; only cycles are refused.
 */
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface AgentLock {
  /** True while this process holds the folder. */
  held(): boolean;
  /** Releases the lock if this process holds it. */
  release(): void;
}

export interface LockDeps {
  readonly pid: number;
  /** Whether a process with this pid is running. */
  readonly alive: (pid: number) => boolean;
  readonly now: () => number;
}

export const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists and is not ours to signal: it is alive
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** A lock file that cannot be read is a stale one only when it has not been touched for this long: a file another process is writing right now is empty for a moment. */
const UNREADABLE_STALE_AFTER_MS = 5_000;

type Owner = { readonly pid: number | null; readonly settling: boolean };

function ownerOf(path: string, nowMs: number): Owner {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown };
    const pid = typeof parsed.pid === "number" && Number.isSafeInteger(parsed.pid) && parsed.pid > 0 ? parsed.pid : null;
    return { pid, settling: false };
  } catch {
    try {
      return { pid: null, settling: nowMs - statSync(path).mtimeMs < UNREADABLE_STALE_AFTER_MS };
    } catch {
      return { pid: null, settling: false };
    }
  }
}

export function acquireAgentLock(path: string, deps: LockDeps = { pid: process.pid, alive: processAlive, now: Date.now }): AgentLock {
  let held = false;
  const mine = `${JSON.stringify({ pid: deps.pid, startedAtMs: deps.now() })}\n`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    // creation is exclusive: of several processes starting at the same instant, one creates the file and the others find it
    for (let attempt = 0; attempt < 3 && !held; attempt++) {
      try {
        writeFileSync(path, mine, { flag: "wx" });
        held = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const owner = ownerOf(path, deps.now());
        if (owner.settling) return { held: () => false, release: () => {} };
        if (owner.pid === deps.pid) {
          // our own earlier file (a restart in the same process): ours again
          writeFileSync(path, mine);
          held = true;
        } else if (owner.pid !== null && deps.alive(owner.pid)) {
          return { held: () => false, release: () => {} };
        } else {
          // stale: removed, and the exclusive creation above decides who gets the next one
          rmSync(path, { force: true });
        }
      }
    }
    // whoever wrote last is the owner: if the file now names someone else, this process does not hold the folder
    if (held) held = ownerOf(path, deps.now()).pid === deps.pid;
  } catch {
    held = false;
  }
  return {
    held: () => held,
    release() {
      if (!held) return;
      held = false;
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown };
        if (parsed.pid === deps.pid) rmSync(path, { force: true });
      } catch {
        // already gone
      }
    },
  };
}
