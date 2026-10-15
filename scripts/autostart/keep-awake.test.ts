import { expect, test } from "bun:test";
import { join } from "node:path";

// The keep-awake request of the logon watchdog, tested with stubs for the native call and one real call in a scratch PowerShell process (Windows only).
test.skipIf(process.platform !== "win32")("the keep-awake request binds as a uint32, reads the answer with care and never reports a failed call as accepted", () => {
  const script = join(import.meta.dir, "keep-awake.test.ps1");
  const run = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { stdout: "pipe", stderr: "pipe" });
  const text = `${new TextDecoder().decode(run.stdout)}${new TextDecoder().decode(run.stderr)}`.trim();
  expect(text).toBe("ok");
  expect(run.exitCode).toBe(0);
});
