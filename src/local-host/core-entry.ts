import { appendFileSync, existsSync, readdirSync, statSync, truncateSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { syncOkxClock } from "../okx-clock";
import { pickBrowser } from "../desktop/browser";
import { runDoctor } from "../desktop/doctor";
import { PortInUseError } from "../desktop/core";
import { createBunVault, createBunVaultReader, createSpawnVaultWriter, createVaultSettingsStore, VAULT_SERVICE, vaultCli } from "../desktop/vault";
import { enterHome, isCompiled, layoutOf, resolveHome } from "../desktop/paths";
import { createSettingsStore } from "../settings/store";
import { isLocalStop, LOCAL_READY_MESSAGE } from "./protocol";
import { absoluteArg, localPulseOption } from "./args";
import { startLocalService } from "./service";
import { drainLocal, exitLocal } from "./drain";

let runningService: ReturnType<typeof startLocalService> | null = null;

/** A selftest gets neither the real vault nor Windows/process credential discovery. No caller may accidentally weaken this branch. */
export function localSelftestStore(dataDir: string) {
  return createSettingsStore(dataDir, { runtimeKey: () => null });
}

async function main(): Promise<number> {
  const args = Bun.argv.slice(2);
  if (args[0] === "--vault") return vaultCli(args.slice(1), { stdin: () => Bun.stdin.text(), stdout: (t) => void process.stdout.write(t), stderr: (t) => void process.stderr.write(t), backend: createBunVault(VAULT_SERVICE) });
  const pulse = localPulseOption(args);
  const selftest = args.includes("--selftest");
  const waitForParent = args.includes("--selftest-wait");
  if (waitForParent && (!selftest || typeof process.send !== "function")) throw new Error("local_selftest_ipc_required");
  // A selftest must name an isolated home explicitly; it never falls back to the owner's financial data.
  const testHome = absoluteArg(args, "--selftest-home");
  if (selftest && testHome === null) throw new Error("local_selftest_home_required");
  if (selftest && existsSync(testHome!) && readdirSync(testHome!).length !== 0) throw new Error("local_selftest_home_not_empty");
  const reportPath = absoluteArg(args, "--report");
  const home = layoutOf(selftest ? testHome! : resolveHome(process.env));
  const webDir = isCompiled() ? join(dirname(process.execPath), "web") : resolve(import.meta.dir, "..", "..", "web", "out-inonu");
  if (!existsSync(join(webDir, "index.html"))) throw new Error("local_web_missing");
  enterHome(home, { ...(isCompiled() ? { installDir: dirname(process.execPath) } : {}) });
  const logFile = join(home.logs, "local-core.log");
  const log = (code: "local_core_started" | "local_close_timeout" | "local_core_stopped" | "local_core_failed") => {
    try {
      try { if (statSync(logFile).size > 1_000_000) truncateSync(logFile, 0); } catch { /* new log */ }
      appendFileSync(logFile, `${new Date().toISOString()} ${code}\n`);
    } catch { /* no value from the failure is exposed */ }
  };
  // Install the stop receiver before awaiting the vault. A request during startup must not be lost.
  let requestedStop = false;
  let stopActive: (() => void) | null = null;
  const stop = () => { requestedStop = true; stopActive?.(); };
  const message = (raw: unknown) => { if (isLocalStop(raw)) stop(); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  if (typeof process.send === "function") process.on("message", message);
  const store = selftest ? localSelftestStore(home.data) : await createVaultSettingsStore({
    dataDir: home.data,
    reader: createBunVaultReader(createBunVault(VAULT_SERVICE)),
    writer: createSpawnVaultWriter(() => isCompiled() ? [process.execPath, "--vault"] : [process.execPath, "--no-env-file", Bun.main, "--vault"]),
  });
  if (requestedStop) {
    process.off("SIGINT", stop); process.off("SIGTERM", stop); process.off("message", message);
    if (process.connected) process.disconnect?.();
    return 0;
  }
  let active: ReturnType<typeof startLocalService> | null = null;
  const doctor = async () => {
    const services = active!;
    return runDoctor({
      port: services.core.port, defaultPort: 3000,
      pickBrowser: () => pickBrowser(process.env),
      measureClock: async () => { const sample = await syncOkxClock(); return sample ? { offsetMs: sample.offsetMs, roundTripMs: sample.roundTripMs } : null; },
      credentials: () => { const status = store.status(); return { okx: status.okx.state, model: status.secrets.typesafeAiApiKey.configured, ...(status.vault ? { vault: status.vault } : {}) }; },
      probeOnchain: async () => { const r = await services.handlers.gateway.call("/onchain/chains", {}, "user"); return r.ok ? { ok: true as const, count: Array.isArray(r.data) ? r.data.length : 0 } : { ok: false as const, error: r.error }; },
      findPython: () => Bun.which("python") ?? Bun.which("py"),
    });
  };
  try {
    active = startLocalService({ dataDir: home.data, webDir, version: pkg.version, store, port: selftest ? 0 : 3000, selftest, pulse,
      ...(selftest ? { fetch: Object.assign(async () => { throw new Error("selftest_network_forbidden"); }, { preconnect: () => { throw new Error("selftest_network_forbidden"); } }) } : { doctor }),
    });
  } catch (error) {
    if (error instanceof PortInUseError) return 3;
    log("local_core_failed"); throw error;
  }
  const service = active;
  runningService = service;
  let clock: ReturnType<typeof setInterval> | null = null;
  let draining: Promise<void> | null = null;
  stopActive = () => { if (draining !== null) return; draining = drainLocal(() => service.stop(), ms => Bun.sleep(ms), () => log("local_close_timeout")).then(() => {
    if (clock !== null) clearInterval(clock);
    log("local_core_stopped");
  }); };
  if (requestedStop) stopActive();
  if (selftest) {
    const same = { headers: { "sec-fetch-site": "same-origin" } };
    const index = await fetch(service.core.origin + "/");
    const settings = await (await fetch(service.core.origin + "/settings", same)).json() as any;
    const agent = await (await fetch(service.core.origin + "/agent/status", same)).json() as any;
    const denied = await fetch(service.core.origin + "/agent/status");
    const report = { selftest: true, compiled: isCompiled(), index: index.status, originDenied: denied.status,
      modelConfigured: store.status().secrets.typesafeAiApiKey.configured,
      okx: store.status().okx.state, agentStarted: agent.status?.scheduler?.started ?? null,
      connected: agent.status?.state?.connected ?? null, mode: agent.status?.mode ?? null,
    };
    if (reportPath) await Bun.write(resolve(reportPath), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    if (waitForParent) { process.send?.(LOCAL_READY_MESSAGE); await service.done; if (draining !== null) await draining; }
    else await service.stop();
    process.off("SIGINT", stop); process.off("SIGTERM", stop); process.off("message", message);
    if (process.connected) process.disconnect?.();
    return report.index === 200 && report.originDenied === 403 && report.modelConfigured === false && report.okx === "absent" && report.agentStarted === false && report.connected === false ? 0 : 1;
  }
  log("local_core_started");
  void syncOkxClock().catch(() => {});
  clock = setInterval(() => void syncOkxClock().catch(() => {}), 10 * 60_000);
  clock.unref();
  process.send?.(LOCAL_READY_MESSAGE);
  await service.done;
  if (draining !== null) await draining;
  process.off("SIGINT", stop); process.off("SIGTERM", stop); process.off("message", message);
  // A parent IPC descriptor must not keep a successfully drained core alive.
  if (process.connected) process.disconnect?.();
  return 0;
}

if (import.meta.main) {
  // Success means the agent drained and released its lock. Only then may remaining incidental handles be terminated.
  try { await exitLocal(await main(), runningService === null ? null : () => runningService!.stop()); }
  catch { console.error("local_core_failed"); await exitLocal(1, runningService === null ? null : () => runningService!.stop()); }
}
