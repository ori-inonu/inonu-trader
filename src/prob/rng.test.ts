import { describe, expect, test } from "bun:test";
import { createRng, deriveSeed, hash32, randomInt } from "./rng.ts";

describe("rng com semente", () => {
  test("mesma semente, mesma sequência; sementes diferentes divergem", () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    const seqC = Array.from({ length: 20 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  test("valores ficam em [0, 1) e a média é razoável", () => {
    const rng = createRng(7);
    let sum = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const v = rng();
      expect(v >= 0 && v < 1).toBe(true);
      sum += v;
    }
    expect(Math.abs(sum / 10_000 - 0.5)).toBeLessThan(0.02);
  });

  test("randomInt cobre todo o intervalo e rejeita n inválido", () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(randomInt(rng, 5));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(() => randomInt(rng, 0)).toThrow(RangeError);
    expect(() => randomInt(rng, 1.5)).toThrow(RangeError);
  });

  test("deriveSeed separa fluxos por rótulo e é estável", () => {
    expect(deriveSeed(1, "a")).toBe(deriveSeed(1, "a"));
    expect(deriveSeed(1, "a")).not.toBe(deriveSeed(1, "b"));
    expect(deriveSeed(1, "a")).not.toBe(deriveSeed(2, "a"));
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
  });
});
