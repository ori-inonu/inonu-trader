import { appendFileSync, mkdirSync, statSync, truncateSync } from "node:fs";
import { resolve, join, isAbsolute } from "node:path";
import { parseLocalArtifact, verifyLocalArtifact } from "./manifest";
import { localCorePlan, localSupervisorPlan, LOCAL_MESSAGES } from "./plan";
import { probeLocal, tcpLocal } from "./probe";
import { superviseLocal, type LocalSupervisorDeps } from "./supervisor";
import { LOCAL_READY_MESSAGE, LOCAL_STOP_MESSAGE } from "./protocol";
import { absoluteArg, localPulseOption } from "./args";
import { createStopControl } from "./control";

export function waitLocal(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const end = () => { clearTimeout(timer); signal.removeEventListener("abort", end); resolve(); };
    const timer = setTimeout(end, ms);
    signal.addEventListener("abort", end, { once: true });
    if (signal.aborted) end();
  });
}

/** Merely constructs the adapter. Importing this module never launches the real core or reads the vault. */
function localRuntime(appDir: string, home: string, report: LocalSupervisorDeps["report"], options: { readonly pulse?: boolean } = {}): LocalSupervisorDeps {
  const plan = localCorePlan(appDir, home, process.env, options);
  return {
    probe: (signal) => probeLocal(signal, { tcp: tcpLocal, fetch }),
    async spawn() {
      const raw: unknown = await Bun.file(join(appDir, "local-artifact.json")).json();
      const artifact = parseLocalArtifact(raw);
      if (artifact === null) throw new Error("local_artifact_invalid");
      await verifyLocalArtifact(appDir, artifact);
      // No watch, shell, dotenv, provider call, stored credential copy or page is involved in this launcher.
      let markReady!: () => void;
      const ready = new Promise<void>(r => { markReady = r; });
      const child = Bun.spawn([...plan.command], { cwd: plan.cwd, env: plan.env, windowsHide: true, stdio: ["ignore", "ignore", "ignore"], ipc: raw => {
        if (raw !== null && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length === 1 && (raw as { kind?: string }).kind === LOCAL_READY_MESSAGE.kind) markReady();
      } });
      // A Windows kill can terminate without running SIGTERM handlers. The core must drain through its private parent IPC channel instead.
      // No forced-kill fallback: the supervisor waits until this owned child actually exits. Unsupported old artifacts therefore cannot claim graceful shutdown.
      return { exited: child.exited, ready, stop: async () => { child.send(LOCAL_STOP_MESSAGE); } };
    },
    wait: waitLocal,
    report,
  };
}

async function main(): Promise<number> {
  if (process.platform !== "win32") throw new Error("local_windows_required");
  const args = Bun.argv.slice(2);
  const pulse = localPulseOption(args);
  const i = args.indexOf("--app");
  const appDir = resolve(i < 0 ? join(import.meta.dir, "..", "..", "dist", "local-agent", "app") : args[i + 1] ?? "");
  if (i >= 0 && !args[i + 1]) throw new Error("local_app_required");
  const homeAt = args.indexOf("--home");
  const suppliedHome = homeAt < 0 ? undefined : args[homeAt + 1];
  // Claude's MSIX processes may use a redirected LOCALAPPDATA. Never silently pick a fresh data home during the handoff.
  if (!suppliedHome || !isAbsolute(suppliedHome)) throw new Error("local_home_required");
  const home = resolve(suppliedHome);
  const controlPath = absoluteArg(args, "--control");
  const logDir = join(home, "logs");
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, "local-supervisor.log");
  const report: LocalSupervisorDeps["report"] = (code) => {
    try {
      try { if (statSync(logFile).size > 1_000_000) truncateSync(logFile, 0); } catch { /* first log */ }
      appendFileSync(logFile, `${new Date().toISOString()} ${code}\n`);
    } catch { /* the launcher's diagnostics never carry secrets */ }
    console.log(LOCAL_MESSAGES[code]);
  };
  if (args.includes("--background")) {
    const present = await probeLocal(new AbortController().signal, { tcp: tcpLocal, fetch });
    const awaiting = args.includes("--await-handoff");
    if (present === "other" || present === "ours" && !awaiting) { report(present === "ours" ? "local_existing" : "local_port_busy"); return present === "ours" ? 0 : 3; }
    const raw: unknown = await Bun.file(join(appDir, "local-artifact.json")).json();
    const artifact = parseLocalArtifact(raw);
    if (artifact === null) throw new Error("local_artifact_invalid");
    await verifyLocalArtifact(appDir, artifact);
    const plan = localSupervisorPlan(appDir, home, process.env, Bun.main, process.execPath, {
      pulse,
      awaitHandoff: awaiting,
      ...(controlPath === null ? {} : { controlPath }),
    });
    const child = Bun.spawn([...plan.command], {
      cwd: resolve(import.meta.dir, "..", ".."), env: plan.env, detached: true, windowsHide: true, stdio: ["ignore", "ignore", "ignore"],
    });
    child.unref();
    console.log(awaiting && present === "ours" ? LOCAL_MESSAGES.local_waiting : "Supervisor iniciado em segundo plano. Confira o estado da carteira em http://127.0.0.1:3000 e o log local-supervisor.log.");
    return 0;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const control = controlPath ? createStopControl(controlPath, stop) : null;
  try {
    const result = await superviseLocal({ ...localRuntime(appDir, home, report, { pulse }), ...(args.includes("--await-handoff") ? { awaitExisting: true } : {}) }, controller.signal);
    return result === "failed" ? 1 : result === "busy" ? 3 : 0;
  } finally {
    control?.close();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (import.meta.main) {
  try { process.exitCode = await main(); }
  catch { console.error("Nao foi possivel iniciar o supervisor local. Confira o artefato e o log; nenhuma credencial e exibida aqui."); process.exitCode = 1; }
}
