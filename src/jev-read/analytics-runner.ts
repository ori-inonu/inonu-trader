/**
 * Builds the command line for the Python analytics collector (python/jev_analytics). The collector uses the
 * standard library only and the public OKX API without a key; it is read-only, never calls a model and never
 * trades. Pure function so it is unit testable without spawning Python.
 */

import { join } from "node:path";

/** A safe shell-free token: paths, flags, equals signs and comma separated inst ids, nothing else. */
const PLAIN_TOKEN = /^[A-Za-z0-9_.:\\/=,-]+$/;

export interface PythonCommand {
  readonly cmd: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
}

export function buildPythonCommand(
  mode: "run" | "once" | "test",
  extraArgs: readonly string[],
  env: Record<string, string | undefined>,
  root: string,
): PythonCommand {
  if (mode === "test" && extraArgs.length > 0) throw new Error("analytics:test takes no extra arguments");
  for (const arg of extraArgs) {
    if (!PLAIN_TOKEN.test(arg)) throw new Error(`invalid argument for the Python collector: ${arg}`);
  }
  const python = (env.JEV_PYTHON ?? "").trim() !== "" ? (env.JEV_PYTHON as string) : "python";
  const cmd =
    mode === "run"
      ? [python, "-m", "jev_analytics", "loop", "--interval", "30", ...extraArgs]
      : mode === "once"
        ? [python, "-m", "jev_analytics", "once", ...extraArgs]
        : [python, "-m", "unittest", "discover", "-s", "tests", "-t", "."];
  const cleanEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) if (typeof value === "string") cleanEnv[key] = value;
  cleanEnv.PYTHONDONTWRITEBYTECODE = "1";
  cleanEnv.PYTHONIOENCODING = "utf-8";
  return { cmd, cwd: join(root, "python"), env: cleanEnv };
}
