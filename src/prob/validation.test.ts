import { describe, expect, test } from "bun:test";
import { lookaheadViolations, walkForwardFolds } from "./validation.ts";

const MIN = 60_000;

describe("walk-forward com purga", () => {
  const times = Array.from({ length: 100 }, (_, i) => i * MIN);

  test("o treino termina antes do teste, com purga do que ainda olha para dentro do teste", () => {
    const wf = walkForwardFolds(times, { folds: 4, horizonMs: 10 * MIN, minTrain: 5, minTest: 5 });
    expect(wf.folds).toHaveLength(4);
    expect(wf.skipped).toHaveLength(0);
    for (const fold of wf.folds) {
      expect(fold.purged).toBe(9);
      expect(Math.max(...fold.train.map((i) => times[i] as number)) + 10 * MIN).toBeLessThanOrEqual(fold.testStartMs);
      expect(fold.test.every((i) => (times[i] as number) >= fold.testStartMs)).toBe(true);
    }
    expect(lookaheadViolations(times, wf.folds, 10 * MIN)).toEqual([]);
  });

  test("o treino é expansivo e os testes não se sobrepõem", () => {
    const wf = walkForwardFolds(times, { folds: 3, horizonMs: 0, minTrain: 1, minTest: 1 });
    expect(wf.folds[0]!.train.length).toBeLessThan(wf.folds[1]!.train.length);
    expect(wf.folds[1]!.train.length).toBeLessThan(wf.folds[2]!.train.length);
    const seen = new Set<number>();
    for (const fold of wf.folds) for (const i of fold.test) {
      expect(seen.has(i)).toBe(false);
      seen.add(i);
    }
  });

  test("a detecção de vazamento acusa um treino que invade o teste", () => {
    const wf = walkForwardFolds(times, { folds: 2, horizonMs: 0, minTrain: 1, minTest: 1 });
    // verificar com um horizonte maior que o usado na purga tem de acusar problemas
    expect(lookaheadViolations(times, wf.folds, 30 * MIN).length).toBeGreaterThan(0);
    const broken = [{ ...wf.folds[0]!, train: [...wf.folds[0]!.train, wf.folds[0]!.test[0]!] }];
    expect(lookaheadViolations(times, broken, 0).some((m) => m.includes("treino e no teste"))).toBe(true);
  });

  test("instantes repetidos nunca são divididos entre blocos", () => {
    const dup = [...Array.from({ length: 30 }, () => 0), ...Array.from({ length: 30 }, () => MIN), ...Array.from({ length: 30 }, () => 2 * MIN)];
    const wf = walkForwardFolds(dup, { folds: 2, horizonMs: 0, minTrain: 1, minTest: 1 });
    for (const fold of wf.folds) {
      const testTimes = new Set(fold.test.map((i) => dup[i]));
      for (const i of fold.train) expect(testTimes.has(dup[i])).toBe(false);
    }
  });

  test("dobras sem treino ou sem teste suficientes são devolvidas com o motivo, não descartadas em silêncio", () => {
    // horizonte maior que o histórico: todo o passado é purgado
    const wf = walkForwardFolds(times, { folds: 3, horizonMs: 200 * MIN, minTrain: 5, minTest: 5 });
    expect(wf.folds).toHaveLength(0);
    expect(wf.skipped).toHaveLength(3);
    expect(wf.skipped.every((s) => s.reason === "treino_insuficiente" && s.purged > 0)).toBe(true);
    const tiny = walkForwardFolds(times.slice(0, 10), { folds: 4, horizonMs: 0, minTrain: 1, minTest: 5 });
    expect(tiny.skipped.some((s) => s.reason === "teste_insuficiente")).toBe(true);
  });

  test("entrada fora do domínio lança; ordem de entrada não importa", () => {
    expect(() => walkForwardFolds(times, { folds: 0, horizonMs: 0, minTrain: 1, minTest: 1 })).toThrow(RangeError);
    expect(() => walkForwardFolds([1, Number.NaN], { folds: 1, horizonMs: 0, minTrain: 1, minTest: 1 })).toThrow(RangeError);
    const shuffled = [...times].reverse();
    const a = walkForwardFolds(times, { folds: 3, horizonMs: 5 * MIN, minTrain: 1, minTest: 1 });
    const b = walkForwardFolds(shuffled, { folds: 3, horizonMs: 5 * MIN, minTrain: 1, minTest: 1 });
    expect(b.folds.map((f) => f.testStartMs)).toEqual(a.folds.map((f) => f.testStartMs));
    expect(lookaheadViolations(shuffled, b.folds, 5 * MIN)).toEqual([]);
  });
});
