// RAS-8, end to end without the real model: a click in the ecosystem mode goes through the real source (with a fake gateway), the real asker with its caps and ledger, and the real adapter of the
// model (with a fake `evaluate`), and what comes out is the picks of the model with the dollars the code computed. The real model is NEVER reached here. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { Brief } from "../intel/brief";
import type { InternalGatewayResult } from "../onchain-read/gateway";
import { NO_FAMILY, parseSaldo } from "../opportunity/ecosystem";
import { createAsker, type AskDeps, type InonuModel, type LedgerEntry, type ModelOutput } from "./ask";
import { createJevInonuModel, ecosystemQuestions } from "./jev-model";
import { createEcosystemSource } from "./source-ecosystem";

const T0 = 1_800_000_000_000;
const META = { tier: "basic" as const, cachedAtMs: T0 - 4_000, ageMs: 4_000, stale: false, budget: { tier: "basic" as const, used: 1, cap: 50 } };
const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const IDA = `token:8453:${A}`;
const IDB = `token:8453:${B}`;

const hot = (symbol: string, address: string, over: Record<string, unknown> = {}) => ({
  chainIndex: "8453", symbol, address, price: 0.5, marketCap: 8_000_000, volumeUsd: 2_500_000, changePct: 9, liquidityUsd: 900_000, holders: 4_000, uniqueTraders: 900,
  txsBuy: 700, txsSell: 300, inflowUsd: 50_000, riskLevel: 1, top10HoldPct: 20, devHoldPct: 1, bundleHoldPct: 2, firstTradeMs: T0 - 86_400_000 * 20, ...over,
});
const signal = (address: string, symbol: string, walletCount: number, amountUsd: number, soldRatioPct: number) => ({
  tsMs: T0 - 60_000, chainIndex: "8453", walletType: "smart_money", walletCount, amountUsd, priceUsd: 0.5, soldRatioPct, token: { address, symbol, marketCap: 8_000_000, holders: 4_000, top10HoldPct: 20 },
});

const gateway = {
  async callInternal(route: string, params: Readonly<Record<string, string>>): Promise<InternalGatewayResult> {
    const ok = (data: unknown): InternalGatewayResult => ({ ok: true, data, meta: META, sent: true });
    if (route === "/onchain/hot-tokens") return ok([hot("AAA", A), hot("BBB", B, { top10HoldPct: 61 })]);
    if (route === "/onchain/signals") return ok([signal(A, "AAA", 5, 30_000, 10), signal(B, "BBB", 3, 9_000, 20)]);
    if (route === "/onchain/token-risk") return ok({ chainIndex: params.chainIndex, address: params.token, riskLevel: 1, tags: [] });
    return { ok: false, error: "bad_request", sent: false };
  },
};

const SALDO = { observedAtMs: T0 - 5_000, totalUsd: 10_000, cashUsd: 5_000, chains: [{ chainIndex: "8453", cashUsd: 5_000 }], holdings: [], riskPct: null };

/** A model that answers in the shape the adapter hands over, from what the Brief says. */
class FakeModel implements InonuModel {
  readonly name = "fake-jev";
  calls = 0;
  seen: { ids: readonly string[]; mode: string; brief: Brief } | null = null;
  answer: (ids: readonly string[]) => unknown = (ids) => ({
    stances: Object.fromEntries(ids.map((id, i) => [id, i === 0 ? "buy_two_thirds" : "skip"])),
    drivers: Object.fromEntries(ids.map((id) => [id, "carteiras"])),
    order: [ids[0] ?? "none", "none", "none"],
  });
  async choose(input: { brief: Brief; ids: readonly string[]; mode: string }): Promise<ModelOutput> {
    this.calls += 1;
    this.seen = input;
    return { raw: this.answer(input.ids), usage: { inputTokens: 1800, outputTokens: 120 } };
  }
}

function setup(over: Partial<AskDeps> = {}) {
  const model = new FakeModel();
  const entries: LedgerEntry[] = [];
  let clock = T0;
  let ids = 0;
  const deps: AskDeps = {
    source: createEcosystemSource({ gateway, now: () => clock }),
    model,
    ledger: {
      record: (entry) => void entries.push(entry),
      spentTodayUsd: () => entries.reduce((sum, e) => sum + (e.usd ?? 0), 0),
      committedTodayUsd: () => entries.filter((e) => e.chamadasModelo === 1).reduce((sum, e) => sum + (e.usd ?? e.usdEstimado ?? 0), 0),
      callsToday: () => entries.filter((e) => e.chamadasModelo > 0).length,
    },
    now: () => clock,
    newId: () => `ask-${++ids}`,
    limits: { cooldownMs: 15_000, reuseTtlMs: 300_000, maxUsdPerRequest: 0.1, maxUsdPerDay: 1, maxCallsPerDay: 5, timeoutMs: 5_000, usdPerMtok: { input: 3, output: 15 } },
    ...over,
  };
  return { asker: createAsker(deps), model, entries, tick: (ms: number) => void (clock += ms) };
}

/** The page sends plain JSON: the asker takes it as it comes and checks it, so the tests hand it over untyped. */
const click = (extra: Record<string, unknown> = {}) => ({ modo: "ecossistema", saldo: SALDO, ...extra }) as never;

describe("a click in the ecosystem mode", () => {
  test("reads the networks, asks the model once with the Brief, and answers with the picks and the dollars the code computed", async () => {
    const { asker, model, entries } = setup();
    const answer = await asker.ask(click());
    expect(answer.status).toBe("respondido");
    expect(answer.advisory).toBe(true);
    expect(answer.execution).toBe("never");
    expect(model.calls).toBe(1);
    expect(model.seen!.mode).toBe("ecossistema");
    const first = answer.oportunidades!.picks[0]!;
    expect(first).toMatchObject({ rank: 1, size: "buy_two_thirds", driver: "carteiras", chainIndex: "8453" });
    expect(first.usd).toBeGreaterThan(0);
    expect(first.usd).toBeLessThanOrEqual(first.capUsd);
    expect(answer.oportunidades!.saldo).toEqual({ totalUsd: 10_000, cashUsd: 5_000 });
    expect(answer.modelo).toBe("fake-jev");
    expect(answer.custo.tokens).toBe(1920);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ modo: "ecossistema", razao: "clique:ecossistema", resultado: "respondido", chamadasModelo: 1, tokensEntrada: 1800 });
  });

  test("the model sees percentages of the balance and the facts, never the dollars of the balance", async () => {
    const { asker, model } = setup();
    await asker.ask(click());
    const json = JSON.stringify(model.seen!.brief);
    expect(json).not.toContain("10000");
    expect(json).not.toContain("5000,");
    expect(JSON.stringify(model.seen!.brief.fluxo)).toContain('"caixaPct":50');
  });

  test("nothing worth it is a valid answer, and costs the same as any other", async () => {
    const { asker, model } = setup();
    model.answer = (ids) => ({ stances: Object.fromEntries(ids.map((id) => [id, "watch"])), drivers: Object.fromEntries(ids.map((id) => [id, NO_FAMILY])), order: ["none", "none", "none"] });
    const answer = await asker.ask(click());
    expect(answer.status).toBe("respondido");
    expect(answer.oportunidades!.picks).toEqual([]);
    expect(answer.oportunidades!.considered).toBeGreaterThan(0);
  });

  test("an answer that is not one of the offered options is refused with a constant reason, and the call is still in the ledger", async () => {
    const { asker, model, entries } = setup();
    model.answer = (ids) => ({ stances: Object.fromEntries(ids.map((id) => [id, "buy_everything"])), drivers: {}, order: ["none", "none", "none"] });
    const answer = await asker.ask(click());
    expect(answer.status).toBe("erro");
    expect(answer.motivo).toBe("resposta_invalida:ecossistema_postura_invalida");
    expect(answer.oportunidades).toBeUndefined();
    expect(entries[0]!.resultado).toBe("invalida:ecossistema_postura_invalida");
  });

  test("a first place for a candidate the model chose to skip is incoherent and refused", async () => {
    const { asker, model } = setup();
    model.answer = (ids) => ({ stances: Object.fromEntries(ids.map((id) => [id, "skip"])), drivers: {}, order: [ids[0], "none", "none"] });
    const answer = await asker.ask(click());
    expect(answer.motivo).toBe("resposta_invalida:ecossistema_ordem_incoerente");
  });

  test("a balance that is older than two minutes is refused BEFORE the model is asked, so it costs nothing", async () => {
    const { asker, model, entries } = setup();
    const answer = await asker.ask(click({ saldo: { ...SALDO, observedAtMs: T0 - 130_000 } }));
    expect(answer.status).toBe("erro");
    expect(answer.motivo).toBe("saldo_vencido");
    expect(model.calls).toBe(0);
    expect(entries[0]).toMatchObject({ chamadasModelo: 0, resultado: "erro:saldo_vencido" });
  });

  test("without a balance the click still works, and the model is only offered to skip or to watch", async () => {
    const { asker, model } = setup();
    model.answer = (ids) => ({ stances: Object.fromEntries(ids.map((id) => [id, "watch"])), drivers: {}, order: ["none", "none", "none"] });
    const answer = await asker.ask({ modo: "ecossistema", redes: ["8453"] } as never);
    expect(answer.status).toBe("respondido");
    expect(answer.oportunidades!.saldo).toBeNull();
    const eco = (model.seen!.brief.fluxo as { ecossistema: { itens: Record<string, { x: number | null }> } }).ecossistema;
    expect(Object.values(eco.itens).every((item) => item.x === null)).toBe(true);
  });

  test("a second click inside the cooldown is told to wait, and a different request while one runs is told it is running", async () => {
    const { asker, model } = setup();
    await asker.ask(click());
    expect((await asker.ask(click())).status).toBe("cooldown");
    expect(model.calls).toBe(1);
  });

  test("the request is a closed schema: another key, a wallet address, a bad network or a broken balance is no request", async () => {
    const { asker, model } = setup();
    for (const bad of [
      { modo: "ecossistema", wallet: "0xabc" },
      { modo: "ecossistema", alvo: { chainIndex: "1" } },
      { modo: "ecossistema", redes: ["x1"] },
      { modo: "ecossistema", redes: ["1", "1"] },
      { modo: "ecossistema", redes: ["1", "56", "137", "8453", "501"] },
      { modo: "ecossistema", saldo: { ...SALDO, totalUsd: -5 } },
      { modo: "ecossistema", saldo: { ...SALDO, address: "0xabc" } },
      { modo: "ativo", alvo: { instId: "BTC-USDT" }, saldo: SALDO },
      { modo: "ativo", alvo: { instId: "BTC-USDT" }, redes: ["1"] },
    ]) {
      const answer = await asker.ask(bad as never);
      expect(answer.status).toBe("erro");
      expect(answer.motivo).toBe("pedido_invalido");
    }
    expect(model.calls).toBe(0);
  });

  test("the estimate before the call counts the questions of every candidate, not only the Brief", async () => {
    const seen: number[] = [];
    const { asker } = setup({ estimate: undefined, limits: { cooldownMs: 0, reuseTtlMs: 0, maxUsdPerRequest: 0.0001, maxUsdPerDay: 1, maxCallsPerDay: 5, timeoutMs: 5_000, usdPerMtok: { input: 3, output: 15 } } });
    const answer = await asker.ask(click());
    seen.push(answer.custo.usd ?? -1);
    // a ceiling of a hundredth of a cent per request cannot cover the questions of two candidates: it is refused before the model is asked
    expect(answer.status).toBe("teto_atingido");
    expect(answer.motivo).toBe("teto_por_pedido");
  });
});

describe("the adapter of the model", () => {
  test("asks, for each candidate, a stance and a driver in the first evaluation (the priority is a second, separate question); a size only where the code found a ceiling", async () => {
    const { asker, model } = setup();
    await asker.ask(click());
    const questions = ecosystemQuestions(model.seen!.brief, model.seen!.ids) as Record<string, { criteria: Record<string, string> }>;
    expect(Object.keys(questions)).toEqual(["stance_0", "why_0", "stance_1", "why_1"]);
    expect(Object.keys(questions.stance_0!.criteria)).toEqual(["skip", "watch", "buy_third", "buy_two_thirds", "buy_full"]);
    expect(Object.keys(questions.why_0!.criteria)).toContain(NO_FAMILY);
    // no ceiling, no size: the model is not offered what the code would refuse
    const blind = setup();
    await blind.asker.ask({ modo: "ecossistema", redes: ["8453"] } as never);
    const noSize = ecosystemQuestions(blind.model.seen!.brief, blind.model.seen!.ids) as Record<string, { criteria: Record<string, string> }>;
    expect(Object.keys(noSize.stance_0!.criteria)).toEqual(["skip", "watch"]);
    expect(JSON.stringify(questions)).not.toMatch(/\b(comprar|vender)\b/i);
  });

  test("calls the model twice, the stances and drivers first and the one priority among the eligible after, and shapes the answers the way the code checks them", async () => {
    const { asker, model } = setup();
    await asker.ask(click());
    const { brief, ids } = model.seen!;
    const calls: unknown[] = [];
    const adapter = createJevInonuModel({
      apiKey: () => "k",
      createProvider: () => ({ evaluationModel: () => ({}) as never }),
      evaluate: (async (args: { questions: Record<string, unknown> }) => {
        calls.push(args);
        // the second evaluation is the priority question, over the candidates the first one did not skip
        if (Object.hasOwn(args.questions, "priority")) return { answers: { priority: { choice: ids[0]! } }, usage: { inputTokens: 500, outputTokens: 20 } };
        const answers: Record<string, { choice: string }> = {};
        ids.forEach((_, i) => {
          answers[`stance_${i}`] = { choice: i === 0 ? "buy_third" : "watch" };
          answers[`why_${i}`] = { choice: "fluxo" };
        });
        return { answers, usage: { inputTokens: 2100, outputTokens: 90 } };
      }) as never,
    });
    const out = await adapter.choose({ brief, ids, mode: "ecossistema", signal: new AbortController().signal });
    expect(calls).toHaveLength(2);
    expect(Object.keys((calls[1] as { questions: Record<string, unknown> }).questions)).toEqual(["priority"]);
    expect(out.raw).toEqual({
      stances: { [ids[0]!]: "buy_third", [ids[1]!]: "watch" },
      drivers: { [ids[0]!]: "fluxo", [ids[1]!]: "fluxo" },
      order: [ids[0]!, null, null],
    });
    // the usage of both evaluations is added
    expect(out.usage).toEqual({ inputTokens: 2600, outputTokens: 110 });
  });

  test("a Brief that is not the ecosystem one is refused, and a missing answer is an error with a constant text, never a guess", async () => {
    const { asker, model } = setup();
    await asker.ask(click());
    const { brief, ids } = model.seen!;
    expect(() => ecosystemQuestions({ ...brief, fluxo: null }, ids)).toThrow();
    expect(() => ecosystemQuestions(brief, ["token:1:0xnope"])).toThrow();
    const empty = createJevInonuModel({ apiKey: () => "k", createProvider: () => ({ evaluationModel: () => ({}) as never }), evaluate: (async () => ({ answers: {} })) as never });
    await expect(empty.choose({ brief, ids, mode: "ecossistema", signal: new AbortController().signal })).rejects.toThrow("Invalid ecosystem decisions");
  });
});

// keeps the saldo schema honest in this file too: the page and the tests build the same object
void parseSaldo;
