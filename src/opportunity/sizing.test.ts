// How much of the balance may go into an opportunity: a ceiling by code and three fractions for the model to choose from. Every number is checked by hand. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { allocate, BUY_SIZES, capFor, FRACTIONS, SIZING, tightestLimit, type SizingInput } from "./sizing";

const base: SizingInput = { portfolioUsd: 10_000, cashOnChainUsd: 4_000, totalCashUsd: 5_000, heldUsd: 0, liquidityUsd: 2_000_000, volume24hUsd: 5_000_000, marked: false, riskPct: null };

describe("the ceiling of one candidate", () => {
  test("is the smallest of cash, risk, liquidity and volume, and says which one it was", () => {
    // risk: 1% of 10,000 over a loss of 0.5 = 200; cash: min(4,000 x 0.8, 5,000 - 2,000) = 3,000; liquidity 20,000; volume 100,000
    expect(capFor(base)).toEqual({ maxUsd: 200, binding: "risco", sharePct: 0.02 });
    // a small pool is the limit: 1% of 30,000
    expect(capFor({ ...base, liquidityUsd: 30_000 })).toEqual({ maxUsd: 200, binding: "risco", sharePct: 0.02 });
    expect(capFor({ ...base, liquidityUsd: 12_000 })).toMatchObject({ maxUsd: 120, binding: "liquidez" });
    expect(capFor({ ...base, volume24hUsd: 5_000 })).toMatchObject({ maxUsd: 100, binding: "volume" });
  });

  test("a mark of care halves the ceiling: the loss assumed on the position is all of it", () => {
    expect(capFor({ ...base, marked: true })).toMatchObject({ maxUsd: 100, binding: "risco" });
  });

  test("what the person already holds of it counts against the ceiling", () => {
    expect(capFor({ ...base, heldUsd: 150 })).toMatchObject({ maxUsd: 50, binding: "risco" });
    expect(capFor({ ...base, heldUsd: 200 })).toEqual({ maxUsd: 0, binding: "minimo", sharePct: 0 });
  });

  test("the share the person accepts to lose replaces the default, within sense", () => {
    expect(capFor({ ...base, riskPct: 0.02 })).toMatchObject({ maxUsd: 400, binding: "risco" });
    // a share that is zero, negative or absurd is not a choice: the default stays
    for (const riskPct of [0, -0.5, 0.9, Number.NaN]) expect(capFor({ ...base, riskPct }).maxUsd).toBe(200);
  });

  test("the cash of the network is the limit when it is small, and the reserve is kept out of the total", () => {
    expect(capFor({ ...base, cashOnChainUsd: 100, totalCashUsd: 5_000 })).toMatchObject({ maxUsd: 80, binding: "caixa" });
    // 2,100 in cash of a 10,000 portfolio: 2,000 is the reserve, 100 is spendable
    expect(capFor({ ...base, cashOnChainUsd: 2_100, totalCashUsd: 2_100 })).toMatchObject({ maxUsd: 100, binding: "caixa" });
    expect(capFor({ ...base, cashOnChainUsd: 1_500, totalCashUsd: 1_500 })).toEqual({ maxUsd: 0, binding: "reserva", sharePct: 0 });
  });

  test("no cash on its network: no size, with the reason", () => {
    expect(capFor({ ...base, cashOnChainUsd: 0 })).toEqual({ maxUsd: 0, binding: "sem_saldo", sharePct: 0 });
  });

  test("under the minimum order it cannot be bought", () => {
    expect(capFor({ ...base, liquidityUsd: 900 })).toEqual({ maxUsd: 0, binding: "minimo", sharePct: 0 });
    expect(capFor({ ...base, liquidityUsd: 1_000 })).toMatchObject({ maxUsd: SIZING.minOrderUsd });
  });

  test("unknown is never plenty: no balance, no portfolio, or a market with no liquidity and no volume figure gets no ceiling", () => {
    expect(capFor({ ...base, portfolioUsd: null }).binding).toBe("sem_dado");
    expect(capFor({ ...base, portfolioUsd: 0 }).binding).toBe("sem_dado");
    expect(capFor({ ...base, cashOnChainUsd: null }).binding).toBe("sem_dado");
    expect(capFor({ ...base, totalCashUsd: null }).binding).toBe("sem_dado");
    expect(capFor({ ...base, liquidityUsd: null, volume24hUsd: null })).toEqual({ maxUsd: 0, binding: "sem_dado", sharePct: null });
    // one of the two figures is enough to bound the order
    expect(capFor({ ...base, liquidityUsd: null, volume24hUsd: 5_000 }).maxUsd).toBe(100);
    expect(capFor({ ...base, volume24hUsd: Number.NaN, liquidityUsd: null }).binding).toBe("sem_dado");
  });
});

describe("a stop the code watches shortens the loss assumed on a clean, deep token", () => {
  // a 125 dollar portfolio with one percent at risk, on a deep and busy pool
  const deep: SizingInput = { ...base, portfolioUsd: 125, cashOnChainUsd: 63, totalCashUsd: 63, riskPct: 0.01, liquidityUsd: 2_000_000, volume24hUsd: 5_000_000 };

  test("without a stop the loss assumed is half of the position: unchanged", () => {
    expect(capFor(deep)).toEqual({ maxUsd: 0, binding: "minimo", sharePct: 0 });
  });

  test("with a stop of six percent the loss assumed is twice the stop, twelve percent: one percent of 125 over 0.12 is about 10 dollars", () => {
    expect(SIZING.stopSizing.gap).toBe(2);
    expect(capFor({ ...deep, stopPct: 6 })).toMatchObject({ maxUsd: 10, binding: "risco" });
    // 4 percent of stop is 8 percent assumed, 15 dollars by risk, held to a tenth of the portfolio (12)
    expect(capFor({ ...deep, stopPct: 4 })).toMatchObject({ maxUsd: 12, binding: "concentracao" });
  });

  test("the loss assumed is never under three percent, however tight the stop: a stop is hit late", () => {
    // 1.5 percent would be 3 percent; 0.5 percent would be 1 percent, which is floored to 3: 0.01 / 0.03 x 125 = 41, so the tenth of the portfolio is what holds it (12)
    const a = capFor({ ...deep, stopPct: 1.5 });
    const b = capFor({ ...deep, stopPct: 0.5 });
    expect(a.maxUsd).toBe(b.maxUsd);
    expect(tightestLimit({ ...deep, stopPct: 1.5 })!.binding).toBe("concentracao");
  });

  test("a shorter assumed loss does not let the position grow without bound: it is held to a tenth of the portfolio, and only when the stop is what sized it", () => {
    expect(SIZING.stopSizing.maxPositionShare).toBe(0.1);
    // 10,000 dollars, one percent of risk over a 3 percent loss would be 3,333; a tenth of the portfolio is 1,000
    const big: SizingInput = { ...base, riskPct: 0.01 };
    expect(capFor({ ...big, stopPct: 1.5 })).toMatchObject({ maxUsd: 1000, binding: "concentracao" });
    // without a stop the old assumption stands and the tenth is not applied (200 by risk)
    expect(capFor(big)).toMatchObject({ maxUsd: 200, binding: "risco" });
    // a mark of care takes the old assumption and no tenth either
    expect(capFor({ ...big, marked: true, stopPct: 1.5 })).toEqual(capFor({ ...big, marked: true }));
  });

  test("a wide stop gives no relief past the old assumption: thirty percent of stop is capped at half", () => {
    expect(capFor({ ...deep, stopPct: 30 })).toEqual(capFor(deep));
  });

  test("a wider gap for a token with little history assumes a bigger loss for the same stop: the same risk buys less of it", () => {
    // 6 percent of stop, twice is 12 percent (10 dollars); three times is 18 percent (6 dollars, under the minimum order)
    expect(capFor({ ...deep, stopPct: 6 })).toMatchObject({ maxUsd: 10 });
    expect(capFor({ ...deep, stopPct: 6, stopGap: 3 })).toEqual({ maxUsd: 0, binding: "minimo", sharePct: 0 });
    expect(tightestLimit({ ...deep, stopPct: 6, stopGap: 3 })!.usd).toBeCloseTo(6.94, 1);
    // a gap smaller than the usual one is not accepted: the gap can only widen
    expect(capFor({ ...deep, stopPct: 6, stopGap: 1 })).toEqual(capFor({ ...deep, stopPct: 6 }));
  });

  test("a mark of care ignores the stop: the loss assumed stays all of the position", () => {
    expect(capFor({ ...deep, marked: true, stopPct: 6 })).toEqual(capFor({ ...deep, marked: true }));
  });

  test("a shallow pool ignores the stop: it is a pool a stop may not get out of", () => {
    expect(SIZING.stopSizing.minLiquidityUsd).toBe(100_000);
    expect(capFor({ ...deep, liquidityUsd: 99_000, stopPct: 6 })).toEqual(capFor({ ...deep, liquidityUsd: 99_000 }));
    expect(capFor({ ...deep, liquidityUsd: 100_000, stopPct: 6 }).maxUsd).toBeGreaterThan(0);
  });

  test("a stop that is not a number, or is out of range, changes nothing", () => {
    for (const stopPct of [Number.NaN, 0, -3, 150, null, undefined]) expect(capFor({ ...deep, stopPct })).toEqual(capFor(deep));
  });

  test("the limit that held it down is named the same way", () => {
    const t = tightestLimit({ ...deep, stopPct: 6 })!;
    expect(t.binding).toBe("risco");
    expect(t.usd).toBeCloseTo(10.41, 1);
  });
});

describe("which limit held a ceiling down, even when it fell under the minimum order", () => {
  // a 130 dollar portfolio with half a percent at risk and half assumed lost: 1.30 dollars, far under the 10 dollar minimum
  const small: SizingInput = { ...base, portfolioUsd: 130, cashOnChainUsd: 63, totalCashUsd: 63, riskPct: 0.005 };

  test("the ceiling is zero with the reason `minimo`, and the smallest limit is named with its dollars", () => {
    expect(capFor(small)).toEqual({ maxUsd: 0, binding: "minimo", sharePct: 0 });
    const t = tightestLimit(small)!;
    expect(t.binding).toBe("risco");
    expect(t.usd).toBeCloseTo(1.3, 6);
  });

  test("another limit can be the one: a tiny pool is tighter than the risk", () => {
    const t = tightestLimit({ ...small, liquidityUsd: 100 })!;
    expect(t.binding).toBe("liquidez");
    expect(t.usd).toBeCloseTo(1, 6);
  });

  test("it agrees with the ceiling when the ceiling is not under the minimum", () => {
    const t = tightestLimit(base)!;
    expect(t.binding).toBe("risco");
    expect(Math.floor(t.usd)).toBe(capFor(base).maxUsd);
  });

  test("where the ceiling has no limits to compare (no data, no cash on the network, the reserve), there is none to name", () => {
    expect(tightestLimit({ ...base, portfolioUsd: null })).toBeNull();
    expect(tightestLimit({ ...base, cashOnChainUsd: 0 })).toBeNull();
    expect(tightestLimit({ ...base, cashOnChainUsd: 1_500, totalCashUsd: 1_500 })).toBeNull();
  });
});

describe("the three sizes", () => {
  test("a third, two thirds and the whole of the ceiling, and nothing else", () => {
    expect(BUY_SIZES).toEqual(["buy_third", "buy_two_thirds", "buy_full"]);
    expect(FRACTIONS.buy_third).toBeCloseTo(1 / 3, 12);
    expect(FRACTIONS.buy_two_thirds).toBeCloseTo(2 / 3, 12);
    expect(FRACTIONS.buy_full).toBe(1);
  });
});

describe("the dollars of the picks", () => {
  const pick = (candidateId: string, chainIndex: string, capUsd: number, size: "buy_third" | "buy_two_thirds" | "buy_full") => ({ candidateId, chainIndex, capUsd, size });

  test("each pick is its fraction of its ceiling, whole dollars", () => {
    const [a, b, c] = allocate([pick("a", "1", 300, "buy_third"), pick("b", "1", 300, "buy_two_thirds"), pick("c", "1", 100, "buy_full")], { "1": 5_000 }, 5_000, 10_000);
    expect([a!.usd, b!.usd, c!.usd]).toEqual([100, 200, 100]);
    expect([a!.scaled, b!.scaled, c!.scaled]).toEqual([false, false, false]);
  });

  test("the cash of a network is spent in rank order, and a pick it cannot cover at the minimum order drops to zero", () => {
    // the network holds 100: 80 may go in one decision, the first pick takes it, the second is left with nothing
    const [first, second] = allocate([pick("a", "1", 100, "buy_full"), pick("b", "1", 100, "buy_full")], { "1": 100 }, 5_000, 10_000);
    expect(first).toMatchObject({ usd: 80, scaled: true });
    expect(second).toMatchObject({ usd: 0, scaled: true });
  });

  test("the networks do not borrow from each other, and the total never passes the cash after its reserve", () => {
    // total cash 2,500 of a 10,000 portfolio: 500 spendable after the 2,000 reserve, even though each network holds plenty
    const out = allocate([pick("a", "1", 400, "buy_full"), pick("b", "56", 400, "buy_full")], { "1": 1_250, "56": 1_250 }, 2_500, 10_000);
    expect(out.map((o) => o.usd)).toEqual([400, 100]);
    expect(out.reduce((s, o) => s + o.usd, 0)).toBeLessThanOrEqual(500);
    // a network with no cash buys nothing
    expect(allocate([pick("a", "137", 400, "buy_full")], { "1": 1_250 }, 1_250, 1_000)[0]!.usd).toBe(0);
  });

  test("no cash and no picks are nothing, not an error", () => {
    expect(allocate([], {}, 0, 0)).toEqual([]);
    expect(allocate([pick("a", "1", 400, "buy_full")], { "1": 0 }, 0, 100)[0]!.usd).toBe(0);
  });
});
