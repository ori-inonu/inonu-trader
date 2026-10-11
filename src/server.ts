import { config } from "./config";
import { resolve } from "node:path";
import { createOperatorHandler, isOperatorPath } from "./operator/http";
import { createSystemOneHandler, isSystemOnePath } from "./system-one/http";
import { createJevReadHandler, isJevReadPath } from "./jev-read/http";
import type { Fill, Quote } from "./market";
import type { BlockEvent } from "./trader";

interface Meta { model: string; wallet: string | null; dryRun: boolean; market: string; startedAt: number }

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const json = (body: unknown, status = 200, headers: Record<string, string> = CORS) => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

/** Operator routes (R5 C2, M2, F7): dashboard origins only, optional token, absolute paths, cached journal. */
const OPERATOR_ROOT = resolve(import.meta.dir, "..");
const operatorHandler = createOperatorHandler({
  origins: (process.env.OPERATOR_DASHBOARD_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001").split(","),
  token: process.env.OPERATOR_READ_TOKEN ?? null,
  statePath: resolve(OPERATOR_ROOT, process.env.OPERATOR_STATE_PATH ?? "data/operator/latest.json"),
  journalPath: resolve(OPERATOR_ROOT, process.env.OPERATOR_JOURNAL_PATH ?? "data/operator/cycles.jsonl"),
});
/** System One: the latest leverage decision cycle, read only. */
const systemOneHandler = createSystemOneHandler(
  resolve(OPERATOR_ROOT, process.env.SYSTEM_ONE_STATE_PATH ?? "data/system-one/latest.json"),
  (process.env.OPERATOR_DASHBOARD_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001").split(","),
  process.env.OPERATOR_READ_TOKEN ?? null,
);
/** Jev reads the tape: the latest advisory buy, sell or hold per instrument, read only (scripts/jev-read.ts writes it). */
const jevReadHandler = createJevReadHandler(
  resolve(OPERATOR_ROOT, process.env.JEV_READ_STATE_PATH ?? "data/jev-read/latest.json"),
  (process.env.OPERATOR_DASHBOARD_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001").split(","),
  process.env.OPERATOR_READ_TOKEN ?? null,
);

/** GET / snapshot · GET /history recent blocks · GET /events SSE stream (`snapshot`, `block`, `quote`, `fill`, `ping`) */
export function startServer(meta: Meta, history: () => BlockEvent[]) {
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();
  const send = (c: ReadableStreamDefaultController<Uint8Array>, type: string, data: unknown) => {
    try { c.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { clients.delete(c); }
  };
  setInterval(() => clients.forEach((c) => send(c, "ping", Date.now())), 15_000);

  try {
    Bun.serve({
      port: config.port,
      fetch(req) {
        const { pathname } = new URL(req.url);
        if (isOperatorPath(pathname)) return operatorHandler(req, pathname);
        if (isSystemOnePath(pathname)) return systemOneHandler(req);
        if (isJevReadPath(pathname)) return jevReadHandler(req);
        if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
        if (pathname === "/") return json({ ...meta, latest: history().at(-1) ?? null });
        if (pathname === "/history") return json(history());
        if (pathname === "/events") {
          const stream = new ReadableStream<Uint8Array>({
            start(c) { clients.add(c); send(c, "snapshot", { ...meta, history: history() }); },
            cancel(c) { clients.delete(c); },
          });
          return new Response(stream, { headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
        }
        return json({ error: "not found" }, 404);
      },
    });
  } catch (e) {
    const code = e instanceof Error && "code" in e ? e.code : undefined;
    if (code !== "EADDRINUSE") throw e;
    console.error(`jev-trader: cannot bind port ${config.port}: already in use.`);
    console.error(`  Set PORT=<other port> to serve elsewhere, or stop the process already listening on ${config.port}.`);
    process.exit(1);
  }

  const broadcast = (type: string, data: unknown) => clients.forEach((c) => send(c, type, data));
  return {
    broadcast: (e: BlockEvent) => broadcast("block", e),
    /** A quote's receipt landed: placed (with order id) or reverted, and the real gas. */
    broadcastQuote: (block: number, quote: Quote) => broadcast("quote", { block, quote }),
    /** A taker hit one of our resting orders in `block`. */
    broadcastFill: (block: number, fill: Fill) => broadcast("fill", { block, fill }),
  };
}
