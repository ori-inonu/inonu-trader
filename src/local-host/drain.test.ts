import { expect, test } from "bun:test";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { drainLocal } from "./drain";

test("a failed drain is retried after a pause, and only a successful drain completes shutdown", async () => {
  let attempts = 0, warnings = 0;
  const waits: number[] = [];
  await drainLocal(async () => { if (++attempts < 3) throw new Error("close_timeout"); }, async ms => { waits.push(ms); }, () => { warnings++; });
  expect(attempts).toBe(3); expect(warnings).toBe(2); expect(waits).toEqual([30000, 30000]);
});

test("a real isolated startup failure with a live IPC listener exits with its failure code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-exit-synthetic-"));
  const script = join(dir, "child.ts");
  await Bun.write(script, `import { exitLocal } from ${JSON.stringify(join(import.meta.dir, "drain.ts"))};\nprocess.on("message", () => {});\nawait exitLocal(3);\n`);
  const child = Bun.spawn([process.execPath, "--no-env-file", script], { cwd: dir, env: {}, stdio: ["ignore", "ignore", "ignore"], windowsHide: true, ipc: () => {} });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 5000);
  try { expect(await child.exited).toBe(3); expect(timedOut).toBe(false); }
  finally { clearTimeout(timer); if (child.exitCode === null) { child.kill(); await child.exited; } unlinkSync(script); rmdirSync(dir); }
});
