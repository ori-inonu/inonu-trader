import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AssetPicker,
  DecisionCard,
  DerivativesStrip,
  FlowGauge,
  LiquiditySurface,
  OrderBookLadder,
  PanelEmpty,
  PanelFrame,
  PriceChart,
  TimeAndSales,
  Watchlist,
} from "@/components/Desk/panels";
import type { DecisionMarker } from "../chart/decisions";
import { defaultChartPrefs } from "../chart/prefs";
import { SMC_CHIPS_TITLE } from "../chart/smc-chips";
import { IndicatorOptions, SmcChipGroup, type PriceChartOnchain } from "@/components/Desk/panels/PriceChart";
import { OnchainTokenRow, type AssetPickerOnchain } from "@/components/Desk/panels/AssetPicker";
import type { OnchainClient, OnchainMeta } from "../../onchain/client";
import type { OnchainFocus } from "../../onchain/focus";
import type { WatchPins } from "../../mesa/watch-pins";
import type { AssetCatalog } from "../useAssetCatalog";
import type { DeskDerivatives, DeskInstrument, DeskMetrics, DeskState, DeskWatchRow } from "../types";
import { createLabMarket, LAB_PRESETS } from "./lab-fixture";

const T = Date.UTC(2026, 9, 11, 12, 0, 0);
const AWAITING = "Aguardando dados da OKX";

const EMPTY_METRICS: DeskMetrics = {
  midPx: null, microPx: null, spreadBps: null, depthBidShare10bps: null, depthBidShare50bps: null,
  bidDepthQuote10bps: null, askDepthQuote10bps: null, bidDepthQuote50bps: null, askDepthQuote50bps: null,
  buyVolBase60s: null, sellVolBase60s: null, flowImbalance60s: null, tradesPerSecond60s: null, cvd: null,
  vwap: null, realizedSigmaDaily: null, change24hPct: null,
};

const BTC: DeskInstrument = { instId: "BTC-USDT-SWAP", instType: "SWAP", base: "BTC", quote: "USDT", tickSz: "0.1", lotSz: "0.01" };
const SPOT: DeskInstrument = { instId: "MON-USDT", instType: "SPOT", base: "MON", quote: "USDT", tickSz: "0.00001", lotSz: "0.1" };

function lab(): DeskState {
  return createLabMarket(LAB_PRESETS[0], 3, T).state();
}

/** Characters the project forbids in rendered text. */
function expectNoForbidden(html: string): void {
  expect(html).not.toContain("\u00b7");
  expect(html).not.toContain("\u2014");
  expect(html).not.toContain("\u2013");
  // Class names are empty under bun test (CSS modules resolve to nothing), so look past them.
  const content = html.replace(/ class="[^"]*"/g, "");
  expect(content).not.toContain("NaN");
  expect(content).not.toContain("undefined");
  expect(content).not.toContain("Infinity");
}

describe("PanelFrame", () => {
  test("renders a labelled section with a title and a live chip", () => {
    const html = renderToStaticMarkup(<PanelFrame title="Teste" subtitle="BTC-USDT"><p>corpo</p></PanelFrame>);
    expect(html).toContain("<section");
    expect(html).toContain("aria-labelledby");
    expect(html).toContain(">Teste<");
    expect(html).toContain("BTC-USDT");
    expect(html).toContain("Ao vivo");
    expect(html).not.toContain('data-stale="true"');
    expectNoForbidden(html);
  });

  test("stale dims the body and says Dado velho", () => {
    const html = renderToStaticMarkup(<PanelFrame title="Teste" stale><p>corpo</p></PanelFrame>);
    expect(html).toContain("Dado velho");
    expect(html).toContain('data-stale="true"');
    expect(html).toContain('data-state="stale"');
    expect(html).not.toContain("Ao vivo");
  });

  test("empty wins over stale in the chip and the empty state announces itself", () => {
    const html = renderToStaticMarkup(<PanelFrame title="Teste" empty stale><PanelEmpty /></PanelFrame>);
    expect(html).toContain("Sem dados");
    expect(html).toContain(AWAITING);
    expect(html).toContain('role="status"');
  });

  test("the chip carries its state in words, never in the dot alone", () => {
    const html = renderToStaticMarkup(<PanelFrame title="Teste"><p>x</p></PanelFrame>);
    expect(html).toMatch(/aria-hidden="true"[^>]*><\/span><span[^>]*>Ao vivo<\/span>/);
  });
});

describe("OrderBookLadder", () => {
  test("empty: says it is waiting and draws no rows", () => {
    const html = renderToStaticMarkup(<OrderBookLadder book={null} instrument={BTC} metrics={EMPTY_METRICS} />);
    expect(html).toContain(AWAITING);
    expect(html).toContain("Sem dados");
    expect(html).not.toContain('role="row"');
    expectNoForbidden(html);
  });

  test("an empty book object is also empty", () => {
    const state = lab();
    const html = renderToStaticMarkup(<OrderBookLadder book={{ ...state.book!, bids: [], asks: [] }} instrument={BTC} metrics={EMPTY_METRICS} />);
    expect(html).toContain(AWAITING);
  });

  test("populated: asks above bids, prices with the tick decimals, spread and imbalance", () => {
    const s = lab();
    const html = renderToStaticMarkup(<OrderBookLadder book={s.book} instrument={s.instrument} metrics={s.metrics} />);
    expect(html).toContain('role="table"');
    expect(html).toContain("Ofertas de venda");
    expect(html).toContain("Ofertas de compra");
    expect(html.indexOf("Ofertas de venda")).toBeLessThan(html.indexOf("Ofertas de compra"));
    expect(html).toContain("Spread");
    expect(html).toContain("bps");
    expect(html).toContain("Desequilibrio de profundidade a 10 bps");
    const bestBid = s.book!.bids[0].px;
    // tickSz 0.1 means one decimal, grouped in pt-BR
    expect(html).toMatch(/\d{2}\.\d{3},\d</);
    expect(html).toContain(String(Math.floor(bestBid / 1000)));
    expect((html.match(/role="row"/g) ?? []).length).toBeGreaterThan(8);
    expectNoForbidden(html);
  });

  test("the top of book is marked on both sides", () => {
    const s = lab();
    const html = renderToStaticMarkup(<OrderBookLadder book={s.book} instrument={s.instrument} metrics={s.metrics} />);
    expect((html.match(/data-top="true"/g) ?? []).length).toBe(2);
  });

  test("a stale ladder is dimmed and labelled", () => {
    const s = lab();
    const html = renderToStaticMarkup(<OrderBookLadder book={s.book} instrument={s.instrument} metrics={s.metrics} stale />);
    expect(html).toContain("Dado velho");
    expect(html).toContain('data-stale="true"');
  });

  test("unknown imbalance says Indisponivel instead of a zero share", () => {
    const s = lab();
    const html = renderToStaticMarkup(<OrderBookLadder book={s.book} instrument={s.instrument} metrics={{ ...s.metrics, depthBidShare10bps: null }} />);
    expect(html).toContain("Desequilibrio de profundidade indisponivel");
    expect(html).toContain("Indisponivel");
  });

  test("a crossed book is called crossed", () => {
    const s = lab();
    const html = renderToStaticMarkup(<OrderBookLadder book={s.book} instrument={s.instrument} metrics={{ ...s.metrics, spreadBps: -2 }} />);
    expect(html).toContain("Cruzado");
  });

  test("decimals follow the instrument tick for a five decimal pair", () => {
    const html = renderToStaticMarkup(
      <OrderBookLadder
        book={{
          instId: "MON-USDT", tsMs: T, seqId: 1, checksumOk: null,
          bids: [{ px: 0.02222, sz: 1000, orders: 1 }, { px: 0.02221, sz: 2500, orders: 1 }],
          asks: [{ px: 0.02223, sz: 900, orders: 1 }, { px: 0.02224, sz: 4000, orders: 1 }],
        }}
        instrument={SPOT}
        metrics={{ ...EMPTY_METRICS, midPx: 0.022225, spreadBps: 4.5 }}
      />,
    );
    expect(html).toContain("0,02222");
    expect(html).toContain("0,02223");
    expectNoForbidden(html);
  });
});

describe("TimeAndSales", () => {
  test("empty", () => {
    const html = renderToStaticMarkup(<TimeAndSales trades={[]} instrument={BTC} />);
    expect(html).toContain(AWAITING);
    expectNoForbidden(html);
  });

  test("populated: time with milliseconds, price, size and a side in words", () => {
    const s = lab();
    const html = renderToStaticMarkup(<TimeAndSales trades={s.trades} instrument={s.instrument} />);
    expect(html).toContain('role="table"');
    expect(html).toMatch(/\d\d:\d\d:\d\d\.\d{3}/);
    expect(html).toContain("Compra");
    expect(html).toContain("Venda");
    expect(html).toContain('data-side="buy"');
    expect(html).toContain('data-side="sell"');
    expectNoForbidden(html);
  });

  test("a print far above the median is marked large and the others are not", () => {
    const trades = [
      { id: "7", px: 100, sz: 50, side: "buy" as const, tsMs: T },
      ...[6, 5, 4, 3, 2, 1].map((n) => ({ id: String(n), px: 100, sz: 1, side: "sell" as const, tsMs: T - n * 1000 })),
    ];
    const html = renderToStaticMarkup(<TimeAndSales trades={trades} instrument={BTC} />);
    expect((html.match(/data-large="true"/g) ?? []).length).toBe(1);
    expect(html).toContain("negocio grande");
  });

  test("a stale tape is labelled", () => {
    const s = lab();
    expect(renderToStaticMarkup(<TimeAndSales trades={s.trades} instrument={s.instrument} stale />)).toContain("Dado velho");
  });

  test("replayed trade ids are rendered once", () => {
    const t = { id: "9", px: 100, sz: 1, side: "buy" as const, tsMs: T };
    const html = renderToStaticMarkup(<TimeAndSales trades={[t, t, { ...t, id: "8" }]} instrument={BTC} />);
    expect((html.match(/role="row"/g) ?? []).length).toBe(3); // header plus two prints
  });
});

describe("PriceChart, simple by default", () => {
  const s = lab();
  const draw = (extra: Partial<React.ComponentProps<typeof PriceChart>> = {}) =>
    renderToStaticMarkup(<PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} onBarChange={() => undefined} {...extra} />);

  test("a new person sees the chart and the button that opens the details, and none of the specialist's controls or lines", () => {
    const html = draw();
    expect(html).toContain("Detalhes");
    expect(html).not.toContain("Indicadores");
    expect(html).not.toContain("Heikin Ashi");
    expect(html).not.toContain("Renko");
    expect(html).not.toContain('aria-label="Indicadores ativos"');
    expect(html).not.toContain("Camadas do Inonu no grafico");
    expect(html).not.toContain("Leituras do Inonu indisponiveis");
    // the readout of the candle (open, high, low, close, volume) appears when the person points at one, not before
    expect(html).not.toContain("<span>Vol</span>");
    expect(html).not.toContain("OHLCV indisponivel");
    // the bar selector and the 24h change stay: they are what anyone reads
    expect(html).toContain("1m");
    expect(html).toContain("24h");
  });

  test("the complete chart has the specialist's controls and a button that goes back", () => {
    const html = draw({ initialDetail: "completo" });
    expect(html).toContain("Indicadores");
    expect(html).toContain("Heikin Ashi");
    expect(html).toContain("Camadas do Inonu no grafico");
    expect(html).toContain("Simples");
    expect(html).not.toContain(">Detalhes<");
  });

  test("the simple chart ignores a stored choice of kind and indicators without rewriting it", () => {
    const stored = { ...defaultChartPrefs(), kind: "renko" as const };
    const html = draw({ initialPrefs: stored });
    expect(html).not.toContain("Tijolo");
    expect(html).toContain("Detalhes");
    expect(stored.kind).toBe("renko");
    expect(draw({ initialPrefs: stored, initialDetail: "completo" })).toContain("Tijolo");
  });
});

describe("PriceChart", () => {
  test("empty: waiting state, selector still there", () => {
    const html = renderToStaticMarkup(<PriceChart candles={[]} bar="1m" metrics={EMPTY_METRICS} ticker={null} instrument={BTC} initialDetail="completo" />);
    expect(html).toContain(AWAITING);
    expect(html).toContain("OHLCV indisponivel");
    expect(html).toContain("Intervalo das velas");
    expect(html).not.toContain("<canvas");
    expectNoForbidden(html);
  });

  test("populated: canvas, readout of the newest candle and a bar selector with the current bar pressed", () => {
    const s = lab();
    const html = renderToStaticMarkup(<PriceChart candles={s.candles} bar="5m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} onBarChange={() => undefined} initialDetail="completo" />);
    expect(html).toContain("<canvas");
    for (const bar of ["1m", "5m", "15m", "1H", "4H", "1D"]) expect(html).toContain(`>${bar}</button>`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>5m</);
    // Five unpressed bar buttons plus five unpressed chart type buttons (Velas is pressed).
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(10);
    for (const kind of ["Velas", "Heikin Ashi", "Barras", "Linha", "Area", "Renko"]) expect(html).toContain(`>${kind}</button>`);
    expect(html).toContain("Indicadores");
    // The brick size controls belong to the Renko kind only.
    expect(html).not.toContain("Tamanho do tijolo Renko");
    expect(html).toContain("Leituras do Inonu indisponiveis");
    expect(html).toContain("Vol");
    expect(html).toContain("em formacao");
    expect(html).toContain("Ultima vela");
    expect(html).toContain('tabindex="0"');
    expectNoForbidden(html);
  });

  test("without a handler the selector is disabled, with one it is enabled", () => {
    const s = lab();
    const off = renderToStaticMarkup(<PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} />);
    const on = renderToStaticMarkup(<PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} onBarChange={() => undefined} />);
    expect(off).toContain("disabled");
    expect(on).not.toContain("disabled");
  });

  test("stale", () => {
    const s = lab();
    expect(renderToStaticMarkup(<PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} stale />)).toContain("Dado velho");
  });

  test("the 24h change prints with a sign and decimals in pt-BR", () => {
    const s = lab();
    const html = renderToStaticMarkup(<PriceChart candles={s.candles} bar="1m" metrics={{ ...s.metrics, change24hPct: 1.234 }} ticker={s.ticker} instrument={s.instrument} />);
    expect(html).toContain("+1,23%");
  });

  test("renko kind shows the brick size select and the size label", () => {
    const s = lab();
    const prefs = { ...defaultChartPrefs(), kind: "renko" as const };
    const html = renderToStaticMarkup(
      <PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} initialPrefs={prefs} initialDetail="completo" />,
    );
    expect(html).toContain("Tamanho do tijolo Renko");
    for (const size of ["ATR", "0,1%", "0,25%", "0,5%", "1%"]) expect(html).toContain(`>${size}<`);
    expect(html).toContain("Tijolo");
    expect(html).toContain("(ATR)");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Renko</);
    expectNoForbidden(html);
  });

  test("renko with too few confirmed candles shows the empty state", () => {
    const s = lab();
    const prefs = { ...defaultChartPrefs(), kind: "renko" as const };
    const html = renderToStaticMarkup(
      <PriceChart candles={s.candles.slice(0, 3)} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} initialPrefs={prefs} initialDetail="completo" />,
    );
    expect(html).toContain("Renko indisponivel: poucas velas confirmadas");
    expectNoForbidden(html);
  });

  test("renko with smart money groups on announces it in the legend strip", () => {
    const s = lab();
    const prefs = { ...defaultChartPrefs(), kind: "renko" as const };
    const html = renderToStaticMarkup(
      <PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} initialPrefs={prefs} initialDetail="completo" />,
    );
    expect(html).toContain("Smart money indisponivel no Renko");
    expect(html).toContain(SMC_CHIPS_TITLE);
    expectNoForbidden(html);
  });
});

describe("IndicatorOptions", () => {
  test("the popover is grouped with smart money, jev, volume and classics plus the pivot select", () => {
    const html = renderToStaticMarkup(<IndicatorOptions prefs={defaultChartPrefs()} onToggle={() => undefined} onPivot={() => undefined} />);
    for (const label of ["Smart money", "Inonu", "Volume", "Classicos"]) expect(html).toContain(`>${label}<`);
    for (const opt of ["Estrutura BOS e CHoCH", "Blocos de ordem", "Imbalances FVG", "Liquidez", "Premium e desconto", "Niveis do Inonu", "EMA 9", "EMA 200", "Bandas de Bollinger 20/2", "VWAP", "Supertrend 10/3", "RSI 14", "MACD 12/26/9"]) {
      expect(html).toContain(opt);
    }
    // The default set checks the five smart money boxes, volume and levels.
    const checked = html.match(/checked=""/g) ?? [];
    expect(checked.length).toBe(7);
    for (const n of ["2", "3", "5", "8"]) expect(html).toContain(`value="${n}"`);
    expect(html).toContain("Forca do pivo smart money");
    expectNoForbidden(html);
  });
});

describe("SmcChipGroup", () => {
  test("chips render text, title and tone inside the fixed group label", () => {
    const chips = [
      { id: "position", text: "Desconto 34%", title: `${SMC_CHIPS_TITLE}. def`, tone: "buy" },
      { id: "poolBelow", text: "Liquidez abaixo a 40 bps", title: `${SMC_CHIPS_TITLE}. def`, tone: "sell" },
    ];
    const html = renderToStaticMarkup(<SmcChipGroup chips={chips} />);
    expect(html).toContain(SMC_CHIPS_TITLE);
    expect(html).toContain("Desconto 34%");
    expect(html).toContain("Liquidez abaixo a 40 bps");
    expect(html).toContain('data-tone="buy"');
    expect(html).toContain('data-tone="sell"');
    expectNoForbidden(html);
  });
});

describe("LiquiditySurface", () => {
  test("empty", () => {
    const html = renderToStaticMarkup(<LiquiditySurface liquidity={[]} midPx={null} />);
    expect(html).toContain(AWAITING);
    expect(html).not.toContain("<canvas");
    expect(html).toContain("Superficie de liquidez indisponivel");
    expectNoForbidden(html);
  });

  test("populated: canvas with a summary label, the depth on each side and the window", () => {
    const s = lab();
    const html = renderToStaticMarkup(<LiquiditySurface liquidity={s.liquidity} midPx={s.metrics.midPx} instrument={s.instrument} />);
    expect(html).toContain("<canvas");
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Superficie de liquidez de BTC-USDT-SWAP: \d+ amostras/);
    expect(html).toContain("Compra ");
    expect(html).toContain("Venda ");
    expect(html).toContain("amostras");
    expect(html).toContain("alcance");
    expectNoForbidden(html);
  });

  test("a stale wall is labelled and renders in reduced motion too", () => {
    const s = lab();
    const html = renderToStaticMarkup(<LiquiditySurface liquidity={s.liquidity} midPx={s.metrics.midPx} stale reducedMotion />);
    expect(html).toContain("Dado velho");
    expect(html).toContain("<canvas");
  });
});

describe("FlowGauge", () => {
  test("empty", () => {
    const html = renderToStaticMarkup(<FlowGauge metrics={EMPTY_METRICS} flow={[]} />);
    expect(html).toContain(AWAITING);
    expect(html).not.toContain("<svg");
    expectNoForbidden(html);
  });

  test("populated: signed percent, the word for it, volumes, trades per second and CVD", () => {
    const s = lab();
    const html = renderToStaticMarkup(<FlowGauge metrics={{ ...s.metrics, flowImbalance60s: 0.234 }} flow={s.flow} instrument={s.instrument} />);
    expect(html).toContain('role="img"');
    expect(html).toContain("+23%");
    expect(html).toContain("Compra");
    expect(html).toContain("Venda");
    expect(html).toContain("Negocios/s");
    expect(html).toContain("CVD");
    expect(html).toContain("Delta acumulado");
    expect(html).toContain("Fluxo agressor em 60 segundos: +23%");
    expectNoForbidden(html);
  });

  test("an unknown imbalance reads Indisponivel and draws no needle or value arc", () => {
    const s = lab();
    const html = renderToStaticMarkup(<FlowGauge metrics={{ ...s.metrics, flowImbalance60s: null }} flow={s.flow} />);
    expect(html).toContain("Fluxo agressor indisponivel");
    expect(html).toContain("Indisponivel");
    expect(html).not.toContain("rotate(");
  });

  test("the needle angle follows the imbalance: sell left, buy right", () => {
    const s = lab();
    const sell = renderToStaticMarkup(<FlowGauge metrics={{ ...s.metrics, flowImbalance60s: -1 }} flow={s.flow} />);
    const buy = renderToStaticMarkup(<FlowGauge metrics={{ ...s.metrics, flowImbalance60s: 1 }} flow={s.flow} />);
    expect(sell).toContain("rotate(-90.00deg)");
    expect(buy).toContain("rotate(90.00deg)");
  });

  test("stale", () => {
    expect(renderToStaticMarkup(<FlowGauge metrics={lab().metrics} flow={lab().flow} stale />)).toContain("Dado velho");
  });
});

function row(instId: string, last: number, open: number | null, over: Partial<DeskWatchRow> = {}): DeskWatchRow {
  return {
    instId,
    ticker: {
      instId, last, open24h: open, high24h: null, low24h: null, volBase24h: null,
      volQuote24h: 2_500_000_000, bidPx: null, bidSz: null, askPx: null, askSz: null, tsMs: T,
    },
    spark: [1, 2, 3, 2.5, 3.5],
    fundingRate: null,
    ...over,
  };
}

describe("Watchlist", () => {
  test("symbols without quotes stay selectable and announce missing data rather than a live feed", () => {
    const rows = [{ instId: "BTC-USDT", ticker: null, spark: [], fundingRate: null }];
    const html = renderToStaticMarkup(<Watchlist rows={rows} focus="BTC-USDT" onSelect={() => undefined} />);
    expect(html).toContain("Sem dados");
    expect(html).not.toContain("Ao vivo");
    expect(html).toContain('data-row="true"');
    expect(html).toContain(">BTC<");
    expect(html).toContain("Indisponivel");
  });

  test("empty", () => {
    const html = renderToStaticMarkup(<Watchlist rows={[]} focus="BTC-USDT" />);
    expect(html).toContain(AWAITING);
    expect(html).not.toContain("<button");
    expectNoForbidden(html);
  });

  test("populated: base symbols, prices, signed 24h change, a sparkline, volume and funding", () => {
    const rows = [
      row("BTC-USDT", 67_432.1, 66_000),
      row("ETH-USDT", 3_250.5, 3_300),
      row("BTC-USDT-SWAP", 67_438.4, 66_010, { fundingRate: 0.0001 }),
    ];
    const html = renderToStaticMarkup(<Watchlist rows={rows} focus="ETH-USDT" onSelect={() => undefined} />);
    expect(html).toContain(">BTC<");
    expect(html).toContain(">ETH<");
    expect(html).toContain("PERP");
    expect(html).toContain("+2,17%");
    expect(html).toContain("-1,50%");
    expect(html).toContain("2,5 bi");
    expect(html).toContain("+0,010%");
    expect((html.match(/<svg/g) ?? []).length).toBe(3);
    expectNoForbidden(html);
  });

  test("the focus row, and only it, carries aria-current", () => {
    const rows = [row("BTC-USDT", 100, 90), row("ETH-USDT", 50, 55)];
    const html = renderToStaticMarkup(<Watchlist rows={rows} focus="ETH-USDT" onSelect={() => undefined} />);
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    expect(html.indexOf("aria-current")).toBeGreaterThan(html.indexOf(">BTC<"));
    expect(html).toContain("ativo em foco");
  });

  test("every row is a real button, keyboard operable by default", () => {
    const rows = [row("BTC-USDT", 100, 90), row("ETH-USDT", 50, 55)];
    const html = renderToStaticMarkup(<Watchlist rows={rows} focus="BTC-USDT" onSelect={() => undefined} />);
    expect((html.match(/<button type="button"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Lista de ativos"');
  });

  test("unknown ticker and unknown open read as unavailable, not zero", () => {
    const rows = [row("BTC-USDT", 100, null), { instId: "ETH-USDT", ticker: null, spark: [], fundingRate: null }];
    const html = renderToStaticMarkup(<Watchlist rows={rows} focus="BTC-USDT" />);
    expect(html).toContain("Indisponivel");
    expect(html).not.toContain("0,00%");
    expectNoForbidden(html);
  });

  test("stale", () => {
    expect(renderToStaticMarkup(<Watchlist rows={[row("BTC-USDT", 1, 1)]} focus="BTC-USDT" stale />)).toContain("Dado velho");
  });
});

describe("DerivativesStrip", () => {
  const d: DeskDerivatives = {
    instId: "BTC-USDT-SWAP",
    fundingRate: 0.0001,
    nextFundingTimeMs: T + 3_725_000,
    markPx: 100.2,
    indexPx: 100,
    openInterest: 1_204_000,
    openInterestUsd: 8_120_000_000,
    tsMs: T,
  };

  test("empty", () => {
    const html = renderToStaticMarkup(<DerivativesStrip derivatives={null} metrics={EMPTY_METRICS} instrument={BTC} />);
    expect(html).toContain(AWAITING);
    expectNoForbidden(html);
  });

  test("a spot instrument says it has no derivatives instead of waiting forever", () => {
    const html = renderToStaticMarkup(<DerivativesStrip derivatives={null} metrics={EMPTY_METRICS} instrument={SPOT} />);
    expect(html).toContain("Ativo a vista, sem derivativos");
    expect(html).not.toContain(AWAITING);
  });

  test("populated: funding with sign and bps, countdown, basis and open interest", () => {
    const html = renderToStaticMarkup(<DerivativesStrip derivatives={d} metrics={{ ...EMPTY_METRICS, midPx: 100.1 }} instrument={BTC} nowMs={T} clockSkewMs={0} />);
    expect(html).toContain("+0,0100%");
    expect(html).toContain("+1,0 bps");
    expect(html).toContain("Longs pagam shorts");
    expect(html).toContain("01:02:05");
    expect(html).toContain("+20,0 bps");
    expect(html).toContain("1,2 mi");
    expect(html).toContain("US$" + String.fromCharCode(0x00a0) + "8,1" + String.fromCharCode(0x00a0) + "bi");
    expectNoForbidden(html);
  });

  test("the countdown adds the exchange clock skew to the local clock", () => {
    const base = renderToStaticMarkup(<DerivativesStrip derivatives={d} metrics={EMPTY_METRICS} instrument={BTC} nowMs={T} clockSkewMs={0} />);
    const ahead = renderToStaticMarkup(<DerivativesStrip derivatives={d} metrics={EMPTY_METRICS} instrument={BTC} nowMs={T} clockSkewMs={5_000} />);
    expect(base).toContain("01:02:05");
    expect(ahead).toContain("01:02:00");
  });

  test("negative funding names the other payer", () => {
    const html = renderToStaticMarkup(<DerivativesStrip derivatives={{ ...d, fundingRate: -0.00025 }} metrics={EMPTY_METRICS} instrument={BTC} nowMs={T} />);
    expect(html).toContain("-0,0250%");
    expect(html).toContain("Shorts pagam longs");
  });

  test("fields the exchange did not send read Indisponivel, never zero", () => {
    const html = renderToStaticMarkup(
      <DerivativesStrip
        derivatives={{ ...d, fundingRate: null, nextFundingTimeMs: null, markPx: null, indexPx: null, openInterest: null, openInterestUsd: null }}
        metrics={EMPTY_METRICS}
        instrument={BTC}
        nowMs={T}
      />,
    );
    expect((html.match(/Indisponivel/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain("0,0000%");
    expect(html).toContain("USD indisponivel");
    expect(html).not.toContain("Mid x mark");
    expect(html).toContain("Contratos");
  });

  test("a funding time in the past waits for settlement and clamps the clock at zero", () => {
    const html = renderToStaticMarkup(<DerivativesStrip derivatives={{ ...d, nextFundingTimeMs: T - 1000 }} metrics={EMPTY_METRICS} instrument={BTC} nowMs={T} />);
    expect(html).toContain("00:00");
    expect(html).toContain("Aguardando liquidacao");
  });

  test("before the first client tick the countdown is a placeholder, so server and client markup match", () => {
    const html = renderToStaticMarkup(<DerivativesStrip derivatives={d} metrics={EMPTY_METRICS} instrument={BTC} />);
    expect(html).toContain("--:--");
  });

  test("stale", () => {
    expect(renderToStaticMarkup(<DerivativesStrip derivatives={d} metrics={EMPTY_METRICS} instrument={BTC} nowMs={T} stale />)).toContain("Dado velho");
  });
});

describe("all panels together", () => {
  test("every populated panel renders without a forbidden character or a broken number", () => {
    const s = lab();
    const all = [
      renderToStaticMarkup(<OrderBookLadder book={s.book} instrument={s.instrument} metrics={s.metrics} />),
      renderToStaticMarkup(<TimeAndSales trades={s.trades} instrument={s.instrument} />),
      renderToStaticMarkup(<PriceChart candles={s.candles} bar={s.bar} metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} />),
      renderToStaticMarkup(<LiquiditySurface liquidity={s.liquidity} midPx={s.metrics.midPx} instrument={s.instrument} />),
      renderToStaticMarkup(<FlowGauge metrics={s.metrics} flow={s.flow} instrument={s.instrument} />),
      renderToStaticMarkup(<Watchlist rows={s.watchlist} focus={s.focus} />),
      renderToStaticMarkup(<DerivativesStrip derivatives={s.derivatives} metrics={s.metrics} instrument={s.instrument} nowMs={T} />),
    ];
    for (const html of all) expectNoForbidden(html);
  });

  test("none of the panels animates state: no keyframes or animation properties leak into the markup", () => {
    const s = lab();
    const html = renderToStaticMarkup(<OrderBookLadder book={s.book} instrument={s.instrument} metrics={s.metrics} />);
    expect(html).not.toContain("animation");
    expect(html).not.toContain("blink");
  });
});

describe("tiny base sizes never print as zero", () => {
  const sizes = [0.00004, 0.0012, 0.0004, 0.00007, 0.0003, 0.000012, 0.0008];
  const tape = sizes.map((sz, i) => ({ id: String(100 - i), px: 67_000.1, sz, side: i % 2 ? ("sell" as const) : ("buy" as const), tsMs: T - i * 100 }));

  test("the tape shows the significant digits of a 0,00004 BTC print", () => {
    const html = renderToStaticMarkup(<TimeAndSales trades={tape} instrument={{ ...BTC, instId: "BTC-USDT", instType: "SPOT", lotSz: "0.00000001" }} />);
    expect(html).toContain("0,00004");
    expect(html).toContain("0,0012");
    expect(html).not.toContain("0,0000<");
    expect(html).not.toMatch(/>0,00+</);
    expectNoForbidden(html);
  });

  test("the ladder size and cumulative columns keep small base sizes", () => {
    const book = {
      instId: "BTC-USDT", tsMs: T, seqId: 1, checksumOk: null,
      bids: [{ px: 67_000, sz: 0.00004, orders: 1 }, { px: 66_999.9, sz: 0.0012, orders: 1 }, { px: 66_999.8, sz: 0.0008, orders: 1 }],
      asks: [{ px: 67_000.1, sz: 0.00007, orders: 1 }, { px: 67_000.2, sz: 0.0003, orders: 1 }, { px: 67_000.3, sz: 0.0005, orders: 1 }],
    };
    const html = renderToStaticMarkup(
      <OrderBookLadder book={book} instrument={{ ...BTC, instId: "BTC-USDT", instType: "SPOT", lotSz: "0.00000001" }} metrics={{ ...EMPTY_METRICS, midPx: 67_000.05, spreadBps: 0.01 }} />,
    );
    expect(html).toContain("0,00004");
    expect(html).toContain("0,00007");
    expect(html).not.toMatch(/>0,00+</);
    expectNoForbidden(html);
  });

  test("the flow gauge shows tiny buy and sell volumes and a tiny CVD, not zeros", () => {
    const html = renderToStaticMarkup(
      <FlowGauge
        metrics={{ ...EMPTY_METRICS, flowImbalance60s: 1, buyVolBase60s: 0.00031, sellVolBase60s: 0, cvd: 0.00031, tradesPerSecond60s: 0.4 }}
        flow={[{ tsMs: T, buyBase: 0.00004, sellBase: 0, lastPx: 67_000 }, { tsMs: T + 1000, buyBase: 0.00027, sellBase: 0, lastPx: 67_001 }]}
        instrument={{ ...BTC, instId: "BTC-USDT", instType: "SPOT" }}
      />,
    );
    expect(html).toContain("0,00031");
    expect(html).toContain("+0,00031");
    expect(html).not.toContain("+0,00<");
    expect(html).toContain("+100%");
    expectNoForbidden(html);
  });

  test("ordinary sizes keep their shape next to the small ones", () => {
    const html = renderToStaticMarkup(
      <TimeAndSales
        trades={[{ id: "1", px: 100, sz: 12.5, side: "buy", tsMs: T }, { id: "2", px: 100, sz: 1234.5, side: "sell", tsMs: T - 1 }]}
        instrument={{ ...BTC, lotSz: "0.01" }}
      />,
    );
    expect(html).toContain("12,50");
    expect(html).toContain("1.234,5");
  });
});

function marker(over: Partial<DecisionMarker> = {}): DecisionMarker {
  return {
    readId: "r-1",
    action: "buy",
    anchorMs: T,
    barIndex: 3,
    price: 100.5,
    weights: { buy: 0.63, sell: 0.22, hold: 0.15 },
    confidence: 0.63,
    model: "jev-test-1",
    latencyMs: 291,
    horizonMinutes: 5,
    atMs: T,
    outcome: { kind: "measured", bps: 10.5, favourable: true },
    ...over,
  };
}

describe("DecisionCard", () => {
  test("a measured buy names the action, the weights, the model, the price and the advisory line", () => {
    const html = renderToStaticMarkup(<DecisionCard marker={marker()} x={100} y={40} plotWidth={400} plotHeight={220} decimals={1} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Comprar");
    expect(html).toContain("63%");
    expect(html).toContain("22%");
    expect(html).toContain("15%");
    expect(html).toContain("jev-test-1");
    expect(html).toContain("291 ms");
    expect(html).toContain("100,5");
    expect(html).toContain("Resultado apos 5 min: +10,5 bps a favor, bruto");
    expect(html).toContain("Decisao consultiva do Inonu, nada foi enviado");
    expect(html).toMatch(/\d\d:\d\d:\d\d/);
    expectNoForbidden(html);
  });

  test("a losing sell reads contra, a pending read reads em andamento, a wide bar is not measured", () => {
    const against = renderToStaticMarkup(<DecisionCard marker={marker({ action: "sell", outcome: { kind: "measured", bps: -4.2, favourable: false } })} x={10} y={10} plotWidth={300} plotHeight={200} decimals={1} />);
    expect(against).toContain("Vender");
    expect(against).toContain("contra, bruto");
    const pending = renderToStaticMarkup(<DecisionCard marker={marker({ outcome: { kind: "pending" } })} x={10} y={10} plotWidth={300} plotHeight={200} decimals={1} />);
    expect(pending).toContain("em andamento");
    const wide = renderToStaticMarkup(<DecisionCard marker={marker({ outcome: { kind: "not_measured", reason: "scale" } })} x={10} y={10} plotWidth={300} plotHeight={200} decimals={1} />);
    expect(wide).toContain("nao medido nesta escala");
  });

  test("a hold decision prints no outcome line", () => {
    const html = renderToStaticMarkup(<DecisionCard marker={marker({ action: "hold", outcome: { kind: "none" } })} x={10} y={10} plotWidth={300} plotHeight={200} decimals={1} />);
    expect(html).toContain("Manter");
    expect(html).not.toContain("Resultado");
    expectNoForbidden(html);
  });
});

describe("AssetPicker", () => {
  const catalog: AssetCatalog = {
    status: "ready",
    spot: [
      { instId: "BTC-USDT", last: 83957.4, change24hPct: 1.4, volQuote24h: 9e9 },
      { instId: "ETH-USDT", last: 3250.5, change24hPct: -1.5, volQuote24h: 4e9 },
    ],
    swap: [{ instId: "BTC-USDT-SWAP", last: 83960.1, change24hPct: 1.42, volQuote24h: 2e10 }],
  };

  test("the trigger shows the instrument in focus", () => {
    const html = renderToStaticMarkup(<AssetPicker focus="BTC-USDT" catalog={catalog} jevReads={new Set()} />);
    expect(html).toContain("BTC-USDT");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Buscar ativo");
    expectNoForbidden(html);
  });

  test("open: search box, tabs, rows with price and signed change, and the Inonu le tag", () => {
    const html = renderToStaticMarkup(<AssetPicker focus="ETH-USDT" catalog={catalog} jevReads={new Set(["BTC-USDT"])} defaultOpen />);
    expect(html).toContain("Buscar ativo");
    expect(html).toContain(">Spot<");
    expect(html).toContain(">Perpetuos<");
    expect(html).toContain("Inonu le");
    expect(html).toContain("+1,40%");
    expect(html).toContain("-1,50%");
    expect((html.match(/role="option"/g) ?? []).length).toBe(2);
    expectNoForbidden(html);
  });

  test("a failed catalog lists the fallback and says the full list is unavailable", () => {
    const html = renderToStaticMarkup(<AssetPicker focus="BTC-USDT" catalog={{ status: "error", spot: [], swap: [] }} jevReads={new Set()} defaultOpen />);
    expect(html).toContain("Lista completa indisponivel");
    expect(html).toContain("BTC-USDT");
    expect(html).not.toContain("+0,00%");
    expectNoForbidden(html);
  });
});

/* ---------- E6b: on-chain focus ---------- */

const OC_FOCUS: OnchainFocus = { chainIndex: "1", address: "0xdef1ce", symbol: "PEPE", name: null };
const OC_META: OnchainMeta = { tier: "basic", cachedAtMs: T - 5_000, ageMs: 5_000, stale: false, budget: { tier: "basic", used: 10, cap: 50_000 } };
const STUB_CLIENT = {} as unknown as OnchainClient;
const OC_PICKER: AssetPickerOnchain = { client: STUB_CLIENT, chainIndex: "1", onChainSelect: () => {}, onSelectToken: () => {} };

function ocChart(over: Partial<PriceChartOnchain> = {}): PriceChartOnchain {
  return {
    focus: OC_FOCUS,
    chainName: "Ethereum",
    status: "ready",
    error: null,
    meta: OC_META,
    wallets: null,
    onBack: () => {},
    picker: OC_PICKER,
    ...over,
  };
}

describe("PriceChart in onchain mode", () => {
  test("title, chain, honesty strip and the back button; no Jev line", () => {
    const s = lab();
    const html = renderToStaticMarkup(
      <PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} onBarChange={() => undefined} onchain={ocChart()} />,
    );
    expect(html).toContain("Grafico on-chain PEPE");
    expect(html).toContain("(Ethereum)");
    expect(html).toContain("On-chain, via OnchainOS");
    expect(html).toContain("Sem WebSocket no plano gratuito");
    // the Inonu reads a token too (the button asks it through the OnchainOS gateway): the strip no longer says it does not
    expect(html).not.toContain("O Inonu nao le este ativo");
    expect(html).toContain("Voltar para OKX");
    expect(html).not.toContain("Leitura do Inonu");
    expectNoForbidden(html);
  });

  test("1D is disabled with its reason", () => {
    const s = lab();
    const html = renderToStaticMarkup(
      <PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} onBarChange={() => undefined} onchain={ocChart()} />,
    );
    expect(html).toContain("Sem 1D on-chain");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>1D<\/button>/);
  });

  test("loading, per-code error and empty states", () => {
    const base = { metrics: EMPTY_METRICS, ticker: null, instrument: BTC, onchain: ocChart({ status: "loading", meta: null }) };
    expect(renderToStaticMarkup(<PriceChart candles={[]} bar="1m" {...base} />)).toContain("Carregando velas on-chain");
    const err = renderToStaticMarkup(<PriceChart candles={[]} bar="1m" metrics={EMPTY_METRICS} ticker={null} instrument={BTC} onchain={ocChart({ status: "error", error: "provider_unauthorized" })} />);
    expect(err).toContain("Chave, segredo ou passphrase recusados");
    const empty = renderToStaticMarkup(<PriceChart candles={[]} bar="1m" metrics={EMPTY_METRICS} ticker={null} instrument={BTC} onchain={ocChart()} />);
    expect(empty).toContain("Sem velas para este token nesta barra");
    expectNoForbidden(err);
    expectNoForbidden(empty);
  });

  test("a stale meta marks the panel and the strip Dado velho", () => {
    const s = lab();
    const html = renderToStaticMarkup(
      <PriceChart candles={s.candles} bar="1m" metrics={s.metrics} ticker={s.ticker} instrument={s.instrument} onchain={ocChart({ meta: { ...OC_META, stale: true } })} />,
    );
    expect(html).toContain("Dado velho");
  });
});

describe("Watchlist pins and volume extras", () => {
  const pins: WatchPins = {
    pins: ["SOL-USDT"],
    isPinned: (id) => id === "BTC-USDT" || id === "SOL-USDT",
    canPin: (id) => id !== "BTC-USDT",
    toggle: () => {},
  };

  test("every row has a star; the default shows a filled disabled star, the extra none of the columns invents", () => {
    const html = renderToStaticMarkup(
      <Watchlist
        rows={[row("BTC-USDT", 100, 90), row("SOL-USDT", 20, 18)]}
        focus="BTC-USDT"
        pins={pins}
        extras={[{ instId: "DOGE-USDT", last: 0.2, change24hPct: 1.5, volQuote24h: 5_000 }]}
      />,
    );
    expect(html).toContain("Mais ativos por volume");
    expect(html).toContain(">DOGE<");
    expect(html).toContain("Fixado na lista");
    expect(html).toContain("Remover da lista");
    expect(html).toContain("Fixar na lista");
    // Two real rows keep their sparklines; the extra row has none.
    expect((html.match(/Tendencia de /g) ?? []).length).toBe(2);
    expectNoForbidden(html);
  });
});

describe("AssetPicker in onchain mode", () => {
  const catalog: AssetCatalog = {
    status: "ready",
    spot: [{ instId: "BTC-USDT", last: 1, change24hPct: 1, volQuote24h: 100 }],
    swap: [],
  };

  test("the trigger reads SYMBOL (network) under an onchain focus", () => {
    const html = renderToStaticMarkup(
      <AssetPicker focus="BTC-USDT" catalog={catalog} jevReads={new Set()} onchainFocus={OC_FOCUS} onchain={OC_PICKER} />,
    );
    expect(html).toContain("PEPE (Ethereum)");
    expectNoForbidden(html);
  });

  test("open on a chain: OKX chip, network chips, Trending header and a commit-only search", () => {
    const html = renderToStaticMarkup(
      <AssetPicker focus="BTC-USDT" catalog={catalog} jevReads={new Set()} onchainFocus={OC_FOCUS} onchain={OC_PICKER} defaultOpen />,
    );
    expect(html).toContain(">OKX<");
    expect(html).toContain("Ethereum");
    expect(html).toContain("Solana");
    expect(html).toContain(">Trending<");
    expect(html).toContain("Buscar");
    // The list has not answered in a static render: honest loading, no invented rows.
    expect(html).toContain("Carregando");
    expectNoForbidden(html);
  });

  test("a token row is two full lines: bold symbol, no invented name, signed change and context", () => {
    const html = renderToStaticMarkup(
      <OnchainTokenRow
        active={false}
        row={{ key: "k", symbol: "FXD", name: null, price: 1.23, changePct: -4.5, liquidityUsd: 8_800_000, holders: 90_200, chainIndex: "1", address: "0x1" }}
      />,
    );
    expect(html).toContain(">FXD<");
    // The hot-token answer carries no name: the word never stands in for it.
    expect(html).not.toContain("Indisponivel");
    expect(html).toContain("US$ 1,23");
    expect(html).toContain("-4,5%");
    expect(html).toContain("liq US$ 8,8 mi");
    expect(html).toContain("90,2 mil holders");
    const named = renderToStaticMarkup(
      <OnchainTokenRow
        active={false}
        row={{ key: "k2", symbol: "JUP", name: "Jupiter", price: 0.4, changePct: 1.2, liquidityUsd: null, holders: null, chainIndex: "501", address: "0x2" }}
      />,
    );
    expect(named).toContain("Jupiter");
    expect(named).not.toContain("holders");
    expect(named).not.toContain("liq");
    expectNoForbidden(html);
    expectNoForbidden(named);
  });
});
