/**
 * The live trade feed of the flow engine: OKX's public WebSocket `trades` channel. It is free, needs no key, and carries the
 * AGGRESSOR side of every print, which is what the footprint is made of. The feed owns the connection and nothing else: it
 * subscribes, keeps the line alive (ping when quiet, tear down and reconnect when silent), reconnects with a growing wait,
 * resubscribes, validates each row, counts what it received and what it dropped, and hands the trades over.
 *
 * Everything with a side effect is injected (the socket, the clock, the timers), so the behaviour is tested without a network.
 */
import { parseDec } from "../intel/decimal";
import type { RateMeter, Trade } from "../intel/ingest";
import { instTypeOf } from "./okx-public";

export const OKX_PUBLIC_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";

/** The part of a WebSocket the feed uses. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type FeedState = "idle" | "connecting" | "live" | "reconnecting" | "error" | "closed";

export interface FeedStatus {
  readonly state: FeedState;
  readonly instruments: number;
  readonly reconnects: number;
  /** A constant code, never the exchange's text. */
  readonly code?: string;
}

export interface TradeFeedOptions {
  readonly create: (url: string) => SocketLike;
  readonly schedule: { after(ms: number, fn: () => void): () => void; every(ms: number, fn: () => void): () => void };
  readonly now: () => number;
  readonly onTrades: (instId: string, trades: Trade[]) => void;
  readonly onStatus?: (status: FeedStatus) => void;
  readonly meter?: RateMeter;
  readonly url?: string;
}

export interface TradeFeed {
  /** False when the id is not an instrument. */
  subscribe(instId: string): boolean;
  unsubscribe(instId: string): void;
  instruments(): string[];
  stats(): { readonly messages: number; readonly rejected: number; readonly reconnects: number };
  status(): FeedStatus;
  close(): void;
}

const HEARTBEAT_EVERY_MS = 5_000;
const PING_AFTER_MS = 20_000;
const SILENT_AFTER_MS = 45_000;
const BACKOFF_FIRST_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;
const SOURCE = "okx-ws-trades";

const positive = (text: unknown): text is string => {
  if (typeof text !== "string") return false;
  const value = parseDec(text);
  return value !== null && value.int > 0n;
};

export function createTradeFeed(options: TradeFeedOptions): TradeFeed {
  const url = options.url ?? OKX_PUBLIC_WS_URL;
  const wanted: string[] = [];
  let socket: SocketLike | null = null;
  let open = false;
  let closed = false;
  let attempt = 0;
  let reconnects = 0;
  let messages = 0;
  let rejected = 0;
  let lastMessageAt = 0;
  let lastPingAt = 0;
  let stopHeartbeat: (() => void) | null = null;
  let cancelReconnect: (() => void) | null = null;
  let current: FeedStatus = { state: "idle", instruments: 0, reconnects: 0 };

  const emit = (state: FeedState, code?: string): void => {
    current = { state, instruments: wanted.length, reconnects, ...(code === undefined ? {} : { code }) };
    options.onStatus?.(current);
  };

  const send = (payload: unknown): void => {
    try {
      socket?.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    } catch {
      // a send on a socket that just died: the close handler reconnects
    }
  };

  const args = (ids: readonly string[]) => ids.map((instId) => ({ channel: "trades", instId }));

  function detach(): void {
    stopHeartbeat?.();
    stopHeartbeat = null;
    if (socket !== null) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
    socket = null;
    open = false;
  }

  function scheduleReconnect(): void {
    if (closed || cancelReconnect !== null) return;
    const wait = Math.min(BACKOFF_CAP_MS, BACKOFF_FIRST_MS * 2 ** attempt);
    attempt += 1;
    reconnects += 1;
    emit("reconnecting");
    cancelReconnect = options.schedule.after(wait, () => {
      cancelReconnect = null;
      connect();
    });
  }

  function onMessage(raw: unknown): void {
    lastMessageAt = options.now();
    if (typeof raw !== "string" || raw === "pong") return;
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return;
    }
    if (body === null || typeof body !== "object") return;
    const message = body as { event?: unknown; code?: unknown; arg?: { channel?: unknown; instId?: unknown }; data?: unknown };
    if (message.event === "error") {
      emit("error", `ws_${String(message.code ?? "unknown").replace(/[^0-9a-zA-Z]/g, "").slice(0, 12) || "unknown"}`);
      return;
    }
    if (message.event !== undefined || message.arg?.channel !== "trades" || !Array.isArray(message.data)) return;
    const instId = message.arg.instId;
    if (typeof instId !== "string" || !wanted.includes(instId)) return;
    messages += 1;
    attempt = 0; // data is flowing: the next drop starts the backoff over
    options.meter?.record(SOURCE, options.now());
    const trades: Trade[] = [];
    for (const row of message.data as Record<string, unknown>[]) {
      if (row === null || typeof row !== "object" || (row.side !== "buy" && row.side !== "sell") || !positive(row.px) || !positive(row.sz) || typeof row.ts !== "string" || !/^\d{1,15}$/.test(row.ts)) {
        rejected += 1;
        continue;
      }
      trades.push({ ts: Number(row.ts), px: row.px, sz: row.sz, side: row.side });
    }
    if (current.state !== "live") emit("live");
    if (trades.length > 0) options.onTrades(instId, trades);
  }

  function heartbeat(): void {
    const quiet = options.now() - lastMessageAt;
    if (quiet >= SILENT_AFTER_MS) {
      detach();
      scheduleReconnect();
      return;
    }
    if (quiet >= PING_AFTER_MS && options.now() - lastPingAt >= PING_AFTER_MS) {
      lastPingAt = options.now();
      send("ping");
    }
  }

  function connect(): void {
    if (closed || socket !== null || wanted.length === 0) return;
    emit(reconnects > 0 ? "reconnecting" : "connecting");
    let created: SocketLike;
    try {
      created = options.create(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = created;
    created.onopen = () => {
      open = true;
      lastMessageAt = options.now();
      lastPingAt = options.now();
      emit("live");
      send({ op: "subscribe", args: args(wanted) });
      stopHeartbeat = options.schedule.every(HEARTBEAT_EVERY_MS, heartbeat);
    };
    created.onmessage = (event) => onMessage(event.data);
    created.onerror = () => {
      // the close that follows is what reconnects
    };
    created.onclose = () => {
      stopHeartbeat?.();
      stopHeartbeat = null;
      socket = null;
      open = false;
      scheduleReconnect();
    };
  }

  return {
    subscribe(instId) {
      if (instTypeOf(instId) === null) return false;
      if (wanted.includes(instId)) return true;
      wanted.push(instId);
      if (open) send({ op: "subscribe", args: args([instId]) });
      else connect();
      return true;
    },

    unsubscribe(instId) {
      const at = wanted.indexOf(instId);
      if (at < 0) return;
      wanted.splice(at, 1);
      if (open) send({ op: "unsubscribe", args: args([instId]) });
    },

    instruments: () => [...wanted],
    stats: () => ({ messages, rejected, reconnects }),
    status: () => current,

    close() {
      closed = true;
      cancelReconnect?.();
      cancelReconnect = null;
      detach();
      emit("closed");
    },
  };
}
