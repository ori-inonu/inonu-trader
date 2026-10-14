// The thermometer says who is in charge, how far the nearest zone is, and what the Inonu last answered. The code describes; only the Inonu's own answer
// carries a word of an order. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { COMPRAR, ESPERAR_PELO_CUSTO } from "../veredito/test-fixtures";
import { FRESH_ANSWER_MS, guardTrades, HOLD_MS, MIN_TRADES, nearestZone, nearestZoneGapPct, NEAR_ASK_PCT, NEAR_ZONE_PCT, pressureFromBand, pressureOf, thermometer, type ThermoInput, type ThermoZone } from "./thermometer";

const zone = (over: Partial<ThermoZone> = {}): ThermoZone => ({ lado: "demanda", baixo: 99, alto: 100, estado: "ativa", ...over });

describe("pressureOf", () => {
  test("five readings from sellers in charge to buyers in charge, in words anyone reads", () => {
    expect(pressureOf(1)).toEqual({ tone: "buy", word: "Compradores no comando", pct: 100 });
    expect(pressureOf(0.5).word).toBe("Compradores no comando");
    expect(pressureOf(0.3)).toEqual({ tone: "buy", word: "Compradores um pouco a frente", pct: 30 });
    expect(pressureOf(0)).toEqual({ tone: "flat", word: "Equilibrado", pct: 0 });
    expect(pressureOf(-0.1).tone).toBe("flat");
    expect(pressureOf(-0.3)).toEqual({ tone: "sell", word: "Vendedores um pouco a frente", pct: -30 });
    expect(pressureOf(-0.9)).toEqual({ tone: "sell", word: "Vendedores no comando", pct: -90 });
  });

  test("the edges of the bands belong to the stronger side", () => {
    expect(pressureOf(0.15).tone).toBe("buy");
    expect(pressureOf(-0.15).tone).toBe("sell");
    expect(pressureOf(-0.5).word).toBe("Vendedores no comando");
  });

  test("a minute with too few trades is not a reading: one buyer alone is not all the buyers", () => {
    expect(pressureOf(1, MIN_TRADES - 1)).toEqual({ tone: "none", word: "Pouca negociacao agora", pct: null });
    expect(pressureOf(1, MIN_TRADES).tone).toBe("buy");
    expect(pressureOf(-1, 0).tone).toBe("none");
    // a count that is not known does not block a reading that was measured
    expect(pressureOf(0.6, null).tone).toBe("buy");
    expect(pressureOf(0.6, Number.NaN).tone).toBe("buy");
    expect(thermometer({ imbalance: -1, trades: 3, price: null, zones: [], answer: null, nowMs: 1 }).pressure.word).toBe("Pouca negociacao agora");
  });

  test("a value outside the scale is held at the scale, and a value that is not a number is not a reading", () => {
    expect(pressureOf(7)).toEqual({ tone: "buy", word: "Compradores no comando", pct: 100 });
    expect(pressureOf(-7).pct).toBe(-100);
    for (const bad of [null, Number.NaN, Number.POSITIVE_INFINITY]) expect(pressureOf(bad)).toEqual({ tone: "none", word: "Ainda lendo o mercado", pct: null });
  });
});

describe("nearestZone", () => {
  test("a zone of buyers below the price, with the gap from the price to its top edge", () => {
    expect(nearestZone(100.3, [zone({ baixo: 99, alto: 100 })])).toEqual({ tone: "buy", text: "Zona de compradores a 0,3% abaixo do preco" });
  });

  test("a zone of sellers above the price, with the gap from the price to its bottom edge", () => {
    expect(nearestZone(100, [zone({ lado: "oferta", baixo: 101, alto: 102 })])).toEqual({ tone: "sell", text: "Zona de vendedores a 1,0% acima do preco" });
  });

  test("a zone the price is touching is not \"0,0% away\"", () => {
    expect(nearestZone(100.02, [zone({ baixo: 99, alto: 100 })])).toEqual({ tone: "buy", text: "Preco encostado numa zona de compradores" });
    expect(nearestZone(99.97, [zone({ lado: "oferta", baixo: 100, alto: 101 })])?.text).toBe("Preco encostado numa zona de vendedores");
    expect(nearestZone(100.1, [zone({ baixo: 99, alto: 100 })])?.text).toBe("Zona de compradores a 0,1% abaixo do preco");
  });

  test("the price inside a zone says so, and says when the zone was already tested", () => {
    expect(nearestZone(99.5, [zone()])).toEqual({ tone: "buy", text: "Preco dentro de uma zona de compradores" });
    expect(nearestZone(99.5, [zone({ estado: "testada" })])?.text).toBe("Preco dentro de uma zona de compradores, ja testada");
  });

  test("the nearest of several wins; a neutral zone, a far one or a broken one is not considered", () => {
    const zones = [zone({ baixo: 90, alto: 91 }), zone({ lado: "oferta", baixo: 102, alto: 103 }), zone({ lado: "neutra", baixo: 99.9, alto: 100.1 }), zone({ baixo: 100, alto: 99 })];
    expect(nearestZone(100, zones)?.text).toBe("Zona de vendedores a 2,0% acima do preco");
    expect(nearestZone(100, [zone({ baixo: 90, alto: 100 - NEAR_ZONE_PCT - 1 })])).toBeNull();
    expect(nearestZone(100, [zone({ lado: "neutra" })])).toBeNull();
    expect(nearestZone(100, [])).toBeNull();
  });

  test("no price, or a price that is not a number, is no zone", () => {
    for (const price of [null, 0, -5, Number.NaN]) expect(nearestZone(price, [zone()])).toBeNull();
  });
});

describe("thermometer", () => {
  const NOW = 10_000_000;
  const base = { imbalance: 0.6, price: 100.3, zones: [zone()], nowMs: NOW };

  test("all three parts together", () => {
    const t = thermometer({ ...base, answer: { action: "hold", atMs: NOW - 7 * 60_000 } });
    expect(t.pressure.word).toBe("Compradores no comando");
    expect(t.zone?.text).toBe("Zona de compradores a 0,3% abaixo do preco");
    expect(t.answer).toEqual({ action: "hold", word: "Esperar", age: "ha 7 min", fresh: true, reasons: [], plan: null, profit: null });
  });

  test("the words of the answer are the Inonu's: comprar, vender, esperar", () => {
    expect(thermometer({ ...base, answer: { action: "buy", atMs: NOW } }).answer?.word).toBe("Comprar");
    expect(thermometer({ ...base, answer: { action: "sell", atMs: NOW } }).answer?.word).toBe("Vender");
    expect(thermometer({ ...base, answer: { action: "hold", atMs: NOW } }).answer?.word).toBe("Esperar");
  });

  test("an answer goes old after half an hour, and the age is told in minutes, hours and days", () => {
    expect(thermometer({ ...base, answer: { action: "buy", atMs: NOW - FRESH_ANSWER_MS } }).answer?.fresh).toBe(true);
    expect(thermometer({ ...base, answer: { action: "buy", atMs: NOW - FRESH_ANSWER_MS - 1 } }).answer?.fresh).toBe(false);
    expect(thermometer({ ...base, answer: { action: "buy", atMs: NOW - 30_000 } }).answer?.age).toBe("agora ha pouco");
    expect(thermometer({ ...base, answer: { action: "buy", atMs: NOW - 3 * 3_600_000 } }).answer?.age).toBe("ha 3 h");
    expect(thermometer({ ...base, answer: { action: "buy", atMs: NOW - 2 * 86_400_000 } }).answer?.age).toBe("ha 2 d");
  });

  test("no answer, or a clock that is not a number, is no answer; a clock behind the answer does not print a negative age", () => {
    expect(thermometer({ ...base, answer: null }).answer).toBeNull();
    expect(thermometer({ ...base, nowMs: Number.NaN, answer: { action: "buy", atMs: 1 } }).answer).toBeNull();
    expect(thermometer({ ...base, answer: { action: "buy", atMs: NOW + 60_000 } }).answer?.age).toBe("agora ha pouco");
  });

  test("the code never says what to do: no word of an order in anything it describes", () => {
    const words = new Set<string>();
    for (const v of [1, 0.3, 0, -0.3, -1, null]) words.add(pressureOf(v).word);
    for (const price of [99.5, 100.3, 98, 101]) {
      const z = nearestZone(price, [zone(), zone({ lado: "oferta", baixo: 101, alto: 102 })]);
      if (z) words.add(z.text);
    }
    for (const w of words) expect(w.toLowerCase()).not.toMatch(/compre|comprar|venda\b|vender|\bhold\b|\bbuy\b|\bsell\b|sinal|recomend/);
  });
});

describe("the steady reading", () => {
  const NOW = 10_000_000;
  const base = { imbalance: -1, price: 100, zones: [], answer: null, nowMs: NOW };

  test("when a steady reading is given the words follow it, not the raw second", () => {
    const t = thermometer({ ...base, trades: 120, stable: { band: "buy1", pct: 25, sinceMs: 0 } });
    expect(t.pressure).toEqual({ tone: "buy", word: "Compradores um pouco a frente", pct: 25 });
    // without it the raw second is read, as before
    expect(thermometer({ ...base, trades: 120 }).pressure.tone).toBe("sell");
  });

  test("a steady reading that is not there yet is no reading, and a quiet minute still says so", () => {
    expect(thermometer({ ...base, stable: null }).pressure).toEqual({ tone: "none", word: "Ainda lendo o mercado", pct: null });
    expect(thermometer({ ...base, trades: 3, stable: { band: "buy2", pct: 80, sinceMs: 0 } }).pressure.word).toBe("Pouca negociacao agora");
    expect(pressureFromBand("flat", 0, MIN_TRADES).tone).toBe("flat");
  });
});

describe("the answer with its verdict", () => {
  const NOW = 10_000_000;
  const base = { imbalance: 0.6, trades: 100, price: 99.5, zones: [], nowMs: NOW, base: "BTC", measured: "Acerto do Inonu: ainda nao medido." };
  const answer = (veredito: typeof COMPRAR, ago = 60_000) => ({ action: "buy" as const, atMs: NOW - ago, veredito });

  test("a fresh answer with a plan: the reasons (two at most), the three rows a person acts on in their order, and the account of the profit", () => {
    const a = thermometer({ ...base, answer: answer(COMPRAR) }).answer!;
    expect(a.word).toBe("Comprar");
    expect(a.reasons).toEqual(COMPRAR.motivos.slice(0, 2));
    expect(a.plan!.map((r) => r.rotulo)).toEqual(["Entrada", "Alvo", "A ideia cai em"]);
    expect(a.plan![0]!.valor).toBe("98,500 a 99,500");
    expect(a.profit![0]).toBe("Se der certo: +3,28% (alvo 3,52% menos 0,24% de custo).");
    expect(a.profit![2]).toBe("Para empatar, o plano precisa dar certo em 35% das vezes. Acerto do Inonu: ainda nao medido.");
  });

  test("an old answer shows neither its plan nor its profit nor its reasons: the price it was made for has moved on", () => {
    const a = thermometer({ ...base, answer: answer(COMPRAR, FRESH_ANSWER_MS + 1) }).answer!;
    expect(a.fresh).toBe(false);
    expect(a.plan).toBeNull();
    expect(a.profit).toBeNull();
    expect(a.reasons).toEqual([]);
  });

  test("a wait has no plan; a wait forced by a gate says the gate's own words", () => {
    const wait = thermometer({ ...base, answer: { action: "hold", atMs: NOW - 1000, veredito: ESPERAR_PELO_CUSTO } }).answer!;
    expect(wait.plan).toBeNull();
    expect(wait.profit).toBeNull();
    expect(wait.reasons).toEqual([ESPERAR_PELO_CUSTO.mensagem]);
  });

  test("an answer with no verdict (an old one, kept before the verdict was) still shows its word and its age", () => {
    const a = thermometer({ ...base, answer: { action: "sell", atMs: NOW - 1000 } }).answer!;
    expect(a).toMatchObject({ word: "Vender", fresh: true, reasons: [], plan: null, profit: null });
  });

  test("a plan the cost eats is said in one line, not shown as a gain", () => {
    const eaten = { ...COMPRAR, plano: { ...COMPRAR.plano!, custoBps: 400 } };
    expect(thermometer({ ...base, answer: answer(eaten) }).answer!.profit).toEqual(["O custo de entrar e sair (4,00%) come o alvo (3,52%): este plano nao paga."]);
  });
});

describe("the trades the guard reads", () => {
  test("the count the window really holds, not the rate over a few seconds times sixty", () => {
    // five trades in the ten seconds a page has seen: the rate says 0,5 a second, thirty a minute, which would pass the guard; the count says five
    expect(guardTrades({ tradesPerSecond60s: 0.5, tradeCount60s: 5 })).toBe(5);
    expect(pressureOf(1, guardTrades({ tradesPerSecond60s: 0.5, tradeCount60s: 5 })).tone).toBe("none");
    expect(pressureOf(1, guardTrades({ tradesPerSecond60s: 0.5, tradeCount60s: MIN_TRADES })).tone).toBe("buy");
  });

  test("a reading with no count falls back to the rate, and none at all is unknown", () => {
    expect(guardTrades({ tradesPerSecond60s: 0.5 })).toBe(30);
    expect(guardTrades({ tradesPerSecond60s: null })).toBeNull();
    expect(guardTrades({ tradesPerSecond60s: null, tradeCount60s: null })).toBeNull();
  });
});

describe("the scenario: what has to line up before a question is worth its cost", () => {
  const NOW = 50_000_000;
  const ready = (over: Partial<ThermoInput> = {}): ThermoInput => ({
    imbalance: 0.6, trades: 120, price: 100.3, zones: [zone({ baixo: 99, alto: 100 })], answer: null, nowMs: NOW,
    stable: { band: "buy1", pct: 40, sinceMs: NOW - 4 * 60_000 },
    market: { thickness: "fluido", text: "Mercado fluido: ir e voltar com US$ 1.000 custa US$ 0,10 (0,01%)." },
    ...over,
  });

  test("four conditions, each said as a fact: a zone near, a side that has held, the flow and the zone on the same side, a cheap market", () => {
    const s = thermometer(ready()).scenario;
    expect(s.conditions.map((c) => [c.id, c.ok])).toEqual([["zona", true], ["fluxo", true], ["lado", true], ["mercado", true]]);
    expect(s.conditions[0]!.text).toBe("Zona de compradores a 0,3% abaixo do preco");
    expect(s.conditions[1]!.text).toBe("Compradores um pouco a frente ha 4 min");
    expect(s.conditions[2]!.text).toBe("Fluxo e zona estao do mesmo lado");
    expect(s.aligned).toBe(4);
    expect(s.known).toBe(4);
  });

  test("enough conditions and no recent answer: a question is worth asking, and the headline says why", () => {
    const s = thermometer(ready()).scenario;
    expect(s.worthAsking).toBe(true);
    expect(s.headline).toBe("Vale perguntar ao Inonu agora: 4 de 4 condicoes alinhadas e sem resposta recente.");
    // three of four is still enough
    expect(thermometer(ready({ market: { thickness: "raso", text: "Mercado raso: o livro conhecido nao cobre US$ 1.000." } })).scenario).toMatchObject({ aligned: 3, known: 4, worthAsking: true });
  });

  test("a recent answer of the Inonu means a new question brings nothing: the scenario is told, the question is not urged", () => {
    const s = thermometer(ready({ answer: { action: "hold", atMs: NOW - 7 * 60_000 } })).scenario;
    expect(s.worthAsking).toBe(false);
    expect(s.headline).toBe("Cenario alinhado (4 de 4) e o Inonu ja respondeu ha 7 min.");
    // an old answer is no answer: asking again brings news
    expect(thermometer(ready({ answer: { action: "hold", atMs: NOW - FRESH_ANSWER_MS - 1 } })).scenario.worthAsking).toBe(true);
  });

  test("a side that has been in charge for less than a minute is not counted on, and says how long it has been", () => {
    const s = thermometer(ready({ stable: { band: "buy2", pct: 70, sinceMs: NOW - 20_000 } })).scenario;
    expect(s.conditions[1]).toMatchObject({ ok: false });
    expect(s.conditions[1]!.text).toBe("Compradores no comando, mas ha menos de 1 min: ainda cedo para contar com isso");
    expect(HOLD_MS).toBe(60_000);
    // exactly a minute is enough
    expect(thermometer(ready({ stable: { band: "buy1", pct: 40, sinceMs: NOW - HOLD_MS } })).scenario.conditions[1]!.ok).toBe(true);
  });

  test("balanced flow, flow against the zone, and a zone that is far are each a plain no", () => {
    expect(thermometer(ready({ stable: { band: "flat", pct: 0, sinceMs: NOW - 10 * 60_000 } })).scenario.conditions[1]).toMatchObject({ ok: false, text: "Ninguem manda no momento: compradores e vendedores equilibrados" });
    const opposite = thermometer(ready({ stable: { band: "sell1", pct: -40, sinceMs: NOW - 5 * 60_000 } })).scenario.conditions[2]!;
    expect(opposite).toMatchObject({ ok: false, text: "Fluxo e zona estao de lados opostos" });
    const far = thermometer(ready({ zones: [zone({ baixo: 95, alto: 97 })] })).scenario.conditions[0]!;
    expect(far.ok).toBe(false);
    expect(far.text).toBe("A zona mais perto esta a 3,3% do preco, longe");
    expect(thermometer(ready({ zones: [] })).scenario.conditions[0]).toMatchObject({ ok: false, text: "Nenhuma zona de compradores ou vendedores perto do preco" });
  });

  test("what the code cannot read is unknown, not a no: a quiet minute, no book, no price", () => {
    const quiet = thermometer(ready({ trades: 3 })).scenario;
    expect(quiet.conditions[1]).toMatchObject({ ok: null, text: "Pouca negociacao agora" });
    expect(quiet.conditions[2]!.ok).toBeNull();
    expect(quiet.known).toBe(2);
    expect(quiet.worthAsking).toBe(false);
    expect(quiet.headline).toBe("Ainda lendo o mercado: 2 de 4 condicoes puderam ser lidas.");
    expect(thermometer(ready({ market: null })).scenario.conditions[3]).toMatchObject({ ok: null });
    expect(thermometer(ready({ price: null })).scenario.conditions[0]).toMatchObject({ ok: null });
    expect(thermometer(ready({ trades: 3, market: null, price: null })).scenario.headline).toBe("Ainda lendo o mercado: 0 de 4 condicoes puderam ser lidas.");
  });

  test("the gap to the closest zone, whatever it is, and the limit of near", () => {
    expect(nearestZoneGapPct(100.3, [zone({ baixo: 99, alto: 100 })])).toBeCloseTo(0.2991, 3);
    expect(nearestZoneGapPct(100, [zone({ baixo: 90, alto: 95 })])).toBeCloseTo(5, 6);
    expect(nearestZoneGapPct(100, [])).toBeNull();
    expect(nearestZoneGapPct(null, [zone()])).toBeNull();
    expect(NEAR_ASK_PCT).toBe(1);
  });

  test("it describes and never says what to do: no verb of an order in any line, plain ASCII", () => {
    const texts = [thermometer(ready()), thermometer(ready({ stable: { band: "sell1", pct: -30, sinceMs: NOW - 10_000 } })), thermometer(ready({ answer: { action: "buy", atMs: NOW - 60_000 } })), thermometer(ready({ market: null, zones: [] }))]
      .flatMap((t) => [t.scenario.headline, ...t.scenario.conditions.map((c) => c.text)])
      .join(" ");
    expect(texts).not.toMatch(/[^ -~]/);
    expect(texts.toLowerCase()).not.toMatch(/(comprar|compre|vender|venda|sinal|recomend|aconselh|deve)/);
  });
});
