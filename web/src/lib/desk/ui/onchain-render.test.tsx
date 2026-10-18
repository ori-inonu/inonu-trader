import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChainChips, filterChains } from "@/components/Desk/Dock/ChainChips";
import {
  HoldersTab,
  LeaderboardTable,
  OnchainBody,
  OnchainError,
  OnchainHead,
  SearchResults,
  SignalTable,
  SmartMoneyTab,
  TradersTab,
  WalletTable,
} from "@/components/Desk/Dock/OnchainTabs";
import type { OnchainMeta } from "@/lib/onchain/client";
import { chainChips } from "@/lib/onchain/chains";
import type { OnchainResourceState } from "@/lib/onchain/useOnchainResource";
import { leaderboardRows, signalRows, walletRows } from "@/lib/mesa/onchain-rows";
import { defaultOnchainView } from "@/lib/mesa/onchain-view";
import type { DockTabDef } from "@/lib/mesa/dock";
import { DOCK_TABS } from "@/lib/mesa/dock";
import { DOCK_SUBVIEWS } from "@/lib/mesa/dock-subviews";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const META: OnchainMeta = { tier: "premium", cachedAtMs: NOW - 120_000, ageMs: 120_000, stale: false, budget: { tier: "premium", used: 12, cap: 50_000 } };
const META_STALE: OnchainMeta = { ...META, stale: true, ageMs: 3_600_000 };
const noop = () => {};

function expectNoForbidden(html: string): void {
  expect(html).not.toContain("·");
  expect(html).not.toContain("—");
  expect(html).not.toContain("–");
  const content = html.replace(/ class="[^"]*"/g, "");
  expect(content).not.toContain("NaN");
  expect(content).not.toContain("undefined");
  expect(content).not.toContain("Infinity");
}

const ready = <T,>(data: T[], meta: OnchainMeta = META): OnchainResourceState<T[]> => ({ status: "ready", key: "k", data, meta, error: null });
const loading = <T,>(): OnchainResourceState<T[]> => ({ status: "loading", key: "k", data: null, meta: null, error: null });
const failed = <T,>(code: string, data: T[] | null = null): OnchainResourceState<T[]> => ({ status: "error", key: "k", data, meta: data === null ? null : META_STALE, error: code as never });

describe("dock tab list", () => {
  test("the three onchain views sit together in the Radar tab (group fontes), the one that decides first", () => {
    const ids = DOCK_TABS.map((t: DockTabDef) => t.id);
    expect(ids).toContain("radar");
    expect(DOCK_TABS.find((t) => t.id === "radar")!.group).toBe("fontes");
    // the best opportunities (RAS-8) and the multi-network board (RAS-7) open the Radar; the four views that were there follow them in their order
    expect(DOCK_SUBVIEWS.radar.map((v) => v.id).slice(0, 6)).toEqual(["melhores", "oportunidades", "smart", "zonas", "traders", "holders"]);
    expect(DOCK_SUBVIEWS.radar[0]!.label).toBe("Melhores");
    expect(DOCK_SUBVIEWS.radar.find((v) => v.id === "oportunidades")!.label).toBe("Ecossistema");
    expect(DOCK_SUBVIEWS.radar.find((v) => v.id === "smart")!.label).toBe("Onde comprar");
    expect(DOCK_SUBVIEWS.radar.find((v) => v.id === "traders")!.label).toBe("Traders");
    expect(DOCK_SUBVIEWS.radar.find((v) => v.id === "holders")!.label).toBe("Holders");
  });
});

describe("ChainChips", () => {
  const chips = chainChips({
    apiChains: [{ chainIndex: "1", name: "Ethereum" }, { chainIndex: "501", name: "Solana" }, { chainIndex: "55", name: "Extra Net" }],
    resourceChains: [{ chainIndex: "501", name: "Solana" }],
    resourceLabel: "sinais",
  });

  test("radiogroup with radios, checked value, order and disabled reasons", () => {
    const html = renderToStaticMarkup(<ChainChips chips={chips} value="501" onSelect={noop} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-chain="501"|data-chain="501"[^>]*aria-checked="true"/);
    // X Layer is first and disabled (not in the API list) with the reason in the title.
    expect(html.indexOf("X Layer")).toBeLessThan(html.indexOf("Solana"));
    expect(html).toContain("Nao listada pela API do OnchainOS");
    expect(html).toContain("Sem suporte a sinais nesta rede");
    expectNoForbidden(html);
  });

  test("every network is one click away: a control names how many there are, and the panel is closed until it is asked", () => {
    const many = chainChips({
      apiChains: ["1", "501", ...Array.from({ length: 12 }, (_, i) => `9${i}`)].map((chainIndex) => ({ chainIndex, name: `N${chainIndex}` })),
      resourceChains: null,
      resourceLabel: "sinais",
    });
    const html = renderToStaticMarkup(<ChainChips chips={many} value="1" onSelect={noop} />);
    expect(html).toContain(`Todas as redes (${many.length})`);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Buscar rede");
    expectNoForbidden(html);
  });

  test("a network beyond the few of the row stays in the row when it is the selected one", () => {
    const many = chainChips({
      apiChains: ["1", "501", ...Array.from({ length: 12 }, (_, i) => `9${i}`)].map((chainIndex) => ({ chainIndex, name: `N${chainIndex}` })),
      resourceChains: null,
      resourceLabel: "sinais",
    });
    const away = renderToStaticMarkup(<ChainChips chips={many} value="1" onSelect={noop} />);
    expect(away).not.toContain("N95");
    const picked = renderToStaticMarkup(<ChainChips chips={many} value="95" onSelect={noop} />);
    expect(picked).toMatch(/aria-checked="true"[^>]*data-chain="95"|data-chain="95"[^>]*aria-checked="true"/);
    expect(picked).toContain("N95");
  });

  test("the search keeps the networks whose name, short name or number has what was typed", () => {
    const list = chainChips({
      apiChains: [{ chainIndex: "1", name: "Ethereum" }, { chainIndex: "501", name: "Solana" }, { chainIndex: "143", name: "Monad" }, { chainIndex: "42161", name: "Arbitrum One" }],
      resourceChains: null,
      resourceLabel: "sinais",
    });
    const names = (q: string) => filterChains(list, q).map((c) => c.name);
    expect(filterChains(list, "")).toBe(list);
    expect(filterChains(list, "   ")).toBe(list);
    expect(names("sol")).toEqual(["Solana"]);
    expect(names("ARB")).toEqual(["Arbitrum One"]);
    expect(names("143")).toEqual(["Monad"]);
    expect(names("eth")).toContain("Ethereum");
    expect(names("zzz")).toEqual([]);
  });
});

describe("OnchainHead", () => {
  test("origin, tier and budget in words", () => {
    const html = renderToStaticMarkup(<OnchainHead meta={META} onReload={noop} />);
    expect(html).toContain("OKX OnchainOS");
    expect(html).toContain("ha 2 min");
    expect(html).toContain("Premium");
    expect(html).toContain("uso este mes 12 de 50000");
    expect(html).toContain("Atualizar");
    expectNoForbidden(html);
  });

  test("uncapped budget omits the ceiling", () => {
    const html = renderToStaticMarkup(<OnchainHead meta={{ ...META, budget: { tier: "free", used: 4, cap: null } }} />);
    expect(html).toContain("uso este mes 4");
    expect(html).not.toContain(" de ");
    expectNoForbidden(html);
  });
});

describe("OnchainError", () => {
  test.each([
    ["no_credentials", "Configure a chave do OnchainOS"],
    ["incomplete_credentials", "Configure a chave do OnchainOS"],
    ["provider_unauthorized", "Chave, segredo ou passphrase recusados. Confira em Configuracoes"],
    ["provider_payment_required", "Cota gratuita do mes esgotada no provedor. O sistema nao paga"],
    ["budget_exhausted", "Orcamento do mes esgotado, ajuste em Configuracoes"],
    ["pace_limited", "Ritmo diario atingido, use Atualizar"],
    ["rate_limited", "OnchainOS indisponivel agora"],
    ["provider_error", "OnchainOS indisponivel agora"],
    ["schema", "Resposta fora do contrato, descartada"],
    ["unsupported_chain", "Rede sem suporte a este recurso"],
    ["bad_request", "Pedido invalido"],
  ])("code %s shows its exact sentence", (code: string, text: string) => {
    const html = renderToStaticMarkup(<OnchainError code={code} hasCache={false} />);
    expect(html).toContain(text);
    expectNoForbidden(html);
  });

  test("credential errors link to /configuracoes", () => {
    const html = renderToStaticMarkup(<OnchainError code="no_credentials" hasCache={false} />);
    expect(html).toContain('href="/configuracoes"');
  });

  test("cache-capable codes show the Dado velho badge only when there is cache", () => {
    expect(renderToStaticMarkup(<OnchainError code="budget_exhausted" hasCache />)).toContain("Dado velho");
    expect(renderToStaticMarkup(<OnchainError code="budget_exhausted" hasCache={false} />)).not.toContain("Dado velho");
  });
});

describe("OnchainBody", () => {
  const rows = <div>table</div>;
  test("loading state is neutral", () => {
    const html = renderToStaticMarkup(<OnchainBody state={loading<number>()} rows={0} emptyText="vazio" render={() => rows} />);
    expect(html).toContain("Carregando");
    expectNoForbidden(html);
  });

  test("error without cache shows only the text", () => {
    const html = renderToStaticMarkup(<OnchainBody state={failed<number>("rate_limited")} rows={0} emptyText="vazio" render={() => rows} />);
    expect(html).toContain("OnchainOS indisponivel agora");
    expect(html).not.toContain("table");
  });

  test("budget error with cache keeps the rows under a stale badge", () => {
    const html = renderToStaticMarkup(
      <OnchainBody state={failed<number>("budget_exhausted", [1, 2])} rows={2} emptyText="vazio" render={() => rows} />,
    );
    expect(html).toContain("Orcamento do mes esgotado");
    expect(html).toContain("Dado velho");
    expect(html).toContain("table");
  });

  test("empty result shows the empty text", () => {
    const html = renderToStaticMarkup(<OnchainBody state={ready<number>([])} rows={0} emptyText="Sem sinais nesta rede agora" render={() => rows} />);
    expect(html).toContain("Sem sinais nesta rede agora");
    expect(html).not.toContain("table");
  });
});

describe("signal table", () => {
  const rows = signalRows(
    [
      {
        tsMs: NOW - 180_000,
        chainIndex: "501",
        walletType: "smart_money",
        walletCount: 3,
        amountUsd: 669.4,
        priceUsd: 0.000122,
        soldRatioPct: 64.29,
        token: { address: "ABCDefgh", symbol: "TOK", marketCap: 64_466, holders: 445, top10HoldPct: 17.9 },
      },
    ],
    NOW,
  );

  test("headers and a clickable row with all columns", () => {
    const html = renderToStaticMarkup(<SignalTable rows={rows} chainIndex="501" onPickToken={noop} />);
    for (const h of ["Hora", "Token", "Carteiras", "Valor USD", "Ja venderam %", "Tamanho"]) expect(html).toContain(h);
    // what a person does not decide from is gone: the kind of wallet and a price with seven zeros
    for (const h of ["Tipo", "Preco USD"]) expect(html).not.toContain(`>${h}<`);
    expect(html).toContain("ha 3 min");
    expect(html).toContain("TOK");
    expect(html).not.toContain("Smart money");
    expect(html).toContain('data-token="true"');
    expectNoForbidden(html);
  });
});

describe("leaderboard table", () => {
  const rows = leaderboardRows(
    [
      {
        wallet: "7xKX...gAsU",
        realizedPnlUsd: 125_430.56,
        realizedPnlPct: 312.45,
        winRatePct: 68.5,
        avgBuyUsd: 2_340,
        txVolumeUsd: 890_234.5,
        txs: 342,
        lastActiveMs: NOW - 3_600_000,
        topTokens: [{ symbol: "SOL", pnlUsd: 38_120 }],
      },
    ],
    NOW,
  );

  test("headers and a synthetic row", () => {
    const html = renderToStaticMarkup(<LeaderboardTable rows={rows} />);
    for (const h of ["Carteira", "PnL USD", "PnL %", "Acerto %", "Volume USD", "Txs", "Ultima atividade", "Principais tokens"]) expect(html).toContain(h);
    expect(html).toContain("7xKX...gAsU");
    expect(html).toContain("+US$ 125 mil");
    expect(html).toContain("SOL");
    expectNoForbidden(html);
  });
});

describe("wallet table", () => {
  const rows = walletRows([
    { wallet: "2RH6...FFSK", holdPct: 76.75, boughtAmount: 767_501_192.5, avgBuyPrice: 0.0000619, realizedPnlUsd: 2_912.03, unrealizedPnlUsd: -150.2 },
  ]);

  test("headers and a synthetic row", () => {
    const html = renderToStaticMarkup(<WalletTable rows={rows} ariaLabel="Holders de TOK" />);
    for (const h of ["Carteira", "% do supply", "PnL realizado", "PnL nao realizado", "Compra media", "Quantidade"]) expect(html).toContain(h);
    expect(html).toContain("76,75%");
    expect(html).toContain("+US$ 2,9 mil");
    expect(html).toContain("-US$ 150");
    expectNoForbidden(html);
  });
});

describe("search results", () => {
  test("clickable rows with symbol, name, price, holders and liquidity", () => {
    const html = renderToStaticMarkup(
      <SearchResults
        chainIndex="501"
        onPickToken={noop}
        tokens={[
          { chainIndex: "501", name: "Tesla xStock", symbol: "TSLAx", address: "XsDoVfqe", decimals: 8, price: 381.2, changePct: 6.59, holders: 22_447, liquidityUsd: 3_492_546, marketCap: 51_095_303, communityRecognized: true },
        ]}
      />,
    );
    for (const h of ["Simbolo", "Nome", "Preco", "Holders", "Liquidez"]) expect(html).toContain(h);
    expect(html).toContain("TSLAx");
    expect(html).toContain("Tesla xStock");
    expectNoForbidden(html);
  });
});

describe("tab components render states without a browser", () => {
  const view = defaultOnchainView();

  test("SmartMoneyTab first paint is the loading state with chips and the honesty note", () => {
    const html = renderToStaticMarkup(
      <SmartMoneyTab view={view} patch={noop} chainIndex="501" onPickToken={noop} onFeedState={noop} />,
    );
    expect(html).toContain("Quem esta comprando agora nesta rede, segundo a OKX. A decisao e do Inonu, no pedido acima.");
    // the decision of the Radar sits above the list: the question, and the one button that asks (nothing is asked before the click)
    expect(html).toContain("Decisao do Inonu para esta rede");
    expect(html).toContain("Onde comprar na rede");
    expect(html).toContain("Pedir ao Inonu");
    expect(html).toContain("So roda quando voce pedir.");
    expect(html).toContain("Carregando");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Atualizar");
    expectNoForbidden(html);
  });

  test("TradersTab first paint is the loading state with period and order chips", () => {
    const html = renderToStaticMarkup(<TradersTab view={view} patch={noop} chainIndex="501" onFeedState={noop} />);
    expect(html).toContain("Carregando");
    for (const t of ["1D", "3D", "7D", "1M", "3M"]) expect(html).toContain(`>${t}<`);
    for (const s of ["PnL", "Taxa de acerto", "Transacoes", "Volume", "ROI"]) expect(html).toContain(s);
    expectNoForbidden(html);
  });

  test("HoldersTab without a token shows the pick-a-token state and a search box", () => {
    const html = renderToStaticMarkup(<HoldersTab view={view} patch={noop} chainIndex="501" selectedToken={null} onPickToken={noop} onFeedState={noop} />);
    expect(html).toContain("Escolha um token na vista Smart money ou busque abaixo");
    expect(html).toContain('role="search"');
    expect(html).toContain("Buscar");
    expectNoForbidden(html);
  });

  test("HoldersTab with a token shows internal tabs and tag filters", () => {
    const html = renderToStaticMarkup(
      <HoldersTab
        view={view}
        patch={noop}
        chainIndex="501"
        selectedToken={{ chainIndex: "501", address: "ABCDefgh", symbol: "TOK" }}
        onPickToken={noop}
        onFeedState={noop}
      />,
    );
    expect(html).toContain("Top traders do token");
    expect(html).toContain("Trocar token");
    for (const t of ["Todos", "Smart money", "KOL", "Dev", "Baleia", "Novas", "Suspeitos", "Snipers", "Bundle"]) expect(html).toContain(`>${t}<`);
    expectNoForbidden(html);
  });
});
