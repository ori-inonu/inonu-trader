/**
 * Onchain OS Market: batch price, current and historical index price, candles and trades.
 * Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 7.1 (criteria D9, D10, D11, D19).
 *
 * Read only. Pages read: market-price, index-price, historical-index-price, market-candlesticks,
 * market-candlesticks-history, market-trades, market-price-chains. NOT declared by any of them: the currency of `price`
 * and of the candle prices, the order of the rows, a request rate limit. Those stay unknown and are labelled in the types.
 *
 * Free text (token symbols, DEX names, logos, URLs) and wallet addresses of third parties are dropped by the parsers.
 */

import { OnchainosError } from "./errors.ts";
import type { Collected, CollectOptions } from "./paging.ts";
import { collectPages } from "./paging.ts";
import type { OnchainosHttp, QueryInput } from "./http.ts";
import { mergeMeta, readGet, readPost, type Read } from "./read.ts";
import {
  asArray,
  asRecord,
  field,
  normaliseTokenRef,
  normaliseTokenRefs,
  readBoolean,
  readChainIndex,
  readChainRows,
  readEnum,
  readEpochMs,
  readFlag01,
  readNonNegative,
  readOpaqueId,
  readPositive,
  readTokenAddress,
  schemaFail,
  tokenKey,
  type AmountUnitUnknown,
  type ChainRow,
  type EpochMs,
  type PriceQuoteUnknown,
  type TokenRef,
  type UsdAmount,
} from "./values.ts";

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

export const BARS = ["1s", "1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "6H", "12H", "1D", "1W", "1M", "3M", "6Hutc", "12Hutc", "1Dutc", "1Wutc", "1Mutc", "3Mutc"] as const;
export type Bar = (typeof BARS)[number];

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Duration of one bar. Calendar months (1M, 3M) have no fixed duration and are null. */
export const BAR_MS: Readonly<Record<Bar, number | null>> = Object.freeze({
  "1s": SECOND,
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
  "1W": 7 * DAY,
  "1M": null,
  "3M": null,
  "6Hutc": 6 * HOUR,
  "12Hutc": 12 * HOUR,
  "1Dutc": DAY,
  "1Wutc": 7 * DAY,
  "1Mutc": null,
  "3Mutc": null,
});

export const MAX_CANDLES_PER_CALL = 299;
export const DEFAULT_CANDLES_PER_CALL = 100;
export const MAX_TRADES_PER_CALL = 500;
export const DEFAULT_TRADES_PER_CALL = 100;
export const MAX_TOKENS_PER_PRICE_CALL = 100;
export const MAX_INDEX_POINTS_PER_CALL = 200;
export const DEFAULT_INDEX_POINTS_PER_CALL = 50;
export const INDEX_PERIODS = ["1m", "5m", "30m", "1h", "1d"] as const;
export type IndexPeriod = (typeof INDEX_PERIODS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceRow {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
  readonly timeMs: EpochMs | null;
  /** The currency of this price is NOT declared by the documentation. */
  readonly price: PriceQuoteUnknown | null;
}

export interface PricesResult {
  readonly rows: PriceRow[];
  /** Requested identities the provider did not answer. They are absent, never a row of zeros. */
  readonly missing: TokenRef[];
}

export interface CandleRow {
  /** Opening instant of the bar. */
  readonly startMs: EpochMs;
  /** The currency of the four prices is NOT declared by the documentation. */
  readonly open: PriceQuoteUnknown | null;
  readonly high: PriceQuoteUnknown | null;
  readonly low: PriceQuoteUnknown | null;
  readonly close: PriceQuoteUnknown | null;
  /** Declared as "base currency unit"; the decimals convention is not stated. */
  readonly volumeBase: AmountUnitUnknown | null;
  readonly volumeUsd: UsdAmount | null;
  /** True: the bar is closed. False: still forming. */
  readonly confirmed: boolean;
}

export interface ChangedToken {
  readonly amount: AmountUnitUnknown | null;
  readonly tokenContractAddress: string | null;
}

export interface TradeRow {
  readonly id: string;
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
  readonly side: "buy" | "sell" | null;
  readonly price: PriceQuoteUnknown | null;
  readonly volumeUsd: UsdAmount | null;
  readonly timeMs: EpochMs;
  /** True: the trade was filtered out of the price and candle calculation by the provider. */
  readonly isFiltered: boolean | null;
  readonly changedTokens: ChangedToken[];
}

export interface IndexPoint {
  readonly timeMs: EpochMs;
  /** 18 decimal places, currency NOT declared. */
  readonly price: PriceQuoteUnknown | null;
}

export interface IndexHistoryPage {
  readonly cursor: string | null;
  readonly points: IndexPoint[];
}

export interface CandleQuery {
  chainIndex: string;
  tokenContractAddress: string;
  bar?: Bar;
  /** From 1 to 299 (documented ceiling). Default of the provider: 100. */
  limit?: number;
  /** Candles earlier than this bar opening time (ms). */
  after?: number | string;
  /** Candles newer than this bar opening time (ms). */
  before?: number | string;
}

export interface TradesQuery {
  chainIndex: string;
  tokenContractAddress: string;
  /** Opaque trade id: trades earlier than it. */
  after?: string;
  /** From 1 to 500 (documented ceiling). Default of the provider: 100. */
  limit?: number;
  /** 1 KOL, 2 developer, 3 smart money, 4 whale, 5 new wallet, 6 suspicious, 7 sniper, 8 suspected phishing, 9 bundle. */
  tagFilter?: number;
}

export interface IndexHistoryQuery {
  chainIndex: string;
  /** Empty string is the native token. Omitted is the same, per the page. */
  tokenContractAddress?: string;
  limit?: number;
  cursor?: string;
  begin?: number | string;
  end?: number | string;
  period?: IndexPeriod;
}

// ---------------------------------------------------------------------------
// Parsers (pure)
// ---------------------------------------------------------------------------

/** Rows of a price answer. The identity of each row must be one that was requested and appear once. */
export function parsePrices(data: unknown, requested: readonly TokenRef[]): PricesResult {
  const rows = asArray(data, "data", requested.length);
  const wanted = new Set(requested.map(tokenKey));
  const seen = new Set<string>();
  const parsed: PriceRow[] = rows.map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const chainIndex = readChainIndex(field(record, "chainIndex"));
    const tokenContractAddress = readTokenAddress(field(record, "tokenContractAddress"), { allowNative: true });
    if (chainIndex === null || tokenContractAddress === null) return schemaFail("identidade do token ilegível", { rowIndex: index });
    const key = tokenKey({ chainIndex, tokenContractAddress });
    if (!wanted.has(key)) return schemaFail("identidade fora do pedido", { rowIndex: index });
    if (seen.has(key)) return schemaFail("identidade repetida", { rowIndex: index });
    seen.add(key);
    return { chainIndex, tokenContractAddress, timeMs: readEpochMs(field(record, "time")), price: readPositive(field(record, "price")) };
  });
  return { rows: parsed, missing: requested.filter((ref) => !seen.has(tokenKey(ref))) };
}

/** Rows `[ts, o, h, l, c, vol, volUsd, confirm]`, exactly eight columns. `ts` and `confirm` are required; the rest may be null. */
export function parseCandles(data: unknown, maxRows: number): CandleRow[] {
  const rows = asArray(data, "data", maxRows);
  return rows.map((raw, index) => {
    if (!Array.isArray(raw) || raw.length !== 8) return schemaFail("esperada uma vela com 8 colunas [ts, o, h, l, c, vol, volUsd, confirm]", { rowIndex: index });
    const startMs = readEpochMs(raw[0]);
    if (startMs === null) return schemaFail("coluna 0 (ts) ilegível", { rowIndex: index });
    const confirmed = readFlag01(raw[7]);
    if (confirmed === null) return schemaFail("coluna 7 (confirm) deve ser 0 ou 1", { rowIndex: index });
    return {
      startMs,
      open: readPositive(raw[1]),
      high: readPositive(raw[2]),
      low: readPositive(raw[3]),
      close: readPositive(raw[4]),
      volumeBase: readNonNegative(raw[5]),
      volumeUsd: readNonNegative(raw[6]),
      confirmed,
    };
  });
}

export interface TradesContext extends TokenRef {
  maxRows: number;
}

export function parseTrades(data: unknown, context: TradesContext): TradeRow[] {
  const rows = asArray(data, "data", context.maxRows);
  return rows.map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const id = readOpaqueId(field(record, "id"));
    if (id === null) return schemaFail("id da negociação ilegível", { rowIndex: index });
    const timeMs = readEpochMs(field(record, "time"));
    if (timeMs === null) return schemaFail("time da negociação ilegível", { rowIndex: index });
    const chainIndex = readChainIndex(field(record, "chainIndex"));
    const tokenContractAddress = readTokenAddress(field(record, "tokenContractAddress"));
    if (chainIndex !== context.chainIndex || tokenContractAddress !== context.tokenContractAddress) return schemaFail("identidade fora do pedido", { rowIndex: index });
    const changed = field(record, "changedTokenInfo");
    const changedTokens: ChangedToken[] = Array.isArray(changed)
      ? changed.slice(0, 10).map((item): ChangedToken => {
          const entry = typeof item === "object" && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
          return { amount: readNonNegative(field(entry, "amount")), tokenContractAddress: readTokenAddress(field(entry, "tokenContractAddress")) };
        })
      : [];
    return {
      id,
      chainIndex,
      tokenContractAddress,
      side: readEnum(field(record, "type"), ["buy", "sell"] as const),
      price: readPositive(field(record, "price")),
      volumeUsd: readNonNegative(field(record, "volume")),
      timeMs,
      isFiltered: readFlag01(field(record, "isFiltered")) ?? readBoolean(field(record, "isFiltered")),
      changedTokens,
    };
  });
}

export function parseIndexHistory(data: unknown, maxPoints: number): IndexHistoryPage {
  const pages = asArray(data, "data", 1);
  const first = pages[0];
  if (first === undefined) return { cursor: null, points: [] };
  const page = asRecord(first, "página", 0);
  const prices = field(page, "prices");
  const rows = prices === undefined ? [] : asArray(prices, "prices", maxPoints);
  const points = rows.map((raw, index): IndexPoint => {
    const record = asRecord(raw, "ponto", index);
    const timeMs = readEpochMs(field(record, "time"));
    if (timeMs === null) return schemaFail("time do ponto ilegível", { rowIndex: index });
    return { timeMs, price: readPositive(field(record, "price")) };
  });
  const cursor = field(page, "cursor");
  return { cursor: cursor === undefined || cursor === null || cursor === "" ? null : readOpaqueId(cursor), points };
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

function integerInRange(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new OnchainosError("invalid_request", `${name} deve ser um inteiro de ${minimum} a ${maximum}`);
  }
  return value;
}

/** A millisecond bound given as a safe integer or a digit string. */
function millisecondBound(value: number | string, name: string): string {
  const text = typeof value === "number" ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : "") : value;
  if (!/^\d{1,16}$/.test(text)) throw new OnchainosError("invalid_request", `${name} deve ser um instante em milissegundos`);
  return text;
}

function candleQuery(query: CandleQuery): QueryInput {
  const token = normaliseTokenRef({ chainIndex: query.chainIndex, tokenContractAddress: query.tokenContractAddress });
  if (query.bar !== undefined && !(BARS as readonly string[]).includes(query.bar)) throw new OnchainosError("invalid_request", "bar não documentado");
  return {
    chainIndex: token.chainIndex,
    tokenContractAddress: token.tokenContractAddress,
    bar: query.bar,
    limit: query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_CANDLES_PER_CALL),
    after: query.after === undefined ? undefined : millisecondBound(query.after, "after"),
    before: query.before === undefined ? undefined : millisecondBound(query.before, "before"),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface MarketPriceClient {
  supportedChains(): Promise<Read<ChainRow[]>>;
  prices(tokens: readonly TokenRef[]): Promise<Read<PricesResult>>;
  indexPrices(tokens: readonly TokenRef[]): Promise<Read<PricesResult>>;
  candles(query: CandleQuery): Promise<Read<CandleRow[]>>;
  historicalCandles(query: CandleQuery): Promise<Read<CandleRow[]>>;
  /** Walks candles into the past with `after`, bounded by pages and rows, without duplicates. */
  candlesBackwards(query: CandleQuery, options: CollectOptions): Promise<Read<Collected<CandleRow>>>;
  trades(query: TradesQuery): Promise<Read<TradeRow[]>>;
  historicalIndexPrice(query: IndexHistoryQuery): Promise<Read<IndexHistoryPage>>;
}

export function createMarketPriceClient(http: OnchainosHttp): MarketPriceClient {
  async function candles(id: "market.price.candles" | "market.price.historical-candles", query: CandleQuery): Promise<Read<CandleRow[]>> {
    const params = candleQuery(query);
    return readGet(http, id, params, (data) => parseCandles(data, query.limit ?? DEFAULT_CANDLES_PER_CALL));
  }

  return {
    supportedChains: () => readGet(http, "market.price.supported-chains", undefined, (data) => readChainRows(data)),

    prices: async (tokens) => {
      const refs = normaliseTokenRefs(tokens, { max: MAX_TOKENS_PER_PRICE_CALL });
      return readPost(http, "market.price.price", refs, (data) => parsePrices(data, refs));
    },

    indexPrices: async (tokens) => {
      const refs = normaliseTokenRefs(tokens, { max: MAX_TOKENS_PER_PRICE_CALL, allowNative: true });
      return readPost(http, "market.index.current-price", refs, (data) => parsePrices(data, refs));
    },

    candles: (query) => candles("market.price.candles", query),
    historicalCandles: (query) => candles("market.price.historical-candles", query),

    candlesBackwards: async (query, options) => {
      const limit = query.limit ?? DEFAULT_CANDLES_PER_CALL;
      const metas: Read<unknown>["meta"][] = [];
      const collected = await collectPages<CandleRow>(async (cursor) => {
        const read = await candles("market.price.candles", { ...query, limit, ...(cursor === null ? {} : { after: cursor }) });
        metas.push(read.meta);
        let oldest: number | null = null;
        for (const row of read.value) oldest = oldest === null || row.startMs < oldest ? row.startMs : oldest;
        return { rows: read.value, nextCursor: read.value.length >= limit && oldest !== null ? String(oldest) : null };
      }, options);
      const unique = new Map<number, CandleRow>();
      for (const row of collected.rows) if (!unique.has(row.startMs)) unique.set(row.startMs, row);
      return { value: { ...collected, rows: [...unique.values()] }, meta: mergeMeta(metas) };
    },

    trades: async (query) => {
      const token = normaliseTokenRef({ chainIndex: query.chainIndex, tokenContractAddress: query.tokenContractAddress });
      const limit = query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_TRADES_PER_CALL);
      const tagFilter = query.tagFilter === undefined ? undefined : integerInRange(query.tagFilter, "tagFilter", 1, 9);
      let after: string | undefined;
      if (query.after !== undefined) {
        const id = readOpaqueId(query.after);
        if (id === null) throw new OnchainosError("invalid_request", "after deve ser o id opaco de uma negociação");
        after = id;
      }
      return readGet(http, "market.price.trades", { chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress, after, limit, tagFilter }, (data) =>
        parseTrades(data, { ...token, maxRows: limit ?? DEFAULT_TRADES_PER_CALL }),
      );
    },

    historicalIndexPrice: async (query) => {
      const chainIndex = readChainIndex(query.chainIndex);
      if (chainIndex === null) throw new OnchainosError("invalid_request", "chainIndex inválido");
      let tokenContractAddress: string | undefined;
      if (query.tokenContractAddress !== undefined) {
        const address = readTokenAddress(query.tokenContractAddress, { allowNative: true });
        if (address === null) throw new OnchainosError("invalid_request", "tokenContractAddress inválido");
        tokenContractAddress = address;
      }
      if (query.period !== undefined && !(INDEX_PERIODS as readonly string[]).includes(query.period)) throw new OnchainosError("invalid_request", "period não documentado");
      let cursor: string | undefined;
      if (query.cursor !== undefined) {
        const id = readOpaqueId(query.cursor);
        if (id === null) throw new OnchainosError("invalid_request", "cursor inválido");
        cursor = id;
      }
      const limit = query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_INDEX_POINTS_PER_CALL);
      return readGet(
        http,
        "market.index.historical-price",
        {
          chainIndex,
          tokenContractAddress,
          limit,
          cursor,
          begin: query.begin === undefined ? undefined : millisecondBound(query.begin, "begin"),
          end: query.end === undefined ? undefined : millisecondBound(query.end, "end"),
          period: query.period,
        },
        (data) => parseIndexHistory(data, limit ?? DEFAULT_INDEX_POINTS_PER_CALL),
      );
    },
  };
}
