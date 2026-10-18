import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { JEV_PRICE, consultCostUsd, sumCostUsd, type Price } from "./api-cost";

describe("what a decision costs in model fees", () => {
  test("the price is the one TypeSafe publishes, with where it comes from", () => {
    expect(JEV_PRICE).toMatchObject({ model: "jev-1.13.0", inputUsdPerMtok: 0.042, outputUsdPerMtok: 0 });
    expect(JEV_PRICE.source).toContain("docs.typesafe.ai/models");
    expect(JEV_PRICE.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("ten thousand input tokens cost a few hundredths of a cent", () => {
    expect(consultCostUsd({ inputTokens: 10_000, outputTokens: 300 })).toBeCloseTo(0.00042, 9);
  });

  test("output tokens are free at this price, so not knowing them costs nothing to know", () => {
    expect(consultCostUsd({ inputTokens: 10_000, outputTokens: null })).toBeCloseTo(0.00042, 9);
  });

  test("not knowing the input tokens is not knowing the cost, never zero", () => {
    expect(consultCostUsd({ inputTokens: null, outputTokens: 300 })).toBeNull();
  });

  test("a price that charges for output needs the output tokens", () => {
    const paid: Price = { ...JEV_PRICE, outputUsdPerMtok: 1 };
    expect(consultCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, paid)).toBeCloseTo(1.042, 9);
    expect(consultCostUsd({ inputTokens: 1_000_000, outputTokens: null }, paid)).toBeNull();
  });

  test("a count that is not a count is not a cost", () => {
    for (const inputTokens of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) expect(consultCostUsd({ inputTokens, outputTokens: 0 })).toBeNull();
  });

  test("the sum says how many of its parts it could not know", () => {
    const s = sumCostUsd([0.001, null, 0.002, null, null]);
    expect(s.usd).toBeCloseTo(0.003, 9);
    expect(s.unknown).toBe(3);
    expect(sumCostUsd([])).toEqual({ usd: 0, unknown: 0 });
  });

  test("a day of a decision every minute costs well under a dollar, and a five dollar balance lasts for thousands", () => {
    const perDecision = consultCostUsd({ inputTokens: 10_000, outputTokens: 0 })!;
    expect(perDecision * 1440).toBeLessThan(1);
    expect(5 / perDecision).toBeGreaterThan(10_000);
  });
});

describe("the module has no way to act", () => {
  test("it computes and returns: no network, disk, clock, process or model", () => {
    const source = readFileSync(new URL("./api-cost.ts", import.meta.url), "utf8");
    for (const token of ["node:", "fetch(", "Bun.", "process.", "Date.now", "Math.random", "setTimeout", "import(", "require("]) expect(source.includes(token)).toBe(false);
    expect(/^import /m.test(source)).toBe(false);
  });
});
