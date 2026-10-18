// T5.8 / FLX-4, FLX-5, AC-FLX-2: Progressao and Exaustao with the vectors V-PRG-1 and V-EXH-1 (50/190/290 and 385/165/30
// come from the Profit Pro help; the rest is ours). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { exhaustions, progressions } from "./factors-trend";

const lv = (level: number, c: number, v: number) => ({ level, priceLow: String(level), c, v });

describe("progressions", () => {
  test("V-PRG-1: 50, 190, 290 bought on three adjacent levels is a progression of three; the 120 above breaks it", () => {
    const fp = [lv(300, 50, 0), lv(301, 190, 0), lv(302, 290, 0), lv(303, 120, 0)];
    expect(progressions(fp, { x: 3, minVol: 1 })).toEqual([{ lado: "c", niveis: [300, 301, 302], comprimento: 3 }]);
  });

  test("V-PRG-1 negative: 50, 190, 190 is not strictly increasing", () => {
    expect(progressions([lv(300, 50, 0), lv(301, 190, 0), lv(302, 190, 0)], { x: 3, minVol: 1 })).toEqual([]);
  });

  test("selling progresses downwards: the scan goes from high to low prices and the levels are listed in scan order", () => {
    const fp = [lv(10, 0, 300), lv(11, 0, 200), lv(12, 0, 50)];
    expect(progressions(fp, { x: 3, minVol: 1 })).toEqual([{ lado: "v", niveis: [12, 11, 10], comprimento: 3 }]);
  });

  test("a gap in the levels breaks the run", () => {
    expect(progressions([lv(300, 10, 0), lv(301, 20, 0), lv(303, 30, 0)], { x: 3, minVol: 1 })).toEqual([]);
  });

  test("the reported length is the maximal run, and levels under the floor do not take part", () => {
    const fp = [lv(1, 5, 0), lv(2, 10, 0), lv(3, 20, 0), lv(4, 40, 0), lv(5, 80, 0)];
    expect(progressions(fp, { x: 3, minVol: 1 })[0]).toMatchObject({ niveis: [1, 2, 3, 4, 5], comprimento: 5 });
    // with a floor of 10 the level with 5 is out and the run starts at 2
    expect(progressions(fp, { x: 3, minVol: 10 })[0]).toMatchObject({ niveis: [2, 3, 4, 5], comprimento: 4 });
  });

  test("both sides can progress in one footprint; buying is reported before selling", () => {
    const fp = [lv(1, 10, 90), lv(2, 20, 60), lv(3, 30, 30)];
    expect(progressions(fp, { x: 3, minVol: 1 })).toEqual([
      { lado: "c", niveis: [1, 2, 3], comprimento: 3 },
      { lado: "v", niveis: [3, 2, 1], comprimento: 3 },
    ]);
  });

  test("X must be a whole number of at least 2 and the floor a positive whole number", () => {
    for (const bad of [1, 0, 2.5]) expect(() => progressions([], { x: bad, minVol: 1 })).toThrow();
    expect(() => progressions([], { x: 3, minVol: 0 })).toThrow();
  });
});

describe("exhaustions", () => {
  test("V-EXH-1: at the lower end 385, 165, 30 sold with no buying weakens towards the extreme", () => {
    const fp = [lv(400, 0, 30), lv(401, 0, 165), lv(402, 0, 385)];
    expect(exhaustions(fp, { x: 3, minVol: 1 })).toEqual([{ extremo: "baixo", niveis: [402, 401, 400], valores: [385, 165, 30] }]);
  });

  test("V-EXH-1 negative: 385, 165, 170 grows again at the extreme", () => {
    expect(exhaustions([lv(400, 0, 170), lv(401, 0, 165), lv(402, 0, 385)], { x: 3, minVol: 1 })).toEqual([]);
  });

  test("the upper extreme is symmetric: buying that weakens towards the highest level", () => {
    const fp = [lv(500, 400, 0), lv(501, 150, 0), lv(502, 20, 0)];
    expect(exhaustions(fp, { x: 3, minVol: 1 })).toEqual([{ extremo: "alto", niveis: [500, 501, 502], valores: [400, 150, 20] }]);
  });

  test("the difference counts: buying at the lower extreme cancels the selling there", () => {
    // D_v = A_v - A_c = 385, 165, -5 at the extreme: not positive, no exhaustion
    expect(exhaustions([lv(400, 35, 30), lv(401, 0, 165), lv(402, 0, 385)], { x: 3, minVol: 1 })).toEqual([]);
  });

  test("it only looks at the real extremes of the candle, not at an interior run", () => {
    const fp = [lv(398, 90, 90), lv(400, 0, 30), lv(401, 0, 165), lv(402, 0, 385), lv(403, 0, 500)];
    // the lower extreme is 398 (90 against 90, difference 0): nothing; the upper extreme 403 shows selling, which is not buying exhaustion
    expect(exhaustions(fp, { x: 3, minVol: 1 })).toEqual([]);
  });

  test("a gap before the extreme breaks the chain", () => {
    expect(exhaustions([lv(400, 0, 30), lv(402, 0, 165), lv(403, 0, 385)], { x: 3, minVol: 1 })).toEqual([]);
  });

  test("the chain reported is the maximal one ending at the extreme", () => {
    const fp = [lv(400, 0, 10), lv(401, 0, 40), lv(402, 0, 90), lv(403, 0, 200), lv(404, 0, 150)];
    expect(exhaustions(fp, { x: 3, minVol: 1 })).toEqual([{ extremo: "baixo", niveis: [403, 402, 401, 400], valores: [200, 90, 40, 10] }]);
  });

  test("an empty footprint has no extremes", () => {
    expect(exhaustions([], { x: 3, minVol: 1 })).toEqual([]);
  });

  test("X must be a whole number of at least 2", () => {
    for (const bad of [1, 0, 2.5]) expect(() => exhaustions([], { x: bad, minVol: 1 })).toThrow();
  });
});
