import { expect, test } from "bun:test";
import { COST_TABLE as OFFLINE_COST_TABLE, type CostTable } from "../lab/outcomes";
import * as liveCosts from "./live-costs";

test("the runtime cost defaults preserve the complete existing schema and values", () => {
  const compatible: CostTable = liveCosts.COST_TABLE;
  expect(compatible).toEqual(OFFLINE_COST_TABLE);
  expect(compatible).not.toBe(OFFLINE_COST_TABLE);
  expect(Object.keys(liveCosts)).toEqual(["COST_TABLE"]);
});

test("every object in the runtime cost defaults is frozen", () => {
  const compatible: CostTable = liveCosts.COST_TABLE;
  const assertFrozen = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    expect(Object.isFrozen(value)).toBe(true);
    for (const nested of Object.values(value)) assertFrozen(nested);
  };
  assertFrozen(liveCosts.COST_TABLE);
  expect(Reflect.set(liveCosts.COST_TABLE, "notionalUsd", 999)).toBe(false);
  expect(Reflect.set(liveCosts.COST_TABLE.feeTakerBps, "spot", 999)).toBe(false);
  expect(Reflect.set(liveCosts.COST_TABLE.fixedUsdPerRoundTrip, "dex-signal", 0)).toBe(false);
  expect(compatible).toEqual(OFFLINE_COST_TABLE);
});

test("the runtime cost module has no dependency on evaluator fixtures", async () => {
  const source = await Bun.file(new URL("./live-costs.ts", import.meta.url)).text();
  expect(source).not.toMatch(/\b(?:import|require)\b/);
  expect(source).not.toMatch(/\bexport\s+[^;]*\bfrom\b/);
  // The historical schema id is a compatibility value, not a module dependency.
  expect(source.replaceAll('"jev-lab-costs-v1"', '"schema-id"')).not.toMatch(/\blab\b|synthetic/i);
});
