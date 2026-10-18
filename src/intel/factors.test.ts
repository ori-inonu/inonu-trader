// T5.3 / FLX-2, FLX-3, AC-FLX-2: Imbalance (diagonal and horizontal) and Sequencial on a footprint, with the vectors of
// flow-engine.md 6 (V-IMB-1, V-IMB-2, V-SEQ-1). The dispositions are ours; only the 80/215 and 475/315/560 numbers
// come from the Profit Pro help. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { imbalances, sequences, type ImbalanceParams } from "./factors";

const lv = (level: number, c: number, v: number) => ({ level, priceLow: String(level), c, v });
const asObject = (list: ReturnType<typeof imbalances>) => Object.fromEntries(list.map((i) => [i.level, i.imb]));
const params = (over: Partial<ImbalanceParams> = {}): ImbalanceParams => ({ x: 3, minVol: 1, mode: "diagonal", ...over });

describe("imbalances", () => {
  test("V-IMB-1, horizontal, X = 2: 80 bought against 215 sold is an imbalance of the selling side", () => {
    expect(asObject(imbalances([lv(1000, 80, 215)], params({ x: 2, mode: "horizontal" })))).toEqual({ 1000: "v" });
  });

  test("V-IMB-2, diagonal, X = 3, minVol = 10: a missing neighbour counts as zero and only the floor decides", () => {
    const fp = [lv(100, 5, 40), lv(101, 130, 12), lv(102, 20, 60)];
    expect(asObject(imbalances(fp, params({ minVol: 10 })))).toEqual({ 101: "c", 102: "v" });
  });

  test("a level where both diagonal inequalities hold is marked cv", () => {
    const fp = [lv(9, 0, 10), lv(10, 100, 100), lv(11, 10, 0)];
    expect(asObject(imbalances(fp, params()))).toEqual({ 10: "cv" });
  });

  test("the diagonal compares with the neighbour below (buying) and above (selling), the horizontal with the same level", () => {
    const fp = [lv(1, 0, 50), lv(2, 120, 100)];
    // diagonal: buying at 2 is 120 >= 3 * A_v(1) = 150? no. selling at 2 is 100 >= 3 * A_c(3) = 0, yes. level 1: selling 50 >= 3 * A_c(2) = 360? no
    expect(asObject(imbalances(fp, params()))).toEqual({ 2: "v" });
    // horizontal: level 2: 120 >= 3 * 100? no; 100 >= 3 * 120? no. level 1: selling 50 >= 3 * 0, yes
    expect(asObject(imbalances(fp, params({ mode: "horizontal" })))).toEqual({ 1: "v" });
  });

  test("a gap in the levels is a missing neighbour, not the next level", () => {
    const fp = [lv(100, 50, 0), lv(102, 0, 60)];
    expect(asObject(imbalances(fp, params()))).toEqual({ 100: "c", 102: "v" });
  });

  test("the ratio may have up to three decimals and the comparison is exact", () => {
    const horizontal = (c: number) => asObject(imbalances([lv(10, c, 100)], params({ x: 2.5, mode: "horizontal" })));
    expect(horizontal(249)).toEqual({});
    expect(horizontal(250)).toEqual({ 10: "c" });
  });

  test("levels with nothing in them are never reported, and the result is ascending", () => {
    const out = imbalances([lv(5, 0, 0), lv(7, 100, 0), lv(6, 90, 0)], params({ mode: "horizontal" }));
    expect(out.map((i) => i.level)).toEqual([6, 7]);
  });

  test("bad parameters are errors at the call", () => {
    for (const bad of [{ x: 1 }, { x: 0.5 }, { x: Number.NaN }, { x: 2.0001 }, { minVol: 0 }, { minVol: -1 }, { minVol: 1.5 }, { mode: "other" as never }]) expect(() => imbalances([], params(bad))).toThrow();
  });
});

describe("sequences (Sequencial)", () => {
  const imbOf = (fp: ReturnType<typeof lv>[], over: Partial<ImbalanceParams> = {}) => imbalances(fp, params({ x: 2, mode: "horizontal", ...over }));
  const V_SEQ_1 = [lv(200, 475, 100), lv(201, 315, 80), lv(202, 560, 120), lv(203, 30, 25)];

  test("V-SEQ-1: three adjacent levels of buying imbalance make one run; N = 4 finds none", () => {
    expect(sequences(imbOf(V_SEQ_1), 3)).toEqual([{ lado: "c", nivelInicial: 200, nivelFinal: 202, comprimento: 3 }]);
    expect(sequences(imbOf(V_SEQ_1), 4)).toEqual([]);
  });

  test("a gap in the levels breaks a run", () => {
    const fp = [lv(200, 400, 10), lv(201, 400, 10), lv(203, 400, 10), lv(204, 400, 10)];
    expect(sequences(imbOf(fp), 3)).toEqual([]);
    expect(sequences(imbOf(fp), 2)).toEqual([
      { lado: "c", nivelInicial: 200, nivelFinal: 201, comprimento: 2 },
      { lado: "c", nivelInicial: 203, nivelFinal: 204, comprimento: 2 },
    ]);
  });

  test("a different side breaks a run, and a cv level takes part in the runs of both sides", () => {
    const list = [
      { level: 8, imb: "v" as const },
      { level: 9, imb: "v" as const },
      { level: 10, imb: "cv" as const },
      { level: 11, imb: "c" as const },
      { level: 12, imb: "c" as const },
    ];
    expect(sequences(list, 3)).toEqual([
      { lado: "v", nivelInicial: 8, nivelFinal: 10, comprimento: 3 },
      { lado: "c", nivelInicial: 10, nivelFinal: 12, comprimento: 3 },
    ]);
  });

  test("runs come out in a fixed order: by first level, then c before v", () => {
    const list = [
      { level: 1, imb: "c" as const },
      { level: 2, imb: "c" as const },
      { level: 5, imb: "v" as const },
      { level: 6, imb: "v" as const },
    ];
    expect(sequences(list, 2).map((r) => [r.lado, r.nivelInicial])).toEqual([["c", 1], ["v", 5]]);
    const tie = [
      { level: 1, imb: "cv" as const },
      { level: 2, imb: "cv" as const },
    ];
    expect(sequences(tie, 2).map((r) => r.lado)).toEqual(["c", "v"]);
  });

  test("N must be a whole number of at least 2", () => {
    for (const bad of [1, 0, 2.5, Number.NaN]) expect(() => sequences([], bad)).toThrow();
  });
});
