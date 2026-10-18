/**
 * Keyless client of the PUBLIC OKX Exchange v5 REST (no key, no signature, no account): instruments, funding, mark price,
 * ticker, candles, order book and open interest. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 9
 * (criteria D17, D18, D19).
 *
 * Same rules as the authenticated client: the network is an injected `fetch`, nothing is sent unless `allowNetwork` is
 * true, the rate is a token bucket with an injected clock (one request per second by default, five at most because the
 * strictest documented limit is 10 requests per 2 seconds), retries only for HTTP 429 and 5xx, strict envelope.
 * Only the paths `/api/v5/public/*` and `/api/v5/market/*` can be reached: account, trade and asset routes are refused.
 *
 * Numbers stay as EXACT DECIMAL TEXT validated by the same strict grammar the derivatives evaluator uses
 * (`parseDecimal` of src/okx-derivatives/decimal.ts); text that does not pass is null. `toNumber` converts on demand and
 * never turns null into zero. `buildDerivativesSnapshot` turns reads of this client into the snapshot of the evaluator
 * (`okx_derivatives_input_v1`); fees, maintenance margin and account access are NOT public data and stay unknown.
 */

import { cmp as compareRat, parseDecimal, sign, type Rat } from "../okx-derivatives/decimal.ts";
import { SCHEMA as DERIVATIVES_SCHEMA } from "../okx-derivatives/snapshot.ts";
import { OnchainosError } from "./errors.ts";
import {
  createTransport,
  QuotaCounters,
  resolveTuning,
  TokenBucket,
  validateOrigin,
  type EndpointRef,
  type FetchLike,
  type GetPort,
  type HttpInfo,
  type HttpTuning,
  type QueryInput,
} from "./http.ts";
import { collectPages, type Collected, type CollectOptions } from "./paging.ts";
import { mergeMeta, readGet, type Read } from "./read.ts";
import { asArray, asRecord, field, readCount, readEnum, readEpochMs, readFlag01, schemaFail, type DecimalText, type EpochMs } from "./values.ts";

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export const DEFAULT_PUBLIC_OKX_ORIGIN = "https://www.okx.com";
const PUBLIC_OKX_PATH_PATTERN = /^\/api\/v5\/(?:public|market)(?:\/[A-Za-z0-9_-]+)+$/;
/** The strictest documented limit is 10 requests per 2 seconds: 5 per second. */
const PUBLIC_MAX_REQUESTS_PER_SECOND = 5;

export interface PublicOkxHttpOptions extends HttpTuning {
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Must be exactly `true` for anything to be sent. */
  allowNetwork?: boolean;
  origin?: string;
  /** Source of the backoff jitter. Absent: the deterministic ceiling, no randomness. */
  random?: () => number;
}

export interface PublicHttp extends GetPort {
  readonly quota: QuotaCounters;
  readonly info: HttpInfo;
}

export function createPublicOkxHttp(options: PublicOkxHttpOptions): PublicHttp {
  const origin = validateOrigin(options.origin ?? DEFAULT_PUBLIC_OKX_ORIGIN);
  const tuning = resolveTuning(options, PUBLIC_MAX_REQUESTS_PER_SECOND);
  const limiter = new TokenBucket({ ratePerSecond: tuning.requestsPerSecond, burst: tuning.burst, now: options.now, sleep: options.sleep });
  const quota = options.quota ?? new QuotaCounters();
  const ready = options.allowNetwork === true;
  const transport = createTransport({
    source: "okx-public-v5",
    origin,
    pathPattern: PUBLIC_OKX_PATH_PATTERN,
    fetch: options.fetch,
    now: options.now,
    sleep: options.sleep,
    random: options.random,
    limiter,
    quota,
    canSend: () => ready,
    offlineDetail: "cliente público offline: falta allowNetwork true; nada foi enviado",
    secrets: [],
    timeoutMs: tuning.timeoutMs,
    maxRetries: tuning.maxRetries,
    backoffBaseMs: tuning.backoffBaseMs,
    backoffMaxMs: tuning.backoffMaxMs,
    maxResponseChars: tuning.maxResponseChars,
    onCall: options.onCall,
  });
  const info: HttpInfo = Object.freeze({
    source: "okx-public-v5" as const,
    origin,
    ready,
    requestsPerSecond: tuning.requestsPerSecond,
    burst: tuning.burst,
    timeoutMs: tuning.timeoutMs,
    maxRetries: tuning.maxRetries,
  });
  const client: PublicHttp = {
    get: (endpoint: EndpointRef, query?: QueryInput) => transport.request("GET", endpoint, query === undefined ? {} : { query }),
    quota,
    info,
  };
  return Object.freeze(client);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PublicInstType = "SPOT" | "SWAP";

export interface InstrumentRow {
  readonly instType: PublicInstType;
  readonly instId: string;
  readonly state: string | null;
  readonly baseCcy: string | null;
  readonly quoteCcy: string | null;
  readonly settleCcy: string | null;
  readonly ctValCcy: string | null;
  readonly ctType: "linear" | "inverse" | null;
  /** Face value of one contract: base currency for linear contracts, USD for inverse ones. */
  readonly ctVal: DecimalText | null;
  readonly ctMult: DecimalText | null;
  readonly tickSz: DecimalText | null;
  /** In contracts for derivatives, in base currency for spot. */
  readonly lotSz: DecimalText | null;
  readonly minSz: DecimalText | null;
  readonly maxLeverage: number | null;
  readonly listTimeMs: EpochMs | null;
  readonly expTimeMs: EpochMs | null;
}

export interface FundingRateRow {
  readonly instId: string;
  readonly method: "current_period" | "next_period" | null;
  /** FORECAST rate for the settlement at `fundingTimeMs`. Positive: longs pay shorts. */
  readonly fundingRate: DecimalText | null;
  /** Documented as no longer supported: empty in practice, so null. */
  readonly nextFundingRate: DecimalText | null;
  /** The pending settlement. */
  readonly fundingTimeMs: EpochMs | null;
  readonly nextFundingTimeMs: EpochMs | null;
  /** Present in real answers, not in the documentation. */
  readonly prevFundingTimeMs: EpochMs | null;
  /** 1, 2, 4 or 8 hours, derived from the times. Null when it cannot be derived or is any other value. */
  readonly intervalMs: number | null;
  readonly minFundingRate: DecimalText | null;
  readonly maxFundingRate: DecimalText | null;
  readonly premium: DecimalText | null;
  readonly settState: "processing" | "settled" | null;
  /** Rate used for the current cycle (processing) or the previous cycle (settled). */
  readonly settFundingRate: DecimalText | null;
  readonly tsMs: EpochMs | null;
}

export interface FundingHistoryRow {
  readonly fundingTimeMs: EpochMs;
  readonly fundingRate: DecimalText | null;
  /** The rate that was actually applied at that settlement. */
  readonly realizedRate: DecimalText | null;
  readonly method: "current_period" | "next_period" | null;
}

export interface MarkPriceRow {
  readonly instId: string;
  readonly markPx: DecimalText | null;
  readonly tsMs: EpochMs | null;
}

export interface TickerRow {
  readonly instId: string;
  readonly last: DecimalText | null;
  readonly askPx: DecimalText | null;
  readonly askSz: DecimalText | null;
  readonly bidPx: DecimalText | null;
  readonly bidSz: DecimalText | null;
  readonly open24h: DecimalText | null;
  readonly high24h: DecimalText | null;
  readonly low24h: DecimalText | null;
  /** Contracts for derivatives, base currency quantity for spot. */
  readonly vol24h: DecimalText | null;
  /** Base currency for derivatives, quote currency for spot. */
  readonly volCcy24h: DecimalText | null;
  readonly tsMs: EpochMs | null;
}

export interface PublicCandleRow {
  readonly startMs: EpochMs;
  readonly open: DecimalText | null;
  readonly high: DecimalText | null;
  readonly low: DecimalText | null;
  readonly close: DecimalText | null;
  /** Contracts for derivatives, base currency quantity for spot. */
  readonly vol: DecimalText | null;
  /** Base currency for derivatives, quote currency for spot. */
  readonly volCcy: DecimalText | null;
  readonly volCcyQuote: DecimalText | null;
  readonly confirmed: boolean;
}

export interface BookLevel {
  readonly price: DecimalText;
  /** Contracts for derivatives, base currency quantity for spot. */
  readonly size: DecimalText;
  readonly orders: number | null;
}

export interface BookSnapshot {
  readonly asks: BookLevel[];
  readonly bids: BookLevel[];
  readonly tsMs: EpochMs | null;
  readonly seqId: number | null;
  /** True when the best bid is at or above the best ask (documented to happen in the pre-open period). */
  readonly crossed: boolean;
}

export interface OpenInterestRow {
  readonly instId: string;
  /** Number of contracts. */
  readonly oi: DecimalText | null;
  /** Number of coins (base currency). */
  readonly oiCcy: DecimalText | null;
  readonly oiUsd: DecimalText | null;
  readonly tsMs: EpochMs | null;
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

const INST_ID = /^[A-Z0-9]{1,20}(?:-[A-Z0-9]{1,20}){1,3}$/;
const CURRENCY = /^[A-Z0-9]{1,20}$/;
const STATE = /^[a-z_]{1,32}$/;
const ALLOWED_INTERVALS_MS = [3_600_000, 7_200_000, 14_400_000, 28_800_000] as const;
const MAX_INSTRUMENTS = 5_000;
const MAX_BOOK_LEVELS = 400;

function readInstId(value: unknown): string | null {
  return typeof value === "string" && value.length <= 48 && INST_ID.test(value) ? value : null;
}

/** A decimal text that passes the strict grammar of the derivatives evaluator (signed). */
function readDecimalText(value: unknown): DecimalText | null {
  return parseDecimal(value) === null ? null : (value as string);
}

function readPositiveText(value: unknown): DecimalText | null {
  const parsed = parseDecimal(value);
  return parsed !== null && sign(parsed) > 0 ? (value as string) : null;
}

function readNonNegativeText(value: unknown): DecimalText | null {
  const parsed = parseDecimal(value);
  return parsed !== null && sign(parsed) >= 0 ? (value as string) : null;
}

/** Converts exact decimal text to a number on demand. Null stays null; it is never turned into zero. */
export function toNumber(text: DecimalText | null): number | null {
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function currency(value: unknown): string | null {
  return typeof value === "string" && CURRENCY.test(value) ? value : null;
}

function rowFor(data: unknown, instId: string, label: string): Record<string, unknown> {
  const rows = asArray(data, "data", 1);
  const first = rows[0];
  if (first === undefined) return schemaFail(`nenhuma linha de ${label}`);
  const record = asRecord(first, label, 0);
  if (readInstId(field(record, "instId")) !== instId) return schemaFail("instrumento fora do pedido", { rowIndex: 0 });
  return record;
}

// ---------------------------------------------------------------------------
// Parsers (pure)
// ---------------------------------------------------------------------------

export function parseInstruments(data: unknown, instType: PublicInstType, instId?: string): InstrumentRow[] {
  const rows = asArray(data, "data", instId === undefined ? MAX_INSTRUMENTS : 1);
  const seen = new Set<string>();
  return rows.map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const id = readInstId(field(record, "instId"));
    if (id === null || (instId !== undefined && id !== instId)) return schemaFail("instrumento fora do pedido", { rowIndex: index });
    if (field(record, "instType") !== instType) return schemaFail("tipo de instrumento fora do pedido", { rowIndex: index });
    if (seen.has(id)) return schemaFail("instrumento repetido", { rowIndex: index });
    seen.add(id);
    const state = field(record, "state");
    return {
      instType,
      instId: id,
      state: typeof state === "string" && STATE.test(state) ? state : null,
      baseCcy: currency(field(record, "baseCcy")),
      quoteCcy: currency(field(record, "quoteCcy")),
      settleCcy: currency(field(record, "settleCcy")),
      ctValCcy: currency(field(record, "ctValCcy")),
      ctType: readEnum(field(record, "ctType"), ["linear", "inverse"] as const),
      ctVal: readPositiveText(field(record, "ctVal")),
      ctMult: readPositiveText(field(record, "ctMult")),
      tickSz: readPositiveText(field(record, "tickSz")),
      lotSz: readPositiveText(field(record, "lotSz")),
      minSz: readPositiveText(field(record, "minSz")),
      maxLeverage: readCount(field(record, "lever")),
      listTimeMs: readEpochMs(field(record, "listTime")),
      expTimeMs: readEpochMs(field(record, "expTime")),
    };
  });
}

function allowedInterval(value: number | null): number | null {
  return value !== null && (ALLOWED_INTERVALS_MS as readonly number[]).includes(value) ? value : null;
}

export function parseFundingRate(data: unknown, instId: string): FundingRateRow {
  const record = rowFor(data, instId, "funding");
  const fundingTimeMs = readEpochMs(field(record, "fundingTime"));
  const nextFundingTimeMs = readEpochMs(field(record, "nextFundingTime"));
  const prevFundingTimeMs = readEpochMs(field(record, "prevFundingTime"));
  const fromNext = fundingTimeMs !== null && nextFundingTimeMs !== null ? allowedInterval(nextFundingTimeMs - fundingTimeMs) : null;
  const fromPrev = fundingTimeMs !== null && prevFundingTimeMs !== null ? allowedInterval(fundingTimeMs - prevFundingTimeMs) : null;
  return {
    instId,
    method: readEnum(field(record, "method"), ["current_period", "next_period"] as const),
    fundingRate: readDecimalText(field(record, "fundingRate")),
    nextFundingRate: readDecimalText(field(record, "nextFundingRate")),
    fundingTimeMs,
    nextFundingTimeMs,
    prevFundingTimeMs,
    intervalMs: fromNext ?? fromPrev,
    minFundingRate: readDecimalText(field(record, "minFundingRate")),
    maxFundingRate: readDecimalText(field(record, "maxFundingRate")),
    premium: readDecimalText(field(record, "premium")),
    settState: readEnum(field(record, "settState"), ["processing", "settled"] as const),
    settFundingRate: readDecimalText(field(record, "settFundingRate")),
    tsMs: readEpochMs(field(record, "ts")),
  };
}

export function parseFundingHistory(data: unknown, instId: string, maxRows: number): FundingHistoryRow[] {
  return asArray(data, "data", maxRows).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    if (readInstId(field(record, "instId")) !== instId) return schemaFail("instrumento fora do pedido", { rowIndex: index });
    const fundingTimeMs = readEpochMs(field(record, "fundingTime"));
    if (fundingTimeMs === null) return schemaFail("campo fundingTime ilegível", { rowIndex: index });
    return {
      fundingTimeMs,
      fundingRate: readDecimalText(field(record, "fundingRate")),
      realizedRate: readDecimalText(field(record, "realizedRate")),
      method: readEnum(field(record, "method"), ["current_period", "next_period"] as const),
    };
  });
}

export function parseMarkPrice(data: unknown, instId: string): MarkPriceRow {
  const record = rowFor(data, instId, "mark");
  return { instId, markPx: readPositiveText(field(record, "markPx")), tsMs: readEpochMs(field(record, "ts")) };
}

export function parseTicker(data: unknown, instId: string): TickerRow {
  const record = rowFor(data, instId, "ticker");
  return {
    instId,
    last: readPositiveText(field(record, "last")),
    askPx: readPositiveText(field(record, "askPx")),
    askSz: readNonNegativeText(field(record, "askSz")),
    bidPx: readPositiveText(field(record, "bidPx")),
    bidSz: readNonNegativeText(field(record, "bidSz")),
    open24h: readPositiveText(field(record, "open24h")),
    high24h: readPositiveText(field(record, "high24h")),
    low24h: readPositiveText(field(record, "low24h")),
    vol24h: readNonNegativeText(field(record, "vol24h")),
    volCcy24h: readNonNegativeText(field(record, "volCcy24h")),
    tsMs: readEpochMs(field(record, "ts")),
  };
}

function parseOpenInterest(data: unknown, instId: string): OpenInterestRow {
  const record = rowFor(data, instId, "interesse em aberto");
  return {
    instId,
    oi: readNonNegativeText(field(record, "oi")),
    oiCcy: readNonNegativeText(field(record, "oiCcy")),
    oiUsd: readNonNegativeText(field(record, "oiUsd")),
    tsMs: readEpochMs(field(record, "ts")),
  };
}

/** Rows `[ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]`, exactly nine columns. */
export function parsePublicCandles(data: unknown, maxRows: number): PublicCandleRow[] {
  return asArray(data, "data", maxRows).map((raw, index) => {
    if (!Array.isArray(raw) || raw.length !== 9) return schemaFail("esperada uma vela com 9 colunas [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]", { rowIndex: index });
    const startMs = readEpochMs(raw[0]);
    if (startMs === null) return schemaFail("coluna 0 (ts) ilegível", { rowIndex: index });
    const confirmed = readFlag01(raw[8]);
    if (confirmed === null) return schemaFail("coluna 8 (confirm) deve ser 0 ou 1", { rowIndex: index });
    return {
      startMs,
      open: readPositiveText(raw[1]),
      high: readPositiveText(raw[2]),
      low: readPositiveText(raw[3]),
      close: readPositiveText(raw[4]),
      vol: readNonNegativeText(raw[5]),
      volCcy: readNonNegativeText(raw[6]),
      volCcyQuote: readNonNegativeText(raw[7]),
      confirmed,
    };
  });
}

function readLevels(value: unknown, side: "asks" | "bids"): BookLevel[] {
  const levels = asArray(value, side, MAX_BOOK_LEVELS);
  let previous: Rat | null = null;
  return levels.map((raw, index) => {
    if (!Array.isArray(raw) || raw.length !== 4) return schemaFail(`nível de ${side} deve ter 4 colunas [preço, tamanho, "0", ordens]`, { rowIndex: index });
    const price = readPositiveText(raw[0]);
    if (price === null) return schemaFail(`preço do nível de ${side} ilegível`, { rowIndex: index });
    const size = readPositiveText(raw[1]);
    if (size === null) return schemaFail(`tamanho do nível de ${side} ilegível`, { rowIndex: index });
    const exact = parseDecimal(price) as Rat;
    if (previous !== null) {
      const order = compareRat(exact, previous);
      if (side === "asks" ? order <= 0 : order >= 0) return schemaFail(`níveis de ${side} fora de ordem ou repetidos`, { rowIndex: index });
    }
    previous = exact;
    return { price, size, orders: readCount(raw[3]) };
  });
}

export function parseBooks(data: unknown): BookSnapshot {
  const rows = asArray(data, "data", 1);
  const first = rows[0];
  if (first === undefined) return schemaFail("nenhuma linha de livro");
  const record = asRecord(first, "livro", 0);
  const asks = readLevels(field(record, "asks"), "asks");
  const bids = readLevels(field(record, "bids"), "bids");
  const bestAsk = asks[0];
  const bestBid = bids[0];
  const crossed = bestAsk !== undefined && bestBid !== undefined && compareRat(parseDecimal(bestBid.price) as Rat, parseDecimal(bestAsk.price) as Rat) >= 0;
  return { asks, bids, tsMs: readEpochMs(field(record, "ts")), seqId: readCount(field(record, "seqId")), crossed };
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const BARS = ["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "6H", "12H", "1D", "2D", "3D", "1W", "1M", "3M", "6Hutc", "12Hutc", "1Dutc", "2Dutc", "3Dutc", "1Wutc", "1Mutc", "3Mutc"] as const;
export type PublicBar = (typeof BARS)[number] | "1s";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Duration of one bar. Calendar months have no fixed duration and are null. */
export const PUBLIC_BAR_MS: Readonly<Record<PublicBar, number | null>> = Object.freeze({
  "1s": 1_000,
  "1m": MINUTE,
  "3m": 3 * MINUTE,
  "5m": 5 * MINUTE,
  "15m": 15 * MINUTE,
  "30m": 30 * MINUTE,
  "1H": HOUR,
  "2H": 2 * HOUR,
  "4H": 4 * HOUR,
  "6H": 6 * HOUR,
  "12H": 12 * HOUR,
  "1D": DAY,
  "2D": 2 * DAY,
  "3D": 3 * DAY,
  "1W": 7 * DAY,
  "1M": null,
  "3M": null,
  "6Hutc": 6 * HOUR,
  "12Hutc": 12 * HOUR,
  "1Dutc": DAY,
  "2Dutc": 2 * DAY,
  "3Dutc": 3 * DAY,
  "1Wutc": 7 * DAY,
  "1Mutc": null,
  "3Mutc": null,
});

const MAX_PUBLIC_CANDLES_PER_CALL = 300;
const MAX_BOOK_DEPTH = 400;
const MAX_FUNDING_HISTORY_PER_CALL = 400;
const DEFAULT_WALK_PAGE_SIZE = 100;

function instIdOrThrow(value: string, swapOnly = false): string {
  const instId = readInstId(value);
  if (instId === null) throw new OnchainosError("invalid_request", "instId inválido");
  if (swapOnly && !instId.endsWith("-SWAP")) throw new OnchainosError("invalid_request", "este endpoint é só para perpétuos (instId terminado em -SWAP)");
  return instId;
}

function integerInRange(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) throw new OnchainosError("invalid_request", `${name} deve ser um inteiro de ${minimum} a ${maximum}`);
  return value;
}

function millisecondBound(value: number | string, name: string): string {
  const text = typeof value === "number" ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : "") : value;
  if (!/^\d{1,16}$/.test(text)) throw new OnchainosError("invalid_request", `${name} deve ser um instante em milissegundos`);
  return text;
}

function checkedBar(bar: PublicBar | undefined, allowSecond: boolean): PublicBar | undefined {
  if (bar === undefined) return undefined;
  const known = (BARS as readonly string[]).includes(bar) || (allowSecond && bar === "1s");
  if (!known) throw new OnchainosError("invalid_request", "bar não documentado para este endpoint");
  return bar;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface CandlesQuery {
  bar?: PublicBar;
  /** 1 to 300. Default of the provider: 100. */
  limit?: number;
  /** Candles earlier than this bar opening time (ms). */
  after?: number | string;
  /** Candles newer than this bar opening time (ms). */
  before?: number | string;
}

export interface FundingHistoryQuery {
  /** 1 to 400. */
  limit?: number;
  /** Records newer than this fundingTime (ms). */
  before?: number | string;
  /** Records earlier than this fundingTime (ms). */
  after?: number | string;
}

export interface PublicOkxClient {
  instruments(query: { instType: PublicInstType; instId?: string }): Promise<Read<InstrumentRow[]>>;
  fundingRate(instId: string): Promise<Read<FundingRateRow>>;
  fundingRateHistory(instId: string, query?: FundingHistoryQuery): Promise<Read<FundingHistoryRow[]>>;
  fundingRateHistoryBackwards(instId: string, query: { limit?: number }, options: CollectOptions): Promise<Read<Collected<FundingHistoryRow>>>;
  markPrice(instId: string): Promise<Read<MarkPriceRow>>;
  ticker(instId: string): Promise<Read<TickerRow>>;
  candles(instId: string, query?: CandlesQuery): Promise<Read<PublicCandleRow[]>>;
  historyCandles(instId: string, query?: CandlesQuery): Promise<Read<PublicCandleRow[]>>;
  historyCandlesBackwards(instId: string, query: { bar?: PublicBar; limit?: number }, options: CollectOptions): Promise<Read<Collected<PublicCandleRow>>>;
  books(instId: string, query?: { sz?: number }): Promise<Read<BookSnapshot>>;
  openInterest(instId: string): Promise<Read<OpenInterestRow>>;
}

export function createPublicOkxClient(http: GetPort): PublicOkxClient {
  function candleParams(instId: string, query: CandlesQuery, allowSecond: boolean): { params: QueryInput; maxRows: number } {
    const id = instIdOrThrow(instId);
    const limit = query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_PUBLIC_CANDLES_PER_CALL);
    return {
      params: {
        instId: id,
        bar: checkedBar(query.bar, allowSecond),
        after: query.after === undefined ? undefined : millisecondBound(query.after, "after"),
        before: query.before === undefined ? undefined : millisecondBound(query.before, "before"),
        limit,
      },
      maxRows: limit ?? 100,
    };
  }

  function historyParams(instId: string, query: FundingHistoryQuery): { params: QueryInput; id: string; maxRows: number } {
    const id = instIdOrThrow(instId, true);
    const limit = query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_FUNDING_HISTORY_PER_CALL);
    return {
      id,
      params: {
        instId: id,
        before: query.before === undefined ? undefined : millisecondBound(query.before, "before"),
        after: query.after === undefined ? undefined : millisecondBound(query.after, "after"),
        limit,
      },
      maxRows: limit ?? MAX_FUNDING_HISTORY_PER_CALL,
    };
  }

  const fundingHistory = async (instId: string, query: FundingHistoryQuery): Promise<Read<FundingHistoryRow[]>> => {
    const { params, id, maxRows } = historyParams(instId, query);
    return readGet(http, "public.funding-rate-history", params, (data) => parseFundingHistory(data, id, maxRows));
  };

  const historyCandles = async (instId: string, query: CandlesQuery): Promise<Read<PublicCandleRow[]>> => {
    const { params, maxRows } = candleParams(instId, query, true);
    return readGet(http, "public.history-candles", params, (data) => parsePublicCandles(data, maxRows));
  };

  return {
    instruments: async (query) => {
      if (query.instType !== "SPOT" && query.instType !== "SWAP") throw new OnchainosError("invalid_request", "instType deve ser SPOT ou SWAP");
      const instId = query.instId === undefined ? undefined : instIdOrThrow(query.instId);
      return readGet(http, "public.instruments", { instType: query.instType, instId }, (data) => parseInstruments(data, query.instType, instId));
    },

    fundingRate: async (instId) => {
      const id = instIdOrThrow(instId, true);
      return readGet(http, "public.funding-rate", { instId: id }, (data) => parseFundingRate(data, id));
    },

    fundingRateHistory: fundingHistory,

    fundingRateHistoryBackwards: async (instId, query, options) => {
      const limit = query.limit ?? DEFAULT_WALK_PAGE_SIZE;
      const metas: Array<Read<unknown>["meta"]> = [];
      const collected = await collectPages<FundingHistoryRow>(async (cursor) => {
        const read = await fundingHistory(instId, { limit, ...(cursor === null ? {} : { after: cursor }) });
        metas.push(read.meta);
        let oldest: number | null = null;
        for (const row of read.value) oldest = oldest === null || row.fundingTimeMs < oldest ? row.fundingTimeMs : oldest;
        return { rows: read.value, nextCursor: read.value.length >= limit && oldest !== null ? String(oldest) : null };
      }, options);
      return { value: collected, meta: mergeMeta(metas) };
    },

    markPrice: async (instId) => {
      const id = instIdOrThrow(instId, true);
      return readGet(http, "public.mark-price", { instType: "SWAP", instId: id }, (data) => parseMarkPrice(data, id));
    },

    ticker: async (instId) => {
      const id = instIdOrThrow(instId);
      return readGet(http, "public.ticker", { instId: id }, (data) => parseTicker(data, id));
    },

    candles: async (instId, query = {}) => {
      const { params, maxRows } = candleParams(instId, query, false);
      return readGet(http, "public.candles", params, (data) => parsePublicCandles(data, maxRows));
    },

    historyCandles: (instId, query = {}) => historyCandles(instId, query),

    historyCandlesBackwards: async (instId, query, options) => {
      const limit = query.limit ?? DEFAULT_WALK_PAGE_SIZE;
      const metas: Array<Read<unknown>["meta"]> = [];
      const collected = await collectPages<PublicCandleRow>(async (cursor) => {
        const read = await historyCandles(instId, { ...(query.bar === undefined ? {} : { bar: query.bar }), limit, ...(cursor === null ? {} : { after: cursor }) });
        metas.push(read.meta);
        let oldest: number | null = null;
        for (const row of read.value) oldest = oldest === null || row.startMs < oldest ? row.startMs : oldest;
        return { rows: read.value, nextCursor: read.value.length >= limit && oldest !== null ? String(oldest) : null };
      }, options);
      const unique = new Map<number, PublicCandleRow>();
      for (const row of collected.rows) if (!unique.has(row.startMs)) unique.set(row.startMs, row);
      return { value: { ...collected, rows: [...unique.values()] }, meta: mergeMeta(metas) };
    },

    books: async (instId, query = {}) => {
      const id = instIdOrThrow(instId);
      const sz = query.sz === undefined ? undefined : integerInRange(query.sz, "sz", 1, MAX_BOOK_DEPTH);
      return readGet(http, "public.books", { instId: id, sz }, (data) => parseBooks(data));
    },

    openInterest: async (instId) => {
      const id = instIdOrThrow(instId, true);
      return readGet(http, "public.open-interest", { instType: "SWAP", instId: id }, (data) => parseOpenInterest(data, id));
    },
  };
}

// ---------------------------------------------------------------------------
// Bridge to the derivatives evaluator (src/okx-derivatives)
// ---------------------------------------------------------------------------

export interface DerivativesSnapshotInputs {
  readonly spot: InstrumentRow;
  readonly perp: InstrumentRow;
  readonly spotBook: BookSnapshot;
  readonly perpBook: BookSnapshot;
  readonly mark: MarkPriceRow;
  readonly funding: FundingRateRow;
  readonly history: readonly FundingHistoryRow[];
}

function need<T>(value: T | null | undefined, path: string): T {
  if (value === null || value === undefined) return schemaFail(`peça ausente para o avaliador de derivativos: ${path}`);
  return value;
}

/**
 * The `snapshot` object of `okx_derivatives_input_v1`, built only from public reads. Fees, maintenance margin rate and
 * account access are NOT public data: they are left out, so the evaluator reports them as unknown and unavailable.
 * Settlement history is oldest first, keeps only settlements that already happened (at or before the funding read) and
 * only those with a realized rate.
 */
export function buildDerivativesSnapshot(inputs: DerivativesSnapshotInputs): Record<string, unknown> {
  const { spot, perp, spotBook, perpBook, mark, funding } = inputs;
  if (spot.instType !== "SPOT") return schemaFail("spot deve ser um instrumento SPOT");
  if (perp.instType !== "SWAP") return schemaFail("perp deve ser um instrumento SWAP");
  const fundingTsMs = need(funding.tsMs, "funding.tsMs");
  const levels = (side: readonly BookLevel[]): string[][] => side.map((level) => [level.price, level.size]);

  const history: Array<{ fundingTimeMs: number; rate: string }> = [];
  const seen = new Set<number>();
  for (const row of [...inputs.history].sort((a, b) => a.fundingTimeMs - b.fundingTimeMs)) {
    if (row.realizedRate === null || row.fundingTimeMs > fundingTsMs || seen.has(row.fundingTimeMs)) continue;
    seen.add(row.fundingTimeMs);
    history.push({ fundingTimeMs: row.fundingTimeMs, rate: row.realizedRate });
  }

  return {
    spot: {
      instId: spot.instId,
      baseCcy: need(spot.baseCcy, "spot.baseCcy"),
      quoteCcy: need(spot.quoteCcy, "spot.quoteCcy"),
      tickSz: need(spot.tickSz, "spot.tickSz"),
      lotSz: need(spot.lotSz, "spot.lotSz"),
      minSz: need(spot.minSz, "spot.minSz"),
      state: need(spot.state, "spot.state"),
    },
    perp: {
      instId: perp.instId,
      ctType: need(perp.ctType, "perp.ctType"),
      ctVal: need(perp.ctVal, "perp.ctVal"),
      ctMult: need(perp.ctMult, "perp.ctMult"),
      ctValCcy: need(perp.ctValCcy, "perp.ctValCcy"),
      settleCcy: need(perp.settleCcy, "perp.settleCcy"),
      tickSz: need(perp.tickSz, "perp.tickSz"),
      lotSz: need(perp.lotSz, "perp.lotSz"),
      minSz: need(perp.minSz, "perp.minSz"),
      maxLeverage: need(perp.maxLeverage, "perp.maxLeverage"),
      state: need(perp.state, "perp.state"),
    },
    books: {
      spot: { tsMs: need(spotBook.tsMs, "books.spot.tsMs"), bids: levels(spotBook.bids), asks: levels(spotBook.asks) },
      perp: { tsMs: need(perpBook.tsMs, "books.perp.tsMs"), bids: levels(perpBook.bids), asks: levels(perpBook.asks) },
    },
    mark: { tsMs: need(mark.tsMs, "mark.tsMs"), markPx: need(mark.markPx, "mark.markPx") },
    funding: {
      tsMs: fundingTsMs,
      currentRate: need(funding.fundingRate, "funding.fundingRate"),
      fundingTimeMs: need(funding.fundingTimeMs, "funding.fundingTimeMs"),
      nextFundingTimeMs: need(funding.nextFundingTimeMs, "funding.nextFundingTimeMs"),
      history,
    },
  };
}

/** The full evaluator input. The `evaluation` (contracts, leverages, holding) is the operator's choice, not market data. */
export function buildDerivativesInput(snapshot: Record<string, unknown>, evaluation: Record<string, unknown>): Record<string, unknown> {
  return { schema: DERIVATIVES_SCHEMA, sourceClaim: "operator_claimed", snapshot, evaluation };
}
