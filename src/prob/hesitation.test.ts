import { describe, expect, test } from "bun:test";
import type { BriefItemRow, ClosingRow } from "./dataset.ts";
import { hesitationOf, secondLookOf } from "./hesitation.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 17, 12);
const STEP = 144_000;

function item(token: string, at: number, pBuy: number, requested: string, margin = 0.3): BriefItemRow {
  return { cycleId: `c${at}`, candidateId: `buy:token:501:${token}`, tokenKey: `501:${token}`, atMs: at, item: {}, offered: ["skip", "buy_tenth"], requested, verdict: { skip: 1 - pBuy, buy_tenth: pBuy }, pBuy, pSkip: 1 - pBuy, pBuyTenth: pBuy, verdictSum: 1, topMargin: margin, facets: null, codeClosed: false, context: null };
}

describe("hesitação entre consultas", () => {
  test("virada de escolha entre consultas seguidas do mesmo candidato", () => {
    // token A: pula, pula, compra, compra, pula (2 viradas em 4 pares); token B: sempre pula
    const rows = [
      item("A", T0, 0.1, "skip"),
      item("A", T0 + STEP, 0.1, "skip"),
      item("A", T0 + 2 * STEP, 0.55, "buy_tenth", 0.05),
      item("A", T0 + 3 * STEP, 0.52, "buy_tenth", 0.02),
      item("A", T0 + 4 * STEP, 0.3, "skip"),
      ...Array.from({ length: 6 }, (_, i) => item("B", T0 + i * STEP, 0.05, "skip")),
    ];
    const h = hesitationOf(rows, 1, 200);
    expect(h.flips.n).toBe(4 + 5);
    expect(h.flips.count).toBe(2);
    expect(h.leansBuy.count).toBe(2);
    expect(h.pBuyNearHalf.count).toBe(2);
    expect(h.closeCall.count).toBe(2);
    expect(h.buyPersistence.n).toBe(2);
    expect(h.buyPersistence.count).toBe(1);
    expect(h.stability.pairs).toBe(9);
    // as duas consultas de compra têm margem 0,05 e 0,02: ambas abaixo de 0,10
    expect(h.buyLeanMargin.n).toBe(2);
    expect(h.buyLeanMargin.below010.count).toBe(2);
    expect(h.buyLeanMargin.p50).toBeCloseTo(0.035, 12);
    expect(h.looks.items).toBe(11);
  });

  test("pares separados por mais de 6 minutos ou do mesmo instante não contam como consultas seguidas", () => {
    const rows = [item("A", T0, 0.1, "skip"), item("A", T0 + 10 * MIN, 0.9, "buy_tenth"), item("A", T0 + 10 * MIN, 0.9, "buy_tenth")];
    expect(hesitationOf(rows, 1, 100).flips.n).toBe(0);
  });

  test("candidatos fechados pelo código e sem probabilidade ficam fora", () => {
    const closed = { ...item("A", T0, 0.5, "skip"), codeClosed: true };
    const none = { ...item("A", T0 + STEP, 0.5, "skip"), pBuy: null, verdict: null };
    const h = hesitationOf([closed, none], 1, 100);
    expect(h.pBuyNearHalf.n).toBe(0);
    expect(h.pBuyNearHalf.share).toBeNull();
    expect(h.pBuyDistribution.p50).toBeNull();
  });

  test("a mesma semente dá o mesmo resultado", () => {
    const rows = Array.from({ length: 40 }, (_, i) => item(`T${i % 5}`, T0 + i * STEP, (i % 10) / 10, i % 7 === 0 ? "buy_tenth" : "skip"));
    expect(hesitationOf(rows, 9, 150)).toEqual(hesitationOf(rows, 9, 150));
  });
});

function closing(token: string, at: number, firstP: number, secondBuy: number | null): ClosingRow {
  return { cycleId: `c${at}`, candidateId: `buy:token:501:${token}`, tokenKey: `501:${token}`, atMs: at, firstP, secondBuy, would: secondBuy === null ? null : secondBuy >= 0.5 ? "buy" : "skip", wouldReason: null, quoted: secondBuy !== null, quoteMs: secondBuy === null ? null : 1000, modelMs: secondBuy === null ? null : 300, spentMs: secondBuy === null ? 0 : 1300, entryCostPct: null, impactPct: null, facets: null, item: null };
}

describe("primeira resposta contra o segundo olhar", () => {
  test("segundo olhar que pula tudo, concentração por token e quase-compras", () => {
    const rows = [
      closing("A", T0, 0.5, 0.2),
      closing("A", T0 + STEP, 0.52, 0.45),
      closing("A", T0 + 2 * STEP, 0.55, 0.1),
      closing("B", T0, 0.41, 0.3),
      closing("B", T0 + STEP, 0.45, null),
    ];
    const s = secondLookOf(rows, 3, 100);
    expect(s.closings).toBe(5);
    expect(s.answered).toBe(4);
    expect(s.secondBuys).toBe(0);
    expect(s.secondSkipsAfterFirstBuy.count).toBe(4);
    expect(s.secondSkipsAfterFirstBuy.wilson?.[0]).toBeGreaterThan(0.4);
    expect(s.topTokenShare).toBeCloseTo(3 / 5, 12);
    expect(s.nearMiss).toBe(1);
    expect(s.firstNearHalf.count).toBe(5);
    expect(s.firstMinusSecondMean).toBeCloseTo((0.3 + 0.07 + 0.45 + 0.11) / 4, 12);
  });

  test("sem fechamentos devolve nulls, não zeros", () => {
    const s = secondLookOf([], 1, 50);
    expect(s.closings).toBe(0);
    expect(s.topTokenShare).toBeNull();
    expect(s.firstP.p50).toBeNull();
    expect(s.spearmanFirstSecond).toBeNull();
  });
});
