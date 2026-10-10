import { test, expect } from "bun:test";
import { loadConfig } from "./config";

test("configuration is paper by default and credentials alone never enable live", () => {
  expect(loadConfig({}).dryRun).toBe(true);
  expect(loadConfig({ PRIVATE_KEY: "0x" + "1".repeat(64) }).dryRun).toBe(true);
  expect(() => loadConfig({ DRY_RUN: "false" })).toThrow();
});
test("frozen readiness defaults keep the interval, confidence threshold and economic gate; ECONOMIC_GATE=false is the every-block switch", () => {
  const c = loadConfig({});
  expect(c.quoteIntervalBlocks).toBe(100);
  expect(c.minConfidence).toBe(0.65);
  expect(c.economicGate).toBe(true);
  expect(loadConfig({ ECONOMIC_GATE: "false" }).economicGate).toBe(false);
});
test("malformed financial inputs and modes fail closed", () => {
  for (const env of [{ BANKROLL_USD: "NaN" }, { TRADE_SIZE_MON: "-1" }, { MODEL: "other" }, { DRY_RUN: "yes" }])
    expect(() => loadConfig(env)).toThrow();
});
