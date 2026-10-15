// The scan of the opportunity engine: which pairs are read, in which order, what is cached and what a failure does. origin: synthetic_fixture, tests only. No network.
import { describe, expect, test } from "bun:test";
import type { DayCandle } from "./factors";
import { OpportunityDataError, type OkxDaily, type Ticker } from "./okx-daily";
import { BOARD_TTL_MS, CANDLES_TTL_MS, createScanner, liquidPairs, liveSeries, rank, RETRY_AFTER_ERROR_MS, spreadBps, type OpportunityPair } from "./scan";

const DAY = 86_400_000;

const ticker = (instId: string, over: Partial<Ticker> = {}): Ticker => ({ instId, last: 100, open24h: 98, high24h: 101, low24h: 97, volQuote24h: 5_000_000, bid: 99.99, ask: 100.01, tsMs: 1, ...over });

const day = (i: number, close: number, vol = 1_000_000): DayCandle => ({ ts: i * DAY, open: close, high: close * 1.01, low: close * 0.99, close, volQuote: vol });
const flat = (n = 100, level = 100): DayCandle[] => Array.from({ length: n }, (_, i) => day(i, level));
/** 90 days falling from 200 to 100, then days at 100: cheap against itself. */
const cheap = (): DayCandle[] => [...Array.from({ length: 90 }, (_, i) => day(i, 200 - (100 * i) / 89)), ...Array.from({ length: 10 }, (_, k) => day(90 + k, 100))];

function fakeOkx(series: Record<string, DayCandle[]>, tickers: Ticker[], counters = { tickers: 0, daily: 0 }): OkxDaily & { counters: typeof counters } {
  return {
    counters,
    async tickers() {
      counters.tickers += 1;
      return { tickers, rejected: 0 };
    },
    async daily(instId) {
      counters.daily += 1;
      const candles = series[instId];
      if (candles === undefined) throw new OpportunityDataError("http");
      return { candles, rejected: 0 };
    },
    async history() {
      return { candles: [], rejected: 0 };
    },
  };
}

describe("which pairs are read", () => {
  test("liquid, tight spread, not a stable coin, most traded first", () => {
    const list = liquidPairs([
      ticker("AAA-USDT", { volQuote24h: 3_000_000 }),
      ticker("BBB-USDT", { volQuote24h: 9_000_000 }),
      ticker("CCC-USDT", { volQuote24h: 500_000 }),
      ticker("DDD-USDT", { bid: 99, ask: 101 }),
      ticker("USDC-USDT", { volQuote24h: 99_000_000 }),
      ticker("EEE-USDT", { bid: null }),
    ]);
    expect(list.map((t) => t.instId)).toEqual(["BBB-USDT", "AAA-USDT"]);
  });

  test("the spread is in basis points of the mid, and null when a side is missing or crossed", () => {
    expect(spreadBps({ bid: 99.99, ask: 100.01 })).toBeCloseTo(2, 5);
    expect(spreadBps({ bid: null, ask: 1 })).toBeNull();
    expect(spreadBps({ bid: 2, ask: 1 })).toBeNull();
  });
});

describe("today in the series", () => {
  test("is made of the ticker: the last price and the volume of 24 hours, with the range widened by the price", () => {
    const series = liveSeries(flat(100), ticker("AAA-USDT", { last: 103, volQuote24h: 7_000_000 }))!;
    const today = series[series.length - 1]!;
    expect(series).toHaveLength(100);
    expect(today).toMatchObject({ close: 103, volQuote: 7_000_000 });
    expect(today.high).toBeCloseTo(103, 9);
    expect(liveSeries(flat(50), ticker("AAA-USDT"))).toBeNull();
  });
});

describe("the order", () => {
  const pair = (instId: string, attention: number, vol: number, count = 0): OpportunityPair =>
    ({ instId, base: instId.split("-")[0]!, price: 1, change24h: 0, volQuote24h: vol, spreadBps: 1, attention, moveAtr: null, read: { count } as never });

  test("what is most out of the ordinary for its own normal first, then more money traded; the count of cheap readings does not move a pair", () => {
    const order = rank([pair("A-USDT", 0.2, 1, 3), pair("B-USDT", 1.5, 1, 0), pair("C-USDT", 0.9, 1, 0), pair("D-USDT", 0.9, 99, 0), pair("E-USDT", 0.9, 99, 3)]).map((p) => p.instId);
    expect(order).toEqual(["B-USDT", "D-USDT", "E-USDT", "C-USDT", "A-USDT"]);
  });
});

describe("the scan", () => {
  const universe = [ticker("CHEAP-USDT", { last: 100 }), ticker("FLAT-USDT", { last: 100 }), ticker("GONE-USDT", { last: 100 }), ticker("THIN-USDT", { last: 100, volQuote24h: 10 })];
  const series = { "CHEAP-USDT": cheap(), "FLAT-USDT": flat(100) };

  test("reads the liquid pairs, counts those that failed and orders by factors that hold", async () => {
    const okx = fakeOkx(series, universe);
    const scanner = createScanner({ okx });
    expect(scanner.look().state).toBe("lendo");
    await scanner.settled();
    const state = scanner.look();
    expect(state.state).toBe("pronto");
    if (state.state !== "pronto") throw new Error("not ready");
    expect(state.board.universe).toEqual({ listed: 4, liquid: 3, read: 2, failed: 1 });
    const cheapPair = state.board.pairs.find((p) => p.instId === "CHEAP-USDT")!;
    expect(cheapPair.read.held.desconto).toBe(true);
    expect(cheapPair.change24h).toBeCloseTo(100 / 98 - 1, 9);
    // today is 2% up against a pair that moves 1% to 2% a day: it is more out of the ordinary than the flat one
    expect(cheapPair.attention).toBeGreaterThan(0);
    expect(cheapPair.moveAtr).toBeGreaterThan(0);
    expect(state.board.pairs.map((p) => p.attention)).toEqual([...state.board.pairs.map((p) => p.attention)].sort((a, b) => b - a));
  });

  test("a second look while it reads starts nothing more, and a board inside its time to live is not read again", async () => {
    let t = 1_000;
    const okx = fakeOkx(series, universe);
    const scanner = createScanner({ okx, now: () => t });
    scanner.look();
    scanner.look();
    await scanner.settled();
    expect(okx.counters.tickers).toBe(1);
    t += BOARD_TTL_MS - 1;
    scanner.look();
    await scanner.settled();
    expect(okx.counters.tickers).toBe(1);
  });

  test("an old board is read again, and the daily candles inside their time to live are not asked twice", async () => {
    let t = 1_000;
    const okx = fakeOkx(series, universe);
    const scanner = createScanner({ okx, now: () => t });
    scanner.look();
    await scanner.settled();
    const first = okx.counters.daily;
    t += BOARD_TTL_MS + 1;
    expect(BOARD_TTL_MS).toBeLessThan(CANDLES_TTL_MS);
    scanner.look();
    await scanner.settled();
    expect(okx.counters.tickers).toBe(2);
    // GONE-USDT failed and so was asked again; the two that were read were not
    expect(okx.counters.daily - first).toBe(1);
  });

  test("while it reads, the last board stays on offer", async () => {
    let t = 1_000;
    const okx = fakeOkx(series, universe);
    const scanner = createScanner({ okx, now: () => t });
    scanner.look();
    await scanner.settled();
    t += BOARD_TTL_MS + 1;
    const state = scanner.look();
    expect(state.state).toBe("lendo");
    expect(state.state === "lendo" && state.board?.pairs.length).toBe(2);
    await scanner.settled();
  });

  test("an exchange that does not answer is an error with a constant code, and the next try waits", async () => {
    let t = 1_000;
    const failing: OkxDaily = {
      tickers: async () => {
        throw new OpportunityDataError("timeout");
      },
      daily: async () => ({ candles: [], rejected: 0 }),
      history: async () => ({ candles: [], rejected: 0 }),
    };
    let asked = 0;
    const counting: OkxDaily = { ...failing, tickers: async () => (asked += 1, failing.tickers()) };
    const scanner = createScanner({ okx: counting, now: () => t });
    scanner.look();
    await scanner.settled();
    expect(scanner.look()).toEqual({ state: "erro", code: "timeout", board: null });
    await scanner.settled();
    expect(asked).toBe(1);
    t += RETRY_AFTER_ERROR_MS + 1;
    scanner.look();
    await scanner.settled();
    expect(asked).toBe(2);
  });
});
