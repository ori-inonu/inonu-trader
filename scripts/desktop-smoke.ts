/**
 * Smoke test of the built installer (T1.10, AC-WIN-1, AC-WIN-2, AC-WIN-3, AC-WIN-6): installs silently into a temporary
 * folder, runs the installed exe's self-test, scans the artifacts for the user's credential values, uninstalls and proves
 * the machine is back as it was.
 *
 *   bun --no-env-file run scripts/desktop-smoke.ts [--setup <installer.exe>] [--with-shortcuts]
 *
 * It touches HKCU (the installer's own keys) and, with --with-shortcuts, the current user's Start Menu; the uninstall
 * removes both and the script checks that they are gone. It never targets %LOCALAPPDATA%\InonuTrader (the app runs here
 * with INONU_HOME in the temp folder) and it never prints a credential value: only counts.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const flag = (name: string) => Bun.argv.includes(name);
const option = (name: string) => {
  const i = Bun.argv.indexOf(name);
  return i >= 0 ? Bun.argv[i + 1] : undefined;
};

const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
const setup = resolve(option("--setup") ?? join(root, "dist", "desktop", `InonuTrader-Setup-${version}.exe`));
const withShortcuts = flag("--with-shortcuts");

const UNINSTALL_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\InonuTrader.App";
const APP_KEY = "HKCU\\Software\\InonuTrader.App";
const SHORTCUT = join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Inonu Trader", "Inonu Trader.lnk");

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const regExists = (key: string) => Bun.spawnSync(["reg", "query", key], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/** The credential values of this machine, read only to look for them; never printed or stored. */
function credentialValues(): string[] {
  const names = new Set(["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE", "TYPESAFE_AI_API_KEY", "PRIVATE_KEY"]);
  const values = new Set<string>();
  for (const file of ["data/onchainos.env", "data/jev.env", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m || !names.has(m[1]!)) continue;
      const value = m[2]!.trim().replace(/^(['"])(.*)\1$/, "$2");
      if (value.length >= 8) values.add(value);
    }
  }
  return [...values];
}

function main(): number {
  if (!existsSync(setup)) throw new Error(`installer not found: ${setup} (run scripts/build-desktop.ts first)`);
  const work = mkdtempSync(join(tmpdir(), "inonu-smoke-"));
  const install = join(work, "install");
  const home = join(work, "home");
  const reportFile = join(work, "selftest.json");
  // a throwaway Credential Manager service: the smoke never reads or writes the real one
  const vaultService = `InonuTrader-Smoke-${process.pid}-${Date.now()}`;
  const VAULT_NAMES = ["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE", "TYPESAFE_AI_API_KEY"] as const;
  let installed = false;

  try {
    // ---- 1. no secret in any artifact (AC-WIN-2)
    const values = credentialValues();
    const exe = join(root, "dist", "desktop", "app", "InonuTrader.exe");
    const web = join(root, "dist", "desktop", "app", "web");
    const artifacts = [setup, exe, ...(existsSync(web) ? filesUnder(web) : [])].filter(existsSync);
    let leaked = 0;
    for (const file of artifacts) {
      const bytes = readFileSync(file);
      for (const value of values) if (bytes.includes(Buffer.from(value))) leaked += 1;
    }
    check("no credential value of this machine appears in the installer, the exe or the web folder", leaked === 0, `${values.length} values looked for in ${artifacts.length} files, ${leaked} found`);

    // ---- 2. silent install (AC-WIN-1)
    const before = regExists(UNINSTALL_KEY);
    check("the uninstall key does not exist before the install", !before);
    const install_ = Bun.spawnSync([setup, "/S", ...(withShortcuts ? [] : ["/NOSHORTCUTS"]), `/D=${install}`], { stdout: "ignore", stderr: "ignore" });
    installed = existsSync(install);
    check("silent install into a temp folder exits 0 without administrator", install_.exitCode === 0 && installed, `exit ${install_.exitCode}`);
    const top = installed ? readdirSync(install).sort() : [];
    check("the install folder holds only the program, its web folder, version.txt and the uninstaller", JSON.stringify(top) === JSON.stringify(["InonuTrader.exe", "Uninstall.exe", "version.txt", "web"]), top.join(", "));
    check("the uninstall and app registry keys were written (HKCU, own AppId)", regExists(UNINSTALL_KEY) && regExists(APP_KEY));
    check("the shortcut matches the option", existsSync(SHORTCUT) === withShortcuts, withShortcuts ? "created" : "skipped by /NOSHORTCUTS");
    const filesBefore = filesUnder(install).map((f) => `${f}:${statSync(f).size}`).sort();

    // ---- 3. run the installed exe with a PATH that has no node, python or rust (AC-WIN-6, AC-WIN-3)
    mkdirSync(home, { recursive: true });
    const system = process.env.SystemRoot ?? "C:\\Windows";
    const env = { SystemRoot: system, PATH: `${system}\\System32;${system}`, TEMP: process.env.TEMP ?? tmpdir(), TMP: process.env.TMP ?? tmpdir(), LOCALAPPDATA: process.env.LOCALAPPDATA ?? "", APPDATA: process.env.APPDATA ?? "", USERPROFILE: process.env.USERPROFILE ?? "", INONU_HOME: home, INONU_NO_DIALOG: "1", INONU_VAULT_SERVICE: vaultService };
    const run = Bun.spawnSync([join(install, "InonuTrader.exe"), "--selftest", "--doctor", "--report", reportFile], { env, stdout: "ignore", stderr: "ignore", timeout: 60_000 });
    check("the installed exe passes its own self-test with a PATH that has no node, python or rust", run.exitCode === 0, `exit ${run.exitCode}`);
    const report = existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, "utf8")) as { compiled: boolean; health: { ok: boolean; app: string }; index: { status: number; hasHeartbeat: boolean }; onchainStatus: { status: number; credential: string | null }; onchainWithoutOrigin: { status: number }; iconRoute: { status: number }; inonuStatus: { status: number; modelConfigured: boolean | null; modelCallsToday: number | null }; doctor?: { status: number; ids: string[] } }) : null;
    check("it is the compiled exe, healthy, serves the desk and its /onchain/status on the same origin", report?.compiled === true && report.health.ok && report.health.app === "inonu-trader" && report.index.status === 200 && report.index.hasHeartbeat && report.onchainStatus.status === 200);
    check("without the same-origin header the same route is denied", report?.onchainWithoutOrigin.status === 403);
    check("with an empty vault the installed app reports no credential (and reads no .env)", report?.onchainStatus.credential === "absent", `credential: ${report?.onchainStatus.credential}`);
    check("the installed app serves the Doctor with its eight items", JSON.stringify(report?.doctor?.ids) === JSON.stringify(["navegador", "extensao", "relogio", "porta", "credenciais", "sonda", "rede", "python"]), `status ${report?.doctor?.status}`);
    check("the installed app serves currency icons from its own origin (route present, malformed symbol refused)", report?.iconRoute.status === 400, `status ${report?.iconRoute.status}`);
    check("Pedir ao Inonu is there but makes no model call on its own (no key, zero calls today)", report?.inonuStatus.status === 200 && report.inonuStatus.modelConfigured === false && report.inonuStatus.modelCallsToday === 0, JSON.stringify(report?.inonuStatus));

    // ---- 3b. the same exe, vault filled by its own --vault child: starts configured with no .env (AC-CFG-4)
    const sentinel = `SENTINEL-${crypto.randomUUID().replaceAll("-", "")}`;
    const vaultEnv = { ...env };
    const set = VAULT_NAMES.map((name) => Bun.spawnSync([join(install, "InonuTrader.exe"), "--vault", "set", name], { env: vaultEnv, stdin: new TextEncoder().encode(sentinel), stdout: "ignore", stderr: "ignore" }).exitCode);
    check("the installed exe writes the four secrets to the Windows vault through its --vault child", set.every((c) => c === 0), `exit codes ${set.join(",")}`);
    const reportFile2 = join(work, "selftest-vault.json");
    const run2 = Bun.spawnSync([join(install, "InonuTrader.exe"), "--selftest", "--report", reportFile2], { env, stdout: "ignore", stderr: "ignore", timeout: 60_000 });
    const report2 = existsSync(reportFile2) ? (JSON.parse(readFileSync(reportFile2, "utf8")) as typeof report) : null;
    check("a fresh start with the filled vault and no .env reports the credential complete", run2.exitCode === 0 && report2?.onchainStatus.credential === "complete", `exit ${run2.exitCode}, credential: ${report2?.onchainStatus.credential}`);
    const leakedHome = filesUnder(home).filter((f) => readFileSync(f).includes(Buffer.from(sentinel)));
    check("with the model key in the vault the status says so, still with zero calls", report2?.inonuStatus.modelConfigured === true && report2.inonuStatus.modelCallsToday === 0, JSON.stringify(report2?.inonuStatus));
    check("the secret value reached no file of the data home, log or report", leakedHome.length === 0 && !readFileSync(reportFile2, "utf8").includes(sentinel), `${leakedHome.length} files with the value`);
    check("everything it wrote went to the data home, nothing into the install folder (WIN-5)", existsSync(join(home, "logs", "launcher.log")) && JSON.stringify(filesUnder(install).map((f) => `${f}:${statSync(f).size}`).sort()) === JSON.stringify(filesBefore));

    // ---- 3c. the throwaway vault entries go before the exe does
    const gone = VAULT_NAMES.map((name) => {
      Bun.spawnSync([join(install, "InonuTrader.exe"), "--vault", "delete", name], { env, stdout: "ignore", stderr: "ignore" });
      return Bun.spawnSync([join(install, "InonuTrader.exe"), "--vault", "has", name], { env, stdout: "pipe", stderr: "ignore" }).stdout.toString().trim();
    });
    check("the throwaway vault entries were removed", gone.every((g) => g === "no"), gone.join(","));

    // ---- 4. uninstall (AC-WIN-1)
    const un = Bun.spawnSync([join(install, "Uninstall.exe"), "/S", `_?=${install}`], { stdout: "ignore", stderr: "ignore" });
    check("silent uninstall exits 0", un.exitCode === 0, `exit ${un.exitCode}`);
    // with _?= the uninstaller cannot delete itself; do what the Windows launcher would
    rmSync(join(install, "Uninstall.exe"), { force: true });
    if (existsSync(install) && readdirSync(install).length === 0) rmdirSync(install); // only when it is empty
    installed = existsSync(install);
    check("the install folder is gone", !installed);
    check("both registry keys are gone", !regExists(UNINSTALL_KEY) && !regExists(APP_KEY));
    check("the Start Menu shortcut is gone", !existsSync(SHORTCUT));
    check("the data home was left alone by the uninstall", existsSync(join(home, "logs", "launcher.log")));
  } finally {
    // never leave an install or a vault entry behind, even after a failed check
    for (const name of VAULT_NAMES) if (existsSync(join(install, "InonuTrader.exe"))) Bun.spawnSync([join(install, "InonuTrader.exe"), "--vault", "delete", name], { env: { SystemRoot: process.env.SystemRoot ?? "C:\Windows", INONU_VAULT_SERVICE: vaultService }, stdout: "ignore", stderr: "ignore" });
    if (existsSync(join(install, "Uninstall.exe"))) Bun.spawnSync([join(install, "Uninstall.exe"), "/S", `_?=${install}`], { stdout: "ignore", stderr: "ignore" });
    rmSync(work, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `; FAILED: ${failed.map((f) => f.name).join(" | ")}` : ""}`);
  return failed.length ? 1 : 0;
}

if (import.meta.main) process.exit(main());
