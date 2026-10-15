/**
 * The free public OKX REST reads that "Pedir ao Inonu" makes at the moment of a click (no credential, no signature, no cost
 * on the OnchainOS quota): the instrument's metadata, the closed one minute candles and the latest trades with the
 * aggressor side. Strict about what comes back: anything that is not the documented shape is dropped and counted, or is an
 * error with a CONSTANT code that never carries the provider's text. Time-bounded, and cancellable by the click.
 */
import { parseDec } from "../intel/decimal";
import type { AnalystCandle } from "../intel/analyst";
import type { InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";

export class OkxPublicError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type InstType = "SPOT" | "SWAP" | "FUTURES";

/** SPOT is `BASE-QUOTE`, a perpetual `BASE-QUOTE-SWAP`, a future `BASE-QUOTE-YYMMDD`. Options and anything else are null. */
export function instTypeOf(instId: string): InstType | null {
  if (/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/.test(instId)) return "SPOT";
  if (/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}-SWAP$/.test(instId)) return "SWAP";
  if (/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}-\d{6}$/.test(instId)) return "FUTURES";
  return null;
}

export interface OkxPublic {
  /** Perpetuals only (T5.10, family E7). Optional so a fake of the other reads does not have to carry them. */
  fundingRate?(instId: string, signal?: AbortSignal): Promise<{ readonly rate: number; readonly nextRate: number | null; readonly fundingTimeMs: number }>;
  openInterest?(instId: string, signal?: AbortSignal): Promise<{ readonly oiUsd: number; readonly oiCcy: number; readonly tsMs: number }>;
  instrument(instId: string, signal?: AbortSignal): Promise<InstrumentMeta>;
  /** Closed candles of one minute, oldest first. */
  candles(instId: string, limit: number, signal?: AbortSignal): Promise<AnalystCandle[]>;
  /** The latest trades, oldest first, with how many rows were not usable. */
  trades(instId: string, limit: number, signal?: AbortSignal): Promise<{ trades: Trade[]; rejected: number }>;
}

const DEFAULT_BASE = "https://www.okx.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_CANDLES = 300;
const MAX_TRADES = 500;

const positiveDecimal = (text: unknown): text is string => {
  if (typeof text !== "string") return false;
  const value = parseDec(text);
  return value !== null && value.int > 0n;
};

export function createOkxPublic(options: { readonly fetch?: typeof fetch; readonly baseUrl?: string; readonly timeoutMs?: number } = {}): OkxPublic {
  const send = options.fetch ?? fetch;
  const base = options.baseUrl ?? DEFAULT_BASE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function get(path: string, query: Record<string, string>, outer?: AbortSignal): Promise<unknown[]> {
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
      if (response.status !== 200) throw new OkxPublicError("http_error");
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
  }

  const need = (instId: string): InstType => {
    const type = instTypeOf(instId);
    if (type === null) throw new OkxPublicError("instrument_unsupported");
    return type;
  };

  const needSwap = (instId: string): void => {
    if (instTypeOf(instId) !== "SWAP") throw new OkxPublicError("instrument_unsupported");
  };
  const finiteDecimal = (text: unknown): number | null => {
    if (typeof text !== "string" || !/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  };

  return {
    async fundingRate(instId, signal) {
      needSwap(instId);
      const rows = await get("/api/v5/public/funding-rate", { instId }, signal);
      const row = rows[0] as Record<string, unknown> | undefined;
      const rate = finiteDecimal(row?.fundingRate);
      if (row === undefined || row.instId !== instId || rate === null || typeof row.fundingTime !== "string" || !/^\d{1,15}$/.test(row.fundingTime)) throw new OkxPublicError("funding_invalid");
      return { rate, nextRate: finiteDecimal(row.nextFundingRate), fundingTimeMs: Number(row.fundingTime) };
    },

    async openInterest(instId, signal) {
      needSwap(instId);
      const rows = await get("/api/v5/public/open-interest", { instType: "SWAP", instId }, signal);
      const row = rows[0] as Record<string, unknown> | undefined;
      const oiUsd = finiteDecimal(row?.oiUsd);
      const oiCcy = finiteDecimal(row?.oiCcy);
      if (row === undefined || row.instId !== instId || oiUsd === null || oiUsd < 0 || oiCcy === null || oiCcy < 0 || typeof row.ts !== "string" || !/^\d{1,15}$/.test(row.ts)) throw new OkxPublicError("oi_invalid");
      return { oiUsd, oiCcy, tsMs: Number(row.ts) };
    },

    async instrument(instId, signal) {
      const type = need(instId);
      const rows = await get("/api/v5/public/instruments", { instType: type, instId }, signal);
      const row = rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) throw new OkxPublicError("instrument_not_found");
      if (row.instId !== instId || row.instType !== type || !positiveDecimal(row.tickSz) || !positiveDecimal(row.lotSz)) throw new OkxPublicError("instrument_invalid");
      if (row.state !== "live") throw new OkxPublicError("instrument_not_live");
      const meta = { instId, instType: type, tickSz: row.tickSz, lotSz: row.lotSz } as const;
      if (type === "SPOT") return meta;
      if (!positiveDecimal(row.ctVal) || !positiveDecimal(row.ctMult)) throw new OkxPublicError("instrument_invalid");
      // the unit is lot x contract value x multiplier IN THE BASE COIN: that holds for a linear contract, where the value is in the coin; an
      // inverse contract (BTC-USD-SWAP) has its value in dollars, and its units would be read as coins
      if (row.ctType === "inverse") throw new OkxPublicError("instrument_unsupported");
      return { ...meta, ctVal: row.ctVal, ctMult: row.ctMult };
    },

    async candles(instId, limit, signal) {
      need(instId);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CANDLES) throw new OkxPublicError("bad_limit");
      const rows = await get("/api/v5/market/candles", { instId, bar: "1m", limit: String(limit) }, signal);
      const out: AnalystCandle[] = [];
      let usable = 0;
      for (const raw of rows) {
        if (!Array.isArray(raw) || raw.length < 9) continue;
        const [ts, open, high, low, close, , , , confirm] = raw as unknown[];
        if (typeof ts !== "string" || !/^\d{1,15}$/.test(ts) || !positiveDecimal(open) || !positiveDecimal(high) || !positiveDecimal(low) || !positiveDecimal(close)) continue;
        if (Number(high) < Number(low)) continue;
        usable += 1;
        if (confirm === "1") out.push({ ts: Number(ts), open, high, low, close });
      }
      if (rows.length > 0 && usable === 0) throw new OkxPublicError("candles_invalid");
      return out.sort((a, b) => a.ts - b.ts);
    },

    async trades(instId, limit, signal) {
      need(instId);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TRADES) throw new OkxPublicError("bad_limit");
      const rows = await get("/api/v5/market/trades", { instId, limit: String(limit) }, signal);
      const trades: Trade[] = [];
      let rejected = 0;
      for (const raw of rows) {
        const row = raw as Record<string, unknown> | null;
        if (row === null || typeof row !== "object" || (row.side !== "buy" && row.side !== "sell") || !positiveDecimal(row.px) || !positiveDecimal(row.sz) || typeof row.ts !== "string" || !/^\d{1,15}$/.test(row.ts)) {
          rejected += 1;
          continue;
        }
        trades.push({ ts: Number(row.ts), px: row.px, sz: row.sz, side: row.side });
      }
      return { trades: trades.sort((a, b) => a.ts - b.ts), rejected };
    },
  };
}
