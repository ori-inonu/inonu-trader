import { describe, expect, test } from "bun:test";
import type { DeskCandle } from "../types";
import { DEFAULT_PALETTE, withAlpha } from "./canvas";
import {
  bodyWidth,
  candleX,
  type CandleChartInput,
  computeGeometry,
  drawCandleChart,
  MAX_SLOT,
  MIN_SLOT,
  niceTicks,
  RIGHT_SLOTS,
  TARGET_SLOT,
} from "./draw-candles";
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

describe("niceTicks", () => {
  test("returns round values inside the range", () => {
    const ticks = niceTicks(97, 143, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(97);
      expect(t).toBeLessThanOrEqual(143);
    }
    const steps = ticks.slice(1).map((t, i) => Number((t - ticks[i]).toPrecision(8)));
    expect(new Set(steps).size).toBe(1);
  });

  test("handles tiny prices without float noise", () => {
    const ticks = niceTicks(0.000012, 0.000018, 4);
    expect(ticks.length).toBeGreaterThan(1);
    for (const t of ticks) expect(String(t)).not.toMatch(/0000000\d/);
  });

  test("degenerate ranges return nothing", () => {
    expect(niceTicks(5, 5, 4)).toEqual([]);
    expect(niceTicks(5, 4, 4)).toEqual([]);
    expect(niceTicks(1, 2, 0)).toEqual([]);
  });
});

describe("candle geometry", () => {
  test("price maps to y with the high at the top of the padded range and the low at the bottom", () => {
    const g = computeGeometry(input());
    expect(g.yPrice(g.hi)).toBeCloseTo(g.plot.y, 6);
    expect(g.yPrice(g.lo)).toBeCloseTo(g.plot.y + g.plot.h, 6);
    expect(g.yPrice((g.hi + g.lo) / 2)).toBeCloseTo(g.plot.y + g.plot.h / 2, 6);
    // Higher price is higher on screen.
    expect(g.yPrice(120)).toBeLessThan(g.yPrice(110));
  });

  test("priceAt inverts yPrice", () => {
    const g = computeGeometry(input());
    for (const px of [101, 117.5, 130]) expect(g.priceAt(g.yPrice(px))).toBeCloseTo(px, 8);
  });

  test("the range covers every visible high and low with padding", () => {
    const c = series(40);
    const g = computeGeometry(input({ candles: c }));
    const lo = Math.min(...c.map((x) => x.low));
    const hi = Math.max(...c.map((x) => x.high));
    expect(g.lo).toBeLessThan(lo);
    expect(g.hi).toBeGreaterThan(hi);
  });

  test("the last price is inside the range even when it is outside the candles", () => {
    const g = computeGeometry(input({ last: 500 }));
    expect(g.hi).toBeGreaterThan(500);
  });

  test("vwap far outside the range is not drawn and does not distort the scale", () => {
    const base = computeGeometry(input());
    const far = computeGeometry(input({ vwap: 9_999 }));
    expect(far.vwapVisible).toBe(false);
    expect(far.hi).toBeCloseTo(base.hi, 6);
    const near = computeGeometry(input({ vwap: 125 }));
    expect(near.vwapVisible).toBe(true);
  });

  test("a flat series still has a drawable range", () => {
    const flat = Array.from({ length: 10 }, (_, i) =>
      candle(i, { open: 50, high: 50, low: 50, close: 50 }),
    );
    const g = computeGeometry(input({ candles: flat }));
    expect(g.hi).toBeGreaterThan(g.lo);
    expect(Number.isFinite(g.yPrice(50))).toBe(true);
  });

  test("slots hold the target width when the series is long and the newest candle sits at the right", () => {
    const long = series(500);
    const g = computeGeometry(input({ candles: long }));
    expect(g.slot).toBeGreaterThanOrEqual(MIN_SLOT);
    expect(g.slot).toBeLessThanOrEqual(MAX_SLOT);
    expect(g.count).toBe(Math.floor(g.plot.w / TARGET_SLOT) - RIGHT_SLOTS);
    expect(g.firstIndex).toBe(500 - g.count);
    const newest = g.xCenter(g.count - 1);
    expect(newest).toBeCloseTo(g.plot.w - (RIGHT_SLOTS + 0.5) * g.slot, 6);
    expect(g.xCenter(0)).toBeGreaterThan(0);
  });

  test("a short series is capped at the maximum slot and stays right aligned", () => {
    const g = computeGeometry(input({ candles: series(5) }));
    expect(g.count).toBe(5);
    expect(g.slot).toBe(MAX_SLOT);
    expect(g.xCenter(0)).toBeGreaterThan(g.plot.w / 2);
    expect(g.xCenter(4) + g.slot / 2).toBeLessThanOrEqual(g.plot.w);
  });

  test("body width is odd, at least one, and under the slot", () => {
    for (const slot of [3, 4, 5, 7, 9, 12, 16]) {
      const w = bodyWidth(slot);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThan(slot);
      if (w > 1) expect(w % 2).toBe(1);
    }
    expect(bodyWidth(7)).toBe(3);
    expect(bodyWidth(16)).toBe(11);
  });

  test("plot, volume, axis and time axis tile the canvas without overlap", () => {
    const g = computeGeometry(input());
    expect(g.volume.h).toBeGreaterThan(0);
    expect(g.volume.y).toBeGreaterThanOrEqual(g.plot.y + g.plot.h);
    expect(g.volume.y + g.volume.h).toBeLessThanOrEqual(g.timeAxis.y);
    expect(g.axis.x).toBeCloseTo(g.plot.w, 6);
    expect(g.axis.x + g.axis.w).toBeCloseTo(600, 6);
    expect(g.timeAxis.y + g.timeAxis.h).toBeCloseTo(360, 6);
  });

  test("a very short canvas drops the volume band instead of squeezing it", () => {
    const g = computeGeometry(input({ height: 110 }));
    expect(g.volume.h).toBe(0);
    expect(g.plot.h).toBeGreaterThan(40);
  });

  test("indexAt picks the candle under the pointer and clamps at both ends", () => {
    const g = computeGeometry(input());
    for (const k of [0, 7, g.count - 1]) {
      expect(g.indexAt(g.xCenter(k))).toBe(g.firstIndex + k);
      expect(g.indexAt(g.xCenter(k) + g.slot * 0.4)).toBe(g.firstIndex + k);
    }
    expect(g.indexAt(-50)).toBe(g.firstIndex);
    expect(g.indexAt(10_000)).toBe(g.firstIndex + g.count - 1);
    expect(computeGeometry(input({ candles: [] })).indexAt(10)).toBeNull();
  });

  test("a wider price label widens the axis", () => {
    const narrow = computeGeometry(input({ decimals: 0, candles: series(10) }));
    const wide = computeGeometry(input({ decimals: 6, candles: series(10) }));
    expect(wide.axis.w).toBeGreaterThan(narrow.axis.w);
  });
});

describe("drawCandleChart", () => {
  test("draws one wick and one body per visible candle and no more", () => {
    const ctx = new RecordingContext();
    const geom = drawCandleChart(ctx, input({ candles: series(30) }));
    const wicks = ctx.of("moveTo").filter((c) => c.strokeStyle === DEFAULT_PALETTE.buy || c.strokeStyle === DEFAULT_PALETTE.sell);
    expect(wicks.length).toBe(geom.count);
    const bodies = ctx
      .of("fillRect")
      .filter((c) => c.fillStyle === DEFAULT_PALETTE.buy || c.fillStyle === DEFAULT_PALETTE.sell);
    // bodies are solid for confirmed candles, plus the two price tags that use the same solid colors
    expect(bodies.length).toBeGreaterThanOrEqual(geom.count);
  });

  test("candle bodies sit at the mapped open and close", () => {
    const ctx = new RecordingContext();
    const c = series(12);
    const geom = drawCandleChart(ctx, input({ candles: c, dpr: 1 }));
    const k = 5;
    const cd = c[geom.firstIndex + k];
    const expectedTop = Math.min(geom.yPrice(cd.open), geom.yPrice(cd.close));
    const expectedH = Math.max(1, Math.abs(geom.yPrice(cd.close) - geom.yPrice(cd.open)));
    const x = candleX(geom, k, 1).left;
    const hit = ctx
      .of("fillRect")
      .find((r) => r.args[0] === x && r.args[2] === geom.body && Math.abs((r.args[1] as number) - expectedTop) <= 0.5);
    expect(hit).toBeDefined();
    expect(Math.abs((hit!.args[3] as number) - expectedH)).toBeLessThan(0.01);
  });

  test("up candles use the buy color and down candles the sell color", () => {
    const ctx = new RecordingContext();
    const c = [candle(0, { open: 100, close: 105, high: 106, low: 99 }), candle(1, { open: 105, close: 101, high: 106, low: 100 })];
    const geom = drawCandleChart(ctx, input({ candles: c }));
    const first = 0;
    const second = 1;
    const bodyAt = (cx: number) =>
      ctx.of("fillRect").find((r) => r.args[0] === candleX(geom, cx, 1).left && r.args[2] === geom.body && (r.args[3] as number) > 1 && (r.args[1] as number) < geom.volume.y);
    expect(bodyAt(first)?.fillStyle).toBe(DEFAULT_PALETTE.buy);
    expect(bodyAt(second)?.fillStyle).toBe(DEFAULT_PALETTE.sell);
  });

  test("the forming candle is hollow: outlined with a faint fill instead of a solid body", () => {
    const ctx = new RecordingContext();
    const c = series(10);
    c[9] = candle(9, { confirmed: false, open: 100, close: 108, high: 109, low: 99 });
    const geom = drawCandleChart(ctx, input({ candles: c }));
    const x = candleX(geom, geom.count - 1, 1).left;
    const outline = ctx.of("strokeRect").filter((r) => (r.args[0] as number) === x + 0.5);
    expect(outline.length).toBeGreaterThanOrEqual(1);
    const faint = ctx.of("fillRect").find((r) => r.args[0] === x && r.fillStyle === withAlpha(DEFAULT_PALETTE.buy, 0.2));
    expect(faint).toBeDefined();
    // And confirmed candles get no outline rect.
    const earlier = candleX(geom, 2, 1).left;
    expect(ctx.of("strokeRect").some((r) => r.args[0] === earlier + 0.5)).toBe(false);
  });

  test("volume bars scale to the visible maximum and never exceed the band", () => {
    const ctx = new RecordingContext();
    const c = series(20);
    const geom = drawCandleChart(ctx, input({ candles: c }));
    const bars = ctx
      .of("fillRect")
      .filter((r) => (r.args[1] as number) >= geom.volume.y - 0.01 && (r.args[1] as number) < geom.timeAxis.y && r.fillStyle.startsWith("rgba"));
    expect(bars.length).toBe(geom.count);
    const heights = bars.map((b) => b.args[3] as number);
    expect(Math.max(...heights)).toBeCloseTo(geom.volume.h, 6);
    for (const b of bars) {
      expect((b.args[1] as number) + (b.args[3] as number)).toBeCloseTo(geom.volume.y + geom.volume.h, 6);
    }
  });

  test("draws the last price tag on the right axis at the mapped y", () => {
    const ctx = new RecordingContext();
    const geom = drawCandleChart(ctx, input({ last: 141.4 }));
    const tag = ctx.of("fillRect").find((r) => r.args[0] === geom.axis.x && r.args[2] === geom.axis.w && r.fillStyle === DEFAULT_PALETTE.buy);
    expect(tag).toBeDefined();
    const mid = (tag!.args[1] as number) + (tag!.args[3] as number) / 2;
    expect(mid).toBeCloseTo(geom.yPrice(141.4), 0);
    expect(ctx.of("fillText").some((t) => t.args[0] === "141,4")).toBe(true);
  });

  test("the last price line is dashed and the vwap line is solid", () => {
    const ctx = new RecordingContext();
    drawCandleChart(ctx, input({ last: 141.4, vwap: 118 }));
    const dashedStrokes = ctx.of("stroke").filter((s) => s.dash.length > 0);
    expect(dashedStrokes.length).toBeGreaterThanOrEqual(1);
    const vwapStroke = ctx.of("stroke").find((s) => s.strokeStyle === withAlpha(DEFAULT_PALETTE.signal, 0.85));
    expect(vwapStroke).toBeDefined();
    expect(vwapStroke!.dash.length).toBe(0);
  });

  test("hover draws a crosshair at the candle and a price tag, and none without hover", () => {
    const without = new RecordingContext();
    const geom0 = drawCandleChart(without, input());
    const withHover = new RecordingContext();
    const k = 10;
    const geom = drawCandleChart(withHover, input({ hover: { index: geom0.firstIndex + k, y: 120 } }));
    expect(withHover.calls.length).toBeGreaterThan(without.calls.length);
    const cross = withHover.of("moveTo").find((m) => m.args[1] === geom.plot.y && Math.abs((m.args[0] as number) - geom.xCenter(k)) < 1);
    expect(cross).toBeDefined();
    // The hover price tag uses the edge-strong fill.
    expect(withHover.of("fillRect").some((r) => r.fillStyle === DEFAULT_PALETTE.edgeStrong)).toBe(true);
    expect(without.of("fillRect").some((r) => r.fillStyle === DEFAULT_PALETTE.edgeStrong)).toBe(false);
  });

  test("a hover index outside the visible window draws no crosshair", () => {
    const ctx = new RecordingContext();
    const baseline = new RecordingContext();
    const long = series(500);
    drawCandleChart(baseline, input({ candles: long }));
    drawCandleChart(ctx, input({ candles: long, hover: { index: 0, y: 100 } }));
    expect(ctx.calls.length).toBe(baseline.calls.length);
  });

  test("snaps wicks to device pixels at dpr 2", () => {
    const ctx = new RecordingContext();
    drawCandleChart(ctx, input({ dpr: 2, candles: series(20) }));
    const wickXs = ctx
      .of("moveTo")
      .filter((c) => c.strokeStyle === DEFAULT_PALETTE.buy || c.strokeStyle === DEFAULT_PALETTE.sell)
      .map((c) => c.args[0] as number);
    expect(wickXs.length).toBeGreaterThan(0);
    for (const x of wickXs) expect((x * 2) % 1).toBeCloseTo(0, 6);
  });

  test("an empty series clears the canvas and draws nothing else", () => {
    const ctx = new RecordingContext();
    const geom = drawCandleChart(ctx, input({ candles: [] }));
    expect(geom.count).toBe(0);
    expect(ctx.of("clearRect").length).toBe(1);
    expect(ctx.of("fillRect").length).toBe(0);
    expect(ctx.of("fillText").length).toBe(0);
  });

  test("never writes a forbidden character to the canvas", () => {
    const ctx = new RecordingContext();
    drawCandleChart(ctx, input({ last: 141.4, vwap: 118, hover: { index: 30, y: 130 }, candles: series(60) }));
    const text = ctx.of("fillText").map((t) => t.args[0]).join(" ");
    expect(text).not.toContain("\u00b7");
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("\u2013");
  });

  test("time labels are clock times for intraday bars and dates for daily bars", () => {
    const intraday = new RecordingContext();
    drawCandleChart(intraday, input({ bar: "5m" }));
    expect(intraday.of("fillText").some((t) => /^\d\d:\d\d$/.test(String(t.args[0])))).toBe(true);
    const daily = new RecordingContext();
    drawCandleChart(daily, input({ bar: "1D" }));
    expect(daily.of("fillText").some((t) => /^\d\d\/\d\d$/.test(String(t.args[0])))).toBe(true);
  });
});
