import { expect, test } from "bun:test";
import { closingBrief, type ClosingContext } from "../agent/closing";
import { bindEntryQuote } from "./entry-quote";

const NOW = 1_700_000_000_000, FROM = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", TO = "8nnaeWCw8mUypcGAgbmSuzAT85uWx4UN12adDrMhXrGF";
function context(raw: Record<string, unknown> = {}, over: Partial<ClosingContext> = {}): ClosingContext {
  const q = bindEntryQuote({ cycleId: "synthetic", candidateId: `buy:token:501:${TO}`, requestId: "synthetic-quote", chainIndex: "501", fromAddress: FROM, toAddress: TO, fromAmountMinor: "11000000", fromDecimals: 6, toDecimals: 6, startedAtMs: NOW - 2000, receivedAtMs: NOW - 1000 }, {
    chainIndex: "501", swapMode: "exactIn", action: "ok", fromTokenAmount: "11000000", toTokenAmount: "2602337160", priceImpactPercent: "-0.3", tradeFee: "0.0055",
    fromToken: { tokenContractAddress: FROM, decimal: "6", taxRate: "0", isHoneyPot: false }, toToken: { tokenContractAddress: TO, decimal: "6", taxRate: "0", isHoneyPot: false }, ...raw,
  }, NOW, 150_000);
  if (!q.ok) throw Error("fixture_not_bound");
  return { symbol: "SYNTHETIC", sizeUsd: 11, portfolioUsd: 120, liquidityUsd: 600000, profile: "alvo_20", smallest: true, first: { pBuy: 0.62, facets: {} }, quote: q.value, quoteFailure: null, exec: null, nowMs: NOW, ...over };
}

test("a closing ages its quote at the time of the new decision, including time spent on other candidates", () => {
  expect(closingBrief(context({}, { nowMs: NOW + 20_000 })).cot?.idade).toBe(22);
});

test("a real-sized small network fee is not rounded into a false zero", () => {
  const fee = 0.0005206, cot = closingBrief(context({ tradeFee: String(fee) })).cot;
  expect(cot?.taxa).toBeGreaterThan(0);
  expect(cot!.taxa!).toBeCloseTo(fee / 11 * 100, 6);
});

test("a favorable signed quote value difference is not counted as an adverse entry cost", () => {
  const cot = closingBrief(context({ priceImpactPercent: "2" })).cot!;
  expect(cot.imp).toBe(2);
  expect(cot.entra).not.toBeNull();
  expect(cot.entra!).toBeLessThanOrEqual(cot.taxa!);
});
