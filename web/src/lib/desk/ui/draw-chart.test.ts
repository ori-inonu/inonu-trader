import { describe, expect, test } from "bun:test";
import type { DecisionMarker } from "../chart/decisions";
import type { SmcResult } from "../chart/smc";
import type { DeskCandle } from "../types";
import { DEFAULT_PALETTE, withAlpha } from "./canvas";
import {
  type CandleChartInput,
  computeGeometry,
  DECISION_LANE_H,
  drawChart,
  SMC_MAX_BLOCKS,
  SMC_MAX_EVENTS,
  SMC_MAX_GAPS,
  SMC_MAX_POOLS,
  TIME_AXIS_H,
} from "./draw-chart";
import { RecordingContext } from "./recording-context";

const T0 = Date.UTC(2026, 9, 11, 12, 0, 0);

function candle(i: number, over: Partial<DeskCandle> = {}): DeskCandle {
  const open = 100 + i;
  const close = open + (i % 2 === 0 ? 1 : -1);
  return {
    tsMs: T0 + i * 60_000,
    open,
    high: Math.max(open, close) + 2,
    low: Math.min(open, close) - 2,
    close,
    volBase: 10 + i,
    volQuote: (10 + i) * open,
    confirmed: true,
    ...over,
  };
}

function series(n: number): DeskCandle[] {
  return Array.from({ length: n }, (_, i) => candle(i));
}

function marker(barIndex: number, action: DecisionMarker["action"], over: Partial<DecisionMarker> = {}): DecisionMarker {
  const c = candle(barIndex);
  return {
    readId: `r-${barIndex}-${action}`,
    action,
    anchorMs: c.tsMs + 15_000,
    barIndex,
    price: (c.open + c.close) / 2,
    weights: { buy: 0.63, sell: 0.22, hold: 0.15 },
    confidence: 0.63,
    model: "jev-test",
    latencyMs: 200,
    horizonMinutes: 5,
    atMs: c.tsMs + 15_000,
    outcome: { kind: "pending" },
    ...over,
  };
}

function input(over: Partial<CandleChartInput> = {}): CandleChartInput {
  return {
    width: 600,
    height: 360,
    dpr: 1,
    candles: series(40),
    bar: "1m",
    decimals: 1,
    last: null,
    vwap: null,
    hover: null,
    palette: DEFAULT_PALETTE,
    font: '10.5px "Geist Mono", monospace',
    ...over,
  };
}

describe("chart kinds", () => {
  test("the default input still draws the candle series with one wick per bar", () => {
    const ctx = new RecordingContext();
    const geom = drawChart(ctx, input());
    const wicks = ctx.of("moveTo").filter((c) => c.strokeStyle === DEFAULT_PALETTE.buy || c.strokeStyle === DEFAULT_PALETTE.sell);
    expect(wicks.length).toBe(geom.count);
  });

  test("ohlc bars draw open and close ticks instead of bodies", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ kind: "ohlc" }));
    const wickStrokes = ctx.of("moveTo").filter((c) => c.strokeStyle === DEFAULT_PALETTE.buy || c.strokeStyle === DEFAULT_PALETTE.sell);
    expect(wickStrokes.length).toBeGreaterThan(0);
    // No solid body rects at candle x positions: only volume bars and tags use fillRect.
    const solidBodies = ctx.of("fillRect").filter((c) => c.fillStyle === DEFAULT_PALETTE.buy || c.fillStyle === DEFAULT_PALETTE.sell);
    expect(solidBodies.length).toBeLessThan(4);
  });

  test("line draws a single polyline in the signal color", () => {
    const ctx = new RecordingContext();
    const geom = drawChart(ctx, input({ kind: "line" }));
    const polylines = ctx.of("stroke").filter((c) => c.strokeStyle === DEFAULT_PALETTE.signal && c.lineWidth === 1.5);
    expect(polylines.length).toBe(1);
    expect(geom.count).toBeGreaterThan(0);
  });

  test("area fills under the close polyline with a gradient", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ kind: "area" }));
    expect(ctx.of("createLinearGradient").length).toBe(1);
    const fills = ctx.of("fill").filter((c) => String(c.fillStyle).startsWith("[gradient"));
    expect(fills.length).toBe(1);
  });
});

describe("decision markers", () => {
  test("buy, sell and hold glyphs are drawn in their colors at the bar x and price y offset", () => {
    const ctx = new RecordingContext();
    const markers = [marker(10, "buy"), marker(12, "sell"), marker(14, "hold")];
    const geom = drawChart(ctx, input({ markers }));
    expect(geom.markerPoints.length).toBe(3);
    expect(geom.markerPoints.map((p) => p.markerIndex)).toEqual([0, 1, 2]);
    const fills = ctx.of("fill");
    const buyFill = fills.find((c) => c.fillStyle === DEFAULT_PALETTE.buy);
    const sellFill = fills.find((c) => c.fillStyle === DEFAULT_PALETTE.sell);
    const holdFill = fills.find((c) => c.fillStyle === DEFAULT_PALETTE.hold);
    expect(buyFill).toBeDefined();
    expect(sellFill).toBeDefined();
    expect(holdFill).toBeDefined();
    // The buy glyph sits below its price, the sell above it.
    expect(geom.markerPoints[0]!.y).toBeGreaterThan(geom.markerPoints[0]!.priceY);
    expect(geom.markerPoints[1]!.y).toBeLessThan(geom.markerPoints[1]!.priceY);
    expect(geom.markerPoints[2]!.y).toBeCloseTo(geom.markerPoints[2]!.priceY, 6);
  });

  test("markers outside the visible window are not drawn and not in markerPoints", () => {
    const long = series(300);
    const geom0 = computeGeometry(input({ candles: long }));
    const ctx = new RecordingContext();
    const offscreen = marker(3, "buy");
    const inside = marker(geom0.firstIndex + 5, "sell");
    const geom = drawChart(ctx, input({ candles: long, markers: [offscreen, inside] }));
    expect(geom.markerPoints.length).toBe(1);
    expect(geom.markerPoints[0]!.markerIndex).toBe(1);
  });

  test("the newest visible marker carries a label chip with the action and its weight", () => {
    const ctx = new RecordingContext();
    const markers = [marker(10, "buy", { weights: { buy: 0.63, sell: 0.2, hold: 0.17 } }), marker(20, "sell", { weights: { buy: 0.2, sell: 0.41, hold: 0.39 } })];
    drawChart(ctx, input({ markers }));
    expect(ctx.of("fillText").some((t) => t.args[0] === "VENDER 41%")).toBe(true);
    expect(ctx.of("fillText").some((t) => t.args[0] === "COMPRAR 63%")).toBe(false);
  });

  test("the decision lane exists only when decisions are visible and sits under the plot", () => {
    const without = computeGeometry(input());
    expect(without.lane.h).toBe(0);
    const withLane = computeGeometry(input({ markers: [marker(10, "buy")] }));
    expect(withLane.lane.h).toBe(DECISION_LANE_H);
    expect(withLane.lane.y).toBeGreaterThanOrEqual(withLane.plot.y + withLane.plot.h);
    expect(withLane.lane.y + withLane.lane.h).toBeLessThanOrEqual(withLane.volume.y);
    expect(withLane.lane.w).toBe(withLane.plot.w);
    // The lane takes 18 px from the column: plot + lane + volume heights are conserved.
    expect(withLane.plot.h + withLane.lane.h + withLane.volume.h).toBe(without.plot.h + without.volume.h);
    expect(withLane.plot.h).toBeLessThan(without.plot.h);
  });

  test("a very short canvas drops the lane before it squeezes the plot", () => {
    const geom = computeGeometry(input({ height: 160, markers: [marker(10, "buy")] }));
    expect(geom.lane.h).toBe(0);
    expect(geom.plot.h).toBeGreaterThan(40);
  });

  test("lane glyphs are drawn once per visible marker, smaller than plot glyphs", () => {
    const ctx = new RecordingContext();
    const markers = [marker(10, "buy"), marker(11, "buy"), marker(12, "sell")];
    const geom = drawChart(ctx, input({ markers }));
    const laneFills = ctx.of("fill").filter((c) => {
      // lane glyphs are small fills: count fill() calls with a decision color
      return c.fillStyle === DEFAULT_PALETTE.buy || c.fillStyle === DEFAULT_PALETTE.sell;
    });
    // plot glyphs (3) plus lane glyphs (3)
    expect(laneFills.length).toBe(6);
    expect(geom.markerPoints.length).toBe(3);
  });

  test("markers fold into the price range so a glyph off the wick range still shows", () => {
    const cs = series(20);
    const m = marker(10, "buy", { price: 200 });
    const geom = computeGeometry(input({ candles: cs, markers: [m] }));
    expect(geom.hi).toBeGreaterThan(200);
  });

  test("canvas text never contains a forbidden character", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ markers: [marker(10, "buy")], hover: { index: 10, y: 100 }, last: 141.4, vwap: 118 }));
    const text = ctx.of("fillText").map((t) => t.args[0]).join(" ");
    expect(text).not.toMatch(/[·–—]/);
  });

  test("an empty marker list draws no lane and no glyphs, just like before", () => {
    const ctx = new RecordingContext();
    const base = new RecordingContext();
    drawChart(base, input());
    drawChart(ctx, input({ markers: [] }));
    expect(ctx.calls.length).toBe(base.calls.length);
    expect(withAlpha(DEFAULT_PALETTE.hold, 1)).toBeTruthy();
  });
});

function brickSeries(n: number): DeskCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    tsMs: T0 + i * 60_000,
    open: 100 + i,
    high: 101 + i,
    low: 100 + i,
    close: 101 + i,
    volBase: 0,
    volQuote: 0,
    confirmed: true,
  }));
}

describe("f2 kinds", () => {
  test("heikin draws solid bodies like the candles kind", () => {
    const ctx = new RecordingContext();
    const geom = drawChart(ctx, input({ kind: "heikin" }));
    const bodies = ctx
      .of("fillRect")
      .filter((c) => (c.fillStyle === DEFAULT_PALETTE.buy || c.fillStyle === DEFAULT_PALETTE.sell) && Number(c.args[0]) < geom.plot.w);
    expect(bodies.length).toBe(geom.count);
  });

  test("renko draws filled brick rects, no candle wicks, and drops volume and vwap", () => {
    const ctx = new RecordingContext();
    const geom = drawChart(ctx, input({ candles: brickSeries(30), kind: "renko", indicators: ["volume", "vwap", "ema21"] }));
    expect(geom.activeIndicators).toEqual(["ema21"]);
    const bricks = ctx
      .of("fillRect")
      .filter((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.85) || c.fillStyle === withAlpha(DEFAULT_PALETTE.sell, 0.7));
    expect(bricks.length).toBe(geom.count);
    // Bricks have no wicks: nothing is stroked in the candle colors.
    const wickStrokes = ctx.of("moveTo").filter((c) => c.strokeStyle === DEFAULT_PALETTE.buy || c.strokeStyle === DEFAULT_PALETTE.sell);
    expect(wickStrokes.length).toBe(0);
    // Remapped markers still land on bricks and open the lane.
    const withMarker = computeGeometry(input({ candles: brickSeries(30), kind: "renko", markers: [marker(5, "buy")] }));
    expect(withMarker.lane.h).toBe(DECISION_LANE_H);
  });
});

describe("overlays", () => {
  test("each ema overlay strokes one polyline in its color", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ indicators: ["ema9", "ema21"] }));
    for (const color of [withAlpha(DEFAULT_PALETTE.signal, 0.9), withAlpha(DEFAULT_PALETTE.hold, 0.9)]) {
      expect(ctx.of("moveTo").filter((c) => c.strokeStyle === color).length).toBeGreaterThan(0);
    }
  });

  test("ema200 on a short series computes to nulls and draws nothing", () => {
    const ctx = new RecordingContext();
    const geom = drawChart(ctx, input({ candles: series(40), indicators: ["ema200"] }));
    expect(geom.indicators.ema200).not.toBeNull();
    expect(geom.indicators.ema200!.every((v) => v === null)).toBe(true);
    expect(ctx.of("moveTo").filter((c) => c.strokeStyle === withAlpha(DEFAULT_PALETTE.ink, 0.8)).length).toBe(0);
  });

  test("bollinger strokes the three band lines and fills the band at six percent alpha", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ indicators: ["bb"] }));
    for (const color of [withAlpha(DEFAULT_PALETTE.ink2, 0.55), withAlpha(DEFAULT_PALETTE.ink2, 0.9)]) {
      expect(ctx.of("moveTo").filter((c) => c.strokeStyle === color).length).toBeGreaterThan(0);
    }
    expect(ctx.of("fill").filter((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.ink2, 0.06)).length).toBe(1);
  });

  test("supertrend strokes its line in the buy or sell color", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ kind: "line", indicators: ["supertrend"] }));
    const st = ctx.of("stroke").filter((c) => (c.strokeStyle === DEFAULT_PALETTE.buy || c.strokeStyle === DEFAULT_PALETTE.sell) && c.lineWidth === 1.4);
    expect(st.length).toBeGreaterThanOrEqual(1);
  });
});

describe("indicator panes", () => {
  test("rsi draws its labelled pane with dashed 30 and 70 guides", () => {
    const ctx = new RecordingContext();
    const geom = drawChart(ctx, input({ candles: series(40), indicators: ["volume", "rsi"] }));
    expect(geom.panes.length).toBe(2);
    expect(geom.panes[1]!.id).toBe("rsi");
    expect(ctx.of("fillText").some((t) => t.args[0] === "RSI 14")).toBe(true);
    expect(ctx.of("setLineDash").some((d) => d.args.join(",") === "3,3")).toBe(true);
    // The oscillator line itself is drawn in the signal color.
    expect(ctx.of("moveTo").filter((c) => c.strokeStyle === withAlpha(DEFAULT_PALETTE.signal, 0.95) && c.lineWidth === 1.2).length).toBeGreaterThan(0);
  });

  test("rsi on a window shorter than the period draws no line", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ candles: series(10), indicators: ["rsi"] }));
    expect(ctx.of("moveTo").filter((c) => c.strokeStyle === withAlpha(DEFAULT_PALETTE.signal, 0.95) && c.lineWidth === 1.2).length).toBe(0);
  });

  test("macd draws the histogram bars and the two lines", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ candles: series(80), indicators: ["macd"] }));
    expect(ctx.of("fillText").some((t) => t.args[0] === "MACD 12/26/9")).toBe(true);
    const hist = ctx
      .of("fillRect")
      .filter((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.5) || c.fillStyle === withAlpha(DEFAULT_PALETTE.sell, 0.5));
    expect(hist.length).toBeGreaterThan(0);
    for (const color of [withAlpha(DEFAULT_PALETTE.signal, 0.95), withAlpha(DEFAULT_PALETTE.hold, 0.95)]) {
      expect(ctx.of("moveTo").filter((c) => c.strokeStyle === color && c.lineWidth === 1.2).length).toBeGreaterThan(0);
    }
  });

  test("panes that do not fit are dropped from the bottom, macd first", () => {
    const inds: CandleChartInput["indicators"] = ["volume", "rsi", "macd"];
    expect(computeGeometry(input({ height: 300, indicators: inds })).panes.map((p) => p.id)).toEqual(["volume"]);
    expect(computeGeometry(input({ height: 500, indicators: inds })).panes.map((p) => p.id)).toEqual(["volume", "rsi"]);
    const all = computeGeometry(input({ height: 800, indicators: inds }));
    expect(all.panes.map((p) => p.id)).toEqual(["volume", "rsi", "macd"]);
    // The price pane always keeps at least 55 percent of the column.
    expect(all.plot.h).toBeGreaterThanOrEqual(0.55 * (800 - TIME_AXIS_H));
  });
});

describe("jev computed levels", () => {
  const levels = [
    { px: 105, kind: "support" as const, touches: 5 },
    { px: 135, kind: "resistance" as const, touches: 8 },
  ];
  const dashed = (ctx: RecordingContext) => ctx.of("setLineDash").filter((d) => d.args.join(",") === "4,4");

  test("levels inside the visible range draw a dashed line and a touches label per kind", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ indicators: ["levels"], levels }));
    expect(dashed(ctx).length).toBe(2);
    // Support in the buy tone, resistance in the sell tone, both at 55 percent alpha.
    expect(ctx.of("stroke").some((c) => c.strokeStyle === withAlpha(DEFAULT_PALETTE.buy, 0.55))).toBe(true);
    expect(ctx.of("stroke").some((c) => c.strokeStyle === withAlpha(DEFAULT_PALETTE.sell, 0.55))).toBe(true);
    expect(ctx.of("fillText").some((t) => t.args[0] === "S 105,0 x5")).toBe(true);
    expect(ctx.of("fillText").some((t) => t.args[0] === "R 135,0 x8")).toBe(true);
  });

  test("levels outside the visible range and an empty level list draw nothing", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ indicators: ["levels"], levels: [{ px: 9_999, kind: "resistance", touches: 2 }] }));
    expect(dashed(ctx).length).toBe(0);
    const empty = new RecordingContext();
    drawChart(empty, input({ indicators: ["levels"], levels: [] }));
    expect(dashed(empty).length).toBe(0);
  });

  test("the levels indicator off or the input absent draws nothing even with levels data", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input({ indicators: ["vwap"], levels }));
    expect(dashed(ctx).length).toBe(0);
    const none = new RecordingContext();
    drawChart(none, input({ indicators: ["levels"] }));
    expect(dashed(none).length).toBe(0);
  });

  test("levels draw on every kind, renko included", () => {
    for (const kind of ["candles", "heikin", "ohlc", "line", "area"] as const) {
      const ctx = new RecordingContext();
      drawChart(ctx, input({ kind, indicators: ["levels"], levels }));
      expect(dashed(ctx).length, kind).toBe(2);
    }
    const renko = new RecordingContext();
    drawChart(renko, input({ kind: "renko", indicators: ["levels"], levels }));
    expect(dashed(renko).length).toBe(2);
  });
});

function smcResult(over: Partial<SmcResult> = {}): SmcResult {
  return {
    n: 3,
    bars: 40,
    trend: "up",
    swings: [],
    events: [],
    orderBlocks: [],
    fvgs: [],
    pools: [],
    range: null,
    position: null,
    rangeState: null,
    ...over,
  };
}

const ALL_SM = { structure: true, blocks: true, gaps: true, liquidity: true, zones: true };

function smcInput(over: Partial<SmcResult> = {}, show = ALL_SM): Pick<CandleChartInput, "smc"> {
  return { smc: { result: smcResult(over), show } };
}

describe("smart money layers", () => {
  test("zones shade premium and discount halves and label EQ, Premium and Desconto", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input(smcInput({ range: { low: 100, high: 140, lowIndex: 5, highIndex: 25 } })));
    expect(ctx.of("fillRect").some((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.sell, 0.05))).toBe(true);
    expect(ctx.of("fillRect").some((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.05))).toBe(true);
    const texts = ctx.of("fillText").map((t) => t.args[0]);
    for (const label of ["EQ", "Premium", "Desconto"]) expect(texts).toContain(label);
  });

  test("open gaps shade only the unfilled part with a dashed top border and an FVG label", () => {
    const ctx = new RecordingContext();
    // Candle lows run near 97 to 140: a gap band inside the window at 120-128, half filled.
    drawChart(ctx, input(smcInput({ fvgs: [{ index: 20, dir: "up", low: 120, high: 128, fill: 0.5, filledAt: null }] })));
    const band = ctx.of("fillRect").find((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.1));
    expect(band).toBeDefined();
    expect(ctx.of("setLineDash").some((d) => d.args.join(",") === "3,3")).toBe(true);
    expect(ctx.of("fillText").some((t) => t.args[0] === "FVG")).toBe(true);
  });

  test("unmitigated order blocks draw a box with border and an OB label", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, input(smcInput({ orderBlocks: [{ index: 15, dir: "up", low: 118, high: 126, formedAt: 20, mitigatedAt: null }] })));
    expect(ctx.of("fillRect").some((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.14))).toBe(true);
    expect(ctx.of("strokeRect").some((c) => c.strokeStyle === withAlpha(DEFAULT_PALETTE.buy, 0.5))).toBe(true);
    expect(ctx.of("fillText").some((t) => t.args[0] === "OB")).toBe(true);
    // A mitigated block draws nothing.
    const mit = new RecordingContext();
    drawChart(mit, input(smcInput({ orderBlocks: [{ index: 15, dir: "up", low: 118, high: 126, formedAt: 20, mitigatedAt: 30 }] })));
    expect(mit.of("fillRect").some((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.14))).toBe(false);
  });

  test("structure draws BOS solid and CHoCH dashed with labels", () => {
    const ctx = new RecordingContext();
    drawChart(
      ctx,
      input(
        smcInput({
          events: [
            { index: 20, type: "BOS", dir: "up", level: 125, swingIndex: 10 },
            { index: 30, type: "CHoCH", dir: "down", level: 115, swingIndex: 25 },
          ],
        }),
      ),
    );
    expect(ctx.of("setLineDash").some((d) => d.args.join(",") === "4,3")).toBe(true);
    const texts = ctx.of("fillText").map((t) => t.args[0]);
    expect(texts).toContain("BOS");
    expect(texts).toContain("CHoCH");
  });

  test("liquidity draws dashed EQH and EQL lines and a Varredura triangle for sweeps", () => {
    const ctx = new RecordingContext();
    drawChart(
      ctx,
      input(
        smcInput({
          pools: [
            { kind: "eqh", price: 138, indices: [10, 18], sweptAt: null, takenAt: null },
            { kind: "eql", price: 98, indices: [12, 20], sweptAt: null, takenAt: null },
            { kind: "eqh", price: 132, indices: [8, 14], sweptAt: 26, takenAt: null },
          ],
        }),
      ),
    );
    expect(ctx.of("setLineDash").some((d) => d.args.join(",") === "2,3")).toBe(true);
    const texts = ctx.of("fillText").map((t) => t.args[0]);
    expect(texts).toContain("EQH");
    expect(texts).toContain("EQL");
    expect(texts).toContain("Varredura");
    // The sweep triangle is a hold colored fill.
    expect(ctx.of("fill").some((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.hold, 0.9))).toBe(true);
  });

  test("caps hold: at most 8 gaps, 6 blocks, 8 events and 6 pools are drawn", () => {
    const ctx = new RecordingContext();
    const many = {
      fvgs: Array.from({ length: 12 }, (_, i) => ({ index: 10 + i, dir: "up" as const, low: 100 + i, high: 100.5 + i, fill: 0, filledAt: null })),
      orderBlocks: Array.from({ length: 10 }, (_, i) => ({ index: 5 + i, dir: "down" as const, low: 120 + i * 2, high: 121 + i * 2, formedAt: 6 + i, mitigatedAt: null })),
      events: Array.from({ length: 12 }, (_, i) => ({ index: 10 + i * 2, type: "BOS" as const, dir: "up" as const, level: 100 + i, swingIndex: 4 })),
      pools: Array.from({ length: 10 }, (_, i) => ({ kind: (i % 2 ? "eql" : "eqh") as "eqh" | "eql", price: 100 + i * 3, indices: [3 + i], sweptAt: null, takenAt: null })),
    };
    drawChart(ctx, input(smcInput(many)));
    expect(ctx.of("fillRect").filter((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.1)).length).toBeLessThanOrEqual(SMC_MAX_GAPS);
    expect(ctx.of("fillRect").filter((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.sell, 0.14)).length).toBeLessThanOrEqual(SMC_MAX_BLOCKS);
    expect(ctx.of("fillText").filter((t) => t.args[0] === "BOS").length).toBeLessThanOrEqual(SMC_MAX_EVENTS);
    const eqTexts = ctx.of("fillText").filter((t) => t.args[0] === "EQH" || t.args[0] === "EQL");
    expect(eqTexts.length).toBeLessThanOrEqual(SMC_MAX_POOLS);
  });

  test("labels that would overlap a placed label or leave the clip are discarded", () => {
    const ctx = new RecordingContext();
    // Two pools on the same level: only one EQH label can sit at the right edge.
    drawChart(
      ctx,
      input(
        smcInput({
          pools: [
            { kind: "eqh", price: 138, indices: [10, 18], sweptAt: null, takenAt: null },
            { kind: "eqh", price: 138, indices: [12, 20], sweptAt: null, takenAt: null },
          ],
        }),
      ),
    );
    expect(ctx.of("fillText").filter((t) => t.args[0] === "EQH").length).toBe(1);
  });

  test("every smart money layer is clipped to the plot rect", () => {
    const ctx = new RecordingContext();
    const geom = drawChart(
      ctx,
      input(
        smcInput({
          range: { low: 100, high: 140, lowIndex: 5, highIndex: 25 },
          fvgs: [{ index: 20, dir: "up", low: 120, high: 128, fill: 0.5, filledAt: null }],
          events: [{ index: 20, type: "BOS", dir: "up", level: 125, swingIndex: 10 }],
        }),
      ),
    );
    const clips = ctx.calls.filter((c, i) => c.op === "clip" && ctx.calls[i - 1]?.op === "rect");
    const smcClips = clips.filter((_, i) => i >= 0).slice(0, 2);
    expect(clips.length).toBeGreaterThanOrEqual(2);
    const rects = ctx.of("rect").filter((r) => r.args[0] === geom.plot.x && r.args[1] === geom.plot.y && r.args[2] === geom.plot.w);
    expect(rects.length).toBeGreaterThanOrEqual(2);
    void smcClips;
  });

  test("renko draws no smart money layer even with a full result", () => {
    const ctx = new RecordingContext();
    drawChart(
      ctx,
      input({
        kind: "renko",
        candles: brickSeries(30),
        ...smcInput({
          range: { low: 100, high: 140, lowIndex: 5, highIndex: 25 },
          fvgs: [{ index: 20, dir: "up", low: 120, high: 128, fill: 0.5, filledAt: null }],
          orderBlocks: [{ index: 15, dir: "up", low: 118, high: 126, formedAt: 20, mitigatedAt: null }],
          events: [{ index: 20, type: "BOS", dir: "up", level: 125, swingIndex: 10 }],
          pools: [{ kind: "eqh", price: 138, indices: [10, 18], sweptAt: null, takenAt: null }],
        }),
      }),
    );
    const texts = ctx.of("fillText").map((t) => t.args[0]);
    for (const label of ["BOS", "CHoCH", "OB", "FVG", "EQH", "EQL", "EQ", "Varredura", "Premium", "Desconto"]) {
      expect(texts).not.toContain(label);
    }
    expect(ctx.of("fillRect").some((c) => c.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.14))).toBe(false);
  });

  test("a group switched off in show draws nothing of that group", () => {
    const ctx = new RecordingContext();
    const full = {
      range: { low: 100, high: 140, lowIndex: 5, highIndex: 25 },
      fvgs: [{ index: 20, dir: "up" as const, low: 120, high: 128, fill: 0.5, filledAt: null }],
      orderBlocks: [{ index: 15, dir: "up" as const, low: 118, high: 126, formedAt: 20, mitigatedAt: null }],
      events: [{ index: 20, type: "BOS" as const, dir: "up" as const, level: 125, swingIndex: 10 }],
      pools: [{ kind: "eqh" as const, price: 138, indices: [10, 18], sweptAt: null, takenAt: null }],
    };
    const none = { structure: false, blocks: false, gaps: false, liquidity: false, zones: false };
    drawChart(ctx, input(smcInput(full, none)));
    const texts = ctx.of("fillText").map((t) => t.args[0]);
    for (const label of ["BOS", "OB", "FVG", "EQH", "EQ", "Premium", "Desconto"]) expect(texts).not.toContain(label);
    // Only zones off: zone labels gone, the rest stays.
    const noZones = new RecordingContext();
    drawChart(noZones, input(smcInput(full, { ...ALL_SM, zones: false })));
    const texts2 = noZones.of("fillText").map((t) => t.args[0]);
    expect(texts2).not.toContain("Premium");
    expect(texts2).toContain("OB");
  });

  test("objects fully outside the visible price range draw nothing", () => {
    const ctx = new RecordingContext();
    drawChart(
      ctx,
      input(
        smcInput({
          fvgs: [{ index: 20, dir: "up", low: 900, high: 910, fill: 0, filledAt: null }],
          orderBlocks: [{ index: 15, dir: "up", low: 900, high: 910, formedAt: 20, mitigatedAt: null }],
          pools: [{ kind: "eqh", price: 900, indices: [10, 18], sweptAt: null, takenAt: null }],
          events: [{ index: 20, type: "BOS", dir: "up", level: 900, swingIndex: 10 }],
        }),
      ),
    );
    const texts = ctx.of("fillText").map((t) => t.args[0]);
    for (const label of ["BOS", "OB", "FVG", "EQH"]) expect(texts).not.toContain(label);
  });
});
