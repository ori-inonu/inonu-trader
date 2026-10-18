/**
 * The single local core of the desktop app (ADR-1, WIN-3, WIN-6): one process on 127.0.0.1 that serves the static desk
 * (the Next export) and its APIs from the SAME origin, so there is no CORS and no second port.
 *
 * What it does and does not do:
 *  - loopback only: it binds 127.0.0.1, and every request needs a loopback peer and a loopback Host (DNS rebinding);
 *  - same origin: the browser omits `Origin` on a same-origin GET, but the API handlers (/onchain, /settings, /jev-read,
 *    /system-one) require an exact Origin. When the browser declares `Sec-Fetch-Site: same-origin` the core supplies its
 *    own origin, so the handlers keep their guard untouched and a cross-site page still gets denied;
 *  - liveness: it injects a tiny script into every HTML page that opens ONE EventSource to /__inonu/live and keeps it.
 *    A held connection cannot be throttled the way a timer in a hidden or minimized page can. The core counts open
 *    streams; with none for `idleMs` (and none ever within `startupGraceMs`) it calls `onIdle` (the launcher exits), so
 *    closing the window ends the app without watching any process, and a reload (close then open) does not;
 *  - a busy port is a named error (the origin must stay the same: localStorage is per origin), never a silent fallback.
 * It serves nothing outside `webDir` and never reads a credential.
 */
import { statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { loopbackHost, loopbackIp } from "../settings/guards";
import { activeDevOrigins } from "./dev-origins";

export const DEFAULT_PORT = 47321;
/** What `/health` calls itself, so a second launch can tell a running Inonu from some other program on the port. */
export const APP_ID = "inonu-trader";
export const HEARTBEAT_PATH = "/__inonu/heartbeat.js";
/** Routes of the upstream console that the installed app does not serve. */
const RETIRED_ROUTES: readonly string[] = ["/console"];
const LIVE_PATH = "/__inonu/live";
/** The Doctor report (T1.8). The page itself is /doctor; this is its data, in the core's own namespace. */
export const DOCTOR_PATH = "/__inonu/doctor";

export type ApiHandler = (request: Request, remoteIp: string | null) => Response | Promise<Response>;

export interface CoreHandlers {
  settings?: ApiHandler;
  onchain?: ApiHandler;
  jevRead?: ApiHandler;
  systemOne?: ApiHandler;
  /** "Pedir ao Inonu" (src/inonu/http.ts). */
  inonu?: ApiHandler;
  /** The autonomous agent (src/agent/http.ts). */
  agent?: ApiHandler;
}

export interface CoreOptions {
  /** 0 asks the OS for a free port (tests only; the app uses a fixed one). */
  port: number;
  /** Absolute path of the static export. */
  webDir: string;
  version: string;
  /** The API handlers, or a factory that receives the core's own origin once the port is bound (handlers need it). */
  handlers: CoreHandlers | ((origin: string) => CoreHandlers);
  /** With no page connected for this long the core ends. 0 disables the idle shutdown. Default 60 s (covers a reload). */
  idleMs?: number;
  /** Time to wait for the first page before the idle clock applies (the browser may start slowly). Default 120 s. */
  startupGraceMs?: number;
  /** Comment frame period on the live stream; must stay under Bun's 10 s connection idle timeout. Default 4 s. */
  keepaliveMs?: number;
  pollMs?: number;
  onIdle?: () => void;
  /** Runs the Doctor checks (see doctor.ts). Without it the route is a 404. The report holds states, never a secret. */
  doctor?: () => Promise<object>;
  now?: () => number;
}

export interface Core {
  readonly port: number;
  readonly hostname: string;
  readonly origin: string;
  /** The whole request pipeline, callable without a socket. */
  handle(request: Request, remoteIp: string | null): Promise<Response>;
  stop(): void;
}

export class PortInUseError extends Error {
  constructor(readonly port: number) {
    super(`port ${port} is already in use`);
    this.name = "PortInUseError";
  }
}

// EventSource reconnects by itself (the first frame sets retry), so a core that restarts is found again; the browser
// closes the stream when the page goes away, which is the only signal the core needs.
const HEARTBEAT_SCRIPT = `(function(){try{new EventSource("${LIVE_PATH}")}catch(e){}})();`;

const HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };
const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, "content-type": "application/json", "cache-control": "no-store" } });

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** A path inside webDir for the URL path, `"bad"` for anything that tries to leave it, null when nothing matches. */
function resolveStatic(webDir: string, pathname: string): string | "bad" | null {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return "bad";
  }
  if (rel.includes("\0") || rel.includes("\\") || rel.split("/").includes("..")) return "bad";
  rel = rel.replace(/^\/+/, "");
  const candidates = rel === "" ? ["index.html"] : [rel, `${rel}.html`, `${rel.replace(/\/+$/, "")}/index.html`];
  for (const candidate of candidates) {
    const full = resolve(webDir, candidate);
    if (full.startsWith(webDir + sep) && isFile(full)) return full;
  }
  return null;
}

function withHeartbeat(html: string): string {
  const tag = `<script src="${HEARTBEAT_PATH}"></script>`;
  const at = html.lastIndexOf("</body>");
  return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}

/**
 * The browser omits Origin on a same-origin GET; hand the API guards the origin the page really has. In development (allowed only by the development entry,
 * src/desktop/dev.ts) the page of the hot reload server sits on another port, so its pictures arrive as `same-site` with no Origin: the page they name in
 * their Referer is taken as the origin, but only when that page is one of the development origins. The installed app lists none, so this never applies there.
 */
export function withOwnOrigin(request: Request, origin: string, dev: readonly string[] = activeDevOrigins()): Request {
  if (request.headers.get("origin") !== null) return request;
  const site = request.headers.get("sec-fetch-site");
  let supplied: string | null = null;
  if (site === "same-origin") supplied = origin;
  else if (site === "same-site" && dev.length > 0) {
    try {
      const fromPage = new URL(request.headers.get("referer") ?? "").origin;
      if (dev.includes(fromPage)) supplied = fromPage;
    } catch {
      // no usable Referer: the request stays without an origin and the guards refuse it
    }
  }
  if (supplied === null) return request;
  const headers = new Headers(request.headers);
  headers.set("origin", supplied);
  return new Request(request, { headers });
}

export function startCore(options: CoreOptions): Core {
  const webDir = resolve(options.webDir);
  const now = options.now ?? Date.now;
  const startedAt = now();
  const idleMs = options.idleMs ?? 60_000;
  const startupGraceMs = options.startupGraceMs ?? 120_000;
  const keepaliveMs = options.keepaliveMs ?? 4_000;
  // Streams currently held open by pages, and the instant after which an unattended core ends.
  let openStreams = 0;
  let deadline = startedAt + startupGraceMs;
  let origin = "";
  let handlers: CoreHandlers = {};

  const apiFor = (pathname: string): { handler: ApiHandler | undefined } | null => {
    if (pathname === "/settings" || pathname.startsWith("/settings/")) return { handler: handlers.settings };
    if (pathname.startsWith("/onchain/")) return { handler: handlers.onchain };
    if (pathname.startsWith("/inonu/")) return { handler: handlers.inonu };
    if (pathname === "/agent" || pathname.startsWith("/agent/")) return { handler: handlers.agent };
    if (pathname === "/jev-read") return { handler: handlers.jevRead };
    if (pathname === "/system-one") return { handler: handlers.systemOne };
    if (pathname === "/operator" || pathname.startsWith("/operator/")) return { handler: undefined };
    return null;
  };

  /** One page's stream: counted while open; the countdown to shutdown starts when the last one closes. */
  function liveStream(): Response {
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const release = () => {
      if (closed) return;
      closed = true;
      if (timer !== undefined) clearInterval(timer);
      openStreams -= 1;
      if (openStreams === 0) deadline = now() + idleMs;
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        openStreams += 1;
        controller.enqueue(encoder.encode("retry: 3000\n\n"));
        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(":\n\n"));
          } catch {
            release(); // the client is gone and the cancel callback did not fire
          }
        }, keepaliveMs);
      },
      cancel: release,
    });
    return new Response(body, { headers: { ...HEADERS, "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
  }

  /** Pages of the old observation console are still in the export but are not part of the installed app (WIN-13): they are a 404. */
  function retired(pathname: string): boolean {
    return RETIRED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`) || pathname.startsWith(`${route}.`));
  }

  async function route(request: Request, remoteIp: string | null): Promise<Response> {
    if (!loopbackIp(remoteIp) || !loopbackHost(request.headers.get("host"))) return jsonResponse({ ok: false, error: "forbidden" }, 403);
    const { pathname } = new URL(request.url);

    if (pathname === LIVE_PATH) {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
      const site = request.headers.get("sec-fetch-site");
      if (site !== null && site !== "same-origin") return jsonResponse({ ok: false, error: "forbidden" }, 403);
      return liveStream();
    }
    if (pathname === DOCTOR_PATH) {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
      const site = request.headers.get("sec-fetch-site");
      if (site !== null && site !== "same-origin") return jsonResponse({ ok: false, error: "forbidden" }, 403);
      if (!options.doctor) return jsonResponse({ ok: false, error: "not_found" }, 404);
      return jsonResponse({ ok: true, ...(await options.doctor()) }, 200);
    }
    if (pathname === HEARTBEAT_PATH) return new Response(HEARTBEAT_SCRIPT, { headers: { ...HEADERS, "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
    if (pathname === "/health") return jsonResponse({ ok: true, app: APP_ID, version: options.version, startedAt, uptimeMs: now() - startedAt }, 200);

    const api = apiFor(pathname);
    if (api) {
      if (!api.handler) return jsonResponse({ ok: false, error: "not_found" }, 404);
      return api.handler(withOwnOrigin(request, origin), remoteIp);
    }

    if (request.method !== "GET" && request.method !== "HEAD") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
    const file = retired(pathname) ? null : resolveStatic(webDir, pathname);
    if (file === "bad") return jsonResponse({ ok: false, error: "bad_request" }, 400);
    const found = file ?? resolveStatic(webDir, "/404.html");
    const status = file === null ? 404 : 200;
    if (found === null || found === "bad") return new Response("not found", { status: 404, headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" } });
    if (found.endsWith(".html")) {
      const html = withHeartbeat(await Bun.file(found).text());
      return new Response(html, { status, headers: { ...HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    const hashed = pathname.startsWith("/_next/static/");
    return new Response(Bun.file(found), { status, headers: { ...HEADERS, "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache" } });
  }

  const handle = async (request: Request, remoteIp: string | null): Promise<Response> => {
    try {
      return await route(request, remoteIp);
    } catch {
      return jsonResponse({ ok: false, error: "internal" }, 500); // constant text: nothing from the failure leaves
    }
  };

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({ hostname: "127.0.0.1", port: options.port, fetch: (request, srv) => handle(request, srv.requestIP(request)?.address ?? null) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EADDRINUSE" || /in use|EADDRINUSE/i.test(error instanceof Error ? error.message : "")) throw new PortInUseError(options.port);
    throw error;
  }
  origin = `http://127.0.0.1:${server.port}`;
  // Bun.serve returned synchronously and no request is processed before this line finishes.
  try {
    handlers = typeof options.handlers === "function" ? options.handlers(origin) : options.handlers;
  } catch (error) {
    server.stop(true);
    throw error;
  }

  let fired = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    server.stop(true);
  };
  if (idleMs > 0) {
    timer = setInterval(() => {
      if (fired || openStreams > 0 || now() < deadline) return;
      fired = true;
      (options.onIdle ?? stop)();
    }, options.pollMs ?? 1_000);
  }

  return { port: server.port as number, hostname: "127.0.0.1", origin, handle, stop };
}
