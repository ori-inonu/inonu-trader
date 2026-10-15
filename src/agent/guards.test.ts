import { describe, expect, test } from "bun:test";
import { IMPACT_CAP_PCT, MAX_TAX_PCT } from "./cli";
import { GAS_RESERVE_USD } from "./exit";
import { executionGuards } from "./guards";
import { BUY_COST_STOP_DIVISOR, SLIPPAGE_CAP_PCT } from "./swap-args";

describe("what the code still refuses after the quote of an order, as a fact for the status (ADENDO-D, V2-3)", () => {
  test("the numbers are the very constants the executor uses, so the screen can never say something else than the code does", () => {
    const g = executionGuards();
    expect(g.impactPct).toEqual({ buy: IMPACT_CAP_PCT.buy, sell: IMPACT_CAP_PCT.sell, protecao: IMPACT_CAP_PCT.protecao });
    expect(g.taxPct).toBe(MAX_TAX_PCT);
    expect(g.slippagePct).toEqual({ buy: SLIPPAGE_CAP_PCT.buy, sell: SLIPPAGE_CAP_PCT.sell, protecao: SLIPPAGE_CAP_PCT.protecao });
    expect(g.buyCostShareOfStop).toBe(1 / BUY_COST_STOP_DIVISOR);
    expect(g.nativeReserve).toEqual({ kind: "fixa", usd: GAS_RESERVE_USD });
  });

  test("it is plain data that survives a JSON round trip, with no function and no undefined", () => {
    const g = executionGuards();
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  test("the values today (a change of a constant must be seen here and on the screen): impact 3, 5 and 10, tax 5, slippage 2, 3 and 8, a third of the stop, a fixed reserve of five dollars", () => {
    expect(executionGuards()).toEqual({ impactPct: { buy: 3, sell: 5, protecao: 10 }, taxPct: 5, slippagePct: { buy: 2, sell: 3, protecao: 8 }, buyCostShareOfStop: 1 / 3, nativeReserve: { kind: "fixa", usd: 5 } });
  });
});
