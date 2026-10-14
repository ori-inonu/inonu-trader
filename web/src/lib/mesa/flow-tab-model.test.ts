// DOC-1, DOC-4, INF-1, FLX-10: what the Fluxo tab and the Zonas view of the Radar tab tell, built only from the reading of the flow
// engine. No row is invented: a figure that needs the adaptive thresholds says "aguardando aquecimento" until the engine has them,
// a stale or missing reading says so with the reason, and no text uses the words of an order. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { ChartOverlay } from "../inonu/overlay";
import type { OverlayFeedState } from "../inonu/overlay-feed";
import { FLOW_ROWS_MAX, ZONE_ROWS_MAX, flowTab, zonesTab } from "./flow-tab-model";

const NOW = 1_800_000_000_000;
const FORBIDDEN_WORDS = ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"];

function overlay(over: Partial<ChartOverlay> = {}): ChartOverlay {
  return {
    instId: "BTC-USDT",
    asOfMs: NOW - 4_000,
    fonte: "okx_ws_trades",
    price: 100.5,
    atr14: 0.8,
    tickSz: "0.1",
    step: 0.1,
    binTicks: 1,
    unidade: "1",
    totais: { c: 65, v: 65 },
    aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 },
    niveis: [
      { baixo: 100.0, alto: 100.1, c: 10, v: 40, imb: "v", volume: "v", alerta: { c: false, v: true } },
      { baixo: 100.1, alto: 100.2, c: 30, v: 5, imb: "c", volume: "c", alerta: null },
      { baixo: 100.2, alto: 100.3, c: 25, v: 20, imb: "cv", volume: null, alerta: { c: true, v: false } },
    ],
    corridas: {
      sequencial: [{ lado: "c", baixo: 100.1, alto: 100.3, n: 3 }, { lado: "v", baixo: 100.0, alto: 100.1, n: 2 }],
      progressao: [{ lado: "c", baixo: 100.1, alto: 100.4, n: 4 }],
      exaustao: [{ extremo: "alto", baixo: 100.3, alto: 100.5, n: 3 }],
    },
    perfil: { poc: { baixo: 100.1, alto: 100.2 }, val: 100.0, vah: 100.3, hvn: [], lvn: [] },
    absorcao: { lado: "c", razaoVolume: 2.5 },
    zonas: [],
    ...over,
  };
}

const ok = (o: ChartOverlay = overlay()): OverlayFeedState => ({ status: "ok", overlay: o, reason: null });
const rowOf = (m: ReturnType<typeof flowTab>, label: string) => m.rows.find((r) => r.label === label);
const textOf = (value: unknown) => JSON.stringify(value);

describe("the Fluxo tab", () => {
  test("a reading that is fresh is live, with at most twelve rows (INF-1)", () => {
    const m = flowTab(ok(), NOW);
    expect(m.state).toBe("live");
    expect(m.reason).toBeNull();
    expect(m.rows.length).toBeGreaterThan(0);
    expect(m.rows.length).toBeLessThanOrEqual(FLOW_ROWS_MAX);
    expect(FLOW_ROWS_MAX).toBe(12);
  });

  test("it names the source, how old the reading is and how far the warm-up is", () => {
    const m = flowTab(ok(), NOW);
    expect(rowOf(m, "Leitura")).toMatchObject({ value: "ao vivo, trades da OKX", note: "agora" });
    expect(rowOf(m, "Aquecimento")?.value).toBe("pronto");
    const warming = flowTab(ok(overlay({ aquecimento: { fechadas: 12, necessarias: 50, pronto: false, restaurado: 0 } })), NOW);
    expect(rowOf(warming, "Aquecimento")?.value).toBe("12 de 50 minutos fechados");
    const restored = flowTab(ok(overlay({ aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 40 } })), NOW);
    expect(rowOf(restored, "Aquecimento")?.value).toBe("pronto, 40 min vieram do historico salvo");
    const query = flowTab(ok(overlay({ fonte: "okx_public_v5" })), NOW);
    expect(rowOf(query, "Leitura")?.value).toBe("por consulta, sem ao vivo");
  });

  test("the aggressed volume, the delta and the profile are the sums and levels of the engine", () => {
    const m = flowTab(ok(), NOW);
    expect(rowOf(m, "Volume agredido")?.value).toBe("compradores 65,0 BTC, vendedores 65,0 BTC");
    expect(rowOf(m, "Delta")?.value).toBe("0");
    const buying = flowTab(ok(overlay({ totais: { c: 80, v: 20 }, niveis: [{ baixo: 1, alto: 2, c: 80, v: 20, imb: null, volume: null, alerta: null }] })), NOW);
    expect(rowOf(buying, "Delta")?.value).toBe("+60,0 BTC");
    expect(rowOf(buying, "Volume agredido")?.value).toBe("compradores 80,0 BTC, vendedores 20,0 BTC");
    expect(rowOf(m, "Perfil de volume")?.value).toBe("POC 100,1 a 100,2, VAL 100,0, VAH 100,3");
  });

  test("a quantity is told in base currency: units times the size of one unit, so a spot lot of 0,00000001 does not read as millions", () => {
    const m = flowTab(ok(overlay({ unidade: "0.00000001", totais: { c: 27_400_000, v: 84_200_000 } })), NOW);
    expect(rowOf(m, "Volume agredido")?.value).toBe("compradores 0,274 BTC, vendedores 0,842 BTC");
    expect(rowOf(m, "Delta")?.value).toBe("-0,568 BTC");
    const eth = flowTab(ok(overlay({ instId: "ETH-USDT-SWAP", unidade: "0.1", totais: { c: 5_000, v: 2_000 } })), NOW);
    expect(rowOf(eth, "Volume agredido")?.value).toBe("compradores 500 ETH, vendedores 200 ETH");
  });

  test("from a core that does not say the unit, the quantity is told in lots and never as a currency", () => {
    const { unidade: _u, totais: _t, ...older } = overlay();
    const m = flowTab(ok(older as ChartOverlay), NOW);
    expect(rowOf(m, "Volume agredido")?.value).toBe("compradores 65,0 lotes, vendedores 65,0 lotes");
  });

  test("the totals of the whole window win over the levels kept; a cut list with no totals is told partial", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ baixo: 100 + i * 0.1, alto: 100.1 + i * 0.1, c: 1, v: 1, imb: null, volume: null, alerta: null }));
    const exact = flowTab(ok(overlay({ niveis: many, totais: { c: 300, v: 200 } })), NOW);
    expect(rowOf(exact, "Volume agredido")?.value).toBe("compradores 300 BTC, vendedores 200 BTC");
    expect(rowOf(exact, "Volume agredido")?.note ?? null).toBeNull();
    const { totais: _t, ...noTotals } = overlay({ niveis: many });
    const partial = flowTab(ok(noTotals as ChartOverlay), NOW);
    expect(rowOf(partial, "Volume agredido")?.note).toBe("parcial, so os niveis mais proximos do preco");
    expect(rowOf(flowTab(ok(), NOW), "Volume agredido")?.note ?? null).toBeNull();
  });

  test("the factors count what the engine marked: imbalances, runs, exhaustion, volume factor, quantity alerts, absorption", () => {
    const m = flowTab(ok(), NOW);
    expect(rowOf(m, "Desequilibrios")?.value).toBe("2 compradores, 2 vendedores");
    expect(rowOf(m, "Sequencial")?.value).toBe("2 corridas, a maior com 3 niveis compradores entre 100,1 e 100,3");
    expect(rowOf(m, "Progressao")?.value).toBe("1 corrida, a unica com 4 niveis compradores entre 100,1 e 100,4");
    expect(rowOf(m, "Exaustao")?.value).toBe("1 corrida, a unica com 3 niveis na extremidade alta entre 100,3 e 100,5");
    expect(rowOf(m, "Fator Volume")?.value).toBe("2 niveis marcados, 1 comprador, 1 vendedor");
    expect(rowOf(m, "Alerta de quantidade")?.value).toBe("1 nivel comprador, 1 nivel vendedor");
    expect(rowOf(m, "Absorcao")?.value).toBe("compradora, volume 2,5 vezes o das velas passadas");
  });

  test("no run, no mark: it says none, it does not hide the row", () => {
    const quiet = overlay({ niveis: [{ baixo: 1, alto: 2, c: 5, v: 5, imb: null, volume: null, alerta: null }], corridas: { sequencial: [], progressao: [], exaustao: [] }, absorcao: null });
    const m = flowTab(ok(quiet), NOW);
    for (const label of ["Desequilibrios", "Sequencial", "Progressao", "Exaustao", "Fator Volume", "Alerta de quantidade", "Absorcao"]) {
      expect(rowOf(m, label)?.value).toMatch(/^nenhum[a]?$/);
    }
  });

  test("while the thresholds are being learned the factors that need them say so, instead of a zero that would be a claim", () => {
    const warming = overlay({ totais: { c: 5, v: 5 }, aquecimento: { fechadas: 12, necessarias: 50, pronto: false, restaurado: 0 }, niveis: [{ baixo: 1, alto: 2, c: 5, v: 5, imb: null, volume: null, alerta: null }], corridas: { sequencial: [], progressao: [], exaustao: [] } });
    const m = flowTab(ok(warming), NOW);
    for (const label of ["Desequilibrios", "Sequencial", "Progressao", "Exaustao", "Fator Volume", "Alerta de quantidade"]) {
      expect(rowOf(m, label)?.value).toBe("aguardando aquecimento");
    }
    // what needs no history is still told
    expect(rowOf(m, "Volume agredido")?.value).toBe("compradores 5,00 BTC, vendedores 5,00 BTC");
    expect(rowOf(m, "Perfil de volume")).toBeDefined();
  });

  test("a reading older than a minute is stale and says its age; a failure with a kept reading is stale with the reason", () => {
    const old = flowTab(ok(overlay({ asOfMs: NOW - 3 * 60_000 })), NOW);
    expect(old.state).toBe("stale");
    expect(rowOf(old, "Leitura")?.note).toBe("ha 3 min");
    const kept: OverlayFeedState = { status: "erro", overlay: overlay(), reason: "sem_conexao" };
    const m = flowTab(kept, NOW);
    expect(m.state).toBe("stale");
    expect(m.status).toBe("sem conexao com o nucleo, ultima leitura mantida");
  });

  test("with no reading at all the tab is empty and says why", () => {
    expect(flowTab(null, NOW)).toMatchObject({ state: "empty", rows: [], reason: "O motor so le instrumentos da OKX; nenhum em foco" });
    const loading: OverlayFeedState = { status: "loading", overlay: null, reason: null };
    expect(flowTab(loading, NOW)).toMatchObject({ state: "empty", rows: [], reason: "Lendo o motor" });
    const failed: OverlayFeedState = { status: "erro", overlay: null, reason: "servidor_sem_rota" };
    expect(flowTab(failed, NOW)).toMatchObject({ state: "empty", rows: [], reason: "Fluxo indisponivel no servidor conectado, verifique Diagnostico" });
    const unknown: OverlayFeedState = { status: "erro", overlay: null, reason: "okx_503" };
    expect(flowTab(unknown, NOW).reason).toBe("A OKX nao respondeu");
  });
});

describe("the Zonas view of the Radar tab", () => {
  const zone = (id: string, nota: number, over: Partial<ChartOverlay["zonas"][number]> = {}): ChartOverlay["zonas"][number] => ({
    id,
    lado: "demanda",
    baixo: 99.4,
    alto: 99.8,
    nota,
    estado: "ativa",
    fatores: ["E1", "E3"],
    idadeBarras: 7,
    invalidacao: 99.0,
    primeiroTs: NOW - 600_000,
    ...over,
  });

  test("zones come ordered by score, at most six, each with side, band, score, factors, age, state and the invalidation level", () => {
    const zonas = [zone("z1", 0.4), zone("z2", 0.9, { lado: "oferta", baixo: 101.2, alto: 101.6, fatores: ["E2"], estado: "testada", invalidacao: 101.9, idadeBarras: 1 }), zone("z3", 0.6)];
    const m = zonesTab(ok(overlay({ zonas })), NOW);
    expect(m.state).toBe("live");
    expect(m.rows.map((r) => r.id)).toEqual(["z2", "z3", "z1"]);
    expect(m.rows[0]).toEqual({ id: "z2", lado: "Oferta", faixa: "101,2 a 101,6", nota: "0,90", fatores: "E2", idade: "1 barra", estado: "Testada", invalidacao: "101,9" });
    expect(m.rows[1]!.idade).toBe("7 barras");
    expect(m.rows[1]!.lado).toBe("Demanda");
  });

  test("more than six zones show the six best and say how many were left out", () => {
    const zonas = Array.from({ length: 9 }, (_, i) => zone(`z${i}`, 0.1 * (i + 1)));
    const m = zonesTab(ok(overlay({ zonas })), NOW);
    expect(ZONE_ROWS_MAX).toBe(6);
    expect(m.rows).toHaveLength(6);
    expect(m.hidden).toBe(3);
    expect(m.rows[0]!.id).toBe("z8");
  });

  test("a zone without an invalidation level says none and a neutral zone is told neutral", () => {
    const m = zonesTab(ok(overlay({ zonas: [zone("z1", 0.5, { invalidacao: null, lado: "neutra" })] })), NOW);
    expect(m.rows[0]).toMatchObject({ invalidacao: "nenhum", lado: "Neutra" });
  });

  test("no zone is not an error: the view says the engine found none, and while it warms up it says it is warming", () => {
    expect(zonesTab(ok(), NOW)).toMatchObject({ state: "live", rows: [], hidden: 0, reason: "Nenhuma zona ativa agora" });
    const warming = overlay({ aquecimento: { fechadas: 12, necessarias: 50, pronto: false, restaurado: 0 } });
    expect(zonesTab(ok(warming), NOW).reason).toBe("Nenhuma zona ativa ainda, o motor aquece 12 de 50 minutos");
  });

  test("a stale reading marks the view stale; with no reading it is empty and says why", () => {
    expect(zonesTab(ok(overlay({ asOfMs: NOW - 5 * 60_000, zonas: [zone("z1", 0.5)] })), NOW).state).toBe("stale");
    expect(zonesTab(null, NOW)).toMatchObject({ state: "empty", rows: [], reason: "O motor so le instrumentos da OKX; nenhum em foco" });
  });
});

describe("the words", () => {
  test("neither view uses a word of an order, a middle dot, a dash or an accent", () => {
    const zonas = [
      { id: "z1", lado: "demanda" as const, baixo: 99.4, alto: 99.8, nota: 0.7, estado: "ativa" as const, fatores: ["E1"], idadeBarras: 3, invalidacao: 99.0, primeiroTs: NOW },
    ];
    const text = textOf([flowTab(ok(overlay({ zonas })), NOW), zonesTab(ok(overlay({ zonas })), NOW), flowTab(null, NOW), zonesTab(null, NOW)]);
    for (const word of FORBIDDEN_WORDS) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
    expect(text).not.toMatch(/[·—–]/);
    expect(text).toBe(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("undefined");
  });
});
