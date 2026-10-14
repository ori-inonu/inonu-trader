// ASK-13, AC-ASK-7, T7.10: alerts about the flow and the zones are ALGORITHMIC and LOCAL. They compare two readings of the engine, tell what
// changed in plain words, and never ask the model: the button on each one is the only thing that does. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { ChartOverlay, OverlayZone } from "./overlay";
import { alertsForDesk, createEngineAlertStore, detectEngineAlerts, type EngineAlert } from "./engine-alerts";

const NOW = 1_800_000_000_000;
const FORBIDDEN_WORDS = ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"];

const zone = (id: string, over: Partial<OverlayZone> = {}): OverlayZone => ({
  id, lado: "demanda", baixo: 99.4, alto: 99.8, nota: 62.5, estado: "ativa", fatores: ["E1", "E3"], idadeBarras: 2, invalidacao: 99.0, primeiroTs: NOW - 60_000, ...over,
});

const overlay = (over: Partial<ChartOverlay> = {}): ChartOverlay => ({
  instId: "BTC-USDT", asOfMs: NOW, fonte: "okx_ws_trades", price: 100, atr14: 1, tickSz: "0.1", step: 0.1, binTicks: 1,
  aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 },
  niveis: [], corridas: { sequencial: [], progressao: [], exaustao: [] },
  perfil: { poc: null, val: null, vah: null, hvn: [], lvn: [] }, absorcao: null, zonas: [], ...over,
});

describe("what a change of the engine reading says", () => {
  test("the first reading is only a baseline: nothing changed yet, so nothing is told", () => {
    expect(detectEngineAlerts(null, overlay({ zonas: [zone("z1")] }), NOW)).toEqual([]);
  });

  test("another instrument is a new baseline, never a change", () => {
    expect(detectEngineAlerts(overlay({ instId: "ETH-USDT" }), overlay({ zonas: [zone("z1")] }), NOW)).toEqual([]);
  });

  test("the same reading twice tells nothing", () => {
    const same = overlay({ zonas: [zone("z1")] });
    expect(detectEngineAlerts(same, same, NOW)).toEqual([]);
  });

  test("a zone that was not there is told, with its side, band and score", () => {
    const alerts = detectEngineAlerts(overlay(), overlay({ zonas: [zone("z1", { lado: "oferta", baixo: 101.2, alto: 101.6, nota: 71 })] }), NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "zona_nova", instId: "BTC-USDT", atMs: NOW });
    expect(alerts[0]!.text).toBe("Zona de oferta nova entre 101,2 e 101,6, nota 71,00");
  });

  test("a zone that went from active to tested is told once", () => {
    const alerts = detectEngineAlerts(overlay({ zonas: [zone("z1")] }), overlay({ zonas: [zone("z1", { estado: "testada" })] }), NOW);
    expect(alerts.map((a) => a.kind)).toEqual(["zona_testada"]);
    expect(alerts[0]!.text).toBe("Zona de demanda testada entre 99,4 e 99,8");
  });

  test("a zone that stays tested, or disappears, is not an alert", () => {
    const tested = overlay({ zonas: [zone("z1", { estado: "testada" })] });
    expect(detectEngineAlerts(tested, tested, NOW)).toEqual([]);
    expect(detectEngineAlerts(tested, overlay(), NOW)).toEqual([]);
  });

  test("a run that was not there is told with its length and band, only when the thresholds are ready", () => {
    const next = overlay({ corridas: { sequencial: [{ lado: "c", baixo: 100.1, alto: 100.3, n: 3 }], progressao: [{ lado: "v", baixo: 99, alto: 99.4, n: 4 }], exaustao: [{ extremo: "alto", baixo: 100.3, alto: 100.5, n: 3 }] } });
    const alerts = detectEngineAlerts(overlay(), next, NOW);
    expect(alerts.map((a) => a.kind).sort()).toEqual(["exaustao", "progressao", "sequencial"]);
    expect(alerts.find((a) => a.kind === "sequencial")!.text).toBe("Sequencial de 3 niveis compradores entre 100,1 e 100,3");
    expect(alerts.find((a) => a.kind === "progressao")!.text).toBe("Progressao de 4 niveis vendedores entre 99,0 e 99,4");
    expect(alerts.find((a) => a.kind === "exaustao")!.text).toBe("Exaustao de 3 niveis na extremidade alta entre 100,3 e 100,5");
    // during the warm-up the runs depend on thresholds that do not exist yet: nothing is told
    const warming = { ...next, aquecimento: { fechadas: 12, necessarias: 50, pronto: false, restaurado: 0 } };
    expect(detectEngineAlerts({ ...overlay(), aquecimento: warming.aquecimento }, warming, NOW)).toEqual([]);
  });

  test("a run that was already there is not told again", () => {
    const run = { sequencial: [{ lado: "c" as const, baixo: 100.1, alto: 100.3, n: 3 }], progressao: [], exaustao: [] };
    expect(detectEngineAlerts(overlay({ corridas: run }), overlay({ corridas: run }), NOW)).toEqual([]);
  });

  test("an absorption that starts is told with the ratio", () => {
    const alerts = detectEngineAlerts(overlay(), overlay({ absorcao: { lado: "c", razaoVolume: 2.5 } }), NOW);
    expect(alerts.map((a) => a.kind)).toEqual(["absorcao"]);
    expect(alerts[0]!.text).toBe("Absorcao compradora, volume 2,5 vezes o das velas passadas");
    expect(detectEngineAlerts(overlay({ absorcao: { lado: "c", razaoVolume: 2.5 } }), overlay({ absorcao: { lado: "c", razaoVolume: 3 } }), NOW)).toEqual([]);
  });

  test("the words are descriptive: no word of an order, plain ASCII, no middle dot or dash", () => {
    const next = overlay({
      zonas: [zone("z1")], absorcao: { lado: "v", razaoVolume: 1.5 },
      corridas: { sequencial: [{ lado: "v", baixo: 1, alto: 2, n: 3 }], progressao: [], exaustao: [{ extremo: "baixo", baixo: 1, alto: 2, n: 3 }] },
    });
    const text = detectEngineAlerts(overlay(), next, NOW).map((a) => a.text).join(" | ");
    for (const word of FORBIDDEN_WORDS) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
    expect(text).not.toMatch(/[·—–]/);
    expect(text).toBe(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  });
});

describe("the store of alerts", () => {
  const alert = (kind: "zona_nova" | "absorcao", key: string, atMs: number) => ({ id: `BTC-USDT|${kind}|${key}`, instId: "BTC-USDT", kind, text: `texto ${key}`, atMs });

  test("keeps the newest first, at most twenty", () => {
    const store = createEngineAlertStore({ now: () => NOW });
    for (let i = 0; i < 25; i += 1) store.add(alert("zona_nova", `z${i}`, NOW + i));
    expect(store.list()).toHaveLength(20);
    expect(store.list()[0]!.text).toBe("texto z24");
  });

  test("the same alert inside the cooldown is told once, and again after it", () => {
    let now = NOW;
    const store = createEngineAlertStore({ now: () => now, cooldownMs: 300_000 });
    store.add(alert("zona_nova", "z1", now));
    now += 60_000;
    store.add(alert("zona_nova", "z1", now));
    expect(store.list()).toHaveLength(1);
    now += 300_001;
    store.add(alert("zona_nova", "z1", now));
    expect(store.list()).toHaveLength(2);
  });

  test("a subscriber hears each change, the snapshot is stable until one, and clear empties it", () => {
    const store = createEngineAlertStore({ now: () => NOW });
    let heard = 0;
    const stop = store.subscribe(() => (heard += 1));
    const before = store.list();
    expect(store.list()).toBe(before);
    store.add(alert("absorcao", "c", NOW));
    expect(heard).toBe(1);
    expect(store.list()).not.toBe(before);
    stop();
    store.clear();
    expect(heard).toBe(1);
    expect(store.list()).toEqual([]);
  });

  test("unseen counts what arrived since the last time the person looked", () => {
    const store = createEngineAlertStore({ now: () => NOW });
    store.add(alert("zona_nova", "z1", NOW));
    store.add(alert("absorcao", "c", NOW));
    expect(store.unseen()).toBe(2);
    store.markSeen();
    expect(store.unseen()).toBe(0);
    store.add(alert("zona_nova", "z2", NOW));
    expect(store.unseen()).toBe(1);
  });
});

describe("what the bell tells on each desk", () => {
  const alert = (kind: EngineAlert["kind"], key: string): EngineAlert => ({ id: `BTC-USDT|${kind}|${key}`, instId: "BTC-USDT", kind, text: `${kind} ${key}`, atMs: NOW });
  // newest first, as the store keeps them
  const all = [alert("exaustao", "a"), alert("zona_nova", "b"), alert("sequencial", "c"), alert("zona_testada", "d"), alert("absorcao", "e")];

  test("the complete desk shows every alert and the count the store gave", () => {
    expect(alertsForDesk(all, 3, false)).toEqual({ alerts: all, unseen: 3 });
  });

  test("the simple desk shows only the zones (a new one, a tested one), and counts only the unseen ones among them", () => {
    const simple = alertsForDesk(all, 3, true);
    expect(simple.alerts.map((a) => a.kind)).toEqual(["zona_nova", "zona_testada"]);
    // the three newest are unseen (exaustao, zona_nova, sequencial): one of them is a zone
    expect(simple.unseen).toBe(1);
    expect(alertsForDesk(all, 0, true).unseen).toBe(0);
    expect(alertsForDesk(all, 99, true).unseen).toBe(2);
    expect(alertsForDesk([], 5, true)).toEqual({ alerts: [], unseen: 0 });
  });
});
