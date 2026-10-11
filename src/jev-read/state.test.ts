import { describe, expect, test } from "bun:test";
import { buildTapeState } from "./state";
import { BOOK_MAX_AGE_MS, CANDLES_MAX_AGE_MS, FLOW_WINDOW_MS, FUTURE_TOLERANCE_MS, MIN_CANDLES, TICKER_MAX_AGE_MS, type TapeCandle, type TapeInput, type TapeTrade } from "./types";

const NOW = 2_000_000_000_000;

function candles(count: number, start = 100, step = 0.1): TapeCandle[] {
  return Array.from({ length: count }, (_, i) => ({ tsMs: NOW - (count - i) * 60_000, close: start + i * step, confirmed: i < count - 1 }));
}

function input(overrides: Partial<TapeInput> = {}): TapeInput {
  return {
    instId: "BTC-USDT",
    nowMs: NOW,
    exchangeNowMs: NOW,
    tradesLive: true,
    book: {
      bids: [{ px: 99.9, sz: 2 }, { px: 99.8, sz: 3 }, { px: 99.7, sz: 1 }, { px: 99.6, sz: 4 }, { px: 99.5, sz: 5 }],
      asks: [{ px: 100.1, sz: 1 }, { px: 100.2, sz: 1 }, { px: 100.3, sz: 2 }, { px: 100.4, sz: 2 }, { px: 100.5, sz: 2 }],
      receivedAtMs: NOW - 200,
    },
    trades: [],
    candles: candles(40),
    ticker: { last: 100, open24h: 98, high24h: 102, low24h: 97, receivedAtMs: NOW - 1_000 },
    fundingRate: null,
    ...overrides,
  };
}

function ok(i: TapeInput) {
  const out = buildTapeState(i);
  if (!out.ok) throw new Error(`expected a state, got ${out.reasons.join(",")}`);
  return out.state;
}

describe("buildTapeState: book", () => {
  test("mid, spread and top 5 imbalance come from the real levels", () => {
    const s = ok(input());
    expect(s.mid).toBeCloseTo(100, 10);
    expect(s.spreadBps).toBeCloseTo(((100.1 - 99.9) / 100) * 10_000, 6); // 20 bps
    const bidQuote = 99.9 * 2 + 99.8 * 3 + 99.7 * 1 + 99.6 * 4 + 99.5 * 5;
    const askQuote = 100.1 * 1 + 100.2 * 1 + 100.3 * 2 + 100.4 * 2 + 100.5 * 2;
    expect(s.depthQuoteTop5.bid).toBeCloseTo(bidQuote, 6);
    expect(s.depthQuoteTop5.ask).toBeCloseTo(askQuote, 6);
    expect(s.bookImbalanceTop5).toBeCloseTo((bidQuote - askQuote) / (bidQuote + askQuote), 10);
  });

  test("a missing, stale or crossed book is insufficient and says why", () => {
    expect(buildTapeState(input({ book: null }))).toEqual({ ok: false, reasons: ["book_missing"] });
    const stale = input();
    expect(buildTapeState({ ...stale, book: { ...stale.book!, receivedAtMs: NOW - BOOK_MAX_AGE_MS - 1 } })).toEqual({ ok: false, reasons: ["book_stale"] });
    expect(buildTapeState({ ...stale, book: { ...stale.book!, bids: [{ px: 101, sz: 1 }] } })).toEqual({ ok: false, reasons: ["book_crossed"] });
    expect(buildTapeState({ ...stale, book: { ...stale.book!, bids: [], asks: [] } })).toEqual({ ok: false, reasons: ["book_missing"] });
  });
});

describe("buildTapeState: candles and returns", () => {
  test("returns are in basis points over 1, 5, 15 and 30 minutes of closes", () => {
    const list = candles(MIN_CANDLES + 5, 100, 0.1);
    const s = ok(input({ candles: list }));
    const last = list[list.length - 1]!.close;
    const back = (n: number) => list[list.length - 1 - n]!.close;
    expect(s.returnsBps.m1).toBeCloseTo((last / back(1) - 1) * 10_000, 6);
    expect(s.returnsBps.m5).toBeCloseTo((last / back(5) - 1) * 10_000, 6);
    expect(s.returnsBps.m15).toBeCloseTo((last / back(15) - 1) * 10_000, 6);
    expect(s.returnsBps.m30).toBeCloseTo((last / back(30) - 1) * 10_000, 6);
  });

  test("volatility is the standard deviation of the last 30 one minute log returns in bps", () => {
    const closes = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100];
    const list: TapeCandle[] = closes.map((close, i) => ({ tsMs: NOW - (closes.length - i) * 60_000, close, confirmed: true }));
    const s = ok(input({ candles: list }));
    const returns: number[] = [];
    for (let i = closes.length - 30; i < closes.length; i += 1) returns.push(Math.log(closes[i]! / closes[i - 1]!));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
    expect(s.volBpsPerMinute).toBeCloseTo(Math.sqrt(variance) * 10_000, 6);
  });

  test("fewer than the minimum candles, or a stale last candle, is insufficient", () => {
    expect(buildTapeState(input({ candles: candles(MIN_CANDLES - 1) }))).toEqual({ ok: false, reasons: ["candles_short"] });
    const old = candles(MIN_CANDLES + 2).map((c) => ({ ...c, tsMs: c.tsMs - CANDLES_MAX_AGE_MS - 120_000 }));
    expect(buildTapeState(input({ candles: old }))).toEqual({ ok: false, reasons: ["candles_stale"] });
  });

  test("a non finite or non positive close never becomes a return", () => {
    const bad = candles(MIN_CANDLES + 1);
    bad[bad.length - 3] = { ...bad[bad.length - 3]!, close: Number.NaN };
    expect(buildTapeState(input({ candles: bad }))).toEqual({ ok: false, reasons: ["candles_short"] });
  });
});

describe("buildTapeState: taker flow over the last minute", () => {
  const t = (side: "buy" | "sell", sz: number, px: number, agoMs: number): TapeTrade => ({ side, sz, px, receivedAtMs: NOW - agoMs });

  test("counts only prints inside the window and computes cvd, vwap and the last print", () => {
    const trades = [t("buy", 2, 100, 5_000), t("sell", 1, 101, 3_000), t("buy", 1, 102, 1_000), t("sell", 9, 90, FLOW_WINDOW_MS + 1)];
    const s = ok(input({ trades }));
    expect(s.flow60s.count).toBe(3);
    expect(s.flow60s.buyBase).toBe(3);
    expect(s.flow60s.sellBase).toBe(1);
    expect(s.flow60s.cvdBase).toBe(2);
    expect(s.flow60s.imbalance).toBeCloseTo(0.5, 10);
    expect(s.flow60s.vwap).toBeCloseTo((2 * 100 + 1 * 101 + 1 * 102) / 4, 10);
    expect(s.flow60s.lastPx).toBe(102);
    expect(s.flow60s.lastSide).toBe("buy");
  });

  test("no prints is a real observation, not a missing input: zeros and nulls", () => {
    const s = ok(input({ trades: [] }));
    expect(s.flow60s).toEqual({ count: 0, buyBase: 0, sellBase: 0, imbalance: null, cvdBase: 0, vwap: null, lastPx: null, lastSide: null });
  });

  test("ignores malformed prints", () => {
    const s = ok(input({ trades: [t("buy", Number.NaN, 100, 100), t("buy", 1, 0, 100), t("sell", -1, 100, 100), t("buy", 1, 100, 100)] }));
    expect(s.flow60s.count).toBe(1);
  });
});

describe("buildTapeState: ticker and funding", () => {
  test("24h change and range position come from the ticker", () => {
    const s = ok(input());
    expect(s.change24hPct).toBeCloseTo(((100 - 98) / 98) * 100, 8);
    expect(s.rangePosition24h).toBeCloseTo((100 - 97) / (102 - 97), 8);
  });

  test("unknown 24h fields stay null, never zero", () => {
    const base = input();
    const s = ok({ ...base, ticker: { ...base.ticker!, open24h: null, high24h: null, low24h: null } });
    expect(s.change24hPct).toBeNull();
    expect(s.rangePosition24h).toBeNull();
  });

  test("a missing or stale ticker is insufficient", () => {
    expect(buildTapeState(input({ ticker: null }))).toEqual({ ok: false, reasons: ["ticker_missing"] });
    const base = input();
    expect(buildTapeState({ ...base, ticker: { ...base.ticker!, receivedAtMs: NOW - TICKER_MAX_AGE_MS - 1 } })).toEqual({ ok: false, reasons: ["ticker_stale"] });
  });

  test("funding is reported as a percent when known and null otherwise", () => {
    expect(ok(input({ fundingRate: 0.0001 })).fundingRatePct).toBeCloseTo(0.01, 10);
    expect(ok(input({ fundingRate: null })).fundingRatePct).toBeNull();
  });
});

describe("buildTapeState: reasons accumulate", () => {
  test("every missing input is reported, in a stable order", () => {
    expect(buildTapeState(input({ book: null, ticker: null, candles: [] }))).toEqual({ ok: false, reasons: ["book_missing", "ticker_missing", "candles_short"] });
  });

  test("the state carries the horizon and the instrument and no extra fields", () => {
    const s = ok(input());
    expect(Object.keys(s).sort()).toEqual(["bookImbalanceTop5", "change24hPct", "depthQuoteTop5", "flow60s", "fundingRatePct", "horizonMinutes", "instId", "mid", "rangePosition24h", "returnsBps", "spreadBps", "volBpsPerMinute"]);
    expect(s.instId).toBe("BTC-USDT");
    expect(s.horizonMinutes).toBe(5);
  });
});

describe("buildTapeState: clocks", () => {
  test("candles are aged on the exchange clock, not on a skewed local one", () => {
    // The local clock is 70 s behind the exchange. The last candle is 200 s old on the exchange clock.
    const skewed = input({ nowMs: NOW - 70_000, exchangeNowMs: NOW });
    const list = candles(MIN_CANDLES + 5).map((c, i, all) => ({ ...c, tsMs: NOW - 200_000 - (all.length - 1 - i) * 60_000 }));
    const local = { ...skewed, candles: list, book: { ...skewed.book!, receivedAtMs: NOW - 70_000 - 200 }, ticker: { ...skewed.ticker!, receivedAtMs: NOW - 70_000 - 1_000 } };
    expect(buildTapeState(local)).toEqual({ ok: false, reasons: ["candles_stale"] });
  });

  test("a fresh candle on the exchange clock is accepted even when the local clock is 70 s behind", () => {
    const base = input({ nowMs: NOW - 70_000, exchangeNowMs: NOW });
    const ok = { ...base, book: { ...base.book!, receivedAtMs: NOW - 70_000 - 200 }, ticker: { ...base.ticker!, receivedAtMs: NOW - 70_000 - 1_000 } };
    expect(buildTapeState(ok).ok).toBe(true);
  });

  test("a candle stamped an hour ahead of the exchange clock is not fresh", () => {
    const list = candles(MIN_CANDLES + 2).map((c) => ({ ...c, tsMs: c.tsMs + 3_600_000 }));
    expect(buildTapeState(input({ candles: list }))).toEqual({ ok: false, reasons: ["candles_stale"] });
  });

  test("a candle slightly ahead, within the tolerance of the offset measurement, is still fresh", () => {
    const list = candles(MIN_CANDLES + 2).map((c, i, all) => ({ ...c, tsMs: NOW + FUTURE_TOLERANCE_MS - (all.length - 1 - i) * 60_000 }));
    expect(buildTapeState(input({ candles: list })).ok).toBe(true);
  });

  test("without a measured offset the candle age is unknown and Jev is not asked", () => {
    expect(buildTapeState(input({ exchangeNowMs: null }))).toEqual({ ok: false, reasons: ["clock_unknown"] });
  });

  test("a book or ticker received in the future of the local clock is not fresh (the clock stepped back)", () => {
    const base = input();
    expect(buildTapeState({ ...base, book: { ...base.book!, receivedAtMs: NOW + 3_600_000 } })).toEqual({ ok: false, reasons: ["book_stale"] });
    expect(buildTapeState({ ...base, ticker: { ...base.ticker!, receivedAtMs: NOW + 3_600_000 } })).toEqual({ ok: false, reasons: ["ticker_stale"] });
  });

  test("a receipt a moment ahead of the evaluation is not an error", () => {
    const base = input();
    expect(buildTapeState({ ...base, book: { ...base.book!, receivedAtMs: NOW + 1_000 } }).ok).toBe(true);
  });
});

describe("buildTapeState: the trades feed", () => {
  test("when the trades channel is not live the flow is unknown, so Jev is not asked", () => {
    expect(buildTapeState(input({ tradesLive: false }))).toEqual({ ok: false, reasons: ["trades_unavailable"] });
  });

  test("it is reported after the other reasons", () => {
    expect(buildTapeState(input({ book: null, tradesLive: false }))).toEqual({ ok: false, reasons: ["book_missing", "trades_unavailable"] });
  });
});
