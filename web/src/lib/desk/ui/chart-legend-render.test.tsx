// The legend of the chart: the quote on the first line, and on the second the reading of the moment (who is in charge, how many conditions line up, what the Inonu last said, the button
// that asks again). It reads the model of the thermometer, so the two never disagree; the code describes and the only words of an order are the Inonu's own answer.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartLegend, DecisionChips } from "@/components/Desk/panels/ChartLegend";
import { PriceChart } from "@/components/Desk/panels/PriceChart";
import { thermometer, type ThermoInput } from "../thermometer";
import type { DeskInstrument, DeskMetrics, DeskTicker } from "../types";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);

const NOW = 10_000_000;
const input = (over: Partial<ThermoInput> = {}): ThermoInput => ({
  imbalance: 0.4, trades: 120, price: 100.3, zones: [{ lado: "demanda", baixo: 99, alto: 100, estado: "ativa" }], answer: { action: "hold", atMs: NOW - 7 * 60_000 }, nowMs: NOW,
  // the hand has held the same side for four minutes and the book is thick: all four conditions can be read
  stable: { band: "buy1", pct: 40, sinceMs: NOW - 4 * 60_000 },
  market: { thickness: "fluido", text: "Mercado fluido: ir e voltar com US$ 1.000 custa US$ 0,10 (0,01%)." },
  ...over,
});
const noop = () => {};
const chips = (over: Partial<ThermoInput> = {}) => renderToStaticMarkup(<DecisionChips read={thermometer(input(over))} onAsk={noop} />);

const METRICS: DeskMetrics = {
  midPx: 83_217.45, microPx: 83_217.5, spreadBps: 0.012, depthBidShare10bps: 0.5, depthBidShare50bps: 0.5,
  bidDepthQuote10bps: 1, askDepthQuote10bps: 1, bidDepthQuote50bps: 1, askDepthQuote50bps: 1,
  buyVolBase60s: 1, sellVolBase60s: 1, flowImbalance60s: 0, tradesPerSecond60s: 1, cvd: 0,
  vwap: 83_200, realizedSigmaDaily: null, change24hPct: 0.774,
};
const SPOT: DeskInstrument = { instId: "BTC-USDT", instType: "SPOT", base: "BTC", quote: "USDT", tickSz: "0.1", lotSz: "0.00000001" };
const TICKER: DeskTicker = {
  instId: "BTC-USDT", last: 83_217.4, open24h: 82_578.4, high24h: 84_166.3, low24h: 81_032.8,
  volBase24h: 6_379.8, volQuote24h: 529_847_212.6, bidPx: 83_217.4, bidSz: 0.4, askPx: 83_217.5, askSz: 0.6, tsMs: 1_791_911_220_796,
};
const header = { ticker: TICKER, metrics: METRICS, instrument: SPOT, derivatives: null };

describe("the reading of the moment in the legend", () => {
  test("who is in charge, how many conditions line up and what the Inonu said, with the button that asks again", () => {
    const html = chips();
    expect(html).toContain('aria-label="Leitura do momento"');
    expect(html).toContain("Compradores um pouco a frente +40%");
    expect(html).toContain("4 de 4 condicoes");
    expect(html).toContain("Inonu: Esperar, ha 7 min");
    expect(html).toContain("Perguntar de novo");
  });

  test("the meter and the pips are drawn for the eye and said for the reader", () => {
    const html = chips();
    expect(html).toContain('data-kind="pressure"');
    expect(html).toContain('data-tone="buy"');
    expect(html).toContain("left:70.0%");
    expect(html.match(/data-ok="true"/g)?.length).toBe(4);
    // the whole sentence of the scenario is there for a screen reader, and the conditions are in the tooltip
    expect(html).toMatch(/title="Sim: [^"]+/);
    expect(html).toMatch(/alinhad/);
  });

  test("a market too quiet to read says so instead of a number, and gives no sentence of an order", () => {
    const html = chips({ imbalance: -1, trades: 4, stable: { band: "sell2", pct: -80, sinceMs: NOW } });
    expect(html).toContain("Pouca negociacao agora");
    expect(html).not.toContain("-100%");
  });

  test("no answer yet: it offers the first ask and shows no answer chip", () => {
    const html = chips({ answer: null });
    expect(html).toContain("Pedir ao Inonu");
    expect(html).not.toContain("Perguntar de novo");
    expect(html).not.toContain('data-kind="answer"');
  });

  test("an old answer is called old, with its age", () => {
    const html = chips({ answer: { action: "buy", atMs: NOW - 3 * 3_600_000 } });
    expect(html).toContain("Inonu, resposta antiga: Comprar, ha 3 h");
    expect(html).not.toContain('data-fresh="true"');
  });

  test("the question is worth asking only when enough conditions line up and the Inonu has no recent answer", () => {
    const worth = thermometer(input({ answer: null }));
    expect(worth.scenario.worthAsking).toBe(true);
    expect(renderToStaticMarkup(<DecisionChips read={worth} onAsk={noop} />)).toContain('data-worth="true"');
    expect(chips()).not.toContain('data-worth="true"');
  });

  test("no text carries a middle dot, an em dash, an en dash or a broken number", () => {
    for (const html of [chips(), chips({ imbalance: null, stable: null }), chips({ answer: null, zones: [] })]) {
      expect(html).not.toMatch(FORBIDDEN);
      const content = html.replace(/ class="[^"]*"/g, "");
      for (const word of ["NaN", "undefined", "Infinity"]) expect(content).not.toContain(word);
    }
  });
});

describe("the legend as a whole", () => {
  test("the quote comes first and the reading under it", () => {
    const html = renderToStaticMarkup(<ChartLegend header={header} read={thermometer(input())} onAsk={noop} onPortfolio={noop} />);
    expect(html).toContain('data-variant="legend"');
    expect(html).toContain(">83.217,4<");
    expect(html).toContain("+0,77%");
    expect(html.indexOf('data-variant="legend"')).toBeLessThan(html.indexOf("Leitura do momento"));
    // the portfolio question closes the second line; the question about the asset is the button of the reading, not a second one
    expect(html.indexOf("Leitura do momento")).toBeLessThan(html.indexOf("Analisar carteira"));
    expect(html).not.toContain("Consultar ativo");
  });

  test("without a reading (the complete desk, an on-chain token) the second line is the two questions alone", () => {
    const html = renderToStaticMarkup(<ChartLegend header={header} read={null} onAsk={noop} onPortfolio={noop} />);
    expect(html).toContain('data-variant="legend"');
    expect(html).not.toContain("Leitura do momento");
    expect(html).not.toContain("Pedir ao Inonu");
    expect(html).toContain("Consultar ativo");
    expect(html).toContain("Analisar carteira");
  });
});

describe("the chart carries the legend and the questions", () => {
  const candles = [{ openTime: 0, open: 1, high: 2, low: 0.5, close: 1.5, volBase: 1, volQuote: 1, confirmed: true }];
  const draw = (extra: object = {}) =>
    renderToStaticMarkup(<PriceChart candles={candles as never} bar="1m" metrics={METRICS} ticker={TICKER} instrument={SPOT} focus="BTC-USDT" {...extra} />);

  test("with a legend the toolbar no longer repeats the 24h change, and the legend sits under the toolbar, before the chart", () => {
    const html = draw({ legend: <p>quote here</p> });
    expect(html).toContain("quote here");
    expect(html).not.toContain(">24h<");
    expect(html.indexOf("quote here")).toBeGreaterThan(html.indexOf("Detalhes"));
    expect(html.indexOf("quote here")).toBeLessThan(html.indexOf('aria-label="Grafico.'));
  });

  test("without a legend the chart is the one of before: the 24h change stays in the toolbar", () => {
    const html = draw();
    expect(html).toContain("24h");
    expect(html).not.toContain("quote here");
  });
});
