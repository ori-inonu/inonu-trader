/**
 * The digest of one on-chain token for the Evidence Brief (fase-2 SPEC F2-DIG-1 to F2-DIG-7, F2-DIG-11). It takes what the
 * OnchainOS gateway answered (the browser shape: shortened wallets, no URL, no third party text) and returns the pieces of a
 * `BriefInput`: the trail with its components, the risk level and flags, the flow, the age of each source and the reason of
 * every unknown. The code describes; it never says buy or sell, and nothing here chooses an action.
 *
 * A source that did not answer leaves its components `null` with the reason in `nulos`, never zero. Pure.
 */
import type { BriefInput, BriefCandidate, Json } from "./brief";
import { HOLD_CANDIDATE, tokenCandidate } from "./candidates";
import { concentrationFromGateway } from "./onchain-adapt";
import { buySellUsd, flowComponent, liquidityComponent, sentimentComponent, signalsInputs, type SignalLike, type SymbolKind } from "./onchain-components";
import { classifyResult, type GatewayLike, type NuloState } from "./onchain-nulos";
import { derivedRiskFlags, isHoneypot, riskComponent, sanitizeTags, type RiskInput } from "./onchain-risk";
import { smartCost } from "./smart-cost";
import { boughtComponent, trailScore, unsoldComponent, walletsComponent, type Component } from "./trail";

export interface OnchainSources {
  readonly signals?: GatewayLike;
  readonly risk?: GatewayLike;
  readonly cluster?: GatewayLike;
  readonly priceInfo?: GatewayLike;
  readonly pools?: GatewayLike;
  readonly trades?: GatewayLike;
  /** The same trades filtered by `tagFilter=3` (smart money). */
  readonly smartTrades?: GatewayLike;
  /** The top traders of wallet type 3 in the server shape (average buy price, bought and sold quantity). */
  readonly topTraders?: GatewayLike;
  readonly sentiment?: GatewayLike;
  readonly quote?: GatewayLike;
}

export interface DigestInput {
  readonly sources: OnchainSources;
  /** The same measures of the other tokens of the chain, for the reference percentiles. */
  readonly sets: { readonly netUnsoldUsd: readonly number[]; readonly liquidityUsd: readonly number[] };
  /** Mean win rate (0 to 1) of the tracked wallets of this token, from the server only join; null without it. */
  readonly quality: number | null;
  readonly symbol: SymbolKind;
}

export interface DigestTrail {
  readonly nota: number | null;
  readonly componentes: Readonly<Record<string, number | null>>;
  readonly componentesAusentes: readonly string[];
}

export interface OnchainDigest {
  readonly trilha: DigestTrail;
  readonly risco: BriefInput["risco"];
  readonly fluxo: NonNullable<BriefInput["fluxo"]>;
  readonly idades: Record<string, number>;
  readonly origens: Record<string, string>;
  readonly nulos: Record<string, string>;
  /** True, false, or null when nothing answered: unknown is never "safe". */
  readonly honeypot: boolean | null;
}

/** Names of the sources in `idades`, `origens` and `nulos`: the route ids, so a reader can find the route. */
const KEY: Readonly<Record<keyof OnchainSources, string>> = {
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

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null);
const rows = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec).filter((r): r is Rec => r !== null) : []);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number | null, digits: number): number | null => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

interface Answer {
  readonly state: NuloState;
  readonly data: unknown;
}

export function buildOnchainDigest(input: DigestInput): OnchainDigest {
  const idades: Record<string, number> = {};
  const origens: Record<string, string> = {};
  const nulos: Record<string, string> = {};

  const answers = {} as Record<keyof OnchainSources, Answer>;
  for (const name of Object.keys(KEY) as Array<keyof OnchainSources>) {
    const result = input.sources[name];
    const key = KEY[name];
    if (result === undefined) {
      answers[name] = { state: { state: "nao_consultado", nulo: "nao_consultado:nao_pedido" }, data: null };
      nulos[key] = "nao_consultado:nao_pedido";
      continue;
    }
    const state = classifyResult(result);
    answers[name] = { state, data: result.ok ? result.data : null };
    if (state.state === "dado") {
      if (state.ageMs !== null) idades[key] = state.ageMs;
      origens[key] = "onchainos";
    } else {
      nulos[key] = state.nulo;
      if (state.state === "vazio_valido") origens[key] = "onchainos";
    }
  }
  const has = (a: Answer) => a.state.state === "dado";
  /** The reason a component is absent when its source did not give data. */
  const whyNot = (...list: Answer[]): string => {
    const missing = list.find((a) => !has(a));
    return missing === undefined ? "sem_dado" : (missing.state as { nulo: string }).nulo;
  };

  // ---- signals: purchase, wallets, unsold
  const signalRows: Array<SignalLike & { readonly priceUsd: number }> = has(answers.signals)
    ? rows(answers.signals.data).map((r) => ({ amountUsd: numOrNull(r.amountUsd) ?? Number.NaN, soldRatioPct: numOrNull(r.soldRatioPct), walletCount: numOrNull(r.walletCount) ?? Number.NaN, priceUsd: numOrNull(r.priceUsd) ?? Number.NaN }))
    : [];
  const sig = signalsInputs(signalRows);

  const values: Record<Component, number | null> = {
    compra: null, carteiras: null, naoVendida: null, qualidade: null, concentracao: null, risco: null, liquidez: null, fluxo: null, sentimento: null,
  };
  const reasons: Partial<Record<Component, string>> = {};
  const absent = (c: Component, reason: string) => {
    values[c] = null;
    reasons[c] = reason;
  };

  if (!has(answers.signals)) {
    for (const c of ["compra", "carteiras", "naoVendida"] as const) absent(c, whyNot(answers.signals));
  } else {
    values.carteiras = walletsComponent(sig.walletCount);
    values.naoVendida = unsoldComponent(sig.soldPercents);
    if (values.naoVendida === null) absent("naoVendida", "sem_linha_valida");
    if (sig.netUnsoldUsd === null) absent("compra", "sem_linha_valida");
    else {
      values.compra = boughtComponent(sig.netUnsoldUsd, input.sets.netUnsoldUsd);
      if (values.compra === null) absent("compra", "sem_conjunto");
    }
  }

  // ---- quality: the join with the leaderboard needs full wallet addresses, which only the server has
  if (input.quality === null || !Number.isFinite(input.quality) || input.quality < 0 || input.quality > 1) absent("qualidade", "sem_enderecos");
  else values.qualidade = input.quality;

  // ---- concentration: the cluster label first, the top 10 share of the risk answer as the fallback
  const riskObj = has(answers.risk) ? rec(answers.risk.data) : null;
  const clusterObj = has(answers.cluster) ? rec(answers.cluster.data) : null;
  const concentration = concentrationFromGateway({
    cluster: clusterObj === null ? null : { concentration: typeof clusterObj.concentration === "string" ? clusterObj.concentration : null },
    risk: riskObj === null ? null : { top10HoldPct: numOrNull(riskObj.top10HoldPct) },
  });
  if (concentration.value === null) absent("concentracao", has(answers.cluster) || has(answers.risk) ? "sem_dado" : whyNot(answers.cluster));
  else values.concentracao = concentration.value;

  // ---- risk
  const level = riskObj === null ? null : numOrNull(riskObj.riskLevel);
  const risk = riskComponent(level);
  if (riskObj === null) absent("risco", whyNot(answers.risk));
  else if (risk.value === null) absent("risco", risk.reason ?? "sem_dado");
  else values.risco = risk.value;

  // ---- liquidity: the price-info number, else the sum of the pools
  const priceRow = has(answers.priceInfo) ? rows(answers.priceInfo.data)[0] ?? null : null;
  const poolSum = has(answers.pools) ? rows(answers.pools.data).reduce<number | null>((sum, r) => (numOrNull(r.liquidityUsd) === null ? sum : (sum ?? 0) + (r.liquidityUsd as number)), null) : null;
  const liquidityUsd = (priceRow === null ? null : numOrNull(priceRow.liquidityUsd)) ?? poolSum;
  if (liquidityUsd === null) absent("liquidez", has(answers.priceInfo) || has(answers.pools) ? "sem_dado" : whyNot(answers.priceInfo, answers.pools));
  else {
    values.liquidez = liquidityComponent(liquidityUsd, input.sets.liquidityUsd);
    if (values.liquidez === null) absent("liquidez", "sem_conjunto");
  }

  // ---- flow: the buy share by volume in USD (an approximation, FLX-9)
  const shareOf = (a: Answer): number | null =>
    has(a)
      ? flowComponent(buySellUsd(rows(a.data).flatMap((r) => (r.side === "buy" || r.side === "sell") && numOrNull(r.volumeUsd) !== null ? [{ side: r.side as "buy" | "sell", volumeUsd: r.volumeUsd as number }] : [])))
      : null;
  values.fluxo = shareOf(answers.trades);
  if (values.fluxo === null) absent("fluxo", has(answers.trades) ? "sem_volume" : whyNot(answers.trades));
  const smartShare = shareOf(answers.smartTrades);

  // ---- sentiment: by symbol, so only for an unambiguous one
  const sentimentState = answers.sentiment.state.state;
  const sentimentObj = has(answers.sentiment) ? rec(answers.sentiment.data) : null;
  const sentiment = sentimentComponent({
    kind: input.symbol,
    coverage: sentimentState === "dado" ? "coberto" : sentimentState === "vazio_valido" ? "vazio" : "nao_consultado",
    bullishRatio: sentimentObj === null ? null : numOrNull(sentimentObj.bullishRatio),
  });
  if (sentiment.value === null) absent("sentimento", sentiment.nulo === "nao_consultado" ? whyNot(answers.sentiment) : (sentiment.nulo ?? "sem_dado"));
  else values.sentimento = sentiment.value;

  // ---- honeypot, risk flags and the note
  const quoteObj = has(answers.quote) ? rec(answers.quote.data) : null;
  const side = (v: unknown): { isHoneyPot: boolean | null } => ({ isHoneyPot: typeof rec(v)?.isHoneyPot === "boolean" ? (rec(v)!.isHoneyPot as boolean) : null });
  const tags = riskObj === null ? null : sanitizeTags(Array.isArray(riskObj.tags) ? riskObj.tags : []);
  const honeypot = isHoneypot({
    tags: tags === null ? null : tags.flags,
    quote: quoteObj === null ? null : { fromToken: side(quoteObj.fromToken), toToken: side(quoteObj.toToken) },
  });

  const trail = trailScore(values, { honeypot: honeypot === true });
  const trilha: DigestTrail = {
    nota: round(trail.nota, 2),
    componentes: Object.fromEntries(Object.entries(trail.componentes).map(([k, v]) => [k, round(v, 3)])) as Record<string, number | null>,
    componentesAusentes: trail.componentesAusentes as string[],
  };
  for (const c of trail.componentesAusentes) nulos[`trilha.${c}`] = reasons[c] ?? "sem_dado";

  let risco: BriefInput["risco"] = null;
  if (riskObj !== null || honeypot === true) {
    const derived =
      riskObj === null
        ? { flags: [] as string[], skipped: {} as Record<string, string> }
        : derivedRiskFlags({
            top10HoldPct: numOrNull(riskObj.top10HoldPct),
            devHoldPct: numOrNull(riskObj.devHoldPct),
            bundleHoldPct: numOrNull(riskObj.bundleHoldPct),
            sniperHoldPct: numOrNull(riskObj.sniperHoldPct),
            suspiciousHoldPct: numOrNull(riskObj.suspiciousHoldPct),
            lpBurnedPct: numOrNull(riskObj.lpBurnedPct),
            devRugCount: numOrNull(riskObj.devRugCount),
          } satisfies RiskInput);
    const flags = [...new Set([...(tags?.flags ?? []), ...derived.flags, ...(honeypot === true ? ["honeypot"] : [])])].sort();
    risco = { nivel: level !== null && Number.isInteger(level) && level >= 0 && level <= 5 ? level : null, flags };
    if (tags !== null && tags.dropped > 0) nulos["risco.tags_descartadas"] = String(tags.dropped);
    for (const [flag, why] of Object.entries(derived.skipped)) nulos[`risco.${flag}`] = why;
  } else {
    nulos.risco = nulos["token-risk"] ?? "sem_dado";
  }
  if (honeypot === null) nulos.honeypot = "desconhecido";

  const janela = (period: "m5" | "h1" | "h24"): Json => {
    const change = rec(priceRow?.change);
    const volume = rec(priceRow?.volume);
    return { var: numOrNull(change?.[period]), vol: numOrNull(volume?.[period]) };
  };
  // what the tracked wallets paid against the price now (E6, V-CUSTO-1); the top traders can only corroborate with an ATR,
  // which a token digest does not carry yet, so a corroboration is never claimed here
  const price = priceRow === null ? null : numOrNull(priceRow.price);
  const cost = smartCost({
    signals: signalRows.filter((r) => r.priceUsd > 0 && r.amountUsd > 0 && r.soldRatioPct !== null).map((r) => ({ price: r.priceUsd, amountUsd: r.amountUsd, soldRatioPercent: r.soldRatioPct as number })),
    topTraders: has(answers.topTraders)
      ? rows(answers.topTraders.data).flatMap((r) => (numOrNull(r.avgBuyPrice) !== null && numOrNull(r.boughtAmount) !== null && numOrNull(r.soldAmount) !== null ? [{ avgBuyPrice: r.avgBuyPrice as number, boughtAmount: r.boughtAmount as number, soldAmount: r.soldAmount as number }] : []))
      : [],
  });
  const custo: Json = cost === null ? null : { sinaisBps: price === null || !(price > 0) ? null : Math.round(((cost.custoSinais - price) / price) * 10_000), distribuicao: round(cost.distribuicao, 3), corroborado: cost.corroborado };

  const fluxo: NonNullable<BriefInput["fluxo"]> = {
    aprox: true,
    buyShare: round(values.fluxo, 3),
    smartBuyShare: round(smartShare, 3),
    custo,
    janelas: priceRow === null ? null : { m5: janela("m5"), h1: janela("h1"), h24: janela("h24") },
  };

  return { trilha, risco, fluxo, idades, origens, nulos, honeypot };
}

/** The `BriefInput` of a token target from its digest: the candidate is the token (with its note) and holding. */
export function onchainBriefInput(target: { readonly chainIndex: string; readonly address: string }, asOfMs: number, digest: OnchainDigest): BriefInput {
  const candidates: BriefCandidate[] = [tokenCandidate({ ...target, ...(digest.trilha.nota === null ? {} : { nota: digest.trilha.nota }) }), HOLD_CANDIDATE];
  return {
    alvo: target,
    asOfMs,
    familiasHabilitadas: ["trilha"],
    fluxo: digest.fluxo,
    candidatos: candidates,
    trilha: digest.trilha,
    risco: digest.risco,
    regime: null,
    idades: digest.idades,
    origens: digest.origens,
    nulos: { ...digest.nulos, regime: "nao_se_aplica_a_token" },
  };
}
