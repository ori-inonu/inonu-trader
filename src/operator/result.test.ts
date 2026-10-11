import { expect, test } from "bun:test";
import { normalizeInventory, type InventorySnapshot } from "../okx-wallet/portfolio";
import { reconcileRealizedUsd, runOperatorCycle } from "./cycle";
import { buildRoundTripCandidates, DEFAULT_PAIRS, type SwapQuoter } from "./candidates";
import { loadOperatorConfig } from "./config";
import { MockOperatorModel, type OperatorModel } from "./jev-selector";
import { createOperatorLedger, emptyLedger, parseLedger } from "./ledger";
import { executePlan, type ExecutorDeps, type EvmSigner } from "./executor";
import { buildExecutionPlan } from "./plan";

const NOW = 1_760_000_000_000;
const WALLET = "0x0000000000000000000000000000000000000001";
const USDT = "0x1e4a5963abfd975d8c9021ce480b42188849d41d";

function snapshot(at: number, base = "75", gas = "0.200"): InventorySnapshot {
  return normalizeInventory({
    address: WALLET, queriedChains: ["196"], observedAtMs: at, source: "synthetic", riskTokensExcluded: false,
    assets: [
      { chainIndex: "196", tokenContractAddress: "", address: WALLET, symbol: "OKB", balance: gas, rawBalance: "0", tokenPrice: "50", isRiskToken: false },
      { chainIndex: "196", tokenContractAddress: USDT, address: WALLET, symbol: "USDT", balance: base, rawBalance: "0", tokenPrice: "1", isRiskToken: false },
    ],
  });
}

test("observed result includes native gas when the base token increases", () => {
  expect(reconcileRealizedUsd(snapshot(NOW), snapshot(NOW + 1, "75.10", "0.195"), "196", USDT)).toBeCloseTo(-0.15, 9);
});

test("exact decimal quantities retain a small change beyond numeric balance precision", () => {
  const before = snapshot(NOW, "9007199254740992");
  const after = snapshot(NOW + 1, "9007199254740992.1");
  expect(before.chains[0]!.assets[1]!.balance).toBe(after.chains[0]!.assets[1]!.balance);
  expect(reconcileRealizedUsd(before, after, "196", USDT)).toBeCloseTo(0.1, 9);
});

test("invalid quantities and nonfinite USD valuation remain unknown", () => {
  for (const text of ["-1", "1e2", "NaN", "x", "9".repeat(81), "0." + "1".repeat(81)]) {
    expect(reconcileRealizedUsd(snapshot(NOW), snapshot(NOW + 1, text), "196", USDT)).toBeNull();
  }
  const inconsistent = snapshot(NOW + 1);
  inconsistent.chains[0]!.assets[1]!.balanceText = "75.1";
  expect(reconcileRealizedUsd(snapshot(NOW), inconsistent, "196", USDT)).toBeNull();
  for (const price of [0, -1, Infinity, NaN, 1e308]) {
    const before = snapshot(NOW, "0");
    before.chains[0]!.assets[1]!.priceUsd = price;
    expect(reconcileRealizedUsd(before, snapshot(NOW + 1, "10"), "196", USDT)).toBeNull();
  }
});

test("incomplete or mismatched inventory evidence cannot produce an observed result", () => {
  const changes: Array<[string, (before: InventorySnapshot, after: InventorySnapshot) => void]> = [
    ["risk-filtered", (_b, a) => { a.riskTokensExcluded = true; }],
    ["native balance missing", (_b, a) => { a.chains[0]!.nativeBalance = null; }],
    ["native balance negative", (_b, a) => { a.chains[0]!.nativeBalance = -1; }],
    ["native balance nonfinite", (_b, a) => { a.chains[0]!.nativeBalance = Infinity; }],
    ["native balance inconsistent", (_b, a) => { a.chains[0]!.nativeBalance = 0.1; }],
    ["asset balance missing", (_b, a) => { a.chains[0]!.assets[1]!.balance = null; }],
    ["asset balance nonfinite", (_b, a) => { a.chains[0]!.assets[1]!.balance = NaN; }],
    ["native asset missing", (b) => { b.chains[0]!.assets.shift(); }],
    ["price missing", (_b, a) => { a.chains[0]!.assets[0]!.priceUsd = null; }],
    ["chain incomplete", (_b, a) => { a.chains[0]!.valueComplete = false; }],
    ["new asset", (_b, a) => { a.chains[0]!.assets.push({ ...a.chains[0]!.assets[1]!, tokenContractAddress: "0x" + "cd".repeat(20) }); }],
    ["duplicate asset", (b) => { b.chains[0]!.assets.push({ ...b.chains[0]!.assets[1]! }); }],
    ["wallet mismatch", (_b, a) => { a.address = "0x" + "22".repeat(20); }],
    ["source mismatch", (_b, a) => { a.source = "okx_balance_api"; }],
    ["chain metadata mismatch", (_b, a) => { a.chains[0]!.chainName = "wrong"; }],
    ["asset chain mismatch", (_b, a) => { a.chains[0]!.assets[1]!.chainIndex = "143"; }],
    ["native metadata mismatch", (_b, a) => { a.chains[0]!.assets[0]!.native = false; }],
    ["chain not queried", (_b, a) => { a.queriedChains = []; }],
    ["duplicate selected chain", (_b, a) => { a.chains.push({ ...a.chains[0]! }); }],
    ["same observation", (b, a) => { a.observedAtMs = b.observedAtMs; }],
    ["reversed observation", (b, a) => { a.observedAtMs = b.observedAtMs - 1; }],
    ["nonfinite observation", (_b, a) => { a.observedAtMs = NaN; }],
  ];
  for (const [name, change] of changes) {
    const before = snapshot(NOW);
    const after = snapshot(NOW + 1, "75.10", "0.195");
    change(before, after);
    expect(reconcileRealizedUsd(before, after, "196", USDT), name).toBeNull();
  }
});

test("prior prices, residual assets, complete native aliases and chain-specific identities govern the diagnostic", () => {
  const before = snapshot(NOW);
  const after = snapshot(NOW + 1, "75.10", "0.195");
  after.chains[0]!.assets[0]!.priceUsd = 500;
  after.chains[0]!.assets[1]!.priceUsd = 2;
  expect(reconcileRealizedUsd(before, after, "196", USDT.toUpperCase().replace("0X", "0x"))).toBeCloseTo(-0.15, 9);
  expect(reconcileRealizedUsd(before, after, "196", "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")).toBeCloseTo(-0.15, 9);
  expect(reconcileRealizedUsd(before, after, "196", "0xEeee" + "a".repeat(36))).toBeNull();
  const residual = { ...before.chains[0]!.assets[1]!, tokenContractAddress: "0x" + "cd".repeat(20), symbol: "RES", priceUsd: 2, balance: 0, balanceText: "0" };
  before.chains[0]!.assets.push(residual);
  after.chains[0]!.assets.push({ ...residual, balance: 0.02, balanceText: "0.02" });
  expect(reconcileRealizedUsd(before, after, "196", USDT)).toBeCloseTo(-0.11, 9);
  const incompleteOther = normalizeInventory({
    address: WALLET, queriedChains: ["1"], observedAtMs: NOW, source: "synthetic", riskTokensExcluded: false,
    assets: [{ chainIndex: "1", tokenContractAddress: "", address: WALLET, symbol: "ETH", balance: "1", rawBalance: "0", tokenPrice: "", isRiskToken: false }],
  }).chains[0]!;
  expect(incompleteOther.valueComplete).toBe(false);
  before.chains.push(incompleteOther);
  after.chains.push({ ...incompleteOther });
  before.queriedChains.push("1");
  after.queriedChains.push("1");
  before.valueComplete = false;
  after.valueComplete = false;
  expect(reconcileRealizedUsd(before, after, "196", USDT)).toBeCloseTo(-0.11, 9);

  const address = "A".repeat(32);
  const token = "B".repeat(32);
  const sol = (at: number) => normalizeInventory({
    address, queriedChains: ["501"], observedAtMs: at, source: "synthetic", riskTokensExcluded: false,
    assets: [
      { chainIndex: "501", tokenContractAddress: "", address, symbol: "SOL", balance: "1", rawBalance: "0", tokenPrice: "10", isRiskToken: false },
      { chainIndex: "501", tokenContractAddress: token, address, symbol: "USD", balance: "1", rawBalance: "0", tokenPrice: "1", isRiskToken: false },
    ],
  });
  expect(reconcileRealizedUsd(sol(NOW), sol(NOW + 1), "501", "1".repeat(32))).toBe(0);
  expect(reconcileRealizedUsd(sol(NOW), sol(NOW + 1), "501", "1".repeat(33))).toBeNull();
  expect(reconcileRealizedUsd(sol(NOW), sol(NOW + 1), "501", token.toLowerCase())).toBeNull();
  const mismatched = sol(NOW + 1);
  mismatched.address = address.toLowerCase();
  expect(reconcileRealizedUsd(sol(NOW), mismatched, "501", token)).toBeNull();
});

test("failed inventory reconciliation and unknown inference allowance keep a persistent global block", async () => {
  let statusAtInventoryRead: string | undefined;
  const result = await offlineCycle(async (executor) => {
    statusAtInventoryRead = executor.ledger.state().openLegs[0]?.status;
    throw new Error("offline inventory unavailable");
  }, null);
  expect(statusAtInventoryRead).toBe("reconciliation_required");
  expect(result.cycle.execution).toMatchObject({ status: "completed", observedBalanceDeltaUsd: null, realizedUsd: null, resultBasis: "inventory_only", txHash: "0x2", closeTxHash: "0x3" });
  expect(result.cycle.warnings).toContain("reconciliation_failed");
  expect(result.cycle.warnings).toContain("result_attribution_unverified");
  expect(result.cycle.inferenceUsd).toBeNull();
  expect(result.ledger.dayRealizedUsd(NOW)).toBe(1.25);
  const restored = createOperatorLedger(parseLedger(JSON.parse(JSON.stringify(result.ledger.state()))), () => {});
  expect(restored.openLegs()[0]).toMatchObject({ status: "reconciliation_required", txHash: "0x2", closeTxHash: "0x3" });
  const reasons = restored.checkBeforeExecute({ idempotencyKey: "different_key", pairKey: "different_pair", sizeUsd: 1, nowMs: NOW + result.policy.cooldownMs + 1, killSwitchExists: false }, result.policy);
  expect(reasons).toContain("unattributed_result_requires_reconciliation");
  expect(result.sendCount()).toBe(3);

  restored.recordRealized(NOW, -result.policy.maxDailyLossUsd - 1.25);
  const allReasons = restored.checkBeforeExecute({ idempotencyKey: result.cycle.plan!.idempotencyKey, pairKey: result.candidate.pairKey, sizeUsd: result.policy.maxDailyNotionalUsd + 1, nowMs: NOW, killSwitchExists: true }, { ...result.policy, maxDailyPlans: 1, maxWeeklyLossUsd: result.policy.maxDailyLossUsd, maxDrawdownUsd: result.policy.maxDailyLossUsd });
  for (const reason of ["kill_switch_present", "idempotency_key_already_executed", "daily_notional_cap", "daily_plan_cap", "cooldown_active", "daily_loss_stop", "weekly_loss_stop", "drawdown_stop", "open_leg_on_pair", "unattributed_result_requires_reconciliation"]) expect(allReasons).toContain(reason);
});

async function offlineCycle(afterSource: (executor: ExecutorDeps) => Promise<InventorySnapshot>, rate: number | null = 1) {
  const before = snapshot(NOW);
  const policy = loadOperatorConfig({ OPERATOR_PROFILE: "standard" }).policy;
  const gate = { operatorExecute: true, operatorLiveAck: true, realModel: true, signerAvailable: true };
  const swapQuoter: SwapQuoter = {
    unitsQualified: true,
    async quote(input) {
      const amount = BigInt(input.amountAtomic);
      const toAmount = input.fromTokenAddress.toLowerCase() === USDT
        ? amount * 10n ** 12n : amount * 101n / 100n / 10n ** 12n;
      return { fromAmountAtomic: input.amountAtomic, toAmountAtomic: toAmount.toString(), priceImpactPercent: -0.02, tradeFeeUsd: 0.01, receivedAtMs: NOW };
    },
  };
  const pairs = DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196");
  const [candidate] = await buildRoundTripCandidates({ inventory: before, policy, nowMs: NOW, swapQuoter, pairs });
  const router = "0x" + "ab".repeat(20);
  let sends = 0;
  const signer: EvmSigner = { address: WALLET, async sendTransaction() { return `0x${++sends}`; }, async waitForReceipt() { return { success: true, gasCostNative: 0.001 }; }, async simulate() { return true; } };
  const spender = "0x" + "5e".repeat(20);
  const selector = "0xdeadbeef";
  const tradeClient = { async get(path: string, params: Record<string, string>) {
    if (path.endsWith("approve-transaction")) return [{ dexContractAddress: spender }];
    const minReceive = params.fromTokenAddress === candidate!.from.tokenContractAddress ? candidate!.expectedLeg1OutAtomic! : candidate!.expectedOutAtomic!;
    return [{ tx: { to: router, data: selector + "00ff", value: params.fromTokenAddress!.toLowerCase().startsWith("0xeeee") ? params.amount : "0", gas: "200000", minReceiveAmount: minReceive } }];
  } } as never;
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  ledger.recordRealized(NOW, 1.25); // Existing historical amount must not be reclassified or overwritten.
  const executor: ExecutorDeps = { now: () => NOW, slippagePercent: 0.5, ledger, policy: { ...policy, routerAllowlist: { "196": [router] }, spenderAllowlist: { "196": [spender] }, selectorAllowlist: { "196": [selector] } }, inventoryAddress: WALLET, killSwitchExists: () => false, tradeClient, evmSigner: signer };
  const model: OperatorModel = { name: "offline", async choose(state, eligible) { return { ...await new MockOperatorModel().choose(state, eligible), model: this.name, inputTokens: 1_000_000 }; } };
  let reads = 0;
  const cycle = await runOperatorCycle({
    inventorySource: async () => reads++ === 0 ? before : afterSource(executor), model, policy, gate, now: () => NOW, jevUsdPerMTok: rate,
    candidateContext: { swapQuoter, pairs }, executor,
  });
  return { cycle, ledger, executor, candidate: candidate!, policy, gate, reads, sends, sendCount: () => sends };
}

test("a completed offline cycle reports inventory movement without recording it as realized profit", async () => {
  const { cycle, ledger, reads, sends } = await offlineCycle(async () => snapshot(NOW + 1, "75.10", "0.195"));
  expect(cycle.execution.status).toBe("completed");
  expect(cycle.execution.realizedUsd).toBeNull();
  expect(cycle.execution.observedBalanceDeltaUsd).toBeCloseTo(-0.15, 9);
  expect(cycle.execution.resultBasis).toBe("inventory_only");
  expect(cycle.warnings).toContain("realized_result_unknown");
  expect(cycle.warnings).toContain("result_attribution_unverified");
  expect(cycle.ledger!.dayRealizedUsd).toBe(1.25);
  expect(ledger.dayRealizedUsd(NOW)).toBe(1.25);
  expect(cycle.inferenceUsd).toBe(1);
  expect(reads).toBe(2);
  expect(sends).toBe(3);
});

test("an unattributed completed cycle retains both hashes and blocks another pair before any new send", async () => {
  let statusAtInventoryRead: string | undefined;
  const result = await offlineCycle(async (executor) => {
    statusAtInventoryRead = executor.ledger.state().openLegs[0]?.status;
    return snapshot(NOW + 1, "75.10", "0.195");
  });
  const later = NOW + result.policy.cooldownMs + 1;
  const anotherPair = { ...result.candidate, id: "another_candidate", pairKey: "another_pair", quoteHash: "another_quote" };
  const decision = { ...result.cycle.decision!, choice: anotherPair.id, probabilities: { hold: 0, [anotherPair.id]: 1 } };
  const plan = buildExecutionPlan(anotherPair, decision, result.policy, result.gate, later);
  const execution = await executePlan(plan, anotherPair, { ...result.executor, now: () => later }, { model: decision.model, decision, eligible: [anotherPair] });
  expect(execution.status).toBe("blocked");
  expect(execution.reasons).toContain("unattributed_result_requires_reconciliation");
  expect(result.sendCount()).toBe(3);
  expect(statusAtInventoryRead).toBe("reconciliation_required");
  const leg = result.ledger.state().openLegs[0]!;
  expect(leg.status).toBe("reconciliation_required");
  expect(leg.txHash).toBe(result.cycle.execution.txHash!);
  expect(leg.closeTxHash).toBe(result.cycle.execution.closeTxHash!);
  expect(leg.txHash).toBe("0x2");
  expect(leg.closeTxHash).toBe("0x3");
  expect(result.cycle.warnings).toContain("open_legs_awaiting_reconciliation");
});

