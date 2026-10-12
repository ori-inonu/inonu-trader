/**
 * Server side tape feed: the keyless OKX public WebSocket (books5, trades, tickers) plus small REST reads
 * (1 minute candles, perpetual funding, and top-5 book and ticker snapshots for quiet markets). It keeps rolling memory
 * per instrument and hands the reader a `TapeInput`.
 *
 * Provider timestamps establish source age; monotonic receipt clocks establish cache age and trade windows.
 * Trade retention is bounded by time and count. Records lost inside the flow window invalidate coverage, and
 * malformed relevant trade messages restart continuous observation. A quiet market requires an open current
 * socket, its subscription acknowledgment and a complete loss-free window. Failed REST refreshes preserve the
 * previous observation without refreshing its proof and report fixed status codes, never provider text.
 */

import type { FundingObservation, TapeCandle, TapeInput, TapeLevel, TapeTrade, ValueProof } from "./types";
import { FLOW_WINDOW_MS } from "./types";

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
  readonly monotonicNow?: () => number;
  readonly fundingMaxAgeMs?: number;
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
  book: { bids: TapeLevel[]; asks: TapeLevel[]; receivedAtMs: number; proof: ValueProof } | null;
  bookLastSourceTsMs: number | null;
  bookCaptureId: number;
  trades: TapeTrade[];
  tradesLostThroughMonoMs: number | null;
  tradesGapSinceMonoMs?: number;
  candles: TapeCandle[];
  ticker: TapeInput["ticker"];
  tickerLastSourceTsMs: number | null;
  tickerCaptureId: number;
  funding: FundingObservation | null;
  fundingCaptureId: number;
  fundingConflictTsMs: number | null;
  fundingLastSourceTsMs: number | null;
}

const DEFAULT_WS = "wss://ws.okx.com:8443/ws/v5/public";
const DEFAULT_REST = "https://www.okx.com";
/** Local policy, not an exchange freshness guarantee. */
export const DEFAULT_FUNDING_MAX_AGE_MS = 120_000;
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

/** Provider Unix milliseconds must be decimal digits, without numeric coercion. */
function sourceTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : null;
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
  private readonly options: Required<Pick<OkxTapeFeedOptions, "now" | "monotonicNow" | "wsUrl" | "restOrigin" | "fundingMaxAgeMs">> & OkxTapeFeedOptions;
  private readonly feedId = crypto.randomUUID();
  private feedEpoch = 0;
  private wsGeneration = 0;
  private captureId = 0;
  private readonly memory = new Map<string, Memory>();
  private readonly tradesAcked = new Set<string>();
  private readonly tradesAcknowledgedAt = new Map<string, number>();
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
    const fundingMaxAgeMs = options.fundingMaxAgeMs === undefined ? DEFAULT_FUNDING_MAX_AGE_MS : options.fundingMaxAgeMs;
    if (!Number.isSafeInteger(fundingMaxAgeMs) || fundingMaxAgeMs <= 0) throw new RangeError("fundingMaxAgeMs must be a positive safe integer");
    this.options = { ...options, fundingMaxAgeMs, now: options.now ?? Date.now, monotonicNow: options.monotonicNow ?? (() => performance.now()), wsUrl: options.wsUrl ?? DEFAULT_WS, restOrigin: options.restOrigin ?? DEFAULT_REST };
    for (const instId of options.instIds) this.memory.set(instId, { book: null, bookLastSourceTsMs: null, bookCaptureId: 0, trades: [], tradesLostThroughMonoMs: null, candles: [], ticker: null, tickerLastSourceTsMs: null, tickerCaptureId: 0, funding: null, fundingCaptureId: 0, fundingConflictTsMs: null, fundingLastSourceTsMs: null });
  }

  start(): void {
    if (this.running) return;
    this.feedEpoch += 1;
    for (const memory of this.memory.values()) {
      memory.book = null;
      memory.bookLastSourceTsMs = null;
      memory.bookCaptureId = 0;
      memory.ticker = null;
      memory.tickerLastSourceTsMs = null;
      memory.tickerCaptureId = 0;
      memory.funding = null;
      memory.fundingConflictTsMs = null;
      memory.fundingLastSourceTsMs = null;
    }
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.feedEpoch += 1;
    for (const memory of this.memory.values()) {
      memory.trades = [];
      memory.tradesLostThroughMonoMs = null;
      memory.tradesGapSinceMonoMs = undefined;
      memory.book = null;
      memory.bookLastSourceTsMs = null;
      memory.bookCaptureId = 0;
      memory.ticker = null;
      memory.tickerLastSourceTsMs = null;
      memory.tickerCaptureId = 0;
      memory.funding = null;
      memory.fundingConflictTsMs = null;
      memory.fundingLastSourceTsMs = null;
    }
    this.running = false;
    if (this.reconnectTimer !== null) (this.options.clearTimeoutFn ?? clearTimeout)(this.reconnectTimer as never);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.tradesAcked.clear();
    this.tradesAcknowledgedAt.clear();
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
    const monotonicNowMs = this.options.monotonicNow();
    this.pruneTrades(memory, monotonicNowMs);
    const acknowledgedAtMonoMs = this.tradesAcknowledgedAt.get(instId);
    const socketOpen = this.socket !== null && this.socket.readyState === WS_OPEN;
    return {
      instId,
      feedId: this.feedId,
      feedEpoch: this.feedEpoch,
      monotonicNowMs,
      nowMs,
      exchangeNowMs,
      fundingMaxAgeMs: this.options.fundingMaxAgeMs,
      tradesLive: this.socket !== null && this.socket.readyState === WS_OPEN && this.tradesAcked.has(instId),
      coverage: acknowledgedAtMonoMs === undefined ? null : {
        feedId: this.feedId, feedEpoch: this.feedEpoch, instId, wsGeneration: this.wsGeneration,
        source: "ws_trades", acknowledgedAtMonoMs, continuousSinceMonoMs: Math.max(acknowledgedAtMonoMs, memory.tradesGapSinceMonoMs ?? acknowledgedAtMonoMs),
        observedThroughMonoMs: monotonicNowMs, socketOpen, lostThroughMonoMs: memory.tradesLostThroughMonoMs,
      },
      wsGeneration: this.wsGeneration,
      book: memory.book ? { bids: memory.book.bids.map((level) => ({ ...level })), asks: memory.book.asks.map((level) => ({ ...level })), receivedAtMs: memory.book.receivedAtMs, proof: { ...memory.book.proof } } : null,
      trades: memory.trades.map((trade) => ({ ...trade, proof: { ...trade.proof } })),
      candles: memory.candles.map((candle) => ({ ...candle, proof: { ...candle.proof } })),
      ticker: memory.ticker ? { ...memory.ticker, proof: { ...memory.ticker.proof } } : null,
      funding: memory.funding ? { ...memory.funding, proof: { ...memory.funding.proof } } : null,
    };
  }

  /** Maximum source/cache age; unknown provenance or clocks require refresh. Wall time is diagnostic only. */
  ages(instId: string, _wallNowMs: number, exchangeNowMs: number | null): { bookAgeMs: number | null; tickerAgeMs: number | null } {
    const memory = this.memory.get(instId);
    const monotonicNowMs = this.options.monotonicNow();
    const age = (proof: ValueProof | undefined, kind: "book" | "ticker"): number | null => {
      if (!proof || proof.feedId !== this.feedId || proof.feedEpoch !== this.feedEpoch ||
        !Number.isSafeInteger(proof.captureId) || proof.captureId <= 0 || proof.forSpotInstId !== instId ||
        proof.requestedInstId !== instId || !Number.isSafeInteger(proof.sourceTsMs) || proof.sourceTsMs < 0 ||
        !Number.isSafeInteger(proof.receivedAtMs) || proof.receivedAtMs < 0 ||
        !Number.isFinite(proof.receivedAtMonoMs) || proof.receivedAtMonoMs < 0 ||
        !Number.isFinite(monotonicNowMs) || monotonicNowMs < 0 ||
        exchangeNowMs === null || !Number.isFinite(exchangeNowMs) || exchangeNowMs < 0 || exchangeNowMs > Number.MAX_SAFE_INTEGER) return null;
      if (proof.source === (kind === "book" ? "rest_book" : "rest_ticker")) {
        if (proof.wsGeneration !== null || (proof.reportedInstId !== instId && (kind !== "book" || proof.reportedInstId !== null))) return null;
      } else if (proof.source === (kind === "book" ? "ws_books5" : "ws_tickers")) {
        if (proof.wsGeneration !== this.wsGeneration || proof.reportedInstId !== instId) return null;
      } else return null;
      const sourceAge = exchangeNowMs - proof.sourceTsMs;
      const cacheAge = monotonicNowMs - proof.receivedAtMonoMs;
      return sourceAge < 0 || cacheAge < 0 ? null : Math.max(sourceAge, cacheAge);
    };
    return {
      bookAgeMs: age(memory?.book?.proof, "book"),
      tickerAgeMs: age(memory?.ticker?.proof, "ticker"),
    };
  }

  /** A fresh top-5 snapshot over REST. books5 only pushes on change, so an illiquid market can be silent yet current. */
  async refreshBook(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    const feedEpoch = this.feedEpoch;
    const captureId = ++this.captureId;
    try {
      const body = await this.get(`/api/v5/market/books?instId=${instId}&sz=5`);
      if (feedEpoch !== this.feedEpoch) return;
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      const row: unknown = rows?.[0];
      const bids = isRecord(row) ? levels(row.bids) : null;
      const asks = isRecord(row) ? levels(row.asks) : null;
      const sourceTsMs = isRecord(row) ? sourceTimestamp(row.ts) : null;
      if (isRecord(row) && "instId" in row && row.instId !== instId) throw new Error("row");
      if (bids === null || asks === null || bids.length === 0 || asks.length === 0 || sourceTsMs === null) throw new Error("row");
      const receivedAtMs = this.options.now();
      this.acceptBook(memory, { bids, asks, receivedAtMs, proof: { feedId: this.feedId, feedEpoch, captureId,
        forSpotInstId: instId, requestedInstId: instId, reportedInstId: isRecord(row) && row.instId === instId ? instId : null, source: "rest_book", wsGeneration: null,
        sourceTsMs, receivedAtMs, receivedAtMonoMs: this.options.monotonicNow() } });
    } catch {
      if (feedEpoch !== this.feedEpoch) return;
      this.lastError = `book_refresh_failed:${instId}`;
    }
  }

  async refreshTicker(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    const feedEpoch = this.feedEpoch;
    const captureId = ++this.captureId;
    try {
      const body = await this.get(`/api/v5/market/ticker?instId=${instId}`);
      if (feedEpoch !== this.feedEpoch) return;
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      const row: unknown = rows?.[0];
      const last = isRecord(row) ? num(row.last) : null;
      const sourceTsMs = isRecord(row) ? sourceTimestamp(row.ts) : null;
      if (!isRecord(row) || row.instId !== instId || last === null || last <= 0 || sourceTsMs === null) throw new Error("row");
      const receivedAtMs = this.options.now();
      this.acceptTicker(memory, { last, open24h: num(row.open24h), high24h: num(row.high24h), low24h: num(row.low24h), receivedAtMs,
        proof: { feedId: this.feedId, feedEpoch, captureId, forSpotInstId: instId, requestedInstId: instId,
          reportedInstId: instId, source: "rest_ticker", wsGeneration: null, sourceTsMs, receivedAtMs,
          receivedAtMonoMs: this.options.monotonicNow() } });
    } catch {
      if (feedEpoch !== this.feedEpoch) return;
      this.lastError = `ticker_refresh_failed:${instId}`;
    }
  }

  async refreshCandles(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    const feedEpoch = this.feedEpoch;
    const captureId = ++this.captureId;
    try {
      const body = await this.get(`/api/v5/market/candles?instId=${instId}&bar=1m&limit=60`);
      if (feedEpoch !== this.feedEpoch) return;
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      if (rows === null) throw new Error("envelope");
      const receivedAtMs = this.options.now();
      const receivedAtMonoMs = this.options.monotonicNow();
      const parsed: TapeCandle[] = [];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 9) throw new Error("row");
        const ts = sourceTimestamp(row[0]);
        const close = num(row[4]);
        if (ts === null || close === null || close <= 0) throw new Error("row");
        parsed.push({ tsMs: ts, close, confirmed: row[8] === "1", proof: {
          feedId: this.feedId, feedEpoch, captureId, forSpotInstId: instId, requestedInstId: instId,
          reportedInstId: null, source: "rest_candles_1m", wsGeneration: null,
          sourceTsMs: ts, receivedAtMs, receivedAtMonoMs,
        } });
      }
      memory.candles = parsed.sort((a, b) => a.tsMs - b.tsMs);
    } catch {
      if (feedEpoch !== this.feedEpoch) return;
      this.lastError = `candles_refresh_failed:${instId}`;
    }
  }

  async refreshFunding(instId: string): Promise<void> {
    const memory = this.memory.get(instId);
    if (memory === undefined) return;
    const captureId = ++this.captureId;
    const feedEpoch = this.feedEpoch;
    try {
      const body = await this.get(`/api/v5/public/funding-rate?instId=${instId}-SWAP`);
      if (feedEpoch !== this.feedEpoch || captureId < memory.fundingCaptureId) return;
      memory.fundingCaptureId = captureId;
      const rows = isRecord(body) && body.code === "0" && Array.isArray(body.data) ? body.data : null;
      const row: unknown = rows?.[0];
      const sourceTsMs = isRecord(row) ? sourceTimestamp(row.ts) : null;
      const rate = isRecord(row) ? num(row.fundingRate) : null;
      const previous = memory.funding;
      if (isRecord(row) && row.instId === `${instId}-SWAP` && rate !== null &&
        previous === null && memory.fundingLastSourceTsMs !== null && sourceTsMs !== null &&
        sourceTsMs <= memory.fundingLastSourceTsMs) return;
      if (memory.fundingConflictTsMs !== null && sourceTsMs !== null &&
        sourceTsMs <= memory.fundingConflictTsMs) return;
      if (isRecord(row) && row.instId === `${instId}-SWAP` && previous !== null &&
        sourceTsMs !== null && rate !== null && sourceTsMs < previous.proof.sourceTsMs) return;
      if (isRecord(row) && row.instId === `${instId}-SWAP` && previous !== null &&
        sourceTsMs === previous.proof.sourceTsMs && rate === previous.rate &&
        sourceTimestamp(row.fundingTime) === previous.fundingTimeMs &&
        sourceTimestamp(row.nextFundingTime) === previous.nextFundingTimeMs) return;
      if (isRecord(row) && row.instId === `${instId}-SWAP` && rate !== null &&
        previous !== null && sourceTsMs === previous.proof.sourceTsMs) {
        memory.fundingConflictTsMs = sourceTsMs;
        memory.funding = null;
        return;
      }
      memory.funding = isRecord(row) && row.instId === `${instId}-SWAP` && sourceTsMs !== null && rate !== null
        ? { rate, fundingTimeMs: sourceTimestamp(row.fundingTime), nextFundingTimeMs: sourceTimestamp(row.nextFundingTime),
          proof: { feedId: this.feedId, feedEpoch, captureId, forSpotInstId: instId, requestedInstId: `${instId}-SWAP`,
            reportedInstId: row.instId, source: "rest_funding", wsGeneration: null, sourceTsMs,
            receivedAtMs: this.options.now(), receivedAtMonoMs: this.options.monotonicNow() } }
        : null;
      if (memory.funding !== null) {
        memory.fundingConflictTsMs = null;
        memory.fundingLastSourceTsMs = memory.funding.proof.sourceTsMs;
      }
    } catch {
      if (feedEpoch !== this.feedEpoch || captureId < memory.fundingCaptureId) return;
      memory.fundingCaptureId = captureId;
      memory.funding = null;
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
    this.wsGeneration += 1;
    const feedEpoch = this.feedEpoch;
    const ownsConnection = () => this.running && this.socket === socket && this.feedEpoch === feedEpoch;
    this.socket = socket;
    this.connectStartedAtMs = this.options.now();
    this.closeRequestedAtMs = null;
    for (const memory of this.memory.values()) {
      memory.trades = [];
      memory.tradesLostThroughMonoMs = null;
      memory.tradesGapSinceMonoMs = undefined;
    }
    this.tradesAcked.clear();
    this.tradesAcknowledgedAt.clear();
    socket.onopen = () => {
      if (!ownsConnection()) return;
      this.lastMessageAtMs = this.options.now();
      this.pingSentSinceMessage = false;
      const args = this.options.instIds.flatMap((instId) => [
        { channel: "books5", instId },
        { channel: "trades", instId },
        { channel: "tickers", instId },
      ]);
      socket.send(JSON.stringify({ op: "subscribe", args }));
    };
    socket.onmessage = (event) => {
      if (!ownsConnection()) return;
      this.onMessage(event.data);
    };
    socket.onerror = () => {
      if (!ownsConnection()) return;
      this.lastError = "socket_error";
    };
    socket.onclose = () => {
      if (ownsConnection()) this.handleClosed();
    };
  }

  /** The socket is gone. Schedule a reconnect with exponential backoff and jitter. */
  private handleClosed(): void {
    this.socket = null;
    this.closeRequestedAtMs = null;
    this.tradesAcked.clear();
    this.tradesAcknowledgedAt.clear();
    if (!this.running) return;
    this.reconnects += 1;
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempts) * (0.5 + Math.random());
    this.attempts += 1;
    const feedEpoch = this.feedEpoch;
    const timer = (this.options.setTimeoutFn ?? setTimeout)(() => {
      if (!this.running || this.feedEpoch !== feedEpoch || this.reconnectTimer !== timer || this.socket !== null) return;
      this.reconnectTimer = null;
      this.connect();
    }, wait);
    this.reconnectTimer = timer;
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
      if (isRecord(arg) && arg.channel === "trades" && typeof arg.instId === "string" && this.memory.has(arg.instId) &&
        this.socket?.readyState === WS_OPEN && !this.tradesAcked.has(arg.instId)) {
        this.tradesAcked.add(arg.instId);
        this.tradesAcknowledgedAt.set(arg.instId, this.options.monotonicNow());
      }
      return;
    }
    if (!isRecord(arg) || typeof arg.channel !== "string" || typeof arg.instId !== "string") return;
    // Real data is what proves a connection is worth keeping: only now does the backoff start over.
    this.attempts = 0;
    const memory = this.memory.get(arg.instId);
    if (memory === undefined) return;
    const captureId = ++this.captureId;
    const receivedAtMonoMs = this.options.monotonicNow();
    if (!Array.isArray(body.data)) {
      if (arg.channel === "trades") this.recordTradeGap(memory, receivedAtMonoMs);
      return;
    }

    for (const row of body.data) {
      if (!isRecord(row)) {
        if (arg.channel === "trades") this.recordTradeGap(memory, receivedAtMonoMs);
        continue;
      }
      if (arg.channel === "books5") {
        if ("instId" in row && row.instId !== arg.instId) continue;
        const bids = levels(row.bids);
        const asks = levels(row.asks);
        const sourceTsMs = sourceTimestamp(row.ts);
        if (bids !== null && asks !== null && bids.length > 0 && asks.length > 0 && sourceTsMs !== null) this.acceptBook(memory, { bids, asks, receivedAtMs: nowMs,
          proof: { feedId: this.feedId, feedEpoch: this.feedEpoch, captureId, forSpotInstId: arg.instId,
            requestedInstId: arg.instId, reportedInstId: arg.instId, source: "ws_books5", wsGeneration: this.wsGeneration,
            sourceTsMs, receivedAtMs: nowMs, receivedAtMonoMs } });
      } else if (arg.channel === "trades") {
        if ("instId" in row && row.instId !== arg.instId) {
          this.recordTradeGap(memory, receivedAtMonoMs);
          continue;
        }
        const px = num(row.px);
        const sz = num(row.sz);
        const sourceTsMs = sourceTimestamp(row.ts);
        if (px === null || sz === null || px <= 0 || sz <= 0 || sourceTsMs === null || (row.side !== "buy" && row.side !== "sell")) {
          this.recordTradeGap(memory, receivedAtMonoMs);
          continue;
        }
        memory.trades.push({ px, sz, side: row.side, receivedAtMs: nowMs,
          proof: { feedId: this.feedId, feedEpoch: this.feedEpoch, captureId, forSpotInstId: arg.instId,
            requestedInstId: arg.instId, reportedInstId: arg.instId, source: "ws_trades", wsGeneration: this.wsGeneration,
            sourceTsMs, receivedAtMs: nowMs, receivedAtMonoMs } });
      } else if (arg.channel === "tickers") {
        if ("instId" in row && row.instId !== arg.instId) continue;
        const last = num(row.last);
        const sourceTsMs = sourceTimestamp(row.ts);
        if (last === null || last <= 0 || sourceTsMs === null) continue;
        this.acceptTicker(memory, { last, open24h: num(row.open24h), high24h: num(row.high24h), low24h: num(row.low24h), receivedAtMs: nowMs,
          proof: { feedId: this.feedId, feedEpoch: this.feedEpoch, captureId, forSpotInstId: arg.instId,
            requestedInstId: arg.instId, reportedInstId: arg.instId, source: "ws_tickers", wsGeneration: this.wsGeneration,
            sourceTsMs, receivedAtMs: nowMs, receivedAtMonoMs } });
      }
    }
    if (arg.channel === "trades") this.pruneTrades(memory, receivedAtMonoMs);
  }

  private acceptTicker(memory: Memory, incoming: NonNullable<Memory["ticker"]>): void {
    if (incoming.proof.captureId < memory.tickerCaptureId) return;
    memory.tickerCaptureId = incoming.proof.captureId;
    const sourceTsMs = incoming.proof.sourceTsMs;
    if (memory.tickerLastSourceTsMs !== null && sourceTsMs < memory.tickerLastSourceTsMs) return;
    if (sourceTsMs === memory.tickerLastSourceTsMs) {
      const previous = memory.ticker;
      if (previous === null) return;
      if (previous.last !== incoming.last || previous.open24h !== incoming.open24h ||
          previous.high24h !== incoming.high24h || previous.low24h !== incoming.low24h) memory.ticker = null;
      return;
    }
    memory.tickerLastSourceTsMs = sourceTsMs;
    memory.ticker = incoming;
  }

  private acceptBook(memory: Memory, incoming: NonNullable<Memory["book"]>): void {
    if (incoming.proof.captureId < memory.bookCaptureId) return;
    memory.bookCaptureId = incoming.proof.captureId;
    const sourceTsMs = incoming.proof.sourceTsMs;
    if (memory.bookLastSourceTsMs !== null && sourceTsMs < memory.bookLastSourceTsMs) return;
    if (sourceTsMs === memory.bookLastSourceTsMs) {
      const previous = memory.book;
      if (previous === null) return;
      const sameLevels = (a: TapeLevel[], b: TapeLevel[]) => a.length === b.length &&
        a.every((level, index) => level.px === b[index]!.px && level.sz === b[index]!.sz);
      if (!sameLevels(previous.bids, incoming.bids) || !sameLevels(previous.asks, incoming.asks)) memory.book = null;
      return;
    }
    memory.bookLastSourceTsMs = sourceTsMs;
    memory.book = incoming;
  }

  private recordTradeGap(memory: Memory, nowMonoMs: number): void {
    memory.tradesGapSinceMonoMs = nowMonoMs;
    memory.tradesLostThroughMonoMs = Math.max(memory.tradesLostThroughMonoMs ?? nowMonoMs, nowMonoMs);
  }

  private pruneTrades(memory: Memory, nowMonoMs: number): void {
    let drop = 0;
    while (drop < memory.trades.length && nowMonoMs - memory.trades[drop]!.proof.receivedAtMonoMs > TRADE_RETAIN_MS) drop += 1;
    if (memory.trades.length - drop > MAX_TRADES) drop = memory.trades.length - MAX_TRADES;
    for (let index = 0; index < drop; index += 1) {
      const receipt = memory.trades[index]!.proof.receivedAtMonoMs;
      const age = nowMonoMs - receipt;
      if (age >= 0 && age <= FLOW_WINDOW_MS) memory.tradesLostThroughMonoMs = Math.max(memory.tradesLostThroughMonoMs ?? receipt, receipt);
    }
    if (drop > 0) memory.trades.splice(0, drop);
  }
}
