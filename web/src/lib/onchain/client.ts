/**
 * Browser client for the /onchain/* gateway (ONC-8). Calls omit credentials to external origins; relative app APIs may carry the login session, with
 * an optional x-inonu-intent marker; the single envelope and every payload are validated defensively so a
 * response outside the contract becomes an error, never data. No OKX credential ever reaches this side.
 */

import { launchGuard, type Launch, type MemeStage } from "./memepump";
import { backendSession } from "../backend-session";

export const ONCHAIN_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

export type OnchainTier = "free" | "basic" | "premium";
export type OnchainIntent = "user" | "background";

export type OnchainErrorCode =
  | "no_credentials" | "incomplete_credentials" | "budget_exhausted" | "pace_limited"
  | "rate_limited" | "provider_unauthorized" | "provider_payment_required" | "provider_error"
  | "schema" | "unsupported_chain" | "clock_skew" | "bad_request";

export interface OnchainMeta {
  readonly tier: OnchainTier;
  readonly cachedAtMs: number;
  readonly ageMs: number;
  readonly stale: boolean;
  readonly budget: { readonly tier: OnchainTier; readonly used: number; readonly cap: number | null };
}

export type OnchainResult<T> =
  | { readonly ok: true; readonly data: T; readonly meta: OnchainMeta }
  | { readonly ok: false; readonly error: OnchainErrorCode };

/**
 * `backend_stale`: the local server answered 404 to a route that must exist (an old process started before the route was
 * written). `origin_denied`: it answered 403 (the page is not on an origin the server allows). Both used to be reported as
 * `schema`, which the screen printed as "Resposta fora do contrato" and sent people looking for a provider problem.
 */
export type OnchainRequestCode = "network" | "schema" | "backend_stale" | "origin_denied";

export class OnchainRequestError extends Error {
  readonly code: OnchainRequestCode;
  constructor(code: OnchainRequestCode) {
    super(code);
    this.code = code;
  }
}

export interface ChainInfo {
  readonly chainIndex: string;
  readonly name: string | null;
  readonly symbol: string | null;
}

export interface HotToken {
  readonly chainIndex: string;
  readonly symbol: string;
  readonly address: string;
  readonly price: number;
  readonly marketCap: number;
  readonly volumeUsd: number;
  readonly changePct: number;
  readonly liquidityUsd: number;
  readonly holders: number;
  readonly uniqueTraders: number | null;
  readonly txsBuy: number | null;
  readonly txsSell: number | null;
  readonly inflowUsd: number | null;
  readonly riskLevel: number | null;
  readonly top10HoldPct: number | null;
  readonly devHoldPct: number | null;
  readonly bundleHoldPct: number | null;
  readonly firstTradeMs: number | null;
  readonly cursor?: unknown;
}

export interface SearchToken {
  readonly chainIndex: string | null;
  readonly name: string | null;
  readonly symbol: string;
  readonly address: string;
  readonly decimals: number | null;
  readonly price: number;
  readonly changePct: number;
  readonly holders: number | null;
  readonly liquidityUsd: number | null;
  readonly marketCap: number | null;
  readonly communityRecognized: boolean;
  readonly cursor?: unknown;
}

export interface OnchainCandle {
  readonly ts: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly volumeUsd: number;
  readonly confirmed: boolean;
}

export interface TokenPrice {
  readonly chainIndex: string | null;
  readonly address: string | null;
  readonly tsMs: number;
  readonly price: number;
}

export type SignalWalletType = "smart_money" | "kol" | "whale";

export interface Signal {
  readonly tsMs: number;
  readonly chainIndex: string | null;
  readonly walletType: SignalWalletType;
  readonly walletCount: number;
  readonly amountUsd: number;
  readonly priceUsd: number;
  readonly soldRatioPct: number | null;
  readonly token: {
    readonly address: string | null;
    readonly symbol: string | null;
    readonly marketCap: number | null;
    readonly holders: number | null;
    readonly top10HoldPct: number | null;
  };
  readonly cursor?: unknown;
}

export interface LeaderboardRow {
  readonly wallet: string;
  readonly realizedPnlUsd: number;
  readonly realizedPnlPct: number | null;
  readonly winRatePct: number | null;
  readonly avgBuyUsd: number | null;
  readonly txVolumeUsd: number | null;
  readonly txs: number | null;
  readonly lastActiveMs: number | null;
  readonly topTokens: ReadonlyArray<{ readonly symbol: string; readonly pnlUsd: number }>;
}

export interface WalletRow {
  readonly wallet: string;
  readonly holdPct: number;
  readonly boughtAmount: number | null;
  readonly avgBuyPrice: number | null;
  readonly realizedPnlUsd: number | null;
  readonly unrealizedPnlUsd: number | null;
  readonly cursor?: unknown;
}

export interface BudgetTierSnapshot {
  readonly used: number;
  readonly cap: number | null;
  readonly today: number;
  readonly projection: number;
}

export interface BudgetSnapshot {
  readonly month: string;
  readonly restartedFromCorruptFile: boolean;
  readonly tiers: Record<OnchainTier, BudgetTierSnapshot>;
}

export interface OnchainStatus {
  readonly credential: "absent" | "incomplete" | "complete";
  readonly lastCallMs: number | null;
  readonly lastCode: number | null;
  readonly cooldownUntilMs: number | null;
  /** Last clock skew measured from a provider Date header, in ms (server minus local); null before any response. */
  readonly clockOffsetMs: number | null;
}

/* ---------- B1 routes: the exact shapes the backend normalizers emit (see the gateway doc section 4) ---------- */

/** market/price-info: a list of one row; windowed stats group m5, h1, h4 and h24. */
export interface PriceInfo {
  readonly chainIndex: string | null;
  readonly address: string | null;
  readonly tsMs: number | null;
  readonly price: number;
  readonly marketCap: number | null;
  readonly liquidityUsd: number | null;
  readonly holders: number | null;
  readonly circSupply: number | null;
  readonly high24h: number | null;
  readonly low24h: number | null;
  readonly tradeNum: number | null;
  readonly change: { readonly m5: number | null; readonly h1: number | null; readonly h4: number | null; readonly h24: number | null };
  readonly volume: { readonly m5: number | null; readonly h1: number | null; readonly h4: number | null; readonly h24: number | null };
  readonly txs: { readonly m5: number | null; readonly h1: number | null; readonly h4: number | null; readonly h24: number | null };
}

/** token/advanced-info: percents keep the provider's scale untouched. */
export interface TokenRisk {
  readonly chainIndex: string | null;
  readonly address: string | null;
  readonly riskLevel: number | null;
  readonly tags: readonly string[];
  readonly top10HoldPct: number | null;
  readonly devHoldPct: number | null;
  readonly bundleHoldPct: number | null;
  readonly sniperHoldPct: number | null;
  readonly suspiciousHoldPct: number | null;
  readonly lpBurnedPct: number | null;
  readonly devCreateCount: number | null;
  readonly devLaunchedCount: number | null;
  readonly devRugCount: number | null;
  readonly createdMs: number | null;
  readonly progressPct: number | null;
}

export interface PoolRow {
  readonly pool: string | null;
  readonly protocol: string | null;
  readonly liquidityUsd: number;
  readonly address: string | null;
  readonly feePct: number | null;
}

export interface ClusterOverview {
  readonly concentration: "Low" | "Medium" | "High" | null;
  readonly top100HoldPct: number | null;
  readonly newAddressPct: number | null;
  readonly sameFundSourcePct: number | null;
  readonly sameCreationTimePct: number | null;
  readonly rugPullPct: number | null;
}

export interface OnchainTrade {
  readonly id: string | null;
  readonly tsMs: number;
  readonly side: "buy" | "sell";
  readonly priceUsd: number;
  readonly volumeUsd: number;
  readonly dex: string | null;
  readonly wallet: string | null;
  readonly tx: string | null;
}

export interface NewsArticle {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly source: string | null;
  readonly tsMs: number;
  readonly importance: "high" | "medium" | "low" | null;
  readonly symbols: readonly string[];
  readonly sentiments: ReadonlyArray<{ readonly symbol: string; readonly label: "bullish" | "bearish" | "neutral" }>;
}

export interface NewsPage {
  readonly articles: readonly NewsArticle[];
  readonly cursor?: unknown;
}

export type SentimentLabel = "bullish" | "bearish" | "neutral";

export interface SentimentRow {
  readonly symbol: string;
  readonly period: string | null;
  readonly tsMs: number;
  readonly mentions: number | null;
  readonly newsMentions: number | null;
  readonly xMentions: number | null;
  readonly label: SentimentLabel | null;
  readonly bullishRatio: number | null;
  readonly bearishRatio: number | null;
  readonly bullishCount: number | null;
  readonly bearishCount: number | null;
  readonly neutralCount: number | null;
}

export interface VibeTimeline {
  readonly score: number | null;
  readonly scoreChangeRate: number | null;
  readonly mentions: number | null;
  readonly mentionsChangeRate: number | null;
  readonly impressions: number | null;
  readonly engagement: number | null;
  readonly points: ReadonlyArray<{ readonly tsMs: number; readonly score: number }>;
}

export interface KolRow {
  readonly handle: string;
  readonly nickname: string | null;
  readonly followers: number | null;
  readonly mentions: number | null;
  readonly impressions: number | null;
  readonly engagement: number | null;
  readonly firstMentionMs: number | null;
}

/* ---------- defensive parsing ---------- */

const ERRORS = new Set<OnchainErrorCode>([
  "no_credentials", "incomplete_credentials", "budget_exhausted", "pace_limited", "rate_limited",
  "provider_unauthorized", "provider_payment_required", "provider_error", "schema", "unsupported_chain", "clock_skew", "bad_request",
]);
const TIERS = new Set<OnchainTier>(["free", "basic", "premium"]);

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";

function meta(v: unknown): OnchainMeta {
  if (!isRec(v) || !TIERS.has(v.tier as OnchainTier) || !isNum(v.cachedAtMs) || !isNum(v.ageMs) || typeof v.stale !== "boolean") {
    throw new OnchainRequestError("schema");
  }
  const b = v.budget;
  if (!isRec(b) || !TIERS.has(b.tier as OnchainTier) || !isNum(b.used) || !(b.cap === null || isNum(b.cap))) {
    throw new OnchainRequestError("schema");
  }
  return v as unknown as OnchainMeta;
}

/** Validates the envelope, then maps each row through `guard`; any failure is a schema error. */
function rows<T>(raw: unknown, guard: (r: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(raw)) throw new OnchainRequestError("schema");
  return raw.map((r) => {
    if (!isRec(r)) throw new OnchainRequestError("schema");
    const row = guard(r);
    if (row === null) throw new OnchainRequestError("schema");
    return row;
  });
}

const str = (r: Record<string, unknown>, k: string): string | null => (typeof r[k] === "string" ? (r[k] as string) : null);
const num = (r: Record<string, unknown>, k: string): number | null => (isNum(r[k]) ? (r[k] as number) : null);

const SIGNAL_TYPES = new Set(["smart_money", "kol", "whale"]);

/* ---------- transport ---------- */

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; credentials?: "omit" | "same-origin" }) => Promise<Response>;

async function getJson(fetchImpl: FetchLike, base: string, path: string, intent: OnchainIntent): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(`${base}${path}`, {
      method: "GET",
      credentials: backendSession(base),
      headers: intent === "user" ? { "x-inonu-intent": "user" } : {},
    });
  } catch {
    throw new OnchainRequestError("network");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* a non json error page still has a status */
  }
  if (!res.ok) {
    const envelope = isRec(body) && body.ok === false;
    const code = isRec(body) ? String(body.error ?? body.code ?? "") : "";
    // a 404 with no envelope, or the core's constant not_found, is a server that predates the route; a 403 is a refused origin
    if (res.status === 404 && (!envelope || code === "not_found")) throw new OnchainRequestError("backend_stale");
    if (res.status === 403 && (!envelope || code === "forbidden")) throw new OnchainRequestError("origin_denied");
    if (!envelope) throw new OnchainRequestError("schema");
  }
  return body;
}

/** Provider routes carry the single envelope; /onchain/budget and /onchain/status are raw local payloads. */
async function getEnvelope(fetchImpl: FetchLike, base: string, path: string, intent: OnchainIntent): Promise<unknown> {
  const body = await getJson(fetchImpl, base, path, intent);
  if (!isRec(body) || typeof body.ok !== "boolean") throw new OnchainRequestError("schema");
  if (body.ok === false) {
    // the spec'd field is `error`; the gateway serializes it as `code`
    const error = body.error ?? body.code;
    if (!ERRORS.has(error as OnchainErrorCode)) throw new OnchainRequestError("schema");
    return { ok: false, error };
  }
  return { ok: true, data: body.data, meta: meta(body.meta) };
}

function enc(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface OnchainClient {
  chains(intent?: OnchainIntent): Promise<OnchainResult<ChainInfo[]>>;
  clusterChains(intent?: OnchainIntent): Promise<OnchainResult<ChainInfo[]>>;
  priceInfo(params: { chainIndex: string; token: string }, intent?: OnchainIntent): Promise<OnchainResult<PriceInfo[]>>;
  tokenRisk(params: { chainIndex: string; token: string }, intent?: OnchainIntent): Promise<OnchainResult<TokenRisk | null>>;
  pools(params: { chainIndex: string; token: string }, intent?: OnchainIntent): Promise<OnchainResult<PoolRow[]>>;
  clusters(params: { chainIndex: string; token: string }, intent?: OnchainIntent): Promise<OnchainResult<ClusterOverview | null>>;
  trades(params: { chainIndex: string; token: string; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<OnchainTrade[]>>;
  news(params: { symbol?: string; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<NewsPage>>;
  sentiment(params: { symbol: string }, intent?: OnchainIntent): Promise<OnchainResult<SentimentRow | null>>;
  sentimentRanking(params?: { limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<SentimentRow[]>>;
  vibe(params: { chainIndex: string; token: string }, intent?: OnchainIntent): Promise<OnchainResult<VibeTimeline | null>>;
  kols(params: { chainIndex: string; token: string; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<KolRow[]>>;
  signalChains(intent?: OnchainIntent): Promise<OnchainResult<ChainInfo[]>>;
  leaderboardChains(intent?: OnchainIntent): Promise<OnchainResult<ChainInfo[]>>;
  hotTokens(params: { chainIndex: string; timeFrame?: number; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<HotToken[]>>;
  search(params: { chainIndex: string; q: string }, intent?: OnchainIntent): Promise<OnchainResult<SearchToken[]>>;
  candles(params: { chainIndex: string; token: string; bar: string; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<OnchainCandle[]>>;
  price(params: { chainIndex: string; token: string }, intent?: OnchainIntent): Promise<OnchainResult<TokenPrice[]>>;
  signals(params: { chainIndex: string; walletType?: string; token?: string; minAmountUsd?: string; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<Signal[]>>;
  leaderboard(params: { chainIndex: string; timeFrame: number; sortBy: number; walletType?: number }, intent?: OnchainIntent): Promise<OnchainResult<LeaderboardRow[]>>;
  holders(params: { chainIndex: string; token: string; tagFilter?: number; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<WalletRow[]>>;
  topTraders(params: { chainIndex: string; token: string; tagFilter?: number; limit?: number }, intent?: OnchainIntent): Promise<OnchainResult<WalletRow[]>>;
  /** The launches of a chain at one stage of their life (the Memepump family), up to 30, read on a click. */
  memepump(params: { chainIndex: string; stage: MemeStage; protocolIdList?: string }, intent?: OnchainIntent): Promise<OnchainResult<Launch[]>>;
  budget(intent?: OnchainIntent): Promise<BudgetSnapshot>;
  status(intent?: OnchainIntent): Promise<OnchainStatus>;
}

export function createOnchainClient(base: string = ONCHAIN_API_URL, fetchImpl: FetchLike = fetch): OnchainClient {
  const root = base.replace(/\/+$/, "");
  const call = async <T>(path: string, intent: OnchainIntent, guard: (r: Record<string, unknown>) => T | null): Promise<OnchainResult<T[]>> => {
    const res = (await getEnvelope(fetchImpl, root, path, intent)) as { ok: boolean; data?: unknown; meta?: OnchainMeta; error?: OnchainErrorCode };
    if (res.ok !== true) return { ok: false, error: res.error! };
    return { ok: true, data: rows(res.data, guard), meta: res.meta! };
  };

  /** Single-object payloads: the data field must be a record that `guard` accepts whole. */
  const callObj = async <T>(path: string, intent: OnchainIntent, guard: (r: Record<string, unknown>) => T | null): Promise<OnchainResult<T>> => {
    const res = (await getEnvelope(fetchImpl, root, path, intent)) as { ok: boolean; data?: unknown; meta?: OnchainMeta; error?: OnchainErrorCode };
    if (res.ok !== true) return { ok: false, error: res.error! };
    if (!isRec(res.data)) throw new OnchainRequestError("schema");
    const data = guard(res.data);
    if (data === null) throw new OnchainRequestError("schema");
    return { ok: true, data, meta: res.meta! };
  };

  /**
   * Single-object payloads where the gateway legitimately answers data: null ("the provider has
   * nothing for this symbol/token": sentiment without coverage, vibe without a summary, ...).
   * The null flows through as data, so ready+null is the neutral empty state, never an error.
   */
  const callObjOrNull = async <T>(path: string, intent: OnchainIntent, guard: (r: Record<string, unknown>) => T | null): Promise<OnchainResult<T | null>> => {
    const res = (await getEnvelope(fetchImpl, root, path, intent)) as { ok: boolean; data?: unknown; meta?: OnchainMeta; error?: OnchainErrorCode };
    if (res.ok !== true) return { ok: false, error: res.error! };
    if (res.data === null) return { ok: true, data: null, meta: res.meta! };
    if (!isRec(res.data)) throw new OnchainRequestError("schema");
    const data = guard(res.data);
    if (data === null) throw new OnchainRequestError("schema");
    return { ok: true, data, meta: res.meta! };
  };

  const chainRow = (r: Record<string, unknown>): ChainInfo | null =>
    typeof r.chainIndex === "string" && isStrOrNull(r.name) && isStrOrNull(r.symbol)
      ? { chainIndex: r.chainIndex, name: str(r, "name"), symbol: str(r, "symbol") }
      : null;

  const hotRow = (r: Record<string, unknown>): HotToken | null =>
    typeof r.symbol === "string" && typeof r.address === "string" && typeof r.chainIndex === "string" &&
    isNum(r.price) && isNum(r.marketCap) && isNum(r.volumeUsd) && isNum(r.changePct) && isNum(r.liquidityUsd) && isNum(r.holders) &&
    isNumOrNull(r.uniqueTraders) && isNumOrNull(r.txsBuy) && isNumOrNull(r.txsSell) && isNumOrNull(r.inflowUsd) &&
    isNumOrNull(r.riskLevel) && isNumOrNull(r.top10HoldPct) && isNumOrNull(r.devHoldPct) && isNumOrNull(r.bundleHoldPct) && isNumOrNull(r.firstTradeMs)
      ? (r as unknown as HotToken)
      : null;

  const searchRow = (r: Record<string, unknown>): SearchToken | null =>
    typeof r.symbol === "string" && typeof r.address === "string" && isNum(r.price) && isNum(r.changePct) &&
    isStrOrNull(r.chainIndex) && isStrOrNull(r.name) && isNumOrNull(r.decimals) && isNumOrNull(r.holders) &&
    isNumOrNull(r.liquidityUsd) && isNumOrNull(r.marketCap) && typeof r.communityRecognized === "boolean"
      ? (r as unknown as SearchToken)
      : null;

  const candleRow = (r: Record<string, unknown>): OnchainCandle | null =>
    isNum(r.ts) && isNum(r.open) && isNum(r.high) && isNum(r.low) && isNum(r.close) && isNum(r.volume) && isNum(r.volumeUsd) && typeof r.confirmed === "boolean"
      ? (r as unknown as OnchainCandle)
      : null;

  const priceRow = (r: Record<string, unknown>): TokenPrice | null =>
    isNum(r.tsMs) && isNum(r.price) && isStrOrNull(r.chainIndex) && isStrOrNull(r.address) ? (r as unknown as TokenPrice) : null;

  const signalRow = (r: Record<string, unknown>): Signal | null =>
    isNum(r.tsMs) && isNum(r.walletCount) && isNum(r.amountUsd) && isNum(r.priceUsd) &&
    SIGNAL_TYPES.has(String(r.walletType)) && isStrOrNull(r.chainIndex) && isNumOrNull(r.soldRatioPct) && isRec(r.token)
      ? (r as unknown as Signal)
      : null;

  const leaderboardRow = (r: Record<string, unknown>): LeaderboardRow | null =>
    typeof r.wallet === "string" && isNum(r.realizedPnlUsd) && isNumOrNull(r.realizedPnlPct) && isNumOrNull(r.winRatePct) &&
    isNumOrNull(r.avgBuyUsd) && isNumOrNull(r.txVolumeUsd) && isNumOrNull(r.txs) && isNumOrNull(r.lastActiveMs) && Array.isArray(r.topTokens)
      ? (r as unknown as LeaderboardRow)
      : null;

  const walletRow = (r: Record<string, unknown>): WalletRow | null =>
    typeof r.wallet === "string" && isNum(r.holdPct) && isNumOrNull(r.boughtAmount) && isNumOrNull(r.avgBuyPrice) &&
    isNumOrNull(r.realizedPnlUsd) && isNumOrNull(r.unrealizedPnlUsd)
      ? (r as unknown as WalletRow)
      : null;

  const win = (v: unknown): PriceInfo["change"] | null =>
    isRec(v) && isNumOrNull(v.m5) && isNumOrNull(v.h1) && isNumOrNull(v.h4) && isNumOrNull(v.h24)
      ? (v as unknown as PriceInfo["change"])
      : null;

  const priceInfoRow = (r: Record<string, unknown>): PriceInfo | null => {
    const change = win(r.change);
    const volume = win(r.volume);
    const txs = win(r.txs);
    return isNum(r.price) && isNumOrNull(r.tsMs) && isStrOrNull(r.chainIndex) && isStrOrNull(r.address) &&
      isNumOrNull(r.marketCap) && isNumOrNull(r.liquidityUsd) && isNumOrNull(r.holders) && isNumOrNull(r.circSupply) &&
      isNumOrNull(r.high24h) && isNumOrNull(r.low24h) && isNumOrNull(r.tradeNum) && change !== null && volume !== null && txs !== null
      ? ({ ...(r as unknown as Omit<PriceInfo, "change" | "volume" | "txs">), change, volume, txs } as PriceInfo)
      : null;
  };

  const tokenRiskObj = (r: Record<string, unknown>): TokenRisk | null =>
    (r.riskLevel === null || (isNum(r.riskLevel) && Number.isInteger(r.riskLevel) && r.riskLevel >= 0 && r.riskLevel <= 5)) &&
    Array.isArray(r.tags) && (r.tags as unknown[]).every((t) => typeof t === "string") &&
    isStrOrNull(r.chainIndex) && isStrOrNull(r.address) &&
    isNumOrNull(r.top10HoldPct) && isNumOrNull(r.devHoldPct) && isNumOrNull(r.bundleHoldPct) && isNumOrNull(r.sniperHoldPct) &&
    isNumOrNull(r.suspiciousHoldPct) && isNumOrNull(r.lpBurnedPct) && isNumOrNull(r.devCreateCount) && isNumOrNull(r.devLaunchedCount) &&
    isNumOrNull(r.devRugCount) && isNumOrNull(r.createdMs) && isNumOrNull(r.progressPct)
      ? (r as unknown as TokenRisk)
      : null;

  const poolRow = (r: Record<string, unknown>): PoolRow | null =>
    isNum(r.liquidityUsd) && isStrOrNull(r.pool) && isStrOrNull(r.protocol) && isStrOrNull(r.address) && isNumOrNull(r.feePct)
      ? (r as unknown as PoolRow)
      : null;

  const clusterObj = (r: Record<string, unknown>): ClusterOverview | null =>
    (r.concentration === null || r.concentration === "Low" || r.concentration === "Medium" || r.concentration === "High") &&
    isNumOrNull(r.top100HoldPct) && isNumOrNull(r.newAddressPct) && isNumOrNull(r.sameFundSourcePct) &&
    isNumOrNull(r.sameCreationTimePct) && isNumOrNull(r.rugPullPct)
      ? (r as unknown as ClusterOverview)
      : null;

  const tradeRow = (r: Record<string, unknown>): OnchainTrade | null =>
    isNum(r.tsMs) && (r.side === "buy" || r.side === "sell") && isNum(r.priceUsd) && isNum(r.volumeUsd) &&
    isStrOrNull(r.id) && isStrOrNull(r.dex) && isStrOrNull(r.wallet) && isStrOrNull(r.tx)
      ? (r as unknown as OnchainTrade)
      : null;

  const newsArticleRow = (r: Record<string, unknown>): NewsArticle | null =>
    typeof r.id === "string" && typeof r.title === "string" && isNum(r.tsMs) &&
    isStrOrNull(r.summary) && isStrOrNull(r.source) &&
    (r.importance === null || r.importance === "high" || r.importance === "medium" || r.importance === "low") &&
    Array.isArray(r.symbols) && (r.symbols as unknown[]).every((s) => typeof s === "string") &&
    Array.isArray(r.sentiments) &&
    (r.sentiments as unknown[]).every(
      (s) => isRec(s) && typeof s.symbol === "string" && (s.label === "bullish" || s.label === "bearish" || s.label === "neutral"),
    )
      ? (r as unknown as NewsArticle)
      : null;

  const newsObj = (r: Record<string, unknown>): NewsPage | null => {
    if (!Array.isArray(r.articles)) return null;
    const articles = r.articles.map((a) => (isRec(a) ? newsArticleRow(a) : null));
    if (articles.some((a) => a === null)) return null;
    return { articles: articles as NewsArticle[], ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) };
  };

  const SENTIMENT_LABELS = new Set(["bullish", "bearish", "neutral"]);
  const sentimentRow = (r: Record<string, unknown>): SentimentRow | null =>
    typeof r.symbol === "string" && isNum(r.tsMs) && isStrOrNull(r.period) &&
    (r.label === null || SENTIMENT_LABELS.has(String(r.label))) &&
    isNumOrNull(r.mentions) && isNumOrNull(r.newsMentions) && isNumOrNull(r.xMentions) &&
    isNumOrNull(r.bullishRatio) && isNumOrNull(r.bearishRatio) && isNumOrNull(r.bullishCount) &&
    isNumOrNull(r.bearishCount) && isNumOrNull(r.neutralCount)
      ? (r as unknown as SentimentRow)
      : null;

  const vibeObj = (r: Record<string, unknown>): VibeTimeline | null =>
    isNumOrNull(r.score) && isNumOrNull(r.scoreChangeRate) && isNumOrNull(r.mentions) && isNumOrNull(r.mentionsChangeRate) &&
    isNumOrNull(r.impressions) && isNumOrNull(r.engagement) &&
    Array.isArray(r.points) && (r.points as unknown[]).every((p) => isRec(p) && isNum(p.tsMs) && isNum(p.score))
      ? (r as unknown as VibeTimeline)
      : null;

  const kolRow = (r: Record<string, unknown>): KolRow | null =>
    typeof r.handle === "string" && /^[A-Za-z0-9_]{1,32}$/.test(r.handle) && isStrOrNull(r.nickname) &&
    isNumOrNull(r.followers) && isNumOrNull(r.mentions) && isNumOrNull(r.impressions) && isNumOrNull(r.engagement) &&
    isNumOrNull(r.firstMentionMs)
      ? (r as unknown as KolRow)
      : null;

  return {
    chains: (intent = "background") => call("/onchain/chains", intent, chainRow),
    signalChains: (intent = "background") => call("/onchain/signal-chains", intent, chainRow),
    leaderboardChains: (intent = "background") => call("/onchain/leaderboard-chains", intent, chainRow),
    hotTokens: (p, intent = "background") => call(`/onchain/hot-tokens${enc({ chainIndex: p.chainIndex, timeFrame: p.timeFrame, limit: p.limit })}`, intent, hotRow),
    search: (p, intent = "background") => call(`/onchain/search${enc({ chainIndex: p.chainIndex, q: p.q })}`, intent, searchRow),
    candles: (p, intent = "background") => call(`/onchain/candles${enc({ chainIndex: p.chainIndex, token: p.token, bar: p.bar, limit: p.limit })}`, intent, candleRow),
    price: (p, intent = "background") => call(`/onchain/price${enc({ chainIndex: p.chainIndex, token: p.token })}`, intent, priceRow),
    signals: (p, intent = "background") => call(`/onchain/signals${enc({ chainIndex: p.chainIndex, walletType: p.walletType, token: p.token, minAmountUsd: p.minAmountUsd, limit: p.limit })}`, intent, signalRow),
    leaderboard: (p, intent = "background") => call(`/onchain/leaderboard${enc({ chainIndex: p.chainIndex, timeFrame: p.timeFrame, sortBy: p.sortBy, walletType: p.walletType })}`, intent, leaderboardRow),
    holders: (p, intent = "background") => call(`/onchain/holders${enc({ chainIndex: p.chainIndex, token: p.token, tagFilter: p.tagFilter, limit: p.limit })}`, intent, walletRow),
    memepump: (p, intent = "background") => call(`/onchain/memepump-list${enc({ chainIndex: p.chainIndex, stage: p.stage, protocolIdList: p.protocolIdList })}`, intent, launchGuard),
    topTraders: (p, intent = "background") => call(`/onchain/top-traders${enc({ chainIndex: p.chainIndex, token: p.token, tagFilter: p.tagFilter, limit: p.limit })}`, intent, walletRow),
    clusterChains: (intent = "background") => call("/onchain/cluster-chains", intent, chainRow),
    priceInfo: (p, intent = "background") => call(`/onchain/price-info${enc({ chainIndex: p.chainIndex, token: p.token })}`, intent, priceInfoRow),
    tokenRisk: (p, intent = "background") => callObjOrNull(`/onchain/token-risk${enc({ chainIndex: p.chainIndex, token: p.token })}`, intent, tokenRiskObj),
    pools: (p, intent = "background") => call(`/onchain/pools${enc({ chainIndex: p.chainIndex, token: p.token })}`, intent, poolRow),
    clusters: (p, intent = "background") => callObjOrNull(`/onchain/clusters${enc({ chainIndex: p.chainIndex, token: p.token })}`, intent, clusterObj),
    trades: (p, intent = "background") => call(`/onchain/trades${enc({ chainIndex: p.chainIndex, token: p.token, limit: p.limit })}`, intent, tradeRow),
    news: (p, intent = "background") => callObj(`/onchain/news${enc({ symbol: p.symbol, limit: p.limit })}`, intent, newsObj),
    sentiment: (p, intent = "background") => callObjOrNull(`/onchain/sentiment${enc({ symbol: p.symbol })}`, intent, sentimentRow),
    sentimentRanking: (p = {}, intent = "background") => call(`/onchain/sentiment-ranking${enc({ limit: p.limit })}`, intent, sentimentRow),
    vibe: (p, intent = "background") => callObjOrNull(`/onchain/vibe${enc({ chainIndex: p.chainIndex, token: p.token })}`, intent, vibeObj),
    kols: (p, intent = "background") => call(`/onchain/kols${enc({ chainIndex: p.chainIndex, token: p.token, limit: p.limit })}`, intent, kolRow),
    async budget(intent = "user") {
      const res = await getJson(fetchImpl, root, "/onchain/budget", intent);
      if (!isRec(res) || typeof res.month !== "string" || typeof res.restartedFromCorruptFile !== "boolean" || !isRec(res.tiers)) {
        throw new OnchainRequestError("schema");
      }
      for (const t of ["free", "basic", "premium"] as const) {
        const s = res.tiers[t];
        if (!isRec(s) || !isNum(s.used) || !isNum(s.today) || !isNum(s.projection) || !(s.cap === null || isNum(s.cap))) {
          throw new OnchainRequestError("schema");
        }
      }
      return res as unknown as BudgetSnapshot;
    },
    async status(intent = "user") {
      const res = await getJson(fetchImpl, root, "/onchain/status", intent);
      if (
        !isRec(res) ||
        !["absent", "incomplete", "complete"].includes(String(res.credential)) ||
        !(res.lastCallMs === null || isNum(res.lastCallMs)) ||
        !(res.lastCode === null || isNum(res.lastCode)) ||
        !(res.cooldownUntilMs === null || isNum(res.cooldownUntilMs)) ||
        !(res.clockOffsetMs === null || isNum(res.clockOffsetMs))
      ) {
        throw new OnchainRequestError("schema");
      }
      return res as unknown as OnchainStatus;
    },
  };
}
