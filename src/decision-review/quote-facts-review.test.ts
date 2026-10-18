import { expect, test } from "bun:test";
import { parseQuoteFacts, quoteFactsOf } from "../agent/quote-facts";

test("unsigned quote fee and tax facts reject negative JSON numbers as well as strings", () => {
  for (const value of [-5, "-5"]) {
    const facts = quoteFactsOf({ tradeFee: value, estimateGasFee: value, fromToken: { taxRate: value }, toToken: { taxRate: value } }, 1);
    expect(facts.tradeFee).toBeNull();
    expect(facts.gasEstimate).toBeNull();
    expect(facts.taxFromPct).toBeNull();
    expect(facts.taxToPct).toBeNull();
    expect(facts.present).toEqual(["tradeFee", "gas", "taxFrom", "taxTo"]);
  }
});

test("ledger quote facts cannot restore impossible numbers rejected by the producer", () => {
  const good = quoteFactsOf({}, 1);
  for (const field of ["tradeFee", "gasEstimate", "taxFromPct", "taxToPct"] as const) {
    expect(parseQuoteFacts({ ...good, [field]: -5, present: [field === "gasEstimate" ? "gas" : field === "taxFromPct" ? "taxFrom" : field === "taxToPct" ? "taxTo" : "tradeFee"] })).toBeNull();
  }
  expect(parseQuoteFacts({ ...good, impactPct: 1e10, present: ["impact"] })).toBeNull();
  expect(parseQuoteFacts(quoteFactsOf({ priceImpactPercent: -0.58, tradeFee: 0 }, 1))).not.toBeNull();
});
