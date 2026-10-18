/**
 * Onchain OS DeFi, read only: product search, detail, rate, TVL and depth series, supported chains and platforms.
 * Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 7.6 (criteria D16, D19).
 *
 * What this module says and does not say:
 *  - `rate` is an ADVERTISED APY, a snapshot published by the protocol or the provider. It is not a realized or net
 *    figure: costs, lock-ups, queues, slippage on exit and liquidity of the redemption are not in the data. Every field
 *    that carries it is called `advertisedRate...`.
 *  - On the search endpoint `rate` is declared as a decimal fraction (`"0.02140"` is 2.14 percent) and `tvl` as USD. On
 *    the detail and chart endpoints no unit is declared, so those fields carry the unknown-unit label; the examples repeat
 *    the scale of the search, which is an observation and not a declaration.
 *  - Names, logos, links, questions and answers are text from third parties and are dropped.
 *
 * Not implemented: product `prepare`, the entry calculator, enter / exit / claim and the user position endpoints. They
 * prepare data to be signed or send a wallet address to the provider.
 */

import { OnchainosError } from "./errors.ts";
import type { OnchainosHttp } from "./http.ts";
import { collectPages, type Collected, type CollectOptions } from "./paging.ts";
import { mergeMeta, readGet, readPost, type Read } from "./read.ts";
import {
  asArray,
  asRecord,
  field,
  readBoolean,
  readChainIndex,
  readCode,
  readCount,
  readDecimal,
  readEnum,
  readEpochMs,
  readNonNegative,
  readNumericId,
  readTokenAddress,
  schemaFail,
  type AmountUnitUnknown,
  type CountUnits,
  type DecimalFraction,
  type EpochMs,
  type UsdAmount,
} from "./values.ts";

export const DEFI_SEARCH_PAGE_SIZE = 20;
const MAX_KEYWORDS = 10;
const MAX_PAGE_NUM = 10_000;
const MAX_SERIES_POINTS = 5_000;
const MAX_LISTED = 1_000;

export const DEFI_PRODUCT_GROUPS = ["SINGLE_EARN", "DEX_POOL", "LENDING"] as const;
export type DefiProductGroup = (typeof DEFI_PRODUCT_GROUPS)[number];
export const SERIES_TIME_RANGES = ["WEEK", "MONTH", "SEASON", "YEAR"] as const;
export type SeriesTimeRange = (typeof SERIES_TIME_RANGES)[number];
export const DEPTH_CHART_TYPES = ["DEPTH", "PRICE"] as const;
export type DepthChartType = (typeof DEPTH_CHART_TYPES)[number];
export const DEPTH_TIME_RANGES = ["DAY", "WEEK"] as const;
export type DepthTimeRange = (typeof DEPTH_TIME_RANGES)[number];
const RATE_KINDS = ["APY", "APR"] as const;
export type RateKind = (typeof RATE_KINDS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DefiSearchRow {
  readonly investmentId: string;
  readonly chainIndex: string | null;
  readonly productGroup: DefiProductGroup | null;
  /** Declared: APY as a decimal fraction (0.0214 is 2.14 percent). ADVERTISED, not a return. */
  readonly advertisedRateFraction: DecimalFraction | null;
  readonly tvlUsd: UsdAmount | null;
  /** The base of the fee rate is NOT declared. */
  readonly feeRate: AmountUnitUnknown | null;
}

export interface DefiSearchPage {
  readonly total: CountUnits | null;
  readonly rows: DefiSearchRow[];
}

export interface DefiToken {
  readonly tokenAddress: string | null;
  readonly tokenPrecision: CountUnits | null;
  readonly isBaseToken: boolean | null;
}

export interface DefiRateDetail {
  readonly tokenAddress: string | null;
  readonly advertisedRate: AmountUnitUnknown | null;
  readonly type: CountUnits | null;
}

export interface DefiDetail {
  readonly investmentId: string;
  readonly chainIndex: string | null;
  readonly analysisPlatformId: string | null;
  readonly investType: CountUnits | null;
  readonly rateType: CountUnits | null;
  readonly rateKind: RateKind | null;
  /** The unit is NOT declared on the detail page. */
  readonly advertisedRate: AmountUnitUnknown | null;
  readonly tvl: AmountUnitUnknown | null;
  readonly feeRate: AmountUnitUnknown | null;
  readonly utilizationRate: AmountUnitUnknown | null;
  readonly isInvestable: boolean | null;
  readonly isSupportRedeem: boolean | null;
  readonly isSupportClaim: boolean | null;
  readonly hasRateChart: boolean | null;
  readonly hasTvlChart: boolean | null;
  readonly subscriptionMethod: CountUnits | null;
  readonly redeemMethod: CountUnits | null;
  readonly underlyingTokens: DefiToken[];
  readonly rateDetails: DefiRateDetail[];
}

export interface RatePoint {
  readonly timestampMs: EpochMs;
  readonly advertisedRate: AmountUnitUnknown | null;
  readonly bonusRate: AmountUnitUnknown | null;
  /** 1 highest point, -1 lowest point, null regular point. */
  readonly limitValue: 1 | -1 | null;
  readonly totalReward: AmountUnitUnknown | null;
}

export interface TvlPoint {
  readonly timestampMs: EpochMs;
  readonly tvlUsd: UsdAmount | null;
  readonly limitValue: 1 | -1 | null;
}

export interface DepthTick {
  readonly tick: number;
  readonly liquidity: AmountUnitUnknown | null;
  readonly liquidityNet: AmountUnitUnknown | null;
  readonly token0Price: AmountUnitUnknown | null;
  readonly token1Price: AmountUnitUnknown | null;
}

export interface PricePoint {
  readonly timestampMs: EpochMs;
  readonly token0Price: AmountUnitUnknown | null;
  readonly token1Price: AmountUnitUnknown | null;
}

export type DepthPriceResult = { readonly chartType: "DEPTH"; readonly rows: DepthTick[] } | { readonly chartType: "PRICE"; readonly rows: PricePoint[] };

export interface DefiChainRow {
  readonly chainIndex: string;
  readonly networkCode: string | null;
}

export interface DefiPlatformRow {
  readonly analysisPlatformId: string;
  readonly investmentCount: CountUnits | null;
}

// ---------------------------------------------------------------------------
// Parsers (pure)
// ---------------------------------------------------------------------------

function readLimitMarker(value: unknown): 1 | -1 | null {
  const n = readDecimal(value);
  return n === 1 ? 1 : n === -1 ? -1 : null;
}

export function parseDefiSearch(data: unknown): DefiSearchPage {
  const record = asRecord(data, "data");
  const list = field(record, "list");
  const rows = list === undefined || list === null ? [] : asArray(list, "list", DEFI_SEARCH_PAGE_SIZE);
  return {
    total: readCount(field(record, "total")),
    rows: rows.map((raw, index): DefiSearchRow => {
      const item = asRecord(raw, "linha", index);
      const investmentId = readNumericId(field(item, "investmentId"));
      if (investmentId === null) return schemaFail("investmentId ilegível", { rowIndex: index });
      return {
        investmentId,
        chainIndex: readChainIndex(field(item, "chainIndex")),
        productGroup: readEnum(field(item, "productGroup"), DEFI_PRODUCT_GROUPS),
        advertisedRateFraction: readDecimal(field(item, "rate")),
        tvlUsd: readNonNegative(field(item, "tvl")),
        feeRate: readDecimal(field(item, "feeRate")),
      };
    }),
  };
}

function objectsOf(value: unknown, label: string): Array<Record<string, unknown>> {
  if (value === undefined || value === null) return [];
  return asArray(value, label, 64).map((raw, index) => asRecord(raw, label, index));
}

export function parseDefiDetail(data: unknown, requestedId: string): DefiDetail {
  const record = asRecord(data, "data");
  const echoed = field(record, "investmentId");
  if (echoed !== undefined && readNumericId(echoed) !== requestedId) return schemaFail("investmentId fora do pedido");
  return {
    investmentId: requestedId,
    chainIndex: readChainIndex(field(record, "chainIndex")),
    analysisPlatformId: readNumericId(field(record, "analysisPlatformId")),
    investType: readCount(field(record, "investType")),
    rateType: readCount(field(record, "rateType")),
    rateKind: readEnum(field(record, "rateTypeDesc"), RATE_KINDS),
    advertisedRate: readDecimal(field(record, "rate")),
    tvl: readNonNegative(field(record, "tvl")),
    feeRate: readDecimal(field(record, "feeRate")),
    utilizationRate: readDecimal(field(record, "utilizationRate")),
    isInvestable: readBoolean(field(record, "isInvestable")),
    isSupportRedeem: readBoolean(field(record, "isSupportRedeem")),
    isSupportClaim: readBoolean(field(record, "isSupportClaim")),
    hasRateChart: readBoolean(field(record, "hasRateChart")),
    hasTvlChart: readBoolean(field(record, "hasTvlChart")),
    subscriptionMethod: readCount(field(record, "subscriptionMethod")),
    redeemMethod: readCount(field(record, "redeemMethod")),
    underlyingTokens: objectsOf(field(record, "underlyingToken"), "underlyingToken").map((token) => ({
      tokenAddress: readTokenAddress(field(token, "tokenAddress")),
      tokenPrecision: readCount(field(token, "tokenPrecision")),
      isBaseToken: readBoolean(field(token, "isBaseToken")),
    })),
    rateDetails: objectsOf(field(record, "rateDetails"), "rateDetails").map((detail) => ({
      tokenAddress: readTokenAddress(field(detail, "tokenAddress")),
      advertisedRate: readDecimal(field(detail, "rate")),
      type: readCount(field(detail, "type")),
    })),
  };
}

export function parseRateChart(data: unknown): RatePoint[] {
  return asArray(data, "data", MAX_SERIES_POINTS).map((raw, index) => {
    const point = asRecord(raw, "ponto", index);
    const timestampMs = readEpochMs(field(point, "timestamp"));
    if (timestampMs === null) return schemaFail("campo timestamp ilegível", { rowIndex: index });
    return {
      timestampMs,
      advertisedRate: readDecimal(field(point, "rate")),
      bonusRate: readDecimal(field(point, "bonusRate")),
      limitValue: readLimitMarker(field(point, "limitValue")),
      totalReward: readDecimal(field(point, "totalReward")),
    };
  });
}

export function parseTvlChart(data: unknown): TvlPoint[] {
  const record = asRecord(data, "data");
  const points = field(record, "chartVos");
  if (points === undefined || points === null) return [];
  return asArray(points, "chartVos", MAX_SERIES_POINTS).map((raw, index) => {
    const point = asRecord(raw, "ponto", index);
    const timestampMs = readEpochMs(field(point, "timestamp"));
    if (timestampMs === null) return schemaFail("campo timestamp ilegível", { rowIndex: index });
    return { timestampMs, tvlUsd: readNonNegative(field(point, "tvl")), limitValue: readLimitMarker(field(point, "limitValue")) };
  });
}

export function parseDepthPrice(data: unknown, chartType: DepthChartType): DepthPriceResult {
  const rows = asArray(data, "data", MAX_SERIES_POINTS);
  if (chartType === "DEPTH") {
    return {
      chartType,
      rows: rows.map((raw, index): DepthTick => {
        const item = asRecord(raw, "ponto", index);
        const tick = readDecimal(field(item, "tick"));
        if (tick === null || !Number.isSafeInteger(tick)) return schemaFail("campo tick ilegível", { rowIndex: index });
        return {
          tick,
          liquidity: readNonNegative(field(item, "liquidity")),
          liquidityNet: readDecimal(field(item, "liquidityNet")),
          token0Price: readNonNegative(field(item, "token0Price")),
          token1Price: readNonNegative(field(item, "token1Price")),
        };
      }),
    };
  }
  return {
    chartType,
    rows: rows.map((raw, index): PricePoint => {
      const item = asRecord(raw, "ponto", index);
      const timestampMs = readEpochMs(field(item, "timestamp"));
      if (timestampMs === null) return schemaFail("campo timestamp ilegível", { rowIndex: index });
      return { timestampMs, token0Price: readNonNegative(field(item, "token0Price")), token1Price: readNonNegative(field(item, "token1Price")) };
    }),
  };
}

export function parseDefiChains(data: unknown): DefiChainRow[] {
  const seen = new Set<string>();
  return asArray(data, "data", MAX_LISTED).map((raw, index) => {
    const item = asRecord(raw, "linha", index);
    const chainIndex = readChainIndex(field(item, "chainIndex"));
    if (chainIndex === null) return schemaFail("chainIndex ilegível", { rowIndex: index });
    if (seen.has(chainIndex)) return schemaFail("cadeia repetida", { rowIndex: index });
    seen.add(chainIndex);
    return { chainIndex, networkCode: readCode(field(item, "network"), 24) };
  });
}

export function parseDefiPlatforms(data: unknown): DefiPlatformRow[] {
  return asArray(data, "data", MAX_LISTED).map((raw, index) => {
    const item = asRecord(raw, "linha", index);
    const analysisPlatformId = readNumericId(field(item, "analysisPlatformId"));
    if (analysisPlatformId === null) return schemaFail("analysisPlatformId ilegível", { rowIndex: index });
    return { analysisPlatformId, investmentCount: readCount(field(item, "investmentCount")) };
  });
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

function keywords(value: unknown, name: string, required: boolean): string[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || value.length < (required ? 1 : 0) || value.length > MAX_KEYWORDS) {
    throw new OnchainosError("invalid_request", `${name} deve ter ${required ? "de 1 a" : "até"} ${MAX_KEYWORDS} itens`);
  }
  return value.map((word) => {
    if (typeof word !== "string" || !/^[A-Za-z0-9 ._+-]{1,32}$/.test(word)) throw new OnchainosError("invalid_request", `${name} aceita de 1 a 32 caracteres: letras, dígitos, espaço, ponto, sublinhado, mais e hífen`);
    return word;
  });
}

function investmentId(value: string): string {
  const id = readNumericId(value);
  if (id === null) throw new OnchainosError("invalid_request", "investmentId deve ser numérico");
  return id;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined {
  if (value === undefined) return undefined;
  const found = readEnum(value, allowed);
  if (found === null) throw new OnchainosError("invalid_request", `${name} não documentado`);
  return found;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface DefiSearchQuery {
  /** Required: 1 to 10 token keywords (client bound; the page states no maximum). */
  tokenKeywords: readonly string[];
  platformKeywords?: readonly string[];
  /** From 1. The page size is fixed at 20. */
  pageNum?: number;
  chainIndex?: string;
  productGroup?: DefiProductGroup;
}

export interface DefiReadClient {
  supportedChains(): Promise<Read<DefiChainRow[]>>;
  supportedPlatforms(): Promise<Read<DefiPlatformRow[]>>;
  search(query: DefiSearchQuery): Promise<Read<DefiSearchPage>>;
  /** Walks the pages of a search, bounded by pages and rows. */
  searchPages(query: Omit<DefiSearchQuery, "pageNum">, options: CollectOptions): Promise<Read<Collected<DefiSearchRow>>>;
  detail(id: string): Promise<Read<DefiDetail>>;
  rateChart(query: { investmentId: string; timeRange?: SeriesTimeRange }): Promise<Read<RatePoint[]>>;
  tvlChart(query: { investmentId: string; timeRange?: SeriesTimeRange }): Promise<Read<TvlPoint[]>>;
  depthPriceChart(query: { investmentId: string; chartType?: DepthChartType; timeRange?: DepthTimeRange }): Promise<Read<DepthPriceResult>>;
}

export function createDefiReadClient(http: OnchainosHttp): DefiReadClient {
  function searchBody(query: DefiSearchQuery): Record<string, unknown> {
    const body: Record<string, unknown> = { tokenKeywordList: keywords(query.tokenKeywords, "tokenKeywords", true) };
    const platforms = keywords(query.platformKeywords, "platformKeywords", false);
    if (platforms !== undefined) body.platformKeywordList = platforms;
    if (query.pageNum !== undefined) {
      if (!Number.isInteger(query.pageNum) || query.pageNum < 1 || query.pageNum > MAX_PAGE_NUM) throw new OnchainosError("invalid_request", `pageNum deve ser um inteiro de 1 a ${MAX_PAGE_NUM}`);
      body.pageNum = query.pageNum;
    }
    if (query.chainIndex !== undefined) {
      const chain = readChainIndex(query.chainIndex);
      if (chain === null) throw new OnchainosError("invalid_request", "chainIndex inválido");
      body.chainIndex = chain;
    }
    const group = oneOf(query.productGroup, DEFI_PRODUCT_GROUPS, "productGroup");
    if (group !== undefined) body.productGroup = group;
    return body;
  }

  const search = async (query: DefiSearchQuery): Promise<Read<DefiSearchPage>> => readPost(http, "defi.product.search", searchBody(query), (data) => parseDefiSearch(data));

  return {
    supportedChains: () => readGet(http, "defi.product.supported-chains", undefined, (data) => parseDefiChains(data)),
    supportedPlatforms: () => readGet(http, "defi.product.supported-platforms", undefined, (data) => parseDefiPlatforms(data)),
    search,

    searchPages: async (query, options) => {
      searchBody({ ...query, pageNum: 1 });
      const metas: Array<Read<unknown>["meta"]> = [];
      let fetched = 0;
      const collected = await collectPages<DefiSearchRow>(async (cursor) => {
        const pageNum = cursor === null ? 1 : Number(cursor);
        const read = await search({ ...query, pageNum });
        metas.push(read.meta);
        fetched += read.value.rows.length;
        const more = read.value.rows.length >= DEFI_SEARCH_PAGE_SIZE && (read.value.total === null || fetched < read.value.total);
        return { rows: read.value.rows, nextCursor: more ? String(pageNum + 1) : null };
      }, options);
      return { value: collected, meta: mergeMeta(metas) };
    },

    detail: async (id) => {
      const wanted = investmentId(id);
      return readGet(http, "defi.product.detail", { investmentId: wanted }, (data) => parseDefiDetail(data, wanted));
    },

    rateChart: async (query) =>
      readGet(http, "defi.product.rate-chart", { investmentId: investmentId(query.investmentId), timeRange: oneOf(query.timeRange, SERIES_TIME_RANGES, "timeRange") }, (data) => parseRateChart(data)),

    tvlChart: async (query) =>
      readGet(http, "defi.product.tvl-chart", { investmentId: investmentId(query.investmentId), timeRange: oneOf(query.timeRange, SERIES_TIME_RANGES, "timeRange") }, (data) => parseTvlChart(data)),

    depthPriceChart: async (query) => {
      const id = investmentId(query.investmentId);
      const chartType = oneOf(query.chartType, DEPTH_CHART_TYPES, "chartType");
      const timeRange = oneOf(query.timeRange, DEPTH_TIME_RANGES, "timeRange");
      if (timeRange !== undefined && (chartType ?? "DEPTH") !== "PRICE") throw new OnchainosError("invalid_request", "timeRange só vale com chartType PRICE");
      return readGet(http, "defi.product.depth-price-chart", { investmentId: id, chartType, timeRange }, (data) => parseDepthPrice(data, chartType ?? "DEPTH"));
    },
  };
}
