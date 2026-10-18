import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import OpportunityRadar, { OpportunityRadarView, type OpportunityRadarViewProps } from "@/components/Desk/Dock/OpportunityRadar";
import { CHOOSE_MAX } from "../../rastreador/choose";
import type { AssetCatalog, AssetCatalogRow } from "../useAssetCatalog";
import { RADAR_LENSES, radarRows } from "./opportunity-radar";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
const row = (instId: string, last: number | null, change24hPct: number | null, volQuote24h: number | null): AssetCatalogRow => ({ instId, last, change24hPct, volQuote24h });

const SPOT: readonly AssetCatalogRow[] = [
  row("BTC-USDT", 83_200.5, 0.8, 530_000_000),
  row("ETH-USDT", 2_510.9, -0.3, 210_000_000),
  row("SOL-USDT", 107.8, 4.2, 90_000_000),
  row("DOGE-USDT", 0.1721, 7.9, 40_000_000),
  row("PEPE-USDT", 0.00001234, -6.1, 12_000_000),
  row("LINK-USDT", 14.2, 1.4, 25_000_000),
];
const READY: AssetCatalog = { status: "ready", spot: SPOT, swap: [] };

const noop = () => undefined;
function view(over: Partial<OpportunityRadarViewProps> = {}): string {
  const props: OpportunityRadarViewProps = {
    status: "ready", rows: radarRows(SPOT, "volume"), lens: "volume", focus: "BTC-USDT", chosen: [], locked: false,
    onLens: noop, onOpen: noop, onToggle: noop, onClear: noop, ...over,
  };
  return renderToStaticMarkup(<OpportunityRadarView {...props} />);
}

/** What the project forbids in rendered text, and the words a broken number would leave behind. */
function expectClean(html: string): void {
  const text = html.replace(/<[^>]*>/g, " ");
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toMatch(/[^\x20-\x7e\s]/);
  expect(text).not.toMatch(/NaN|undefined|Infinity/);
  expect(html).not.toMatch(/animation|blink|pulse/i);
}

describe("the radar with data", () => {
  test("a labelled region, the three lenses with the chosen one pressed, and one card per row with its two controls", () => {
    const html = view();
    expect(html).toContain('aria-label="Radar de oportunidades"');
    for (const lens of RADAR_LENSES) expect(html).toContain(lens.label);
    expect(html.match(/aria-pressed="true"[^>]*>Mais negociados/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"[^>]*>Maiores altas/g)).toHaveLength(1);
    expect(html.match(/data-card="true"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Abrir BTC no grafico"');
    expect(html).toContain('aria-label="Escolher BTC para o ranking"');
    expectClean(html);
  });

  test("each card shows the symbol, the price, the signed change and the volume, and the one on the chart is marked", () => {
    const html = view();
    expect(html).toContain(">BTC<");
    expect(html).toContain("83.201");
    expect(html).toContain("+0,80%");
    expect(html).toContain("530 mi");
    expect(html).toContain("-6,10%");
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-focus="true"[^>]*data-card="true"|data-card="true"[^>]*data-focus="true"/);
  });

  test("it says what the list is: measured, never a forecast, with the filter and that nothing sends an order", () => {
    const html = view();
    expect(html).toContain("Pares com maior volume em 24 h");
    expect(html).toContain("fato medido, nao previsao");
    expect(html).toContain("1 mi");
    expect(html).toContain("sem moedas estaveis");
    expect(html).toContain("Consultivo: nada aqui envia ordem");
    expect(html).not.toMatch(/lucro|ganho|garant|compre|venda agora/i);
  });

  test("the lens hint follows the chosen lens", () => {
    expect(view({ lens: "altas", rows: radarRows(SPOT, "altas") })).toContain("Pares que mais subiram em 24 h");
    expect(view({ lens: "quedas", rows: radarRows(SPOT, "quedas") })).toContain("Pares que mais cairam em 24 h");
  });
});

describe("choosing rows for the ranking", () => {
  test("a chosen row is pressed and the line says how many are chosen and what is missing", () => {
    const one = view({ chosen: ["BTC-USDT"] });
    expect(one).toContain('aria-pressed="true" aria-label="Escolher BTC para o ranking"');
    expect(one).toContain("1 de 5 linhas escolhidas");
    expect(one).toContain("Falta pelo menos uma para ranquear");
    expect(one).toContain("Limpar escolha");
    expect(view({ chosen: ["BTC-USDT", "SOL-USDT"] })).toContain("2 de 5 linhas escolhidas");
    expectClean(one);
  });

  test("with nothing chosen there is no selection line and no clear button", () => {
    const html = view();
    expect(html).not.toContain("linhas escolhidas");
    expect(html).not.toContain("Limpar escolha");
  });

  test("the ranking panel appears only where the owner puts it, once there are enough rows", () => {
    const html = view({ chosen: ["BTC-USDT", "SOL-USDT"], rankingSlot: <p>PAINEL-DO-RANKING</p> });
    expect(html).toContain("PAINEL-DO-RANKING");
    expect(view({ chosen: ["BTC-USDT", "SOL-USDT"] })).not.toContain("PAINEL-DO-RANKING");
  });

  test("at the limit the other rows cannot be added and the reason is in the title", () => {
    const five = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "DOGE-USDT", "PEPE-USDT"];
    expect(five).toHaveLength(CHOOSE_MAX);
    const html = view({ chosen: five });
    expect(html).toContain("Limite de 5 por pedido");
    const link = html.match(/<button[^>]*aria-label="Escolher LINK para o ranking"[^>]*>/)![0];
    expect(link).toContain("disabled");
    const btc = html.match(/<button[^>]*aria-label="Escolher BTC para o ranking"[^>]*>/)![0];
    expect(btc).not.toContain("disabled");
  });

  test("while a request runs the choice is locked, so a paid answer is not dropped by a change", () => {
    const html = view({ chosen: ["BTC-USDT", "SOL-USDT"], locked: true });
    expect(html).toContain("Pedido em andamento: a escolha fica travada ate a resposta");
    for (const m of html.matchAll(/<button[^>]*aria-label="Escolher [A-Z]+ para o ranking"[^>]*>/g)) expect(m[0]).toContain("disabled");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Limpar escolha/);
  });
});

describe("the states without data", () => {
  test("loading says it is reading the list and draws no card", () => {
    const html = view({ status: "loading", rows: [] });
    expect(html).toContain("Lendo a lista da OKX");
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-card="true"');
    expectClean(html);
  });

  test("an error says the list is unavailable and that nothing was invented to fill the strip", () => {
    const html = view({ status: "error", rows: [] });
    expect(html).toContain("Lista da OKX indisponivel agora");
    expect(html).toContain("nada foi inventado");
    expect(html).not.toContain('data-card="true"');
  });

  test("a lens with no pair that passes the filter says so", () => {
    const html = view({ lens: "quedas", rows: [] });
    expect(html).toContain("Nenhum par passa o filtro agora nesta lente");
    expect(html).not.toContain('data-card="true"');
  });
});

describe("the stateful radar", () => {
  test("starts on the most traded, with nothing chosen, and holds the door to the on-chain view, which asks nothing itself", () => {
    const html = renderToStaticMarkup(<OpportunityRadar catalog={READY} focus="ETH-USDT" onOpen={noop} network={{ chainName: "X Layer", onOpen: noop }} />);
    expect(html.match(/aria-pressed="true"[^>]*>Mais negociados/g)).toHaveLength(1);
    expect(html.match(/data-card="true"/g)).toHaveLength(6);
    expect(html).toContain("X Layer");
    expect(html).toContain(">Abrir Onde comprar<");
    expect(html).toContain("so rodam quando voce pedir");
    // the question to the model about a network lives in the Radar tab: a second button here would be a second way to spend the same reads
    expect(html).not.toContain("Pedir ao Inonu");
    expect(html).not.toContain("linhas escolhidas");
    expectClean(html);
  });

  test("without a network there is no door, and the radar still stands", () => {
    const html = renderToStaticMarkup(<OpportunityRadar catalog={READY} focus="BTC-USDT" onOpen={noop} />);
    expect(html).not.toContain("Abrir Onde comprar");
    expect(html.match(/data-card="true"/g)).toHaveLength(6);
  });

  test("a catalog still loading shows the loading line, not an empty strip", () => {
    const html = renderToStaticMarkup(<OpportunityRadar catalog={{ status: "loading", spot: [], swap: [] }} focus="BTC-USDT" onOpen={noop} />);
    expect(html).toContain("Lendo a lista da OKX");
    expect(html).not.toContain('data-card="true"');
  });
});
