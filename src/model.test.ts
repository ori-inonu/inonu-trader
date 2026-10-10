import { test, expect } from "bun:test";
import { validateDecision } from "./model";
test("hold is valid and malformed decisions fail closed", () => {
  expect(validateDecision({ action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, upIn10: 0.5, latencyMs: 1, inputTokens: 0 }).action).toBe("hold");
  expect(() => validateDecision({ action: "other", probabilities: { buy: 1, sell: 0, hold: 0 }, upIn10: 1, latencyMs: 1, inputTokens: 0 } as any)).toThrow();
  expect(() => validateDecision({ action: "buy", probabilities: { buy: NaN, sell: 0, hold: 0 }, upIn10: 1, latencyMs: 1, inputTokens: 0 })).toThrow();
});
