/**
 * Pure row models of the B1 on-chain surfaces (dock Fita/Liquidez on-chain, the Holders risk card
 * and the Ecossistema news section). Every displayed string is produced here so the components are
 * a map over finished rows and the rules are testable without React. Missing fields become the
 * UNAVAILABLE word, never a zero; provider percents keep the provider's scale ("como o provedor envia").
 */
import type {
  ClusterOverview,
  KolRow,
  NewsArticle,
  OnchainTrade,
  PoolRow,
  PriceInfo,
  SentimentLabel,
  SentimentRow,
  TokenRisk,
  VibeTimeline,
} from "../onchain/client";
import { fmtCompact, fmtNumber, fmtPctSigned, fmtTimeMs, priceDecimalsForMagnitude, UNAVAILABLE } from "../desk/ui/format";
import { fmtRelAgo, fmtUsd } from "./onchain-rows";

/** The symbol rule of the news/sentiment routes: the same the gateway enforces. */
export const NEWS_SYMBOL = /^[A-Za-z0-9]{1,20}$/;

/* ---------- Fita on-chain ---------- */

export interface OnchainTradeRowModel {
  readonly key: string;
  readonly hora: string;
  readonly ago: string;
  readonly side: "buy" | "sell";
  readonly sideWord: string;
  readonly priceUsd: string;
  readonly volumeUsd: string;
  readonly dex: string;
  readonly wallet: string;
}

/** DEX prints newest first (the gateway already sorts); the wallet and tx arrive shortened. */
export function tradeTapeRows(trades: readonly OnchainTrade[], nowMs: number): OnchainTradeRowModel[] {
  return [...trades]
    .sort((a, b) => b.tsMs - a.tsMs)
    .map((t, i) => ({
      key: t.id ?? `${t.tsMs}-${i}`,
      hora: fmtTimeMs(t.tsMs),
      ago: fmtRelAgo(t.tsMs, nowMs),
      side: t.side,
      sideWord: t.side === "buy" ? "Compra" : "Venda",
      priceUsd: `US$ ${fmtNumber(t.priceUsd, priceDecimalsForMagnitude(t.priceUsd))}`,
      volumeUsd: fmtUsd(t.volumeUsd),
      dex: t.dex ?? UNAVAILABLE,
      wallet: t.wallet ?? UNAVAILABLE,
    }));
}

/* ---------- Liquidez on-chain ---------- */

export interface PriceMetricsModel {
  readonly price: string;
  readonly liquidity: string;
  readonly marketCap: string;
  readonly holders: string;
  readonly low24h: string;
  readonly high24h: string;
}

/** The price-info metrics line; an absent row leaves every field Indisponivel, never zero. */
export function priceMetrics(info: PriceInfo | null): PriceMetricsModel {
  return {
    price: info === null ? UNAVAILABLE : `US$ ${fmtNumber(info.price, priceDecimalsForMagnitude(info.price))}`,
    liquidity: fmtUsd(info?.liquidityUsd ?? null),
    marketCap: fmtUsd(info?.marketCap ?? null),
    holders: info?.holders === null || info?.holders === undefined ? UNAVAILABLE : fmtNumber(info.holders, 0),
    low24h: fmtUsd(info?.low24h ?? null),
    high24h: fmtUsd(info?.high24h ?? null),
  };
}

export interface WindowRowModel {
  readonly key: string;
  readonly label: string;
  readonly changePct: string;
  readonly changeTone: "buy" | "sell" | null;
  readonly volumeUsd: string;
  readonly txs: string;
}

const WINDOWS: readonly { readonly key: "m5" | "h1" | "h4" | "h24"; readonly label: string }[] = [
  { key: "m5", label: "5 min" },
  { key: "h1", label: "1 h" },
  { key: "h4", label: "4 h" },
  { key: "h24", label: "24 h" },
];

/** Janelas table: one row per window, in the fixed 5m/1h/4h/24h order. */
export function windowRows(info: PriceInfo | null): WindowRowModel[] {
  return WINDOWS.map(({ key, label }) => {
    const change = info?.change[key] ?? null;
    return {
      key,
      label,
      changePct: fmtPctSigned(change, 2),
      changeTone: change === null || change === 0 ? null : change > 0 ? "buy" : "sell",
      volumeUsd: fmtUsd(info?.volume[key] ?? null),
      txs: info?.txs[key] === null || info?.txs[key] === undefined ? UNAVAILABLE : fmtNumber(info.txs[key]!, 0),
    };
  });
}

export interface PoolRowModel {
  readonly key: string;
  readonly pool: string;
  readonly protocol: string;
  readonly liquidityUsd: string;
  readonly feePct: string;
}

export function poolRows(pools: readonly PoolRow[]): PoolRowModel[] {
  return pools.map((p, i) => ({
    key: p.address ?? `pool-${i}`,
    pool: p.pool ?? UNAVAILABLE,
    protocol: p.protocol ?? UNAVAILABLE,
    liquidityUsd: fmtUsd(p.liquidityUsd),
    feePct: p.feePct === null ? UNAVAILABLE : fmtPctSigned(p.feePct, 2).replace(/^\+/, ""),
  }));
}

/* ---------- Holders: Estrutura e risco ---------- */

export interface RiskStatModel {
  readonly label: string;
  readonly value: string;
}

/** The percent scale is the provider's: the value is rendered exactly as sent, never rescaled. */
const pct = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? UNAVAILABLE : `${fmtNumber(v, 1)}%`;

export interface RiskCardModel {
  readonly riskLevel: string;
  readonly tags: readonly string[];
  readonly stats: readonly RiskStatModel[];
  readonly devs: readonly RiskStatModel[];
  readonly age: string;
}

export function riskCardModel(risk: TokenRisk, nowMs: number): RiskCardModel {
  return {
    riskLevel: risk.riskLevel === null ? UNAVAILABLE : `Nivel ${risk.riskLevel} de 5`,
    tags: risk.tags.slice(0, 12),
    stats: [
      { label: "Top 10", value: pct(risk.top10HoldPct) },
      { label: "Dev", value: pct(risk.devHoldPct) },
      { label: "Bundlers", value: pct(risk.bundleHoldPct) },
      { label: "Snipers", value: pct(risk.sniperHoldPct) },
      { label: "Suspeitos", value: pct(risk.suspiciousHoldPct) },
      { label: "LP queimado", value: pct(risk.lpBurnedPct) },
    ],
    devs: [
      { label: "Tokens criados", value: risk.devCreateCount === null ? UNAVAILABLE : fmtNumber(risk.devCreateCount, 0) },
      { label: "Lancados", value: risk.devLaunchedCount === null ? UNAVAILABLE : fmtNumber(risk.devLaunchedCount, 0) },
      { label: "Rug pulls", value: risk.devRugCount === null ? UNAVAILABLE : fmtNumber(risk.devRugCount, 0) },
    ],
    age: risk.createdMs === null ? UNAVAILABLE : fmtRelAgo(risk.createdMs, nowMs).replace(/^ha /, ""),
  };
}

export interface ClusterModel {
  readonly concentration: string;
  readonly stats: readonly RiskStatModel[];
}

export function clusterModel(cluster: ClusterOverview): ClusterModel {
  const word = cluster.concentration === "Low" ? "Baixa" : cluster.concentration === "Medium" ? "Media" : cluster.concentration === "High" ? "Alta" : UNAVAILABLE;
  return {
    concentration: word,
    stats: [
      { label: "Top 100", value: pct(cluster.top100HoldPct) },
      { label: "Enderecos novos", value: pct(cluster.newAddressPct) },
      { label: "Mesma origem de fundos", value: pct(cluster.sameFundSourcePct) },
      { label: "Mesma criacao", value: pct(cluster.sameCreationTimePct) },
      { label: "Rug pull", value: pct(cluster.rugPullPct) },
    ],
  };
}

/* ---------- Ecossistema: noticias e sentimento ---------- */

export function sentimentWord(label: SentimentLabel | null): string {
  return label === "bullish" ? "Otimista" : label === "bearish" ? "Pessimista" : label === "neutral" ? "Neutro" : UNAVAILABLE;
}

export function importanceWord(imp: NewsArticle["importance"]): string {
  return imp === "high" ? "Alta" : imp === "medium" ? "Media" : imp === "low" ? "Baixa" : UNAVAILABLE;
}

export interface SentimentModel {
  readonly label: string;
  readonly tone: "buy" | "sell" | null;
  readonly ratios: string;
  readonly counts: string;
}

export function sentimentModel(s: SentimentRow): SentimentModel {
  const tone = s.label === "bullish" ? "buy" : s.label === "bearish" ? "sell" : null;
  const share = (v: number | null): string =>
    v === null || !Number.isFinite(v) ? UNAVAILABLE : `${Math.round(v * 100)}%`;
  return {
    label: sentimentWord(s.label),
    tone,
    ratios: `otimista ${share(s.bullishRatio)}, pessimista ${share(s.bearishRatio)}`,
    counts: `${s.mentions === null ? UNAVAILABLE : fmtNumber(s.mentions, 0)} mencoes, ${s.newsMentions === null ? UNAVAILABLE : fmtNumber(s.newsMentions, 0)} noticias, ${s.xMentions === null ? UNAVAILABLE : fmtNumber(s.xMentions, 0)} no X`,
  };
}

export interface NewsRowModel {
  readonly key: string;
  readonly hora: string;
  readonly ago: string;
  readonly importance: string;
  readonly title: string;
  readonly source: string;
  /** Plain-text summary for the row title attribute, never rendered as HTML. */
  readonly titleAttr: string;
}

/** Up to 10 articles, newest first; the summary only lives on the title attribute. */
export function newsRows(articles: readonly NewsArticle[], nowMs: number): NewsRowModel[] {
  return [...articles]
    .sort((a, b) => b.tsMs - a.tsMs)
    .slice(0, 10)
    .map((a) => ({
      key: a.id,
      hora: fmtTimeMs(a.tsMs),
      ago: fmtRelAgo(a.tsMs, nowMs),
      importance: importanceWord(a.importance),
      title: a.title,
      source: a.source ?? UNAVAILABLE,
      titleAttr: a.summary ?? a.title,
    }));
}

export interface VibeModel {
  readonly score: string;
  readonly scoreTone: "buy" | "sell" | null;
  readonly change: string;
  readonly counts: string;
}

/** Calor social: score 0 a 100 with the change rate, mentions and impressions. */
export function vibeModel(v: VibeTimeline): VibeModel {
  const rate = v.scoreChangeRate;
  return {
    score: v.score === null ? UNAVAILABLE : fmtNumber(v.score, 1),
    scoreTone: rate === null || rate === 0 ? null : rate > 0 ? "buy" : "sell",
    change: rate === null ? UNAVAILABLE : `${rate > 0 ? "+" : ""}${fmtNumber(rate, 1)}%`,
    counts: `${v.mentions === null ? UNAVAILABLE : fmtNumber(v.mentions, 0)} mencoes, ${v.impressions === null ? UNAVAILABLE : fmtCompact(v.impressions)} impressoes, engajamento ${v.engagement === null ? UNAVAILABLE : fmtCompact(v.engagement)}`,
  };
}

export interface KolRowModel {
  readonly key: string;
  readonly conta: string;
  readonly seguidores: string;
  readonly mencoes: string;
  readonly impressoes: string;
  readonly engajamento: string;
}

export function kolRows(kols: readonly KolRow[]): KolRowModel[] {
  return kols.map((k) => ({
    key: k.handle,
    conta: `@${k.handle}`,
    seguidores: fmtCompact(k.followers),
    mencoes: k.mentions === null ? UNAVAILABLE : fmtNumber(k.mentions, 0),
    impressoes: fmtCompact(k.impressions),
    engajamento: fmtCompact(k.engagement),
  }));
}
