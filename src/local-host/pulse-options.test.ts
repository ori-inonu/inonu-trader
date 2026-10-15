import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { localPulseOption } from "./args";
import { localSupervisorPlan } from "./plan";

test("the core pulse option is explicit and refuses selftest before any runtime starts", () => {
  expect(localPulseOption([])).toBe(false);
  expect(localPulseOption(["--pulse"])).toBe(true);
  expect(localPulseOption(["--selftest"])).toBe(false);
  expect(() => localPulseOption(["--selftest", "--pulse"])).toThrow("local_selftest_pulse_forbidden");
  expect(() => localPulseOption(["--pulse", "--selftest", "--selftest-home", resolve("synthetic")])).toThrow("local_selftest_pulse_forbidden");
});

test("the detached supervisor keeps pulse, handoff and its exact private control while retaining the filtered environment", () => {
  const app = resolve("synthetic app"), home = resolve("synthetic home"), entry = resolve("synthetic launcher/main.ts"), exe = resolve("synthetic bun.exe"), control = resolve("synthetic home/control/stop.json");
  const plan = localSupervisorPlan(app, home, { Path: "C:/Windows", INONU_AGENT_PULSE: "1", PRIVATE_SYNTHETIC: "must-not-cross" }, entry, exe, { pulse: true, awaitHandoff: true, controlPath: control });
  expect(plan.command).toEqual([exe, "--no-env-file", "run", entry, "--app", app, "--home", home, "--await-handoff", "--pulse", "--control", control]);
  expect(plan.command).not.toContain("--background");
  expect(plan.env.Path).toBe("C:/Windows");
  expect(plan.env).not.toHaveProperty("INONU_AGENT_PULSE");
  expect(plan.env).not.toHaveProperty("PRIVATE_SYNTHETIC");
});

test("re-spawning without pulse never enables it from the parent's environment", () => {
  const plan = localSupervisorPlan(resolve("synthetic app"), resolve("synthetic home"), { INONU_AGENT_PULSE: "1" }, resolve("synthetic main.ts"), resolve("synthetic bun.exe"));
  expect(plan.command).not.toContain("--pulse");
  expect(plan.command).not.toContain("--await-handoff");
  expect(plan.command).not.toContain("--control");
  expect(plan.env).not.toHaveProperty("INONU_AGENT_PULSE");
});
