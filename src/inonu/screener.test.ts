// RAS-5, AC-RAS-2: "Perguntar ao Inonu" in the Rastreador turns a sentence into a filter. The model gets the sentence and a closed
// set of questions with fixed options; it never writes a number or a field name, so what comes back is one option per question
// and the code builds the filter from them. Anything that is not exactly one of the offered options is no filter at all.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { FILTER_QUESTIONS, MAX_QUESTION_CHARS, buildFilterState, filterFromChoices, type ScreenerChoices } from "./screener";

const all = (over: Partial<ScreenerChoices> = {}): ScreenerChoices => ({ mercado: "todos", volume: "qualquer", variacao: "qualquer", posicao: "qualquer", ordem: "volume", fixados: "nao", ...over });

describe("the questions", () => {
  test("six questions, each with a closed list of options and a plain description of each option", () => {
    expect(Object.keys(FILTER_QUESTIONS).sort()).toEqual(["fixados", "mercado", "ordem", "posicao", "variacao", "volume"]);
    for (const question of Object.values(FILTER_QUESTIONS)) {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(question.options.map((o) => o.id)).size).toBe(question.options.length);
      for (const option of question.options) expect(option.meaning.length).toBeGreaterThan(5);
    }
  });

  test("every option of every question builds a valid filter, and the default option is the neutral one", () => {
    for (const [name, question] of Object.entries(FILTER_QUESTIONS)) {
      for (const option of question.options) {
        const verdict = filterFromChoices(all({ [name]: option.id } as Partial<ScreenerChoices>));
        expect(verdict.ok).toBe(true);
      }
    }
    const neutral = filterFromChoices(all());
    expect(neutral).toEqual({ ok: true, filtro: { mercado: "todos", volUsdMin: null, varMin: null, varMax: null, rankMax: null, apenasFixados: false, ordenar: { chave: "volUsd24h", direcao: "desc" } } });
  });
});

describe("the state the model sees", () => {
  test("is the sentence and nothing else: no market data, no instrument, no key", () => {
    const state = buildFilterState("perpetuos com mais volume que subiram hoje");
    expect(Object.keys(state).sort()).toEqual(["pergunta", "tipo"]);
    expect(state.tipo).toBe("filtro_do_rastreador");
    expect(state.pergunta).toBe("perpetuos com mais volume que subiram hoje");
  });

  test("the sentence is cleaned and cut: control characters go and so does everything past the limit", () => {
    const state = buildFilterState(`  oi\u0000 \n tudo  ${"x".repeat(1000)}`);
    expect(state.pergunta.length).toBeLessThanOrEqual(MAX_QUESTION_CHARS);
    expect(state.pergunta.startsWith("oi tudo")).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u001f]/.test(state.pergunta)).toBe(false);
  });
});

describe("the filter built from the choices", () => {
  test("market, volume, rank and pins", () => {
    const r = filterFromChoices(all({ mercado: "perp", volume: "100M", posicao: "top50", fixados: "sim" }));
    expect(r).toMatchObject({ ok: true, filtro: { mercado: "perp", volUsdMin: 100_000_000, rankMax: 50, apenasFixados: true } });
  });

  test("the change of the day, one option per band", () => {
    const f = (variacao: ScreenerChoices["variacao"]) => (filterFromChoices(all({ variacao })) as { ok: true; filtro: { varMin: number | null; varMax: number | null } }).filtro;
    expect(f("alta_forte")).toMatchObject({ varMin: 10, varMax: null });
    expect(f("alta")).toMatchObject({ varMin: 3, varMax: null });
    expect(f("queda")).toMatchObject({ varMin: null, varMax: -3 });
    expect(f("queda_forte")).toMatchObject({ varMin: null, varMax: -10 });
    expect(f("calmo")).toMatchObject({ varMin: -1, varMax: 1 });
  });

  test("the order is a sort key and a direction from the table of the page, never free text", () => {
    const o = (ordem: ScreenerChoices["ordem"]) => (filterFromChoices(all({ ordem })) as { ok: true; filtro: { ordenar: unknown } }).filtro.ordenar;
    expect(o("volume")).toEqual({ chave: "volUsd24h", direcao: "desc" });
    expect(o("alta")).toEqual({ chave: "var24hPct", direcao: "desc" });
    expect(o("queda")).toEqual({ chave: "var24hPct", direcao: "asc" });
    expect(o("preco")).toEqual({ chave: "preco", direcao: "desc" });
  });

  test("an option that was not offered, a missing question, an extra key or a non string is no filter, with the reason", () => {
    expect(filterFromChoices({ ...all(), mercado: "onchain" })).toEqual({ ok: false, reason: "opcao_invalida:mercado" });
    expect(filterFromChoices({ ...all(), volume: 5 })).toEqual({ ok: false, reason: "opcao_invalida:volume" });
    const { ordem: _drop, ...missing } = all();
    expect(filterFromChoices(missing)).toEqual({ ok: false, reason: "opcao_ausente:ordem" });
    expect(filterFromChoices({ ...all(), extra: "x" })).toEqual({ ok: false, reason: "campo_desconhecido:extra" });
    expect(filterFromChoices(null)).toEqual({ ok: false, reason: "resposta_invalida" });
    expect(filterFromChoices("mercado:perp")).toEqual({ ok: false, reason: "resposta_invalida" });
    expect(filterFromChoices([])).toEqual({ ok: false, reason: "resposta_invalida" });
  });

  test("the model's own words never end up in the filter", () => {
    const r = filterFromChoices({ ...all(), mercado: "perp", razao: "porque sim" });
    expect(r.ok).toBe(false);
  });
});
