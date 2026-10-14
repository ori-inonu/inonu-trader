// RAS-1, RAS-3, RAS-4, AC-RAS-1: the screen of the Rastreador. A table of the exchange's own pairs with the documented views,
// filters, sort and saved screens, every empty state honest, nothing animated, plain ASCII. The container with the hooks is
// not rendered here; this is the pure screen, so each state is drawn without a network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RastreadorScreen, type AskPanelState, type RastreadorScreenProps } from "@/components/Rastreador/RastreadorView";
import type { DeskTicker } from "../desk/types";
import { DEFAULT_FILTERS, DEFAULT_SORT, buildRows } from "./model";

const ticker = (instId: string, last: number, over: Partial<DeskTicker> = {}): DeskTicker => ({
  instId, last, open24h: last * 0.95, high24h: null, low24h: null, volBase24h: 10, volQuote24h: 5_000_000, bidPx: null, bidSz: null, askPx: null, askSz: null, tsMs: 1, ...over,
});
const rows = buildRows(
  [ticker("BTC-USDT", 80_000, { volQuote24h: 900_000_000 }), ticker("ETH-USDT", 2_500, { volQuote24h: 400_000_000 }), ticker("PEPE-USDT", 0.00001)],
  [ticker("BTC-USDT-SWAP", 80_010, { volBase24h: 1_000, volQuote24h: null })],
  new Map([["BTC-USDT-SWAP", 1]]),
);

const noop = () => {};
const props = (over: Partial<RastreadorScreenProps> = {}): RastreadorScreenProps => ({
  status: "ready", error: null, partial: null, updatedAtMs: 1_000_000, nowMs: 1_012_000, totalRows: rows.length, rows,
  view: "geral", filters: DEFAULT_FILTERS, sort: DEFAULT_SORT,
  cellContext: { windowIds: new Set(rows.map((r) => r.id)), pressure: new Map(), performance: new Map(), nowMs: 1_012_000 },
  pins: new Set(["BTC-USDT"]), lockedPins: new Set(["BTC-USDT"]), screens: [], selectedId: null,
  chosen: [], chosenLocked: false, onChoose: noop, onClearChosen: noop, rankingPanel: null,
  universe: "corretora", onUniverse: noop, onchainBody: null,
  ask: { phase: "idle", text: "" },
  onAskText: noop, onAsk: noop, onCancelAsk: noop, onToggleChip: noop, onApplyProposal: noop, onDiscardProposal: noop,
  onView: noop, onFilters: noop, onSort: noop, onPin: noop, onOpen: noop, onSelect: noop, onSaveScreen: noop, onApplyScreen: noop, onRemoveScreen: noop, onWindow: noop,
  ...over,
});
const draw = (over: Partial<RastreadorScreenProps> = {}) => renderToStaticMarkup(<RastreadorScreen {...props(over)} />);

describe("the page", () => {
  test("is the Rastreador, with the way back to the desk and the count of what is shown", () => {
    const html = draw();
    expect(html).toContain("Rastreador");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Mesa<\/a>/);
    expect(html).toContain("4 de 4 ativos");
    expect(html).toContain("Atualizado ha 12 s");
  });

  test("a filtered list says how many of how many", () => {
    expect(draw({ rows: rows.slice(0, 2) })).toContain("2 de 4 ativos");
  });
});

describe("views", () => {
  test("five views; the first three are buttons you can press, the on-chain ones are disabled with the reason", () => {
    const html = draw();
    for (const label of ["Visao geral", "Desempenho", "Fluxo", "Smart money", "Risco"]) expect(html).toContain(label);
    expect(html.match(/role="tab"/g)?.length).toBe(5);
    expect(html).toMatch(/aria-selected="true"[^>]*>Visao geral/);
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Carteiras rastreadas e risco existem para tokens on-chain");
  });

  test("the columns follow the view", () => {
    const geral = draw({ view: "geral" });
    for (const label of ["Rank", "Ativo", "Preco", "Var 24h", "Vol USD 24h", "Pressao de fluxo", "Mercado"]) expect(geral).toContain(label);
    const desempenho = draw({ view: "desempenho" });
    for (const label of ["Var 1 h", "Var 4 h"]) expect(desempenho).toContain(label);
    expect(desempenho).not.toContain("Pressao de fluxo");
    const fluxo = draw({ view: "fluxo" });
    for (const label of ["Janela medida", "Negocios"]) expect(fluxo).toContain(label);
  });
});

describe("the table", () => {
  test("every row carries its symbol, price, change and volume as the exchange gave them", () => {
    const html = draw();
    expect(html).toContain(">BTC<");
    expect(html).toContain("80.000");
    expect(html).toContain("+5,26%");
    expect(html).toContain("900 mi");
    expect(html).toContain("Perpetuo");
  });

  test("the sorted column says so for assistive technology, and sortable headers are buttons", () => {
    const html = draw({ sort: { key: "var24hPct", dir: "asc" } });
    expect(html).toMatch(/aria-sort="ascending"[^>]*>(<[^>]*>)*\s*<button[^>]*>Var 24h/);
    expect(html).toContain('aria-sort="none"');
  });

  test("a pinned row says so; a pin that cannot be removed is disabled", () => {
    const html = draw();
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Fixado: BTC-USDT"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*aria-label="Fixar ETH-USDT"/);
  });

  test("the selected row is marked", () => {
    expect(draw({ selectedId: "ETH-USDT" })).toMatch(/aria-selected="true"[^>]*data-id="ETH-USDT"|data-id="ETH-USDT"[^>]*aria-selected="true"/);
  });

  test("the keys are told once, under the table", () => {
    expect(draw()).toContain("Setas escolhem, Enter abre na mesa, P fixa, / busca");
  });
});

describe("honest states", () => {
  test("loading, error, nothing matching and a missing list are each said in words", () => {
    expect(draw({ status: "loading", rows: [], totalRows: 0 })).toContain("Carregando a lista da OKX");
    const error = draw({ status: "error", error: "Sem conexao com a OKX", rows: [], totalRows: 0 });
    expect(error).toContain("Sem conexao com a OKX");
    expect(error).toContain('role="alert"');
    const empty = draw({ rows: [] });
    expect(empty).toContain("Nenhum ativo com estes filtros");
    expect(draw({ partial: "perp" })).toContain("A lista de perpetuos nao chegou da OKX; so os pares spot aparecem");
    expect(draw({ partial: "spot" })).toContain("A lista de pares spot nao chegou da OKX; so os perpetuos aparecem");
  });

  test("an approximate volume is explained once, and the universe is stated", () => {
    const html = draw();
    expect(html).toContain("Pares em USDT: spot e perpetuos da OKX");
    expect(html).toContain("~");
  });
});

describe("filters and saved screens", () => {
  test("the filters of the documented kind are there with their current values", () => {
    const html = draw({ filters: { ...DEFAULT_FILTERS, busca: "BTC", volUsdMin: 1_000_000 } });
    expect(html).toContain('aria-label="Buscar ativo"');
    expect(html).toContain('value="BTC"');
    expect(html).toContain("Vol USD minimo");
    expect(html).toContain('value="1000000"');
    for (const label of ["Mercado", "Var minima", "Var maxima", "Rank ate", "Meus fixados"]) expect(html).toContain(label);
  });

  test("the filters that need on-chain data are listed disabled, with the reason", () => {
    const html = draw();
    expect(html).toContain("Liquidez minima");
    expect(html).toContain("Holders minimos");
    expect(html).toContain("So para tokens on-chain");
  });

  test("saved screens are listed by name and can be saved, applied and removed", () => {
    const html = draw({ screens: [{ nome: "Perpetuos grandes", filtros: DEFAULT_FILTERS, visao: "fluxo", ordenacao: DEFAULT_SORT }] });
    expect(html).toContain("Perpetuos grandes");
    expect(html).toContain("Salvar tela");
    expect(html).toContain("Remover tela");
    expect(html).toContain('aria-label="Nome da tela"');
  });
});

describe("Perguntar ao Inonu (RAS-5)", () => {
  const proposal = (over: Partial<Extract<AskPanelState, { phase: "proposal" }>> = {}): AskPanelState => ({
    phase: "proposal", text: "perpetuos grandes que subiram hoje", modelo: "jev-test", reutilizado: false, custo: { chamadasOnchainos: 0, tokens: 930, usd: null },
    filtro: { mercado: "perp", volUsdMin: 100_000_000, varMin: 3, varMax: null, rankMax: null, apenasFixados: false, ordenar: { chave: "var24hPct", direcao: "desc" } },
    keep: ["mercado", "vol", "varMin", "ordem"], ...over,
  });

  test("at rest it is a box for the sentence and a line that says what the model reads", () => {
    const html = draw();
    expect(html).toContain('aria-label="Pergunta ao Inonu"');
    expect(html).toContain("Perguntar ao Inonu");
    expect(html).toContain("O Inonu le so a sua frase, nunca os dados do mercado");
    expect(html).not.toContain("Aplicar filtro");
  });

  test("the box has the text the person is writing, and the button waits for a sentence", () => {
    const empty = draw();
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>Perguntar<\/button>/);
    const filled = draw({ ask: { phase: "idle", text: "perpetuos grandes" } });
    expect(filled).toContain('value="perpetuos grandes"');
    expect(filled).not.toMatch(/<button[^>]*disabled=""[^>]*>Perguntar<\/button>/);
  });

  test("while it asks, it says so, offers to cancel, and does not let a second click through", () => {
    const html = draw({ ask: { phase: "asking", text: "perpetuos grandes" } });
    expect(html).toContain("Perguntando ao Inonu");
    expect(html).toContain(">Cancelar<");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Perguntar<\/button>/);
  });

  test("the answer is a list of chips that can be taken off, with the model as provenance and the cost as measured", () => {
    const html = draw({ ask: proposal() });
    expect(html).toContain("Inonu respondeu. Tire o que nao quer e aplique");
    for (const label of ["Mercado: Perpetuos", "Vol USD min: 100 mi", "Var 24h acima de +3%", "Ordem: maior alta"]) expect(html).toContain(label);
    expect(html.match(/aria-pressed="true"[^>]*>(Mercado|Vol USD|Var 24h|Ordem)/g)?.length).toBe(4);
    expect(html).toContain(">Aplicar filtro<");
    expect(html).toContain(">Descartar<");
    expect(html).toContain("modelo: Jev (jev-test)");
    expect(html).toContain("930 tokens, custo em dolar nao medido");
  });

  test("a chip the person took off is shown as not pressed", () => {
    const html = draw({ ask: proposal({ keep: ["ordem"] }) });
    expect(html).toMatch(/aria-pressed="false"[^>]*>Mercado: Perpetuos/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Ordem: maior alta/);
  });

  test("a reused answer says it cost nothing", () => {
    expect(draw({ ask: proposal({ reutilizado: true, custo: { chamadasOnchainos: 0, tokens: 0, usd: 0 } }) })).toContain("resposta reaproveitada, sem custo");
  });

  test("a failure is said in words, the same ones the desk uses for the other requests", () => {
    expect(draw({ ask: { phase: "failed", text: "x", motivo: "sem_chave" } })).toContain("Configure a chave do modelo em Configuracoes");
    expect(draw({ ask: { phase: "failed", text: "x", motivo: "cooldown" } })).toContain("Espere alguns segundos antes de pedir de novo");
    expect(draw({ ask: { phase: "failed", text: "x", motivo: "resposta_invalida:opcao_invalida:mercado" } })).toContain("A resposta do modelo foi descartada porque nao seguia o formato");
  });

  test("the whole panel is plain ASCII and says nothing that blinks", () => {
    for (const ask of [proposal(), { phase: "asking", text: "a" } as AskPanelState, { phase: "failed", text: "a", motivo: "tempo_esgotado" } as AskPanelState]) {
      const html = draw({ ask });
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });
});

describe("ranking the chosen rows (RAS-6)", () => {
  const panel = <p>PAINEL-DO-INONU</p>;

  test("every row has a box to choose it, and the header names the column; nothing is chosen at rest and the ranking section is absent", () => {
    const html = draw();
    expect(html).toContain('aria-label="Escolher para o ranking"');
    for (const id of ["BTC-USDT", "ETH-USDT", "PEPE-USDT", "BTC-USDT-SWAP"]) expect(html).toMatch(new RegExp(`<input[^>]*type="checkbox"[^>]*aria-label="Escolher ${id} para o ranking"`));
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(html).not.toContain('aria-label="Ranking pelo Inonu"');
    expect(html).toContain("Marque de 2 a 5 linhas para pedir o ranking ao Inonu");
  });

  test("a chosen row is checked; the click on the box chooses it and does not select, open or pin the row", () => {
    const html = draw({ chosen: ["ETH-USDT"] });
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*aria-label="Escolher ETH-USDT para o ranking"[^>]*checked=""|<input[^>]*checked=""[^>]*aria-label="Escolher ETH-USDT para o ranking"/);
    expect(html.match(/<input[^>]*type="checkbox"[^>]*checked=""/g)?.length ?? html.match(/<input[^>]*checked=""[^>]*type="checkbox"/g)?.length).toBe(1);
  });

  test("with one row chosen the section asks for one more and does not offer the panel", () => {
    const html = draw({ chosen: ["ETH-USDT"], rankingPanel: null });
    expect(html).toContain('aria-label="Ranking pelo Inonu"');
    expect(html).toContain("1 de 5 linhas escolhidas. Falta pelo menos uma para ranquear");
    expect(html).toContain("Tirar ETH-USDT do ranking");
    expect(html).not.toContain("PAINEL-DO-INONU");
  });

  test("with two to five rows chosen the section lists them as chips that can be taken out and holds the panel of the request", () => {
    const html = draw({ chosen: ["ETH-USDT", "BTC-USDT-SWAP"], rankingPanel: panel });
    expect(html).toContain("2 de 5 linhas escolhidas");
    expect(html).toContain("Tirar ETH-USDT do ranking");
    expect(html).toContain("Tirar BTC-USDT-SWAP do ranking");
    expect(html).toContain("PAINEL-DO-INONU");
    expect(html).toContain("Limpar escolha");
  });

  test("at five the boxes of the rows not chosen are disabled and the limit is said in words", () => {
    const five = ["BTC-USDT", "ETH-USDT", "PEPE-USDT", "BTC-USDT-SWAP", "SOL-USDT"];
    const html = draw({ chosen: five, rankingPanel: panel });
    expect(html).toContain("5 de 5 linhas escolhidas. Limite de 5 por pedido");
    // the four rows of the table are chosen, so none is disabled; with a row that is not chosen it is
    const more = draw({ chosen: ["ETH-USDT", "PEPE-USDT", "SOL-USDT", "XRP-USDT", "DOGE-USDT"], rankingPanel: panel });
    expect(more).toMatch(/<input[^>]*type="checkbox"[^>]*aria-label="Escolher BTC-USDT para o ranking"[^>]*disabled=""|<input[^>]*disabled=""[^>]*aria-label="Escolher BTC-USDT para o ranking"/);
    expect(more).not.toMatch(/<input[^>]*disabled=""[^>]*aria-label="Escolher ETH-USDT para o ranking"|<input[^>]*aria-label="Escolher ETH-USDT para o ranking"[^>]*disabled=""/);
  });

  test("while the request of the ranking is running, the choice is locked: the answer belongs to these rows, and changing them would drop a paid answer", () => {
    const html = draw({ chosen: ["ETH-USDT", "BTC-USDT"], chosenLocked: true, rankingPanel: panel });
    expect(html).toContain("Pedido em andamento: a escolha fica travada ate a resposta");
    // every box, every chip and the clear button are disabled
    expect(html.match(/<input[^>]*type="checkbox"[^>]*aria-label="Escolher[^>]*disabled=""/g)?.length).toBe(4);
    expect(html).toMatch(/<button[^>]*aria-label="Tirar ETH-USDT do ranking"[^>]*disabled=""|<button[^>]*disabled=""[^>]*aria-label="Tirar ETH-USDT do ranking"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Limpar escolha<\/button>/);
    const open = draw({ chosen: ["ETH-USDT", "BTC-USDT"], chosenLocked: false, rankingPanel: panel });
    expect(open).not.toContain("Pedido em andamento");
    expect(open).toMatch(/<button(?![^>]*disabled)[^>]*>Limpar escolha<\/button>/);
  });

  test("a row chosen and hidden by a filter stays in the section: it is not lost and not invented", () => {
    const html = draw({ rows: rows.filter((r) => r.id === "ETH-USDT"), chosen: ["ETH-USDT", "PEPE-USDT"], rankingPanel: panel });
    expect(html).toContain("Tirar PEPE-USDT do ranking");
    expect(html).toContain("2 de 5 linhas escolhidas");
  });

  test("plain ASCII, no word of an order and nothing that blinks, in every state of the section", () => {
    for (const chosen of [["ETH-USDT"], ["ETH-USDT", "BTC-USDT"], ["BTC-USDT", "ETH-USDT", "PEPE-USDT", "BTC-USDT-SWAP", "SOL-USDT"]]) {
      const html = draw({ chosen, rankingPanel: panel });
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
    }
  });
});

describe("the universe (RAS-1, AC-RAS-1)", () => {
  const body = <p>CORPO-ON-CHAIN</p>;

  test("two universes to choose from, the exchange and on-chain, as a group of radio buttons so the views keep their own tabs", () => {
    const html = draw();
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Universo"');
    expect(html.match(/role="radio"/g)?.length).toBe(2);
    expect(html).toMatch(/aria-checked="true"[^>]*>Corretora OKX/);
    expect(html).toMatch(/aria-checked="false"[^>]*>On-chain/);
    expect(html.match(/role="tab"/g)?.length).toBe(5);
  });

  test("on-chain: the body takes the place of the filters and of the table of the exchange, and the universe stays where it is", () => {
    const html = draw({ universe: "onchain", onchainBody: body });
    expect(html).toContain("CORPO-ON-CHAIN");
    expect(html).toMatch(/aria-checked="true"[^>]*>On-chain/);
    for (const gone of ["Perguntar ao Inonu", 'aria-label="Ativos"', "Pares em USDT", "Salvar tela", "Setas escolhem", 'aria-label="Ranking pelo Inonu"']) expect(html).not.toContain(gone);
    expect(html.match(/role="tab"/g)).toBeNull();
  });

  test("the filters that need on-chain data point to the universe that has them", () => {
    expect(draw()).toContain("Filtros de tokens on-chain: valem no universo On-chain");
    expect(draw()).not.toContain("indisponiveis ate o gateway ligar");
  });

  test("plain ASCII, nothing that blinks, in both universes", () => {
    for (const html of [draw(), draw({ universe: "onchain", onchainBody: body })]) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[ -~\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });
});

describe("rules of the interface", () => {
  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks or pulses", () => {
    for (const html of [draw(), draw({ view: "fluxo" }), draw({ status: "loading", rows: [], totalRows: 0 }), draw({ partial: "perp", rows: [] })]) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });

  test("no word of an order anywhere on the screen (FLX-10)", () => {
    const text = draw().replace(/<[^>]*>/g, " ");
    for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
  });
});
