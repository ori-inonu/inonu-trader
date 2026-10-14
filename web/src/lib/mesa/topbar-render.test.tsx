import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeskRail from "@/components/Desk/DeskRail";
import TopbarPopover from "@/components/Desk/TopbarPopover";
import { FORBIDDEN_TEXT, type FeedChip } from "./mesa-model";
import { PALETTES } from "./preferences";

const NOW = 1_791_742_100_000;
const chip = (id: string, label: string, tone: FeedChip["tone"], detail: string | null = null): FeedChip => ({ id, label, tone, detail });

const chips: FeedChip[] = [
  chip("okx-public-ws", "OKX tempo real", "live"),
  chip("okx-business-ws", "OKX velas", "live"),
  chip("okx-public-rest", "OKX REST", "live"),
  chip("jev-backend", "Jev", "late", "leituras sem decisao do modelo"),
  chip("okx-wallet", "Carteira OKX", "off", "nao conectada"),
  chip("onchainos", "OnchainOS", "down", "operador sem resposta"),
];

const render = (props: Partial<Parameters<typeof DeskRail>[0]> = {}) => renderToStaticMarkup(<DeskRail chips={chips} skewMs={69_500} nowMs={NOW} {...props} />);

describe("the topbar keeps the identity and gains sections", () => {
  test("the logo and the name are always there; only the subtitle is a narrow-width casualty", () => {
    const html = render();
    expect(html).toContain("<svg");
    expect(html).toContain("INONU TRADER");
    expect(html).toContain("Mesa de decisao do Inonu");
  });

  test("two sections, the current one marked, and the Central reachable twice (bar and popover)", () => {
    const html = render();
    expect(html).toContain('aria-label="Secoes do app"');
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*aria-current="page"[^>]*>Mesa<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/console"[^>]*>Central<\/a>/);
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html.match(/href="\/console"/g)?.length).toBe(2);
  });
});

describe("the symbol search", () => {
  test("is the owner's picker in a labelled frame with the key that opens it", () => {
    const html = render({ symbolPicker: <button type="button" aria-haspopup="dialog" aria-expanded="false">BTC-USDT</button> });
    expect(html).toContain('aria-label="Buscar ativo"');
    expect(html).toContain("BTC-USDT");
    expect(html).toMatch(/<kbd[^>]*>\/<\/kbd>/);
  });

  test("without a picker there is no frame and no key hint", () => {
    const html = render();
    expect(html).not.toContain('aria-label="Buscar ativo"');
    expect(html).not.toMatch(/<kbd[^>]*aria-hidden/);
  });
});

describe("the sources collapse into one pill with a list", () => {
  test("the pill carries the count and the worst state in words, and is a disclosure", () => {
    const html = render();
    expect(html).toContain("Fontes");
    expect(html).toContain("3 ao vivo, 1 atrasada, 1 fora do ar");
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toMatch(/aria-controls="/);
    expect(html).toContain("fora do ar");
  });

  test("the list keeps every source except the wallet, each with its state spoken", () => {
    const html = render();
    expect(html).toContain('aria-label="Saude das fontes de dados"');
    for (const label of ["OKX tempo real", "OKX velas", "OKX REST", "Jev", "OnchainOS"]) expect(html).toContain(label);
    expect(html).toContain("leituras sem decisao do modelo");
    expect(html).toContain("operador sem resposta");
    const list = html.slice(html.indexOf('aria-label="Saude das fontes de dados"'), html.indexOf("A carteira e o relogio"));
    expect(list).not.toContain("nao conectada");
  });

  test("when the owner gives the ages each source says how long ago it spoke; the others show no line", () => {
    const html = render({ ages: { "okx-public-ws": 400, "okx-business-ws": 45_000, "okx-public-rest": null } });
    expect(html).toContain(">agora<");
    expect(html).toContain(">ha 45 s<");
    expect(html).toContain(">sem mensagem<");
    expect(render()).not.toContain("ha 45 s");
  });

  test("the panel stays in the document while closed, hidden, for assistive technology", () => {
    const html = render();
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Fontes de dados"[^>]*hidden=""/);
  });
});

describe("the account chip", () => {
  test("says the wallet state and explains it, and the bar has no control that connects or signs", () => {
    const html = render();
    expect(html).toContain("Carteira OKX");
    expect(html).toContain("nao conectada");
    expect(html).toContain("A barra nao conecta nem assina nada.");
    expect(html).toMatch(/<button[^>]*data-tool="wallet"[^>]*title="Carteira OKX"/);
    expect(html).not.toMatch(/>\s*(Conectar|Assinar|Enviar|Comprar|Vender)\b/);
  });

  test("while connected the short address is shown and the full one is not", () => {
    const full = "0x1234567890abcdef1234567890abcdef12345678";
    const html = render({ chips: chips.map((c) => (c.id === "okx-wallet" ? chip("okx-wallet", "Carteira OKX", "live", "conectada") : c)), account: full });
    expect(html).toContain("Carteira 0x1234…5678");
    expect(html).not.toContain(full);
  });
});

describe("the clock", () => {
  test("keeps the full sentence for readers and shows a short selo", () => {
    const html = render();
    expect(html).toContain("UTC");
    expect(html).toContain("relogio 70 s atrasado");
    expect(html).toContain("Relogio local 70 s atrasado em relacao a OKX");
    expect(render({ skewMs: null })).toContain("--:--:--");
  });
});

describe("the tools", () => {
  test("preferences, capture and full screen are named buttons in a labelled group", () => {
    const html = render();
    expect(html).toContain('aria-label="Ferramentas"');
    expect(html).toContain("Preferencias");
    expect(html).toMatch(/<button[^>]*aria-label="Salvar o grafico como imagem"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="Tela cheia"/);
  });

  test("the preferences panel offers the three palettes, the keys and the fixed facts", () => {
    const html = render();
    expect(html).toContain("Cores de alta e baixa");
    for (const palette of PALETTES) {
      expect(html).toContain(palette.label);
      expect(html).toContain(palette.hint);
    }
    expect(html.match(/aria-pressed="false"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Atalhos");
    expect(html).toContain("Buscar ativo");
    expect(html).toContain("Tela cheia");
    expect(html).toContain("Portugues (Brasil)");
    expect(html).toContain("UTC, hora da OKX");
  });

  test("no control of the bar places an order, and nothing carries a forbidden character", () => {
    const html = render({ symbolPicker: <button type="button" aria-haspopup="dialog">ETH-USDT</button>, ages: { "okx-public-ws": 1_200 } });
    expect(html).not.toMatch(/>\s*(Ordem|Ordenar|Executar|Operar|Negociar)\b/i);
    expect(html).not.toMatch(FORBIDDEN_TEXT);
  });
});

describe("the price alerts menu", () => {
  const withPrice = () => render({ instId: "BTC-USDT", prices: { "BTC-USDT": 82_500, "ETH-USDT": null } });

  test("is a named icon popover with the form, the honest note and an empty list", () => {
    const html = withPrice();
    expect(html).toMatch(/<button[^>]*data-tool="alerts"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/role="group"[^>]*aria-label="Alertas de preco"[^>]*hidden=""/);
    expect(html).toContain("Avisar quando BTC-USDT chegar a");
    expect(html).toMatch(/<input[^>]*inputMode="decimal"[^>]*placeholder="82\.500,00"/);
    expect(html).toContain("Criar alerta");
    expect(html).toContain("Nenhum alerta ainda");
    expect(html).toContain("Valem so com esta aba aberta. Nada e enviado e nenhuma ordem e criada.");
  });

  test("with the price unknown the field is disabled and says why, never a zero", () => {
    const html = render({ instId: "BTC-USDT", prices: { "BTC-USDT": null } });
    expect(html).toMatch(/<input[^>]*disabled=""/);
    expect(html).toMatch(/<input[^>]*placeholder="Preco indisponivel"/);
    expect(html).toContain("O preco deste ativo esta indisponivel agora");
    expect(html).not.toMatch(/placeholder="0/);
    const nothing = render();
    expect(nothing).toMatch(/<input[^>]*disabled=""/);
  });

  test("a fresh render shows no badge, since nothing has fired and nothing is stored on the server", () => {
    const html = withPrice();
    expect(html).not.toMatch(/data-badge/);
  });

  test("the menu creates no order: its words and controls are about notices only", () => {
    const html = withPrice();
    expect(html).not.toMatch(/>\s*(Ordem|Ordenar|Executar|Operar|Negociar|Comprar|Vender)\b/i);
    expect(html).not.toMatch(FORBIDDEN_TEXT);
  });
});

describe("the chart mode button", () => {
  test("is a pressed-state button named in words, with its key in the title", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*data-tool="layout"[^>]*aria-pressed="false"[^>]*aria-label="Modo grafico"[^>]*title="Modo grafico \(G\)"/);
  });

  test("the tool group keeps the new buttons next to the old ones and every key is listed in the preferences panel", () => {
    const html = render();
    for (const tool of ["alerts", "layout", "fullscreen", "preferences"]) expect(html).toContain(`data-tool="${tool}"`);
    expect(html).toContain("Alertas de preco");
    expect(html).toContain("Modo grafico");
    expect(html).toContain("Preferencias e atalhos");
  });
});

describe("TopbarPopover", () => {
  test("renders a closed disclosure whose trigger is named by its face and linked to the hidden panel", () => {
    const html = renderToStaticMarkup(
      <TopbarPopover label="Painel de teste" tone="live" face={<span>Rotulo visivel</span>}>
        <p>Conteudo</p>
      </TopbarPopover>,
    );
    expect(html).toContain("Rotulo visivel");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"/);
    const id = /aria-controls="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(id.length).toBeGreaterThan(0);
    expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/role="group"[^>]*aria-label="Painel de teste"[^>]*hidden=""/);
    expect(html).toContain("Conteudo");
    expect(html).toContain('data-variant="pill"');
  });

  test("the icon variant has no chevron and keeps its hidden name", () => {
    const html = renderToStaticMarkup(
      <TopbarPopover label="Menu" variant="icon" face={<span>Nome oculto</span>}>
        <p>Itens</p>
      </TopbarPopover>,
    );
    expect(html).toContain('data-variant="icon"');
    expect(html).not.toContain("<path");
    expect(html).toContain("Nome oculto");
  });
});
