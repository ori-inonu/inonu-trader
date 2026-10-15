import { expect, test } from "bun:test";
import { buildBrief } from "../intel/brief";
import { createPortfolioSource } from "./portfolio";
import { SourceError, type BriefSource } from "./ask";
import { PORTFOLIO_OBSERVATION_MAX_AGE_MS } from "./portfolio";
import { createOnchainSource } from "./source-onchain";
import { createJevInonuModel } from "./jev-model";

const NOW = 1_800_000_000_000;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const wallet = () => ({ chainIndex: "143", observedAtMs: NOW, coverage: "partial" as const, profile: "conservative_no_leverage" as const, assets: [{ contract: "native", symbol: "MON", balance: "0" }, { contract: CONTRACT, symbol: "USDC", balance: "0.000000000000000001" }] });
const token: BriefSource = { async build(request) { const candidates = [{ id: `token:143:${CONTRACT}`, tipo: "token" as const }]; return { ...buildBrief({ alvo: request.alvo as { chainIndex: string; address: string }, asOfMs: NOW, familiasHabilitadas: [], fluxo: { buyShare: 0.7 }, candidatos: candidates, trilha: null, risco: { nivel: 2, flags: [] }, regime: null, idades: { trades: 500 }, origens: { trades: "onchainos" }, nulos: { sentiment: "nao_consultado" } }), candidates, onchainosCalls: 2 }; } };

test("portfolio source preserves exact balances, partial coverage, unknown valuation and exact token identity", async () => {
  const source = createPortfolioSource({ token, now: () => NOW });
  const built = await source.build({ modo: "carteira", carteira: wallet() }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  expect(built.portfolio).toMatchObject({ coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: false });
  expect(built.portfolio?.assets[1]).toMatchObject({ contract: CONTRACT, balance: "0.000000000000000001", candidateId: `token:143:${CONTRACT}`, evidence: { origin: "onchainos", ageMs: 500 } });
  expect(built.portfolio?.assets[0]?.evidence.gaps).toContain("native_market_unavailable");
  expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
  expect(JSON.stringify(built.brief)).not.toContain("account");
  expect(built.onchainosCalls).toBe(2);
});

test("portfolio does not attach another chain or contract's market evidence to a candidate", async () => {
  const wrong: BriefSource = { async build() { const built = await token.build({ modo: "token", alvo: { chainIndex: "1", address: CONTRACT } }, { signal: new AbortController().signal, maxOnchainosCalls: 15 }); return built; } };
  const built = await createPortfolioSource({ token: wrong, now: () => NOW }).build({ modo: "carteira", carteira: wallet() }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  expect(built.portfolio?.assets[1]?.evidence).toMatchObject({ origin: "unavailable", flow: null, risk: null, gaps: ["market_identity_mismatch"] });
  expect(built.onchainosCalls).toBe(2);
});

test("six candidates with many data gaps remain bounded, retain observed risk flags and share the fifteen-call budget", async () => {
  const caps: number[] = [];
  const many: BriefSource = { async build(request, context) { caps.push(context.maxOnchainosCalls); const target = request.alvo as { chainIndex: string; address: string }; const candidates = [{ id: `token:${target.chainIndex}:${target.address}`, tipo: "token" as const }]; return { ...buildBrief({ alvo: target, asOfMs: NOW, familiasHabilitadas: [], fluxo: { buyShare: null }, candidatos: candidates, trilha: null, risco: { nivel: 5, flags: ["honeypot", "cannot_sell"] }, regime: null, idades: {}, origens: { token: "onchainos" }, nulos: Object.fromEntries(Array.from({ length: 28 }, (_, i) => [`missing_market_field_${i}`, "indisponivel"])) }), candidates, onchainosCalls: 2 }; } };
  const input = { ...wallet(), assets: Array.from({ length: 6 }, (_, i) => ({ contract: `0x${(i + 1).toString(16).padStart(40, "0")}`, symbol: `TOKEN${i}`, balance: "0.0000000000000000000000000000000000001" })) };
  const built = await createPortfolioSource({ token: many, now: () => NOW }).build({ modo: "carteira", carteira: input }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  expect(caps).toEqual([3, 3, 3, 2, 2, 2]);
  expect(built.onchainosCalls).toBe(12);
  expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
  expect(built.portfolio?.assets[0]?.evidence.gaps).toContain("risk_flag:honeypot");
  expect(built.portfolio?.assets[0]?.evidence.gaps.length).toBeLessThanOrEqual(24);
  expect(JSON.stringify(built.brief)).toContain("risk_flag:honeypot");
});

test("stale and future wallet observations refuse collection; an observation exactly sixty seconds old remains valid", async () => {
  let calls = 0;
  const counted: BriefSource = { async build(request, context) { calls++; return token.build(request, context); } };
  const source = createPortfolioSource({ token: counted, now: () => NOW });
  for (const observedAtMs of [NOW - PORTFOLIO_OBSERVATION_MAX_AGE_MS - 1, NOW + 1]) await expect(source.build({ modo: "carteira", carteira: { ...wallet(), observedAtMs } }, { signal: new AbortController().signal, maxOnchainosCalls: 15 })).rejects.toThrow("carteira_vencida");
  expect(calls).toBe(0);
  await source.build({ modo: "carteira", carteira: { ...wallet(), observedAtMs: NOW - PORTFOLIO_OBSERVATION_MAX_AGE_MS } }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  expect(calls).toBe(1);
});

test("empty means all observed balances are known zero; a searched unknown asset keeps emptiness unknown", async () => {
  const source = createPortfolioSource({ token, now: () => NOW });
  for (const [balances, expected] of [[["0", "0.000"], true], [["0", null], null], [["0.000000000000000001", null], false]] as const) {
    const input = wallet();
    const assets = input.assets.map((a, index) => ({ ...a, balance: balances[index]! }));
    const built = await source.build({ modo: "carteira", carteira: { ...input, assets } }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
    expect(built.portfolio?.positionsEmpty).toBe(expected);
    expect(built.portfolio?.netWorthUsd).toBeNull();
  }
});

test("a source exceeding its partition fails with all known calls counted, including earlier assets", async () => {
  let builds = 0;
  const overCap: BriefSource = { async build(request, context) { builds++; const built = await token.build(request, context); return { ...built, onchainosCalls: builds === 1 ? 1 : 8 }; } };
  const input = { ...wallet(), assets: [...wallet().assets, { contract: "0x2222222222222222222222222222222222222222", symbol: "OTHER", balance: "0" }] };
  const error = await createPortfolioSource({ token: overCap, now: () => NOW }).build({ modo: "carteira", carteira: input }, { signal: new AbortController().signal, maxOnchainosCalls: 15 }).catch((e: SourceError) => e);
  expect(error).toMatchObject({ code: "teto_onchainos", onchainosCalls: 9 });
});

test("the existing OnchainOS source composes measured flow, risk, age and gaps without a trail direction score", async () => {
  const routes: string[] = [];
  const liveShape = createOnchainSource({ now: () => NOW, gateway: { async callInternal(route) {
    routes.push(route);
    const data = route === "/onchain/price-info" ? [{ price: 1, liquidityUsd: 100_000 }]
      : route === "/onchain/trades" ? [{ side: "buy", volumeUsd: 75 }, { side: "sell", volumeUsd: 25 }]
      : route === "/onchain/token-risk" ? { riskLevel: 4, tags: [] } : [];
    return { ok: true as const, data, meta: { tier: "basic" as const, cachedAtMs: NOW - 5000, ageMs: 5000, stale: false, budget: { tier: "basic" as const, used: 1, cap: 50 } }, sent: true };
  } } });
  const built = await createPortfolioSource({ token: liveShape, now: () => NOW }).build({ modo: "carteira", carteira: wallet() }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  expect(built.portfolio?.assets[1]?.evidence).toMatchObject({ origin: "onchainos", ageMs: 5000, flow: { buyShare: 0.75, tradeCount: 2 }, risk: 4 });
  expect(built.portfolio?.assets[1]?.evidence.gaps.some(gap => gap.startsWith("optional:quote:"))).toBe(true);
  expect(built.onchainosCalls).toBe(routes.length);
  expect(routes.length).toBeLessThanOrEqual(15);
  expect(built.brief.trilha).toBeNull();
  expect(built.brief.candidatos.every((candidate) => candidate.nota === undefined)).toBe(true);
});

test("SH02: cancelled collection preserves calls from earlier and interrupted assets", async () => {
  const controller = new AbortController();
  const input = { ...wallet(), assets: [{ contract: CONTRACT, symbol: "ONE", balance: "1" }, { contract: "0x2222222222222222222222222222222222222222", symbol: "TWO", balance: "1" }] };
  let builds = 0;
  const interrupted: BriefSource = { async build(request, context) {
    builds++;
    if (builds === 2) { controller.abort(); throw new SourceError("cancelado", 3); }
    return { ...await token.build(request, context), onchainosCalls: 4 };
  } };
  await expect(createPortfolioSource({ token: interrupted, now: () => NOW }).build({ modo: "carteira", carteira: input }, { signal: controller.signal, maxOnchainosCalls: 15 })).rejects.toMatchObject({ code: "cancelado", onchainosCalls: 7 });
  expect(builds).toBe(2);
});

test("SH02: six assets preserve qualified advanced risk and partial pools in the model state within fifteen reads and 2048 bytes", async () => {
  const input = { ...wallet(), assets: Array.from({ length: 6 }, (_, i) => ({ contract: `0x${(i + 1).toString(16).padStart(40, "0")}`, symbol: `TOKEN${i}`, balance: "0.0000000000000000000000000000000000001" })) };
  const routes: { route: string; token: string }[] = [];
  const source = createOnchainSource({ now: () => NOW, gateway: { async callInternal(route, params) {
    const index = input.assets.findIndex(a => a.contract === params.token);
    routes.push({ route, token: params.token! });
    const data = route === "/onchain/price-info" ? [{ chainIndex: "143", address: params.token, price: 2.5, liquidityUsd: 250_000, change: { m5: -1, h1: 2, h4: 4, h24: 3 }, volume: { m5: 500, h1: 5000, h4: 20_000, h24: 50_000 } }]
      : route === "/onchain/token-risk" ? { chainIndex: "143", address: params.token, riskLevel: 2, tags: ["devAddLiquidity"], top10HoldPct: 20 + index, devHoldPct: 0.3, bundleHoldPct: 0.2, sniperHoldPct: 0.1, suspiciousHoldPct: 0.05, lpBurnedPct: 90, devCreateCount: 10 + index, devLaunchedCount: 5, devRugCount: 0 }
      : route === "/onchain/pools" ? [{ liquidityUsd: 20_000 }, { liquidityUsd: 10_000 }] : [];
    return { ok: true as const, data, meta: { tier: "basic" as const, cachedAtMs: NOW - 500, ageMs: 500, stale: false, budget: { tier: "basic" as const, used: 1, cap: 50 } }, sent: true };
  } } });
  const built = await createPortfolioSource({ token: source, now: () => NOW }).build({ modo: "carteira", carteira: input }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  expect(routes).toHaveLength(15);
  expect(routes.filter(r => r.route === "/onchain/pools").map(r => r.token)).toEqual(input.assets.slice(0, 3).map(a => a.contract));
  expect(built.onchainosCalls).toBe(15);
  built.portfolio!.assets.forEach((asset, index) => {
    expect(asset.evidence).toMatchObject({ riskDetails: { level: 2, tags: ["devAddLiquidity"], lpBurnedPct: 90, devCreateCount: 10 + index, devLaunchedCount: 5, devRugCount: 0, origin: "onchainos", ageMs: 500, stale: false }, concentration: { top10HoldPct: 20 + index, devHoldPct: null, bundleHoldPct: null, sniperHoldPct: null, suspiciousHoldPct: null, ageMs: 500, stale: false } });
    expect(asset.evidence.gaps).toContain("optional:concentration:scale_ambiguous");
  });
  expect(built.portfolio!.assets[0]!.evidence).toMatchObject({ poolLiquidity: { poolCount: 2, topPoolsLiquidityUsd: 30_000, largestPoolSharePct: 200 / 3, partial: true, origin: "onchainos", ageMs: 500, stale: false } });
  expect(built.portfolio!.assets[3]!.evidence.poolLiquidity).toBeNull();
  expect(built.portfolio!.assets[3]!.evidence.gaps).toContain("optional:pools:nao_consultado:nao_pedido");
  const state = built.brief.fluxo!.carteira as any;
  expect(state.riskDetails).toEqual(input.assets.map((_, i) => [90, 10 + i, 5, 0, 500, false]));
  expect(state.concentration).toEqual(input.assets.map((_, i) => [20 + i]));
  expect(state.poolLiquidity.map((row: unknown) => typeof row === "number" ? state.poolLiquidity[row] : row)).toEqual([[2, 30_000, 200 / 3, 500, false], [2, 30_000, 200 / 3, 500, false], [2, 30_000, 200 / 3, 500, false], null, null, null]);
  expect(state.market.map((row: unknown) => typeof row === "number" ? state.market[row] : row)).toEqual(input.assets.map(() => [2.5, 250_000, -1, 2, 4, 3, 500, 5000, 20_000, 50_000, 500, false]));
  expect(state.items.map((row: unknown[]) => row[1])).toEqual(input.assets.map(a => a.balance));
  expect(built.brief.candidatos.map(c => c.id)).toEqual(input.assets.map(a => `token:143:${a.contract}`));
  expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
  const calls: any[] = [];
  const model = createJevInonuModel({ apiKey: () => "synthetic-key", createProvider: () => ({ evaluationModel: () => ({}) as never }), evaluate: (async (call: any) => {
    calls.push(call);
    return { answers: Object.fromEntries(input.assets.map((_, i) => [`asset_${i}`, { choice: "hold" }])), usage: { inputTokens: 321, outputTokens: 12 } };
  }) as never });
  const signal = new AbortController().signal;
  const result = await model.choose({ brief: built.brief, ids: built.brief.candidatos.map(c => c.id), mode: "carteira", signal });
  expect(calls).toHaveLength(1);
  expect(calls[0].state).toBe(built.brief);
  expect(calls[0].abortSignal).toBe(signal);
  expect(calls[0].maxRetries).toBe(0);
  expect(result.raw).toEqual({ choices: input.assets.map(a => ({ candidateId: `token:143:${a.contract}`, action: "hold" })) });
  expect(built.portfolio!.netWorthUsd).toBeNull();
  expect(built.brief.trilha).toBeNull();
});
