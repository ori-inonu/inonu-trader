import { describe, expect, test } from "bun:test";
import { hashSeed, Rng } from "./rng.ts";

// Supports LB4 (deterministic synthetic data), LB15 (reproducible random policy) and LB25 (same seed, same bytes).
// The titles carry the id of the criterion they support (LB24 traceability counts a test per criterion elsewhere).

describe("LB25 rng determinism", () => {
  test("LB25 same seed and stream give the same sequence; other seed or stream gives another", () => {
    const a = new Rng(7, "x");
    const b = new Rng(7, "x");
    const c = new Rng(8, "x");
    const d = new Rng(7, "y");
    const first = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(first);
    expect(Array.from({ length: 50 }, () => c.next())).not.toEqual(first);
    expect(Array.from({ length: 50 }, () => d.next())).not.toEqual(first);
  });

  test("LB25 hashSeed is a pure function of its parts and keeps parts apart", () => {
    expect(hashSeed(1, "a", "b")).toEqual(hashSeed(1, "a", "b"));
    expect(hashSeed(1, "ab", "")).not.toEqual(hashSeed(1, "a", "b"));
    expect(hashSeed(1, "a")).not.toEqual(hashSeed(2, "a"));
    expect(hashSeed(0).every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffffffff)).toBe(true);
  });

  test("LB25 child streams are reproducible and independent of how much the parent consumed", () => {
    const parent1 = new Rng(3, "p");
    const parent2 = new Rng(3, "p");
    for (let i = 0; i < 100; i += 1) parent2.next();
    const c1 = parent1.child("asset:SYNA");
    const c2 = parent2.child("asset:SYNA");
    expect(Array.from({ length: 20 }, () => c1.normal())).toEqual(Array.from({ length: 20 }, () => c2.normal()));
    expect(new Rng(3, "p").child("asset:SYNB").next()).not.toBe(new Rng(3, "p").child("asset:SYNA").next());
  });
});

describe("LB25 rng distributions", () => {
  test("LB25 next() lives in [0, 1) and nextOpen() in (0, 1), and the mean is near one half", () => {
    const rng = new Rng(11, "u");
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      const u = rng.next();
      expect(u >= 0 && u < 1).toBe(true);
      sum += u;
      const v = rng.nextOpen();
      expect(v > 0 && v < 1).toBe(true);
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  test("LB25 normal() has mean near 0 and variance near 1 and never returns a non finite value", () => {
    const rng = new Rng(5, "n");
    const n = 40000;
    let sum = 0;
    let square = 0;
    for (let i = 0; i < n; i += 1) {
      const z = rng.normal();
      expect(Number.isFinite(z)).toBe(true);
      sum += z;
      square += z * z;
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(square / n - mean * mean - 1)).toBeLessThan(0.03);
  });

  test("LB25 int(k) is uniform on 0..k-1 and rejects invalid bounds", () => {
    const rng = new Rng(9, "i");
    const counts = new Array<number>(6).fill(0);
    const n = 30000;
    for (let i = 0; i < n; i += 1) counts[rng.int(6)]! += 1;
    for (const count of counts) expect(Math.abs(count / n - 1 / 6)).toBeLessThan(0.01);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32 + 1]) expect(() => rng.int(bad)).toThrow(RangeError);
  });

  test("LB25 an unsafe seed is refused instead of silently coerced", () => {
    for (const bad of [-1, 1.5, Number.NaN, 2 ** 32]) expect(() => new Rng(bad, "s")).toThrow(RangeError);
    expect(() => new Rng(0, "s")).not.toThrow();
    expect(() => new Rng(2 ** 32 - 1, "s")).not.toThrow();
  });
});
