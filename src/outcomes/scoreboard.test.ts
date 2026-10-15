import { describe, expect, test } from "bun:test";
import { MIN_MEASURED, buildPlacar } from "./scoreboard";
import type { DecisionRecord, Label, Snapshot } from "./types";

const snap = (id: string, origem: Snapshot["origem"] = "pedido", asOfMs = 1_000): Snapshot => ({
  id, asOfMs, instId: "ETH-USDT", market: "spot", price: 100, costRoundTripBps: 24, atr15m: 1, zones: { demanda: null, oferta: null },
  features: { v: 1, instId: "ETH-USDT", asOfMs, values: {}, nulos: {}, idades: {} }, origem,
});
const label = (snapshotId: string, long: number | null, short: number | null, over: Partial<Label> = {}): Label => ({
  snapshotId, horizonte: "1h", completo: true, motivoIncompleto: null, brutoLongBps: long === null ? null : long + 24, liquidoLongBps: long, liquidoShortBps: short, maxAltaBps: 10, maxQuedaBps: 10,
  barreiraLong: null, barreiraShort: null, zonaDemanda: null, zonaOferta: null, ...over,
});
const decision = (id: string, action: DecisionRecord["action"], snapshotId: string | null, atMs = 1_000): DecisionRecord => ({
  id, atMs, instId: "ETH-USDT", modo: "ativo", action, candidateId: action === "hold" ? null : "zona:abc", briefHash: null, snapshotId, reutilizado: false, probabilidades: null, veredito: null,
});

/** `n` answers: the first `wins` end at +30 bps net, the rest at -20, alternating buy and sell. */
function scenario(n: number, wins: number) {
  const decisions: DecisionRecord[] = [];
  const snapshots: Snapshot[] = [];
  const labels: Label[] = [];
  for (let i = 0; i < n; i += 1) {
    const buy = i % 2 === 0;
    const net = i < wins ? 30 : -20;
    snapshots.push(snap(`s${i}`));
    labels.push(buy ? label(`s${i}`, net, -net - 48) : label(`s${i}`, -net - 48, net));
    decisions.push(decision(`d${i}`, buy ? "buy" : "sell", `s${i}`, 1_000 + i * 60_000));
  }
  return { decisions, snapshots, labels };
}

describe("below the minimum there is no number (REC-6)", () => {
  test("29 measured answers say how many are missing and carry no rate, no mean and no interval", () => {
    const p = buildPlacar(scenario(29, 29));
    expect(p.estado).toBe("nao_medido");
    expect(p.acerto).toBeNull();
    expect(p.liquidoMedioBps).toBeNull();
    expect(p.liquidoIc95Bps).toBeNull();
    expect(p.texto).toBe(`Placar: 29 de ${MIN_MEASURED} respostas medidas. Sem numero ate la.`);
  });

  test("nothing at all is not measured either", () => {
    const p = buildPlacar({ decisions: [], snapshots: [], labels: [] });
    expect([p.estado, p.decisoes.total, p.decisoes.medidas]).toEqual(["nao_medido", 0, 0]);
  });
});

describe("what is counted and what is not", () => {
  test("a hold is counted but never scored; an answer without a snapshot or without a final label is not measured", () => {
    const { decisions, snapshots, labels } = scenario(3, 3);
    const more = [
      decision("h", "hold", null),
      decision("nosnap", "buy", null),
      decision("ghost", "buy", "missing"),
      decision("pending", "sell", "p"),
      decision("gap", "buy", "g"),
    ];
    const p = buildPlacar({
      decisions: [...decisions, ...more],
      snapshots: [...snapshots, snap("p"), snap("g")],
      labels: [...labels, label("g", null, null, { completo: false, motivoIncompleto: "lacuna_de_velas" })],
    });
    expect(p.decisoes).toEqual({ total: 8, comprar: 5, vender: 2, manter: 1, medidas: 3, pendentes: 2, semInstantaneo: 2 });
  });

  test("a reused answer is not a new answer", () => {
    const { decisions, snapshots, labels } = scenario(30, 20);
    const again = decisions.map((d) => ({ ...d, id: `${d.id}b`, reutilizado: true }));
    const p = buildPlacar({ decisions: [...decisions, ...again], snapshots, labels });
    expect([p.decisoes.total, p.decisoes.medidas]).toEqual([30, 30]);
  });

  test("only the primary horizon counts", () => {
    const { decisions, snapshots, labels } = scenario(30, 30);
    const other = labels.map((l) => ({ ...l, horizonte: "4h" as const }));
    expect(buildPlacar({ decisions, snapshots, labels: other }).decisoes.medidas).toBe(0);
  });
});

describe("with the minimum, the numbers come with their uncertainty", () => {
  test("20 of 30 right: 67 percent, Wilson interval, a mean of 13.3 bps and a Newey-West interval", () => {
    const p = buildPlacar(scenario(30, 20));
    expect(p.estado).toBe("medido");
    expect(p.decisoes.medidas).toBe(30);
    expect(p.acerto!.taxa).toBeCloseTo(0.6667, 4);
    expect(p.acerto!.ic95[0]).toBeCloseTo(0.4878, 3);
    expect(p.acerto!.ic95[1]).toBeCloseTo(0.808, 3);
    expect(p.liquidoMedioBps).toBe(13.3); // (20 x 30 + 10 x -20) / 30
    expect(p.liquidoIc95Bps === null || p.liquidoIc95Bps[0] < p.liquidoMedioBps!).toBe(true);
    expect(p.texto).toContain("20 de 30 respostas no sentido certo depois de custos em 1 h (67%");
    expect(p.texto).toContain("+13,3 bps liquidos");
  });

  test("a losing record is shown as it is", () => {
    const p = buildPlacar(scenario(40, 10));
    expect(p.acerto!.taxa).toBe(0.25);
    expect(p.liquidoMedioBps).toBe(-7.5); // (10 x 30 + 30 x -20) / 40
  });
});

describe("the blind baseline", () => {
  test("is computed from clock snapshots only, never from clicks", () => {
    const base = scenario(30, 20);
    const clock = Array.from({ length: 10 }, (_, i) => snap(`c${i}`, "relogio"));
    const clockLabels = clock.map((s, i) => label(s.id, i % 2 === 0 ? 10 : -30, i % 2 === 0 ? -34 : -14));
    const p = buildPlacar({ decisions: base.decisions, snapshots: [...base.snapshots, ...clock], labels: [...base.labels, ...clockLabels] });
    expect(p.qualquerMomento).toEqual({ n: 10, comprarBps: -10, venderBps: -24 });
    expect(p.texto).toContain("Sem filtro, comprar em qualquer momento deu -10 bps e vender -24 bps.");
  });
  test("no clock snapshots, no baseline", () => {
    expect(buildPlacar(scenario(30, 20)).qualquerMomento).toBeNull();
  });
});

describe("the words", () => {
  test("never promise profit and never use a dash or a middle dot", () => {
    for (const p of [buildPlacar(scenario(5, 5)), buildPlacar(scenario(30, 20)), buildPlacar(scenario(40, 5))]) {
      expect(p.texto).not.toMatch(/[\u2013\u2014\u00b7]/);
      expect(p.texto.toLowerCase()).not.toMatch(/lucr|garant|ganh(o|a)r|rico/);
    }
  });
});
