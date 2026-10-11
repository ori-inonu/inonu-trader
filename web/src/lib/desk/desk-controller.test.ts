import { describe, expect, test } from "bun:test";
import { createDeskController, type DeskController } from "./desk-controller";
import {
  FakeClock,
  FakeWebSocket,
  candleRow,
  createFakeFetch,
  createFakeWebSocketCtor,
  instrumentRow,
  okEnvelope,
  tickerRow,
  tradeRow,
  type FakeRoute,
} from "./desk-test-kit";
import type { FetchLike } from "./okx-rest";
import type { OkxSubscriptionArg } from "./okx-ws";
import type { DeskBar, DeskState } from "./types";

const NOW = 1_700_000_000_000;
const SKEW = 69_500;
const BAR_MS: Record<string, number> = { "1m": 60_000, "5m": 300_000, "1H": 3_600_000 };

interface Env {
  readonly clock: FakeClock;
  readonly controller: DeskController;
  readonly calls: { url: string }[];
  readonly instances: FakeWebSocket[];
  readonly flags: { failRest: boolean; fail: Set<string>; hold: Set<string> };
  /** Requests that were held and then aborted by the controller. */
  readonly aborted: string[];
  /** Lets every held request go through. */
  release(): void;
  pub(index?: number): FakeWebSocket;
  biz(index?: number): FakeWebSocket;
  state(): DeskState;
  settle(ms?: number): Promise<void>;
  urls(fragment: string): URL[];
}

const on = (name: string, answer: (url: URL) => { status?: number; body: unknown }): FakeRoute => (url) =>
  url.pathname === `/api/v5/${name}` ? answer(url) : null;

function makeEnv(options: { focus?: string; bar?: DeskBar; watchlist?: string[]; swaps?: string[]; restMinIntervalMs?: number } = {}): Env {
  const clock = new FakeClock(NOW);
  const { Ctor, instances } = createFakeWebSocketCtor();
  const flags = { failRest: false, fail: new Set<string>(), hold: new Set<string>() };
  const held: (() => void)[] = [];
  const aborted: string[] = [];
  const swaps = new Set(options.swaps ?? ["BTC-USDT-SWAP", "ETH-USDT-SWAP"]);
  const routes: FakeRoute[] = [
    on("public/time", () => ({ body: okEnvelope([{ ts: String(clock.nowMs + SKEW) }]) })),
    on("public/instruments", (url) => {
      const id = url.searchParams.get("instId") ?? "";
      const spot = !id.endsWith("-SWAP");
      return swaps.has(id) || spot ? { body: okEnvelope([instrumentRow(id)]) } : { body: { code: "51001", msg: "x", data: [] } };
    }),
    on("market/candles", (url) => {
      const bar = url.searchParams.get("bar") ?? "1m";
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "3"), 3);
      const step = BAR_MS[bar] ?? 60_000;
      const rows = Array.from({ length: limit }, (_, i) => candleRow(1_000 * step - i * step, 100 - i, i !== 0));
      return { body: okEnvelope(rows) };
    }),
    on("market/ticker", (url) => ({ body: okEnvelope([tickerRow(url.searchParams.get("instId") ?? "", "100", clock.nowMs + SKEW)]) })),
    on("public/funding-rate", (url) => ({
      body: okEnvelope([{ instId: url.searchParams.get("instId"), fundingRate: "0.00012", fundingTime: "1791748800000", nextFundingTime: "1791763200000", ts: String(NOW + SKEW + 10) }]),
    })),
    on("public/mark-price", (url) => ({ body: okEnvelope([{ instId: url.searchParams.get("instId"), markPx: "200.5", ts: String(NOW + SKEW + 20) }]) })),
    on("public/open-interest", (url) => ({
      body: okEnvelope([{ instId: url.searchParams.get("instId"), oi: "5000", oiCcy: "50000", oiUsd: "1000000", ts: String(NOW + SKEW + 30) }]),
    })),
  ];
  const fake = createFakeFetch(routes);
  const fetch: FetchLike = async (url, init) => {
    if (flags.failRest) throw new TypeError("Failed to fetch");
    const path = new URL(url).pathname;
    if (flags.fail.has(path)) return { ok: false, status: 500, text: async () => "boom" };
    if (flags.hold.has(path)) {
      await new Promise<void>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted.push(url);
          reject(new DOMException("aborted", "AbortError"));
        });
        held.push(resolve);
      });
    }
    return fake.fetch(url, init);
  };
  const controller = createDeskController({
    focus: options.focus ?? "BTC-USDT",
    bar: options.bar ?? "1m",
    watchlist: options.watchlist ?? ["BTC-USDT", "ETH-USDT"],
    WebSocketCtor: Ctor,
    fetch,
    now: clock.now,
    timers: clock,
    random: () => 1,
    restMinIntervalMs: options.restMinIntervalMs ?? 0,
  });
  const find = (suffix: string, index: number): FakeWebSocket => {
    const matches = instances.filter((i) => i.url.endsWith(suffix));
    const found = matches[index < 0 ? matches.length + index : index];
    if (found === undefined) throw new Error(`no ${suffix} socket #${index}`);
    return found;
  };
  return {
    clock,
    controller,
    calls: fake.calls,
    instances,
    flags,
    aborted,
    release: () => {
      flags.hold.clear();
      for (const resolve of held.splice(0)) resolve();
    },
    pub: (index = -1) => find("/public", index),
    biz: (index = -1) => find("/business", index),
    state: () => {
      controller.store.flush();
      return controller.getState();
    },
    settle: (ms = 300) => clock.advanceAsync(ms, 50),
    urls: (fragment) => fake.calls.filter((c) => c.url.includes(fragment)).map((c) => new URL(c.url)),
  };
}

type Op = { op: "subscribe" | "unsubscribe"; args: OkxSubscriptionArg[] };
const opsOf = (ws: FakeWebSocket): Op[] => ws.ops().filter((o): o is Op => typeof o === "object" && o !== null);
const keys = (args: OkxSubscriptionArg[]): string[] => args.map((a) => `${a.channel}:${a.instId}`).sort();
const argsOf = (ws: FakeWebSocket, op: Op["op"]): string[] => keys(opsOf(ws).filter((o) => o.op === op).flatMap((o) => o.args));

const bookSnapshot = (instId: string, seqId = 10) => ({
  arg: { channel: "books", instId },
  action: "snapshot",
  data: [{ bids: [["99", "5", "0", "1"]], asks: [["101", "4", "0", "1"]], ts: String(NOW + SKEW), seqId, prevSeqId: -1, checksum: 0 }],
});

describe("construction", () => {
  test("a new controller does nothing: no socket, no request, no timer", () => {
    const env = makeEnv();
    expect(env.instances).toHaveLength(0);
    expect(env.calls).toHaveLength(0);
    expect(env.clock.pendingCount()).toBe(0);
    expect(env.controller.getState()).toMatchObject({ focus: "BTC-USDT", bar: "1m", clockSkewMs: null });
    expect(env.controller.getState().feeds.every((f) => f.state === "idle")).toBe(true);
  });
});

describe("start", () => {
  test("opens both sockets, subscribes the focus and watchlist, and adds the perpetual once REST confirms it", async () => {
    const env = makeEnv();
    env.controller.start();
    expect(env.instances.map((i) => i.url)).toEqual(["wss://ws.okx.com:8443/ws/v5/public", "wss://ws.okx.com:8443/ws/v5/business"]);
    env.pub().open();
    env.biz().open();
    expect(argsOf(env.pub(), "subscribe")).toEqual(
      keys([
        { channel: "books", instId: "BTC-USDT" },
        { channel: "books5", instId: "BTC-USDT" },
        { channel: "trades", instId: "BTC-USDT" },
        { channel: "tickers", instId: "BTC-USDT" },
        { channel: "tickers", instId: "ETH-USDT" },
      ]),
    );
    expect(argsOf(env.biz(), "subscribe")).toEqual(["candle1m:BTC-USDT"]);

    await env.settle();
    expect(argsOf(env.pub(), "subscribe")).toEqual(
      keys([
        { channel: "books", instId: "BTC-USDT" },
        { channel: "books5", instId: "BTC-USDT" },
        { channel: "trades", instId: "BTC-USDT" },
        { channel: "tickers", instId: "BTC-USDT" },
        { channel: "tickers", instId: "ETH-USDT" },
        { channel: "funding-rate", instId: "BTC-USDT-SWAP" },
        { channel: "mark-price", instId: "BTC-USDT-SWAP" },
        { channel: "open-interest", instId: "BTC-USDT-SWAP" },
        { channel: "index-tickers", instId: "BTC-USDT" },
        { channel: "funding-rate", instId: "ETH-USDT-SWAP" },
      ]),
    );
    const state = env.state();
    expect(state.instrument).toMatchObject({ instId: "BTC-USDT", instType: "SPOT" });
    expect(state.derivatives).toMatchObject({ instId: "BTC-USDT-SWAP" });
    expect(state.candles).toHaveLength(3);
    expect(state.candles[2]?.tsMs).toBeGreaterThan(state.candles[0]?.tsMs ?? 0);
    expect(state.clockSkewMs).toBe(SKEW);
    expect(state.watchlist.map((r) => r.spark.length)).toEqual([3, 3]);
    expect(state.feeds.map((f) => f.id)).toEqual(["okx-public-ws", "okx-business-ws", "okx-public-rest"]);
    expect(state.feeds.find((f) => f.id === "okx-public-rest")?.state).toBe("live");
    env.controller.stop();
  });

  test("a focus without a perpetual leaves the derivatives panel null and never subscribes its channels", async () => {
    const env = makeEnv({ focus: "MON-USDT", watchlist: ["MON-USDT", "BTC-USDT"], swaps: ["BTC-USDT-SWAP"] });
    env.controller.start();
    env.pub().open();
    await env.settle();
    expect(env.state().derivatives).toBeNull();
    const subscribed = argsOf(env.pub(), "subscribe");
    expect(subscribed).toContain("funding-rate:BTC-USDT-SWAP");
    expect(subscribed.filter((k) => k.includes("MON-USDT-SWAP"))).toEqual([]);
    expect(subscribed).not.toContain("mark-price:MON-USDT-SWAP");
    env.controller.stop();
  });

  test("channel messages reach the state: book, trade, ticker, candle, derivatives", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    env.biz().open();
    await env.settle();
    env.pub().receive(bookSnapshot("BTC-USDT"));
    env.pub().receive({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [tradeRow("BTC-USDT", "1", "100", "2", "buy", NOW + SKEW - 1000)] });
    env.pub().receive({ arg: { channel: "tickers", instId: "BTC-USDT" }, data: [tickerRow("BTC-USDT", "100.5", NOW + SKEW)] });
    env.pub().receive({ arg: { channel: "mark-price", instId: "BTC-USDT-SWAP" }, data: [{ instId: "BTC-USDT-SWAP", markPx: "100.7", ts: String(NOW) }] });
    env.biz().receive({ arg: { channel: "candle1m", instId: "BTC-USDT" }, data: [candleRow(2_000 * 60_000, 123, false)] });
    const state = env.state();
    expect(state.book?.bids[0]?.px).toBe(99);
    expect(state.trades.map((t) => t.id)).toEqual(["1"]);
    expect(state.ticker?.last).toBe(100.5);
    expect(state.derivatives?.markPx).toBe(100.7);
    expect(state.candles[state.candles.length - 1]?.close).toBe(123);
    expect(state.metrics.midPx).toBeCloseTo(100, 8);
    expect(state.metrics.buyVolBase60s).toBe(2);
    env.controller.stop();
  });

  test("feed freshness is judged on local receipt time and turns stale when the stream goes quiet", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    env.biz().open();
    env.pub().receive({ arg: { channel: "tickers", instId: "BTC-USDT" }, data: [tickerRow("BTC-USDT", "100", NOW)] });
    await env.settle(1_200);
    expect(env.state().feeds.find((f) => f.id === "okx-public-ws")).toMatchObject({ state: "live" });
    await env.settle(6_000);
    const pub = env.state().feeds.find((f) => f.id === "okx-public-ws");
    expect(pub?.state).toBe("stale");
    expect(pub?.detail).toContain("Sem dados");
    expect(env.state().feeds.find((f) => f.id === "okx-business-ws")?.state).toBe("connecting");
    env.controller.stop();
  });
});

describe("switching focus and bar", () => {
  test("focus: unsubscribes the old instrument, subscribes the new, resets, and drops late frames", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    env.biz().open();
    await env.settle();
    env.pub().receive(bookSnapshot("BTC-USDT"));
    const publicOps = opsOf(env.pub()).length;
    const businessOps = opsOf(env.biz()).length;

    env.controller.setFocus("ETH-USDT");
    const pubNew = opsOf(env.pub()).slice(publicOps);
    expect(pubNew.filter((o) => o.op === "unsubscribe").flatMap((o) => keys(o.args))).toEqual(
      keys([
        { channel: "books", instId: "BTC-USDT" },
        { channel: "books5", instId: "BTC-USDT" },
        { channel: "trades", instId: "BTC-USDT" },
        { channel: "mark-price", instId: "BTC-USDT-SWAP" },
        { channel: "open-interest", instId: "BTC-USDT-SWAP" },
        { channel: "index-tickers", instId: "BTC-USDT" },
      ]),
    );
    const subscribed = pubNew.filter((o) => o.op === "subscribe").flatMap((o) => keys(o.args));
    expect(subscribed).toContain("books:ETH-USDT");
    expect(subscribed).toContain("trades:ETH-USDT");
    expect(subscribed).not.toContain("tickers:ETH-USDT"); // already watched
    expect(opsOf(env.biz()).slice(businessOps).map((o) => [o.op, keys(o.args)])).toEqual([
      ["unsubscribe", ["candle1m:BTC-USDT"]],
      ["subscribe", ["candle1m:ETH-USDT"]],
    ]);

    const reset = env.state();
    // The perpetual of ETH was already confirmed for the watchlist, so its panel opens empty at once.
    expect(reset).toMatchObject({ focus: "ETH-USDT", book: null, trades: [], candles: [], instrument: null });
    expect(reset.derivatives).toMatchObject({ instId: "ETH-USDT-SWAP", markPx: null, fundingRate: null, openInterest: null });
    env.pub().receive(bookSnapshot("BTC-USDT"));
    expect(env.state().book).toBeNull();

    await env.settle();
    const loaded = env.state();
    expect(loaded.instrument?.instId).toBe("ETH-USDT");
    expect(loaded.derivatives?.instId).toBe("ETH-USDT-SWAP");
    expect(loaded.candles).toHaveLength(3);
    env.controller.stop();
  });

  test("a no-op focus or bar change does nothing", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    env.biz().open();
    await env.settle();
    const ops = opsOf(env.pub()).length + opsOf(env.biz()).length;
    const calls = env.calls.length;
    env.controller.setFocus("BTC-USDT");
    env.controller.setBar("1m");
    env.controller.setFocus("");
    await env.settle(100);
    expect(opsOf(env.pub()).length + opsOf(env.biz()).length).toBe(ops);
    expect(env.calls.length).toBe(calls);
    env.controller.stop();
  });

  test("bar: swaps the candle channel, reloads history for the new bar and ignores the old channel", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    env.biz().open();
    await env.settle();
    const businessOps = opsOf(env.biz()).length;
    env.controller.setBar("5m");
    expect(opsOf(env.biz()).slice(businessOps).map((o) => [o.op, keys(o.args)])).toEqual([
      ["unsubscribe", ["candle1m:BTC-USDT"]],
      ["subscribe", ["candle5m:BTC-USDT"]],
    ]);
    expect(env.state()).toMatchObject({ bar: "5m", candles: [] });
    env.biz().receive({ arg: { channel: "candle1m", instId: "BTC-USDT" }, data: [candleRow(60_000, 1)] });
    expect(env.state().candles).toEqual([]);
    await env.settle();
    expect(env.state().candles).toHaveLength(3);
    const last = env.urls("market/candles").filter((u) => u.searchParams.get("instId") === "BTC-USDT").pop();
    expect(last?.searchParams.get("bar")).toBe("5m");
    env.controller.stop();
  });

  test("a switch while requests are in flight never lets the old answer land", async () => {
    const env = makeEnv();
    env.controller.start();
    env.controller.setFocus("ETH-USDT");
    await env.settle();
    const state = env.state();
    expect(state.focus).toBe("ETH-USDT");
    expect(state.instrument?.instId).toBe("ETH-USDT");
    expect(state.derivatives?.instId).toBe("ETH-USDT-SWAP");
    env.controller.stop();
  });

  test("the watchlist can change at runtime", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    await env.settle();
    env.controller.setWatchlist(["BTC-USDT", "SOL-USDT"]);
    await env.settle();
    const state = env.state();
    expect(state.watchlist.map((r) => r.instId)).toEqual(["BTC-USDT", "SOL-USDT"]);
    expect(argsOf(env.pub(), "subscribe")).toContain("tickers:SOL-USDT");
    expect(argsOf(env.pub(), "unsubscribe")).toContain("tickers:ETH-USDT");
    env.controller.stop();
  });
});

describe("lifecycle", () => {
  test("stop closes the sockets, cancels every timer and request, and start can run again (StrictMode)", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    env.controller.stop();
    expect(env.instances[0]?.closeCall?.code).toBe(1000);
    expect(env.instances[1]?.closeCall?.code).toBe(1000);
    await env.settle(500);
    expect(env.clock.pendingCount()).toBe(0);
    expect(env.controller.getState().feeds.filter((f) => f.id !== "okx-public-rest").every((f) => f.state === "idle")).toBe(true);

    env.controller.start();
    expect(env.instances).toHaveLength(4);
    env.pub().open();
    env.biz().open();
    await env.settle();
    expect(env.state().candles).toHaveLength(3);
    expect(env.state().clockSkewMs).toBe(SKEW);
    expect(argsOf(env.pub(), "subscribe")).toContain("books:BTC-USDT");
    env.controller.stop();
    await env.settle(500);
    expect(env.clock.pendingCount()).toBe(0);
  });

  test("start and stop are idempotent", async () => {
    const env = makeEnv();
    env.controller.start();
    env.controller.start();
    expect(env.instances).toHaveLength(2);
    env.controller.stop();
    env.controller.stop();
    expect(env.instances).toHaveLength(2);
  });
});

describe("integrity and reconnection", () => {
  test("a book sequence break resubscribes the books channel and recovers on the next snapshot", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    await env.settle();
    env.pub().receive(bookSnapshot("BTC-USDT", 10));
    const before = opsOf(env.pub()).length;
    env.pub().receive({ arg: { channel: "books", instId: "BTC-USDT" }, action: "update", data: [{ bids: [], asks: [], ts: String(NOW), seqId: 99, prevSeqId: 50, checksum: 0 }] });
    expect(opsOf(env.pub()).slice(before)).toEqual([
      { op: "unsubscribe", args: [{ channel: "books", instId: "BTC-USDT" }] },
      { op: "subscribe", args: [{ channel: "books", instId: "BTC-USDT" }] },
    ]);
    expect(env.state().book).toBeNull();
    env.pub().receive(bookSnapshot("BTC-USDT", 100));
    expect(env.state().book?.seqId).toBe(100);
    env.controller.stop();
  });

  test("a book that keeps breaking is resynced at a growing distance, not in a loop", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub().open();
    await env.settle();
    const badUpdate = {
      arg: { channel: "books", instId: "BTC-USDT" },
      action: "update",
      data: [{ bids: [], asks: [], ts: String(NOW), seqId: 999, prevSeqId: 5, checksum: 0 }],
    };
    const resubscribes = (): number => opsOf(env.pub()).filter((o) => o.op === "unsubscribe" && o.args.some((a) => a.channel === "books")).length;
    env.pub().receive(bookSnapshot("BTC-USDT", 10));
    env.pub().receive(badUpdate);
    expect(resubscribes()).toBe(1);
    env.pub().receive(bookSnapshot("BTC-USDT", 20));
    env.pub().receive(badUpdate);
    expect(resubscribes()).toBe(1); // held back
    expect(env.state().book).toBeNull();
    await env.settle(4_900);
    expect(resubscribes()).toBe(1);
    await env.settle(200);
    expect(resubscribes()).toBe(2);
    env.controller.stop();
    await env.settle(200_000);
    expect(resubscribes()).toBe(2);
  });

  test("a public reconnect resubscribes everything, shows the transition and distrusts updates until a snapshot", async () => {
    const env = makeEnv();
    env.controller.start();
    env.pub(0).open();
    await env.settle();
    env.pub(0).receive(bookSnapshot("BTC-USDT", 10));
    const everything = keys(opsOf(env.pub(0)).filter((o) => o.op === "subscribe").flatMap((o) => o.args));

    env.pub(0).serverClose(1006);
    expect(env.state().feeds.find((f) => f.id === "okx-public-ws")).toMatchObject({ state: "reconnecting", reconnects: 0 });
    await env.settle(1_100);
    expect(env.instances.filter((i) => i.url.endsWith("/public"))).toHaveLength(2);
    env.pub(1).open();
    expect(argsOf(env.pub(1), "subscribe")).toEqual(everything);
    expect(env.state().feeds.find((f) => f.id === "okx-public-ws")).toMatchObject({ reconnects: 1 });

    env.pub(1).receive({ arg: { channel: "books", instId: "BTC-USDT" }, action: "update", data: [{ bids: [["99", "9", "0", "1"]], asks: [], ts: String(NOW), seqId: 11, prevSeqId: 10, checksum: 0 }] });
    expect(env.state().book?.bids[0]?.sz).toBe(5);
    env.pub(1).receive(bookSnapshot("BTC-USDT", 500));
    expect(env.state().book?.seqId).toBe(500);
    env.controller.stop();
  });

  test("a business reconnect reloads the candle history to cover the outage", async () => {
    const env = makeEnv();
    env.controller.start();
    env.biz(0).open();
    await env.settle();
    const loads = env.urls("market/candles").filter((u) => u.searchParams.get("limit") === "300").length;
    env.biz(0).serverClose(1006);
    await env.settle(1_100);
    env.biz(1).open();
    await env.settle();
    expect(env.urls("market/candles").filter((u) => u.searchParams.get("limit") === "300").length).toBe(loads + 1);
    env.controller.stop();
  });
});

describe("REST and clock health", () => {
  test("when REST is down the desk keeps its sockets, reports the REST feed as failed and recovers later", async () => {
    const env = makeEnv();
    env.flags.failRest = true;
    env.controller.start();
    env.pub().open();
    env.biz().open();
    await env.settle(2_000);
    let state = env.state();
    expect(state.feeds.find((f) => f.id === "okx-public-rest")).toMatchObject({ state: "failed" });
    expect(state.instrument).toBeNull();
    expect(state.candles).toEqual([]);
    expect(state.clockSkewMs).toBeNull();
    expect(state.derivatives).toBeNull();
    env.pub().receive({ arg: { channel: "tickers", instId: "BTC-USDT" }, data: [tickerRow("BTC-USDT", "100", NOW)] });
    expect(env.state().ticker?.last).toBe(100);

    env.flags.failRest = false;
    await env.settle(61_000);
    state = env.state();
    expect(state.instrument?.instId).toBe("BTC-USDT");
    expect(state.candles).toHaveLength(3);
    expect(state.derivatives?.instId).toBe("BTC-USDT-SWAP");
    expect(state.clockSkewMs).toBe(SKEW);
    expect(state.feeds.find((f) => f.id === "okx-public-rest")).toMatchObject({ state: "live" });
    env.controller.stop();
  });

  test("the clock is measured with three samples at start and again every 10 minutes", async () => {
    const env = makeEnv();
    env.controller.start();
    await env.settle(500);
    expect(env.urls("public/time")).toHaveLength(3);
    await env.settle(600_000);
    expect(env.urls("public/time")).toHaveLength(6);
    env.controller.stop();
  });

  test("sparklines are refreshed every 5 minutes and the REST probe runs every minute", async () => {
    const env = makeEnv();
    env.controller.start();
    await env.settle(500);
    const sparks = (): number => env.urls("market/candles").filter((u) => u.searchParams.get("bar") === "1H" && u.searchParams.get("limit") === "24").length;
    expect(sparks()).toBe(2);
    expect(env.urls("market/ticker")).toHaveLength(0);
    await env.settle(60_000);
    expect(env.urls("market/ticker").length).toBeGreaterThanOrEqual(1);
    await env.settle(250_000);
    expect(sparks()).toBe(4);
    env.controller.stop();
  });
});

describe("perpetual panel bootstrap by REST", () => {
  const PANEL = { fundingRate: 0.00012, nextFundingTimeMs: 1791748800000, markPx: 200.5, openInterest: 5000, openInterestUsd: 1000000 };

  test("switching focus fills funding, mark price and open interest within a second, without any socket push", async () => {
    const env = makeEnv({ restMinIntervalMs: 300 });
    env.controller.start();
    env.pub().open();
    await env.settle(4_000);
    const seeds = { funding: env.urls("public/funding-rate").length, mark: env.urls("public/mark-price").length, oi: env.urls("public/open-interest").length };

    env.controller.setFocus("ETH-USDT");
    expect(env.state().derivatives).toMatchObject({ instId: "ETH-USDT-SWAP", fundingRate: null, markPx: null, openInterest: null });
    await env.settle(1_000);
    const panel = env.state().derivatives;
    expect(panel).toEqual({ instId: "ETH-USDT-SWAP", ...PANEL, indexPx: null, tsMs: NOW + SKEW + 30 });
    expect(env.urls("public/funding-rate")).toHaveLength(seeds.funding + 1);
    expect(env.urls("public/mark-price")).toHaveLength(seeds.mark + 1);
    expect(env.urls("public/open-interest")).toHaveLength(seeds.oi + 1);
    const asked = env.urls("public/funding-rate").pop();
    expect(asked?.searchParams.get("instId")).toBe("ETH-USDT-SWAP");
    env.controller.stop();
  });

  test("the first load bootstraps the panel as soon as the perpetual is confirmed, and only once", async () => {
    const env = makeEnv();
    env.controller.start();
    await env.settle(500);
    expect(env.state().derivatives).toMatchObject({ instId: "BTC-USDT-SWAP", ...PANEL });
    await env.settle(130_000); // probes and sparkline refreshes run, the seed does not repeat
    expect(env.urls("public/funding-rate")).toHaveLength(1);
    expect(env.urls("public/mark-price")).toHaveLength(1);
    expect(env.urls("public/open-interest")).toHaveLength(1);
    env.controller.stop();
  });

  test("one failing endpoint leaves only its own fields null and nothing throws", async () => {
    const env = makeEnv();
    env.flags.fail.add("/api/v5/public/mark-price");
    env.controller.start();
    await env.settle(500);
    expect(env.state().derivatives).toMatchObject({ instId: "BTC-USDT-SWAP", fundingRate: PANEL.fundingRate, openInterest: PANEL.openInterest, markPx: null });
    // The socket picks it up afterwards.
    env.pub().open();
    env.pub().receive({ arg: { channel: "mark-price", instId: "BTC-USDT-SWAP" }, data: [{ instId: "BTC-USDT-SWAP", markPx: "201", ts: String(NOW + SKEW + 40) }] });
    expect(env.state().derivatives?.markPx).toBe(201);
    env.controller.stop();

    const allDown = makeEnv();
    for (const name of ["funding-rate", "mark-price", "open-interest"]) allDown.flags.fail.add("/api/v5/public/" + name);
    allDown.controller.start();
    await allDown.settle(500);
    expect(allDown.state().derivatives).toMatchObject({ instId: "BTC-USDT-SWAP", fundingRate: null, markPx: null, openInterest: null, tsMs: null });
    allDown.controller.stop();
  });

  test("a value the socket already delivered is not replaced by the older REST reading", async () => {
    const env = makeEnv();
    env.flags.hold.add("/api/v5/public/funding-rate");
    env.controller.start();
    env.pub().open();
    await env.settle(500);
    expect(env.state().derivatives).toMatchObject({ instId: "BTC-USDT-SWAP", markPx: PANEL.markPx, fundingRate: null });
    env.pub().receive({ arg: { channel: "funding-rate", instId: "BTC-USDT-SWAP" }, data: [{ instId: "BTC-USDT-SWAP", fundingRate: "0.5", fundingTime: "1791750000000", ts: String(NOW + SKEW + 100) }] });
    env.release();
    await env.settle(500);
    expect(env.state().derivatives).toMatchObject({ fundingRate: 0.5, nextFundingTimeMs: 1791750000000, markPx: PANEL.markPx, openInterest: PANEL.openInterest });
    env.controller.stop();
  });

  test("a focus change aborts the requests in flight and their answers never land", async () => {
    const env = makeEnv({ watchlist: ["BTC-USDT", "ETH-USDT", "MON-USDT"], swaps: ["BTC-USDT-SWAP", "ETH-USDT-SWAP"] });
    env.controller.start();
    await env.settle(500);
    env.flags.hold.add("/api/v5/public/funding-rate");
    env.flags.hold.add("/api/v5/public/mark-price");
    env.flags.hold.add("/api/v5/public/open-interest");
    env.controller.setFocus("ETH-USDT");
    await env.settle(100);
    expect(env.aborted).toEqual([]);
    env.controller.setFocus("BTC-USDT");
    await env.settle(100);
    expect(env.aborted.filter((u) => u.includes("ETH-USDT-SWAP"))).toHaveLength(3);
    env.controller.setFocus("MON-USDT"); // no perpetual: nothing to bootstrap, and the BTC requests are cancelled
    await env.settle(100);
    expect(env.aborted.filter((u) => u.includes("BTC-USDT-SWAP"))).toHaveLength(3);
    env.release();
    await env.settle(500);
    const state = env.state();
    expect(state.focus).toBe("MON-USDT");
    expect(state.derivatives).toBeNull();
    env.controller.stop();
  });

  test("an answer that arrives after switching to another perpetual is dropped, the new one fills", async () => {
    const env = makeEnv({ restMinIntervalMs: 300 });
    env.controller.start();
    await env.settle(4_000);
    env.flags.hold.add("/api/v5/public/mark-price");
    env.controller.setFocus("ETH-USDT");
    await env.settle(1_500);
    env.controller.setFocus("BTC-USDT");
    await env.settle(100);
    expect(env.aborted.some((u) => u.includes("ETH-USDT-SWAP"))).toBe(true);
    env.release();
    await env.settle(1_500);
    const panel = env.state().derivatives;
    expect(panel?.instId).toBe("BTC-USDT-SWAP");
    expect(panel).toMatchObject(PANEL);
    env.controller.stop();
  });

  test("stopping cancels a bootstrap in flight", async () => {
    const env = makeEnv();
    env.flags.hold.add("/api/v5/public/funding-rate");
    env.controller.start();
    await env.settle(300);
    env.controller.stop();
    expect(env.aborted.length).toBeGreaterThanOrEqual(1);
    env.release();
    await env.settle(500);
    expect(env.clock.pendingCount()).toBe(0);
  });
});
