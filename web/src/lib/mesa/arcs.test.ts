import { describe, expect, test } from "bun:test";
import { donutSegments } from "./arcs";

const C = 100;

describe("donutSegments", () => {
  test("segment lengths are proportional to the weights, in order, minus the gaps", () => {
    const s = donutSegments([0.5, 0.25, 0.25], C, 2);
    expect(s.map((x) => x.length)).toEqual([48, 23, 23]);
    expect(s.map((x) => x.offset)).toEqual([0, 50, 75]);
  });

  test("a weight of zero draws nothing, never a sliver", () => {
    const s = donutSegments([1, 0, 0], C, 2);
    expect(s[0]!.length).toBe(98);
    expect(s[1]!.length).toBe(0);
    expect(s[2]!.length).toBe(0);
  });

  test("unknown weights draw no arcs at all", () => {
    expect(donutSegments([null, null, null], C, 2).every((x) => x.length === 0)).toBe(true);
    expect(donutSegments([0.5, null, 0.5], C, 2).every((x) => x.length === 0)).toBe(true);
  });

  test("weights that do not add up to one are normalized, not trusted", () => {
    const s = donutSegments([2, 1, 1], C, 0);
    expect(s.map((x) => x.length)).toEqual([50, 25, 25]);
  });

  test("a gap larger than the segment clamps to zero length", () => {
    const s = donutSegments([0.01, 0.99, 0], C, 5);
    expect(s[0]!.length).toBe(0);
    expect(s[1]!.length).toBeCloseTo(94, 5);
  });

  test("negative or non finite weights make the whole ring unknown", () => {
    expect(donutSegments([-1, 1, 1], C, 2).every((x) => x.length === 0)).toBe(true);
    expect(donutSegments([Number.NaN, 1, 1], C, 2).every((x) => x.length === 0)).toBe(true);
  });
});
