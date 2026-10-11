import { isAbsolute, resolve } from "node:path";
import { createOperatorHandler, isOperatorPath } from "./operator/http";
import { createSystemOneHandler, isSystemOnePath } from "./system-one/http";
import { createJevReadHandler, isJevReadPath } from "./jev-read/http";
import type { Fill, Quote } from "./market";
import type { BlockEvent } from "./trader";

interface Meta { model: string; wallet: string | null; dryRun: boolean; market: string; startedAt: number; mode?: string; dataSource?: string }

export interface HttpPreviewOptions { port: number; origins: string[]; stateDir: string }

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const json = (body: unknown, status = 200, headers: Record<string, string> = CORS) => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

/** Operator routes (R5 C2, M2, F7): dashboard origins only, optional token, absolute paths, cached journal. */
const OPERATOR_ROOT = resolve(import.meta.dir, "..");

/** GET / snapshot · GET /history recent blocks · GET /events SSE stream (`snapshot`, `block`, `quote`, `fill`, `ping`) */
export function startServer(meta: Meta, history: () => BlockEvent[], preview?: HttpPreviewOptions) {
  if (preview) {
    if (!Number.isInteger(preview.port) || preview.port < 1 || preview.port > 65535) throw new Error("Invalid preview port");
    if (!isAbsolute(preview.stateDir)) throw new Error("Preview state directory must be absolute");
    if (!preview.origins.length || preview.origins.some(origin => {
      try { const url = new URL(origin); return url.origin !== origin || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname); }
      catch { return true; }
    })) throw new Error("Preview origins must be exact HTTP loopback origins");
  }
  const origins = preview?.origins ?? (process.env.OPERATOR_DASHBOARD_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001").split(",");
  const token = preview ? null : process.env.OPERATOR_READ_TOKEN ?? null;
  const operatorHandler = createOperatorHandler({ origins, token,
    statePath: preview ? resolve(preview.stateDir, "operator/latest.json") : resolve(OPERATOR_ROOT, process.env.OPERATOR_STATE_PATH ?? "data/operator/latest.json"),
    journalPath: preview ? resolve(preview.stateDir, "operator/cycles.jsonl") : resolve(OPERATOR_ROOT, process.env.OPERATOR_JOURNAL_PATH ?? "data/operator/cycles.jsonl"),
  });
  const systemOneHandler = createSystemOneHandler(
    preview ? resolve(preview.stateDir, "system-one/latest.json") : resolve(OPERATOR_ROOT, process.env.SYSTEM_ONE_STATE_PATH ?? "data/system-one/latest.json"), origins, token);
  // Jev reads the tape: the latest advisory buy, sell or hold per instrument, read only (scripts/jev-read.ts writes it).
  const jevReadHandler = createJevReadHandler(
    preview ? resolve(preview.stateDir, "jev-read/latest.json") : resolve(OPERATOR_ROOT, process.env.JEV_READ_STATE_PATH ?? "data/jev-read/latest.json"), origins, token);
  // The explicit read-only preview must not load financial environment configuration.
  // Keep the synchronous configuration contract for existing normal callers.
  const port = preview ? preview.port : (require("./config") as typeof import("./config")).config.port;
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();
  const send = (c: ReadableStreamDefaultController<Uint8Array>, type: string, data: unknown) => {
    try { c.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { clients.delete(c); }
  };
  try {
    const server = Bun.serve({
      port,
      ...(preview ? { hostname: "127.0.0.1" } : {}),
      fetch(req) {
        const { pathname } = new URL(req.url);
        const origin = req.headers.get("origin");
        const headers: Record<string, string> = preview ? { vary: "Origin", ...(origin && origins.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" } : {}) } : CORS;
        if (preview && origin && !origins.includes(origin)) return json({ error: "origin not allowed" }, 403, headers);
        if (preview && req.method !== "GET" && req.method !== "OPTIONS") return json({ error: "method not allowed" }, 405, headers);
        if (isOperatorPath(pathname)) return operatorHandler(req, pathname);
        if (isSystemOnePath(pathname)) return systemOneHandler(req);
        if (isJevReadPath(pathname)) return jevReadHandler(req);
        if (req.method === "OPTIONS") return new Response(null, { headers });
        if (pathname === "/") return json({ ...meta, latest: history().at(-1) ?? null }, 200, headers);
        if (pathname === "/history") return json(history(), 200, headers);
        if (pathname === "/events") {
          const stream = new ReadableStream<Uint8Array>({
            start(c) { clients.add(c); send(c, "snapshot", { ...meta, history: history() }); },
            cancel(c) { clients.delete(c); },
          });
          return new Response(stream, { headers: { ...headers, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
        }
        return json({ error: "not found" }, 404, headers);
      },
    });
    const heartbeat = setInterval(() => clients.forEach((c) => send(c, "ping", Date.now())), 15_000);
    const broadcast = (type: string, data: unknown) => clients.forEach((c) => send(c, type, data));
    let closed = false;
    return {
      broadcast: (e: BlockEvent) => broadcast("block", e),
      broadcastQuote: (block: number, quote: Quote) => broadcast("quote", { block, quote }),
      broadcastFill: (block: number, fill: Fill) => broadcast("fill", { block, fill }),
      close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        for (const client of clients) { try { client.close(); } catch {} }
        clients.clear();
        server.stop(true);
      },
    };
  } catch (e) {
    if (preview) throw e;
    const code = e instanceof Error && "code" in e ? e.code : undefined;
    if (code !== "EADDRINUSE") throw e;
    console.error(`jev-trader: cannot bind port ${port}: already in use.`);
    console.error(`  Set PORT=<other port> to serve elsewhere, or stop the process already listening on ${port}.`);
    process.exit(1);
  }

}
