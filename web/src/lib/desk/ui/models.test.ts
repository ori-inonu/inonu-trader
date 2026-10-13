import { describe, expect, test } from "bun:test";
import type { DeskBook, DeskTrade } from "../types";
import {
  buildLadder,
  heatAlpha,
  LADDER_COLUMNS_H,
  LADDER_IMBALANCE_H,
  LADDER_ROW_H,
  LADDER_SPREAD_H,
  rowsPerSide,
  topOfBook,
} from "./book-model";
import { DEFAULT_PALETTE, readPalette, snap, snapLine, withAlpha } from "./canvas";
import { arcPath, clampImbalance, flowWord, imbalanceAngle, polar, tickPath, valueArc } from "./gauge";
import { derivativesLayout, INLINE_BELOW, NOTE_ROOM } from "./derivatives-layout";
import { flowLayout, WATCH_HEADER_H, WATCH_MIN_ROW_H, watchlistLayout } from "./right-wing-layout";
import { cumulative, sparkArea, sparkPath, sparkPoints, sparkZeroY } from "./spark";
import { buildTape, flagLargePrints, median, TAPE_HEADER_H, TAPE_ROW_H, tapeRowCount } from "./tape-model";

function book(over: Partial<DeskBook> = {}): DeskBook {
  return {
    instId: "BTC-USDT",
    bids: [
      { px: 100, sz: 1, orders: 1 },
      { px: 99.9, sz: 4, orders: 2 },
      { px: 99.8, sz: 2, orders: 1 },
    ],
    asks: [
      { px: 100.1, sz: 2, orders: 1 },
      { px: 100.2, sz: 8, orders: 3 },
      { px: 100.3, sz: 1, orders: 1 },
    ],
    tsMs: 0,
    seqId: 1,
    checksumOk: null,
    ...over,
  };
}

describe("ladder model", () => {
  test("rows per side follow the height and never drop below one", () => {
    const fixed = LADDER_IMBALANCE_H + LADDER_COLUMNS_H + LADDER_SPREAD_H;
    expect(rowsPerSide(fixed + LADDER_ROW_H * 2 * 6)).toBe(6);
    expect(rowsPerSide(fixed + LADDER_ROW_H * 2 * 6 + LADDER_ROW_H)).toBe(6);
    expect(rowsPerSide(fixed - 10)).toBe(1);
    expect(rowsPerSide(0)).toBe(1);
    expect(rowsPerSide(Number.NaN)).toBe(1);
    expect(rowsPerSide(5000)).toBe(40);
    expect(rowsPerSide(5000, LADDER_ROW_H, 12)).toBe(12);
  });

  test("builds both sides best first with running totals and ratios against the visible max", () => {
    const m = buildLadder(book(), 3);
    expect(m.maxSz).toBe(8);
    expect(m.bestBid).toBe(100);
    expect(m.bestAsk).toBe(100.1);
    expect(m.bids.map((r) => r.px)).toEqual([100, 99.9, 99.8]);
    expect(m.asks.map((r) => r.px)).toEqual([100.1, 100.2, 100.3]);
    expect(m.bids.map((r) => r.cum)).toEqual([1, 5, 7]);
    expect(m.asks.map((r) => r.cum)).toEqual([2, 10, 11]);
    expect(m.asks[1].ratio).toBe(1);
    expect(m.bids[0].ratio).toBeCloseTo(0.125, 10);
  });

  test("the visible max only counts the levels that are shown", () => {
    const m = buildLadder(book(), 1);
    expect(m.maxSz).toBe(2);
    expect(m.asks.length).toBe(1);
    expect(m.bids.length).toBe(1);
    expect(m.asks[0].ratio).toBe(1);
  });

  test("heat alpha rises with size and stays inside a quiet and a loud bound", () => {
    expect(heatAlpha(0)).toBeCloseTo(0.08, 6);
    expect(heatAlpha(1)).toBeCloseTo(0.44, 6);
    expect(heatAlpha(0.5)).toBeGreaterThan(heatAlpha(0.2));
    expect(heatAlpha(-1)).toBe(heatAlpha(0));
    expect(heatAlpha(5)).toBe(heatAlpha(1));
  });

  test("a missing book or one side gives an empty, safe model", () => {
    const empty = buildLadder(null, 5);
    expect(empty.asks).toEqual([]);
    expect(empty.bestBid).toBeNull();
    const oneSided = buildLadder(book({ asks: [] }), 5);
    expect(oneSided.asks).toEqual([]);
    expect(oneSided.bids.length).toBe(3);
    expect(oneSided.bestAsk).toBeNull();
  });

  test("non finite levels are skipped instead of drawn", () => {
    const m = buildLadder(book({ bids: [{ px: Number.NaN, sz: 1, orders: 0 }, { px: 99, sz: 2, orders: 0 }] }), 5);
    expect(m.bids.map((r) => r.px)).toEqual([99]);
  });

  test("top of book gives mid and spread in bps, null without both sides", () => {
    const t = topOfBook(book());
    expect(t?.mid).toBeCloseTo(100.05, 8);
    expect(t?.spreadBps).toBeCloseTo((0.1 / 100.05) * 10_000, 6);
    expect(topOfBook(book({ asks: [] }))).toBeNull();
    expect(topOfBook(null)).toBeNull();
  });
});

function trade(id: string, sz: number): DeskTrade {
  return { id, px: 100, sz, side: "buy", tsMs: 0 };
}

describe("tape model", () => {
  test("median handles odd, even, empty and junk", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([Number.NaN, 5])).toBe(5);
  });

  test("a print is large above three times the median of the window", () => {
    const sizes = [1, 1, 1, 1, 1, 1, 3, 3.01, 10];
    const flags = flagLargePrints(sizes);
    expect(flags).toEqual([false, false, false, false, false, false, false, true, true]);
  });

  test("small samples flag nothing", () => {
    expect(flagLargePrints([1, 1, 50])).toEqual([false, false, false]);
    expect(flagLargePrints([])).toEqual([]);
  });

  test("a zero median flags nothing instead of flagging everything", () => {
    expect(flagLargePrints([0, 0, 0, 0, 0, 7])).toEqual([false, false, false, false, false, false]);
  });

  test("row count follows the height", () => {
    expect(tapeRowCount(TAPE_HEADER_H + TAPE_ROW_H * 10)).toBe(10);
    expect(tapeRowCount(TAPE_HEADER_H + TAPE_ROW_H * 10 + 5)).toBe(10);
    expect(tapeRowCount(0)).toBe(1);
    expect(tapeRowCount(100_000)).toBe(200);
  });

  test("buildTape keeps the newest first, caps the count and drops replayed ids", () => {
    const trades = [trade("5", 1), trade("4", 1), trade("4", 1), trade("3", 1), trade("2", 1), trade("1", 1)];
    const rows = buildTape(trades, 4);
    expect(rows.map((r) => r.trade.id)).toEqual(["5", "4", "3", "2"]);
  });

  test("buildTape flags against the visible window only", () => {
    const trades = [trade("a", 9), trade("b", 1), trade("c", 1), trade("d", 1), trade("e", 1), trade("f", 100)];
    const rows = buildTape(trades, 5);
    expect(rows.map((r) => r.large)).toEqual([true, false, false, false, false]);
  });
});

describe("spark geometry", () => {
  test("oldest at the left, highest value at the top, inside the padded box", () => {
    const pts = sparkPoints([1, 3, 2], 100, 20, 2);
    expect(pts.length).toBe(3);
    expect(pts[0][0]).toBe(2);
    expect(pts[2][0]).toBe(98);
    expect(pts[1][1]).toBe(2);
    expect(pts[0][1]).toBe(18);
  });

  test("a flat series sits on the middle line", () => {
    const pts = sparkPoints([5, 5, 5], 60, 20);
    for (const p of pts) expect(p[1]).toBe(10);
  });

  test("too little data gives no path", () => {
    expect(sparkPath([], 60, 20)).toBe("");
    expect(sparkPath([1], 60, 20)).toBe("");
    expect(sparkArea([Number.NaN, 1], 60, 20)).toBe("");
    expect(sparkPath([1, 2], 2, 2, 1)).toBe("");
  });

  test("path and area are well formed", () => {
    expect(sparkPath([1, 2, 3], 10, 10, 0)).toMatch(/^M0 10 L5 5 L10 0$/);
    expect(sparkArea([1, 2, 3], 10, 10, 0)).toMatch(/Z$/);
  });

  test("cumulative adds up and treats junk as zero", () => {
    expect(cumulative([1, -2, 3])).toEqual([1, -1, 2]);
    expect(cumulative([1, Number.NaN, 2])).toEqual([1, 1, 3]);
  });

  test("the zero line is only returned when the series crosses it", () => {
    expect(sparkZeroY([-1, 1], 20, 0)).toBeCloseTo(10, 8);
    expect(sparkZeroY([1, 2], 20)).toBeNull();
    expect(sparkZeroY([-3, -1], 20)).toBeNull();
    expect(sparkZeroY([-1, 3], 20, 0)).toBeCloseTo(15, 8);
  });
});

describe("gauge geometry", () => {
  test("imbalance maps to a left to right angle and clamps", () => {
    expect(imbalanceAngle(-1)).toBe(0);
    expect(imbalanceAngle(0)).toBe(90);
    expect(imbalanceAngle(1)).toBe(180);
    expect(imbalanceAngle(5)).toBe(180);
    expect(imbalanceAngle(Number.NaN)).toBe(90);
    expect(clampImbalance(-9)).toBe(-1);
  });

  test("points sit on the circle: left, top and right", () => {
    const left = polar(100, 100, 50, 0);
    const top = polar(100, 100, 50, 90);
    const right = polar(100, 100, 50, 180);
    expect(left.x).toBeCloseTo(50, 8);
    expect(left.y).toBeCloseTo(100, 8);
    expect(top.x).toBeCloseTo(100, 8);
    expect(top.y).toBeCloseTo(50, 8);
    expect(right.x).toBeCloseTo(150, 8);
    expect(right.y).toBeCloseTo(100, 8);
  });

  test("the value arc runs from the top toward the value, buy to the right and sell to the left", () => {
    expect(valueArc(100, 100, 50, 0)).toBe("");
    const buy = valueArc(100, 100, 50, 1);
    expect(buy.startsWith("M100 50 A50 50 0 0 1 150 100")).toBe(true);
    const sell = valueArc(100, 100, 50, -1);
    expect(sell.startsWith("M50 100 A50 50 0 0 1 100 50")).toBe(true);
  });

  test("a full semicircle is a single non large arc and ticks are radial", () => {
    expect(arcPath(100, 100, 50, 0, 180)).toBe("M50 100 A50 50 0 0 1 150 100");
    expect(tickPath(100, 100, 40, 50, 90)).toBe("M100 60 L100 50");
  });

  test("flow words never rely on color", () => {
    expect(flowWord(0.8)).toBe("Compra forte");
    expect(flowWord(0.3)).toBe("Compra");
    expect(flowWord(0)).toBe("Equilibrado");
    expect(flowWord(-0.3)).toBe("Venda");
    expect(flowWord(-0.8)).toBe("Venda forte");
    expect(flowWord(null)).toBe("Indisponivel");
  });
});

describe("canvas helpers", () => {
  test("withAlpha expands hex and leaves other colors alone", () => {
    expect(withAlpha("#3ddc97", 0.5)).toBe("rgba(61,220,151,0.5)");
    expect(withAlpha("#fff", 1)).toBe("rgba(255,255,255,1)");
    expect(withAlpha("rgb(1,2,3)", 0.5)).toBe("rgb(1,2,3)");
    expect(withAlpha("#000000", 5)).toBe("rgba(0,0,0,1)");
  });

  test("snap and snapLine land on whole or half device pixels", () => {
    expect(snap(10.3, 1)).toBe(10);
    expect(snap(10.3, 2)).toBe(10.5);
    expect(snapLine(10.3, 1)).toBe(10.5);
    expect(snapLine(10.3, 2)).toBe(10.5);
    expect(snapLine(10.2, 2)).toBe(10);
    expect(snapLine(10.3, 1, 2)).toBe(10);
  });

  test("the default palette mirrors the design tokens and readPalette falls back to it without a DOM", () => {
    expect(DEFAULT_PALETTE.buy).toBe("#3ddc97");
    expect(DEFAULT_PALETTE.sell).toBe("#ff6b81");
    expect(DEFAULT_PALETTE.signal).toBe("#4fd6e8");
    expect(readPalette({} as Element)).toEqual(DEFAULT_PALETTE);
  });
});

describe("derivatives layout", () => {
  test("a phone sized panel keeps four cells in two columns with their notes", () => {
    const l = derivativesLayout(330, 250, true);
    expect(l.cells).toBe(4);
    expect(l.includeMid).toBe(false);
    expect(l.cols).toBe(2);
    expect(l.rows).toBe(2);
    expect(l.notes).toBe(true);
  });

  test("the fifth cell needs both the data and the height", () => {
    expect(derivativesLayout(330, 400, true).includeMid).toBe(true);
    expect(derivativesLayout(330, 400, true).rows).toBe(3);
    expect(derivativesLayout(330, 400, false).includeMid).toBe(false);
    expect(derivativesLayout(330, 290, true).includeMid).toBe(false);
  });

  test("a wide strip with some height lays every cell in one row and drops the notes", () => {
    const l = derivativesLayout(900, 160, true);
    expect(l.inline).toBe(false);
    expect(l.cols).toBe(5);
    expect(l.rows).toBe(1);
    expect(l.cellH).toBeLessThan(NOTE_ROOM + 60);
  });

  test("below the inline threshold the four numbers collapse to one compact run", () => {
    for (const [w, h] of [[345, 133], [900, 100], [250, 60]] as const) {
      const l = derivativesLayout(w, h, true);
      expect(l.inline).toBe(true);
      expect(l.cells).toBe(4);
      expect(l.includeMid).toBe(false);
      expect(l.notes).toBe(false);
    }
    expect(derivativesLayout(345, INLINE_BELOW - 1, false).inline).toBe(true);
    expect(derivativesLayout(345, INLINE_BELOW, false).inline).toBe(false);
  });

  test("a very narrow panel stacks the cells in one column", () => {
    const l = derivativesLayout(200, 520, false);
    expect(l.cols).toBe(1);
    expect(l.rows).toBe(4);
  });

  test("notes appear only when the cell is tall enough for them", () => {
    expect(derivativesLayout(330, 160, false).notes).toBe(false);
    expect(derivativesLayout(330, 200, false).notes).toBe(true);
  });
});

describe("watchlist layout: rows first, decoration after", () => {
  test("a roomy panel shows everything at full height, rows capped at 46px", () => {
    const l = watchlistLayout(460, 400, 5);
    expect(l.level).toBe("full");
    expect(l.header).toBe(true);
    expect(l.spark && l.vol && l.fund).toBe(true);
    expect(l.rowH).toBe(46);
    expect(l.scroll).toBe(false);
  });

  test("a short panel drops the header before it makes rows thinner", () => {
    // 133 px of body at 1280x720: 5 rows would be 22 px with the header, 26 without it.
    const l = watchlistLayout(345, 133, 5);
    expect(l.header).toBe(false);
    expect(l.rowH).toBe(26);
    expect(l.level).toBe("snug");
    expect(l.spark).toBe(true);
    expect(l.scroll).toBe(false);
  });

  test("every row the panel was given fits: row height times rows never exceeds the panel", () => {
    for (const rows of [1, 3, 5, 6, 8, 9]) {
      for (const height of [100, 133, 180, 260, 400]) {
        const l = watchlistLayout(345, height, rows);
        if (l.scroll) continue;
        const used = rows * l.rowH + (l.header ? WATCH_HEADER_H : 0);
        expect(used).toBeLessThanOrEqual(height);
      }
    }
  });

  test("thin rows drop the sparkline and the volume bar, never a row", () => {
    const l = watchlistLayout(460, 133, 8);
    expect(l.level).toBe("tight");
    expect(l.spark).toBe(false);
    expect(l.vol).toBe(false);
    expect(l.rowH).toBeGreaterThanOrEqual(WATCH_MIN_ROW_H);
    expect(l.scroll).toBe(false);
    expect(l.template.split(" ").length).toBeLessThanOrEqual(5);
  });

  test("only when even the thinnest rows cannot fit does the list scroll", () => {
    const l = watchlistLayout(345, 100, 20);
    expect(l.rowH).toBe(WATCH_MIN_ROW_H);
    expect(l.scroll).toBe(true);
    expect(watchlistLayout(345, 100, 6).scroll).toBe(false);
  });

  test("columns follow the width: funding then volume then sparkline drop as it narrows", () => {
    const wide = watchlistLayout(460, 400, 5);
    expect(wide.fund && wide.vol && wide.spark).toBe(true);
    const mid = watchlistLayout(380, 400, 5);
    expect(mid.fund).toBe(false);
    expect(mid.vol && mid.spark).toBe(true);
    const narrow = watchlistLayout(300, 400, 5);
    expect(narrow.vol).toBe(false);
    expect(narrow.spark).toBe(true);
    const tiny = watchlistLayout(220, 400, 5);
    expect(tiny.spark).toBe(false);
    expect(tiny.template).toBe("56px minmax(60px, 1fr) 54px");
  });

  test("a narrow wing keeps a slimmer sparkline: the columns tighten before the trend line is dropped", () => {
    // 268 px of panel at 1280x720 and 272 px at 1440x900, both with the pin star. The compact tier (under 300 px) trims the
    // padding, the change column and the sparkline itself so the trend stays; the price never goes below its 60 px floor.
    for (const width of [268, 272]) {
      const l = watchlistLayout(width, 133, 5, 20);
      expect(l.spark).toBe(true);
      expect(l.template).toBe("56px minmax(60px, 1fr) 54px 40px");
      expect(l.padX).toBe(6);
      expect(l.minW).toBeLessThanOrEqual(width);
    }
  });

  test("the price column keeps its floor: below the compact tier's room the sparkline drops before the price clips", () => {
    const l = watchlistLayout(260, 133, 5, 20);
    expect(l.spark).toBe(false);
    expect(l.template).toContain("minmax(60px, 1fr)");
    expect(l.minW).toBeLessThanOrEqual(260);
  });

  test("narrower than the essential columns scrolls sideways instead of clipping", () => {
    const l = watchlistLayout(200, 400, 5, 20);
    expect(l.minW).toBeGreaterThan(200);
  });

  test("the sparkline and the volume bar follow the row height", () => {
    const snug = watchlistLayout(460, 133, 5);
    expect(snug.sparkH).toBe(snug.rowH - 8);
    expect(snug.volH).toBe(snug.rowH - 8);
    expect(watchlistLayout(460, 600, 3).sparkH).toBe(22);
    expect(watchlistLayout(460, 600, 3).volH).toBe(18);
  });

  test("an empty list does not divide by zero", () => {
    const l = watchlistLayout(345, 200, 0);
    expect(Number.isFinite(l.rowH)).toBe(true);
  });
});

describe("flow layout: the arc becomes a bar, the numbers stay", () => {
  test("a tall panel keeps the gauge, two columns of numbers and the sparkline", () => {
    const l = flowLayout(345, 300);
    expect(l).toEqual({ mode: "full", statCols: 2, spark: true });
  });

  test("a middling panel keeps the gauge with the numbers in one row", () => {
    const l = flowLayout(345, 200);
    expect(l.mode).toBe("compact");
    expect(l.statCols).toBe(4);
    expect(l.spark).toBe(true);
  });

  test("below 170 px the arc is replaced by the bar", () => {
    expect(flowLayout(345, 169).mode).toBe("bar");
    expect(flowLayout(345, 170).mode).toBe("compact");
    expect(flowLayout(345, 133).mode).toBe("bar");
  });

  test("the bar keeps the numbers in one row when wide, two when narrow", () => {
    expect(flowLayout(345, 133).statCols).toBe(4);
    expect(flowLayout(220, 133).statCols).toBe(2);
  });

  test("the sparkline only stays when there is room left under the numbers", () => {
    expect(flowLayout(345, 133).spark).toBe(true);
    expect(flowLayout(345, 100).spark).toBe(false);
    expect(flowLayout(220, 133).spark).toBe(false);
    expect(flowLayout(220, 169).spark).toBe(true);
  });
});
