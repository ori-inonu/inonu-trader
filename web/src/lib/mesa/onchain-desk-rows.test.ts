import { describe, expect, test } from "bun:test";
import { UNAVAILABLE } from "@/lib/desk/ui/format";
import type {
  ClusterOverview,
  KolRow,
  NewsArticle,
  OnchainTrade,
  PoolRow,
  PriceInfo,
  SentimentRow,
  TokenRisk,
  VibeTimeline,
} from "@/lib/onchain/client";
import {
  clusterModel,
  importanceWord,
  kolRows,
  NEWS_SYMBOL,
  newsRows,
  poolRows,
  priceMetrics,
  riskCardModel,
  sentimentModel,
  sentimentWord,
  tradeTapeRows,
  vibeModel,
  windowRows,
} from "./onchain-desk-rows";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const FORBIDDEN = /[·—–]/;

const info = (over: Partial<PriceInfo> = {}): PriceInfo => ({
  chainIndex: "1",
  address: "0xaaa",
  tsMs: NOW,
  price: 0.000012,
  marketCap: 5_000_000,
  liquidityUsd: 1_234_567,
  holders: 90_213,
  circSupply: null,
  high24h: 0.000014,
  low24h: 0.000011,
  tradeNum: null,
  change: { m5: -4.5, h1: 1.2, h4: null, h24: -12.3 },
  volume: { m5: 12_000, h1: 340_000, h4: null, h24: 6_336_972 },
  txs: { m5: 12, h1: 400, h4: null, h24: 213_897 },
  ...over,
});

describe("NEWS_SYMBOL", () => {
  test("accepts alphanumerics up to 20, rejects the rest", () => {
    expect(NEWS_SYMBOL.test("BTC")).toBe(true);
    expect(NEWS_SYMBOL.test("weth9")).toBe(true);
    expect(NEWS_SYMBOL.test("A".repeat(20))).toBe(true);
    expect(NEWS_SYMBOL.test("A".repeat(21))).toBe(false);
    expect(NEWS_SYMBOL.test("BTC-USDT")).toBe(false);
    expect(NEWS_SYMBOL.test("")).toBe(false);
    expect(NEWS_SYMBOL.test("TØK")).toBe(false);
  });
});

describe("tradeTapeRows", () => {
  const trades: OnchainTrade[] = [
    { id: "t-old", tsMs: NOW - 60_000, side: "sell", priceUsd: 0.000012, volumeUsd: 234.5, dex: "Uniswap V3", wallet: "0xAbC1...23fE", tx: "0xbeef" },
    { id: "t-new", tsMs: NOW - 3_000, side: "buy", priceUsd: 12_345.6789, volumeUsd: 1_250_000, dex: null, wallet: null, tx: null },
  ];

  test("newest first, spoken side, numbers through the formatters", () => {
    const rows = tradeTapeRows(trades, NOW);
    expect(rows.map((r) => r.key)).toEqual(["t-new", "t-old"]);
    expect(rows[0]!.sideWord).toBe("Compra");
    expect(rows[1]!.sideWord).toBe("Venda");
    expect(rows[0]!.priceUsd).toBe("US$ 12.346");
    expect(rows[0]!.dex).toBe(UNAVAILABLE);
    expect(rows[0]!.wallet).toBe(UNAVAILABLE);
    expect(rows[1]!.wallet).toBe("0xAbC1...23fE");
    for (const r of rows) for (const v of Object.values(r)) expect(String(v)).not.toMatch(FORBIDDEN);
  });

  test("a tiny price keeps precision instead of rounding to zero", () => {
    const rows = tradeTapeRows(trades, NOW);
    expect(rows[1]!.priceUsd).toContain("0,000012");
  });
});

describe("priceMetrics and windowRows", () => {
  test("an absent row is all Indisponivel, never zero or NaN", () => {
    const m = priceMetrics(null);
    for (const v of Object.values(m)) expect(v).toBe(UNAVAILABLE);
    const wins = windowRows(null);
    expect(wins.map((w) => w.label)).toEqual(["5 min", "1 h", "4 h", "24 h"]);
    for (const w of wins) {
      expect(w.changePct).toBe(UNAVAILABLE);
      expect(w.changeTone).toBeNull();
      expect(w.volumeUsd).toBe(UNAVAILABLE);
      expect(w.txs).toBe(UNAVAILABLE);
    }
  });

  test("metrics line keeps a tiny price and formats the rest", () => {
    const m = priceMetrics(info());
    expect(m.price).toContain("0,000012");
    expect(m.holders).toBe("90.213");
    expect(m.liquidity).toContain("US$");
    expect(m.low24h).toContain("US$");
    const wins = windowRows(info());
    expect(wins[0]).toMatchObject({ label: "5 min", changeTone: "sell" });
    expect(wins[0]!.changePct).toContain("-4,5");
    expect(wins[1]!.changeTone).toBe("buy");
    expect(wins[2]!.changePct).toBe(UNAVAILABLE);
    expect(wins[3]!.txs).toBe("213.897");
  });
});

describe("poolRows", () => {
  test("fee without the sign, nulls as Indisponivel", () => {
    const pools: PoolRow[] = [
      { pool: "WETH / USDC 0.05%", protocol: "Uniswap V3", liquidityUsd: 3_400_000, address: "0x1234...abce", feePct: 0.05 },
      { pool: null, protocol: null, liquidityUsd: 10, address: null, feePct: null },
    ];
    const rows = poolRows(pools);
    expect(rows[0]).toMatchObject({ pool: "WETH / USDC 0.05%", protocol: "Uniswap V3", feePct: "0,05%" });
    expect(rows[1]!.pool).toBe(UNAVAILABLE);
    expect(rows[1]!.feePct).toBe(UNAVAILABLE);
    expect(rows[0]!.liquidityUsd).toContain("US$");
  });
});

describe("riskCardModel", () => {
  const risk = (over: Partial<TokenRisk> = {}): TokenRisk => ({
    chainIndex: "1",
    address: "0xaaa",
    riskLevel: 2,
    tags: ["communityRecognized"],
    top10HoldPct: 17.9,
    devHoldPct: 0.4,
    bundleHoldPct: null,
    sniperHoldPct: 3,
    suspiciousHoldPct: null,
    lpBurnedPct: 99.9,
    devCreateCount: 4,
    devLaunchedCount: 3,
    devRugCount: null,
    createdMs: NOW - 40 * 86_400_000,
    progressPct: null,
    ...over,
  });

  test("level word, tags, provider-scale percents and dev counts", () => {
    const m = riskCardModel(risk(), NOW);
    expect(m.riskLevel).toBe("Nivel 2 de 5");
    expect(m.tags).toEqual(["communityRecognized"]);
    const stat = (label: string) => m.stats.find((s) => s.label === label)!;
    expect(stat("Top 10").value).toBe("17,9%");
    expect(stat("Bundlers").value).toBe(UNAVAILABLE);
    expect(stat("LP queimado").value).toBe("99,9%");
    const dev = (label: string) => m.devs.find((s) => s.label === label)!;
    expect(dev("Tokens criados").value).toBe("4");
    expect(dev("Rug pulls").value).toBe(UNAVAILABLE);
    expect(m.age).toBe("40 d");
  });

  test("missing level and counts stay Indisponivel", () => {
    const m = riskCardModel(risk({ riskLevel: null, devCreateCount: null, createdMs: null }), NOW);
    expect(m.riskLevel).toBe(UNAVAILABLE);
    expect(m.age).toBe(UNAVAILABLE);
  });
});

describe("clusterModel", () => {
  const cluster = (c: ClusterOverview["concentration"]): ClusterOverview => ({
    concentration: c,
    top100HoldPct: 22.5,
    newAddressPct: null,
    sameFundSourcePct: 10.2,
    sameCreationTimePct: 1.1,
    rugPullPct: null,
  });

  test("concentration words and percent stats", () => {
    expect(clusterModel(cluster("Low")).concentration).toBe("Baixa");
    expect(clusterModel(cluster("Medium")).concentration).toBe("Media");
    expect(clusterModel(cluster("High")).concentration).toBe("Alta");
    expect(clusterModel(cluster(null)).concentration).toBe(UNAVAILABLE);
    const m = clusterModel(cluster("High"));
    expect(m.stats.find((s) => s.label === "Top 100")!.value).toBe("22,5%");
    expect(m.stats.find((s) => s.label === "Enderecos novos")!.value).toBe(UNAVAILABLE);
  });
});

describe("sentiment and news rows", () => {
  test("spoken labels for every sentiment and importance", () => {
    expect(sentimentWord("bullish")).toBe("Otimista");
    expect(sentimentWord("bearish")).toBe("Pessimista");
    expect(sentimentWord("neutral")).toBe("Neutro");
    expect(sentimentWord(null)).toBe(UNAVAILABLE);
    expect(importanceWord("high")).toBe("Alta");
    expect(importanceWord("medium")).toBe("Media");
    expect(importanceWord("low")).toBe("Baixa");
    expect(importanceWord(null)).toBe(UNAVAILABLE);
  });

  test("sentimentModel builds the ratio and count line", () => {
    const s: SentimentRow = {
      symbol: "BTC",
      period: "24h",
      tsMs: NOW,
      mentions: 12_300,
      newsMentions: 45,
      xMentions: 9_876,
      label: "bullish",
      bullishRatio: 0.62,
      bearishRatio: 0.21,
      bullishCount: null,
      bearishCount: null,
      neutralCount: null,
    };
    const m = sentimentModel(s);
    expect(m.label).toBe("Otimista");
    expect(m.tone).toBe("buy");
    expect(m.ratios).toBe("otimista 62%, pessimista 21%");
    expect(m.counts).toBe("12.300 mencoes, 45 noticias, 9.876 no X");
    expect(m.counts).not.toMatch(FORBIDDEN);
  });

  test("newsRows: newest first, max 10, summary only on the title attribute", () => {
    const articles: NewsArticle[] = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      title: `Titulo ${i}`,
      summary: `Resumo ${i}`,
      source: "CoinDesk",
      tsMs: NOW - i * 60_000,
      importance: i === 0 ? "high" : null,
      symbols: ["BTC"],
      sentiments: [],
    }));
    const rows = newsRows(articles, NOW);
    expect(rows).toHaveLength(10);
    expect(rows[0]!.key).toBe("n0");
    expect(rows[0]!.importance).toBe("Alta");
    expect(rows[0]!.titleAttr).toBe("Resumo 0");
    expect(rows[1]!.importance).toBe(UNAVAILABLE);
    expect(newsRows([{ ...articles[0]!, summary: null }], NOW)[0]!.titleAttr).toBe("Titulo 0");
  });
});

describe("vibeModel and kolRows", () => {
  test("score of 100 with change tone and compact counts", () => {
    const v: VibeTimeline = {
      score: 71.4,
      scoreChangeRate: 3.2,
      mentions: 1_240,
      mentionsChangeRate: null,
      impressions: 2_450_000,
      engagement: 18_900,
      points: [],
    };
    const m = vibeModel(v);
    expect(m.score).toBe("71,4");
    expect(m.scoreTone).toBe("buy");
    expect(m.change).toBe("+3,2%");
    expect(m.counts).toContain("1.240 mencoes");
    expect(m.counts).not.toMatch(FORBIDDEN);
    expect(vibeModel({ ...v, score: null, scoreChangeRate: null }).score).toBe(UNAVAILABLE);
    expect(vibeModel({ ...v, scoreChangeRate: -1.5 }).scoreTone).toBe("sell");
  });

  test("kols keep the handle literal and compact counts", () => {
    const rows = kolRows([
      { handle: "jackduval", nickname: "Jack", followers: 512_000, mentions: 34, impressions: 98_000, engagement: 1_200, firstMentionMs: null } satisfies KolRow,
    ]);
    expect(rows[0]!.conta).toBe("@jackduval");
    expect(rows[0]!.seguidores).toContain("512");
    expect(rows[0]!.mencoes).toBe("34");
  });
});
