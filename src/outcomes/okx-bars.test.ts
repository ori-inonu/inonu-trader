import { describe, expect, test } from "bun:test";
import { OkxPublicError } from "../inonu/okx-public";
import { MAX_BARS, createOkxBars, parseBars } from "./okx-bars";

const row = (ts: number, o: string, h: string, l: string, c: string, confirm = "1"): string[] => [String(ts), o, h, l, c, "12.5", "1250", "1250", confirm];
const ok = (data: unknown): Response => new Response(JSON.stringify({ code: "0", msg: "", data }), { status: 200 });

function fakeFetch(answer: (url: URL) => Response) {
  const urls: URL[] = [];
  const f = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    urls.push(url);
    return answer(url);
  }) as typeof fetch;
  return { f, urls };
}

describe("bars", () => {
  test("parses the newest-first rows into oldest-first numeric bars and keeps the confirmation flag and the volume", async () => {
    const { f, urls } = fakeFetch(() => ok([row(3000, "10", "11", "9", "10.5", "0"), row(2000, "9", "10", "8.5", "10"), row(1000, "8", "9.2", "7.9", "9")]));
    const api = createOkxBars({ fetch: f, spacingMs: 0 });
    const bars = await api.bars("ETH-USDT", "1h", 3);
    expect(bars.map((b) => [b.ts, b.close, b.confirmed, b.volume])).toEqual([[1000, 9, true, 12.5], [2000, 10, true, 12.5], [3000, 10.5, false, 12.5]]);
    expect(urls[0]!.pathname).toBe("/api/v5/market/candles");
    expect(urls[0]!.searchParams.get("bar")).toBe("1H"); // the exchange spells hours with a capital letter
    expect(urls[0]!.searchParams.get("limit")).toBe("3");
  });

  test("history asks for the bars before a cursor", async () => {
    const { f, urls } = fakeFetch(() => ok([row(500, "1", "2", "1", "1.5")]));
    const api = createOkxBars({ fetch: f, spacingMs: 0 });
    await api.history("BTC-USDT-SWAP", "4h", 1000, 100);
    expect(urls[0]!.pathname).toBe("/api/v5/market/history-candles");
    expect([urls[0]!.searchParams.get("bar"), urls[0]!.searchParams.get("after")]).toEqual(["4H", "1000"]);
  });

  test("rows that are not the documented shape are dropped; all of them bad is an error", () => {
    expect(parseBars([row(1, "1", "2", "1", "1.5"), ["x"], row(2, "0", "2", "1", "1.5"), row(3, "1", "1", "2", "1.5"), null]).map((b) => b.ts)).toEqual([1]);
    expect(() => parseBars([["x"], null])).toThrow(OkxPublicError);
    expect(parseBars([])).toEqual([]);
  });

  test("bad instrument, limit and cursor are refused before any request", async () => {
    const { f, urls } = fakeFetch(() => ok([]));
    const api = createOkxBars({ fetch: f, spacingMs: 0 });
    await expect(api.bars("eth usdt", "1h", 5)).rejects.toMatchObject({ code: "instrument_unsupported" });
    await expect(api.bars("ETH-USDT", "1h", MAX_BARS + 1)).rejects.toMatchObject({ code: "bad_limit" });
    await expect(api.history("ETH-USDT", "1h", 0, 10)).rejects.toMatchObject({ code: "bad_cursor" });
    expect(urls.length).toBe(0);
  });
});

describe("quote", () => {
  test("mid and spread in bps", async () => {
    const { f } = fakeFetch(() => ok([{ instId: "ETH-USDT", last: "100.05", bidPx: "99.99", askPx: "100.01" }]));
    const q = await createOkxBars({ fetch: f, spacingMs: 0 }).quote("ETH-USDT");
    expect(q.mid).toBeCloseTo(100, 10);
    expect(q.spreadBps).toBeCloseTo(2, 6);
    expect(q.last).toBe(100.05);
  });
  test("a crossed or foreign quote is invalid", async () => {
    const crossed = fakeFetch(() => ok([{ instId: "ETH-USDT", last: "100", bidPx: "101", askPx: "100" }]));
    await expect(createOkxBars({ fetch: crossed.f, spacingMs: 0 }).quote("ETH-USDT")).rejects.toMatchObject({ code: "quote_invalid" });
    const foreign = fakeFetch(() => ok([{ instId: "BTC-USDT", last: "100", bidPx: "99", askPx: "100" }]));
    await expect(createOkxBars({ fetch: foreign.f, spacingMs: 0 }).quote("ETH-USDT")).rejects.toMatchObject({ code: "quote_invalid" });
  });
});

describe("errors never carry the provider's text, and requests are spaced", () => {
  test("http and okx errors are constant codes", async () => {
    const e429 = fakeFetch(() => new Response("slow down", { status: 429 }));
    await expect(createOkxBars({ fetch: e429.f, spacingMs: 0 }).bars("ETH-USDT", "5m", 5)).rejects.toMatchObject({ code: "rate_limited" });
    const okxError = fakeFetch(() => new Response(JSON.stringify({ code: "51001", msg: "secret detail", data: [] }), { status: 200 }));
    const err = await createOkxBars({ fetch: okxError.f, spacingMs: 0 }).bars("ETH-USDT", "5m", 5).catch((e: unknown) => e);
    expect((err as OkxPublicError).code).toBe("okx_error");
    expect(String(err)).not.toContain("secret");
  });

  test("a click that is cancelled is told so", async () => {
    const controller = new AbortController();
    controller.abort();
    const f = ((_: unknown, init?: RequestInit) => (init?.signal?.aborted ? Promise.reject(new Error("aborted")) : Promise.resolve(ok([])))) as typeof fetch;
    await expect(createOkxBars({ fetch: f, spacingMs: 0 }).bars("ETH-USDT", "5m", 5, controller.signal)).rejects.toMatchObject({ code: "aborted" });
  });

  test("at least the spacing between two requests, even when asked together", async () => {
    let now = 0;
    const waits: number[] = [];
    const starts: number[] = [];
    const f = (async () => {
      starts.push(now);
      return ok([]);
    }) as unknown as typeof fetch;
    const api = createOkxBars({ fetch: f, spacingMs: 150, monotonic: () => now, sleep: async (ms) => { waits.push(ms); now += ms; } });
    await Promise.all([api.bars("ETH-USDT", "5m", 5), api.bars("ETH-USDT", "15m", 5), api.bars("ETH-USDT", "1h", 5)]);
    expect(starts).toEqual([0, 150, 300]);
    expect(waits).toEqual([150, 150]);
  });
});
