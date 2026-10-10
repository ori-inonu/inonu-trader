import { expect, test } from "bun:test";
import { makerEconomics } from "./economics";

test("two-leg maker costs reject narrow spreads and invalid estimates", () => {
  const input = { buy: 1.99, sell: 2.01, size: 10, gasMonPerQuote: 0.1, mid: 2, feeBps: 0, inferenceUsd: 0.001, bufferUsd: 0.01 };
  expect(makerEconomics(input).eligible).toBe(false);
  expect(makerEconomics({ ...input, gasMonPerQuote: NaN }).eligible).toBe(false);
  expect(makerEconomics({ ...input, sell: 1.9 }).eligible).toBe(false);
  const viable = makerEconomics({ ...input, gasMonPerQuote: 0.001 });
  expect(viable.eligible).toBe(true);
  expect(viable.netUsd).toBeCloseTo(0.195);
});
