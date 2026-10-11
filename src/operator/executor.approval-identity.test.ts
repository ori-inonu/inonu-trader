import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { resolve, sep } from "node:path";
import { loadOperatorConfig } from "./config";
import { EVM_NATIVE_PLACEHOLDER } from "./candidates";
import { executePlan, type EvmSigner } from "./executor";
import { createOperatorLedger, initLedgerFile, ledgerFilePersister, parseLedger, readLedgerFile, type OperatorLedgerState } from "./ledger";
import { buildExecutionPlan } from "./plan";
import type { OpportunityCandidate } from "./types";

const NOW = 1_760_000_000_000;
const ADDRESS = "0x" + "aa".repeat(20);
const ROUTER = "0x" + "ab".repeat(20);
const SPENDER = "0x" + "5e".repeat(20);
const SELECTOR = "0xdeadbeef";
const EXECUTED_KEY = "synthetic-approval-identity-key";
const TEST_ROOT = resolve(import.meta.dir, "../../evidence/implementation-v1/test-ledgers");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(TEST_ROOT + sep)) throw new Error("Temporary ledger outside test root");
    for (const file of ["ledger.json", "ledger.json.saved", `ledger.json.${process.pid}.tmp`]) {
      const path = resolve(directory, file);
      if (existsSync(path)) {
        if (statSync(path).isDirectory()) rmdirSync(path);
        else unlinkSync(path);
      }
    }
    rmdirSync(directory);
  }
});

interface FixtureOptions {
  nativeFrom?: boolean;
  nativeTo?: boolean;
  receiptFailure?: { hash: string; kind: "revert" | "timeout" };
  stopAfterReceipt?: { hash: string; kind: "expiry" | "kill" };
  failSendAt?: number;
  simulationFailureAt?: number;
  storageFailure?: { afterSend: number; recover: boolean };
}

function fixture(options: FixtureOptions = {}) {
  mkdirSync(TEST_ROOT, { recursive: true });
  const directory = mkdtempSync(resolve(TEST_ROOT, "case-"));
  directories.push(directory);
  const path = resolve(directory, "ledger.json");
  const policy = {
    ...loadOperatorConfig({ OPERATOR_PROFILE: "standard" }).policy,
    planTtlMs: 1_000, cooldownMs: 1_000, maxDailyNotionalUsd: 100, maxDailyPlans: 2,
    routerAllowlist: { "196": [ROUTER] },
    spenderAllowlist: { "196": [SPENDER] },
    selectorAllowlist: { "196": [SELECTOR] },
  };
  const candidate: OpportunityCandidate = {
    id: "approval_identity_fixture", kind: "dex_round_trip", title: "Synthetic approval identity round trip", chainIndex: "196",
    from: { chainIndex: "196", tokenContractAddress: options.nativeFrom ? EVM_NATIVE_PLACEHOLDER : "0x" + "11".repeat(20), symbol: "BASE", decimals: 6 },
    to: { chainIndex: "196", tokenContractAddress: options.nativeTo ? EVM_NATIVE_PLACEHOLDER : "0x" + "22".repeat(20), symbol: "COUNTER", decimals: 18 },
    sizeUsd: 25, sizeAtomic: "25000000", expectedLeg1OutAtomic: "25000000000000000000", expectedOutAtomic: "25250000",
    pairKey: "196:base:counter", netUsd: 0.20, priceImpactPercent: 0.01,
    costs: { networkFeeUsd: 0.01, tradingFeeUsd: 0.02, inferenceUsd: 0.02, complete: true },
    quoteAgeMs: 0, quoteHash: "synthetic-approval-identity-quote", notes: [], researchOnly: false,
  };
  const plan = buildExecutionPlan(candidate, {
    choice: candidate.id, probabilities: { hold: 0, [candidate.id]: 1 }, confidence: 1, latencyMs: 0, inputTokens: 1, model: "synthetic-test",
  }, policy, { operatorExecute: true, operatorLiveAck: true, realModel: true, signerAvailable: true }, NOW);
  // Opaque fixture identities are independent of the plan builder's hash calculation.
  plan.idempotencyKey = EXECUTED_KEY;
  plan.planId = "synthetic-approval-identity-plan";
  const filePersist = ledgerFilePersister(path);
  const storageErrors: unknown[] = [];
  let storageRecovered = false;
  const persist = (state: OperatorLedgerState) => {
    try { filePersist(state); }
    catch (error) {
      storageErrors.push(error);
      if (options.storageFailure?.recover && !storageRecovered) {
        // Restore the real file after its atomic rename failed against an empty directory.
        rmdirSync(path);
        renameSync(`${path}.saved`, path);
        storageRecovered = true;
      }
      throw error;
    }
  };
  const ledger = createOperatorLedger(initLedgerFile(path), persist);
  const restore = () => {
    const loaded = readLedgerFile(path);
    if (loaded.status !== "ready") throw new Error(`Test ledger is ${loaded.status}`);
    return createOperatorLedger(loaded.state, persist);
  };
  const sent: string[] = [];
  let clock = NOW;
  let killed = false;
  let simulationCalls = 0;
  const receiptSnapshots: { hash: string; state: OperatorLedgerState }[] = [];
  const signer: EvmSigner = {
    address: ADDRESS,
    async sendTransaction(_tx, beforeSubmit) {
      beforeSubmit();
      if (options.failSendAt === sent.length + 1) throw new Error("synthetic send failure");
      const hash = `0x${sent.length + 1}`;
      sent.push(hash);
      if (options.storageFailure?.afterSend === sent.length) {
        renameSync(path, `${path}.saved`);
        mkdirSync(path);
      }
      return hash;
    },
    async waitForReceipt(_chain, hash) {
      // A fresh public ledger instance reads the real file at receipt entry.
      receiptSnapshots.push({ hash, state: restore().state() });
      if (options.stopAfterReceipt?.hash === hash) {
        if (options.stopAfterReceipt.kind === "expiry") clock = NOW + 1_000;
        else killed = true;
      }
      if (options.receiptFailure?.hash === hash) {
        if (options.receiptFailure.kind === "timeout") throw new Error("synthetic receipt timeout");
        return { success: false, gasCostNative: 0.001 };
      }
      return { success: true, gasCostNative: 0.001 };
    },
    async simulate() { return ++simulationCalls !== options.simulationFailureAt; },
  };
  const tradeClient = {
    async get(endpoint: string, params: Record<string, string>) {
      if (endpoint.endsWith("approve-transaction")) return [{ dexContractAddress: SPENDER }];
      const minReceiveAmount = params.fromTokenAddress === candidate.from.tokenContractAddress
        ? "25000000000000000000" : "25250000";
      const nativeInput = params.fromTokenAddress === EVM_NATIVE_PLACEHOLDER;
      return [{ tx: { to: ROUTER, data: `${SELECTOR}00ff`, value: nativeInput ? params.amount : "0", gas: "200000", minReceiveAmount } }];
    },
    async post() { return []; },
  } as never;
  const run = () => executePlan(plan, candidate, {
    tradeClient, evmSigner: signer, ledger, policy, inventoryAddress: ADDRESS, now: () => clock,
    slippagePercent: 0.5, killSwitchExists: () => killed,
  }, { model: "synthetic-test", decision: { choice: candidate.id, probabilities: { hold: 0, [candidate.id]: 1 }, confidence: 1, latencyMs: 0, inputTokens: 1, model: "synthetic-test" }, eligible: [candidate] });
  return { run, restore, path, plan, policy, sent, receiptSnapshots, storageErrors };
}

test("first approval identity is restored from disk before its receipt wait", async () => {
  const f = fixture();
  const result = await f.run();
  expect(f.receiptSnapshots[0]?.hash).toBe("0x1");
  const atReceipt = f.receiptSnapshots[0]!.state;
  expect(atReceipt.openLegs[0]).toMatchObject({ approveTxHash: "0x1", txHash: "", closeTxHash: null });
  expect(atReceipt.executedKeys).toEqual(["synthetic-approval-identity-key"]);
  expect(atReceipt.dailyNotionalUsd).toEqual({ "2025-10-09": 50 });
  expect(atReceipt.dailyPlans).toEqual({ "2025-10-09": 1 });
  expect(atReceipt.lastExecutionAtMs).toBe(NOW);
  expect(atReceipt.openLegs[0]?.openedAtMs).toBe(NOW);
  expect(result.status).toBe("completed");
});

test("public ledger reading rejects a numeric approval identity", async () => {
  const f = fixture();
  await f.run();
  const saved = f.restore().state();
  ledgerFilePersister(f.path)({
    ...saved, openLegs: [{ ...saved.openLegs[0]!, approveTxHash: 7 }],
  } as unknown as OperatorLedgerState);
  expect(readLedgerFile(f.path).status).toBe("corrupt");
});

test("second approval identity is on disk before its receipt and survives final restoration", async () => {
  const f = fixture();
  const result = await f.run();
  expect(f.receiptSnapshots[2]?.hash).toBe("0x3");
  expect(f.receiptSnapshots[2]!.state.openLegs[0]).toMatchObject({
    approveTxHash: "0x1", closeApproveTxHash: "0x3", txHash: "0x2", closeTxHash: null, status: "leg1_confirmed",
  });
  expect(f.restore().state().openLegs[0]).toMatchObject({
    approveTxHash: "0x1", closeApproveTxHash: "0x3", txHash: "0x2", closeTxHash: "0x4", status: "closed", openedAtMs: NOW,
  });
  expect(result.status).toBe("completed");
});

test("public ledger reading rejects a numeric closing approval identity", async () => {
  const f = fixture();
  await f.run();
  const saved = f.restore().state();
  ledgerFilePersister(f.path)({
    ...saved, openLegs: [{ ...saved.openLegs[0]!, closeApproveTxHash: 7 }],
  } as unknown as OperatorLedgerState);
  expect(readLedgerFile(f.path).status).toBe("corrupt");
});

function expectCommitted(state: OperatorLedgerState) {
  expect(state.version).toBe(1);
  expect(state.executedKeys).toEqual(["synthetic-approval-identity-key"]);
  expect(state.dailyNotionalUsd).toEqual({ "2025-10-09": 50 });
  expect(state.dailyPlans).toEqual({ "2025-10-09": 1 });
  expect(state.lastExecutionAtMs).toBe(NOW);
  expect(state.openLegs[0]?.openedAtMs).toBe(NOW);
  expect(state.dailyRealizedUsd).toEqual({});
  expect(state.cumulativeRealizedUsd).toBe(0);
  expect(state.peakRealizedUsd).toBe(0);
}

function expectReconciliationBlocks(f: ReturnType<typeof fixture>) {
  const restored = f.restore();
  expect(restored.checkBeforeExecute({
    idempotencyKey: EXECUTED_KEY, pairKey: "196:base:counter", sizeUsd: 1, nowMs: NOW, killSwitchExists: false,
  }, f.policy)).toEqual(["idempotency_key_already_executed", "cooldown_active", "open_leg_on_pair", "failed_leg_requires_manual_reconciliation"]);
  expect(restored.checkBeforeExecute({
    idempotencyKey: "other-key", pairKey: "other-pair", sizeUsd: 51, nowMs: NOW + 2_000, killSwitchExists: false,
  }, { ...f.policy, maxDailyPlans: 1 })).toEqual(["daily_notional_cap", "daily_plan_cap", "failed_leg_requires_manual_reconciliation"]);
  expect(f.plan.expiresAtMs).toBe(NOW + 1_000);
}

test("completed restoration preserves separate identities, limits, timestamps and pending result accounting", async () => {
  const f = fixture();
  const result = await f.run();
  expectCommitted(f.restore().state());
  expect(result).toMatchObject({
    status: "completed", txHash: "0x2", closeTxHash: "0x4", gasCostNative: 0.004,
    reasons: ["both_legs_confirmed; realized result pending reconciliation of balances"],
  });
  expect(f.sent).toEqual(["0x1", "0x2", "0x3", "0x4"]);
  expect((await f.run()).status).toBe("blocked");
  expect(f.sent).toEqual(["0x1", "0x2", "0x3", "0x4"]);
});

for (const field of ["approveTxHash", "closeApproveTxHash"] as const) {
  for (const [name, value] of [["number", 7], ["boolean", true], ["array", []], ["object", {}], ["empty string", ""]] as const) {
    test(`public file restoration rejects ${field} containing ${name}`, async () => {
      const f = fixture();
      await f.run();
      const state = f.restore().state();
      ledgerFilePersister(f.path)({
        ...state, openLegs: [{ ...state.openLegs[0]!, [field]: value }],
      } as unknown as OperatorLedgerState);
      expect(readLedgerFile(f.path)).toMatchObject({ status: "corrupt", message: "Corrupt operator ledger" });
      expect(() => f.restore()).toThrow("Test ledger is corrupt");
    });
  }
  test(`public parsing rejects an explicitly present undefined ${field}`, async () => {
    const f = fixture();
    await f.run();
    const state = f.restore().state();
    const input = { ...state, openLegs: [{ ...state.openLegs[0]!, [field]: undefined }] };
    expect(() => parseLedger(input)).toThrow("Corrupt operator ledger");
    expect(() => createOperatorLedger(input, ledgerFilePersister(f.path))).toThrow("Corrupt operator ledger");
  });
}

for (const mode of ["omitted", "null", "opaque"] as const) {
  test(`version-one historical restoration accepts ${mode} approval identities without inventing values`, async () => {
    const f = fixture();
    await f.run();
    const state = f.restore().state();
    const leg = { ...state.openLegs[0]! };
    if (mode === "omitted") { delete leg.approveTxHash; delete leg.closeApproveTxHash; }
    if (mode === "null") { leg.approveTxHash = null; leg.closeApproveTxHash = null; }
    if (mode === "opaque") { leg.approveTxHash = "opaque-first-identity"; leg.closeApproveTxHash = " "; }
    ledgerFilePersister(f.path)({ ...state, openLegs: [leg] });
    const restored = f.restore().state();
    expectCommitted(restored);
    expect(restored.openLegs[0]).toMatchObject({ txHash: "0x2", closeTxHash: "0x4", status: "closed" });
    if (mode === "omitted") {
      expect(Object.hasOwn(restored.openLegs[0]!, "approveTxHash")).toBe(false);
      expect(Object.hasOwn(restored.openLegs[0]!, "closeApproveTxHash")).toBe(false);
    } else {
      expect(restored.openLegs[0]?.approveTxHash).toBe(mode === "null" ? null : "opaque-first-identity");
      expect(restored.openLegs[0]?.closeApproveTxHash).toBe(mode === "null" ? null : " ");
    }
  });
}

test("native first input omits its unnecessary approval identity and preserves the closing approval", async () => {
  const f = fixture({ nativeFrom: true });
  expect((await f.run()).status).toBe("completed");
  const state = f.restore().state();
  expectCommitted(state);
  expect(f.sent).toEqual(["0x1", "0x2", "0x3"]);
  expect(Object.hasOwn(state.openLegs[0]!, "approveTxHash")).toBe(false);
  expect(f.receiptSnapshots[1]?.state.openLegs[0]).toMatchObject({ closeApproveTxHash: "0x2", txHash: "0x1", closeTxHash: null });
  expect(state.openLegs[0]).toMatchObject({ closeApproveTxHash: "0x2", txHash: "0x1", closeTxHash: "0x3" });
});

test("native intermediate input omits its unnecessary closing approval identity", async () => {
  const f = fixture({ nativeTo: true });
  expect((await f.run()).status).toBe("completed");
  const state = f.restore().state();
  expectCommitted(state);
  expect(f.sent).toEqual(["0x1", "0x2", "0x3"]);
  expect(Object.hasOwn(state.openLegs[0]!, "closeApproveTxHash")).toBe(false);
  expect(state.openLegs[0]).toMatchObject({ approveTxHash: "0x1", txHash: "0x2", closeTxHash: "0x3" });
});

for (const hash of ["0x1", "0x3"] as const) {
  for (const kind of ["revert", "timeout"] as const) {
    test(`${hash} approval ${kind} preserves its disk identity and reconciliation stops`, async () => {
      const f = fixture({ receiptFailure: { hash, kind } });
      const result = await f.run();
      const state = f.restore().state();
      expectCommitted(state);
      expectReconciliationBlocks(f);
      expect(f.sent).toEqual(hash === "0x1" ? ["0x1"] : ["0x1", "0x2", "0x3"]);
      expect(f.receiptSnapshots.map((entry) => entry.hash)).toEqual(hash === "0x1" ? ["0x1"] : ["0x1", "0x2", "0x3"]);
      const note = hash === "0x1"
        ? kind === "revert" ? "approve_reverted" : "send_failed: synthetic receipt timeout"
        : kind === "revert" ? "leg2_failed: leg2_approve_reverted" : "leg2_failed: synthetic receipt timeout";
      expect(result).toMatchObject({ status: hash === "0x1" ? "failed" : "sent", reasons: [note] });
      expect(state.openLegs[0]).toMatchObject({ approveTxHash: "0x1", txHash: hash === "0x1" ? "" : "0x2", closeTxHash: null, status: "failed", note });
      if (hash === "0x3") expect(state.openLegs[0]?.closeApproveTxHash).toBe("0x3");
      else expect(Object.hasOwn(state.openLegs[0]!, "closeApproveTxHash")).toBe(false);
    });
  }
  for (const kind of ["expiry", "kill"] as const) {
    test(`late ${hash} approval receipt is observed before ${kind} prevents the next send`, async () => {
      const f = fixture({ stopAfterReceipt: { hash, kind } });
      const result = await f.run();
      const state = f.restore().state();
      expectCommitted(state);
      expectReconciliationBlocks(f);
      expect(f.sent).toEqual(hash === "0x1" ? ["0x1"] : ["0x1", "0x2", "0x3"]);
      expect(f.receiptSnapshots.at(-1)?.hash).toBe(hash);
      const nextStage = hash === "0x1" ? "leg1" : "leg2";
      const note = `${hash === "0x1" ? "send_failed" : "leg2_failed"}: ${kind === "expiry" ? "plan_expired" : "kill_switch_present"}_before_${nextStage}`;
      expect(result).toMatchObject({ status: hash === "0x1" ? "failed" : "sent", reasons: [note] });
      expect(state.openLegs[0]).toMatchObject({ approveTxHash: "0x1", txHash: hash === "0x1" ? "" : "0x2", closeTxHash: null, status: "failed", note });
      if (hash === "0x3") expect(state.openLegs[0]?.closeApproveTxHash).toBe("0x3");
    });
  }
}

for (const hash of ["0x2", "0x4"] as const) {
  for (const kind of ["revert", "timeout"] as const) {
    test(`later swap ${hash} ${kind} keeps already observed approval identities`, async () => {
      const f = fixture({ receiptFailure: { hash, kind } });
      const result = await f.run();
      const state = f.restore().state();
      expectCommitted(state);
      expectReconciliationBlocks(f);
      expect(f.sent).toEqual(hash === "0x2" ? ["0x1", "0x2"] : ["0x1", "0x2", "0x3", "0x4"]);
      expect(state.openLegs[0]).toMatchObject({ approveTxHash: "0x1", txHash: "0x2", status: "failed", closeTxHash: hash === "0x2" ? null : "0x4" });
      if (hash === "0x4") expect(state.openLegs[0]?.closeApproveTxHash).toBe("0x3");
      const note = hash === "0x2" ? kind === "revert" ? "leg1_reverted" : "leg1_receipt_timeout"
        : kind === "revert" ? "leg2_reverted" : "leg2_failed: synthetic receipt timeout";
      expect(state.openLegs[0]?.note).toBe(note);
      expect(result.status).toBe(hash === "0x2" && kind === "revert" ? "failed" : "sent");
    });
  }
}

for (const stage of [1, 2] as const) {
  test(`swap ${stage} simulation failure does not lose approval identities or dispatch another transaction`, async () => {
    const f = fixture({ simulationFailureAt: stage });
    const result = await f.run();
    const state = f.restore().state();
    expectCommitted(state);
    expectReconciliationBlocks(f);
    expect(f.sent).toEqual(stage === 1 ? ["0x1"] : ["0x1", "0x2", "0x3"]);
    expect(result.status).toBe(stage === 1 ? "blocked" : "sent");
    expect(state.openLegs[0]).toMatchObject({ approveTxHash: "0x1", status: "failed", closeTxHash: null,
      note: stage === 1 ? "leg1_simulation_reverted" : "leg2_failed: leg2_simulation_reverted" });
    if (stage === 2) expect(state.openLegs[0]?.closeApproveTxHash).toBe("0x3");
  });
  test(`swap ${stage} send failure does not lose its earlier approval identity`, async () => {
    const f = fixture({ failSendAt: stage === 1 ? 2 : 4 });
    const result = await f.run();
    const state = f.restore().state();
    expectCommitted(state);
    expectReconciliationBlocks(f);
    expect(f.sent).toEqual(stage === 1 ? ["0x1"] : ["0x1", "0x2", "0x3"]);
    expect(result.status).toBe(stage === 1 ? "failed" : "sent");
    expect(state.openLegs[0]).toMatchObject({ approveTxHash: "0x1", status: "failed", closeTxHash: null,
      note: stage === 1 ? "send_failed: synthetic send failure" : "leg2_failed: synthetic send failure" });
    if (stage === 2) expect(state.openLegs[0]?.closeApproveTxHash).toBe("0x3");
  });
}

for (const afterSend of [1, 3] as const) {
  test(`approval ${afterSend} storage failure stops receipt waiting and sending while a later failure-status write succeeds`, async () => {
    const f = fixture({ storageFailure: { afterSend, recover: true } });
    const result = await f.run();
    expect(f.storageErrors).toHaveLength(1);
    expect(f.storageErrors[0]).toBeInstanceOf(Error);
    expect(f.sent).toEqual(afterSend === 1 ? ["0x1"] : ["0x1", "0x2", "0x3"]);
    expect(f.receiptSnapshots.map((entry) => entry.hash)).toEqual(afterSend === 1 ? [] : ["0x1", "0x2"]);
    const state = f.restore().state();
    expectCommitted(state);
    expectReconciliationBlocks(f);
    expect(result.status).toBe(afterSend === 1 ? "failed" : "sent");
    expect(state.openLegs[0]).toMatchObject({ approveTxHash: "0x1", status: "failed", txHash: afterSend === 1 ? "" : "0x2", closeTxHash: null });
    expect(state.openLegs[0]?.note).toStartWith(afterSend === 1 ? "send_failed: " : "leg2_failed: ");
    if (afterSend === 3) expect(state.openLegs[0]?.closeApproveTxHash).toBe("0x3");
    expect((await f.run()).status).toBe("blocked");
    expect(f.sent).toHaveLength(afterSend);
  });
  test(`approval ${afterSend} persistent storage failure propagates without claiming a disk identity or waiting`, async () => {
    const f = fixture({ storageFailure: { afterSend, recover: false } });
    let thrown: unknown;
    try { await f.run(); } catch (error) { thrown = error; }
    expect(f.storageErrors).toHaveLength(2);
    expect(thrown).toBe(f.storageErrors[1]);
    expect(thrown).toBeInstanceOf(Error);
    expect(f.sent).toEqual(afterSend === 1 ? ["0x1"] : ["0x1", "0x2", "0x3"]);
    expect(f.receiptSnapshots.map((entry) => entry.hash)).toEqual(afterSend === 1 ? [] : ["0x1", "0x2"]);
    expect(readLedgerFile(f.path).status).toBe("corrupt");
    const priorFile = readLedgerFile(`${f.path}.saved`);
    expect(priorFile.status).toBe("ready");
    if (priorFile.status !== "ready") throw new Error("Expected preserved pre-failure file");
    const prior = createOperatorLedger(priorFile.state, ledgerFilePersister(`${f.path}.saved`)).state();
    expectCommitted(prior);
    expect(prior.openLegs[0]).toMatchObject({ status: afterSend === 1 ? "leg1_sent" : "leg1_confirmed", txHash: afterSend === 1 ? "" : "0x2", closeTxHash: null });
    expect(Object.hasOwn(prior.openLegs[0]!, afterSend === 1 ? "approveTxHash" : "closeApproveTxHash")).toBe(false);
    if (afterSend === 3) expect(prior.openLegs[0]?.approveTxHash).toBe("0x1");
  });
}
