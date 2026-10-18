// ASK-2, ASK-5, ASK-11: the desk's client of "Pedir ao Inonu". It reads the answer strictly, turns every transport failure into
// a named outcome (never an exception on screen), and sends the intent header that says a person clicked.
import { describe, expect, test } from "bun:test";
import { createInonuClient, parseAnswer, parseStatus, type AskAnswer } from "./client";

test("the caller owns cancellation before the POST response without changing the request body", async () => {
  const requestId = "b9eb24df-248c-440c-b3fd-287a5507fedf";
  const { calls, f } = fakeFetch({ ok: true });
  const client = createInonuClient("", f);
  await client.ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } }, undefined, requestId);
  expect(calls[0]!.init!.headers?.["x-inonu-request-id"]).toBe(requestId);
  expect(JSON.parse(calls[0]!.init!.body!)).toEqual({ modo: "ativo", alvo: { instId: "BTC-USDT" } });
  expect(await client.cancelRequest(requestId)).toBe(true);
  expect(calls[1]!.url).toBe(`/inonu/request/${requestId}`);
  expect(calls[1]!.init).toMatchObject({ method: "DELETE", headers: { "x-inonu-intent": "user" } });
  expect(await client.cancelRequest("unrelated-server-id")).toBe(false);
  expect(calls).toHaveLength(2);
});

const ANSWER = {
  ok: true, id: "ask-1", status: "respondido", briefHash: "h".repeat(64), reutilizado: false,
  decisao: { action: "buy", candidateId: "spot:BTC-USDT", pesos: null, razao: "modelo escolheu spot:BTC-USDT entre 3 candidatos", modelo: "jev-latest" },
  custo: { chamadasOnchainos: 0, tokens: 610, usd: null }, advisory: true, execution: "never",
};

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
  const f = (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as never;
  return { calls, f };
}

describe("parseAnswer", () => {
  test("reads a valid answer into a typed outcome", () => {
    const a = parseAnswer(ANSWER) as AskAnswer;
    expect(a).toMatchObject({ status: "respondido", id: "ask-1", decisao: { action: "buy", candidateId: "spot:BTC-USDT", modelo: "jev-latest" }, custo: { tokens: 610, usd: null } });
    expect(a.advisory).toBe(true);
    expect(a.execution).toBe("never");
  });

  test("hold has no candidate, a refusal has no decision", () => {
    expect(parseAnswer({ ...ANSWER, decisao: { ...ANSWER.decisao, action: "hold", candidateId: null } })?.decisao).toMatchObject({ action: "hold", candidateId: null });
    expect(parseAnswer({ ok: false, id: "x", status: "teto_atingido", motivo: "teto_diario", briefHash: null, custo: { chamadasOnchainos: null, tokens: null, usd: null }, advisory: true, execution: "never" })).toMatchObject({ status: "teto_atingido", motivo: "teto_diario" });
  });

  test("anything off the contract is null: a wrong status, an action that is not buy/sell/hold, advisory or execution changed", () => {
    for (const bad of [
      null, "x", {}, { ...ANSWER, status: "otimo" }, { ...ANSWER, decisao: { ...ANSWER.decisao, action: "long" } }, { ...ANSWER, advisory: false }, { ...ANSWER, execution: "now" },
      { ...ANSWER, custo: { chamadasOnchainos: "0", tokens: 1, usd: null } }, { ...ANSWER, id: 5 },
    ]) expect(parseAnswer(bad)).toBeNull();
  });
});

const FILTER_ANSWER = {
  ok: true, id: "ask-2", status: "respondido", briefHash: null, reutilizado: false,
  filtro: { mercado: "perp", volUsdMin: 100_000_000, varMin: 3, varMax: null, rankMax: null, apenasFixados: false, ordenar: { chave: "var24hPct", direcao: "desc" } },
  modelo: "jev-latest", custo: { chamadasOnchainos: 0, tokens: 930, usd: null }, advisory: true, execution: "never",
};

describe("the filter answer (RAS-5)", () => {
  test("is read field by field, with the sort the table understands", () => {
    const a = parseAnswer(FILTER_ANSWER) as AskAnswer;
    expect(a.filtro).toEqual(FILTER_ANSWER.filtro);
    expect(a.modelo).toBe("jev-latest");
    expect(a.decisao).toBeUndefined();
  });

  test("a filter off the closed shape makes the whole answer null: an unknown field, a bad market, a bad sort, a string where a number goes", () => {
    const bad = (filtro: unknown) => parseAnswer({ ...FILTER_ANSWER, filtro });
    expect(bad({ ...FILTER_ANSWER.filtro, extra: 1 })).toBeNull();
    expect(bad({ ...FILTER_ANSWER.filtro, mercado: "onchain" })).toBeNull();
    expect(bad({ ...FILTER_ANSWER.filtro, ordenar: { chave: "pressao", direcao: "desc" } })).toBeNull();
    expect(bad({ ...FILTER_ANSWER.filtro, ordenar: { chave: "preco", direcao: "up" } })).toBeNull();
    expect(bad({ ...FILTER_ANSWER.filtro, volUsdMin: "100" })).toBeNull();
    expect(bad({ ...FILTER_ANSWER.filtro, rankMax: 0.5 })).toBeNull();
    expect(bad({ ...FILTER_ANSWER.filtro, apenasFixados: "sim" })).toBeNull();
    expect(bad("perp")).toBeNull();
    expect(bad(null)).toBeNull();
  });

  test("a refusal has no filter, and the request for a filter carries the sentence and nothing else", async () => {
    expect(parseAnswer({ ok: false, id: "x", status: "sem_chave", motivo: "sem_chave", briefHash: null, custo: { chamadasOnchainos: null, tokens: null, usd: null }, advisory: true, execution: "never" })?.filtro).toBeUndefined();
    const { calls, f } = fakeFetch(FILTER_ANSWER);
    const out = await createInonuClient("", f).ask({ modo: "filtro", textoLivre: "perpetuos grandes" });
    expect(out.filtro).toBeDefined();
    expect(JSON.parse(calls[0]!.init!.body!)).toEqual({ modo: "filtro", textoLivre: "perpetuos grandes" });
    expect(calls[0]!.init!.headers).toMatchObject({ "x-inonu-intent": "user" });
  });
});

describe("parseStatus", () => {
  test("model configured, today, and the warm-up of the engine", () => {
    const s = parseStatus({ ok: true, modelConfigured: true, running: null, today: { calls: 1, usd: null }, engine: { feed: { state: "live", instruments: 4, reconnects: 0 }, messagesPerSecond: 12.5, instruments: [{ instId: "BTC-USDT", closedCandles: 3, needed: 50, lastTradeAgeMs: 800 }] }, advisory: true, execution: "never" });
    expect(s).toMatchObject({ modelConfigured: true, today: { calls: 1, usd: null }, engine: { feedState: "live", messagesPerSecond: 12.5, instruments: [{ instId: "BTC-USDT", closedCandles: 3, needed: 50 }] } });
  });

  test("an engine that is off reads as no feed", () => {
    expect(parseStatus({ ok: true, modelConfigured: false, running: null, today: { calls: 0, usd: 0 }, engine: { feed: null, messagesPerSecond: 0, instruments: [] }, advisory: true, execution: "never" })?.engine.feedState).toBeNull();
  });

  test("garbage is null", () => {
    for (const bad of [null, {}, { ok: true }, { ok: true, modelConfigured: "yes" }]) expect(parseStatus(bad)).toBeNull();
  });
});

describe("the client", () => {
  test("ask posts the request with the intent header and returns the parsed answer", async () => {
    const { calls, f } = fakeFetch(ANSWER);
    const out = await createInonuClient("", f).ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } });
    expect(out).toMatchObject({ status: "respondido" });
    expect(calls[0]!.url).toBe("/inonu/ask");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ "content-type": "application/json", "x-inonu-intent": "user" });
    expect(JSON.parse(calls[0]!.init!.body!)).toEqual({ modo: "ativo", alvo: { instId: "BTC-USDT" } });
  });

  test("a refusal answered with an HTTP error status is still read as the refusal it is", async () => {
    const { f } = fakeFetch({ ok: false, id: "a", status: "sem_chave", motivo: "sem_chave", briefHash: null, custo: { chamadasOnchainos: null, tokens: null, usd: null }, advisory: true, execution: "never" }, 503);
    expect(await createInonuClient("", f).ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } })).toMatchObject({ status: "sem_chave" });
  });

  test("transport failures become named outcomes, not exceptions: no server route, refused origin, unreachable, garbled", async () => {
    const outcome = async (f: never) => (await createInonuClient("", f).ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } })).motivo;
    expect(await outcome(fakeFetch("nope", 404).f)).toBe("servidor_sem_rota");
    expect(await outcome(fakeFetch({ ok: false, code: "forbidden" }, 403).f)).toBe("origem_negada");
    expect(await outcome((async () => { throw new Error("offline"); }) as never)).toBe("sem_conexao");
    expect(await outcome(fakeFetch("<html>", 200).f)).toBe("resposta_invalida");
    const unreadable = await createInonuClient("", fakeFetch("<html>", 502).f).ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } });
    expect(unreadable.status).toBe("erro");
  });

  test("cancel sends DELETE with the intent header and tells whether the server knew the id", async () => {
    const ok = fakeFetch({ ok: true });
    expect(await createInonuClient("", ok.f).cancel("ask-1")).toBe(true);
    expect(ok.calls[0]!.url).toBe("/inonu/ask/ask-1");
    expect(ok.calls[0]!.init).toMatchObject({ method: "DELETE", headers: { "x-inonu-intent": "user" } });
    expect(await createInonuClient("", fakeFetch({ ok: false, code: "not_found" }, 404).f).cancel("ask-9")).toBe(false);
    expect(await createInonuClient("", fakeFetch({}, 200).f).cancel("../x")).toBe(false); // an id with a path in it never leaves the browser
  });

  test("status is null when the server has no such route", async () => {
    expect(await createInonuClient("", fakeFetch("nope", 404).f).status()).toBeNull();
  });
});
