import { describe, expect, test } from "bun:test";
import type { DeskLiquiditySlice } from "../types";
import { DEFAULT_PALETTE, withAlpha } from "./canvas";
import {
  binKnown,
  binSide,
  DEPTH_WINDOW_S,
  drawLiquiditySurface,
  farEdgeBps,
  halfSpanLabel,
  type LiquidityInput,
  layoutSlices,
  makeProjection,
  maxDepthOf,
  sideTotals,
  sliceFade,
  viewWindow,
} from "./draw-liquidity";
import { RecordingContext } from "./recording-context";

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);

function slice(ageS: number, bins: number[] = [1, 2, 3, 4, 3, 2, 1], midPx = 100): DeskLiquiditySlice {
  return { tsMs: NOW - ageS * 1000, bins, midPx };
}

function input(slices: DeskLiquiditySlice[], over: Partial<LiquidityInput> = {}): LiquidityInput {
  return {
    width: 640,
    height: 360,
    slices,
    nowMs: NOW,
    midPx: 100,
    midDecimals: 1,
    palette: DEFAULT_PALETTE,
    font: '10.5px "Geist Mono", monospace',
    ...over,
  };
}

describe("isometric projection", () => {
  test("price runs right, depth recedes up and right, height rises", () => {
    const p = makeProjection(640, 360);
    const origin = p.project(0, 0, 0);
    expect(p.project(1, 0, 0).x).toBeGreaterThan(origin.x);
    const back = p.project(0, 1, 0);
    expect(back.y).toBeLessThan(origin.y);
    expect(back.x).toBeGreaterThan(origin.x);
    expect(p.project(0, 0, 1).y).toBeLessThan(origin.y);
    expect(p.project(0, 0, 1).x).toBeCloseTo(origin.x, 8);
  });

  test("the projection is linear in each axis", () => {
    const p = makeProjection(640, 360);
    const a = p.project(0, 0, 0);
    const b = p.project(0.5, 0, 0);
    const c = p.project(1, 0, 0);
    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 8);
    expect(b.y - a.y).toBeCloseTo(c.y - b.y, 8);
    const h0 = p.project(0.3, 0.4, 0);
    const h1 = p.project(0.3, 0.4, 1);
    expect(h0.y - h1.y).toBeCloseTo(p.wallPx, 8);
  });

  test("the whole scene, tallest wall included, stays inside the canvas", () => {
    for (const [w, h] of [[640, 360], [300, 220], [900, 300], [460, 380]] as const) {
      const p = makeProjection(w, h);
      const pts = [
        p.project(0, 0, 0), p.project(1, 0, 0), p.project(0, 1, 0), p.project(1, 1, 0),
        p.project(0, 1, 1), p.project(1, 1, 1), p.project(0, 0, 1), p.project(1, 0, 1),
      ];
      for (const pt of pts) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(w);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(h);
      }
    }
  });

  test("scale follows the canvas", () => {
    expect(makeProjection(900, 500).scale).toBeGreaterThan(makeProjection(400, 220).scale);
  });
});

describe("slices and the painter's order", () => {
  test("layoutSlices orders oldest first so the newest paints last", () => {
    const views = layoutSlices([slice(5), slice(60), slice(0), slice(30)], NOW);
    expect(views.map((v) => Math.round(v.v * DEPTH_WINDOW_S))).toEqual([60, 30, 5, 0]);
    for (let i = 1; i < views.length; i += 1) expect(views[i].v).toBeLessThanOrEqual(views[i - 1].v);
  });

  test("slices past the window and slices with fewer than two bins are dropped", () => {
    const views = layoutSlices([slice(10), slice(DEPTH_WINDOW_S + 1), slice(5, [4]), slice(5, [])], NOW);
    expect(views.length).toBe(1);
    expect(views[0].slice.tsMs).toBe(NOW - 10_000);
  });

  test("a slice newer than the reference clamps to the front", () => {
    const views = layoutSlices([slice(-3)], NOW);
    expect(views[0].v).toBe(0);
  });

  test("fade is 1 at the front and a faint trace at the back, and never rises with age", () => {
    expect(sliceFade(0)).toBe(1);
    expect(sliceFade(1)).toBeGreaterThan(0.05);
    expect(sliceFade(1)).toBeLessThan(0.2);
    let previous = 1;
    for (let v = 0.05; v <= 1; v += 0.05) {
      const f = sliceFade(v);
      expect(f).toBeLessThanOrEqual(previous);
      previous = f;
    }
  });

  test("the opaque base fill of each slice is drawn back to front (baselines move down the screen)", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0), slice(45), slice(20), slice(80)]));
    const well = DEFAULT_PALETTE.well;
    const baselineYs: number[] = [];
    ctx.calls.forEach((call, i) => {
      if (call.op === "fill" && call.fillStyle === well) {
        // walk back to the moveTo that opened this path
        for (let j = i - 1; j >= 0; j -= 1) {
          if (ctx.calls[j].op === "moveTo") {
            baselineYs.push(ctx.calls[j].args[1] as number);
            break;
          }
        }
      }
    });
    expect(baselineYs.length).toBe(4);
    for (let i = 1; i < baselineYs.length; i += 1) expect(baselineYs[i]).toBeGreaterThan(baselineYs[i - 1]);
  });

  test("the newest slice is stroked last and thickest", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0), slice(40)]));
    const strokes = ctx.of("stroke").filter((s) => s.strokeStyle.startsWith("rgba(61,220,151") || s.strokeStyle.startsWith("rgba(255,107,129"));
    const widths = strokes.map((s) => s.lineWidth);
    expect(Math.max(...widths)).toBeGreaterThan(1.5);
    expect(widths[widths.length - 1]).toBeGreaterThan(1.5);
    expect(widths[0]).toBe(1);
  });
});

describe("bins and sides", () => {
  test("lower half is bid, upper half is ask, an odd middle bin is the mid", () => {
    expect([0, 1, 2, 3].map((i) => binSide(i, 4))).toEqual(["bid", "bid", "ask", "ask"]);
    expect([0, 1, 2, 3, 4].map((i) => binSide(i, 5))).toEqual(["bid", "bid", "mid", "ask", "ask"]);
    expect(binSide(0, 2)).toBe("bid");
    expect(binSide(1, 2)).toBe("ask");
  });

  test("sideTotals sums each half and leaves the middle bin out", () => {
    const totals = sideTotals(slice(0, [1, 2, 10, 3, 4]));
    expect(totals).toEqual({ bid: 3, ask: 7 });
    expect(sideTotals(slice(0, [1, 2, 3, 4]))).toEqual({ bid: 3, ask: 7 });
  });

  test("maxDepthOf looks across every drawn slice and ignores junk values", () => {
    const views = layoutSlices([slice(0, [1, 2, Number.NaN]), slice(10, [9, 1, 1])], NOW);
    expect(maxDepthOf(views)).toBe(9);
  });

  test("a slice's tallest wall reaches the scale height at the front", () => {
    const ctx = new RecordingContext();
    const stats = drawLiquiditySurface(ctx, input([slice(0, [0, 0, 8, 0, 0])]));
    const top = stats.projection.project(0.5, 0, 1);
    const hit = ctx.calls.some((c) => (c.op === "lineTo" || c.op === "moveTo" || c.op === "quadraticCurveTo") && Math.abs((c.args[c.args.length - 1] as number) - top.y) < 1e-6);
    expect(hit).toBe(true);
  });
});

describe("drawLiquiditySurface", () => {
  test("bids are green, asks are red and the mid line is the signal color", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0), slice(30)]));
    const fills = new Set(ctx.of("fill").map((f) => f.fillStyle));
    expect([...fills].some((s) => s.startsWith("rgba(61,220,151"))).toBe(true);
    expect([...fills].some((s) => s.startsWith("rgba(255,107,129"))).toBe(true);
    const mid = ctx.of("stroke").filter((s) => s.strokeStyle === withAlpha(DEFAULT_PALETTE.signal, 0.85));
    expect(mid.length).toBe(1);
  });

  test("labels the sides, the mid price, the time axis and the height scale", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0, [1, 2, 3, 4, 3, 2, 1_500_000])], { midPx: 67432.1 }));
    const texts = ctx.of("fillText").map((t) => String(t.args[0]));
    expect(texts).toContain("Compra -60 bps");
    expect(texts).toContain("+60 bps Venda");
    expect(texts).toContain("67.432,1");
    expect(texts).toContain("agora");
    expect(texts).toContain(`-${DEPTH_WINDOW_S} s`);
    expect(texts).toContain("1,5 mi");
  });

  test("with no slices it clears and draws the floor only", () => {
    const ctx = new RecordingContext();
    const stats = drawLiquiditySurface(ctx, input([]));
    expect(stats.drawn).toBe(0);
    expect(stats.maxDepth).toBe(0);
    expect(ctx.of("clearRect").length).toBe(1);
    expect(ctx.of("quadraticCurveTo").length).toBe(0);
  });

  test("an unknown mid price prints no mid label", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0)], { midPx: null }));
    const centered = ctx.of("fillText").filter((t) => t.args[0] !== "Compra" && t.args[0] !== "Venda" && /\d,\d$/.test(String(t.args[0])));
    expect(centered.length).toBe(0);
  });

  test("saves and restores the context symmetrically", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0), slice(10)]));
    expect(ctx.of("save").length).toBe(ctx.of("restore").length);
  });

  test("never writes a forbidden character to the canvas", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0), slice(10)]));
    const text = ctx.of("fillText").map((t) => t.args[0]).join(" ");
    expect(text).not.toContain("\u00b7");
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("\u2013");
  });

  test("every coordinate it emits is finite", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([slice(0, [0, 0, 0, 0]), slice(10, [5, Number.NaN, 2, 1])]));
    for (const c of ctx.calls) for (const a of c.args) if (typeof a === "number") expect(Number.isFinite(a)).toBe(true);
  });
});

/** A slice laid out as the data layer documents it: 60 bins of 2 bps over mid +/- 60 bps. */
function wide(ageS: number, reachBid?: number, reachAsk?: number): DeskLiquiditySlice {
  const bins = Array.from({ length: 60 }, (_, i) => 100 + Math.abs(i - 29.5) * 10);
  return { tsMs: NOW - ageS * 1000, bins, midPx: 100, reachBidBps: reachBid, reachAskBps: reachAsk };
}

describe("book reach: unknown is not empty", () => {
  test("bin edges are measured from mid in bps", () => {
    expect(farEdgeBps(29, 60)).toBeCloseTo(2, 8);
    expect(farEdgeBps(0, 60)).toBeCloseTo(60, 8);
    expect(farEdgeBps(30, 60)).toBeCloseTo(2, 8);
    expect(farEdgeBps(59, 60)).toBeCloseTo(60, 8);
    // odd count: the middle bin straddles mid and is half a bin from it
    expect(farEdgeBps(3, 7)).toBeCloseTo(60 / 7, 8);
    expect(farEdgeBps(0, 7)).toBeCloseTo(60, 8);
  });

  test("a bin is known only when the reach covers all of it, per side", () => {
    const s = wide(0, 14, 30);
    expect(binKnown(s, 29)).toBe(true);
    expect(binKnown(s, 29 - 6)).toBe(true); // far edge 14 bps
    expect(binKnown(s, 29 - 7)).toBe(false); // far edge 16 bps
    expect(binKnown(s, 30 + 14)).toBe(true); // far edge 30 bps
    expect(binKnown(s, 30 + 15)).toBe(false);
    expect(binKnown(wide(0), 0)).toBe(true);
  });

  test("the window crops to the smaller reach and stays symmetric", () => {
    const full = viewWindow(wide(0));
    expect(full).toEqual({ first: 0, end: 60, halfBps: 60, limited: false });
    const cropped = viewWindow(wide(0, 14, 40));
    expect(cropped.first).toBe(23);
    expect(cropped.end).toBe(37);
    expect(cropped.halfBps).toBeCloseTo(14, 8);
    expect(cropped.limited).toBe(true);
    expect(cropped.first + cropped.end).toBe(60);
  });

  test("a tiny reach never collapses the window below two bins a side", () => {
    const w = viewWindow(wide(0, 0.5, 0.5));
    expect(w.end - w.first).toBe(4);
  });

  test("an odd bin count keeps the middle bin inside the window", () => {
    const w = viewWindow({ tsMs: NOW, bins: [1, 2, 3, 4, 5, 6, 7], midPx: 100, reachBidBps: 20, reachAskBps: 20 });
    // the middle bin plus the two bins a side that are always kept
    expect(w.end - w.first).toBe(5);
    expect(w.first).toBe(1);
    expect(w.end).toBe(6);
    expect(w.first + w.end).toBe(7);
  });

  test("depth totals and the height scale ignore unknown bins", () => {
    const s = wide(0, 10, 10);
    const totals = sideTotals(s);
    const fullTotals = sideTotals(wide(0));
    expect(totals.bid).toBeLessThan(fullTotals.bid);
    expect(totals.ask).toBeLessThan(fullTotals.ask);
    const views = layoutSlices([s], NOW);
    const win = viewWindow(s);
    expect(maxDepthOf(views, win)).toBeLessThan(maxDepthOf(layoutSlices([wide(0)], NOW)));
  });

  test("slices laid out with a different bin count than the newest are dropped", () => {
    const views = layoutSlices([wide(5), { tsMs: NOW - 8000, bins: [1, 2, 3, 4], midPx: 100 }, wide(0)], NOW);
    expect(views.length).toBe(2);
    for (const v of views) expect(v.slice.bins.length).toBe(60);
  });

  test("an older slice with a shorter reach draws its unknown stretch dotted and grey, never as a side colored wall", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([wide(40, 8, 8), wide(0, 20, 20)], { width: 800, height: 400 }));
    const dotted = ctx.of("stroke").filter((s) => s.dash.length > 0 && s.strokeStyle.startsWith("rgba(127,149,172"));
    expect(dotted.length).toBeGreaterThan(0);
    // The front slice is known across the whole cropped window: it has no dotted stretch of its own.
    const solid = ctx.of("stroke").filter((s) => s.lineWidth > 1.5);
    expect(solid.length).toBe(2);
  });

  test("the front slice reports the cropped window and labels it in bps", () => {
    const ctx = new RecordingContext();
    const stats = drawLiquiditySurface(ctx, input([wide(30), wide(0, 14, 14)], { width: 800, height: 400 }));
    expect(stats.window?.halfBps).toBeCloseTo(14, 8);
    const texts = ctx.of("fillText").map((t) => String(t.args[0]));
    expect(texts).toContain("Compra -14 bps");
    expect(texts).toContain("+14 bps Venda");
  });

  test("a narrow canvas drops the bps from the side words", () => {
    const ctx = new RecordingContext();
    drawLiquiditySurface(ctx, input([wide(0, 14, 14)], { width: 300, height: 260 }));
    const texts = ctx.of("fillText").map((t) => String(t.args[0]));
    expect(texts).toContain("Compra");
    expect(texts).toContain("Venda");
  });

  test("half span label prints whole numbers plainly and fractions in pt-BR", () => {
    expect(halfSpanLabel(14)).toBe("14 bps");
    expect(halfSpanLabel(8.5)).toBe("8,5 bps");
  });
});
