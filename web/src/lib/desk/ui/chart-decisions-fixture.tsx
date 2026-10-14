/**
 * FIXTURE HARNESS - NOT PRODUCTION. Bundled by `bun build` through chart-decisions-fixture-serve.ts
 * and mounted on a standalone page for screenshot evidence of the decision markers (spec G5/G6/G7).
 * Everything below is synthetic by hand: the candles, the Jev reads and the catalog. The page shows
 * the banner "FIXTURE SINTETICO" so no screenshot can be mistaken for the real desk.
 *
 * Synthetic reads cover the required cases: a buy measured favourable, a sell measured unfavourable,
 * a sell measured favourable, a hold, one read with status "timeout" that must produce NO marker and
 * a buy whose horizon has not elapsed yet, shown as pending.
 */

import { createRoot } from "react-dom/client";
import { useState } from "react";
import "../../../app/globals.css";
import JevStage from "../../../components/Desk/JevStage";
import { JevIndicators, PriceChart } from "../../../components/Desk/panels";
import { jevStageModel } from "../../mesa/mesa-model";
import analysisJson from "../../test-fixtures/analysis-view.eth.json";
import type { JevAnalysisView, JevReadBoardView, JevReadView } from "../../jev-read";
import type { AssetCatalog } from "../useAssetCatalog";
import type { DeskCandle, DeskInstrument, DeskMetrics, DeskTicker } from "../types";

/* Anchored at load time, not a fixed date: the desk gates "is this read fresh" on Date.now(), so the
 * fixture tape must be recent or every freshness check would report a day old digest. */
const T = Date.now();
const BAR = 60_000;
const COUNT = 120;
const INST = "ETH-USDT";

/** The ETH digest of the synthetic analytics pack, exactly as the public view projects it. */
const ANALYSIS: JevAnalysisView = { ...(analysisJson as JevAnalysisView), ageSec: 12 };

/** Deterministic close path: knots first, straight lines between them. Prices stay near the
 *  digest's level prices (about 109 to 111.6) so every support and resistance lands in view. */
const KNOTS: [number, number][] = [
  [0, 108.9],
  [25, 109.2],
  [30, 109.1],
  [40, 109.6],
  [45, 109.75],
  [55, 109.85],
  [60, 110.0],
  [70, 109.9],
  [100, 111.3],
  [118, 111.7],
  [119, 111.74],
];

function closes(): number[] {
  const out = new Array<number>(COUNT);
  for (let k = 0; k < KNOTS.length - 1; k += 1) {
    const [i0, v0] = KNOTS[k]!;
    const [i1, v1] = KNOTS[k + 1]!;
    for (let i = i0; i <= i1; i += 1) out[i] = v0 + ((v1 - v0) * (i - i0)) / (i1 - i0);
  }
  // A small deterministic wiggle so Renko bricks alternate direction like real tape.
  for (let i = 0; i < COUNT; i += 1) out[i] = out[i]! + Math.sin(i * 1.3) * 0.03;
  return out;
}

const CLOSE = closes();

const candles: DeskCandle[] = CLOSE.map((close, i) => {
  const open = i === 0 ? close : CLOSE[i - 1]!;
  const wick = 0.0004;
  return {
    tsMs: T - (COUNT - i) * BAR,
    open,
    high: Math.max(open, close) * (1 + wick),
    low: Math.min(open, close) * (1 - wick),
    close,
    volBase: 4 + ((i * 37) % 9),
    volQuote: (4 + ((i * 37) % 9)) * close,
    confirmed: i < COUNT - 1,
  };
});

/** With ?noad=1 the reads carry no analysis so the muted line and the level-free chart can be captured. */
const NO_ANALYSIS = new URLSearchParams(window.location.search).get("noad") === "1";

function state(mid: number): JevReadView["state"] {
  return {
    instId: INST,
    horizonMinutes: 5,
    mid,
    spreadBps: 1.2,
    bookImbalanceTop5: 0.08,
    volBpsPerMinute: 3.4,
    depthQuoteTop5: { bid: 120_000, ask: 118_000 },
    returnsBps: { m1: 1.1, m5: 4.4, m15: -2.2, m30: 8.8 },
    flow60s: { count: 42, buyBase: 1.2, sellBase: 0.9, cvdBase: 0.3, imbalance: 0.14, vwap: mid, lastPx: mid, lastSide: "buy" },
    change24hPct: 1.4,
    rangePosition24h: 0.62,
    fundingRatePct: null,
    ...(NO_ANALYSIS ? {} : { analysis: ANALYSIS }),
  };
}

function read(readId: string, barIndex: number, action: "buy" | "sell" | "hold", status: "ok" | "timeout", weights: [number, number, number], latencyMs: number | null): JevReadView {
  return {
    readId,
    instId: INST,
    atMs: candles[barIndex]!.tsMs + BAR / 2,
    clockOffsetMs: 0,
    state: state(CLOSE[barIndex]!),
    insufficient: [],
    decision: {
      action,
      probabilities: { buy: weights[0], sell: weights[1], hold: weights[2] },
      confidence: Math.max(...weights),
      latencyMs,
      model: "jev-fixture-1",
      status,
      inputTokens: 512,
    },
  };
}

/** Newest first, like the real board. */
const reads: JevReadView[] = [
  read("fx-pending-buy", 118, "buy", "ok", [0.58, 0.12, 0.3], 301),
  read("fx-timeout", 80, "buy", "timeout", [0.7, 0.1, 0.2], null),
  read("fx-hold", 70, "hold", "ok", [0.2, 0.25, 0.55], 268),
  read("fx-sell-against", 55, "sell", "ok", [0.15, 0.62, 0.23], 244),
  read("fx-buy-favour", 40, "buy", "ok", [0.63, 0.22, 0.15], 291),
  read("fx-sell-favour", 25, "sell", "ok", [0.18, 0.57, 0.25], 255),
];

const board: JevReadBoardView = {
  updatedAtMs: T,
  reads: { [INST]: reads[0]! },
  recent: reads,
};

const metrics: DeskMetrics = {
  midPx: CLOSE[COUNT - 1]!,
  microPx: null,
  spreadBps: 1.2,
  depthBidShare10bps: null,
  depthBidShare50bps: null,
  bidDepthQuote10bps: null,
  askDepthQuote10bps: null,
  bidDepthQuote50bps: null,
  askDepthQuote50bps: null,
  buyVolBase60s: null,
  sellVolBase60s: null,
  flowImbalance60s: null,
  tradesPerSecond60s: null,
  cvd: null,
  vwap: 100.24,
  realizedSigmaDaily: null,
  change24hPct: 1.4,
};

const ticker: DeskTicker = {
  instId: INST,
  last: CLOSE[COUNT - 1]!,
  open24h: 99.2,
  high24h: 100.6,
  low24h: 99.1,
  volBase24h: 12_345,
  volQuote24h: 1_234_500_000,
  bidPx: 100.51,
  bidSz: 1.2,
  askPx: 100.53,
  askSz: 0.9,
  tsMs: T,
};

const instrument: DeskInstrument = { instId: INST, instType: "SPOT", base: "ETH", quote: "USDT", tickSz: "0.01", lotSz: "0.01" };

const catalog: AssetCatalog = {
  status: "ready",
  spot: [
    { instId: "BTC-USDT", last: 100.52, change24hPct: 1.4, volQuote24h: 9e9 },
    { instId: "ETH-USDT", last: 3250.5, change24hPct: -1.5, volQuote24h: 4e9 },
  ],
  swap: [{ instId: "BTC-USDT-SWAP", last: 100.55, change24hPct: 1.42, volQuote24h: 2e10 }],
};

function Fixture() {
  const [focus, setFocus] = useState(INST);
  const stage = jevStageModel({ status: "ready", board, focus, nowMs: T, browserSkewMs: 0 });
  return (
    <div className="fx-root">
      <p className="fx-banner">FIXTURE SINTETICO: candles e decisoes fabricadas para evidencia de renderizacao</p>
      <div className="fx-strip">
        <JevStage model={stage} last={ticker.last} tickSz={instrument.tickSz} change24hPct={metrics.change24hPct} systemOneLine={null} />
      </div>
      <div className="fx-indicators">
        <JevIndicators read={board.reads[focus] ?? null} nowMs={T} browserSkewMs={0} boardReady />
      </div>
      <div className="fx-chart">
        <PriceChart
          candles={candles}
          bar="1m"
          metrics={metrics}
          ticker={ticker}
          instrument={instrument}
          focus={focus}
          onAssetSelect={setFocus}
          catalog={catalog}
          jev={{ status: "ready", board, browserSkewMs: 0, nowExchangeMs: T }}
        />
      </div>
      <p className="fx-legend">
        Venda medida a favor na vela 25, compra medida a favor na 40, venda medida contra na 55, manter na 70, timeout sem marcador na 80, compra pendente na 118.
        O digest e o do pacote sintetico de analises; ?noad=1 mostra o estado sem ele.
      </p>
    </div>
  );
}

type FixtureWindow = Window & { __deskChartFixture?: { openCard: (steps: number) => void } };

// ?kind=heikin|renko|...&ind=ema9,ema21,...&renko=atr|0.25 seeds the persisted prefs before
// mount so a screenshot can drive the toolbar state without clicks.
{
  const q = new URLSearchParams(window.location.search);
  const prefs: Record<string, unknown> = {
    version: 2,
    kind: "candles",
    indicators: ["vwap", "volume", "levels"],
    renko: { mode: "atr", pct: 0.25 },
    smc: { n: 3 },
  };
  if (q.get("kind")) prefs.kind = q.get("kind");
  if (q.get("ind")) prefs.indicators = q.get("ind")!.split(",").filter(Boolean);
  if (q.get("renko")) {
    const v = q.get("renko")!;
    prefs.renko = v === "atr" ? { mode: "atr", pct: 0.25 } : { mode: "pct", pct: Number(v) };
  }
  try {
    window.localStorage.setItem("jev.chart.prefs.v1", JSON.stringify(prefs));
  } catch {
    // The fixture still mounts with default prefs when storage is blocked.
  }
}

const mount = document.getElementById("root");
if (!mount) throw new Error("Desk chart fixture mount element is missing");
createRoot(mount).render(<Fixture />);

/** Steps the marker cursor with `]` so the decision card opens on a real marker, like a user key. */
(window as FixtureWindow).__deskChartFixture = {
  openCard(steps: number) {
    const plot = document.querySelector<HTMLElement>('[role="group"][tabindex="0"]');
    if (!plot) return;
    for (let i = 0; i < steps; i += 1) {
      plot.dispatchEvent(new KeyboardEvent("keydown", { key: "]", bubbles: true }));
    }
  },
};
document.documentElement.dataset.deskChartFixture = "ready";
