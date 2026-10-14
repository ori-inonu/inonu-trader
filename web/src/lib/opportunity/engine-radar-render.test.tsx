// The radar of the Inonu tab, drawn: every state of it without a server or a model. The code describes (how far out of the ordinary each pair is, three readings, the marks that give pause)
// and says what the history measured; the only way to the model is the ticked pairs and its own button. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EngineRadarView, type EngineRadarViewProps } from "@/components/Desk/Dock/EngineRadar";
import type { EngineBoard, EnginePair, EngineRead } from "./engine";
import type { EngineView } from "./useEngineBoard";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
const noop = () => {};

const read = (over: Partial<EngineRead> = {}): EngineRead => ({
  price: 100, pos30: 0.2, drawdown90: 0.4, rsi14: 31, roomToHigh30: 0.5, gapToLow30: 0.1, roomRatio: 5, volRatio: 2.1, noNewLow: true, aboveSma5: true, atrPct: 0.05, meanVol30: 5e6,
  held: { desconto: true, virada: true, participacao: true }, count: 3, ...over,
});
const pair = (id: string, over: Partial<EnginePair> = {}): EnginePair => ({ instId: `${id}-USDT`, base: id, price: 100, change24h: 0.12, volQuote24h: 8_000_000, spreadBps: 1.2, attention: 1.4, moveAtr: 2.4, read: read(), ...over });
const board = (pairs: EnginePair[], universe = { listed: 427, liquid: 90, read: 85, failed: 5 }): EngineBoard => ({ asOfMs: 1_000, universe, pairs });
const ready = (pairs: EnginePair[]): EngineView => ({ state: { state: "pronto", board: board(pairs) }, reason: null });

const props = (view: EngineView, over: Partial<EngineRadarViewProps> = {}): EngineRadarViewProps => ({
  view, nowMs: 181_000, focus: "BTC-USDT", chosen: [], locked: false, onOpen: noop, onToggle: noop, onChooseTop: noop, onClear: noop, ...over,
});
const draw = (view: EngineView, over: Partial<EngineRadarViewProps> = {}) => renderToStaticMarkup(<EngineRadarView {...props(view, over)} />);

describe("a ready board", () => {
  const html = draw(ready([pair("AAA"), pair("BBB", { change24h: -0.1, moveAtr: -2, attention: 1.1, read: read({ held: { desconto: false, virada: false, participacao: true }, count: 1 }) })]));

  test("says how old the reading is and how many pairs were read, and what failed", () => {
    expect(html).toContain("Lido ha 3 min: 85 de 90 pares liquidos, 5 sem leitura");
    expect(html).toContain('aria-label="Pares liquidos, do mais fora do normal ao menos"');
  });

  test("each pair: symbol, price, signed change, how far out of the ordinary, the three readings with what each one measured", () => {
    expect(html).toContain('aria-label="Abrir AAA no grafico"');
    expect(html).toContain("+12,00%");
    expect(html).toContain("-10,00%");
    expect(html).toContain("mov. +2,4x, vol. 2,1x");
    expect(html).toContain("mov. -2,0x, vol. 2,1x");
    for (const label of ["Desconto", "Virada", "Participacao"]) expect(html).toContain(label);
    expect(html).toContain("no 20% da faixa de 30 dias (0% e a minima) e 40% abaixo da maxima de 90 dias, RSI 31");
    expect(html.match(/data-on="true"/g)?.length).toBe(4);
    expect(html.match(/data-on="false"/g)?.length).toBe(2);
  });

  test("the rows are in the order the core gave, and the focused pair is marked", () => {
    expect(html.indexOf("Abrir AAA")).toBeLessThan(html.indexOf("Abrir BBB"));
    expect(draw(ready([pair("AAA"), pair("BTC")]), { focus: "BTC-USDT" })).toContain('aria-current="true"');
  });

  test("it says plainly what the history measured, and that the order is where to look and never what to buy", () => {
    expect(html).toContain("nenhuma leitura do historico de precos teve vantagem firme");
    expect(html).toContain("nao o que vai subir");
    expect(html).toContain("Nao e uma ordem de retorno esperado");
  });

  test("the first three can be ticked with one button, and each pair has its own control with a limit stated", () => {
    expect(html).toContain("Escolher as 3 primeiras");
    expect(html).toContain('aria-label="Escolher AAA para o ranking"');
    const full = draw(ready([pair("AAA"), pair("BBB"), pair("CCC"), pair("DDD"), pair("EEE"), pair("FFF")]), { chosen: ["AAA-USDT", "BBB-USDT", "CCC-USDT", "DDD-USDT", "EEE-USDT"] });
    expect(full).toContain("Limite de 5 por pedido");
  });
});

describe("the choice for the ranking", () => {
  test("a ticked pair is pressed, the line says how many, and a request in flight holds the choice", () => {
    const view = ready([pair("AAA"), pair("BBB")]);
    const html = draw(view, { chosen: ["AAA-USDT", "BBB-USDT"] });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Limpar escolha");
    const held = draw(view, { chosen: ["AAA-USDT", "BBB-USDT"], locked: true });
    expect(held).toContain("Pedido em andamento: a escolha fica travada ate a resposta");
    expect(held).toMatch(/<button[^>]*disabled=""[^>]*>Escolher as 3 primeiras/);
  });

  test("the ranking panel and the network card sit where the owner puts them", () => {
    const html = draw(ready([pair("AAA"), pair("BBB")]), { chosen: ["AAA-USDT", "BBB-USDT"], rankingSlot: <p>PAINEL DO RANKING</p>, networkSlot: <p>CARTAO DA REDE</p> });
    expect(html).toContain("PAINEL DO RANKING");
    expect(html).toContain("CARTAO DA REDE");
  });
});

describe("the other states", () => {
  test("before the first answer, and while the core reads (with the progress)", () => {
    expect(draw({ state: null, reason: null })).toContain("Chamando o motor");
    const reading = draw({ state: { state: "lendo", done: 12, of: 90, board: null }, reason: null });
    expect(reading).toContain("Lendo o historico de cada par: 12 de 90");
    expect(reading).not.toContain('role="table"');
    expect(draw({ state: { state: "lendo", done: 0, of: 0, board: null }, reason: null })).toContain("Lendo a lista de pares da OKX");
  });

  test("while it reads again the last board stays on screen", () => {
    const html = draw({ state: { state: "lendo", done: 3, of: 90, board: board([pair("AAA")]) }, reason: null });
    expect(html).toContain("Lendo o historico de cada par: 3 de 90");
    expect(html).toContain('aria-label="Abrir AAA no grafico"');
  });

  test("a failure says which one, in words, and the simple list takes the place of the board with its own label", () => {
    const down = draw({ state: null, reason: "servidor_sem_rota" }, { fallback: <p>LISTA SIMPLES</p> });
    expect(down).toContain("O servidor local e mais antigo que o motor: reinicie-o");
    expect(down).toContain("LISTA SIMPLES");
    expect(down).toContain("que nao e uma leitura de oportunidade");
    expect(draw({ state: { state: "erro", code: "timeout", board: null }, reason: null }, { fallback: <p>LISTA SIMPLES</p> })).toContain("A OKX nao respondeu ao motor agora");
    // with a board from before, the error does not hide it and the simple list is not offered
    const old = draw({ state: { state: "erro", code: "timeout", board: board([pair("AAA")]) }, reason: null }, { fallback: <p>LISTA SIMPLES</p> });
    expect(old).toContain("a leitura abaixo e a anterior");
    expect(old).not.toContain("LISTA SIMPLES");
  });

  test("an empty board is said, not filled in", () => {
    expect(draw(ready([]))).toContain("Nenhum par liquido foi lido agora");
  });

  test("more pairs than the budget of a tab: only twelve, and it says how many were read", () => {
    const many = Array.from({ length: 20 }, (_, i) => pair(`P${String(i).padStart(2, "0")}`));
    const html = draw(ready(many));
    expect(html.match(/aria-label="Abrir P\d\d no grafico"/g)?.length).toBe(12);
    expect(html).toContain("Mostrando 12 dos 20 pares lidos, na ordem acima.");
  });
});

describe("the words on the screen", () => {
  test("no middle dot, no dash, no broken number and no word of an order, in any state", () => {
    const states: EngineView[] = [
      ready([pair("AAA", { change24h: null, moveAtr: null, read: read({ volRatio: null, rsi14: null, atrPct: 0.2 }) }), pair("BBB")]),
      { state: null, reason: "sem_conexao" },
      { state: { state: "lendo", done: 1, of: 2, board: null }, reason: null },
      { state: { state: "erro", code: "timeout", board: null }, reason: null },
    ];
    for (const view of states) {
      const html = draw(view, { chosen: ["AAA-USDT", "BBB-USDT"] });
      expect(html).not.toMatch(FORBIDDEN);
      const content = html.replace(/ class="[^"]*"/g, "").replace(/ style="[^"]*"/g, "");
      for (const word of ["NaN", "undefined", "Infinity"]) expect(content).not.toContain(word);
      expect(content.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|sinais|aconselh|deve)\b/);
    }
  });
});
