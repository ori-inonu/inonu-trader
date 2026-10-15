import { describe, expect, test } from "bun:test";
import { Rng } from "../../lab/rng";
import { applyIsotonic, fitIsotonic } from "./isotonic";
import { choleskySolve, predictLogistic, sigmoid, trainLogistic } from "./logistic";

/** `n` rows of two independent standard normal columns; y is 1 with probability sigmoid(b0 + b1 x1 + b2 x2). */
function planted(n: number, b: readonly [number, number, number], seed: number) {
  const rng = new Rng(seed, "logistic");
  const x = new Float64Array(n * 2);
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    x[i * 2] = rng.normal();
    x[i * 2 + 1] = rng.normal();
    y[i] = rng.next() < sigmoid(b[0] + b[1] * x[i * 2]! + b[2] * x[i * 2 + 1]!) ? 1 : 0;
  }
  return { x, y, n };
}

describe("the linear solver", () => {
  test("solves a small symmetric positive definite system worked on paper", () => {
    // [[4,2],[2,3]] x = [10,8] gives x = [1.75, 1.5]
    const x = choleskySolve(Float64Array.from([4, 2, 2, 3]), Float64Array.from([10, 8]), 2)!;
    expect(x[0]).toBeCloseTo(1.75, 12);
    expect(x[1]).toBeCloseTo(1.5, 12);
  });
  test("refuses a matrix that is not positive definite", () => {
    expect(choleskySolve(Float64Array.from([1, 2, 2, 1]), Float64Array.from([1, 1]), 2)).toBeNull();
  });
});

describe("logistic regression (ML-1)", () => {
  test("recovers planted coefficients from 20000 rows, within sampling error", () => {
    const { x, y, n } = planted(20_000, [-0.3, 1.2, -0.7], 11);
    const m = trainLogistic(x, y, n, 2, { l2: 1 });
    expect(m.converged).toBe(true);
    expect(m.weights[0]!).toBeCloseTo(-0.3, 1);
    expect(m.weights[1]!).toBeCloseTo(1.2, 1);
    expect(m.weights[2]!).toBeCloseTo(-0.7, 1);
  });

  test("columns with no information stay near zero, and the intercept finds the base rate", () => {
    const { x, y, n } = planted(20_000, [-1, 0, 0], 12);
    const m = trainLogistic(x, y, n, 2, { l2: 1 });
    expect(Math.abs(m.weights[1]!)).toBeLessThan(0.08);
    expect(Math.abs(m.weights[2]!)).toBeLessThan(0.08);
    expect(sigmoid(m.weights[0]!)).toBeCloseTo(sigmoid(-1), 1);
  });

  test("the penalty shrinks the coefficients", () => {
    const { x, y, n } = planted(2_000, [0, 1.5, 0], 13);
    const light = trainLogistic(x, y, n, 2, { l2: 0.01 });
    const heavy = trainLogistic(x, y, n, 2, { l2: 5_000 });
    expect(Math.abs(heavy.weights[1]!)).toBeLessThan(Math.abs(light.weights[1]!) / 3);
  });

  test("deterministic: the same data, the same coefficients, to the last bit", () => {
    const a = planted(3_000, [0.1, 0.9, 0.4], 14);
    const b = planted(3_000, [0.1, 0.9, 0.4], 14);
    expect(trainLogistic(a.x, a.y, a.n, 2).weights).toEqual(trainLogistic(b.x, b.y, b.n, 2).weights);
  });

  test("a probability is between 0 and 1 and moves the right way", () => {
    const { x, y, n } = planted(5_000, [0, 1.5, 0], 15);
    const m = trainLogistic(x, y, n, 2);
    expect(predictLogistic(m, [2, 0])).toBeGreaterThan(predictLogistic(m, [-2, 0]));
    for (const row of [[100, 100], [-100, -100], [0, 0]]) {
      const p = predictLogistic(m, row);
      expect(p >= 0 && p <= 1).toBe(true);
    }
  });

  test("bad shapes are refused", () => {
    expect(() => trainLogistic(new Float64Array(5), new Uint8Array(3), 3, 2)).toThrow(RangeError);
    expect(() => trainLogistic(new Float64Array(2), new Uint8Array(1), 1, 2)).toThrow(RangeError);
  });
});

describe("isotonic calibration (ML-1)", () => {
  test("pools violators: a hand case", () => {
    // scores 1..6 with labels 0,1,0,1,1,1: the 1 then 0 pair pools to 0.5 and the rest stays
    const m = fitIsotonic([1, 2, 3, 4, 5, 6], [0, 1, 0, 1, 1, 1]);
    expect(m.x).toEqual([1, 2.5, 4, 5, 6]);
    expect(m.y).toEqual([0, 0.5, 1, 1, 1]);
    expect(applyIsotonic(m, 0)).toBe(0);
    expect(applyIsotonic(m, 100)).toBe(1);
    expect(applyIsotonic(m, 2.5)).toBeCloseTo(0.5, 12);
    for (let i = 1; i < m.y.length; i += 1) expect(m.y[i]!).toBeGreaterThanOrEqual(m.y[i - 1]!);
  });
  test("the output never decreases with the score, on random data, and stays in [0,1]", () => {
    const rng = new Rng(3, "iso");
    const scores = Array.from({ length: 500 }, () => rng.next());
    const labels = scores.map((s) => (rng.next() < s ? 1 : 0));
    const m = fitIsotonic(scores, labels);
    let last = -1;
    for (let s = -0.1; s <= 1.1; s += 0.01) {
      const v = applyIsotonic(m, s);
      expect(v).toBeGreaterThanOrEqual(last - 1e-12);
      expect(v >= 0 && v <= 1).toBe(true);
      last = v;
    }
  });
  test("a model that is already calibrated is almost the identity", () => {
    const rng = new Rng(4, "iso2");
    const scores = Array.from({ length: 20_000 }, () => rng.next());
    const labels = scores.map((s) => (rng.next() < s ? 1 : 0));
    const m = fitIsotonic(scores, labels);
    for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) expect(Math.abs(applyIsotonic(m, s) - s)).toBeLessThan(0.05);
  });
  test("bad input is refused", () => {
    expect(() => fitIsotonic([], [])).toThrow(RangeError);
    expect(() => fitIsotonic([1], [1, 0])).toThrow(RangeError);
    expect(() => applyIsotonic({ x: [], y: [] }, 1)).toThrow(RangeError);
  });
});
