// T5.4 / FLX-7, AC-FLX-3: delta, cumulative delta, absorption and the volume profile (POC, value area, HVN, LVN) with the
// vectors V-CVD-1, V-ABS-1 and V-POC-1 of flow-engine.md 6. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { absorption, candleDelta, cumulativeDelta, volumeProfile } from "./profile";

const lv = (level: number, c: number, v: number) => ({ level, priceLow: String(level), c, v });

describe("delta and cumulative delta", () => {
  test("V-CVD-1: three candles of (100, 60), (50, 90), (200, 20) are +40, -40, +180 and the CVD runs 40, 0, 180", () => {
    const candles = [{ c: 100, v: 60 }, { c: 50, v: 90 }, { c: 200, v: 20 }];
    expect(candles.map(candleDelta)).toEqual([40, -40, 180]);
    expect(cumulativeDelta(candles)).toEqual([40, 0, 180]);
  });

  test("a candle delta is the sum of the buying minus the sum of the selling over its levels", () => {
    expect(candleDelta({ levels: [lv(1, 7, 3), lv(2, 0, 6)] })).toBe(-2); // V-FOOT-1 numbers: 7 - 9
    expect(candleDelta({ c: 0, v: 0 })).toBe(0);
  });

  test("an empty session has an empty CVD", () => {
    expect(cumulativeDelta([])).toEqual([]);
  });
});

describe("absorption (V-ABS-1)", () => {
  const base = { side: "v" as const, volume: 900, p90Prior: 800, open: "100", atr14: 2 };

  test("selling at the P90 of the prior candles that moved the price down by 0.2 against an ATR of 2 is absorbed", () => {
    expect(absorption({ ...base, close: "99.8" })).toEqual({ absorcao: true, lado: "v", razaoVolume: 1.125, deslocamentoEmATR: 0.1 });
  });

  test("the same volume with a fall of 2 is not absorption: the price did move", () => {
    expect(absorption({ ...base, close: "98" })).toMatchObject({ absorcao: false, lado: "v", razaoVolume: 1.125, deslocamentoEmATR: 1 });
  });

  test("volume under the P90 is not absorption however still the price is", () => {
    expect(absorption({ ...base, volume: 799, close: "100" })).toMatchObject({ absorcao: false });
  });

  test("buying absorption looks at a rise: a fall does not count as displacement for it", () => {
    expect(absorption({ side: "c", volume: 900, p90Prior: 800, open: "100", close: "98", atr14: 2 })).toMatchObject({ absorcao: true, deslocamentoEmATR: 0 });
    expect(absorption({ side: "c", volume: 900, p90Prior: 800, open: "100", close: "102", atr14: 2 })).toMatchObject({ absorcao: false, deslocamentoEmATR: 1 });
  });

  test("a displacement of exactly a quarter of the ATR still counts", () => {
    expect(absorption({ ...base, close: "99.5" })).toMatchObject({ absorcao: true, deslocamentoEmATR: 0.25 });
  });

  test("the share of the ATR is a parameter", () => {
    expect(absorption({ ...base, close: "99", maxDisplacementAtr: 0.5 })).toMatchObject({ absorcao: true });
    expect(absorption({ ...base, close: "99", maxDisplacementAtr: 0.25 })).toMatchObject({ absorcao: false });
  });

  test("without a P90 or an ATR (warm-up) there is nothing to say: null, never a guess", () => {
    expect(absorption({ ...base, close: "99.8", p90Prior: null })).toBeNull();
    expect(absorption({ ...base, close: "99.8", atr14: null })).toBeNull();
    expect(absorption({ ...base, close: "99.8", atr14: 0 })).toBeNull();
  });

  test("bad prices are errors, not silent zeros", () => {
    expect(() => absorption({ ...base, close: "abc" })).toThrow();
  });
});

describe("volumeProfile (V-POC-1)", () => {
  const rows = [[10, 5], [11, 20], [12, 50], [13, 30], [14, 30], [15, 10], [16, 60], [17, 10]].map(([level, total]) => lv(level!, total!, 0));

  test("POC 16, value area 12 to 17 (70% of 215), HVN at 12 and 16, LVN at 15 only", () => {
    expect(volumeProfile(rows)).toEqual({ poc: 16, val: 12, vah: 17, hvn: [12, 16], lvn: [15], total: 215 });
  });

  test("the POC tie goes to the level closest to the close, then to the lower level", () => {
    const tie = [lv(1, 50, 0), lv(2, 10, 0), lv(3, 50, 0)];
    expect(volumeProfile(tie, { closeLevel: 3 }).poc).toBe(3);
    expect(volumeProfile(tie, { closeLevel: 1 }).poc).toBe(1);
    expect(volumeProfile(tie, { closeLevel: 2 }).poc).toBe(1); // equal distance: the lower
    expect(volumeProfile(tie).poc).toBe(1);
  });

  test("buying and selling are added: a level's volume is c + v", () => {
    expect(volumeProfile([lv(1, 10, 20), lv(2, 5, 5)]).poc).toBe(1);
  });

  test("the value area stops at the edge of the window and a missing neighbour does not count", () => {
    const edge = [lv(1, 100, 0), lv(2, 1, 0)];
    expect(volumeProfile(edge)).toMatchObject({ poc: 1, val: 1, vah: 1 }); // 100 of 101 is already 99%
    const all = volumeProfile([lv(5, 10, 0)]);
    expect(all).toMatchObject({ poc: 5, val: 5, vah: 5, hvn: [], lvn: [] });
  });

  test("a gap in the levels is a level with no volume: the value area can cross it, and it is never an LVN", () => {
    const gap = [lv(1, 60, 0), lv(3, 40, 0)];
    const p = volumeProfile(gap);
    expect(p.poc).toBe(1);
    expect(p.vah).toBe(3); // 60 is under 70 of 100: the neighbours are 0 (level 2, empty) above, nothing below; it takes level 2 then 3
    expect(p.lvn).toEqual([]);
  });

  test("a plateau of equal levels counts once, at its lowest level", () => {
    // 5, 50, 50, 5, 5: the plateau at 2 and 3 is a strict maximum against 5 and 5; both ends are edges
    const plateau = [lv(1, 5, 0), lv(2, 50, 0), lv(3, 50, 0), lv(4, 5, 0), lv(5, 5, 0)];
    expect(volumeProfile(plateau).hvn).toEqual([2]);
  });

  test("an empty window has no profile", () => {
    expect(volumeProfile([])).toEqual({ poc: null, val: null, vah: null, hvn: [], lvn: [], total: 0 });
  });
});
