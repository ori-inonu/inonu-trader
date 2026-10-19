/**
 * Onchain OS Market, token family: search, basic info, price info, advanced info, holders, top traders, top liquidity,
 * hot tokens and holder clusters. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 7.2 (D9, D10, D12).
 *
 * Read only. What the pages do NOT declare stays unknown and is labelled in the types: the currency of prices, market
 * caps, volumes and liquidity (except where the field name or the page says USD), the scale of the `*Percent` fields of
 * advanced info and hot tokens (percent by example), and the scale of the cluster percentages (ambiguous).
 *
 * Dropped on purpose: token names, symbols, logos, explorer links, pool names, protocol names, stock profiles, creator
 * and holder wallet addresses, funding sources and every other free text or third party wallet. What remains is numbers,
 * closed vocabularies, booleans and validated identities. This is the defence against prompt injection through metadata.
 */

import { OnchainosError } from "./errors.ts";
import type { OnchainosHttp, QueryInput } from "./http.ts";
import { readGet, readPost, type Read } from "./read.ts";
import {
  asArray,
  asRecord,
  field,
  normaliseTokenRef,
  normaliseTokenRefs,
  readBoolean,
  readChainIndex,
  readChainRows,
  readCount,
  readDecimal,
  readEnum,
  readEpochMs,
  readEpochMsByExample,
  readNonNegative,
  readNumericId,
  readOpaqueId,
  readPercent,
  readPositive,
  readTokenAddress,
  schemaFail,
  tokenKey,
  type AmbiguousScale,
  type AmountUnitUnknown,
  type ChainRow,
  type CountUnits,
  type EpochMs,
  type EpochMsByExample,
  type PercentByExample,
  type PercentPoints,
  type PriceQuoteUnknown,
  type TokenRef,
  type UsdAmount,
} from "./values.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SEARCH_LIMIT = 100;
const MAX_HOLDERS_LIMIT = 100;
const MAX_HOT_TOKEN_LIMIT = 100;
const MAX_TOKENS_PER_BATCH = 100;
const MAX_POOLS = 5;
const MAX_CLUSTERS = 100;
const MAX_ADDRESSES_PER_CLUSTER = 1_000;
const MAX_SEARCH_CHAINS = 10;

/** The tags documented by the advanced info page. A tag outside this list is counted and dropped. */
const ADVANCED_TAGS = [
  "rwaXstock",
  "rwaOndo",
  "rwaOndoStatusPreMarket",
  "rwaOndoStatusRegular",
  "rwaOndoStatusPostmarket",
  "rwaOndoStatusOvernight",
  "rwaOndoStatusClosed",
  "rwaOndoStatusPaused",
  "honeypot",
  "dexBoost",
  "lowLiquidity",
  "communityRecognized",
  "devHoldingStatusSell",
  "devHoldingStatusSellAll",
  "devHoldingStatusBuy",
  "initialHighLiquidity",
  "smartMoneyBuy",
  "devAddLiquidity",
  "devBurnToken",
  "volumeChangeRateHoldersPlunge",
  "holdersChangeRateHoldersSurge",
  "dexScreenerTokenCommunityTakeOver",
  "dexScreenerPaid",
] as const;
export type AdvancedTag = (typeof ADVANCED_TAGS)[number];

/** Values seen in the cluster pages (description and example). Others are counted and dropped. */
const CLUSTER_TRENDS = ["buy", "sell", "neutral", "transfer", "transferIn"] as const;
export type ClusterTrend = (typeof CLUSTER_TRENDS)[number];

/** 0 undefined (NOT safe), 1 low, 2 medium, 3 medium high, 4 high, 5 high (manual configuration). */
export type RiskLevel = 0 | 1 | 2 | 3 | 4 | 5;

const HOT_TOKEN_RANK_BY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15] as const;
const HOT_TOKEN_RANGE_KEYS = [
  "priceChangePercent",
  "tradeAmount",
  "volume",
  "txs",
  "uniqueTrader",
  "marketCap",
  "liquidity",
  "holders",
  "top10HoldPercent",
  "devHoldPercent",
  "suspiciousHoldPercent",
  "bundleHoldPercent",
  "mentionedCount",
  "socialScore",
  "inflowUsd",
  "fdv",
] as const;
export type HotTokenRangeKey = (typeof HOT_TOKEN_RANGE_KEYS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IdentityRows<R> {
  readonly rows: R[];
  /** Requested identities the provider did not answer: absent, never a row of zeros. */
  readonly missing: TokenRef[];
}

export interface TokenSearchRow {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
  readonly decimals: CountUnits | null;
  /** "24-hour price change ratio": the scale is NOT declared. */
  readonly change: AmountUnitUnknown | null;
  readonly holders: CountUnits | null;
  readonly liquidity: AmountUnitUnknown | null;
  readonly marketCap: AmountUnitUnknown | null;
  readonly price: PriceQuoteUnknown | null;
  readonly communityRecognized: boolean | null;
  readonly cursor: string | null;
}

export interface BasicInfoRow {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
  readonly decimals: CountUnits | null;
  readonly communityRecognized: boolean | null;
}

export interface PriceInfoRow {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
  readonly timeMs: EpochMs | null;
  readonly price: PriceQuoteUnknown | null;
  readonly marketCap: AmountUnitUnknown | null;
  /** Percent by example (0.22 means 0.22 percent): the page does not declare the scale. */
  readonly priceChange5MPercent: PercentByExample | null;
  readonly priceChange1HPercent: PercentByExample | null;
  readonly priceChange4HPercent: PercentByExample | null;
  readonly priceChange24HPercent: PercentByExample | null;
  readonly volume5M: AmountUnitUnknown | null;
  readonly volume1H: AmountUnitUnknown | null;
  readonly volume4H: AmountUnitUnknown | null;
  readonly volume24H: AmountUnitUnknown | null;
  readonly txs5M: CountUnits | null;
  readonly txs1H: CountUnits | null;
  readonly txs4H: CountUnits | null;
  readonly txs24H: CountUnits | null;
  readonly maxPrice24h: PriceQuoteUnknown | null;
  readonly minPrice24h: PriceQuoteUnknown | null;
  readonly tradeNum24h: AmountUnitUnknown | null;
  readonly circSupply: AmountUnitUnknown | null;
  readonly liquidity: AmountUnitUnknown | null;
  readonly holders: CountUnits | null;
}

export interface AdvancedInfo {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
  /** 0 is "undefined" and says nothing about safety. */
  readonly riskControlLevel: RiskLevel | null;
  /** Tags present. An absent tag is UNKNOWN, never proof of safety. */
  readonly tags: AdvancedTag[];
  readonly unrecognizedTagCount: number;
  readonly top10HoldPercent: PercentByExample | null;
  readonly devHoldingPercent: PercentByExample | null;
  readonly bundleHoldingPercent: PercentByExample | null;
  readonly suspiciousHoldingPercent: PercentByExample | null;
  readonly sniperHoldingPercent: PercentByExample | null;
  readonly lpBurnedPercent: PercentByExample | null;
  readonly devRugPullTokenCount: CountUnits | null;
  readonly devCreateTokenCount: CountUnits | null;
  readonly devLaunchedTokenCount: CountUnits | null;
  readonly snipersClearAddressCount: CountUnits | null;
  readonly snipersTotal: CountUnits | null;
  readonly createTimeMs: EpochMsByExample | null;
  readonly isInternal: boolean | null;
  readonly totalFee: AmountUnitUnknown | null;
  readonly progress: AmountUnitUnknown | null;
  readonly protocolId: string | null;
}

export interface HolderRow {
  readonly holdAmount: AmountUnitUnknown | null;
  /** Declared: a percentage (76.75 means 76.75 percent). */
  readonly holdPercent: PercentPoints | null;
  readonly nativeTokenBalance: AmountUnitUnknown | null;
  readonly boughtAmount: AmountUnitUnknown | null;
  readonly avgBuyPrice: PriceQuoteUnknown | null;
  readonly totalSellAmount: AmountUnitUnknown | null;
  readonly avgSellPrice: PriceQuoteUnknown | null;
  readonly totalPnlUsd: UsdAmount | null;
  readonly realizedPnlUsd: UsdAmount | null;
  readonly unrealizedPnlUsd: UsdAmount | null;
  readonly cursor: string | null;
}

export interface TopTraderRow {
  readonly holdAmount: AmountUnitUnknown | null;
  /** The page does not declare the scale of this percentage. */
  readonly holdPercent: PercentByExample | null;
  readonly nativeTokenBalance: AmountUnitUnknown | null;
  readonly boughtAmount: AmountUnitUnknown | null;
  readonly avgBuyPrice: PriceQuoteUnknown | null;
  readonly soldAmount: AmountUnitUnknown | null;
  readonly avgSellPrice: PriceQuoteUnknown | null;
  readonly totalPnlUsd: UsdAmount | null;
  readonly realizedPnlUsd: UsdAmount | null;
  readonly unrealizedPnlUsd: UsdAmount | null;
  readonly cursor: string | null;
}

export interface PoolToken {
  readonly tokenContractAddress: string | null;
  readonly tokenAmount: AmountUnitUnknown | null;
}

export interface PoolRow {
  readonly poolAddress: string | null;
  readonly liquidityUsd: UsdAmount | null;
  /** Written with a percent sign in the answer ("0.7%"): the unit is in the value. */
  readonly liquidityProviderFeePercent: PercentPoints | null;
  readonly hookFeeBuyPercent: PercentPoints | null;
  readonly hookFeeSellPercent: PercentPoints | null;
  readonly sniperTaxBuyPercent: PercentPoints | null;
  readonly sniperTaxSellPercent: PercentPoints | null;
  readonly tokens: PoolToken[];
}

export interface HotTokenRow {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
  readonly marketCap: AmountUnitUnknown | null;
  readonly volumeUsd: UsdAmount | null;
  readonly firstTradeTimeMs: EpochMsByExample | null;
  readonly change: AmountUnitUnknown | null;
  readonly liquidityUsd: UsdAmount | null;
  readonly price: PriceQuoteUnknown | null;
  readonly holders: CountUnits | null;
  readonly uniqueTraders: CountUnits | null;
  readonly txsBuy: CountUnits | null;
  readonly txsSell: CountUnits | null;
  readonly txs: CountUnits | null;
  /** Named USD; the page does not state the unit. */
  readonly inflowUsd: UsdAmount | null;
  readonly riskLevelControl: RiskLevel | null;
  readonly devHoldPercent: PercentByExample | null;
  readonly top10HoldPercent: PercentByExample | null;
  readonly insiderHoldPercent: PercentByExample | null;
  readonly bundleHoldPercent: PercentByExample | null;
  readonly vibeScore: AmountUnitUnknown | null;
  readonly mentionsCount: CountUnits | null;
  readonly cursor: string | null;
}

export type ClusterConcentration = "low" | "medium" | "high";

export interface ClusterOverview {
  readonly concentration: ClusterConcentration | null;
  readonly top100HoldingsPercent: AmbiguousScale | null;
  readonly rugPullPercent: AmbiguousScale | null;
  readonly holderNewAddressPercent: AmbiguousScale | null;
  readonly holderSameFundSourcePercent: AmbiguousScale | null;
  readonly holderSameCreationTimePercent: AmbiguousScale | null;
}

export interface ClusterRow {
  readonly holdingAmount: AmountUnitUnknown | null;
  readonly holdingValueUsd: UsdAmount | null;
  readonly holdingPercent: AmbiguousScale | null;
  readonly trend: ClusterTrend[] | null;
  readonly unrecognizedTrendCount: number;
  /** The unit is not declared and the example looks like an instant in seconds. */
  readonly averageHoldingPeriod: AmountUnitUnknown | null;
  readonly pnlUsd: UsdAmount | null;
  readonly pnlPercent: PercentByExample | null;
  readonly buyVolume: AmountUnitUnknown | null;
  readonly averageBuyPriceUsd: UsdAmount | null;
  readonly sellVolume: AmountUnitUnknown | null;
  readonly averageSellPriceUsd: UsdAmount | null;
  readonly lastActiveTimestampMs: EpochMsByExample | null;
  readonly addressCount: CountUnits | null;
  readonly contractCount: CountUnits | null;
  readonly exchangeCount: CountUnits | null;
  readonly kolCount: CountUnits | null;
}

export interface ClusterTopHolders {
  readonly holdingAmount: AmountUnitUnknown | null;
  readonly holdingPercent: AmbiguousScale | null;
  readonly trend: ClusterTrend[] | null;
  readonly unrecognizedTrendCount: number;
  readonly averageHoldingPeriod: AmountUnitUnknown | null;
  readonly averagePnlUsd: UsdAmount | null;
  readonly averageBuyPriceUsd: UsdAmount | null;
  readonly averageBuyPricePercent: PercentByExample | null;
  readonly averageSellPriceUsd: UsdAmount | null;
  readonly averageSellPricePercent: PercentByExample | null;
}

// ---------------------------------------------------------------------------
// Parsers (pure)
// ---------------------------------------------------------------------------

function readRiskLevel(value: unknown): RiskLevel | null {
  const n = readCount(value);
  return n !== null && n <= 5 ? (n as RiskLevel) : null;
}

function readPercentOfWhole(value: unknown): PercentByExample | null {
  return readPercent(value, { min: 0, max: 100 });
}

function identityOf(record: Record<string, unknown>, rowIndex: number): TokenRef {
  const chainIndex = readChainIndex(field(record, "chainIndex"));
  const tokenContractAddress = readTokenAddress(field(record, "tokenContractAddress"));
  if (chainIndex === null || tokenContractAddress === null) return schemaFail("identidade do token ilegível", { rowIndex });
  return { chainIndex, tokenContractAddress };
}

/** Rows of a batch answer: each identity must have been requested and appear once. */
function readIdentityRows<R>(data: unknown, requested: readonly TokenRef[], build: (record: Record<string, unknown>, identity: TokenRef) => R): IdentityRows<R> {
  const rows = asArray(data, "data", requested.length);
  const wanted = new Set(requested.map(tokenKey));
  const seen = new Set<string>();
  const parsed = rows.map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const identity = identityOf(record, index);
    const key = tokenKey(identity);
    if (!wanted.has(key)) return schemaFail("identidade fora do pedido", { rowIndex: index });
    if (seen.has(key)) return schemaFail("identidade repetida", { rowIndex: index });
    seen.add(key);
    return build(record, identity);
  });
  return { rows: parsed, missing: requested.filter((ref) => !seen.has(tokenKey(ref))) };
}

export function parseSearch(data: unknown, maxRows: number): TokenSearchRow[] {
  return asArray(data, "data", maxRows).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const identity = identityOf(record, index);
    const tagList = field(record, "tagList");
    const tags = typeof tagList === "object" && tagList !== null && !Array.isArray(tagList) ? (tagList as Record<string, unknown>) : {};
    return {
      ...identity,
      decimals: readCount(field(record, "decimal")),
      change: readDecimal(field(record, "change")),
      holders: readCount(field(record, "holders")),
      liquidity: readNonNegative(field(record, "liquidity")),
      marketCap: readNonNegative(field(record, "marketCap")),
      price: readPositive(field(record, "price")),
      communityRecognized: readBoolean(field(tags, "communityRecognized")),
      cursor: readOpaqueId(field(record, "cursor")),
    };
  });
}

export function parseBasicInfo(data: unknown, requested: readonly TokenRef[]): IdentityRows<BasicInfoRow> {
  return readIdentityRows(data, requested, (record, identity) => {
    const tagList = field(record, "tagList");
    const tags = typeof tagList === "object" && tagList !== null && !Array.isArray(tagList) ? (tagList as Record<string, unknown>) : {};
    return { ...identity, decimals: readCount(field(record, "decimal")), communityRecognized: readBoolean(field(tags, "communityRecognized")) };
  });
}

export function parsePriceInfo(data: unknown, requested: readonly TokenRef[]): IdentityRows<PriceInfoRow> {
  return readIdentityRows(data, requested, (record, identity) => ({
    ...identity,
    timeMs: readEpochMs(field(record, "time")),
    price: readPositive(field(record, "price")),
    marketCap: readNonNegative(field(record, "marketCap")),
    priceChange5MPercent: readDecimal(field(record, "priceChange5M")),
    priceChange1HPercent: readDecimal(field(record, "priceChange1H")),
    priceChange4HPercent: readDecimal(field(record, "priceChange4H")),
    priceChange24HPercent: readDecimal(field(record, "priceChange24H")),
    volume5M: readNonNegative(field(record, "volume5M")),
    volume1H: readNonNegative(field(record, "volume1H")),
    volume4H: readNonNegative(field(record, "volume4H")),
    volume24H: readNonNegative(field(record, "volume24H")),
    txs5M: readCount(field(record, "txs5M")),
    txs1H: readCount(field(record, "txs1H")),
    txs4H: readCount(field(record, "txs4H")),
    txs24H: readCount(field(record, "txs24H")),
    maxPrice24h: readPositive(field(record, "maxPrice")),
    minPrice24h: readPositive(field(record, "minPrice")),
    tradeNum24h: readNonNegative(field(record, "tradeNum")),
    circSupply: readNonNegative(field(record, "circSupply")),
    liquidity: readNonNegative(field(record, "liquidity")),
    holders: readCount(field(record, "holders")),
  }));
}

export function parseAdvancedInfo(data: unknown, requested: TokenRef): AdvancedInfo {
  const record = asRecord(data, "data");
  const chainIndex = field(record, "chainIndex");
  const address = field(record, "tokenContractAddress");
  if (chainIndex !== undefined && readChainIndex(chainIndex) !== requested.chainIndex) return schemaFail("identidade fora do pedido");
  if (address !== undefined && readTokenAddress(address) !== requested.tokenContractAddress) return schemaFail("identidade fora do pedido");

  const rawTags = field(record, "tokenTags");
  const tags: AdvancedTag[] = [];
  let unrecognizedTagCount = 0;
  if (rawTags !== undefined && rawTags !== null) {
    for (const tag of asArray(rawTags, "tokenTags", 64)) {
      const known = readEnum(tag, ADVANCED_TAGS);
      if (known === null) unrecognizedTagCount += 1;
      else tags.push(known);
    }
  }
  return {
    chainIndex: requested.chainIndex,
    tokenContractAddress: requested.tokenContractAddress,
    riskControlLevel: readRiskLevel(field(record, "riskControlLevel")),
    tags,
    unrecognizedTagCount,
    top10HoldPercent: readPercentOfWhole(field(record, "top10HoldPercent")),
    devHoldingPercent: readPercentOfWhole(field(record, "devHoldingPercent")),
    bundleHoldingPercent: readPercentOfWhole(field(record, "bundleHoldingPercent")),
    suspiciousHoldingPercent: readPercentOfWhole(field(record, "suspiciousHoldingPercent")),
    sniperHoldingPercent: readPercentOfWhole(field(record, "sniperHoldingPercent")),
    lpBurnedPercent: readPercentOfWhole(field(record, "lpBurnedPercent")),
    devRugPullTokenCount: readCount(field(record, "devRugPullTokenCount")),
    devCreateTokenCount: readCount(field(record, "devCreateTokenCount")),
    devLaunchedTokenCount: readCount(field(record, "devLaunchedTokenCount")),
    snipersClearAddressCount: readCount(field(record, "snipersClearAddressCount")),
    snipersTotal: readCount(field(record, "snipersTotal")),
    createTimeMs: readEpochMsByExample(field(record, "createTime")),
    isInternal: readBoolean(field(record, "isInternal")),
    totalFee: readNonNegative(field(record, "totalFee")),
    progress: readNonNegative(field(record, "progress")),
    protocolId: readNumericId(field(record, "protocolId")),
  };
}

export function parseHolders(data: unknown, maxRows: number): HolderRow[] {
  return asArray(data, "data", maxRows).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    return {
      holdAmount: readNonNegative(field(record, "holdAmount")),
      holdPercent: readPercent(field(record, "holdPercent"), { min: 0, max: 100 }),
      nativeTokenBalance: readNonNegative(field(record, "nativeTokenBalance")),
      boughtAmount: readNonNegative(field(record, "boughtAmount")),
      avgBuyPrice: readNonNegative(field(record, "avgBuyPrice")),
      totalSellAmount: readNonNegative(field(record, "totalSellAmount")),
      avgSellPrice: readNonNegative(field(record, "avgSellPrice")),
      totalPnlUsd: readDecimal(field(record, "totalPnlUsd")),
      realizedPnlUsd: readDecimal(field(record, "realizedPnlUsd")),
      unrealizedPnlUsd: readDecimal(field(record, "unrealizedPnlUsd")),
      cursor: readOpaqueId(field(record, "cursor")),
    };
  });
}

export function parseTopTraders(data: unknown, maxRows: number): TopTraderRow[] {
  return asArray(data, "data", maxRows).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    return {
      holdAmount: readNonNegative(field(record, "holdAmount")),
      holdPercent: readPercentOfWhole(field(record, "holdPercent")),
      nativeTokenBalance: readNonNegative(field(record, "nativeTokenBalance")),
      boughtAmount: readNonNegative(field(record, "boughtAmount")),
      avgBuyPrice: readNonNegative(field(record, "avgBuyPrice")),
      soldAmount: readNonNegative(field(record, "soldAmount")),
      avgSellPrice: readNonNegative(field(record, "avgSellPrice")),
      totalPnlUsd: readDecimal(field(record, "totalPnlUsd")),
      realizedPnlUsd: readDecimal(field(record, "realizedPnlUsd")),
      unrealizedPnlUsd: readDecimal(field(record, "unrealizedPnlUsd")),
      cursor: readOpaqueId(field(record, "cursor")),
    };
  });
}

function pairOf(value: unknown, name: "buy" | "sell"): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? field(value as Record<string, unknown>, name) : undefined;
}

export function parseTopLiquidity(data: unknown): PoolRow[] {
  return asArray(data, "data", MAX_POOLS).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const amounts = field(record, "liquidityAmount");
    const tokens = Array.isArray(amounts)
      ? amounts.slice(0, 8).map((item): PoolToken => {
          const entry = typeof item === "object" && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
          return { tokenContractAddress: readTokenAddress(field(entry, "tokenContractAddress")), tokenAmount: readNonNegative(field(entry, "tokenAmount")) };
        })
      : [];
    const hook = field(record, "hookFeePercent");
    const sniper = field(record, "sniperTaxPercent", "sniperTaxInfo");
    return {
      poolAddress: readTokenAddress(field(record, "poolAddress")),
      liquidityUsd: readNonNegative(field(record, "liquidityUsd")),
      liquidityProviderFeePercent: readPercent(field(record, "liquidityProviderFeePercent")),
      hookFeeBuyPercent: readPercent(pairOf(hook, "buy")),
      hookFeeSellPercent: readPercent(pairOf(hook, "sell")),
      sniperTaxBuyPercent: readPercent(pairOf(sniper, "buy")),
      sniperTaxSellPercent: readPercent(pairOf(sniper, "sell")),
      tokens,
    };
  });
}

export function parseHotTokens(data: unknown, maxRows: number): HotTokenRow[] {
  return asArray(data, "data", maxRows).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    return {
      ...identityOf(record, index),
      marketCap: readNonNegative(field(record, "marketCap")),
      volumeUsd: readNonNegative(field(record, "volume")),
      firstTradeTimeMs: readEpochMsByExample(field(record, "firstTradeTime")),
      change: readDecimal(field(record, "change")),
      liquidityUsd: readNonNegative(field(record, "liquidity")),
      price: readPositive(field(record, "price")),
      holders: readCount(field(record, "holders")),
      uniqueTraders: readCount(field(record, "uniqueTraders")),
      txsBuy: readCount(field(record, "txsBuy")),
      txsSell: readCount(field(record, "txsSell")),
      txs: readCount(field(record, "txs")),
      inflowUsd: readDecimal(field(record, "inflowUsd")),
      riskLevelControl: readRiskLevel(field(record, "riskLevelControl")),
      devHoldPercent: readPercentOfWhole(field(record, "devHoldPercent")),
      top10HoldPercent: readPercentOfWhole(field(record, "top10HoldPercent")),
      insiderHoldPercent: readPercentOfWhole(field(record, "insiderHoldPercent")),
      bundleHoldPercent: readPercentOfWhole(field(record, "bundleHoldPercent")),
      vibeScore: readNonNegative(field(record, "vibeScore")),
      mentionsCount: readCount(field(record, "mentionsCount")),
      cursor: readOpaqueId(field(record, "cursor")),
    };
  });
}

function readTrend(value: unknown): { trend: ClusterTrend[] | null; unrecognized: number } {
  if (!Array.isArray(value)) return { trend: null, unrecognized: 0 };
  const trend: ClusterTrend[] = [];
  let unrecognized = 0;
  for (const item of value.slice(0, 16)) {
    const known = readEnum(item, CLUSTER_TRENDS);
    if (known === null) unrecognized += 1;
    else trend.push(known);
  }
  return { trend, unrecognized };
}

export function parseClusterOverview(data: unknown): ClusterOverview {
  const record = asRecord(data, "data");
  const raw = field(record, "clusterConcentration", "ClusterConcentration");
  return {
    concentration: raw === "Low" ? "low" : raw === "Medium" ? "medium" : raw === "High" ? "high" : null,
    top100HoldingsPercent: readDecimal(field(record, "top100HoldingsPercent")),
    rugPullPercent: readDecimal(field(record, "rugPullPercent")),
    holderNewAddressPercent: readDecimal(field(record, "holderNewAddressPercent")),
    holderSameFundSourcePercent: readDecimal(field(record, "holderSameFundSourcePercent")),
    holderSameCreationTimePercent: readDecimal(field(record, "holderSameCreationTimePercent")),
  };
}

function countFlag(list: unknown[], flag: string): number {
  return list.filter((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) && field(entry as Record<string, unknown>, flag) === true).length;
}

export function parseClusterList(data: unknown): ClusterRow[] {
  const record = asRecord(data, "data");
  const clusters = field(record, "clusterList");
  if (clusters === undefined || clusters === null) return [];
  return asArray(clusters, "clusterList", MAX_CLUSTERS).map((raw, index) => {
    const cluster = asRecord(raw, "cluster", index);
    const { trend, unrecognized } = readTrend(field(cluster, "trendType"));
    const addressesRaw = field(cluster, "clusterAddressList");
    const addresses = addressesRaw === undefined || addressesRaw === null ? null : asArray(addressesRaw, "clusterAddressList", MAX_ADDRESSES_PER_CLUSTER);
    return {
      holdingAmount: readNonNegative(field(cluster, "holdingAmount")),
      holdingValueUsd: readNonNegative(field(cluster, "holdingValueUsd")),
      holdingPercent: readDecimal(field(cluster, "holdingPercent")),
      trend,
      unrecognizedTrendCount: unrecognized,
      averageHoldingPeriod: readNonNegative(field(cluster, "averageHoldingPeriod")),
      pnlUsd: readDecimal(field(cluster, "pnlUsd")),
      pnlPercent: readDecimal(field(cluster, "pnlPercent")),
      buyVolume: readNonNegative(field(cluster, "buyVolume")),
      averageBuyPriceUsd: readNonNegative(field(cluster, "averageBuyPriceUsd")),
      sellVolume: readNonNegative(field(cluster, "sellVolume")),
      averageSellPriceUsd: readNonNegative(field(cluster, "averageSellPriceUsd")),
      lastActiveTimestampMs: readEpochMsByExample(field(cluster, "lastActiveTimestamp")),
      addressCount: addresses === null ? null : addresses.length,
      contractCount: addresses === null ? null : countFlag(addresses, "isContract"),
      exchangeCount: addresses === null ? null : countFlag(addresses, "isExchange"),
      kolCount: addresses === null ? null : countFlag(addresses, "isKol"),
    };
  });
}

export function parseClusterTopHolders(data: unknown): ClusterTopHolders {
  const record = asRecord(data, "data");
  const { trend, unrecognized } = readTrend(field(record, "clusterTrendType"));
  return {
    holdingAmount: readNonNegative(field(record, "holdingAmount")),
    holdingPercent: readDecimal(field(record, "holdingPercent")),
    trend,
    unrecognizedTrendCount: unrecognized,
    averageHoldingPeriod: readNonNegative(field(record, "averageHoldingPeriod")),
    averagePnlUsd: readDecimal(field(record, "averagePnlUsd")),
    averageBuyPriceUsd: readNonNegative(field(record, "averageBuyPriceUsd")),
    averageBuyPricePercent: readDecimal(field(record, "averageBuyPricePercent")),
    averageSellPriceUsd: readNonNegative(field(record, "averageSellPriceUsd")),
    averageSellPricePercent: readDecimal(field(record, "averageSellPricePercent")),
  };
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

function optionalCursor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const id = readOpaqueId(value);
  if (id === null) throw new OnchainosError("invalid_request", "cursor inválido");
  return id;
}

function optionalFlag(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new OnchainosError("invalid_request", `${name} deve ser booleano`);
  return value;
}

function rangeText(value: unknown, name: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new OnchainosError("invalid_request", `${name} deve ser um número finito`);
  const text = String(value);
  if (/[eE]/.test(text)) throw new OnchainosError("invalid_request", `${name} fora da faixa representável em texto decimal`);
  return text;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface TokenSearchQuery {
  chains: readonly string[];
  search: string;
  cursor?: string;
  limit?: number;
}

export interface HoldersQuery extends TokenRef {
  /** 1 KOL, 2 developer, 3 smart money, 4 whale, 5 new wallet, 6 suspicious, 7 sniper, 8 suspected phishing, 9 bundle. */
  tagFilter?: number;
  cursor?: string;
  limit?: number;
}

export interface HotTokenQuery {
  /** 4 trending (token score), 5 mentioned on X. */
  rankingType: 4 | 5;
  chainIndex?: string;
  rankBy?: (typeof HOT_TOKEN_RANK_BY)[number];
  /** 1 five minutes, 2 one hour, 3 four hours, 4 twenty four hours. */
  rankingTimeFrame?: 1 | 2 | 3 | 4;
  riskFilter?: boolean;
  protocolIds?: readonly string[];
  ranges?: Partial<Record<HotTokenRangeKey, { min?: number; max?: number }>>;
  stableTokenFilter?: boolean;
  isLpBurnt?: boolean;
  isMint?: boolean;
  isFreeze?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ClusterTopHoldersQuery extends TokenRef {
  /** 1 top 10, 2 top 50, 3 top 100. */
  rangeFilter: 1 | 2 | 3;
}

export interface MarketTokenClient {
  search(query: TokenSearchQuery): Promise<Read<TokenSearchRow[]>>;
  basicInfo(tokens: readonly TokenRef[]): Promise<Read<IdentityRows<BasicInfoRow>>>;
  priceInfo(tokens: readonly TokenRef[]): Promise<Read<IdentityRows<PriceInfoRow>>>;
  advancedInfo(token: TokenRef): Promise<Read<AdvancedInfo>>;
  holders(query: HoldersQuery): Promise<Read<HolderRow[]>>;
  topTraders(query: HoldersQuery): Promise<Read<TopTraderRow[]>>;
  topLiquidity(token: TokenRef): Promise<Read<PoolRow[]>>;
  hotTokens(query: HotTokenQuery): Promise<Read<HotTokenRow[]>>;
  clusterSupportedChains(): Promise<Read<ChainRow[]>>;
  clusterOverview(token: TokenRef): Promise<Read<ClusterOverview>>;
  clusterList(token: TokenRef): Promise<Read<ClusterRow[]>>;
  clusterTopHolders(query: ClusterTopHoldersQuery): Promise<Read<ClusterTopHolders>>;
}

export function createMarketTokenClient(http: OnchainosHttp): MarketTokenClient {
  function holderParams(query: HoldersQuery): { params: QueryInput; maxRows: number } {
    const token = normaliseTokenRef({ chainIndex: query.chainIndex, tokenContractAddress: query.tokenContractAddress });
    const limit = query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_HOLDERS_LIMIT);
    return {
      params: {
        chainIndex: token.chainIndex,
        tokenContractAddress: token.tokenContractAddress,
        tagFilter: query.tagFilter === undefined ? undefined : integerInRange(query.tagFilter, "tagFilter", 1, 9),
        cursor: optionalCursor(query.cursor),
        limit,
      },
      maxRows: limit ?? MAX_HOLDERS_LIMIT,
    };
  }

  function singleToken(token: TokenRef): QueryInput {
    const ref = normaliseTokenRef(token);
    return { chainIndex: ref.chainIndex, tokenContractAddress: ref.tokenContractAddress };
  }

  return {
    search: async (query) => {
      if (!Array.isArray(query.chains) || query.chains.length < 1 || query.chains.length > MAX_SEARCH_CHAINS) throw new OnchainosError("invalid_request", `chains deve ter de 1 a ${MAX_SEARCH_CHAINS} cadeias`);
      const chains = query.chains.map((chain) => {
        const index = readChainIndex(chain);
        if (index === null) throw new OnchainosError("invalid_request", "chainIndex inválido em chains");
        return index;
      });
      if (typeof query.search !== "string" || !/^[\x20-\x7e]{1,64}$/.test(query.search)) throw new OnchainosError("invalid_request", "search deve ter de 1 a 64 caracteres ASCII imprimíveis");
      const limit = query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_SEARCH_LIMIT);
      return readGet(http, "market.token.search", { chains: chains.join(","), search: query.search, cursor: optionalCursor(query.cursor), limit }, (data) => parseSearch(data, limit ?? MAX_SEARCH_LIMIT));
    },

    basicInfo: async (tokens) => {
      const refs = normaliseTokenRefs(tokens, { max: MAX_TOKENS_PER_BATCH });
      return readPost(http, "market.token.basic-info", refs, (data) => parseBasicInfo(data, refs));
    },

    priceInfo: async (tokens) => {
      const refs = normaliseTokenRefs(tokens, { max: MAX_TOKENS_PER_BATCH });
      return readPost(http, "market.token.price-info", refs, (data) => parsePriceInfo(data, refs));
    },

    advancedInfo: async (token) => {
      const ref = normaliseTokenRef(token);
      return readGet(http, "market.token.advanced-info", singleToken(ref), (data) => parseAdvancedInfo(data, ref));
    },

    holders: async (query) => {
      const { params, maxRows } = holderParams(query);
      return readGet(http, "market.token.holder", params, (data) => parseHolders(data, maxRows));
    },

    topTraders: async (query) => {
      const { params, maxRows } = holderParams(query);
      return readGet(http, "market.token.top-trader", params, (data) => parseTopTraders(data, maxRows));
    },

    topLiquidity: async (token) => readGet(http, "market.token.top-liquidity", singleToken(token), (data) => parseTopLiquidity(data)),

    hotTokens: async (query) => {
      if (query.rankingType !== 4 && query.rankingType !== 5) throw new OnchainosError("invalid_request", "rankingType deve ser 4 ou 5");
      let chainIndex: string | undefined;
      if (query.chainIndex !== undefined) {
        const index = readChainIndex(query.chainIndex);
        if (index === null) throw new OnchainosError("invalid_request", "chainIndex inválido");
        chainIndex = index;
      }
      if (query.rankBy !== undefined && !(HOT_TOKEN_RANK_BY as readonly number[]).includes(query.rankBy)) throw new OnchainosError("invalid_request", "rankBy não documentado");
      if (query.rankingTimeFrame !== undefined) integerInRange(query.rankingTimeFrame, "rankingTimeFrame", 1, 4);
      let protocolId: string | undefined;
      if (query.protocolIds !== undefined) {
        if (!Array.isArray(query.protocolIds) || query.protocolIds.length < 1 || query.protocolIds.length > 10) throw new OnchainosError("invalid_request", "protocolIds deve ter de 1 a 10 itens");
        protocolId = query.protocolIds
          .map((id) => {
            const numeric = readNumericId(id);
            if (numeric === null) throw new OnchainosError("invalid_request", "protocolId inválido");
            return numeric;
          })
          .join(",");
      }
      const ranges: Record<string, string> = {};
      for (const [key, bounds] of Object.entries(query.ranges ?? {})) {
        if (!(HOT_TOKEN_RANGE_KEYS as readonly string[]).includes(key)) throw new OnchainosError("invalid_request", "faixa não documentada");
        if (bounds === undefined || typeof bounds !== "object" || bounds === null) throw new OnchainosError("invalid_request", "faixa inválida");
        if (bounds.min !== undefined) ranges[`${key}Min`] = rangeText(bounds.min, `${key}Min`);
        if (bounds.max !== undefined) ranges[`${key}Max`] = rangeText(bounds.max, `${key}Max`);
      }
      const limit = query.limit === undefined ? undefined : integerInRange(query.limit, "limit", 1, MAX_HOT_TOKEN_LIMIT);
      const params: QueryInput = {
        rankingType: query.rankingType,
        chainIndex,
        rankBy: query.rankBy,
        rankingTimeFrame: query.rankingTimeFrame,
        riskFilter: optionalFlag(query.riskFilter, "riskFilter"),
        protocolId,
        ...ranges,
        stableTokenFilter: optionalFlag(query.stableTokenFilter, "stableTokenFilter"),
        isLpBurnt: optionalFlag(query.isLpBurnt, "isLpBurnt"),
        isMint: optionalFlag(query.isMint, "isMint"),
        isFreeze: optionalFlag(query.isFreeze, "isFreeze"),
        limit,
        cursor: optionalCursor(query.cursor),
      };
      return readGet(http, "market.token.hot-token", params, (data) => parseHotTokens(data, limit ?? MAX_HOT_TOKEN_LIMIT));
    },

    clusterSupportedChains: () => readGet(http, "market.token.cluster.supported-chain", undefined, (data) => readChainRows(data)),
    clusterOverview: async (token) => readGet(http, "market.token.cluster.overview", singleToken(token), (data) => parseClusterOverview(data)),
    clusterList: async (token) => readGet(http, "market.token.cluster.list", singleToken(token), (data) => parseClusterList(data)),
    clusterTopHolders: async (query) => {
      const rangeFilter = integerInRange(query.rangeFilter, "rangeFilter", 1, 3);
      return readGet(http, "market.token.cluster.top-holders", { ...singleToken(query), rangeFilter }, (data) => parseClusterTopHolders(data));
    },
  };
}
