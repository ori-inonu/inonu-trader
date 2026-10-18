// T5.7, T6.4: what the chart layer draws, as plain numbers in PRICE space (so the browser needs no knowledge of ticks, bins or
// contracts). The overlay is DESCRIPTIVE: demand and supply, measured imbalances, runs and levels; the words of an order never
// appear (FLX-10). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { analyze, type AnalystInput } from "../intel/analyst";
import type { InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";
import type { ThresholdCandle } from "../intel/thresholds";
import { MAX_OVERLAY_LEVELS, buildOverlay } from "./overlay";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const META: InstrumentMeta = { instId: "TEST-USDT", instType: "SPOT", tickSz: "0.5", lotSz: "1" };
const candles = Array.from({ length: 21 }, (_, i) => ({ ts: T0 - (21 - i) * MIN, open: "100", high: "101", low: "99", close: "100" }));
const trade = (ts: number, px: string, sz: number, side: "buy" | "sell"): Trade => ({ ts, px, sz: String(sz), side });
const window: Trade[] = [
  trade(T0 + 1_000, "99.0", 60, "buy"), trade(T0 + 1_100, "99.0", 10, "sell"),
  trade(T0 + 2_000, "99.5", 90, "buy"), trade(T0 + 2_100, "99.5", 10, "sell"),
  trade(T0 + 3_000, "100.0", 50, "buy"), trade(T0 + 3_100, "100.0", 8, "sell"),
  trade(T0 + 4_000, "101.0", 5, "buy"), trade(T0 + 4_100, "101.0", 5, "sell"),
];
const history: ThresholdCandle[] = [0, 1, 2].map(() => ({ binTicks: 1, levels: [{ c: 10, v: 10 }, { c: 30, v: 10 }, { c: 20, v: 20 }] }));
const input = (over: Partial<AnalystInput> = {}): AnalystInput => ({ meta: META, trades: window, candles, history, nowMs: T0 + 5_000, prevZones: [], warmupCandles: 3, ...over });
const overlayOf = (over: Partial<AnalystInput> = {}, source: "okx_ws_trades" | "okx_public_v5" = "okx_ws_trades") =>
  buildOverlay({ analysis: analyze(input(over)), meta: META, source, asOfMs: T0 + 5_000, closedCandles: 3, neededCandles: 3 });

describe("the levels", () => {
  test("every level of the window in price, with the volume of each aggressor and the marks that apply", () => {
    const o = overlayOf();
    // the quantity threshold learned from the history is 30 units on one side, so the three heavy levels carry the alert
    expect(o.niveis.find((n) => n.baixo === 99)).toEqual({ baixo: 99, alto: 99.5, c: 60, v: 10, imb: "c", volume: null, alerta: { c: true, v: false } });
    const poc = o.niveis.find((n) => n.baixo === 99.5)!;
    expect(poc).toMatchObject({ c: 90, v: 10, imb: "c", volume: "c", alerta: { c: true, v: false } }); // K = 1: the busiest level carries the volume factor
    expect(o.niveis.find((n) => n.baixo === 101)).toEqual({ baixo: 101, alto: 101.5, c: 5, v: 5, imb: null, volume: null, alerta: null });
    expect(o.niveis.map((n) => n.baixo)).toEqual([99, 99.5, 100, 101]);
    expect(o.step).toBe(0.5);
  });

  test("in warm-up there is no mark that needs a threshold, and the overlay says how far the warm-up is", () => {
    const o = overlayOf({ history: [] });
    expect(o.niveis.every((n) => n.imb === null && n.volume === null && n.alerta === null)).toBe(true);
    expect(o.aquecimento).toEqual({ fechadas: 3, necessarias: 3, pronto: false, restaurado: 0 });
    expect(o.nulos["fluxo.imb"]).toBe("aquecimento");
  });

  test("the warm-up says how many closed minutes came from the memory of the previous run", () => {
    const o = buildOverlay({ analysis: analyze(input()), meta: META, source: "okx_ws_trades", asOfMs: T0 + 5_000, closedCandles: 3, neededCandles: 3, restoredCandles: 2 });
    expect(o.aquecimento).toEqual({ fechadas: 3, necessarias: 3, pronto: true, restaurado: 2 });
  });

  test("it is bounded: past the limit only the levels nearest to the price are kept", () => {
    const many: Trade[] = Array.from({ length: MAX_OVERLAY_LEVELS + 80 }, (_, i) => trade(T0 + 1_000 + i, (50 + i * 0.5).toFixed(1), 1, i % 2 === 0 ? "buy" : "sell"));
    const o = overlayOf({ trades: [...many, trade(T0 + 9_000, "60.0", 1, "buy")] });
    expect(o.niveis.length).toBeLessThanOrEqual(MAX_OVERLAY_LEVELS);
    expect(o.niveis.some((n) => n.baixo === 60)).toBe(true); // the last price stays in
  });
});

describe("an instrument that costs a fraction of a cent", () => {
  // a SHIB-like pair: tick 0.000000001, price near 0.0000123. Rounding every number to eight decimals collapsed the levels into zero-width
  // boxes and the step into 0, so the browser refused the whole reading: the chart layer, the Fluxo tab, the Zonas and the alerts went empty.
  const MICRO: InstrumentMeta = { instId: "MICRO-USDT", instType: "SPOT", tickSz: "0.000000001", lotSz: "1" };
  const px = (n: number) => (n * 1e-9).toFixed(9);
  const microCandles = Array.from({ length: 21 }, (_, i) => ({ ts: T0 - (21 - i) * MIN, open: "0.0000123", high: "0.0000124", low: "0.0000122", close: "0.0000123" }));
  const microTrades: Trade[] = Array.from({ length: 40 }, (_, i) => trade(T0 + 1_000 + i * 50, px(12_300 + (i % 8) * 20), 1 + (i % 5), i % 3 === 0 ? "sell" : "buy"));
  const overlay = () => buildOverlay({ analysis: analyze(input({ meta: MICRO, trades: microTrades, candles: microCandles, history: [] })), meta: MICRO, source: "okx_ws_trades", asOfMs: T0 + 5_000, closedCandles: 3, neededCandles: 3 });

  test("the step is not rounded to zero, and every level keeps a real width", () => {
    const o = overlay();
    expect(o.step).toBeGreaterThan(0);
    expect(o.niveis.length).toBeGreaterThan(1);
    for (const level of o.niveis) expect(level.alto).toBeGreaterThan(level.baixo);
  });

  test("the levels still tell one price from the next one (distinct, ascending), at a nine decimal tick", () => {
    const lows = overlay().niveis.map((n) => n.baixo);
    expect(new Set(lows).size).toBe(lows.length);
    expect([...lows].sort((a, b) => a - b)).toEqual(lows);
  });

  test("the price of the reading and its profile survive too", () => {
    const o = overlay();
    expect(o.price).toBeGreaterThan(0.00001);
    if (o.perfil.poc !== null) expect(o.perfil.poc.alto).toBeGreaterThan(o.perfil.poc.baixo);
  });
});

describe("the unit and the totals", () => {
  test("the size of one unit in base currency and the totals of the whole window travel with the levels, so the browser can tell a quantity", () => {
    const o = overlayOf();
    expect(o.unidade).toBe("1");
    expect(o.totais).toEqual({ c: 205, v: 33 });
  });

  test("the totals count every level even when the list of levels is cut to the ones nearest the price", () => {
    const many: Trade[] = Array.from({ length: MAX_OVERLAY_LEVELS + 80 }, (_, i) => trade(T0 + 1_000 + i, (50 + i * 0.5).toFixed(1), 1, i % 2 === 0 ? "buy" : "sell"));
    const o = overlayOf({ trades: [...many, trade(T0 + 9_000, "60.0", 1, "buy")] });
    expect(o.niveis.length).toBeLessThanOrEqual(MAX_OVERLAY_LEVELS);
    expect(o.totais.c + o.totais.v).toBe(MAX_OVERLAY_LEVELS + 80 + 1);
  });

  test("a perpetual states its unit in base currency: lot size times contract value times multiplier", () => {
    const perp: InstrumentMeta = { instId: "TEST-USDT-SWAP", instType: "SWAP", tickSz: "0.5", lotSz: "1", ctVal: "0.01", ctMult: "1" } as InstrumentMeta;
    const o = buildOverlay({ analysis: analyze(input({ meta: perp })), meta: perp, source: "okx_ws_trades", asOfMs: T0 + 5_000, closedCandles: 3, neededCandles: 3 });
    expect(o.unidade).toBe("0.01");
  });
});

describe("the runs, in price", () => {
  test("the stacked imbalance is a range with its side and length", () => {
    const o = overlayOf();
    expect(o.corridas.sequencial).toEqual([{ lado: "c", baixo: 99, alto: 100.5, n: 3 }]);
    expect(o.corridas.progressao).toEqual([]);
    expect(o.corridas.exaustao).toEqual([]);
  });
});

describe("the profile", () => {
  test("the point of control as a range, the value area edges, and the nodes", () => {
    const o = overlayOf();
    expect(o.perfil.poc).toEqual({ baixo: 99.5, alto: 100 });
    expect(o.perfil.val).toBe(99);
    expect(o.perfil.vah).toBe(100);
    expect(o.perfil.hvn).toEqual([{ baixo: 99.5, alto: 100 }]);
    expect(o.perfil.lvn).toEqual([]);
  });

  test("an empty window has no profile", () => {
    const o = overlayOf({ trades: [] });
    expect(o.perfil).toEqual({ poc: null, val: null, vah: null, hvn: [], lvn: [] });
    expect(o.niveis).toEqual([]);
    expect(o.price).toBeNull();
  });
});

describe("the zones", () => {
  test("only the active and tested zones are drawn, with state, score, backing families, age and the invalidation level", () => {
    const o = overlayOf();
    expect(o.zonas).toHaveLength(1);
    const z = o.zonas[0]!;
    expect(z).toMatchObject({ lado: "demanda", baixo: 99, alto: 100.5, estado: "ativa", fatores: ["E2", "E3"], idadeBarras: 0 });
    expect(z.id).toMatch(/^[0-9a-f]{12}$/);
    expect(z.nota).toBeCloseTo(72.2, 1);
    expect(z.invalidacao).toBeCloseTo(98.8, 5);
  });

  test("while the families do not agree no zone is drawn", () => {
    expect(overlayOf({ history: [] }).zonas).toEqual([]);
  });

  test("without an ATR there is no zone and the reason is in nulos", () => {
    const o = overlayOf({ candles: candles.slice(-10) });
    expect(o.zonas).toEqual([]);
    expect(o.nulos.zonas).toBe("atr_indisponivel");
  });
});

describe("rules", () => {
  test("the source and the time are carried, and the JSON uses none of the words of an order (FLX-10)", () => {
    const o = overlayOf({}, "okx_public_v5");
    expect(o).toMatchObject({ ok: true, instId: "TEST-USDT", fonte: "okx_public_v5", asOfMs: T0 + 5_000, tickSz: "0.5", binTicks: 1, price: 101 });
    const json = JSON.stringify(o);
    for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(json)).toBe(false);
  });

  test("it is small enough to poll: well under 20 KB for a busy window", () => {
    const many: Trade[] = Array.from({ length: 400 }, (_, i) => trade(T0 + 1_000 + i, (95 + (i % 40) * 0.5).toFixed(1), 1 + (i % 7), i % 3 === 0 ? "sell" : "buy"));
    const bytes = new TextEncoder().encode(JSON.stringify(overlayOf({ trades: many }))).length;
    expect(bytes).toBeLessThan(20_000);
  });

  test("the same input gives the same overlay", () => {
    expect(JSON.stringify(overlayOf())).toBe(JSON.stringify(overlayOf()));
  });
});
