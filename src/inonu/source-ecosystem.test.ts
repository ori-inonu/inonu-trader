// RAS-8: the ecosystem mode of "Pedir ao Inonu" ("as melhores oportunidades"). One click reads several networks through the gateway with the intent of a click, never more than 15 calls, and puts in
// front of the model only the tokens that have support, with facts, marks of care and the ceiling of what the balance allows. The model is not involved here at all. origin: synthetic_fixture,
// tests only; the gateway is fake and the provider is never reached.
import { describe, expect, test } from "bun:test";
import { buildBrief } from "../intel/brief";
import type { InternalGatewayResult } from "../onchain-read/gateway";
import { parseSaldo, validateEcosystem, type EcoFacts } from "../opportunity/ecosystem";
import { SourceError, type AskRequest } from "./ask";
import { createJevInonuModel } from "./jev-model";
import { chainsFor, createEcosystemSource, diversifyRan, ECOSYSTEM_BRIEF_BYTES, ECOSYSTEM_CANDIDATES, RAN_PCT } from "./source-ecosystem";

const NOW = 1_800_000_000_000;
const META = { tier: "basic" as const, cachedAtMs: NOW - 4_000, ageMs: 4_000, stale: false, budget: { tier: "basic" as const, used: 1, cap: 50 } };

/** A token that has everything in its favour, unless the overrides take it away. */
const hot = (chainIndex: string, symbol: string, address: string, over: Record<string, unknown> = {}) => ({
  chainIndex, symbol, address, price: 0.5, marketCap: 8_000_000, volumeUsd: 2_500_000, changePct: 9, liquidityUsd: 900_000, holders: 4_000, uniqueTraders: 900,
  txsBuy: 700, txsSell: 300, inflowUsd: 50_000, riskLevel: 1, top10HoldPct: 20, devHoldPct: 1, bundleHoldPct: 2, firstTradeMs: NOW - 86_400_000 * 20, ...over,
});
const signal = (chainIndex: string, address: string, symbol: string, walletCount: number, amountUsd: number, soldRatioPct: number | null) => ({
  tsMs: NOW - 60_000, chainIndex, walletType: "smart_money", walletCount, amountUsd, priceUsd: 0.5, soldRatioPct, token: { address, symbol, marketCap: 8_000_000, holders: 4_000, top10HoldPct: 20 },
});

const EVM_A = "0x00000000000000000000000000000000000000a1";
const EVM_B = "0x00000000000000000000000000000000000000b2";
const EVM_C = "0x00000000000000000000000000000000000000c3";
const EVM_D = "0x00000000000000000000000000000000000000d4";
const SOL_A = "So11111111111111111111111111111111111111112";

const HOT: Record<string, unknown[]> = {
  "8453": [hot("8453", "AAA", EVM_A), hot("8453", "BBB", EVM_B, { top10HoldPct: 61, devHoldPct: 14 }), hot("8453", "WEAK", EVM_C, { changePct: 0.5, txsBuy: 10, txsSell: 20, top10HoldPct: 70, riskLevel: 3 }), hot("8453", "THIN", EVM_D, { liquidityUsd: 9_000 })],
  "501": [hot("501", "SOLX", SOL_A, { liquidityUsd: 400_000 })],
  "56": [hot("56", "BNBX", "0x00000000000000000000000000000000000000e5")],
};
const SIGNALS: Record<string, unknown[]> = {
  "8453": [signal("8453", EVM_A, "AAA", 5, 30_000, 10), signal("8453", EVM_B, "BBB", 3, 9_000, 20)],
  "501": [signal("501", SOL_A, "SOLX", 4, 12_000, 15)],
  "56": [],
};

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
      if (route === "/onchain/hot-tokens") return ok(HOT[params.chainIndex!] ?? []);
      if (route === "/onchain/signals") return ok(SIGNALS[params.chainIndex!] ?? []);
      if (route === "/onchain/token-risk") return ok({ chainIndex: params.chainIndex, address: params.token, riskLevel: 1, tags: [], top10HoldPct: 20, devHoldPct: 1, bundleHoldPct: 2, sniperHoldPct: 1, suspiciousHoldPct: 0 });
      return { ok: false, error: "bad_request", sent: false };
    },
  };
  return { gateway, calls };
}

const SALDO = parseSaldo({
  observedAtMs: NOW - 2_000, totalUsd: 24_680, cashUsd: 6_148, chains: [{ chainIndex: "8453", cashUsd: 4_137 }, { chainIndex: "501", cashUsd: 2_011 }], holdings: [{ chainIndex: "8453", address: EVM_A, usd: 90 }], riskPct: null,
})!;
const request = (over: Partial<AskRequest> = {}): AskRequest => ({ modo: "ecossistema", saldo: SALDO, ...over });
const context = (max = 15, signal = new AbortController().signal) => ({ signal, maxOnchainosCalls: max });
const build = (gateway: ReturnType<typeof fakeGateway>["gateway"], req: AskRequest = request(), ctx = context()) => createEcosystemSource({ gateway, now: () => NOW }).build(req, ctx);
const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof SourceError) return error.code;
    throw error;
  }
  return "no_error";
};

test("RAD-03: fresh hot does not hide stale signals/risk and each chain keeps its own source metadata", async () => {
  const { gateway, calls } = fakeGateway({ answer: (route, params) => {
    if (route === "/onchain/hot-tokens") return { ok: true, sent: true, data: HOT[params.chainIndex!] ?? [], meta: { ...META, ageMs: params.chainIndex === "501" ? 8_000 : 100, cachedAtMs: NOW - (params.chainIndex === "501" ? 8_000 : 100) } };
    if (route === "/onchain/signals") return { ok: true, sent: true, data: SIGNALS[params.chainIndex!] ?? [], meta: { ...META, ageMs: 380_000, cachedAtMs: NOW - 380_000, stale: true } };
    if (route === "/onchain/token-risk") return { ok: true, sent: true, data: { chainIndex: params.chainIndex, address: params.token, riskLevel: 1, tags: [] }, meta: { ...META, ageMs: 420_000, cachedAtMs: NOW - 420_000, stale: true } };
    return undefined;
  } });
  const result = await build(gateway);
  const eco = result.brief.fluxo!.ecossistema as any;
  expect(eco.fontes).toEqual({ origem: "onchainos", redes: { "8453": [[100, false, "4"], [380_000, true]], "501": [[8_000, false, "4"], [380_000, true]] } });
  for (const candidate of result.ecosystem!.candidates) expect(eco.itens[candidate.facts.candidateId].q).toEqual([420_000, true]);
  expect(eco.chaves.q).toContain("token-risk");
  expect(eco.chaves.fontes).toMatch(/ageMs.*stale.*timeFrame/);
  expect(calls.length).toBeLessThanOrEqual(15);
  expect(result.onchainosCalls).toBe(calls.length);
  expect(new TextEncoder().encode(JSON.stringify(result.brief)).length).toBeLessThanOrEqual(ECOSYSTEM_BRIEF_BYTES);
});

test("RAD-03: unavailable or unknown source ages remain null, never zero or fresh", async () => {
  const { gateway } = fakeGateway({ answer: (route, params) => {
    if (route === "/onchain/hot-tokens") return { ok: true, sent: true, data: HOT[params.chainIndex!] ?? [], meta: { ...META, ageMs: Number.NaN } };
    if (route === "/onchain/signals" || route === "/onchain/token-risk") return { ok: false, sent: true, error: "provider_error" };
    return undefined;
  } });
  const result = await build(gateway, { modo: "ecossistema", redes: ["8453"] });
  const eco = result.brief.fluxo!.ecossistema as any;
  expect(eco.fontes.redes["8453"]).toEqual([[null, false, "4"], null]);
  expect(result.brief.idades).not.toHaveProperty("hot-tokens");
  for (const candidate of result.ecosystem!.candidates) expect(eco.itens[candidate.facts.candidateId].q).toBeNull();
  expect(result.brief.nulos.signals).toBeDefined();
  expect(result.brief.nulos.risco_nao_conferido).toBeDefined();
});

test("RAD-03: five valid candidates on four networks keep source metadata and identities within the unchanged Brief allowance", async () => {
  const { gateway, calls } = fakeGateway({ answer: (route, params) => {
    if (route !== "/onchain/hot-tokens") return undefined;
    const chain = params.chainIndex!;
    return { ok: true, sent: true, meta: META, data: [hot(chain, "LONGSYMBOLTWENTYABCD", chain === "501" ? SOL_A : EVM_A), hot(chain, "SECONDTOKEN", chain === "501" ? "So11111111111111111111111111111111111111113" : EVM_B)] };
  } });
  const result = await build(gateway, { modo: "ecossistema", redes: ["501", "8453", "56", "1"] });
  const eco = result.brief.fluxo!.ecossistema as any;
  expect(result.candidates).toHaveLength(5);
  expect(result.ecosystem!.candidates).toHaveLength(5);
  expect(Object.keys(eco.itens)).toEqual(result.candidates.map((candidate) => candidate.id));
  expect(Object.keys(eco.fontes.redes).sort()).toEqual(["1", "501", "56", "8453"]);
  for (const candidate of result.ecosystem!.candidates) {
    expect(eco.itens[candidate.facts.candidateId].q).toEqual([4_000, false]);
    expect(eco.itens[candidate.facts.candidateId].f).toEqual(candidate.families);
    expect(eco.itens[candidate.facts.candidateId].s).toBe(candidate.facts.symbol);
  }
  expect(calls).toHaveLength(14);
  expect(new TextEncoder().encode(JSON.stringify(result.brief)).length).toBeLessThanOrEqual(ECOSYSTEM_BRIEF_BYTES);
});

test("RAD-01/03, SEQ-02: public source-to-model-to-validator seams retain stale context and a Jev-prioritized watch without cash", async () => {
  const { gateway } = fakeGateway({ answer: (route, params) => route === "/onchain/signals" ? { ok: true, sent: true, data: SIGNALS[params.chainIndex!] ?? [], meta: { ...META, ageMs: 350_000, stale: true } } : undefined });
  const built = await build(gateway, { modo: "ecossistema", redes: ["8453"] });
  const ids = built.candidates.map((candidate) => candidate.id);
  let evaluations = 0;
  const controller = new AbortController();
  const model = createJevInonuModel({
    apiKey: () => "synthetic-key",
    createProvider: () => ({ evaluationModel: () => ({}) as never }),
    evaluate: (async (call: any) => {
      evaluations += 1;
      expect(call.abortSignal).toBe(controller.signal);
      expect(call.maxRetries).toBe(0);
      if (evaluations === 2) {
        expect(call.state.brief).toBe(built.brief);
        expect(call.state.brief.fluxo.ecossistema.fontes.redes["8453"][1]).toEqual([350_000, true]);
        expect(call.state.decisions.stances[ids[0]!]).toBe("watch");
        expect(Object.keys(call.questions.priority.criteria)).toEqual(["none", ids[0]!]);
        return { answers: { priority: { choice: ids[0]! } } };
      }
      expect(call.state).toBe(built.brief);
      expect(call.state.fluxo.ecossistema.fontes.redes["8453"][1]).toEqual([350_000, true]);
      expect(call.questions).not.toHaveProperty("place_1");
      const answers: Record<string, { choice: string }> = {};
      ids.forEach((id, index) => {
        expect(Object.keys(call.questions[`stance_${index}`].criteria)).toEqual(["skip", "watch"]);
        answers[`stance_${index}`] = { choice: index === 0 ? "watch" : "skip" };
        answers[`why_${index}`] = { choice: index === 0 ? "fluxo" : "nenhuma" };
      });
      return { answers };
    }) as never,
  });
  const output = await model.choose({ brief: built.brief, ids, mode: "ecossistema", signal: controller.signal });
  const verdict = validateEcosystem(output.raw, built.ecosystem!);
  expect(evaluations).toBe(2);
  if (!verdict.ok) throw new Error(verdict.reason);
  expect(verdict.result.picks).toEqual([]);
  expect(verdict.result.decisions).toHaveLength(ids.length);
  expect(verdict.result.decisions![0]).toMatchObject({ candidateId: ids[0], stance: "watch", rank: 1, driver: "fluxo" });
  expect(verdict.result.decisions!.slice(1).every((decision) => decision.stance === "skip" && decision.rank === null)).toBe(true);
});

describe("which networks are read", () => {
  test("the person's choice first, else the networks where the balance holds cash (most cash first), else the usual four", () => {
    expect(chainsFor({ modo: "ecossistema", redes: ["56", "1"] })).toEqual(["56", "1"]);
    expect(chainsFor(request())).toEqual(["8453", "501"]);
    expect(chainsFor({ modo: "ecossistema" })).toEqual(["501", "8453", "56", "1"]);
    // a network with no cash is not worth reading for a purchase, and the cap is four
    expect(chainsFor({ modo: "ecossistema", saldo: parseSaldo({ ...SALDO, chains: [{ chainIndex: "1", cashUsd: 0 }, { chainIndex: "56", cashUsd: 9 }], cashUsd: 9 })! })).toEqual(["56"]);
    expect(chainsFor({ modo: "ecossistema", redes: ["1", "56", "137", "8453"] })).toHaveLength(4);
  });
});

describe("what one click reads", () => {
  test("the hot list and the tracked wallets of each network, with the same parameters the Radar uses and the intent of a click, then the risk of the best", async () => {
    const { gateway, calls } = fakeGateway();
    await build(gateway);
    expect(calls.slice(0, 4).map((c) => `${c.route}:${c.params.chainIndex}`)).toEqual(["/onchain/hot-tokens:8453", "/onchain/signals:8453", "/onchain/hot-tokens:501", "/onchain/signals:501"]);
    expect(calls[0]!.params).toEqual({ chainIndex: "8453", timeFrame: "4", limit: "100" });
    expect(calls[1]!.params).toEqual({ chainIndex: "8453", walletType: "1,2,3", limit: "100" });
    expect(calls.every((c) => c.intent === "user")).toBe(true);
    expect(calls.filter((c) => c.route === "/onchain/token-risk").length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(15);
  });

  test("never more than the cap of the click, and a short cap reads fewer networks and says which were left out", async () => {
    const { gateway, calls } = fakeGateway();
    const built = await build(gateway, request({ redes: ["8453", "501", "56"] }), context(4));
    expect(calls).toHaveLength(4);
    expect(calls.some((c) => c.route === "/onchain/token-risk")).toBe(false);
    expect(built.brief.nulos.redes_sem_leitura).toBe("56");
    expect(built.brief.nulos.risco_nao_conferido).toBeDefined();
    const eco = built.brief.fluxo!.ecossistema as any;
    for (const item of Object.values(eco.itens) as any[]) expect(item.q).toBeNull();
  });

  test("a cancel stops the reads", async () => {
    const controller = new AbortController();
    const { gateway, calls } = fakeGateway({ answer: () => (controller.abort(), undefined) });
    expect(await codeOf(build(gateway, request(), context(15, controller.signal)))).toBe("cancelado");
    expect(calls.length).toBeLessThan(15);
  });
});

describe("who is offered to the model", () => {
  test("only tokens with a pool people can leave, enough holders and at least two families of evidence, the best first, each with its ceiling", async () => {
    const built = await build(fakeGateway().gateway);
    const ids = built.candidates.map((c) => c.id);
    expect(ids).toContain(`token:8453:${EVM_A}`);
    expect(ids).toContain(`token:501:${SOL_A}`);
    // WEAK has one family, THIN has a tiny pool: neither is offered
    expect(ids.some((id) => id.includes(EVM_C) || id.includes(EVM_D))).toBe(false);
    expect(ids.length).toBeLessThanOrEqual(ECOSYSTEM_CANDIDATES);
    const eco = built.ecosystem!;
    expect(eco.candidates.map((c) => c.facts.symbol)).toContain("AAA");
    expect(eco.excluded).toMatchObject({ pool_ou_detentores: 1, pouco_apoio: 1 });
    const a = eco.candidates.find((c) => c.facts.symbol === "AAA")!;
    // 1% of 24,680 over a loss of 0.5, minus the 90 already held
    expect(a.cap).toMatchObject({ binding: "risco" });
    expect(a.cap.maxUsd).toBe(Math.floor((0.01 / 0.5) * 24_680 - 90));
    expect(a.heldUsd).toBe(90);
    expect(a.families.length).toBeGreaterThanOrEqual(2);
  });

  test("a caller that asks for a wider pool (the agent does) gets more candidates and the risk of more of them, inside the same cap of calls; the click keeps its five", async () => {
    // eleven tokens with everything in their favour on one network
    const many = Array.from({ length: 11 }, (_, i) => hot("501", `T${i}`, `So1111111111111111111111111111111111111${String(i).padStart(4, "0")}`, { liquidityUsd: 900_000 - i * 10_000 }));
    const answer = (route: string, params: Readonly<Record<string, string>>): InternalGatewayResult | undefined => (route === "/onchain/hot-tokens" && params.chainIndex === "501" ? { ok: true, data: many, meta: META, sent: true } : undefined);
    const click = await build(fakeGateway({ answer }).gateway, request({ redes: ["501"] }));
    expect(click.ecosystem!.candidates.length).toBe(ECOSYSTEM_CANDIDATES);
    const g = fakeGateway({ answer });
    const wide = await createEcosystemSource({ gateway: g.gateway, now: () => NOW }).build(request({ redes: ["501"] }), { signal: new AbortController().signal, maxOnchainosCalls: 15, candidates: 10 });
    expect(wide.ecosystem!.candidates.length).toBe(10);
    // the risk of the best twelve at most, and never more than the cap of the click: 2 reads for the network and the rest for risk
    const risk = g.calls.filter((c) => c.route === "/onchain/token-risk").length;
    expect(risk).toBeGreaterThan(6);
    expect(g.calls.length).toBeLessThanOrEqual(15);
    // an absurd ask is bounded
    const absurd = await createEcosystemSource({ gateway: fakeGateway({ answer }).gateway, now: () => NOW }).build(request({ redes: ["501"] }), { signal: new AbortController().signal, maxOnchainosCalls: 15, candidates: 500 });
    expect(absurd.ecosystem!.candidates.length).toBeLessThanOrEqual(12);
  });

  test("a token with a mark of care has a smaller ceiling than the same token without it", async () => {
    const built = await build(fakeGateway().gateway);
    const marked = built.ecosystem!.candidates.find((c) => c.facts.symbol === "BBB");
    const clean = built.ecosystem!.candidates.find((c) => c.facts.symbol === "AAA")!;
    expect(marked?.marks.length).toBeGreaterThan(0);
    if (marked !== undefined) expect(marked.cap.maxUsd).toBeLessThan(clean.cap.maxUsd);
  });

  test("a honeypot is never offered, and the Brief counts what was left out", async () => {
    const { gateway } = fakeGateway({ answer: (route, params) => (route === "/onchain/token-risk" && params.token === EVM_A ? { ok: true, data: { riskLevel: 5, tags: ["honeypot"] }, meta: META, sent: true } : undefined) });
    const built = await build(gateway);
    expect(built.candidates.some((c) => c.id.includes(EVM_A))).toBe(false);
    expect(built.ecosystem!.excluded.honeypot).toBe(1);
  });

  test("a risk read that fails leaves the token offered, marked as not checked", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/token-risk" ? { ok: false, error: "provider_error", sent: true } : undefined) });
    const built = await build(gateway);
    expect(built.candidates.length).toBeGreaterThan(0);
    expect(built.candidates.every((c) => c.estado === "risco_nao_conferido")).toBe(true);
    expect(Number(built.brief.nulos.risco_nao_conferido)).toBeGreaterThan(0);
  });

  test("warning tags from token-risk are kept ahead of alphabetical bullish tags, and an unchecked tail token cannot claim seguranca to leapfrog checked tokens", async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      hot("501", `T${i}`, `So1111111111111111111111111111111111111${String(i).padStart(4, "0")}`, {
        volumeUsd: 50_000,
        changePct: 2,
        txsBuy: 50,
        txsSell: 50,
        liquidityUsd: 400_000,
        top10HoldPct: 20,
        devHoldPct: 1,
        bundleHoldPct: 1,
      }),
    );
    const { gateway } = fakeGateway({
      answer: (route, params) => {
        if (route === "/onchain/hot-tokens" && params.chainIndex === "501") return { ok: true, data: many, meta: META, sent: true };
        if (route === "/onchain/token-risk") {
          return {
            ok: true,
            data: { chainIndex: "501", address: params.token, riskLevel: 1, tags: ["communityRecognized", "devAddLiquidity", "dexBoost", "lowLiquidity"], devRugCount: 1 },
            meta: META,
            sent: true,
          };
        }
        return undefined;
      },
    });
    const built = await build(gateway, request({ redes: ["501"] }), context(6));
    for (const c of built.ecosystem!.candidates) {
      expect(c.families).not.toContain("seguranca");
    }
    const checkedOne = built.ecosystem!.candidates[0]!;
    expect(checkedOne.marks).toContain("sinal_de_risco");
  });

  test("across scanned markets, a smart-money discount distortion (price below smart-money entry while wallets hold) ranks ahead of an overextended +5000% exit-liquidity token", async () => {
    const discountMint = "So1111111111111111111111111111111111111DISC";
    const exhaustedMint = "So1111111111111111111111111111111111111EXHA";
    const { gateway } = fakeGateway({
      answer: (route, params) => {
        if (route === "/onchain/hot-tokens" && params.chainIndex === "501") {
          return {
            ok: true,
            meta: META,
            sent: true,
            data: [
              // Exhausted token: up +5800%, trading at $3.80 while smart money paid $1.00 (3.8x above smart money)
              hot("501", "EXHA", exhaustedMint, { price: 3.8, changePct: 5800, liquidityUsd: 300_000, volumeUsd: 900_000 }),
              // Discounted token: pulled back -1.5% in 24h, trading at $0.88 while smart money paid $1.00 (-12% discount) with 0% sold
              hot("501", "DISC", discountMint, { price: 0.88, changePct: -1.5, liquidityUsd: 400_000, volumeUsd: 500_000 }),
            ],
          };
        }
        if (route === "/onchain/signals" && params.chainIndex === "501") {
          return {
            ok: true,
            meta: META,
            sent: true,
            data: [
              { ...signal("501", exhaustedMint, "EXHA", 5, 20_000, 10), priceUsd: 1.0 },
              { ...signal("501", discountMint, "DISC", 5, 25_000, 0), priceUsd: 1.0 },
            ],
          };
        }
        return undefined;
      },
    });
    const built = await build(gateway, request({ redes: ["501"] }));
    expect(built.ecosystem!.candidates.map((c) => c.facts.symbol)).toEqual(["DISC", "EXHA"]);
  });
});

describe("the Brief the model reads", () => {
  test("is about the ecosystem, fits its allowance, and carries percentages of the balance, never the balance and never a wallet", async () => {
    const built = await build(fakeGateway().gateway);
    const json = JSON.stringify(built.brief);
    expect(built.brief.alvo).toEqual({ escopo: "ecossistema", chainIndexes: ["8453", "501"] });
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(ECOSYSTEM_BRIEF_BYTES);
    // the dollars of the balance stay on this machine
    for (const secret of ["24680", "6148", "4137", "2011"]) expect(json).not.toContain(secret);
    expect(json).not.toMatch(/0x[0-9a-f]{40}.*0x[0-9a-f]{40}.*wallet/i);
    const eco = (built.brief.fluxo as { ecossistema: { caixaPct: number; itens: Record<string, { x: number | null; y: number | null; f: string[]; s: string }>; chaves: Record<string, string> } }).ecossistema;
    expect(eco.caixaPct).toBe(25);
    const item = eco.itens[`token:8453:${EVM_A}`]!;
    expect(item.s).toBe("AAA");
    expect(item.x).toBeGreaterThan(0);
    expect(item.y).toBeCloseTo(0.4, 1);
    expect(Object.keys(eco.chaves).length).toBeGreaterThan(10);
    expect(built.brief.nulos.regime).toBeDefined();
  });

  test("without a balance there is no size for anything, and the Brief says so", async () => {
    const built = await build(fakeGateway().gateway, { modo: "ecossistema", redes: ["8453"] });
    expect(built.ecosystem!.saldo).toBeNull();
    expect(built.ecosystem!.candidates.every((c) => c.cap.maxUsd === 0 && c.cap.binding === "sem_dado")).toBe(true);
    expect(built.brief.nulos.saldo).toBe("nao_lido:sem_tamanho");
    const eco = (built.brief.fluxo as { ecossistema: { caixaPct: number | null } }).ecossistema;
    expect(eco.caixaPct).toBeNull();
  });

  test("is the same Brief, byte for byte, for the same reads (no clock inside it but the one given)", async () => {
    const a = await build(fakeGateway().gateway);
    const b = await build(fakeGateway().gateway);
    expect(a.brief.hash).toBe(b.brief.hash);
    expect(buildBrief({ ...a.brief, candidatos: a.brief.candidatos }, { maxBytes: ECOSYSTEM_BRIEF_BYTES }).brief.hash).toBeDefined();
  });
});

describe("when there is nothing to choose among, the click is refused with a constant code before the model is asked", () => {
  test("no credential on any read", async () => {
    const { gateway } = fakeGateway({ answer: () => ({ ok: false, error: "no_credentials", sent: false }) });
    expect(await codeOf(build(gateway))).toBe("sem_credencial_onchainos");
  });

  test("no network answered", async () => {
    const { gateway } = fakeGateway({ answer: () => ({ ok: false, error: "provider_error", sent: true }) });
    expect(await codeOf(build(gateway))).toBe("sem_dados_onchain");
  });

  test("nothing has support", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/hot-tokens" ? { ok: true, data: [hot("8453", "WEAK", EVM_C, { changePct: 0.5, txsBuy: 10, txsSell: 20, top10HoldPct: 70, riskLevel: 3 })], meta: META, sent: true } : undefined) });
    expect(await codeOf(build(gateway))).toBe("sem_candidatos");
  });

  test("every candidate shows a honeypot sign", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/token-risk" ? { ok: true, data: { riskLevel: 5, tags: ["honeypot"] }, meta: META, sent: true } : undefined) });
    expect(await codeOf(build(gateway, request({ redes: ["8453"] })))).toBe("sem_candidatos");
  });

  test("the refusal says how many reads had already left", async () => {
    const { gateway } = fakeGateway({ answer: (route) => (route === "/onchain/token-risk" ? { ok: true, data: { tags: ["honeypot"] }, meta: META, sent: true } : undefined) });
    try {
      await build(gateway, request({ redes: ["8453"] }));
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError);
      expect((error as SourceError).onchainosCalls).toBeGreaterThanOrEqual(2);
    }
  });

  test("another mode is not served here", async () => {
    expect(await codeOf(createEcosystemSource({ gateway: fakeGateway().gateway, now: () => NOW }).build({ modo: "ativo" }, context()))).toBe("modo_nao_disponivel");
  });
});

// keeps the type of the facts in the test file honest without a second import of the shape
const _shape: Partial<EcoFacts> = {};
void _shape;

describe("the pool is not only what already ran: the model sees the tokens that are still early beside the ones that took off", () => {
  const item = (id: string, changePct: number | null) => ({ id, facts: { changePct } });
  const ids = (list: readonly { id: string }[]) => list.map((e) => e.id);
  // ranked by evidence: the ones that ran in a day have the most traction, so they sit on top
  const ranked = [item("r1", 400), item("r2", 120), item("r3", 60), item("r4", 45), item("e1", 5), item("e2", -2), item("e3", 12), item("r5", 35), item("e4", null), item("e5", 0.5)];

  test("a quarter of the day is the line: a token up more than that ran, one under it, or of unknown change, is early", () => {
    expect(RAN_PCT).toBe(30);
  });

  test("at most half of what the model sees (and at least two) ran in the last day: the early ones take the places the ones that ran leave, and the evidence order is kept inside the selection", () => {
    const out = diversifyRan(ranked, 6);
    expect(ids(out)).toEqual(["r1", "r2", "r3", "e1", "e2", "e3"]);
    expect(diversifyRan(ranked, 4).map((e) => e.id)).toEqual(["r1", "r2", "e1", "e2"]);
    // never fewer than two of the ones that ran, so a market of one kind is not hidden
    expect(ids(diversifyRan(ranked, 2))).toEqual(["r1", "r2"]);
  });

  test("when there are not enough early ones the rest is filled with the ones that ran, still in their order, and nothing is dropped or repeated", () => {
    const mostlyRan = [item("r1", 90), item("r2", 80), item("r3", 70), item("e1", 3), item("r4", 60)];
    expect(ids(diversifyRan(mostlyRan, 4))).toEqual(["r1", "r2", "r3", "e1"]);
    const all = diversifyRan(ranked, 99);
    expect(ids(all).sort()).toEqual(ids(ranked).sort());
    expect(diversifyRan([], 5)).toEqual([]);
  });

  test("the head of the result is the selection and the tail is everything else in the original order, so the reads of risk go to the ones the model will see", () => {
    const out = ids(diversifyRan(ranked, 6, true));
    expect(out.slice(0, 6)).toEqual(["r1", "r2", "r3", "e1", "e2", "e3"]);
    expect(out.slice(6)).toEqual(["r4", "r5", "e4", "e5"]);
    // the input is not changed
    expect(ids(ranked)[0]).toBe("r1");
  });
});
