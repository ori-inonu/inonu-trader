// The free public OKX REST reads that "Pedir ao Inonu" makes at the moment of a click: the instrument, the one minute candles
// and the latest trades. No credential, no signature. origin: synthetic_fixture (the replies below are shaped like the
// documented ones), tests only.
import { describe, expect, test } from "bun:test";
import { OkxPublicError, createOkxPublic, instTypeOf } from "./okx-public";

type Reply = { status?: number; body: unknown };
function fakeFetch(routes: Record<string, Reply>) {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    const path = new URL(url).pathname;
    const reply = routes[path];
    if (!reply) return new Response("{}", { status: 404 });
    return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}
const ok = (data: unknown) => ({ body: { code: "0", msg: "", data } });

describe("funding rate and open interest of a perpetual (T5.10)", () => {
  const funding = ok([{ instId: "BTC-USDT-SWAP", fundingRate: "0.0001", nextFundingRate: "", fundingTime: "1800000000000" }]);
  const oi = ok([{ instId: "BTC-USDT-SWAP", oi: "9000000", oiCcy: "90000", oiUsd: "7400000000", ts: "1800000005000" }]);

  test("reads the funding rate with the sign, and an empty next rate is unknown, not zero", async () => {
    const { fetchImpl, urls } = fakeFetch({ "/api/v5/public/funding-rate": funding });
    const read = await createOkxPublic({ fetch: fetchImpl }).fundingRate!("BTC-USDT-SWAP");
    expect(read).toEqual({ rate: 0.0001, nextRate: null, fundingTimeMs: 1_800_000_000_000 });
    expect(urls[0]).toBe("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP");
    const negative = fakeFetch({ "/api/v5/public/funding-rate": ok([{ instId: "BTC-USDT-SWAP", fundingRate: "-0.00025", nextFundingRate: "0.0002", fundingTime: "1800000000000" }]) });
    expect(await createOkxPublic({ fetch: negative.fetchImpl }).fundingRate!("BTC-USDT-SWAP")).toMatchObject({ rate: -0.00025, nextRate: 0.0002 });
  });

  test("reads the open interest in dollars, coin and contracts-free form, and asks for exactly that instrument", async () => {
    const { fetchImpl, urls } = fakeFetch({ "/api/v5/public/open-interest": oi });
    const read = await createOkxPublic({ fetch: fetchImpl }).openInterest!("BTC-USDT-SWAP");
    expect(read).toEqual({ oiUsd: 7_400_000_000, oiCcy: 90_000, tsMs: 1_800_000_005_000 });
    expect(urls[0]).toBe("https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP");
  });

  test("only perpetuals have them: spot and futures are refused before anything is asked", async () => {
    const { fetchImpl, urls } = fakeFetch({});
    const rest = createOkxPublic({ fetch: fetchImpl });
    for (const id of ["BTC-USDT", "BTC-USDT-250627", "x y"]) {
      await expect(rest.fundingRate!(id)).rejects.toMatchObject({ code: "instrument_unsupported" });
      await expect(rest.openInterest!(id)).rejects.toMatchObject({ code: "instrument_unsupported" });
    }
    expect(urls).toEqual([]);
  });

  test("a malformed row, another instrument or an empty list is an error with a constant code", async () => {
    const bad = async (route: string, data: unknown, call: "fundingRate" | "openInterest") => {
      const { fetchImpl } = fakeFetch({ [route]: ok(data) });
      return createOkxPublic({ fetch: fetchImpl })[call]!("BTC-USDT-SWAP").catch((e) => e);
    };
    expect(await bad("/api/v5/public/funding-rate", [], "fundingRate")).toMatchObject({ code: "funding_invalid" });
    expect(await bad("/api/v5/public/funding-rate", [{ instId: "ETH-USDT-SWAP", fundingRate: "0.0001", fundingTime: "1" }], "fundingRate")).toMatchObject({ code: "funding_invalid" });
    expect(await bad("/api/v5/public/funding-rate", [{ instId: "BTC-USDT-SWAP", fundingRate: "abc", fundingTime: "1" }], "fundingRate")).toMatchObject({ code: "funding_invalid" });
    expect(await bad("/api/v5/public/open-interest", [], "openInterest")).toMatchObject({ code: "oi_invalid" });
    expect(await bad("/api/v5/public/open-interest", [{ instId: "BTC-USDT-SWAP", oi: "1", oiCcy: "1", oiUsd: "-5", ts: "1" }], "openInterest")).toMatchObject({ code: "oi_invalid" });
    expect(await bad("/api/v5/public/open-interest", [{ instId: "BTC-USDT-SWAP", oi: "1", oiCcy: "1", oiUsd: "5", ts: "x" }], "openInterest")).toMatchObject({ code: "oi_invalid" });
  });
});

describe("instTypeOf", () => {
  test("reads the kind from the id", () => {
    expect(instTypeOf("BTC-USDT")).toBe("SPOT");
    expect(instTypeOf("BTC-USDT-SWAP")).toBe("SWAP");
    expect(instTypeOf("BTC-USDT-250627")).toBe("FUTURES");
    expect(instTypeOf("BTC-USD-250627-60000-C")).toBeNull();
    expect(instTypeOf("btc usdt")).toBeNull();
    expect(instTypeOf("")).toBeNull();
  });
});

describe("instrument", () => {
  test("maps the metadata the footprint needs, and asks for exactly that instrument", async () => {
    const { fetchImpl, urls } = fakeFetch({ "/api/v5/public/instruments": ok([{ instId: "BTC-USDT-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "0.01", ctVal: "0.01", ctMult: "1", state: "live" }]) });
    const meta = await createOkxPublic({ fetch: fetchImpl }).instrument("BTC-USDT-SWAP");
    expect(meta).toEqual({ instId: "BTC-USDT-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "0.01", ctVal: "0.01", ctMult: "1" });
    expect(urls[0]).toBe("https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP");
  });

  test("spot has no contract value and none is invented", async () => {
    const { fetchImpl } = fakeFetch({ "/api/v5/public/instruments": ok([{ instId: "BTC-USDT", instType: "SPOT", tickSz: "0.1", lotSz: "0.00000001", ctVal: "", ctMult: "", state: "live" }]) });
    expect(await createOkxPublic({ fetch: fetchImpl }).instrument("BTC-USDT")).toEqual({ instId: "BTC-USDT", instType: "SPOT", tickSz: "0.1", lotSz: "0.00000001" });
  });

  test("an unknown instrument, a suspended one and a malformed row are errors with constant codes", async () => {
    for (const [data, code] of [
      [[], "instrument_not_found"],
      [[{ instId: "X-USDT", instType: "SPOT", tickSz: "abc", lotSz: "1", state: "live" }], "instrument_invalid"],
      [[{ instId: "X-USDT", instType: "SPOT", tickSz: "0.1", lotSz: "1", state: "suspend" }], "instrument_not_live"],
      [[{ instId: "X-USDT-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "1", ctVal: "", ctMult: "1", state: "live" }], "instrument_invalid"],
    ] as const) {
      const { fetchImpl } = fakeFetch({ "/api/v5/public/instruments": ok(data) });
      await expect(createOkxPublic({ fetch: fetchImpl }).instrument("X-USDT")).rejects.toMatchObject({ code });
    }
  });

  test("an inverse contract (its value is in dollars, not in the base coin) is not supported: the units would be read as coins", async () => {
    const inverse = { instId: "BTC-USD-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "1", ctVal: "100", ctMult: "1", ctType: "inverse", ctValCcy: "USD", state: "live" };
    const { fetchImpl } = fakeFetch({ "/api/v5/public/instruments": ok([inverse]) });
    await expect(createOkxPublic({ fetch: fetchImpl }).instrument("BTC-USD-SWAP")).rejects.toMatchObject({ code: "instrument_unsupported" });
    const linear = fakeFetch({ "/api/v5/public/instruments": ok([{ ...inverse, instId: "BTC-USDT-SWAP", ctVal: "0.01", ctType: "linear", ctValCcy: "BTC" }]) });
    expect(await createOkxPublic({ fetch: linear.fetchImpl }).instrument("BTC-USDT-SWAP")).toMatchObject({ instType: "SWAP", ctVal: "0.01", ctMult: "1" });
  });

  test("an id that is not a spot, swap or futures id never reaches the network", async () => {
    const { fetchImpl, urls } = fakeFetch({});
    await expect(createOkxPublic({ fetch: fetchImpl }).instrument("BTC-USD-250627-60000-C")).rejects.toMatchObject({ code: "instrument_unsupported" });
    expect(urls).toEqual([]);
  });
});

describe("candles", () => {
  const row = (ts: number, confirm: string) => [String(ts), "100", "101", "99", "100.5", "10", "1000", "1000", confirm];

  test("returns closed candles oldest first as decimal text, dropping the one still forming", async () => {
    const { fetchImpl, urls } = fakeFetch({ "/api/v5/market/candles": ok([row(3000, "0"), row(2000, "1"), row(1000, "1")]) });
    const candles = await createOkxPublic({ fetch: fetchImpl }).candles("BTC-USDT", 100);
    expect(candles).toEqual([
      { ts: 1000, open: "100", high: "101", low: "99", close: "100.5" },
      { ts: 2000, open: "100", high: "101", low: "99", close: "100.5" },
    ]);
    expect(urls[0]).toBe("https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1m&limit=100");
  });

  test("a row that is not a candle is dropped, and an all-bad reply is an error", async () => {
    const { fetchImpl } = fakeFetch({ "/api/v5/market/candles": ok([row(1000, "1"), ["x"], row(2000, "1").map((v, i) => (i === 2 ? "abc" : v))]) });
    expect((await createOkxPublic({ fetch: fetchImpl }).candles("BTC-USDT", 100)).map((c) => c.ts)).toEqual([1000]);
    const bad = fakeFetch({ "/api/v5/market/candles": ok([["x"]]) });
    await expect(createOkxPublic({ fetch: bad.fetchImpl }).candles("BTC-USDT", 100)).rejects.toMatchObject({ code: "candles_invalid" });
  });

  test("the limit is bounded", async () => {
    const { fetchImpl } = fakeFetch({ "/api/v5/market/candles": ok([row(1000, "1")]) });
    const client = createOkxPublic({ fetch: fetchImpl });
    for (const bad of [0, 301, 1.5]) await expect(client.candles("BTC-USDT", bad)).rejects.toMatchObject({ code: "bad_limit" });
  });
});

describe("trades", () => {
  const trade = (tradeId: string, ts: number, side: string, px = "100.5", sz = "2") => ({ instId: "BTC-USDT", tradeId, px, sz, side, ts: String(ts) });

  test("returns the aggressor side of each trade, oldest first, and counts what it dropped", async () => {
    const { fetchImpl, urls } = fakeFetch({ "/api/v5/market/trades": ok([trade("3", 3000, "sell"), trade("2", 2000, "buy"), trade("bad", 1500, "hold"), trade("1", 1000, "buy", "x")]) });
    const result = await createOkxPublic({ fetch: fetchImpl }).trades("BTC-USDT", 500);
    expect(result.trades).toEqual([
      { ts: 2000, px: "100.5", sz: "2", side: "buy" },
      { ts: 3000, px: "100.5", sz: "2", side: "sell" },
    ]);
    expect(result.rejected).toBe(2);
    expect(urls[0]).toBe("https://www.okx.com/api/v5/market/trades?instId=BTC-USDT&limit=500");
  });

  test("the limit is bounded to what the exchange accepts", async () => {
    const { fetchImpl } = fakeFetch({ "/api/v5/market/trades": ok([trade("1", 1, "buy")]) });
    for (const bad of [0, 501]) await expect(createOkxPublic({ fetch: fetchImpl }).trades("BTC-USDT", bad)).rejects.toMatchObject({ code: "bad_limit" });
  });
});

describe("failures carry a constant code and nothing else", () => {
  test("an error envelope, an HTTP error, bad JSON and a network failure", async () => {
    const cases: [Reply | "throw", string][] = [
      [{ body: { code: "50011", msg: "Too many requests SENTINEL-x", data: [] } }, "okx_error"],
      [{ status: 503, body: "oops SENTINEL-y" }, "http_error"],
      [{ body: "<html>not json SENTINEL-z</html>" }, "bad_json"],
      ["throw", "network"],
    ];
    for (const [reply, code] of cases) {
      const fetchImpl = (async () => {
        if (reply === "throw") throw new Error("connect ECONNREFUSED SENTINEL-n");
        return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 200 });
      }) as unknown as typeof fetch;
      const error = await createOkxPublic({ fetch: fetchImpl }).trades("BTC-USDT", 10).catch((e) => e);
      expect(error).toBeInstanceOf(OkxPublicError);
      expect(error.code).toBe(code);
      expect(String(error.message)).not.toContain("SENTINEL");
    }
  });

  test("a call that never answers is cut at the timeout", async () => {
    const fetchImpl = ((_url: string, init?: { signal?: AbortSignal }) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const error = await createOkxPublic({ fetch: fetchImpl, timeoutMs: 30 }).trades("BTC-USDT", 10).catch((e) => e);
    expect(error).toMatchObject({ code: "timeout" });
  });

  test("an outer abort (a cancelled click) stops the call", async () => {
    const controller = new AbortController();
    const fetchImpl = ((_url: string, init?: { signal?: AbortSignal }) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const pending = createOkxPublic({ fetch: fetchImpl, timeoutMs: 5_000 }).trades("BTC-USDT", 10, controller.signal).catch((e) => e);
    controller.abort();
    expect(await pending).toMatchObject({ code: "aborted" });
  });
});
