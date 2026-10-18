// The public OKX reads of the opportunity engine: strict about shape, constant error codes, paced. origin: synthetic_fixture, tests only. No network.
import { describe, expect, test } from "bun:test";
import { createOkxDaily, OpportunityDataError } from "./okx-daily";

const ok = (data: unknown) => new Response(JSON.stringify({ code: "0", msg: "", data }), { status: 200 });
const noWait = async () => undefined;

function fake(responses: Array<Response | Error>) {
  const urls: string[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    urls.push(String(url));
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    if (next instanceof Error) throw next;
    return next.clone();
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, urls };
}

const TICKER = (over: Record<string, unknown> = {}) => ({ instId: "ETH-USDT", last: "2500", open24h: "2400", high24h: "2550", low24h: "2390", volCcy24h: "300000000", bidPx: "2499.9", askPx: "2500.1", ts: "1791907200000", ...over });
// [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm], the exchange sends the newest first
const CANDLE = (ts: number, close = "100", over: Partial<Record<number, string>> = {}) => {
  const row = [String(ts), "99", "101", "98", close, "10", "1000", "1000", "1"];
  for (const [k, v] of Object.entries(over)) row[Number(k)] = v!;
  return row;
};

describe("tickers", () => {
  test("keeps the pairs against USDT with their numbers, and ignores other quotes without calling them broken", async () => {
    const { fetch, urls } = fake([ok([TICKER(), TICKER({ instId: "ETH-BTC" }), TICKER({ instId: "SOL-USDT", last: "100" })])]);
    const result = await createOkxDaily({ fetch, sleep: noWait }).tickers();
    expect(result.tickers.map((t) => t.instId)).toEqual(["ETH-USDT", "SOL-USDT"]);
    expect(result.rejected).toBe(0);
    expect(result.tickers[0]).toMatchObject({ last: 2500, open24h: 2400, volQuote24h: 300_000_000, bid: 2499.9, ask: 2500.1 });
    expect(urls[0]).toContain("/api/v5/market/tickers?instType=SPOT");
  });

  test("a row with a price that is not positive or a volume that is not a number is dropped and counted", async () => {
    const { fetch } = fake([ok([TICKER({ last: "0" }), TICKER({ instId: "A-USDT", volCcy24h: "x" }), TICKER({ instId: "B-USDT", ts: "" }), TICKER({ instId: "OK-USDT" })])]);
    const result = await createOkxDaily({ fetch, sleep: noWait }).tickers();
    expect(result.tickers.map((t) => t.instId)).toEqual(["OK-USDT"]);
    expect(result.rejected).toBe(3);
  });

  test("rejects non-decimal numeric text rather than Number coercions", async () => {
    const { fetch } = fake([ok([
      TICKER({ instId: "HEX-USDT", last: "0x64" }),
      TICKER({ instId: "SPACED-USDT", last: " 100 " }),
      TICKER({ instId: "OK-USDT" }),
    ])]);
    const { tickers, rejected } = await createOkxDaily({ fetch, sleep: noWait }).tickers();
    expect(tickers.map((t) => t.instId)).toEqual(["OK-USDT"]);
    expect(rejected).toBe(2);
  });

  test("a missing best bid or ask is null, not zero", async () => {
    const { fetch } = fake([ok([TICKER({ bidPx: "", askPx: undefined })])]);
    const [t] = (await createOkxDaily({ fetch, sleep: noWait }).tickers()).tickers;
    expect(t!.bid).toBeNull();
    expect(t!.ask).toBeNull();
  });
});

describe("daily candles", () => {
  test("come oldest first, with the quote volume and the day in progress last", async () => {
    const { fetch, urls } = fake([ok([CANDLE(3000, "103"), CANDLE(2000, "102"), CANDLE(1000, "101")])]);
    const { candles, rejected } = await createOkxDaily({ fetch, sleep: noWait }).daily("ETH-USDT");
    expect(candles.map((c) => c.ts)).toEqual([1000, 2000, 3000]);
    expect(candles[2]).toEqual({ ts: 3000, open: 99, high: 101, low: 98, close: 103, volQuote: 1000 });
    expect(rejected).toBe(0);
    expect(urls[0]).toContain("bar=1D");
    expect(urls[0]).toContain("limit=100");
  });

  test("a broken row (a high under the low, a zero close, a short row, a negative volume) is dropped and counted, the rest stay", async () => {
    const { fetch } = fake([ok([CANDLE(1, "100", { 2: "90" }), CANDLE(2, "0"), ["3", "1"], CANDLE(4, "100", { 7: "-1" }), CANDLE(5, "100", { 7: "0" })])]);
    const { candles, rejected } = await createOkxDaily({ fetch, sleep: noWait }).daily("ETH-USDT");
    expect(candles.map((c) => c.ts)).toEqual([5]);
    expect(rejected).toBe(4);
  });

  test("older days are asked with `after`, and only a well formed pair is asked at all", async () => {
    const { fetch, urls } = fake([ok([CANDLE(500)])]);
    const okx = createOkxDaily({ fetch, sleep: noWait });
    await okx.history("ETH-USDT", 1000);
    expect(urls[0]).toContain("/api/v5/market/history-candles");
    expect(urls[0]).toContain("after=1000");
    await expect(okx.daily("eth/usdt")).rejects.toMatchObject({ code: "shape" });
    await expect(okx.daily("ETH-BTC")).rejects.toMatchObject({ code: "shape" });
    expect(urls).toHaveLength(1);
  });
});

describe("failures carry a constant code and never the provider's text", () => {
  test("http, shape and network", async () => {
    await expect(createOkxDaily({ fetch: fake([new Response("oops secret detail", { status: 500 })]).fetch, sleep: noWait }).tickers()).rejects.toMatchObject({ code: "http" });
    await expect(createOkxDaily({ fetch: fake([new Response(JSON.stringify({ code: "50011", msg: "rate limit secret", data: [] }))]).fetch, sleep: noWait }).tickers()).rejects.toMatchObject({ code: "shape" });
    await expect(createOkxDaily({ fetch: fake([new Response("not json")]).fetch, sleep: noWait }).tickers()).rejects.toBeInstanceOf(OpportunityDataError);
    const down = createOkxDaily({ fetch: fake([new Error("ECONNRESET 10.0.0.1")]).fetch, sleep: noWait }).tickers();
    await expect(down).rejects.toMatchObject({ code: "network" });
    await down.catch((e: Error) => expect(e.message).toBe("network"));
  });

  test("a read that never answers is a timeout, and a cancelled one is cancelled", async () => {
    const slow = (async (_url: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    await expect(createOkxDaily({ fetch: slow, timeoutMs: 20, sleep: noWait }).tickers()).rejects.toMatchObject({ code: "timeout" });
    const controller = new AbortController();
    const pending = createOkxDaily({ fetch: slow, timeoutMs: 5_000, sleep: noWait }).tickers(controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("pacing", () => {
  test("requests leave at least the gap apart, even when several callers ask at once", async () => {
    const waits: number[] = [];
    const { fetch } = fake([ok([CANDLE(1)])]);
    const okx = createOkxDaily({ fetch, minGapMs: 100, sleep: async (ms) => void waits.push(ms) });
    await Promise.all([okx.daily("A-USDT"), okx.daily("B-USDT"), okx.daily("C-USDT")]);
    // the first needs no wait (nothing before it, or far enough back); the next two are told to wait
    expect(waits.filter((w) => w > 0).length).toBeGreaterThanOrEqual(1);
    expect(waits.every((w) => w <= 100)).toBe(true);
  });
});
