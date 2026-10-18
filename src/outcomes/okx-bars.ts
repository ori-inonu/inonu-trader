/**
 * Free public OKX reads of the recorder (INT-0.5): bars of 5 minutes, 15 minutes, 1 hour and 4 hours with the confirmation flag
 * and the volume, the price and spread of the order book top, and the older bars that the backfill pages through. No credential,
 * no signature, no OnchainOS quota. Requests are spaced (the public limit is 20 per 2 seconds on these routes), every answer is
 * checked against the documented shape, and a failure is a CONSTANT code that never carries the provider's text.
 */
import type { Bar, Interval } from "../intel/features/types";
import { OkxPublicError } from "../inonu/okx-public";

const BAR_PARAM: Readonly<Record<Interval, string>> = { "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H" };
const DEFAULT_BASE = "https://www.okx.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_SPACING_MS = 150;
export const MAX_BARS = 300;
export const MAX_HISTORY_BARS = 100;

export interface Quote {
  readonly last: number;
  readonly bid: number;
  readonly ask: number;
  /** (bid + ask) / 2: the price a snapshot is taken at. */
  readonly mid: number;
  readonly spreadBps: number;
}

export interface OkxBars {
  /** The latest bars, oldest first, with `confirmed` as the exchange says. */
  bars(instId: string, interval: Interval, limit: number, signal?: AbortSignal): Promise<Bar[]>;
  /** Bars that opened before `beforeMs`, oldest first (the backfill pages backwards with this). */
  history(instId: string, interval: Interval, beforeMs: number, limit: number, signal?: AbortSignal): Promise<Bar[]>;
  quote(instId: string, signal?: AbortSignal): Promise<Quote>;
}

export interface OkxBarsOptions {
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly spacingMs?: number;
  /** Test seam: waits. Default: the runtime's timer. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly monotonic?: () => number;
}

const positive = (text: unknown): number | null => {
  if (typeof text !== "string" || !/^\d+(\.\d+)?(e-?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function parseBars(rows: readonly unknown[]): Bar[] {
  const out: Bar[] = [];
  let usable = 0;
  for (const raw of rows) {
    if (!Array.isArray(raw) || raw.length < 9) continue;
    const [ts, open, high, low, close, volume, , , confirm] = raw as unknown[];
    if (typeof ts !== "string" || !/^\d{1,15}$/.test(ts)) continue;
    const o = positive(open);
    const h = positive(high);
    const l = positive(low);
    const c = positive(close);
    const v = typeof volume === "string" && /^\d+(\.\d+)?(e-?\d+)?$/i.test(volume) ? Number(volume) : null;
    if (o === null || h === null || l === null || c === null || v === null || h < l) continue;
    usable += 1;
    out.push({ ts: Number(ts), open: o, high: h, low: l, close: c, volume: v, confirmed: confirm === "1" });
  }
  if (rows.length > 0 && usable === 0) throw new OkxPublicError("bars_invalid");
  return out.sort((a, b) => a.ts - b.ts);
}

export function createOkxBars(options: OkxBarsOptions = {}): OkxBars {
  const send = options.fetch ?? fetch;
  const base = options.baseUrl ?? DEFAULT_BASE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spacing = options.spacingMs ?? DEFAULT_SPACING_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const mono = options.monotonic ?? (() => performance.now());

  // one request at a time, at least `spacing` apart: the recorder and the backfill share it
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;
  const spaced = <T>(job: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      const wait = lastStart + spacing - mono();
      if (wait > 0) await sleep(wait);
      lastStart = mono();
      return job();
    });
    chain = run.catch(() => undefined);
    return run;
  };

  function get(path: string, query: Record<string, string>, outer?: AbortSignal): Promise<unknown[]> {
    return spaced(async () => {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onOuter = () => controller.abort();
      outer?.addEventListener("abort", onOuter, { once: true });
      if (outer?.aborted) controller.abort();
      try {
        let response: Response;
        try {
          response = await send(`${base}${path}?${new URLSearchParams(query).toString()}`, { signal: controller.signal });
        } catch {
          throw new OkxPublicError(outer?.aborted ? "aborted" : timedOut ? "timeout" : "network");
        }
        if (response.status !== 200) throw new OkxPublicError(response.status === 429 ? "rate_limited" : "http_error");
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new OkxPublicError(outer?.aborted ? "aborted" : timedOut ? "timeout" : "bad_json");
        }
        const envelope = body as { code?: unknown; data?: unknown } | null;
        if (envelope === null || typeof envelope !== "object" || envelope.code !== "0") throw new OkxPublicError("okx_error");
        if (!Array.isArray(envelope.data)) throw new OkxPublicError("bad_shape");
        return envelope.data;
      } finally {
        clearTimeout(timer);
        outer?.removeEventListener("abort", onOuter);
      }
    });
  }

  const checkId = (instId: string): void => {
    if (!/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}(-SWAP)?$/.test(instId)) throw new OkxPublicError("instrument_unsupported");
  };
  const checkLimit = (limit: number, max: number): void => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > max) throw new OkxPublicError("bad_limit");
  };

  return {
    async bars(instId, interval, limit, signal) {
      checkId(instId);
      checkLimit(limit, MAX_BARS);
      return parseBars(await get("/api/v5/market/candles", { instId, bar: BAR_PARAM[interval], limit: String(limit) }, signal));
    },
    async history(instId, interval, beforeMs, limit, signal) {
      checkId(instId);
      checkLimit(limit, MAX_HISTORY_BARS);
      if (!Number.isSafeInteger(beforeMs) || beforeMs <= 0) throw new OkxPublicError("bad_cursor");
      return parseBars(await get("/api/v5/market/history-candles", { instId, bar: BAR_PARAM[interval], after: String(beforeMs), limit: String(limit) }, signal));
    },
    async quote(instId, signal) {
      checkId(instId);
      const rows = await get("/api/v5/market/ticker", { instId }, signal);
      const row = rows[0] as Record<string, unknown> | undefined;
      const last = positive(row?.last);
      const bid = positive(row?.bidPx);
      const ask = positive(row?.askPx);
      if (row === undefined || row.instId !== instId || last === null || bid === null || ask === null || bid > ask) throw new OkxPublicError("quote_invalid");
      const mid = (bid + ask) / 2;
      return { last, bid, ask, mid, spreadBps: ((ask - bid) / mid) * 10_000 };
    },
  };
}
