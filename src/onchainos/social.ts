/**
 * Onchain OS Market, social: sentiment by symbol and the variants by chain and contract, NUMBERS ONLY.
 * Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 7.4 (criterion D14).
 *
 * Why numbers only: posts, news and KOL profiles are text written by third parties and are the cheapest way to try to
 * inject instructions into a model (R1, section f). So nothing textual is copied: no handle, nickname, avatar, post id or
 * URL, no summary, and not even the symbol the provider sends back, which must be one of the symbols that were asked
 * for. What remains is counts, ratios from 0 to 1, scores, times and a closed label.
 *
 * Caveats kept visible: the by symbol query has no chain or contract, so it violates the "chain plus contract" identity
 * (R1) and is low confidence; the tier of these endpoints is not declared by the plan page; the update frequency is not
 * documented.
 */

import { OnchainosError } from "./errors.ts";
import type { OnchainosHttp } from "./http.ts";
import { readGet, type Read } from "./read.ts";
import {
  asArray,
  asRecord,
  field,
  readBoolean,
  readChainIndex,
  readCount,
  readEnum,
  readEpochMs,
  readFraction,
  readNonNegative,
  readPercent,
  readTokenAddress,
  schemaFail,
  type CountUnits,
  type EpochMs,
  type FractionOfOne,
  type PercentByExample,
} from "./values.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_SENTIMENT_SYMBOLS = 20;
export const MAX_TREND_POINTS = 100;
export const MAX_KOLS = 50;
const MAX_TIMELINE_BUCKETS = 400;

export type SentimentTimeFrame = "1h" | "4h" | "24h";
const SENTIMENT_TIME_FRAMES: Readonly<Record<SentimentTimeFrame, number>> = Object.freeze({ "1h": 1, "4h": 2, "24h": 3 });
export type VibeTimeFrame = "24h" | "72h" | "7d" | "30d";
const VIBE_TIME_FRAMES: Readonly<Record<VibeTimeFrame, number>> = Object.freeze({ "24h": 1, "72h": 2, "7d": 3, "30d": 4 });
export type KolSort = "engagement" | "mentions" | "impressions";
const KOL_SORTS: Readonly<Record<KolSort, number>> = Object.freeze({ engagement: 1, mentions: 2, impressions: 3 });

const PERIODS = ["1h", "4h", "24h"] as const;
const LABELS = ["bullish", "bearish", "neutral", "mixed"] as const;
export type SentimentLabel = (typeof LABELS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentimentTrendPoint {
  readonly tsMs: EpochMs;
  readonly mentionCount: CountUnits | null;
  readonly bullishRatio: FractionOfOne | null;
  readonly bearishRatio: FractionOfOne | null;
}

export interface SentimentRow {
  /** The symbol that was asked for, in upper case. */
  readonly symbol: string;
  readonly mentionCount: CountUnits | null;
  readonly xMentionCount: CountUnits | null;
  readonly newsMentionCount: CountUnits | null;
  readonly bullishCount: CountUnits | null;
  readonly bearishCount: CountUnits | null;
  readonly neutralCount: CountUnits | null;
  /** Declared: a ratio from 0 to 1. */
  readonly bullishRatio: FractionOfOne | null;
  readonly bearishRatio: FractionOfOne | null;
  readonly label: SentimentLabel | null;
  readonly trend: SentimentTrendPoint[];
}

export interface SentimentResult {
  readonly period: SentimentTimeFrame | null;
  readonly serverTsMs: EpochMs | null;
  readonly rows: SentimentRow[];
  /** Requested symbols that the provider did not answer. */
  readonly missing: string[];
}

export interface VibeSummary {
  /** Integer from 0 to 100 ("dex_vibe_hotness"). */
  readonly score: number | null;
  /** Signed percentage, presumed (the page does not state the unit). */
  readonly scoreChangeRatePercent: PercentByExample | null;
  readonly mentionsCount: CountUnits | null;
  readonly mentionsCountChangeRatePercent: PercentByExample | null;
  readonly engagement: CountUnits | null;
  readonly engagementChangeRatePercent: PercentByExample | null;
  readonly impressions: CountUnits | null;
  readonly impressionsChangeRatePercent: PercentByExample | null;
  readonly supportFirstMentioned: boolean | null;
}

export interface VibeBucket {
  readonly tsMs: EpochMs;
  readonly score: number | null;
  /** Described by the page as the number of KOLs discussing in the bucket. */
  readonly mentionCount: CountUnits | null;
  /** How many representative KOLs the bucket lists. Who they are is dropped. */
  readonly kolsListedCount: CountUnits | null;
}

export interface VibeTimeline {
  readonly summary: VibeSummary | null;
  readonly timeline: VibeBucket[];
}

export interface KolStat {
  readonly followers: CountUnits | null;
  readonly engagement: CountUnits | null;
  readonly mentions: CountUnits | null;
  readonly impressions: CountUnits | null;
  readonly firstMentionTimeMs: EpochMs | null;
}

// ---------------------------------------------------------------------------
// Parsers (pure)
// ---------------------------------------------------------------------------

function readScore(value: unknown): number | null {
  const n = readNonNegative(value);
  return n !== null && n <= 100 ? n : null;
}

function readTrend(value: unknown): SentimentTrendPoint[] {
  if (value === undefined || value === null) return [];
  return asArray(value, "trend", MAX_TREND_POINTS).map((raw, index) => {
    const record = asRecord(raw, "ponto de tendência", index);
    const tsMs = readEpochMs(field(record, "ts"));
    if (tsMs === null) return schemaFail("campo ts do ponto de tendência ilegível", { rowIndex: index });
    return { tsMs, mentionCount: readCount(field(record, "mentionCount")), bullishRatio: readFraction(field(record, "bullishRatio")), bearishRatio: readFraction(field(record, "bearishRatio")) };
  });
}

export function parseSentiment(data: unknown, requestedSymbols: readonly string[]): SentimentResult {
  const record = asRecord(data, "data");
  const details = field(record, "details");
  const rows = details === undefined || details === null ? [] : asArray(details, "details", requestedSymbols.length);
  const wanted = new Set(requestedSymbols);
  const seen = new Set<string>();
  const parsed = rows.map((raw, index): SentimentRow => {
    const detail = asRecord(raw, "linha", index);
    const echoed = field(detail, "tokenSymbol");
    const symbol = typeof echoed === "string" ? echoed.toUpperCase() : "";
    if (!wanted.has(symbol)) return schemaFail("símbolo fora do pedido", { rowIndex: index });
    if (seen.has(symbol)) return schemaFail("símbolo repetido", { rowIndex: index });
    seen.add(symbol);
    const sentimentValue = field(detail, "sentiment");
    const sentiment = typeof sentimentValue === "object" && sentimentValue !== null && !Array.isArray(sentimentValue) ? (sentimentValue as Record<string, unknown>) : {};
    return {
      symbol,
      mentionCount: readCount(field(detail, "mentionCount")),
      xMentionCount: readCount(field(detail, "xMentionCount")),
      newsMentionCount: readCount(field(detail, "newsMentionCount")),
      bullishCount: readCount(field(sentiment, "bullishCnt")),
      bearishCount: readCount(field(sentiment, "bearishCnt")),
      neutralCount: readCount(field(sentiment, "neutralCnt")),
      bullishRatio: readFraction(field(sentiment, "bullishRatio")),
      bearishRatio: readFraction(field(sentiment, "bearishRatio")),
      label: readEnum(field(sentiment, "label"), LABELS),
      trend: readTrend(field(detail, "trend")),
    };
  });
  return {
    period: readEnum(field(record, "period"), PERIODS),
    serverTsMs: readEpochMs(field(record, "ts")),
    rows: parsed,
    missing: requestedSymbols.filter((symbol) => !seen.has(symbol)),
  };
}

export function parseVibeTimeline(data: unknown): VibeTimeline {
  const record = asRecord(data, "data");
  const summaryValue = field(record, "summary");
  let summary: VibeSummary | null = null;
  if (typeof summaryValue === "object" && summaryValue !== null && !Array.isArray(summaryValue)) {
    const s = summaryValue as Record<string, unknown>;
    summary = {
      score: readScore(field(s, "score")),
      scoreChangeRatePercent: readPercent(field(s, "scoreChangeRate")),
      mentionsCount: readCount(field(s, "mentionsCount")),
      mentionsCountChangeRatePercent: readPercent(field(s, "mentionsCountChangeRate")),
      engagement: readCount(field(s, "engagement")),
      engagementChangeRatePercent: readPercent(field(s, "engagementChangeRate")),
      impressions: readCount(field(s, "impressions")),
      impressionsChangeRatePercent: readPercent(field(s, "impressionsChangeRate")),
      supportFirstMentioned: readBoolean(field(s, "supportFirstMentioned")),
    };
  }
  const timelineValue = field(record, "timeline");
  const timeline = timelineValue === undefined || timelineValue === null
    ? []
    : asArray(timelineValue, "timeline", MAX_TIMELINE_BUCKETS).map((raw, index): VibeBucket => {
        const bucket = asRecord(raw, "bucket", index);
        const tsMs = readEpochMs(field(bucket, "ts"));
        if (tsMs === null) return schemaFail("campo ts do bucket ilegível", { rowIndex: index });
        const kols = field(bucket, "kols");
        return {
          tsMs,
          score: readScore(field(bucket, "score")),
          mentionCount: readCount(field(bucket, "mentionCount")),
          kolsListedCount: Array.isArray(kols) ? Math.min(kols.length, 1_000) : null,
        };
      });
  return { summary, timeline };
}

export function parseVibeTopKols(data: unknown, maxRows: number): KolStat[] {
  let container: unknown = data;
  if (Array.isArray(data)) container = data[0] === undefined ? {} : data[0];
  const record = asRecord(container, "data");
  const kols = field(record, "kols");
  if (kols === undefined || kols === null) return [];
  return asArray(kols, "kols", maxRows).map((raw, index) => {
    const kol = asRecord(raw, "kol", index);
    const first = field(kol, "firstMention");
    const firstRecord = typeof first === "object" && first !== null && !Array.isArray(first) ? (first as Record<string, unknown>) : {};
    return {
      followers: readCount(field(kol, "followers")),
      engagement: readCount(field(kol, "engagement")),
      mentions: readCount(field(kol, "mentions")),
      impressions: readCount(field(kol, "impressions")),
      firstMentionTimeMs: readEpochMs(field(firstRecord, "time")),
    };
  });
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface SentimentQuery {
  /** 1 to 20 symbols; letters and digits only; case insensitive. */
  symbols: readonly string[];
  timeFrame?: SentimentTimeFrame;
  /** 0 or omitted: no trend. Up to 100 equally spaced buckets (client bound; the page states no maximum). */
  trendPoints?: number;
}

export interface VibeQuery {
  chainIndex: string;
  tokenAddress: string;
  timeFrame?: VibeTimeFrame;
}

export interface VibeKolsQuery extends VibeQuery {
  sortBy?: KolSort;
  /** 1 to 50. The page's default is 20. */
  limit?: number;
}

export interface SocialClient {
  sentimentBySymbol(query: SentimentQuery): Promise<Read<SentimentResult>>;
  vibeTimeline(query: VibeQuery): Promise<Read<VibeTimeline>>;
  vibeTopKols(query: VibeKolsQuery): Promise<Read<KolStat[]>>;
}

function identityParams(query: VibeQuery): { chainIndex: string; tokenAddress: string } {
  const chainIndex = readChainIndex(query.chainIndex);
  const tokenAddress = readTokenAddress(query.tokenAddress);
  if (chainIndex === null) throw new OnchainosError("invalid_request", "chainIndex inválido");
  if (tokenAddress === null) throw new OnchainosError("invalid_request", "tokenAddress inválido");
  return { chainIndex, tokenAddress };
}

function mapped<K extends string>(table: Readonly<Record<K, number>>, key: K | undefined, name: string): number | undefined {
  if (key === undefined) return undefined;
  const value = (table as Record<string, number | undefined>)[key];
  if (value === undefined) throw new OnchainosError("invalid_request", `${name} não documentado`);
  return value;
}

export function createSocialClient(http: OnchainosHttp): SocialClient {
  return {
    sentimentBySymbol: async (query) => {
      if (!Array.isArray(query.symbols) || query.symbols.length < 1 || query.symbols.length > MAX_SENTIMENT_SYMBOLS) {
        throw new OnchainosError("invalid_request", `symbols deve ter de 1 a ${MAX_SENTIMENT_SYMBOLS} símbolos`);
      }
      const symbols = query.symbols.map((symbol) => {
        if (typeof symbol !== "string" || !/^[A-Za-z0-9]{1,20}$/.test(symbol)) throw new OnchainosError("invalid_request", "símbolo deve ter de 1 a 20 letras ou dígitos");
        return symbol.toUpperCase();
      });
      if (new Set(symbols).size !== symbols.length) throw new OnchainosError("invalid_request", "símbolo repetido na lista");
      const timeFrame = mapped(SENTIMENT_TIME_FRAMES, query.timeFrame, "timeFrame");
      let trendPoints: number | undefined;
      if (query.trendPoints !== undefined) {
        if (!Number.isInteger(query.trendPoints) || query.trendPoints < 0 || query.trendPoints > MAX_TREND_POINTS) throw new OnchainosError("invalid_request", `trendPoints deve ser um inteiro de 0 a ${MAX_TREND_POINTS}`);
        trendPoints = query.trendPoints === 0 ? undefined : query.trendPoints;
      }
      return readGet(http, "market.social.sentiment-symbol", { tokenSymbols: symbols.join(","), timeFrame, trendPoints }, (data) => parseSentiment(data, symbols));
    },

    vibeTimeline: async (query) => {
      const identity = identityParams(query);
      const timeFrame = mapped(VIBE_TIME_FRAMES, query.timeFrame, "timeFrame");
      return readGet(http, "market.social.vibe-timeline", { ...identity, timeFrame }, (data) => parseVibeTimeline(data));
    },

    vibeTopKols: async (query) => {
      const identity = identityParams(query);
      const sortBy = mapped(KOL_SORTS, query.sortBy, "sortBy");
      const timeFrame = mapped(VIBE_TIME_FRAMES, query.timeFrame, "timeFrame");
      if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_KOLS)) throw new OnchainosError("invalid_request", `limit deve ser um inteiro de 1 a ${MAX_KOLS}`);
      return readGet(http, "market.social.vibe-top-kols", { ...identity, sortBy, timeFrame, limit: query.limit }, (data) => parseVibeTopKols(data, query.limit ?? MAX_KOLS));
    },
  };
}
