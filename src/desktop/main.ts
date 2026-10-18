/**
 * Entry point of InonuTrader.exe (T1.7). Thin on purpose: every decision lives in launcher.ts and is tested there.
 *
 *   InonuTrader.exe                 start (or find) the core and open the desk in the browser profile with the OKX Wallet
 *   InonuTrader.exe --no-browser    serve only
 *   InonuTrader.exe --selftest      start on a free port, call the real routes, print one JSON report, exit 0 or 1
 *   --port N   --idle-ms N (0 never shuts down)
 *
 * With --windows-hide-console there is no console, so errors reach the user as a message box (INONU_NO_DIALOG=1 prints
 * them instead) and everything is also appended to <home>/logs/launcher.log.
 */
import { appendFileSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { syncOkxClock } from "../okx-clock";
import { openApp, pickBrowser } from "./browser";
import { DEFAULT_PORT } from "./core";
import { launch, type LaunchDeps } from "./launcher";
import { VAULT_SERVICE, createBunVault, createBunVaultReader, createSpawnVaultWriter, createVaultSettingsStore, vaultCli } from "./vault";
import { isCompiled, layoutOf, prepareHome, resolveHome } from "./paths";

// The vault child (see vault.ts): a settings write spawns this program with --vault. It must do nothing else, so it
// runs before the data home, the log or the core exist. INONU_VAULT_SERVICE is for tests only (never the real vault).
const vaultService = process.env.INONU_VAULT_SERVICE || VAULT_SERVICE;
if (Bun.argv[2] === "--vault") {
  process.exit(await vaultCli(Bun.argv.slice(3), { stdin: () => Bun.stdin.text(), stdout: (t) => void process.stdout.write(t), stderr: (t) => void process.stderr.write(t), backend: createBunVault(vaultService) }));
}

const args = Bun.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const selftest = flag("--selftest");
const port = selftest ? 0 : Number(value("--port") ?? process.env.INONU_PORT ?? DEFAULT_PORT);
const idleMs = selftest ? 0 : value("--idle-ms") === undefined ? undefined : Number(value("--idle-ms"));
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("invalid --port");

const home = layoutOf(resolveHome(process.env));
prepareHome(home);
const logFile = join(home.logs, "launcher.log");
const MAX_LOG_BYTES = 1_000_000;

function log(line: string): void {
  try {
    if (statSync(logFile).size > MAX_LOG_BYTES) truncateSync(logFile, 0);
  } catch {
    // no log yet
  }
  try {
    appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // a log that cannot be written must never stop the app
  }
  if (selftest || process.env.INONU_NO_DIALOG === "1") console.error(line);
}

/** A message box, with the text passed through the environment so nothing is ever interpreted by a shell. */
function notify(message: string): void {
  log(`notify: ${message}`);
  if (selftest || process.env.INONU_NO_DIALOG === "1") return;
  try {
    Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", "Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show($env:INONU_MSG, 'Inonu Trader')"], {
      env: { ...process.env, INONU_MSG: message },
      stdio: ["ignore", "ignore", "ignore"],
    }).unref();
  } catch {
    // no dialog available: the log has it
  }
}

const deps: LaunchDeps = {
  env: process.env,
  execPath: process.execPath,
  compiled: isCompiled(),
  repoRoot: resolve(dirname(Bun.main), "..", ".."),
  version: pkg.version,
  port,
  ...(idleMs === undefined ? {} : { idleMs }),
  openBrowser: !flag("--no-browser") && !selftest,
  pickBrowser: (env) => pickBrowser(env),
  openApp,
  notify,
  syncClock: () => syncOkxClock(),
  log,
  // the four secrets live in the Windows vault; a write spawns this same program with --vault (value on stdin)
  liveFeed: !selftest, // follow the market for the flow engine; the self-test stays deterministic
  agent: !flag("--watch-only"), // --watch-only: read and show, the agent never runs a cycle (a window to follow the app while the code in the folder is not the one qualified to trade)
  createStore: (layout) => createVaultSettingsStore({
    dataDir: layout.data,
    reader: createBunVaultReader(createBunVault(vaultService)),
    writer: createSpawnVaultWriter(() => (isCompiled() ? [process.execPath, "--vault"] : [process.execPath, Bun.main, "--vault"])),
  }),
};

const result = await launch(deps);

if (result.kind === "no-web") process.exit(2);
if (result.kind === "port-busy") process.exit(3);
if (result.kind === "already-running") process.exit(0);

if (selftest) {
  const sameOrigin = { headers: { "sec-fetch-site": "same-origin" } };
  const health = (await (await fetch(`${result.origin}/health`)).json()) as { ok?: boolean; app?: string; version?: string };
  const index = await fetch(`${result.origin}/`);
  const html = await index.text();
  const status = await fetch(`${result.origin}/onchain/status`, sameOrigin);
  const denied = await fetch(`${result.origin}/onchain/status`);
  const inonu = await fetch(`${result.origin}/inonu/status`, sameOrigin);
  const icon = await fetch(`${result.origin}/inonu/icon/NOT%20OK`, sameOrigin); // a malformed symbol: 400 proves the route exists, with no network
  const inonuBody = (await inonu.json().catch(() => ({}))) as { modelConfigured?: boolean; today?: { calls?: number } };
  // the Doctor measures the network, so it only runs when asked for (the smoke asks once, with an empty vault)
  const doctor = flag("--doctor") ? await fetch(`${result.origin}/__inonu/doctor`, sameOrigin) : null;
  const doctorBody = doctor ? ((await doctor.json().catch(() => ({}))) as { items?: { id: string }[] }) : null;
  const report = {
    version: pkg.version,
    compiled: deps.compiled,
    execPath: process.execPath,
    home: home.home,
    health,
    index: { status: index.status, hasHeartbeat: html.includes("/__inonu/heartbeat.js") },
    onchainStatus: { status: status.status, credential: ((await status.clone().json().catch(() => ({}))) as { credential?: string }).credential ?? null },
    onchainWithoutOrigin: { status: denied.status },
    iconRoute: { status: icon.status },
    inonuStatus: { status: inonu.status, modelConfigured: inonuBody.modelConfigured ?? null, modelCallsToday: inonuBody.today?.calls ?? null },
    ...(doctor ? { doctor: { status: doctor.status, ids: (doctorBody?.items ?? []).map((item) => item.id) } } : {}),
  };
  result.stop();
  console.log(JSON.stringify(report, null, 1));
  const reportFile = value("--report"); // a GUI-subsystem exe may have no stdout to give back
  if (reportFile) writeFileSync(reportFile, JSON.stringify(report, null, 1));
  const ok = health.ok === true && health.app === "inonu-trader" && index.status === 200 && report.index.hasHeartbeat && status.status === 200 && denied.status === 403 && inonu.status === 200 && icon.status === 400 && (doctor === null || doctor.status === 200);
  process.exit(ok ? 0 : 1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { result.stop(); process.exit(0); });
await result.done;
process.exit(0);
