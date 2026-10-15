import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const FILE = join(import.meta.dir, "watchdog-decision.ps1").replace(/'/g, "''");

/** Runs PowerShell with the real functions dot-sourced; each line of `body` that prints becomes one output line. */
function ps(body: string): string[] {
  const out = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `. '${FILE}'; ${body}`]);
  return new TextDecoder().decode(out.stdout).split(/\r?\n/).filter((l) => l !== "");
}

const APP = "C:\\\\r\\\\app".replace(/\\\\/g, "\\"); // C:\r\app
const proc = (id: number, name: string, cmd: string) => `[pscustomobject]@{ ProcessId = ${id}; Name = '${name}'; CommandLine = '${cmd.replace(/'/g, "''")}' }`;
const SUP = `C:\\bun.exe --no-env-file run C:\\r\\launcher\\src\\local-host\\main.ts --app ${APP} --home C:\\h --control C:\\c.json`;
const BG = `C:\\bun.exe --no-env-file run src/local-host/main.ts --background --await-handoff --app ${APP} --home C:\\h`;
const query = (inv: string) => `$r = Get-SupervisorPids -App '${APP}' -ProcessName 'bun.exe' -Inventory { ${inv} }; if ($null -eq $r) { 'null' } else { 'list:' + (@($r) -join ',') }`;

describe("Get-SupervisorPids: an unreadable inventory is UNKNOWN, never an empty list", () => {
  test("an inventory that throws (CIM inaccessible) yields null, not an empty list", () => {
    expect(ps(query("throw 'Access denied'"))).toEqual(["null"]);
  });
  test("an inventory that works and has no supervisor yields an EMPTY list, which is different from null", () => {
    expect(ps(query("@()"))).toEqual(["list:"]);
    expect(ps(query(proc(10, "bun.exe", "bun run src/desktop/main.ts")))).toEqual(["list:"]);
  });
  test("the long-lived supervisor of THIS artifact is found; the --background launcher, another artifact and another image are not", () => {
    expect(ps(query(`${proc(42, "bun.exe", SUP)}, ${proc(43, "bun.exe", BG)}`))).toEqual(["list:42"]);
    expect(ps(query(proc(44, "bun.exe", SUP.replace("\\r\\app", "\\other\\app"))))).toEqual(["list:"]);
    expect(ps(query(proc(45, "node.exe", SUP)))).toEqual(["list:"]);
  });
  test("the process-list query itself is never counted as a supervisor", () => {
    expect(ps(query(proc(46, "bun.exe", `Get-CimInstance ${SUP}`)))).toEqual(["list:"]);
  });
});

describe("Get-WatchdogAction", () => {
  const act = (healthy: string, sup: string) => ps(`Get-WatchdogAction ${healthy} ${sup}`)[0];
  test("a healthy agent is only watched, whatever the inventory says", () => {
    expect(act("$true", "$null")).toBe("watch");
    expect(act("$true", "@()")).toBe("watch");
    expect(act("$true", "@(42)")).toBe("watch");
  });
  test("silent port + a live supervisor: wait for it, never replace it", () => {
    expect(act("$false", "@(42)")).toBe("wait_supervisor");
    expect(act("$false", "@(42,43)")).toBe("wait_supervisor");
  });
  test("silent port + an inventory that could not be read: wait, NEVER launch blind (Codex 173)", () => {
    expect(act("$false", "$null")).toBe("wait_unknown");
  });
  test("silent port + a readable inventory with no supervisor: launch exactly one", () => {
    expect(act("$false", "@()")).toBe("launch");
  });
  test("end to end: a throwing inventory never reaches `launch`", () => {
    const out = ps(`$s = Get-SupervisorPids -App '${APP}' -Inventory { throw 'denied' }; Get-WatchdogAction $false $s`);
    expect(out).toEqual(["wait_unknown"]);
  });
});
