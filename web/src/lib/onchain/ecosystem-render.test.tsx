// The "Oportunidades" view of the Radar, drawn: every state of the tab without a server or a model. The code describes (readings and marks are measurements) and the only way to the
// model is the click on a token, which opens it. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EcosystemBoardTable, EcosystemView } from "@/components/Desk/Dock/EcosystemTab";
import type { HotToken, Signal } from "./client";
import type { EcosystemState } from "./ecosystem-scan";
import { opportunityBoard, type ChainScan } from "./opportunities";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
const noop = () => {};

const hot = (over: Partial<HotToken> = {}): HotToken => ({
  chainIndex: "501", symbol: "AAA", address: "AAA111", price: 0.5, marketCap: 5_000_000, volumeUsd: 2_000_000, changePct: 12, liquidityUsd: 30_000, holders: 5000,
  uniqueTraders: 900, txsBuy: 300, txsSell: 100, inflowUsd: null, riskLevel: 1, top10HoldPct: 20, devHoldPct: 2, bundleHoldPct: 1, firstTradeMs: null, ...over,
});
const signal: Signal = { tsMs: 1, chainIndex: "501", walletType: "smart_money", walletCount: 3, amountUsd: 40_000, priceUsd: 0.5, soldRatioPct: 10, token: { address: "AAA111", symbol: "AAA", marketCap: null, holders: null, top10HoldPct: null } };
const scan = (over: Partial<ChainScan> = {}): ChainScan => ({ chainIndex: "501", chainName: "Solana", hot: [hot()], signals: [signal], hotError: null, signalsError: null, atMs: 1, ...over });

const state = (over: Partial<EcosystemState> = {}): EcosystemState => ({ status: "ready", scans: [scan()], targets: [{ chainIndex: "501", name: "Solana" }], startedAtMs: 1_000, finishedAtMs: 61_000, ...over });
const draw = (s: EcosystemState, chosen = ["501", "8453"]) => renderToStaticMarkup(<EcosystemView state={s} chosen={chosen} nowMs={181_000} onToggle={noop} onScan={noop} onPick={noop} />);

describe("before the first scan", () => {
  const html = draw({ status: "idle", scans: [], targets: [], startedAtMs: null, finishedAtMs: null });

  test("it says what one click costs and that nothing runs before it", () => {
    expect(html).toContain("Varrer o ecossistema");
    expect(html).toContain("Le 2 redes, ate 4 leituras da OnchainOS, sem consultar o modelo. Nada roda antes do clique.");
    expect(html).toContain("Escolha as redes e varra");
  });

  test("the networks are a group of toggles, the chosen ones pressed, with the cap said in the title of a full group", () => {
    expect(html).toContain('aria-label="Redes da varredura"');
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(2);
    const full = draw({ status: "idle", scans: [], targets: [], startedAtMs: null, finishedAtMs: null }, ["0", "1", "196", "195", "501", "8453"]);
    expect(full).toContain("No maximo 6 redes por varredura");
  });

  test("no network is chosen: the scan button is off", () => {
    expect(draw({ status: "idle", scans: [], targets: [], startedAtMs: null, finishedAtMs: null }, [])).toMatch(/<button[^>]*disabled=""[^>]*>Varrer o ecossistema/);
  });
});

describe("while it reads", () => {
  test("it shows the networks done so far, and how far it is, with the choice held", () => {
    const html = draw(state({ status: "scanning", targets: [{ chainIndex: "501", name: "Solana" }, { chainIndex: "8453", name: "Base" }], finishedAtMs: null }));
    expect(html).toContain("Lendo 2 de 2");
    expect(html).toContain("Lendo as redes uma de cada vez: 1 de 2 prontas.");
    expect(html).toContain("AAA");
    // the ten chain toggles and the scan button are held while it reads
    expect(html.match(/<button[^>]*disabled=""/g)?.length).toBe(11);
  });
});

describe("after a scan", () => {
  test("the board: the token, its chain, which readings hold and its marks of care", () => {
    const html = draw(state());
    expect(html).toContain("Lido ha 2 min: 1 tokens em 1 rede, 1 com leituras a favor.");
    expect(html).toContain("Varrer de novo");
    expect(html).toContain('aria-label="Abrir AAA em Solana"');
    expect(html).toContain("Solana, US$ 0,50000");
    for (const label of ["Dinheiro esperto", "Fluxo", "Tracao"]) expect(html).toContain(label);
    expect(html.match(/data-on="true"/g)?.length).toBe(3);
    expect(html).toContain("3 carteiras rastreadas (smart money) compraram com US$ 40,0 mil, 10% ja vendido");
    expect(html).toContain("liquidez de so US$ 30,0 mil");
    expect(html).toContain("+12,00%");
  });

  test("the token opens by its button and a table without a handler is read only", () => {
    const rows = opportunityBoard([scan()]).rows;
    expect(renderToStaticMarkup(<EcosystemBoardTable rows={rows} onPick={noop} />)).toContain("<button");
    expect(renderToStaticMarkup(<EcosystemBoardTable rows={rows} />)).not.toContain("<button");
  });

  test("a network that failed is named with its reason, so it is not mistaken for one with nothing in it", () => {
    const html = draw(state({ scans: [scan(), scan({ chainIndex: "56", chainName: "BNB Chain", hot: null, signals: null, hotError: "OnchainOS indisponivel agora" })] }));
    expect(html).toContain("BNB Chain: nao foi lida (OnchainOS indisponivel agora)");
    const partial = draw(state({ scans: [scan({ signals: null, signalsError: "Limite de leituras da OKX" })] }));
    expect(partial).toContain("Solana: lida em parte (Limite de leituras da OKX: so fluxo e tracao puderam ser lidos)");
  });

  test("a scan with nothing in its favour says so", () => {
    const html = draw(state({ scans: [scan({ hot: [hot({ changePct: 0, txsBuy: 10, txsSell: 10 })], signals: [] })] }));
    expect(html).toContain("Nenhum token das redes lidas tem leituras a favor agora.");
    expect(html).not.toContain('role="table"');
  });

  test("the caveat is always on screen: measured, limits chosen by the code, not calibrated, not a recommendation", () => {
    expect(draw(state())).toContain("limites escolhidos pelo codigo, ainda nao calibrados, e nao sao recomendacao");
  });
});

describe("the words on the screen", () => {
  test("no middle dot, no dash, no broken number and no word of an order, in any state", () => {
    const idle: EcosystemState = { status: "idle", scans: [], targets: [], startedAtMs: null, finishedAtMs: null };
    const failing = state({ scans: [scan(), scan({ chainIndex: "56", chainName: "BNB Chain", hot: null, signals: null, hotError: "OnchainOS indisponivel agora" })] });
    for (const html of [draw(idle), draw(state()), draw(failing), draw(state({ status: "scanning", finishedAtMs: null }))]) {
      expect(html).not.toMatch(FORBIDDEN);
      const content = html.replace(/ class="[^"]*"/g, "");
      for (const word of ["NaN", "undefined", "Infinity"]) expect(content).not.toContain(word);
      expect(content.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|sinais|recomendacao e|aconselh|deve)\b/);
    }
  });
});
