import { describe, expect, test } from "bun:test";
import {
  EMPTY_METRICS,
  LIQUIDITY_BIN_COUNT,
  addTradeToFlow,
  bookReachBps,
  computeMetrics,
  cvdOf,
  depthWithin,
  fillFlowTo,
  flowWindow,
  liquiditySlice,
  microOf,
  midOf,
  realizedSigmaDaily,
  spreadBpsOf,
  topOfBook,
  vwapOf,
} from "./analytics";
import type { DeskBook, DeskBookLevel, DeskCandle, DeskFlowBucket, DeskTicker, DeskTrade } from "./types";

const lv = (px: number, sz: number): DeskBookLevel => ({ px, sz, orders: 1 });

function book(bids: DeskBookLevel[], asks: DeskBookLevel[], integrity: DeskBook["integrity"] = "sequence"): DeskBook {
  return { instId: "T-USDT", bids, asks, tsMs: 1, seqId: 1, checksumOk: null, integrity };
}

/** Hand computable book: mid 100.05, spread 0.10. */
const small = book(
  [lv(100.0, 10), lv(99.95, 20), lv(99.9, 30)],
  [lv(100.1, 5), lv(100.15, 15), lv(100.3, 25)],
);

const trade = (id: string, px: number, sz: number, side: "buy" | "sell", tsMs: number): DeskTrade => ({ id, px, sz, side, tsMs });

describe("top of book, mid, micro price and spread", () => {
  test("hand computed values", () => {
    const top = topOfBook(small, null);
    expect(top).toEqual({ bidPx: 100, bidSz: 10, askPx: 100.1, askSz: 5 });
    if (top === null) return;
    expect(midOf(top)).toBeCloseTo(100.05, 10);
    expect(spreadBpsOf(top)).toBeCloseTo((0.1 / 100.05) * 1e4, 8); // 9.995002...
    // (100 * 5 + 100.1 * 10) / 15: the thinner ask side pulls the micro price toward the ask.
    expect(microOf(top)).toBeCloseTo(1501 / 15, 10);
    expect(microOf(top)).toBeGreaterThan(midOf(top));
  });

  test("falls back to the ticker only when there is no book", () => {
    const ticker: DeskTicker = { instId: "T-USDT", last: 5, open24h: null, high24h: null, low24h: null, volBase24h: null, volQuote24h: null, bidPx: 4.9, bidSz: 1, askPx: 5.1, askSz: null, tsMs: 1 };
    expect(topOfBook(null, ticker)).toEqual({ bidPx: 4.9, bidSz: 1, askPx: 5.1, askSz: null });
    expect(topOfBook(small, ticker)?.bidPx).toBe(100);
    expect(microOf({ bidPx: 4.9, bidSz: 1, askPx: 5.1, askSz: null })).toBeNull();
    expect(topOfBook(null, null)).toBeNull();
    expect(topOfBook(book([], [lv(1, 1)]), null)).toBeNull();
    expect(microOf({ bidPx: 1, bidSz: 0, askPx: 2, askSz: 0 })).toBeNull();
  });
});

describe("depth inside a window", () => {
  test("quote depth inside 10 and 50 bps of mid, summed level by level", () => {
    // 10 bps of mid 100.05 is 0.10005: bids 100 and 99.95 are inside (99.90 is not), asks 100.10 and 100.15 are inside.
    const d10 = depthWithin(small, 10);
    expect(d10?.bid).toBeCloseTo(100 * 10 + 99.95 * 20, 8); // 2999
    expect(d10?.ask).toBeCloseTo(100.1 * 5 + 100.15 * 15, 8); // 2002.75
    const d50 = depthWithin(small, 50);
    expect(d50?.bid).toBeCloseTo(2999 + 99.9 * 30, 8); // 5996
    expect(d50?.ask).toBeCloseTo(2002.75 + 100.3 * 25, 8); // 4510.25
  });

  test("a book truncated before the window yields null instead of a partial figure", () => {
    const bids = Array.from({ length: 400 }, (_, i) => lv(100 - 0.001 * i, 1));
    const asks = Array.from({ length: 400 }, (_, i) => lv(100.002 + 0.001 * i, 1));
    const deep = book(bids, asks);
    // mid 100.001, 10 bps is 0.100001: bids i 0..99 and asks i 0..99 are inside.
    const d10 = depthWithin(deep, 10);
    expect(d10?.bid).toBeCloseTo(100 * 100 - 0.001 * 4950, 6); // 9995.05
    expect(d10?.ask).toBeCloseTo(100 * 100.002 + 0.001 * 4950, 6); // 10005.15
    expect(depthWithin(deep, 50)).toBeNull();
    const reach = bookReachBps(deep);
    expect(reach).not.toBeNull();
    expect(reach as number).toBeGreaterThan(39);
    expect(reach as number).toBeLessThan(40);
  });

  test("books5 never covers a window beyond its five levels", () => {
    const five = book(
      [lv(100, 1), lv(99.99, 1), lv(99.98, 1), lv(99.97, 1), lv(99.96, 1)],
      [lv(100.01, 1), lv(100.02, 1), lv(100.03, 1), lv(100.04, 1), lv(100.05, 1)],
      "snapshot",
    );
    expect(depthWithin(five, 10)).toBeNull(); // 5 levels reach only 5 bps
    expect(depthWithin(five, 4)?.bid).toBeCloseTo(100 + 99.99 + 99.98 + 99.97, 6);
    const short = book([lv(100, 1), lv(99.99, 1)], [lv(100.01, 1)], "snapshot");
    expect(depthWithin(short, 50)).not.toBeNull(); // fewer than 5 levels: the whole side is known
  });

  test("a complete shallow book reports the maximum reach", () => {
    expect(bookReachBps(small)).toBe(10_000);
    expect(bookReachBps(book([], []))).toBeNull();
  });
});

describe("liquidity layout", () => {
  test("60 bins of 2 bps across mid +/- 60 bps, bids below and asks above", () => {
    expect(LIQUIDITY_BIN_COUNT).toBe(60);
    const b = book(
      [lv(99.99, 10), lv(99.91, 20), lv(99.41, 5), lv(99.38, 100)],
      [lv(100.01, 4), lv(100.09, 6), lv(100.59, 2), lv(100.62, 100)],
    );
    const slice = liquiditySlice(b, 1234, 1);
    expect(slice).not.toBeNull();
    if (slice === null) return;
    expect(slice.tsMs).toBe(1234);
    expect(slice.midPx).toBeCloseTo(100, 8);
    expect(slice.bins).toHaveLength(60);
    // -1 bps is bin 29 (the last bid bin), -9 bps is bin 25, -59 bps is bin 0, -62 bps is outside.
    expect(slice.bins[29]).toBeCloseTo(99.99 * 10, 6);
    expect(slice.bins[25]).toBeCloseTo(99.91 * 20, 6);
    expect(slice.bins[0]).toBeCloseTo(99.41 * 5, 6);
    // +1 bps is bin 30 (the first ask bin), +9 bps is bin 34, +59 bps is bin 59, +62 bps is outside.
    expect(slice.bins[30]).toBeCloseTo(100.01 * 4, 6);
    expect(slice.bins[34]).toBeCloseTo(100.09 * 6, 6);
    expect(slice.bins[59]).toBeCloseTo(100.59 * 2, 6);
    const total = slice.bins.reduce((sum, v) => sum + v, 0);
    expect(total).toBeCloseTo(99.99 * 10 + 99.91 * 20 + 99.41 * 5 + 100.01 * 4 + 100.09 * 6 + 100.59 * 2, 6);
    // Both sides are complete here, so the whole +/- 60 bps is known.
    expect(slice.reachBidBps).toBe(60);
    expect(slice.reachAskBps).toBe(60);
  });

  test("a truncated book says how far it is known, and bins past that are not data", () => {
    const bids = Array.from({ length: 400 }, (_, i) => lv(100 - 0.01 * i, 1));
    const asks = Array.from({ length: 400 }, (_, i) => lv(100.02 + 0.02 * i, 1));
    const slice = liquiditySlice(book(bids, asks), 1, 1);
    expect(slice?.reachBidBps).toBe(60); // 400 levels of 1 cent reach about 399 bps, capped at the layout edge
    const narrow = liquiditySlice(book(bids.slice(0, 400).map((l, i) => lv(100 - 0.001 * i, l.sz)), asks.map((l, i) => lv(100.002 + 0.001 * i, l.sz))), 1, 1);
    expect(narrow?.reachBidBps as number).toBeLessThan(40);
    expect(narrow?.reachAskBps as number).toBeLessThan(40);
  });

  test("no slice without a two sided book or without a known quote multiplier", () => {
    expect(liquiditySlice(book([], [lv(1, 1)]), 1, 1)).toBeNull();
    expect(liquiditySlice(small, 1, null)).toBeNull();
  });
});

describe("VWAP and CVD over the retained trades", () => {
  const trades = [trade("2", 102, 3, "sell", 2000), trade("1", 100, 1, "buy", 1000)];
  test("hand computed", () => {
    expect(vwapOf(trades)).toBeCloseTo((100 * 1 + 102 * 3) / 4, 10); // 101.5
    expect(cvdOf(trades)).toBe(1 - 3);
  });
  test("null without trades", () => {
    expect(vwapOf([])).toBeNull();
    expect(cvdOf([])).toBeNull();
  });
});

describe("flow buckets", () => {
  test("trades of the same second share a bucket and the last price wins", () => {
    let flow: readonly DeskFlowBucket[] = [];
    flow = addTradeToFlow(flow, trade("1", 100, 2, "buy", 10_100), 120, null);
    flow = addTradeToFlow(flow, trade("2", 101, 1, "sell", 10_900), 120, null);
    flow = addTradeToFlow(flow, trade("3", 102, 0.5, "buy", 10_950), 120, null);
    expect(flow).toEqual([{ tsMs: 10_000, buyBase: 2.5, sellBase: 1, lastPx: 102, trades: 3 }]);
  });

  test("quiet seconds between trades become real zero buckets carrying the last price", () => {
    let flow: readonly DeskFlowBucket[] = [];
    flow = addTradeToFlow(flow, trade("1", 100, 2, "buy", 10_100), 120, null);
    flow = addTradeToFlow(flow, trade("2", 99, 1, "sell", 13_200), 120, null);
    expect(flow.map((b) => [b.tsMs, b.buyBase, b.sellBase, b.lastPx, b.trades])).toEqual([
      [10_000, 2, 0, 100, 1],
      [11_000, 0, 0, 100, 0],
      [12_000, 0, 0, 100, 0],
      [13_000, 0, 1, 99, 1],
    ]);
  });

  test("seconds before the gap floor are not filled (the feed was down)", () => {
    let flow: readonly DeskFlowBucket[] = [];
    flow = addTradeToFlow(flow, trade("1", 100, 2, "buy", 10_100), 120, null);
    flow = addTradeToFlow(flow, trade("2", 99, 1, "sell", 15_200), 120, 13_400);
    expect(flow.map((b) => b.tsMs)).toEqual([10_000, 13_000, 14_000, 15_000]);
  });

  test("a late trade joins its own retained bucket and is ignored when too old", () => {
    let flow: readonly DeskFlowBucket[] = [];
    flow = addTradeToFlow(flow, trade("1", 100, 2, "buy", 10_100), 120, null);
    flow = addTradeToFlow(flow, trade("2", 105, 1, "sell", 12_100), 120, null);
    const late = addTradeToFlow(flow, trade("3", 50, 4, "buy", 11_500), 120, null);
    expect(late.find((b) => b.tsMs === 11_000)).toEqual({ tsMs: 11_000, buyBase: 4, sellBase: 0, lastPx: 100, trades: 1 });
    expect(addTradeToFlow(flow, trade("4", 1, 1, "buy", 5_000), 120, null)).toBe(flow);
  });

  test("the buffer is capped to the newest buckets", () => {
    let flow: readonly DeskFlowBucket[] = [];
    for (let s = 0; s < 150; s += 1) flow = addTradeToFlow(flow, trade(String(s), 100, 1, "buy", s * 1000), 120, null);
    expect(flow).toHaveLength(120);
    expect(flow[0]?.tsMs).toBe(30_000);
    expect(flow[119]?.tsMs).toBe(149_000);
  });

  test("fillFlowTo extends with zero seconds up to now, respects the floor and needs a first bucket", () => {
    const base = addTradeToFlow([], trade("1", 100, 2, "buy", 10_100), 120, null);
    expect(fillFlowTo([], 20_000, 120, null)).toEqual([]);
    const filled = fillFlowTo(base, 12_400, 120, null);
    expect(filled.map((b) => b.tsMs)).toEqual([10_000, 11_000, 12_000]);
    expect(filled[2]).toEqual({ tsMs: 12_000, buyBase: 0, sellBase: 0, lastPx: 100, trades: 0 });
    expect(fillFlowTo(filled, 12_900, 120, null)).toBe(filled);
    expect(fillFlowTo(base, 14_000, 120, 13_000).map((b) => b.tsMs)).toEqual([10_000, 13_000, 14_000]);
    expect(fillFlowTo(base, 10_000 + 300_000, 120, null)).toHaveLength(120);
  });

  test("the 60 s window sums the buckets that end after now minus 60 s", () => {
    const flow: DeskFlowBucket[] = [
      { tsMs: 930_000, buyBase: 100, sellBase: 100, lastPx: 1, trades: 50 }, // ends at 931 s: out
      { tsMs: 939_000, buyBase: 7, sellBase: 0, lastPx: 1, trades: 1 }, // ends at 940 s: out (not after 940 s)
      { tsMs: 940_000, buyBase: 1, sellBase: 4, lastPx: 1, trades: 2 }, // in
      { tsMs: 990_000, buyBase: 2, sellBase: 1, lastPx: 1, trades: 3 },
      { tsMs: 1_000_500, buyBase: 0.5, sellBase: 0, lastPx: 1 }, // a bucket a hair ahead of the clock estimate still counts
    ];
    expect(flowWindow(flow, 1_000_000)).toEqual({ buy: 3.5, sell: 5, trades: 5 });
    expect(flowWindow([], 1_000_000)).toBeNull();
  });
});

describe("realized volatility", () => {
  const HOUR = 3_600_000;
  const series = (closes: number[], confirmedLast = true): DeskCandle[] =>
    closes.map((close, i) => ({
      tsMs: i * HOUR,
      open: close,
      high: close,
      low: close,
      close,
      volBase: 1,
      volQuote: 1,
      confirmed: i < closes.length - 1 || confirmedLast,
    }));

  test("20 alternating 1 percent returns: sqrt(20/19) * ln(1.01) * sqrt(24) for hourly bars", () => {
    const closes = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    const a = Math.log(1.01);
    expect(realizedSigmaDaily(series(closes), "1H")).toBeCloseTo(a * Math.sqrt(20 / 19) * Math.sqrt(24), 12);
  });

  test("the bar length drives the daily scaling", () => {
    const closes = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    const day = series(closes).map((c, i) => ({ ...c, tsMs: i * 86_400_000 }));
    expect(realizedSigmaDaily(day, "1D")).toBeCloseTo(Math.log(1.01) * Math.sqrt(20 / 19), 12);
  });

  test("null below 20 returns, with an unconfirmed last bar, and across gaps", () => {
    const closes = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 100 : 101)); // 19 returns
    expect(realizedSigmaDaily(series(closes), "1H")).toBeNull();
    const twentyOne = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    expect(realizedSigmaDaily(series(twentyOne, false), "1H")).toBeNull(); // the forming bar is not a return
    const gappy = series(twentyOne);
    gappy.splice(10, 1); // a missing hour: the return across it is skipped, leaving 18
    expect(realizedSigmaDaily(gappy, "1H")).toBeNull();
    expect(realizedSigmaDaily([], "1H")).toBeNull();
  });

  test("a flat market has zero volatility, not null", () => {
    const flat = series(Array.from({ length: 25 }, () => 50));
    expect(realizedSigmaDaily(flat, "1H")).toBe(0);
  });
});

describe("computeMetrics", () => {
  const ticker: DeskTicker = { instId: "T-USDT", last: 110, open24h: 100, high24h: 111, low24h: 99, volBase24h: 1, volQuote24h: 1, bidPx: 109.9, bidSz: 1, askPx: 110.1, askSz: 1, tsMs: 5 };
  const base = {
    book: small,
    ticker,
    trades: [trade("2", 102, 3, "sell", 2000), trade("1", 100, 1, "buy", 1000)],
    flow: [
      { tsMs: 950_000, buyBase: 2, sellBase: 1, lastPx: 100, trades: 3 },
      { tsMs: 990_000, buyBase: 0.5, sellBase: 1.5, lastPx: 100, trades: 2 },
    ] as DeskFlowBucket[],
    candles: [] as DeskCandle[],
    bar: "1m" as const,
    nowMs: 1_000_000,
    exchangeNowMs: 1_000_000,
    observedSinceMs: 900_000,
    quoteMultiplier: 1,
  };

  test("assembles every metric from hand computed parts", () => {
    const m = computeMetrics(base);
    expect(m.midPx).toBeCloseTo(100.05, 10);
    expect(m.spreadBps).toBeCloseTo(9.995002, 5);
    expect(m.microPx).toBeCloseTo(1501 / 15, 10);
    expect(m.bidDepthQuote10bps).toBeCloseTo(2999, 8);
    expect(m.askDepthQuote10bps).toBeCloseTo(2002.75, 8);
    expect(m.depthBidShare10bps).toBeCloseTo(2999 / (2999 + 2002.75), 10);
    expect(m.bidDepthQuote50bps).toBeCloseTo(5996, 8);
    expect(m.askDepthQuote50bps).toBeCloseTo(4510.25, 8);
    expect(m.depthBidShare50bps).toBeCloseTo(5996 / (5996 + 4510.25), 10);
    expect(m.buyVolBase60s).toBe(2.5);
    expect(m.sellVolBase60s).toBe(2.5);
    expect(m.flowImbalance60s).toBe(0);
    expect(m.tradesPerSecond60s).toBeCloseTo(5 / 60, 12);
    expect(m.cvd).toBe(-2);
    expect(m.vwap).toBeCloseTo(101.5, 10);
    expect(m.change24hPct).toBeCloseTo(10, 10);
    expect(m.realizedSigmaDaily).toBeNull();
    expect(m.bookReachBps).toBe(10_000);
  });

  test("the rate uses only the time actually observed", () => {
    expect(computeMetrics({ ...base, observedSinceMs: 990_000 }).tradesPerSecond60s).toBeCloseTo(5 / 10, 12);
    expect(computeMetrics({ ...base, observedSinceMs: 998_000 }).tradesPerSecond60s).toBeNull(); // 2 s is too little
    expect(computeMetrics({ ...base, observedSinceMs: null }).tradesPerSecond60s).toBeNull();
  });

  test("imbalance in the +1 to -1 range", () => {
    const heavy = computeMetrics({ ...base, flow: [{ tsMs: 990_000, buyBase: 3, sellBase: 1, lastPx: 1, trades: 4 }] });
    expect(heavy.flowImbalance60s).toBe(0.5);
    const quiet = computeMetrics({ ...base, flow: [{ tsMs: 990_000, buyBase: 0, sellBase: 0, lastPx: 1, trades: 0 }] });
    expect(quiet.flowImbalance60s).toBeNull();
    expect(quiet.buyVolBase60s).toBe(0);
  });

  test("an unknown exchange clock leaves the time windows null, not zero", () => {
    const m = computeMetrics({ ...base, exchangeNowMs: null });
    expect(m.buyVolBase60s).toBeNull();
    expect(m.sellVolBase60s).toBeNull();
    expect(m.flowImbalance60s).toBeNull();
    expect(m.tradesPerSecond60s).toBeNull();
    expect(m.cvd).toBe(-2);
    expect(m.midPx).not.toBeNull();
  });

  test("a clock skew of a minute does not blank the window once the exchange clock is used", () => {
    // Local clock 70 s behind: the trades carry exchange stamps, so the window is evaluated on the exchange clock.
    const local = 930_000;
    const exchange = local + 70_000;
    const m = computeMetrics({ ...base, nowMs: local, exchangeNowMs: exchange, observedSinceMs: local - 60_000 });
    expect(m.buyVolBase60s).toBe(2.5);
    expect(computeMetrics({ ...base, nowMs: local, exchangeNowMs: local }).buyVolBase60s).toBe(2.5); // buckets are ahead, still counted
  });

  test("everything is null when nothing is known", () => {
    const m = computeMetrics({ book: null, ticker: null, trades: [], flow: [], candles: [], bar: "1m", nowMs: 1, exchangeNowMs: 1, observedSinceMs: null, quoteMultiplier: 1 });
    expect(m).toEqual(EMPTY_METRICS);
  });

  test("a swap book has no quote value per size unit: depth in quote is null but shares remain", () => {
    const m = computeMetrics({ ...base, quoteMultiplier: null });
    expect(m.bidDepthQuote10bps).toBeNull();
    expect(m.askDepthQuote50bps).toBeNull();
    expect(m.depthBidShare10bps).not.toBeNull();
  });

  test("a truncated book gives null for the window it does not reach but still gives the narrower one", () => {
    const bids = Array.from({ length: 400 }, (_, i) => lv(100 - 0.001 * i, 1));
    const asks = Array.from({ length: 400 }, (_, i) => lv(100.002 + 0.001 * i, 1));
    const m = computeMetrics({ ...base, book: book(bids, asks) });
    expect(m.bidDepthQuote10bps).not.toBeNull();
    expect(m.bidDepthQuote50bps).toBeNull();
    expect(m.askDepthQuote50bps).toBeNull();
    expect(m.depthBidShare50bps).toBeNull();
    expect(m.bookReachBps as number).toBeLessThan(40);
  });
});
