import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FEATURE_NAMES } from "../intel/features/types";
import type { AskResponse, Asker } from "../inonu/ask";
import type { Verdict } from "../verdict/types";
import { instrumentOf, withDecisionLog, type DecisionLogDeps } from "./decision-log";
import { createOutcomeStore } from "./store";
import type { Snapshot } from "./types";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "inonu-declog-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const answered = (over: Partial<AskResponse> = {}): AskResponse => ({
  ok: true, id: "r1", status: "respondido",
  decisao: { action: "buy", candidateId: "zona:abc", pesos: null, razao: "x", modelo: "jev-latest" },
  custo: { chamadasOnchainos: 0, tokens: 1500, usd: null }, briefHash: "hash1", advisory: true, execution: "never", ...over,
});

test("the recorder wrapper preserves the caller's request and cancellation ownership", async () => {
  const requestId = "b9eb24df-248c-440c-b3fd-287a5507fedf";
  let received: unknown;
  let cancelled = null as string | null;
  const inner = {
    ask: async (_request: unknown, options?: unknown) => { received = options; return answered({ status: "cancelado", decisao: undefined }); },
    cancel: () => false, running: () => null,
    cancelRequest: (id: string) => { cancelled = id; return true; },
  };
  const wrapper = withDecisionLog(inner, { recorder: { snapshotNow: async () => null }, store: createOutcomeStore({ dir: tmp() }), now: () => 1, enabled: () => false });
  await wrapper.ask({ modo: "carteira" }, { requestId });
  expect(received).toEqual({ requestId });
  expect(wrapper.cancelRequest?.(requestId)).toBe(true);
  expect(cancelled).toBe(requestId);
});
const withDecision = (action: "buy" | "sell" | "hold", candidateId: string | null): AskResponse => answered({ decisao: { action, candidateId, pesos: null, razao: "x", modelo: "m" } });
type Answer = AskResponse & { veredito?: Verdict };

const BULLISH: Record<string, number> = { "trend.ema1h": 1, "trend.ema4h": 1, "flow.warm": 1, "flow.absorbSide": 1, "cost.moveToCost1h": 4 };
const fullSnapshot = (n: number, over: Partial<Snapshot> = {}): Snapshot => ({
  id: `snap${n}`, asOfMs: 1_000_000, instId: "ETH-USDT", market: "spot", price: 100, costRoundTripBps: 24, atr15m: 1,
  zones: { demanda: null, oferta: null, todas: [{ id: "abc", lado: "demanda", baixo: 98.5, alto: 99.5, invalidacao: 98, nota: 62 }, { id: "def", lado: "oferta", baixo: 103, alto: 104, invalidacao: 105, nota: 50 }] },
  features: { v: 1, instId: "ETH-USDT", asOfMs: 1_000_000, values: Object.fromEntries(FEATURE_NAMES.map((f) => [f, BULLISH[f] ?? null])), nulos: {}, idades: {} },
  origem: "pedido", ...over,
});

interface Setup {
  response?: AskResponse | (() => Promise<AskResponse>);
  enabled?: () => boolean;
  extra?: Partial<DecisionLogDeps>;
  snapshot?: (n: number) => Promise<Snapshot | null>;
}

function setup(o: Setup = {}) {
  const clock = { now: 1_000_000 };
  const store = createOutcomeStore({ dir: tmp(), now: () => clock.now });
  const order: string[] = [];
  let taken = 0;
  const recorder = {
    async snapshotNow(instId: string, origem: Snapshot["origem"]) {
      order.push(`snapshot:${instId}:${origem}`);
      taken += 1;
      return (o.snapshot ?? (async (n: number) => fullSnapshot(n)))(taken);
    },
  };
  const response = o.response ?? answered();
  const asker: Asker = {
    async ask() {
      order.push("ask");
      return typeof response === "function" ? response() : response;
    },
    cancel: (id) => id === "x",
    running: () => null,
  };
  const wrapped = withDecisionLog(asker, { recorder, store, now: () => clock.now, enabled: o.enabled ?? (() => true), ...o.extra });
  return { wrapped, store, order, clock };
}

const ATIVO = { modo: "ativo", alvo: { instId: "ETH-USDT" } };

describe("instrumentOf", () => {
  test("only a click about one OKX instrument has an instrument", () => {
    expect(instrumentOf(ATIVO)).toBe("ETH-USDT");
    expect(instrumentOf({ modo: "ativo", alvo: { instId: "BTC-USDT-SWAP" } })).toBe("BTC-USDT-SWAP");
    for (const other of [null, 3, {}, { modo: "ranking", alvos: [] }, { modo: "token", alvo: { chainIndex: "1", address: "0x1" } }, { modo: "ativo", alvo: { instId: "eth usdt" } }, { modo: "ativo", alvo: null }, { modo: "filtro", textoLivre: "x" }]) {
      expect(instrumentOf(other)).toBeNull();
    }
  });
});

describe("the log", () => {
  test("the snapshot is taken at the click, before the model answers, and the answer is recorded with it", async () => {
    const { wrapped, store, order } = setup();
    const { veredito, ...response } = (await wrapped.ask(ATIVO as never)) as Answer;
    expect(response).toEqual(answered()); // every field the asker produced is untouched
    expect(veredito).toBeDefined();
    expect(order).toEqual(["snapshot:ETH-USDT:pedido", "ask"]);
    expect(store.decisions()).toEqual([{ id: "r1", atMs: 1_000_000, instId: "ETH-USDT", modo: "ativo", action: "buy", candidateId: "zona:abc", briefHash: "hash1", snapshotId: "snap1", reutilizado: false, probabilidades: null, veredito: { selo: "comprar", forcadoPor: null } }]);
  });

  test("a hold is recorded too (the Placar counts it and never scores it)", async () => {
    const { wrapped, store } = setup({ response: withDecision("hold", null) });
    await wrapped.ask(ATIVO as never);
    expect(store.decisions()[0]!.action).toBe("hold");
  });

  test("a reused answer is marked as reused", async () => {
    const { wrapped, store } = setup({ response: answered({ reutilizado: true }) });
    await wrapped.ask(ATIVO as never);
    expect(store.decisions()[0]!.reutilizado).toBe(true);
  });

  test("a refusal, a cooldown or an error is not a decision", async () => {
    for (const status of ["teto_atingido", "cooldown", "sem_chave", "erro", "em_andamento", "cancelado"] as const) {
      const { wrapped, store } = setup({ response: { ok: false, id: "r", status, custo: { chamadasOnchainos: null, tokens: null, usd: null }, briefHash: null, advisory: true, execution: "never" } });
      const got = (await wrapped.ask(ATIVO as never)) as Answer;
      expect(store.decisions(), status).toEqual([]);
      expect(got.veredito, status).toBeUndefined();
    }
  });

  test("a ranking or a token has no snapshot and no Veredito, but its answer is still recorded", async () => {
    const { wrapped, store, order } = setup();
    const got = (await wrapped.ask({ modo: "ranking", alvos: [{ instId: "ETH-USDT" }, { instId: "BTC-USDT" }] } as never)) as Answer;
    expect(order).toEqual(["ask"]);
    expect(got.veredito).toBeUndefined();
    expect(store.decisions()[0]).toMatchObject({ instId: null, modo: "ranking", snapshotId: null, veredito: null });
  });

  test("two clicks on the same instrument within a minute share one snapshot; a minute later it is read again", async () => {
    const { wrapped, order, clock } = setup();
    await wrapped.ask(ATIVO as never);
    clock.now += 30_000;
    await wrapped.ask(ATIVO as never);
    expect(order.filter((o) => o.startsWith("snapshot"))).toHaveLength(1);
    clock.now += 31_000;
    await wrapped.ask(ATIVO as never);
    expect(order.filter((o) => o.startsWith("snapshot"))).toHaveLength(2);
  });

  test("when the recorder is off nothing is read and nothing is written, and the answer is the same, with no Veredito", async () => {
    const { wrapped, store, order } = setup({ enabled: () => false });
    expect(await wrapped.ask(ATIVO as never)).toEqual(answered());
    expect(order).toEqual(["ask"]);
    expect(store.decisions()).toEqual([]);
  });

  test("a recorder that fails never changes the answer: the Veredito comes with no plan and says why", async () => {
    const { wrapped, store } = setup({ snapshot: async () => Promise.reject(new Error("SENTINEL")) });
    const got = (await wrapped.ask(ATIVO as never)) as Answer;
    expect(got.status).toBe("respondido");
    expect(store.decisions()[0]!.snapshotId).toBeNull();
    expect([got.veredito!.selo, got.veredito!.plano]).toEqual(["comprar", null]);
    expect(got.veredito!.avisos).toContain("Sem preco, nao ha plano de risco.");
    expect(JSON.stringify(got)).not.toContain("SENTINEL");
  });

  test("a Veredito that fails to compose never stops the record, nor changes the answer", async () => {
    const { wrapped, store } = setup({ snapshot: async (n) => ({ id: `snap${n}` }) as Snapshot }); // not the shape: composing throws
    const got = (await wrapped.ask(ATIVO as never)) as Answer;
    expect(got).toEqual(answered());
    expect(store.decisions()).toHaveLength(1);
    expect(store.decisions()[0]!.veredito).toBeNull();
  });

  test("a snapshot that never comes does not hold the answer: after the wait the Veredito is given without it", async () => {
    const { wrapped, store } = setup({ extra: { snapshotWaitMs: 20 }, snapshot: () => new Promise<Snapshot | null>(() => undefined) });
    const got = (await wrapped.ask(ATIVO as never)) as Answer;
    expect([got.status, got.veredito!.plano]).toEqual(["respondido", null]);
    expect(store.decisions()[0]!.snapshotId).toBeNull();
  });

  test("cancel and running pass through", () => {
    const { wrapped } = setup();
    expect(wrapped.cancel("x")).toBe(true);
    expect(wrapped.running()).toBeNull();
  });
});

describe("the Veredito that goes with the answer", () => {
  const ask = async (o: Setup = {}, request: unknown = ATIVO) => ((await setup(o).wrapped.ask(request as never)) as Answer).veredito;

  test("a buy over a zone the engine offered: the plan is anchored on that zone's limits and invalidation", async () => {
    const v = (await ask())!;
    expect([v.selo, v.forcadoPor, v.notaZona]).toEqual(["comprar", null, 62]);
    expect([v.plano!.entradaBaixo, v.plano!.entradaAlto, v.plano!.invalidacao, v.plano!.alvo, v.plano!.alvoTipo]).toEqual([98.5, 99.5, 98, 103, "zona_oposta"]);
    expect(v.motivos[0]).toBe("A tendencia de 1 hora e de 4 horas e de alta.");
    expect(v.confianca).toBeNull(); // the probabilities of the answer are not read yet, and the card does not pretend
  });

  test("the profile of the moment gives the size, and the Placar flag drops the warning", async () => {
    const v = (await ask({ extra: { profile: () => ({ capitalUsd: 1000, riskPct: 1 }), placarMeasured: () => true } }))!;
    expect(v.plano!.tamanho!.riscoUsd).toBe(10);
    expect(v.avisos).not.toContain("O acerto destas respostas ainda nao foi medido.");
  });

  test("a hold becomes esperar, and a sell is anchored on the supply zone", async () => {
    const hold = (await ask({ response: withDecision("hold", null) }))!;
    expect([hold.selo, hold.forcadoPor, hold.plano]).toEqual(["esperar", null, null]);
    const sell = (await ask({ response: withDecision("sell", "zona:def") }))!;
    expect([sell.selo, sell.plano!.lado, sell.plano!.entradaBaixo, sell.plano!.invalidacao]).toEqual(["vender", "venda", 103, 105]);
  });

  test("a zone the snapshot does not know has no zone score, and an instrument level candidate falls back to the ATR", async () => {
    const unknown = (await ask({ response: withDecision("buy", "zona:zzz") }))!;
    expect([unknown.notaZona, unknown.plano!.alvoTipo]).toEqual([null, "zona_oposta"]);
    const spot = (await ask({ response: withDecision("buy", "spot:ETH-USDT") }))!;
    expect([spot.plano!.entradaReferencia, spot.plano!.invalidacao]).toEqual([100, 99]);
  });

  test("a warming engine turns a buy into esperar, the model's answer stays what it said, and the record keeps which gate did it", async () => {
    const warm = async (n: number) => fullSnapshot(n, { features: { ...fullSnapshot(n).features, values: { ...fullSnapshot(n).features.values, "flow.warm": 0 } } });
    const { wrapped, store } = setup({ snapshot: warm });
    const got = (await wrapped.ask(ATIVO as never)) as Answer;
    expect([got.veredito!.selo, got.veredito!.forcadoPor, got.decisao!.action]).toEqual(["esperar", "aquecimento", "buy"]);
    expect(store.decisions()[0]!.veredito).toEqual({ selo: "esperar", forcadoPor: "aquecimento" });
  });
});

describe("what the model call left about its own answers", () => {
  const withInsight = (insight: { consistency: number | null; orderingsAgree: boolean | null } | null) => {
    const taken: (string | null)[] = [];
    const extra = { insights: { take: (h: string | null) => (taken.push(h), insight) } };
    return { extra, taken };
  };
  const ask = async (extra: Partial<DecisionLogDeps>) => ((await setup({ extra }).wrapped.ask(ATIVO as never)) as Answer).veredito!;

  test("a decided model gives the word for its consistency, and the bench is asked with the hash of the Brief it answered", async () => {
    const { extra, taken } = withInsight({ consistency: 0.8, orderingsAgree: true });
    const v = await ask(extra);
    expect([v.selo, v.confianca, v.forcadoPor]).toEqual(["comprar", "alta", null]);
    expect(taken).toEqual(["hash1"]);
  });

  test("a divided model, or one that leaned on the order of the options, turns the answer into esperar", async () => {
    expect((await ask(withInsight({ consistency: 0.1, orderingsAgree: true }).extra)).forcadoPor).toBe("confianca_baixa");
    const v = await ask(withInsight({ consistency: 0.9, orderingsAgree: false }).extra);
    expect([v.selo, v.forcadoPor]).toEqual(["esperar", "ordem_discorda"]);
  });

  test("with nothing left on the bench the card says the consistency is not informed, as before", async () => {
    const v = await ask(withInsight(null).extra);
    expect(v.confianca).toBeNull();
    expect(v.selo).toBe("comprar");
  });
});

