import { test, expect } from "bun:test";
import { SpotLedger } from "./risk";
test("spot inventory is funded and all costs reduce equity", () => {
  const p = new SpotLedger(100, 10, 2, 10);
  expect(p.canFill("sell", 11, 2)).toBe(false);
  p.fill("sell", 5, 3); p.charge("gas", 1); p.charge("ai", 0.5);
  expect(p.snapshot(2).equityUsd).toBeCloseTo(103.485);
  expect(() => p.fill("buy", 1000, 2)).toThrow();
});
test("price changes mark inventory losses and drawdown", () => {
  const p = new SpotLedger(100, 10, 2, 0);
  expect(p.snapshot(1).pnlUsd).toBe(-10);
  expect(p.snapshot(1).maxDrawdownUsd).toBe(10);
});
