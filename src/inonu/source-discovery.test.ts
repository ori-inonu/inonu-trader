// ASK-12, F2-DIG-4, AC-ASK-7: the discovery mode of "Pedir ao Inonu" ("melhores entradas agora"). One click on one network: the hot list and
// the smart money signals first, then a look at risk, concentration and pools of the three best, all through the gateway with the
// intent of a click, never more than 15 calls, never anything before the click. The model is not involved here at all (it only chooses
// among the ids this source produced). origin: synthetic_fixture, tests only; the gateway is fake and the provider is never reached.
import { describe, expect, test } from "bun:test";
import { MAX_BRIEF_BYTES } from "../intel/brief";
import type { InternalGatewayResult } from "../onchain-read/gateway";
import { SourceError, type AskRequest } from "./ask";
import { createDiscoverySource } from "./source-discovery";

const NOW = 1_800_000_000_000;
const CHAIN = "501";
const META = { tier: "basic" as const, cachedAtMs: NOW - 4_000, ageMs: 4_000, stale: false, budget: { tier: "basic" as const, used: 1, cap: 50 } };

const hot = (symbol: string, address: string, liquidityUsd: number) => ({
  chainIndex: CHAIN, symbol, address, price: 1, marketCap: 2_000_000, volumeUsd: 400_000, changePct: 12, liquidityUsd, holders: 900,
  uniqueTraders: 300, txsBuy: 500, txsSell: 450, inflowUsd: 30_000, riskLevel: 2, top10HoldPct: 30, devHoldPct: 1, bundleHoldPct: 2, firstTradeMs: NOW - 86_400_000,
});
const signal = (address: string, symbol: string, walletCount: number, amountUsd: number, soldRatioPct: number | null) => ({
  tsMs: NOW - 60_000, chainIndex: CHAIN, walletType: "smart_money", walletCount, amountUsd, priceUsd: 1, soldRatioPct,
  token: { address, symbol, marketCap: 2_000_000, holders: 900, top10HoldPct: 30 },
});

const HOT = [hot("AAA", "AAA", 900_000), hot("BBB", "BBB", 300_000), hot("CCC", "CCC", 50_000), hot("DDD", "DDD", 600_000), hot("EEE", "EEE", 700_000)];
const SIGNALS = [
  signal("AAA", "AAA", 5, 20_000, 10), signal("AAA", "AAA", 3, 8_000, 20),
  signal("DDD", "DDD", 4, 9_000, 5),
  signal("BBB", "BBB", 2, 3_000, 60),
  signal("CCC", "CCC", 1, 500, 90),
];

interface Call {
  readonly route: string;
  readonly params: Readonly<Record<string, string>>;
  readonly intent: string;
}

function fakeGateway(over: { readonly answer?: (route: string, params: Readonly<Record<string, string>>) => InternalGatewayResult | undefined } = {}) {
  const calls: Call[] = [];
  const gateway = {
    async callInternal(route: string, params: Readonly<Record<string, string>>, intent: string): Promise<InternalGatewayResult> {
      calls.push({ route, params, intent });
      const custom = over.answer?.(route, params);
      if (custom !== undefined) return custom;
      const ok = (data: unknown): InternalGatewayResult => ({ ok: true, data, meta: META, sent: true });
      if (route === "/onchain/hot-tokens") return ok(HOT);
      if (route === "/onchain/signals") return ok(SIGNALS);
      if (route === "/onchain/token-risk") return ok({ chainIndex: CHAIN, address: params.token, riskLevel: 2, tags: [], top10HoldPct: 20, devHoldPct: 1, bundleHoldPct: 2, sniperHoldPct: 1, suspiciousHoldPct: 0, lpBurnedPct: 90, devRugCount: 0 });
      if (route === "/onchain/clusters") return ok({ concentration: "Low", top100HoldingsPct: 20, clusters: [] });
      if (route === "/onchain/pools") return ok([{ liquidityUsd: 400_000, pool: "p" }]);
      return { ok: false, error: "bad_request", sent: false };
    },
  };
  return { gateway, calls };
}

const request: AskRequest = { modo: "descoberta", alvo: { chainIndex: CHAIN } };
const context = (max = 15, signal = new AbortController().signal) => ({ signal, maxOnchainosCalls: max });
const build = (gateway: ReturnType<typeof fakeGateway>["gateway"], req: AskRequest = request, ctx = context()) => createDiscoverySource({ gateway, now: () => NOW }).build(req, ctx);
const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof SourceError) return error.code;
    throw error;
  }
  return "no_error";
};

describe("what one click reads", () => {
  test("the hot list and the signals first, then risk, concentration and pools of the three best, all with the intent of a click", async () => {
    const { gateway, calls } = fakeGateway();
    await build(gateway);
    expect(calls.slice(0, 2).map((c) => c.route)).toEqual(["/onchain/hot-tokens", "/onchain/signals"]);
    expect(calls[0]!.params).toEqual({ chainIndex: CHAIN, limit: "50" });
    expect(calls[1]!.params).toEqual({ chainIndex: CHAIN, limit: "50" });
    const deep = calls.slice(2);
    expect(deep.map((c) => c.route)).toEqual([...Array(3).fill("/onchain/token-risk"), ...Array(3).fill("/onchain/clusters"), ...Array(3).fill("/onchain/pools")]);
    // the three best by the trail, none of the weak ones (CCC has little money and most of it already sold)
    const leaders = deep.slice(0, 3).map((c) => c.params.token);
    expect(new Set(leaders)).toEqual(new Set(["AAA", "DDD", "BBB"]));
    expect(leaders).not.toContain("CCC");
    expect(calls.every((c) => c.intent === "user")).toBe(true);
    expect(calls.length).toBe(11); // 2 + 9: the address tracker, the trenches and the batch price are not callable today and are not tried
  });

  test("nothing is read by building the source: only a click reads", () => {
    const { gateway, calls } = fakeGateway();
    createDiscoverySource({ gateway, now: () => NOW });
    expect(calls).toHaveLength(0);
  });

  test("the calls that left are counted as they left, and never go over the cap of the request nor the cap of 15", async () => {
    const { gateway, calls } = fakeGateway();
    const built = await build(gateway);
    expect(built.onchainosCalls).toBe(calls.length);
    const small = fakeGateway();
    const cut = await build(small.gateway, request, context(4));
    expect(small.calls).toHaveLength(4);
    expect(cut.onchainosCalls).toBe(4);
    // the plan itself has only eleven readable items, so this cannot show the clamp of 15: it shows that a large allowance is not spent
    const huge = fakeGateway();
    await build(huge.gateway, request, context(500));
    expect(huge.calls.length).toBe(11);
  });

  test("a call the gateway answered from its cache does not count as spent", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/pools" ? { ok: true, data: [], meta: META, sent: false } : undefined) });
    const built = await build(gateway);
    expect(built.onchainosCalls).toBe(8); // 11 asked, the 3 pools came from the cache
  });
});

describe("the candidates and the Brief", () => {
  test("the model chooses among the tokens this source produced and holding, best first, and the Brief says it is about a network, not a token", async () => {
    const { gateway } = fakeGateway();
    const built = await build(gateway);
    const ids = built.candidates.map((c) => c.id);
    expect(ids[0]).toBe(`token:${CHAIN}:AAA`);
    expect(new Set(ids.slice(0, -1))).toEqual(new Set([`token:${CHAIN}:AAA`, `token:${CHAIN}:DDD`, `token:${CHAIN}:BBB`]));
    expect(ids.at(-1)).toBe("manter");
    for (const candidate of built.candidates.filter((c) => c.tipo === "token")) expect(typeof candidate.nota).toBe("number");
    expect(built.brief.alvo).toEqual({ chainIndex: CHAIN, escopo: "descoberta" });
    expect(built.brief.candidatos.map((c) => c.id)).toEqual(ids);
  });

  test("the Brief is under 2 KB, says where each reading came from and how old it is, and is the same for the same readings", async () => {
    const a = await build(fakeGateway().gateway);
    const b = await build(fakeGateway().gateway);
    expect(new TextEncoder().encode(JSON.stringify(a.brief)).length).toBeLessThanOrEqual(MAX_BRIEF_BYTES);
    expect(a.brief.hash).toBe(b.brief.hash);
    expect(a.brief.origens["hot-tokens"]).toBe("onchainos");
    expect(a.brief.origens.signals).toBe("onchainos");
    expect(a.brief.idades.signals).toBe(4_000);
  });

  test("it uses no word of an order, and no wallet address, URL or name of a person", async () => {
    const built = await build(fakeGateway().gateway);
    const json = JSON.stringify(built.brief);
    for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) {
      expect(new RegExp(`\\b${word}\\b`, "i").test(json)).toBe(false);
    }
    expect(json).not.toMatch(/https?:\/\//);
  });

  test("a token that shows a honeypot sign is never offered to the model, and the Brief counts what was left out", async () => {
    const { gateway } = fakeGateway({
      answer: (route, params) =>
        route === "/onchain/token-risk" && params.token === "DDD" ? { ok: true, data: { chainIndex: CHAIN, address: "DDD", riskLevel: 5, tags: ["honeypot"] }, meta: META, sent: true } : undefined,
    });
    const built = await build(gateway);
    expect(built.candidates.map((c) => c.id)).not.toContain(`token:${CHAIN}:DDD`);
    expect(built.brief.nulos.honeypot_excluidos).toBe("1");
  });

  test("a read that failed is a note in the Brief, never a zero, and the click goes on with what it has", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/hot-tokens" ? { ok: false, error: "budget_exhausted", sent: false } : undefined) });
    const built = await build(gateway);
    expect(built.brief.nulos["hot-tokens"]).toBe("nao_consultado:orcamento");
    expect(built.candidates.length).toBeGreaterThan(1);
  });

  test("a token whose risk was not read in the budget of the click says so instead of looking safe", async () => {
    const { gateway } = fakeGateway();
    const built = await build(gateway, request, context(3)); // hot, signals and one risk read only
    const unchecked = built.candidates.filter((c) => c.tipo === "token" && c.estado === "risco_nao_conferido");
    const checked = built.candidates.filter((c) => c.tipo === "token" && c.estado === "risco_conferido");
    expect(checked).toHaveLength(1);
    expect(unchecked.length).toBeGreaterThan(0);
  });
});

describe("when there is nothing to ask the model", () => {
  test("no signals on the network: refused before the model, with a constant code", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/signals" ? { ok: true, data: [], meta: META, sent: true } : undefined) });
    expect(await codeOf(build(gateway))).toBe("sem_sinais");
  });

  test("no credential: refused with its own code", async () => {
    const { gateway } = fakeGateway({ answer: () => ({ ok: false, error: "no_credentials", sent: false }) });
    expect(await codeOf(build(gateway))).toBe("sem_credencial_onchainos");
  });

  test("both first reads failed for another reason: refused as no data", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/hot-tokens" || route === "/onchain/signals" ? { ok: false, error: "provider_error", sent: true } : undefined) });
    expect(await codeOf(build(gateway))).toBe("sem_dados_onchain");
  });

  test("every token on the list shows a honeypot: nothing is left to offer", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/token-risk" ? { ok: true, data: { riskLevel: 5, tags: ["honeypot"] }, meta: META, sent: true } : undefined) });
    expect(await codeOf(build(gateway))).toBe("sem_candidatos");
  });
});

describe("what the source refuses", () => {
  test("another mode is not its business", async () => {
    expect(await codeOf(build(fakeGateway().gateway, { modo: "ativo", alvo: { instId: "BTC-USDT" } }))).toBe("modo_nao_disponivel");
  });

  test("a discovery needs a network and nothing else: a token, an instrument or a bad network is refused before any read", async () => {
    for (const alvo of [undefined, { instId: "BTC-USDT" }, { chainIndex: CHAIN, address: "AAA" }, { chainIndex: "x1" }, { chainIndex: "" }]) {
      const { gateway, calls } = fakeGateway();
      expect(await codeOf(build(gateway, { modo: "descoberta", ...(alvo === undefined ? {} : { alvo }) } as AskRequest))).toBe("alvo_invalido");
      expect(calls).toHaveLength(0);
    }
  });

  test("a click that was cancelled reads nothing more", async () => {
    const controller = new AbortController();
    controller.abort();
    const { gateway, calls } = fakeGateway();
    expect(await codeOf(build(gateway, request, context(15, controller.signal)))).toBe("cancelado");
    expect(calls).toHaveLength(0);
  });
});
