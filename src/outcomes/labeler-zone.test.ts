// REC-3 (found by the independent audit of 2026-10-13): the stop of the triple barrier is the invalidation of the zone of the side
// when there is a valid one, and one ATR otherwise; the target is 1.5 times THAT distance. And the window of a label starts at the
// bar the snapshot was taken in when the snapshot is a few seconds into it (the clock recorder), so a one hour label is one hour.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { Bar } from "../intel/features/types";
import { ENTRY_TOLERANCE_MS, LABEL_BAR_MS, labelSnapshot, windowOf } from "./labeler";
import type { Snapshot, ZoneRef } from "./types";

const bar = (ts: number, open: number, high: number, low: number, close: number): Bar => ({ ts, open, high, low, close, volume: 1, confirmed: true });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  id: "s", asOfMs: 0, instId: "ETH-USDT", market: "spot", price: 100, costRoundTripBps: 20, atr15m: 10, zones: { demanda: null, oferta: null },
  features: { v: 1, instId: "ETH-USDT", asOfMs: 0, values: {}, nulos: {}, idades: {} }, origem: "relogio", ...over,
});
const demand = (inv: number | null): ZoneRef => ({ baixo: 98, alto: 100, invalidacao: inv, nota: 60 });
const supply = (inv: number | null): ZoneRef => ({ baixo: 100, alto: 102, invalidacao: inv, nota: 60 });
const NOW = 3_600_000;

describe("the stop is the invalidation of the zone of the side (the case of the audit)", () => {
  // entry 100, ATR 10 (so the ATR stop is 90), a demand zone [98, 100] that ends at 99: the bars close at 98.75, beyond it
  const bars = [bar(0, 100, 101, 98.5, 98.75), bar(300_000, 98.75, 99, 98.5, 98.75), bar(600_000, 98.75, 99, 98.5, 98.75)];
  test("a long is stopped at the invalidation, not left to time out", () => {
    const l = labelSnapshot(snap({ zones: { demanda: demand(99), oferta: null } }), bars, "15m", NOW);
    expect(l.barreiraLong).toBe("parada");
    expect(l.baseDaParadaLong).toBe("zona");
    expect(l.zonaDemanda).toEqual({ tocou: true, reagiu: false });
  });
  test("without a zone the same bars keep the ATR stop, as before: the stop at 90 is never reached", () => {
    const l = labelSnapshot(snap(), bars, "15m", NOW);
    expect([l.barreiraLong, l.baseDaParadaLong, l.baseDaParadaShort]).toEqual(["tempo", "atr", "atr"]);
  });
  test("the short mirrors it: the supply zone ends at 101 and the bars go to 101.5", () => {
    const up = [bar(0, 100, 101.5, 99.8, 101.2), bar(300_000, 101.2, 101.4, 101, 101.2), bar(600_000, 101.2, 101.4, 101, 101.2)];
    const l = labelSnapshot(snap({ zones: { demanda: null, oferta: supply(101) } }), up, "15m", NOW);
    expect([l.barreiraShort, l.baseDaParadaShort, l.baseDaParadaLong]).toEqual(["parada", "zona", "atr"]);
    expect(labelSnapshot(snap(), up, "15m", NOW).barreiraShort).toBe("tempo");
  });
});

describe("the target is 1.5 times the distance to the stop that was used", () => {
  test("a long with a stop 1 away has its target at 101.5, and reaching it is a win", () => {
    const bars = [bar(0, 100, 100.4, 99.6, 100.2), bar(300_000, 100.2, 101.6, 100, 101.4), bar(600_000, 101.4, 101.5, 101, 101.2)];
    const l = labelSnapshot(snap({ zones: { demanda: demand(99), oferta: null } }), bars, "15m", NOW);
    expect(l.barreiraLong).toBe("alvo");
  });
  test("the same bars with the ATR basis (a target 15 away) end by time", () => {
    const bars = [bar(0, 100, 100.4, 99.6, 100.2), bar(300_000, 100.2, 101.6, 100, 101.4), bar(600_000, 101.4, 101.5, 101, 101.2)];
    expect(labelSnapshot(snap(), bars, "15m", NOW).barreiraLong).toBe("tempo");
  });
  test("the stop still wins when it and the target are inside one bar", () => {
    const bars = [bar(0, 100, 101.6, 98.9, 100), bar(300_000, 100, 100.2, 99.8, 100), bar(600_000, 100, 100.2, 99.8, 100)];
    expect(labelSnapshot(snap({ zones: { demanda: demand(99), oferta: null } }), bars, "15m", NOW).barreiraLong).toBe("parada");
  });
});

describe("an invalidation that cannot be a stop is not one", () => {
  const quiet = [bar(0, 100, 100.3, 99.7, 100), bar(300_000, 100, 100.3, 99.7, 100), bar(600_000, 100, 100.3, 99.7, 100)];
  test("missing, on the wrong side of the entry, or exactly at the entry: the ATR is used and the basis says so", () => {
    for (const inv of [null, 100, 101, 100.0]) {
      const l = labelSnapshot(snap({ zones: { demanda: demand(inv), oferta: null } }), quiet, "15m", NOW);
      expect([l.barreiraLong, l.baseDaParadaLong], String(inv)).toEqual(["tempo", "atr"]);
    }
    const s = labelSnapshot(snap({ zones: { demanda: null, oferta: supply(99) } }), quiet, "15m", NOW);
    expect(s.baseDaParadaShort).toBe("atr");
  });
  test("a long does not take the stop of the supply zone, nor a short that of the demand zone", () => {
    const l = labelSnapshot(snap({ zones: { demanda: null, oferta: supply(101) } }), quiet, "15m", NOW);
    expect(l.baseDaParadaLong).toBe("atr");
    expect(l.baseDaParadaShort).toBe("zona");
    const m = labelSnapshot(snap({ zones: { demanda: demand(99), oferta: null } }), quiet, "15m", NOW);
    expect([m.baseDaParadaLong, m.baseDaParadaShort]).toEqual(["zona", "atr"]);
  });
  test("with no ATR and no zone there is no barrier and no basis", () => {
    const l = labelSnapshot(snap({ atr15m: null }), quiet, "15m", NOW);
    expect([l.barreiraLong, l.barreiraShort, l.baseDaParadaLong, l.baseDaParadaShort]).toEqual([null, null, null, null]);
  });
  test("with no ATR but a valid zone the zone still gives the barrier", () => {
    const l = labelSnapshot(snap({ atr15m: null, zones: { demanda: demand(99), oferta: null } }), quiet, "15m", NOW);
    expect([l.barreiraLong, l.baseDaParadaLong, l.baseDaParadaShort]).toEqual(["tempo", "zona", null]);
  });
});

describe("the window starts where the snapshot was taken", () => {
  test("a few seconds into a bar the window starts at that bar, so a one hour label is one hour from the bar", () => {
    const w = windowOf(10 * LABEL_BAR_MS + 4_000, "1h");
    expect(w).toEqual({ start: 10 * LABEL_BAR_MS, end: 10 * LABEL_BAR_MS + 3_600_000 });
    expect(windowOf(10 * LABEL_BAR_MS + ENTRY_TOLERANCE_MS, "15m").start).toBe(10 * LABEL_BAR_MS);
  });
  test("later into the bar (a click) it starts at the next bar, and exactly on a boundary it starts there", () => {
    expect(windowOf(10 * LABEL_BAR_MS + ENTRY_TOLERANCE_MS + 1, "1h").start).toBe(11 * LABEL_BAR_MS);
    expect(windowOf(10 * LABEL_BAR_MS, "1h").start).toBe(10 * LABEL_BAR_MS);
  });
  test("the label of a clock snapshot is complete one horizon after its bar, and its first bar is in the window", () => {
    const asOf = 10 * LABEL_BAR_MS + 4_000;
    const bars = Array.from({ length: 3 }, (_, i) => bar(10 * LABEL_BAR_MS + i * LABEL_BAR_MS, 100, 100.5, 99.5, 100 + i * 0.1));
    const early = labelSnapshot(snap({ asOfMs: asOf }), bars, "15m", 10 * LABEL_BAR_MS + 14 * 60_000);
    expect(early.motivoIncompleto).toBe("horizonte_alem_dos_dados");
    const done = labelSnapshot(snap({ asOfMs: asOf }), bars, "15m", 10 * LABEL_BAR_MS + 15 * 60_000);
    expect(done.completo).toBe(true);
    expect(done.brutoLongBps).toBe(20); // the close of the third bar, 100.2, over the entry 100
  });
});
