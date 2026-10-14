import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DockPanel, type DockTabView } from "@/components/Desk/Dock/DockPanel";
import { DockBook, DockEcosystem, DockJournal, DockTape, DockWallet } from "@/components/Desk/Dock/DockTabs";
import { DOCK_TABS } from "@/lib/mesa/dock";
import { capabilityRows, journalRows } from "@/lib/mesa/mesa-model";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import type { JevReadView } from "@/lib/jev-read";
import type { DeskMetrics } from "../types";
import { createLabMarket, LAB_PRESETS } from "./lab-fixture";

const T = Date.UTC(2026, 9, 11, 12, 0, 0);
const AWAITING = "Aguardando dados da OKX";

const EMPTY_METRICS: DeskMetrics = {
  midPx: null, microPx: null, spreadBps: null, depthBidShare10bps: null, depthBidShare50bps: null,
  bidDepthQuote10bps: null, askDepthQuote10bps: null, bidDepthQuote50bps: null, askDepthQuote50bps: null,
  buyVolBase60s: null, sellVolBase60s: null, flowImbalance60s: null, tradesPerSecond60s: null, cvd: null,
  vwap: null, realizedSigmaDaily: null, change24hPct: null,
};

function expectNoForbidden(html: string): void {
  expect(html).not.toContain("·");
  expect(html).not.toContain("—");
  expect(html).not.toContain("–");
  const content = html.replace(/ class="[^"]*"/g, "");
  expect(content).not.toContain("NaN");
  expect(content).not.toContain("undefined");
}

const lab = () => createLabMarket(LAB_PRESETS[0], 3, T).state();
const noop = () => {};

const tabs = (over: Partial<DockTabView> = {}): DockTabView[] =>
  DOCK_TABS.map((t) => ({ ...t, state: "live" as const, body: <p>corpo {t.id}</p>, ...over }));

function panel(props: Partial<Parameters<typeof DockPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <DockPanel tabs={tabs()} active="diario" onSelect={noop} open onToggle={noop} heightPct={26} onHeightPct={noop} {...props} />,
  );
}

describe("DockPanel chrome", () => {
  test("tablist: every tab with role, the active one selected and tabbable, the rest roving", () => {
    const html = panel();
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)!.length).toBe(DOCK_TABS.length);
    expect(html).toMatch(/id="[^"]*dock-tab-diario"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="[^"]*dock-tab-radar"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
    expect(html).toContain('role="tabpanel"');
    const activeId = html.match(/id="([^"]*dock-tab-diario)"/)![1];
    expect(html).toContain(`aria-labelledby="${activeId}"`);
    expectNoForbidden(html);
  });

  test("simultaneous desktop and mobile docks have unique ids and label their own content", () => {
    const html = renderToStaticMarkup(<>{["desktop", "livro", "fontes"].map((group) => (
      <DockPanel key={group} group={group} tabs={tabs()} active="carteira" onSelect={noop} open onToggle={noop} heightPct={26} onHeightPct={noop} />
    ))}</>);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = html.split("<section").slice(1);
    expect(sections).toHaveLength(3);
    for (const section of sections) {
      const tab = section.match(/id="([^"]+)"[^>]*aria-selected="true"[^>]*aria-controls="([^"]+)"/)!;
      expect(section).toContain(`role="tabpanel" id="${tab[2]}" aria-labelledby="${tab[1]}"`);
    }
  });

  test("the bar shows the state chip of the active tab in words", () => {
    const html = panel({ tabs: tabs({ id: "diario", state: "stale" }) });
    expect(html).toContain("Dado velho");
  });

  test("every tab carries its own state: a dot for the eye and the words for the reader, never colour alone", () => {
    const html = panel({ tabs: tabs().map((t) => (t.id === "carteira" ? { ...t, state: "empty" as const } : t.id === "fluxo" ? { ...t, state: "stale" as const } : t)) });
    const tabOf = (id: string) => html.match(new RegExp(`<button[^>]*dock-tab-${id}"[^>]*>.*?</button>`))![0];
    expect(tabOf("carteira")).toContain('data-state="empty"');
    expect(tabOf("carteira")).toContain("sem dados");
    expect(tabOf("fluxo")).toContain('data-state="stale"');
    expect(tabOf("fluxo")).toContain("dado velho");
    expect(tabOf("radar")).toContain('data-state="live"');
    expect(tabOf("radar")).toContain("ao vivo");
    expect(html.match(/aria-hidden="true"><\/span>/g)!.length).toBeGreaterThanOrEqual(DOCK_TABS.length);
  });

  test("collapsed shows only the bar: no body, no separator", () => {
    const html = panel({ open: false });
    expect(html).not.toContain('role="tabpanel"');
    expect(html).not.toContain('role="separator"');
    expect(html).toContain("Expandir painel inferior");
  });

  test("the separator is a labelled slider that announces its percent", () => {
    const html = panel({ heightPct: 40 });
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain('aria-valuemax="55"');
    expect(html).toContain('tabindex="0"');
  });

  test("not resizable: no separator, no collapse button", () => {
    const html = panel({ resizable: false });
    expect(html).not.toContain('role="separator"');
    expect(html).not.toContain("Recolher");
  });

  test("an active id outside the visible list falls back to the first tab", () => {
    const html = panel({ active: "carteira", tabs: tabs().filter((t) => t.id === "radar" || t.id === "fluxo") });
    const firstId = html.match(/id="([^"]*dock-tab-radar)"/)![1];
    expect(html).toContain(`aria-labelledby="${firstId}"`);
  });
});

describe("DockTape", () => {
  test("empty: honest state, no rows", () => {
    const html = renderToStaticMarkup(<DockTape trades={[]} instrument={null} />);
    expect(html).toContain(AWAITING);
    expect(html).not.toContain('role="row"');
  });

  test("with data: hour, price, size, value and the side with colour and word", () => {
    const s = lab();
    const html = renderToStaticMarkup(<DockTape trades={s.trades} instrument={s.instrument} />);
    expect(html).toContain("Hora UTC");
    expect(html).toContain("Valor");
    expect(html).toContain("Compra");
    expect(html).toContain("Venda");
    expect(html).toContain('role="columnheader"');
    expectNoForbidden(html);
  });

  test("a print above three times the median is marked", () => {
    const s = lab();
    const trades = [...s.trades, { id: "big-1", px: 100, sz: 50, side: "sell" as const, tsMs: T + 1 }];
    const html = renderToStaticMarkup(<DockTape trades={trades} instrument={s.instrument} />);
    expect(html).toContain('data-large="true"');
    expect(html).toContain("negocio grande");
  });

  test("stale dims the table", () => {
    const s = lab();
    const html = renderToStaticMarkup(<DockTape trades={s.trades} instrument={s.instrument} stale />);
    expect(html).toContain('data-stale="true"');
  });
});

describe("DockBook", () => {
  test("empty book is an honest state", () => {
    const html = renderToStaticMarkup(<DockBook book={null} instrument={null} metrics={EMPTY_METRICS} />);
    expect(html).toContain(AWAITING);
  });

  test("with data: mid, spread, imbalance and both sides with three columns", () => {
    const s = lab();
    const html = renderToStaticMarkup(
      <DockBook book={s.book} instrument={s.instrument} metrics={{ ...s.metrics, midPx: 0.022225, spreadBps: 4.5, depthBidShare10bps: 0.62 }} />,
    );
    expect(html).toContain("Preco medio");
    expect(html).toContain("Spread");
    expect(html).toContain("Desequilibrio");
    expect(html).toContain("62% compra");
    expect(html).toContain("Acumulado");
    expect(html).toContain("Ofertas de compra");
    expect(html).toContain("Ofertas de venda");
    expectNoForbidden(html);
  });

  test("every data row on each side carries exactly three cells", () => {
    const s = lab();
    const html = renderToStaticMarkup(<DockBook book={s.book} instrument={s.instrument} metrics={s.metrics} />);
    const groups = html.split('role="rowgroup"').slice(1);
    expect(groups.length).toBe(2);
    for (const group of groups) {
      const rows = group.match(/<div[^>]*role="row"[^>]*>([\s\S]*?)<\/div>/g) ?? [];
      // each data row must hold exactly 3 cells (the depth bar is not a cell)
      const dataRows = group.match(/role="row"/g) ?? [];
      expect(dataRows.length).toBeGreaterThan(1); // header + data
      for (const row of rows) {
        const cells = row.match(/role="cell"/g) ?? [];
        expect(cells.length === 0 || cells.length === 3).toBe(true);
      }
      const cellCount = (group.match(/role="cell"/g) ?? []).length;
      const rowCount = dataRows.length - 1; // minus the column header row
      expect(cellCount).toBe(rowCount * 3);
    }
  });
});

describe("DockWallet", () => {
  const wallet = (): UseOkxWalletResult => ({
    available: true,
    ready: true,
    snapshot: { status: "disconnected", account: null, chainId: null, balances: null, observedAtMs: null, error: null },
    connect: async () => {},
    refresh: async () => {},
    switchToMonad: async () => {},
    switchToXLayer: async () => {},
    disconnect: () => {},
    revision: 0,
    identityKey: null,
    preflightTransaction: async () => ({ status: "blocked" as const, executionQualified: false as const, reason: "session_unavailable" }),
    getSessionToken: () => 0,
    subscribeSessionInvalidation: () => () => {},
  });

  test("keeps the OKX wallet module and states the Agentic Wallet honestly, with no connect action", () => {
    const html = renderToStaticMarkup(<DockWallet wallet={wallet()} />);
    expect(html).toContain("Carteira OKX");
    expect(html).toContain("Agentic Wallet");
    expect(html).toContain("Nao conectada. O login e feito pelo dono, no CLI onchainos, e a mesa nao guarda token nem chave.");
    expect(html).toContain("web3.okx.com/onchainos");
    expectNoForbidden(html);
  });
});

describe("DockJournal", () => {
  const read: JevReadView = {
    readId: "jr-1",
    instId: "BTC-USDT",
    atMs: T,
    clockOffsetMs: null,
    state: null,
    insufficient: [],
    decision: { action: "sell", probabilities: { buy: 0.1, sell: 0.63, hold: 0.27 }, confidence: 0.63, latencyMs: 291, model: "jev-1.13.0", status: "ok", inputTokens: 894 },
  };

  test("empty: says so in words", () => {
    const html = renderToStaticMarkup(<DockJournal rows={[]} />);
    expect(html).toContain("Nenhuma leitura do Inonu ainda");
    expect(html).toContain("Consultivo");
  });

  test("with reads: action with word and weight", () => {
    const html = renderToStaticMarkup(<DockJournal rows={journalRows([read], 40)} />);
    expect(html).toContain("Consultivo");
    expect(html).toContain("Vender");
    expect(html).toContain("63%");
    expect(html).toContain("BTC");
    expectNoForbidden(html);
  });
});

describe("DockEcosystem", () => {
  test("the capability matrix fills the tab", () => {
    const caps = capabilityRows({ desk: [], jev: { status: "absent", ageMs: null }, systemOne: { status: "absent", execution: null, reasons: [] }, wallet: { status: "disconnected", available: true }, operator: { status: "absent" }, hasDerivatives: false });
    const html = renderToStaticMarkup(<DockEcosystem rows={caps} />);
    expect(html).toContain("Ecossistema OKX e OnchainOS");
    expect(html).toContain("Bloqueado");
  });
});
