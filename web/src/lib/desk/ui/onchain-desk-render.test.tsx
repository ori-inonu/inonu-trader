import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DockPanel, type DockTabView } from "@/components/Desk/Dock/DockPanel";
import { DockEcosystem } from "@/components/Desk/Dock/DockTabs";
import { EcoNewsSection, EcoSentimentLine, EcoVibeBlock, KolsTable, NewsTable, OnchainLiquidityTab, OnchainTapeTab, PoolsTable, TapeTable, WindowsTable } from "@/components/Desk/Dock/OnchainDeskTabs";
import { CLUSTERS_UNSUPPORTED, ClustersBlock, OnchainObjBody, RiskBody, RiskCard } from "@/components/Desk/Dock/OnchainTabs";
import type { OnchainFocus } from "@/lib/onchain/focus";
import type { OnchainMeta } from "@/lib/onchain/client";
import type { OnchainResourceState } from "@/lib/onchain/useOnchainResource";
import type { ClusterOverview, SentimentRow, TokenRisk, VibeTimeline } from "@/lib/onchain/client";
import { kolRows, newsRows, poolRows, tradeTapeRows, windowRows } from "@/lib/mesa/onchain-desk-rows";
import { DOCK_TABS } from "@/lib/mesa/dock";
import { capabilityRows } from "@/lib/mesa/mesa-model";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const META: OnchainMeta = { tier: "premium", cachedAtMs: NOW - 120_000, ageMs: 120_000, stale: false, budget: { tier: "premium", used: 12, cap: 50_000 } };
const META_STALE: OnchainMeta = { ...META, stale: true, ageMs: 3_600_000 };
const FOCUS: OnchainFocus = { chainIndex: "1", address: "0xaaaabbbb", symbol: "WETH", name: null };
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

const ready = <T,>(data: T, meta: OnchainMeta = META): OnchainResourceState<T> => ({ status: "ready", key: "k", data, meta, error: null });
const loading = <T,>(): OnchainResourceState<T> => ({ status: "loading", key: "k", data: null, meta: null, error: null });
const failed = <T,>(code: string, data: T | null = null): OnchainResourceState<T> => ({
  status: "error",
  key: "k",
  data,
  meta: data === null ? null : META_STALE,
  error: code as never,
});

describe("OnchainObjBody", () => {
  const view = <div>objeto</div>;
  test("loading and idle show the neutral state", () => {
    expect(renderToStaticMarkup(<OnchainObjBody state={loading<number>()} emptyText="vazio" render={() => view} />)).toContain("Carregando");
    const idle: OnchainResourceState<number> = { status: "idle", key: null, data: null, meta: null, error: null };
    expect(renderToStaticMarkup(<OnchainObjBody state={idle} emptyText="vazio" render={() => view} />)).toContain("Carregando");
  });

  test("error without cache shows only the sentence", () => {
    const html = renderToStaticMarkup(<OnchainObjBody state={failed<number>("rate_limited")} emptyText="vazio" render={() => view} />);
    expect(html).toContain("OnchainOS indisponivel agora");
    expect(html).not.toContain("objeto");
  });

  test("a cache-capable error keeps the object under the stale badge", () => {
    const html = renderToStaticMarkup(<OnchainObjBody state={failed<number>("budget_exhausted", 7)} emptyText="vazio" render={() => view} />);
    expect(html).toContain("Orcamento do mes esgotado");
    expect(html).toContain("Dado velho");
    expect(html).toContain("objeto");
    expect(html).toContain('data-stale="true"');
  });

  test("a non-cache error keeps the data hidden", () => {
    const html = renderToStaticMarkup(<OnchainObjBody state={failed<number>("provider_unauthorized", 7)} emptyText="vazio" render={() => view} />);
    expect(html).not.toContain("objeto");
  });

  test("ready renders, a null payload on success falls to the empty text", () => {
    expect(renderToStaticMarkup(<OnchainObjBody state={ready(7)} emptyText="vazio" render={() => view} />)).toContain("objeto");
    const emptyReady: OnchainResourceState<number> = { status: "ready", key: "k", data: null, meta: META, error: null };
    expect(renderToStaticMarkup(<OnchainObjBody state={emptyReady} emptyText="vazio" render={() => view} />)).toContain("vazio");
  });
});

describe("OnchainTapeTab", () => {
  test("first paint: honesty note and the loading state", () => {
    const html = renderToStaticMarkup(<OnchainTapeTab focus={FOCUS} onFeedState={noop} nowMs={NOW} />);
    expect(html).toContain("Negociacoes na DEX via OnchainOS, nao e a fita da OKX");
    expect(html).toContain("WETH");
    expect(html).toContain("Carregando");
    expect(html).toContain("OKX OnchainOS");
    expect(html).toContain("Atualizar");
    expectNoForbidden(html);
  });

  test("TapeTable ready: headers and a row per print with side colour hook", () => {
    const rows = tradeTapeRows(
      [
        { id: "t1", tsMs: NOW - 3_000, side: "buy", priceUsd: 3_451.2, volumeUsd: 12_500, dex: "Uniswap V3", wallet: "0xAbC1...23fE", tx: null },
        { id: "t2", tsMs: NOW - 8_000, side: "sell", priceUsd: 3_450.8, volumeUsd: 900, dex: "Curve", wallet: null, tx: null },
      ],
      NOW,
    );
    const html = renderToStaticMarkup(<TapeTable rows={rows} />);
    for (const h of ["Hora", "Lado", "Preco USD", "Valor USD", "DEX", "Carteira"]) expect(html).toContain(h);
    expect(html).toContain("Compra");
    expect(html).toContain("Venda");
    expect(html).toContain('data-side="buy"');
    expect(html).toContain('data-side="sell"');
    expect(html).toContain("0xAbC1...23fE");
    expectNoForbidden(html);
  });
});

describe("OnchainLiquidityTab", () => {
  test("first paint: Janelas grid, Pools column and loading states", () => {
    const html = renderToStaticMarkup(<OnchainLiquidityTab focus={FOCUS} onFeedState={noop} />);
    expect(html).toContain("Janelas");
    expect(html).toContain("Pools");
    for (const h of ["Janela", "Variacao %", "Volume USD", "Transacoes"]) expect(html).toContain(h);
    expect(html).toContain("Carregando");
    expectNoForbidden(html);
  });

  test("WindowsTable ready: the four fixed windows with tones and values", () => {
    const wins = windowRows({
      chainIndex: "1", address: "0xaaa", tsMs: NOW, price: 3_400, marketCap: null, liquidityUsd: null, holders: null,
      circSupply: null, high24h: null, low24h: null, tradeNum: null,
      change: { m5: -0.4, h1: 1.2, h4: 0, h24: -5.1 },
      volume: { m5: 1_000, h1: 2_000, h4: 3_000, h24: 4_000 },
      txs: { m5: 10, h1: 20, h4: 30, h24: 40 },
    });
    const html = renderToStaticMarkup(<WindowsTable wins={wins} />);
    for (const w of ["5 min", "1 h", "4 h", "24 h"]) expect(html).toContain(w);
    expect(html).toContain('data-tone="sell"');
    expect(html).toContain('data-tone="buy"');
    expect(html).toContain("-5,1");
    expectNoForbidden(html);
  });

  test("PoolsTable ready and stale dims", () => {
    const pools = poolRows([{ pool: "WETH / USDC", protocol: "Uniswap V3", liquidityUsd: 3_400_000, address: "0x1234...abce", feePct: 0.05 }]);
    const html = renderToStaticMarkup(<PoolsTable pools={pools} stale />);
    for (const h of ["Pool", "Protocolo", "Liquidez USD", "Taxa %"]) expect(html).toContain(h);
    expect(html).toContain("WETH / USDC");
    expect(html).toContain("0,05%");
    expect(html).toContain('data-stale="true"');
    expectNoForbidden(html);
  });
});

describe("Holders risk card", () => {
  const risk: TokenRisk = {
    chainIndex: "1",
    address: "0xaaa",
    riskLevel: 3,
    tags: ["communityRecognized"],
    top10HoldPct: 17.9,
    devHoldPct: 0.4,
    bundleHoldPct: null,
    sniperHoldPct: 3,
    suspiciousHoldPct: null,
    lpBurnedPct: 99.9,
    devCreateCount: 4,
    devLaunchedCount: 3,
    devRugCount: 1,
    createdMs: NOW - 40 * 86_400_000,
    progressPct: null,
  };
  const cluster: ClusterOverview = {
    concentration: "Medium",
    top100HoldPct: 22.5,
    newAddressPct: 8.4,
    sameFundSourcePct: 10.2,
    sameCreationTimePct: 1.1,
    rugPullPct: null,
  };

  test("first paint: section title and loading, without fetching a thing", () => {
    const html = renderToStaticMarkup(<RiskCard token={{ chainIndex: "1", address: "0xaaaabbbb", symbol: "WETH" }} nowMs={NOW} />);
    expect(html).toContain("Estrutura e risco");
    expect(html).toContain("Carregando");
    expectNoForbidden(html);
  });

  test("ready risk body: level, tags, provider-scale stats and dev history", () => {
    const html = renderToStaticMarkup(<RiskBody risk={risk} nowMs={NOW} />);
    expect(html).toContain("Nivel 3 de 5");
    expect(html).toContain("escala do provedor");
    expect(html).toContain("communityRecognized");
    expect(html).toContain("criado ha 40 d");
    for (const s of ["Top 10", "Dev", "Bundlers", "Snipers", "Suspeitos", "LP queimado"]) expect(html).toContain(s);
    expect(html).toContain("17,9%");
    expect(html).toContain("como o provedor envia");
    for (const s of ["Tokens criados", "Lancados", "Rug pulls"]) expect(html).toContain(s);
    expectNoForbidden(html);
  });

  test("clusters on a chain outside the supported list render the unavailable line, no call needed", () => {
    const html = renderToStaticMarkup(
      <ClustersBlock chainIndex="196" chainsData={[{ chainIndex: "1" }, { chainIndex: "501" }]} clustersState={loading<ClusterOverview>()} />,
    );
    expect(html).toContain(CLUSTERS_UNSUPPORTED);
    expect(html).not.toContain("Carregando");
  });

  test("the unsupported_chain error lands on the same line", () => {
    const html = renderToStaticMarkup(
      <ClustersBlock chainIndex="1" chainsData={[{ chainIndex: "1" }]} clustersState={failed<ClusterOverview>("unsupported_chain")} />,
    );
    expect(html).toContain(CLUSTERS_UNSUPPORTED);
  });

  test("ready clusters render concentration and the stat grid", () => {
    const html = renderToStaticMarkup(<ClustersBlock chainIndex="1" chainsData={[{ chainIndex: "1" }]} clustersState={ready(cluster)} />);
    expect(html).toContain("Concentracao");
    expect(html).toContain("Media");
    for (const s of ["Top 100", "Enderecos novos", "Mesma origem de fundos", "Mesma criacao", "Rug pull"]) expect(html).toContain(s);
    expectNoForbidden(html);
  });

  test("a clusters error keeps an honest sentence", () => {
    const html = renderToStaticMarkup(<ClustersBlock chainIndex="1" chainsData={[{ chainIndex: "1" }]} clustersState={failed<ClusterOverview>("provider_error")} />);
    expect(html).toContain("OnchainOS indisponivel agora");
  });

  test("clusters ready with data null is a neutral line, not an error and not loading", () => {
    const html = renderToStaticMarkup(
      <ClustersBlock chainIndex="1" chainsData={[{ chainIndex: "1" }]} clustersState={ready<ClusterOverview | null>(null)} />,
    );
    expect(html).toContain("Sem dados de grupos para este token");
    expect(html).not.toContain("Carregando");
    expect(html).not.toContain("indisponivel agora");
  });

  test("while the chain list is still out, nothing renders (no premature unavailable)", () => {
    const html = renderToStaticMarkup(<ClustersBlock chainIndex="1" chainsData={null} clustersState={loading<ClusterOverview>()} />);
    expect(html).toBe("");
  });
});

describe("EcoNewsSection", () => {
  test("an invalid symbol shows the skip line and spends no call", () => {
    const html = renderToStaticMarkup(<EcoNewsSection symbol="TOK-XX" focus={null} onFeedState={noop} nowMs={NOW} />);
    expect(html).toContain("Simbolo sem noticias");
    expect(html).toContain("Texto de terceiros, o Inonu nao le esta aba");
    expect(html).not.toContain("Calor social");
    expectNoForbidden(html);
  });

  test("OKX focus: news and sentiment load, no social heat or KOLs", () => {
    const html = renderToStaticMarkup(<EcoNewsSection symbol="BTC" focus={null} onFeedState={noop} nowMs={NOW} />);
    expect(html).toContain("Noticias e sentimento");
    expect(html).toContain("BTC");
    expect(html).toContain("Carregando");
    expect(html).not.toContain("Calor social");
    expect(html).not.toContain("Top KOLs");
    expectNoForbidden(html);
  });

  test("on-chain focus adds Calor social and the KOLs table skeleton", () => {
    const html = renderToStaticMarkup(<EcoNewsSection symbol="WETH" focus={FOCUS} onFeedState={noop} nowMs={NOW} />);
    expect(html).toContain("Calor social");
    expect(html).toContain("Top KOLs");
    for (const h of ["Conta", "Seguidores", "Mencoes", "Impressoes", "Engajamento"]) expect(html).not.toContain(`>${h}<`);
    expectNoForbidden(html);
  });

  test("on-chain focus states the symbol-search honesty; an OKX focus does not need it", () => {
    const onchain = renderToStaticMarkup(<EcoNewsSection symbol="WETH" focus={FOCUS} onFeedState={noop} nowMs={NOW} />);
    expect(onchain).toContain("Busca por simbolo, nao por contrato: outros tokens podem usar o mesmo simbolo");
    const okx = renderToStaticMarkup(<EcoNewsSection symbol="BTC" focus={null} onFeedState={noop} nowMs={NOW} />);
    expect(okx).not.toContain("nao por contrato");
  });

  test("sentiment ready with data null is the neutral line, never an error", () => {
    const html = renderToStaticMarkup(<EcoSentimentLine state={ready<SentimentRow | null>(null)} />);
    expect(html).toContain("Sem sentimento para este simbolo");
    expect(html).not.toContain("indisponivel");
    expect(html).not.toContain("Carregando");
    expectNoForbidden(html);
  });

  test("sentiment error without cache is the error copy; loading stays neutral", () => {
    const err = renderToStaticMarkup(<EcoSentimentLine state={failed<SentimentRow | null>("rate_limited")} />);
    expect(err).toContain("OnchainOS indisponivel agora");
    const load = renderToStaticMarkup(<EcoSentimentLine state={loading<SentimentRow | null>()} />);
    expect(load).toContain("Carregando");
  });

  test("vibe ready with data null is the neutral empty line", () => {
    const html = renderToStaticMarkup(<EcoVibeBlock state={ready<VibeTimeline | null>(null)} />);
    expect(html).toContain("Sem dados sociais para este token");
    expect(html).not.toContain("Carregando");
    expectNoForbidden(html);
  });

  test("vibe ready renders the heat line with tone", () => {
    const vibe: VibeTimeline = { score: 57.5, scoreChangeRate: 2.1, mentions: 14, mentionsChangeRate: -3, impressions: 330_991, engagement: 5_384, points: [] };
    const html = renderToStaticMarkup(<EcoVibeBlock state={ready(vibe)} />);
    expect(html).toContain("de 100");
    expectNoForbidden(html);
  });

  test("NewsTable ready: hour, importance word, plain-text title and source; summary on title only", () => {
    const rows = newsRows(
      [{ id: "n1", title: "BTC sobe forte", summary: "Resumo <script> nao executa", source: "CoinDesk", tsMs: NOW - 60_000, importance: "high", symbols: ["BTC"], sentiments: [] }],
      NOW,
    );
    const html = renderToStaticMarkup(<NewsTable rows={rows} />);
    for (const h of ["Hora", "Importancia", "Titulo", "Fonte"]) expect(html).toContain(h);
    expect(html).toContain("Alta");
    expect(html).toContain("BTC sobe forte");
    expect(html).toContain("CoinDesk");
    expect(html).toContain('title="Resumo &lt;script&gt; nao executa"');
    expect(html).not.toContain("<script>");
    expect(html).toContain('aria-label="Noticias do simbolo"');
    expectNoForbidden(html);
  });

  test("KolsTable ready: handle, counts", () => {
    const rows = kolRows([{ handle: "jackduval", nickname: null, followers: 512_000, mentions: 34, impressions: 98_000, engagement: 1_200, firstMentionMs: null }]);
    const html = renderToStaticMarkup(<KolsTable kols={rows} />);
    for (const h of ["Conta", "Seguidores", "Mencoes", "Impressoes", "Engajamento"]) expect(html).toContain(h);
    expect(html).toContain("@jackduval");
    expectNoForbidden(html);
  });

  test("the section sits above the capability list via DockEcosystem top", () => {
    const caps = capabilityRows({ desk: [], jev: { status: "absent", ageMs: null }, systemOne: { status: "absent", execution: null, reasons: [] }, wallet: { status: "disconnected", available: true }, operator: { status: "absent" }, hasDerivatives: false });
    const html = renderToStaticMarkup(<DockEcosystem rows={caps} top={<EcoNewsSection symbol="BTC" focus={null} onFeedState={noop} nowMs={NOW} />} />);
    expect(html.indexOf("Noticias e sentimento")).toBeLessThan(html.indexOf("Ecossistema OKX e OnchainOS"));
    expectNoForbidden(html);
  });
});

describe("call policy gating", () => {
  const tabs = (): DockTabView[] => DOCK_TABS.map((t) => ({ ...t, state: "live" as const, body: <p>corpo {t.id}</p> }));

  test("a closed dock renders no body at all", () => {
    const html = renderToStaticMarkup(
      <DockPanel tabs={tabs()} active="diario" onSelect={noop} open={false} onToggle={noop} heightPct={26} onHeightPct={noop} />,
    );
    expect(html).not.toContain("corpo");
  });

  test("only the active tab body mounts: the other four bodies never exist", () => {
    const html = renderToStaticMarkup(
      <DockPanel tabs={tabs()} active="diario" onSelect={noop} open onToggle={noop} heightPct={26} onHeightPct={noop} />,
    );
    expect(html).toContain("corpo diario");
    for (const t of DOCK_TABS.filter((d) => d.id !== "diario")) expect(html).not.toContain(`corpo ${t.id}`);
  });
});
