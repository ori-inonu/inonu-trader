import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPTS = resolve(import.meta.dir);
const SESSION = "session-under-test";
const dirs: string[] = [];
const project = (): string => {
  const d = mkdtempSync(join(tmpdir(), "goal-hooks-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const run = (script: string, args: string[], cwd: string, stdin = ""): { code: number | null; out: string; err: string } => {
  const r = Bun.spawnSync(["bun", "--no-env-file", join(SCRIPTS, script), ...args], { cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: cwd }, stdin: new TextEncoder().encode(stdin), stdout: "pipe", stderr: "pipe", timeout: 30_000 });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};
const set = (cwd: string, extra: string[] = []) => run("goal.ts", ["set", "--session", SESSION, "--goal", "Find the path to the owner's goal.", ...extra], cwd);
const hookInput = (over: Record<string, unknown> = {}): string => JSON.stringify({ session_id: SESSION, hook_event_name: "Stop", ...over });

describe("the Stop hook keeps the one session working with the next step, and leaves every other session alone", () => {
  test("for the session of the goal it answers with a block and a reason that carries the rails", () => {
    const cwd = project();
    set(cwd);
    const out = JSON.parse(run("goal-stop.ts", [], cwd, hookInput()).out);
    expect([out.decision, out.reason.includes("Nunca enviar")]).toEqual(["block", true]);
  });

  test("for another session it prints nothing and exits 0", () => {
    const cwd = project();
    set(cwd);
    const r = run("goal-stop.ts", [], cwd, hookInput({ session_id: "another" }));
    expect([r.out, r.code]).toEqual(["", 0]);
  });

  test("with no goal at all it prints nothing", () => {
    expect(run("goal-stop.ts", [], project(), hookInput()).out).toBe("");
  });

  test("a goal whose check says it is achieved lets the session stop", () => {
    const cwd = project();
    set(cwd, ["--check", "echo Estado do objetivo: ATINGIDO"]);
    expect(run("goal-stop.ts", [], cwd, hookInput()).out).toBe("");
  });

  test("a goal whose check says it is not achieved keeps the session going", () => {
    const cwd = project();
    set(cwd, ["--check", "echo Estado do objetivo: NAO ATINGIDO"]);
    expect(JSON.parse(run("goal-stop.ts", [], cwd, hookInput()).out).decision).toBe("block");
  });

  test("a paused goal lets the session stop", () => {
    const cwd = project();
    set(cwd);
    run("goal.ts", ["pause"], cwd);
    expect(run("goal-stop.ts", [], cwd, hookInput()).out).toBe("");
  });

  test("a stop with a feature waiting hands that feature over, with its verify command", () => {
    const cwd = project();
    set(cwd);
    run("goal.ts", ["add", "implementar", "Build the recorder", "--verify", "echo proof"], cwd);
    const out = JSON.parse(run("goal-stop.ts", [], cwd, hookInput()).out);
    expect([out.reason.includes("Build the recorder"), out.reason.includes("echo proof")]).toEqual([true, true]);
  });

  test("garbage on stdin does not break the session: nothing printed, exit 0", () => {
    const r = run("goal-stop.ts", [], project(), "not json");
    expect([r.out, r.code]).toEqual(["", 0]);
  });
});

describe("a feature passes only when its verify command exits 0, never because the session says so", () => {
  test("retargeting changes the goal and its check and keeps the features that were already queued", () => {
    const cwd = project();
    set(cwd);
    run("goal.ts", ["add", "implementar", "A feature", "--verify", "true"], cwd);
    run("goal.ts", ["retarget", "--goal", "A reframed goal", "--check", "echo ATINGIDO"], cwd);
    const status = run("goal.ts", ["status"], cwd).out;
    expect([status.includes("A reframed goal"), status.includes("A feature"), run("goal.ts", ["check"], cwd).out.includes("ATINGIDO")]).toEqual([true, true, true]);
  });

  test("a passing command marks the feature as passing", () => {
    const cwd = project();
    set(cwd);
    run("goal.ts", ["add", "implementar", "F", "--verify", "exit 0"], cwd);
    expect(run("goal.ts", ["pass", "t1"], cwd).code).toBe(0);
  });

  test("a failing command refuses to mark it, with the exit code, and the feature stays not passing", () => {
    const cwd = project();
    set(cwd);
    run("goal.ts", ["add", "implementar", "F", "--verify", "exit 4"], cwd);
    const r = run("goal.ts", ["pass", "t1", "--evidence", "I am sure"], cwd);
    expect([r.code, r.err.includes("NAO passou"), run("goal.ts", ["status"], cwd).out.includes("0 de 1 passaram")]).toEqual([1, true, true]);
  });

  test("a feature with no verify command needs evidence, not a bare claim", () => {
    const cwd = project();
    set(cwd);
    run("goal.ts", ["add", "planejar", "Plan"], cwd);
    expect(run("goal.ts", ["pass", "t1"], cwd).code).toBe(2);
  });
});

describe("the session start hands over the bearings and the prompt hook clears the wait for the person", () => {
  test("at a session start the bearings carry the goal, the features and the rails", () => {
    const cwd = project();
    set(cwd);
    run("goal.ts", ["add", "planejar", "Write the plan"], cwd);
    const out = JSON.parse(run("goal-context.ts", [], cwd, hookInput({ hook_event_name: "SessionStart" })).out);
    const text: string = out.hookSpecificOutput.additionalContext;
    expect([out.hookSpecificOutput.hookEventName, text.includes("Write the plan"), text.includes("Nunca enviar")]).toEqual(["SessionStart", true, true]);
  });

  test("a prompt of the person gets a short reminder and, if the loop was waiting for them, it counts again", () => {
    const cwd = project();
    set(cwd);
    const out = JSON.parse(run("goal-context.ts", [], cwd, hookInput({ hook_event_name: "UserPromptSubmit", prompt: "oi" })).out);
    expect(out.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  });
});

describe("the rails hook refuses what an unattended session must not touch, and only for its own session", () => {
  const call = (cwd: string, command: string, session = SESSION) => run("goal-rails.ts", [], cwd, JSON.stringify({ session_id: session, tool_name: "Bash", tool_input: { command } }));

  test("stopping a process by name is denied with the reason", () => {
    const cwd = project();
    set(cwd);
    expect(JSON.parse(call(cwd, "Get-Process python* | Stop-Process -Force").out).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  test("a harmless command passes with no output", () => {
    const cwd = project();
    set(cwd);
    expect(call(cwd, "git status --short").out).toBe("");
  });

  test("another session is never refused", () => {
    const cwd = project();
    set(cwd);
    expect(call(cwd, "git push origin main", "another").out).toBe("");
  });
});
