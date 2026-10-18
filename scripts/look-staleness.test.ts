import { describe, expect, test } from "bun:test";
import { fieldChangeShare, jaccard, skipAttribution, stanceChangeShare, summarize, type Look } from "./look-staleness";

const look = (atMs: number, buys: Record<string, Record<string, unknown>>, requested: Record<string, string>, briefHash: string | null = null): Look => ({ atMs, briefHash, buys, requested });

describe("the look staleness report says which inputs and answers actually change between looks", () => {
  test("a field that changes in every pair has a share of 1 and one that never changes has 0", () => {
    const looks = [look(0, { A: { p: 1, l: 500 } }, {}), look(120_000, { A: { p: 2, l: 500 } }, {}), look(240_000, { A: { p: 3, l: 500 } }, {})];
    const share = fieldChangeShare(looks);
    expect([share["p"], share["l"]]).toEqual([1, undefined]);
  });

  test("a candidate that is not in both looks is not counted as a change", () => {
    const share = fieldChangeShare([look(0, { A: { p: 1 } }, {}), look(1, { B: { p: 9 } }, {})]);
    expect(share).toEqual({});
  });

  test("the stance change share counts only candidates that were answered in both looks", () => {
    const a = look(0, { A: {}, B: {}, C: {} }, { A: "skip", B: "skip", C: "skip" });
    const b = look(1, { A: {}, B: {}, C: {} }, { A: "skip", B: "buy_tenth" });
    expect(stanceChangeShare([a, b])).toEqual({ pairs: 2, changed: 1, share: 0.5 });
  });

  test("the candidate set similarity is the Jaccard index and two empty sets are identical", () => {
    expect([jaccard(new Set(["A", "B"]), new Set(["B", "C"])), jaccard(new Set(), new Set())]).toEqual([1 / 3, 1]);
  });

  test("the summary reports the median gap in minutes and the share of identical brief hashes", () => {
    const s = summarize([look(0, {}, {}, "h1"), look(120_000, {}, {}, "h1"), look(240_000, {}, {}, "h2")]);
    expect([s.medianGapMin, s.identicalBriefHashShare]).toEqual([2, 0.5]);
  });

  test("skip attribution separates the Jev saying skip from the code turning a requested buy into skip, and counts what bound the size", () => {
    const a: Look = { atMs: 0, briefHash: null, buys: { A: {}, B: {}, C: {} }, requested: { A: "skip", B: "buy_tenth", C: "buy_third" }, final: { A: "skip", B: "skip", C: "buy_third" }, binding: { A: "caixa", B: "minimo", C: "caixa" } };
    const r = skipAttribution([a]);
    expect([r.modelSkip.n, r.askedToBuyButGatedToSkip.n, r.buyStood.n, r.sizeBoundBy]).toEqual([1, 1, 1, { caixa: 2, minimo: 1 }]);
  });
});
