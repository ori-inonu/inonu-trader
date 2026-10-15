import { describe, expect, test } from "bun:test";
import { exitStancesOffered, halfDone, halfProgress, protectiveSellPlan, sellPlan } from "./exit";
import type { OrderRecord } from "./ledger";
import type { Position } from "./types";

const position = (over: Partial<Position> = {}): Position => ({
  id: "token:1:0x1111111111111111111111111111111111111111",
  chainIndex: "1",
  address: "0x1111111111111111111111111111111111111111",
  symbol: "AAA",
  wallet: "agente",
  usd: 90,
  balanceMinor: "1000000000000000000",
  decimals: 18,
  isCash: false,
  ...over,
});

describe("the dollars of a sale follow the raw amount that is really sent", () => {
  test("when the fraction does not divide the balance the amount is cut to whole units and the dollars follow it, not the plain fraction: with 5 units a third is 1 unit, a fifth of the position", () => {
    const few = position({ balanceMinor: "5", decimals: 0, usd: 50 });
    expect(sellPlan(few, "trim_third")).toEqual({ amountMinor: "1", usd: 10 });
    expect(sellPlan(few, "trim_half")).toEqual({ amountMinor: "2", usd: 20 });
    expect(protectiveSellPlan(few, "trim_half")).toEqual({ amountMinor: "2", usd: 20 });
    expect(sellPlan(few, "exit_all")).toEqual({ amountMinor: "5", usd: 50 });
  });

  test("when it divides exactly the plain fraction is kept, to the cent", () => {
    expect(sellPlan(position({ balanceMinor: "6", decimals: 0, usd: 60 }), "trim_third")).toEqual({ amountMinor: "2", usd: 20 });
    expect(protectiveSellPlan(position({ balanceMinor: "4", decimals: 0, usd: 80 }), "trim_half")).toEqual({ amountMinor: "2", usd: 40 });
  });
});

describe("the native coin pays the fee of every transaction: a reserve of it never leaves", () => {
  const native = (over: Partial<Position> = {}): Position => position({ id: "token:1:native", address: "native", symbol: "ETH", usd: 100, balanceMinor: "1000000000000000000", ...over });

  test("selling everything of it sells all but the reserve, in the token's own units", () => {
    // 100 dollars of it, 5 stay: 5 percent of the balance
    expect(sellPlan(native(), "exit_all")).toEqual({ amountMinor: "950000000000000000", usd: 95 });
  });

  test("a trim that would dig into the reserve is cut to what leaves the reserve whole", () => {
    // there is no minimum order: half of 12 dollars is 6 and leaves 6, fine; half of 20 is 10 and leaves 10
    expect(sellPlan(native({ usd: 12, balanceMinor: "1200000000000000000" }), "trim_half")).toEqual({ amountMinor: "600000000000000000", usd: 6 });
    expect(sellPlan(native({ usd: 20, balanceMinor: "2000000000000000000" }), "trim_half")).toEqual({ amountMinor: "1000000000000000000", usd: 10 });
    // everything of 16 dollars is cut to 11, and 5 stay; of 14 it is cut to 9, and 5 stay
    expect(sellPlan(native({ usd: 16, balanceMinor: "1600000000000000000" }), "exit_all")).toEqual({ amountMinor: "1100000000000000000", usd: 11 });
    expect(sellPlan(native({ usd: 14, balanceMinor: "1400000000000000000" }), "exit_all")).toEqual({ amountMinor: "900000000000000000", usd: 9 });
  });

  test("a coin worth no more than the reserve, or of unknown value, does not leave at all, and the model is not offered a sale of it", () => {
    expect(sellPlan(native({ usd: 5 }), "exit_all")).toBeNull();
    expect(exitStancesOffered(native({ usd: 5 }))).toEqual(["hold"]);
    expect(protectiveSellPlan(native({ usd: null }), "exit_all")).toBeNull();
    expect(protectiveSellPlan(native({ usd: 5 }), "exit_all")).toBeNull();
  });

  test("the plan's protective exit of it also leaves the reserve", () => {
    expect(protectiveSellPlan(native(), "exit_all")).toEqual({ amountMinor: "950000000000000000", usd: 95 });
    expect(protectiveSellPlan(native(), "trim_half")).toEqual({ amountMinor: "500000000000000000", usd: 50 });
  });

  test("any other token is sold whole, as before", () => {
    expect(sellPlan(position(), "exit_all")).toEqual({ amountMinor: "1000000000000000000", usd: 90 });
  });
});

describe("the amount to sell is the code's, in whole minor units, rounded down", () => {
  test("a third of a round balance leaves the remainder in the wallet", () => {
    expect(sellPlan(position(), "trim_third")).toEqual({ amountMinor: "333333333333333333", usd: 30 });
  });

  test("half and all", () => {
    expect(sellPlan(position(), "trim_half")).toEqual({ amountMinor: "500000000000000000", usd: 45 });
    expect(sellPlan(position(), "exit_all")).toEqual({ amountMinor: "1000000000000000000", usd: 90 });
  });

  test("dollars are exact, to the fraction, and never exceed the position: there is no rounding to the dollar", () => {
    expect(sellPlan(position({ usd: 95 }), "trim_third")?.usd).toBeCloseTo(31.6666667, 6);
    expect(sellPlan(position({ usd: 95.99 }), "exit_all")?.usd).toBe(95.99);
    expect(sellPlan(position({ usd: 95 }), "trim_third")!.usd).toBeLessThanOrEqual(95);
  });

  test("balances beyond 2^53 do not lose digits", () => {
    const big = "123456789012345678901234567890";
    expect(sellPlan(position({ balanceMinor: big }), "trim_half")?.amountMinor).toBe("61728394506172839450617283945");
    expect(sellPlan(position({ balanceMinor: big }), "exit_all")?.amountMinor).toBe(big);
  });

  test("exit_all is exactly the balance, whatever it is", () => {
    expect(sellPlan(position({ balanceMinor: "7" , usd: 50 }), "exit_all")?.amountMinor).toBe("7");
  });

  test("a trim that rounds to zero units is not an order", () => {
    expect(sellPlan(position({ balanceMinor: "2", usd: 50 }), "trim_third")).toBeNull();
  });
});

describe("what cannot be sold exactly is never sold", () => {
  test("unknown or malformed balance", () => {
    expect(sellPlan(position({ balanceMinor: null }), "exit_all")).toBeNull();
    expect(sellPlan(position({ balanceMinor: "" }), "exit_all")).toBeNull();
    expect(sellPlan(position({ balanceMinor: "0" }), "exit_all")).toBeNull();
    expect(sellPlan(position({ balanceMinor: "-5" }), "exit_all")).toBeNull();
    expect(sellPlan(position({ balanceMinor: "1.5" }), "exit_all")).toBeNull();
    expect(sellPlan(position({ balanceMinor: "0x10" }), "exit_all")).toBeNull();
    expect(sellPlan(position({ balanceMinor: "007" }), "exit_all")).toBeNull();
  });

  test("an unknown or not-positive value is no sale, and a small one is: there is no minimum order", () => {
    expect(sellPlan(position({ usd: null }), "exit_all")).toBeNull();
    expect(sellPlan(position({ usd: Number.NaN }), "exit_all")).toBeNull();
    expect(sellPlan(position({ usd: 0 }), "exit_all")).toBeNull();
    expect(sellPlan(position({ usd: 9.99 }), "exit_all")?.usd).toBe(9.99);
    expect(sellPlan(position({ usd: 0.5 }), "exit_all")?.usd).toBe(0.5);
  });

  test("cash is never a position to manage", () => {
    expect(sellPlan(position({ isCash: true }), "exit_all")).toBeNull();
  });
});

describe("the stances offered for a holding", () => {
  test("hold is always there; each trim only when it makes an order", () => {
    expect(exitStancesOffered(position())).toEqual(["hold", "trim_third", "trim_half", "exit_all"]);
    // no minimum order: every trim of a position that has a value is offered, however small
    expect(exitStancesOffered(position({ usd: 25 }))).toEqual(["hold", "trim_third", "trim_half", "exit_all"]);
    expect(exitStancesOffered(position({ usd: 3 }))).toEqual(["hold", "trim_third", "trim_half", "exit_all"]);
    expect(exitStancesOffered(position({ usd: 0 }))).toEqual(["hold"]);
    expect(exitStancesOffered(position({ balanceMinor: null }))).toEqual(["hold"]);
  });
});

describe("a sale is made only from a balance whose two forms agree", () => {
  test("no decimals, no sale: the raw amount is not known to be the balance", () => {
    expect(sellPlan(position({ decimals: null }), "exit_all")).toBeNull();
    expect(sellPlan(position({ decimals: null }), "trim_half")).toBeNull();
    expect(exitStancesOffered(position({ decimals: null }))).toEqual(["hold"]);
    expect(sellPlan(position({ decimals: 18 }), "exit_all")).not.toBeNull();
  });
});

describe("the half at the target is a fixed amount, counted only in what a receipt confirmed (A1.10)", () => {
  const KEY = "1:0x1111111111111111111111111111111111111111";
  const rec = (over: Partial<OrderRecord> = {}): OrderRecord => ({ kind: "order", cycleId: "c", atMs: 1000, orderKey: "c:hold", stage: "executada", candidateId: "hold", side: "sell", stance: "trim_half", chainIndex: "1", symbol: "AAA", address: "0x1111111111111111111111111111111111111111", wallet: "agente", usd: 40, amountMinor: "391666666666666666", ref: "0x", reason: null, profile: null, source: "protecao", balanceBeforeMinor: "1000000000000000000", ...over });

  test("the target is half of what the wallet held when the FIRST part went out, and only confirmed parts are counted", () => {
    const p = halfProgress([rec()], KEY, 0)!;
    expect(p.targetMinor).toBe(500000000000000000n);
    expect(p.soldMinor).toBe(391666666666666666n);
    // a second part, still in flight: it holds the token, it is not counted as sold
    const two = halfProgress([rec(), rec({ orderKey: "c2:hold", atMs: 2000, stage: "incerta", amountMinor: "100000000000000000", balanceBeforeMinor: "608333333333333334" })], KEY, 0)!;
    expect(two.targetMinor).toBe(500000000000000000n);
    expect(two.soldMinor).toBe(391666666666666666n);
  });

  test("a part that failed cleanly sold nothing and, when it was the only one, there is no target yet: the half is worked out afresh", () => {
    expect(halfProgress([rec({ stage: "falhou" })], KEY, 0)).toBeNull();
    expect(halfProgress([rec({ stage: "preparada" })], KEY, 0)).toBeNull();
    // the target comes from the first part that really went (or may have), not from the failed one before it
    const p = halfProgress([rec({ stage: "falhou", balanceBeforeMinor: "9000000000000000000" }), rec({ orderKey: "c3:hold", atMs: 3000 })], KEY, 0)!;
    expect(p.targetMinor).toBe(500000000000000000n);
  });

  test("orders of another token, of the model, of a buy, of another wallet, or from before the plan existed are not the plan's half", () => {
    const others = [rec({ address: "0x2222222222222222222222222222222222222222" }), rec({ source: "modelo" }), rec({ side: "buy" }), rec({ wallet: "principal" }), rec({ stance: "exit_all" }), rec({ atMs: 500 })];
    expect(halfProgress(others, KEY, 1000)).toBeNull();
  });

  test("done means what was confirmed reached the target; with no balance on record the old reading holds (any confirmed half was the half)", () => {
    expect(halfDone([rec()], KEY, 0)).toBe(false);
    expect(halfDone([rec({ amountMinor: "500000000000000000" })], KEY, 0)).toBe(true);
    expect(halfDone([rec(), rec({ orderKey: "c2:hold", atMs: 2000, amountMinor: "108333333333333334", balanceBeforeMinor: "608333333333333334" })], KEY, 0)).toBe(true);
    expect(halfDone([rec({ balanceBeforeMinor: null })], KEY, 0)).toBe(true);
    expect(halfDone([rec({ balanceBeforeMinor: undefined })], KEY, 0)).toBe(true);
  });
});
