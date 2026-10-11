import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { basename, join, resolve } from "node:path";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { test } from "bun:test";
import assert from "node:assert/strict";

declare global {
  interface Window {
    __flowChartFixture?: { render: (event: unknown) => void };
  }
}

const WEB_ROOT = resolve(import.meta.dir, "../..");
const FIXTURE_ENTRY = join(import.meta.dir, "flow-chart-browser-fixture.tsx");
const SCRATCH_ROOT = resolve(
  process.env.FLOWCHART_SCRATCH ?? join(process.env.TMPDIR ?? process.env.TEMP ?? ".", "jev-flowchart-mounted"),
);
const EDGE_PATH = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const LABEL = process.env.FLOWCHART_RUN_LABEL === "red" || process.env.FLOWCHART_RUN_LABEL === "green"
  ? process.env.FLOWCHART_RUN_LABEL
  : "run";

interface CdpResponse {
  id?: number;
  method?: string;
  params?: Record<string, any>;
  result?: Record<string, any>;
  error?: { message?: string };
}

class CdpClient {
  private nextId = 0;
  private readonly pending = new Map<number, {
    resolve: (value: Record<string, any>) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private readonly opened: Promise<void>;
  readonly socket: WebSocket;
  readonly consoleErrors: string[] = [];
  readonly crossOriginRequests: string[] = [];

  constructor(url: string, private readonly allowedOrigin: string) {
    this.socket = new WebSocket(url);
    this.opened = new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error("Timed out opening the isolated Edge CDP socket")), 5000);
      this.socket.onopen = () => {
        clearTimeout(timer);
        resolveOpen();
      };
      this.socket.onerror = () => {
        clearTimeout(timer);
        rejectOpen(new Error("Could not open the isolated Edge CDP socket"));
      };
    });
    this.socket.onmessage = (event) => this.onMessage(String(event.data));
  }

  async ready() {
    await this.opened;
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, any>> {
    await this.opened;
    const id = ++this.nextId;
    const response = new Promise<Record<string, any>>((resolveResponse, rejectResponse) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectResponse(new Error(`Timed out waiting for CDP ${method}`));
      }, 5000);
      this.pending.set(id, { resolve: resolveResponse, reject: rejectResponse, timer });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  async evaluate(expression: string): Promise<any> {
    const response = await this.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text ?? "unknown exception"}`);
    }
    return response.result?.value;
  }

  disconnect() {
    try {
      this.socket.close();
    } catch {
      // Socket may already have closed during process teardown.
    }
    for (const [id, item] of this.pending) {
      clearTimeout(item.timer);
      item.reject(new Error(`CDP socket closed before response ${id}`));
    }
    this.pending.clear();
  }

  private onMessage(raw: string) {
    const message = JSON.parse(raw) as CdpResponse;
    if (message.id !== undefined) {
      const item = this.pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      this.pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message ?? "CDP command failed"));
      else item.resolve(message.result ?? {});
      return;
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const details = (message.params.args ?? []).map((arg: any) => arg.value ?? arg.description ?? "").join(" ");
      this.consoleErrors.push(details || "console.error called without arguments");
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      this.consoleErrors.push(message.params?.exceptionDetails?.text ?? "uncaught browser exception");
      return;
    }
    if (message.method === "Fetch.requestPaused") {
      const requestId = message.params?.requestId;
      const requestUrl = message.params?.request?.url as string | undefined;
      if (!requestId || !requestUrl) return;
      let allowed = false;
      try {
        allowed = new URL(requestUrl).origin === this.allowedOrigin;
      } catch {
        allowed = false;
      }
      if (!allowed) this.crossOriginRequests.push(requestUrl);
      void this.call(
        allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        allowed ? { requestId } : { requestId, errorReason: "BlockedByClient" },
      ).catch((error: unknown) => {
        this.consoleErrors.push(`request-interception failure: ${String(error)}`);
      });
    }
  }
}

function jsLiteral(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    if (Object.is(value, -0)) return "-0";
    return String(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jsLiteral).join(",")}]`;
  if (typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => `${JSON.stringify(key)}:${jsLiteral(fieldValue)}`);
    return `{${fields.join(",")}}`;
  }
  throw new Error(`Unsupported fixture value: ${typeof value}`);
}

async function waitUntil<T>(read: () => Promise<T>, accept: (value: T) => boolean, description: string): Promise<T> {
  const deadline = Date.now() + 6000;
  let latest: unknown = "not sampled";
  while (Date.now() < deadline) {
    const value = await read();
    latest = value;
    if (accept(value)) return value;
    await Bun.sleep(40);
  }
  throw new Error(`Timed out waiting for ${description}; last value: ${JSON.stringify(latest)}`);
}

async function canConnect(port: number): Promise<boolean> {
  return await new Promise((resolveConnection) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (connected: boolean) => {
      socket.destroy();
      resolveConnection(connected);
    };
    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function waitForPortClosed(port: number, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!await canConnect(port)) return true;
    await Bun.sleep(100);
  }
  return !await canConnect(port);
}

function childHasExited(child: any, probe = (pid: number) => process.kill(pid, 0)): boolean {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return false;
  try {
    probe(child.pid);
    return false;
  } catch (error) {
    // Bun on Windows can retain null exit fields after the owned Edge PID is gone.
    // Only OS-confirmed absence qualifies; permission errors are not evidence of exit.
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

test("browser teardown requires exit status or OS-confirmed absence of its owned PID", () => {
  const child = { pid: 123, exitCode: null, signalCode: null };
  assert.equal(childHasExited(child, () => true), false);
  assert.equal(childHasExited(child, () => { throw Object.assign(new Error(), { code: "ESRCH" }); }), true);
  assert.equal(childHasExited(child, () => { throw Object.assign(new Error(), { code: "EPERM" }); }), false);
  assert.equal(childHasExited({ ...child, pid: -1 }, () => { throw new Error("must not probe a process group"); }), false);
  assert.equal(childHasExited({ ...child, exitCode: 0 }, () => { throw new Error("already exited"); }), true);
});

async function waitForChildExit(child: any, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childHasExited(child)) return true;
    await Bun.sleep(100);
  }
  return childHasExited(child);
}

function makeEvent(block: number, pnlMon: unknown = 0, pnlPct: unknown = 0) {
  return {
    block,
    ts: 1,
    mid: 1.234567,
    bestBid: 1.2345,
    bestAsk: 1.2346,
    spreadBps: 0.8,
    decision: null,
    quote: null,
    fill: null,
    resting: { bidMon: 0, askMon: 0 },
    position: { side: "flat", size: 0, entryPrice: null, unrealizedUsd: 0, unrealizedMon: 0 },
    totals: {
      blocks: 1,
      decisions: 0,
      quotes: 0,
      fills: 0,
      reverted: 0,
      lateBlocks: 0,
      jevUsd: null,
      jevCostBasis: "unknown",
      gasMon: null,
      gasUsd: null,
      estimatedGasMon: 0,
      estimatedGasUsd: 0,
      observedGasMon: null,
      observedGasUsd: null,
      costsComplete: false,
      unknownCosts: [],
      realizedUsd: 0,
      pnlUsd: null,
      pnlMon,
      pnlPct,
    },
  };
}

type EventFixture = Omit<ReturnType<typeof makeEvent>, "totals"> & { totals?: unknown };

function withoutPnlMon(block: number): EventFixture {
  const event = makeEvent(block);
  const { pnlMon: _pnlMon, ...totals } = event.totals;
  return { ...event, totals };
}

function withoutPnlPct(block: number): EventFixture {
  const event = makeEvent(block);
  const { pnlPct: _pnlPct, ...totals } = event.totals;
  return { ...event, totals };
}

function withoutTotals(block: number): EventFixture {
  const { totals: _totals, ...event } = makeEvent(block);
  return event;
}

function pnlTextExpression(block: number) {
  const expectedBlock = `Bloco ${new Intl.NumberFormat("en-US").format(block)}`;
  return `(() => {
    const expected = ${JSON.stringify(expectedBlock)};
    const heading = Array.from(document.querySelectorAll("strong")).find((element) => element.textContent?.trim() === expected);
    const pnl = Array.from(document.querySelectorAll("span")).find((element) => element.textContent?.trim().startsWith("PnL "));
    return heading && pnl ? { block: heading.textContent.trim(), pnl: pnl.textContent.trim() } : null;
  })()`;
}

async function saveScreenshot(client: CdpClient, runDir: string, name: string) {
  const result = await client.call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const path = join(runDir, name);
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return { path, bytes: readFileSync(path).byteLength };
}

test("mounted FlowChart reports unavailable PnL for every non-finite or missing field", async () => {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const runDir = mkdtempSync(join(SCRATCH_ROOT, `${LABEL}-`));
  const observations: Array<Record<string, unknown>> = [];
  const screenshots: Array<Record<string, unknown>> = [];
  const teardown: Record<string, unknown> = {};
  const consoleErrors: string[] = [];
  const crossOriginRequests: string[] = [];
  let server: any = null;
  let client: CdpClient | null = null;
  let browserControl: CdpClient | null = null;
  let browser: any = null;
  let fixturePort: number | null = null;
  let debugPort: number | null = null;
  let status: "passed" | "failed" = "failed";
  let failure: unknown;

  try {
    assert.ok(existsSync(FIXTURE_ENTRY), `Required mounted FlowChart fixture is missing: ${FIXTURE_ENTRY}`);
    if (EDGE_PATH.toLowerCase().endsWith(".exe")) {
      assert.ok(existsSync(EDGE_PATH), `Required local Edge executable is unavailable: ${EDGE_PATH}`);
    }

    const assetDir = join(runDir, "assets");
    mkdirSync(assetDir, { recursive: true });
    const built = await Bun.build({
      entrypoints: [FIXTURE_ENTRY],
      target: "browser",
      format: "esm",
      outdir: assetDir,
      root: WEB_ROOT,
      naming: {
        entry: "flow-chart-fixture.[ext]",
        chunk: "chunk-[name]-[hash].[ext]",
        asset: "asset-[name]-[hash].[ext]",
      },
      sourcemap: "none",
      minify: false,
    });
    assert.ok(built.success, `Bun could not bundle the actual FlowChart fixture: ${built.logs.map((log) => log.message).join("\n")}`);

    const assets = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
    for (const output of built.outputs) {
      const name = basename(output.path);
      const contentType = name.endsWith(".js") ? "text/javascript; charset=utf-8"
        : name.endsWith(".css") ? "text/css; charset=utf-8"
          : "application/octet-stream";
      assets.set(`/assets/${name}`, { bytes: await output.arrayBuffer(), contentType });
    }
    const scriptPath = [...assets.keys()].find((path) => path.endsWith(".js"));
    const cssPath = [...assets.keys()].find((path) => path.endsWith(".css"));
    assert.ok(scriptPath, "Bun fixture bundle did not emit browser JavaScript");
    assert.ok(cssPath, "Bun fixture bundle did not emit FlowChart CSS module styles");

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${cssPath}"><title>Mounted FlowChart regression fixture</title>
<style>
html,body,#root{width:100%;height:100%;margin:0}*{box-sizing:border-box}
body{background:#0b1016;color:#eef4f8;font-family:Arial,sans-serif}
#root{height:100vh;min-height:340px;padding:12px}
:root{--canvas:#0b1016;--panel:#121922;--raised:#1c2732;--raised-hover:#253542;--divider:#273746;--ink:#eef4f8;--secondary:#9db0bf;--muted:#6f8291;--cyan:#5fe1f5;--gold:#e9c677;--buy:#68dba4;--sell:#fb7185;--late:#fb7185;--control-border:#31485c}
</style></head><body><div id="root"></div><script type="module" src="${scriptPath}"></script></body></html>`;

    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
        if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
        const asset = assets.get(pathname);
        return asset
          ? new Response(asset.bytes, { headers: { "content-type": asset.contentType } })
          : new Response("not found", { status: 404 });
      },
    });
    fixturePort = server.port;
    const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
    const profileDir = join(runDir, "edge-profile");
    mkdirSync(profileDir, { recursive: true });

    browser = spawn(EDGE_PATH, [
      `--user-data-dir=${profileDir}`,
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    let launchError: Error | null = null;
    browser.once("error", (error: Error) => { launchError = error; });
    const activePortFile = join(profileDir, "DevToolsActivePort");
    const activePort = await waitUntil(async () => {
      if (launchError) throw launchError;
      if (!existsSync(activePortFile)) return null;
      const port = Number(readFileSync(activePortFile, "utf8").split(/\r?\n/)[0]);
      return Number.isInteger(port) && port > 0 ? port : null;
    }, (port) => port !== null, "Edge's loopback-only DevToolsActivePort");
    debugPort = activePort as number;

    const targetList = await waitUntil(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (!response.ok) return [];
      return await response.json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
    }, (targets) => targets.some((target) => target.type === "page"), "isolated Edge page target");
    const pageTarget = targetList.find((target) => target.type === "page");
    assert.ok(pageTarget, "Edge did not expose an isolated page target");
    const browserInfo = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json() as { webSocketDebuggerUrl: string };
    const browserWebsocketUrl = new URL(browserInfo.webSocketDebuggerUrl);
    browserWebsocketUrl.hostname = "127.0.0.1";
    browserControl = new CdpClient(browserWebsocketUrl.toString(), fixtureOrigin);
    await browserControl.ready();
    const websocketUrl = new URL(pageTarget.webSocketDebuggerUrl);
    websocketUrl.hostname = "127.0.0.1";
    client = new CdpClient(websocketUrl.toString(), fixtureOrigin);
    await client.ready();

    await client.call("Page.enable");
    await client.call("Runtime.enable");
    await client.call("Network.enable");
    await client.call("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    await client.call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.call("Page.navigate", { url: `${fixtureOrigin}/` });
    await waitUntil(
      () => client!.evaluate("document.documentElement.dataset.flowChartFixture === 'ready' && typeof window.__flowChartFixture?.render === 'function'"),
      Boolean,
      "the mounted FlowChart fixture and native ResizeObserver",
    );
    assert.equal(await client.evaluate("typeof ResizeObserver"), "function", "The browser did not provide native ResizeObserver");

    async function renderAndObserve(event: EventFixture, expectedPnl: string, name: string) {
      await client!.evaluate(`window.__flowChartFixture.render(${jsLiteral(event)})`);
      const actual = await waitUntil(
        () => client!.evaluate(pnlTextExpression(event.block)),
        (value) => value !== null && typeof value === "object",
        `mounted chart output for ${name}`,
      ) as { block: string; pnl: string };
      const passed = actual.pnl === expectedPnl;
      observations.push({ case: name, expected: expectedPnl, actual: actual.pnl, passed, block: actual.block });
      return actual;
    }

    const unavailableCases: Array<{ name: string; event: () => EventFixture }> = [
      { name: "totals null", event: () => ({ ...makeEvent(810012), totals: null }) },
      { name: "totals primitive container", event: () => ({ ...makeEvent(810013), totals: "malformed" }) },
      { name: "totals array container", event: () => ({ ...makeEvent(810014), totals: [] }) },
      { name: "pnlMon null", event: () => makeEvent(810001, null, 1.25) },
      { name: "pnlMon missing", event: () => withoutPnlMon(810002) },
      { name: "pnlMon NaN", event: () => makeEvent(810003, NaN, 1.25) },
      { name: "pnlMon positive infinity", event: () => makeEvent(810004, Infinity, 1.25) },
      { name: "pnlMon negative infinity", event: () => makeEvent(810005, -Infinity, 1.25) },
      { name: "pnlPct null", event: () => makeEvent(810006, 1.25, null) },
      { name: "pnlPct missing", event: () => withoutPnlPct(810007) },
      { name: "pnlPct NaN", event: () => makeEvent(810008, 1.25, NaN) },
      { name: "pnlPct positive infinity", event: () => makeEvent(810009, 1.25, Infinity) },
      { name: "pnlPct negative infinity", event: () => makeEvent(810010, 1.25, -Infinity) },
      { name: "no totals", event: () => withoutTotals(810011) },
    ];

    for (let index = 0; index < unavailableCases.length; index++) {
      const item = unavailableCases[index];
      const actual = await renderAndObserve(item.event(), "PnL indisponível", item.name);
      if (index === 0) screenshots.push(await saveScreenshot(client, runDir, `${LABEL}-first-invalid-desktop.png`));
      assert.equal(actual.pnl, "PnL indisponível", `case "${item.name}" rendered fabricated PnL text: ${actual.pnl}`);
    }

    const zero = await renderAndObserve(makeEvent(820001, 0, 0), "PnL informado +0.000 MON (+0.00%)", "finite zero");
    assert.equal(zero.pnl, "PnL informado +0.000 MON (+0.00%)");
    screenshots.push(await saveScreenshot(client, runDir, `${LABEL}-finite-zero-desktop.png`));

    const positive = await renderAndObserve(makeEvent(820002, 12.5, 3.25), "PnL informado +12.500 MON (+3.25%)", "finite positive");
    assert.equal(positive.pnl, "PnL informado +12.500 MON (+3.25%)");
    const negative = await renderAndObserve(makeEvent(820003, -12.5, -3.25), "PnL informado -12.500 MON (-3.25%)", "finite negative");
    assert.equal(negative.pnl, "PnL informado -12.500 MON (-3.25%)");

    await client.call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const mobile = await renderAndObserve(makeEvent(820004, -2.5, -0.5), "PnL informado -2.500 MON (-0.50%)", "mobile finite negative");
    assert.equal(mobile.pnl, "PnL informado -2.500 MON (-0.50%)");
    screenshots.push(await saveScreenshot(client, runDir, `${LABEL}-finite-negative-mobile.png`));

    assert.deepEqual(client.consoleErrors, [], "Mounted FlowChart emitted browser console errors");
    assert.deepEqual(client.crossOriginRequests, [], "A cross-origin browser request was attempted; all such requests were blocked");
    assert.ok(screenshots.every((screenshot) => Number(screenshot.bytes) > 0), "A mounted-browser screenshot was empty");
    status = "passed";
  } catch (error) {
    failure = error;
    status = "failed";
    if (client) {
      try {
        screenshots.push(await saveScreenshot(client, runDir, `${LABEL}-failure-desktop.png`));
      } catch (screenshotError) {
        observations.push({
          case: "failure screenshot",
          error: screenshotError instanceof Error ? screenshotError.message : String(screenshotError),
        });
      }
    }
  } finally {
    if (client) {
      consoleErrors.push(...client.consoleErrors);
      crossOriginRequests.push(...client.crossOriginRequests);
      client.disconnect();
    }

    if (browserControl) {
      const closeAcknowledged = browserControl.call("Browser.close").then(() => true, () => false);
      teardown.browserCloseAcknowledged = await Promise.race([
        closeAcknowledged,
        Bun.sleep(1000).then(() => false),
      ]);
      browserControl.disconnect();
    }

    let edgeProcessExited = browser ? await waitForChildExit(browser, 5000) : false;
    if (browser?.pid && !edgeProcessExited) {
      const kill = spawnSync("C:/Windows/System32/taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 12000,
      });
      teardown.edgeTaskkill = {
        pid: browser.pid,
        status: kill.status,
        signal: kill.signal,
        error: kill.error?.message ?? null,
        stdout: kill.stdout ?? "",
        stderr: kill.stderr ?? "",
      };
      edgeProcessExited = await waitForChildExit(browser, 3000);
    } else {
      teardown.edgeTaskkill = {
        pid: browser?.pid ?? null,
        status: null,
        note: edgeProcessExited ? "Browser.close stopped the isolated Edge process" : "Edge process was not created",
      };
    }
    teardown.edgeProcessExited = edgeProcessExited;

    if (server) {
      await server.stop(true);
      teardown.fixtureServerStopped = true;
    } else {
      teardown.fixtureServerStopped = false;
    }

    const [fixturePortClosed, edgeDebugPortClosed] = await Promise.all([
      fixturePort === null ? Promise.resolve(false) : waitForPortClosed(fixturePort),
      debugPort === null ? Promise.resolve(false) : waitForPortClosed(debugPort),
    ]);
    teardown.fixturePortClosed = fixturePortClosed;
    teardown.edgeDebugPortClosed = edgeDebugPortClosed;

    if ((!edgeProcessExited || !fixturePortClosed || !edgeDebugPortClosed) && !failure) {
      status = "failed";
      failure = new Error("An owned fixture or Edge resource remained open after bounded teardown");
    }

    const evidence = {
      label: LABEL,
      status,
      failure: failure instanceof Error ? { name: failure.name, message: failure.message, stack: failure.stack } : failure ?? null,
      runDir,
      mountedActualFlowChart: true,
      browser: "Microsoft Edge headless, isolated user-data-dir, loopback DevTools",
      resizeObserver: "native browser ResizeObserver; production component effect was not mocked",
      fixtureOrigin: fixturePort === null ? null : `http://127.0.0.1:${fixturePort}`,
      fixturePort,
      edgeDebugPort: debugPort,
      observations,
      screenshots,
      consoleErrors,
      crossOriginRequestsBlockedBeforeNetwork: crossOriginRequests,
      teardown,
      limitations: [
        "Synthetic component fixture only; not a whole-dashboard or production-server qualification.",
        "No wallet, provider, account, backend, live RPC/API, or financial activity was used.",
        "The test exercises actual FlowChart client mounting and its ResizeObserver sizing effect in isolated Edge.",
      ],
    };
    writeFileSync(join(runDir, "observations.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`FLOWCHART_RENDER_EVIDENCE=${JSON.stringify(evidence)}`);
  }

  if (failure) throw failure;
  assert.equal(teardown.fixtureServerStopped, true, "Loopback fixture server was not stopped");
  assert.equal(teardown.fixturePortClosed, true, "Loopback fixture server port remained open after bounded teardown");
  assert.equal(teardown.edgeProcessExited, true, "Isolated Edge process tree did not exit after close");
  assert.equal(teardown.edgeDebugPortClosed, true, "Isolated Edge DevTools port remained open after bounded teardown");
  assert.deepEqual(consoleErrors, [], "Mounted FlowChart emitted browser console errors");
  assert.deepEqual(crossOriginRequests, [], "Cross-origin requests were observed before being blocked");
}, { timeout: 45000 });
