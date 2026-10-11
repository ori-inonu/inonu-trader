import { beforeEach, describe, expect, test } from "bun:test";
import { OkxTapeFeed, type FeedSocket } from "./feed";

class FakeSocket implements FeedSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(body: unknown) {
    this.onmessage?.({ data: typeof body === "string" ? body : JSON.stringify(body) });
  }
}

let clock = 1_000_000;
let timers: Array<{ ms: number; fn: () => void }> = [];

function makeFeed(overrides: Partial<ConstructorParameters<typeof OkxTapeFeed>[0]> = {}) {
  return new OkxTapeFeed({
    instIds: ["BTC-USDT", "MON-USDT"],
    now: () => clock,
    WebSocketImpl: FakeSocket as never,
    setTimeoutFn: ((fn: () => void, ms: number) => {
      timers.push({ ms, fn });
      return timers.length as never;
    }) as never,
    clearTimeoutFn: (() => {}) as never,
    fetchImpl: async () => { throw new Error("no network in this test"); },
    ...overrides,
  });
}

beforeEach(() => {
  FakeSocket.instances = [];
  timers = [];
  clock = 1_000_000;
});

const book = (instId: string) => ({
  arg: { channel: "books5", instId },
  data: [{ asks: [["100.1", "1", "0", "2"], ["100.2", "2", "0", "1"]], bids: [["99.9", "3", "0", "4"], ["99.8", "1", "0", "1"]], ts: "1791741260824", seqId: 5 }],
});

describe("OkxTapeFeed socket", () => {
  test("subscribes books5, trades and tickers for every instrument once open", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe("wss://ws.okx.com:8443/ws/v5/public");
    socket.open();
    const message = JSON.parse(socket.sent[0]!) as { op: string; args: Array<{ channel: string; instId: string }> };
    expect(message.op).toBe("subscribe");
    expect(message.args).toHaveLength(6);
    expect(message.args).toContainEqual({ channel: "books5", instId: "BTC-USDT" });
    expect(message.args).toContainEqual({ channel: "trades", instId: "MON-USDT" });
    expect(message.args).toContainEqual({ channel: "tickers", instId: "BTC-USDT" });
  });

  test("a closed socket reconnects after a backoff and subscribes again", () => {
    const feed = makeFeed();
    feed.start();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.close();
    expect(timers.length).toBeGreaterThan(0);
    const wait = timers[timers.length - 1]!;
    expect(wait.ms).toBeGreaterThanOrEqual(500);
    expect(wait.ms).toBeLessThanOrEqual(2_000);
    wait.fn();
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.open();
    expect(FakeSocket.instances[1]!.sent).toHaveLength(1);
  });

  test("silence sends a ping, long silence forces a reconnect", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.emit(book("BTC-USDT"));
    clock += 26_000;
    feed.tick();
    expect(socket.sent).toContain("ping");
    clock += 40_000;
    feed.tick();
    expect(socket.closed).toBe(true);
  });

  test("a pong does not break the parser and counts as activity", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    clock += 26_000;
    socket.emit("pong");
    clock += 10_000;
    feed.tick();
    expect(socket.sent).not.toContain("ping");
  });

  test("stop closes the socket and does not reconnect", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    feed.stop();
    expect(socket.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe("OkxTapeFeed messages", () => {
  test("a books5 snapshot becomes the book, stamped with the local receipt time", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    clock = 1_234_567;
    socket.emit(book("BTC-USDT"));
    const input = feed.snapshot("BTC-USDT", 1_234_999);
    expect(input.book).toEqual({ bids: [{ px: 99.9, sz: 3 }, { px: 99.8, sz: 1 }], asks: [{ px: 100.1, sz: 1 }, { px: 100.2, sz: 2 }], receivedAtMs: 1_234_567 });
    expect(input.nowMs).toBe(1_234_999);
    expect(feed.snapshot("MON-USDT", clock).book).toBeNull();
  });

  test("trades accumulate by receipt time and the buffer is capped", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    for (let i = 0; i < 260; i += 1) {
      clock += 10;
      socket.emit({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [{ instId: "BTC-USDT", tradeId: String(i), px: "100", sz: "0.5", side: i % 2 ? "buy" : "sell", ts: "1" }] });
    }
    const trades = feed.snapshot("BTC-USDT", clock).trades;
    expect(trades).toHaveLength(200);
    expect(trades[trades.length - 1]!.receivedAtMs).toBe(clock);
    // 260 prints, the 200 newest survive: the oldest kept is print 60, and even prints are sells.
    expect(trades[0]!.side).toBe("sell");
  });

  test("malformed prints and unknown instruments are dropped, not coerced", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.emit({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [{ px: "x", sz: "1", side: "buy" }, { px: "1", sz: "", side: "buy" }, { px: "1", sz: "1", side: "flat" }, { px: "-1", sz: "1", side: "buy" }] });
    socket.emit({ arg: { channel: "trades", instId: "DOGE-USDT" }, data: [{ px: "1", sz: "1", side: "buy" }] });
    expect(feed.snapshot("BTC-USDT", clock).trades).toHaveLength(0);
    expect(() => feed.snapshot("DOGE-USDT", clock)).toThrow();
  });

  test("a ticker carries the 24h fields and null when OKX leaves one empty", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.emit({ arg: { channel: "tickers", instId: "BTC-USDT" }, data: [{ instId: "BTC-USDT", last: "100.5", open24h: "98", high24h: "", low24h: "97", ts: "1" }] });
    expect(feed.snapshot("BTC-USDT", clock).ticker).toEqual({ last: 100.5, open24h: 98, high24h: null, low24h: 97, receivedAtMs: clock });
  });

  test("an error event is surfaced in the status and does not throw", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.emit({ event: "error", code: "60012", msg: "Invalid request" });
    expect(feed.status().lastError).toContain("60012");
  });

  test("garbage frames are ignored", () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    expect(() => socket.emit("{not json")).not.toThrow();
    expect(() => socket.emit(JSON.stringify([1, 2, 3]))).not.toThrow();
  });
});

describe("OkxTapeFeed REST refresh", () => {
  const row = (ts: number, close: string, confirm = "1") => [String(ts), close, close, close, close, "1", "1", "1", confirm];

  test("candles come back newest first and are stored oldest first", async () => {
    const calls: string[] = [];
    const feed = makeFeed({
      fetchImpl: async (url: string) => {
        calls.push(url);
        return { ok: true, status: 200, json: async () => ({ code: "0", data: [row(180_000, "102", "0"), row(120_000, "101"), row(60_000, "100")] }) };
      },
    });
    await feed.refreshCandles("BTC-USDT");
    expect(calls[0]).toBe("https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1m&limit=60");
    expect(feed.snapshot("BTC-USDT", clock).candles).toEqual([
      { tsMs: 60_000, close: 100, confirmed: true },
      { tsMs: 120_000, close: 101, confirmed: true },
      { tsMs: 180_000, close: 102, confirmed: false },
    ]);
  });

  test("a malformed candle response keeps the previous candles", async () => {
    let first = true;
    const feed = makeFeed({
      fetchImpl: async () => {
        const body = first ? { code: "0", data: [row(60_000, "100")] } : { code: "0", data: [row(120_000, "oops")] };
        first = false;
        return { ok: true, status: 200, json: async () => body };
      },
    });
    await feed.refreshCandles("BTC-USDT");
    await feed.refreshCandles("BTC-USDT");
    expect(feed.snapshot("BTC-USDT", clock).candles).toHaveLength(1);
    expect(feed.status().lastError).toContain("candles");
  });

  test("funding is read from the matching perpetual swap and stays null when the call fails", async () => {
    const urls: string[] = [];
    const feed = makeFeed({
      fetchImpl: async (url: string) => {
        urls.push(url);
        if (url.includes("MON-USDT-SWAP")) return { ok: true, status: 200, json: async () => ({ code: "0", data: [{ fundingRate: "-0.0000189" }] }) };
        return { ok: false, status: 404, json: async () => ({}) };
      },
    });
    await feed.refreshFunding("MON-USDT");
    await feed.refreshFunding("BTC-USDT");
    expect(urls[0]).toBe("https://www.okx.com/api/v5/public/funding-rate?instId=MON-USDT-SWAP");
    expect(feed.snapshot("MON-USDT", clock).fundingRate).toBeCloseTo(-0.0000189, 10);
    expect(feed.snapshot("BTC-USDT", clock).fundingRate).toBeNull();
  });
});

describe("OkxTapeFeed REST snapshots for quiet markets", () => {
  test("a book snapshot from REST is stamped with the moment it arrived", async () => {
    const urls: string[] = [];
    const feed = makeFeed({
      fetchImpl: async (url: string) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ code: "0", data: [{ asks: [["100.1", "2", "0", "1"]], bids: [["99.9", "3", "0", "1"]], ts: "1" }] }) };
      },
    });
    clock = 4_242_000;
    await feed.refreshBook("BTC-USDT");
    expect(urls[0]).toBe("https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=5");
    expect(feed.snapshot("BTC-USDT", clock).book).toEqual({ bids: [{ px: 99.9, sz: 3 }], asks: [{ px: 100.1, sz: 2 }], receivedAtMs: 4_242_000 });
  });

  test("a malformed or failed book snapshot keeps the previous book and says so", async () => {
    let calls = 0;
    const feed = makeFeed({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return { ok: true, status: 200, json: async () => ({ code: "0", data: [{ asks: [["100.1", "2", "0", "1"]], bids: [["99.9", "3", "0", "1"]] }] }) };
        if (calls === 2) return { ok: true, status: 200, json: async () => ({ code: "0", data: [{ asks: [["x", "2"]], bids: [] }] }) };
        return { ok: false, status: 503, json: async () => ({}) };
      },
    });
    clock = 10;
    await feed.refreshBook("BTC-USDT");
    clock = 20;
    await feed.refreshBook("BTC-USDT");
    await feed.refreshBook("BTC-USDT");
    expect(feed.snapshot("BTC-USDT", clock).book?.receivedAtMs).toBe(10);
    expect(feed.status().lastError).toContain("book");
  });

  test("a ticker snapshot from REST carries the 24h fields and its arrival time", async () => {
    const urls: string[] = [];
    const feed = makeFeed({
      fetchImpl: async (url: string) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ code: "0", data: [{ instId: "MON-USDT", last: "0.0271", open24h: "0.02465", high24h: "0.02719", low24h: "0.02465" }] }) };
      },
    });
    clock = 777;
    await feed.refreshTicker("MON-USDT");
    expect(urls[0]).toBe("https://www.okx.com/api/v5/market/ticker?instId=MON-USDT");
    expect(feed.snapshot("MON-USDT", clock).ticker).toEqual({ last: 0.0271, open24h: 0.02465, high24h: 0.02719, low24h: 0.02465, receivedAtMs: 777 });
  });

  test("ages report how old the held book and ticker are, null when absent", async () => {
    const feed = makeFeed();
    feed.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    expect(feed.ages("BTC-USDT", clock)).toEqual({ bookAgeMs: null, tickerAgeMs: null });
    socket.emit(book("BTC-USDT"));
    clock += 3_000;
    expect(feed.ages("BTC-USDT", clock)).toEqual({ bookAgeMs: 3_000, tickerAgeMs: null });
  });
});
