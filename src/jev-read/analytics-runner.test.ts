import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildPythonCommand } from "./analytics-runner";

const ROOT = "/repo";

describe("buildPythonCommand", () => {
  test("once mode calls jev_analytics once and forwards extra args after --", () => {
    const out = buildPythonCommand("once", ["--out", "/tmp/pack.json"], {}, ROOT);
    expect(out.cmd.slice(0, 4)).toEqual(["python", "-m", "jev_analytics", "once"]);
    expect(out.cmd).toContain("--out");
    expect(out.cmd).toContain("/tmp/pack.json");
    expect(out.cwd).toBe(join(ROOT, "python"));
    expect(out.env.PYTHONDONTWRITEBYTECODE).toBe("1");
    expect(out.env.PYTHONIOENCODING).toBe("utf-8");
  });

  test("run mode loops with the default 30 second interval", () => {
    const out = buildPythonCommand("run", [], {}, ROOT);
    expect(out.cmd).toEqual(["python", "-m", "jev_analytics", "loop", "--interval", "30"]);
  });

  test("test mode runs the unittest discovery and rejects extra args", () => {
    const out = buildPythonCommand("test", [], {}, ROOT);
    expect(out.cmd).toEqual(["python", "-m", "unittest", "discover", "-s", "tests", "-t", "."]);
    expect(() => buildPythonCommand("test", ["--out", "x"], {}, ROOT)).toThrow();
  });

  test("JEV_PYTHON overrides the executable when set and non empty", () => {
    expect(buildPythonCommand("once", [], { JEV_PYTHON: "python3.13" }, ROOT).cmd[0]).toBe("python3.13");
    expect(buildPythonCommand("once", [], { JEV_PYTHON: "  " }, ROOT).cmd[0]).toBe("python");
  });

  test("env is filtered to strings and extra args must be plain tokens", () => {
    const out = buildPythonCommand("once", [], { A: "1", B: undefined }, ROOT);
    expect(out.env.A).toBe("1");
    expect("B" in out.env).toBe(false);
    for (const bad of [";rm -rf", "a b", "$(whoami)", "a`b`", "a\nb"]) {
      expect(() => buildPythonCommand("once", [bad], {}, ROOT), bad).toThrow();
    }
    // Windows paths, equals signs and flags are fine.
    expect(() => buildPythonCommand("once", ["--out", "C:\\tmp\\pack.json", "--insts", "BTC-USDT,ETH-USDT"], {}, ROOT)).not.toThrow();
  });
});
