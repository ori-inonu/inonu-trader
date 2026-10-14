// RAS-2: "Lancamentos" of the Radar. The table of launches with the marks of care; the code describes and the Inonu decides. Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LaunchTable } from "@/components/Desk/Dock/MemepumpTab";
import { DOCK_SUBVIEWS } from "@/lib/mesa/dock-subviews";
import { launchRows, type Launch } from "@/lib/onchain/memepump";

const NOW = 1_800_000_000_000;
const launch = (over: Partial<Launch> = {}): Launch => ({
  chainIndex: "501", protocolId: "120596", address: "MintAddr1111111111111111111111111111111111", symbol: "SUS", name: "Susan", createdMs: NOW - 4 * 60_000, marketCapUsd: 6004.27, volume1hUsd: 8901.66,
  txCount1h: 167, buyTx1h: 97, sellTx1h: 70, bondingPct: 41.5, top10: 12.5, dev: 2, insiders: 0, bundlers: 3, snipers: 8, freshWallets: 1, phishing: 0, holders: 450, hasX: true, hasTelegram: false, hasWebsite: false,
  dexScreenerPaid: false, communityTakeover: false, liveOnPumpFun: false, aped: 3, ...over,
});
const draw = (launches: Launch[], pick = true) => {
  const m = launchRows(launches, NOW, "volume", 12);
  return renderToStaticMarkup(<LaunchTable rows={m.rows} total={m.total} {...(pick ? { onPick: () => {} } : {})} />);
};

describe("the table of launches", () => {
  const html = draw([launch(), launch({ symbol: "RUG", name: "Rug", address: "RugAddr111111111111111111111111111111111111", dev: 30, snipers: 53.2, holders: 9, volume1hUsd: 100 })]);

  test("one row for each launch, with the cells a person weighs, in plain words", () => {
    expect(html).toContain('aria-label="Lancamentos de tokens"');
    for (const head of ["Token", "Idade", "Valor de mercado", "Volume 1 h", "Negocios na ultima hora", "Curva", "Detentores", "Marcas de cuidado"]) expect(html).toContain(head);
    expect(html).toContain("ha 4 min");
    expect(html).toContain("US$ 6.004");
    expect(html).toContain("97 compras, 70 vendas");
    expect(html).toContain("41,5%");
    expect(html).toContain("450");
  });

  test("a launch with nothing to flag says none, and one with marks says which, in words and numbers", () => {
    expect(html).toContain("nenhuma");
    expect(html).toContain("o dev tem 30% da oferta; snipers com 53,2%; so 9 detentores");
    expect(html).toContain('data-marked="true"');
  });

  test("the token is a button that opens it (the holders and the chart), and without a handler it is plain text", () => {
    expect(html).toContain('aria-label="Abrir SUS"');
    expect(draw([launch()], false)).not.toContain("<button");
  });

  test("more than the table shows is said: how many are shown of how many were read", () => {
    const many = Array.from({ length: 30 }, (_, i) => launch({ symbol: `T${i}`, address: `m${i}${"x".repeat(30)}` }));
    expect(draw(many)).toContain("Mostrando 12 de 30 lancamentos lidos, na ordem escolhida.");
    expect(draw([launch()])).toContain("1 lancamento lido.");
  });

  test("plain ASCII, with no word of an order, no verdict and nothing that animates", () => {
    const visible = html.replace(/<[^>]*>/g, " ");
    expect(visible).not.toMatch(/[^\x20-\x7e]/);
    expect(visible.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|evite|fuja|golpe|seguro|perigo|sinal|recomend|aconselh)\b/);
    expect(html).not.toMatch(/animation|blink|pulse/i);
  });
});

describe("where it lives", () => {
  test("it follows the four that were there, and only the pairs of the exchange come after it (the best opportunities and the multi-network board came first)", () => {
    expect(DOCK_SUBVIEWS.radar.map((v) => v.id)).toEqual(["melhores", "oportunidades", "smart", "zonas", "traders", "holders", "lancamentos", "pares"]);
  });
});
