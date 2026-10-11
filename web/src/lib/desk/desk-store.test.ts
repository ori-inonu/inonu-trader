import { describe, expect, test } from "bun:test";
import { bookChecksum } from "./book";
import { CANDLES_CAP, FLOW_CAP, LIQUIDITY_CAP, TRADES_CAP } from "./desk-merge";
import {
  createDeskModel,
  createDeskStore,
  reduceDesk,
  withMetrics,
  type DeskEffect,
  type DeskEvent,
  type DeskModel,
} from "./desk-store";
import { FakeClock, candleRow, tickerRow, tradeRow } from "./desk-test-kit";
import type { OkxWsMessage } from "./okx-ws";
import type { DeskBar, DeskFeedStatus, DeskState } from "./types";

const NOW = 1_700_000_000_000;
type Lvl = [string, string, string, string];
const lvl = (px: string, sz: string): Lvl => [px, sz, "0", "1"];

function run(model: DeskModel, events: readonly DeskEvent[]): { model: DeskModel; effects: DeskEffect[] } {
  let current = model;
  const effects: DeskEffect[] = [];
  for (const event of events) {
    const result = reduceDesk(current, event);
    current = result.model;
    effects.push(...result.effects);
  }
  return { model: current, effects };
}

function started(focus = "BTC-USDT", bar: DeskBar = "1m", watchlist: readonly string[] = ["BTC-USDT", "ETH-USDT"], skewMs: number | null = 0): DeskModel {
  return run(createDeskModel(focus, bar, watchlist), [{ type: "focus", focus, bar, nowMs: NOW }, { type: "skew", skewMs }]).model;
}

const msg = (channel: string, instId: string, data: unknown[], action: OkxWsMessage["action"] = null, nowMs = NOW): DeskEvent => ({
  type: "message",
  message: { arg: { channel, instId }, action, data },
  nowMs,
});

const live = (id: DeskFeedStatus["id"] = "okx-public-ws", state: DeskFeedStatus["state"] = "live"): DeskEvent => ({
  type: "feed",
  status: { id, state, lastMessageAtMs: NOW, freshnessMs: 5_000, reconnects: 0, detail: state === "live" ? null : "x" },
});

const bookRow = (bids: Lvl[], asks: Lvl[], seqId: number, prevSeqId: number, extra: Record<string, unknown> = {}) => ({
  bids,
  asks,
  ts: String(NOW),
  seqId,
  prevSeqId,
  checksum: 0,
  ...extra,
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

describe("initial state and focus", () => {
  test("starts empty, with the three owned feeds idle and their freshness windows", () => {
    const model = createDeskModel("BTC-USDT", "1m", ["BTC-USDT", "ETH-USDT"]);
    const s = model.desk;
    expect(s).toMatchObject({ focus: "BTC-USDT", bar: "1m", instrument: null, ticker: null, book: null, trades: [], candles: [], derivatives: null, flow: [], liquidity: [], updatedAtMs: null, clockSkewMs: null });
    expect(s.watchlist).toEqual([
      { instId: "BTC-USDT", ticker: null, spark: [], fundingRate: null },
      { instId: "ETH-USDT", ticker: null, spark: [], fundingRate: null },
    ]);
    expect(s.feeds.map((f) => [f.id, f.state, f.freshnessMs])).toEqual([
      ["okx-public-ws", "idle", 5_000],
      ["okx-business-ws", "idle", 70_000],
      ["okx-public-rest", "idle", 120_000],
    ]);
    expect(Object.values(withMetrics(model, NOW).desk.metrics).every((v) => v === null)).toBe(true);
  });

  test("a focus change clears the instrument data and keeps the watchlist, the feeds and the clock skew", () => {
    let { model } = run(started("BTC-USDT", "1m", ["BTC-USDT", "ETH-USDT"], 69_500), [
      msg("tickers", "ETH-USDT", [tickerRow("ETH-USDT", "3000", 10)]),
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "1", "100", "1", "buy", 1000)]),
      msg("books5", "BTC-USDT", [bookRow([lvl("99", "1")], [lvl("101", "1")], 1, 0)]),
      live(),
    ]);
    expect(model.desk.trades).toHaveLength(1);
    model = run(model, [{ type: "focus", focus: "ETH-USDT", bar: "5m", nowMs: NOW + 5 }]).model;
    expect(model.desk).toMatchObject({ focus: "ETH-USDT", bar: "5m", trades: [], book: null, candles: [], flow: [], liquidity: [], instrument: null, derivatives: null, clockSkewMs: 69_500, updatedAtMs: NOW + 5 });
    // The watchlist ticker of the new focus is real data and is reused at once.
    expect(model.desk.ticker?.last).toBe(3000);
    expect(model.desk.watchlist).toHaveLength(2);
    expect(model.desk.feeds.find((f) => f.id === "okx-public-ws")?.state).toBe("live");
    expect(model.focusSinceMs).toBe(NOW + 5);
  });

  test("a bar change drops the candles and ignores the same bar", () => {
    const base = run(started(), [msg("candle1m", "BTC-USDT", [candleRow(60_000, 10)])]).model;
    expect(base.desk.candles).toHaveLength(1);
    expect(reduceDesk(base, { type: "bar", bar: "1m", nowMs: NOW }).model).toBe(base);
    const changed = reduceDesk(base, { type: "bar", bar: "1H", nowMs: NOW }).model;
    expect(changed.desk).toMatchObject({ bar: "1H", candles: [] });
  });

  test("the watchlist event keeps known rows and adds empty ones", () => {
    const { model } = run(started(), [msg("tickers", "ETH-USDT", [tickerRow("ETH-USDT", "3000", 10)]), { type: "watchlist", instIds: ["ETH-USDT", "SOL-USDT"] }]);
    expect(model.desk.watchlist.map((r) => [r.instId, r.ticker?.last ?? null])).toEqual([["ETH-USDT", 3000], ["SOL-USDT", null]]);
  });
});

describe("tickers", () => {
  test("the focus ticker and the watchlist row update from the same message", () => {
    const { model } = run(started(), [msg("tickers", "BTC-USDT", [tickerRow("BTC-USDT", "100.5", 20)])]);
    expect(model.desk.ticker?.last).toBe(100.5);
    expect(model.desk.watchlist[0]?.ticker?.last).toBe(100.5);
    expect(model.desk.watchlist[1]?.ticker).toBeNull();
    expect(model.desk.updatedAtMs).toBe(NOW);
  });

  test("an older tick never replaces a newer one, an equal one does", () => {
    const { model } = run(started(), [
      msg("tickers", "BTC-USDT", [tickerRow("BTC-USDT", "100", 50)]),
      msg("tickers", "BTC-USDT", [tickerRow("BTC-USDT", "90", 40)]),
    ]);
    expect(model.desk.ticker?.last).toBe(100);
    const equal = run(model, [{ type: "ticker", ticker: { ...model.desk.ticker!, last: 101 }, nowMs: NOW }]).model;
    expect(equal.desk.ticker?.last).toBe(101);
  });

  test("tickers of instruments the desk does not show, and rows that fail parsing, are counted not applied", () => {
    const { model } = run(started(), [
      msg("tickers", "DOGE-USDT", [tickerRow("DOGE-USDT", "1", 1)]),
      msg("tickers", "BTC-USDT", [tickerRow("BTC-USDT", "", 1), tickerRow("OTHER-USDT", "1", 1), "junk"]),
    ]);
    expect(model.desk.ticker).toBeNull();
    expect(model.diagnostics.ignoredMessages).toBe(1);
    expect(model.diagnostics.rejectedRows).toBe(3);
  });
});

describe("trades and flow", () => {
  test("newest first, deduplicated by id, with the 1 s flow buckets built from them", () => {
    const { model } = run(started(), [
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "1", "100", "2", "buy", 10_100)]),
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "3", "102", "1", "sell", 12_300), tradeRow("BTC-USDT", "2", "101", "1", "buy", 11_200)]),
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "2", "101", "1", "buy", 11_200)]),
    ]);
    expect(model.desk.trades.map((t) => t.id)).toEqual(["3", "2", "1"]);
    expect(model.desk.flow.map((b) => [b.tsMs, b.buyBase, b.sellBase, b.trades])).toEqual([
      [10_000, 2, 0, 1],
      [11_000, 1, 0, 1],
      [12_000, 0, 1, 1],
    ]);
  });

  test("trades are capped at 200 and the flow at 120 buckets, newest kept", () => {
    const events = Array.from({ length: 260 }, (_, i) => msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", String(i), "100", "1", "buy", 1_000_000 + i * 1000)]));
    const { model } = run(started(), events);
    expect(model.desk.trades).toHaveLength(TRADES_CAP);
    expect(model.desk.trades[0]?.id).toBe("259");
    expect(model.desk.trades[TRADES_CAP - 1]?.id).toBe("60");
    expect(model.desk.flow).toHaveLength(FLOW_CAP);
    expect(model.desk.flow[FLOW_CAP - 1]?.tsMs).toBe(1_000_000 + 259 * 1000);
    expect(model.desk.flow[0]?.tsMs).toBe(1_000_000 + 140 * 1000);
  });

  test("trades for another instrument or with a bad row are not applied", () => {
    const { model } = run(started(), [
      msg("trades", "ETH-USDT", [tradeRow("ETH-USDT", "1", "1", "1", "buy", 1)]),
      msg("trades", "BTC-USDT", [{ ...tradeRow("BTC-USDT", "9", "1", "1", "buy", 5), side: "BUY" }]),
    ]);
    expect(model.desk.trades).toEqual([]);
    expect(model.diagnostics.ignoredMessages).toBe(1);
    expect(model.diagnostics.rejectedRows).toBe(1);
  });

  test("seconds after a feed gap are not zero filled across the outage", () => {
    const local = 1_000_000;
    const start = run(started(), [
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "1", "100", "1", "buy", local)]),
      { type: "gap", nowMs: local + 30_000 },
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "2", "100", "1", "buy", local + 35_200)]),
    ]).model;
    // Skew 0: the outage started right after the first trade; only the seconds after the reconnect are real zeros.
    expect(start.desk.flow.map((b) => b.tsMs)).toEqual([local, local + 30_000, local + 31_000, local + 32_000, local + 33_000, local + 34_000, local + 35_000]);
  });
});

describe("candles", () => {
  test("live bars replace the forming bar, append new ones and keep confirmed bars", () => {
    const { model } = run(started(), [
      msg("candle1m", "BTC-USDT", [candleRow(60_000, 10, false)]),
      msg("candle1m", "BTC-USDT", [candleRow(60_000, 11, false)]),
      msg("candle1m", "BTC-USDT", [candleRow(60_000, 12, true), candleRow(120_000, 20, false)]),
      msg("candle1m", "BTC-USDT", [candleRow(60_000, 99, false)]),
    ]);
    expect(model.desk.candles.map((c) => [c.tsMs, c.close, c.confirmed])).toEqual([[60_000, 12, true], [120_000, 20, false]]);
  });

  test("capped at 300 bars, newest kept, oldest first", () => {
    const rows = Array.from({ length: 320 }, (_, i) => candleRow((i + 1) * 60_000, 10 + (i % 5)));
    const { model } = run(started(), [msg("candle1m", "BTC-USDT", rows)]);
    expect(model.desk.candles).toHaveLength(CANDLES_CAP);
    expect(model.desk.candles[0]?.tsMs).toBe(21 * 60_000);
    expect(model.desk.candles[CANDLES_CAP - 1]?.tsMs).toBe(320 * 60_000);
  });

  test("frames for another bar or instrument (late after a switch) are dropped", () => {
    const { model } = run(started("BTC-USDT", "1m"), [
      msg("candle1H", "BTC-USDT", [candleRow(3_600_000, 10)]),
      msg("candle1m", "ETH-USDT", [candleRow(60_000, 10)]),
    ]);
    expect(model.desk.candles).toEqual([]);
    expect(model.diagnostics.ignoredMessages).toBe(2);
  });

  test("REST history joins the live bars without overwriting a bar the socket already moved", () => {
    const live1 = candleRow(120_000, 20, false);
    const base = run(started(), [msg("candle1m", "BTC-USDT", [live1])]).model;
    const restBars = [60_000, 120_000].map((ts, i) => ({ tsMs: ts, open: 5, high: 6, low: 4, close: 5 + i, volBase: 1, volQuote: 1, confirmed: i === 0 }));
    const { model } = run(base, [{ type: "candles", instId: "BTC-USDT", bar: "1m", candles: restBars, nowMs: NOW }]);
    expect(model.desk.candles.map((c) => [c.tsMs, c.close])).toEqual([[60_000, 5], [120_000, 20]]);
    // A REST answer for another bar is ignored.
    expect(run(base, [{ type: "candles", instId: "BTC-USDT", bar: "1H", candles: restBars, nowMs: NOW }]).model.desk.candles).toHaveLength(1);
  });

  test("a swap focus parses its volumes as base amounts", () => {
    const { model } = run(started("BTC-USDT-SWAP", "1m", []), [msg("candle1m", "BTC-USDT-SWAP", [["60000", "1", "2", "1", "2", "5", "50", "100", "1"]])]);
    expect(model.desk.candles[0]?.volBase).toBe(50);
  });
});

describe("order book", () => {
  const snapshot = (instId = "BTC-USDT") => msg("books", instId, [bookRow([lvl("99", "5"), lvl("98", "5")], [lvl("101", "4"), lvl("102", "4")], 10, -1)], "snapshot");
  const update = (seqId: number, prevSeqId: number, bids: Lvl[] = [], asks: Lvl[] = []) => msg("books", "BTC-USDT", [bookRow(bids, asks, seqId, prevSeqId)], "update");

  test("snapshot then updates build the book and count sequence verified messages", () => {
    const { model, effects } = run(started(), [snapshot(), update(11, 10, [lvl("99", "7")], [lvl("101", "0")]), update(12, 11, [lvl("99.5", "1")])]);
    expect(effects).toEqual([]);
    const book = model.desk.book;
    expect(book?.bids.map((l) => [l.px, l.sz])).toEqual([[99.5, 1], [99, 7], [98, 5]]);
    expect(book?.asks.map((l) => l.px)).toEqual([102]);
    expect(book).toMatchObject({ seqId: 12, checksumOk: null, integrity: "sequence", instId: "BTC-USDT" });
    expect(model.diagnostics.book).toMatchObject({ snapshots: 1, updates: 2, sequenceVerified: 2, resyncs: 0, sequenceBreaks: 0 });
  });

  test("books5 shows only while there is no full book and never replaces a healthy one", () => {
    const five = msg("books5", "BTC-USDT", [{ bids: [lvl("90", "1")], asks: [lvl("110", "1")], ts: String(NOW), seqId: 5 }]);
    let { model } = run(started(), [five]);
    expect(model.desk.book).toMatchObject({ integrity: "snapshot", checksumOk: null });
    expect(model.desk.book?.bids).toHaveLength(1);
    model = run(model, [snapshot()]).model;
    expect(model.desk.book?.integrity).toBe("sequence");
    model = run(model, [five]).model;
    expect(model.desk.book?.integrity).toBe("sequence");
    expect(model.desk.book?.bids[0]?.px).toBe(99);
    expect(model.top5?.bids[0]?.px).toBe(90);
  });

  test("a sequence break resyncs: effect, fallback to books5, updates ignored until the next snapshot", () => {
    const five = msg("books5", "BTC-USDT", [{ bids: [lvl("90", "1")], asks: [lvl("110", "1")], ts: String(NOW), seqId: 5 }]);
    const broken = run(started(), [five, snapshot(), update(20, 15)]);
    expect(broken.effects).toEqual([{ type: "resubscribe", arg: { channel: "books", instId: "BTC-USDT" }, reason: "sequence" }]);
    expect(broken.model.desk.book?.integrity).toBe("snapshot");
    expect(broken.model.awaitingSnapshot).toBe(true);
    expect(broken.model.diagnostics.book).toMatchObject({ sequenceBreaks: 1, resyncs: 1 });
    const stillWaiting = run(broken.model, [update(21, 20, [lvl("99", "9")])]);
    expect(stillWaiting.effects).toEqual([]);
    expect(stillWaiting.model.fullBook).toBeNull();
    const healed = run(stillWaiting.model, [snapshot()]).model;
    expect(healed.awaitingSnapshot).toBe(false);
    expect(healed.desk.book?.integrity).toBe("sequence");
  });

  test("a resync with no books5 in hand leaves no book rather than a stale one", () => {
    const { model, effects } = run(started(), [snapshot(), update(99, 50)]);
    expect(effects).toHaveLength(1);
    expect(model.desk.book).toBeNull();
  });

  test("a verified checksum is reported and a mismatch flags the suspect book and resubscribes", () => {
    const good = bookChecksum([{ pxText: "99", szText: "5" }], [{ pxText: "101", szText: "4" }]);
    const verified = run(started(), [msg("books", "BTC-USDT", [bookRow([lvl("99", "5")], [lvl("101", "4")], 10, -1, { checksum: good })], "snapshot")]);
    expect(verified.model.desk.book).toMatchObject({ checksumOk: true, integrity: "checksum" });
    expect(verified.model.diagnostics.book.checksumVerified).toBe(1);
    const bad = run(started(), [msg("books", "BTC-USDT", [bookRow([lvl("99", "5")], [lvl("101", "4")], 10, -1, { checksum: good + 1 })], "snapshot")]);
    expect(bad.model.desk.book).toMatchObject({ checksumOk: false });
    expect(bad.effects).toEqual([{ type: "resubscribe", arg: { channel: "books", instId: "BTC-USDT" }, reason: "checksum" }]);
    expect(bad.model.diagnostics.book.checksumMismatches).toBe(1);
  });

  test("a gap event distrusts incremental updates until a snapshot arrives", () => {
    const { model } = run(started(), [snapshot(), { type: "gap", nowMs: NOW }, update(11, 10, [lvl("99", "9")])]);
    expect(model.desk.book?.bids[0]?.sz).toBe(5);
    const healed = run(model, [snapshot()]).model;
    expect(healed.awaitingSnapshot).toBe(false);
  });

  test("malformed rows and books for another instrument are counted", () => {
    const { model } = run(started(), [
      snapshot("ETH-USDT"),
      msg("books", "BTC-USDT", [{ bids: "x" }], "snapshot"),
      msg("books", "BTC-USDT", [bookRow([], [], 1, 0)], null),
      msg("books5", "BTC-USDT", [{ junk: true }]),
    ]);
    expect(model.desk.book).toBeNull();
    expect(model.diagnostics.ignoredMessages).toBe(1);
    expect(model.diagnostics.book.malformed).toBe(1);
    expect(model.diagnostics.rejectedRows).toBe(2);
  });
});

describe("derivatives", () => {
  test("the swap event opens the panel, channels merge into it, and the watchlist funding follows", () => {
    const base = run(started("BTC-USDT", "1m", ["BTC-USDT", "ETH-USDT"]), [{ type: "swap", instId: "BTC-USDT-SWAP" }]).model;
    expect(base.desk.derivatives).toMatchObject({ instId: "BTC-USDT-SWAP", fundingRate: null, markPx: null, indexPx: null, openInterest: null, tsMs: null });
    const { model } = run(base, [
      msg("funding-rate", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", fundingRate: "0.0001", fundingTime: "1791748800000", ts: "1791742098598" }]),
      msg("mark-price", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", markPx: "83900.5", ts: "1791742099000" }]),
      msg("open-interest", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", oi: "100", oiUsd: "8390050", ts: "1791742097000" }]),
      msg("index-tickers", "BTC-USDT", [{ instId: "BTC-USDT", idxPx: "83887.6", ts: "1791742100000" }]),
      msg("funding-rate", "ETH-USDT-SWAP", [{ instId: "ETH-USDT-SWAP", fundingRate: "-0.0002", fundingTime: "1791748800000", ts: "1791742098598" }]),
    ]);
    expect(model.desk.derivatives).toEqual({
      instId: "BTC-USDT-SWAP",
      fundingRate: 0.0001,
      nextFundingTimeMs: 1791748800000,
      markPx: 83900.5,
      indexPx: 83887.6,
      openInterest: 100,
      openInterestUsd: 8390050,
      tsMs: 1791742100000,
    });
    expect(model.desk.watchlist.map((r) => [r.instId, r.fundingRate])).toEqual([["BTC-USDT", 0.0001], ["ETH-USDT", -0.0002]]);
  });

  test("an unparsable field does not overwrite a real value and never becomes zero", () => {
    const base = run(started(), [
      { type: "swap", instId: "BTC-USDT-SWAP" },
      msg("mark-price", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", markPx: "50", ts: "10" }]),
    ]).model;
    const { model } = run(base, [msg("mark-price", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", markPx: "NaN", ts: "20" }])]);
    expect(model.desk.derivatives?.markPx).toBe(50);
  });

  test("without a perpetual the panel stays null and its channels are ignored", () => {
    const { model } = run(started(), [
      { type: "swap", instId: null },
      msg("mark-price", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", markPx: "50", ts: "10" }]),
    ]);
    expect(model.desk.derivatives).toBeNull();
    const closed = run(run(started(), [{ type: "swap", instId: "BTC-USDT-SWAP" }]).model, [{ type: "swap", instId: null }]).model;
    expect(closed.desk.derivatives).toBeNull();
  });

  test("announcing the same perpetual again keeps what was collected", () => {
    const { model } = run(started(), [
      { type: "swap", instId: "BTC-USDT-SWAP" },
      msg("mark-price", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", markPx: "50", ts: "10" }]),
      { type: "swap", instId: "BTC-USDT-SWAP" },
    ]);
    expect(model.desk.derivatives?.markPx).toBe(50);
  });
});

describe("feeds, instrument, sparklines and skew", () => {
  test("a feed status replaces its own row only", () => {
    const { model } = run(started(), [live("okx-business-ws", "reconnecting")]);
    expect(model.desk.feeds.map((f) => [f.id, f.state])).toEqual([["okx-public-ws", "idle"], ["okx-business-ws", "reconnecting"], ["okx-public-rest", "idle"]]);
  });

  test("the instrument is accepted for the focus only", () => {
    const instrument = { instId: "BTC-USDT", instType: "SPOT" as const, base: "BTC", quote: "USDT", tickSz: "0.1", lotSz: "0.001" };
    expect(run(started(), [{ type: "instrument", instrument, nowMs: NOW }]).model.desk.instrument).toEqual(instrument);
    const other = started();
    expect(reduceDesk(other, { type: "instrument", instrument: { ...instrument, instId: "ETH-USDT" }, nowMs: NOW }).model).toBe(other);
  });

  test("sparklines land on their row and drop non finite closes", () => {
    const { model } = run(started(), [{ type: "spark", instId: "ETH-USDT", closes: [1, Number.NaN, 3, Number.POSITIVE_INFINITY, 5] }]);
    expect(model.desk.watchlist[1]?.spark).toEqual([1, 3, 5]);
    expect(reduceDesk(model, { type: "spark", instId: "NOPE-USDT", closes: [1] }).model).toBe(model);
  });

  test("the skew event sets the contract field and ignores repeats", () => {
    const model = started("BTC-USDT", "1m", [], null);
    expect(model.desk.clockSkewMs).toBeNull();
    const set = reduceDesk(model, { type: "skew", skewMs: 69_500 }).model;
    expect(set.desk.clockSkewMs).toBe(69_500);
    expect(reduceDesk(set, { type: "skew", skewMs: 69_500 }).model).toBe(set);
    expect(reduceDesk(set, { type: "skew", skewMs: null }).model.desk.clockSkewMs).toBeNull();
  });
});

describe("tick: zero filled seconds and liquidity slices", () => {
  const withBookAndTrade = (skew: number | null = 0) =>
    run(started("BTC-USDT", "1m", ["BTC-USDT"], skew), [
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "1", "100", "1", "buy", 10_000)]),
      msg("books", "BTC-USDT", [bookRow([lvl("99.99", "5")], [lvl("100.01", "4")], 10, -1)], "snapshot"),
      live(),
    ]).model;

  test("while the public feed is live the flow is extended with real zero seconds on the exchange clock", () => {
    const model = withBookAndTrade(0);
    const { model: next } = { model: reduceDesk(model, { type: "tick", nowMs: 13_400 }).model };
    expect(next.desk.flow.map((b) => b.tsMs)).toEqual([10_000, 11_000, 12_000, 13_000]);
    // A browser clock 70 s behind: the exchange clock is local + skew, and that is what the buckets follow.
    const behind = withBookAndTrade(70_000);
    expect(reduceDesk(behind, { type: "tick", nowMs: 13_400 - 70_000 }).model.desk.flow.map((b) => b.tsMs)).toEqual([10_000, 11_000, 12_000, 13_000]);
  });

  test("without a measured skew the time based series wait instead of guessing", () => {
    const model = withBookAndTrade(null);
    const next = reduceDesk(model, { type: "tick", nowMs: 13_400 }).model;
    expect(next.desk.flow).toHaveLength(1);
    expect(next.desk.liquidity).toEqual([]);
  });

  test("when the feed is not live nothing is filled, and the gap floor follows the clock", () => {
    const stale = run(withBookAndTrade(0), [live("okx-public-ws", "stale"), { type: "tick", nowMs: 20_000 }]).model;
    expect(stale.desk.flow).toHaveLength(1);
    expect(stale.flowGapFloorMs).toBe(20_000);
    const back = run(stale, [live(), { type: "tick", nowMs: 23_100 }]).model;
    expect(back.desk.flow.map((b) => b.tsMs)).toEqual([10_000, 20_000, 21_000, 22_000, 23_000]);
  });

  test("one liquidity slice per second at most, stamped in exchange time, capped at 90", () => {
    let model = withBookAndTrade(500);
    model = reduceDesk(model, { type: "tick", nowMs: 100_000 }).model;
    expect(model.desk.liquidity).toHaveLength(1);
    expect(model.desk.liquidity[0]?.tsMs).toBe(100_500);
    expect(model.desk.liquidity[0]?.bins).toHaveLength(60);
    expect(model.desk.liquidity[0]?.midPx).toBeCloseTo(100, 8);
    model = reduceDesk(model, { type: "tick", nowMs: 100_400 }).model;
    expect(model.desk.liquidity).toHaveLength(1);
    for (let i = 1; i <= 100; i += 1) model = reduceDesk(model, { type: "tick", nowMs: 100_000 + i * 1000 }).model;
    expect(model.desk.liquidity).toHaveLength(LIQUIDITY_CAP);
    expect(model.desk.liquidity[LIQUIDITY_CAP - 1]?.tsMs).toBe(200_500);
  });

  test("a books5 only view yields no slices because five levels say nothing about depth", () => {
    const model = run(started(), [
      msg("books5", "BTC-USDT", [{ bids: [lvl("99", "1")], asks: [lvl("101", "1")], ts: String(NOW), seqId: 1 }]),
      live(),
      { type: "tick", nowMs: 50_000 },
    ]).model;
    expect(model.desk.liquidity).toEqual([]);
  });
});

describe("metrics follow the exchange clock", () => {
  test("a browser clock a minute behind still sees the 60 s flow window", () => {
    const exchangeNowMs = 1_000_000;
    const local = exchangeNowMs - 69_500;
    let model = run(started("BTC-USDT", "1m", ["BTC-USDT"], 69_500), [
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "1", "100", "2", "buy", exchangeNowMs - 30_000), tradeRow("BTC-USDT", "2", "100", "1", "sell", exchangeNowMs - 5_000)]),
      msg("books", "BTC-USDT", [bookRow([lvl("99.99", "5")], [lvl("100.01", "4")], 10, -1)], "snapshot"),
    ]).model;
    model = { ...model, focusSinceMs: local - 60_000 };
    const m = withMetrics(model, local).desk.metrics;
    expect(m.buyVolBase60s).toBe(2);
    expect(m.sellVolBase60s).toBe(1);
    expect(m.flowImbalance60s).toBeCloseTo(1 / 3, 12);
    expect(m.cvd).toBe(1);
    expect(m.midPx).toBeCloseTo(100, 8);
  });
});

describe("immutability", () => {
  test("no reducer step mutates its input, even a deeply frozen one", () => {
    let model = deepFreeze(started("BTC-USDT", "1m", ["BTC-USDT", "ETH-USDT"]));
    const events: DeskEvent[] = [
      msg("tickers", "BTC-USDT", [tickerRow("BTC-USDT", "100", 10)]),
      msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", "1", "100", "1", "buy", 10_100), tradeRow("BTC-USDT", "2", "100", "1", "sell", 12_100)]),
      msg("candle1m", "BTC-USDT", [candleRow(60_000, 10, false)]),
      msg("candle1m", "BTC-USDT", [candleRow(60_000, 11, true)]),
      msg("books", "BTC-USDT", [bookRow([lvl("99", "5")], [lvl("101", "4")], 10, -1)], "snapshot"),
      msg("books", "BTC-USDT", [bookRow([lvl("99", "6")], [], 11, 10)], "update"),
      msg("books", "BTC-USDT", [bookRow([], [], 99, 50)], "update"),
      msg("books5", "BTC-USDT", [{ bids: [lvl("90", "1")], asks: [lvl("110", "1")], ts: String(NOW), seqId: 1 }]),
      { type: "swap", instId: "BTC-USDT-SWAP" },
      msg("mark-price", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", markPx: "50", ts: "10" }]),
      msg("funding-rate", "BTC-USDT-SWAP", [{ instId: "BTC-USDT-SWAP", fundingRate: "0.1", fundingTime: "5", ts: "6" }]),
      { type: "spark", instId: "ETH-USDT", closes: [1, 2] },
      { type: "candles", instId: "BTC-USDT", bar: "1m", candles: [], nowMs: NOW },
      live(),
      { type: "tick", nowMs: 14_000 },
      { type: "gap", nowMs: 15_000 },
      { type: "watchlist", instIds: ["ETH-USDT"] },
      { type: "bar", bar: "5m", nowMs: NOW },
      { type: "focus", focus: "ETH-USDT", bar: "5m", nowMs: NOW },
      { type: "skew", skewMs: 12 },
    ];
    for (const event of events) {
      const before = JSON.stringify(model);
      const result = reduceDesk(model, deepFreeze(event));
      expect(JSON.stringify(model)).toBe(before);
      model = deepFreeze(result.model);
    }
    expect(withMetrics(model, NOW).desk).not.toBe(model.desk);
  });

  test("ignored events return the very same model", () => {
    const model = started();
    expect(reduceDesk(model, { type: "tick", nowMs: NOW }).model).toBe(model);
    expect(reduceDesk(model, { type: "swap", instId: null }).model).toBe(model);
    expect(reduceDesk(model, { type: "spark", instId: "ZZZ", closes: [] }).model).toBe(model);
  });
});

describe("store: throttle, subscribers, effects", () => {
  function setup() {
    const clock = new FakeClock();
    const effects: DeskEffect[] = [];
    const store = createDeskStore({ focus: "BTC-USDT", bar: "1m", watchlist: ["BTC-USDT"], now: clock.now, timers: clock, onEffect: (e) => effects.push(e) });
    const seen: DeskState[] = [];
    store.subscribe((s) => seen.push(s));
    return { clock, store, seen, effects };
  }
  const trade = (n: number, ts: number): DeskEvent => msg("trades", "BTC-USDT", [tradeRow("BTC-USDT", String(n), "100", "1", "buy", ts)]);

  test("publishes the first change at once and coalesces a burst into one trailing publish about every 100 ms", () => {
    const { clock, store, seen } = setup();
    const initial = store.getState();
    store.dispatch({ type: "focus", focus: "BTC-USDT", bar: "1m", nowMs: clock.nowMs });
    expect(seen).toHaveLength(1);
    for (let i = 1; i <= 50; i += 1) store.dispatch(trade(i, clock.nowMs + i));
    expect(seen).toHaveLength(1);
    expect(store.getState()).toBe(seen[0]!);
    clock.advance(99);
    expect(seen).toHaveLength(1);
    clock.advance(1);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.trades).toHaveLength(50);
    expect(store.getState()).toBe(seen[1]!);
    expect(store.getState()).not.toBe(initial);
    clock.advance(1_000);
    expect(seen).toHaveLength(2);
    store.dispatch(trade(51, clock.nowMs));
    expect(seen).toHaveLength(3);
    const rate = (): number => seen.length;
    for (let i = 0; i < 1000; i += 1) {
      clock.advance(10);
      store.dispatch(trade(100 + i, clock.nowMs));
    }
    clock.advance(100);
    expect(rate() - 3).toBeLessThanOrEqual(110); // 10 s of constant traffic is about 100 publishes
    expect(rate() - 3).toBeGreaterThanOrEqual(90);
  });

  test("no publish when the event changes nothing", () => {
    const { clock, store, seen } = setup();
    store.dispatch({ type: "swap", instId: null });
    store.dispatch({ type: "tick", nowMs: clock.nowMs });
    clock.advance(500);
    expect(seen).toHaveLength(0);
  });

  test("metrics are recomputed at publish time and unsubscribe stops notifications", () => {
    const { clock, store, seen } = setup();
    store.dispatch({ type: "focus", focus: "BTC-USDT", bar: "1m", nowMs: clock.nowMs });
    store.dispatch({ type: "skew", skewMs: 0 });
    store.dispatch(msg("tickers", "BTC-USDT", [tickerRow("BTC-USDT", "110", 5, { open24h: "100" })]));
    store.flush();
    expect(store.getState().metrics.change24hPct).toBeCloseTo(10, 10);
    const countBefore = seen.length;
    const stop = store.subscribe(() => {});
    stop();
    store.dispose();
    store.dispatch(trade(1, clock.nowMs));
    clock.advance(1_000);
    expect(seen.length).toBe(countBefore);
  });

  test("book effects reach the controller through onEffect", () => {
    const { store, effects, clock } = setup();
    store.dispatch({ type: "focus", focus: "BTC-USDT", bar: "1m", nowMs: clock.nowMs });
    store.dispatch(msg("books", "BTC-USDT", [bookRow([lvl("99", "1")], [lvl("101", "1")], 10, -1)], "snapshot"));
    store.dispatch(msg("books", "BTC-USDT", [bookRow([], [], 50, 40)], "update"));
    expect(effects).toEqual([{ type: "resubscribe", arg: { channel: "books", instId: "BTC-USDT" }, reason: "sequence" }]);
  });

  test("a subscriber that unsubscribes while being notified does not break the others", () => {
    const { clock, store } = setup();
    const calls: string[] = [];
    const stopA = store.subscribe(() => {
      calls.push("a");
      stopA();
    });
    store.subscribe(() => calls.push("b"));
    store.dispatch({ type: "focus", focus: "BTC-USDT", bar: "1m", nowMs: clock.nowMs });
    expect(calls).toEqual(["a", "b"]);
  });
});

describe("derivatives seed (REST bootstrap)", () => {
  const swap = "BTC-USDT-SWAP";
  const open = (): DeskModel => run(started(), [{ type: "swap", instId: swap }]).model;
  const funding = { instId: swap, fundingRate: 0.0001, nextFundingTimeMs: 1791748800000, tsMs: 100 };
  const mark = { instId: swap, markPx: 83900.5, tsMs: 300 };
  const oi = { instId: swap, openInterest: 100, openInterestUsd: 8390050, tsMs: 200 };

  test("fills the empty panel from the three readings and stamps it with the newest exchange time", () => {
    const { model } = run(open(), [
      { type: "derivatives-seed", instId: swap, funding, nowMs: NOW + 1 },
      { type: "derivatives-seed", instId: swap, mark, nowMs: NOW + 2 },
      { type: "derivatives-seed", instId: swap, openInterest: oi, nowMs: NOW + 3 },
    ]);
    expect(model.desk.derivatives).toEqual({
      instId: swap,
      fundingRate: 0.0001,
      nextFundingTimeMs: 1791748800000,
      markPx: 83900.5,
      indexPx: null,
      openInterest: 100,
      openInterestUsd: 8390050,
      tsMs: 300,
    });
    expect(model.desk.updatedAtMs).toBe(NOW + 3);
  });

  test("never replaces a field a socket push already delivered", () => {
    const pushed = run(open(), [msg("funding-rate", swap, [{ instId: swap, fundingRate: "0.5", fundingTime: "1791750000000", ts: "5000" }])]).model;
    const { model } = run(pushed, [{ type: "derivatives-seed", instId: swap, funding, mark, nowMs: NOW }]);
    expect(model.desk.derivatives).toMatchObject({ fundingRate: 0.5, nextFundingTimeMs: 1791750000000, markPx: 83900.5, tsMs: 5000 });
  });

  test("a reading for another perpetual, or with no panel open, changes nothing", () => {
    const model = open();
    expect(reduceDesk(model, { type: "derivatives-seed", instId: "ETH-USDT-SWAP", funding: { ...funding, instId: "ETH-USDT-SWAP" }, nowMs: NOW }).model).toBe(model);
    const closed = started();
    expect(reduceDesk(closed, { type: "derivatives-seed", instId: swap, funding, nowMs: NOW }).model).toBe(closed);
    expect(reduceDesk(model, { type: "derivatives-seed", instId: swap, funding: { ...funding, instId: "ETH-USDT-SWAP" }, nowMs: NOW }).model).toBe(model);
  });

  test("an empty reading changes nothing and the input is never mutated", () => {
    const model = deepFreeze(open());
    expect(reduceDesk(model, { type: "derivatives-seed", instId: swap, nowMs: NOW }).model).toBe(model);
    const seeded = reduceDesk(model, deepFreeze({ type: "derivatives-seed" as const, instId: swap, mark, nowMs: NOW })).model;
    expect(seeded.desk.derivatives?.markPx).toBe(83900.5);
    expect(model.desk.derivatives?.markPx).toBeNull();
  });
});
