// T6.2 / SMT-3, AC-SMT-2: average cost and distribution of the tracked wallets, from OnchainOS signals and top traders.
// V-CUSTO-1 of flow-engine.md 6. origin: synthetic_fixture, tests only. A cost is a REFERENCE, not a target.
import { describe, expect, test } from "bun:test";
import { smartCost, smartCostProposal } from "./smart-cost";

const signal = (price: string, amountUsd: string, soldRatioPercent: string) => ({ price, amountUsd, soldRatioPercent });

describe("V-CUSTO-1", () => {
  const signals = [signal("2.00", "1000", "10"), signal("2.50", "3000", "50")];

  test("cost = sum(price * amount) / sum(amount) = 2.375, distribution = sum(amount * sold) / sum(amount) = 0.40, strength 0.60", () => {
    const cost = smartCost({ signals, topTraders: [] })!;
    expect(cost.custoSinais).toBeCloseTo(2.375, 10);
    expect(cost.distribuicao).toBeCloseTo(0.4, 10);
    expect(cost.forca).toBeCloseTo(0.6, 10);
    expect(cost.sinaisUsados).toBe(2);
    expect(cost.custoTopTraders).toBeNull();
    expect(cost.corroborado).toBe(false);
  });

  test("without signals there is no cost: null, never zero", () => {
    expect(smartCost({ signals: [], topTraders: [] })).toBeNull();
  });
});

describe("top traders corroborate", () => {
  const signals = [signal("2.00", "1000", "10"), signal("2.50", "3000", "50")];
  const trader = (avgBuyPrice: string, boughtAmount: string, soldAmount: string) => ({ avgBuyPrice, boughtAmount, soldAmount });

  test("their weighted average cost and sold share are reported separately, in their own units", () => {
    const cost = smartCost({ signals, topTraders: [trader("2.40", "100", "30"), trader("2.20", "300", "30")], atr14: 1 })!;
    // (2.4 * 100 + 2.2 * 300) / 400 = 2.25 ; sold = 60 / 400 = 0.15
    expect(cost.custoTopTraders).toBeCloseTo(2.25, 10);
    expect(cost.vendaTopTraders).toBeCloseTo(0.15, 10);
  });

  test("a cost within half an ATR of the signal cost raises the strength by 10%, capped at 1", () => {
    const near = smartCost({ signals, topTraders: [trader("2.30", "100", "0")], atr14: 1 })!; // |2.30 - 2.375| = 0.075 <= 0.5
    expect(near.corroborado).toBe(true);
    expect(near.forca).toBeCloseTo(0.66, 10);
    const far = smartCost({ signals, topTraders: [trader("3.50", "100", "0")], atr14: 1 })!;
    expect(far.corroborado).toBe(false);
    expect(far.forca).toBeCloseTo(0.6, 10);
    const capped = smartCost({ signals: [signal("2", "1000", "0")], topTraders: [trader("2", "100", "0")], atr14: 1 })!;
    expect(capped.forca).toBe(1); // 1.0 * 1.1 is capped
  });

  test("without an ATR no corroboration is claimed", () => {
    expect(smartCost({ signals, topTraders: [trader("2.30", "100", "0")] })!.corroborado).toBe(false);
  });
});

describe("bad rows are dropped and counted, not guessed", () => {
  test("non numeric, non positive and out of range rows do not enter the average", () => {
    const cost = smartCost({
      signals: [signal("2", "1000", "0"), signal("abc", "1000", "0"), signal("2", "-5", "0"), signal("0", "100", "0"), signal("2", "100", "150"), signal("2", "100", "-1")],
      topTraders: [],
    })!;
    expect(cost.sinaisUsados).toBe(1);
    expect(cost.sinaisDescartados).toBe(5);
    expect(cost.custoSinais).toBe(2);
  });

  test("when every row is bad there is no cost", () => {
    expect(smartCost({ signals: [signal("x", "y", "z")], topTraders: [] })).toBeNull();
  });
});

describe("the proposal for the zones engine", () => {
  test("a band of half an ATR around the cost, strength = max(0, 1 - distribution), family E6", () => {
    const cost = smartCost({ signals: [signal("2.00", "1000", "10"), signal("2.50", "3000", "50")], topTraders: [] })!;
    const proposal = smartCostProposal(cost, { price: 3, atr14: 0.4, ts: 1_000 });
    expect(proposal).toMatchObject({ family: "E6", lado: "demanda", ts: 1_000 });
    expect(proposal.baixo).toBeCloseTo(2.175, 10);
    expect(proposal.alto).toBeCloseTo(2.575, 10);
    expect(proposal.forca).toBeCloseTo(0.6, 10);
  });

  test("a cost above the price is described as supply; a fully distributed position has no strength", () => {
    const cost = smartCost({ signals: [signal("5", "100", "100")], topTraders: [] })!;
    const proposal = smartCostProposal(cost, { price: 3, atr14: 1, ts: 0 });
    expect(proposal.lado).toBe("oferta");
    expect(proposal.forca).toBe(0);
  });
});
