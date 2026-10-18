import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/** Runs Test-HealthPayload in a real PowerShell, so the exact function the watchdog dot-sources is what is tested. */
function verdicts(payloads: readonly string[]): boolean[] {
  const file = join(import.meta.dir, "health-payload.ps1");
  const list = payloads.map((p) => `'${p.replace(/'/g, "''")}'`).join(",");
  const script = `. '${file.replace(/'/g, "''")}'; foreach ($p in @(${list})) { if (Test-HealthPayload $p) { 'T' } else { 'F' } }`;
  const out = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
  return new TextDecoder().decode(out.stdout).split(/\r?\n/).filter((l) => l !== "").map((l) => l === "T");
}

describe("Test-HealthPayload", () => {
  test("only a body that says ok:true and app:inonu-trader counts as the agent", () => {
    expect(verdicts(['{"ok":true,"app":"inonu-trader","version":"0.0.2","startedAt":1,"uptimeMs":2}'])).toEqual([true]);
  });
  test("any other program answering 200 does not", () => {
    const cases = [
      "",
      "OK",
      "<html>200</html>",
      "{}",
      "null",
      "[]",
      '{"ok":true}',
      '{"ok":false,"app":"inonu-trader"}',
      '{"ok":"true","app":"inonu-trader"}',
      '{"ok":true,"app":"other-app"}',
      '{"ok":true,"app":"INONU-TRADER"}',
      '{"app":"inonu-trader"}',
    ];
    expect(verdicts(cases)).toEqual(cases.map(() => false));
  });
});
