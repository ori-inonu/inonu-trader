/**
 * On-demand collection of wallet evidence over an INJECTED client. Nothing here schedules, loops or polls: one call of
 * `collectWalletEvidence` is one refresh, bounded by an explicit call budget, a page cap and a deadline.
 *
 * Secrets: this module never sees them. The signed client of src/onchainos holds the credentials in its closure and the
 * process boundary (main.ts) is the only place that reads the environment.
 *
 * Access rules (PE-12): a refusal of access, a regional restriction (HTTP 403 or 451), a rejected credential (401), a
 * payment demand (402) and an exhausted rate limit END the refresh. There is no retry beyond the client's bounded one, no
 * proxy, no fallback source and no payment.
 */

import { OnchainosError } from "../onchainos/errors.ts";
import type { GetPort, OnchainosHttp, PostPort, QuotaSnapshot } from "../onchainos/http.ts";
import { hashOf } from "./canonical.ts";
import { DEFAULT_PRICE_TOLERANCE_BPS, buildBalanceSection, type RawBalanceRow } from "./balances.ts";
import { buildAddressAnalysisSection, netPositionFromTrades, type RawLatestPnl, type TimeFrameCode } from "./address-analysis.ts";
import { accountRefOf, buildWalletEvidence, isCleanCollection, oldestCaptureMs } from "./evidence.ts";
import { buildHistorySection, netInflowByAsset } from "./history.ts";
import { buildIdentity } from "./identity.ts";
import { assembleMarketSection, decimalsHintsOf, priceHintsOf } from "./market.ts";
import { parseDec } from "./decimal.ts";
import { EvidenceIntegrityError, type EvidenceStore, type PutResult } from "./store.ts";
import {
  readAllTokenBalances,
  readDexHistory,
  readLatestPnl,
  readLiquidity,
  readPortfolioOverview,
  readPortfolioSupportedChains,
  readPrices,
  readRecentPnl,
  readRisk,
  readSpecificBalances,
  readTokenDecimals,
  readTotalValue,
  readTransactions,
  type AssetType,
  type TokenQuery,
} from "./adapters/okx-read.ts";
import { walletEndpoint, type WalletEndpoint } from "./adapters/okx-endpoints.ts";
import { endpoint as marketEndpoint } from "../onchainos/endpoints.ts";
import { ADAPTER_VERSION } from "./types.ts";
import type { LiquidityEvidence, Origin, PriceEvidence, RiskEvidence, SectionError, SourceInfo, StopReason, TokenInfoEvidence, WalletEvidence } from "./types.ts";
import type { HistorySection } from "./types.ts";

export interface CollectRequest {
  readonly address: string;
  readonly chains: readonly string[];
  readonly excludeRiskToken?: "0" | "1";
  /** Reported total for comparison. Default true. */
  readonly totalValue?: boolean;
  /** Which scope of the total to ask for; `tokens` is the one comparable with token positions. */
  readonly totalAssetType?: AssetType;
  readonly history?: false | { readonly beginMs?: number; readonly endMs?: number };
  readonly addressAnalysis?: false | {
    readonly chains: readonly string[];
    readonly timeFrame?: TimeFrameCode;
    /** Latest PnL, one call per token (capped by `perTokenCap`). */
    readonly tokens?: readonly TokenQuery[];
    /** DEX trade history of a window ending now (`days`) or an explicit one. Bounded: 1000 records at most. */
    readonly dexHistory?: false | { readonly days: number } | { readonly beginMs: number; readonly endMs: number };
    /** Ask the provider's supported-chain list first and skip chains it does not list. Opt-in: the list may be partial. */
    readonly supportCheck?: boolean;
  };
  /** Default: prices and decimals. Liquidity and risk are one call per token, so they are opt-in and capped. */
  readonly market?: false | { readonly price?: boolean; readonly decimals?: boolean; readonly liquidity?: boolean; readonly risk?: boolean };
  /** Query the named tokens with the risk filter off when the filtered answer omitted them. */
  readonly riskProbe?: boolean;
  readonly expectedAssets?: readonly TokenQuery[];
}

export interface CollectConfig {
  /** `okx_web3_api` only when the client really talks to OKX; tests with a fake client MUST say `synthetic_fixture`. */
  readonly origin: Origin;
  readonly maxCalls?: number;
  readonly maxPagesPerEndpoint?: number;
  readonly deadlineMs?: number;
  /** Tokens read one by one for each of: liquidity, risk and the latest PnL of a token. */
  readonly perTokenCap?: number;
  readonly maxAgeMs?: number;
  /** 0 disables the cache. */
  readonly cacheTtlMs?: number;
  readonly forceRefresh?: boolean;
  readonly valueToleranceUsd?: string;
}

export const DEFAULTS = Object.freeze({ maxCalls: 12, maxPagesPerEndpoint: 3, deadlineMs: 60_000, perTokenCap: 5, maxAgeMs: 60_000, cacheTtlMs: 0 });
export const HARD_CEILINGS = Object.freeze({ maxCalls: 60, maxPagesPerEndpoint: 10, deadlineMs: 300_000, perTokenCap: 20 });

export interface CollectPorts {
  readonly http: OnchainosHttp;
  readonly now: () => number;
  readonly store?: EvidenceStore;
}

export interface CollectOutcome {
  readonly evidence: WalletEvidence;
  readonly cache: { readonly hit: boolean; readonly ageMs: number | null };
  readonly persisted: PutResult | null;
  readonly quota: QuotaSnapshot | null;
}

export class CollectorUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectorUsageError";
  }
}

class Stop extends Error {
  constructor(readonly reason: StopReason) {
    super(reason);
  }
}

function boundedInt(value: number | undefined, fallback: number, ceiling: number, name: string): number {
  const chosen = value ?? fallback;
  if (!Number.isInteger(chosen) || chosen < 1 || chosen > ceiling) throw new CollectorUsageError(`${name} deve ser um inteiro de 1 a ${ceiling}`);
  return chosen;
}

/** Closed code and whether the refresh must end, from a typed transport error. */
export function classify(error: unknown): { code: string; stop: StopReason | null; httpStatus: number | null; apiCode: string | null } {
  if (!(error instanceof OnchainosError)) return { code: "unexpected", stop: null, httpStatus: null, apiCode: null };
  const base = { httpStatus: error.httpStatus, apiCode: error.apiCode };
  // Codes of the official error tables (onchaindata-error-code, market-price-error-code), whichever HTTP status carried them.
  if (error.apiCode === "50125") return { ...base, code: "access_denied_or_region_restricted", stop: "access_denied" };
  if (error.apiCode !== null && /^501(0[3-9]|1[0-4])$/.test(error.apiCode)) return { ...base, code: "credentials_rejected", stop: "credentials_rejected" };
  if (error.apiCode === "50038") return { ...base, code: "chain_unsupported", stop: null };
  switch (error.kind) {
    case "offline":
      return { ...base, code: "offline", stop: "offline" };
    case "rate_limited":
      return { ...base, code: "rate_limited", stop: "rate_limited" };
    case "http":
      if (error.httpStatus === 401) return { ...base, code: "credentials_rejected", stop: "credentials_rejected" };
      if (error.httpStatus === 402) return { ...base, code: "payment_required", stop: "payment_required" };
      if (error.httpStatus === 403 || error.httpStatus === 451) return { ...base, code: "access_denied_or_region_restricted", stop: "access_denied" };
      return { ...base, code: `http_${error.httpStatus ?? "error"}`, stop: null };
    case "api":
      return { ...base, code: `api_error_${error.apiCode ?? "unknown"}`, stop: null };
    case "timeout":
      return { ...base, code: "timeout", stop: null };
    case "network":
      return { ...base, code: "network", stop: null };
    case "schema":
      return { ...base, code: "schema_mismatch", stop: null };
    case "too_large":
      return { ...base, code: "answer_too_large", stop: null };
    case "invalid_request":
      return { ...base, code: "invalid_request", stop: null };
  }
}

function contractQuery(identity: { chainIndex: string; asset: { kind: string; address?: string } }): TokenQuery | null {
  return identity.asset.kind === "contract" && identity.asset.address !== undefined ? { chainIndex: identity.chainIndex, tokenContractAddress: identity.asset.address } : null;
}

/** Plan tiers of the market endpoints actually used, as the endpoint registry documents them (e.g. `basic+premium`). */
function marketTiers(ids: ("market.price.price" | "market.token.basic-info" | "market.token.top-liquidity" | "market.token.advanced-info")[]): string {
  const tiers = [...new Set(ids.map((id) => marketEndpoint(id).tier))].sort();
  return tiers.length === 0 ? "unknown" : tiers.join("+");
}

function sourceOf(id: WalletEndpoint["id"]): SourceInfo {
  const spec = walletEndpoint(id);
  return { id: `okx_${id}`, endpoint: spec.path, method: spec.method, apiVersion: "v6", adapterVersion: ADAPTER_VERSION, tier: spec.tier };
}

/** A request part as plain JSON: an option set to `undefined` is the same as an omitted one, and must not break the hash. */
function plain<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function requestFingerprint(request: CollectRequest, config: Pick<CollectConfig, "origin" | "maxAgeMs" | "valueToleranceUsd" | "maxCalls" | "maxPagesPerEndpoint" | "deadlineMs" | "perTokenCap">): string {
  const account = accountRefOf(request.address).sha256;
  return hashOf({
    account,
    origin: config.origin,
    // Two requests that judge freshness or gaps differently never share a cached evidence.
    maxAgeMs: config.maxAgeMs ?? DEFAULTS.maxAgeMs,
    valueToleranceUsd: config.valueToleranceUsd ?? null,
    // The budgets shape what an evidence contains, so a request with another budget never reuses it.
    budget: [config.maxCalls ?? DEFAULTS.maxCalls, config.maxPagesPerEndpoint ?? DEFAULTS.maxPagesPerEndpoint, config.deadlineMs ?? DEFAULTS.deadlineMs, config.perTokenCap ?? DEFAULTS.perTokenCap],
    chains: [...new Set(request.chains)].sort(),
    excludeRiskToken: request.excludeRiskToken ?? null,
    totalValue: request.totalValue ?? true,
    totalAssetType: request.totalAssetType ?? "tokens",
    history: plain(request.history ?? false),
    addressAnalysis: plain(request.addressAnalysis ?? false),
    market: plain(request.market ?? "default"),
    riskProbe: request.riskProbe ?? false,
    expected: (request.expectedAssets ?? []).map((item) => `${item.chainIndex}:${item.tokenContractAddress.toLowerCase()}`).sort(),
  });
}

/** Upper bound of HTTP requests one refresh can make, before the budget. No network. */
export function planCalls(request: CollectRequest, config: Pick<CollectConfig, "maxPagesPerEndpoint" | "perTokenCap">): { what: string; max: number }[] {
  const pages = config.maxPagesPerEndpoint ?? DEFAULTS.maxPagesPerEndpoint;
  const cap = config.perTokenCap ?? DEFAULTS.perTokenCap;
  const plan: { what: string; max: number }[] = [{ what: "balance.all", max: 1 }];
  if (request.totalValue ?? true) plan.push({ what: "balance.total", max: 1 });
  if (request.history !== undefined && request.history !== false) plan.push({ what: "history.byAddress", max: pages });
  if (request.addressAnalysis !== undefined && request.addressAnalysis !== false) {
    const chainCount = request.addressAnalysis.chains.length;
    if (request.addressAnalysis.supportCheck === true) plan.push({ what: "portfolio.supportedChain", max: 1 });
    plan.push({ what: "portfolio.overview", max: chainCount });
    plan.push({ what: "portfolio.recentPnl", max: pages * chainCount });
    const tokens = request.addressAnalysis.tokens ?? [];
    if (tokens.length > 0) plan.push({ what: "portfolio.latestPnl", max: Math.min(tokens.length, cap) * chainCount });
    if (request.addressAnalysis.dexHistory !== undefined && request.addressAnalysis.dexHistory !== false) plan.push({ what: "portfolio.dexHistory", max: pages * chainCount });
  }
  const market = request.market === undefined ? { price: true, decimals: true } : request.market;
  if (market !== false) {
    if (market.price ?? true) plan.push({ what: "market.price", max: 1 });
    if (market.decimals ?? true) plan.push({ what: "market.token.basic-info", max: 1 });
    if (market.liquidity === true) plan.push({ what: "market.token.top-liquidity", max: cap });
    if (market.risk === true) plan.push({ what: "market.token.advanced-info", max: cap });
  }
  if (request.riskProbe === true) plan.push({ what: "balance.specific", max: 1 });
  return plan;
}

export async function collectWalletEvidence(ports: CollectPorts, request: CollectRequest, config: CollectConfig): Promise<CollectOutcome> {
  const maxCalls = boundedInt(config.maxCalls, DEFAULTS.maxCalls, HARD_CEILINGS.maxCalls, "maxCalls");
  const maxPages = boundedInt(config.maxPagesPerEndpoint, DEFAULTS.maxPagesPerEndpoint, HARD_CEILINGS.maxPagesPerEndpoint, "maxPagesPerEndpoint");
  const deadlineMs = boundedInt(config.deadlineMs, DEFAULTS.deadlineMs, HARD_CEILINGS.deadlineMs, "deadlineMs");
  const perTokenCap = boundedInt(config.perTokenCap, DEFAULTS.perTokenCap, HARD_CEILINGS.perTokenCap, "perTokenCap");
  const maxAgeMs = config.maxAgeMs ?? DEFAULTS.maxAgeMs;
  const cacheTtlMs = config.cacheTtlMs ?? DEFAULTS.cacheTtlMs;
  if (request.chains.length < 1) throw new CollectorUsageError("informe ao menos uma rede");

  const startedAt = ports.now();
  const accountSha = accountRefOf(request.address).sha256;
  const fingerprint = requestFingerprint(request, config);

  // A cached evidence keeps the freshness it was built with, so it is never served past its own freshness limit.
  const effectiveTtlMs = Math.min(cacheTtlMs, maxAgeMs);
  if (ports.store !== undefined && effectiveTtlMs > 0 && config.forceRefresh !== true) {
    const cached = ports.store.latest(accountSha, fingerprint);
    // Only a clean evidence is served, and its age counts from its OLDEST read: a slow collection must not stretch it.
    const oldest = cached === null ? null : oldestCaptureMs(cached);
    if (cached !== null && isCleanCollection(cached) && oldest !== null) {
      const ageMs = startedAt - oldest;
      if (ageMs >= 0 && ageMs <= effectiveTtlMs) return { evidence: cached, cache: { hit: true, ageMs }, persisted: null, quota: null };
    }
  }

  // ---- budgeted, deadline-aware, breaker-aware view of the client ----
  let callsMade = 0;
  let stoppedBy: StopReason | null = null;
  const errors: SectionError[] = [];
  const skipped: { what: string; reason: string }[] = [];
  const guard = (): void => {
    if (stoppedBy !== null) throw new Stop(stoppedBy);
    if (ports.now() - startedAt > deadlineMs) {
      stoppedBy = "deadline";
      throw new Stop("deadline");
    }
    if (callsMade >= maxCalls) {
      stoppedBy = "call_budget";
      throw new Stop("call_budget");
    }
    callsMade += 1;
  };
  const port: GetPort & PostPort = {
    get: (endpoint, query) => {
      guard();
      return ports.http.get(endpoint, query);
    },
    post: (endpoint, body) => {
      guard();
      return ports.http.post(endpoint, body);
    },
  };

  /** Runs one read. On failure records a closed error (or the skip) and returns null. */
  async function attempt<T>(section: SectionError["section"], what: string, read: () => Promise<T>): Promise<T | null> {
    if (stoppedBy !== null) {
      skipped.push({ what, reason: `stopped_by_${stoppedBy}` });
      return null;
    }
    try {
      return await read();
    } catch (error) {
      if (error instanceof Stop) {
        skipped.push({ what, reason: error.reason });
        return null;
      }
      const verdict = classify(error);
      // An offline client refused before sending: that call never reached the network, so it is not counted as made.
      if (verdict.code === "offline") callsMade = Math.max(0, callsMade - 1);
      errors.push({ section, code: verdict.code, httpStatus: verdict.httpStatus, apiCode: verdict.apiCode });
      if (verdict.stop !== null) stoppedBy = verdict.stop;
      return null;
    }
  }

  const nowMs = (): number => ports.now();
  const chains = [...new Set(request.chains)];

  // ---- reads (raw) ----
  const balancesRead = await attempt("balances", "balance.all", () => readAllTokenBalances(port, { address: request.address, chains, ...(request.excludeRiskToken === undefined ? {} : { excludeRiskToken: request.excludeRiskToken }) }));
  const totalRead = request.totalValue ?? true
    ? await attempt("totalValue", "balance.total", () => readTotalValue(port, { address: request.address, chains, assetType: request.totalAssetType ?? "tokens", ...(request.excludeRiskToken === undefined ? {} : { excludeRiskToken: request.excludeRiskToken }) }))
    : null;
  const historyRead =
    request.history === undefined || request.history === false
      ? null
      : await attempt("history", "history.byAddress", () => readTransactions(port, { address: request.address, chains, maxPages, ...(request.history === false ? {} : request.history) }));

  interface PnlRead {
    chainIndex: string;
    timeFrame: TimeFrameCode | null;
    overview: Awaited<ReturnType<typeof readPortfolioOverview>> | null;
    recent: Awaited<ReturnType<typeof readRecentPnl>> | null;
    latest: { token: TokenQuery; raw: RawLatestPnl; receivedAtMs: number }[];
    dex: { read: Awaited<ReturnType<typeof readDexHistory>>; beginMs: number; endMs: number } | null;
    supported: string[] | null;
  }
  const pnlReads: PnlRead[] = [];
  if (request.addressAnalysis !== undefined && request.addressAnalysis !== false) {
    const analysis = request.addressAnalysis;
    const timeFrame = analysis.timeFrame ?? "4";
    // The support list is opt-in: the provider's page shows only two chains, so a missing chain is skipped, said so, and never
    // read as proof that the chain has no data.
    let supported: string[] | null = null;
    if (analysis.supportCheck === true) {
      const listed = await attempt("addressAnalysis", "portfolio.supportedChain", () => readPortfolioSupportedChains(port));
      if (listed !== null) supported = listed.value;
    }
    const pnlChains = [...new Set(analysis.chains)];
    // Tokens are normalized and deduplicated here: a repeated token is a typo of the request, not a provider fault.
    const requestedTokens = new Map<string, TokenQuery>();
    for (const token of analysis.tokens ?? []) {
      const built = buildIdentity(token.chainIndex, token.tokenContractAddress);
      requestedTokens.set(built.ok ? built.identity.key : `invalid:${requestedTokens.size}`, token);
    }
    if ([...requestedTokens.values()].some((token) => !pnlChains.includes(token.chainIndex))) skipped.push({ what: "portfolio.latestPnl", reason: "token_chain_not_in_pnl_chains" });
    for (const chainIndex of pnlChains) {
      if (supported !== null && !supported.includes(chainIndex)) {
        skipped.push({ what: `portfolio.${chainIndex}`, reason: "chain_not_listed_as_supported" });
        continue;
      }
      const overview = await attempt("addressAnalysis", "portfolio.overview", () => readPortfolioOverview(port, { chainIndex, address: request.address, timeFrame }));
      const recent = await attempt("addressAnalysis", "portfolio.recentPnl", () => readRecentPnl(port, { chainIndex, address: request.address, maxPages }));
      const latest: PnlRead["latest"] = [];
      const wanted = [...requestedTokens.values()].filter((token) => token.chainIndex === chainIndex);
      if (wanted.length > perTokenCap) skipped.push({ what: "portfolio.latestPnl", reason: `only_first_${perTokenCap}_tokens_read` });
      for (const token of wanted.slice(0, perTokenCap)) {
        const read = await attempt("addressAnalysis", "portfolio.latestPnl", () => readLatestPnl(port, { chainIndex, address: request.address, tokenContractAddress: token.tokenContractAddress }));
        if (read !== null) latest.push({ token, raw: read.value, receivedAtMs: read.meta.receivedAtMs });
      }
      let dex: PnlRead["dex"] = null;
      if (analysis.dexHistory !== undefined && analysis.dexHistory !== false) {
        const endMs = "days" in analysis.dexHistory ? ports.now() : analysis.dexHistory.endMs;
        const beginMs = "days" in analysis.dexHistory ? endMs - analysis.dexHistory.days * 86_400_000 : analysis.dexHistory.beginMs;
        const read = await attempt("addressAnalysis", "portfolio.dexHistory", () => readDexHistory(port, { chainIndex, address: request.address, beginMs, endMs, maxPages }));
        if (read !== null) dex = { read, beginMs, endMs };
      }
      pnlReads.push({ chainIndex, timeFrame, overview, recent, latest, dex, supported });
    }
  }

  // ---- market evidence for the contract tokens that came back ----
  const rawRows: RawBalanceRow[] = balancesRead === null ? [] : [...balancesRead.value];
  const heldContracts: TokenQuery[] = [];
  const seenHeld = new Set<string>();
  for (const row of rawRows) {
    const built = buildIdentity(row.chainIndex, row.tokenContractAddress);
    if (!built.ok || !chains.includes(built.identity.chainIndex) || seenHeld.has(built.identity.key)) continue;
    const query = contractQuery(built.identity);
    if (query === null) continue;
    seenHeld.add(built.identity.key);
    heldContracts.push(query);
  }
  const marketOptions = request.market === undefined ? { price: true, decimals: true } : request.market;
  let prices: PriceEvidence[] = [];
  let tokenInfo: TokenInfoEvidence[] = [];
  const liquidity: LiquidityEvidence[] = [];
  const risk: RiskEvidence[] = [];
  const marketMissing: { key: string; aspect: "price" | "token_info" | "liquidity" | "risk" }[] = [];
  let marketFetchedAt: number | null = null;
  if (marketOptions !== false && heldContracts.length > 0) {
    const batch = heldContracts.slice(0, 100);
    if (heldContracts.length > 100) skipped.push({ what: "market.price", reason: "more_than_100_tokens_only_first_100_read" });
    if (marketOptions.price ?? true) {
      const read = await attempt("market", "market.price", () => readPrices(port, batch));
      if (read !== null) {
        prices = read.value.prices;
        marketFetchedAt = read.meta.receivedAtMs;
        for (const key of read.value.missing) marketMissing.push({ key, aspect: "price" });
      }
    }
    if (marketOptions.decimals ?? true) {
      const read = await attempt("market", "market.token.basic-info", () => readTokenDecimals(port, batch));
      if (read !== null) {
        tokenInfo = read.value.tokenInfo;
        marketFetchedAt = read.meta.receivedAtMs;
        for (const key of read.value.missing) marketMissing.push({ key, aspect: "token_info" });
      }
    }
    for (const token of heldContracts.slice(0, perTokenCap)) {
      if (marketOptions.liquidity === true) {
        const read = await attempt("market", "market.token.top-liquidity", () => readLiquidity(port, token));
        if (read !== null) {
          liquidity.push(read.value);
          marketFetchedAt = read.meta.receivedAtMs;
        }
      }
      if (marketOptions.risk === true) {
        const read = await attempt("market", "market.token.advanced-info", () => readRisk(port, token));
        if (read !== null) {
          risk.push(read.value);
          marketFetchedAt = read.meta.receivedAtMs;
        }
      }
    }
    if (heldContracts.length > perTokenCap && (marketOptions.liquidity === true || marketOptions.risk === true)) skipped.push({ what: "market.per_token", reason: `only_first_${perTokenCap}_tokens_read` });
  }
  const marketSection =
    marketOptions === false || marketFetchedAt === null
      ? null
      : assembleMarketSection({ source: { id: "okx_market", endpoint: null, method: null, apiVersion: "v6", adapterVersion: ADAPTER_VERSION, tier: marketTiers([...(marketOptions.price ?? true ? ["market.price.price" as const] : []), ...(marketOptions.decimals ?? true ? ["market.token.basic-info" as const] : []), ...(marketOptions.liquidity === true ? ["market.token.top-liquidity" as const] : []), ...(marketOptions.risk === true ? ["market.token.advanced-info" as const] : [])]) }, fetchedAtMs: marketFetchedAt, nowMs: nowMs(), maxAgeMs, prices, tokenInfo, liquidity, risk, missing: marketMissing });

  // ---- sections that feed the expected-asset signals ----
  const historySection: HistorySection | null =
    historyRead === null
      ? null
      : buildHistorySection({
          account: request.address,
          requestedChains: chains,
          rows: historyRead.rows,
          source: sourceOf("history.byAddress"),
          fetchedAtMs: historyRead.meta.receivedAtMs,
          nowMs: nowMs(),
          maxAgeMs,
          requestedFromMs: request.history === false || request.history === undefined ? null : (request.history.beginMs ?? null),
          requestedToMs: request.history === false || request.history === undefined ? null : (request.history.endMs ?? null),
          pagesRead: historyRead.pages,
          truncated: historyRead.truncated,
          stopReason: historyRead.stopReason,
        });

  // One address analysis section per requested chain would multiply sections; the evidence carries the first chain's and
  // lists the rest in `skipped`, so a multi-chain request is never silently reduced.
  const hasData = (item: PnlRead): boolean => item.overview !== null || item.recent !== null || item.latest.length > 0 || item.dex !== null;
  const firstPnl = pnlReads.find(hasData) ?? null;
  for (const extra of pnlReads.filter((item) => item !== firstPnl && hasData(item))) skipped.push({ what: `portfolio.${extra.chainIndex}`, reason: "only_first_chain_with_data_is_in_the_section" });
  const pnlSection =
    firstPnl === null
      ? null
      : buildAddressAnalysisSection({
          chainIndex: firstPnl.chainIndex,
          timeFrame: firstPnl.timeFrame,
          overview: firstPnl.overview?.value ?? null,
          rows: firstPnl.recent?.rows ?? [],
          source: sourceOf("portfolio.recentPnl"),
          // The oldest read of the section: the section is as old as its first answer.
          fetchedAtMs: Math.min(...[firstPnl.recent?.meta.receivedAtMs, firstPnl.overview?.meta.receivedAtMs, firstPnl.dex?.read.meta.receivedAtMs, ...firstPnl.latest.map((item) => item.receivedAtMs)].filter((value): value is number => typeof value === "number")),
          nowMs: nowMs(),
          maxAgeMs,
          pagesRead: firstPnl.recent?.pages ?? 1,
          truncated: firstPnl.recent?.truncated ?? false,
          stopReason: firstPnl.recent?.stopReason ?? "single_answer",
          tokenPnl: firstPnl.latest.map((item) => ({ token: item.token, raw: item.raw })),
          ...(firstPnl.dex === null ? {} : { trades: { rows: firstPnl.dex.read.rows, beginMs: firstPnl.dex.beginMs, endMs: firstPnl.dex.endMs, pagesRead: firstPnl.dex.read.pages, truncated: firstPnl.dex.read.truncated, stopReason: firstPnl.dex.read.stopReason } }),
          supportedChains: firstPnl.supported,
        });

  const expected = new Map<string, { chainIndex: string; tokenContractAddress: string }>();
  const addExpected = (chainIndex: string, tokenContractAddress: string): void => {
    const built = buildIdentity(chainIndex, tokenContractAddress);
    if (built.ok && chains.includes(built.identity.chainIndex)) expected.set(built.identity.key, { chainIndex: built.identity.chainIndex, tokenContractAddress });
  };
  for (const item of request.expectedAssets ?? []) addExpected(item.chainIndex, item.tokenContractAddress);
  if (historySection !== null) {
    const inflow = netInflowByAsset(historySection);
    for (const entry of historySection.entries) {
      const net = inflow.get(entry.identity.key);
      if (net !== undefined && net.units > 0n) addExpected(entry.identity.chainIndex, entry.identity.asset.kind === "contract" ? entry.identity.asset.address : "");
    }
  }
  if (pnlSection !== null) {
    for (const [key, net] of netPositionFromTrades(pnlSection)) {
      const trade = pnlSection.trades.find((item) => item.identity.key === key);
      if (trade !== undefined && net.units > 0n) addExpected(trade.identity.chainIndex, trade.identity.asset.kind === "contract" ? trade.identity.asset.address : "");
    }
    for (const position of pnlSection.positions) {
      const amount = parseDec(position.tokenBalanceAmountText);
      if (amount !== null && amount.units > 0n && position.soldOutAtMs === null) addExpected(position.identity.chainIndex, position.identity.asset.kind === "contract" ? position.identity.asset.address : "");
    }
  }

  // ---- optional probe: the same tokens with the risk filter off ----
  if (request.riskProbe === true && balancesRead !== null && (request.excludeRiskToken ?? "0") === "0") {
    const returned = new Set(rawRows.flatMap((row) => { const built = buildIdentity(row.chainIndex, row.tokenContractAddress); return built.ok ? [built.identity.key] : []; }));
    const missing = [...expected.values()].filter((item) => { const built = buildIdentity(item.chainIndex, item.tokenContractAddress); return built.ok && !returned.has(built.identity.key); }).slice(0, 20);
    if (missing.length > 0) {
      const probe = await attempt("riskProbe", "balance.specific", () => readSpecificBalances(port, { address: request.address, tokens: missing, excludeRiskToken: "1" }));
      if (probe !== null) for (const row of probe.value) rawRows.push({ ...row, locator: `/probe${row.locator}` });
    }
  }

  // ---- build ----
  const balancesSection =
    balancesRead === null
      ? null
      : buildBalanceSection({
          account: request.address,
          requestedChains: chains,
          rows: rawRows,
          source: sourceOf("balance.all"),
          excludeRiskToken: request.excludeRiskToken ?? null,
          tokenDiscovery: "provider_all",
          fetchedAtMs: balancesRead.meta.receivedAtMs,
          sourceTimeMs: null,
          nowMs: nowMs(),
          maxAgeMs,
          expectedAssets: [...expected.values()],
          decimalsHints: decimalsHintsOf(marketSection),
          priceHints: priceHintsOf(marketSection),
          priceToleranceBps: DEFAULT_PRICE_TOLERANCE_BPS,
          reportedTotal:
            totalRead === null
              ? null
              : { valueText: totalRead.value.valueText, assetType: request.totalAssetType ?? "tokens", chains, excludeRiskToken: request.excludeRiskToken ?? null, fetchedAtMs: totalRead.meta.receivedAtMs },
        });

  const previous = ports.store?.latest(accountSha, fingerprint) ?? null;
  const evidence = buildWalletEvidence({
    origin: config.origin,
    nowMs: nowMs(),
    maxAgeMs,
    account: request.address,
    balances: balancesSection,
    history: historySection,
    market: marketSection,
    addressAnalysis: pnlSection,
    revision: previous === null ? 1 : previous.revision + 1,
    options: config.valueToleranceUsd === undefined ? {} : { valueToleranceUsd: config.valueToleranceUsd },
    collection: { trigger: "on_demand", callsMade, callBudget: maxCalls, stoppedBy, errors, skipped },
  });
  let persisted: PutResult | null = null;
  if (ports.store !== undefined) {
    try {
      persisted = ports.store.put(evidence, fingerprint);
    } catch (error) {
      // An evidence that does not verify is a bug, not a disk problem: never disguise it.
      if (error instanceof EvidenceIntegrityError) throw error;
      // The reads are done and paid for: a failing disk must not throw the evidence away.
      persisted = { written: false, finding: null, replacedCorrupt: false, error: "store_write_failed" };
    }
  }
  return { evidence, cache: { hit: false, ageMs: null }, persisted, quota: ports.http.quota.snapshot() };
}
