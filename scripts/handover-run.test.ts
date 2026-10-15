import { describe, expect, test } from "bun:test";
import { checkArgs, OWNER_SESSION } from "./handover-run";

const HOME = "C:\\agent\\home";
const FACTS = "C:\\scratch\\facts.json";
const run = (...a: string[]) => checkArgs(a);
const ok = (r: ReturnType<typeof checkArgs>) => r.ok;

describe("the read-only step", () => {
  test("`plan` needs only an absolute home: no --execute, no owner, no facts file", () => {
    expect(run("--home", HOME, "--step", "plan")).toMatchObject({ ok: true, step: "plan", facts: null });
  });
  test("a relative or missing home, or an unknown step, is refused", () => {
    expect(ok(run("--step", "plan"))).toBe(false);
    expect(ok(run("--home", "agent/home", "--step", "plan"))).toBe(false);
    expect(ok(run("--home", HOME, "--step", "kill"))).toBe(false);
    expect(ok(run("--home", HOME))).toBe(false);
  });
});

describe("the open-plans option is explicit", () => {
  test("it is off unless --allow-open-plans is given, for every step", () => {
    expect(run("--home", HOME, "--step", "plan")).toMatchObject({ ok: true, allowOpenPlans: false });
    expect(run("--home", HOME, "--step", "quiesce", "--execute", "--owner", OWNER_SESSION, "--facts", FACTS)).toMatchObject({ ok: true, allowOpenPlans: false });
  });
  test("it is on only when asked, and it never relaxes the other guards", () => {
    expect(run("--home", HOME, "--step", "plan", "--allow-open-plans")).toMatchObject({ ok: true, allowOpenPlans: true });
    expect(run("--home", HOME, "--step", "quiesce", "--allow-open-plans", "--execute", "--owner", OWNER_SESSION, "--facts", FACTS)).toMatchObject({ ok: true, allowOpenPlans: true });
    expect(ok(run("--home", HOME, "--step", "quiesce", "--allow-open-plans", "--owner", OWNER_SESSION, "--facts", FACTS))).toBe(false);
    expect(ok(run("--home", HOME, "--step", "quiesce", "--allow-open-plans", "--execute", "--owner", "someone-else", "--facts", FACTS))).toBe(false);
  });
});

describe("the steps that change the agent's state", () => {
  for (const step of ["quiesce", "reconnect"]) {
    test(`${step}: nothing without --execute`, () => {
      expect(ok(run("--home", HOME, "--step", step, "--owner", OWNER_SESSION, "--facts", FACTS))).toBe(false);
    });
    test(`${step}: nothing with another or a missing owner`, () => {
      expect(ok(run("--home", HOME, "--step", step, "--execute", "--owner", "someone-else", "--facts", FACTS))).toBe(false);
      expect(ok(run("--home", HOME, "--step", step, "--execute", "--facts", FACTS))).toBe(false);
    });
    test(`${step}: the facts file must be absolute and OUTSIDE the agent home`, () => {
      expect(ok(run("--home", HOME, "--step", step, "--execute", "--owner", OWNER_SESSION))).toBe(false);
      expect(ok(run("--home", HOME, "--step", step, "--execute", "--owner", OWNER_SESSION, "--facts", "facts.json"))).toBe(false);
      expect(ok(run("--home", HOME, "--step", step, "--execute", "--owner", OWNER_SESSION, "--facts", `${HOME}\\facts.json`))).toBe(false);
      expect(ok(run("--home", HOME, "--step", step, "--execute", "--owner", OWNER_SESSION, "--facts", `${HOME}\\sub\\facts.json`))).toBe(false);
    });
    test(`${step}: allowed only with --execute, the owner session and a facts file outside the home`, () => {
      const r = run("--home", HOME, "--step", step, "--execute", "--owner", OWNER_SESSION, "--facts", FACTS);
      expect(r).toMatchObject({ ok: true, step });
    });
  }
  test("the owner is the session recorded in the coordination notes", () => {
    expect(OWNER_SESSION).toBe("a645aa24-a0d6-487a-bc12-0ed706e0c859");
  });
});
