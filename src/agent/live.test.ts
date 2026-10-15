import { describe, expect, test } from "bun:test";
import type { RawTokenAsset } from "../okx-wallet/portfolio";
import type { BriefSource, BuiltBrief } from "../inonu/ask";
import type { InternalGatewayResult } from "../onchain-read/gateway";
import { candidateOf, type EcoFacts } from "../opportunity/ecosystem";
import type { Candle } from "../quant/types";
import { createBookReader, createEcosystemReader, createHoldingFactsReader, createMarketContext, createMomentumReader, createPriceLookup, createTimingReader, okxPublicCandles, okxPublicDerivatives } from "./live";
import { DEFAULT_CONFIG, type AgentConfig } from "./config";
import { createPlanStore, planKey, type PositionPlan } from "./plans";
import type { DecisionMark } from "./scoreboard";
import type { Book, Position } from "./types";

const EVM = "0x1111111111111111111111111111111111111111";
const EVM2 = "0x2222222222222222222222222222222222222222";
const SOL = "So11111111111111111111111111111111111111112";
const TOKEN = "0xabcdef0123456789abcdef0123456789abcdef01";
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 14, 12);
const live = new AbortController().signal;

const asset = (over: Partial<RawTokenAsset> = {}): RawTokenAsset => ({ chainIndex: "1", tokenContractAddress: TOKEN, address: EVM, symbol: "AAA", balance: "2.5", rawBalance: "2500000000000000000", tokenPrice: "4", isRiskToken: false, ...over });
const config = (over: Partial<AgentConfig> = {}): AgentConfig => ({ ...DEFAULT_CONFIG, managed: { kind: "propria", evm: EVM, solana: null }, ...over });

const ok = (data: unknown): InternalGatewayResult => ({ ok: true, data, meta: { tier: "basic", cachedAtMs: NOW, ageMs: 0, stale: false, budget: { tier: "basic", used: 1, cap: null } }, sent: true });
const fail = (): InternalGatewayResult => ({ ok: false, error: "provider_unavailable", sent: true } as never);
type Call = { route: string; params: Record<string, string> };
const gatewayOf = (answer: (call: Call) => InternalGatewayResult) => {
  const calls: Call[] = [];
  return { calls, gateway: { callInternal: async (route: string, params: Readonly<Record<string, string>>) => { const call = { route, params: { ...params } }; calls.push(call); return answer(call); } } };
};

describe("the book reader", () => {
  test("reads the managed wallet on the EVM networks, and Solana on its own", async () => {
    const asked: { address: string; chains: readonly string[] }[] = [];
    const reader = createBookReader({
      config: () => config({ managed: { kind: "propria", evm: EVM, solana: SOL } }),
      source: { balances: async (address, chains) => { asked.push({ address, chains }); return [asset({ address })]; } },
      now: () => NOW,
    });
    const book = await reader.read(live);
    expect(asked).toEqual([{ address: EVM, chains: DEFAULT_CONFIG.chains }, { address: SOL, chains: ["501"] }]);
    expect(book?.positions.every((p) => p.wallet === "agente")).toBe(true);
    expect(reader.last()).toMatchObject({ managedOk: true, watchFailed: 0 });
  });

  test("a watched wallet is read for the picture only, and its failure does not stop the agent", async () => {
    const reader = createBookReader({
      config: () => config({ watch: { evm: EVM2, solana: null } }),
      source: { balances: async (address) => { if (address === EVM2) throw new Error("down"); return [asset()]; } },
      now: () => NOW,
    });
    const book = await reader.read(live);
    expect(book).not.toBeNull();
    expect(reader.last()).toMatchObject({ managedOk: true, watchFailed: 1 });
  });

  test("the watched wallet appears as the principal one", async () => {
    const reader = createBookReader({
      config: () => config({ watch: { evm: EVM2, solana: null } }),
      source: { balances: async (address) => [asset({ address, tokenContractAddress: address === EVM2 ? "0x3333333333333333333333333333333333333333" : TOKEN })] },
      now: () => NOW,
    });
    const book = (await reader.read(live))!;
    expect(book.positions.map((p) => p.wallet).sort()).toEqual(["agente", "principal"]);
  });

  test("the managed wallet that cannot be read means no book at all: no deciding on half a picture", async () => {
    const slept: number[] = [];
    let calls = 0;
    const reader = createBookReader({ config: () => config(), source: { balances: async () => { calls++; throw new Error("down"); } }, now: () => NOW, sleep: async (ms) => void slept.push(ms) });
    expect(await reader.read(live)).toBeNull();
    expect(reader.last()).toMatchObject({ managedOk: false });
    // it asked three times, with a short pause between them, before giving up
    expect(calls).toBe(3);
    expect(slept).toEqual([2000, 2000]);
  });

  test("a read that fails once and then answers is a book: a passing hiccup does not cost the cycle (and five minutes)", async () => {
    let calls = 0;
    const reader = createBookReader({ config: () => config(), source: { balances: async () => { calls++; if (calls === 1) throw new Error("blip"); return [asset()]; } }, now: () => NOW, sleep: async () => {} });
    const book = await reader.read(live);
    expect(book).not.toBeNull();
    expect(calls).toBe(2);
    expect(reader.last()).toMatchObject({ managedOk: true });
  });

  test("a stop in the middle of the retries ends them at once", async () => {
    const controller = new AbortController();
    let calls = 0;
    const reader = createBookReader({ config: () => config(), source: { balances: async () => { calls++; throw new Error("down"); } }, now: () => NOW, sleep: async () => controller.abort() });
    expect(await reader.read(controller.signal)).toBeNull();
    expect(calls).toBe(1);
  });

  test("no managed address is no book", async () => {
    const reader = createBookReader({ config: () => DEFAULT_CONFIG, source: { balances: async () => [] }, now: () => NOW });
    expect(await reader.read(live)).toBeNull();
  });

  test("the same address as managed and watched is read once", async () => {
    let calls = 0;
    const reader = createBookReader({ config: () => config({ watch: { evm: EVM.toUpperCase().replace("0X", "0x"), solana: null } }), source: { balances: async () => { calls++; return []; } }, now: () => NOW });
    await reader.read(live);
    expect(calls).toBe(1);
  });

  test("a read that was cancelled gives no book", async () => {
    const controller = new AbortController();
    const reader = createBookReader({ config: () => config(), source: { balances: async () => { controller.abort(); return [asset()]; } }, now: () => NOW });
    expect(await reader.read(controller.signal)).toBeNull();
  });
});

const hour = (i: number, close: number, confirmed = true) => ({ ts: NOW - (60 - i) * HOUR, open: close, high: close * 1.004, low: close * 0.996, close, volume: 1, volumeUsd: 1, confirmed });
const calmRows = () => Array.from({ length: 60 }, (_, i) => hour(i, 100 * (i % 2 === 0 ? 1 : 1.02)));

describe("the timing reader", () => {
  const facts = { chainIndex: "1", address: TOKEN, candidateId: `token:1:${TOKEN}` };

  test("asks for sixty hourly bars and turns them into the facts of the entry", async () => {
    const g = gatewayOf(() => ok(calmRows()));
    const reader = createTimingReader({ gateway: g.gateway, now: () => NOW });
    const t = await reader.read(facts, live);
    expect(g.calls).toEqual([{ route: "/onchain/candles", params: { chainIndex: "1", token: TOKEN, bar: "1H", limit: "60" } }]);
    expect(t).toMatchObject({ bars: 48, rsi: expect.any(Number) });
  });

  test("cached for ten minutes", async () => {
    const g = gatewayOf(() => ok(calmRows()));
    let now = NOW;
    const reader = createTimingReader({ gateway: g.gateway, now: () => now });
    await reader.read(facts, live);
    now += 9 * 60_000;
    await reader.read(facts, live);
    expect(g.calls).toHaveLength(1);
    now += 2 * 60_000;
    await reader.read(facts, live);
    expect(g.calls).toHaveLength(2);
  });

  test("a failure is null, and remembered for two minutes only", async () => {
    const g = gatewayOf(() => fail());
    let now = NOW;
    const reader = createTimingReader({ gateway: g.gateway, now: () => now });
    expect(await reader.read(facts, live)).toBeNull();
    now += 60_000;
    expect(await reader.read(facts, live)).toBeNull();
    expect(g.calls).toHaveLength(1);
    now += 70_000;
    await reader.read(facts, live);
    expect(g.calls).toHaveLength(2);
  });

  test("rows that cannot be real are no facts", async () => {
    const reader = createTimingReader({ gateway: gatewayOf(() => ok([{ ts: 1, open: "x" }])).gateway, now: () => NOW });
    expect(await reader.read(facts, live)).toBeNull();
    const short = createTimingReader({ gateway: gatewayOf(() => ok(calmRows().slice(0, 10))).gateway, now: () => NOW });
    expect(await short.read(facts, live)).toBeNull();
  });
});

const held = (over: Partial<Position> = {}): Position => ({ id: `token:1:${TOKEN}`, chainIndex: "1", address: TOKEN, symbol: "AAA", wallet: "agente", usd: 100, balanceMinor: "1000", decimals: 18, isCash: false, priceUsd: 4, ...over });
const bookOf = (positions: Position[]): Book => ({ observedAtMs: NOW, positions, cashByChain: {}, totalUsd: 1000, agentUsd: 1000 });
const infoRow = { price: 4.2, liquidityUsd: 50_000, change: { m5: 0, h1: 0, h4: 0, h24: -3.5 }, volume: { h24: 900_000 } };

describe("the holding facts reader", () => {
  const route = (call: Call): InternalGatewayResult => (call.route === "/onchain/price-info" ? ok([infoRow]) : ok({ riskLevel: 2, tags: [] }));

  test("market facts from the provider, the exit impact from the size of the position, the price from the balance", async () => {
    const g = gatewayOf(route);
    const factsOf = await createHoldingFactsReader({ gateway: g.gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => NOW }).read(bookOf([held()]), live);
    expect(factsOf(held())).toMatchObject({ priceUsd: 4, changeH24Pct: -3.5, liquidityUsd: 50_000, volumeH24Usd: 900_000, exitImpactPct: 0.2, riskLevel: 2, riskFlags: [], sinceEntryPct: null, heldHours: null, soldPct: null });
  });

  test("the entry and the hours held come from the plan", async () => {
    const plans = createPlanStore({ read: () => null, write: () => {} });
    const plan: PositionPlan = { key: planKey("1", TOKEN), chainIndex: "1", address: TOKEN, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 3.2, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 4.5, targetHit: false, trimmed: false, cycleId: "c0" };
    plans.open(plan);
    const factsOf = await createHoldingFactsReader({ gateway: gatewayOf(route).gateway, plans, now: () => NOW }).read(bookOf([held()]), live);
    expect(factsOf(held())).toMatchObject({ sinceEntryPct: 25, heldHours: 5 });
  });

  test("market facts of a position that matters are read every 10 minutes and risk every 6 hours, not every cycle", async () => {
    const g = gatewayOf(route);
    let now = NOW;
    const reader = createHoldingFactsReader({ gateway: g.gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => now });
    await reader.read(bookOf([held()]), live);
    expect(g.calls.map((c) => c.route).sort()).toEqual(["/onchain/price-info", "/onchain/token-risk"]);
    now += 9 * 60_000;
    await reader.read(bookOf([held()]), live);
    expect(g.calls).toHaveLength(2);
    now += 2 * 60_000;
    await reader.read(bookOf([held()]), live);
    expect(g.calls.filter((c) => c.route === "/onchain/price-info")).toHaveLength(2);
    expect(g.calls.filter((c) => c.route === "/onchain/token-risk")).toHaveLength(1);
    now += 6 * HOUR;
    await reader.read(bookOf([held()]), live);
    expect(g.calls.filter((c) => c.route === "/onchain/token-risk")).toHaveLength(2);
  });

  test("only the biggest positions are read, and every one that has a plan", async () => {
    const mk = (n: number, usd: number) => held({ id: `token:1:0x${n.toString(16).padStart(40, "0")}`, address: `0x${n.toString(16).padStart(40, "0")}`, usd });
    const many = Array.from({ length: 6 }, (_, i) => mk(i + 16, 100 + i));
    const plans = createPlanStore({ read: () => null, write: () => {} });
    const smallest = many[0]!;
    plans.open({ key: planKey("1", smallest.address), chainIndex: "1", address: smallest.address, symbol: "S", profile: "alvo_5", entryPriceUsd: 1, entryAtMs: NOW, peakPriceUsd: 1, targetHit: false, trimmed: false, cycleId: "c" });
    const g = gatewayOf(route);
    await createHoldingFactsReader({ gateway: g.gateway, plans, now: () => NOW, max: 2 }).read(bookOf(many), live);
    const read = new Set(g.calls.map((c) => c.params.token));
    expect(read.size).toBe(3);
    expect(read.has(smallest.address)).toBe(true);
  });

  test("the dust and the absurdly big claims are not read; a position the agent opened is read whatever it claims", async () => {
    const mk = (n: number, usd: number) => held({ id: `token:1:0x${n.toString(16).padStart(40, "0")}`, address: `0x${n.toString(16).padStart(40, "0")}`, usd });
    const dust = mk(16, 2);
    const fine = mk(17, 300);
    const fantasy = mk(18, 148_000_000);
    const opened = mk(19, 3);
    const plans = createPlanStore({ read: () => null, write: () => {} });
    plans.open({ key: planKey("1", opened.address), chainIndex: "1", address: opened.address, symbol: "O", profile: "alvo_5", entryPriceUsd: 1, entryAtMs: NOW, peakPriceUsd: 1, targetHit: false, trimmed: false, cycleId: "c" });
    const g = gatewayOf(route);
    await createHoldingFactsReader({ gateway: g.gateway, plans, now: () => NOW }).read(bookOf([dust, fine, fantasy, opened]), live);
    expect(new Set(g.calls.map((c) => c.params.token))).toEqual(new Set([fine.address, opened.address]));
  });

  test("the native coin and cash are not read; the native keeps the price of the balance", async () => {
    const g = gatewayOf(route);
    const native = held({ id: "token:1:native", address: "native", symbol: "ETH", priceUsd: 3000 });
    const factsOf = await createHoldingFactsReader({ gateway: g.gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => NOW }).read(bookOf([native, held({ isCash: true, symbol: "USDC" })]), live);
    expect(g.calls).toHaveLength(0);
    expect(factsOf(native)).toMatchObject({ priceUsd: 3000, riskLevel: null, liquidityUsd: null });
  });

  test("a provider that fails leaves nulls, not zeros", async () => {
    const factsOf = await createHoldingFactsReader({ gateway: gatewayOf(() => fail()).gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => NOW }).read(bookOf([held()]), live);
    expect(factsOf(held())).toMatchObject({ priceUsd: 4, changeH24Pct: null, liquidityUsd: null, riskLevel: null, exitImpactPct: null });
  });
});

const eco = (n: number): EcoFacts => ({ candidateId: `token:1:0x${n.toString(16).padStart(40, "0")}`, chainIndex: "1", address: `0x${n.toString(16).padStart(40, "0")}`, symbol: `B${n}`, nota: 70, priceUsd: 1, changePct: 12, volumeUsd: 2e6, liquidityUsd: 5e6, marketCapUsd: 5e7, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 });
const saldoWith = (cash: number) => ({ observedAtMs: NOW, totalUsd: cash, cashUsd: cash, chains: [{ chainIndex: "1", cashUsd: cash }], holdings: [], riskPct: 0.1 });

describe("the ecosystem reader", () => {
  const sourceOf = (answer: () => BuiltBrief | Error, counter = { n: 0 }): { source: BriefSource; counter: { n: number } } => ({
    counter,
    source: { build: async () => { counter.n++; const r = answer(); if (r instanceof Error) throw r; return r; } },
  });
  const built = (facts: EcoFacts[]): BuiltBrief => ({ brief: {} as never, candidates: [], onchainosCalls: 5, ecosystem: { observedAtMs: NOW, saldo: null, candidates: facts.map((f) => candidateOf(f, null)), excluded: { honeypot: 1 } } });

  test("scans once and sizes the same candidates against the balance of the moment", async () => {
    const s = sourceOf(() => built([eco(16)]));
    const reader = createEcosystemReader({ source: s.source, now: () => NOW });
    const a = await reader.read(saldoWith(1000), live);
    const b = await reader.read(saldoWith(5000), live);
    expect(s.counter.n).toBe(1);
    expect(a.candidates[0]!.cap.maxUsd).toBeLessThan(b.candidates[0]!.cap.maxUsd);
    expect(a.excluded).toEqual({ honeypot: 1 });
  });

  test("the agent asks the source for a wide pool: it needs candidates the code will leave OPEN, and only the wide one has them", async () => {
    let asked: number | undefined;
    const source: BriefSource = { build: async (_request, context) => { asked = context.candidates; return built([eco(16)]); } };
    await createEcosystemReader({ source, now: () => NOW }).read(saldoWith(100), live);
    expect(asked).toBe(10);
  });

  test("scans again after thirty minutes", async () => {
    const s = sourceOf(() => built([eco(16)]));
    let now = NOW;
    const reader = createEcosystemReader({ source: s.source, now: () => now });
    await reader.read(null, live);
    now += 29 * 60_000;
    await reader.read(null, live);
    expect(s.counter.n).toBe(1);
    now += 2 * 60_000;
    await reader.read(null, live);
    expect(s.counter.n).toBe(2);
  });

  test("while the market has something to offer (a purchase open, or a level of risk that would open one) the scan is read again every ten minutes instead of thirty: the spending of the provider's calls follows where the chance is", async () => {
    const s = sourceOf(() => built([eco(16)]));
    let now = NOW;
    let hot = true;
    const reader = createEcosystemReader({ source: s.source, now: () => now, hot: () => hot });
    await reader.read(null, live);
    now += 9 * 60_000;
    await reader.read(null, live);
    expect(s.counter.n).toBe(1);
    now += 2 * 60_000;
    await reader.read(null, live);
    expect(s.counter.n).toBe(2);
    // when nothing is open any more the old half hour is back: ten minutes are not enough
    hot = false;
    now += 11 * 60_000;
    await reader.read(null, live);
    expect(s.counter.n).toBe(2);
    now += 20 * 60_000;
    await reader.read(null, live);
    expect(s.counter.n).toBe(3);
  });

  test("a hint that throws is no hint: the half hour stands", async () => {
    const s = sourceOf(() => built([eco(16)]));
    let now = NOW;
    const reader = createEcosystemReader({ source: s.source, now: () => now, hot: () => { throw new Error("no cycle yet"); } });
    await reader.read(null, live);
    now += 12 * 60_000;
    await reader.read(null, live);
    expect(s.counter.n).toBe(1);
  });

  test("when the money moves to another network the candidates follow it, without waiting for the half hour: the scan is read again (the networks it reads are the ones where the agent holds cash)", async () => {
    const asked: unknown[] = [];
    const counter = { n: 0 };
    const source: BriefSource = { build: async (request) => { counter.n++; asked.push(request.saldo?.chains.map((c) => c.chainIndex)); return built([eco(16)]); } };
    let now = NOW;
    const reader = createEcosystemReader({ source, now: () => now });
    const onSolana = { ...saldoWith(42), chains: [{ chainIndex: "501", cashUsd: 42 }] };
    await reader.read(saldoWith(0), live);
    // the cash lands on Solana a few minutes later
    now += 5 * 60_000;
    await reader.read(onSolana, live);
    expect(counter.n).toBe(2);
    expect(asked[1]).toEqual(["501"]);
    // the same networks again: nothing to read
    now += 60_000;
    await reader.read({ ...onSolana, totalUsd: 50, cashUsd: 50, chains: [{ chainIndex: "501", cashUsd: 50 }] }, live);
    expect(counter.n).toBe(2);
    // a flapping balance does not make the scan thrash: within two minutes of the last one it is not read again
    now += 30_000;
    await reader.read(saldoWith(10), live);
    expect(counter.n).toBe(2);
    now += 2 * 60_000;
    await reader.read(saldoWith(10), live);
    expect(counter.n).toBe(3);
  });

  test("a scan that fails serves the last one, and nothing once it is too old", async () => {
    let fail = false;
    const s = sourceOf(() => (fail ? new Error("down") : built([eco(16)])));
    let now = NOW;
    const reader = createEcosystemReader({ source: s.source, now: () => now });
    expect((await reader.read(null, live)).candidates).toHaveLength(1);
    fail = true;
    now += 31 * 60_000;
    expect((await reader.read(null, live)).candidates).toHaveLength(1);
    now += 3 * HOUR;
    expect((await reader.read(null, live)).candidates).toHaveLength(0);
  });

  test("with no balance the candidates come without a ceiling", async () => {
    const reader = createEcosystemReader({ source: sourceOf(() => built([eco(16)])).source, now: () => NOW });
    expect((await reader.read(null, live)).candidates[0]!.cap.maxUsd).toBe(0);
  });
});

const candle = (i: number, close: number): Candle => ({ startMs: NOW - (72 - i) * HOUR, open: close, high: close, low: close, close, volume: 1, confirmed: true });
const series = (f: (i: number) => number): Candle[] => Array.from({ length: 72 }, (_, i) => candle(i, f(i)));

describe("the market context", () => {
  test("BTC and ETH in a day, the trend, the volatility", async () => {
    const reader = createMarketContext({
      candles: async (instId) => (instId === "BTC-USDT" ? series((i) => (i < 47 ? 100 : 100 + (i - 46) * 0.2)) : series(() => 50)),
      systemOne: () => null,
      now: () => NOW,
    });
    await reader.refresh(live);
    const c = reader.get()!;
    expect(c.btc_24h).toBeGreaterThan(4);
    expect(c.eth_24h).toBe(0);
    expect(c.tendencia).toBe("alta");
    expect(typeof c.vol_btc).toBe("string");
    expect(c.s1_escolha).toBeNull();
  });

  test("a quiet market is lateral", async () => {
    const reader = createMarketContext({ candles: async () => series((i) => 100 + Math.sin(i) * 0.1), systemOne: () => null, now: () => NOW });
    await reader.refresh(live);
    expect(reader.get()!.tendencia).toBe("lateral");
  });

  test("a fresh System One reading rides along as codes; a stale one does not", async () => {
    const view = (ageMin: number) => ({ completedAtMs: NOW - ageMin * 60_000, decision: { choice: "long-3x" }, brief: { quant: { sigma: { regime: "stressed" } } } });
    const fresh = createMarketContext({ candles: async () => null, systemOne: () => view(5), now: () => NOW });
    await fresh.refresh(live);
    expect(fresh.get()).toMatchObject({ s1_escolha: "comprado", s1_regime: "estressada", s1_idade_min: 5 });
    const stale = createMarketContext({ candles: async () => null, systemOne: () => view(90), now: () => NOW });
    await stale.refresh(live);
    expect(stale.get()).toBeNull();
  });

  test("System One holding is a code, not a free text", async () => {
    const reader = createMarketContext({ candles: async () => null, systemOne: () => ({ completedAtMs: NOW, decision: { choice: "hold" }, brief: {} }), now: () => NOW });
    await reader.refresh(live);
    expect(reader.get()!.s1_escolha).toBe("manter");
  });

  test("the leverage in the market: funding at once, the change of the open interest once an hour of samples exists", async () => {
    let clock = NOW;
    let oi = 1_000_000_000;
    const reader = createMarketContext({
      candles: async () => null,
      systemOne: () => null,
      now: () => clock,
      derivatives: { funding: async () => 0.0003, openInterestUsd: async () => oi },
    });
    await reader.refresh(live);
    // the first look: the funding is there, the change of the open interest is not (one sample says nothing about an hour)
    expect(reader.get()).toMatchObject({ fund_btc_bps: 3, oi_btc_1h: null });
    clock += 3_600_000;
    oi = 1_050_000_000;
    await reader.refresh(live);
    expect(reader.get()).toMatchObject({ fund_btc_bps: 3, oi_btc_1h: 5 });
  });

  test("a funding or an open interest that cannot be read is null, never zero", async () => {
    const reader = createMarketContext({ candles: async () => null, systemOne: () => null, now: () => NOW, derivatives: { funding: async () => null, openInterestUsd: async () => { throw new Error("down"); } } });
    await reader.refresh(live);
    expect(reader.get()).toBeNull();
    const odd = createMarketContext({ candles: async () => null, systemOne: () => null, now: () => NOW, derivatives: { funding: async () => Number.NaN, openInterestUsd: async () => -5 } });
    await odd.refresh(live);
    expect(odd.get()).toBeNull();
  });

  test("the exchange's public endpoints are read as documented, and anything else is null", async () => {
    const urls: string[] = [];
    const ok = (data: unknown) => new Response(JSON.stringify({ code: "0", data: [data] }));
    const reader = okxPublicDerivatives((async (url: string | Request | URL) => {
      urls.push(String(url));
      return String(url).includes("funding-rate") ? ok({ fundingRate: "0.0001" }) : ok({ oiUsd: "123456789.5" });
    }) as unknown as typeof fetch);
    expect(await reader.funding("BTC-USDT-SWAP", live)).toBe(0.0001);
    expect(await reader.openInterestUsd("BTC-USDT-SWAP", live)).toBe(123456789.5);
    expect(urls[0]).toBe("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP");
    expect(urls[1]).toBe("https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP");
    expect(await reader.funding("btc; drop", live)).toBeNull();
    const broken = okxPublicDerivatives((async () => new Response(JSON.stringify({ code: "50011", data: [] }))) as unknown as typeof fetch);
    expect(await broken.funding("BTC-USDT-SWAP", live)).toBeNull();
    expect(await okxPublicDerivatives((async () => new Response("nope", { status: 500 })) as unknown as typeof fetch).openInterestUsd("BTC-USDT-SWAP", live)).toBeNull();
  });

  test("nothing known is no context", async () => {
    const reader = createMarketContext({ candles: async () => { throw new Error("down"); }, systemOne: () => "junk", now: () => NOW });
    await reader.refresh(live);
    expect(reader.get()).toBeNull();
  });
});

describe("the price at the end of a window", () => {
  const mark = (over: Partial<DecisionMark> = {}): DecisionMark => ({ kind: "decision", key: "k", cycleId: "c", atMs: NOW, mode: "sombra", side: "buy", candidateId: "buy:x", chainIndex: "1", address: TOKEN, symbol: "AAA", stance: "buy_third", usd: 100, entryPriceUsd: 2, costUsd: null, posture: "neutra", profile: "alvo_5", source: "modelo", families: [], triggers: [], wallet: "agente", ...over });
  const bars5 = (n: number, last = 4) => Array.from({ length: n }, (_, i) => ({ ts: NOW + i * 300_000, open: 1, high: 1, low: 1, close: i === last ? 9 : 1 + i, volume: 1, volumeUsd: 1, confirmed: true }));

  test("a window of up to an hour uses five-minute bars, a longer one hourly bars", async () => {
    const g = gatewayOf(() => ok(bars5(20)));
    const lookup = createPriceLookup({ gateway: g.gateway });
    await lookup(mark(), NOW + 15 * 60_000);
    await lookup(mark(), NOW + 4 * HOUR);
    expect(g.calls.map((c) => c.params.bar)).toEqual(["5m", "1H"]);
    expect(g.calls[0]!.params.limit).toBe("299");
  });

  test("the close of the last bar already closed at the end of the window", async () => {
    // bars start at NOW + i*5m; at NOW+25m the bar that started at NOW+20m has just closed (i = 4)
    const lookup = createPriceLookup({ gateway: gatewayOf(() => ok(bars5(20))).gateway });
    expect(await lookup(mark(), NOW + 25 * 60_000)).toBe(9);
  });

  test("a bar that has not closed yet gives no price", async () => {
    const lookup = createPriceLookup({ gateway: gatewayOf(() => ok(bars5(5).map((b) => ({ ...b, confirmed: false })))).gateway });
    expect(await lookup(mark(), NOW + 25 * 60_000)).toBeNull();
  });

  test("a hole in the history gives no price", async () => {
    const lookup = createPriceLookup({ gateway: gatewayOf(() => ok(bars5(3))).gateway });
    expect(await lookup(mark(), NOW + 60 * 60_000 - 1)).toBeNull();
  });

  test("a provider that fails gives no price", async () => {
    expect(await createPriceLookup({ gateway: gatewayOf(() => fail()).gateway })(mark(), NOW + 900_000)).toBeNull();
  });

  test("a thin token that did not trade for a while is priced by its last close: no trade means no move, and a missing bar is not a missing price", async () => {
    // the last bar (i = 3) started at NOW + 15m and closed at NOW + 20m; the window ends at NOW + 40m, twenty minutes of no trades later
    const lookup = createPriceLookup({ gateway: gatewayOf(() => ok(bars5(4, 3))).gateway });
    expect(await lookup(mark(), NOW + 40 * 60_000)).toBe(9);
    // but a silence of more than half an hour is a hole in the data, not a quiet market
    expect(await lookup(mark(), NOW + 55 * 60_000)).toBeNull();
  });

  test("one read of the candles of a token serves every window that ended after it, and a read made before the end of a window is not used for it", async () => {
    let clock = NOW + 3 * HOUR;
    const g = gatewayOf(() => ok(bars5(40, 9)));
    const lookup = createPriceLookup({ gateway: g.gateway, now: () => clock });
    await lookup(mark(), NOW + 15 * 60_000);
    await lookup(mark({ key: "other" }), NOW + 25 * 60_000);
    await lookup(mark({ key: "third" }), NOW + 35 * 60_000);
    expect(g.calls).toHaveLength(1);
    // another token is another read
    await lookup(mark({ address: "0x2222222222222222222222222222222222222222" }), NOW + 15 * 60_000);
    expect(g.calls).toHaveLength(2);
    // a window that ends after the read needs a newer one
    clock = NOW + 4 * HOUR;
    await lookup(mark(), NOW + 4 * HOUR + 5 * 60_000);
    expect(g.calls).toHaveLength(3);
    // and a failed read is never kept
    const failing = gatewayOf(() => fail());
    const again = createPriceLookup({ gateway: failing.gateway, now: () => clock });
    await again(mark(), NOW + 15 * 60_000);
    await again(mark(), NOW + 15 * 60_000);
    expect(failing.calls).toHaveLength(2);
  });
});

describe("the public candles", () => {
  const row = (ts: number, close: string, confirm = "1") => [String(ts), "1", "2", "0.5", close, "10", "10", "10", confirm];
  const fakeFetch = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  test("rows come newest first and go out oldest first, as numbers", async () => {
    const candles = await okxPublicCandles(fakeFetch({ code: "0", data: [row(3000, "3"), row(2000, "2"), row(1000, "1", "0")] }))("BTC-USDT", "1H", 3, live);
    expect(candles!.map((c) => c.startMs)).toEqual([1000, 2000, 3000]);
    expect(candles![0]).toMatchObject({ close: 1, confirmed: false });
    expect(candles![2]).toMatchObject({ open: 1, high: 2, low: 0.5, close: 3, volume: 10, confirmed: true });
  });

  test("an error code, a bad row, a bad symbol or a bad limit is null", async () => {
    expect(await okxPublicCandles(fakeFetch({ code: "51001", data: [] }))("BTC-USDT", "1H", 3, live)).toBeNull();
    expect(await okxPublicCandles(fakeFetch({ code: "0", data: [["x"]] }))("BTC-USDT", "1H", 3, live)).toBeNull();
    expect(await okxPublicCandles(fakeFetch({ code: "0", data: [row(1, "abc")] }))("BTC-USDT", "1H", 3, live)).toBeNull();
    expect(await okxPublicCandles(fakeFetch({}, false))("BTC-USDT", "1H", 3, live)).toBeNull();
    expect(await okxPublicCandles(fakeFetch({ code: "0", data: [] }))("btc usdt", "1H", 3, live)).toBeNull();
    expect(await okxPublicCandles(fakeFetch({ code: "0", data: [] }))("BTC-USDT", "1H", 0, live)).toBeNull();
  });
});

describe("the five-minute reader: what a token is doing right now", () => {
  const BAR = 5 * 60_000;
  const facts = { chainIndex: "501", address: "EZ7RFLpHv14NK8b6wQuRefLvspYTy1TFpj5756TKpump", candidateId: "token:501:EZ7RFLpHv14NK8b6wQuRefLvspYTy1TFpj5756TKpump" };
  // the provider's rows: ts, open, high, low, close, volume, confirmed; oldest first
  const rows = (closes: number[], lag = 1) => closes.map((close, i) => ({ ts: NOW - (lag + closes.length - 1 - i) * BAR, open: close, high: close * 1.002, low: close * 0.998, close, volume: 100, confirmed: true }));

  test("asks for the last two hours of five-minute bars and turns them into the facts of now", async () => {
    const g = gatewayOf(() => ok(rows([...Array.from({ length: 20 }, () => 100), 101, 103, 106])));
    const reader = createMomentumReader({ gateway: g.gateway, now: () => NOW });
    const m = await reader.read(facts, live);
    expect(g.calls).toEqual([{ route: "/onchain/candles", params: { chainIndex: "501", token: facts.address, bar: "5m", limit: "24" } }]);
    expect(m).toMatchObject({ bars: 23 });
    expect(m!.ret15mPct).toBeCloseTo(6, 6);
    expect(m!.marks).toContain("disparando");
  });

  test("cached five minutes, a failure remembered for one, and old or broken data is simply no data", async () => {
    const g = gatewayOf(() => ok(rows(Array.from({ length: 20 }, () => 100))));
    let now = NOW;
    const reader = createMomentumReader({ gateway: g.gateway, now: () => now });
    await reader.read(facts, live);
    now += 4 * 60_000;
    await reader.read(facts, live);
    expect(g.calls).toHaveLength(1);
    now += 2 * 60_000;
    await reader.read(facts, live);
    expect(g.calls).toHaveLength(2);

    const down = gatewayOf(() => fail());
    let t = NOW;
    const failing = createMomentumReader({ gateway: down.gateway, now: () => t });
    expect(await failing.read(facts, live)).toBeNull();
    t += 30_000;
    expect(await failing.read(facts, live)).toBeNull();
    expect(down.calls).toHaveLength(1);
    t += 40_000;
    await failing.read(facts, live);
    expect(down.calls).toHaveLength(2);

    const stale = gatewayOf(() => ok(rows(Array.from({ length: 20 }, () => 100), 8)));
    expect(await createMomentumReader({ gateway: stale.gateway, now: () => NOW }).read(facts, live)).toBeNull();
    expect(await createMomentumReader({ gateway: gatewayOf(() => ok("not rows")).gateway, now: () => NOW }).read(facts, live)).toBeNull();
  });

  test("an aborted read asks nothing", async () => {
    const g = gatewayOf(() => ok([]));
    const ac = new AbortController();
    ac.abort();
    expect(await createMomentumReader({ gateway: g.gateway, now: () => NOW }).read(facts, ac.signal)).toBeNull();
    expect(g.calls).toHaveLength(0);
  });
});

describe("the facts of a holding carry how fresh they are and what the last minutes did", () => {
  test("price-info windows of five minutes and one hour, the activity of the last five minutes, and the age of what was read", async () => {
    const g = gatewayOf((c) =>
      c.route === "/onchain/price-info"
        ? ok([{ price: 2, liquidityUsd: 80_000, change: { m5: -1.5, h1: 4.25, h4: 9, h24: 12 }, volume: { m5: 900, h1: 20_000, h24: 300_000 }, txs: { m5: 31, h1: 280, h24: 4000 }, tsMs: NOW - 90_000 }])
        : ok({ riskLevel: 1 }),
    );
    const reader = createHoldingFactsReader({ gateway: g.gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => NOW });
    const p = held();
    const f = (await reader.read(bookOf([p]), live))(p)!;
    expect(f).toMatchObject({ change5mPct: -1.5, change1hPct: 4.25, txs5m: 31, txs1h: 280, volume5mUsd: 900 });
    // the provider stamped its data 90 seconds before now
    expect(f.dataAgeMin).toBeCloseTo(1.5, 6);
  });

  test("what the gateway served from its own cache keeps its age: a two-hour old answer is two hours old, with or without a stamp of the provider, and the age is never reset by reading it", async () => {
    const stale = (data: unknown): InternalGatewayResult => ({ ok: true, data, meta: { tier: "premium", cachedAtMs: NOW - 7_200_000, ageMs: 7_200_000, stale: true, budget: { tier: "premium", used: 1, cap: null } }, sent: false });
    const g = gatewayOf((c) => (c.route === "/onchain/price-info" ? stale([{ price: 2, liquidityUsd: 80_000, change: { m5: 1, h1: 2, h24: 3 }, volume: { h24: 1 }, txs: { m5: 4 } }]) : ok({ riskLevel: 1 })));
    const reader = createHoldingFactsReader({ gateway: g.gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => NOW });
    const p = held();
    const f = (await reader.read(bookOf([p]), live))(p)!;
    expect(f.dataAgeMin).toBeGreaterThanOrEqual(120);
    // and one with a provider stamp older than the cache says takes the older of the two
    const both = gatewayOf((c) => (c.route === "/onchain/price-info" ? ok([{ price: 2, liquidityUsd: 80_000, change: { h24: 3 }, volume: { h24: 1 }, tsMs: NOW - 30 * 60_000 }]) : ok({ riskLevel: 1 })));
    const reader2 = createHoldingFactsReader({ gateway: both.gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => NOW });
    expect((await reader2.read(bookOf([p]), live))(p)!.dataAgeMin).toBeGreaterThanOrEqual(30);
  });

  test("a token the person could still act on is read every ten minutes, a dust position only every hour (the quota goes where the decisions are)", async () => {
    const g = gatewayOf((c) => (c.route === "/onchain/price-info" ? ok([{ price: 2, liquidityUsd: 80_000, change: { h24: 1 }, volume: { h24: 1 }, tsMs: NOW }]) : ok({ riskLevel: 1 })));
    let now = NOW;
    const reader = createHoldingFactsReader({ gateway: g.gateway, plans: createPlanStore({ read: () => null, write: () => {} }), now: () => now });
    const big = held({ usd: 60 });
    const dust = held({ id: "token:1:dust", address: EVM2, usd: 6 });
    const read = () => reader.read(bookOf([big, dust]), live);
    await read();
    const first = g.calls.filter((c) => c.route === "/onchain/price-info").length;
    expect(first).toBe(2);
    now += 11 * 60_000;
    await read();
    const afterTen = g.calls.filter((c) => c.route === "/onchain/price-info");
    expect(afterTen).toHaveLength(3);
    expect(afterTen[2]!.params.token).toBe(TOKEN);
    now += 50 * 60_000;
    await read();
    expect(g.calls.filter((c) => c.route === "/onchain/price-info" && c.params.token === EVM2)).toHaveLength(2);
  });
});
