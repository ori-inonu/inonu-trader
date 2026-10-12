import { expect, test } from "bun:test";
import { loadOperatorConfig } from "./config";

// Settings that are whole numbers by nature: a fraction used to pass the loader and only failed inside
// validateOperatorPolicy on every cycle (R10 B3). Each row has a valid sample and a fractional one.
const WHOLE_NUMBER_SETTINGS: { key: string; valid: string; fractional: string; read: (config: ReturnType<typeof loadOperatorConfig>) => number }[] = [
  { key: "OPERATOR_PLAN_TTL_MS", valid: "30000", fractional: "30000.5", read: (config) => config.policy.planTtlMs },
  { key: "OPERATOR_EXIT_WINDOW_MS", valid: "60000", fractional: "1.5", read: (config) => config.policy.exitWindowMs },
  { key: "OPERATOR_STALE_LEG_MS", valid: "900000", fractional: "900000.5", read: (config) => config.policy.staleLegMs },
  { key: "OPERATOR_MAX_QUOTE_AGE_MS", valid: "15000", fractional: "15000.5", read: (config) => config.policy.maxQuoteAgeMs },
  { key: "OPERATOR_COOLDOWN_MS", valid: "120000", fractional: "120000.5", read: (config) => config.policy.cooldownMs },
  { key: "OPERATOR_MAX_GAS_LIMIT", valid: "1000000", fractional: "1000000.5", read: (config) => config.policy.maxGasLimit },
  { key: "OPERATOR_MAX_DAILY_PLANS", valid: "10", fractional: "10.5", read: (config) => config.policy.maxDailyPlans },
];

test("whole-number settings reject a fraction at load time and keep accepting whole numbers", () => {
  for (const { key, valid, fractional, read } of WHOLE_NUMBER_SETTINGS) {
    expect(() => loadOperatorConfig({ [key]: fractional })).toThrow(`Invalid ${key}`);
    expect(read(loadOperatorConfig({ [key]: valid }))).toBe(Number(valid));
  }
});

test("the exit window in particular: 1.5 is refused by the loader, 0 stays the default and 60000 is accepted", () => {
  expect(() => loadOperatorConfig({ OPERATOR_EXIT_WINDOW_MS: "1.5" })).toThrow("Invalid OPERATOR_EXIT_WINDOW_MS");
  expect(loadOperatorConfig({}).policy.exitWindowMs).toBe(0);
  expect(loadOperatorConfig({ OPERATOR_EXIT_WINDOW_MS: "60000" }).policy.exitWindowMs).toBe(60_000);
});

test("whole-number settings keep their bounds and defaults", () => {
  expect(() => loadOperatorConfig({ OPERATOR_PLAN_TTL_MS: "0" })).toThrow("Invalid OPERATOR_PLAN_TTL_MS");
  expect(() => loadOperatorConfig({ OPERATOR_PLAN_TTL_MS: "600001" })).toThrow("Invalid OPERATOR_PLAN_TTL_MS");
  expect(() => loadOperatorConfig({ OPERATOR_EXIT_WINDOW_MS: "-1" })).toThrow("Invalid OPERATOR_EXIT_WINDOW_MS");
  expect(() => loadOperatorConfig({ OPERATOR_MAX_GAS_LIMIT: "20999" })).toThrow("Invalid OPERATOR_MAX_GAS_LIMIT");
  expect(() => loadOperatorConfig({ OPERATOR_MAX_DAILY_PLANS: "0" })).toThrow("Invalid OPERATOR_MAX_DAILY_PLANS");
  expect(() => loadOperatorConfig({ OPERATOR_MAX_DAILY_PLANS: "25" })).toThrow("Invalid OPERATOR_MAX_DAILY_PLANS");
  expect(() => loadOperatorConfig({ OPERATOR_COOLDOWN_MS: "59999" })).toThrow("Invalid OPERATOR_COOLDOWN_MS");
  expect(() => loadOperatorConfig({ OPERATOR_STALE_LEG_MS: "" })).toThrow("Invalid OPERATOR_STALE_LEG_MS");
  expect(() => loadOperatorConfig({ OPERATOR_MAX_QUOTE_AGE_MS: "Infinity" })).toThrow("Invalid OPERATOR_MAX_QUOTE_AGE_MS");
  const defaults = loadOperatorConfig({}).policy;
  expect([defaults.planTtlMs, defaults.exitWindowMs, defaults.staleLegMs, defaults.maxQuoteAgeMs, defaults.cooldownMs, defaults.maxGasLimit, defaults.maxDailyPlans])
    .toEqual([30_000, 0, 900_000, 15_000, 900_000, 1_000_000, 4]);
});

test("settings that may be fractional stay fractional", () => {
  const policy = loadOperatorConfig({ OPERATOR_MAX_PLAN_USD: "2.5", OPERATOR_MAX_CAPITAL_FRACTION: "0.125", OPERATOR_MIN_NET_USD: "0.075", OPERATOR_MAX_FEE_GWEI: "0.5" }).policy;
  expect([policy.maxPlanUsd, policy.maxCapitalFraction, policy.minNetUsd, policy.maxFeeGwei]).toEqual([2.5, 0.125, 0.075, 0.5]);
});
