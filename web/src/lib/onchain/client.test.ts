import { describe, expect, test } from "bun:test";
import { createOnchainClient, OnchainRequestError, type OnchainMeta } from "./client";

const META: OnchainMeta = { tier: "basic", cachedAtMs: 1, ageMs: 0, stale: false, budget: { tier: "basic", used: 2, cap: 50_000 } };

function fakeFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
  const f = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers });
    return new Response(JSON.stringify(body), { status });
  }) as never;
  return { calls, f };
}

const CANDLE = { ts: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, volumeUsd: 12, confirmed: true };

describe("onchain web client", () => {
  test("returns the envelope unchanged with typed rows", async () => {
    const { calls, f } = fakeFetch({ ok: true, data: [CANDLE], meta: META });
    const client = createOnchainClient("http://x", f);
    const res = await client.candles({ chainIndex: "1", token: "0xab", bar: "1m" }, "user");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data[0]).toEqual(CANDLE);
      expect(res.meta.stale).toBe(false);
      expect(res.meta.budget.used).toBe(2);
    }
    expect(calls[0]!.url).toBe("http://x/onchain/candles?chainIndex=1&token=0xab&bar=1m");
    expect(calls[0]!.headers).toEqual({ "x-inonu-intent": "user" });
  });

  test("background intent sends no intent header", async () => {
    const { calls, f } = fakeFetch({ ok: true, data: [], meta: META });
    const client = createOnchainClient("http://x", f);
    await client.chains();
    expect(calls[0]!.headers).toEqual({});
  });

  test("domain errors pass through the closed set, unknown codes become schema", async () => {
    const { f: f1 } = fakeFetch({ ok: false, error: "budget_exhausted" });
    const r1 = await createOnchainClient("http://x", f1).chains();
    expect(r1).toEqual({ ok: false, error: "budget_exhausted" });

    const { f: f2 } = fakeFetch({ ok: false, error: "something_new" });
    await expect(createOnchainClient("http://x", f2).chains()).rejects.toBeInstanceOf(OnchainRequestError);

    const { f: f3 } = fakeFetch({ ok: false, error: "bad_request" });
    const r3 = await createOnchainClient("http://x", f3).chains();
    expect(r3).toEqual({ ok: false, error: "bad_request" });
  });

  test("a server without the route and a server that refuses the origin are told apart from a malformed answer (SRC-1)", async () => {
    // the old backends answer 404 to /onchain/*; that used to surface as "Resposta fora do contrato"
    const notFound = fakeFetch("not found", 404);
    const refused = fakeFetch({ ok: false, code: "forbidden" }, 403);
    const garbled = fakeFetch("<html>oops</html>", 502);
    const code = async (f: never) => (await createOnchainClient("http://x", f).chains().catch((e: unknown) => e)) as OnchainRequestError;
    expect((await code(notFound.f)).code).toBe("backend_stale");
    expect((await code(refused.f)).code).toBe("origin_denied");
    expect((await code(garbled.f)).code).toBe("schema");
    const plain403 = fakeFetch("no", 403);
    expect((await code(plain403.f)).code).toBe("origin_denied");
  });

  test("a 404 that carries our own envelope (an unknown route of the real gateway) stays that envelope", async () => {
    const { f } = fakeFetch({ ok: false, code: "bad_request" }, 404);
    expect(await createOnchainClient("http://x", f).chains()).toEqual({ ok: false, error: "bad_request" });
  });

  test("the gateway's `code` serialization and non-200 envelopes are read as the same errors", async () => {
    // src/onchain-read/http.ts writes {ok:false, code} and sends bad_request with HTTP 400
    const { f: f1 } = fakeFetch({ ok: false, code: "no_credentials" });
    const r1 = await createOnchainClient("http://x", f1).chains();
    expect(r1).toEqual({ ok: false, error: "no_credentials" });

    const { f: f2 } = fakeFetch({ ok: false, code: "bad_request" }, 400);
    const r2 = await createOnchainClient("http://x", f2).chains();
    expect(r2).toEqual({ ok: false, error: "bad_request" });
  });

  test("out-of-contract payloads are rejected, never returned as data", async () => {
    // row missing a required numeric
    const { f } = fakeFetch({ ok: true, data: [{ ts: 1, open: 1 }], meta: META });
    await expect(createOnchainClient("http://x", f).candles({ chainIndex: "1", token: "x", bar: "1m" })).rejects.toBeInstanceOf(OnchainRequestError);
    // broken meta
    const { f: f2 } = fakeFetch({ ok: true, data: [], meta: { tier: "gold" } });
    await expect(createOnchainClient("http://x", f2).chains()).rejects.toBeInstanceOf(OnchainRequestError);
    // envelope without ok flag
    const { f: f3 } = fakeFetch({ data: [] });
    await expect(createOnchainClient("http://x", f3).chains()).rejects.toBeInstanceOf(OnchainRequestError);
    // walletType outside the closed enum
    const { f: f4 } = fakeFetch({
      ok: true,
      data: [{ tsMs: 1, walletCount: 1, amountUsd: 1, priceUsd: 1, walletType: "martian", token: {} }],
      meta: META,
    });
    await expect(createOnchainClient("http://x", f4).signals({ chainIndex: "1" })).rejects.toBeInstanceOf(OnchainRequestError);
  });

  test("budget and status parse or throw schema", async () => {
    const good = {
      month: "2026-10",
      restartedFromCorruptFile: false,
      tiers: {
        free: { used: 1, cap: null, today: 1, projection: 3 },
        basic: { used: 2, cap: 10, today: 2, projection: 5 },
        premium: { used: 0, cap: 10, today: 0, projection: 0 },
      },
    };
    const { f } = fakeFetch(good);
    const b = await createOnchainClient("http://x", f).budget();
    expect(b.tiers.basic.cap).toBe(10);
    const { f: fbad } = fakeFetch({ month: 42 });
    await expect(createOnchainClient("http://x", fbad).budget()).rejects.toBeInstanceOf(OnchainRequestError);
  });

  test("network failure throws a constant network error", async () => {
    const f = (async () => {
      throw new Error("down");
    }) as never;
    try {
      await createOnchainClient("http://x", f).chains();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OnchainRequestError);
      expect((e as OnchainRequestError).code).toBe("network");
    }
  });
});

describe("B1 routes against the committed normalizer contract", () => {
  // web/src/lib/test-fixtures/onchain-normalized.json is generated by scripts/make-onchain-web-fixtures.ts
  // and drift-guarded by src/onchain-read/web-fixture-drift.test.ts.
  type Json = Record<string, unknown>;
  const FIXTURES = require("../test-fixtures/onchain-normalized.json") as Record<string, unknown>;

  const TOKEN = { chainIndex: "1", token: "0xab" };
  const CALLS: Record<string, (c: ReturnType<typeof createOnchainClient>) => Promise<{ ok: boolean }>> = {
    "/onchain/price-info": (c) => c.priceInfo(TOKEN),
    "/onchain/token-risk": (c) => c.tokenRisk(TOKEN),
    "/onchain/pools": (c) => c.pools(TOKEN),
    "/onchain/cluster-chains": (c) => c.clusterChains(),
    "/onchain/clusters": (c) => c.clusters(TOKEN),
    "/onchain/trades": (c) => c.trades(TOKEN),
    "/onchain/news": (c) => c.news({ symbol: "BTC" }),
    "/onchain/sentiment": (c) => c.sentiment({ symbol: "BTC" }),
    "/onchain/sentiment-ranking": (c) => c.sentimentRanking(),
    "/onchain/vibe": (c) => c.vibe(TOKEN),
    "/onchain/kols": (c) => c.kols(TOKEN),
  };

  test.each(Object.keys(CALLS))("%s parses the real-shaped payload", async (route: string) => {
    const { calls, f } = fakeFetch({ ok: true, data: FIXTURES[route], meta: META });
    const res = await CALLS[route]!(createOnchainClient("http://x", f));
    expect(res.ok).toBe(true);
    expect(calls[0]!.url).toContain(route);
  });

  test("spot checks: field names, units and dropped rows survive as parsed", async () => {
    const client = (data: unknown) => createOnchainClient("http://x", fakeFetch({ ok: true, data, meta: META }).f);

    const info = await client(FIXTURES["/onchain/price-info"]).priceInfo(TOKEN);
    expect(info.ok).toBe(true);
    if (info.ok) {
      expect(info.data[0]!.address).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
      expect(info.data[0]!.change.h24).toBeCloseTo(-2.7);
      expect(info.data[0]!.txs.h24).toBe(213897);
    }

    const risk = await client(FIXTURES["/onchain/token-risk"]).tokenRisk(TOKEN);
    expect(risk.ok).toBe(true);
    if (risk.ok && risk.data !== null) {
      expect(risk.data.riskLevel).toBe(1);
      expect(risk.data.tags).toEqual(["communityRecognized", "ok_tag-2"]);
      expect(risk.data.bundleHoldPct).toBeNull();
    }

    const pools = await client(FIXTURES["/onchain/pools"]).pools(TOKEN);
    if (pools.ok) expect(pools.data).toHaveLength(2); // the invalid row was dropped upstream

    const news = await client(FIXTURES["/onchain/news"]).news({});
    if (news.ok) {
      expect(news.data.articles).toHaveLength(2);
      expect(news.data.articles[1]!.sentiments).toEqual([{ symbol: "BLUR", label: "bullish" }]);
      expect(JSON.stringify(news.data)).not.toContain("http");
    }

    const vibe = await client(FIXTURES["/onchain/vibe"]).vibe(TOKEN);
    if (vibe.ok && vibe.data !== null) {
      expect(vibe.data.points).toHaveLength(2);
      expect(JSON.stringify(vibe.data)).not.toContain("kols");
    }

    const kols = await client(FIXTURES["/onchain/kols"]).kols(TOKEN);
    if (kols.ok) {
      expect(kols.data).toHaveLength(2);
      expect(kols.data[0]!.handle).toBe("jackduval");
    }
  });

  test("corrupted variants become schema errors, never data", async () => {
    const client = (data: unknown) => createOnchainClient("http://x", fakeFetch({ ok: true, data, meta: META }).f);
    const arr = FIXTURES["/onchain/trades"] as Json[];

    // wrong top-level type
    await expect(client("text").trades(TOKEN)).rejects.toBeInstanceOf(OnchainRequestError);
    // non-array where a list is expected
    await expect(client({}).trades(TOKEN)).rejects.toBeInstanceOf(OnchainRequestError);
    // array where an object is expected
    await expect(client([]).tokenRisk(TOKEN)).rejects.toBeInstanceOf(OnchainRequestError);
    // missing a required field
    await expect(client([{ ...arr[0], side: "hold" }]).trades(TOKEN)).rejects.toBeInstanceOf(OnchainRequestError);
    await expect(
      client({ ...(FIXTURES["/onchain/sentiment"] as Record<string, unknown>), symbol: 42 }).sentiment({ symbol: "BTC" }),
    ).rejects.toBeInstanceOf(
      OnchainRequestError,
    );
    // news article without a title fails the whole payload
    await expect(
      client({ articles: [{ id: "x", tsMs: 1, symbols: [], sentiments: [] }] }).news({}),
    ).rejects.toBeInstanceOf(OnchainRequestError);
    // unknown extra keys are tolerated
    const extra = await client([{ ...arr[0], unexpected: { nested: true } }]).trades(TOKEN);
    expect(extra.ok).toBe(true);
    // kols handle outside the charset fails
    await expect(client([{ handle: "bad handle!", nickname: null }]).kols(TOKEN)).rejects.toBeInstanceOf(OnchainRequestError);
    // url paths of the new routes
    const { calls } = fakeFetch({ ok: true, data: [], meta: META });
    const c = createOnchainClient("http://x", fakeFetch({ ok: true, data: [], meta: META }).f);
    void calls;
    const newsCall = fakeFetch({ ok: true, data: { articles: [] }, meta: META });
    await createOnchainClient("http://x", newsCall.f).news({});
    expect(newsCall.calls[0]!.url).toBe("http://x/onchain/news");
    const sentCall = fakeFetch({ ok: true, data: {}, meta: META });
    await createOnchainClient("http://x", sentCall.f).sentiment({ symbol: "eth" }).catch(() => {});
    expect(sentCall.calls[0]!.url).toBe("http://x/onchain/sentiment?symbol=eth");
    void c;
  });

  test("data: null is the honest empty answer for single-object routes, not a schema error", async () => {
    const client = () => createOnchainClient("http://x", fakeFetch({ ok: true, data: null, meta: META }).f);
    // verified live: sentiment/symbol answers a valid envelope with details: [] and the gateway
    // serves data: null for it; vibe without a summary, clusters and token-risk without coverage
    // take the same path. The UI renders the neutral empty line for ready+null.
    for (const run of [
      (c: ReturnType<typeof createOnchainClient>) => c.sentiment({ symbol: "WETH" }),
      (c: ReturnType<typeof createOnchainClient>) => c.vibe(TOKEN),
      (c: ReturnType<typeof createOnchainClient>) => c.clusters(TOKEN),
      (c: ReturnType<typeof createOnchainClient>) => c.tokenRisk(TOKEN),
    ]) {
      const res = await run(client());
      expect(res).toMatchObject({ ok: true, data: null });
    }
    // but a wrong-typed payload is still out of contract
    const bad = createOnchainClient("http://x", fakeFetch({ ok: true, data: "x", meta: META }).f);
    await expect(bad.sentiment({ symbol: "BTC" })).rejects.toBeInstanceOf(OnchainRequestError);
  });

  test("clock_skew is a known error code; status carries clockOffsetMs", async () => {
    const { f } = fakeFetch({ ok: false, error: "clock_skew" });
    const r = await createOnchainClient("http://x", f).chains();
    expect(r).toEqual({ ok: false, error: "clock_skew" });

    const { f: f2 } = fakeFetch({ credential: "complete", lastCallMs: 5, lastCode: 0, cooldownUntilMs: null, clockOffsetMs: 76445 });
    const s = await createOnchainClient("http://x", f2).status();
    expect(s.clockOffsetMs).toBe(76445);

    const { f: f3 } = fakeFetch({ credential: "complete", lastCallMs: 5, lastCode: 0, cooldownUntilMs: null });
    await expect(createOnchainClient("http://x", f3).status()).rejects.toBeInstanceOf(OnchainRequestError);
  });
});
