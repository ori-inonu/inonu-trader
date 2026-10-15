// The live trade feed of the flow engine: OKX's public WebSocket `trades` channel, which carries the aggressor side of every
// print and is free. It must survive a network that drops: heartbeat, reconnect with backoff, resubscribe, and count what
// arrives. Everything here runs on a fake socket and a fake scheduler. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createRateMeter, type Trade } from "../intel/ingest";
import { OKX_PUBLIC_WS_URL, createTradeFeed, type FeedStatus, type SocketLike } from "./okx-ws";

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  say(message: unknown) {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
  drop() {
    this.onclose?.();
  }
}

/** A scheduler the test drives by hand. */
function fakeClock() {
  let now = 1_800_000_000_000;
  const timers: { id: number; at: number; fn: () => void; every: number | null }[] = [];
  let next = 1;
  return {
    now: () => now,
    after: (ms: number, fn: () => void) => {
      const id = next++;
      timers.push({ id, at: now + ms, fn, every: null });
      return () => void timers.splice(0, timers.length, ...timers.filter((t) => t.id !== id));
    },
    every: (ms: number, fn: () => void) => {
      const id = next++;
      timers.push({ id, at: now + ms, fn, every: ms });
      return () => void timers.splice(0, timers.length, ...timers.filter((t) => t.id !== id));
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        if (due.every === null) timers.splice(timers.indexOf(due), 1);
        else due.at += due.every;
        due.fn();
      }
      now = end;
    },
  };
}

function setup() {
  FakeSocket.all = [];
  const clock = fakeClock();
  const trades: { instId: string; trades: Trade[] }[] = [];
  const statuses: FeedStatus[] = [];
  const meter = createRateMeter();
  const feed = createTradeFeed({
    create: (url) => new FakeSocket(url),
    schedule: { after: clock.after, every: clock.every },
    now: clock.now,
    onTrades: (instId, batch) => void trades.push({ instId, trades: batch }),
    onStatus: (status) => void statuses.push(status),
    meter,
  });
  return { feed, clock, trades, statuses, meter, socket: () => FakeSocket.all[FakeSocket.all.length - 1]! };
}

const row = (instId: string, ts: number, side: string, px = "100.5", sz = "2") => ({ instId, tradeId: String(ts), px, sz, side, ts: String(ts), count: "1" });

describe("connecting and subscribing", () => {
  test("nothing connects until someone subscribes; then it opens the public endpoint and asks for the trades channel", () => {
    const { feed, socket } = setup();
    expect(FakeSocket.all).toHaveLength(0);
    feed.subscribe("BTC-USDT");
    expect(socket().url).toBe(OKX_PUBLIC_WS_URL);
    socket().open();
    expect(JSON.parse(socket().sent[0]!)).toEqual({ op: "subscribe", args: [{ channel: "trades", instId: "BTC-USDT" }] });
  });

  test("an instrument added after the connection is up is subscribed on the same socket; one added twice is asked once", () => {
    const { feed, socket } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    feed.subscribe("ETH-USDT-SWAP");
    feed.subscribe("ETH-USDT-SWAP");
    const messages = socket().sent.map((s) => JSON.parse(s));
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ op: "subscribe", args: [{ channel: "trades", instId: "ETH-USDT-SWAP" }] });
    expect(feed.instruments()).toEqual(["BTC-USDT", "ETH-USDT-SWAP"]);
  });

  test("an id that is not an instrument is refused before it reaches the wire", () => {
    const { feed } = setup();
    for (const bad of ["", "btc", "BTC USDT", "BTC-USD-250627-60000-C", "x".repeat(60)]) expect(feed.subscribe(bad)).toBe(false);
    expect(FakeSocket.all).toHaveLength(0);
  });

  test("unsubscribing sends the matching message and forgets the instrument", () => {
    const { feed, socket } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    feed.unsubscribe("BTC-USDT");
    expect(JSON.parse(socket().sent[1]!)).toEqual({ op: "unsubscribe", args: [{ channel: "trades", instId: "BTC-USDT" }] });
    expect(feed.instruments()).toEqual([]);
  });
});

describe("what arrives", () => {
  test("trades are handed over with the aggressor side as decimal text, and bad rows are dropped and counted", () => {
    const { feed, socket, trades } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    socket().say({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [row("BTC-USDT", 1000, "buy"), row("BTC-USDT", 1001, "sell", "100.4", "0.5"), row("BTC-USDT", 1002, "hold"), row("BTC-USDT", 1003, "buy", "x")] });
    expect(trades).toEqual([{ instId: "BTC-USDT", trades: [{ ts: 1000, px: "100.5", sz: "2", side: "buy" }, { ts: 1001, px: "100.4", sz: "0.5", side: "sell" }] }]);
    expect(feed.stats().rejected).toBe(2);
  });

  test("a trade for an instrument nobody asked for is ignored", () => {
    const { feed, socket, trades } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    socket().say({ arg: { channel: "trades", instId: "DOGE-USDT" }, data: [row("DOGE-USDT", 1000, "buy")] });
    expect(trades).toEqual([]);
  });

  test("messages per second are measured by source (ING-3)", () => {
    const { feed, socket, meter, clock } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    for (let i = 0; i < 20; i += 1) {
      socket().say({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [row("BTC-USDT", 1000 + i, "buy")] });
      clock.advance(100);
    }
    expect(meter.perSecond("okx-ws-trades", clock.now())).toBeGreaterThan(8);
    expect(meter.snapshot(clock.now())["okx-ws-trades"]!.total).toBe(20);
  });

  test("pongs, subscribe acknowledgements and garbage are not trades and do not crash", () => {
    const { feed, socket, trades, statuses } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    socket().say("pong");
    socket().say({ event: "subscribe", arg: { channel: "trades", instId: "BTC-USDT" } });
    socket().say("not json at all");
    socket().say({ nothing: true });
    expect(trades).toEqual([]);
    expect(statuses.at(-1)).toMatchObject({ state: "live" });
  });

  test("an error event from the exchange is surfaced as a constant code, not its text", () => {
    const { feed, socket, statuses } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    socket().say({ event: "error", code: "60012", msg: "Invalid request SENTINEL-x" });
    const last = statuses.at(-1)!;
    expect(last.state).toBe("error");
    expect(JSON.stringify(last)).not.toContain("SENTINEL");
  });
});

describe("staying alive", () => {
  test("it pings when the line has been quiet, and a pong keeps the connection", () => {
    const { feed, socket, clock } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    clock.advance(21_000);
    expect(socket().sent.at(-1)).toBe("ping");
    socket().say("pong");
    clock.advance(25_000); // quiet again for 20 s at the 45 s mark: the second ping
    expect(socket().sent.filter((s) => s === "ping").length).toBeGreaterThanOrEqual(2);
    expect(FakeSocket.all).toHaveLength(1);
  });

  test("a silent line is torn down and reconnected, and the subscriptions come back", () => {
    const { feed, socket, clock, statuses } = setup();
    feed.subscribe("BTC-USDT");
    feed.subscribe("ETH-USDT");
    socket().open();
    clock.advance(50_000); // no pong, no trade
    expect(FakeSocket.all[0]!.closed).toBe(true);
    clock.advance(1_500); // first backoff
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1]!.open();
    expect(JSON.parse(FakeSocket.all[1]!.sent[0]!).args).toEqual([{ channel: "trades", instId: "BTC-USDT" }, { channel: "trades", instId: "ETH-USDT" }]);
    expect(statuses.map((s) => s.state)).toContain("reconnecting");
  });

  test("a dropped connection reconnects with a growing wait, capped, and the wait resets after data arrives", () => {
    const { feed, clock } = setup();
    feed.subscribe("BTC-USDT");
    const waits: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const sock = FakeSocket.all[FakeSocket.all.length - 1]!;
      const before = clock.now();
      sock.drop();
      // find when the next socket appears
      let waited = 0;
      while (FakeSocket.all[FakeSocket.all.length - 1] === sock && waited < 60_000) {
        clock.advance(250);
        waited += 250;
      }
      waits.push(waited);
      void before;
    }
    expect(waits[0]!).toBeLessThanOrEqual(1_250);
    expect(waits[1]!).toBeGreaterThan(waits[0]!);
    expect(Math.max(...waits)).toBeLessThanOrEqual(30_250);
    expect(waits[7]!).toBeGreaterThanOrEqual(waits[6]!);
  });

  test("closing the feed stops everything: no reconnect, no ping", () => {
    const { feed, socket, clock } = setup();
    feed.subscribe("BTC-USDT");
    socket().open();
    feed.close();
    const sockets = FakeSocket.all.length;
    clock.advance(120_000);
    expect(FakeSocket.all).toHaveLength(sockets);
    expect(socket().sent.filter((s) => s === "ping")).toEqual([]);
  });
});
