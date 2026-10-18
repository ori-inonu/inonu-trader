import { describe, expect, test } from "bun:test";
import type { DeskDerivatives, DeskInstrument, DeskMetrics, DeskTicker } from "../types";
import { UNAVAILABLE } from "./format";
import { changeTone, instrumentHeaderModel, rangePosition, tickDirection } from "./instrument-header";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);

const METRICS: DeskMetrics = {
  midPx: 83_217.45, microPx: 83_217.5, spreadBps: 0.012, depthBidShare10bps: 0.5, depthBidShare50bps: 0.5,
  bidDepthQuote10bps: 1, askDepthQuote10bps: 1, bidDepthQuote50bps: 1, askDepthQuote50bps: 1,
  buyVolBase60s: 1, sellVolBase60s: 1, flowImbalance60s: 0, tradesPerSecond60s: 1, cvd: 0,
  vwap: 83_200, realizedSigmaDaily: null, change24hPct: 0.774,
};
const NULL_METRICS: DeskMetrics = {
  midPx: null, microPx: null, spreadBps: null, depthBidShare10bps: null, depthBidShare50bps: null,
  bidDepthQuote10bps: null, askDepthQuote10bps: null, bidDepthQuote50bps: null, askDepthQuote50bps: null,
  buyVolBase60s: null, sellVolBase60s: null, flowImbalance60s: null, tradesPerSecond60s: null, cvd: null,
  vwap: null, realizedSigmaDaily: null, change24hPct: null,
};
const SPOT: DeskInstrument = { instId: "BTC-USDT", instType: "SPOT", base: "BTC", quote: "USDT", tickSz: "0.1", lotSz: "0.00000001" };
const SWAP: DeskInstrument = { instId: "BTC-USDT-SWAP", instType: "SWAP", base: "BTC", quote: "USDT", tickSz: "0.1", lotSz: "0.01" };
const TICKER: DeskTicker = {
  instId: "BTC-USDT", last: 83_217.4, open24h: 82_578.4, high24h: 84_166.3, low24h: 81_032.8,
  volBase24h: 6_379.8, volQuote24h: 529_847_212.6, bidPx: 83_217.4, bidSz: 0.4, askPx: 83_217.5, askSz: 0.6, tsMs: 1_791_911_220_796,
};
const DERIV: DeskDerivatives = { instId: "BTC-USDT-SWAP", fundingRate: 0.000045, nextFundingTimeMs: null, markPx: 83_220, indexPx: 83_215, openInterest: 2_900_000, openInterestUsd: null, tsMs: 1 };

describe("tickDirection", () => {
  test("rises, falls, keeps the last direction on an equal print and is flat before the first comparison", () => {
    expect(tickDirection(null, 10, "flat")).toBe("flat");
    expect(tickDirection(10, null, "up")).toBe("flat");
    expect(tickDirection(10, 11, "flat")).toBe("up");
    expect(tickDirection(11, 10, "up")).toBe("down");
    expect(tickDirection(10, 10, "down")).toBe("down");
  });
});

describe("rangePosition", () => {
  test("is the share of the 24h range below the last price, clamped, and null without a real range", () => {
    expect(rangePosition(50, 0, 100)).toBe(0.5);
    expect(rangePosition(120, 0, 100)).toBe(1);
    expect(rangePosition(-5, 0, 100)).toBe(0);
    expect(rangePosition(50, null, 100)).toBeNull();
    expect(rangePosition(50, 100, 100)).toBeNull();
    expect(rangePosition(50, 100, 90)).toBeNull();
  });
});

describe("changeTone", () => {
  test("a change that prints as zero carries no colour, unknown is none", () => {
    expect(changeTone(null)).toBe("none");
    expect(changeTone(0.004)).toBe("flat");
    expect(changeTone(0.01)).toBe("up");
    expect(changeTone(-0.01)).toBe("down");
  });
});

describe("instrumentHeaderModel", () => {
  test("a live spot ticker: price at the tick decimals, signed change, 24h range with the marker, volume in quote and the spread", () => {
    const m = instrumentHeaderModel({ ticker: TICKER, metrics: METRICS, instrument: SPOT, derivatives: null });
    expect(m.known).toBe(true);
    expect(m.price).toBe("83.217,4");
    expect(m.quote).toBe("USDT");
    expect(m.change).toEqual({ text: "+0,77%", tone: "up" });
    expect(m.changeAbs).toBe("+639,0");
    expect(m.range.low).toBe("81.032,8");
    expect(m.range.high).toBe("84.166,3");
    expect(m.range.position).toBeCloseTo((83_217.4 - 81_032.8) / (84_166.3 - 81_032.8), 6);
    expect(m.range.label).toContain("minima 81.032,8");
    expect(m.range.label).toContain("maxima 84.166,3");
    expect(m.range.label).toMatch(/ultimo a \d+% da faixa/);
    const byId = Object.fromEntries(m.stats.map((s) => [s.id, s]));
    expect(byId.vol!.value).toBe("530 mi USDT");
    expect(byId.spread!.value).toBe("0,01 bps");
    expect(byId.funding).toBeUndefined();
    expect(m.label).toContain("BTC-USDT");
    expect(m.asOf).toBe("17:07:00");
    for (const text of [m.price, m.change.text, m.range.label, m.label, ...m.stats.map((s) => s.value)]) expect(text).not.toMatch(FORBIDDEN);
  });

  test("without a ticker nothing is invented: not known, every figure unavailable, no range marker", () => {
    const m = instrumentHeaderModel({ ticker: null, metrics: NULL_METRICS, instrument: SPOT, derivatives: null });
    expect(m.known).toBe(false);
    expect(m.price).toBe(UNAVAILABLE);
    expect(m.change).toEqual({ text: UNAVAILABLE, tone: "none" });
    expect(m.changeAbs).toBeNull();
    expect(m.range.position).toBeNull();
    expect(m.range.low).toBe(UNAVAILABLE);
    expect(m.range.label).toBe("Faixa de 24 horas indisponivel");
    expect(m.asOf).toBeNull();
    for (const s of m.stats) expect(s.known).toBe(false);
  });

  test("the change falls back to the ticker open when the metrics have none, and prints flat at zero", () => {
    const m = instrumentHeaderModel({ ticker: { ...TICKER, open24h: 83_217.4 }, metrics: NULL_METRICS, instrument: SPOT, derivatives: null });
    expect(m.change).toEqual({ text: "0,00%", tone: "flat" });
    expect(m.changeAbs).toBe("0,0");
    const open = instrumentHeaderModel({ ticker: { ...TICKER, open24h: null }, metrics: NULL_METRICS, instrument: SPOT, derivatives: null });
    expect(open.change).toEqual({ text: UNAVAILABLE, tone: "none" });
    expect(open.changeAbs).toBeNull();
  });

  test("a perpetual: the volume is in contracts, never called quote, and the funding of the same instrument is a stat", () => {
    const m = instrumentHeaderModel({ ticker: { ...TICKER, instId: SWAP.instId, volQuote24h: null }, metrics: METRICS, instrument: SWAP, derivatives: DERIV });
    const byId = Object.fromEntries(m.stats.map((s) => [s.id, s]));
    expect(byId.vol!.value).toBe("6,4 mil contratos");
    expect(byId.funding!.value).toBe("+0,0045%");
    expect(byId.funding!.tone).toBe("up");
    expect(byId.funding!.known).toBe(true);
  });

  test("the funding of another instrument is not shown as if it were this one", () => {
    const m = instrumentHeaderModel({ ticker: TICKER, metrics: METRICS, instrument: SPOT, derivatives: DERIV });
    expect(m.stats.find((s) => s.id === "funding")).toBeUndefined();
    const other = instrumentHeaderModel({ ticker: { ...TICKER, instId: SWAP.instId }, metrics: METRICS, instrument: SWAP, derivatives: { ...DERIV, instId: "ETH-USDT-SWAP" } });
    expect(other.stats.find((s) => s.id === "funding")).toBeUndefined();
  });

  test("without an instrument the decimals follow the magnitude of the price and the quote comes from the id", () => {
    const m = instrumentHeaderModel({ ticker: { ...TICKER, instId: "MON-USDT", last: 0.02425, open24h: 0.025 }, metrics: NULL_METRICS, instrument: null, derivatives: null });
    expect(m.price).toBe("0,024250");
    expect(m.quote).toBe("USDT");
    expect(m.change.tone).toBe("down");
  });

  test("a spot volume without the quote amount falls back to the base amount, named", () => {
    const m = instrumentHeaderModel({ ticker: { ...TICKER, volQuote24h: null }, metrics: NULL_METRICS, instrument: SPOT, derivatives: null });
    expect(m.stats.find((s) => s.id === "vol")!.value).toBe("6,4 mil BTC");
    const none = instrumentHeaderModel({ ticker: { ...TICKER, volQuote24h: null, volBase24h: null }, metrics: NULL_METRICS, instrument: SPOT, derivatives: null });
    expect(none.stats.find((s) => s.id === "vol")!.value).toBe(UNAVAILABLE);
    expect(none.stats.find((s) => s.id === "vol")!.known).toBe(false);
  });
});
