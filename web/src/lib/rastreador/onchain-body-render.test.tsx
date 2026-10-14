// RAS-1, RAS-2, RAS-3, RAS-4, AC-RAS-1: the on-chain body of the Rastreador. The pure drawing of one network: its chooser, the three views, the
// filters, the table with the cells of the model, every empty state honest, nothing animated, plain ASCII, no word of an order. The container with the
// hooks (the gateway client) is not rendered here. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OnchainBody, type OnchainBodyProps } from "@/components/Rastreador/OnchainBody";
import type { HotToken, Signal } from "../onchain/client";
import { DEFAULT_ONCHAIN_FILTERS, DEFAULT_ONCHAIN_SORT, buildOnchainRows } from "./onchain-model";

const hot = (symbol: string, over: Partial<HotToken> = {}): HotToken => ({
  chainIndex: "501", symbol, address: `${symbol}1111111111111111111111111111111111111111`.slice(0, 44), price: 1.5, marketCap: 2_000_000, volumeUsd: 400_000, changePct: 12,
  liquidityUsd: 900_000, holders: 900, uniqueTraders: 300, txsBuy: 600, txsSell: 400, inflowUsd: 30_000, riskLevel: 2, top10HoldPct: 30, devHoldPct: 1, bundleHoldPct: 2, firstTradeMs: null, ...over,
});
const AAA = hot("AAA", { volumeUsd: 900_000 });
const BBB = hot("BBB", { changePct: -8, txsBuy: 100, txsSell: 300, riskLevel: 4 });
const signal = (t: HotToken): Signal => ({ tsMs: 1, chainIndex: "501", walletType: "smart_money", walletCount: 4, amountUsd: 8_000, priceUsd: 1, soldRatioPct: 25, token: { address: t.address, symbol: t.symbol, marketCap: null, holders: null, top10HoldPct: null } });

const rows = buildOnchainRows([AAA, BBB], null);
const noop = () => {};
const props = (over: Partial<OnchainBodyProps> = {}): OnchainBodyProps => ({
  chains: [{ chainIndex: "196", name: "X Layer", enabled: true, reason: null }, { chainIndex: "501", name: "Solana", enabled: true, reason: null }, { chainIndex: "999", name: "Rede X", enabled: false, reason: "sem tokens em alta nesta rede" }],
  chainIndex: "501", view: "geral", filters: DEFAULT_ONCHAIN_FILTERS, sort: DEFAULT_ONCHAIN_SORT, status: "ready", error: null, errorLink: null,
  rows, totalRows: rows.length, updatedAtMs: 1_000_000, nowMs: 1_012_000, stale: false,
  signals: "unread", signalsAtMs: null, signalsCount: null, signalsStale: false, selectedId: null, askPanel: null, locked: false,
  onChain: noop, onView: noop, onFilters: noop, onSort: noop, onSelect: noop, onReload: noop,
  ...over,
});
const draw = (over: Partial<OnchainBodyProps> = {}) => renderToStaticMarkup(<OnchainBody {...props(over)} />);

describe("the chooser, the views and the reload", () => {
  test("the network is a list of what the provider supports; a network it does not serve is listed disabled, with the reason", () => {
    const html = draw();
    expect(html).toContain('aria-label="Rede"');
    expect(html).toContain("X Layer");
    expect(html).toMatch(/<option[^>]*value="501"[^>]*selected=""|<option[^>]*selected=""[^>]*value="501"/);
    expect(html).toMatch(/<option[^>]*disabled=""[^>]*>Rede X, sem tokens em alta nesta rede<\/option>/);
  });

  test("three views, the open one marked; the overview columns are the documented ones", () => {
    const html = draw();
    for (const label of ["Visao geral", "Smart money", "Risco"]) expect(html).toContain(label);
    expect(html.match(/role="tab"/g)?.length).toBe(3);
    expect(html).toMatch(/aria-selected="true"[^>]*>Visao geral/);
    for (const label of ["Rank", "Ativo", "Preco", "Var 24h", "Vol USD 24h", "Valor de mercado", "Liquidez", "Holders", "Pressao de fluxo"]) expect(html).toContain(label);
  });

  test("the reload is a button: nothing here reads the provider by itself, and the text says so", () => {
    const html = draw();
    expect(html).toContain(">Ler de novo<");
    expect(html).toContain("A OKX OnchainOS so e consultada quando voce escolhe a rede, abre a visao Smart money ou clica em Ler de novo");
  });
});

describe("the table", () => {
  test("each token is a row with its symbol, price, change, volume and the pressure as measured, with a word that describes and does not instruct", () => {
    const html = draw();
    expect(html).toContain(">AAA<");
    expect(html).toContain("1,50");
    expect(html).toContain("+12,00%");
    expect(html).toContain("900 mil");
    expect(html).toContain("+0,20 Pressao compradora");
    expect(html).toContain("-0,50 Pressao vendedora forte");
    expect(html).toContain("2 de 2 tokens");
  });

  test("the selected row is marked, and the panel to ask about it is below", () => {
    const html = draw({ selectedId: rows[0]!.id, askPanel: <p>PAINEL-DO-TOKEN</p> });
    expect(html).toMatch(/aria-selected="true"[^>]*data-id="501:AAA|data-id="501:AAA[^>]*aria-selected="true"/);
    expect(html).toContain("PAINEL-DO-TOKEN");
    expect(draw({ askPanel: null })).not.toContain("PAINEL-DO-TOKEN");
  });

  test("the sorted column says so for assistive technology, and sortable headers are buttons", () => {
    const html = draw({ sort: { key: "liquidez", dir: "asc" } });
    expect(html).toMatch(/aria-sort="ascending"[^>]*>(<[^>]*>)*\s*<button[^>]*>Liquidez/);
  });

  test("a click on a row selects it by its network and address, never by its symbol", () => {
    expect(draw()).toContain(`data-id="501:${AAA.address}"`);
  });
});

describe("while a request about a token is running", () => {
  test("the rows, the network and the universe cannot change under it, and the section says why", () => {
    const html = draw({ locked: true, selectedId: rows[0]!.id, askPanel: <p>PAINEL-DO-TOKEN</p> });
    expect(html).toContain("Pedido em andamento: a escolha do token e da rede fica travada ate a resposta");
    expect(html).toMatch(/<select[^>]*aria-label="Rede"[^>]*disabled=""|<select[^>]*disabled=""[^>]*aria-label="Rede"/);
    expect(draw({ locked: false })).not.toContain("Pedido em andamento");
  });
});

describe("the rows can be chosen from the keyboard, and a refresh cannot drop a paid answer", () => {
  test("a row is a stop of the keyboard, and the keys that choose it are said", () => {
    const html = draw();
    expect(html.match(/<div[^>]*role="row"[^>]*data-id="[^"]*"[^>]*tabindex="0"|<div[^>]*tabindex="0"[^>]*role="row"[^>]*data-id=/g)?.length).toBe(rows.length);
    expect(html).toContain("Enter ou espaco escolhe a linha");
  });

  test("Ler de novo waits while a request about a token runs, because the new list could take the token away from under it", () => {
    expect(draw({ locked: true })).toMatch(/<button[^>]*disabled=""[^>]*>Ler de novo<\/button>/);
    expect(draw({ locked: false })).toMatch(/<button(?![^>]*disabled)[^>]*>Ler de novo<\/button>/);
  });
});

describe("the smart money view", () => {
  test("a zero is said to mean 'not among the records that were read', and the age of those records is shown", () => {
    const withSignals = buildOnchainRows([AAA, BBB], [signal(AAA)]);
    const html = draw({ view: "smart", signals: "read", rows: withSignals, signalsAtMs: 1_000_000, signalsCount: 37, nowMs: 1_012_000 });
    // the number really read, and what the page is: one page of up to 100, in the order the provider gave, not "the latest"
    expect(html).toContain("Carteiras: 37 registros lidos ha 12 s (uma pagina de ate 100, na ordem do provedor)");
    expect(html).not.toContain("os 100 mais recentes");
    expect(html).toContain("Nenhum registro deste token entre os registros lidos da rede (uma pagina de ate 100)");
    expect(draw({ view: "smart", signals: "read", rows: withSignals, signalsAtMs: 1_000_000, signalsStale: true })).toContain("Dado velho nos registros de carteiras");
  });

  test("before the signals were read it says so; while they are read it says that; once read the columns have the numbers", () => {
    const unread = draw({ view: "smart", signals: "unread" });
    expect(unread).toContain("Os registros de carteiras rastreadas ainda nao foram lidos");
    expect(draw({ view: "smart", signals: "loading" })).toContain("Lendo os registros de carteiras rastreadas");
    const withSignals = buildOnchainRows([AAA, BBB], [signal(AAA)]);
    const read = draw({ view: "smart", signals: "read", rows: withSignals });
    for (const label of ["Carteiras", "USD rastreado", "Fracao vendida", "Tipo"]) expect(read).toContain(label);
    expect(read).toContain(">4<");
    expect(read).toContain("25%");
    expect(read).toContain(">SM<");
  });

  test("a failure to read them is said in words, and the rest of the table is still there", () => {
    const html = draw({ view: "smart", signals: { error: "OnchainOS indisponivel agora" } });
    expect(html).toContain("OnchainOS indisponivel agora");
    expect(html).toContain(">AAA<");
  });
});

describe("the risk view", () => {
  test("level, shares of the supply, liquidity and holders, with the dash and the reason for what the provider did not give", () => {
    const html = draw({ view: "risco", rows: buildOnchainRows([AAA, hot("CCC", { riskLevel: null, top10HoldPct: null })], null) });
    for (const label of ["Risco", "% top 10", "% dev", "% bundlers"]) expect(html).toContain(label);
    expect(html).toContain("Nivel 2 de 5");
    expect(html).toContain("A OKX nao informou o nivel de risco");
  });
});

describe("filters", () => {
  test("every filter of the table is there with its current value", () => {
    const html = draw({ filters: { ...DEFAULT_ONCHAIN_FILTERS, busca: "AA", volUsdMin: 1_000_000, riscoMax: 3 } });
    for (const label of ["Buscar token", "Vol USD minimo", "Liquidez minima", "Holders minimos", "Carteiras minimas", "Var minima", "Var maxima", "Risco maximo"]) expect(html).toContain(label);
    expect(html).toContain('value="AA"');
    expect(html).toContain('value="1000000"');
    expect(html).toContain('value="3"');
  });

  test("the wallet filter says it only counts after the smart money was read", () => {
    expect(draw({ signals: "unread" })).toContain("Carteiras minimas: vale depois de ler a visao Smart money");
  });
});

describe("honest states", () => {
  test("loading, an error with its words and link, nothing matching, no token at all, and old data are each said", () => {
    expect(draw({ status: "loading", rows: [], totalRows: 0, updatedAtMs: null })).toContain("Lendo os tokens da rede");
    const error = draw({ status: "error", error: "Configure a chave do OnchainOS", errorLink: { href: "/configuracoes", label: "Configuracoes" }, rows: [], totalRows: 0, updatedAtMs: null });
    expect(error).toContain("Configure a chave do OnchainOS");
    expect(error).toContain('role="alert"');
    expect(error).toMatch(/<a[^>]*href="\/configuracoes"[^>]*>Configuracoes<\/a>/);
    expect(draw({ rows: [], totalRows: 2 })).toContain("Nenhum token com estes filtros");
    expect(draw({ rows: [], totalRows: 0 })).toContain("A OKX nao devolveu tokens em alta nesta rede");
    expect(draw({ stale: true })).toContain("Dado velho");
    expect(draw()).toContain("Lido ha 12 s, fonte OKX OnchainOS");
  });

  test("an error with no rows is the alert alone: it is not followed by 'the OKX returned no tokens', which would be a second, false statement", () => {
    const html = draw({ status: "error", error: "OnchainOS indisponivel agora", rows: [], totalRows: 0, updatedAtMs: null });
    expect(html).toContain("OnchainOS indisponivel agora");
    expect(html).not.toContain("A OKX nao devolveu tokens em alta nesta rede");
    expect(html).not.toContain("Nenhum token com estes filtros");
  });

  test("an error with rows on screen is a notice over the last reading, not an empty page", () => {
    const html = draw({ status: "error", error: "OnchainOS indisponivel agora" });
    expect(html).toContain("OnchainOS indisponivel agora");
    expect(html).toContain(">AAA<");
  });
});

describe("rules of the interface", () => {
  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks or pulses, in every view and state", () => {
    const signaled = buildOnchainRows([AAA, BBB], [signal(AAA)]);
    const states = [draw(), draw({ view: "smart" }), draw({ view: "smart", signals: "read", rows: signaled }), draw({ view: "risco" }), draw({ status: "loading", rows: [], totalRows: 0 }), draw({ stale: true }), draw({ selectedId: rows[0]!.id })];
    for (const html of states) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });

  test("no word of an order anywhere on the screen (FLX-10)", () => {
    const signaled = buildOnchainRows([AAA, BBB], [signal(AAA)]);
    for (const html of [draw(), draw({ view: "smart", signals: "read", rows: signaled }), draw({ view: "risco" })]) {
      const text = html.replace(/<[^>]*>/g, " ");
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
    }
  });
});
