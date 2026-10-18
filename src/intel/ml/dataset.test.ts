import { describe, expect, test } from "bun:test";
import type { Label, Snapshot } from "../../outcomes/types";
import { FEATURE_NAMES } from "../features/types";
import { buildDataset } from "./dataset";

const snap = (id: string, asOfMs: number, origem: Snapshot["origem"] = "relogio", values: Record<string, number | null> = {}): Snapshot => ({
  id, asOfMs, instId: "ETH-USDT", market: "spot", price: 100, costRoundTripBps: 24, atr15m: 1, zones: { demanda: null, oferta: null },
  features: { v: 1, instId: "ETH-USDT", asOfMs, values: Object.fromEntries(FEATURE_NAMES.map((n) => [n, values[n] ?? null])), nulos: {}, idades: {} }, origem,
});
const label = (snapshotId: string, long: number | null, short: number | null, over: Partial<Label> = {}): Label => ({
  snapshotId, horizonte: "1h", completo: true, motivoIncompleto: null, brutoLongBps: null, liquidoLongBps: long, liquidoShortBps: short, maxAltaBps: 1, maxQuedaBps: 1,
  barreiraLong: null, barreiraShort: null, zonaDemanda: null, zonaOferta: null, ...over,
});

describe("the table of a side", () => {
  const snapshots = [snap("b", 2_000, "relogio", { "trend.ema1h": 1 }), snap("a", 1_000), snap("hist", 3_000, "historico"), snap("click", 4_000, "pedido"), snap("nolabel", 5_000), snap("open", 6_000), snap("nocost", 7_000)];
  const labels = [
    label("a", 12, -36), label("b", -5, -19), label("hist", 3, -27), label("click", 50, -74),
    label("open", null, null, { completo: false, motivoIncompleto: "lacuna_de_velas" }),
    label("nocost", null, null),
    { ...label("a", 99, 99), horizonte: "4h" as const },
  ];

  test("long: sorted by time, the outcome is the sign of the net return after costs, and a null is NaN, never zero", () => {
    const d = buildDataset(snapshots, labels, { side: "long", horizon: "1h" });
    expect(d.samples.map((s) => [s.id, s.t, s.net, s.y])).toEqual([["a", 1_000, 12, 1], ["b", 2_000, -5, 0], ["hist", 3_000, 3, 1]]);
    const b = d.samples[1]!;
    expect(b.x[FEATURE_NAMES.indexOf("trend.ema1h")]).toBe(1);
    expect(Number.isNaN(b.x[FEATURE_NAMES.indexOf("mom.rsi15m")]!)).toBe(true);
    expect(d.names).toBe(FEATURE_NAMES);
  });
  test("short reads the other side of the same label", () => {
    const d = buildDataset(snapshots, labels, { side: "short", horizon: "1h" });
    expect(d.samples.map((s) => [s.id, s.net, s.y])).toEqual([["a", -36, 0], ["b", -19, 0], ["hist", -27, 0]]);
  });
  test("a click of a person never enters, and every reason a row was left out is counted", () => {
    const d = buildDataset(snapshots, labels, { side: "long", horizon: "1h" });
    expect(d.samples.some((s) => s.id === "click")).toBe(false);
    expect(d.excluded).toEqual({ pedido_de_pessoa: 1, sem_rotulo: 1, lacuna_de_velas: 1, sem_custo: 1 });
  });
  test("only the labels of the asked horizon count", () => {
    const d = buildDataset(snapshots, labels, { side: "long", horizon: "4h" });
    expect(d.samples.map((s) => [s.id, s.net])).toEqual([["a", 99]]); // the one 4 hour label of the table
  });
});
