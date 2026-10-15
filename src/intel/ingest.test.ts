// T5.1 / ING-1 to ING-4, AC-ING-1, AC-ING-2: ticks become bars of 1 s, 5 s and 1 min by EVENT time, a bounded queue counts
// what it drops, and messages per second are measured per source. Pure: the clock only ever arrives as a parameter.
import { describe, expect, test } from "bun:test";
import { createCoalescer, createRateMeter, createTradeQueue, type Trade } from "./ingest";

const T0 = 1_800_000_000_000; // aligned to 1 s, 5 s and 1 min
const trade = (dt: number, px: string, sz: string, side: "buy" | "sell" = "buy"): Trade => ({ ts: T0 + dt, px, sz, side });

describe("coalescer: ticks in, closed bars out (ING-1, ING-2)", () => {
  test("14 ticks over 7 s give 6 closed 1 s bars and 1 closed 5 s bar, and nothing is emitted before a bar closes", () => {
    const c = createCoalescer();
    const closed: ReturnType<typeof c.add> = [];
    const perCall: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      const out = c.add("BTC-USDT", trade(i * 500, "100.0", "1", i % 2 === 0 ? "buy" : "sell"));
      perCall.push(out.length);
      closed.push(...out);
    }
    expect(closed.filter((b) => b.spanMs === 1000)).toHaveLength(6);
    expect(closed.filter((b) => b.spanMs === 5000)).toHaveLength(1);
    expect(closed.filter((b) => b.spanMs === 60000)).toHaveLength(0);
    // a 1 s bar closes only when an event at or after its end arrives: ticks 0, 500 are in bar 0, tick 1000 closes it
    expect(perCall.slice(0, 3)).toEqual([0, 0, 1]);
    const five = closed.find((b) => b.spanMs === 5000)!;
    expect(five).toMatchObject({ instId: "BTC-USDT", start: T0, trades: 10, buys: 5, sells: 5, buyVolume: "5", sellVolume: "5" });
  });

  test("a bar carries open, high, low, close by event time (not arrival order), counts and exact volumes", () => {
    const c = createCoalescer({ spans: [1000] });
    c.add("X", trade(300, "101.5", "2", "buy"));
    c.add("X", trade(100, "100.0", "1.5", "sell")); // earlier in event time, arrives later: it is the open
    c.add("X", trade(900, "99.5", "0.25", "sell"));
    c.add("X", trade(600, "102.0", "3", "buy"));
    const [bar] = c.add("X", trade(1000, "100.0", "1", "buy"));
    expect(bar).toMatchObject({ spanMs: 1000, start: T0, open: "100.0", high: "102.0", low: "99.5", close: "99.5", trades: 4, buys: 2, sells: 2, buyVolume: "5", sellVolume: "1.75" });
  });

  test("a trade older than the oldest open bar is late: counted, never reopens a closed bar", () => {
    const c = createCoalescer({ spans: [1000] });
    c.add("X", trade(100, "100", "1"));
    c.add("X", trade(2500, "100", "1")); // closes bars 0 and 1000
    const out = c.add("X", trade(200, "100", "5"));
    expect(out).toEqual([]);
    expect(c.stats()).toMatchObject({ late: 1 });
  });

  test("invalid ticks are counted and ignored: bad decimals, zero or negative size, unknown side, bad time", () => {
    const c = createCoalescer({ spans: [1000] });
    const bad: Trade[] = [
      { ts: T0, px: "abc", sz: "1", side: "buy" },
      { ts: T0, px: "100", sz: "0", side: "buy" },
      { ts: T0, px: "100", sz: "-1", side: "buy" },
      { ts: T0, px: "0", sz: "1", side: "buy" },
      { ts: T0, px: "100", sz: "1", side: "hold" as never },
      { ts: -5, px: "100", sz: "1", side: "buy" },
      { ts: 1.5, px: "100", sz: "1", side: "buy" },
      { ts: Number.NaN, px: "100", sz: "1", side: "buy" },
    ];
    for (const t of bad) expect(c.add("X", t)).toEqual([]);
    expect(c.stats()).toMatchObject({ invalid: 8, late: 0, openBars: 0 });
  });

  test("advance(ts) closes the bars the clock has passed even when no tick arrives (a quiet market)", () => {
    const c = createCoalescer();
    c.add("X", trade(100, "100", "1"));
    const closed = c.advance(T0 + 2000);
    expect(closed.map((b) => [b.spanMs, b.start])).toEqual([[1000, T0]]);
    expect(c.advance(T0 + 5000).map((b) => [b.spanMs, b.start])).toEqual([[5000, T0]]);
    expect(c.advance(T0 + 5000)).toEqual([]); // nothing closes twice
  });

  test("the order book snapshot kept in a bar is the last one by time; a bar of book only has no prices", () => {
    const c = createCoalescer({ spans: [1000] });
    c.addBook("X", { ts: T0 + 200, bids: [["100", "5"]], asks: [["101", "4"]] });
    c.addBook("X", { ts: T0 + 800, bids: [["100", "7"]], asks: [["101", "3"]] });
    c.addBook("X", { ts: T0 + 500, bids: [["100", "1"]], asks: [["101", "1"]] }); // older, arrives later: ignored
    const [bar] = c.advance(T0 + 1000);
    expect(bar).toMatchObject({ trades: 0, open: null, high: null, low: null, close: null, buyVolume: "0", sellVolume: "0" });
    expect(bar!.book).toEqual({ ts: T0 + 800, bids: [["100", "7"]], asks: [["101", "3"]] });
  });

  test("instruments do not mix", () => {
    const c = createCoalescer({ spans: [1000] });
    c.add("A", trade(100, "10", "1"));
    c.add("B", trade(100, "20", "1"));
    c.add("A", trade(1500, "10", "1"));
    const closedB = c.add("B", trade(1500, "20", "1"));
    expect(closedB).toHaveLength(1);
    expect(closedB[0]).toMatchObject({ instId: "B", open: "20" });
  });

  test("the same input twice gives byte-identical output", () => {
    const run = () => {
      const c = createCoalescer();
      const out: unknown[] = [];
      for (let i = 0; i < 200; i += 1) out.push(...c.add("X", trade(i * 137, String(100 + (i % 7)), String(1 + (i % 3)), i % 3 === 0 ? "sell" : "buy")));
      return JSON.stringify(out);
    };
    expect(run()).toBe(run());
  });

  test("rejects a span that is not a whole number of milliseconds or that does not divide the next one", () => {
    expect(() => createCoalescer({ spans: [0] })).toThrow();
    expect(() => createCoalescer({ spans: [1500.5] })).toThrow();
    expect(() => createCoalescer({ spans: [] })).toThrow();
  });
});

describe("bounded queue (ING-4)", () => {
  test("keeps the newest maxTrades per instrument and counts what it dropped", () => {
    const q = createTradeQueue({ maxTrades: 5 });
    for (let i = 0; i < 8; i += 1) q.offer("X", trade(i * 10, "100", String(i + 1)));
    expect(q.stats()).toEqual({ size: { X: 5 }, dropped: { X: 3 } });
    expect(q.drain("X").map((t) => t.sz)).toEqual(["4", "5", "6", "7", "8"]);
    expect(q.stats().size).toEqual({ X: 0 });
    expect(q.stats().dropped).toEqual({ X: 3 }); // the count is kept after a drain
  });

  test("a drain hands the batch over in event-time order, ties in arrival order", () => {
    const q = createTradeQueue({ maxTrades: 10 });
    q.offer("X", trade(300, "100", "3"));
    q.offer("X", trade(100, "100", "1"));
    q.offer("X", trade(100, "100", "2"));
    expect(q.drain("X").map((t) => t.sz)).toEqual(["1", "2", "3"]);
  });

  test("queues are per instrument and the default limit is 5000", () => {
    const q = createTradeQueue();
    for (let i = 0; i < 5100; i += 1) q.offer("A", trade(i, "1", "1"));
    q.offer("B", trade(0, "1", "1"));
    expect(q.stats()).toEqual({ size: { A: 5000, B: 1 }, dropped: { A: 100 } });
  });
});

describe("messages per second by source (ING-3, AC-ING-2)", () => {
  test("20 messages in the first 2 s read as 10 per second, per source", () => {
    const m = createRateMeter();
    for (let i = 0; i < 20; i += 1) m.record("okx-trades", T0 + i * 100);
    m.record("okx-books", T0, 3);
    expect(m.perSecond("okx-trades", T0 + 2000)).toBe(10);
    expect(m.perSecond("okx-books", T0 + 2000)).toBe(1.5);
    expect(m.perSecond("unknown", T0 + 2000)).toBe(0);
  });

  test("the rate falls to zero once the window has passed with no messages, and the total stays", () => {
    const m = createRateMeter({ windowMs: 10_000 });
    for (let i = 0; i < 10; i += 1) m.record("s", T0 + i * 100);
    expect(m.perSecond("s", T0 + 30_000)).toBe(0);
    expect(m.snapshot(T0 + 30_000).s).toEqual({ perSecond: 0, total: 10, lastAtMs: T0 + 900 });
  });

  test("only the window counts: 100 messages 20 s ago and 5 in the last second read as 0.5 per second over 10 s", () => {
    const m = createRateMeter({ windowMs: 10_000 });
    for (let i = 0; i < 100; i += 1) m.record("s", T0 + i * 10);
    for (let i = 0; i < 5; i += 1) m.record("s", T0 + 20_000 + i * 100);
    expect(m.perSecond("s", T0 + 20_999)).toBeCloseTo(0.5, 5);
    expect(m.snapshot(T0 + 20_999).s?.total).toBe(105);
  });

  test("memory stays bounded: old seconds are forgotten", () => {
    const m = createRateMeter({ windowMs: 5_000 });
    for (let s = 0; s < 3600; s += 1) m.record("s", T0 + s * 1000);
    expect(m.bucketCount("s")).toBeLessThanOrEqual(6);
  });
});
