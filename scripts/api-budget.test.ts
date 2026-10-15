import { describe, expect, test } from "bun:test";
import { FREE_PLAN, budgetOf, projectAtInterval, sustainablePerDay } from "./api-budget";

describe("the API budget turns the monthly quota of the plan into daily and per minute numbers and projects a faster cadence without inventing a split", () => {
  test("the free plan of 100 thousand calls in a 31 day month is about 3226 a day and 2.24 a minute", () => {
    const b = budgetOf(FREE_PLAN.basicPerMonth, 31);
    expect([Math.round(b.perDay), b.perMinute.toFixed(2)]).toEqual([3226, "2.24"]);
  });

  test("halving the interval doubles only the part of the use that grows with the looks", () => {
    const p = projectAtInterval({ usedPerDayNow: 3000, intervalNowMin: 2, intervalNewMin: 1, perLookShare: 0.5 });
    expect(p).toBe(4500);
  });

  test("with no part growing with the looks the use does not change, and with all of it growing it doubles", () => {
    const base = { usedPerDayNow: 3000, intervalNowMin: 2, intervalNewMin: 1 } as const;
    expect([projectAtInterval({ ...base, perLookShare: 0 }), projectAtInterval({ ...base, perLookShare: 1 })]).toEqual([3000, 6000]);
  });

  test("what can be spent a day for the rest of the month is what is left of the quota over the days left", () => {
    expect(sustainablePerDay({ capPerMonth: 100_000, usedSoFar: 10_000, daysLeft: 15 })).toBe(6000);
  });
});
