/**
 * Strict parsers of the OKX public v5 payloads (REST and WebSocket share the same row shapes).
 *
 * Rules: numbers come from decimal STRINGS only and must be finite; empty text, NaN, Infinity, hex, spaces and
 * numeric JSON values are rejected. A field that cannot be parsed becomes `null` (optional fields) or rejects the
 * whole row (required fields). Nothing here ever turns garbage into 0.
 */

import type {
  DeskBar,
  DeskCandle,
  DeskInstrument,
  DeskInstType,
  DeskTicker,
  DeskTrade,
} from "./types";

const DECIMAL = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const DIGITS = /^\d{1,16}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict decimal parser: a string in plain or scientific decimal notation that evaluates to a finite number. */
export function parseNum(value: unknown): number | null {
  if (typeof value !== "string" || !DECIMAL.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

export function parsePositive(value: unknown): number | null {
  const n = parseNum(value);
  return n !== null && n > 0 ? n : null;
}

export function parseNonNegative(value: unknown): number | null {
  const n = parseNum(value);
  return n !== null && n >= 0 ? n : null;
}

/** Epoch milliseconds as digits text. Rejects zero, negatives, decimals and anything beyond the safe integer range. */
export function parseMs(value: unknown): number | null {
  if (typeof value !== "string" || !DIGITS.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Non negative integer carried as digits text (order counts). */
export function parseCountText(value: unknown): number | null {
  if (typeof value !== "string" || !DIGITS.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/** Integer carried as a JSON number (checksum, seqId). */
export function parseJsonInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Instrument ids and bars
// ---------------------------------------------------------------------------

export function instTypeOf(instId: string): DeskInstType {
  return instId.endsWith("-SWAP") ? "SWAP" : "SPOT";
}

export function baseOf(instId: string): string {
  const dash = instId.indexOf("-");
  return dash > 0 ? instId.slice(0, dash) : instId;
}

/** The perpetual used by the derivatives panel: `${base}-USDT-SWAP`. */
export function swapInstIdFor(instId: string): string {
  return `${baseOf(instId)}-USDT-SWAP`;
}

/** The spot pair whose index price stands for a swap: `${base}-USDT`. */
export function indexInstIdFor(instId: string): string {
  return `${baseOf(instId)}-USDT`;
}

export const BAR_MS: Readonly<Record<DeskBar, number>> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

export function candleChannel(bar: DeskBar): string {
  return `candle${bar}`;
}

export function barOfChannel(channel: string): DeskBar | null {
  if (!channel.startsWith("candle")) return null;
  const bar = channel.slice("candle".length);
  return Object.prototype.hasOwnProperty.call(BAR_MS, bar) ? (bar as DeskBar) : null;
}

// ---------------------------------------------------------------------------
// Row parsers
// ---------------------------------------------------------------------------

/** Row of REST `market/tickers`, `market/ticker` and of the WS `tickers` channel. Needs instId, last and ts. */
export function parseTicker(row: unknown): DeskTicker | null {
  if (!isRecord(row)) return null;
  const instId = nonEmptyText(row.instId);
  const last = parsePositive(row.last);
  const tsMs = parseMs(row.ts);
  if (instId === null || last === null || tsMs === null) return null;
  const isSwap = row.instType === "SWAP" || (row.instType === undefined && instTypeOf(instId) === "SWAP");
  return {
    instId,
    last,
    open24h: parsePositive(row.open24h),
    high24h: parsePositive(row.high24h),
    low24h: parsePositive(row.low24h),
    volBase24h: parseNonNegative(row.vol24h),
    // volCcy24h is the quote amount only for spot. For a swap OKX reports it in base currency, so it is not a quote volume.
    volQuote24h: isSwap ? null : parseNonNegative(row.volCcy24h),
    bidPx: parsePositive(row.bidPx),
    bidSz: parseNonNegative(row.bidSz),
    askPx: parsePositive(row.askPx),
    askSz: parseNonNegative(row.askSz),
    tsMs,
  };
}

/** Row of the WS `trades` channel. */
export function parseTradeRow(row: unknown): (DeskTrade & { readonly instId: string }) | null {
  if (!isRecord(row)) return null;
  const instId = nonEmptyText(row.instId);
  const id = nonEmptyText(row.tradeId);
  const px = parsePositive(row.px);
  const sz = parsePositive(row.sz);
  const tsMs = parseMs(row.ts);
  const side = row.side === "buy" || row.side === "sell" ? row.side : null;
  if (instId === null || id === null || px === null || sz === null || tsMs === null || side === null) return null;
  return { instId, id, px, sz, side, tsMs };
}

/**
 * Candle row `[ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]` (REST and WS).
 * For SPOT `vol` is the base quantity; for a SWAP `vol` is contracts and `volCcy` the base quantity, so `volBase`
 * takes the base quantity in both cases. `volQuote` is `volCcyQuote`.
 */
export function parseCandleRow(row: unknown, instType: DeskInstType): DeskCandle | null {
  if (!Array.isArray(row) || row.length < 9) return null;
  const tsMs = parseMs(row[0]);
  const open = parsePositive(row[1]);
  const high = parsePositive(row[2]);
  const low = parsePositive(row[3]);
  const close = parsePositive(row[4]);
  const volBase = parseNonNegative(instType === "SWAP" ? row[6] : row[5]);
  const volQuote = parseNonNegative(row[7]);
  const confirm = row[8];
  if (tsMs === null || open === null || high === null || low === null || close === null) return null;
  if (volBase === null || volQuote === null) return null;
  if (confirm !== "0" && confirm !== "1") return null;
  if (high < low || open > high || open < low || close > high || close < low) return null;
  return { tsMs, open, high, low, close, volBase, volQuote, confirmed: confirm === "1" };
}

export interface InstrumentRowInfo {
  readonly instrument: DeskInstrument;
  /** OKX lifecycle state, "live" when trading. */
  readonly state: string;
}

export function parseInstrumentRow(row: unknown): InstrumentRowInfo | null {
  if (!isRecord(row)) return null;
  const instId = nonEmptyText(row.instId);
  const instType = row.instType === "SPOT" || row.instType === "SWAP" ? row.instType : null;
  const state = nonEmptyText(row.state);
  const tickSz = parsePositive(row.tickSz) === null ? null : nonEmptyText(row.tickSz);
  const lotSz = parsePositive(row.lotSz) === null ? null : nonEmptyText(row.lotSz);
  if (instId === null || instType === null || state === null || tickSz === null || lotSz === null) return null;
  let base: string | null;
  let quote: string | null;
  if (instType === "SPOT") {
    base = nonEmptyText(row.baseCcy);
    quote = nonEmptyText(row.quoteCcy);
  } else {
    const family = typeof row.instFamily === "string" ? row.instFamily.split("-") : [];
    base = family.length === 2 && family[0] ? family[0] : nonEmptyText(row.ctValCcy);
    quote = family.length === 2 && family[1] ? family[1] : nonEmptyText(row.settleCcy);
  }
  if (base === null || quote === null) return null;
  return { instrument: { instId, instType, base, quote, tickSz, lotSz }, state };
}

export interface FundingUpdate {
  readonly instId: string;
  readonly fundingRate: number | null;
  /** The next settlement (OKX `fundingTime`). */
  readonly nextFundingTimeMs: number | null;
  readonly tsMs: number | null;
}

/** Row of REST `public/funding-rate` and of the WS `funding-rate` channel. */
export function parseFundingRow(row: unknown): FundingUpdate | null {
  if (!isRecord(row)) return null;
  const instId = nonEmptyText(row.instId);
  if (instId === null) return null;
  return {
    instId,
    fundingRate: parseNum(row.fundingRate),
    nextFundingTimeMs: parseMs(row.fundingTime),
    tsMs: parseMs(row.ts),
  };
}

export interface MarkPriceUpdate {
  readonly instId: string;
  readonly markPx: number | null;
  readonly tsMs: number | null;
}

export function parseMarkPriceRow(row: unknown): MarkPriceUpdate | null {
  if (!isRecord(row)) return null;
  const instId = nonEmptyText(row.instId);
  if (instId === null) return null;
  return { instId, markPx: parsePositive(row.markPx), tsMs: parseMs(row.ts) };
}

export interface OpenInterestUpdate {
  readonly instId: string;
  readonly openInterest: number | null;
  readonly openInterestUsd: number | null;
  readonly tsMs: number | null;
}

export function parseOpenInterestRow(row: unknown): OpenInterestUpdate | null {
  if (!isRecord(row)) return null;
  const instId = nonEmptyText(row.instId);
  if (instId === null) return null;
  return {
    instId,
    openInterest: parseNonNegative(row.oi),
    openInterestUsd: parseNonNegative(row.oiUsd),
    tsMs: parseMs(row.ts),
  };
}

export interface IndexPriceUpdate {
  /** The index pair, for example BTC-USDT. */
  readonly instId: string;
  readonly indexPx: number | null;
  readonly tsMs: number | null;
}

export function parseIndexTickerRow(row: unknown): IndexPriceUpdate | null {
  if (!isRecord(row)) return null;
  const instId = nonEmptyText(row.instId);
  if (instId === null) return null;
  return { instId, indexPx: parsePositive(row.idxPx), tsMs: parseMs(row.ts) };
}
