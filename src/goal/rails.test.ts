import { describe, expect, test } from "bun:test";
import { railVerdict } from "./rails";

const sh = (command: string, tool = "Bash") => railVerdict({ tool, command });
const file = (filePath: string, tool = "Edit") => railVerdict({ tool, filePath });
const BS = String.fromCharCode(92);

describe("what an unattended session must not touch is refused, with the reason, and reading is never refused", () => {
  test("stopping processes by name is refused, because it can hit one that is not ours", () => {
    expect(sh("Get-Process python* | Stop-Process -Force")?.deny).toContain("NOME");
  });

  test("taskkill by image name is refused", () => {
    expect(sh("taskkill /IM bun.exe /F")).not.toBeNull();
  });

  test("Stop-Process -Name is refused", () => {
    expect(sh("Stop-Process -Name bun -Force")).not.toBeNull();
  });

  test("stopping the one process that the session started, by its PID, is allowed", () => {
    expect(sh("Stop-Process -Id 24912 -Force")).toBeNull();
  });

  test("starting the live core from here is refused", () => {
    expect(sh(`Start-Process C:${BS}Users${BS}gabri${BS}InonuTraderReleases${BS}release24-6dce963a${BS}app${BS}InonuTrader.exe`, "PowerShell")?.deny).toContain("aviso previo");
  });

  test("starting the core from the source tree is refused", () => {
    expect(sh("bun --no-env-file run src/desktop/main.ts --port 3000")).not.toBeNull();
  });

  test("scheduled tasks of the agent are not touched", () => {
    expect(sh("Stop-ScheduledTask -TaskName InonuTrader-Local-Logon", "PowerShell")).not.toBeNull();
  });

  test("editing a file of the live data folder is refused", () => {
    expect(file("C:/Users/gabri/AppData/Local/InonuTrader/data/agent/config.json")).not.toBeNull();
  });

  test("writing into the live data folder from the shell is refused", () => {
    expect(sh("rm C:/Users/gabri/AppData/Local/InonuTrader/data/agent/ledger.jsonl")).not.toBeNull();
  });

  test("a redirect into the live data folder is refused", () => {
    expect(sh("echo x >> C:/Users/gabri/AppData/Local/InonuTrader/data/agent/mandate.json")).not.toBeNull();
  });

  test("reading the live data with the usual 2>&1 and a pipe is not mistaken for a write", () => {
    expect(sh("bun --no-env-file run scripts/goal-watch.ts 1180 C:/Users/gabri/AppData/Local/InonuTrader/data/agent 2>&1 | head -n 40")).toBeNull();
  });

  test("a change of the running core through its endpoints is refused", () => {
    expect(sh(`curl -s -X POST http://127.0.0.1:3000/agent/config -d '{"auto":false}'`)?.deny).toContain("MUDA");
  });

  test("git that publishes or discards is refused", () => {
    expect(["git push origin main", "git reset --hard HEAD~1", "git clean -fd", "git commit -m x"].map((c) => sh(c) !== null)).toEqual([true, true, true, true]);
  });

  test("a file of the repository can be edited", () => {
    expect(file("C:/Users/gabri/jev-trader/src/consensus/engine.ts")).toBeNull();
  });

  test("reading the status of the core, the journals and running tests and scripts all pass", () => {
    const calls = [
      "curl -s http://127.0.0.1:3000/agent/status",
      "bun test src/agent",
      "git status --short",
      "cat C:/Users/gabri/AppData/Local/InonuTrader/data/agent/mandate.json",
      "bun --no-env-file run scripts/shadow-baseline.ts C:/Users/gabri/AppData/Local/InonuTrader/data/agent",
      "Get-Process | Where-Object { $_.Id -eq 123 } | Select-Object Id, Name",
    ];
    expect(calls.map((c) => sh(c))).toEqual(calls.map(() => null));
  });
});
