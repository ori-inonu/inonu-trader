import { describe, expect, test } from "bun:test";
import {
  FakeClock,
  candleRow,
  createFakeFetch,
  flushPromises,
  instrumentRow,
  okEnvelope,
  tickerRow,
  type FakeRoute,
} from "./desk-test-kit";
import { createOkxRest, type FetchLike, type OkxRest } from "./okx-rest";

const FORBIDDEN = new RegExp("[" + String.fromCharCode(0xb7, 0x2014, 0x2013) + "]");

function make(routes: readonly FakeRoute[], extra: { clock?: FakeClock; minIntervalMs?: number; timeoutMs?: number } = {}) {
  const clock = extra.clock ?? new FakeClock();
  const { fetch, calls } = createFakeFetch(routes);
  const rest = createOkxRest({ fetch, now: clock.now, timers: clock, minIntervalMs: extra.minIntervalMs ?? 0, ...(extra.timeoutMs ? { timeoutMs: extra.timeoutMs } : {}) });
  return { rest, calls, clock };
}

const on = (name: string, answer: (url: URL) => { status?: number; body: unknown }): FakeRoute => (url) =>
  url.pathname === `/api/v5/${name}` ? answer(url) : null;

describe("candles", () => {
  test("requests the bar and limit, returns oldest first and parses every column", async () => {
    const { rest, calls } = make([
      on("market/candles", () => ({
        body: okEnvelope([candleRow(3_600_000 * 3, 12, false), candleRow(3_600_000 * 2, 11), candleRow(3_600_000 * 1, 10)]),
      })),
    ]);
    const result = await rest.candles("MON-USDT", "1H", { limit: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((c) => c.tsMs)).toEqual([3_600_000, 7_200_000, 10_800_000]);
    expect(result.value.map((c) => c.confirmed)).toEqual([true, true, false]);
    expect(result.value[0]).toMatchObject({ open: 10, close: 10, high: 11, low: 9 });
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe("https://www.okx.com/api/v5/market/candles");
    expect(Object.fromEntries(url.searchParams)).toEqual({ instId: "MON-USDT", bar: "1H", limit: "3" });
  });

  test("defaults to the maximum limit and rejects limits OKX would refuse", async () => {
    const { rest, calls } = make([on("market/candles", () => ({ body: okEnvelope([]) }))]);
    const empty = await rest.candles("A-USDT", "1m");
    expect(empty.ok && empty.value).toEqual([]);
    expect(new URL(calls[0]!.url).searchParams.get("limit")).toBe("300");
    for (const limit of [0, 301, 1.5, -1]) {
      const bad = await rest.candles("A-USDT", "1m", { limit });
      expect(bad).toMatchObject({ ok: false, error: { code: "schema" } });
    }
    const history = await rest.historyCandles("A-USDT", "1m", { limit: 101 });
    expect(history).toMatchObject({ ok: false, error: { code: "schema" } });
    expect(calls).toHaveLength(1);
  });

  test("one malformed row rejects the whole series instead of being coerced", async () => {
    const bad: unknown[][] = [
      [candleRow(1000, 10), [...candleRow(2000, 10).slice(0, 4), "NaN", ...candleRow(2000, 10).slice(5)]],
      [candleRow(1000, 10), candleRow(2000, 10).slice(0, 8)],
      [candleRow(1000, 10), [...candleRow(2000, 10).slice(0, 8), "2"]],
      [candleRow(1000, 10), ["abc", ...candleRow(2000, 10).slice(1)]],
      [candleRow(1000, 10), "garbage"],
      [candleRow(1000, 10), { ts: "1" }],
      [candleRow(1000, 10), [candleRow(2000, 10)[0], "10", "9", "11", "10", "1", "1", "1", "1"]],
    ];
    for (const rows of bad) {
      const { rest } = make([on("market/candles", () => ({ body: okEnvelope(rows) }))]);
      const result = await rest.candles("A-USDT", "1m", { limit: 10 });
      expect(result).toMatchObject({ ok: false, error: { code: "schema" } });
    }
  });

  test("more rows than requested is a schema error", async () => {
    const { rest } = make([on("market/candles", () => ({ body: okEnvelope([candleRow(1000, 10), candleRow(2000, 10)]) }))]);
    expect(await rest.candles("A-USDT", "1m", { limit: 1 })).toMatchObject({ ok: false, error: { code: "schema" } });
  });

  test("history pages walk backwards with after and join into one oldest first series", async () => {
    const bars = (from: number, to: number): string[][] => {
      const rows: string[][] = [];
      for (let i = to; i >= from; i -= 1) rows.push(candleRow(i * 60_000, 100 + (i % 7)));
      return rows;
    };
    const { rest, calls } = make([
      on("market/candles", () => ({ body: okEnvelope(bars(251, 550)) })),
      on("market/history-candles", (url) => {
        const after = Number(url.searchParams.get("after"));
        const limit = Number(url.searchParams.get("limit"));
        const newestWanted = after / 60_000 - 1;
        return { body: okEnvelope(bars(newestWanted - limit + 1, newestWanted)) };
      }),
    ]);
    const result = await rest.candleHistory("A-USDT", "1m", 450);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(450);
    expect(result.value[0]?.tsMs).toBe(101 * 60_000);
    expect(result.value[449]?.tsMs).toBe(550 * 60_000);
    const urls = calls.map((c) => new URL(c.url));
    expect(urls[0]?.pathname).toBe("/api/v5/market/candles");
    expect(urls[1]?.pathname).toBe("/api/v5/market/history-candles");
    expect(urls[1]?.searchParams.get("after")).toBe(String(251 * 60_000));
    expect(urls[1]?.searchParams.get("limit")).toBe("100");
    expect(urls[2]?.searchParams.get("after")).toBe(String(151 * 60_000));
    expect(urls[2]?.searchParams.get("limit")).toBe("50");
    expect(urls).toHaveLength(3);
  });

  test("a count within 300 needs a single request", async () => {
    const { rest, calls } = make([on("market/candles", () => ({ body: okEnvelope([candleRow(2000, 10), candleRow(1000, 10)]) }))]);
    const result = await rest.candleHistory("A-USDT", "5m", 2);
    expect(result.ok && result.value).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });
});

describe("envelope and transport errors", () => {
  const body = (code: string, data: unknown = []) => ({ code, msg: "m", data });

  test("OKX refusals map to honest codes", async () => {
    const cases: [string, number | undefined, unknown, string][] = [
      ["not_found", undefined, body("51001"), "inexistente"],
      ["okx_error", undefined, body("50000"), "50000"],
      ["rate_limited", undefined, body("50011"), "frequência"],
      ["rate_limited", 429, "slow down", "429"],
      ["http", 500, "boom", "500"],
      ["schema", undefined, "<html>", "JSON"],
      ["schema", undefined, { code: "0" }, "envelope"],
      ["schema", undefined, { data: [] }, "envelope"],
      ["schema", undefined, [], "envelope"],
    ];
    for (const [code, status, payload, text] of cases) {
      const { rest } = make([() => ({ ...(status ? { status } : {}), body: payload })]);
      const result = await rest.ticker("A-USDT");
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe(code);
      expect(result.error.message).toContain(text);
      expect(FORBIDDEN.test(result.error.message)).toBe(false);
    }
  });

  test("a network failure and a timeout are reported, not swallowed", async () => {
    const clock = new FakeClock();
    const failing: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    const rest = createOkxRest({ fetch: failing, now: clock.now, timers: clock, minIntervalMs: 0 });
    expect(await rest.ticker("A-USDT")).toMatchObject({ ok: false, error: { code: "network" } });

    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const slow = createOkxRest({ fetch: hanging, now: clock.now, timers: clock, minIntervalMs: 0, timeoutMs: 3_000 });
    const pending = slow.ticker("A-USDT");
    await flushPromises();
    clock.advance(3_000);
    expect(await pending).toMatchObject({ ok: false, error: { code: "timeout" } });
  });

  test("a call aborted by its signal never reaches the network", async () => {
    const { rest, calls } = make([() => ({ body: okEnvelope([]) })]);
    const controller = new AbortController();
    controller.abort();
    expect(await rest.ticker("A-USDT", controller.signal)).toMatchObject({ ok: false, error: { code: "aborted" } });
    expect(calls).toHaveLength(0);
  });

  test("an abort during the request is reported as aborted", async () => {
    const clock = new FakeClock();
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const rest = createOkxRest({ fetch: hanging, now: clock.now, timers: clock, minIntervalMs: 0 });
    const controller = new AbortController();
    const pending = rest.ticker("A-USDT", controller.signal);
    await flushPromises();
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "aborted" } });
  });
});

describe("instruments", () => {
  test("a live instrument is parsed and cached for the next call", async () => {
    const { rest, calls } = make([on("public/instruments", (url) => ({ body: okEnvelope([instrumentRow(url.searchParams.get("instId") ?? "")]) }))]);
    const first = await rest.instrument("MON-USDT-SWAP");
    expect(first.ok && first.value).toEqual({ instId: "MON-USDT-SWAP", instType: "SWAP", base: "MON", quote: "USDT", tickSz: "0.1", lotSz: "1" });
    await rest.instrument("MON-USDT-SWAP");
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toEqual({ instType: "SWAP", instId: "MON-USDT-SWAP" });
  });

  test("a suspended instrument is not live, a missing one is not found, and failures are not cached", async () => {
    let state = "suspend";
    let code = "0";
    const { rest, calls } = make([
      on("public/instruments", () => ({ body: code === "0" ? okEnvelope([instrumentRow("X-USDT", state)]) : { code, msg: "x", data: [] } })),
    ]);
    expect(await rest.instrument("X-USDT")).toMatchObject({ ok: false, error: { code: "not_live" } });
    state = "live";
    expect((await rest.instrument("X-USDT")).ok).toBe(true);
    code = "51001";
    expect(await rest.instrument("GONE-USDT")).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await rest.instrument("GONE-USDT")).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(calls).toHaveLength(4);
  });

  test("a different instrument than the one asked for is a schema error", async () => {
    const { rest } = make([on("public/instruments", () => ({ body: okEnvelope([instrumentRow("OTHER-USDT")]) }))]);
    expect(await rest.instrument("X-USDT")).toMatchObject({ ok: false, error: { code: "schema" } });
  });

  test("the list drops rows it cannot parse and says how many", async () => {
    const { rest } = make([
      on("public/instruments", () => ({ body: okEnvelope([instrumentRow("A-USDT"), { ...instrumentRow("B-USDT"), tickSz: "" }, "junk", instrumentRow("C-USDT-SWAP")]) })),
    ]);
    const result = await rest.instruments("SPOT");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((i) => i.instId)).toEqual(["A-USDT"]);
    expect(result.rejected).toBe(3);
  });
});

describe("tickers, funding, open interest and mark price", () => {
  test("tickers drop rows without a last price", async () => {
    const { rest } = make([
      on("market/tickers", () => ({ body: okEnvelope([tickerRow("A-USDT", "1.5", 10), tickerRow("B-USDT", "", 10), tickerRow("C-USDT", "2", 11)]) })),
    ]);
    const result = await rest.tickers("SPOT");
    expect(result.ok && result.value.map((t) => t.instId)).toEqual(["A-USDT", "C-USDT"]);
    expect(result.ok && result.rejected).toBe(1);
  });

  test("a single ticker must be exactly the one asked for", async () => {
    const { rest } = make([on("market/ticker", (url) => ({ body: okEnvelope([tickerRow(url.searchParams.get("instId") === "A-USDT" ? "A-USDT" : "ZZ-USDT", "1", 5)]) }))]);
    expect((await rest.ticker("A-USDT")).ok).toBe(true);
    expect(await rest.ticker("B-USDT")).toMatchObject({ ok: false, error: { code: "schema" } });
  });

  test("funding, open interest and mark price parse and refuse missing numbers", async () => {
    const { rest } = make([
      on("public/funding-rate", () => ({ body: okEnvelope([{ instId: "A-USDT-SWAP", fundingRate: "0.0001", fundingTime: "1791748800000", nextFundingTime: "1791763200000", ts: "5" }]) })),
      on("public/open-interest", () => ({ body: okEnvelope([{ instId: "A-USDT-SWAP", oi: "100", oiCcy: "1000", oiUsd: "6000.5", ts: "5" }]) })),
      on("public/mark-price", () => ({ body: okEnvelope([{ instId: "A-USDT-SWAP", markPx: "0.02", ts: "5" }]) })),
    ]);
    expect(await rest.fundingRate("A-USDT-SWAP")).toMatchObject({ ok: true, value: { fundingRate: 0.0001, nextFundingTimeMs: 1791748800000 } });
    expect(await rest.openInterest("A-USDT-SWAP")).toMatchObject({ ok: true, value: { openInterest: 100, openInterestUsd: 6000.5 } });
    expect(await rest.markPrice("A-USDT-SWAP")).toMatchObject({ ok: true, value: { markPx: 0.02 } });

    const broken = make([
      on("public/funding-rate", () => ({ body: okEnvelope([{ instId: "A-USDT-SWAP", fundingRate: "", ts: "5" }]) })),
      on("public/open-interest", () => ({ body: okEnvelope([{ instId: "A-USDT-SWAP", oi: "lots", ts: "5" }]) })),
      on("public/mark-price", () => ({ body: okEnvelope([]) })),
    ]).rest;
    expect(await broken.fundingRate("A-USDT-SWAP")).toMatchObject({ ok: false, error: { code: "schema" } });
    expect(await broken.openInterest("A-USDT-SWAP")).toMatchObject({ ok: false, error: { code: "schema" } });
    expect(await broken.markPrice("A-USDT-SWAP")).toMatchObject({ ok: false, error: { code: "schema" } });
  });
});

describe("rate limiting", () => {
  test("concurrent calls are spaced by the minimum interval, in order", async () => {
    const clock = new FakeClock();
    const stamps: number[] = [];
    const fetch: FetchLike = async () => {
      stamps.push(clock.nowMs);
      return { ok: true, status: 200, text: async () => JSON.stringify(okEnvelope([tickerRow("A-USDT", "1", 5)])) };
    };
    const rest = createOkxRest({ fetch, now: clock.now, timers: clock, minIntervalMs: 300 });
    const calls = [rest.ticker("A-USDT"), rest.ticker("A-USDT"), rest.ticker("A-USDT")];
    await clock.advanceAsync(1_000, 50);
    const results = await Promise.all(calls);
    expect(results.every((r) => r.ok)).toBe(true);
    const start = stamps[0] ?? 0;
    expect(stamps.map((s) => s - start)).toEqual([0, 300, 600]);
  });

  test("a rate limit answer delays every later call and is reported as such", async () => {
    const clock = new FakeClock();
    const stamps: number[] = [];
    let first = true;
    const fetch: FetchLike = async () => {
      stamps.push(clock.nowMs);
      if (first) {
        first = false;
        return { ok: false, status: 429, text: async () => "" };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(okEnvelope([tickerRow("A-USDT", "1", 5)])) };
    };
    const rest = createOkxRest({ fetch, now: clock.now, timers: clock, minIntervalMs: 0, rateLimitCooldownMs: 2_000 });
    expect(await rest.ticker("A-USDT")).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    const next = rest.ticker("A-USDT");
    await clock.advanceAsync(2_500, 100);
    expect((await next).ok).toBe(true);
    expect((stamps[1] ?? 0) - (stamps[0] ?? 0)).toBeGreaterThanOrEqual(2_000);
  });
});

describe("rest feed status", () => {
  test("idle, live, stale after the window, failed on an error, then recovered", async () => {
    let fail = false;
    const { rest, clock } = make([() => (fail ? { status: 500, body: "x" } : { body: okEnvelope([tickerRow("A-USDT", "1", 5)]) })]);
    const assertClean = (s: ReturnType<OkxRest["status"]>): void => {
      expect(FORBIDDEN.test(s.detail ?? "")).toBe(false);
    };
    expect(rest.status()).toMatchObject({ id: "okx-public-rest", state: "idle", lastMessageAtMs: null, freshnessMs: 120_000 });
    await rest.ticker("A-USDT");
    const liveAt = clock.nowMs;
    expect(rest.status()).toMatchObject({ state: "live", lastMessageAtMs: liveAt, detail: null, reconnects: 0 });
    clock.advance(120_000);
    expect(rest.status().state).toBe("live");
    clock.advance(1);
    const stale = rest.status();
    expect(stale.state).toBe("stale");
    assertClean(stale);
    fail = true;
    await rest.ticker("A-USDT");
    const failed = rest.status();
    expect(failed.state).toBe("failed");
    expect(failed.detail).toContain("HTTP 500");
    assertClean(failed);
    fail = false;
    await rest.ticker("A-USDT");
    expect(rest.status()).toMatchObject({ state: "live", reconnects: 1 });
  });

  test("an OKX refusal such as instrument not found does not mark the transport as failed", async () => {
    const { rest } = make([() => ({ body: { code: "51001", msg: "x", data: [] } })]);
    await rest.instrument("NOPE-USDT");
    expect(rest.status().state).toBe("live");
  });
});

describe("rest feed notifications", () => {
  test("onStatusChange fires on the first success, on a failure and on recovery, not on every call", async () => {
    const clock = new FakeClock();
    let fail = false;
    const { fetch } = createFakeFetch([() => (fail ? { status: 500, body: "x" } : { body: okEnvelope([tickerRow("A-USDT", "1", 5)]) })]);
    const seen: string[] = [];
    const rest = createOkxRest({ fetch, now: clock.now, timers: clock, minIntervalMs: 0, onStatusChange: (s) => seen.push(s.state) });
    await rest.ticker("A-USDT");
    await rest.ticker("A-USDT");
    fail = true;
    await rest.ticker("A-USDT");
    await rest.ticker("A-USDT");
    fail = false;
    await rest.ticker("A-USDT");
    expect(seen).toEqual(["live", "failed", "live"]);
  });
});
