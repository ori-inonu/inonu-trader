import { isAbsolute, join } from "node:path";
import { createOperatorHandler, isOperatorPath } from "../operator/http";
import { createSystemOneHandler } from "../system-one/http";

export interface ReportsServerOptions {
  dataDir: string;
  port: number;
  origins: string[];
  /**
   * Páginas HTML de leitura, por caminho exato (por exemplo "/motor"). Só GET, sob as mesmas verificações de host e origem,
   * com política de conteúdo restrita (sem script, sem rede). Uma página que lança vira "report unreadable" sem detalhe.
   */
  pages?: Readonly<Record<string, () => string | Promise<string>>>;
}

const BUILT_IN_PATHS = new Set(["/", "/health", "/system-one"]);

function validate(options: ReportsServerOptions): void {
  if (!isAbsolute(options.dataDir)) throw new Error("Reports data directory must be absolute");
  if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error("Reports port must be an integer from 0 to 65535");
  if (!Array.isArray(options.origins) || options.origins.length === 0) throw new Error("Reports origins must not be empty");
  for (const path of Object.keys(options.pages ?? {})) {
    if (!/^\/[a-z0-9-]+$/.test(path) || BUILT_IN_PATHS.has(path) || isOperatorPath(path)) throw new Error("Reports page path is not allowed");
  }
  for (const value of options.origins) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Reports origin must be a canonical local HTTP(S) origin"); }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") || value !== url.origin) {
      throw new Error("Reports origin must be a canonical local HTTP(S) origin");
    }
  }
}

function withHeaders(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("vary", "Origin");
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-headers");
  headers.delete("access-control-allow-methods");
  if (origin !== null) headers.set("access-control-allow-origin", origin);
  if (response.status === 204) {
    headers.set("access-control-allow-methods", "GET");
    headers.set("access-control-allow-headers", "Content-Type");
  }
  return new Response(response.body, { status: response.status, headers });
}

/** Local stored reports only. This entry never initializes the trading runtime. */
export function startReportsServer(options: ReportsServerOptions) {
  validate(options);
  const dataDir = options.dataDir;
  const origins = [...options.origins];
  const allowedOrigins = new Set(origins);
  const pages = options.pages ?? {};
  const systemOne = createSystemOneHandler(join(dataDir, "system-one/latest.json"), origins);
  return Bun.serve({
    hostname: "127.0.0.1",
    port: options.port,
    async fetch(req, server) {
      const host = req.headers.get("host");
      const origin = req.headers.get("origin");
      if ((host !== `127.0.0.1:${server.port}` && host !== `localhost:${server.port}`) || (origin !== null && !allowedOrigins.has(origin))) {
        return withHeaders(Response.json({ error: "host or origin not allowed" }, { status: 403 }), null);
      }
      const pathname = new URL(req.url).pathname;
      const page = Object.hasOwn(pages, pathname) ? pages[pathname] : undefined;
      const known = pathname === "/" || pathname === "/health" || isOperatorPath(pathname) || pathname === "/system-one" || page !== undefined;
      if (!known) return withHeaders(Response.json({ error: "not found" }, { status: 404 }), origin);
      if (req.method === "OPTIONS") return withHeaders(new Response(null, { status: 204 }), origin);
      if (req.method !== "GET") return withHeaders(Response.json({ error: "method not allowed" }, { status: 405, headers: { allow: "GET, OPTIONS" } }), origin);
      let response: Response;
      try {
        if (page !== undefined) {
          response = new Response(await page(), {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
              "x-content-type-options": "nosniff",
            },
          });
        } else if (isOperatorPath(pathname)) {
          // Refresh same-size journal rewrites even when a producer preserves mtime.
          response = createOperatorHandler({ origins, token: null, statePath: join(dataDir, "operator/latest.json"), journalPath: join(dataDir, "operator/cycles.jsonl") })(req, pathname);
        } else if (pathname === "/system-one") {
          // The System One handler demands an exact Origin. A same-origin tool without one is served through the
          // first configured origin, and withHeaders drops that CORS header again because the caller sent none.
          response = systemOne(origin === null
            ? new Request(req.url, { method: req.method, headers: { ...Object.fromEntries(req.headers), origin: origins[0]! } })
            : req);
        }
        else response = Response.json({ service: "inonu-reports", mode: "read-only", executionEnabled: false, liveFeedEnabled: false });
      } catch {
        response = Response.json({ error: "report unreadable" }, { status: 500 });
      }
      return withHeaders(response, origin);
    },
  });
}

