import { describe, expect, test } from "bun:test";
import type { JevDecisionView, JevReadStateView, JevReadView } from "../../jev-read";
import type { DeskBar, DeskCandle } from "../types";
import { decisionMarkers, decisionScore, remapMarkersToBricks, type DecisionMarker } from "./decisions";
import type { RenkoBrick } from "./transforms";

const T0 = Date.UTC(2026, 9, 12, 10, 0, 0);
const MINUTE = 60_000;

function candle(i: number, close: number, confirmed = true): DeskCandle {
  return {
    tsMs: T0 + i * MINUTE,
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volBase: 10,
    volQuote: 1000,
    confirmed,
  };
}

/** Twenty one-minute candles closing near 100. */
function candles(): DeskCandle[] {
  return Array.from({ length: 20 }, (_, i) => candle(i, 100));
}

const STATE: JevReadStateView = {
  instId: "BTC-USDT",
  horizonMinutes: 5,
  mid: 100,
  spreadBps: 0.4,
  bookImbalanceTop5: 0.1,
  volBpsPerMinute: 2,
  depthQuoteTop5: { bid: 1000, ask: 1200 },
  returnsBps: { m1: 0, m5: 0, m15: 0, m30: 0 },
  flow60s: { count: 3, buyBase: 1, sellBase: 1, cvdBase: 0, imbalance: 0, vwap: 100, lastPx: 100, lastSide: "buy" },
  change24hPct: 0.5,
  rangePosition24h: 0.6,
  fundingRatePct: null,
};

function decision(over: Partial<JevDecisionView> = {}): JevDecisionView {
  return {
    action: "buy",
    probabilities: { buy: 0.6, sell: 0.2, hold: 0.2 },
    confidence: 0.6,
    latencyMs: 120,
    model: "jev-test",
    status: "ok",
    inputTokens: 100,
    ...over,
  };
}

/** A read stamped inside candle 10 (T0 + 10min + 30s) on the exchange clock. */
function read(over: Partial<JevReadView> = {}): JevReadView {
  return {
    readId: "r1",
    instId: "BTC-USDT",
    atMs: T0 + 10 * MINUTE + 30_000,
    clockOffsetMs: 0,
    state: STATE,
    insufficient: [],
    decision: decision(),
    ...over,
  };
}

function input(over: Partial<Parameters<typeof decisionMarkers>[0]> = {}) {
  return {
    reads: [read()],
    instId: "BTC-USDT",
    candles: candles(),
    bar: "1m" as DeskBar,
    browserSkewMs: null,
    nowExchangeMs: T0 + 60 * MINUTE,
    ...over,
  };
}

describe("decisionMarkers", () => {
  test("a real buy decision inside the series becomes one marker at its candle and its mid", () => {
    const markers = decisionMarkers(input());
    expect(markers.length).toBe(1);
    const m = markers[0]!;
    expect(m.readId).toBe("r1");
    expect(m.action).toBe("buy");
    expect(m.price).toBe(100);
    expect(m.anchorMs).toBe(T0 + 10 * MINUTE + 30_000);
    expect(m.barIndex).toBe(10);
    expect(m.weights).toEqual({ buy: 0.6, sell: 0.2, hold: 0.2 });
    expect(m.model).toBe("jev-test");
    expect(m.latencyMs).toBe(120);
    expect(m.horizonMinutes).toBe(5);
  });

  test("markers come back oldest first even when the board gives newest first", () => {
    const older = read({ readId: "old", atMs: T0 + 2 * MINUTE + 10_000 });
    const newer = read({ readId: "new", atMs: T0 + 10 * MINUTE + 30_000 });
    const markers = decisionMarkers(input({ reads: [newer, older] }));
    expect(markers.map((m) => m.readId)).toEqual(["old", "new"]);
  });

  test("an observe-mode read without a decision produces no marker", () => {
    expect(decisionMarkers(input({ reads: [read({ decision: null })] }))).toEqual([]);
  });

  test("a decision that timed out produces no marker", () => {
    expect(decisionMarkers(input({ reads: [read({ decision: decision({ status: "timeout" }) })] }))).toEqual([]);
  });

  test("error and malformed decisions produce no marker either", () => {
    expect(decisionMarkers(input({ reads: [read({ decision: decision({ status: "error" }) })] }))).toEqual([]);
    expect(decisionMarkers(input({ reads: [read({ decision: decision({ status: "malformed" }) })] }))).toEqual([]);
  });

  test("a read of another instrument produces no marker", () => {
    expect(decisionMarkers(input({ reads: [read({ instId: "ETH-USDT" })] }))).toEqual([]);
  });

  test("a read without state produces no marker", () => {
    expect(decisionMarkers(input({ reads: [read({ state: null })] }))).toEqual([]);
  });

  test("a read whose mid is not a finite positive price produces no marker", () => {
    expect(decisionMarkers(input({ reads: [read({ state: { ...STATE, mid: 0 } })] }))).toEqual([]);
    expect(decisionMarkers(input({ reads: [read({ state: { ...STATE, mid: Number.NaN } })] }))).toEqual([]);
  });

  test("a read stamped on the producer clock needs the browser skew to anchor", () => {
    const stamped = read({ clockOffsetMs: null });
    expect(decisionMarkers(input({ reads: [stamped], browserSkewMs: null }))).toEqual([]);
    const markers = decisionMarkers(input({ reads: [stamped], browserSkewMs: 1_000 }));
    expect(markers.length).toBe(1);
    expect(markers[0]!.anchorMs).toBe(stamped.atMs + 1_000);
  });

  test("a read before the first candle or after the last bar produces no marker", () => {
    expect(decisionMarkers(input({ reads: [read({ atMs: T0 - 5 * MINUTE })] }))).toEqual([]);
    expect(decisionMarkers(input({ reads: [read({ atMs: T0 + 60 * MINUTE })] }))).toEqual([]);
  });

  test("a buy measured after the horizon: close 100.10 against mid 100 is +10 bps favourable", () => {
    const cs = candles();
    cs[14] = candle(14, 100.1);
    const markers = decisionMarkers(input({ candles: cs }));
    expect(markers[0]!.outcome.kind).toBe("measured");
    const outcome = markers[0]!.outcome as { bps: number; favourable: boolean };
    expect(outcome.bps).toBeCloseTo(10, 6);
    expect(outcome.favourable).toBe(true);
  });

  test("a sell measured after the horizon: close 99.90 against mid 100 is +10 bps favourable", () => {
    const cs = candles();
    cs[14] = candle(14, 99.9);
    const markers = decisionMarkers(input({ reads: [read({ decision: decision({ action: "sell" }) })], candles: cs }));
    expect(markers[0]!.outcome.kind).toBe("measured");
    const outcome = markers[0]!.outcome as { bps: number; favourable: boolean };
    expect(outcome.bps).toBeCloseTo(10, 6);
    expect(outcome.favourable).toBe(true);
  });

  test("a buy that lost 5 bps is measured but not favourable", () => {
    const cs = candles();
    cs[14] = candle(14, 99.95);
    const markers = decisionMarkers(input({ candles: cs }));
    const outcome = markers[0]!.outcome as { bps: number; favourable: boolean };
    expect(outcome.bps).toBeCloseTo(-5, 6);
    expect(outcome.favourable).toBe(false);
  });

  test("the outcome uses the close of the last confirmed candle that ends at or before the horizon", () => {
    // Horizon ends inside candle 15, so candle 14 is the last eligible one.
    const cs = candles();
    cs[14] = candle(14, 100.1);
    cs[15] = candle(15, 50);
    const markers = decisionMarkers(input({ candles: cs }));
    const outcome = markers[0]!.outcome as { bps: number };
    expect(outcome.bps).toBeCloseTo(10, 6);
  });

  test("an unconfirmed last eligible candle is never used for the outcome", () => {
    const cs = candles();
    cs[14] = candle(14, 100.1, false);
    cs[13] = candle(13, 100.05);
    const markers = decisionMarkers(input({ candles: cs }));
    const outcome = markers[0]!.outcome as { bps: number };
    expect(outcome.bps).toBeCloseTo(5, 6);
  });

  test("before the horizon the outcome is pending, and it is pending when now is unknown", () => {
    expect(decisionMarkers(input({ nowExchangeMs: T0 + 12 * MINUTE }))[0]!.outcome).toEqual({ kind: "pending" });
    expect(decisionMarkers(input({ nowExchangeMs: null }))[0]!.outcome).toEqual({ kind: "pending" });
  });

  test("when no confirmed candle ends before the horizon the outcome stays pending", () => {
    const cs = candles().map((c) => ({ ...c, confirmed: false }));
    expect(decisionMarkers(input({ candles: cs }))[0]!.outcome).toEqual({ kind: "pending" });
  });

  test("on bars wider than 5 minutes the outcome is not measured at this scale", () => {
    const wide = Array.from({ length: 20 }, (_, i) => candle(i * 15, 100));
    const markers = decisionMarkers(input({ candles: wide, bar: "15m", reads: [read({ atMs: T0 + 10 * 15 * MINUTE + 30_000 })] }));
    expect(markers.length).toBe(1);
    expect(markers[0]!.outcome).toEqual({ kind: "not_measured", reason: "scale" });
  });

  test("a hold decision has no outcome ever", () => {
    const markers = decisionMarkers(input({ reads: [read({ decision: decision({ action: "hold" }) })] }));
    expect(markers[0]!.outcome).toEqual({ kind: "none" });
  });
});

function marker(outcome: DecisionMarker["outcome"], action: DecisionMarker["action"] = "buy"): DecisionMarker {
  return {
    readId: Math.random().toString(36).slice(2),
    action,
    anchorMs: T0,
    barIndex: 0,
    price: 100,
    weights: { buy: 0.5, sell: 0.2, hold: 0.3 },
    confidence: 0.5,
    model: "jev-test",
    latencyMs: 100,
    horizonMinutes: 5,
    atMs: T0,
    outcome,
  };
}

describe("decisionScore", () => {
  test("with no measured decision the line says so in words", () => {
    const score = decisionScore([marker({ kind: "pending" }), marker({ kind: "none" }, "hold")]);
    expect(score.measured).toBe(0);
    expect(score.pending).toBe(1);
    expect(score.text).toBe("Inonu neste ativo: nenhuma decisao medida ainda");
  });

  test("holds never count in the score", () => {
    const score = decisionScore([marker({ kind: "none" }, "hold"), marker({ kind: "none" }, "hold")]);
    expect(score.measured).toBe(0);
    expect(score.pending).toBe(0);
    expect(score.notMeasured).toBe(0);
  });

  test("one measured decision uses the singular", () => {
    const score = decisionScore([marker({ kind: "measured", bps: 4, favourable: true })]);
    expect(score.measured).toBe(1);
    expect(score.favourable).toBe(1);
    expect(score.text).toBe("Inonu neste ativo: 1 de 1 decisao no sentido certo apos 5 min (bruto, sem custos)");
  });

  test("under ten measured decisions there is no percentage", () => {
    const markers = [
      ...Array.from({ length: 5 }, () => marker({ kind: "measured" as const, bps: 4, favourable: true })),
      ...Array.from({ length: 4 }, () => marker({ kind: "measured" as const, bps: -4, favourable: false })),
      marker({ kind: "pending" }),
      marker({ kind: "not_measured", reason: "scale" }),
    ];
    const score = decisionScore(markers);
    expect(score.measured).toBe(9);
    expect(score.favourable).toBe(5);
    expect(score.pending).toBe(1);
    expect(score.notMeasured).toBe(1);
    expect(score.text).toBe("Inonu neste ativo: 5 de 9 decisoes no sentido certo apos 5 min (bruto, sem custos)");
    expect(score.text).not.toContain("%");
  });

  test("from ten measured decisions on the percentage appears", () => {
    const markers = [
      ...Array.from({ length: 7 }, () => marker({ kind: "measured" as const, bps: 4, favourable: true })),
      ...Array.from({ length: 5 }, () => marker({ kind: "measured" as const, bps: -4, favourable: false })),
    ];
    const score = decisionScore(markers);
    expect(score.text).toBe("Inonu neste ativo: 7 de 12 decisoes no sentido certo apos 5 min, 58% (bruto, sem custos)");
  });

  test("no score text contains a forbidden character", () => {
    const markers = [
      marker({ kind: "measured", bps: 4, favourable: true }),
      marker({ kind: "pending" }),
      marker({ kind: "not_measured", reason: "scale" }),
      marker({ kind: "none" }, "hold"),
    ];
    for (const t of [decisionScore(markers).text, decisionScore([]).text]) {
      expect(t).not.toMatch(/[·–—]/);
    }
  });
});

function brick(i: number, dir: 1 | -1 = 1): RenkoBrick {
  return { open: 100 + i, close: 100 + i + dir, dir, tsMs: T0 + i * MINUTE, sourceIndex: i };
}

describe("remapMarkersToBricks", () => {
  const barMs = MINUTE;

  test("a marker lands on the last brick fully completed before the read", () => {
    const m = { ...marker({ kind: "pending" }), anchorMs: T0 + 3 * MINUTE + 30_000, barIndex: 3 };
    const out = remapMarkersToBricks([m], [brick(0), brick(1), brick(2), brick(3), brick(4)], barMs);
    // Brick 3 completes at T0+4min; the read at T0+3min30s sees bricks 0..2 completed => index 2.
    expect(out).toHaveLength(1);
    expect(out[0]!.barIndex).toBe(2);
    expect(out[0]!.anchorMs).toBe(m.anchorMs);
    expect(out[0]!.readId).toBe(m.readId);
    expect(out[0]!.outcome).toEqual({ kind: "pending" });
  });

  test("a read exactly at a brick completion boundary maps to that brick", () => {
    const m = { ...marker({ kind: "pending" }), anchorMs: T0 + 4 * MINUTE, barIndex: 4 };
    const out = remapMarkersToBricks([m], [brick(0), brick(1), brick(2), brick(3)], barMs);
    expect(out).toHaveLength(1);
    expect(out[0]!.barIndex).toBe(3);
  });

  test("a marker before the first completed brick is dropped", () => {
    const m = { ...marker({ kind: "pending" }), anchorMs: T0 + 30_000, barIndex: 0 };
    expect(remapMarkersToBricks([m], [brick(0)], barMs)).toEqual([]);
    expect(remapMarkersToBricks([m], [], barMs)).toEqual([]);
  });

  test("one candle can complete several bricks and markers keep action and outcome", () => {
    // Candle at index 10 completes bricks 5,6,7 in one shot (tsMs all equal T0+10min).
    const bricks = [...[0, 1, 2, 3, 4].map((i) => brick(i)), ...[5, 6, 7].map((i) => ({ ...brick(i), tsMs: T0 + 10 * MINUTE, sourceIndex: 10 }))];
    const m = { ...marker({ kind: "measured", bps: 12, favourable: true }, "sell"), anchorMs: T0 + 11 * MINUTE, barIndex: 11 };
    const out = remapMarkersToBricks([m], bricks, barMs);
    expect(out).toHaveLength(1);
    expect(out[0]!.barIndex).toBe(7);
    expect(out[0]!.action).toBe("sell");
    expect(out[0]!.outcome).toEqual({ kind: "measured", bps: 12, favourable: true });
  });

  test("several markers keep their order and only unmappable ones drop", () => {
    const early = { ...marker({ kind: "pending" }), anchorMs: T0 + 10_000, barIndex: 0 };
    const mid = { ...marker({ kind: "pending" }), anchorMs: T0 + 2 * MINUTE, barIndex: 2 };
    const late = { ...marker({ kind: "pending" }), anchorMs: T0 + 2 * MINUTE + 1, barIndex: 2 };
    const out = remapMarkersToBricks([early, mid, late], [brick(0), brick(1)], barMs);
    expect(out.map((m) => m.anchorMs)).toEqual([mid.anchorMs, late.anchorMs]);
    expect(out.every((m) => m.barIndex === 1)).toBe(true);
  });
});
