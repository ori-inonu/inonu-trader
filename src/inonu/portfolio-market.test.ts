import { expect, test } from "bun:test";
import { createPortfolioSource } from "./portfolio";
import { createOnchainSource } from "./source-onchain";

const NOW = 1_800_000_000_000;
const assets = Array.from({ length: 6 }, (_, i) => ({ contract: `${"A".repeat(32)}${i + 1}`, symbol: `TOKEN${i}`, balance: "1" }));
const input = (rows = assets) => ({ chainIndex: "501", observedAtMs: NOW, coverage: "partial" as const, profile: "conservative_no_leverage" as const, assets: rows });
const context = () => ({ signal: new AbortController().signal, maxOnchainosCalls: 15 });
// Repeated market tuples refer to an earlier item without losing its public facts.
const expandMarket = (encoded: unknown[]) => encoded.map(row => typeof row === "number" ? encoded[row] : row);

// The injected gateway supplies only normalized, synthetic public market facts. No credentials or network.
function source(routes: string[], options: { mutate?: (route: string, data: unknown) => unknown; staleRisk?: boolean; priceAge?: number; riskAge?: number } = {}) {
  return createOnchainSource({
    now: () => NOW, gateway: {
      async callInternal(route, params) {
        routes.push(route);
        const identity = { chainIndex: params.chainIndex, address: params.token };
        const data = route === "/onchain/price-info" ? [{ ...identity, price: 2.5, liquidityUsd: 250_000, change: { m5: -1, h1: 2, h4: 4, h24: 3 }, volume: { m5: 500, h1: 5000, h4: 20_000, h24: 50_000 } }]
          : route === "/onchain/token-risk" ? { ...identity, riskLevel: 3, tags: [] }
            : route === "/onchain/trades" ? [{ side: "buy", volumeUsd: 75 }, { side: "sell", volumeUsd: 25 }] : [];
        const ageMs = route === "/onchain/token-risk" ? options.riskAge ?? 500 : options.priceAge ?? 500;
        return { ok: true as const, data: options.mutate?.(route, data) ?? data, meta: { tier: "premium" as const, cachedAtMs: NOW - ageMs, ageMs, stale: route === "/onchain/token-risk" && options.staleRisk === true, budget: { tier: "premium" as const, used: 1, cap: 50 } }, sent: true };
      }
    }
  });
}

test("six-token consultation retains public price, windows and risk within fifteen calls, without position valuation", async () => {
  const routes: string[] = [];
  const built = await createPortfolioSource({ token: source(routes), now: () => NOW }).build({ modo: "carteira", carteira: input() }, context());
  expect(built.portfolio?.assets.map(a => a.evidence.risk)).toEqual([3, 3, 3, 3, 3, 3]);
  for (const asset of built.portfolio!.assets) expect(asset.evidence.market).toEqual({ priceUsd: 2.5, liquidityUsd: 250_000, changePct: { m5: -1, h1: 2, h4: 4, h24: 3 }, volumeUsd: { m5: 500, h1: 5000, h4: 20_000, h24: 50_000 }, ageMs: 500, stale: false });
  expect(built.onchainosCalls).toBeLessThanOrEqual(15);
  expect(routes).not.toContain("/onchain/candles");
  expect(built.portfolio?.netWorthUsd).toBeNull();
  const market = (built.brief.fluxo?.carteira as { market: unknown }).market;
  expect(market).toBeDefined();
  expect(expandMarket(market as unknown[])).toEqual(assets.map(() => [2.5, 250_000, -1, 2, 4, 3, 500, 5000, 20_000, 50_000, 500, false]));
  expect(JSON.stringify(market)).toContain("250000");
  expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
  expect(JSON.stringify(built.brief)).not.toMatch(/account|walletAddress|valueUsd|costBasis/);
});

test("missing normalized four-hour windows remain unknown in evidence and compact model context", async () => {
  const mutate = (route: string, data: unknown) => route === "/onchain/price-info" ? (data as object[]).map(row => ({ ...row, change: { m5: -1, h1: 2, h24: 3 }, volume: { m5: 500, h1: 5000, h24: 50_000 } })) : data;
  const built = await createPortfolioSource({ token: source([], { mutate }), now: () => NOW }).build({ modo: "carteira", carteira: input(assets.slice(0, 2)) }, context());
  expect(built.portfolio!.assets[0]!.evidence.market).toMatchObject({ changePct: { h4: null }, volumeUsd: { h4: null } });
  expect(expandMarket((built.brief.fluxo!.carteira as { market: unknown[] }).market)).toEqual(assets.slice(0, 2).map(() => [2.5, 250_000, -1, 2, null, 3, 500, 5000, null, 50_000, 500, false]));
});

test("fifteen-call cap prioritizes price, risk and three pools; token mode keeps its original plan", async () => {
  const routes: string[] = [];
  const token = source(routes);
  const built = await createPortfolioSource({ token, now: () => NOW }).build({ modo: "carteira", carteira: input() }, context());
  expect(routes).toEqual(assets.flatMap((_, i) => i < 3 ? ["/onchain/price-info", "/onchain/token-risk", "/onchain/pools"] : ["/onchain/price-info", "/onchain/token-risk"]));
  for (const asset of built.portfolio!.assets) {
    expect(asset.evidence.flow).toBeNull();
    expect(asset.evidence.gaps.some(g => g.startsWith("optional:trades:"))).toBe(true);
    expect(asset.evidence.gaps.some(g => g.startsWith("optional:pools:"))).toBe(true);
    expect(asset.evidence.gaps).toContain("not_applicable:regime:nao_se_aplica_a_token");
    expect(asset.evidence.gaps.some(g => g.startsWith("essential:"))).toBe(false);
  }
  routes.length = 0;
  await token.build({ modo: "token", alvo: { chainIndex: "501", address: assets[0]!.contract } }, { ...context(), maxOnchainosCalls: 2 });
  expect(routes).toEqual(["/onchain/price-info", "/onchain/candles"]);
});

test("five tokens plus native collect five pools within fifteen calls without guessing a wrapped native identity", async () => {
  const routes: string[] = [];
  const built = await createPortfolioSource({ token: source(routes), now: () => NOW }).build({ modo: "carteira", carteira: input([...assets.slice(0, 5), { contract: "native", symbol: "SOL", balance: "1" }]) }, context());
  expect(built.onchainosCalls).toBe(15);
  expect(routes.filter(route => route === "/onchain/pools")).toHaveLength(5);
  expect(built.portfolio!.assets.slice(0, 5).every(a => a.evidence.flow === null && a.evidence.gaps.some(g => g.startsWith("optional:trades:")))).toBe(true);
  expect(built.portfolio!.assets[5]!.evidence).toMatchObject({ origin: "unavailable", market: null, risk: null, flow: null, gaps: ["native_market_unavailable"] });
});

test("market age is its own price age; stale risk is unavailable rather than fresh", async () => {
  const built = await createPortfolioSource({ token: source([], { priceAge: 500, riskAge: 300_000, staleRisk: true }), now: () => NOW }).build({ modo: "carteira", carteira: input(assets.slice(0, 2)) }, context());
  for (const asset of built.portfolio!.assets) {
    expect(asset.evidence.market?.ageMs).toBe(500);
    expect(asset.evidence.ageMs).toBe(300_000);
    expect(asset.evidence.risk).toBeNull();
  }
});

test("normalized rows for another mint or network cannot supply the requested token's market and risk", async () => {
  const mutate = (route: string, data: unknown) => route === "/onchain/price-info" ? [{ ...(data as object[])[0], address: "B".repeat(33) }] : route === "/onchain/token-risk" ? { ...(data as object), chainIndex: "1" } : data;
  const built = await createPortfolioSource({ token: source([], { mutate }), now: () => NOW }).build({ modo: "carteira", carteira: input(assets.slice(0, 2)) }, context());
  for (const asset of built.portfolio!.assets) {
    expect(asset.evidence.market).toBeNull();
    expect(asset.evidence.risk).toBeNull();
    expect(asset.evidence.gaps).toContain("essential:price-info:market_identity_mismatch");
    expect(asset.evidence.gaps).toContain("essential:token-risk:market_identity_mismatch");
  }
});

test("unknown risk level zero stays null; six maximum balances still fit the bounded brief", async () => {
  const mutate = (route: string, data: unknown) => route === "/onchain/token-risk" ? { ...(data as object), riskLevel: 0 } : data;
  const built = await createPortfolioSource({ token: source([], { mutate }), now: () => NOW }).build({ modo: "carteira", carteira: input(assets.map(a => ({ ...a, balance: "0.0000000000000000000000000000000000001" }))) }, context());
  expect(built.portfolio!.assets.every(a => a.evidence.risk === null)).toBe(true);
  expect(built.brief.asOfMs).toBe(NOW);
  expect((built.brief.fluxo!.carteira as { items: unknown[][] }).items.map(item => item[1])).toEqual(assets.map(() => "0.0000000000000000000000000000000000001"));
  expect((built.brief.fluxo!.carteira as { items: unknown[][] }).items.map(item => item[6])).toEqual(assets.map(() => "onchainos"));
  expect(expandMarket((built.brief.fluxo!.carteira as { market: unknown[] }).market)).toEqual(assets.map(() => [2.5, 250_000, -1, 2, 4, 3, 500, 5000, 20_000, 50_000, 500, false]));
  expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
});
