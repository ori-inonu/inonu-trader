import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, createOperatorLedger, emptyLedger, initLedgerFile, ledgerFilePersister, parseLedger, readLedgerFile, weekKey, type CumulativeLimits, type OpenLeg, type OperatorLedgerState } from "./ledger";

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

function legAt(planId: string, status: OpenLeg["status"]): OpenLeg {
  return { planId, candidateId: "c", pairKey: `196:${planId}`, chainIndex: "196", openedAtMs: NOW, txHash: "0x1", intermediateAtomic: "1", status, closeTxHash: null, note: "leg2_reverted" };
}

test("reconcileLeg records status, note and the signed result in ONE write, and a leg takes a result only once (R10 M2)", () => {
  const saved: OperatorLedgerState[] = [];
  const ledger = createOperatorLedger(emptyLedger(), (state) => saved.push(structuredClone(state)));
  ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 2, nowMs: NOW, leg: legAt("p1", "failed") });
  saved.length = 0;

  ledger.reconcileLeg("p1", "failed", -1.5, NOW + 1_000, "manual_reconcile_a");
  expect(saved).toHaveLength(1);
  expect(saved[0]!.openLegs[0]).toMatchObject({ status: "failed", note: "manual_reconcile_a", realizedUsd: -1.5 });
  expect(saved[0]!.dailyRealizedUsd).toEqual({ "2026-10-10": -1.5 });
  expect(saved[0]!.cumulativeRealizedUsd).toBe(-1.5);
  expect(saved[0]!.peakRealizedUsd).toBe(0);
  expect(ledger.dayRealizedUsd(NOW)).toBe(-1.5);
  expect(ledger.weekRealizedUsd(NOW)).toBe(-1.5);
  expect(ledger.drawdownUsd()).toBe(1.5);

  // The same plan again, with the same or another value: refused, nothing written, the day keeps -1.5.
  expect(() => ledger.reconcileLeg("p1", "failed", -1.5, NOW + 2_000, "manual_reconcile_b")).toThrow("already");
  expect(() => ledger.reconcileLeg("p1", "closed", 42, NOW + 3_000, "manual_reconcile_c")).toThrow("already");
  expect(saved).toHaveLength(1);
  expect(ledger.dayRealizedUsd(NOW)).toBe(-1.5);
  expect(ledger.state().openLegs[0]).toMatchObject({ status: "failed", note: "manual_reconcile_a" });

  // Without a new value the leg may still change status, because it already carries its result.
  ledger.reconcileLeg("p1", "closed", null, NOW + 4_000, "manual_reconcile_d");
  expect(saved).toHaveLength(2);
  expect(saved[1]!.openLegs[0]).toMatchObject({ status: "closed", note: "manual_reconcile_d", realizedUsd: -1.5 });
  expect(saved[1]!.dailyRealizedUsd).toEqual({ "2026-10-10": -1.5 });
  expect(saved[1]!.cumulativeRealizedUsd).toBe(-1.5);
  expect(ledger.openLegs()).toHaveLength(0);
});

test("reconcileLeg feeds the loss stops through the same single write", () => {
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 2, nowMs: NOW, leg: legAt("p1", "failed") });
  const input = { idempotencyKey: "other", pairKey: "elsewhere", sizeUsd: 1, nowMs: NOW + 120_000, killSwitchExists: false };
  expect(ledger.checkBeforeExecute(input, limits)).toEqual(["failed_leg_requires_manual_reconciliation"]);
  ledger.reconcileLeg("p1", "closed", -2.5, NOW + 1_000, "manual_reconcile");
  expect(ledger.checkBeforeExecute(input, limits)).toEqual(["daily_loss_stop"]);
});

test("reconcileLeg without a value needs a result already on the leg, and refuses unknown, closed or invalid input without writing", () => {
  let writes = 0;
  const ledger = createOperatorLedger(emptyLedger(), () => { writes++; });
  ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 2, nowMs: NOW, leg: legAt("p1", "leg1_sent") });
  ledger.recordExecution({ idempotencyKey: "k2", sizeUsd: 2, nowMs: NOW, leg: legAt("p2", "closed") });
  writes = 0;
  const before = JSON.stringify(ledger.state());
  expect(() => ledger.reconcileLeg("p1", "closed", null, NOW, "n")).toThrow("Realized result required");
  expect(() => ledger.reconcileLeg("missing", "closed", -1, NOW, "n")).toThrow("No open leg");
  expect(() => ledger.reconcileLeg("p2", "failed", -1, NOW, "n")).toThrow("No open leg");
  expect(() => ledger.reconcileLeg("p1", "leg1_confirmed" as never, -1, NOW, "n")).toThrow("Invalid reconcile status");
  expect(() => ledger.reconcileLeg("p1", "closed", Number.NaN, NOW, "n")).toThrow("Invalid realized result");
  expect(() => ledger.reconcileLeg("p1", "closed", Number.POSITIVE_INFINITY, NOW, "n")).toThrow("Invalid realized result");
  expect(writes).toBe(0);
  expect(JSON.stringify(ledger.state())).toBe(before);
});

test("reconcileLeg commits to memory only after the write succeeded, so a failed write can be repeated without doubling", () => {
  let failNext = true;
  const saved: OperatorLedgerState[] = [];
  const ledger = createOperatorLedger(emptyLedger(), (state) => {
    if (failNext) { failNext = false; throw Object.assign(new Error("synthetic EPERM"), { code: "EPERM" }); }
    saved.push(structuredClone(state));
  });
  failNext = false;
  ledger.recordExecution({ idempotencyKey: "k", sizeUsd: 2, nowMs: NOW, leg: legAt("p1", "failed") });
  saved.length = 0;
  failNext = true;
  expect(() => ledger.reconcileLeg("p1", "failed", -1.5, NOW, "n")).toThrow("EPERM");
  expect(ledger.dayRealizedUsd(NOW)).toBe(0);
  expect(ledger.state().openLegs[0]!.realizedUsd).toBeUndefined();
  ledger.reconcileLeg("p1", "failed", -1.5, NOW, "n");
  expect(saved).toHaveLength(1);
  expect(ledger.dayRealizedUsd(NOW)).toBe(-1.5);
});

test("a leg result survives the strict parse and must be a finite number", () => {
  const withResult = { ...legAt("p1", "failed"), realizedUsd: -1.5 };
  const state = { ...emptyLedger(), openLegs: [withResult] };
  expect(parseLedger(JSON.parse(JSON.stringify(state)))).toEqual(state);
  for (const bad of ["1", null, true, {}, [], Number.NaN]) {
    expect(() => parseLedger({ ...emptyLedger(), openLegs: [{ ...legAt("p1", "failed"), realizedUsd: bad }] })).toThrow("Corrupt operator ledger");
  }
  expect(() => parseLedger(JSON.parse(JSON.stringify({ ...emptyLedger(), openLegs: [{ ...legAt("p1", "failed"), realizedUsd: Number.POSITIVE_INFINITY }] })))).toThrow("Corrupt operator ledger");
});
