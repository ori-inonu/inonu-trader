import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// D-A2. `bun --no-env-file run real:console` does not stop the inner `bun run` of the package script from loading the
// repository .env: the flag has to sit on the bun that really runs the script. These tests prove it with a synthetic
// .env in a temporary directory and a canary value, and they never start a server, a browser or a network call.

const ROOT = resolve(import.meta.dir, "..");
const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
const REAL_SCRIPTS = { "real:console": "scripts/real-console.ts", "real:start": "scripts/real-start.ts", "real:doctor": "scripts/real-doctor.ts" } as const;
const DOCTOR = join(ROOT, "scripts", "real-doctor.ts").replaceAll("\\", "/");

/** The environment a developer shell needs just to start bun; nothing from the real shell leaks into the experiment. */
function bareShellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "Path"]) { const value = process.env[name]; if (value !== undefined) env[name] = value; }
  return env;
}

function run(command: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync(command, { cwd, env: bareShellEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  return { status: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function withProject<T>(files: Record<string, string>, body: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "real-env-isolation-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return body(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The doctor prints the effective values: 60000 and 10 when nothing sets REAL_INTERVAL_MS and REAL_JEV_MAX_CALLS. */
function effectiveOf(stdout: string): { intervalMs: number; maxCalls: number } {
  const view = JSON.parse(stdout.slice(stdout.indexOf("{"))) as { effectiveConfig: { intervalMs: number }; services: { jev: { maxCalls: number } } };
  return { intervalMs: view.effectiveConfig.intervalMs, maxCalls: view.services.jev.maxCalls };
}

const DOTENV = "REAL_INTERVAL_MS=15000\nREAL_JEV_MAX_CALLS=9\nCANARY_FROM_DOTENV=canary-7e41c9\nPRIVATE_KEY=0x" + "11".repeat(32) + "\n";

describe("D-A2 the real:* package scripts never load a .env file", () => {
  test.each(Object.entries(REAL_SCRIPTS))("%s puts --no-env-file on the bun that runs the script", (name, file) => {
    expect(scripts[name]).toBe(`bun --no-env-file run ${file}`);
  });

  test("control: without the flag the repository .env is loaded by bun (so the experiment can see a leak)", () => {
    withProject({ ".env": DOTENV }, (dir) => {
      const result = run([process.execPath, "run", DOCTOR], dir);
      expect(result.status).toBe(0);
      expect(effectiveOf(result.stdout)).toEqual({ intervalMs: 15000, maxCalls: 9 });
    });
  });

  test("with the flags of the real:doctor script the .env of the working directory is ignored", () => {
    withProject({ ".env": DOTENV }, (dir) => {
      const flags = (scripts["real:doctor"] ?? "").split(" ").slice(1, -1);
      const result = run([process.execPath, ...flags, DOCTOR], dir);
      expect(result.status).toBe(0);
      expect(effectiveOf(result.stdout)).toEqual({ intervalMs: 60000, maxCalls: 10 });
      expect(result.stdout + result.stderr).not.toContain("canary-7e41c9");
    });
  });

  test("the documented explicit file keeps working: bun --no-env-file --env-file=<private> run real:doctor reads the private file and still ignores .env", () => {
    const script = (scripts["real:doctor"] ?? "").replace("scripts/real-doctor.ts", `"${DOCTOR}"`);
    withProject({ ".env": DOTENV, "private.env": "REAL_INTERVAL_MS=20000\n", "package.json": JSON.stringify({ name: "real-env-probe", private: true, scripts: { "real:doctor": script } }) }, (dir) => {
      const result = run([process.execPath, "--no-env-file", "--env-file=private.env", "run", "real:doctor"], dir);
      expect(result.status).toBe(0);
      expect(effectiveOf(result.stdout)).toEqual({ intervalMs: 20000, maxCalls: 10 });
    });
  });

  test("scripts/real-console.ts hands its children an allowlisted environment and never spreads process.env", () => {
    const source = readFileSync(join(ROOT, "scripts", "real-console.ts"), "utf8");
    expect(source).not.toMatch(/\.\.\.\s*process\.env/);
    expect(source).toContain("backendChildEnv(process.env");
    expect(source).toContain("frontendChildEnv(process.env");
  });
});
