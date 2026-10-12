import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, createOperatorLedger, emptyLedger, initLedgerFile, ledgerFilePersister, parseLedger, readLedgerFile, weekKey, type CumulativeLimits } from "./ledger";

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const limits: CumulativeLimits = { maxDailyNotionalUsd: 100, maxDailyPlans: 3, cooldownMs: 60_000, killSwitchPath: "C:/data/operator/STOP", staleLegMs: 900_000, maxDailyLossUsd: 2, maxWeeklyLossUsd: 5, maxDrawdownUsd: 10 };

test("ledger enforces idempotency, daily caps, cooldown, kill switch and open legs across restarts", () => {
  const saved: string[] = [];
  const ledger = createOperatorLedger(emptyLedger(), (state) => saved.push(JSON.stringify(state)));
  const input = { idempotencyKey: "k1", pairKey: "196:USDT/OKB", sizeUsd: 25, nowMs: NOW, killSwitchExists: false };
  expect(ledger.checkBeforeExecute(input, limits)).toEqual([]);
  expect(ledger.checkBeforeExecute({ ...input, killSwitchExists: true }, limits)).toEqual(["kill_switch_present"]);
  expect(ledger.checkBeforeExecute({ ...input, sizeUsd: 0 }, limits)).toEqual(["invalid_execution_input"]);
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
});

test("strict parse rejects missing fields, wrong types, unknown leg statuses, out of range counters and repeated plan ids", () => {
  expect(() => parseLedger({ version: 2 })).toThrow("Corrupt operator ledger");
  const base = emptyLedger();
  expect(() => parseLedger({ ...base, dailyPlans: { "2026-10-10": "3" } })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ ...base, cooldown: 1, lastExecutionAtMs: "0" })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ version: 1, executedKeys: [], dailyNotionalUsd: {}, dailyPlans: {}, openLegs: [], lastExecutionAtMs: null })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ ...base, openLegs: [{ planId: "p" }] })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ ...base, openLegs: [{ planId: "p", candidateId: "c", pairKey: "k", chainIndex: "1", openedAtMs: 1, txHash: "", intermediateAtomic: "1", status: "weird", closeTxHash: null, note: null }] })).toThrow("Corrupt operator ledger");
  expect(parseLedger(base)).toEqual(base);

  // Ranges (R8 N12): a plan count is a non-negative integer and the notional never goes below zero.
  const day = "2026-10-10";
  expect(() => parseLedger({ ...base, dailyPlans: { [day]: -1 } })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ ...base, dailyPlans: { [day]: 1.5 } })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ ...base, dailyNotionalUsd: { [day]: -0.01 } })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ ...base, dailyNotionalUsd: { [day]: -10 } })).toThrow("Corrupt operator ledger");
  // A plan id names one leg: a repeated id would make updateLeg and the reconcile patch two legs at once.
  const leg = { planId: "plan_a", candidateId: "c", pairKey: "196:USDT/OKB", chainIndex: "196", openedAtMs: 1, txHash: "0x1", intermediateAtomic: "1", status: "leg1_sent", closeTxHash: null, note: null };
  expect(() => parseLedger({ ...base, openLegs: [leg, { ...leg, candidateId: "other", pairKey: "other" }] })).toThrow("Corrupt operator ledger");
  expect(() => parseLedger({ ...base, openLegs: [leg, { ...leg, status: "closed" }] })).toThrow("Corrupt operator ledger");
  expect(parseLedger({ ...base, openLegs: [leg, { ...leg, planId: "plan_b" }] }).openLegs).toHaveLength(2);
});

test("strict parse keeps accepting what the executor writes: cents of notional, zero counters, signed results", () => {
  const base = emptyLedger();
  const day = "2026-10-10";
  const written = { ...base, dailyNotionalUsd: { [day]: 9.74 }, dailyPlans: { [day]: 0 }, dailyRealizedUsd: { [day]: -0.42 }, cumulativeRealizedUsd: -0.42 };
  expect(parseLedger(written)).toEqual(written);
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 4.37 * 2, nowMs: NOW, leg: null });
  expect(parseLedger(JSON.parse(JSON.stringify(ledger.state())))).toEqual(ledger.state());
});

test("reconciled losses accumulate per day, per week and as drawdown, each with its own stop", () => {
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  const input = { idempotencyKey: "k", pairKey: "p", sizeUsd: 1, nowMs: NOW + 2_000, killSwitchExists: false };
  ledger.recordRealized(NOW, -1.5);
  ledger.recordRealized(NOW + 1_000, 0.25);
  expect(ledger.dayRealizedUsd(NOW)).toBeCloseTo(-1.25, 9);
  expect(ledger.checkBeforeExecute(input, limits)).toEqual([]);
  ledger.recordRealized(NOW + 3_000, -0.75);
  expect(ledger.checkBeforeExecute({ ...input, nowMs: NOW + 4_000 }, limits)).toEqual(["daily_loss_stop"]);
  // Next day the daily stop clears but the week keeps accumulating.
  const nextDay = NOW + 86_400_000;
  expect(ledger.checkBeforeExecute({ ...input, nowMs: nextDay }, limits)).toEqual([]);
  ledger.recordRealized(nextDay, -3.5);
  expect(ledger.weekRealizedUsd(nextDay)).toBeCloseTo(-5.5, 9);
  expect(ledger.checkBeforeExecute({ ...input, nowMs: nextDay + 1 }, limits)).toEqual(["daily_loss_stop", "weekly_loss_stop"]);
  // A later week starts clean for the weekly stop but the drawdown from the peak remains.
  const nextWeek = NOW + 8 * 86_400_000;
  expect(weekKey(nextWeek)).not.toBe(weekKey(NOW));
  ledger.recordRealized(nextWeek, -4.6);
  expect(ledger.drawdownUsd()).toBeCloseTo(10.1, 9);
  expect(ledger.checkBeforeExecute({ ...input, nowMs: nextWeek + 1 }, limits)).toEqual(["daily_loss_stop", "drawdown_stop"]);
  expect(() => ledger.recordRealized(NOW, Number.NaN)).toThrow("Invalid realized result");
});

test("failed or stale legs block every new plan until reconciled", () => {
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 1, nowMs: NOW, leg: { planId: "p", candidateId: "c", pairKey: "a", chainIndex: "196", openedAtMs: NOW, txHash: "0x", intermediateAtomic: "1", status: "failed", closeTxHash: null, note: "leg2_reverted" } });
  const input = { idempotencyKey: "other", pairKey: "b", sizeUsd: 1, nowMs: NOW + 120_000, killSwitchExists: false };
  expect(ledger.checkBeforeExecute(input, limits)).toEqual(["failed_leg_requires_manual_reconciliation"]);
  ledger.updateLeg("p", { status: "leg1_confirmed" });
  expect(ledger.checkBeforeExecute({ ...input, nowMs: NOW + 1_000_000 }, limits)).toEqual(["stale_open_leg"]);
});

test("ledger files fail closed: missing is reported, corrupt throws, init refuses to overwrite, writes are atomic, lock is exclusive", () => {
  const dir = mkdtempSync(join(tmpdir(), "operator-ledger-"));
  try {
    const path = join(dir, "nested", "ledger.json");
    expect(readLedgerFile(path)).toEqual({ status: "missing" });
    expect(() => readLedgerFile("relative/ledger.json")).toThrow("absolute");
    const state = initLedgerFile(path);
    expect(existsSync(path)).toBe(true);
    expect(() => initLedgerFile(path)).toThrow("refusing to overwrite");
    const persist = ledgerFilePersister(path);
    const ledger = createOperatorLedger(state, persist);
    ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 2, nowMs: NOW, leg: null });
    expect(readLedgerFile(path)).toMatchObject({ status: "ready", state: { executedKeys: ["k"] } });
    expect(existsSync(`${path}.${process.pid}.tmp`)).toBe(false);
    writeFileSync(path, "{\"version\":1,\"executedKeys\":[],\"dailyPlans\":{\"2026-10-10\":\"3\"}}");
    expect(readLedgerFile(path).status).toBe("corrupt");
    const lockPath = join(dir, "LOCK");
    const release = acquireLock(lockPath);
    expect(readFileSync(lockPath, "utf8")).toContain(String(process.pid));
    expect(() => acquireLock(lockPath)).toThrow("lock present");
    release();
    expect(existsSync(lockPath)).toBe(false);
    release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
