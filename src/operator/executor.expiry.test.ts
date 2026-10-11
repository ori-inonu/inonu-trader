import { expect, test } from "bun:test";
import { loadOperatorConfig } from "./config";
import { executePlan, type EvmSigner } from "./executor";
import { createOperatorLedger, emptyLedger } from "./ledger";
import { buildExecutionPlan } from "./plan";
import type { OpportunityCandidate } from "./types";

const NOW = 1_760_000_000_000;
const ADDRESS = "0x" + "aa".repeat(20);
const ROUTER = "0x" + "ab".repeat(20);
const SPENDER = "0x" + "5e".repeat(20);
const SELECTOR = "0xdeadbeef";
const STAGES = ["approve1", "leg1", "approve2", "leg2"];

function fixture(onEvent?: (event: string, clock: { now: number; kill: boolean }) => void) {
  const clock = { now: NOW, kill: false };
  const policy = {
    ...loadOperatorConfig({ OPERATOR_PROFILE: "standard" }).policy,
    routerAllowlist: { "196": [ROUTER] },
    spenderAllowlist: { "196": [SPENDER] },
    selectorAllowlist: { "196": [SELECTOR] },
  };
  const candidate: OpportunityCandidate = {
    id: "expiry_fixture", kind: "dex_round_trip", title: "Synthetic token round trip", chainIndex: "196",
    from: { chainIndex: "196", tokenContractAddress: "0x" + "11".repeat(20), symbol: "BASE", decimals: 6 },
    to: { chainIndex: "196", tokenContractAddress: "0x" + "22".repeat(20), symbol: "COUNTER", decimals: 18 },
    sizeUsd: 25, sizeAtomic: "25000000", expectedLeg1OutAtomic: "25000000000000000000", expectedOutAtomic: "25250000",
    pairKey: "196:base:counter", netUsd: 0.20, priceImpactPercent: 0.01,
    costs: { networkFeeUsd: 0.01, tradingFeeUsd: 0.02, inferenceUsd: 0.02, complete: true },
    quoteAgeMs: 0, quoteHash: "synthetic-expiry-quote", notes: [], researchOnly: false,
  };
  const plan = buildExecutionPlan(candidate, {
    choice: candidate.id, probabilities: { hold: 0, [candidate.id]: 1 }, confidence: 1, latencyMs: 0, inputTokens: 1, model: "synthetic-test",
  }, policy, { operatorExecute: true, operatorLiveAck: true, realModel: true, signerAvailable: true }, NOW);
  let recorded = false;
  const ledger = createOperatorLedger(emptyLedger(), () => {
    if (!recorded) { recorded = true; onEvent?.("ledger_recorded", clock); }
  });
  const sent: string[] = [];
  const receipts: string[] = [];
  const receiptResults = { revert: null as string | null, timeout: null as string | null };
  let simulations = 0;
  const signer: EvmSigner = {
    address: ADDRESS,
    async sendTransaction(_tx, beforeSubmit) {
      const stage = STAGES[sent.length]!;
      onEvent?.(`signer_prepare:${stage}`, clock);
      await Promise.resolve();
      beforeSubmit();
      sent.push(stage);
      return `0x${sent.length}`;
    },
    async waitForReceipt(_chain, hash) {
      const stage = STAGES[Number(hash.slice(2)) - 1]!;
      receipts.push(stage);
      onEvent?.(`receipt:${stage}`, clock);
      if (receiptResults.timeout === stage) throw new Error("synthetic receipt timeout");
      return { success: receiptResults.revert !== stage, gasCostNative: 0.001 };
    },
    async simulate() { onEvent?.(`simulate:leg${++simulations}`, clock); return true; },
  };
  const tradeClient = {
    async get(path: string, params: Record<string, string>) {
      if (path.endsWith("approve-transaction")) return [{ dexContractAddress: SPENDER }];
      onEvent?.(params.fromTokenAddress === candidate.from.tokenContractAddress ? "prepare:leg1" : "prepare:leg2", clock);
      const minReceiveAmount = params.fromTokenAddress === candidate.from.tokenContractAddress
        ? candidate.expectedLeg1OutAtomic : candidate.expectedOutAtomic;
      return [{ tx: { to: ROUTER, data: `${SELECTOR}00ff`, value: "0", gas: "200000", minReceiveAmount } }];
    },
    async post() { return []; },
  } as never;
  const run = () => executePlan(plan, candidate, {
    tradeClient, evmSigner: signer, ledger, policy, inventoryAddress: ADDRESS, now: () => clock.now,
    slippagePercent: 0.5, killSwitchExists: () => clock.kill,
  }, { model: "synthetic-test", decision: { choice: candidate.id, probabilities: { hold: 0, [candidate.id]: 1 }, confidence: 1, latencyMs: 0, inputTokens: 1, model: "synthetic-test" }, eligible: [candidate] });
  return { run, clock, plan, candidate, ledger, policy, sent, receipts, receiptResults };
}

test("approval receipt after expiry is observed, but the first swap is never dispatched", async () => {
  const f = fixture((event, clock) => { if (event === "receipt:approve1") clock.now = f.plan.expiresAtMs; });
  const result = await f.run();
  expect(result.status).toBe("failed");
  expect(result.reasons).toEqual(["send_failed: plan_expired_before_leg1"]);
  expect(f.sent).toEqual(["approve1"]);
  expect(f.receipts).toEqual(["approve1"]);
  expect(f.ledger.openLegs()[0]?.status).toBe("failed");
});

const expiryEvents = ["ledger_recorded", "simulate:leg1", "prepare:leg2", "simulate:leg2"];
for (const [index, stage] of STAGES.entries()) {
  for (const boundary of ["at_expiry", "after_expiry", "before_creation"] as const) {
    test(`${stage} stops at ${boundary}, retaining failed-leg limits and known swap hashes`, async () => {
      const f = fixture((event, clock) => {
        if (event === expiryEvents[index]) clock.now = boundary === "before_creation" ? NOW - 1 : f.plan.expiresAtMs + (boundary === "after_expiry" ? 1 : 0);
      });
      const originalExpiry = f.plan.expiresAtMs;
      const result = await f.run();
      expect(result.status).toBe(index < 2 ? "failed" : "sent");
      expect(result.reasons).toEqual([`${index < 2 ? "send_failed" : "leg2_failed"}: plan_expired_before_${stage}`]);
      expect(f.sent).toEqual(STAGES.slice(0, index));
      expect(f.receipts).toEqual(STAGES.slice(0, index));
      const leg = f.ledger.openLegs()[0]!;
      expect(leg.status).toBe("failed");
      expect(leg.txHash).toBe(index < 2 ? "" : "0x2");
      expect(result.txHash).toBe(index < 2 ? null : "0x2");
      expect(leg.closeTxHash).toBeNull();
      expect(f.plan.expiresAtMs).toBe(originalExpiry);
      const state = f.ledger.state();
      expect(state.executedKeys).toEqual([f.plan.idempotencyKey]);
      expect(Object.values(state.dailyPlans)).toEqual([1]);
      expect(Object.values(state.dailyNotionalUsd)).toEqual([50]);
      expect(state.lastExecutionAtMs).toBe(NOW);
      expect(f.ledger.checkBeforeExecute({
        idempotencyKey: f.plan.idempotencyKey, pairKey: "another_pair", sizeUsd: 1, nowMs: NOW + 1, killSwitchExists: false,
      }, f.policy)).toEqual(expect.arrayContaining(["failed_leg_requires_manual_reconciliation", "idempotency_key_already_executed", "cooldown_active"]));
    });
  }
  test(`${stage} rechecks the guard after asynchronous signer preparation`, async () => {
    const f = fixture((event, clock) => { if (event === `signer_prepare:${stage}`) clock.now = f.plan.expiresAtMs; });
    const result = await f.run();
    expect(result.reasons).toEqual([`${index < 2 ? "send_failed" : "leg2_failed"}: plan_expired_before_${stage}`]);
    expect(f.sent).toEqual(STAGES.slice(0, index));
    expect(f.ledger.openLegs()[0]?.status).toBe("failed");
  });
  test(`${stage} preserves kill-switch precedence when the clock also expires`, async () => {
    const f = fixture((event, clock) => { if (event === expiryEvents[index]) { clock.now = f.plan.expiresAtMs; clock.kill = true; } });
    const result = await f.run();
    expect(result.reasons).toEqual([`${index < 2 ? "send_failed" : "leg2_failed"}: kill_switch_present_before_${stage}`]);
    expect(f.sent).toEqual(STAGES.slice(0, index));
  });
}

test("all four handoffs remain valid immediately before expiry and the round trip completes", async () => {
  const f = fixture((_event, clock) => { clock.now = f.plan.expiresAtMs - 1; });
  const result = await f.run();
  expect(result.status).toBe("completed");
  expect(f.sent).toEqual(STAGES);
  expect(f.receipts).toEqual(STAGES);
  expect(result.txHash).toBe("0x2");
  expect(result.closeTxHash).toBe("0x4");
  expect(result.gasCostNative).toBeCloseTo(0.004, 9);
  expect(f.ledger.state().openLegs[0]?.status).toBe("closed");
});

test("late first-swap receipt preserves its hash and gas before blocking the second approval", async () => {
  const f = fixture((event, clock) => { if (event === "receipt:leg1") clock.now = f.plan.expiresAtMs; });
  const result = await f.run();
  expect(result.status).toBe("sent");
  expect(result.reasons).toEqual(["leg2_failed: plan_expired_before_approve2"]);
  expect(result.txHash).toBe("0x2");
  expect(result.gasCostNative).toBeCloseTo(0.002, 9);
  expect(f.sent).toEqual(["approve1", "leg1"]);
  expect(f.receipts).toEqual(["approve1", "leg1"]);
  expect(f.ledger.openLegs()[0]?.txHash).toBe("0x2");
});

test("late second-approval receipt is observed but the closing swap is not dispatched", async () => {
  const f = fixture((event, clock) => { if (event === "receipt:approve2") clock.now = f.plan.expiresAtMs; });
  const result = await f.run();
  expect(result.reasons).toEqual(["leg2_failed: plan_expired_before_leg2"]);
  expect(f.sent).toEqual(["approve1", "leg1", "approve2"]);
  expect(f.receipts).toEqual(f.sent);
  expect(result.gasCostNative).toBeCloseTo(0.003, 9);
});

for (const receipt of ["success", "revert", "timeout"] as const) {
  test(`closing swap handed off fresh retains its observed ${receipt} after expiry`, async () => {
    const f = fixture((event, clock) => { if (event === "receipt:leg2") clock.now = f.plan.expiresAtMs + 1; });
    if (receipt === "revert") f.receiptResults.revert = "leg2";
    if (receipt === "timeout") f.receiptResults.timeout = "leg2";
    const result = await f.run();
    expect(result.status).toBe(receipt === "success" ? "completed" : "sent");
    expect(f.sent).toEqual(STAGES);
    expect(f.receipts).toEqual(STAGES);
    expect(result.txHash).toBe("0x2");
    const leg = f.ledger.state().openLegs[0]!;
    expect(leg.closeTxHash).toBe("0x4");
    expect(leg.status).toBe(receipt === "success" ? "closed" : "failed");
    expect(leg.note).toBe(receipt === "success" ? null : receipt === "revert" ? "leg2_reverted" : "leg2_failed: synthetic receipt timeout");
  });
}

test("entry and first-prepare expiry remain blocked without consuming the execution ledger", async () => {
  const entry = fixture();
  entry.clock.now = entry.plan.expiresAtMs;
  expect((await entry.run()).reasons).toEqual(["plan_expired"]);
  expect(entry.sent).toEqual([]);
  expect(entry.ledger.state().executedKeys).toEqual([]);
  const prepared = fixture((event, clock) => { if (event === "prepare:leg1") clock.now = prepared.plan.expiresAtMs; });
  expect((await prepared.run()).reasons).toEqual(["plan_expired_after_prepare"]);
  expect(prepared.sent).toEqual([]);
  expect(prepared.ledger.state().executedKeys).toEqual([]);
});
