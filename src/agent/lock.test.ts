import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireAgentLock, processAlive } from "./lock";

const dir = () => mkdtempSync(join(tmpdir(), "agent-lock-"));

describe("one agent per folder", () => {
  test("the first process holds the folder and writes its pid", () => {
    const d = dir();
    try {
      const lock = acquireAgentLock(join(d, "sub", "LOCK"), { pid: 111, alive: () => false, now: () => 5 });
      expect(lock.held()).toBe(true);
      expect(JSON.parse(readFileSync(join(d, "sub", "LOCK"), "utf8"))).toEqual({ pid: 111, startedAtMs: 5 });
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("a second process while the first is alive does not hold it, and does not touch the file", () => {
    const d = dir();
    try {
      const path = join(d, "LOCK");
      acquireAgentLock(path, { pid: 111, alive: () => true, now: () => 1 });
      const second = acquireAgentLock(path, { pid: 222, alive: (pid) => pid === 111, now: () => 2 });
      expect(second.held()).toBe(false);
      expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(111);
      second.release();
      expect(existsSync(path)).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("a lock whose process is dead is taken over", () => {
    const d = dir();
    try {
      const path = join(d, "LOCK");
      writeFileSync(path, JSON.stringify({ pid: 111, startedAtMs: 1 }));
      const lock = acquireAgentLock(path, { pid: 222, alive: () => false, now: () => 9 });
      expect(lock.held()).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(222);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("a lock file nobody can read is a stale one once it has been left alone for a while", () => {
    const d = dir();
    try {
      const path = join(d, "LOCK");
      writeFileSync(path, "{broken");
      const old = new Date(Date.now() - 60_000);
      utimesSync(path, old, old);
      expect(acquireAgentLock(path, { pid: 222, alive: () => true, now: () => Date.now() }).held()).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("a file another process is writing right now is not stale: the second one does not take it", () => {
    const d = dir();
    try {
      const path = join(d, "LOCK");
      writeFileSync(path, "");
      expect(acquireAgentLock(path, { pid: 222, alive: () => true, now: () => Date.now() }).held()).toBe(false);
      expect(readFileSync(path, "utf8")).toBe("");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("of several processes that start at the same instant exactly one holds the folder", async () => {
    const d = dir();
    try {
      const script = join(d, "try.ts");
      writeFileSync(script, `import { acquireAgentLock } from ${JSON.stringify(Bun.pathToFileURL(join(import.meta.dir, "lock.ts")).href)};\nconst lock = acquireAgentLock(process.argv[2]!);\nconsole.log(lock.held() ? "held" : "not");\nawait new Promise((r) => setTimeout(r, 400));\n`);
      const path = join(d, "LOCK");
      const runs = await Promise.all(Array.from({ length: 4 }, () => Bun.$`bun ${script} ${path}`.quiet().text()));
      expect(runs.filter((out) => out.trim() === "held")).toHaveLength(1);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, 30_000);

  test("the process that holds it releases it, and one that does not hold it cannot remove someone else's", () => {
    const d = dir();
    try {
      const path = join(d, "LOCK");
      const first = acquireAgentLock(path, { pid: 111, alive: () => false, now: () => 1 });
      const intruder = acquireAgentLock(path, { pid: 222, alive: (pid) => pid === 111, now: () => 2 });
      intruder.release();
      expect(existsSync(path)).toBe(true);
      first.release();
      expect(first.held()).toBe(false);
      expect(existsSync(path)).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("a lock that cannot be written is no lock", () => {
    const d = dir();
    try {
      // a directory where the lock file should be makes the write fail
      const path = join(d, "LOCK");
      mkdirSync(path);
      expect(acquireAgentLock(path, { pid: 1, alive: () => false, now: () => 1 }).held()).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("the real liveness check: this very process is alive, an absurd pid is not", () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(2_000_000_000)).toBe(false);
  });
});
