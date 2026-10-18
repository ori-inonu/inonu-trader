import { describe, expect, test } from "bun:test";
import type { ClosingRow } from "./dataset.ts";
import { BUY_THRESHOLD, calibratedPolicy, inTimeOrder, phaseCostOf, repeatPolicy, thresholdPolicy } from "./early-exit.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 17, 12);

let counter = 0;
function closing(token: string, at: number, firstP: number, secondBuy: number | null, cycle?: string): ClosingRow {
  counter += 1;
  const spent = secondBuy !== null;
  return { cycleId: cycle ?? `c${counter}`, candidateId: `buy:token:501:${token}`, tokenKey: `501:${token}`, atMs: at, firstP, secondBuy, would: null, wouldReason: null, quoted: spent, quoteMs: spent ? 1000 : null, modelMs: spent ? 300 : null, spentMs: spent ? 1300 : 0, entryCostPct: null, impactPct: null, facets: null, item: null };
}

describe("política por limiar", () => {
  const rows = [
    closing("A", T0, 0.35, 0.1),
    closing("A", T0 + MIN, 0.42, 0.2),
    closing("B", T0 + 2 * MIN, 0.5, 0.3),
    closing("B", T0 + 3 * MIN, 0.58, 0.55),
    closing("C", T0 + 4 * MIN, 0.4, null),
    closing("C", T0 + 5 * MIN, 0.3, 0.45),
  ];

  test("economiza o tempo medido dos dispensados e conta as compras e quase-compras perdidas", () => {
    const p = thresholdPolicy(rows, 0.45, 1, 100);
    expect(p.spentClosings).toBe(5);
    expect(p.dropped).toBe(3);
    expect(p.droppedShare).toBeCloseTo(3 / 5, 12);
    expect(p.quoteCallsSaved).toBe(3);
    expect(p.modelCallsSaved).toBe(3);
    expect(p.secondsSaved).toBeCloseTo(3.9, 12);
    expect(p.lostBuys).toBe(0);
    expect(p.totalBuys).toBe(1);
    expect(p.lostNearMisses).toBe(1);
    expect(p.totalNearMisses).toBe(2);
    expect(p.flags).toHaveLength(6);
  });

  test("limiar baixo não dispensa nada; limiar alto dispensa e perde a compra que existia", () => {
    expect(thresholdPolicy(rows, 0.2, 1, 100).dropped).toBe(0);
    const all = thresholdPolicy(rows, 0.9, 1, 100);
    expect(all.dropped).toBe(5);
    expect(all.lostBuys).toBe(1);
    expect(all.lostBuyRateUpper95).toBeGreaterThan(0);
  });

  test("zero compras em n vira limite superior de Wilson, não zero garantido", () => {
    const none = Array.from({ length: 50 }, (_, i) => closing("A", T0 + i * MIN, 0.4 + (i % 10) / 100, 0.1));
    const p = thresholdPolicy(none, 0.45, 1, 100);
    expect(p.lostBuys).toBe(0);
    expect(p.lostBuyRateUpper95 as number).toBeGreaterThan(0.05);
    expect(p.lostBuyRateUpper95 as number).toBeLessThan(0.1);
  });

  test("ordem cronológica estável", () => {
    expect(inTimeOrder([rows[3]!, rows[0]!]).map((r) => r.atMs)).toEqual([rows[0]!.atMs, rows[3]!.atMs]);
  });
});

describe("política calibrada walk-forward", () => {
  test("só age depois do aquecimento, usa o limite de Wilson quando nunca viu compra e explora um em N", () => {
    const rows = Array.from({ length: 120 }, (_, i) => closing(`T${i % 4}`, T0 + i * MIN, 0.4 + (i % 20) / 100, 0.1));
    const p = calibratedPolicy(rows, { floor: 0.1, exploreEvery: 5, warmup: 30 }, 1, 100);
    expect(p.dropped).toBeGreaterThan(0);
    // nada é dispensado antes do aquecimento
    const flags = p.flags as boolean[];
    expect(flags.slice(0, 30).every((f) => !f)).toBe(true);
    // a exploração deixa passar parte dos que seriam dispensados
    const explored = thresholdPolicy(rows, 0.99, 1, 100).dropped;
    expect(p.dropped).toBeLessThan(explored);
    expect(p.lostBuys).toBe(0);
  });

  test("com compras observadas ajusta um calibrador e não dispensa o que parece comprável", () => {
    const rows = Array.from({ length: 150 }, (_, i) => {
      const firstP = 0.35 + 0.25 * ((i * 37) % 100) / 100;
      return closing(`T${i % 5}`, T0 + i * MIN, firstP, firstP > 0.5 ? 0.6 : 0.1);
    });
    const p = calibratedPolicy(rows, { floor: 0.2, exploreEvery: 0, warmup: 40 }, 1, 100);
    expect(p.lostBuys).toBeLessThanOrEqual(2);
    expect(p.dropped).toBeGreaterThan(10);
  });
});

describe("política de repetição por token", () => {
  test("depois de um pulo observado, dispensa o mesmo token dentro da janela a menos que a primeira resposta suba", () => {
    const rows = [
      closing("A", T0, 0.5, 0.2),
      closing("A", T0 + 2 * MIN, 0.5, 0.2),
      closing("A", T0 + 4 * MIN, 0.58, 0.2),
      closing("B", T0 + 5 * MIN, 0.5, 0.2),
      closing("A", T0 + 30 * MIN, 0.5, 0.2),
    ];
    const p = repeatPolicy(rows, { cooldownMs: 10 * MIN, riseDelta: 0.05 }, 1, 100);
    expect(p.flags).toEqual([false, true, false, false, false]);
    expect(p.dropped).toBe(1);
    expect(p.lostBuys).toBe(0);
    // um dispensado não reinicia o relógio: o pulo observado de T0 + 4 min é quem vale
    const q = repeatPolicy([closing("A", T0, 0.5, 0.2), closing("A", T0 + 9 * MIN, 0.5, 0.2), closing("A", T0 + 15 * MIN, 0.5, 0.2)], { cooldownMs: 10 * MIN, riseDelta: 0.05 }, 1, 50);
    expect(q.flags).toEqual([false, true, false]);
  });

  test("uma segunda olhada que compra não inicia período de espera", () => {
    const rows = [closing("A", T0, 0.5, BUY_THRESHOLD + 0.1), closing("A", T0 + MIN, 0.5, 0.2)];
    expect(repeatPolicy(rows, { cooldownMs: 10 * MIN, riseDelta: 0.05 }, 1, 50).dropped).toBe(0);
  });
});

describe("custo da fase", () => {
  test("soma por ciclo, mediana de cotação e de modelo e projeção por dia", () => {
    const rows = [
      closing("A", T0, 0.5, 0.2, "cy1"),
      closing("B", T0 + 100, 0.5, 0.2, "cy1"),
      closing("A", T0 + DAY_HALF, 0.5, 0.2, "cy2"),
      closing("C", T0 + DAY_HALF + 1, 0.4, null, "cy3"),
    ];
    const c = phaseCostOf(rows);
    expect(c.cyclesWithClosing).toBe(2);
    expect(c.perCycleMs.p50).toBeGreaterThanOrEqual(1300);
    expect(c.quoteMs.p50).toBe(1000);
    expect(c.modelMs.p50).toBe(300);
    expect(c.totalSecondsObserved).toBeCloseTo(3.9, 12);
    expect(c.spanDays).toBeCloseTo(0.5, 3);
    expect(c.secondsPerDay as number).toBeCloseTo(7.8, 2);
  });

  test("sem fechamentos devolve nulls", () => {
    const c = phaseCostOf([]);
    expect(c.perCycleMs.p50).toBeNull();
    expect(c.spanDays).toBeNull();
    expect(c.secondsPerDay).toBeNull();
  });
});

const DAY_HALF = 12 * 60 * MIN;
