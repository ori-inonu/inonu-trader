import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendProgress, goalDir, loadState, progressTail, runShell, saveState, verdictOf, workDigest } from "./io";
import { addTask, newState } from "./loop";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "goal-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const state = () => addTask(newState({ sessionId: "s1", goal: "g", nowMs: 1, deadlineMs: null, checkCommand: null, rails: ["r"] }), { stage: "planejar", title: "T" });

describe("the state of the goal is a file in the project, written atomically and never an error for a hook", () => {
  test("what is saved is what is loaded", () => {
    const dir = tmp();
    saveState(dir, state());
    expect(loadState(dir)!.queue[0]!.title).toBe("T");
  });

  test("with no file there is no goal", () => {
    expect(loadState(tmp())).toBeNull();
  });

  test("a file that is not a state is treated as absent, not as a crash", () => {
    const dir = tmp();
    mkdirSync(goalDir(dir), { recursive: true });
    writeFileSync(join(goalDir(dir), "state.json"), "{not json");
    expect(loadState(dir)).toBeNull();
  });

  test("saving leaves no temporary file behind", () => {
    const dir = tmp();
    saveState(dir, state());
    expect(readdirSync(goalDir(dir))).toEqual(["state.json"]);
  });

  test("the progress file keeps one line per entry, in order, and the tail returns the last ones", () => {
    const dir = tmp();
    for (let i = 1; i <= 12; i++) appendProgress(dir, `step ${i}`, Date.UTC(2026, 9, 15, 12, i));
    const tail = progressTail(dir, 3);
    expect([tail.length, tail[2]!.endsWith("step 12")]).toEqual([3, true]);
  });

  test("a line of progress never spans lines", () => {
    const dir = tmp();
    appendProgress(dir, "a\nb\n  c", 0);
    expect(progressTail(dir)).toHaveLength(1);
  });
});

describe("the digest of the work changes when a file does, and only then", () => {
  test("the same folder gives the same digest twice", () => {
    const dir = tmp();
    writeFileSync(join(dir, "a.txt"), "one");
    expect(workDigest(dir)).toBe(workDigest(dir));
  });
});

describe("a check command is read as a verdict: the words first, the exit code when there are none", () => {
  test("NAO ATINGIDO is false whatever the exit code", () => {
    expect(verdictOf("Estado do objetivo: NAO ATINGIDO", 0)).toBe(false);
  });

  test("ATINGIDO is true", () => {
    expect(verdictOf("Estado do objetivo: ATINGIDO", 0)).toBe(true);
  });

  test("with no words, exit 0 is true and any other is false", () => {
    expect([verdictOf("44 pass", 0), verdictOf("1 fail", 1)]).toEqual([true, false]);
  });

  test("a command that could not run is unknown, never a verdict", () => {
    expect(verdictOf("", null)).toBeNull();
  });
});

describe("a command run for a check has a time limit and never throws", () => {
  test("a command that finishes gives its exit code and its output", () => {
    const r = runShell("echo hello", tmpdir(), 5000);
    expect([r.exitCode, r.output.trim()]).toEqual([0, "hello"]);
  });

  test("a command that fails gives its exit code", () => {
    expect(runShell("exit 3", tmpdir(), 5000).exitCode).toBe(3);
  });

  test("a command that outlasts the limit is killed and the exit code is null, so the verdict is unknown", () => {
    expect(runShell("sleep 5", tmpdir(), 300).exitCode).toBeNull();
  });
});
