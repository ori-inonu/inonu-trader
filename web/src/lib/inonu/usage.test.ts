// T7.4, CFG-5, CFG-8: what Settings shows about the Inonu: how many calls reached the model, the tokens the provider measured, the dollars
// only when the person gave a price, the latest calls, and the addresses the app talks to. It is read strictly (a bad answer is no answer)
// and written in plain words. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createInonuClient } from "./client";
import { type EvaluationUsage, parseProviders, parseUsage, priceLine, recentLine, resultText, tailOf, totalsLine } from "./usage";

const T = (over: Record<string, unknown> = {}) => ({ calls: 2, usd: null, tokens: 1500, onchainosCalls: 0, avgLatencyMs: 900, ...over });
const GOOD = {
  ok: true, today: T(), month: T({ calls: 9, tokens: 7000, onchainosCalls: 3 }),
  recent: [{ atMs: 1_800_000_000_000, modo: "ativo", modelo: "jev-latest", resultado: "respondido", tokens: 740, usd: null, latenciaMs: 800, chamadasOnchainos: 0 }],
  prices: { input: null, output: null }, advisory: true, execution: "never",
};

describe("parseUsage", () => {
  test("reads a good answer", () => {
    const u = parseUsage(GOOD)!;
    expect(u.today).toEqual({ calls: 2, usd: null, tokens: 1500, onchainosCalls: 0, avgLatencyMs: 900 });
    expect(u.recent).toHaveLength(1);
    expect(u.prices).toEqual({ input: null, output: null });
  });

  test("keeps the count and measurements of two evaluations", () => {
    const avaliacoes: EvaluationUsage[] = [
      { indice: 1, tokensEntrada: 100, tokensSaida: 20, usd: null, usdEstimado: null },
      { indice: 2, tokensEntrada: 60, tokensSaida: 5, usd: null, usdEstimado: null },
    ];
    const u = parseUsage({ ...GOOD, recent: [{ ...GOOD.recent[0], chamadasModelo: 2, tokens: 185, avaliacoes }] })!;
    expect(u.recent[0]?.chamadasModelo).toBe(2);
    expect(u.recent[0]?.avaliacoes).toEqual(avaliacoes);
    expect(recentLine(u.recent[0]!, 1_800_000_000_000)).toContain("2 avaliacoes");
  });

  test("a partial failure keeps known usage separately from an unknown total", () => {
    const avaliacoes: EvaluationUsage[] = [
      { indice: 1, tokensEntrada: 100, tokensSaida: 20, usd: null, usdEstimado: 0.002 },
      { indice: 2, tokensEntrada: null, tokensSaida: null, usd: null, usdEstimado: 0.002 },
    ];
    const u = parseUsage({ ...GOOD, recent: [{ ...GOOD.recent[0], chamadasModelo: 2, tokens: null, usd: null, resultado: "erro:modelo_falhou", avaliacoes }] })!;
    expect(u.recent[0]?.tokens).toBeNull();
    expect(u.recent[0]?.usd).toBeNull();
    expect(u.recent[0]?.avaliacoes).toEqual(avaliacoes);
    expect(recentLine(u.recent[0]!, 1_800_000_000_000)).toContain("tokens nao medidos");
  });

  test("rejects invalid evaluation counts and malformed stage measurements", () => {
    const stage = { indice: 1, tokensEntrada: 100, tokensSaida: 20, usd: null, usdEstimado: null };
    for (const over of [
      { chamadasModelo: 3 }, { chamadasModelo: -1 }, { chamadasModelo: 1.5 },
      { chamadasModelo: 2, avaliacoes: [stage] },
      { chamadasModelo: 1, avaliacoes: [{ ...stage, indice: 2 }] },
      { chamadasModelo: 1, avaliacoes: [{ ...stage, tokensEntrada: -1 }] },
      { chamadasModelo: 1, avaliacoes: [{ ...stage, tokensSaida: "20" }] },
      { chamadasModelo: 1, avaliacoes: [{ ...stage, usd: -0.1 }] },
      { chamadasModelo: 1, avaliacoes: "unknown" },
    ]) expect(parseUsage({ ...GOOD, recent: [{ ...GOOD.recent[0], ...over }] })).toBeNull();
  });

  test("anything off the shape is null: the wrong envelope, a text where a number goes, a bad price", () => {
    for (const bad of [null, "x", {}, { ...GOOD, ok: false }, { ...GOOD, advisory: false }, { ...GOOD, execution: "now" }, { ...GOOD, today: T({ calls: "2" }) }, { ...GOOD, recent: [{ ...GOOD.recent[0], tokens: "7" }] }, { ...GOOD, prices: { input: 3 } }, { ...GOOD, prices: { input: -1, output: 2 } }]) {
      expect(parseUsage(bad)).toBeNull();
    }
  });

  test("the list of calls is bounded and the free text of a field is cut", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...GOOD.recent[0], atMs: 1_800_000_000_000 + i }));
    expect(parseUsage({ ...GOOD, recent: many })!.recent.length).toBeLessThanOrEqual(12);
    expect(parseUsage({ ...GOOD, recent: [{ ...GOOD.recent[0], resultado: "x".repeat(300) }] })!.recent[0]!.resultado.length).toBeLessThanOrEqual(60);
  });
});

describe("the words", () => {
  test("calls, tokens and the dollars only when they are known", () => {
    expect(totalsLine(T())).toBe("2 consultas ao modelo, 1.500 tokens, custo em dolar nao medido");
    expect(totalsLine(T({ calls: 1, tokens: 1100, usd: 0.0045 }))).toBe("1 consulta ao modelo, 1.100 tokens, US$ 0,0045");
    expect(totalsLine(T({ calls: 0, tokens: 0, usd: 0 }))).toBe("nenhuma consulta ao modelo");
    expect(totalsLine(T({ tokens: null }))).toBe("2 consultas ao modelo, tokens nao medidos, custo em dolar nao medido");
  });

  test("the price in force, or the lack of one with what it means", () => {
    expect(priceLine({ input: null, output: null })).toBe("Preco por milhao de tokens: nao informado, entao o custo em dolar nao e medido e os tetos em dolar nao valem");
    expect(priceLine({ input: 3, output: 15 })).toBe("Preco por milhao de tokens: US$ 3 de entrada e US$ 15 de saida");
  });

  test("one latest call in a line: when, what, which model, how it ended and what it measured", () => {
    const line = recentLine(GOOD.recent[0]!, 1_800_000_090_000);
    expect(line).toBe("ha 1 min, ativo, jev-latest, respondido, 740 tokens, 0,8 s");
    expect(recentLine({ ...GOOD.recent[0]!, modelo: null, tokens: null, latenciaMs: null, resultado: "teto_diario" }, 1_800_000_000_000)).toBe("agora, ativo, sem modelo, teto atingido");
  });

  test("everything is plain ASCII with no middle dot or dash", () => {
    const texts = [totalsLine(T()), totalsLine(T({ usd: 0.5 })), priceLine({ input: null, output: null }), priceLine({ input: 3, output: 15 }), recentLine(GOOD.recent[0]!, 1_800_000_090_000)];
    for (const text of texts) expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
  });
});

describe("parseProviders", () => {
  const row = { id: "okx-rest", label: "OKX mercado, REST publico", url: "https://www.okx.com", uso: "precos", custo: "gratuito", quemFala: "o nucleo" };
  test("reads the manifest rows and refuses a row off the shape", () => {
    expect(parseProviders({ ok: true, providers: [row], advisory: true, execution: "never" })).toEqual([row]);
    expect(parseProviders({ ok: true, providers: [{ ...row, url: 5 }] })).toBeNull();
    expect(parseProviders({ ok: true, providers: "x" })).toBeNull();
    expect(parseProviders(null)).toBeNull();
  });
});

describe("the client", () => {
  function fakeFetch(body: unknown, status = 200) {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const f = (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      calls.push({ url, init });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }) as never;
    return { calls, f };
  }

  test("usage reads the ledger route, and a missing route is null", async () => {
    const { calls, f } = fakeFetch(GOOD);
    expect((await createInonuClient("", f).usage())?.month.calls).toBe(9);
    expect(calls[0]!.url).toBe("/inonu/ledger");
    expect(await createInonuClient("", fakeFetch("nope", 404).f).usage()).toBeNull();
  });

  test("setPrices sends the intent header and both numbers, or two nulls to clear, and says whether it was kept", async () => {
    const { calls, f } = fakeFetch({ ok: true, prices: { input: 3, output: 15 } });
    const client = createInonuClient("", f);
    expect(await client.setPrices(3, 15)).toEqual({ ok: true });
    expect(calls[0]!.url).toBe("/inonu/prices");
    expect(calls[0]!.init!.method).toBe("PUT");
    expect(calls[0]!.init!.headers).toMatchObject({ "x-inonu-intent": "user" });
    expect(JSON.parse(calls[0]!.init!.body!)).toEqual({ input: 3, output: 15 });
    expect(await createInonuClient("", fakeFetch({ ok: false, code: "precos_invalidos" }, 400).f).setPrices(0, 15)).toEqual({ ok: false, reason: "precos_invalidos" });
    expect(await createInonuClient("", () => Promise.reject(new Error("offline"))).setPrices(3, 15)).toEqual({ ok: false, reason: "sem_conexao" });
  });

  test("providers reads the manifest route", async () => {
    const { f } = fakeFetch({ ok: true, providers: [{ id: "okx-rest", label: "OKX", url: "https://www.okx.com", uso: "a", custo: "b", quemFala: "c" }], advisory: true, execution: "never" });
    expect((await createInonuClient("", f).providers())?.[0]?.id).toBe("okx-rest");
  });
});

describe("the result of a request in words", () => {
  test("an answer, a cancel, a cap, a discarded answer and a refusal are each said in Portuguese, and an unknown code is never shown raw", () => {
    expect(resultText("respondido")).toBe("respondido");
    expect(resultText("cancelado")).toBe("cancelado");
    for (const cap of ["teto_por_pedido", "teto_diario", "teto_de_chamadas", "teto_onchainos"]) expect(resultText(cap)).toBe("teto atingido");
    for (const bad of ["invalida:action_invalid", "invalida:candidate_unknown", "invalida:not_an_object"]) expect(resultText(bad)).toBe("resposta descartada");
    expect(resultText("erro:sem_sinais")).toBe("recusado (sem registros de carteiras)");
    expect(resultText("erro:sem_candidatos")).toBe("recusado (sem candidatos)");
    expect(resultText("erro:tempo_esgotado")).toBe("recusado (tempo esgotado)");
    expect(resultText("erro:okx_rate_limited")).toBe("recusado (a OKX nao respondeu)");
    expect(resultText("erro:algo_novo")).toBe("recusado (sem detalhe)");
    expect(resultText("algo_novo")).toBe("sem detalhe");
  });

  test("plain ASCII, and none of the English codes of the pipeline survives", () => {
    for (const code of ["respondido", "cancelado", "teto_diario", "invalida:action_invalid", "invalida:candidate_required", "erro:sem_sinais", "erro:okx_aborted", "erro:modelo_falhou", "x"]) {
      const text = resultText(code);
      expect(/^[ -~]*$/.test(text)).toBe(true);
      expect(text).not.toMatch(/action|candidate|invalid|object|unknown/i);
    }
  });
});

describe("the tail of the Inonu tab (T4.5)", () => {
  const call = (i: number, over: Record<string, unknown> = {}) => ({ atMs: 1_800_000_000_000 - i * 60_000, modo: "ativo", modelo: "jev-latest", resultado: "respondido", tokens: 740 + i, usd: null, latenciaMs: 800, chamadasOnchainos: 0, ...over });
  const usageWith = (recent: unknown[], today = T()) => parseUsage({ ...GOOD, today, recent })!;
  const NOW = 1_800_000_000_000 + 30_000;

  test("the headline is today's totals, and the lines are the latest calls, newest first, no more than five", () => {
    const tail = tailOf(usageWith(Array.from({ length: 9 }, (_, i) => call(i))), NOW);
    expect(tail.headline).toBe("Hoje: 2 consultas ao modelo, 1.500 tokens, custo em dolar nao medido");
    expect(tail.recent).toHaveLength(5);
    expect(tail.recent[0]).toBe(recentLine(parseUsage({ ...GOOD, recent: [call(0)] })!.recent[0]!, NOW));
    expect(tail.recent[0]).toContain("740 tokens");
    expect(tail.recent[4]).toContain("744 tokens");
  });

  test("a refused request is a line too: no model, how it ended, and nothing invented for the tokens", () => {
    const tail = tailOf(usageWith([call(0, { modelo: null, resultado: "erro:sem_sinais", tokens: null, latenciaMs: null })]), NOW);
    expect(tail.recent[0]).toBe("ha 30 s, ativo, sem modelo, recusado (sem registros de carteiras)");
  });

  test("before the ledger answers it says it is reading, and when it cannot be read it says so instead of showing zeros", () => {
    expect(tailOf(undefined, NOW)).toEqual({ headline: "Lendo o registro de pedidos", recent: [] });
    expect(tailOf(null, NOW)).toEqual({ headline: "O registro de pedidos nao esta disponivel agora", recent: [] });
  });

  test("with no request yet it says so, and lists nothing", () => {
    expect(tailOf(usageWith([], T({ calls: 0, tokens: 0, usd: 0 })), NOW)).toEqual({ headline: "Hoje: nenhuma consulta ao modelo", recent: [] });
  });

  test("plain ASCII, no middle dot, em dash or en dash", () => {
    const tail = tailOf(usageWith([call(0), call(1, { modelo: null, resultado: "teto_diario", tokens: null })]), NOW);
    for (const text of [tail.headline, ...tail.recent, tailOf(null, NOW).headline, tailOf(undefined, NOW).headline]) {
      expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
      expect(text).not.toMatch(/[·—–]/);
    }
  });
});
