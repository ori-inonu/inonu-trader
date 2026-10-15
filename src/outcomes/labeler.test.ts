import { describe, expect, test } from "bun:test";
import type { Bar } from "../intel/features/types";
import { LABEL_BAR_MS, labelSnapshot } from "./labeler";
import { HORIZON_MS, type Snapshot } from "./types";

/** An aligned instant, so the window starts exactly at the snapshot. */
const T = 1_760_000_100_000 - (1_760_000_100_000 % LABEL_BAR_MS);
const bar = (i: number, open: number, high: number, low: number, close: number, over: Partial<Bar> = {}): Bar => ({ ts: T + i * LABEL_BAR_MS, open, high, low, close, volume: 1, confirmed: true, ...over });

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    id: "s1",
    asOfMs: T,
    instId: "ETH-USDT",
    market: "spot",
    price: 100,
    costRoundTripBps: 22,
    atr15m: 1,
    zones: { demanda: null, oferta: null },
    features: { v: 1, instId: "ETH-USDT", asOfMs: T, values: {}, nulos: {}, idades: {} },
    origem: "relogio",
    ...over,
  };
}
const NOW = T + HORIZON_MS["4h"] + 1;

describe("returns net of cost, for both directions (REC-3)", () => {
  const rising = [bar(0, 100, 100.6, 99.8, 100.4), bar(1, 100.4, 101.0, 100.2, 100.9), bar(2, 100.9, 101.4, 100.7, 101.2)];
  test("a 120 bps rise over 15 minutes", () => {
    const l = labelSnapshot(snapshot(), rising, "15m", NOW);
    expect(l.completo).toBe(true);
    expect([l.brutoLongBps, l.liquidoLongBps, l.liquidoShortBps]).toEqual([120, 98, -142]);
    expect([l.maxAltaBps, l.maxQuedaBps]).toEqual([140, 20]);
  });
  test("barriers: the long never reaches 101.5 nor 99 (time); the short is stopped when the high touches 101", () => {
    const l = labelSnapshot(snapshot(), rising, "15m", NOW);
    expect([l.barreiraLong, l.barreiraShort]).toEqual(["tempo", "parada"]);
  });
  test("the target is reached when the high touches 1.5 ATR", () => {
    const l = labelSnapshot(snapshot(), [bar(0, 100, 100.3, 99.9, 100.2), bar(1, 100.2, 101.5, 100.1, 101.4), bar(2, 101.4, 101.6, 101.0, 101.5)], "15m", NOW);
    expect(l.barreiraLong).toBe("alvo");
  });
  test("stop and target inside one bar: the stop wins, for both sides", () => {
    const l = labelSnapshot(snapshot(), [bar(0, 100, 101.6, 98.9, 100), bar(1, 100, 100.1, 99.9, 100), bar(2, 100, 100.1, 99.9, 100)], "15m", NOW);
    expect([l.barreiraLong, l.barreiraShort]).toEqual(["parada", "parada"]);
  });
  test("a short wins by falling 1.5 ATR", () => {
    const l = labelSnapshot(snapshot(), [bar(0, 100, 100.2, 98.4, 98.6), bar(1, 98.6, 98.9, 98.4, 98.5), bar(2, 98.5, 98.8, 98.3, 98.4)], "15m", NOW);
    expect([l.barreiraShort, l.barreiraLong]).toEqual(["alvo", "parada"]);
    expect(l.liquidoShortBps).toBe(138); // 160 gross minus 22
  });
  test("an unknown cost or ATR is null, not zero", () => {
    const l = labelSnapshot(snapshot({ costRoundTripBps: null, atr15m: null }), rising, "15m", NOW);
    expect([l.liquidoLongBps, l.liquidoShortBps, l.barreiraLong, l.barreiraShort]).toEqual([null, null, null, null]);
    expect(l.brutoLongBps).toBe(120);
  });
});

describe("what cannot be known is incomplete with a reason, and carries no numbers (REC-5)", () => {
  const three = [bar(0, 100, 100.6, 99.8, 100.4), bar(1, 100.4, 101.0, 100.2, 100.9), bar(2, 100.9, 101.4, 100.7, 101.2)];
  const empty = (l: ReturnType<typeof labelSnapshot>) => [l.brutoLongBps, l.liquidoLongBps, l.liquidoShortBps, l.maxAltaBps, l.maxQuedaBps, l.barreiraLong, l.barreiraShort, l.zonaDemanda, l.zonaOferta];
  test("the horizon is not over yet", () => {
    const l = labelSnapshot(snapshot(), three, "15m", T + HORIZON_MS["15m"] - 1);
    expect([l.completo, l.motivoIncompleto]).toEqual([false, "horizonte_alem_dos_dados"]);
    expect(empty(l).every((v) => v === null)).toBe(true);
  });
  test("a missing bar inside the window", () => {
    const l = labelSnapshot(snapshot(), [three[0]!, three[2]!], "15m", NOW);
    expect([l.completo, l.motivoIncompleto]).toEqual([false, "lacuna_de_velas"]);
  });
  test("an unconfirmed bar is a missing bar", () => {
    const l = labelSnapshot(snapshot(), [three[0]!, three[1]!, { ...three[2]!, confirmed: false }], "15m", NOW);
    expect(l.motivoIncompleto).toBe("lacuna_de_velas");
  });
  test("no entry price", () => {
    for (const price of [0, Number.NaN, -1]) expect(labelSnapshot(snapshot({ price }), three, "15m", NOW).motivoIncompleto).toBe("sem_preco_de_entrada");
  });
});

describe("no look-ahead (REC-4)", () => {
  test("bars before the window and after the horizon change nothing", () => {
    const window = [bar(0, 100, 100.6, 99.8, 100.4), bar(1, 100.4, 101.0, 100.2, 100.9), bar(2, 100.9, 101.4, 100.7, 101.2)];
    const base = labelSnapshot(snapshot(), window, "15m", NOW);
    const noisy = [bar(-3, 50, 200, 1, 150), bar(-1, 1, 2, 0.5, 1.5), ...window, bar(3, 100, 999, 0.1, 1), bar(4, 0, 0, 0, 0)];
    expect(labelSnapshot(snapshot(), noisy, "15m", NOW)).toEqual(base);
  });
  test("a snapshot taken inside a bar starts at the next boundary", () => {
    const l = labelSnapshot(snapshot({ asOfMs: T - 120_000 }), [bar(0, 100, 100.6, 99.8, 100.4), bar(1, 100.4, 101.0, 100.2, 100.9), bar(2, 100.9, 101.4, 100.7, 101.2)], "15m", NOW);
    expect(l.brutoLongBps).toBe(120);
  });
  test("a longer horizon needs all of its bars", () => {
    const hour = Array.from({ length: 12 }, (_, i) => bar(i, 100, 100.1, 99.9, 100));
    expect(labelSnapshot(snapshot(), hour, "1h", NOW).completo).toBe(true);
    expect(labelSnapshot(snapshot(), hour.slice(0, 11), "1h", NOW).motivoIncompleto).toBe("lacuna_de_velas");
  });
});

describe("zone reaction (T6.6)", () => {
  // demand zone 98.5 to 99.5, idea ends if a bar closes under 98; a reaction is a high of 100.5 (zone top plus 1 ATR)
  const demand = { baixo: 98.5, alto: 99.5, invalidacao: 98, nota: 60 };
  const quiet = (i: number) => bar(i, 100, 100.2, 99.8, 100);
  test("touched, held, then up one ATR: it reacted", () => {
    const l = labelSnapshot(snapshot({ zones: { demanda: demand, oferta: null } }), [bar(0, 100, 100, 99.4, 99.8), bar(1, 99.8, 100.6, 99.7, 100.4), quiet(2)], "15m", NOW);
    expect(l.zonaDemanda).toEqual({ tocou: true, reagiu: true });
    expect(l.zonaOferta).toBeNull();
  });
  test("touched and then closed under the invalidation: it did not react", () => {
    const l = labelSnapshot(snapshot({ zones: { demanda: demand, oferta: null } }), [bar(0, 100, 100, 99.4, 99.8), bar(1, 99.8, 99.9, 97.5, 97.9), bar(2, 97.9, 100.9, 97.9, 100.8)], "15m", NOW);
    expect(l.zonaDemanda).toEqual({ tocou: true, reagiu: false });
  });
  test("touched and invalidated in the same bar: no reaction, even if it came back", () => {
    const l = labelSnapshot(snapshot({ zones: { demanda: demand, oferta: null } }), [bar(0, 100, 100.9, 97.0, 97.9), bar(1, 97.9, 101, 97.9, 100.9), quiet(2)], "15m", NOW);
    expect(l.zonaDemanda).toEqual({ tocou: true, reagiu: false });
  });
  test("a wick up in the touch bar alone is not a reaction", () => {
    const l = labelSnapshot(snapshot({ zones: { demanda: demand, oferta: null } }), [bar(0, 100, 101, 99.4, 99.6), quiet(1), quiet(2)], "15m", NOW);
    expect(l.zonaDemanda).toEqual({ tocou: true, reagiu: false });
  });
  test("never touched: null, not false", () => {
    const l = labelSnapshot(snapshot({ zones: { demanda: demand, oferta: null } }), [quiet(0), quiet(1), quiet(2)], "15m", NOW);
    expect(l.zonaDemanda).toEqual({ tocou: false, reagiu: null });
  });
  test("a supply zone mirrors it", () => {
    const supply = { baixo: 100.5, alto: 101.5, invalidacao: 102, nota: 50 };
    const l = labelSnapshot(snapshot({ zones: { demanda: null, oferta: supply } }), [bar(0, 100, 100.6, 99.9, 100.3), bar(1, 100.3, 100.4, 99.4, 99.6), quiet(2)], "15m", NOW);
    expect(l.zonaOferta).toEqual({ tocou: true, reagiu: true });
  });
  test("without an ATR a touch is known but the reaction is not", () => {
    const l = labelSnapshot(snapshot({ atr15m: null, zones: { demanda: demand, oferta: null } }), [bar(0, 100, 100, 99.4, 99.8), quiet(1), quiet(2)], "15m", NOW);
    expect(l.zonaDemanda).toEqual({ tocou: true, reagiu: null });
  });
});
