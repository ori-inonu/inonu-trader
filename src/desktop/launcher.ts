/**
 * The launch sequence of the desktop app (T1.7): find the web folder, enter the data home, start the single local core,
 * open the desk in an app window of the browser profile that has the OKX Wallet, and keep the OKX clock corrected.
 * Everything with a side effect is injected so the sequence is tested without a browser, a registry or a real home.
 *
 * Single instance (WIN-3): the port is fixed. When it is taken, `/health` decides: an Inonu answers (open a window on
 * it and stop), anything else is a named `port-busy`. The fixed port is deliberate: localStorage is per origin, so a
 * silent fallback to another port would look like lost preferences.
 */
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { DetectedBrowser } from "./browser";
import { APP_ID, DEFAULT_PORT, PortInUseError, startCore } from "./core";
import { runDoctor, type ClockMeasure, type DoctorReport } from "./doctor";
import { createDesktopHandlers, type DesktopHandlers } from "./handlers";
import type { SocketLike } from "../inonu/okx-ws";
import type { SettingsStore } from "../settings/store";
import { enterHome, layoutOf, resolveHome, resolveWebDir, type Env, type HomeLayout } from "./paths";

export interface LaunchDeps {
  readonly env: Env;
  readonly execPath: string;
  readonly compiled: boolean;
  readonly repoRoot: string;
  readonly version: string;
  readonly port: number;
  /** Idle shutdown (see core.ts). 0 never shuts down. */
  readonly idleMs?: number;
  readonly startupGraceMs?: number;
  readonly pollMs?: number;
  /** False for --no-browser. */
  readonly openBrowser: boolean;
  readonly probeDelayMs?: number;
  readonly probeAttempts?: number;
  readonly pickBrowser: (env: Env) => DetectedBrowser | null;
  readonly openApp: (browser: DetectedBrowser, origin: string) => void;
  readonly notify: (message: string) => void;
  /** Measures and applies the OKX clock correction; the sample (when one was taken) also feeds the Doctor. */
  readonly syncClock: () => Promise<{ readonly offsetMs: number; readonly roundTripMs: number } | null | void>;
  /** For the Doctor: the Python on PATH, or null. Default looks for `python` then `py`. */
  readonly findPython?: () => string | null;
  readonly log: (line: string) => void;
  readonly chdir?: (dir: string) => void;
  readonly fetch?: typeof fetch;
  /** Builds the settings store once the data home exists (the installed app passes the Windows vault). */
  readonly createStore?: (layout: HomeLayout) => Promise<SettingsStore>;
  /** Follow the market live (OKX public WebSocket) so the flow engine learns its thresholds. Off by default. */
  readonly liveFeed?: boolean;
  /** The rhythm of the autonomous agent, started together with the live feed. False: the app only reads and shows (the agent never runs a cycle, whatever its saved state says); the installed app leaves it on. */
  readonly agent?: boolean;
  /** Test seam for the WebSocket of the live feed. */
  readonly webSocket?: (url: string) => SocketLike;
}

export type LaunchResult =
  | { readonly kind: "started"; readonly origin: string; readonly done: Promise<void>; stop(): void }
  | { readonly kind: "already-running"; readonly origin: string; stop(): void }
  | { readonly kind: "port-busy"; readonly port: number; stop(): void }
  | { readonly kind: "no-web"; readonly webDir: string; stop(): void };

const CLOCK_RESYNC_MS = 10 * 60_000;
/** A second Doctor request this soon reuses the report: it measures the network and must not be a way to hammer it. */
const DOCTOR_CACHE_MS = 5_000;
const noop = () => {};

/** True when an Inonu answers on the port. Retries briefly: a second launch can race the first one's startup. */
async function inonuAnswers(port: number, deps: LaunchDeps): Promise<boolean> {
  const send = deps.fetch ?? fetch;
  const attempts = deps.probeAttempts ?? 5;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await send(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
      const body = (await res.json()) as { app?: unknown };
      if (body.app === APP_ID) return true;
    } catch {
      // nothing answered (yet) or it is not JSON: try again, then give up
    }
    await Bun.sleep(deps.probeDelayMs ?? 300);
  }
  return false;
}

/** How many items a catalog read returned: an array, or an object with an `items` array. */
function countOf(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  const items = (data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.length : 0;
}

function showDesk(deps: LaunchDeps, origin: string): void {
  if (!deps.openBrowser) return;
  const browser = deps.pickBrowser(deps.env);
  if (browser === null) {
    deps.notify(`Inonu Trader: nao encontrei o Microsoft Edge nem o Google Chrome. O servidor esta ativo em ${origin}; abra esse endereco em um navegador.`);
    return;
  }
  deps.openApp(browser, origin);
  if (!browser.walletEnabled) deps.notify("Inonu Trader: a extensao OKX Wallet nao esta instalada e habilitada no navegador escolhido. Instale a OKX Wallet para conectar a carteira; o restante do aplicativo funciona sem ela.");
}

export async function launch(deps: LaunchDeps): Promise<LaunchResult> {
  const webDir = resolveWebDir({ compiled: deps.compiled, execPath: deps.execPath, env: deps.env, repoRoot: deps.repoRoot });
  if (!existsSync(join(webDir, "index.html"))) {
    deps.log(`no web folder at ${webDir}`);
    deps.notify(`Inonu Trader: nao encontrei a pasta da interface (${webDir}). Reinstale o aplicativo.`);
    return { kind: "no-web", webDir, stop: noop };
  }

  const layout = layoutOf(resolveHome(deps.env));
  enterHome(layout, { ...(deps.compiled ? { installDir: dirname(deps.execPath) } : {}), ...(deps.chdir ? { chdir: deps.chdir } : {}) });

  const store = deps.createStore ? await deps.createStore(layout) : undefined;

  let resolveDone: () => void = noop;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  let core: ReturnType<typeof startCore>;
  let services: DesktopHandlers | null = null;
  let doctorRun: Promise<DoctorReport> | null = null;
  let doctorAt = 0;
  const doctor = (): Promise<DoctorReport> => {
    const s = services;
    if (s === null) return Promise.reject(new Error("not ready"));
    const at = Date.now();
    if (doctorRun !== null && at - doctorAt < DOCTOR_CACHE_MS) return doctorRun;
    doctorAt = at;
    doctorRun = runDoctor({
      port: core.port,
      defaultPort: DEFAULT_PORT,
      pickBrowser: () => deps.pickBrowser(deps.env),
      measureClock: async (): Promise<ClockMeasure | null> => {
        const sample = await deps.syncClock();
        return sample && Number.isFinite(sample.offsetMs) ? { offsetMs: sample.offsetMs, roundTripMs: sample.roundTripMs } : null;
      },
      credentials: () => {
        const status = s.store.status();
        return { okx: status.okx.state, model: status.secrets.typesafeAiApiKey.configured, ...(status.vault === undefined ? {} : { vault: status.vault }) };
      },
      probeOnchain: async () => {
        const result = await s.gateway.call("/onchain/chains", {}, "user");
        return result.ok ? { ok: true as const, count: countOf(result.data) } : { ok: false as const, error: result.error };
      },
      findPython: deps.findPython ?? (() => Bun.which("python") ?? Bun.which("py")),
    });
    return doctorRun;
  };
  try {
    core = startCore({
      port: deps.port,
      webDir,
      version: deps.version,
      handlers: (origin) => {
        services = createDesktopHandlers({
          dataDir: layout.data,
          origin,
          ...(store ? { store } : {}),
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
          ...(deps.liveFeed ? { liveFeed: true, agent: deps.agent !== false } : {}),
          ...(deps.webSocket ? { webSocket: deps.webSocket } : {}),
        });
        return services;
      },
      doctor,
      ...(deps.idleMs === undefined ? {} : { idleMs: deps.idleMs }),
      ...(deps.startupGraceMs === undefined ? {} : { startupGraceMs: deps.startupGraceMs }),
      ...(deps.pollMs === undefined ? {} : { pollMs: deps.pollMs }),
      onIdle: () => {
        deps.log("no page for a while: shutting down");
        services?.close();
        core.stop();
        resolveDone();
      },
    });
  } catch (error) {
    if (!(error instanceof PortInUseError)) throw error;
    if (await inonuAnswers(deps.port, deps)) {
      const origin = `http://127.0.0.1:${deps.port}`;
      deps.log(`already running on ${origin}: opening a window on it`);
      showDesk(deps, origin);
      return { kind: "already-running", origin, stop: noop };
    }
    deps.log(`port ${deps.port} is held by another program`);
    deps.notify(`Inonu Trader: a porta ${deps.port} esta em uso por outro programa. Feche-o e abra o Inonu Trader de novo.`);
    return { kind: "port-busy", port: deps.port, stop: noop };
  }

  deps.log(`core listening on ${core.origin} (home ${layout.home})`);
  // OKX refuses a signature more than 30 s off its clock and this machine's clock drifts: measure now and keep measuring.
  void deps.syncClock().catch(noop);
  const resync = setInterval(() => void deps.syncClock().catch(noop), CLOCK_RESYNC_MS);
  resync.unref();
  showDesk(deps, core.origin);
  return {
    kind: "started",
    origin: core.origin,
    done,
    stop: () => {
      clearInterval(resync);
      services?.close();
      core.stop();
    },
  };
}
