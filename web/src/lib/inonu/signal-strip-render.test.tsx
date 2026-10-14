// ASK-8, AC-ASK-4: the strip under the chart toolbar where the person chooses which signals the chart shows. On an OKX
// instrument it has the Inonu groups (zones, flow, decision) and says how the engine is doing; on an on-chain token it has the
// tracked wallet filters. Plain ASCII, no middle dot or dashes, nothing animated.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InonuSignalStrip, flowStatusText, toggleKind, toggleSignal, type InonuSignalStripProps } from "@/components/Desk/InonuSignalStrip";
import type { ChartOverlay } from "./overlay";
import type { OverlayFeedState } from "./overlay-feed";
import { DEFAULT_SIGNALS } from "./signals";

const overlay = (over: Partial<ChartOverlay> = {}): ChartOverlay => ({
  instId: "BTC-USDT", asOfMs: 1, fonte: "okx_ws_trades", price: 101, atr14: 2, tickSz: "0.5", step: 0.5, binTicks: 1,
  aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 }, niveis: [], corridas: { sequencial: [], progressao: [], exaustao: [] },
  perfil: { poc: null, val: null, vah: null, hvn: [], lvn: [] }, absorcao: null, zonas: [], ...over,
});
const ok = (o: ChartOverlay = overlay()): OverlayFeedState => ({ status: "ok", overlay: o, reason: null });

const noop = () => {};
const props = (over: Partial<InonuSignalStripProps> = {}): InonuSignalStripProps => ({ mode: "okx", filters: DEFAULT_SIGNALS, onChange: noop, feed: ok(), ...over });
const draw = (over: Partial<InonuSignalStripProps> = {}) => renderToStaticMarkup(<InonuSignalStrip {...props(over)} />);

describe("status line", () => {
  test("live flow with the warm-up told, and the zones counted", () => {
    expect(flowStatusText(ok())).toBe("fluxo ao vivo");
    expect(flowStatusText(ok(overlay({ aquecimento: { fechadas: 3, necessarias: 50, pronto: false, restaurado: 0 } })))).toBe("fluxo ao vivo, aquecendo 3/50");
    expect(flowStatusText(ok(overlay({ aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 30 } })))).toBe("fluxo ao vivo, com historico salvo (30 min)");
    expect(flowStatusText(ok(overlay({ aquecimento: { fechadas: 52, necessarias: 50, pronto: false, restaurado: 0 } })))).toBe("fluxo ao vivo, aquecendo 52/50");
    const z = { id: "a", lado: "demanda" as const, baixo: 1, alto: 2, nota: 70, estado: "ativa" as const, fatores: [], idadeBarras: 0, invalidacao: null, primeiroTs: 1 };
    expect(flowStatusText(ok(overlay({ zonas: [z] })))).toBe("fluxo ao vivo, 1 zona");
    expect(flowStatusText(ok(overlay({ zonas: [z, { ...z, id: "b" }] })))).toBe("fluxo ao vivo, 2 zonas");
  });

  test("a flow read by REST says so instead of pretending to be live", () => {
    expect(flowStatusText(ok(overlay({ fonte: "okx_public_v5" })))).toBe("fluxo por consulta, sem ao vivo");
  });

  test("loading, and every failure with its own words", () => {
    expect(flowStatusText({ status: "loading", overlay: null, reason: null })).toBe("lendo o fluxo");
    const fail = (reason: string, o: ChartOverlay | null = null) => flowStatusText({ status: "erro", overlay: o, reason });
    expect(fail("sem_conexao")).toBe("sem conexao com o nucleo");
    expect(fail("servidor_sem_rota")).toBe("fluxo indisponivel no servidor conectado, verifique Diagnostico");
    expect(fail("origem_negada")).toBe("origem negada pelo nucleo");
    expect(fail("instrumento_nao_suportado")).toBe("sem fluxo para este tipo de instrumento");
    expect(fail("okx_timeout")).toBe("a OKX nao respondeu");
    expect(fail("coisa_nova")).toBe("falha ao ler o fluxo");
    expect(fail("sem_conexao", overlay())).toBe("sem conexao com o nucleo, ultima leitura mantida");
  });

  test("no feed, no line", () => {
    expect(flowStatusText(null)).toBe("");
  });
});

describe("toggles are pure", () => {
  test("a signal flips and nothing else moves", () => {
    expect(toggleSignal(DEFAULT_SIGNALS, "zonas")).toEqual({ ...DEFAULT_SIGNALS, zonas: false });
    expect(toggleSignal({ ...DEFAULT_SIGNALS, fluxo: false }, "fluxo")).toEqual(DEFAULT_SIGNALS);
  });

  test("a wallet type is added back in the canonical order and removed without touching the others", () => {
    const one = toggleKind(DEFAULT_SIGNALS, "kol");
    expect(one.tipos).toEqual(["smart_money", "whale"]);
    expect(toggleKind(one, "kol").tipos).toEqual(["smart_money", "kol", "whale"]);
  });
});

describe("OKX instrument", () => {
  test("three toggles for the Inonu layers, each pressed by default, and the status line", () => {
    const html = draw();
    for (const label of ["Zonas", "Fluxo", "Decisao"]) expect(html).toContain(`>${label}<`);
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(3);
    expect(html).toContain("fluxo ao vivo");
    expect(html).not.toContain("Carteiras");
  });

  test("an off signal is not pressed", () => {
    const html = draw({ filters: { ...DEFAULT_SIGNALS, zonas: false } });
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(1);
  });

  test("the name of the group is Inonu, Jev appears only as the model's provenance, and the strip describes instead of instructing", () => {
    const html = draw();
    expect(html).toContain("Inonu");
    expect(html).toContain("modelo: Jev");
    expect(html.replace("modelo: Jev", "")).not.toMatch(/Jev/);
    expect(html).not.toMatch(/\b(comprar|vender|buy|sell)\b/i);
  });
});

describe("on-chain token", () => {
  test("the wallet group: the switch, the three types and the two minimums", () => {
    const html = draw({ mode: "onchain", feed: null });
    expect(html).toContain("Carteiras");
    for (const label of ["Rastreadas", "Smart money", "KOL", "Baleia"]) expect(html).toContain(`>${label}<`);
    expect(html).toContain("Valor minimo");
    expect(html).toContain("Enderecos minimos");
    expect(html).not.toContain(">Zonas<");
  });

  test("with the wallet switch off the types and minimums are not offered", () => {
    const html = draw({ mode: "onchain", feed: null, filters: { ...DEFAULT_SIGNALS, carteiras: false } });
    expect(html).toContain(">Rastreadas<");
    expect(html).not.toContain(">Smart money<");
    expect(html).not.toContain("Valor minimo");
  });

  test("the selected minimums are the selected options", () => {
    const html = draw({ mode: "onchain", feed: null, filters: { ...DEFAULT_SIGNALS, minUsd: 10_000, minEnderecos: 3 } });
    expect(html).toMatch(/<option value="10000" selected="">/);
    expect(html).toMatch(/<option value="3" selected="">/);
  });
});

describe("rules of the interface", () => {
  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks", () => {
    for (const html of [draw(), draw({ mode: "onchain", feed: null }), draw({ feed: { status: "erro", overlay: null, reason: "sem_conexao" } })]) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });
});
