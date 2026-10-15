/**
 * The free public OKX reads of the opportunity engine: every spot ticker at once and the daily candles of a pair. No credential, no signature, no cost on the OnchainOS quota.
 * Strict about what comes back: a row that is not the documented shape is dropped and counted, never repaired, and a failure is an error with a CONSTANT code that never carries the
 * provider's text. Time-bounded, cancellable, and paced: one request at least `minGapMs` after the last, so a scan of a hundred pairs stays under the public limit of the exchange.
 */
import type { DayCandle } from "./factors";

export class OpportunityDataError extends Error {
  constructor(readonly code: "network" | "timeout" | "http" | "shape" | "cancelled") {
    super(code);
  }
}

export interface Ticker {
  readonly instId: string;
  readonly last: number;
  readonly open24h: number | null;
  readonly high24h: number | null;
  readonly low24h: number | null;
  /** Quote volume of the last 24 hours, in dollars for a pair against USDT. */
  readonly volQuote24h: number;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly tsMs: number;
}

export interface OkxDaily {
  /** Every spot pair against USDT. */
  tickers(signal?: AbortSignal): Promise<{ readonly tickers: Ticker[]; readonly rejected: number }>;
  /** The latest daily candles of a pair, oldest first, the last one possibly still forming (100 at most). */
  daily(instId: string, signal?: AbortSignal): Promise<{ readonly candles: DayCandle[]; readonly rejected: number }>;
  /** Older daily candles: those that closed before `beforeTsMs`, oldest first (100 at most per call). */
  history(instId: string, beforeTsMs: number, signal?: AbortSignal): Promise<{ readonly candles: DayCandle[]; readonly rejected: number }>;
}

const DEFAULT_BASE = "https://www.okx.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_GAP_MS = 130;
const PAIR = /^[A-Z0-9]{1,20}-USDT$/;

const num = (v: unknown): number | null => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const positive = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

export function createOkxDaily(options: { readonly fetch?: typeof fetch; readonly baseUrl?: string; readonly timeoutMs?: number; readonly minGapMs?: number; readonly sleep?: (ms: number) => Promise<void> } = {}): OkxDaily {
  const send = options.fetch ?? fetch;
  const base = options.baseUrl ?? DEFAULT_BASE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gap = options.minGapMs ?? DEFAULT_GAP_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastAt = 0;
  // requests leave one after the other even when several callers ask at once
  let queue: Promise<unknown> = Promise.resolve();

  async function pace(): Promise<void> {
    const wait = lastAt + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
  }

  async function get(path: string, query: Record<string, string>, outer?: AbortSignal): Promise<unknown[]> {
    const turn = queue.then(pace, pace);
    queue = turn.catch(() => undefined);
    await turn;
    if (outer?.aborted) throw new OpportunityDataError("cancelled");
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onOuter = () => controller.abort();
    outer?.addEventListener("abort", onOuter, { once: true });
    try {
      const response = await send(`${base}${path}?${new URLSearchParams(query).toString()}`, { signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new OpportunityDataError("http");
      const body: unknown = await response.json();
      const data = typeof body === "object" && body !== null ? (body as { code?: unknown; data?: unknown }) : null;
      if (data === null || data.code !== "0" || !Array.isArray(data.data)) throw new OpportunityDataError("shape");
      return data.data;
    } catch (error) {
      if (error instanceof OpportunityDataError) throw error;
      if (timedOut) throw new OpportunityDataError("timeout");
      if (outer?.aborted) throw new OpportunityDataError("cancelled");
      throw new OpportunityDataError("network");
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    }
  }

  const candlesOf = (rows: unknown[]): { candles: DayCandle[]; rejected: number } => {
    const candles: DayCandle[] = [];
    let rejected = 0;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 8) {
        rejected += 1;
        continue;
      }
      const ts = num(row[0]);
      const open = positive(row[1]);
      const high = positive(row[2]);
      const low = positive(row[3]);
      const close = positive(row[4]);
      // index 7 is the volume in the quote currency; the field is absent or zero for a day with no trade
      const volQuote = num(row[7]);
      if (ts === null || open === null || high === null || low === null || close === null || volQuote === null || volQuote < 0 || high < low) {
        rejected += 1;
        continue;
      }
      candles.push({ ts, open, high, low, close, volQuote });
    }
    // the exchange sends newest first
    return { candles: candles.sort((a, b) => a.ts - b.ts), rejected };
  };

  const checkPair = (instId: string) => {
    if (!PAIR.test(instId)) throw new OpportunityDataError("shape");
  };

  return {
    async tickers(signal) {
      const rows = await get("/api/v5/market/tickers", { instType: "SPOT" }, signal);
      const tickers: Ticker[] = [];
      let rejected = 0;
      for (const row of rows) {
        const r = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null;
        const instId = typeof r?.instId === "string" ? r.instId : "";
        // a pair against another quote is not this engine's universe: it is skipped, not counted as broken
        if (!instId.endsWith("-USDT")) continue;
        const last = positive(r?.last);
        const volQuote24h = num(r?.volCcy24h);
        const tsMs = num(r?.ts);
        if (!PAIR.test(instId) || last === null || volQuote24h === null || volQuote24h < 0 || tsMs === null) {
          rejected += 1;
          continue;
        }
        tickers.push({ instId, last, open24h: positive(r?.open24h), high24h: positive(r?.high24h), low24h: positive(r?.low24h), volQuote24h, bid: positive(r?.bidPx), ask: positive(r?.askPx), tsMs });
      }
      return { tickers, rejected };
    },
    async daily(instId, signal) {
      checkPair(instId);
      return candlesOf(await get("/api/v5/market/candles", { instId, bar: "1D", limit: "100" }, signal));
    },
    async history(instId, beforeTsMs, signal) {
      checkPair(instId);
      return candlesOf(await get("/api/v5/market/history-candles", { instId, bar: "1D", limit: "100", after: String(Math.trunc(beforeTsMs)) }, signal));
    },
  };
}
