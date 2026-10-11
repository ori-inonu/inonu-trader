/**
 * Server side tape feed: the keyless OKX public WebSocket (books5, trades, tickers) plus small REST reads
 * (1 minute candles, perpetual funding, and top-5 book and ticker snapshots for quiet markets). It keeps rolling memory
 * per instrument and hands the reader a `TapeInput`.
 *
 * Book, ticker and trade receipts are stamped with the LOCAL receipt time, so their freshness does not depend on the
 * clock skew between this machine and the exchange. Candle stamps come from the exchange and are aged by the caller on
 * the exchange clock. Trades are kept by TIME (the flow window must never be cut short by a count), and the flow is
 * reported live only while the socket is open and the trades subscription was acknowledged, so a dead channel cannot
 * look like a quiet market. A malformed row is dropped, never coerced; a failed refresh keeps the previous rows and is
 * reported by a fixed code in `status()`, never by provider text.
 */

import type { TapeCandle, TapeInput, TapeLevel, TapeTrade } from "./types";

export interface FeedSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface FeedResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface OkxTapeFeedOptions {
  readonly instIds: readonly string[];
  readonly now?: () => number;
  readonly WebSocketImpl?: new (url: string) => FeedSocket;
  readonly setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (handle: unknown) => void;
  readonly fetchImpl?: (url: string) => Promise<FeedResponse>;
  readonly wsUrl?: string;
  readonly restOrigin?: string;
}

export interface FeedStatus {
  readonly connected: boolean;
  readonly reconnects: number;
  readonly lastMessageAtMs: number | null;
  /** A fixed code such as `okx_error:60012` or `book_refresh_failed:BTC-USDT`, never raw provider text. */
  readonly lastError: string | null;
}

interface Memory {
  book: { bids: TapeLevel[]; asks: TapeLevel[]; receivedAtMs: number } | null;
  trades: TapeTrade[];
  candles: TapeCandle[];
  ticker: TapeInput["ticker"];
  fundingRate: number | null;
}

const DEFAULT_WS = "wss://ws.okx.com:8443/ws/v5/public";
const DEFAULT_REST = "https://www.okx.com";
/** Longer than the 60 s flow window with margin; the hard cap only bounds memory against a flood. */
const TRADE_RETAIN_MS = 120_000;
const MAX_TRADES = 5_000;
const PING_AFTER_MS = 25_000;
const RECONNECT_AFTER_MS = 60_000;
const CONNECT_TIMEOUT_MS = 10_000;
const CLOSE_GRACE_MS = 5_000;
const REST_TIMEOUT_MS = 5_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const WS_CONNECTING = 0;
const WS_OPEN = 1;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function num(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function levels(value: unknown): TapeLevel[] | null {
  if (!Array.isArray(value)) return null;
  const out: TapeLevel[] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    const px = num(row[0]);
    const sz = num(row[1]);
    if (px === null || sz === null || px <= 0 || sz <= 0) return null;
    out.push({ px, sz });
  }
  return out;
}

export class OkxTapeFeed {
  private readonly options: Required<Pick<OkxTapeFeedOptions, "now" | "wsUrl" | "restOrigin">> & OkxTapeFeedOptions;
  private readonly memory = new Map<string, Memory>();
  private readonly tradesAcked = new Set<string>();
  private socket: FeedSocket | null = null;
  private running = false;
  private attempts = 0;
  private reconnects = 0;
  private lastMessageAtMs: number | null = null;
  private pingSentSinceMessage = false;
  private lastError: string | null = null;
  private reconnectTimer: unknown = null;
  private connectStartedAtMs = 0;
  private closeRequestedAtMs: number | null = null;

  constructor(options: OkxTapeFeedOptions) {
    this.options = { ...options, now: options.now ?? Date.now, wsUrl: options.wsUrl ?? DEFAULT_WS, restOrigin: options.restOrigin ?? DEFAULT_REST };
    for (const instId of options.instIds) this.memory.set(instId, { book: null, trades: [], candles: [], ticker: null, fundingRate: null });
  }

  start(): void {
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer !== null) (this.options.clearTimeoutFn ?? clearTimeout)(this.reconnectTimer as never);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.tradesAcked.clear();
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  }

  status(): FeedStatus {
    return { connected: this.socket !== null && this.socket.readyState === WS_OPEN, reconnects: this.reconnects, lastMessageAtMs: this.lastMessageAtMs, lastError: this.lastError };
  }

  /** Called on a timer by the owner: pings a quiet socket and recycles a dead, stuck or unresponsive one. */
  tick(): void {
    const socket = this.socket;
    if (!this.running || socket === null) return;
    const nowMs = this.options.now();
    if (socket.readyState === WS_CONNECTING) {
      if (nowMs - this.connectStartedAtMs > CONNECT_TIMEOUT_MS) this.recycle("connect_timeout");
      return;
    }
    if (this.closeRequestedAtMs !== null) {
      if (nowMs - this.closeRequestedAtMs > CLOSE_GRACE_MS) this.recycle("close_timeout");
      return;
    }
    if (socket.readyState !== WS_OPEN || this.lastMessageAtMs === null) return;
    const silence = nowMs - this.lastMessageAtMs;
    if (silence > RECONNECT_AFTER_MS) {
      this.lastError = "silence_reconnect";
      this.closeRequestedAtMs = nowMs;
      socket.close();
    } else if (silence > PING_AFTER_MS && !this.pingSentSinceMessage) {
      this.pingSentSinceMessage = true;
      socket.send("ping");
    }
  }

  snapshot(instId: string, nowMs: number, exchangeNowMs: number | null = null): TapeInput {
    const memory = this.memory.get(instId);
    if (memory === undefined) throw new Error(`instrument not tracked: ${instId}`);
    return {
      instId,
      nowMs,
      exchangeNowMs,
      tradesLive: this.socket !== null && this.socket.readyState === WS_OPEN && this.tradesAcked.has(instId),
      book: memory.book ? { bids: [...memory.book.bids], asks: [...memory.book.asks], receivedAtMs: memory.book.receivedAtMs } : null,
      trades: [...memory.trades],
      candles: [...memory.candles],
      ticker: memory.ticker ? { ...memory.ticker } : null,
      fundingRate: memory.fundingRate,
    };
  }

  /** How old the held book and ticker are, null when absent. A quiet market pushes nothing: the owner refreshes by REST. */
  ages(instId: string, nowMs: number): { bookAgeMs: number | null; tickerAgeMs: number | null } {
    const memory = this.memory.get(instId);
    return {
      bookAgeMs: memory?.book ? nowMs - memory.book.receivedAtMs : null,
      tickerAgeMs: memory?.ticker ? nowMs - memory.ticker.receivedAtMs : null,
    };
  }

  /** A fresh top-5 snapshot over REST. books5 only pushes on change, so an illiquid market can be silent yet current. */
  async refreshBook(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    try {
      const body = await this.get(`/api/v5/market/books?instId=${instId}&sz=5`);
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      const row: unknown = rows?.[0];
      const bids = isRecord(row) ? levels(row.bids) : null;
      const asks = isRecord(row) ? levels(row.asks) : null;
      if (bids === null || asks === null || bids.length === 0 || asks.length === 0) throw new Error("row");
      memory.book = { bids, asks, receivedAtMs: this.options.now() };
    } catch {
      this.lastError = `book_refresh_failed:${instId}`;
    }
  }

  async refreshTicker(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    try {
      const body = await this.get(`/api/v5/market/ticker?instId=${instId}`);
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      const row: unknown = rows?.[0];
      const last = isRecord(row) ? num(row.last) : null;
      if (!isRecord(row) || last === null || last <= 0) throw new Error("row");
      memory.ticker = { last, open24h: num(row.open24h), high24h: num(row.high24h), low24h: num(row.low24h), receivedAtMs: this.options.now() };
    } catch {
      this.lastError = `ticker_refresh_failed:${instId}`;
    }
  }

  async refreshCandles(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    try {
      const body = await this.get(`/api/v5/market/candles?instId=${instId}&bar=1m&limit=60`);
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      if (rows === null) throw new Error("envelope");
      const parsed: TapeCandle[] = [];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 9) throw new Error("row");
        const ts = num(row[0]);
        const close = num(row[4]);
        if (ts === null || ts <= 0 || close === null || close <= 0) throw new Error("row");
        parsed.push({ tsMs: ts, close, confirmed: row[8] === "1" });
      }
      memory.candles = parsed.sort((a, b) => a.tsMs - b.tsMs);
    } catch {
      this.lastError = `candles_refresh_failed:${instId}`;
    }
  }

  async refreshFunding(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    const base = instId.split("-")[0];
    try {
      const body = await this.get(`/api/v5/public/funding-rate?instId=${base}-USDT-SWAP`);
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      const row: unknown = rows?.[0];
      memory.fundingRate = isRecord(row) ? num(row.fundingRate) : null;
    } catch {
      memory.fundingRate = null;
    }
  }

  /** A REST read that cannot hang: it ends at the deadline whatever the transport does. */
  private async get(path: string): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? ((url: string) => fetch(url));
    const setTimer = this.options.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    let timer: unknown;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimer(() => reject(new Error("timeout")), REST_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([fetchImpl(`${this.options.restOrigin}${path}`), deadline]);
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await Promise.race([response.json(), deadline]);
    } finally {
      (this.options.clearTimeoutFn ?? clearTimeout)(timer as never);
    }
  }

  private connect(): void {
    if (!this.running) return;
    const Impl = this.options.WebSocketImpl ?? (globalThis.WebSocket as unknown as new (url: string) => FeedSocket);
    const socket = new Impl(this.options.wsUrl);
    this.socket = socket;
    this.connectStartedAtMs = this.options.now();
    this.closeRequestedAtMs = null;
    this.tradesAcked.clear();
    socket.onopen = () => {
      this.lastMessageAtMs = this.options.now();
      this.pingSentSinceMessage = false;
      const args = this.options.instIds.flatMap((instId) => [
        { channel: "books5", instId },
        { channel: "trades", instId },
        { channel: "tickers", instId },
      ]);
      socket.send(JSON.stringify({ op: "subscribe", args }));
    };
    socket.onmessage = (event) => this.onMessage(event.data);
    socket.onerror = () => {
      this.lastError = "socket_error";
    };
    socket.onclose = () => {
      if (this.socket === socket) this.handleClosed();
    };
  }

  /** The socket is gone. Schedule a reconnect with exponential backoff and jitter. */
  private handleClosed(): void {
    this.socket = null;
    this.closeRequestedAtMs = null;
    this.tradesAcked.clear();
    if (!this.running) return;
    this.reconnects += 1;
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempts) * (0.5 + Math.random());
    this.attempts += 1;
    this.reconnectTimer = (this.options.setTimeoutFn ?? setTimeout)(() => {
      this.reconnectTimer = null;
      this.connect();
    }, wait);
  }

  /** Abandon a socket that does not close or connect by itself, and reconnect. */
  private recycle(reason: string): void {
    const socket = this.socket;
    this.lastError = reason;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Already dead.
      }
    }
    this.handleClosed();
  }

  private onMessage(raw: unknown): void {
    const nowMs = this.options.now();
    this.lastMessageAtMs = nowMs;
    this.pingSentSinceMessage = false;
    if (typeof raw !== "string" || raw === "pong") return;
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(body)) return;
    if (body.event === "error") {
      const code = typeof body.code === "string" && /^\d{1,8}$/.test(body.code) ? body.code : "?";
      this.lastError = `okx_error:${code}`;
      return;
    }
    const arg = body.arg;
    if (body.event === "subscribe") {
      if (isRecord(arg) && arg.channel === "trades" && typeof arg.instId === "string" && this.memory.has(arg.instId)) this.tradesAcked.add(arg.instId);
      return;
    }
    if (!isRecord(arg) || typeof arg.channel !== "string" || typeof arg.instId !== "string" || !Array.isArray(body.data)) return;
    // Real data is what proves a connection is worth keeping: only now does the backoff start over.
    this.attempts = 0;
    const memory = this.memory.get(arg.instId);
    if (memory === undefined) return;

    for (const row of body.data) {
      if (!isRecord(row)) continue;
      if (arg.channel === "books5") {
        const bids = levels(row.bids);
        const asks = levels(row.asks);
        if (bids !== null && asks !== null && bids.length > 0 && asks.length > 0) memory.book = { bids, asks, receivedAtMs: nowMs };
      } else if (arg.channel === "trades") {
        const px = num(row.px);
        const sz = num(row.sz);
        if (px === null || sz === null || px <= 0 || sz <= 0 || (row.side !== "buy" && row.side !== "sell")) continue;
        memory.trades.push({ px, sz, side: row.side, receivedAtMs: nowMs });
      } else if (arg.channel === "tickers") {
        const last = num(row.last);
        if (last === null || last <= 0) continue;
        memory.ticker = { last, open24h: num(row.open24h), high24h: num(row.high24h), low24h: num(row.low24h), receivedAtMs: nowMs };
      }
    }
    if (arg.channel === "trades") this.pruneTrades(memory, nowMs);
  }

  private pruneTrades(memory: Memory, nowMs: number): void {
    let drop = 0;
    while (drop < memory.trades.length && nowMs - memory.trades[drop]!.receivedAtMs > TRADE_RETAIN_MS) drop += 1;
    if (memory.trades.length - drop > MAX_TRADES) drop = memory.trades.length - MAX_TRADES;
    if (drop > 0) memory.trades.splice(0, drop);
  }
}
