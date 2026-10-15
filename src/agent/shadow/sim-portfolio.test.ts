import { describe, expect, test } from "bun:test";
import { applyOrder, equityUsd, newSim, unitizedReturnPct, type SimQuote, type SimState } from "./sim-portfolio";

const quote = (over: Partial<SimQuote> = {}): SimQuote => ({ atMs: 1, out: 1000, networkFeeUsd: 0.01, tradeFeeUsd: 0.02, accountOpenUsd: 0, ...over });
const buy = (usd: number, q: SimQuote | null = quote()) => ({ side: "buy" as const, atMs: 1, id: "TOK", usd, quote: q });
const sell = (qty: number, q: SimQuote | null) => ({ side: "sell" as const, atMs: 2, id: "TOK", qty, quote: q });
const mustApply = (s: SimState, o: Parameters<typeof applyOrder>[1]): SimState => {
  const r = applyOrder(s, o);
  if (!r.ok) throw new Error(`refused by ${r.refusedBy}`);
  return r.state;
};

describe("the simulated portfolio of B applies only what a quote for the size asked allows, and never turns an unknown cost into zero", () => {
  test("a buy spends the notional and the known fees from the cash and receives the quoted quantity", () => {
    const s = mustApply(newSim(100), buy(10));
    expect([s.cashUsd.toFixed(2), s.positions["TOK"]?.qty, s.feesUsd.toFixed(2)]).toEqual(["89.97", 1000, "0.03"]);
  });

  test("a buy without a quote, or with a quote that has no quantity, is refused as sem_cotacao and changes nothing", () => {
    const start = newSim(100);
    const [a, b] = [applyOrder(start, buy(10, null)), applyOrder(start, buy(10, quote({ out: null })))];
    expect([a.ok ? "ok" : a.refusedBy, b.ok ? "ok" : b.refusedBy, b.state.cashUsd, b.state.refused]).toEqual(["sem_cotacao", "sem_cotacao", 100, 1]);
  });

  test("a buy that the cash cannot pay, fees included, is refused by caixa", () => {
    const r = applyOrder(newSim(10), buy(10));
    expect(r.ok ? "ok" : r.refusedBy).toBe("caixa");
  });

  test("a sell of more than the position is refused by posicao, and a sell within it moves the proceeds to the cash", () => {
    const held = mustApply(newSim(100), buy(10));
    const refused = applyOrder(held, sell(2000, quote({ out: 12 })));
    const sold = mustApply(held, sell(500, quote({ out: 6, networkFeeUsd: 0, tradeFeeUsd: 0 })));
    expect([refused.ok ? "ok" : refused.refusedBy, sold.positions["TOK"]?.qty, sold.cashUsd.toFixed(2)]).toEqual(["posicao", 500, "95.97"]);
  });

  test("applying an order does not change the state it was given", () => {
    const start = newSim(100);
    mustApply(start, buy(10));
    expect([start.cashUsd, Object.keys(start.positions).length]).toEqual([100, 0]);
  });

  test("a fee that is unknown is counted as unknown and the return of the run becomes null instead of ignoring the fee", () => {
    const s = mustApply(newSim(100), buy(10, quote({ networkFeeUsd: null })));
    const end = equityUsd(s, { TOK: 0.0102 });
    expect([s.unknownCostOrders, unitizedReturnPct(100, end.usd, s)]).toEqual([1, null]);
  });

  test("equity marks every position, and a position without a mark makes the equity unknown rather than dropping it", () => {
    const s = mustApply(newSim(100), buy(10));
    expect([equityUsd(s, { TOK: 0.011 }).usd?.toFixed(2), equityUsd(s, { TOK: null }).usd, equityUsd(s, { TOK: null }).unmarked]).toEqual(["100.97", null, ["TOK"]]);
  });

  test("the unitized return is the equity change over the start when all costs are known", () => {
    const s = mustApply(newSim(100), buy(10));
    expect(unitizedReturnPct(100, equityUsd(s, { TOK: 0.011 }).usd, s)?.toFixed(2)).toBe("0.97");
  });
});
