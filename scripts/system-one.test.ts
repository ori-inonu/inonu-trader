import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
async function run(args: string[], env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "system-one-cli-"));
  dirs.push(dir);
  const state = join(dir, "latest.json");
  const child = Bun.spawn([process.execPath, "--no-env-file", resolve(import.meta.dir, "system-one.ts"), ...args], {
    env: { SystemRoot: process.env.SystemRoot ?? "C:/Windows", PATH: process.env.PATH ?? "", SYSTEM_ONE_STATE_PATH: state, SYSTEM_ONE_JOURNAL_PATH: join(dir, "cycles.jsonl"), ...env },
    stdout: "pipe", stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill(), 10_000);
  try {
    const [out, err, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { out, err, exit, state };
  } finally { clearTimeout(timer); }
}

describe("System One CLI", () => {
  test.each([
    [["--unknown"], {}], [["--capital"], {}], [["--bar", "constructor"], {}],
    [["--candles", "301"], {}], [["--candles", "21.5"], {}],
    [[], { SYSTEM_ONE_INTERVAL_MS: "NaN" }], [[], { SYSTEM_ONE_CAPITAL_USD: "NaN" }],
  ] as [string[], Record<string, string>][]) ("rejects invalid settings before writing %j %j", async (args, env) => {
    const result = await run(args, env);
    expect(result.exit).not.toBe(0);
    expect(existsSync(result.state)).toBe(false);
  });

  test("offline default produces a clearly synthetic blocked cycle", async () => {
    const result = await run([]);
    expect(result.exit).toBe(0);
    const cycle = JSON.parse(readFileSync(result.state, "utf8"));
    expect(cycle.brief.market.source).toBe("synthetic");
    expect(cycle.brief.wallet.source).toBe("synthetic");
    expect(cycle.execution.status).toBe("blocked");
    expect(result.err).toContain("MOCK");
  });
});
