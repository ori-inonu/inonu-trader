import { test, expect } from "bun:test";
import { loadConfig } from "./config";

test("configuration is paper by default and credentials alone never enable live", () => {
  expect(loadConfig({}).dryRun).toBe(true);
  expect(loadConfig({ PRIVATE_KEY: "0x" + "1".repeat(64) }).dryRun).toBe(true);
  expect(() => loadConfig({ DRY_RUN: "false" })).toThrow();
});
test("malformed financial inputs and modes fail closed", () => {
  for (const env of [{ BANKROLL_USD: "NaN" }, { TRADE_SIZE_MON: "-1" }, { MODEL: "other" }, { DRY_RUN: "yes" }])
    expect(() => loadConfig(env)).toThrow();
});
