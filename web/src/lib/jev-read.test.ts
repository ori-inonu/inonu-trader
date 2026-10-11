import { describe, expect, test } from "bun:test";
import { createJevReadLoader, parseJevReadBoard, readAgeMs, readFreshness, type JevReadBoardState } from "./jev-read";

const state = {
  instId: "BTC-USDT",
  horizonMinutes: 5,
  mid: 83957.35,
  spreadBps: 0.12,
  bookImbalanceTop5: -0.31,
  volBpsPerMinute: 2.3,
  depthQuoteTop5: { bid: 120000, ask: 190000 },
  returnsBps: { m1: 1.2, m5: -3.4, m15: 5.6, m30: 7.8 },
  flow60s: { count: 12, buyBase: 0.4, sellBase: 0.9, imbalance: -0.38, cvdBase: -0.5, vwap: 83950, lastPx: 83957.4, lastSide: "buy" },
  change24hPct: 1.4,
  rangePosition24h: 0.62,
  fundingRatePct: null,
};

function read(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    readId: "jr-abc123",
    instId: "BTC-USDT",
    atMs: 1_791_742_000_000,
    clockOffsetMs: 69_500,
    advisory: true,
    execution: "never",
    state,
    insufficient: [],
    decision: { action: "sell", probabilities: { buy: 0.1, sell: 0.63, hold: 0.27 }, confidence: 0.63, latencyMs: 291, model: "jev-1.13.0", status: "ok", inputTokens: 894 },
    ...overrides,
  };
}

const board = (reads: Record<string, unknown> = { "BTC-USDT": read() }, recent: unknown[] = [read()]) => ({ schemaVersion: 1, updatedAtMs: 1_791_742_001_000, reads, recent });

describe("parseJevReadBoard", () => {
  test("reads a valid board", () => {
    const parsed = parseJevReadBoard(board());
    expect(parsed).not.toBeNull();
    expect(parsed!.reads["BTC-USDT"]!.decision?.action).toBe("sell");
    expect(parsed!.reads["BTC-USDT"]!.state?.flow60s.lastSide).toBe("buy");
    expect(parsed!.recent).toHaveLength(1);
  });

  test("an insufficient read has reasons and no decision", () => {
    const parsed = parseJevReadBoard(board({ "MON-USDT": read({ instId: "MON-USDT", state: null, decision: null, insufficient: ["candles_short"] }) }, []));
    expect(parsed!.reads["MON-USDT"]!.insufficient).toEqual(["candles_short"]);
    expect(parsed!.reads["MON-USDT"]!.decision).toBeNull();
  });

  test.each([
    ["not an object", null],
    ["wrong schema", { ...board(), schemaVersion: 2 }],
    ["missing time", { ...board(), updatedAtMs: "x" }],
  ])("rejects %s", (_label: string, value: unknown) => {
    expect(parseJevReadBoard(value)).toBeNull();
  });

  test("drops a read that claims it executes or is not advisory, and keeps the rest", () => {
    const parsed = parseJevReadBoard(board({ "BTC-USDT": read(), "ETH-USDT": read({ instId: "ETH-USDT", execution: "now" }), "SOL-USDT": read({ instId: "SOL-USDT", advisory: false }) }));
    expect(Object.keys(parsed!.reads)).toEqual(["BTC-USDT"]);
  });

  test("drops a decision with an unknown action instead of showing it", () => {
    const parsed = parseJevReadBoard(board({ "BTC-USDT": read({ decision: { action: "moon", probabilities: { buy: 1, sell: 0, hold: 0 }, confidence: 1, latencyMs: 1, model: "jev-1.13.0", status: "ok", inputTokens: 1 } }) }, []));
    expect(parsed!.reads["BTC-USDT"]).toBeUndefined();
  });

  test("a non finite number in the state drops the read", () => {
    const bad = { ...state, mid: "83957" };
    expect(parseJevReadBoard(board({ "BTC-USDT": read({ state: bad }) }, []))!.reads["BTC-USDT"]).toBeUndefined();
  });
});

describe("readAgeMs", () => {
  const r = parseJevReadBoard(board())!.reads["BTC-USDT"]!;

  test("a read stamped on the exchange clock is aged against the browser clock corrected by its skew", () => {
    // Browser is 70 s behind the exchange: local now 1_791_741_990_000 is exchange 1_791_742_060_000, a 60 s old read.
    expect(readAgeMs(r, 1_791_741_990_000, 70_000)).toBe(60_000);
  });

  test("without a skew a read on the exchange clock cannot be aged honestly", () => {
    expect(readAgeMs(r, 1_791_741_990_000, null)).toBeNull();
  });

  test("a read on the local clock of the producer is aged against the local clock", () => {
    const local = parseJevReadBoard(board({ "BTC-USDT": read({ clockOffsetMs: null }) }))!.reads["BTC-USDT"]!;
    expect(readAgeMs(local, 1_791_742_030_000, null)).toBe(30_000);
  });

  test("never negative", () => {
    expect(readAgeMs(r, 1_791_741_000_000, 69_500)).toBe(0);
  });
});

describe("readFreshness", () => {
  test.each([
    [5_000, "fresh"],
    [89_999, "fresh"],
    [90_001, "late"],
    [299_999, "late"],
    [300_001, "stale"],
    [null, "unknown"],
  ])("age %p is %s", (age: number | null, expected: string) => {
    expect(readFreshness(age)).toBe(expected);
  });
});

describe("createJevReadLoader", () => {
  function harness(fetcher: (url: string, init: RequestInit) => Promise<Response>) {
    const states: JevReadBoardState[] = [];
    let current: JevReadBoardState = { status: "idle", board: null, error: null };
    const setState = (update: JevReadBoardState | ((p: JevReadBoardState) => JevReadBoardState)) => {
      current = typeof update === "function" ? update(current) : update;
      states.push(current);
    };
    const loader = createJevReadLoader("http://127.0.0.1:3100", setState, fetcher);
    return { loader, last: () => current, states };
  }
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  test("ready on a valid board and it asks /jev-read without caching", async () => {
    let seen = "";
    let cache = "";
    const h = harness((url, init) => {
      seen = url;
      cache = String(init.cache);
      return json(board());
    });
    await h.loader.load();
    expect(seen).toBe("http://127.0.0.1:3100/jev-read");
    expect(cache).toBe("no-store");
    expect(h.last().status).toBe("ready");
    expect(h.last().board?.reads["BTC-USDT"]?.decision?.action).toBe("sell");
  });

  test("404 means the producer has not written yet: absent, not an error", async () => {
    const h = harness(() => json({ error: "jev-read state not found" }, 404));
    await h.loader.load();
    expect(h.last().status).toBe("absent");
  });

  test("403 or a bad payload is an error with a message and no board", async () => {
    const forbidden = harness(() => json({ error: "origin not allowed" }, 403));
    await forbidden.loader.load();
    expect(forbidden.last().status).toBe("error");
    expect(forbidden.last().error).toContain("403");
    const bad = harness(() => json({ nope: true }));
    await bad.loader.load();
    expect(bad.last().status).toBe("error");
    expect(bad.last().board).toBeNull();
  });

  test("a network failure keeps the previous board and flags the error", async () => {
    let calls = 0;
    const h = harness(() => {
      calls += 1;
      return calls === 1 ? json(board()) : Promise.reject(new Error("offline"));
    });
    await h.loader.load();
    await h.loader.load();
    expect(h.last().status).toBe("error");
    expect(h.last().board).not.toBeNull();
  });

  test("a disposed loader never publishes", async () => {
    const h = harness(() => json(board()));
    h.loader.dispose();
    await h.loader.load();
    expect(h.states).toHaveLength(0);
  });
});
