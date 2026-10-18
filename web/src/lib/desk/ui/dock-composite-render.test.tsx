// DOC-1, DOC-4, INF-1: the drawing of the composite dock tabs, rendered to markup. The chip row of a tab with several views, the Fluxo
// table and the Zonas table each show real rows with the age and source the model gives, or the reason they are empty, and only the
// view that is chosen is in the markup. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DockComposite, DockFlowBody, DockZonesBody } from "@/components/Desk/Dock/DockComposite";
import { DOCK_SUBVIEWS } from "@/lib/mesa/dock-subviews";
import { FLOW_ROWS_MAX, flowTab, zonesTab } from "@/lib/mesa/flow-tab-model";
import type { ChartOverlay } from "@/lib/inonu/overlay";
import type { OverlayFeedState } from "@/lib/inonu/overlay-feed";

const NOW = 1_800_000_000_000;
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

const overlay = (over: Partial<ChartOverlay> = {}): ChartOverlay => ({
  instId: "BTC-USDT",
  asOfMs: NOW - 2_000,
  fonte: "okx_ws_trades",
  price: 100.5,
  atr14: 0.8,
  tickSz: "0.1",
  step: 0.1,
  binTicks: 1,
  aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 },
  niveis: [{ baixo: 100.0, alto: 100.1, c: 10, v: 40, imb: "v", volume: "v", alerta: null }],
  corridas: { sequencial: [{ lado: "c", baixo: 100.1, alto: 100.3, n: 3 }], progressao: [], exaustao: [] },
  perfil: { poc: { baixo: 100.1, alto: 100.2 }, val: 100.0, vah: 100.3, hvn: [], lvn: [] },
  absorcao: null,
  zonas: [
    { id: "z1", lado: "demanda", baixo: 99.4, alto: 99.8, nota: 0.72, estado: "ativa", fatores: ["E1", "E3"], idadeBarras: 7, invalidacao: 99.0, primeiroTs: NOW - 600_000 },
    { id: "z2", lado: "oferta", baixo: 101.2, alto: 101.6, nota: 0.55, estado: "testada", fatores: ["E2"], idadeBarras: 1, invalidacao: null, primeiroTs: NOW - 60_000 },
  ],
  ...over,
});
const ok = (o = overlay()): OverlayFeedState => ({ status: "ok", overlay: o, reason: null });

describe("DockComposite: the chip row of a tab with several views", () => {
  const radar = () =>
    renderToStaticMarkup(
      <DockComposite label="Vistas do Radar" views={DOCK_SUBVIEWS.radar} active="smart" onSelect={noop}>
        <p>corpo da vista</p>
      </DockComposite>,
    );

  test("every view is a chip in a labelled group, the chosen one pressed, the rest not", () => {
    const html = radar();
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Vistas do Radar"');
    for (const label of ["Melhores", "Ecossistema", "Onde comprar", "Zonas", "Traders", "Holders", "Lancamentos", "Pares OKX"]) expect(html).toContain(`>${label}<`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Onde comprar</);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(7);
    expectNoForbidden(html);
  });

  test("the origin and age line of the view sits at the end of the chip row; with none there is no element for it", () => {
    const withLine = renderToStaticMarkup(
      <DockComposite label="Vistas do Radar" views={DOCK_SUBVIEWS.radar} active="zonas" onSelect={noop} source="OKX trades ao vivo, agora">
        <p>x</p>
      </DockComposite>,
    );
    expect(withLine).toContain("OKX trades ao vivo, agora");
    expect(withLine).toContain('aria-label="Fonte e idade da vista"');
    expect(withLine.indexOf("Noticias")).toBeLessThan(withLine.indexOf("OKX trades ao vivo, agora"));
    expectNoForbidden(withLine);
    const without = renderToStaticMarkup(
      <DockComposite label="Vistas do Radar" views={DOCK_SUBVIEWS.radar} active="zonas" onSelect={noop} source={null}>
        <p>x</p>
      </DockComposite>,
    );
    expect(without).not.toContain("Fonte e idade da vista");
    expect(renderToStaticMarkup(<DockComposite label="a" views={DOCK_SUBVIEWS.radar} active="zonas" onSelect={noop}><p>x</p></DockComposite>)).not.toContain("Fonte e idade da vista");
  });

  test("only the body it is given is in the markup: the other views never exist", () => {
    const html = radar();
    expect(html).toContain("corpo da vista");
    expect(html).not.toContain("corpo de Holders");
  });

  test("the raw market tab offers Fita, Livro and Liquidez", () => {
    const html = renderToStaticMarkup(
      <DockComposite label="Vistas do mercado bruto" views={DOCK_SUBVIEWS.mercado} active="fita" onSelect={noop}>
        <p>x</p>
      </DockComposite>,
    );
    for (const label of ["Fita", "Livro", "Liquidez"]) expect(html).toContain(`>${label}<`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});

describe("DockFlowBody", () => {
  test("a live reading is a table of labelled rows with the source and the age, within the twelve row budget", () => {
    const html = renderToStaticMarkup(<DockFlowBody model={flowTab(ok(), NOW)} />);
    expect(html).toContain('role="table"');
    expect(html).toContain('aria-label="Fluxo do motor"');
    for (const label of ["Leitura", "Aquecimento", "Volume agredido", "Delta", "Desequilibrios", "Sequencial", "Perfil de volume"]) expect(html).toContain(label);
    expect(html).toContain("ao vivo, trades da OKX");
    expect(html).toContain("agora");
    expect(html.match(/role="row"/g)!.length).toBeLessThanOrEqual(FLOW_ROWS_MAX);
    expect(html).not.toContain('data-stale="true"');
    expectNoForbidden(html);
  });

  test("a stale reading is dimmed and says so; the engine status line is above the table", () => {
    const html = renderToStaticMarkup(<DockFlowBody model={flowTab(ok(overlay({ asOfMs: NOW - 5 * 60_000 })), NOW)} />);
    expect(html).toContain('data-stale="true"');
    expect(html).toContain("fluxo ao vivo");
    expect(html).toContain("ha 5 min");
  });

  test("with no reading it shows the reason and no table", () => {
    const html = renderToStaticMarkup(<DockFlowBody model={flowTab(null, NOW)} />);
    expect(html).toContain("O motor so le instrumentos da OKX; nenhum em foco");
    expect(html).not.toContain('role="table"');
    expect(html).toContain('role="status"');
    expectNoForbidden(html);
  });

  test("while the thresholds are learned the factor rows say so", () => {
    const html = renderToStaticMarkup(<DockFlowBody model={flowTab(ok(overlay({ aquecimento: { fechadas: 12, necessarias: 50, pronto: false, restaurado: 0 } })), NOW)} />);
    expect(html).toContain("aguardando aquecimento");
    expect(html).toContain("12 de 50 minutos fechados");
  });
});

describe("DockZonesBody", () => {
  test("zones are a table ordered by score with side, band, score, factors, age, state and the invalidation level", () => {
    const html = renderToStaticMarkup(<DockZonesBody model={zonesTab(ok(), NOW)} />);
    expect(html).toContain('aria-label="Zonas ativas"');
    for (const head of ["Lado", "Faixa", "Nota", "Fatores", "Idade", "Estado", "Invalidacao"]) expect(html).toContain(`>${head}<`);
    expect(html.indexOf("Demanda")).toBeLessThan(html.indexOf("Oferta"));
    expect(html).toContain("99,4 a 99,8");
    expect(html).toContain("0,72");
    expect(html).toContain("E1, E3");
    expect(html).toContain("7 barras");
    expect(html).toContain("1 barra");
    expect(html).toContain("Testada");
    expect(html).toContain("nenhum");
    expectNoForbidden(html);
  });

  test("zones beyond the six listed are counted, not drawn", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `z${i}`, lado: "demanda" as const, baixo: 99, alto: 100, nota: 0.1 * (i + 1), estado: "ativa" as const, fatores: ["E1"], idadeBarras: i, invalidacao: null, primeiroTs: NOW }));
    const html = renderToStaticMarkup(<DockZonesBody model={zonesTab(ok(overlay({ zonas: many })), NOW)} />);
    expect(html).toContain("Mais 2 zonas fora da lista");
    expect(html.match(/data-zone="/g)).toHaveLength(6);
  });

  test("no zone is a reason, not an empty table; no reading is the reason of the feed", () => {
    expect(renderToStaticMarkup(<DockZonesBody model={zonesTab(ok(overlay({ zonas: [] })), NOW)} />)).toContain("Nenhuma zona ativa agora");
    const empty = renderToStaticMarkup(<DockZonesBody model={zonesTab(null, NOW)} />);
    expect(empty).toContain("O motor so le instrumentos da OKX; nenhum em foco");
    expect(empty).not.toContain('role="table"');
  });
});
