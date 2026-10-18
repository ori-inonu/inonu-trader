import { describe, expect, test } from "bun:test";
import { fitPrep, selectKept, standardize, standardizedNames, widthOf, MAX_MISSING_SHARE } from "./prep";

const names = ["a", "b", "c", "d", "e"];
const NaN_ = Number.NaN;

describe("fitting the preparation on training rows", () => {
  // a: varies; b: constant; c: missing in 98 percent; d: missing in 10 percent; e: always present
  const rows = Array.from({ length: 100 }, (_, i) => [i, 7, i < 2 ? i : NaN_, i % 10 === 0 ? NaN_ : i * 2, (i % 5) - 2]);
  const prep = fitPrep(rows, names);

  test("a constant column and one that is almost always missing are dropped", () => {
    expect(prep.names).toEqual(["a", "d", "e"]);
    expect(prep.kept).toEqual([0, 3, 4]);
    expect(MAX_MISSING_SHARE).toBe(0.95);
  });
  test("only a column that is sometimes missing gets a column that says so", () => {
    expect(prep.indicator).toEqual([1]);
    expect(standardizedNames(prep)).toEqual(["a", "d", "e", "d?"]);
    expect(widthOf(prep)).toBe(4);
  });
  test("the scale is the one of the training rows, and a missing value becomes the median with its flag set", () => {
    const m = prep.mean[0]!;
    const sd = prep.sd[0]!;
    const out = standardize(prep, [50, 7, NaN_, NaN_, 0]);
    expect(out[0]).toBeCloseTo((50 - m) / sd, 12);
    expect(out[3]).toBe(1);
    expect(out[1]).toBeCloseTo((prep.median[1]! - prep.mean[1]!) / prep.sd[1]!, 12);
    expect(standardize(prep, [50, 7, NaN_, 20, 0])[3]).toBe(0);
  });
  test("the trees read the kept columns raw, a missing value stays missing", () => {
    const out = selectKept(prep, [50, 7, NaN_, NaN_, 1]);
    expect(Number.isNaN(out[1]!)).toBe(true);
    expect([out[0], out[2]]).toEqual([50, 1]);
  });
});

describe("no leakage from the rows it was not fitted on", () => {
  test("fitting on the first half gives another scale than fitting on all, and a row of the second half is scaled by the first", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [i < 100 ? i : 1000 + i]);
    const first = fitPrep(rows.slice(0, 100), ["a"]);
    const all = fitPrep(rows, ["a"]);
    expect(first.mean[0]).not.toBe(all.mean[0]);
    expect(standardize(first, rows[150]!)[0]).toBeGreaterThan(10);
  });
  test("an empty fit is refused", () => {
    expect(() => fitPrep([], ["a"])).toThrow(RangeError);
  });
});
