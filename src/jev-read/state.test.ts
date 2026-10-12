import { describe, expect, test } from "bun:test";
import { buildTapeState } from "./state";
import { runJevRead } from "./read";
import { BOOK_MAX_AGE_MS, CANDLES_MAX_AGE_MS, FLOW_WINDOW_MS, FUTURE_TOLERANCE_MS, MIN_CANDLES, TICKER_MAX_AGE_MS, type TapeCandle, type TapeInput, type TapeTrade } from "./types";

const NOW = 2_000_000_000_000;

function candles(count: number, start = 100, step = 0.1): TapeCandle[] {
  return Array.from({ length: count }, (_, i) => ({ tsMs: NOW - (count - i) * 60_000, close: start + i * step, confirmed: i < count - 1,
    proof: { feedId: "state-fixture", feedEpoch: 0, captureId: 3, forSpotInstId: "BTC-USDT", requestedInstId: "BTC-USDT",
      reportedInstId: null, source: "rest_candles_1m", wsGeneration: null, sourceTsMs: NOW - (count - i) * 60_000,
      receivedAtMs: NOW - 100, receivedAtMonoMs: 199_900 },
  }));
}

function candleAt(candle: TapeCandle, tsMs: number): TapeCandle {
  return { ...candle, tsMs, proof: { ...candle.proof, sourceTsMs: tsMs } };
}

function input(overrides: Partial<TapeInput> = {}): TapeInput {
  return {
    instId: "BTC-USDT",
    feedId: "state-fixture",
    feedEpoch: 0,
    wsGeneration: 0,
    monotonicNowMs: 200_000,
    funding: null,
    nowMs: NOW,
    exchangeNowMs: NOW,
    tradesLive: true,
    coverage: { feedId: "state-fixture", feedEpoch: 0, instId: "BTC-USDT", wsGeneration: 0, source: "ws_trades",
      acknowledgedAtMonoMs: 100_000, continuousSinceMonoMs: 100_000, observedThroughMonoMs: 200_000,
      socketOpen: true, lostThroughMonoMs: null },
    book: {
      bids: [{ px: 99.9, sz: 2 }, { px: 99.8, sz: 3 }, { px: 99.7, sz: 1 }, { px: 99.6, sz: 4 }, { px: 99.5, sz: 5 }],
      asks: [{ px: 100.1, sz: 1 }, { px: 100.2, sz: 1 }, { px: 100.3, sz: 2 }, { px: 100.4, sz: 2 }, { px: 100.5, sz: 2 }],
      receivedAtMs: NOW - 200,
      proof: { feedId: "state-fixture", feedEpoch: 0, captureId: 1, forSpotInstId: "BTC-USDT", requestedInstId: "BTC-USDT",
        reportedInstId: null, source: "rest_book", wsGeneration: null, sourceTsMs: NOW - 200, receivedAtMs: NOW - 200, receivedAtMonoMs: 199_800 },
    },
    trades: [],
    candles: candles(40),
    ticker: { last: 100, open24h: 98, high24h: 102, low24h: 97, receivedAtMs: NOW - 1_000,
      proof: { feedId: "state-fixture", feedEpoch: 0, captureId: 2, forSpotInstId: "BTC-USDT", requestedInstId: "BTC-USDT",
        reportedInstId: "BTC-USDT", source: "rest_ticker", wsGeneration: null, sourceTsMs: NOW - 1_000,
        receivedAtMs: NOW - 1_000, receivedAtMonoMs: 199_000 } },
    fundingMaxAgeMs: 120_000,
    ...overrides,
  };
}

function ok(i: TapeInput) {
  const out = buildTapeState(i);
  if (!out.ok) throw new Error(`expected a state, got ${out.reasons.join(",")}`);
  return out.state;
}

function knownFunding(rate: number): NonNullable<TapeInput["funding"]> {
  return { rate, fundingTimeMs: null, nextFundingTimeMs: null, proof: { feedId: "state-fixture", feedEpoch: 0,
    captureId: 1, forSpotInstId: "BTC-USDT", requestedInstId: "BTC-USDT-SWAP", reportedInstId: "BTC-USDT-SWAP",
    source: "rest_funding", wsGeneration: null, sourceTsMs: NOW, receivedAtMs: NOW, receivedAtMonoMs: 200_000 } };
}

describe("buildTapeState: book", () => {
  test("book proof gates identity and both clocks before any model call", async () => {
    const base = input();
    const proof = base.book!.proof;
    const invalid: unknown[] = [undefined, null, true, {},
      { ...proof, feedId: "another-feed" }, { ...proof, feedEpoch: 1 },
      { ...proof, captureId: 0 }, { ...proof, captureId: 0.5 },
      { ...proof, forSpotInstId: "BTC-USDC" }, { ...proof, requestedInstId: "ETH-USDT" },
      { ...proof, reportedInstId: "ETH-USDT" }, { ...proof, source: "rest_ticker" },
      { ...proof, wsGeneration: 1 }, { ...proof, sourceTsMs: NOW - 5_001 },
      { ...proof, sourceTsMs: NOW + 1 }, { ...proof, sourceTsMs: "2000000000000" },
      { ...proof, receivedAtMonoMs: 194_999.5 }, { ...proof, receivedAtMonoMs: 200_000.5 },
      { ...proof, receivedAtMs: Number.NaN },
      { ...proof, source: "ws_books5", reportedInstId: "BTC-USDT", wsGeneration: 1 },
    ];
    let calls = 0;
    const model = { name: "book-proof-boundary", async decide() { calls += 1;
      return { choice: "hold", probabilities: { buy: 0.1, sell: 0.1, hold: 0.8 }, latencyMs: 1 }; } };
    for (const candidate of invalid) {
      const value = { ...base, book: { ...base.book!, proof: candidate } } as TapeInput;
      expect(buildTapeState(value)).toEqual({ ok: false, reasons: ["book_stale"] });
      const read = await runJevRead(value, { model, now: () => NOW });
      expect(read.state).toBeNull();
      expect(read.decision).toBeNull();
      expect(read.insufficient).toEqual(["book_stale"]);
      expect(calls).toBe(0);
    }
    for (const valid of [proof, { ...proof, sourceTsMs: NOW - 5_000, receivedAtMonoMs: 195_000 },
      { ...proof, source: "ws_books5", reportedInstId: "BTC-USDT", wsGeneration: 0 }]) {
      const value = { ...base, book: { ...base.book!, proof: valid } } as TapeInput;
      expect(buildTapeState(value).ok).toBe(true);
      const read = await runJevRead(value, { model, now: () => NOW });
      expect(read.schemaVersion).toBe(1);
      expect(read.advisory).toBe(true);
      expect(read.execution).toBe("never");
      expect(read.decision?.status).toBe("ok");
    }
    expect(calls).toBe(3);
  });

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
    expect(buildTapeState({ ...stale, book: { ...stale.book!, proof: { ...stale.book!.proof, receivedAtMonoMs: stale.monotonicNowMs - BOOK_MAX_AGE_MS - 1 } } })).toEqual({ ok: false, reasons: ["book_stale"] });
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
    const list: TapeCandle[] = candles(closes.length).map((c, i) => ({ ...c, close: closes[i]!, confirmed: true }));
    const s = ok(input({ candles: list }));
    const returns: number[] = [];
    for (let i = closes.length - 30; i < closes.length; i += 1) returns.push(Math.log(closes[i]! / closes[i - 1]!));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
    expect(s.volBpsPerMinute).toBeCloseTo(Math.sqrt(variance) * 10_000, 6);
  });

  test("fewer than the minimum candles, or a stale last candle, is insufficient", () => {
    expect(buildTapeState(input({ candles: candles(MIN_CANDLES - 1) }))).toEqual({ ok: false, reasons: ["candles_short"] });
    const old = candles(MIN_CANDLES + 2).map((c) => candleAt(c, c.tsMs - CANDLES_MAX_AGE_MS - 120_000));
    expect(buildTapeState(input({ candles: old }))).toEqual({ ok: false, reasons: ["candles_stale"] });
  });

  test("a non finite or non positive close never becomes a return", () => {
    const bad = candles(MIN_CANDLES + 1);
    bad[bad.length - 3] = { ...bad[bad.length - 3]!, close: Number.NaN };
    expect(buildTapeState(input({ candles: bad }))).toEqual({ ok: false, reasons: ["candles_short"] });
  });
});

describe("buildTapeState: taker flow over the last minute", () => {
  const t = (side: "buy" | "sell", sz: number, px: number, agoMs: number): TapeTrade => ({ side, sz, px, receivedAtMs: NOW - agoMs,
    proof: { feedId: "state-fixture", feedEpoch: 0, captureId: 4, forSpotInstId: "BTC-USDT", requestedInstId: "BTC-USDT",
      reportedInstId: "BTC-USDT", source: "ws_trades", wsGeneration: 0, sourceTsMs: NOW - 100,
      receivedAtMs: NOW - agoMs, receivedAtMonoMs: 200_000 - agoMs } });

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

  test("invalid trade proofs or values block the model; flow follows monotonic receipts", async () => {
    const trade = t("buy", 2, 100, 100);
    const proof = trade.proof;
    const invalid: unknown[] = [undefined, null, true, [], {},
      { ...proof, feedId: "other" }, { ...proof, feedEpoch: 1 },
      { ...proof, captureId: 0 }, { ...proof, captureId: 0.5 },
      { ...proof, forSpotInstId: "ETH-USDT" }, { ...proof, requestedInstId: "ETH-USDT" },
      { ...proof, reportedInstId: null }, { ...proof, source: "ws_tickers" },
      { ...proof, wsGeneration: 1 }, { ...proof, sourceTsMs: -1 },
      { ...proof, sourceTsMs: Number.MAX_SAFE_INTEGER + 1 }, { ...proof, sourceTsMs: "1" },
      { ...proof, receivedAtMs: Number.NaN }, { ...proof, receivedAtMs: NOW - 99 },
      { ...proof, receivedAtMonoMs: 200_000.5 }, { ...proof, receivedAtMonoMs: Number.NaN }];
    const negatives = invalid.map((candidate) => ({ ...trade, proof: candidate }));
    negatives.push({ ...trade, px: 0 }, { ...trade, sz: Number.NaN }, { ...trade, sz: -1 },
      { ...trade, side: "flat" } as never);
    let calls = 0;
    const model = { name: "trade-proof-boundary", async decide() { calls += 1;
      return { choice: "buy", probabilities: { buy: 0.8, sell: 0.1, hold: 0.1 }, latencyMs: 1 }; } };
    for (const candidate of negatives) {
      const value = input({ trades: [candidate as TapeTrade] });
      expect(buildTapeState(value)).toEqual({ ok: false, reasons: ["trades_unavailable"] });
      const read = await runJevRead(value, { model, now: () => NOW });
      expect(read.state).toBeNull();
      expect(read.decision).toBeNull();
      expect(read.insufficient).toEqual(["trades_unavailable"]);
      expect(calls).toBe(0);
    }
    for (const wallJump of [-180_000, 0, 180_000]) {
      const trades = [t("buy", 2, 100, 60_000), t("sell", 1, 101, 0), t("sell", 9, 90, 60_000.5)]
        .map((value) => ({ ...value, receivedAtMs: NOW + wallJump,
          proof: { ...value.proof, receivedAtMs: NOW + wallJump, sourceTsMs: 1 } }));
      const value = input({ trades, nowMs: NOW + wallJump });
      const state = ok(value);
      expect(state.flow60s).toEqual({ count: 2, buyBase: 2, sellBase: 1, imbalance: 1 / 3,
        cvdBase: 1, vwap: 301 / 3, lastPx: 101, lastSide: "sell" });
      const read = await runJevRead(value, { model, now: () => NOW });
      expect(read.state?.flow60s.count).toBe(2);
      expect(read.decision?.status).toBe("ok");
      expect(read.execution).toBe("never");
    }
    expect(calls).toBe(3);
  });
});

describe("buildTapeState: ticker and funding", () => {
  test("ticker proof gates identity and both ages before any model call", async () => {
    const base = input();
    const proof = base.ticker!.proof;
    const invalid: unknown[] = [undefined, null, true, {},
      { ...proof, feedId: "another-feed" }, { ...proof, feedEpoch: 1 },
      { ...proof, captureId: 0 }, { ...proof, captureId: 0.5 },
      { ...proof, forSpotInstId: "BTC-USDC" }, { ...proof, requestedInstId: "ETH-USDT" },
      { ...proof, reportedInstId: null }, { ...proof, source: "rest_book" },
      { ...proof, wsGeneration: 1 }, { ...proof, sourceTsMs: NOW - 15_001 },
      { ...proof, sourceTsMs: NOW + 1 }, { ...proof, sourceTsMs: "2000000000000" },
      { ...proof, receivedAtMonoMs: 184_999.5 }, { ...proof, receivedAtMonoMs: 200_000.5 },
      { ...proof, receivedAtMs: Number.NaN },
      { ...proof, source: "ws_tickers", wsGeneration: 1 }];
    let calls = 0;
    const model = { name: "ticker-proof-boundary", async decide() { calls += 1;
      return { choice: "hold", probabilities: { buy: 0.1, sell: 0.1, hold: 0.8 }, latencyMs: 1 }; } };
    for (const candidate of invalid) {
      const value = { ...base, ticker: { ...base.ticker!, proof: candidate } } as TapeInput;
      expect(buildTapeState(value)).toEqual({ ok: false, reasons: ["ticker_stale"] });
      const read = await runJevRead(value, { model, now: () => NOW });
      expect(read.state).toBeNull();
      expect(read.decision).toBeNull();
      expect(read.insufficient).toEqual(["ticker_stale"]);
      expect(calls).toBe(0);
    }
    for (const valid of [proof, { ...proof, sourceTsMs: NOW - 15_000, receivedAtMonoMs: 185_000 },
      { ...proof, source: "ws_tickers", wsGeneration: 0 }]) {
      const value = { ...base, ticker: { ...base.ticker!, proof: valid } } as TapeInput;
      expect(buildTapeState(value).ok).toBe(true);
      const read = await runJevRead(value, { model, now: () => NOW });
      expect(read.schemaVersion).toBe(1);
      expect(read.advisory).toBe(true);
      expect(read.execution).toBe("never");
      expect(read.decision?.status).toBe("ok");
    }
    expect(calls).toBe(3);
  });

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
    expect(buildTapeState({ ...base, ticker: { ...base.ticker!, proof: { ...base.ticker!.proof, receivedAtMonoMs: base.monotonicNowMs - TICKER_MAX_AGE_MS - 1 } } })).toEqual({ ok: false, reasons: ["ticker_stale"] });
  });

  test("funding is reported as a percent when known and null otherwise", () => {
    expect(ok(input({ funding: knownFunding(0.0001) })).fundingRatePct).toBeCloseTo(0.01, 10);
    expect(ok(input({ funding: null })).fundingRatePct).toBeNull();
  });
});

describe("buildTapeState: funding proof", () => {
  test("wall clock jumps do not renew or expire funding source and monotonic receipts", async () => {
    for (const jump of [-180_000, 180_000]) {
      for (const [cacheAge, expected] of [[120_000, 0.4], [120_001, null]] as const) {
        const base = input();
        const wall = NOW + jump;
        const funding = knownFunding(0.004);
        const candidate = input({ nowMs: wall,
          book: { ...base.book!, receivedAtMs: wall - 200 },
          ticker: { ...base.ticker!, receivedAtMs: wall - 1000 },
          funding: { ...funding, proof: { ...funding.proof, receivedAtMonoMs: 200_000 - cacheAge } } });
        // Core fixture receipts follow wall because F2 provenance is a separate pending delivery.
        // Funding retains its actual historical wall receipt across both jumps.
        const built = buildTapeState(candidate);
        expect(built.ok).toBe(true);
        if (!built.ok) throw new Error("funding wall jumps must not block valid core state");
        expect(built.state.fundingRatePct).toBe(expected);
        let calls = 0;
        const read = await runJevRead(candidate, { now: () => wall, model: { name: "wall-jump-control", async decide() {
          calls += 1; return { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 1 } };
        } } });
        expect(calls).toBe(1);
        expect(read.insufficient).toEqual([]);
        expect(read.state?.fundingRatePct).toBe(expected);
        expect(read.advisory).toBe(true);
        expect(read.execution).toBe("never");
      }
    }
  });

  test("custom funding TTL boundaries preserve signed and zero rates without a builder default", async () => {
    for (const ttl of [60_000, 180_000]) {
      for (const [rate, percent] of [[0.004, 0.4], [-0.004, -0.4], [0, 0]] as const) {
        for (const [sourceAge, cacheAge, expected] of [
          [ttl, ttl, percent], [ttl + 1, 0, null], [0, ttl + 1, null],
          [0, ttl + 0.5, null], [0, 0, percent],
        ] as const) {
          const funding = knownFunding(rate);
          const candidate = input({ fundingMaxAgeMs: ttl, funding: { ...funding,
            proof: { ...funding.proof, sourceTsMs: NOW - sourceAge, receivedAtMonoMs: 200_000 - cacheAge } } });
          const built = buildTapeState(candidate);
          expect(built.ok).toBe(true);
          if (!built.ok) throw new Error("optional funding must not suppress valid core data");
          expect(built.state.fundingRatePct).toBe(expected);
          let calls = 0;
          const read = await runJevRead(candidate, { now: () => NOW, model: { name: "custom-ttl-control", async decide() {
            calls += 1; return { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 1 } };
          } } });
          expect(calls).toBe(1);
          expect(read.insufficient).toEqual([]);
          expect(read.state?.fundingRatePct).toBe(expected);
          expect(read.decision?.status).toBe("ok");
          expect(read.schemaVersion).toBe(1);
          expect(read.advisory).toBe(true);
          expect(read.execution).toBe("never");
        }
      }
    }
  });

  test("source and monotonic cache expiry independently make only funding unknown", async () => {
    const funding = { rate: 0.004, fundingTimeMs: NOW - 1000, nextFundingTimeMs: NOW + 28_800_000,
      proof: { feedId: "state-fixture", feedEpoch: 0, captureId: 1, forSpotInstId: "BTC-USDT",
        requestedInstId: "BTC-USDT-SWAP", reportedInstId: "BTC-USDT-SWAP", source: "rest_funding" as const,
        wsGeneration: null, sourceTsMs: NOW - 1000, receivedAtMs: NOW, receivedAtMonoMs: 199_000 } };
    const cases = [
      { funding, expected: 0.4 },
      { funding: { ...funding, proof: { ...funding.proof, sourceTsMs: NOW - 120_000 } }, expected: 0.4 },
      { funding: { ...funding, proof: { ...funding.proof, sourceTsMs: NOW - 120_001 } }, expected: null },
      { funding: { ...funding, proof: { ...funding.proof, sourceTsMs: NOW + 1 } }, expected: null },
      { funding: { ...funding, proof: { ...funding.proof, receivedAtMonoMs: 80_000 } }, expected: 0.4 },
      { funding: { ...funding, proof: { ...funding.proof, receivedAtMonoMs: 79_999.5 } }, expected: null },
      { funding: { ...funding, proof: { ...funding.proof, receivedAtMonoMs: 200_000.5 } }, expected: null },
      { funding: { ...funding, proof: { ...funding.proof, feedId: "another-feed" } }, expected: null },
      { funding: { ...funding, proof: { ...funding.proof, reportedInstId: "ETH-USDT-SWAP" } }, expected: null },
      { funding: null, expected: null },
    ];
    for (const { funding: observation, expected } of cases) {
      const candidate = input({ funding: observation, fundingRate: 0.004 } as Partial<TapeInput>);
      const built = buildTapeState(candidate);
      expect(built.ok).toBe(true);
      if (!built.ok) throw new Error("funding must not block core state");
      expect(built.state.fundingRatePct).toBe(expected);
      let calls = 0;
      const read = await runJevRead(candidate, { now: () => NOW, model: { name: "fake", async decide() {
        calls += 1; return { choice: "hold", probabilities: { buy: 0.1, sell: 0.1, hold: 0.8 } };
      } } });
      expect(calls).toBe(1);
      expect(read.insufficient).toEqual([]);
      expect(read.advisory).toBe(true);
      expect(read.execution).toBe("never");
      expect(read.decision?.status).toBe("ok");
    }
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
  test("every candle in the required tail needs a matching proof before the model is asked", async () => {
    const base = input({ candles: candles(MIN_CANDLES) });
    const p = base.candles[0]!.proof;
    const invalidProofs: unknown[] = [undefined, null, [],
      { ...p, feedId: "other-feed" }, { ...p, feedEpoch: 1 }, { ...p, captureId: 0 },
      { ...p, captureId: 1.5 }, { ...p, forSpotInstId: "ETH-USDT" }, { ...p, requestedInstId: "ETH-USDT" },
      { ...p, reportedInstId: "ETH-USDT" }, { ...p, source: "rest_ticker" }, { ...p, wsGeneration: 0 },
      { ...p, receivedAtMs: -1 }, { ...p, receivedAtMs: NOW + 0.5 },
      { ...p, receivedAtMonoMs: -1 }, { ...p, receivedAtMonoMs: Number.NaN },
      { ...p, receivedAtMonoMs: 200_000.5 }, { ...p, sourceTsMs: p.sourceTsMs + 1 },
    ];
    for (const index of [0, 15, MIN_CANDLES - 1]) {
      for (const invalid of invalidProofs) {
        const list = base.candles.map((c, i) => i === index ? ({ ...c, proof:
          invalid !== null && typeof invalid === "object" && !Array.isArray(invalid)
            ? { ...invalid, sourceTsMs: invalid === invalidProofs[invalidProofs.length - 1] ? c.tsMs + 1 : c.tsMs }
            : invalid,
        } as TapeCandle) : c);
        let calls = 0;
        const model = { name: "candle-proof-counter", async decide() { calls += 1; return { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 1 } }; } };
        const candidate = { ...base, candles: list };
        expect(buildTapeState(candidate)).toEqual({ ok: false, reasons: ["candles_short"] });
        const read = await runJevRead(candidate, { model, now: () => NOW });
        expect(read.insufficient).toEqual(["candles_short"]);
        expect(read.state).toBeNull();
        expect(calls).toBe(0);
      }
    }
    // A 31-bar history is older than 150 seconds; that TTL applies only to the last opening.
    const history = base.candles.map((c) => ({ ...c, proof: { ...c.proof, receivedAtMonoMs: 0, reportedInstId: "BTC-USDT" } }));
    let calls = 0;
    const model = { name: "candle-proof-counter", async decide() { calls += 1; return { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 1 } }; } };
    expect(buildTapeState({ ...base, candles: history }).ok).toBe(true);
    const read = await runJevRead({ ...base, candles: history }, { model, now: () => NOW });
    expect(read.insufficient).toEqual([]);
    expect(calls).toBe(1);
  });

  test("candles are aged on the exchange clock, not on a skewed local one", () => {
    // The local clock is 70 s behind the exchange. The last candle is 200 s old on the exchange clock.
    const skewed = input({ nowMs: NOW - 70_000, exchangeNowMs: NOW });
    const list = candles(MIN_CANDLES + 5).map((c, i, all) => candleAt(c, NOW - 200_000 - (all.length - 1 - i) * 60_000));
    const local = { ...skewed, candles: list, book: { ...skewed.book!, receivedAtMs: NOW - 70_000 - 200 }, ticker: { ...skewed.ticker!, receivedAtMs: NOW - 70_000 - 1_000 } };
    expect(buildTapeState(local)).toEqual({ ok: false, reasons: ["candles_stale"] });
  });

  test("a fresh candle on the exchange clock is accepted even when the local clock is 70 s behind", () => {
    const base = input({ nowMs: NOW - 70_000, exchangeNowMs: NOW });
    const ok = { ...base, book: { ...base.book!, receivedAtMs: NOW - 70_000 - 200 }, ticker: { ...base.ticker!, receivedAtMs: NOW - 70_000 - 1_000 } };
    expect(buildTapeState(ok).ok).toBe(true);
  });

  test("a candle stamped an hour ahead of the exchange clock is not fresh", () => {
    const list = candles(MIN_CANDLES + 2).map((c) => candleAt(c, c.tsMs + 3_600_000));
    expect(buildTapeState(input({ candles: list }))).toEqual({ ok: false, reasons: ["candles_stale"] });
  });

  test("F1 future candles fail specifically before any model call; present and fractional-age controls still reach the model", async () => {
    for (const aheadMs of [1, 5_000, 5_001]) {
      const list = candles(MIN_CANDLES).map((c, i, all) => candleAt(c, NOW + aheadMs - (all.length - 1 - i) * 60_000));
      const candidate = input({ candles: list });
      let calls = 0;
      const model = { name: "f1-counter", async decide() { calls += 1; return { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 1 } }; } };
      expect(buildTapeState(candidate)).toEqual({ ok: false, reasons: ["candles_stale"] });
      const read = await runJevRead(candidate, { model, now: () => NOW });
      expect(read.insufficient).toEqual(["candles_stale"]);
      expect(read.state).toBeNull();
      expect(read.decision).toBeNull();
      expect(calls).toBe(0);
    }
    const list = candles(MIN_CANDLES).map((c, i, all) => candleAt(c, NOW - (all.length - 1 - i) * 60_000));
    for (const exchangeNowMs of [NOW, NOW + 0.5]) {
      const candidate = input({ candles: list, exchangeNowMs });
      let calls = 0;
      const model = { name: "f1-counter", async decide() { calls += 1; return { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 1 } }; } };
      expect(buildTapeState(candidate).ok).toBe(true);
      const read = await runJevRead(candidate, { model, now: () => NOW });
      expect(calls).toBe(1);
      expect(read.insufficient).toEqual([]);
      expect(read.decision?.status).toBe("ok");
      expect(read.schemaVersion).toBe(1);
      expect(read.advisory).toBe(true);
      expect(read.execution).toBe("never");
    }
  });

  test("without a measured offset the candle age is unknown and Jev is not asked", () => {
    expect(buildTapeState(input({ exchangeNowMs: null }))).toEqual({ ok: false, reasons: ["clock_unknown"] });
  });

  test("F1 candle timestamps must be safe Unix milliseconds and corrected clock must be in its finite domain", async () => {
    for (const badTs of [-1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const list = candles(MIN_CANDLES).map((c, i, all) => candleAt(c, badTs - (all.length - 1 - i) * 60_000));
      const candidate = input({ candles: list });
      let calls = 0;
      const model = { name: "f1-domain", async decide() { calls += 1; return { choice: "hold" }; } };
      expect(buildTapeState(candidate)).toEqual({ ok: false, reasons: ["candles_short"] });
      const read = await runJevRead(candidate, { model, now: () => NOW });
      expect(read.insufficient).toEqual(["candles_short"]);
      expect(read.state).toBeNull();
      expect(read.decision).toBeNull();
      expect(calls).toBe(0);
    }
    for (const exchangeNowMs of [-1, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildTapeState(input({ exchangeNowMs }))).toEqual({ ok: false, reasons: ["clock_unknown"] });
    }
    const list = candles(MIN_CANDLES).map((c, i, all) => candleAt(c, NOW - 150_000 - (all.length - 1 - i) * 60_000));
    expect(buildTapeState(input({ candles: list })).ok).toBe(true);
    expect(buildTapeState(input({ candles: list, exchangeNowMs: NOW + 0.5 }))).toEqual({ ok: false, reasons: ["candles_stale"] });
  });

  test("a book or ticker receipt in the monotonic future is not fresh", () => {
    const base = input();
    expect(buildTapeState({ ...base, book: { ...base.book!, proof: { ...base.book!.proof, receivedAtMonoMs: base.monotonicNowMs + 1 } } })).toEqual({ ok: false, reasons: ["book_stale"] });
    expect(buildTapeState({ ...base, ticker: { ...base.ticker!, proof: { ...base.ticker!.proof, receivedAtMonoMs: base.monotonicNowMs + 1 } } })).toEqual({ ok: false, reasons: ["ticker_stale"] });
  });

  test("a receipt a moment ahead of the evaluation is not an error", () => {
    const base = input();
    expect(buildTapeState({ ...base, book: { ...base.book!, receivedAtMs: NOW + 1_000 } }).ok).toBe(true);
  });
});

describe("buildTapeState: the trades feed", () => {
  test("only current continuous coverage reaches the model, including quiet and fractional boundary controls", async () => {
    const base = input();
    const p = base.coverage!;
    const invalid: unknown[] = [undefined, null, [],
      { ...p, feedId: "other" }, { ...p, feedEpoch: 1 }, { ...p, instId: "ETH-USDT" },
      { ...p, wsGeneration: 1 }, { ...p, source: "ws_tickers" }, { ...p, socketOpen: false },
      { ...p, acknowledgedAtMonoMs: -1 }, { ...p, acknowledgedAtMonoMs: NaN },
      { ...p, continuousSinceMonoMs: 99_999 }, { ...p, continuousSinceMonoMs: 140_000.5 },
      { ...p, continuousSinceMonoMs: Infinity }, { ...p, observedThroughMonoMs: 199_999 },
      { ...p, observedThroughMonoMs: 200_000.5 }, { ...p, lostThroughMonoMs: undefined },
      { ...p, lostThroughMonoMs: -1 }, { ...p, lostThroughMonoMs: NaN },
      { ...p, lostThroughMonoMs: 200_001 }, { ...p, lostThroughMonoMs: 140_000 }];
    let calls = 0;
    const model = { name: "coverage-fixture", decide: async () => { calls += 1; return {
      choice: "hold", probabilities: { buy: 0.1, sell: 0.1, hold: 0.8 },
    }; } };
    for (const coverage of invalid) {
      const value = { ...base, coverage } as TapeInput;
      expect(buildTapeState(value)).toEqual({ ok: false, reasons: ["trades_unavailable"] });
      const read = await runJevRead(value, { now: () => NOW, readId: () => "coverage-negative", clockOffsetMs: 0, model });
      expect(read.insufficient).toEqual(["trades_unavailable"]);
      expect(read.state).toBeNull();
      expect(read.decision).toBeNull();
    }
    expect(calls).toBe(0);
    for (const coverage of [
      { ...p, acknowledgedAtMonoMs: 140_000, continuousSinceMonoMs: 140_000 },
      { ...p, lostThroughMonoMs: 139_999.5 },
    ]) {
      expect(buildTapeState({ ...base, coverage }).ok).toBe(true);
      const read = await runJevRead({ ...base, coverage }, { now: () => NOW, readId: () => "coverage-positive", clockOffsetMs: 0, model });
      expect(read.insufficient).toEqual([]);
      expect(read.state?.flow60s.count).toBe(0);
      expect(read.execution).toBe("never");
      expect(read.decision?.status).toBe("ok");
    }
    expect(calls).toBe(2);
    const fractional = { ...base, monotonicNowMs: 200_000.5, coverage: { ...p,
      acknowledgedAtMonoMs: 140_000.5, continuousSinceMonoMs: 140_000.5, observedThroughMonoMs: 200_000.5 } };
    expect(buildTapeState(fractional).ok).toBe(true);
  });

  test("when the trades channel is not live the flow is unknown, so Jev is not asked", () => {
    expect(buildTapeState(input({ tradesLive: false }))).toEqual({ ok: false, reasons: ["trades_unavailable"] });
  });

  test("it is reported after the other reasons", () => {
    expect(buildTapeState(input({ book: null, tradesLive: false }))).toEqual({ ok: false, reasons: ["book_missing", "trades_unavailable"] });
  });
});
