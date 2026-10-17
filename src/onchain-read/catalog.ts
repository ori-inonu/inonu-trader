/**
 * Endpoint allowlist of the read-only OnchainOS gateway (spec ONC-2, gateway doc §3 and §4). Each entry knows
 * the local route, the provider request it builds, the fee tier, the minimum TTL, the parameter validator and
 * the response normalizer. Anything outside this table is refused before any network call.
 *
 * Field mapping decisions (doc §4): provider numbers arrive as strings; a row whose REQUIRED field does not
 * convert is dropped entirely (never becomes zero); secondary fields that the provider legitimately returns
 * empty (devHoldPercent, bundleHoldPercent, ...) become null instead of dropping the row. Image URLs, funding
 * sources and the trigger wallet addresses of signals are never forwarded; leaderboard/holder/trader wallets
 * are shortened to first4...last4. `cursor` is passed through unconverted so a later delivery can paginate.
 */
import { normalizeTokenAddress } from "../okx-market/token-identity";
import { readCount, readDecimal, readEpochMs, readEpochMsByExample, readNonNegative, readPercent, readPositive } from "../onchainos/values";
import { EXTRA_ENDPOINTS } from "./routes";

export type OnchainTier = "free" | "basic" | "premium";

export type OnchainErrorCode =
 | "no_credentials" | "incomplete_credentials" | "budget_exhausted" | "pace_limited"
 | "rate_limited" | "provider_unauthorized" | "provider_payment_required" | "provider_error"
 | "schema" | "unsupported_chain" | "bad_request" | "clock_skew";

export interface ProviderRequest {
 readonly method: "GET" | "POST";
 /** Provider path including the exact query string that gets signed. */
 readonly path: string;
 readonly body?: string;
}

export type Params = Readonly<Record<string, string>>;

export type Validation =
 | { readonly ok: true; readonly request: ProviderRequest; readonly ttlMs: number }
 | { readonly ok: false; readonly error: "bad_request" };

export type Normalized = { readonly ok: true; readonly data: unknown } | { readonly ok: false };

export interface Endpoint {
 readonly id: string;
 readonly route: string;
 readonly tier: OnchainTier;
 validate(params: Params): Validation;
 normalize(data: unknown): Normalized;
 normalizeRequest?(data: unknown, params: Params, nowMs: number, internal?: boolean): Normalized;
 revalidateCached?(data: unknown, nowMs: number): unknown;
 /**
  * The same payload for the server process only (fase-2 F2-OCX-14): full wallet addresses and the sold quantity that the
  * browser shape drops. Reached through `gateway.callInternal`, never through an HTTP route.
  */
 normalizeInternal?(data: unknown): Normalized;
}

const DAY_MS = 24 * 3_600_000;
const SIGNAL_MAX_AGE_MS = 6 * 3_600_000;

/** Strict numeric conversion: strings must be non-empty and fully numeric-looking; anything else is null. */
function num(v: unknown): number | null {
 if (typeof v === "number") return Number.isFinite(v) ? v : null;
 if (typeof v !== "string" || v.trim() === "") return null;
 const n = Number(v);
 return Number.isFinite(n) ? n : null;
}

function text(v: unknown): string | null {
 return typeof v === "string" && v !== "" ? v : null;
}

function rec(v: unknown): Record<string, unknown> | null {
 return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function arr(v: unknown): unknown[] {
 return Array.isArray(v) ? v : [];
}

/** First 4 and last 4 characters; short addresses stay whole. */
export function shortWallet(address: string): string {
 return address.length > 8 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
}

const STRIPPED = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/**
 * Untrusted third-party text (news titles, handles, pool names): control and bidi characters are stripped,
 * the punctuation the desk forbids is normalized, whitespace collapses and the result truncates at max.
 * Anything that is not a non-empty string becomes null.
 */
export function cleanText(v: unknown, max: number): string | null {
 if (typeof v !== "string") return null;
 const s = v
  .replace(STRIPPED, "")
  .replace(/[\u2014\u2013]/g, "-")
  .replace(/\u00b7/g, " ")
  .replace(/\s+/g, " ")
  .trim();
 if (s === "") return null;
 return s.length > max ? s.slice(0, max) : s;
}

const DIGITS = /^\d{1,12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Every query parameter must be declared; anything extra is a bad request. */
function allowed(params: Params, keys: readonly string[]): boolean {
 return Object.keys(params).every((k) => keys.includes(k));
}

function intIn(v: string | undefined, min: number, max: number): number | null {
 if (v === undefined || !/^\d+$/.test(v)) return null;
 const n = Number(v);
 return n >= min && n <= max ? n : null;
}

/** Optional integer in range; undefined passes through as undefined, invalid is null (rejected). */
function optInt(params: Params, key: string, min: number, max: number): number | undefined | null {
 if (params[key] === undefined) return undefined;
 return intIn(params[key], min, max);
}

function get(path: string, query: Record<string, string | number | undefined>): ProviderRequest {
 const search = new URLSearchParams();
 for (const [k, v] of Object.entries(query)) if (v !== undefined) search.set(k, String(v));
 const qs = search.toString();
 return { method: "GET", path: qs ? `${path}?${qs}` : path };
}

function post(path: string, body: unknown): ProviderRequest {
 return { method: "POST", path, body: JSON.stringify(body) };
}

const bad: Validation = { ok: false, error: "bad_request" };
const none = (data: unknown): Normalized => ({ ok: true, data });

/**
 * "No data" is not a contract violation: single-object routes treat a null payload or an empty
 * array envelope as a legitimate empty answer (verified live: sentiment/symbol answers
 * {details: []} for symbols without coverage). The gateway caches and serves data: null like any
 * other answer, and the web renders a neutral "Sem dados" line instead of an error.
 */
const EMPTY_OK: Normalized = { ok: true, data: null };
const emptyPayload = (data: unknown): boolean => data === null || (Array.isArray(data) && data.length === 0);

/* ---------- normalizers ---------- */

/** /supported/chain variants: {chainIndex, chainName, chainSymbol}. */
function normalizeChainList(data: unknown): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null && text(r.chainIndex) !== null)
  .map((r) => ({ chainIndex: r.chainIndex, name: text(r.chainName), symbol: text(r.chainSymbol) }));
 return { ok: true, data: rows };
}

function normalizeHotTokens(data: unknown): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const price = readPositive(r.price);
   const changePct = readDecimal(r.change);
   if (price === null || changePct === null) return null;
   const marketCap = readNonNegative(r.marketCap);
   const volumeUsd = readNonNegative(r.volume);
   const liquidityUsd = readNonNegative(r.liquidity);
   const holders = readCount(r.holders);
   const risk = readCount(r.riskLevelControl);
   return {
    chainIndex: text(r.chainIndex),
    symbol: text(r.tokenSymbol),
    address: text(r.tokenContractAddress),
    price, marketCap, volumeUsd, changePct, liquidityUsd, holders,
    uniqueTraders: readCount(r.uniqueTraders),
    txsBuy: readCount(r.txsBuy),
    txsSell: readCount(r.txsSell),
    inflowUsd: readDecimal(r.inflowUsd),
    riskLevel: risk !== null && risk >= 1 && risk <= 5 ? risk : null,
    top10HoldPct: readPercent(r.top10HoldPercent, { min: 0, max: 100 }),
    devHoldPct: readPercent(r.devHoldPercent, { min: 0, max: 100 }),
    bundleHoldPct: readPercent(r.bundleHoldPercent, { min: 0, max: 100 }),
    firstTradeMs: readEpochMsByExample(r.firstTradeTime),
    ...(r.cursor !== undefined ? { cursor: r.cursor } : {}),
   };
  })
  .filter((r) => r !== null && r.chainIndex !== null && r.symbol !== null && r.address !== null);
 return { ok: true, data: rows };
}

function normalizeSearch(data: unknown): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const price = num(r.price);
   const changePct = num(r.change);
   if (price === null || changePct === null) return null;
   const tags = rec(r.tagList);
   return {
    chainIndex: text(r.chainIndex),
    name: text(r.tokenName),
    symbol: text(r.tokenSymbol),
    address: text(r.tokenContractAddress),
    decimals: num(r.decimal),
    price,
    changePct,
    holders: num(r.holders),
    liquidityUsd: num(r.liquidity),
    marketCap: num(r.marketCap),
    communityRecognized: tags?.communityRecognized === true,
    ...(r.cursor !== undefined ? { cursor: r.cursor } : {}),
   };
  })
  .filter((r) => r !== null && r.address !== null && r.symbol !== null);
 return { ok: true, data: rows };
}

/** Provider sends newest first: [ts,o,h,l,c,vol,volUsd,confirm]. An impossible bar fails the whole call. */
function normalizeCandles(data: unknown): Normalized {
 const out: Array<{ ts: number; open: number; high: number; low: number; close: number; volume: number; volumeUsd: number; confirmed: boolean }> = [];
 for (const raw of arr(data)) {
  if (!Array.isArray(raw) || raw.length < 8) continue;
  const [ts, o, h, l, c, vol, volUsd] = raw.map(num) as Array<number | null | undefined>;
  if (ts == null || o == null || h == null || l == null || c == null || vol == null || volUsd == null) continue;
  if (h < l || h < c || h < o || l > o || l > c) return { ok: false };
  out.push({ ts, open: o, high: h, low: l, close: c, volume: vol, volumeUsd: volUsd, confirmed: raw[7] === "1" });
 }
 out.sort((a, b) => a.ts - b.ts);
 return { ok: true, data: out };
}

function normalizePrice(data: unknown): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const price = num(r.price);
   const tsMs = num(r.time);
   if (price === null || tsMs === null) return null;
   return { chainIndex: text(r.chainIndex), address: text(r.tokenContractAddress), tsMs, price };
  })
  .filter((r) => r !== null);
 return { ok: true, data: rows };
}

const WALLET_TYPES: Record<string, string> = {
 "1": "smart_money", "2": "kol", "3": "whale",
 SMART_MONEY: "smart_money", INFLUENCER: "kol", KOL: "kol", WHALE: "whale",
};

const WALLET_ADDRESS = /^[A-Za-z0-9]{20,90}$/;

/** `triggerWalletAddress` is a comma separated string; entries that do not look like an address are dropped. */
function walletList(v: unknown): string[] {
 if (typeof v !== "string") return [];
 return v.split(",").map((s) => s.trim()).filter((s) => WALLET_ADDRESS.test(s)).slice(0, 50);
}

function normalizeSignals(data: unknown, internal = false, params?: Params, nowMs?: number): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const tsMs = readEpochMsByExample(r.timestamp);
   const amountUsd = readNonNegative(r.amountUsd);
   const priceUsd = readPositive(r.price);
   const walletCount = readCount(r.triggerWalletCount);
   const kind = WALLET_TYPES[text(r.walletType) ?? ""];
   const token = rec(r.token);
   if (tsMs === null || amountUsd === null || priceUsd === null || walletCount === null || kind === undefined || token === null) return null;
   const chainIndex = text(r.chainIndex);
   const address = text(token.tokenAddress);
   if (params?.chainIndex !== undefined &&
    (chainIndex === null || address === null || chainIndex !== params.chainIndex ||
     (params.token !== undefined &&
      normalizeTokenAddress(params.chainIndex, address) !== normalizeTokenAddress(params.chainIndex, params.token)))) return null;
   return {
    tsMs,
    chainIndex,
    walletType: kind,
    walletCount,
    amountUsd,
    priceUsd,
    soldRatioPct: readPercent(r.soldRatioPercent, { min: 0, max: 100 }),
    token: {
     address,
     symbol: text(token.symbol),
     marketCap: readNonNegative(token.marketCapUsd),
     holders: readCount(token.holders),
     top10HoldPct: readPercent(token.top10HolderPercent, { min: 0, max: 100 }),
    },
    ...(internal ? { wallets: walletList(r.triggerWalletAddress) } : {}),
    ...(r.cursor !== undefined ? { cursor: r.cursor } : {}),
   };
  })
  .filter((r) => r !== null && (nowMs === undefined || (r.tsMs <= nowMs && r.tsMs >= nowMs - SIGNAL_MAX_AGE_MS)));
 return { ok: true, data: rows };
}

/** A normalized signals cache value is rechecked at serve time without rewriting its cache entry. */
function revalidateCachedSignals(data: unknown, nowMs: number): unknown {
 if (!Array.isArray(data)) return data;
 return data.filter((row) => {
  const tsMs = rec(row)?.tsMs;
  return typeof tsMs === "number" && tsMs <= nowMs && tsMs >= nowMs - SIGNAL_MAX_AGE_MS;
 });
}

function normalizeLeaderboard(data: unknown, internal = false): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const wallet = text(r.walletAddress);
   const realizedPnlUsd = num(r.realizedPnlUsd);
   if (wallet === null || realizedPnlUsd === null) return null;
   const topTokens = arr(r.topPnlTokenList)
    .map(rec)
    .filter((t): t is Record<string, unknown> => t !== null)
    .map((t) => {
     // the page documents tokenPnlUsd, the live answer spells it tokenPnLUsd (measured 2026-10-12)
     const pnlUsd = num(t.tokenPnlUsd ?? t.tokenPnLUsd);
     const symbol = text(t.tokenSymbol);
     return pnlUsd === null || symbol === null ? null : { symbol, pnlUsd };
    })
    .filter((t) => t !== null);
   return {
    wallet: internal ? wallet : shortWallet(wallet),
    realizedPnlUsd,
    realizedPnlPct: num(r.realizedPnlPercent),
    winRatePct: num(r.winRatePercent),
    avgBuyUsd: num(r.avgBuyValueUsd),
    txVolumeUsd: num(r.txVolume),
    txs: num(r.txs),
    lastActiveMs: num(r.lastActiveTimestamp),
    topTokens,
   };
  })
  .filter((r) => r !== null);
 return { ok: true, data: rows };
}

function normalizeWallets(data: unknown, internal = false): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const wallet = text(r.holderWalletAddress);
   const holdPct = num(r.holdPercent);
   if (wallet === null || holdPct === null) return null;
   return {
    wallet: internal ? wallet : shortWallet(wallet),
    holdPct,
    boughtAmount: num(r.boughtAmount),
    avgBuyPrice: num(r.avgBuyPrice),
    realizedPnlUsd: num(r.realizedPnlUsd),
    unrealizedPnlUsd: num(r.unrealizedPnlUsd),
    // top-trader sends soldAmount, holder sends totalSellAmount (API-5); the browser shape never carried either
    ...(internal ? { soldAmount: num(r.soldAmount ?? r.totalSellAmount), avgSellPrice: num(r.avgSellPrice) } : {}),
    ...(r.cursor !== undefined ? { cursor: r.cursor } : {}),
   };
  })
  .filter((r) => r !== null);
 return { ok: true, data: rows };
}
/** market/price-info: identity and time checks use the documented request key and millisecond timestamp. */
function normalizePriceInfo(data: unknown, params?: Params, nowMs = Date.now()): Normalized {
 const expectedChain = params?.chainIndex;
 const expectedToken = expectedChain !== undefined && params?.token !== undefined
  ? normalizeTokenAddress(expectedChain, params.token) : null;
 const rows: Record<string, unknown>[] = [];
 for (const raw of arr(data)) {
  const r = rec(raw);
  if (r === null) continue;
  const chainIndex = text(r.chainIndex);
  const address = text(r.tokenContractAddress);
  if ((chainIndex !== null && expectedChain !== undefined && chainIndex !== expectedChain) ||
   (address !== null && expectedToken !== null && expectedChain !== undefined && normalizeTokenAddress(expectedChain, address) !== expectedToken)) continue;
  const tsMs = r.time === undefined ? null : readEpochMs(r.time);
  if (r.time !== undefined && (tsMs === null || tsMs > nowMs)) continue;
  const price = readPositive(r.price);
  if (price === null) continue;
  const win = (prefix: string) => ({
   m5: prefix === "priceChange" ? readDecimal(r[`${prefix}5M`]) : prefix === "txs" ? readCount(r[`${prefix}5M`]) : readNonNegative(r[`${prefix}5M`]),
   h1: prefix === "priceChange" ? readDecimal(r[`${prefix}1H`]) : prefix === "txs" ? readCount(r[`${prefix}1H`]) : readNonNegative(r[`${prefix}1H`]),
   h4: prefix === "priceChange" ? readDecimal(r[`${prefix}4H`]) : prefix === "txs" ? readCount(r[`${prefix}4H`]) : readNonNegative(r[`${prefix}4H`]),
   h24: prefix === "priceChange" ? readDecimal(r[`${prefix}24H`]) : prefix === "txs" ? readCount(r[`${prefix}24H`]) : readNonNegative(r[`${prefix}24H`]),
  });
  rows.push({
   chainIndex, address, tsMs, price,
   marketCap: readNonNegative(r.marketCap), liquidityUsd: readNonNegative(r.liquidity), holders: readCount(r.holders), circSupply: readNonNegative(r.circSupply),
   high24h: readPositive(r.maxPrice), low24h: readPositive(r.minPrice), tradeNum: readNonNegative(r.tradeNum),
   change: win("priceChange"), volume: win("volume"), txs: win("txs"),
  });
 }
 if (rows.length > 1) {
  const first = JSON.stringify(rows[0]);
  if (rows.some((row) => JSON.stringify(row) !== first)) return { ok: true, data: [] };
  rows.splice(1);
 }
 return { ok: true, data: rows };
}

/** token/advanced-info: a single object; percent fields keep the provider's scale untouched. */
function normalizeTokenRisk(data: unknown, params?: Params): Normalized {
 if (emptyPayload(data)) return EMPTY_OK;
 const r = rec(data);
 if (r === null) return { ok: false };
 const chainIndex = text(r.chainIndex);
 const address = text(r.tokenContractAddress);
 if ((chainIndex !== null && params?.chainIndex !== undefined && chainIndex !== params.chainIndex) ||
  (address !== null && params?.token !== undefined && params.chainIndex !== undefined &&
   normalizeTokenAddress(params.chainIndex, address) !== normalizeTokenAddress(params.chainIndex, params.token))) return { ok: false };
 const risk = readCount(r.riskControlLevel);
 const tags = arr(r.tokenTags)
  // 40, not 32: the documented dexScreenerTokenCommunityTakeOver has 33 characters
  .filter((t): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(t))
  .slice(0, 12);
 return {
  ok: true,
  data: {
   chainIndex: text(r.chainIndex),
   address: text(r.tokenContractAddress),
   riskLevel: risk !== null && risk >= 1 && risk <= 5 ? risk : null,
   tags,
   top10HoldPct: readPercent(r.top10HoldPercent, { min: 0, max: 100 }),
   devHoldPct: readPercent(r.devHoldingPercent, { min: 0, max: 100 }),
   bundleHoldPct: readPercent(r.bundleHoldingPercent, { min: 0, max: 100 }),
   sniperHoldPct: readPercent(r.sniperHoldingPercent, { min: 0, max: 100 }),
   suspiciousHoldPct: readPercent(r.suspiciousHoldingPercent, { min: 0, max: 100 }),
   lpBurnedPct: readPercent(r.lpBurnedPercent, { min: 0, max: 100 }),
   devCreateCount: readCount(r.devCreateTokenCount),
   devLaunchedCount: readCount(r.devLaunchedTokenCount),
   devRugCount: readCount(r.devRugPullTokenCount),
   createdMs: readEpochMsByExample(r.createTime),
   progressPct: readNonNegative(r.progress),
  },
 };
}

function normalizePools(data: unknown): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const liquidityUsd = num(r.liquidityUsd);
   if (liquidityUsd === null) return null;
   const lpFee = readPercent(r.liquidityProviderFeePercent);
   const pool = text(r.poolAddress);
   return {
    pool: cleanText(r.pool, 48),
    protocol: cleanText(r.protocolName, 32),
    liquidityUsd,
    address: pool !== null ? shortWallet(pool) : null,
    feePct: lpFee !== null ? lpFee : readPercent(r.poolBasicFeePercent),
   };
  })
  .filter((r) => r !== null);
 return { ok: true, data: rows };
}

function normalizeClusterOverview(data: unknown): Normalized {
 if (emptyPayload(data)) return EMPTY_OK;
 const r = rec(data);
 if (r === null) return { ok: false };
 const c = text(r.ClusterConcentration);
 return {
  ok: true,
  data: {
   concentration: c === "Low" || c === "Medium" || c === "High" ? c : null,
   top100HoldPct: num(r.top100HoldingsPercent),
   newAddressPct: num(r.holderNewAddressPercent),
   sameFundSourcePct: num(r.holderSameFundSourcePercent),
   sameCreationTimePct: num(r.holderSameCreationTimePercent),
   rugPullPct: num(r.rugPullPercent),
  },
 };
}

function normalizeTrades(data: unknown): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const tsMs = num(r.time);
   const t = text(r.type);
   const priceUsd = num(r.price);
   const volumeUsd = num(r.volume);
   if (tsMs === null || (t !== "buy" && t !== "sell") || priceUsd === null || volumeUsd === null) return null;
   const wallet = text(r.userAddress);
   const tx = text(r.txHashUrl);
   return {
    id: cleanText(r.id, 96),
    tsMs,
    side: t,
    priceUsd,
    volumeUsd,
    dex: cleanText(r.dexName, 32),
    wallet: wallet !== null ? shortWallet(wallet) : null,
    tx: tx !== null ? shortWallet(tx) : null,
   };
  })
  .filter((r) => r !== null);
 rows.sort((a, b) => b.tsMs - a.tsMs); // newest first
 return { ok: true, data: rows };
}

const NEWS_SYMBOL = /^[A-Za-z0-9]{1,20}$/;
const SENTIMENT_LABELS = new Set(["bullish", "bearish", "neutral"]);
const IMPORTANCE_LEVELS = new Set(["high", "medium", "low"]);

/**
 * News articles are third-party untrusted text: they are rendered as plain text on the desk and must
 * never feed Jev. `content` and `sourceUrl` are never forwarded.
 */
function normalizeNews(data: unknown): Normalized {
 if (emptyPayload(data)) return { ok: true, data: { articles: [] } };
 const r = rec(data);
 if (r === null) return { ok: false };
 const rows = arr(r.articles)
  .map(rec)
  .filter((a): a is Record<string, unknown> => a !== null)
  .map((a) => {
   const id = cleanText(a.id, 40);
   const title = cleanText(a.title, 200);
   const tsMs = num(a.timestamp);
   if (id === null || title === null || tsMs === null) return null;
   const importance = text(a.importance);
   const symbols = arr(a.tokenSymbols)
    .filter((s): s is string => typeof s === "string" && NEWS_SYMBOL.test(s))
    .slice(0, 8);
   const sentiments = arr(a.tokenSymbolSentiments)
    .map(rec)
    .filter((s): s is Record<string, unknown> => s !== null)
    .map((s) => {
     const symbol = text(s.tokenSymbol);
     const label = text(s.sentiment);
     if (symbol === null || !NEWS_SYMBOL.test(symbol) || label === null || !SENTIMENT_LABELS.has(label)) return null;
     return { symbol, label };
    })
    .filter((s) => s !== null)
    .slice(0, 8);
   return {
    id,
    title,
    summary: cleanText(a.summary, 300),
    source: cleanText(a.source, 48),
    tsMs,
    importance: importance !== null && IMPORTANCE_LEVELS.has(importance) ? importance : null,
    symbols,
    sentiments,
   };
  })
  .filter((a) => a !== null);
 return { ok: true, data: { articles: rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) } };
}

/** One row of the sentiment payload; the envelope-level period and ts repeat inside it. */
function sentimentRow(d: Record<string, unknown>, period: string | null, tsMs: number | null) {
 const symbol = text(d.tokenSymbol);
 if (symbol === null || tsMs === null) return null;
 const s = rec(d.sentiment);
 const label = s !== null ? text(s.label) : null;
 return {
  symbol,
  period,
  tsMs,
  mentions: num(d.mentionCount),
  newsMentions: num(d.newsMentionCount),
  xMentions: num(d.xMentionCount),
  label: label !== null && SENTIMENT_LABELS.has(label) ? label : null,
  bullishRatio: s !== null ? num(s.bullishRatio) : null,
  bearishRatio: s !== null ? num(s.bearishRatio) : null,
  bullishCount: s !== null ? num(s.bullishCnt) : null,
  bearishCount: s !== null ? num(s.bearishCnt) : null,
  neutralCount: s !== null ? num(s.neutralCnt) : null,
 };
}

/**
 * sentiment/symbol: a symbol without coverage answers a valid envelope with details: []
 * (verified live). That is empty data, not a schema violation; details missing or not an array
 * still is, and so is a detail row that fails conversion.
 */
function normalizeSentiment(data: unknown): Normalized {
 if (emptyPayload(data)) return EMPTY_OK;
 const r = rec(data);
 if (r === null || !Array.isArray(r.details)) return { ok: false };
 if (r.details.length === 0) return EMPTY_OK;
 const period = cleanText(r.period, 8);
 const tsMs = num(r.ts);
 const first = r.details
  .map(rec)
  .filter((d): d is Record<string, unknown> => d !== null)
  .map((d) => sentimentRow(d, period, tsMs))
  .filter((d) => d !== null)[0];
 if (first === undefined) return { ok: false };
 return { ok: true, data: first };
}

function normalizeSentimentRanking(data: unknown): Normalized {
 if (emptyPayload(data)) return { ok: true, data: [] };
 const r = rec(data);
 if (r === null) return { ok: false };
 const period = cleanText(r.period, 8);
 const tsMs = num(r.ts);
 const rows = arr(r.details)
  .map(rec)
  .filter((d): d is Record<string, unknown> => d !== null)
  .map((d) => sentimentRow(d, period, tsMs))
  .filter((d) => d !== null);
 return { ok: true, data: rows };
}

/**
 * Vibe timeline: the summary object plus the score points; every kols list is dropped. A token
 * without social coverage answers the envelope with summary missing or null: that is empty data,
 * not a schema violation. A summary of the wrong type still is.
 */
function normalizeVibe(data: unknown): Normalized {
 if (emptyPayload(data)) return EMPTY_OK;
 const r = rec(data);
 if (r === null) return { ok: false };
 if (r.summary === undefined || r.summary === null) return EMPTY_OK;
 const s = rec(r.summary);
 if (s === null) return { ok: false };
 const points = arr(r.timeline)
  .map(rec)
  .filter((t): t is Record<string, unknown> => t !== null)
  .map((t) => {
   const tsMs = num(t.ts);
   const score = num(t.score);
   return tsMs === null || score === null ? null : { tsMs, score };
  })
  .filter((t) => t !== null)
  .slice(0, 48);
 return {
  ok: true,
  data: {
   score: num(s.score),
   scoreChangeRate: num(s.scoreChangeRate),
   mentions: num(s.mentionsCount),
   mentionsChangeRate: num(s.mentionsCountChangeRate),
   impressions: num(s.impressions),
   engagement: num(s.engagement),
   points,
  },
 };
}

function normalizeKols(data: unknown): Normalized {
 if (emptyPayload(data)) return { ok: true, data: [] };
 const r = rec(data);
 if (r === null) return { ok: false };
 const rows = arr(r.kols)
  .map(rec)
  .filter((k): k is Record<string, unknown> => k !== null)
  .map((k) => {
   const handle = cleanText(k.handle, 32);
   if (handle === null || !/^[A-Za-z0-9_]{1,32}$/.test(handle)) return null;
   const first = rec(k.firstMention);
   return {
    handle,
    nickname: cleanText(k.nickname, 40),
    followers: num(k.followers),
    mentions: num(k.mentions),
    impressions: num(k.impressions),
    engagement: num(k.engagement),
    firstMentionMs: first !== null ? num(first.time) : null,
   };
  })
  .filter((k) => k !== null);
 return { ok: true, data: rows };
}

/* ---------- fase 2 normalizers (docs/sdd/config-onchain-smartmoney/fase-2/SPEC.md) ---------- */

const TREND = /^[A-Za-z]{1,16}$/;

/**
 * cluster/top-holders: one aggregate object. The provider writes the literal word "null" for unknown numbers (handled
 * by num) and the percent scale is not settled yet (F2-MED-8), so `holdingPct` keeps the provider's number untouched.
 */
function normalizeClusterTopHolders(data: unknown): Normalized {
 if (emptyPayload(data)) return EMPTY_OK;
 const r = rec(Array.isArray(data) ? data[0] : data);
 if (r === null) return { ok: false };
 return {
  ok: true,
  data: {
   holdingAmount: num(r.holdingAmount),
   holdingPct: num(r.holdingPercent),
   avgHoldingPeriodS: num(r.averageHoldingPeriod),
   avgBuyPriceUsd: num(r.averageBuyPriceUsd),
   avgSellPriceUsd: num(r.averageSellPriceUsd),
   avgPnlUsd: num(r.averagePnlUsd),
   trend: arr(r.clusterTrendType).filter((t): t is string => typeof t === "string" && TREND.test(t)).slice(0, 6),
  },
 };
}

function quoteSide(v: unknown) {
 const t = rec(v);
 if (t === null) return null;
 const decimals = num(t.decimal);
 return {
  address: text(t.tokenContractAddress),
  symbol: cleanText(t.tokenSymbol, 20),
  decimals: decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : null,
  unitPriceUsd: num(t.tokenUnitPrice),
  taxRate: num(t.taxRate),
  // an unknown flag stays unknown: a missing honeypot answer is never "safe"
  isHoneyPot: typeof t.isHoneyPot === "boolean" ? t.isHoneyPot : null,
 };
}

/** Keep the provider's integer text exactly; a numeric value already lost its raw precision. */
const quoteAmountRaw = (value: unknown): string | null =>
 typeof value === "string" && value.length <= 128 && /^\d+$/.test(value) ? value : null;

/**
 * aggregator/quote, read only: what the swap would give, its impact, its fee and whether either side is a honeypot.
 * Nothing needed to sign or send leaves the gateway (no quote id, router, sign data or route list).
 */
function normalizeQuote(data: unknown): Normalized {
 if (emptyPayload(data)) return EMPTY_OK;
 const r = rec(Array.isArray(data) ? data[0] : data);
 if (r === null) return { ok: false };
 const fromAmount = num(r.fromTokenAmount);
 const toAmount = num(r.toTokenAmount);
 const fromToken = quoteSide(r.fromToken);
 const toToken = quoteSide(r.toToken);
 if (fromAmount === null || toAmount === null || fromToken === null || toToken === null) return { ok: false };
 return {
  ok: true,
  data: {
   chainIndex: text(r.chainIndex),
   mode: cleanText(r.swapMode ?? r.mode, 16),
   fromAmount,
   toAmount,
   fromAmountRaw: quoteAmountRaw(r.fromTokenAmount),
   toAmountRaw: quoteAmountRaw(r.toTokenAmount),
   // The response field's description does not qualify its unit; token decimals are not proof.
   outputUnit: "unverified",
   priceImpactPct: num(r.priceImpactPercent),
   estimateGasFee: num(r.estimateGasFee),
   tradeFee: num(r.tradeFee), // Estimated network fee USD, kept separate from atomic gas and impact.
   fromToken,
   toToken,
  },
 };
}

/** token/basic-info: name, symbol, decimals and the community mark. The logo URL waits for the ICO-2 policy. */
function normalizeBasicInfo(data: unknown): Normalized {
 const rows = arr(data)
  .map(rec)
  .filter((r): r is Record<string, unknown> => r !== null)
  .map((r) => {
   const address = text(r.tokenContractAddress);
   if (address === null) return null;
   const decimals = num(r.decimal);
   return {
    chainIndex: text(r.chainIndex),
    address,
    symbol: cleanText(r.tokenSymbol, 20),
    name: cleanText(r.tokenName, 64),
    decimals: decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : null,
    communityRecognized: rec(r.tagList)?.communityRecognized === true,
   };
  })
  .filter((r) => r !== null);
 return { ok: true, data: rows };
}

/* ---------- parameter validators ---------- */

function tokenParam(params: Params, chainIndex: string): string | null {
 const raw = params.token;
 if (raw === undefined || raw === "" || raw.length > 128 || CONTROL.test(raw)) return null;
 return normalizeTokenAddress(chainIndex, raw);
}

function validateList(params: Params, keys: readonly string[], required: readonly string[]): boolean {
 if (!allowed(params, keys)) return false;
 return required.every((k) => params[k] !== undefined && params[k] !== "");
}

const CANDLE_TTL: Record<string, number> = { "1m": 60_000, "5m": 120_000, "15m": 300_000, "1H": 600_000, "4H": 900_000 };

/* ---------- the table ---------- */

export const ENDPOINTS: readonly Endpoint[] = [
 {
  id: "chains", route: "/onchain/chains", tier: "free",
  validate: (p) => (Object.keys(p).length === 0 ? { ok: true, request: get("/api/v6/dex/market/supported/chain", {}), ttlMs: DAY_MS } : bad),
  normalize: normalizeChainList,
 },
 {
  id: "signal-chains", route: "/onchain/signal-chains", tier: "free",
  validate: (p) => (Object.keys(p).length === 0 ? { ok: true, request: get("/api/v6/dex/market/signal/supported/chain", {}), ttlMs: DAY_MS } : bad),
  normalize: normalizeChainList,
 },
 {
  id: "leaderboard-chains", route: "/onchain/leaderboard-chains", tier: "free",
  validate: (p) => (Object.keys(p).length === 0 ? { ok: true, request: get("/api/v6/dex/market/leaderboard/supported/chain", {}), ttlMs: DAY_MS } : bad),
  normalize: normalizeChainList,
 },
 {
  id: "hot-tokens", route: "/onchain/hot-tokens", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "timeFrame", "limit"], ["chainIndex"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const timeFrame = p.timeFrame === undefined ? 2 : intIn(p.timeFrame, 1, 4);
   const limit = p.limit === undefined ? 50 : intIn(p.limit, 1, 100);
   if (timeFrame === null || limit === null) return bad;
   return {
    ok: true,
    request: get("/api/v6/dex/market/token/hot-token", { chainIndex: p.chainIndex, rankingType: 4, rankingTimeFrame: timeFrame, limit }),
    ttlMs: 300_000,
   };
  },
  normalize: normalizeHotTokens,
 },
 {
  id: "search", route: "/onchain/search", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "q"], ["chainIndex", "q"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const q = p.q!;
   if (q.length < 2 || q.length > 64 || CONTROL.test(q)) return bad;
   // The provider calls the single-chain parameter "chains".
   return { ok: true, request: get("/api/v6/dex/market/token/search", { chains: p.chainIndex, search: q }), ttlMs: 600_000 };
  },
  normalize: normalizeSearch,
 },
 {
  id: "candles", route: "/onchain/candles", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token", "bar", "limit"], ["chainIndex", "token", "bar"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const ttlMs = CANDLE_TTL[p.bar!];
   if (ttlMs === undefined) return bad;
   const token = tokenParam(p, p.chainIndex!);
   const limit = p.limit === undefined ? 150 : intIn(p.limit, 1, 299);
   if (token === null || limit === null) return bad;
   return {
    ok: true,
    request: get("/api/v6/dex/market/candles", { chainIndex: p.chainIndex, tokenContractAddress: token, bar: p.bar, limit }),
    ttlMs,
   };
  },
  normalize: normalizeCandles,
 },
 {
  id: "price", route: "/onchain/price", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   if (token === null) return bad;
   // Official page: POST with a one-object list body.
   return { ok: true, request: post("/api/v6/dex/market/price", [{ chainIndex: p.chainIndex, tokenContractAddress: token }]), ttlMs: 30_000 };
  },
  normalize: normalizePrice,
 },
 {
  id: "signals", route: "/onchain/signals", tier: "premium",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "walletType", "token", "minAmountUsd", "limit"], ["chainIndex"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   let walletType: string | undefined;
   if (p.walletType !== undefined) {
    const parts = p.walletType.split(",");
    if (parts.length === 0 || parts.some((w) => !["1", "2", "3"].includes(w))) return bad;
    walletType = parts.join(",");
   }
   const token = p.token === undefined ? undefined : tokenParam(p, p.chainIndex!);
   if (p.token !== undefined && token === null) return bad;
   let minAmountUsd: string | undefined;
   if (p.minAmountUsd !== undefined) {
    const n = num(p.minAmountUsd);
    if (n === null || n < 0) return bad;
    minAmountUsd = p.minAmountUsd;
   }
   const limit = p.limit === undefined ? 50 : intIn(p.limit, 1, 100);
   if (limit === null) return bad;
   // Official example sends a list containing one object; that is the documented body shape.
   const body = [{ chainIndex: p.chainIndex, ...(walletType !== undefined ? { walletType } : {}), ...(token !== undefined ? { tokenAddress: token } : {}), ...(minAmountUsd !== undefined ? { minAmountUsd } : {}), limit: String(limit) }];
   return { ok: true, request: post("/api/v6/dex/market/signal/list", body), ttlMs: 300_000 };
  },
  normalize: normalizeSignals,
  normalizeRequest: (data, params, nowMs, internal) => normalizeSignals(data, internal, params, nowMs),
  revalidateCached: revalidateCachedSignals,
  normalizeInternal: (d) => normalizeSignals(d, true),
 },
 {
  id: "leaderboard", route: "/onchain/leaderboard", tier: "premium",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "timeFrame", "sortBy", "walletType"], ["chainIndex", "timeFrame", "sortBy"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const timeFrame = intIn(p.timeFrame, 1, 5);
   const sortBy = intIn(p.sortBy, 1, 5);
   const walletType = optInt(p, "walletType", 1, 10);
   if (timeFrame === null || sortBy === null || walletType === null) return bad;
   return {
    ok: true,
    request: get("/api/v6/dex/market/leaderboard/list", { chainIndex: p.chainIndex, timeFrame, sortBy, walletType }),
    ttlMs: 1_800_000,
   };
  },
  normalize: normalizeLeaderboard,
  normalizeInternal: (d) => normalizeLeaderboard(d, true),
 },
 {
  id: "holders", route: "/onchain/holders", tier: "premium",
  validate: (p) => validateHolderLike(p, "/api/v6/dex/market/token/holder"),
  normalize: normalizeWallets,
  normalizeInternal: (d) => normalizeWallets(d, true),
 },
 {
  id: "top-traders", route: "/onchain/top-traders", tier: "premium",
  validate: (p) => validateHolderLike(p, "/api/v6/dex/market/token/top-trader"),
  normalize: normalizeWallets,
  normalizeInternal: (d) => normalizeWallets(d, true),
 },
 {
  id: "price-info", route: "/onchain/price-info", tier: "premium",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   if (token === null) return bad;
   return { ok: true, request: post("/api/v6/dex/market/price-info", [{ chainIndex: p.chainIndex, tokenContractAddress: token }]), ttlMs: 60_000 };
  },
  normalize: normalizePriceInfo,
  normalizeRequest: (data, params, nowMs) => normalizePriceInfo(data, params, nowMs),
 },
 {
  id: "token-risk", route: "/onchain/token-risk", tier: "premium",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   if (token === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/token/advanced-info", { chainIndex: p.chainIndex, tokenContractAddress: token }), ttlMs: 900_000 };
  },
  normalize: normalizeTokenRisk,
  normalizeRequest: (data, params) => normalizeTokenRisk(data, params),
 },
 {
  id: "pools", route: "/onchain/pools", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   if (token === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/token/top-liquidity", { chainIndex: p.chainIndex, tokenContractAddress: token }), ttlMs: 600_000 };
  },
  normalize: normalizePools,
 },
 {
  id: "cluster-chains", route: "/onchain/cluster-chains", tier: "free",
  validate: (p) => (Object.keys(p).length === 0 ? { ok: true, request: get("/api/v6/dex/market/token/cluster/supported/chain", {}), ttlMs: DAY_MS } : bad),
  normalize: normalizeChainList,
 },
 {
  id: "clusters", route: "/onchain/clusters", tier: "premium",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   if (token === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/token/cluster/overview", { chainIndex: p.chainIndex, tokenContractAddress: token }), ttlMs: 900_000 };
  },
  normalize: normalizeClusterOverview,
 },
 {
  id: "trades", route: "/onchain/trades", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token", "tagFilter", "limit"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   const tagFilter = optInt(p, "tagFilter", 1, 9);
   const limit = p.limit === undefined ? 50 : intIn(p.limit, 1, 100);
   if (token === null || tagFilter === null || limit === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/trades", { chainIndex: p.chainIndex, tokenContractAddress: token, tagFilter, limit }), ttlMs: 15_000 };
  },
  normalize: normalizeTrades,
 },
 {
  id: "news", route: "/onchain/news", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["symbol", "limit"], [])) return bad;
   const limit = p.limit === undefined ? 10 : intIn(p.limit, 1, 20);
   if (limit === null) return bad;
   if (p.symbol === undefined) {
    return { ok: true, request: get("/api/v6/dex/market/social/news/latest", { limit, detailLevel: 1 }), ttlMs: 300_000 };
   }
   if (!NEWS_SYMBOL.test(p.symbol)) return bad;
   return { ok: true, request: get("/api/v6/dex/market/social/news/by-symbol", { tokenSymbols: p.symbol.toUpperCase(), limit, detailLevel: 1 }), ttlMs: 300_000 };
  },
  normalize: normalizeNews,
 },
 {
  id: "sentiment", route: "/onchain/sentiment", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["symbol"], ["symbol"])) return bad;
   if (!NEWS_SYMBOL.test(p.symbol!)) return bad;
   return { ok: true, request: get("/api/v6/dex/market/social/sentiment/symbol", { tokenSymbols: p.symbol!.toUpperCase() }), ttlMs: 300_000 };
  },
  normalize: normalizeSentiment,
 },
 {
  id: "sentiment-ranking", route: "/onchain/sentiment-ranking", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["limit"], [])) return bad;
   const limit = p.limit === undefined ? 10 : intIn(p.limit, 1, 20);
   if (limit === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/social/sentiment/ranking", { limit }), ttlMs: 300_000 };
  },
  normalize: normalizeSentimentRanking,
 },
 {
  id: "vibe", route: "/onchain/vibe", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   if (token === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/social/vibe/timeline", { chainIndex: p.chainIndex, tokenAddress: token }), ttlMs: 600_000 };
  },
  normalize: normalizeVibe,
 },
 {
  id: "kols", route: "/onchain/kols", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token", "limit"], ["chainIndex", "token"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   const limit = p.limit === undefined ? 10 : intIn(p.limit, 1, 20);
   if (token === null || limit === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/social/vibe/top-kols", { chainIndex: p.chainIndex, tokenAddress: token, limit }), ttlMs: 600_000 };
  },
  normalize: normalizeKols,
 },
 {
  id: "cluster-top-holders", route: "/onchain/cluster-top-holders", tier: "premium",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "token", "rangeFilter"], ["chainIndex", "token", "rangeFilter"])) return bad;
   if (!DIGITS.test(p.chainIndex!)) return bad;
   const token = tokenParam(p, p.chainIndex!);
   const rangeFilter = intIn(p.rangeFilter, 1, 3);
   if (token === null || rangeFilter === null) return bad;
   return { ok: true, request: get("/api/v6/dex/market/token/cluster/top-holders", { chainIndex: p.chainIndex, tokenContractAddress: token, rangeFilter }), ttlMs: 900_000 };
  },
  normalize: normalizeClusterTopHolders,
 },
 {
  // tier not published by the portal: counted as Basic until F2-MED-1 measures it
  id: "quote", route: "/onchain/quote", tier: "basic",
  validate: (p) => {
   if (!validateList(p, ["chainIndex", "amount", "fromToken", "toToken"], ["chainIndex", "amount", "fromToken", "toToken"])) return bad;
   if (!DIGITS.test(p.chainIndex!) || !/^[1-9]\d{0,39}$/.test(p.amount!)) return bad;
   const from = tokenParam({ token: p.fromToken! }, p.chainIndex!);
   const to = tokenParam({ token: p.toToken! }, p.chainIndex!);
   if (from === null || to === null) return bad;
   return { ok: true, request: get("/api/v6/dex/aggregator/quote", { chainIndex: p.chainIndex, amount: p.amount, fromTokenAddress: from, toTokenAddress: to }), ttlMs: 15_000 };
  },
  normalize: normalizeQuote,
 },
 {
  id: "token-info", route: "/onchain/token-info", tier: "basic",
  validate: (p) => {
   if (!allowed(p, ["chainIndex", "token", "tokens"]) || p.chainIndex === undefined || !DIGITS.test(p.chainIndex)) return bad;
   if ((p.token === undefined) === (p.tokens === undefined)) return bad;
   const raws = p.token !== undefined ? [p.token] : p.tokens!.split(",");
   if (raws.length < 1 || raws.length > 100) return bad;
   const body: Array<{ chainIndex: string; tokenContractAddress: string }> = [];
   for (const raw of raws) {
    const token = tokenParam({ token: raw }, p.chainIndex);
    if (token === null) return bad;
    body.push({ chainIndex: p.chainIndex, tokenContractAddress: token });
   }
   return { ok: true, request: post("/api/v6/dex/market/token/basic-info", body), ttlMs: DAY_MS };
  },
  normalize: normalizeBasicInfo,
 },
 // routes that live in their own files (the address of the connected wallet, the list of networks): see routes/index.ts, which imports only types from here
 ...EXTRA_ENDPOINTS,
];

function validateHolderLike(p: Params, providerPath: string): Validation {
 if (!validateList(p, ["chainIndex", "token", "tagFilter", "limit"], ["chainIndex", "token"])) return bad;
 if (!DIGITS.test(p.chainIndex!)) return bad;
 const token = tokenParam(p, p.chainIndex!);
 const tagFilter = optInt(p, "tagFilter", 1, 9);
 const limit = p.limit === undefined ? 50 : intIn(p.limit, 1, 100);
 if (token === null || tagFilter === null || limit === null) return bad;
 return { ok: true, request: get(providerPath, { chainIndex: p.chainIndex, tokenContractAddress: token, tagFilter, limit }), ttlMs: 900_000 };
}

export function endpointFor(route: string): Endpoint | undefined {
 return ENDPOINTS.find((e) => e.route === route);
}
