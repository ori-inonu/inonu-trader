import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JevIndicators } from "@/components/Desk/panels";
import type { JevAnalysisView, JevReadStateView, JevReadView } from "@/lib/jev-read";

const T = Date.UTC(2026, 9, 12, 12, 0, 0);

const ANALYSIS: JevAnalysisView = {
  ageSec: 12,
  trend: { regime: "up", adx15m: 38.24, efficiency15m: 0.62, emaStack15m: 1, emaStack1h: 1, emaStack4h: 0, extensionAtr15m: 0.8 },
  momentum: { rsi5m: 41, rsi15m: 33, rsi1h: 52, macdHistAtr15m: -0.084 },
  volatility: { atrBps15m: 9.2, atrBps1h: 21.4, volRank24h: 0.011, bbWidthRank15m: 0.15, bbPercentB15m: 0.7, expectedAbsMove5mBps: 4.1 },
  structure: {
    donchianPos1h: 0.8,
    supportBps: 8.7,
    supportTouches: 5,
    resistanceBps: 4.9,
    resistanceTouches: 8,
    renkoRun15m: 3,
    levels: [{ px: 4100.2, kind: "support", touches: 5, tf: "15m" }],
  },
  derivatives: {
    fundingZ: 0.5,
    fundingPctile: 0.6,
    oiChange1hPct: 1.2,
    oiPriceRegime: "long_buildup",
    longShortRatio: 1.1,
    longShortZ: 0.4,
    takerBuyShare1h: 0.46,
  },
  crossAsset: { corrBtc48h: 0.33, betaBtc48h: 0.9, relStrengthVsBtc24hBps: 12 },
  cost: { assumedRoundTripFeeBps: 6, spreadBps: 0.4, moveToCost: 0.44 },
};

function state(analysis?: JevAnalysisView): JevReadStateView {
  return {
    instId: "ETH-USDT",
    horizonMinutes: 15,
    mid: 4100.5,
    spreadBps: 0.4,
    bookImbalanceTop5: 0.1,
    volBpsPerMinute: 3,
    depthQuoteTop5: { bid: 1000, ask: 900 },
    returnsBps: { m1: 1, m5: 2, m15: 3, m30: 4 },
    flow60s: { count: 10, buyBase: 1, sellBase: 1, cvdBase: 0, imbalance: 0, vwap: 4100, lastPx: 4100, lastSide: "buy" },
    change24hPct: null,
    rangePosition24h: null,
    fundingRatePct: null,
    ...(analysis === undefined ? {} : { analysis }),
  };
}

function read(over: Partial<JevReadView> = {}, analysis: JevAnalysisView | null = ANALYSIS): JevReadView {
  return {
    readId: "r1",
    instId: "ETH-USDT",
    atMs: T - 30_000,
    clockOffsetMs: null,
    state: state(analysis === null ? undefined : analysis),
    insufficient: [],
    decision: null,
    ...over,
  };
}

function expectNoForbidden(html: string): void {
  expect(html).not.toContain("·");
  expect(html).not.toContain("—");
  expect(html).not.toContain("–");
  const content = html.replace(/ class="[^"]*"/g, "");
  expect(content).not.toContain("NaN");
  expect(content).not.toContain("undefined");
  expect(content).not.toContain("Infinity");
}

describe("JevIndicators", () => {
  test("a full analysis renders every chip plus the details disclosure", () => {
    const html = renderToStaticMarkup(<JevIndicators read={read()} nowMs={T} browserSkewMs={null} boardReady />);
    for (const chip of [
      "Indicadores do Inonu",
      "ha 12 s",
      "Tendencia alta ADX 38",
      "RSI 15m 33",
      "Vol 1%",
      "Squeeze",
      "S 8,7 bps R 4,9 bps",
      "Funding z +0,5",
      "OI compradas entrando",
      "Taker 46% compra",
      "Corr BTC 0,33",
      "Mov por custo 0,44",
      "Detalhes",
    ]) {
      expect(html).toContain(chip);
    }
    expect(html).toContain("Descritivo, nao e decisao");
    expect(html).not.toContain("desatualizado");
    expectNoForbidden(html);
  });

  test("the details list formats each field by kind instead of four decimals", () => {
    const html = renderToStaticMarkup(<JevIndicators read={read()} nowMs={T} browserSkewMs={null} boardReady />);
    // Integers: no decimals at all, ema stacks with an explicit sign.
    expect(html).toContain("<dd>12</dd>");
    expect(html).toContain("<dd>+1</dd>");
    expect(html).toContain("<dd>0</dd>");
    expect(html).toContain("<dd>5</dd>");
    // Ranks and shares as whole percents.
    expect(html).toContain("<dd>1%</dd>");
    expect(html).toContain("<dd>15%</dd>");
    expect(html).toContain("<dd>60%</dd>");
    expect(html).toContain("<dd>46%</dd>");
    // Oscillators with one decimal, bps fields with the unit, z scores signed with two decimals.
    expect(html).toContain("<dd>38,2</dd>");
    expect(html).toContain("<dd>33,0</dd>");
    expect(html).toContain("<dd>9,2 bps</dd>");
    expect(html).toContain("<dd>+0,50</dd>");
    expect(html).toContain("<dd>+0,33</dd>");
    expect(html).toContain("<dd>-0,08</dd>");
    expect(html).toContain("<dd>+12,0 bps</dd>");
    expect(html).toContain("<dd>0,44</dd>");
    // No field keeps the old fixed four-decimal shape.
    expect(html).not.toContain("12,0000");
    expect(html).not.toContain("38,2400");
    expect(html).not.toContain("1,0000");
    expect(html).toContain("Compradores do taker 1h");
    expect(html).toContain("Percentil de volatilidade 24h");
    expectNoForbidden(html);
  });

  test("absent analysis renders the muted line", () => {
    const html = renderToStaticMarkup(<JevIndicators read={read({}, null)} nowMs={T} browserSkewMs={null} boardReady />);
    expect(html).toContain("Indicadores do Inonu indisponiveis");
    expect(html).toContain("bun run analytics");
    expectNoForbidden(html);
  });

  test("a null read on a ready board renders the muted line", () => {
    const html = renderToStaticMarkup(<JevIndicators read={null} nowMs={T} browserSkewMs={null} boardReady />);
    expect(html).toContain("Indicadores do Inonu indisponiveis");
  });

  test("a board that is not ready renders nothing about analysis", () => {
    const html = renderToStaticMarkup(<JevIndicators read={read()} nowMs={T} browserSkewMs={null} boardReady={false} />);
    expect(html).toBe("");
  });

  test("a stale read or an old digest dims and says desatualizado", () => {
    const stale = renderToStaticMarkup(
      <JevIndicators read={read({ atMs: T - 30 * 60_000 })} nowMs={T} browserSkewMs={null} boardReady />,
    );
    expect(stale).toContain('data-dim="true"');
    expect(stale).toContain("desatualizado");
    const old = renderToStaticMarkup(
      <JevIndicators read={read({}, { ...ANALYSIS, ageSec: 300 })} nowMs={T} browserSkewMs={null} boardReady />,
    );
    expect(old).toContain('data-dim="true"');
    expect(old).toContain("ha 5 min, desatualizado");
  });

  test("sections that are absent render no chips but keep the disclosure", () => {
    const partial: JevAnalysisView = { ageSec: 5, momentum: ANALYSIS.momentum, cost: ANALYSIS.cost };
    const html = renderToStaticMarkup(<JevIndicators read={read({}, partial)} nowMs={T} browserSkewMs={null} boardReady />);
    expect(html).toContain("RSI 15m 33");
    expect(html).toContain("Mov por custo 0,44");
    expect(html).not.toContain("Tendencia");
    expect(html).not.toContain("Funding");
    expect(html).toContain("Detalhes");
    expectNoForbidden(html);
  });
});
