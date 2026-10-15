import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { InternalGatewayResult } from "../onchain-read/gateway";
import { endpointFor } from "../onchain-read/catalog";
import type { Params } from "../onchain-read/catalog";
import { SourceError, type AskRequest } from "./ask";
import { createOnchainSource, routeByMode, type OnchainSourceDeps } from "./source-onchain";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const REQUEST: AskRequest = { modo: "token", alvo: { chainIndex: "1", address: WETH } };
const CONTEXT = (maxOnchainosCalls = 15, signal = new AbortController().signal) => ({ signal, maxOnchainosCalls });

const FIXTURE_OF: Record<string, string> = {
  "/onchain/search": "search",
  "/onchain/price-info": "price-info",
  "/onchain/candles": "candles",
  "/onchain/trades": "trades",
  "/onchain/signals": "signals-live",
  "/onchain/top-traders": "top-traders-live",
  "/onchain/token-risk": "token-risk",
  "/onchain/pools": "pools",
  "/onchain/clusters": "clusters",
  "/onchain/cluster-top-holders": "cluster-top-holders",
  "/onchain/sentiment": "sentiment",
  "/onchain/quote": "quote",
};

function fixtureData(route: string): unknown {
  const name = FIXTURE_OF[route];
  if (name === undefined) return null;
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL(`../onchain-read/fixtures/${name}.json`, import.meta.url)), "utf8"));
  const ep = endpointFor(route)!;
  const n = (ep.normalizeInternal ?? ep.normalize)(raw.data);
  if (!n.ok) throw new Error(`${name} does not normalize`);
  return n.data;
}

interface Fake {
  readonly calls: Array<{ route: string; params: Params }>;
  readonly gateway: OnchainSourceDeps["gateway"];
}

/** A gateway that answers each route with its real-shaped fixture; `override` replaces the answer of a route. */
function fakeGateway(override: Record<string, InternalGatewayResult> = {}, sent = true): Fake {
  const calls: Fake["calls"] = [];
  return {
    calls,
    gateway: {
      callInternal: async (route, params) => {
        calls.push({ route, params });
        const forced = override[route];
        if (forced !== undefined) return forced;
        return { ok: true, data: fixtureData(route), meta: { tier: "basic", cachedAtMs: 0, ageMs: 5_000, stale: false, budget: { tier: "basic", used: 1, cap: 50 } }, sent };
      },
    },
  };
}

const deps = (gateway: OnchainSourceDeps["gateway"], extra: Partial<OnchainSourceDeps> = {}): OnchainSourceDeps => ({
  gateway,
  now: () => 1_791_850_000_000,
  sets: () => ({ netUnsoldUsd: [100, 400, 900, 1500, 2600, 4100, 6200, 9100, 15000, 22000], liquidityUsd: [1e5, 5e5, 1e6, 5e6, 2e7, 1e8] }),
  quotePair: () => ({ fromToken: USDC, amount: "1000000" }),
  identity: () => ({ symbol: "WETH", kind: { origin: "okx_instrument" } }),
  ...extra,
});

describe("createOnchainSource, token mode (F2-DIG-4, F2-DIG-5)", () => {
  test("one click asks the 12 callable calls of the plan, in order, and builds a Brief of the token", async () => {
    const fake = fakeGateway();
    const built = await createOnchainSource(deps(fake.gateway)).build(REQUEST, CONTEXT());
    expect(fake.calls.map((c) => c.route)).toEqual([
      "/onchain/price-info", "/onchain/candles", "/onchain/trades", "/onchain/trades", "/onchain/signals", "/onchain/top-traders",
      "/onchain/token-risk", "/onchain/pools", "/onchain/clusters", "/onchain/cluster-top-holders", "/onchain/sentiment", "/onchain/quote",
    ]);
    expect(built.brief.alvo).toEqual({ chainIndex: "1", address: WETH });
    expect(built.candidates.map((c) => c.id)).toEqual([`token:1:${WETH}`, "manter"]);
    expect(JSON.stringify(built.brief).length).toBeLessThan(2048);
    expect(built.brief.trilha!.nota).not.toBeNull();
  });

  test("onchainosCalls counts only the calls that went to the provider, not the cache hits", async () => {
    const cached = fakeGateway({}, false);
    expect((await createOnchainSource(deps(cached.gateway)).build(REQUEST, CONTEXT())).onchainosCalls).toBe(0);
    const sent = fakeGateway({}, true);
    expect((await createOnchainSource(deps(sent.gateway)).build(REQUEST, CONTEXT())).onchainosCalls).toBe(12);
  });

  test("the cap of the request cuts the plan before any call", async () => {
    const fake = fakeGateway();
    const built = await createOnchainSource(deps(fake.gateway)).build(REQUEST, CONTEXT(5));
    expect(fake.calls).toHaveLength(5);
    // the calls that were cut are told apart from the ones that failed
    expect(built.brief.nulos["token-risk"]).toBe("nao_consultado:nao_pedido");
    expect(built.onchainosCalls).toBe(5);
  });

  test("each call is an interactive one: a click, never a background read", async () => {
    const intents: string[] = [];
    const gateway: OnchainSourceDeps["gateway"] = { callInternal: async (route, _p, intent) => (intents.push(intent), { ok: false, error: "provider_error", sent: false }) };
    await createOnchainSource(deps(gateway)).build(REQUEST, CONTEXT());
    expect(new Set(intents)).toEqual(new Set(["user"]));
  });

  test("a call that fails becomes a note in the Brief, the others still count", async () => {
    const fake = fakeGateway({ "/onchain/signals": { ok: false, error: "budget_exhausted", sent: false } });
    const built = await createOnchainSource(deps(fake.gateway)).build(REQUEST, CONTEXT());
    expect(built.brief.nulos["trilha.compra"]).toBe("nao_consultado:orcamento");
    expect(built.brief.trilha!.componentesAusentes).toContain("compra");
    expect(built.brief.risco).not.toBeNull();
  });

  test("with no OnchainOS credential at all the click says so instead of sending an empty Brief", async () => {
    const gateway: OnchainSourceDeps["gateway"] = { callInternal: async () => ({ ok: false, error: "no_credentials", sent: false }) };
    await expect(createOnchainSource(deps(gateway)).build(REQUEST, CONTEXT())).rejects.toMatchObject({ code: "sem_credencial_onchainos" });
  });

  test("an address the gateway refuses is an invalid target", async () => {
    const gateway: OnchainSourceDeps["gateway"] = { callInternal: async () => ({ ok: false, error: "bad_request", sent: false }) };
    await expect(createOnchainSource(deps(gateway)).build(REQUEST, CONTEXT())).rejects.toMatchObject({ code: "alvo_invalido" });
  });

  test("a click already cancelled calls nothing", async () => {
    const fake = fakeGateway();
    const controller = new AbortController();
    controller.abort();
    await expect(createOnchainSource(deps(fake.gateway)).build(REQUEST, CONTEXT(15, controller.signal))).rejects.toMatchObject({ code: "cancelado" });
    expect(fake.calls).toHaveLength(0);
  });

  test("a cancel in the middle stops the next calls", async () => {
    const controller = new AbortController();
    let n = 0;
    const gateway: OnchainSourceDeps["gateway"] = {
      callInternal: async (route) => {
        n += 1;
        if (n === 3) controller.abort();
        return { ok: true, data: fixtureData(route), meta: { tier: "basic", cachedAtMs: 0, ageMs: 0, stale: false, budget: { tier: "basic", used: 1, cap: 50 } }, sent: true };
      },
    };
    await expect(createOnchainSource(deps(gateway)).build(REQUEST, CONTEXT(15, controller.signal))).rejects.toMatchObject({ code: "cancelado" });
    expect(n).toBe(3);
  });

  test("only the token mode and a token target are served", async () => {
    const source = createOnchainSource(deps(fakeGateway().gateway));
    await expect(source.build({ modo: "ativo", alvo: { instId: "BTC-USDT" } }, CONTEXT())).rejects.toMatchObject({ code: "modo_nao_disponivel" });
    await expect(source.build({ modo: "token", alvo: { instId: "BTC-USDT" } }, CONTEXT())).rejects.toMatchObject({ code: "alvo_invalido" });
    await expect(source.build({ modo: "token" }, CONTEXT())).rejects.toMatchObject({ code: "alvo_invalido" });
    await expect(source.build({ modo: "token", alvo: { chainIndex: "abc", address: WETH } }, CONTEXT())).rejects.toMatchObject({ code: "alvo_invalido" });
  });

  test("a wallet of the signals never reaches the Brief, and the quality is joined on the server when the leaderboard is known", async () => {
    const fake = fakeGateway();
    const withBoard = deps(fake.gateway, { leaderboard: () => [{ wallet: "WalletPlaceholder1111111111111111111111111111", winRatePct: 40 }, { wallet: "WalletPlaceholder2222222222222222222222222222", winRatePct: 60 }] });
    const built = await createOnchainSource(withBoard).build(REQUEST, CONTEXT());
    expect(built.brief.trilha!.componentes!.qualidade).toBeCloseTo(0.5, 3);
    expect(JSON.stringify(built.brief)).not.toContain("WalletPlaceholder");
    const without = await createOnchainSource(deps(fakeGateway().gateway)).build(REQUEST, CONTEXT());
    expect(without.brief.nulos["trilha.qualidade"]).toBe("sem_enderecos");
  });

  test("an unknown symbol leaves the sentiment out, with its reason, and spends no call on it", async () => {
    const fake = fakeGateway();
    const built = await createOnchainSource(deps(fake.gateway, { identity: () => ({ kind: { origin: "onchain_token", communityRecognized: null, sameSymbolMatches: 0 } }) })).build(REQUEST, CONTEXT());
    expect(fake.calls.map((c) => c.route)).not.toContain("/onchain/sentiment");
    expect(built.brief.nulos["trilha.sentimento"]).toBe("simbolo_ambiguo");
  });

  test("no quote pair means no quote call and no honeypot answer from it", async () => {
    const fake = fakeGateway();
    const built = await createOnchainSource(deps(fake.gateway, { quotePair: () => undefined })).build(REQUEST, CONTEXT());
    expect(fake.calls.map((c) => c.route)).not.toContain("/onchain/quote");
    expect(built.brief.nulos.quote).toBe("nao_consultado:nao_pedido");
  });
});

describe("routeByMode", () => {
  const stub = (tag: string) => ({ build: async () => ({ brief: { tag } as never, candidates: [], onchainosCalls: 0 }) });
  test("sends each mode to its source and refuses a mode nobody serves", async () => {
    const routed = routeByMode({ ativo: stub("a"), token: stub("t") });
    expect(((await routed.build({ modo: "ativo" }, CONTEXT())).brief as never as { tag: string }).tag).toBe("a");
    expect(((await routed.build({ modo: "token" }, CONTEXT())).brief as never as { tag: string }).tag).toBe("t");
    await expect(routed.build({ modo: "descoberta" }, CONTEXT())).rejects.toBeInstanceOf(SourceError);
    await expect(routed.build({ modo: "descoberta" }, CONTEXT())).rejects.toMatchObject({ code: "modo_nao_disponivel" });
  });
});

describe("SH02: bounded wallet evidence", () => {
  const request: AskRequest = { modo: "carteira", alvo: { chainIndex: "1", address: WETH } };
  const meta = (ageMs: number | null, stale = false) => ({ tier: "basic" as const, cachedAtMs: 0, ageMs, stale, budget: { tier: "basic" as const, used: 1, cap: 50 } });
  const risk = (extra: Record<string, unknown> = {}) => {
    const normalized = endpointFor("/onchain/token-risk")!.normalize({ chainIndex: "1", tokenContractAddress: WETH, riskControlLevel: "0", tokenTags: ["devAddLiquidity"], top10HoldPercent: "25", devHoldingPercent: "0.3", lpBurnedPercent: "90", devCreateTokenCount: "12", devLaunchedTokenCount: "4", devRugPullTokenCount: "0", ...extra });
    if (!normalized.ok) throw new Error("synthetic risk fixture does not normalize");
    return normalized.data;
  };
  function walletGateway(riskData: unknown, riskAge: number | null, riskStale = false, poolData: unknown = [{ liquidityUsd: 20 }, { liquidityUsd: 10 }], poolAge: number | null = 70) {
    const calls: string[] = [];
    const gateway: OnchainSourceDeps["gateway"] = { async callInternal(route) {
      calls.push(route);
      const data = route === "/onchain/price-info" ? [{ chainIndex: "1", address: WETH, price: 1, liquidityUsd: 100 }]
        : route === "/onchain/token-risk" ? riskData : poolData;
      // Deliberately inject malformed null age metadata to prove fail-closed handling.
      return { ok: true, data, meta: meta(route === "/onchain/token-risk" ? riskAge : route === "/onchain/pools" ? poolAge : 50, route === "/onchain/token-risk" && riskStale), sent: true } as unknown as Awaited<ReturnType<OnchainSourceDeps["gateway"]["callInternal"]>>;
    } };
    return { calls, gateway };
  }

  test("normalized risk zero stays unknown, qualified percentages survive and ambiguous holdings never acquire a unit", async () => {
    const fake = walletGateway(risk(), 60);
    const built = await createOnchainSource(deps(fake.gateway)).build(request, CONTEXT(3));
    expect(fake.calls).toEqual(["/onchain/price-info", "/onchain/token-risk", "/onchain/pools"]);
    expect(built.brief.fluxo!.riskDetails).toEqual({ level: null, tags: ["devAddLiquidity"], lpBurnedPct: 90, devCreateCount: 12, devLaunchedCount: 4, devRugCount: 0, origin: "onchainos", ageMs: 60, stale: false });
    expect(built.brief.fluxo!.concentration).toEqual({ top10HoldPct: 25, devHoldPct: null, bundleHoldPct: null, sniperHoldPct: null, suspiciousHoldPct: null, origin: "onchainos", ageMs: 60, stale: false });
    expect(built.brief.fluxo!.poolLiquidity).toMatchObject({ poolCount: 2, topPoolsLiquidityUsd: 30, largestPoolSharePct: 200 / 3, partial: true, ageMs: 70, stale: false });
    expect(built.brief.nulos.concentration).toBe("scale_ambiguous");
    expect(built.brief.nulos.risco).toBe("nivel_indefinido");
    expect(built.onchainosCalls).toBe(3);
  });

  test("stale and unknown-age advanced sources retain history metadata but cannot become current risk", async () => {
    for (const [age, stale] of [[90_000, true], [null, false]] as const) {
      const fake = walletGateway(risk({ riskControlLevel: "3" }), age, stale, [{ liquidityUsd: 20 }], null);
      const built = await createOnchainSource(deps(fake.gateway)).build(request, CONTEXT(3));
      expect(built.brief.risco).toBeNull();
      expect(built.brief.fluxo!.riskDetails).toMatchObject({ level: null, tags: ["devAddLiquidity"], ageMs: age, stale: true });
      expect(built.brief.fluxo!.concentration).toMatchObject({ top10HoldPct: 25, ageMs: age, stale: true });
      expect(built.brief.fluxo!.poolLiquidity).toMatchObject({ ageMs: null, stale: true, partial: true });
      expect(built.brief.nulos["token-risk"]).toBe("stale");
    }
  });

  test("another token's advanced data is never projected into this identity", async () => {
    const fake = walletGateway(risk({ tokenContractAddress: USDC }), 60);
    const built = await createOnchainSource(deps(fake.gateway)).build(request, CONTEXT(3));
    expect(built.brief.fluxo!.riskDetails).toBeNull();
    expect(built.brief.fluxo!.concentration).toBeNull();
    expect(built.brief.nulos["token-risk"]).toBe("market_identity_mismatch");
    expect(built.onchainosCalls).toBe(3);
  });

  test("pool totals only describe up to five returned pools; missing USD prevents a made-up total", async () => {
    for (const [pools, expected] of [
      [Array.from({ length: 6 }, (_, i) => ({ liquidityUsd: i === 5 ? 1_000_000 : 10 })), { poolCount: 5, topPoolsLiquidityUsd: 50, largestPoolSharePct: 20 }],
      [[{ liquidityUsd: 20 }, { liquidityUsd: null }], { poolCount: 2, topPoolsLiquidityUsd: null, largestPoolSharePct: null }],
      [[], { poolCount: 0, topPoolsLiquidityUsd: null, largestPoolSharePct: null }],
    ] as const) {
      const fake = walletGateway(risk(), 60, false, pools);
      const built = await createOnchainSource(deps(fake.gateway)).build(request, CONTEXT(3));
      expect(built.brief.fluxo!.poolLiquidity).toMatchObject({ ...expected, partial: true, origin: "onchainos" });
      if (expected.topPoolsLiquidityUsd === null) expect(built.brief.nulos.pools).toBe("liquidity_unavailable");
    }
  });

  test("cancelling during the final pool read retires the build and preserves its known call count", async () => {
    const controller = new AbortController();
    const fake = walletGateway(risk(), 60);
    const gateway: OnchainSourceDeps["gateway"] = { async callInternal(route, params, intent) {
      const result = await fake.gateway.callInternal(route, params, intent);
      if (route === "/onchain/pools") controller.abort();
      return result;
    } };
    await expect(createOnchainSource(deps(gateway)).build(request, CONTEXT(3, controller.signal))).rejects.toMatchObject({ code: "cancelado", onchainosCalls: 3 });
    expect(fake.calls).toHaveLength(3);
  });
});
