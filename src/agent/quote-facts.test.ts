import { describe, expect, test } from "bun:test";
import { parseQuoteFacts, quoteFactsOf } from "./quote-facts";

// the structure of a real `swap quote` record (observed 2026-10-14, values invented): an allowlist of numbers and codes is read from it, nothing else
const real = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  action: "ok", chainIndex: "501", contextSlot: 456919877, estimateGasFee: "5000", fromTokenAmount: "12000000", mode: "dex", priceImpactPercent: "-0.58", quoteId: "q-123", reason: "", router: "r".repeat(135), signData: null,
  swapMode: "exactIn", toTokenAmount: "110034676384", tradeFee: "0.0005238",
  fromToken: { decimal: "6", isHoneyPot: false, taxRate: "0", tokenContractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  toToken: { decimal: "6", isHoneyPot: false, taxRate: "0.015", tokenContractAddress: "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx" },
  ...over,
});

describe("what is kept of a quote", () => {
  test("only an allowlist of numbers and codes, with the hour it was read and the units of the provider contract: the fee in USD, the gas in native minor units, the tax as a percent", () => {
    const facts = quoteFactsOf(real(), 1_700_000_000_000);
    expect(facts).toEqual({
      atMs: 1_700_000_000_000, action: "ok", impactPct: -0.58, tradeFee: 0.0005238, gasEstimate: 5000, slot: 456919877, taxFromPct: 0, taxToPct: 1.5,
      fromAmountMinor: "12000000", toAmountMinor: "110034676384", feeUnit: "usd", gasUnit: "native_minor",
      present: ["impact", "tradeFee", "gas", "slot", "taxFrom", "taxTo", "fromAmount", "toAmount"],
    });
    // nothing of the free text or of the route: no router, no quote id, no addresses, no sign data
    const text = JSON.stringify(facts);
    for (const outside of ["router", "q-123", "signData", "EPjF", "6GmA", "exactIn"]) expect(text).not.toContain(outside);
  });

  test("a field the quote did not carry is absent, never zero; one it carried and could not be read is present and null", () => {
    const facts = quoteFactsOf(real({ tradeFee: undefined, estimateGasFee: "5e-3", contextSlot: "not a slot", fromToken: { taxRate: "" } }), 5);
    expect(facts.tradeFee).toBeNull();
    expect(facts.gasEstimate).toBeNull();
    expect(facts.slot).toBeNull();
    expect(facts.taxFromPct).toBeNull();
    expect(facts.present).not.toContain("tradeFee");
    expect(facts.present).toContain("gas");
    expect(facts.present).toContain("slot");
    expect(facts.present).not.toContain("taxFrom");
  });

  test("a code outside the allowlist, a number out of any sane range, an amount that is not digits: nothing is invented from them", () => {
    const facts = quoteFactsOf(real({ action: "do whatever", priceImpactPercent: "1e9", fromTokenAmount: "12 USDC", toTokenAmount: "9".repeat(60) }), 5);
    expect(facts.action).toBeNull();
    expect(facts.impactPct).toBeNull();
    expect(facts.fromAmountMinor).toBeNull();
    expect(facts.toAmountMinor).toBeNull();
  });

  test("a record that is not even a quote has no facts but the hour: every field null and none present", () => {
    expect(quoteFactsOf({}, 7)).toEqual({ atMs: 7, action: null, impactPct: null, tradeFee: null, gasEstimate: null, slot: null, taxFromPct: null, taxToPct: null, fromAmountMinor: null, toAmountMinor: null, feeUnit: "usd", gasUnit: "native_minor", present: [] });
  });
});

describe("reading the facts back from the ledger", () => {
  test("what was written is read back as it was", () => {
    const facts = quoteFactsOf(real(), 9);
    expect(parseQuoteFacts(JSON.parse(JSON.stringify(facts)))).toEqual(facts);
  });

  test("anything else is nothing: an extra key, a wrong type, a unit that is not the contract one, a field listed twice", () => {
    const good = JSON.parse(JSON.stringify(quoteFactsOf(real(), 9))) as Record<string, unknown>;
    for (const bad of [{ ...good, extra: 1 }, { ...good, impactPct: "0.4" }, { ...good, feeUnit: "desconhecida" }, { ...good, gasUnit: "usd" }, { ...good, present: ["impact", "impact"] }, { ...good, present: ["router"] }, { ...good, atMs: -1 }, { ...good, action: "go" }, null, [], "x"]) {
      expect(parseQuoteFacts(bad)).toBeNull();
    }
  });
});

describe("one range rule for what is read from a quote and what is read back", () => {
  test("fees and taxes are never negative, as numbers or as text; the impact is signed and bounded", () => {
    const facts = quoteFactsOf(real({ tradeFee: -1, estimateGasFee: "-1", fromToken: { taxRate: -2 }, toToken: { taxRate: "-2" }, priceImpactPercent: -0.58 }), 1);
    expect([facts.tradeFee, facts.gasEstimate, facts.taxFromPct, facts.taxToPct, facts.impactPct]).toEqual([null, null, null, null, -0.58]);
    expect(quoteFactsOf(real({ tradeFee: 0 }), 1).tradeFee).toBe(0);
    expect(quoteFactsOf(real({ priceImpactPercent: -1e10 }), 1).impactPct).toBeNull();
  });

  test("the ledger cannot restore a number the reader would have rejected", () => {
    const good = JSON.parse(JSON.stringify(quoteFactsOf(real(), 1))) as Record<string, unknown>;
    for (const field of ["tradeFee", "gasEstimate", "taxFromPct", "taxToPct"]) expect(parseQuoteFacts({ ...good, [field]: -0.1 })).toBeNull();
    expect(parseQuoteFacts({ ...good, impactPct: -1e10 })).toBeNull();
    expect(parseQuoteFacts({ ...good, impactPct: -0.58, tradeFee: 0 })).not.toBeNull();
  });
});
