// T5.9 / FLX-6, AC-FLX-3: Fator Volume, Ordem original and Alerta de quantidade with V-VOL-1, V-ORD-1, V-QTY-1.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { originalOrders, quantityAlerts, volumeFactor } from "./factors-volume";
import type { InstrumentMeta } from "./footprint";

const lv = (level: number, c: number, v: number) => ({ level, priceLow: String(level), c, v });

describe("volumeFactor (Fator Volume)", () => {
  const fp = [lv(500, 100, 20), lv(501, 200, 100), lv(502, 30, 50), lv(503, 100, 200)]; // totals 120, 300, 80, 300
  const levelsOf = (k: number) => volumeFactor(fp, k).map((m) => m.level);

  test("V-VOL-1: the K busiest levels, ties going to the lower level", () => {
    expect(levelsOf(0)).toEqual([]);
    expect(levelsOf(1)).toEqual([501]);
    expect(levelsOf(2)).toEqual([501, 503]);
    expect(levelsOf(3)).toEqual([501, 503, 500]);
  });

  test("each mark carries the dominant aggressor: c, v or n when equal", () => {
    expect(volumeFactor(fp, 2)).toEqual([{ level: 501, dominante: "c", total: 300 }, { level: 503, dominante: "v", total: 300 }]);
    expect(volumeFactor([lv(1, 50, 50)], 1)[0]!.dominante).toBe("n");
  });

  test("K is 0 to 3 and fewer levels than K is fine", () => {
    expect(volumeFactor([lv(1, 5, 5)], 3)).toHaveLength(1);
    for (const bad of [-1, 4, 1.5, Number.NaN]) expect(() => volumeFactor(fp, bad)).toThrow();
  });
});

describe("originalOrders (Ordem original)", () => {
  const SPOT: InstrumentMeta = { instId: "T-USDT", instType: "SPOT", tickSz: "1", lotSz: "1" };
  const trade = (px: string, sz: string) => ({ ts: 0, px, sz, side: "buy" as const });

  test("V-ORD-1: single trades of at least T are counted at their level, with the largest", () => {
    const trades = [trade("1000", "100"), trade("1000", "250"), trade("1000", "400"), trade("1001", "249")];
    expect(originalOrders(SPOT, 1, trades, 250)).toEqual([{ level: 1000, quantidade: 2, maior: 400 }]);
  });

  test("T is a floor in units, so equal means counted; a perpetual size is converted before the comparison", () => {
    // the unit of this perpetual is lotSz * ctVal * ctMult = 0.01 base, so 7 contracts are 7 units
    const SWAP: InstrumentMeta = { instId: "B-USDT-SWAP", instType: "SWAP", tickSz: "1", lotSz: "1", ctVal: "0.01", ctMult: "1" };
    expect(originalOrders(SWAP, 1, [trade("50", "7")], 7)).toEqual([{ level: 50, quantidade: 1, maior: 7 }]);
    expect(originalOrders(SWAP, 1, [trade("50", "6")], 7)).toEqual([]);
  });

  test("rejected trades are ignored and the levels come out ascending", () => {
    const out = originalOrders(SPOT, 1, [trade("20", "300"), trade("abc", "300"), trade("10", "300")], 250);
    expect(out.map((o) => o.level)).toEqual([10, 20]);
  });

  test("T must be a positive whole number", () => {
    for (const bad of [0, -1, 1.5]) expect(() => originalOrders(SPOT, 1, [], bad)).toThrow();
  });
});

describe("quantityAlerts (Alerta de quantidade)", () => {
  test("V-QTY-1: per side, not by the sum: 500 bought against 499 sold alerts the buying side only", () => {
    expect(quantityAlerts([lv(1, 500, 499), lv(2, 300, 300)], 500)).toEqual([{ level: 1, c: true, v: false }]);
  });

  test("both sides can alert on one level", () => {
    expect(quantityAlerts([lv(1, 600, 700)], 500)).toEqual([{ level: 1, c: true, v: true }]);
  });

  test("Q must be a positive whole number", () => {
    for (const bad of [0, -3, 2.5]) expect(() => quantityAlerts([], bad)).toThrow();
  });
});
