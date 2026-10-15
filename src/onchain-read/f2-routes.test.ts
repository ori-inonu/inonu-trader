/**
 * Fase 2 routes and the internal (server only) path of the gateway: docs/sdd/config-onchain-smartmoney/fase-2/SPEC.md
 * (F2-OCX-6, F2-OCX-5, F2-OCX-9, F2-OCX-13, F2-OCX-14). Fixtures with origin real_probe_2026-10-12 were trimmed from the
 * answers of the real provider (wallets and token addresses replaced by placeholders, one bad row injected where noted).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBudget } from "./budget";
import { createOnchainCache } from "./cache";
import { endpointFor } from "./catalog";
import type { ClientResult, OnchainClient } from "./client";
import { createOnchainGateway } from "./gateway";

function real(name: string): { code: string; data: unknown; msg: string } {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"));
  expect(raw.origin).toBe("real_probe_2026-10-12");
  return raw;
}

const WALLET_1 = "WalletPlaceholder1111111111111111111111111111";
const WALLET_2 = "WalletPlaceholder2222222222222222222222222222";
type Row = Record<string, unknown>;
const data = (n: { ok: boolean } & Record<string, unknown>) => (n as unknown as { ok: true; data: unknown }).data;

describe("trades accepts tagFilter (F2-OCX-13)", () => {
  const ep = endpointFor("/onchain/trades")!;
  test("a wallet type from 1 to 9 reaches the provider path", () => {
    const v = ep.validate({ chainIndex: "1", token: "0xab", tagFilter: "3", limit: "20" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.path).toContain("tagFilter=3");
      expect(v.request.path).toContain("limit=20");
    }
  });
  test("without tagFilter the request is unchanged", () => {
    const v = ep.validate({ chainIndex: "1", token: "0xab" });
    expect(v.ok && v.request.path.includes("tagFilter")).toBe(false);
  });
  test("outside 1 to 9 or not a number is refused", () => {
    for (const bad of ["0", "10", "x", "3.5", ""]) expect(ep.validate({ chainIndex: "1", token: "0xab", tagFilter: bad }).ok).toBe(false);
  });
});

describe("internal normalizers keep what the browser never gets (F2-OCX-14)", () => {
  test("signals: the full trigger wallets, split and validated; the HTTP shape still has none", () => {
    const ep = endpointFor("/onchain/signals")!;
    const http = JSON.stringify(data(ep.normalize(real("signals-live").data) as never));
    expect(http).not.toContain("WalletPlaceholder");
    const internal = ep.normalizeInternal!(real("signals-live").data);
    const rows = data(internal as never) as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.wallets).toEqual([WALLET_1, WALLET_2]);
    expect(rows[0]).toMatchObject({ walletCount: 6, soldRatioPct: 52.37, walletType: "kol" });
  });

  test("signals: a malformed wallet string is dropped, never forwarded", () => {
    const raw = [{ ...(real("signals-live").data as Row[])[0]!, triggerWalletAddress: `${WALLET_1}, bad wallet!,,x` }];
    const rows = data(endpointFor("/onchain/signals")!.normalizeInternal!(raw) as never) as Row[];
    expect(rows[0]!.wallets).toEqual([WALLET_1]);
  });

  test("leaderboard: the full wallet; the HTTP shape shortens it", () => {
    const ep = endpointFor("/onchain/leaderboard")!;
    const http = data(ep.normalize(real("leaderboard-live").data) as never) as Row[];
    expect(http[0]!.wallet).toBe("Wall...1111");
    const internal = data(ep.normalizeInternal!(real("leaderboard-live").data) as never) as Row[];
    expect(internal[0]!.wallet).toBe("WalletPlaceholder1111111111111111111111111111");
    expect(internal[0]!.winRatePct).toBe(37.5);
  });

  test("top traders: full wallet and soldAmount, which the HTTP shape drops", () => {
    const ep = endpointFor("/onchain/top-traders")!;
    expect(JSON.stringify(data(ep.normalize(real("top-traders-live").data) as never))).not.toContain("soldAmount");
    const rows = data(ep.normalizeInternal!(real("top-traders-live").data) as never) as Row[];
    expect(rows[0]).toMatchObject({ wallet: WALLET_1, soldAmount: 246238270948.60056, avgSellPrice: 0.000020723540916143 });
    expect(rows[0]!.boughtAmount).toBeCloseTo(296753712073.60547, 0);
  });

  test("holders: the provider spells the sold quantity totalSellAmount here", () => {
    const rows = data(endpointFor("/onchain/holders")!.normalizeInternal!(real("holders-live").data) as never) as Row[];
    expect(rows[0]).toMatchObject({ wallet: WALLET_2, soldAmount: 0, holdPct: 8.8306967765879507 });
  });

  test("an empty answer is an empty list, a wrong type is a contract violation", () => {
    for (const route of ["/onchain/signals", "/onchain/leaderboard", "/onchain/holders", "/onchain/top-traders"]) {
      const ep = endpointFor(route)!;
      expect(ep.normalizeInternal!([])).toEqual({ ok: true, data: [] });
    }
  });

  test("routes with nothing extra to keep have no internal normalizer", () => {
    expect(endpointFor("/onchain/chains")!.normalizeInternal).toBeUndefined();
    expect(endpointFor("/onchain/token-risk")!.normalizeInternal).toBeUndefined();
  });
});

describe("token risk keeps every documented tag", () => {
  test("including dexScreenerTokenCommunityTakeOver, which is 33 characters long", () => {
    const raw = { ...(real("token-risk").data as Row), tokenTags: ["dexScreenerTokenCommunityTakeOver", "volumeChangeRateHoldersPlunge", "communityRecognized"] };
    const out = data(endpointFor("/onchain/token-risk")!.normalize(raw) as never) as { tags: string[] };
    expect(out.tags).toEqual(["dexScreenerTokenCommunityTakeOver", "volumeChangeRateHoldersPlunge", "communityRecognized"]);
  });
  test("a tag that is not a word of 40 characters or fewer is still dropped", () => {
    const raw = { ...(real("token-risk").data as Row), tokenTags: ["x".repeat(41), "bad tag!"] };
    expect((data(endpointFor("/onchain/token-risk")!.normalize(raw) as never) as { tags: string[] }).tags).toEqual([]);
  });
});

describe("cluster top holders (F2-OCX-5)", () => {
  const ep = endpointFor("/onchain/cluster-top-holders")!;
  test("is a premium GET with chain, token and a rangeFilter from 1 to 3", () => {
    expect(ep.tier).toBe("premium");
    const v = ep.validate({ chainIndex: "1", token: "0xAb", rangeFilter: "2" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.method).toBe("GET");
      expect(v.request.path).toContain("/api/v6/dex/market/token/cluster/top-holders");
      expect(v.request.path).toContain("tokenContractAddress=0xab");
      expect(v.request.path).toContain("rangeFilter=2");
      expect(v.ttlMs).toBe(900_000);
    }
    const refused: Array<Record<string, string>> = [
      { chainIndex: "1", token: "0xab" },
      { chainIndex: "1", token: "0xab", rangeFilter: "4" },
      { chainIndex: "x", token: "0xab", rangeFilter: "1" },
      { chainIndex: "1", token: "0xab", rangeFilter: "1", extra: "1" },
    ];
    for (const bad of refused) expect(ep.validate(bad).ok).toBe(false);
  });
  test("the object keeps the provider scale, the literal word null becomes null and bad trends drop", () => {
    const d = data(ep.normalize(real("cluster-top-holders").data) as never) as Row;
    expect(d).toMatchObject({ holdingAmount: 10974869038.4, holdingPct: 0.22701, avgHoldingPeriodS: 1744243118, avgBuyPriceUsd: null, avgSellPriceUsd: null, avgPnlUsd: null });
    expect(d.trend).toEqual(["buy", "transferIn"]);
  });
  test("an empty answer is data null, a wrong type is schema", () => {
    expect(ep.normalize(null)).toEqual({ ok: true, data: null });
    expect(ep.normalize([])).toEqual({ ok: true, data: null });
    expect(ep.normalize("x").ok).toBe(false);
  });
});

describe("quote, read only (F2-OCX-9)", () => {
  const ep = endpointFor("/onchain/quote")!;
  const base = { chainIndex: "1", amount: "1000000", fromToken: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", toToken: "0xC02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" };
  test("builds only the documented read request: no dexIds, no fee, no swap fields", () => {
    const v = ep.validate(base);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.method).toBe("GET");
      expect(v.request.path).toContain("/api/v6/dex/aggregator/quote");
      expect(v.request.path).toContain("fromTokenAddress=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
      expect(v.request.path).toContain("toTokenAddress=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
      expect(v.request.path).toContain("amount=1000000");
      expect(v.ttlMs).toBe(15_000);
    }
    expect(ep.validate({ ...base, dexIds: "1" }).ok).toBe(false);
    expect(ep.validate({ ...base, feePercent: "1" }).ok).toBe(false);
    expect(ep.validate({ ...base, userWalletAddress: "0xab" }).ok).toBe(false);
  });
  test("the amount is a positive whole number in the smallest unit, not a decimal and not huge", () => {
    for (const bad of ["0", "-1", "1.5", "1e6", "", "x", "1".repeat(41)]) expect(ep.validate({ ...base, amount: bad }).ok).toBe(false);
    expect(ep.validate({ ...base, amount: "1".repeat(40) }).ok).toBe(true);
  });
  test("both tokens are required and must be valid for the chain", () => {
    expect(ep.validate({ chainIndex: "1", amount: "1", fromToken: base.fromToken }).ok).toBe(false);
    expect(ep.validate({ ...base, fromToken: "bad\naddr" }).ok).toBe(false);
  });
  test("the answer keeps honeypot, tax, impact and fees; an unknown honeypot flag stays null", () => {
    const d = data(ep.normalize(real("quote").data) as never) as Row;
    expect(d).toMatchObject({ chainIndex: "1", fromAmount: 1000000, toAmount: 405887539576246, priceImpactPct: -0.01, estimateGasFee: 162000, tradeFee: 0.1122036367559022 });
    expect(d.fromToken).toMatchObject({ symbol: "USDC", decimals: 6, isHoneyPot: false, taxRate: 0, unitPriceUsd: 1 });
    expect(d.toToken).toMatchObject({ symbol: "WETH", decimals: 18, isHoneyPot: false, taxRate: 0, unitPriceUsd: 2463.57 });
    const raw = (real("quote").data as Row[])[0]!;
    const unknown = data(ep.normalize([{ ...raw, toToken: { ...(raw.toToken as Row), isHoneyPot: undefined } }]) as never) as Row;
    expect((unknown.toToken as Row).isHoneyPot).toBeNull();
  });
  test("nothing to sign or send leaves the gateway: no quoteId, router, signData or route lists", () => {
    const s = JSON.stringify(data(ep.normalize(real("quote").data) as never));
    for (const word of ["quoteId", "router", "signData", "dexRouterList", "contextSlot"]) expect(s).not.toContain(word);
  });
  test("a quote without amounts is a contract violation, an empty list is data null", () => {
    expect(ep.normalize([{ chainIndex: "1" }]).ok).toBe(false);
    expect(ep.normalize([])).toEqual({ ok: true, data: null });
    expect(ep.normalize("x").ok).toBe(false);
  });
});

describe("token info, batch POST (F2-OCX-6)", () => {
  const ep = endpointFor("/onchain/token-info")!;
  test("one token or a comma list of up to 100 becomes a POST list body", () => {
    const one = ep.validate({ chainIndex: "1", token: "0xAb" });
    expect(one.ok).toBe(true);
    if (one.ok) {
      expect(one.request.method).toBe("POST");
      expect(one.request.path).toBe("/api/v6/dex/market/token/basic-info");
      expect(JSON.parse(one.request.body!)).toEqual([{ chainIndex: "1", tokenContractAddress: "0xab" }]);
      expect(one.ttlMs).toBe(86_400_000);
    }
    const many = ep.validate({ chainIndex: "1", tokens: "0xaa,0xbb,0xcc" });
    expect(many.ok && JSON.parse(many.request.body!)).toHaveLength(3);
    const hundred = Array.from({ length: 100 }, (_, i) => `0x${i.toString(16).padStart(2, "0")}`).join(",");
    expect(ep.validate({ chainIndex: "1", tokens: hundred }).ok).toBe(true);
    expect(ep.validate({ chainIndex: "1", tokens: `${hundred},0xff` }).ok).toBe(false);
  });
  test("token and tokens are exclusive and one of them is required", () => {
    expect(ep.validate({ chainIndex: "1" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", token: "0xaa", tokens: "0xbb" }).ok).toBe(false);
    expect(ep.validate({ chainIndex: "1", tokens: "0xaa,,0xbb" }).ok).toBe(false);
  });
  test("rows keep name, symbol, decimals and the community mark; no logo URL; a row without address drops", () => {
    const rows = data(ep.normalize(real("basic-info").data) as never) as Row[];
    expect(rows).toEqual([{ chainIndex: "1", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18, communityRecognized: true }]);
    expect(JSON.stringify(rows)).not.toContain("http");
  });
  test("an empty answer is an empty list", () => {
    expect(ep.normalize([])).toEqual({ ok: true, data: [] });
    expect(ep.normalize(null)).toEqual({ ok: true, data: [] });
  });
});

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function gatewayWith(raw: unknown) {
  let t = 1_000_000;
  const dir = mkdtempSync(join(tmpdir(), "jev-onchain-f2-"));
  dirs.push(dir);
  const calls: string[] = [];
  const client: OnchainClient = {
    call: async (req): Promise<ClientResult> => {
      calls.push(req.path);
      return { ok: true, data: raw, sent: true };
    },
    status: () => ({ lastCallMs: t, lastCode: 0, cooldownUntilMs: null, clockOffsetMs: null }),
  };
  const gateway = createOnchainGateway({
    client,
    cache: createOnchainCache(() => t),
    budget: createBudget({ dir, now: () => t, caps: () => ({ basic: 50, premium: 50 }) }),
    credentialsState: () => "complete",
    now: () => t,
  });
  return { gateway, calls, tick: (ms: number) => (t += ms) };
}

describe("gateway.callInternal (F2-OCX-14)", () => {
  const params = { chainIndex: "501", token: "TokenPlaceholderAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };

  test("returns the internal shape with full wallets while call keeps shortening", async () => {
    const { gateway } = gatewayWith(real("top-traders-live").data);
    const inner = await gateway.callInternal("/onchain/top-traders", params, "user");
    expect(inner.ok && (inner.data as Row[])[0]!.wallet).toBe(WALLET_1);
    const outer = await gateway.call("/onchain/top-traders", params, "user");
    expect(outer.ok && (outer.data as Row[])[0]!.wallet).toBe("Wall...1111");
  });

  test("the two shapes never share a cache entry: each is one provider call, then a hit", async () => {
    const { gateway, calls } = gatewayWith(real("top-traders-live").data);
    await gateway.callInternal("/onchain/top-traders", params, "user");
    await gateway.callInternal("/onchain/top-traders", params, "user");
    expect(calls).toHaveLength(1);
    await gateway.call("/onchain/top-traders", params, "user");
    await gateway.call("/onchain/top-traders", params, "user");
    expect(calls).toHaveLength(2);
    expect(gateway.budget().tiers.premium.used).toBe(2);
  });

  test("says whether THIS call went to the provider: the leader yes, a cache hit no, never in the HTTP shape", async () => {
    const { gateway } = gatewayWith(real("top-traders-live").data);
    const first = await gateway.callInternal("/onchain/top-traders", params, "user");
    const second = await gateway.callInternal("/onchain/top-traders", params, "user");
    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    const http = await gateway.call("/onchain/top-traders", params, "user");
    expect("sent" in http).toBe(false);
  });

  test("two identical concurrent internal calls share one provider call and only one of them says sent", async () => {
    const { gateway, calls } = gatewayWith(real("top-traders-live").data);
    const [a, b] = await Promise.all([gateway.callInternal("/onchain/top-traders", params, "user"), gateway.callInternal("/onchain/top-traders", params, "user")]);
    expect(calls).toHaveLength(1);
    expect([a.sent, b.sent].filter(Boolean)).toHaveLength(1);
  });

  test("a refusal before any call is sent false", async () => {
    const { gateway } = gatewayWith([]);
    const r = await gateway.callInternal("/onchain/nope", {}, "user");
    expect(r).toEqual({ ok: false, error: "bad_request", sent: false });
  });

  test("a route without an internal normalizer answers like call", async () => {
    const { gateway } = gatewayWith(real("token-risk").data);
    const a = await gateway.callInternal("/onchain/token-risk", params, "user");
    expect(a.ok).toBe(true);
  });

  test("unknown route and bad params are refused before any call", async () => {
    const { gateway, calls } = gatewayWith([]);
    expect(await gateway.callInternal("/onchain/nope", {}, "user")).toMatchObject({ ok: false, error: "bad_request" });
    expect(await gateway.callInternal("/onchain/top-traders", { chainIndex: "x" }, "user")).toMatchObject({ ok: false, error: "bad_request" });
    expect(calls).toHaveLength(0);
  });
});
