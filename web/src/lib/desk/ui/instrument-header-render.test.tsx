import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import InstrumentHeader from "@/components/Desk/InstrumentHeader";
import type { DeskDerivatives, DeskInstrument, DeskMetrics, DeskTicker } from "../types";
import { AWAITING, UNAVAILABLE } from "./format";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);

const METRICS: DeskMetrics = {
  midPx: 83_217.45, microPx: 83_217.5, spreadBps: 0.012, depthBidShare10bps: 0.5, depthBidShare50bps: 0.5,
  bidDepthQuote10bps: 1, askDepthQuote10bps: 1, bidDepthQuote50bps: 1, askDepthQuote50bps: 1,
  buyVolBase60s: 1, sellVolBase60s: 1, flowImbalance60s: 0, tradesPerSecond60s: 1, cvd: 0,
  vwap: 83_200, realizedSigmaDaily: null, change24hPct: 0.774,
};
const NULL_METRICS: DeskMetrics = { ...METRICS, midPx: null, spreadBps: null, change24hPct: null };
const SPOT: DeskInstrument = { instId: "BTC-USDT", instType: "SPOT", base: "BTC", quote: "USDT", tickSz: "0.1", lotSz: "0.00000001" };
const SWAP: DeskInstrument = { instId: "BTC-USDT-SWAP", instType: "SWAP", base: "BTC", quote: "USDT", tickSz: "0.1", lotSz: "0.01" };
const TICKER: DeskTicker = {
  instId: "BTC-USDT", last: 83_217.4, open24h: 82_578.4, high24h: 84_166.3, low24h: 81_032.8,
  volBase24h: 6_379.8, volQuote24h: 529_847_212.6, bidPx: 83_217.4, bidSz: 0.4, askPx: 83_217.5, askSz: 0.6, tsMs: 1_791_911_220_796,
};
const DERIV: DeskDerivatives = { instId: "BTC-USDT-SWAP", fundingRate: -0.000045, nextFundingTimeMs: null, markPx: null, indexPx: null, openInterest: null, openInterestUsd: null, tsMs: 1 };

/** Characters the project forbids in rendered text, and the words a broken number would leave behind. */
function expectClean(html: string): void {
  expect(html).not.toMatch(FORBIDDEN);
  const content = html.replace(/ class="[^"]*"/g, "");
  expect(content).not.toContain("NaN");
  expect(content).not.toContain("undefined");
  expect(content).not.toContain("Infinity");
}

describe("InstrumentHeader", () => {
  test("a live spot ticker shows the hero price, the change pill, both ends of the range with the marker, and the figures", () => {
    const html = renderToStaticMarkup(<InstrumentHeader ticker={TICKER} metrics={METRICS} instrument={SPOT} derivatives={null} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Ultimo preco e faixa de 24 horas de BTC-USDT"');
    expect(html).toContain(">83.217,4<");
    expect(html).toContain('title="Ultimo preco as 17:07:00 UTC"');
    expect(html).toContain("Ultimo em USDT");
    expect(html).toContain("+639,0 em 24 h");
    expect(html).toContain("+0,77%");
    expect(html).toContain('data-tone="up"');
    expect(html).toContain("81.032,8");
    expect(html).toContain("84.166,3");
    expect(html).toMatch(/aria-label="Faixa de 24 horas: minima 81\.032,8, maxima 84\.166,3, ultimo a \d+% da faixa"/);
    expect(html).toContain("--p:0.69");
    expect(html).toContain("530 mi USDT");
    expect(html).toContain("0,01 bps");
    expect(html).not.toContain("Funding");
    expect(html).not.toContain(AWAITING);
    expect(html).not.toContain('data-stale="true"');
    expectClean(html);
  });

  test("the first render of an instrument is flat: no direction colour before a second print exists", () => {
    const html = renderToStaticMarkup(<InstrumentHeader ticker={TICKER} metrics={METRICS} instrument={SPOT} derivatives={null} />);
    expect(html).toContain('data-dir="flat"');
    expect(html).not.toContain("acima do anterior");
    expect(html).not.toContain("abaixo do anterior");
  });

  test("without a ticker it waits for the OKX data and prints no figure as a value", () => {
    const html = renderToStaticMarkup(<InstrumentHeader ticker={null} metrics={NULL_METRICS} instrument={SPOT} derivatives={null} />);
    expect(html).toContain(AWAITING);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("data-dir=");
    expect(html).toContain("Faixa de 24 horas indisponivel");
    expect(html).not.toContain("--p:");
    expect(html.match(new RegExp(UNAVAILABLE, "g"))!.length).toBeGreaterThanOrEqual(4);
    expectClean(html);
  });

  test("old data is marked and named, never shown as current", () => {
    const html = renderToStaticMarkup(<InstrumentHeader ticker={TICKER} metrics={METRICS} instrument={SPOT} derivatives={null} stale />);
    expect(html).toContain('data-stale="true"');
    expect(html).toContain("dado velho");
  });

  test("a perpetual shows its own funding, coloured by sign, and the compact variant keeps the same figures", () => {
    const ticker = { ...TICKER, instId: SWAP.instId, volQuote24h: null };
    const html = renderToStaticMarkup(<InstrumentHeader ticker={ticker} metrics={METRICS} instrument={SWAP} derivatives={DERIV} variant="compact" />);
    expect(html).toContain('data-variant="compact"');
    expect(html).toContain("Funding");
    expect(html).toContain("-0,0045%");
    expect(html).toContain('data-tone="down"');
    expect(html).toContain("6,4 mil contratos");
    expectClean(html);
  });
});
