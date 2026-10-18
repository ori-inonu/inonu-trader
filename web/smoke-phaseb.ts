import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const WEB_ROOT = resolve(import.meta.dir);
const EDGE_PATH = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = Number(process.env.SMOKE_PORT ?? 3555);
const API = process.env.API_URL ?? "http://127.0.0.1:3000";

const WIDTHS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "1280", width: 1280, height: 860 },
  { label: "900", width: 900, height: 900 },
  { label: "380", width: 380, height: 820 },
];

function waitUntil<T>(read: () => Promise<T>, accept: (v: T) => boolean, label: string, timeoutMs = 40000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    let last: unknown = "never sampled";
    while (Date.now() < deadline) {
      try {
        const value = await read();
        last = value;
        if (accept(value)) return value;
      } catch (error) {
        last = String(error);
      }
      await Bun.sleep(200);
    }
    throw new Error(`timed out waiting for ${label}; last: ${JSON.stringify(last)}`);
  })();
}

interface ConsoleEntry { type: string; text: string }

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: unknown) => void>();
  readonly console: ConsoleEntry[] = [];
  constructor(private ws: WebSocket) {
    ws.addEventListener("message", (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        method?: string;
        params?: Record<string, unknown>;
      };
      if (msg.id !== undefined) {
        this.pending.get(msg.id)?.(msg.result);
        return;
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const params = msg.params as { type: string; args?: Array<{ value?: unknown; description?: string }> };
        this.console.push({
          type: params.type,
          text: (params.args ?? []).map((a) => String(a.value ?? a.description ?? "")).join(" "),
        });
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const params = msg.params as { exceptionDetails?: { text?: string; exception?: { description?: string } } };
        this.console.push({
          type: "exception",
          text: params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "exception",
        });
      }
    });
  }
  ready() { return new Promise<void>((r) => this.ws.addEventListener("open", () => r())); }
  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.id;
    const { promise, resolve } = Promise.withResolvers<unknown>();
    this.pending.set(id, resolve);
    this.ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }
  async evaluate(expression: string): Promise<unknown> {
    const res = await this.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res && typeof res === "object" && "result" in res) {
      return (res as { result: { value?: unknown } }).result?.value;
    }
    return undefined;
  }
}

if (!existsSync(EDGE_PATH)) throw new Error(`Edge missing at ${EDGE_PATH}`);

const profileDir = join(WEB_ROOT, ".smoke-profile", `run-${Date.now()}`);
mkdirSync(profileDir, { recursive: true });

const next = spawn("bun", ["run", "start", "--port", String(PORT)], {
  cwd: WEB_ROOT,
  env: { ...process.env, NEXT_PUBLIC_API_URL: API },
  stdio: ["ignore", "ignore", "ignore"],
  windowsHide: true,
});

let browser: ReturnType<typeof spawn> | null = null;
try {
  await waitUntil(async () => (await fetch(`http://127.0.0.1:${PORT}/`)).ok, Boolean, "next start");
  browser = spawn(EDGE_PATH, [
    `--user-data-dir=${profileDir}`, "--headless=new", "--disable-gpu", "--no-first-run",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });

  const portFile = join(profileDir, "DevToolsActivePort");
  const debugPort = await waitUntil(async () => {
    if (!existsSync(portFile)) return null;
    const p = Number(readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
    return Number.isInteger(p) && p > 0 ? p : null;
  }, (p) => p !== null, "DevToolsActivePort");

  const targets = await waitUntil(async () => {
    const r = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return r.ok ? (await r.json() as Array<{ type: string; webSocketDebuggerUrl: string }>) : [];
  }, (t) => t.some((x) => x.type === "page"), "page target");

  const page = targets.find((t) => t.type === "page")!;
  const url = new URL(page.webSocketDebuggerUrl);
  url.hostname = "127.0.0.1";
  const cdp = new Cdp(new WebSocket(url.toString()));
  await cdp.ready();
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });

  // Wait for real feed data to reach the console.
  const diag = await cdp.evaluate(`(() => ({ url: location.href, title: document.title, bodyLen: document.body ? document.body.innerText.length : -1, head: document.body ? document.body.innerText.slice(0,200) : null, htmlLen: document.documentElement.outerHTML.length }))()`);
  console.log("DIAG", JSON.stringify(diag, null, 2));
  console.log("EARLY CONSOLE", JSON.stringify(cdp.console.slice(0, 6), null, 2));

  const blocks = await waitUntil(async () => {
    const raw = await cdp.evaluate(`(() => {
      const el = document.querySelector('[data-block]');
      return el ? el.getAttribute('data-block') : null;
    })()`);
    return typeof raw === "string" && raw !== "none" ? raw : null;
  }, (v): v is string => v !== null, "a real block arriving in JevCore");
  console.log("OBSERVED live block in core:", blocks);

  await Bun.sleep(2500);

  const report = await cdp.evaluate(`(() => {
    const anim = (el) => el ? getComputedStyle(el).animationName : null;
    const count = (sel) => document.querySelectorAll(sel).length;
    const mesh = document.querySelector('.meshLayer');
    const scan = document.querySelector('.scanline');
    const orbRing = document.querySelector('[class*="-module__"][class*="ring"], .ring');
    const core = document.querySelector('[data-block]');
    const dialArcs = Array.from(document.querySelectorAll('svg circle[pathLength="100"]'));
    const rows = Array.from(document.querySelectorAll('[role="listitem"]'));
    const rectOf = (el) => el ? el.getBoundingClientRect() : null;
    const gridAreas = (() => {
      const stage = document.querySelector('[class*="stage_"], [class*="stage"]');
      return stage ? getComputedStyle(stage).gridTemplateAreas : null;
    })();
    return {
      meshAnimation: anim(mesh),
      meshDuration: mesh ? getComputedStyle(mesh).animationDuration : null,
      meshIteration: mesh ? getComputedStyle(mesh).animationIterationCount : null,
      scanIteration: scan ? getComputedStyle(scan, '::after').animationIterationCount : null,
      orbPerspective: (() => { const p = document.querySelector('[class*="perspective"]'); return p ? getComputedStyle(p).perspective : null; })(),
      orbTransformStyle: (() => { const o = document.querySelector('[class*="orb"]:not([class*="orbHost"]):not([class*="orbWrap"])'); return o ? { cls: o.className, transform: getComputedStyle(o).transform } : null; })(),
      dialArcCount: dialArcs.length,
      dialDash: dialArcs.map((a) => a.getAttribute('stroke-dasharray')),
      dialNeedle: (() => { const n = document.querySelector('svg line[stroke="var(--ink)"]'); return n ? getComputedStyle(n).transform : null; })(),
      telemetryRows: rows.length,
      telemetryStaggerDelays: rows.slice(0, 4).map((r) => r.style.animationDelay),
      ladderPlanes: count('[class*="Ladder"][class*="plane"]'),
      ladderPanelPresent: Boolean(document.querySelector('[class*="Ladder"][class*="panel"]')),
      ladderEmptyText: (document.querySelector('[class*="Ladder"][class*="availability"]') || {}).textContent || null,
      ladderPrices: Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent).filter(Boolean).slice(0, 8),
      blockCellAnimation: (() => { const c = document.querySelector('rect[class*="blockCell"]'); return c ? getComputedStyle(c).animationName : null; })(),
      ringAnimation: (() => { const r = document.querySelector('[class*="ring"]'); return r ? getComputedStyle(r).animationName : null; })(),
      actionWordAnimation: (() => { const a = document.querySelector('[data-action-word]'); return a ? getComputedStyle(a).animationName : null; })(),
      ruleDrawAnimation: (() => { const r = document.querySelector('[class*="rule"]'); return r ? getComputedStyle(r).animationName : null; })(),
      planeAnimation: (() => { const p2 = document.querySelector('[class*="Ladder"][class*="plane"]'); return p2 ? getComputedStyle(p2).animationName : null; })(),
      kpiCells: count('[aria-label="Métricas do feed"] > div'),
      heroFontSize: (() => { const h = document.querySelector('.clippedText'); return h ? getComputedStyle(h).fontSize : null; })(),
      chartBlockCells: count('rect[class*="blockCell"]'),
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      stageGridAreas: gridAreas,
      bodyTextSample: document.body.innerText.slice(0, 400),
    };
  })()`);
  console.log("REPORT", JSON.stringify(report, null, 2));

  // Tilt check: dispatch a pointer move over the orb and read the tilt custom properties.
  const tilt = await cdp.evaluate(`(async () => {
    const core = document.querySelector('[data-block]');
    const host = core ? core.parentElement : null;
    const orb = host ? host.querySelector('[class*="orb"]:not([class*="orbHost"]):not([class*="orbWrap"])') : null;
    if (!orb) return { error: "orb not found" };
    const rect = orb.getBoundingClientRect();
    orb.dispatchEvent(new PointerEvent('pointermove', {
      clientX: rect.left + rect.width * 0.9,
      clientY: rect.top + rect.height * 0.2,
      bubbles: true,
    }));
    await new Promise((r) => setTimeout(r, 400));
    const cs = getComputedStyle(orb);
    return { tiltX: cs.getPropertyValue('--tilt-x').trim(), tiltY: cs.getPropertyValue('--tilt-y').trim(), transform: cs.transform };
  })()`);
  console.log("TILT", JSON.stringify(tilt, null, 2));

  for (const viewport of WIDTHS) {
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
    });
    await Bun.sleep(700);
    const layout = await cdp.evaluate(`(() => {
      const consoleEl = Array.from(document.querySelectorAll('div')).find((d) => getComputedStyle(d).display === 'grid' && d.className.includes('page-module') && d.className.includes('console'));
      const cs = consoleEl ? getComputedStyle(consoleEl) : null;
      return {
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        columns: cs ? cs.gridTemplateColumns : null,
        areas: cs ? cs.gridTemplateAreas : null,
      };
    })()`);
    console.log(`LAYOUT ${viewport.label}px`, JSON.stringify(layout));
  }

  // Reconnect policy with a live page: the backend is killed from the shell, so the EventSource
  // really drops and useFeed preserves its last values across the gap.
  const beforeDrop = await cdp.evaluate(`(() => ({
    action: (document.querySelector('[data-action-word]') || {}).textContent || null,
    block: document.querySelector('[data-block]').getAttribute('data-block'),
  }))()`);
  console.log("BEFORE DROP", JSON.stringify(beforeDrop));

  if (process.env.KILL_FEED_CMD) {
    Bun.spawn(process.env.KILL_FEED_CMD.split(" "), { cwd: process.env.KILL_FEED_CWD ?? WEB_ROOT, stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
  }
  for (let i = 0; i < 20; i += 1) {
    await Bun.sleep(5000);
    const probe = await cdp.evaluate(`(() => ({
      chip: document.body.innerText.toLowerCase().includes('reconectando ao feed'),
      label: document.body.innerText.includes('Feed desconectado') ? 'disconnected' : document.body.innerText.includes('Feed conectado') ? 'live' : 'other',
      action: (document.querySelector('[data-action-word]') || {}).textContent || null,
      block: document.querySelector('[data-block]') ? document.querySelector('[data-block]').getAttribute('data-block') : null,
    }))()`);
    console.log(`T+${(i + 1) * 5}s`, JSON.stringify(probe));
    if (probe && typeof probe === "object" && (probe as { chip?: boolean }).chip) break;
  }
  await Bun.sleep(1200);
  const held = await cdp.evaluate(`(() => ({
    action: (document.querySelector('[data-action-word]') || {}).textContent || null,
    block: document.querySelector('[data-block]').getAttribute('data-block'),
    noticeShown: document.body.innerText.toLowerCase().includes('reconectando ao feed'),
    dimmedFrames: Array.from(document.querySelectorAll('section, header, div')).filter((el) => getComputedStyle(el).opacity === '0.6').length,
    animationsInFrames: document.getAnimations().filter((a) => {
      const t = a.effect && a.effect.target;
      return Boolean(t) && t.closest('[class*="KpiSurface"], [class*="JevCore"], [class*="TelemetryStream"], [class*="Rail"], [class*="stage"]') !== null;
    }).length,
  }))()`);
  console.log("RECONNECT", JSON.stringify(held, null, 2));

  const errors = cdp.console.filter((entry) => entry.type === "error" || entry.type === "exception");
  const warnings = cdp.console.filter((entry) => entry.type === "warning" || entry.type === "warn");
  console.log("CONSOLE ERRORS", JSON.stringify(errors, null, 2));
  console.log("CONSOLE WARNINGS", JSON.stringify(warnings.slice(0, 8), null, 2));
  console.log("CONSOLE TOTAL", cdp.console.length);
} finally {
  browser?.kill();
  next.kill();
}