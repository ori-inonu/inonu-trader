// T1.7 / WIN-3, WIN-4: single instance, a named error for a busy port, the app window of the right browser profile.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore } from "../settings/store";
import type { DetectedBrowser } from "./browser";
import { launch, type LaunchDeps, type LaunchResult } from "./launcher";

let root = "";
const running: LaunchResult[] = [];
const servers: ReturnType<typeof Bun.serve>[] = [];

const BROWSER: DetectedBrowser = { kind: "edge", exe: "C:\\edge\\msedge.exe", userData: "C:\\ud", profile: "Default", walletEnabled: true };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inonu-launch-"));
  mkdirSync(join(root, "web"), { recursive: true });
  writeFileSync(join(root, "web", "index.html"), "<html><body>desk</body></html>");
});

afterEach(() => {
  for (const result of running.splice(0)) result.stop();
  for (const server of servers.splice(0)) server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

function harness(overrides: Partial<LaunchDeps> = {}) {
  const calls = { opened: [] as { browser: DetectedBrowser; origin: string }[], notified: [] as string[], synced: 0, logs: [] as string[], chdir: [] as string[] };
  const deps: LaunchDeps = {
    env: { INONU_HOME: join(root, "home"), INONU_WEB_DIR: join(root, "web") },
    execPath: join(root, "bin", "InonuTrader.exe"),
    compiled: false,
    repoRoot: root,
    version: "1.2.3",
    port: 0,
    idleMs: 0,
    openBrowser: true,
    probeDelayMs: 5,
    pickBrowser: () => BROWSER,
    openApp: (browser, origin) => { calls.opened.push({ browser, origin }); },
    notify: (message) => { calls.notified.push(message); },
    syncClock: async () => { calls.synced += 1; },
    log: (line) => { calls.logs.push(line); },
    chdir: (dir) => { calls.chdir.push(dir); }, // never really change the test process's cwd
    // a store with no key discovery (nothing here may look for a real key on the machine); a test that needs another store overrides it
    createStore: async (layout) => createSettingsStore(layout.data, { runtimeKey: () => null }),
    ...overrides,
  };
  return { deps, calls };
}

async function run(deps: LaunchDeps): Promise<LaunchResult> {
  const result = await launch(deps);
  running.push(result);
  return result;
}

describe("a normal launch", () => {
  test("starts the core, prepares the data home, syncs the OKX clock and opens the app window of the picked browser", async () => {
    const { deps, calls } = harness();
    const result = await run(deps);
    expect(result.kind).toBe("started");
    if (result.kind !== "started") return;
    expect(calls.opened).toEqual([{ browser: BROWSER, origin: result.origin }]);
    expect(calls.synced).toBe(1);
    expect(calls.chdir).toEqual([join(root, "home")]);
    expect(existsSync(join(root, "home", "data"))).toBe(true);
    expect(((await (await fetch(`${result.origin}/health`)).json()) as { version: string }).version).toBe("1.2.3");
    expect(await (await fetch(`${result.origin}/`)).text()).toContain("desk");
  });

  test("--no-browser serves without opening anything", async () => {
    const { deps, calls } = harness({ openBrowser: false });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    expect(calls.opened).toEqual([]);
  });

  test("with no supported browser the core still serves and the user is told", async () => {
    const { deps, calls } = harness({ pickBrowser: () => null });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    expect(calls.opened).toEqual([]);
    expect(calls.notified.join(" ")).toMatch(/Edge|Chrome/);
  });

  test("when the wallet extension is missing the window still opens and the user is told once", async () => {
    const { deps, calls } = harness({ pickBrowser: () => ({ ...BROWSER, walletEnabled: false }) });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    expect(calls.opened).toHaveLength(1);
    expect(calls.notified.filter((m) => /OKX Wallet/.test(m))).toHaveLength(1);
  });

  test("done resolves when the core shuts itself down for lack of a page", async () => {
    const { deps } = harness({ idleMs: 100, startupGraceMs: 100, pollMs: 20, openBrowser: false });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    if (result.kind !== "started") return;
    await Promise.race([result.done, new Promise((_, reject) => setTimeout(() => reject(new Error("never went idle")), 2000))]);
  });
});

describe("the settings store of the installed app", () => {
  test("createStore runs after the data home exists and before the core, and its store serves the settings routes", async () => {
    const seen: string[] = [];
    const fake = {
      status: () => ({ secrets: { typesafeAiApiKey: { configured: false, last4: null, updatedAtMs: null }, okxWeb3ApiKey: { configured: true, last4: "abcd", updatedAtMs: 1 }, okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiPassphrase: { configured: true, last4: null, updatedAtMs: 1 } }, okx: { state: "complete" as const } }),
      set: () => {}, clear: () => {},
      credentials: () => ({ okx: null, typesafeAiApiKey: null }),
      prefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
      setPrefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
    };
    const { deps } = harness({ createStore: async (layout) => { seen.push(layout.data); return fake; } });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    if (result.kind !== "started") return;
    expect(seen).toEqual([join(root, "home", "data")]);
    const res = await fetch(`${result.origin}/settings`, { headers: { "sec-fetch-site": "same-origin", "x-inonu-settings": "1" } });
    expect(((await res.json()) as { okx: { state: string } }).okx.state).toBe("complete");
  });
});

describe("the Doctor of a launched core (WIN-8)", () => {
  const store = (okx: "absent" | "complete", model: boolean) => ({
    status: () => ({ secrets: { typesafeAiApiKey: { configured: model, last4: null, updatedAtMs: null }, okxWeb3ApiKey: { configured: okx === "complete", last4: null, updatedAtMs: null }, okxWeb3ApiSecret: { configured: okx === "complete", last4: null, updatedAtMs: null }, okxWeb3ApiPassphrase: { configured: okx === "complete", last4: null, updatedAtMs: null } }, okx: { state: okx } }),
    set: () => {}, clear: () => {},
    credentials: () => ({ okx: null, typesafeAiApiKey: null }),
    prefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
    setPrefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
  });
  const doctor = async (origin: string) => (await (await fetch(`${origin}/__inonu/doctor`, { headers: { "sec-fetch-site": "same-origin" } })).json()) as { ok: boolean; items: { id: string; status: string; message: string }[] };
  const item = (report: Awaited<ReturnType<typeof doctor>>, id: string) => report.items.find((i) => i.id === id)!;

  test("reports the browser, the extension, the measured clock, the bound port and the credential states of this launch", async () => {
    const { deps } = harness({
      createStore: async () => store("absent", false),
      syncClock: async () => ({ offsetMs: 76_671, roundTripMs: 309, measuredAtMs: 1 }),
      findPython: () => null,
    });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    if (result.kind !== "started") return;
    const report = await doctor(result.origin);
    expect(report.ok).toBe(true);
    expect(report.items.map((i) => i.id)).toEqual(["navegador", "extensao", "relogio", "porta", "credenciais", "sonda", "rede", "python"]);
    expect(item(report, "navegador").status).toBe("ok");
    expect(item(report, "extensao").status).toBe("ok");
    expect(item(report, "relogio").message).toContain("77 s");
    expect(item(report, "porta").message).toContain(String(new URL(result.origin).port));
    expect(item(report, "credenciais").status).toBe("falha");
    expect(item(report, "sonda").status).toBe("nao_verificado"); // no credential: no network call at all
    expect(item(report, "rede").status).toBe("ok");
  });

  test("a second ask within a few seconds reuses the report instead of measuring the network again", async () => {
    let measured = 0;
    const { deps } = harness({ createStore: async () => store("absent", false), syncClock: async () => { measured += 1; return null; }, findPython: () => null });
    const result = await run(deps);
    if (result.kind !== "started") throw new Error("not started");
    const base = measured; // the launch itself measured once
    await doctor(result.origin);
    expect(measured).toBe(base + 1);
    await doctor(result.origin);
    expect(measured).toBe(base + 1);
  });
});

describe("the live feed of the flow engine", () => {
  class Socket {
    static all: Socket[] = [];
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      Socket.all.push(this);
    }
    send() {}
    close() {
      this.closed = true;
    }
  }
  const okx = (async (url: string) => {
    const u = new URL(url);
    const body = (data: unknown) => new Response(JSON.stringify({ code: "0", msg: "", data }), { status: 200 });
    if (u.pathname === "/api/v5/public/instruments") return body([{ instId: u.searchParams.get("instId"), instType: u.searchParams.get("instType"), tickSz: "0.1", lotSz: "0.01", ctVal: "0.01", ctMult: "1", state: "live" }]);
    if (u.pathname === "/api/v5/market/candles") return body([]);
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  test("is off unless the launcher asks for it, so a plain launch never opens a market socket", async () => {
    Socket.all = [];
    const { deps } = harness({ webSocket: (url) => new Socket(url) as never });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    await Bun.sleep(30);
    expect(Socket.all).toEqual([]);
  });

  test("when on it follows the default instruments, and stopping the core closes the socket", async () => {
    Socket.all = [];
    const { deps } = harness({ liveFeed: true, webSocket: (url) => new Socket(url) as never, fetch: okx });
    const result = await run(deps);
    expect(result.kind).toBe("started");
    await Bun.sleep(60);
    expect(Socket.all).toHaveLength(1);
    expect(Socket.all[0]!.url).toBe("wss://ws.okx.com:8443/ws/v5/public");
    result.stop();
    expect(Socket.all[0]!.closed).toBe(true);
  });
});

describe("the rhythm of the agent follows the live feed, unless the launcher says to only watch", () => {
  class Quiet {
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    send() {}
    close() {}
  }
  const okxQuiet = (async () => new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200 })) as unknown as typeof fetch;
  const schedulerStarted = async (deps: LaunchDeps) => {
    const result = await run(deps);
    expect(result.kind).toBe("started");
    if (result.kind !== "started") throw new Error("not started");
    const res = await fetch(`${result.origin}/agent/status`, { headers: { "sec-fetch-site": "same-origin" } });
    return ((await res.json()) as { status: { scheduler: { started: boolean } } }).status.scheduler.started;
  };

  test("with the live feed on the rhythm of the agent starts (the installed app), and with agent false the app only reads and shows: no cycle ever runs, whatever the saved state says", async () => {
    const on = harness({ liveFeed: true, webSocket: (url) => new Quiet() as never, fetch: okxQuiet });
    expect(await schedulerStarted(on.deps)).toBe(true);
    const watching = harness({ liveFeed: true, agent: false, webSocket: (url) => new Quiet() as never, fetch: okxQuiet });
    expect(await schedulerStarted(watching.deps)).toBe(false);
  });
});

describe("single instance (WIN-3)", () => {
  test("a second launch finds the running Inonu, opens a window on it and does not start another core", async () => {
    const first = harness();
    const a = await run(first.deps);
    expect(a.kind).toBe("started");
    if (a.kind !== "started") return;
    const port = Number(new URL(a.origin).port);

    const second = harness({ port });
    const b = await run(second.deps);
    expect(b.kind).toBe("already-running");
    expect(second.calls.opened).toEqual([{ browser: BROWSER, origin: a.origin }]);
    expect(second.calls.synced).toBe(0);
  });

  test("a port held by some other program is a named error with a message, and nothing is opened", async () => {
    const other = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("something else") });
    servers.push(other);
    const { deps, calls } = harness({ port: other.port as number });
    const result = await run(deps);
    expect(result).toMatchObject({ kind: "port-busy", port: other.port });
    expect(calls.opened).toEqual([]);
    expect(calls.notified.join(" ")).toContain(String(other.port));
  });
});

describe("a missing web folder", () => {
  test("is a named error with a message", async () => {
    const { deps, calls } = harness({ env: { INONU_HOME: join(root, "home"), INONU_WEB_DIR: join(root, "nowhere") } });
    const result = await run(deps);
    expect(result.kind).toBe("no-web");
    expect(calls.notified).toHaveLength(1);
  });
});
