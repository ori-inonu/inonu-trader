/**
 * The data source of "Pedir ao Inonu" for one on-chain token (mode `token`, fase-2 SPEC F2-DIG-4, F2-DIG-5, F2-DIG-10).
 *
 * It runs only when a person clicks: it plans the calls (`onchain-plan`), cuts the plan to the cap of the request, asks the
 * gateway one call at a time with the intent of a click, hands the answers to the digest (`onchain-digest`) and builds the
 * Evidence Brief. Nothing here calls the model and nothing runs in the background. A call that fails becomes a note in the
 * Brief; the whole click fails only when there is no credential at all, the target is invalid or the click is cancelled.
 *
 * It asks the gateway through `callInternal` so the server sees the full wallet addresses it needs for the `qualidade`
 * component; those addresses are used for that join and never copied into the Brief.
 */
import { BriefTooLarge, buildBrief } from "../intel/brief";
import { buildOnchainDigest, onchainBriefInput, type OnchainSources } from "../intel/onchain-digest";
import type { GatewayLike } from "../intel/onchain-nulos";
import { scaleOf, toPct100 } from "../intel/onchain-adapt";
import { sanitizeTags } from "../intel/onchain-risk";
import { qualityFromWallets, type WalletWin } from "../intel/onchain-quality";
import type { SymbolKind } from "../intel/onchain-components";
import type { OnchainGatewayInternal } from "../onchain-read/gateway";
import { SourceError } from "./source-error";
import type { AskMode, AskRequest, BriefSource, BuiltBrief } from "./ask";
import { MAX_ONCHAIN_CALLS, cutPlan, planPortfolioToken, planTokenMode } from "./onchain-plan";

export interface TokenIdentity {
 /** The token's symbol, for the sentiment (which is by symbol). */
 readonly symbol?: string;
 /** What the person typed when they gave a symbol and not an address. */
 readonly symbolQuery?: string;
 readonly kind: SymbolKind;
}

export interface OnchainSourceDeps {
 readonly gateway: Pick<OnchainGatewayInternal, "callInternal">;
 readonly now: () => number;
 /** The same measures of the other tokens of the chain (from the cached trending list), for the reference percentiles. */
 readonly sets?: (chainIndex: string) => { readonly netUnsoldUsd: readonly number[]; readonly liquidityUsd: readonly number[] };
 /** The leaderboard of the chain, full wallet addresses, from the server's cache; null when it is not at hand. */
 readonly leaderboard?: (chainIndex: string) => readonly WalletWin[] | null;
 /** What to quote with: the token on the other side and a whole amount in its smallest unit. */
 readonly quotePair?: (chainIndex: string) => { readonly fromToken: string; readonly amount: string } | undefined;
 /** What is known about the token's symbol. Without it the sentiment is left out. */
 readonly identity?: (chainIndex: string, address: string) => TokenIdentity;
}

const CHAIN = /^\d{1,12}$/;

/** Which slot of the digest each planned call fills. Calls without a slot are made and not used by the digest yet. */
const SLOT: Readonly<Record<string, keyof OnchainSources | undefined>> = {
 T2: "priceInfo",
 T4: "trades",
 T5: "smartTrades",
 T6: "signals",
 T7: "topTraders",
 T8: "risk",
 T9: "pools",
 T10: "cluster",
 T12: "sentiment",
 T13: "quote",
};
const SOURCE_KEY: Readonly<Record<keyof OnchainSources, string>> = {
 signals: "signals",
 risk: "token-risk",
 cluster: "clusters",
 priceInfo: "price-info",
 pools: "pools",
 trades: "trades",
 smartTrades: "trades-smart",
 topTraders: "top-traders",
 sentiment: "sentiment",
 quote: "quote",
};

const CREDENTIAL_ERRORS = new Set(["no_credentials", "incomplete_credentials"]);

export function createOnchainSource(deps: OnchainSourceDeps): BriefSource {
 return {
  async build(request: AskRequest, context): Promise<BuiltBrief> {
   if (request.modo !== "token" && request.modo !== "carteira") throw new SourceError("modo_nao_disponivel");
   const alvo = request.alvo;
   if (alvo === undefined || !("address" in alvo) || !CHAIN.test(alvo.chainIndex) || alvo.address === "") throw new SourceError("alvo_invalido");
   if (context.signal.aborted) throw new SourceError("cancelado", 0);

   const identity = deps.identity?.(alvo.chainIndex, alvo.address) ?? { kind: { origin: "onchain_token", communityRecognized: null, sameSymbolMatches: 0 } as const };
   const walletPlan = planPortfolioToken({ chainIndex: alvo.chainIndex, token: alvo.address });
   // Reuse the catalogued pool read, after price and risk. Flow remains explicit when the cap excludes it.
   const poolRead = planTokenMode({ chainIndex: alvo.chainIndex, token: alvo.address }).find(item => item.id === "T9")!;
   const plan = request.modo === "carteira" ? [...walletPlan.slice(0, 2), poolRead, ...walletPlan.slice(2)] : planTokenMode({
    chainIndex: alvo.chainIndex,
    token: alvo.address,
    symbol: identity.symbol,
    symbolQuery: identity.symbolQuery,
    quote: deps.quotePair?.(alvo.chainIndex),
   });
   const { kept } = cutPlan(plan, Math.min(MAX_ONCHAIN_CALLS, context.maxOnchainosCalls));

   const sources: { -readonly [K in keyof OnchainSources]: OnchainSources[K] } = {};
   const identityGaps: Record<string, string> = {};
   let sent = 0;
   let answered = 0;
   let credentialFailures = 0;
   let wallets: string[] = [];
   for (const item of kept) {
    if (context.signal.aborted) throw new SourceError("cancelado", sent);
    const result = await deps.gateway.callInternal(item.route, item.params, "user");
    if (result.sent) sent += 1;
    if (!result.ok) {
     if (item.id === "T2" && result.error === "bad_request") throw new SourceError("alvo_invalido");
     if (CREDENTIAL_ERRORS.has(result.error)) credentialFailures += 1;
    } else answered += 1;
    const slot = SLOT[item.id];
    if (slot !== undefined) sources[slot] = result.ok ? { ok: true, data: result.data, meta: { ageMs: result.meta.ageMs, stale: result.meta.stale } } : ({ ok: false, error: result.error } satisfies GatewayLike);
    if (item.id === "T6" && result.ok && !result.meta.stale && Array.isArray(result.data)) {
     wallets = result.data.flatMap((row) => (typeof row === "object" && row !== null && Array.isArray((row as { wallets?: unknown }).wallets) ? ((row as { wallets: unknown[] }).wallets.filter((w): w is string => typeof w === "string")) : []));
    }
   }
   if (context.signal.aborted) throw new SourceError("cancelado", sent);
   if (kept.length > 0 && answered === 0 && credentialFailures === kept.length) throw new SourceError("sem_credencial_onchainos");

   if (request.modo === "carteira") {
    for (const [slot, key] of [["priceInfo", "price-info"], ["risk", "token-risk"]] as const) {
     const result = sources[slot];
     const data = result?.ok ? result.data : null;
     const row = Array.isArray(data) ? data[0] : data;
     const obj = row && typeof row === "object" ? row as Record<string, unknown> : null;
     const sameAddress = typeof obj?.address !== "string" || obj.address === "" || (alvo.chainIndex === "501" ? obj.address === alvo.address : obj.address.toLowerCase() === alvo.address.toLowerCase());
     const sameChain = typeof obj?.chainIndex !== "string" || obj.chainIndex === "" || obj.chainIndex === alvo.chainIndex;
     if (!sameAddress || !sameChain) {
      sources[slot] = { ok: false, error: "schema_error" };
      identityGaps[key] = "market_identity_mismatch";
     }
    }
   }
   const digestSources: { -readonly [K in keyof OnchainSources]: OnchainSources[K] } = {};
   const staleSources: Array<{ slot: keyof OnchainSources; ageMs: number | null }> = [];
   for (const slot of Object.keys(sources) as Array<keyof OnchainSources>) {
    const source = sources[slot];
    if (source === undefined) continue;
    if (!source.ok) {
     digestSources[slot] = source;
     continue;
    }
    const ageMs = source.meta?.ageMs;
    const ageUnavailable = typeof ageMs !== "number" || !Number.isFinite(ageMs);
    const walletSourceStale = request.modo === "carteira"
     && (slot === "priceInfo" || slot === "risk" || slot === "pools")
     && (source.meta?.stale !== false || ((slot === "risk" || slot === "pools") && ageUnavailable));
    if (source.meta?.stale === true || walletSourceStale) staleSources.push({ slot, ageMs: ageUnavailable ? null : ageMs });
    else digestSources[slot] = source;
   }

   const board = deps.leaderboard?.(alvo.chainIndex) ?? null;
   const quality = board === null ? null : qualityFromWallets(wallets, board).value;
   const digest = buildOnchainDigest({
    sources: digestSources,
    sets: deps.sets?.(alvo.chainIndex) ?? { netUnsoldUsd: [], liquidityUsd: [] },
    quality,
    symbol: identity.kind,
   });
   let input = onchainBriefInput({ chainIndex: alvo.chainIndex, address: alvo.address }, deps.now(), digest);
   if (staleSources.length > 0) {
    const idades = { ...input.idades };
    const origens = { ...input.origens };
    const nulos = { ...input.nulos };
    for (const { slot, ageMs } of staleSources) {
     const key = SOURCE_KEY[slot];
     if (ageMs !== null && Number.isFinite(ageMs)) idades[key] = ageMs;
     origens[key] = "onchainos";
     nulos[key] = "dado_stale";
     if (slot === "risk") nulos.risco = "dado_stale";
    }
    input = { ...input, idades, origens, nulos };
   }
   if (request.modo === "carteira") {
    const priceInfo = sources.priceInfo;
    const row = priceInfo?.ok && Array.isArray(priceInfo.data) ? priceInfo.data[0] : null;
    const obj = row && typeof row === "object" ? row as Record<string, unknown> : null;
    const number = (raw: unknown, signed = false): number | null => typeof raw === "number" && Number.isFinite(raw) && (signed || raw >= 0) ? raw : null;
    const windows = (raw: unknown, signed = false) => {
     const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
     return { m5: number(value.m5, signed), h1: number(value.h1, signed), h4: number(value.h4, signed), h24: number(value.h24, signed) };
    };
    const priceAge = priceInfo?.ok ? number(priceInfo.meta?.ageMs) : null;
    const marketStale = priceInfo?.ok ? priceInfo.meta?.stale !== false : true;
    const market = !priceInfo?.ok || (obj === null && !marketStale) ? null : { priceUsd: marketStale ? null : number(obj?.price), liquidityUsd: marketStale ? null : number(obj?.liquidityUsd), changePct: marketStale ? windows(null, true) : windows(obj?.change, true), volumeUsd: marketStale ? windows(null) : windows(obj?.volume), ageMs: priceAge, stale: marketStale };
    const trades = sources.trades;
    const tradeCount = trades?.ok && trades.meta?.stale !== true && Array.isArray(trades.data) ? trades.data.length : null;
    // Keep stale risk metadata, but never promote stale values into current wallet evidence.
    const riskSource = sources.risk;
    const riskRow = riskSource?.ok ? (Array.isArray(riskSource.data) ? riskSource.data[0] : riskSource.data) : null;
    const riskObj = riskRow && typeof riskRow === "object" ? riskRow as Record<string, unknown> : null;
    const riskAge = riskSource?.ok ? number(riskSource.meta?.ageMs) : null;
    const riskStale = riskSource?.ok ? riskSource.meta?.stale !== false || riskAge === null : true;
    const level = riskObj?.riskLevel;
    const pct = (field: string): number | null => riskStale ? null : toPct100(number(riskObj?.[field]), scaleOf(`advanced-info.${field}`));
    const count = (field: string): number | null => { const value = riskStale ? null : number(riskObj?.[field]); return value !== null && Number.isSafeInteger(value) ? value : null; };
    const hasRiskObservation = riskObj !== null || (riskSource?.ok === true && riskStale);
    const riskDetails = !hasRiskObservation ? null : { level: !riskStale && typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 5 ? level : null, tags: riskStale ? [] : sanitizeTags(Array.isArray(riskObj?.tags) ? riskObj.tags : []).flags, lpBurnedPct: pct("lpBurnedPct"), devCreateCount: count("devCreateCount"), devLaunchedCount: count("devLaunchedCount"), devRugCount: count("devRugCount"), origin: "onchainos", ageMs: riskAge, stale: riskStale };
    const concentration = !hasRiskObservation ? null : { top10HoldPct: pct("top10HoldPct"), devHoldPct: pct("devHoldPct"), bundleHoldPct: pct("bundleHoldPct"), sniperHoldPct: pct("sniperHoldPct"), suspiciousHoldPct: pct("suspiciousHoldPct"), origin: "onchainos", ageMs: riskAge, stale: riskStale };
    const ambiguous = !riskStale && ["devHoldPct", "bundleHoldPct", "sniperHoldPct", "suspiciousHoldPct"].some(field => number(riskObj?.[field]) !== null && scaleOf(`advanced-info.${field}`) === "ambigua");
    const pools = sources.pools;
    const poolAge = pools?.ok ? number(pools.meta?.ageMs) : null;
    const poolStale = pools?.ok ? pools.meta?.stale !== false || poolAge === null : true;
    const poolRows = pools?.ok && !poolStale && Array.isArray(pools.data) ? pools.data.slice(0, 5) : null;
    const liquidity = poolRows?.map(row => number(row && typeof row === "object" ? (row as Record<string, unknown>).liquidityUsd : null)) ?? [];
    const sum = liquidity.length > 0 && liquidity.every(value => value !== null) ? liquidity.reduce<number>((total, value) => total + value!, 0) : null;
    const total = number(sum);
    const poolLiquidity = pools?.ok && (poolRows !== null || poolStale) ? { poolCount: poolRows?.length ?? null, topPoolsLiquidityUsd: poolStale ? null : total, largestPoolSharePct: poolStale ? null : total !== null && total > 0 ? Math.max(...liquidity as number[]) * 100 / total : null, partial: true, origin: "onchainos", ageMs: poolAge, stale: poolStale } : null;
    const risk = input.risco && typeof input.risco.nivel === "number" && input.risco.nivel >= 1 && input.risco.nivel <= 5 ? input.risco : input.risco ? { ...input.risco, nivel: null } : null;
    input = { ...input, familiasHabilitadas: ["carteira"], candidatos: input.candidatos.filter(candidate => candidate.tipo === "token").map(candidate => ({ id: candidate.id, tipo: candidate.tipo })), trilha: null, fluxo: { buyShare: input.fluxo?.buyShare ?? null, market, tradeCount, riskDetails, concentration, poolLiquidity }, risco: riskStale ? null : risk, nulos: { ...Object.fromEntries(Object.entries(input.nulos ?? {}).filter(([key]) => !key.startsWith("trilha."))), ...identityGaps, ...(riskSource?.ok && riskStale ? { "token-risk": "dado_stale", risco: "dado_stale", concentration: "dado_stale", honeypot: "dado_stale" } : {}), ...(riskSource?.ok && riskStale ? {} : input.risco?.nivel === null ? { risco: "nivel_indefinido" } : {}), ...(ambiguous ? { concentration: "scale_ambiguous" } : {}), ...(pools?.ok && poolStale ? { pools: "dado_stale" } : {}), ...(poolRows !== null && total === null ? { pools: "liquidity_unavailable" } : {}) } };
   }
   try {
    const { brief } = buildBrief(input);
    return { brief, candidates: input.candidatos, onchainosCalls: sent };
   } catch (error) {
    if (error instanceof BriefTooLarge) throw new SourceError("brief_grande_demais", sent);
    throw error;
   }
  },
 };
}

/** One source per mode: each click goes to the source of its mode, and a mode nobody serves is refused with a constant code. */
export function routeByMode(sources: Partial<Record<AskMode, BriefSource>>): BriefSource {
 return {
  build(request, context) {
   const source = sources[request.modo];
   if (source === undefined) return Promise.reject(new SourceError("modo_nao_disponivel"));
   return source.build(request, context);
  },
 };
}
