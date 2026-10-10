import { expect, test } from "bun:test";
import { createOperatorLedger, emptyLedger, parseLedger, type CumulativeLimits } from "./ledger";

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const limits: CumulativeLimits = { maxDailyNotionalUsd: 100, maxDailyPlans: 3, cooldownMs: 60_000, killSwitchPath: "data/operator/STOP", staleLegMs: 900_000, maxDailyLossUsd: 2 };

test("ledger enforces idempotency, daily caps, cooldown, kill switch and open legs across restarts", () => {
  const saved: string[] = [];
  const ledger = createOperatorLedger(emptyLedger(), (state) => saved.push(JSON.stringify(state)));
  const input = { idempotencyKey: "k1", pairKey: "196:USDT/OKB", sizeUsd: 25, nowMs: NOW, killSwitchExists: false };
  expect(ledger.checkBeforeExecute(input, limits)).toEqual([]);
  expect(ledger.checkBeforeExecute({ ...input, killSwitchExists: true }, limits)).toEqual(["kill_switch_present"]);
  ledger.recordExecution({ idempotencyKey: "k1", sizeUsd: 25, nowMs: NOW, leg: { planId: "p1", candidateId: "c", pairKey: "196:USDT/OKB", chainIndex: "196", openedAtMs: NOW, txHash: "0x1", intermediateAtomic: "1", status: "leg1_sent", closeTxHash: null, note: null } });
  expect(ledger.checkBeforeExecute({ ...input, nowMs: NOW + 1_000 }, limits)).toEqual(["idempotency_key_already_executed", "cooldown_active", "open_leg_on_pair"]);
  expect(ledger.checkBeforeExecute({ ...input, idempotencyKey: "k2", pairKey: "143:USDC/MON", nowMs: NOW + 61_000, sizeUsd: 80 }, limits)).toEqual(["daily_notional_cap"]);
  ledger.updateLeg("p1", { status: "closed" });
  expect(ledger.openLegs()).toHaveLength(0);
  ledger.recordExecution({ idempotencyKey: "k2", sizeUsd: 25, nowMs: NOW + 61_000, leg: null });
  ledger.recordExecution({ idempotencyKey: "k3", sizeUsd: 25, nowMs: NOW + 122_000, leg: null });
  expect(ledger.checkBeforeExecute({ ...input, idempotencyKey: "k4", pairKey: "x", nowMs: NOW + 190_000 }, limits)).toEqual(["daily_plan_cap"]);
  expect(ledger.checkBeforeExecute({ ...input, idempotencyKey: "k4", pairKey: "x", nowMs: NOW + 86_400_000 + 190_000 }, limits)).toEqual([]);

  const restored = createOperatorLedger(parseLedger(JSON.parse(saved.at(-1)!)), () => {});
  expect(restored.checkBeforeExecute({ ...input, nowMs: NOW + 86_400_000 }, limits)).toEqual(["idempotency_key_already_executed"]);
  expect(() => parseLedger({ version: 2 })).toThrow("Corrupt operator ledger");
});

test("reconciled losses accumulate per day and stop further execution at the daily loss cap", () => {
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  ledger.recordRealized(NOW, -1.5);
  ledger.recordRealized(NOW + 1_000, 0.25);
  expect(ledger.dayRealizedUsd(NOW)).toBeCloseTo(-1.25, 9);
  const input = { idempotencyKey: "k", pairKey: "p", sizeUsd: 1, nowMs: NOW + 2_000, killSwitchExists: false };
  expect(ledger.checkBeforeExecute(input, limits)).toEqual([]);
  ledger.recordRealized(NOW + 3_000, -0.75);
  expect(ledger.checkBeforeExecute({ ...input, nowMs: NOW + 4_000 }, limits)).toEqual(["daily_loss_stop"]);
  expect(ledger.checkBeforeExecute({ ...input, nowMs: NOW + 86_400_000 }, limits)).toEqual([]);
  expect(() => ledger.recordRealized(NOW, Number.NaN)).toThrow("Invalid realized result");
  expect(parseLedger({ version: 1, executedKeys: [], dailyNotionalUsd: {}, dailyPlans: {}, openLegs: [], lastExecutionAtMs: null }).dailyRealizedUsd).toEqual({});
});

test("failed or stale legs block every new plan until reconciled", () => {
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 1, nowMs: NOW, leg: { planId: "p", candidateId: "c", pairKey: "a", chainIndex: "196", openedAtMs: NOW, txHash: "0x", intermediateAtomic: "1", status: "failed", closeTxHash: null, note: "leg2_reverted" } });
  const input = { idempotencyKey: "other", pairKey: "b", sizeUsd: 1, nowMs: NOW + 120_000, killSwitchExists: false };
  expect(ledger.checkBeforeExecute(input, limits)).toEqual(["failed_leg_requires_manual_reconciliation"]);
  ledger.updateLeg("p", { status: "leg1_confirmed" });
  expect(ledger.checkBeforeExecute({ ...input, nowMs: NOW + 1_000_000 }, limits)).toEqual(["stale_open_leg"]);
});
