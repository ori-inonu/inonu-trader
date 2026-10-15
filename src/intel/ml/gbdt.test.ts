import { describe, expect, test } from "bun:test";
import { Rng } from "../../lab/rng";
import { predictGbdt, trainGbdt } from "./gbdt";

interface Data { x: Float64Array; y: Uint8Array; n: number; p: number }

/** Columns are standard normal; y comes from `rule`; `missing` blanks a share of one column. */
function make(n: number, p: number, seed: number, rule: (row: number[], rng: Rng) => boolean, missing?: { column: number; share: number }): Data {
  const rng = new Rng(seed, "gbdt-data");
  const x = new Float64Array(n * p);
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const row = Array.from({ length: p }, () => rng.normal());
    y[i] = rule(row, rng) ? 1 : 0;
    for (let j = 0; j < p; j += 1) x[i * p + j] = row[j]!;
    if (missing !== undefined && rng.next() < missing.share) x[i * p + missing.column] = Number.NaN;
  }
  return { x, y, n, p };
}

const accuracy = (model: ReturnType<typeof trainGbdt>, d: Data): number => {
  let hits = 0;
  for (let i = 0; i < d.n; i += 1) hits += (predictGbdt(model, d.x.subarray(i * d.p, (i + 1) * d.p)) >= 0.5 ? 1 : 0) === d.y[i]! ? 1 : 0;
  return hits / d.n;
};
const asValidation = (d: Data) => ({ x: d.x, y: d.y, n: d.n });

describe("what the trees can learn (ML-1)", () => {
  const xor = (row: number[]) => row[0]! * row[1]! > 0;
  test("an interaction no linear model can see: the sign of x0 times x1", () => {
    const train = make(6_000, 4, 21, xor);
    const valid = make(2_000, 4, 22, xor);
    const test = make(2_000, 4, 23, xor);
    const m = trainGbdt(train.x, train.y, train.n, 4, asValidation(valid), { maxTrees: 300, learningRate: 0.1, minLeaf: 30 });
    expect(accuracy(m, test)).toBeGreaterThan(0.85);
  });

  test("a threshold on one column among noise", () => {
    const rule = (row: number[]) => row[2]! > 0.5;
    const train = make(4_000, 6, 24, rule);
    const test = make(2_000, 6, 25, rule);
    const m = trainGbdt(train.x, train.y, train.n, 6, asValidation(make(1_500, 6, 26, rule)));
    expect(accuracy(m, test)).toBeGreaterThan(0.93);
  });

  test("a value that is missing can itself be the signal", () => {
    // y is 1 exactly when column 1 is missing: a missing value has a bin of its own
    const d = make(4_000, 3, 27, (row, rng) => rng.next() < 0.5, { column: 1, share: 0.4 });
    for (let i = 0; i < d.n; i += 1) d.y[i] = Number.isNaN(d.x[i * 3 + 1]!) ? 1 : 0;
    const m = trainGbdt(d.x, d.y, d.n, 3, null, { maxTrees: 30, learningRate: 0.3 });
    expect(accuracy(m, d)).toBe(1);
    expect(predictGbdt(m, [0, Number.NaN, 0])).toBeGreaterThan(0.9);
    expect(predictGbdt(m, [0, 0.3, 0])).toBeLessThan(0.1);
  });
});

describe("no signal, no invention", () => {
  test("on noise the validation block stops it early, with few trees, and the predictions stay near the base rate", () => {
    const rule = (_: number[], rng: Rng) => rng.next() < 0.3;
    const train = make(5_000, 8, 31, rule);
    const valid = make(3_000, 8, 32, rule);
    const m = trainGbdt(train.x, train.y, train.n, 8, asValidation(valid), { maxTrees: 300, patience: 10 });
    expect(m.trees.length).toBeLessThan(60);
    let spread = 0;
    for (let i = 0; i < 500; i += 1) spread = Math.max(spread, Math.abs(predictGbdt(m, valid.x.subarray(i * 8, (i + 1) * 8)) - 0.3));
    expect(spread).toBeLessThan(0.12);
  });

  test("with no validation block it still trains (and keeps every tree)", () => {
    const d = make(2_000, 3, 33, (row) => row[0]! > 0);
    const m = trainGbdt(d.x, d.y, d.n, 3, null, { maxTrees: 12 });
    expect(m.trees.length).toBe(12);
    expect(m.bestIteration).toBe(12);
  });
});

describe("determinism and shape", () => {
  const d = make(2_500, 5, 41, (row) => row[0]! + row[3]! > 0);
  test("the same data and seed give the same model, byte for byte; another seed gives another one", () => {
    const a = trainGbdt(d.x, d.y, d.n, 5, null, { maxTrees: 20, seed: 7 });
    const b = trainGbdt(d.x, d.y, d.n, 5, null, { maxTrees: 20, seed: 7 });
    const c = trainGbdt(d.x, d.y, d.n, 5, null, { maxTrees: 20, seed: 8 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });
  test("the model is plain data that survives JSON and predicts the same afterwards", () => {
    const m = trainGbdt(d.x, d.y, d.n, 5, null, { maxTrees: 20 });
    const again = JSON.parse(JSON.stringify(m)) as typeof m;
    for (let i = 0; i < 50; i += 1) {
      const row = d.x.subarray(i * 5, (i + 1) * 5);
      expect(predictGbdt(again, row)).toBe(predictGbdt(m, row));
    }
  });
  test("depth is limited, and a leaf is never smaller than the minimum", () => {
    const m = trainGbdt(d.x, d.y, d.n, 5, null, { maxTrees: 10, maxDepth: 2 });
    for (const tree of m.trees) {
      const depth = (k: number): number => {
        const node = tree[k]!;
        return "v" in node ? 0 : 1 + Math.max(depth(node.l), depth(node.r));
      };
      expect(depth(0)).toBeLessThanOrEqual(2);
    }
  });
  test("bad shapes are refused", () => {
    expect(() => trainGbdt(new Float64Array(5), new Uint8Array(3), 3, 2, null)).toThrow(RangeError);
    expect(() => trainGbdt(new Float64Array(2), new Uint8Array(1), 1, 2, null)).toThrow(RangeError);
  });
});
