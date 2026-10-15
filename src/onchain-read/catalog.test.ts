import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanText, endpointFor, ENDPOINTS, shortWallet } from "./catalog";

// SH-05: synthetic quote with documented response keys; no route, transaction or wallet data.
const shadowQuote = (over: Record<string, unknown> = {}) => ({
  chainIndex: "501", swapMode: "exactIn", mode: "legacy", fromTokenAmount: "9007199254740993", toTokenAmount: "123456789012345678901234567890",
  priceImpactPercent: "-0.4", estimateGasFee: "120000", tradeFee: "0.12",
  fromToken: { tokenContractAddress: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", decimal: "9" },
  toToken: { tokenContractAddress: "SyntheticToken123", tokenSymbol: "TOK", decimal: "18" }, ...over,
});

test("quote maps swapMode and keeps legacy mode only when swapMode is absent", () => {
  expect(endpointFor("/onchain/quote")!.normalize(shadowQuote())).toMatchObject({ ok: true, data: { mode: "exactIn" } });
  expect(endpointFor("/onchain/quote")!.normalize(shadowQuote({ swapMode: undefined, mode: "exactOut" }))).toMatchObject({ ok: true, data: { mode: "exactOut" } });
});

test("quote preserves exact integer strings above 2^53 without qualifying output units or combining costs", () => {
  expect(endpointFor("/onchain/quote")!.normalize(shadowQuote())).toMatchObject({ ok: true, data: {
    fromAmountRaw: "9007199254740993", toAmountRaw: "123456789012345678901234567890", outputUnit: "unverified",
    estimateGasFee: 120000, tradeFee: 0.12, priceImpactPct: -0.4,
  } });
  expect(endpointFor("/onchain/quote")!.normalize(shadowQuote({ fromTokenAmount: 100, toTokenAmount: 200, tradeFee: "" }))).toMatchObject({ ok: true, data: {
    fromAmount: 100, toAmount: 200, fromAmountRaw: null, toAmountRaw: null, outputUnit: "unverified", tradeFee: null,
  } });
});
function fixture(name: string): { code: string; data: unknown; msg: string } {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"));
  expect(raw.origin).toBe("synthetic_fixture");
  return raw;
}

/** Fixtures trimmed from the real provider answers recorded on 2026-10-12 (see the gateway doc). */
function fixtureReal(name: string): { code: string; data: unknown; msg: string } {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"));
  expect(raw.origin).toBe("real_probe_2026-10-12");
  return raw;
}

const ROUTES = ENDPOINTS.map((e) => e.route);

describe("catalog table", () => {
  test("covers exactly the documented local routes", () => {
    expect(ROUTES).toEqual([
      "/onchain/chains",
      "/onchain/signal-chains",
      "/onchain/leaderboard-chains",
      "/onchain/hot-tokens",
      "/onchain/search",
      "/onchain/candles",
      "/onchain/price",
      "/onchain/signals",
      "/onchain/leaderboard",
      "/onchain/holders",
      "/onchain/top-traders",
      "/onchain/price-info",
      "/onchain/token-risk",
      "/onchain/pools",
      "/onchain/cluster-chains",
      "/onchain/clusters",
      "/onchain/trades",
      "/onchain/news",
      "/onchain/sentiment",
      "/onchain/sentiment-ranking",
      "/onchain/vibe",
      "/onchain/kols",
      "/onchain/cluster-top-holders",
      "/onchain/quote",
      "/onchain/token-info",
      // the address of the connected wallet (src/onchain-read/routes/wallet.ts, WAL-4)
      "/onchain/wallet-value",
      "/onchain/wallet-balances",
      "/onchain/wallet-history",
      "/onchain/wallet-token-pnl",
      "/onchain/wallet-overview",
      "/onchain/wallet-pnl",
      // the networks of the provider with their logos (routes/chain-list.ts)
      "/onchain/networks",
      // the groups of addresses of a token and the trades of tracked wallets (routes/clusters-detail.ts and routes/address-tracker.ts, T3.10 and T3.11)
      "/onchain/cluster-list",
      "/onchain/address-tracker-trades",
      // the launches of a chain by stage of their life (routes/memepump.ts, RAS-2)
      "/onchain/memepump-list",
      // what the person's own wallet needs to carry out an order they confirmed (routes/trade.ts, WAL-10): the only routes that return something a wallet can sign
      "/onchain/swap",
      "/onchain/approve",
    ]);
  });

  test.each(ROUTES)("extra parameter is refused on %s", (route) => {
    const v = endpointFor(route)!.validate({ chainIndex: "1", token: "0xab", bar: "1m", q: "ok", timeFrame: "1", sortBy: "1", extra: "x" });
    expect(v.ok).toBe(false);
  });

  test("chains routes accept no parameters", () => {
    for (const id of ["chains", "signal-chains", "leaderboard-chains"]) {
      const ep = ENDPOINTS.find((e) => e.id === id)!;
      expect(ep.validate({}).ok).toBe(true);
      expect(ep.validate({ chainIndex: "1" }).ok).toBe(false);
      const v = ep.validate({});
      if (v.ok) expect(v.ttlMs).toBe(86_400_000);
    }
  });

  test("hot-tokens builds the fixed-ranking GET", () => {
    const ep = endpointFor("/onchain/hot-tokens")!;
    const v = ep.validate({ chainIndex: "501" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.method).toBe("GET");
      expect(v.request.path).toContain("rankingType=4");
      expect(v.request.path).toContain("rankingTimeFrame=2");
      expect(v.request.path).toContain("limit=50");
      expect(v.ttlMs).toBe(300_000);
    }
    expect(ep.validate({ chainIndex: "abc" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", timeFrame: "9" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", limit: "101" }).ok).toBe(false);
    expect(ep.validate({}).ok).toBe(false);
  });

  test("search maps chainIndex to the provider 'chains' param and validates q", () => {
    const ep = endpointFor("/onchain/search")!;
    const v = ep.validate({ chainIndex: "1", q: "weth" });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.request.path).toBe("/api/v6/dex/market/token/search?chains=1&search=weth");
    expect(ep.validate({ chainIndex: "1", q: "a" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", q: "x".repeat(65) }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", q: "ab\ncd" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1" }).ok).toBe(false);
  });

  test("candles validates bar set, per-bar TTL and token normalization", () => {
    const ep = endpointFor("/onchain/candles")!;
    const v = ep.validate({ chainIndex: "1", token: "0xABCDef00000000000000000000000000000000ab", bar: "4H" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.ttlMs).toBe(900_000);
      // EVM chain: address lowercased by the shared normalizer
      expect(v.request.path).toContain("tokenContractAddress=0xabcdef00000000000000000000000000000000ab");
      expect(v.request.path).toContain("bar=4H");
    }
    expect(endpointFor("/onchain/candles")!.validate({ chainIndex: "1", token: "0xab", bar: "1m" }).ok).toBe(true);
    if (true) {
      const v2 = ep.validate({ chainIndex: "1", token: "0xab", bar: "1m" });
      if (v2.ok) expect(v2.ttlMs).toBe(60_000);
    }
    expect(ep.validate({ chainIndex: "1", token: "0xab", bar: "2H" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", token: "0xab" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", token: "0xab", bar: "1m", limit: "300" }).ok).toBe(false);
    // non-EVM chain keeps the address case
    const v3 = ep.validate({ chainIndex: "501", token: "SoMeCaSe", bar: "1m" });
    if (v3.ok) expect(v3.request.path).toContain("tokenContractAddress=SoMeCaSe");
  });

  test("price is a POST with a one-object list body (official example shape)", () => {
    const ep = endpointFor("/onchain/price")!;
    const v = ep.validate({ chainIndex: "66", token: "0x382bb369d343125bfb2117af9c149795c6c65c50" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.method).toBe("POST");
      expect(v.request.path).toBe("/api/v6/dex/market/price");
      expect(JSON.parse(v.request.body!)).toEqual([{ chainIndex: "66", tokenContractAddress: "0x382bb369d343125bfb2117af9c149795c6c65c50" }]);
      expect(v.ttlMs).toBe(30_000);
    }
    expect(ep.validate({ chainIndex: "1" }).ok).toBe(false);
  });

  test("signals is a POST list of one object with a closed walletType subset", () => {
    const ep = endpointFor("/onchain/signals")!;
    const v = ep.validate({ chainIndex: "501", walletType: "1,3", minAmountUsd: "1000", limit: "10" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.method).toBe("POST");
      const body = JSON.parse(v.request.body!);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual({ chainIndex: "501", walletType: "1,3", minAmountUsd: "1000", limit: "10" });
      expect(v.ttlMs).toBe(300_000);
    }
    expect(ep.validate({ chainIndex: "501", walletType: "9" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", walletType: "1,x" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", minAmountUsd: "-5" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", minAmountUsd: "abc" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", token: "bad\naddr" }).ok).toBe(false); // control chars rejected
  });

  test("leaderboard requires timeFrame and sortBy in range", () => {
    const ep = endpointFor("/onchain/leaderboard")!;
    expect(ep.validate({ chainIndex: "501", timeFrame: "1", sortBy: "1" }).ok).toBe(true);
    expect(ep.validate({ chainIndex: "501", timeFrame: "6", sortBy: "1" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", timeFrame: "1" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", timeFrame: "1", sortBy: "1", walletType: "11" }).ok).toBe(false);
    const v = ep.validate({ chainIndex: "501", timeFrame: "1", sortBy: "1" });
    if (v.ok) expect(v.ttlMs).toBe(1_800_000);
  });

  test.each(["/onchain/holders", "/onchain/top-traders"])("%s validates tagFilter and limit", (route) => {
    const ep = endpointFor(route)!;
    expect(ep.validate({ chainIndex: "501", token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }).ok).toBe(true);
    expect(ep.validate({ chainIndex: "501", token: "EPjF", tagFilter: "10" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", token: "EPjF", limit: "101" }).ok).toBe(false);
    const v = ep.validate({ chainIndex: "501", token: "EPjF" });
    if (v.ok) expect(v.ttlMs).toBe(900_000);
  });
});

describe("normalizers on official-shaped fixtures", () => {
  test("chains rows keep index, name, symbol and drop logos", () => {
    const n = endpointFor("/onchain/chains")!.normalize(fixture("chains").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: unknown[] }).data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual({ chainIndex: "1", name: "Ethereum", symbol: "ETH" });
    expect(JSON.stringify(data)).not.toContain("Logo");
    expect(JSON.stringify(data)).not.toContain("example.invalid");
  });

  test("hot-tokens converts numbers, maps fields and drops the non-converting row", () => {
    const n = endpointFor("/onchain/hot-tokens")!.normalize(fixture("hot-tokens").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(2); // the row with change:"not-a-number" is discarded, never zeroed
    const first = data[0]!;
    expect(first.symbol).toBe("CAPTCHA");
    expect(first.price).toBeCloseTo(0.00712, 5);
    expect(first.holders).toBe(3518);
    expect(first.devHoldPct).toBeNull(); // legitimately empty at the provider
    expect(first.riskLevel).toBe(1);
    expect(first.cursor).toBe(21);
    expect(JSON.stringify(data)).not.toContain("tokenLogoUrl");
    expect(JSON.stringify(data)).not.toContain("example.invalid");
  });

  test("search maps names and keeps communityRecognized", () => {
    const n = endpointFor("/onchain/search")!.normalize(fixture("search").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data[0]).toMatchObject({ chainIndex: "501", name: "Tesla xStock", symbol: "TSLAx", decimals: 8, communityRecognized: true });
    expect(data[1]!.liquidityUsd).toBeNull();
    expect(JSON.stringify(data)).not.toContain("explorerUrl");
    expect(JSON.stringify(data)).not.toContain("LogoUrl");
  });

  test("candles sort oldest first and convert to objects", () => {
    const n = endpointFor("/onchain/candles")!.normalize(fixture("candles").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data[0]!.ts).toBeLessThan(data[1]!.ts as number);
    expect(data[0]).toMatchObject({ ts: 1597026383085, open: 3.721, confirmed: false });
    expect(data[1]).toMatchObject({ ts: 1597026500000, confirmed: true });
  });

  test("candles reject an impossible bar with schema", () => {
    const n = endpointFor("/onchain/candles")!.normalize([["1", "10", "5", "7", "8", "1", "1", "1"]]);
    expect(n.ok).toBe(false);
    expect(endpointFor("/onchain/candles")!.normalize([["1", "10", "11", "9", "15", "1", "1", "1"]]).ok).toBe(false);
    expect(endpointFor("/onchain/candles")!.normalize([["1", "10", "11", "9", "10.5", "1", "1", "1"]]).ok).toBe(true);
    expect(endpointFor("/onchain/candles")!.normalize([["1", "12", "11", "9", "10.5", "1", "1", "1"]]).ok).toBe(false);
    expect(endpointFor("/onchain/candles")!.normalize([["1", "10", "11", "10.8", "10.5", "1", "1", "1"]]).ok).toBe(false);
  });

  test("price converts time to tsMs", () => {
    const n = endpointFor("/onchain/price")!.normalize(fixture("price").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data[0]).toEqual({ chainIndex: "66", address: "0x382bb369d343125bfb2117af9c149795c6c65c50", tsMs: 1716892020000, price: 26.458143090226812 });
  });

  test("signals map wallet types and never forward trigger addresses", () => {
    const n = endpointFor("/onchain/signals")!.normalize(fixture("signals").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ tsMs: 1774364940575, chainIndex: "501", walletType: "smart_money", walletCount: 3, soldRatioPct: 64.29, cursor: "1774364940575!@#123" });
    expect(data[1]!.walletType).toBe("kol");
    const token = (data[0]!.token as Record<string, unknown>);
    expect(token.address).toBe("FN9ZSeNDdPV6bBF9DeDYxvqYK4JvFKeF7DBrhGGXJZ3Q");
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("triggerWalletAddress");
    expect(serialized).not.toContain("5jds1qi6nYu2JTZv5YTczPwyaq1RAkNkjbpsma8xSTem");
    expect(serialized).not.toContain("logo");
  });

  test("leaderboard shortens wallets and maps top tokens", () => {
    const n = endpointFor("/onchain/leaderboard")!.normalize(fixture("leaderboard").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data[0]!.wallet).toBe("7xKX...gAsU");
    expect(data[0]!.realizedPnlUsd).toBeCloseTo(125430.56);
    expect((data[0]!.topTokens as unknown[]).length).toBe(2);
    expect(JSON.stringify(data)).not.toContain("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
  });

  test("leaderboard reads the spelling the provider really sends (tokenPnLUsd), not only the one the page documents (tokenPnlUsd)", () => {
    const n = endpointFor("/onchain/leaderboard")!.normalize(fixtureReal("leaderboard-live").data);
    expect(n.ok).toBe(true);
    const row = (n as { ok: true; data: Array<{ topTokens: Array<{ symbol: string; pnlUsd: number }> }> }).data[0]!;
    expect(row.topTokens).toEqual([
      { symbol: "STONK", pnlUsd: 236137.0653646411 },
      { symbol: "OTC", pnlUsd: 292.9162865682502 },
    ]);
  });

  test("holders shorten wallets, drop fundingSource and keep cursor", () => {
    const n = endpointFor("/onchain/holders")!.normalize(fixture("holders").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(2);
    expect(data[0]!.wallet).toBe("2RH6...FFSK");
    expect(data[0]!.holdPct).toBeCloseTo(76.75, 1);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("fundingSource");
    expect(serialized).not.toContain("9k8jWWqfmTTXrc8gmZqYVxSFJhygURvyVRztivJXFTYP");
    expect(serialized).not.toContain("2RH6rUTPBJ9rUDPpuV9b8z1YL56k1tYU6Uk5ZoaEFFSK");
  });

  test("shortWallet keeps short addresses whole", () => {
    expect(shortWallet("abcd1234")).toBe("abcd1234");
    expect(shortWallet("abcd12345")).toBe("abcd...2345");
  });

  test("empty provider list is a valid empty answer", () => {
    expect(endpointFor("/onchain/hot-tokens")!.normalize([]).ok).toBe(true);
    expect(endpointFor("/onchain/candles")!.normalize([]).ok).toBe(true);
  });
});

describe("cleanText", () => {
  test("strips control and bidi characters, normalizes forbidden punctuation, truncates", () => {
    expect(cleanText("plain text", 48)).toBe("plain text");
    expect(cleanText("a\u0000b\u007fc", 48)).toBe("abc");
    expect(cleanText("x\u2028yz", 48)).toBe("xyz");
    expect(cleanText("x\u2066yz", 48)).toBe("xyz");
    expect(cleanText("a\u2014b\u2013c", 48)).toBe("a-b-c");
    expect(cleanText("a\u00b7b", 48)).toBe("a b");
    expect(cleanText("  too   many \t spaces  ", 48)).toBe("too many spaces");
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText("", 48)).toBeNull();
    expect(cleanText("   ", 48)).toBeNull();
    expect(cleanText(42, 48)).toBeNull();
    expect(cleanText(null, 48)).toBeNull();
  });
});

describe("new routes: validators", () => {
  test("price-info is a POST with a one-object list body", () => {
    const ep = endpointFor("/onchain/price-info")!;
    const v = ep.validate({ chainIndex: "1", token: "0xAb" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.method).toBe("POST");
      expect(v.request.path).toBe("/api/v6/dex/market/price-info");
      expect(JSON.parse(v.request.body!)).toEqual([{ chainIndex: "1", tokenContractAddress: "0xab" }]);
      expect(v.ttlMs).toBe(60_000);
      expect(ep.tier).toBe("premium");
    }
    expect(ep.validate({ chainIndex: "abc", token: "0xab" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1" }).ok).toBe(false);
  });

  test.each([
    ["/onchain/token-risk", "/api/v6/dex/market/token/advanced-info", 900_000],
    ["/onchain/pools", "/api/v6/dex/market/token/top-liquidity", 600_000],
    ["/onchain/clusters", "/api/v6/dex/market/token/cluster/overview", 900_000],
  ])("%s validates chain and token and builds the GET", (route, providerPath, ttl) => {
    const ep = endpointFor(route)!;
    const v = ep.validate({ chainIndex: "501", token: "SoMeCaSe" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.method).toBe("GET");
      expect(v.request.path).toContain(providerPath);
      expect(v.request.path).toContain("tokenContractAddress=SoMeCaSe");
      expect(v.ttlMs).toBe(ttl);
    }
    expect(ep.validate({ chainIndex: "501" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "x", token: "0xab" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "501", token: "bad\naddr" }).ok).toBe(false);
  });

  test("cluster-chains accepts no parameters", () => {
    const ep = endpointFor("/onchain/cluster-chains")!;
    expect(ep.validate({}).ok).toBe(true);
    expect(ep.validate({ chainIndex: "1" }).ok).toBe(false);
    const v = ep.validate({});
    if (v.ok) expect(v.request.path).toBe("/api/v6/dex/market/token/cluster/supported/chain");
  });

  test("trades validates limit bounds", () => {
    const ep = endpointFor("/onchain/trades")!;
    const v = ep.validate({ chainIndex: "1", token: "0xab", limit: "10" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.path).toContain("/api/v6/dex/market/trades");
      expect(v.request.path).toContain("limit=10");
      expect(v.ttlMs).toBe(15_000);
    }
    expect(ep.validate({ chainIndex: "1", token: "0xab", limit: "0" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", token: "0xab", limit: "101" }).ok).toBe(false);
  });

  test("news picks latest or by-symbol and uppercases the symbol", () => {
    const ep = endpointFor("/onchain/news")!;
    const latest = ep.validate({ limit: "5" });
    expect(latest.ok).toBe(true);
    if (latest.ok) {
      expect(latest.request.path).toBe("/api/v6/dex/market/social/news/latest?limit=5&detailLevel=1");
    }
    const bySymbol = ep.validate({ symbol: "btc", limit: "5" });
    if (bySymbol.ok) expect(bySymbol.request.path).toBe("/api/v6/dex/market/social/news/by-symbol?tokenSymbols=BTC&limit=5&detailLevel=1");
    expect(ep.validate({ symbol: "bad symbol!" }).ok).toBe(false);
    expect(ep.validate({ limit: "21" }).ok).toBe(false);
    expect(ep.validate({ symbol: "BTC", extra: "1" }).ok).toBe(false);
  });

  test("sentiment requires a clean symbol", () => {
    const ep = endpointFor("/onchain/sentiment")!;
    const v = ep.validate({ symbol: "eth" });
    if (v.ok) expect(v.request.path).toBe("/api/v6/dex/market/social/sentiment/symbol?tokenSymbols=ETH");
    expect(ep.validate({}).ok).toBe(false);
    expect(ep.validate({ symbol: "E.T.H" }).ok).toBe(false);
  });

  test("sentiment-ranking accepts only limit", () => {
    const ep = endpointFor("/onchain/sentiment-ranking")!;
    const v = ep.validate({ limit: "20" });
    if (v.ok) expect(v.request.path).toBe("/api/v6/dex/market/social/sentiment/ranking?limit=20");
    expect(ep.validate({ limit: "0" }).ok).toBe(false);
    expect(ep.validate({ symbol: "BTC" }).ok).toBe(false);
  });

  test.each([
    ["/onchain/vibe", "/api/v6/dex/market/social/vibe/timeline"],
    ["/onchain/kols", "/api/v6/dex/market/social/vibe/top-kols"],
  ])("%s sends tokenAddress not tokenContractAddress", (route, providerPath) => {
    const ep = endpointFor(route)!;
    const v = ep.validate({ chainIndex: "501", token: "SomeCase" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.path).toContain(providerPath);
      expect(v.request.path).toContain("tokenAddress=SomeCase");
      expect(v.ttlMs).toBe(600_000);
    }
    expect(ep.validate({ chainIndex: "501" }).ok).toBe(false);
  });
});

describe("new routes: normalizers on real-shaped fixtures", () => {
  test("price-info maps the windowed fields and keeps the provider scale", () => {
    const n = endpointFor("/onchain/price-info")!.normalize(fixtureReal("price-info").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(1);
    const row = data[0]!;
    expect(row.address).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    expect(row.price).toBeCloseTo(2464.2716, 3);
    expect(row.tsMs).toBe(1791847218547);
    expect(row.high24h).toBeCloseTo(2617.43, 2);
    expect(row.low24h).toBeCloseTo(2423.81, 2);
    expect(row.change).toMatchObject({ m5: 0.18, h1: -0.95, h4: -1.78, h24: -2.7 });
    expect((row.volume as { m5: number }).m5).toBeCloseTo(6336972.8836, 3);
    expect(row.txs).toMatchObject({ h24: 213897 });
    expect(JSON.stringify(data)).not.toContain("http");
  });

  test("price-info drops a row without price instead of zeroing", () => {
    const n = endpointFor("/onchain/price-info")!.normalize([{ price: "", marketCap: "1" }]);
    expect(n.ok).toBe(true);
    expect((n as { ok: true; data: unknown[] }).data).toHaveLength(0);
  });

  test("token-risk is one object: integers 0..5 for riskLevel, tags filtered, percents untouched", () => {
    const n = endpointFor("/onchain/token-risk")!.normalize(fixtureReal("token-risk").data);
    expect(n.ok).toBe(true);
    const d = (n as { ok: true; data: Record<string, unknown> }).data;
    expect(d.riskLevel).toBe(1);
    expect(d.tags).toEqual(["communityRecognized", "ok_tag-2"]);
    expect(d.top10HoldPct).toBeCloseTo(74.0083);
    expect(d.devHoldPct).toBe(0);
    expect(d.bundleHoldPct).toBeNull(); // empty string at the provider
    expect(d.lpBurnedPct).toBeCloseTo(99.5);
    expect(d.createdMs).toBe(1690000000000);
    const s = JSON.stringify(d);
    expect(s).not.toContain("creatorAddress");
    expect(s).not.toContain("AAAAAAAA");
    expect(s).not.toContain("http");
    // an empty payload is a legitimate "nothing for this token" answer, not a violation
    const empty = endpointFor("/onchain/token-risk")!.normalize([]);
    expect(empty).toEqual({ ok: true, data: null });
    expect(endpointFor("/onchain/token-risk")!.normalize("nope").ok).toBe(false); // must be an object
  });

  test("pool percent strings keep percentage points and missing fees remain unknown", () => {
    const result = endpointFor("/onchain/pools")!.normalize([
      { liquidityUsd: "123.45", liquidityProviderFeePercent: "0.7%", poolBasicFeePercent: "0.5%" },
      { liquidityUsd: "42", liquidityProviderFeePercent: "", poolBasicFeePercent: "0.5%" },
      { liquidityUsd: "10", liquidityProviderFeePercent: "--", poolBasicFeePercent: "" },
    ]);
    expect(result).toMatchObject({ ok: true, data: [{ liquidityUsd: 123.45, feePct: 0.7 }, { liquidityUsd: 42, feePct: 0.5 }, { liquidityUsd: 10, feePct: null }] });
  });

  test("pools keep liquidity, shorten addresses and prefer the LP fee", () => {
    const n = endpointFor("/onchain/pools")!.normalize(fixtureReal("pools").data);
    expect(n.ok).toBe(true);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(2); // the non-numeric liquidity row is dropped
    expect(data[0]).toMatchObject({ pool: "WETH/aEthWETH", protocol: "Aave V3", address: "0xAA...EEEE" });
    expect(data[0]!.feePct).toBeNull(); // LP fee "" -> falls back to poolBasicFeePercent, also null
    expect(data[1]!.feePct).toBeCloseTo(0.3);
    const s = JSON.stringify(data);
    expect(s).not.toContain("poolCreator");
    expect(s).not.toContain("http");
  });

  test("cluster-chains reuse the chain list shape", () => {
    const n = endpointFor("/onchain/cluster-chains")!.normalize(fixtureReal("cluster-chains").data);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data[0]).toEqual({ chainIndex: "501", name: "Solana", symbol: null });
  });

  test("clusters map the object; dashes and empties become null", () => {
    const n = endpointFor("/onchain/clusters")!.normalize(fixtureReal("clusters").data);
    const d = (n as { ok: true; data: Record<string, unknown> }).data;
    expect(d).toEqual({ concentration: "Low", top100HoldPct: 0.4432, newAddressPct: null, sameFundSourcePct: null, sameCreationTimePct: 1, rugPullPct: null });
    // empty payload = no cluster data for the token; a wrong-typed payload is still schema
    expect(endpointFor("/onchain/clusters")!.normalize([])).toEqual({ ok: true, data: null });
    expect(endpointFor("/onchain/clusters")!.normalize(null)).toEqual({ ok: true, data: null });
    expect(endpointFor("/onchain/clusters")!.normalize("x").ok).toBe(false);
  });

  test("trades are newest first, required fields drop the row, wallets shorten", () => {
    const n = endpointFor("/onchain/trades")!.normalize(fixtureReal("trades").data);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(2);
    expect(data[0]!.tsMs).toBe(1791847211000);
    expect(data[0]).toMatchObject({ side: "sell", dex: "Uniswap V3", wallet: "0xAA...EEEE", tx: "0xaa...aaaa" });
    const s = JSON.stringify(data);
    expect(s).not.toContain("userAddress");
    expect(s).not.toContain("AAAAAAAABBBBBBBB");
    expect(s).not.toContain("http");
  });

  test("news keep plain text only: no content, no sourceUrl, sentiments filtered", () => {
    const n = endpointFor("/onchain/news")!.normalize(fixtureReal("news").data);
    expect(n.ok).toBe(true);
    const d = (n as { ok: true; data: { articles: Array<Record<string, unknown>>; cursor?: unknown } }).data;
    expect(d.articles).toHaveLength(2); // the unusable-timestamp row drops
    expect(d.articles[1]).toMatchObject({ id: "89879967858976", tsMs: 1791840324000, source: "jinse.com.cn" });
    expect(d.articles[1]!.sentiments).toEqual([{ symbol: "BLUR", label: "bullish" }]);
    expect(d.cursor).toBe("MTc5MTgzMjAzMTAwMDo4OTg3MTM2NDc4NzQ4OA==");
    const s = JSON.stringify(d);
    expect(s).not.toContain("content");
    expect(s).not.toContain("sourceUrl");
    expect(s).not.toContain("http");
  });

  test("sentiment is one object from details[0]; empty details is empty data, not schema", () => {
    const n = endpointFor("/onchain/sentiment")!.normalize(fixtureReal("sentiment").data);
    const d = (n as { ok: true; data: Record<string, unknown> }).data;
    expect(d).toMatchObject({ symbol: "BTC", period: "1h", tsMs: 1791842400000, mentions: 94, newsMentions: 15, xMentions: 79, label: "neutral", bullishRatio: 0.4, bearishCount: 20, neutralCount: 36 });
    // verified live: a symbol without coverage answers details: [] inside a valid envelope
    expect(endpointFor("/onchain/sentiment")!.normalize({ details: [], period: "1h", ts: "1" })).toEqual({ ok: true, data: null });
    expect(endpointFor("/onchain/sentiment")!.normalize([])).toEqual({ ok: true, data: null });
    // no details key or a non-array details is still a contract violation
    expect(endpointFor("/onchain/sentiment")!.normalize({ period: "1h", ts: "1" }).ok).toBe(false);
    expect(endpointFor("/onchain/sentiment")!.normalize({ details: "x" }).ok).toBe(false);
    // details with rows but every row broken is a violation, not an empty answer
    expect(endpointFor("/onchain/sentiment")!.normalize({ details: [{ nope: 1 }] }).ok).toBe(false);
    expect(endpointFor("/onchain/sentiment")!.normalize({ details: [{ tokenSymbol: "X", nope: 1 }] }).ok).toBe(false);
  });

  test("sentiment-ranking tolerates an empty payload as an empty list", () => {
    expect(endpointFor("/onchain/sentiment-ranking")!.normalize(null)).toEqual({ ok: true, data: [] });
    expect(endpointFor("/onchain/sentiment-ranking")!.normalize([])).toEqual({ ok: true, data: [] });
  });

  test("news tolerates an empty payload as an empty article list", () => {
    expect(endpointFor("/onchain/news")!.normalize(null)).toEqual({ ok: true, data: { articles: [] } });
    expect(endpointFor("/onchain/news")!.normalize([])).toEqual({ ok: true, data: { articles: [] } });
  });

  test("sentiment-ranking returns a row per detail and drops broken rows", () => {
    const n = endpointFor("/onchain/sentiment-ranking")!.normalize(fixtureReal("sentiment-ranking").data);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(2); // the row without tokenSymbol drops
    expect(data[0]!.symbol).toBe("BTC");
    expect(data[1]!.bearishRatio).toBeCloseTo(0.06);
  });

  test("vibe keeps summary numbers and points, drops kols", () => {
    const n = endpointFor("/onchain/vibe")!.normalize(fixtureReal("vibe").data);
    const d = (n as { ok: true; data: Record<string, unknown> }).data;
    expect(d).toMatchObject({ score: 57.57757814783334, mentions: 14, impressions: 330991, engagement: 5384 });
    const points = d.points as Array<{ tsMs: number; score: number }>;
    expect(points).toHaveLength(2); // the bad-score point drops
    expect(points[1]!.score).toBeCloseTo(56.225);
    expect(JSON.stringify(d)).not.toContain("kols");
    expect(JSON.stringify(d)).not.toContain("handle");
    // a token without social coverage answers with summary missing or null: empty data
    expect(endpointFor("/onchain/vibe")!.normalize({})).toEqual({ ok: true, data: null });
    expect(endpointFor("/onchain/vibe")!.normalize({ summary: null })).toEqual({ ok: true, data: null });
    expect(endpointFor("/onchain/vibe")!.normalize({ timeline: [] })).toEqual({ ok: true, data: null });
    expect(endpointFor("/onchain/vibe")!.normalize([])).toEqual({ ok: true, data: null });
    // a wrong-typed summary is still a contract violation
    expect(endpointFor("/onchain/vibe")!.normalize({ summary: "x" }).ok).toBe(false);
    expect(endpointFor("/onchain/vibe")!.normalize("x").ok).toBe(false);
  });

  test("kols keep clean handles only, never avatar or tweet URL", () => {
    const n = endpointFor("/onchain/kols")!.normalize(fixtureReal("kols").data);
    const data = (n as { ok: true; data: Array<Record<string, unknown>> }).data;
    expect(data).toHaveLength(2); // the "not a handle!" row drops
    expect(data[0]).toMatchObject({ handle: "jackduval", nickname: "Jack Duval", followers: 58389, firstMentionMs: 1791760874000 });
    const s = JSON.stringify(data);
    expect(s).not.toContain("avatar");
    expect(s).not.toContain("tweetUrl");
    expect(s).not.toContain("x.com");
    expect(s).not.toContain("http");
    // a token without KOLs answers an empty payload: an empty list, not an error
    expect(endpointFor("/onchain/kols")!.normalize(null)).toEqual({ ok: true, data: [] });
    expect(endpointFor("/onchain/kols")!.normalize([])).toEqual({ ok: true, data: [] });
    expect(endpointFor("/onchain/kols")!.normalize({ kols: [] })).toEqual({ ok: true, data: [] });
  });
});
