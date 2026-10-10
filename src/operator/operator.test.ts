import { expect, test } from "bun:test";
import { syntheticInventory, type InventorySnapshot } from "../okx-wallet/portfolio";
import { buildCandidates, buildRoundTripCandidates, DEFAULT_PAIRS, sizeFor, type BridgeQuoter, type SwapQuoter } from "./candidates";
import { loadOperatorConfig } from "./config";
import { reconcileRealizedUsd, runOperatorCycle, redactCycle } from "./cycle";
import { encodeApprove, executePlan, minReceiveMatchesQuote, type EvmSigner } from "./executor";
import { createOperatorLedger, emptyLedger } from "./ledger";
import { buildOperatorState, MockOperatorModel, validateOperatorDecision, type OperatorModel } from "./jev-selector";
import { buildExecutionPlan } from "./plan";
import { gateCandidate, gateCandidates } from "./risk-gate";
import type { OperatorPolicy, OpportunityCandidate } from "./types";

const NOW = 1_760_000_000_000;
const policy: OperatorPolicy = loadOperatorConfig({ OPERATOR_PROFILE: "standard" }).policy;
const openGate = { operatorExecute: true, dryRun: false, liveAck: true, signerAvailable: true };
const closedGate = { operatorExecute: false, dryRun: true, liveAck: false, signerAvailable: false };

function quoter(edgeFraction: number, feeUsd: number | null = 0.01, receivedAtMs = NOW, unitsQualified = true): SwapQuoter {
  return {
    unitsQualified,
    async quote(input) {
      const amount = BigInt(input.amountAtomic);
      const native = input.fromTokenAddress.startsWith("0xEeee") || input.fromTokenAddress === "11111111111111111111111111111111";
      // Base to counter: scale 6 -> 18 (or 9); counter back to base: inverse with the edge applied on the return leg.
      const toAmount = native
        ? (amount * BigInt(Math.round((1 + edgeFraction) * 1_000_000))) / BigInt(1_000_000) / BigInt(10) ** BigInt(input.chainIndex === "501" ? 3 : 12)
        : amount * BigInt(10) ** BigInt(input.chainIndex === "501" ? 3 : 12);
      return { fromAmountAtomic: input.amountAtomic, toAmountAtomic: toAmount.toString(), priceImpactPercent: -0.02, tradeFeeUsd: feeUsd, receivedAtMs };
    },
  };
}

test("operator config has conservative defaults and validates overrides", () => {
  const config = loadOperatorConfig({});
  expect(config.execute).toBe(false);
  expect(config.profile).toBe("micro");
  expect(config.policy.maxPlanUsd).toBe(5);
  expect(config.policy.maxDailyPlans).toBe(4);
  expect(config.policy.cooldownMs).toBe(15 * 60_000);
  expect(loadOperatorConfig({ OPERATOR_PROFILE: "standard" }).policy.maxPlanUsd).toBe(25);
  expect(loadOperatorConfig({ OPERATOR_PROFILE: "micro", OPERATOR_MAX_PLAN_USD: "7" }).policy.maxPlanUsd).toBe(7);
  expect(() => loadOperatorConfig({ OPERATOR_PROFILE: "yolo" })).toThrow("Invalid OPERATOR_PROFILE");
  expect(config.chains).toContain("501");
  expect(config.okx).toBeNull();
  expect(() => loadOperatorConfig({ OPERATOR_EXECUTE: "yes" })).toThrow("Invalid OPERATOR_EXECUTE");
  expect(() => loadOperatorConfig({ OPERATOR_CHAINS: "196,abc" })).toThrow("Invalid chain list");
  expect(() => loadOperatorConfig({ OPERATOR_RPC_196: "ftp://x" })).toThrow("Invalid OPERATOR_RPC_196");
  const live = loadOperatorConfig({ OKX_WEB3_API_KEY: "k", OKX_WEB3_API_SECRET: "s", OKX_WEB3_API_PASSPHRASE: "p", OPERATOR_CHAINS: "196,501", OPERATOR_RPC_196: "https://rpc.xlayer.tech" });
  expect(live.okx).toEqual({ apiKey: "k", secretKey: "s", passphrase: "p" });
  expect(live.rpcByChain).toEqual({ "196": "https://rpc.xlayer.tech" });
});

test("sizes a plan by policy caps and never above ninety percent of the asset", () => {
  const inventory = syntheticInventory(NOW);
  const usdt = inventory.chains.find((chain) => chain.chainIndex === "196")!.assets.find((asset) => asset.symbol === "USDT")!;
  expect(sizeFor(usdt, inventory, policy)).toBe(25);
  expect(sizeFor(usdt, inventory, { ...policy, maxPlanUsd: 1000 })).toBeCloseTo(inventory.knownValueUsd * 0.25, 1);
  expect(sizeFor(usdt, inventory, { ...policy, maxPlanUsd: 1000, maxCapitalFraction: 1 })).toBe(67.5);
  const solUsdc = inventory.chains.find((chain) => chain.chainIndex === "501")!.assets.find((asset) => asset.symbol === "USDC")!;
  expect(sizeFor(solUsdc, inventory, policy)).toBeNull();
});

test("round-trip candidates carry conservative net after fees and a quote hash; unknown fees block", async () => {
  const inventory = syntheticInventory(NOW);
  const candidates = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW + 1_000, swapQuoter: quoter(0.01) });
  const xlayer = candidates.find((candidate) => candidate.id === "rt_196_usdt_okb")!;
  expect(xlayer.sizeUsd).toBe(25);
  expect(xlayer.sizeAtomic).toBe("25000000");
  expect(xlayer.netUsd).toBeCloseTo(0.25 - 0.02 - policy.inferenceUsdPerCandidate, 6);
  expect(xlayer.quoteAgeMs).toBe(1_000);
  expect(xlayer.quoteHash).toHaveLength(32);
  expect(candidates.find((candidate) => candidate.id.startsWith("rt_501"))).toBeUndefined();
  const verdicts = gateCandidates(candidates, inventory, policy);
  expect(verdicts.find((verdict) => verdict.candidateId === "rt_196_usdt_okb")!.eligible).toBe(true);

  const unknownFees = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(0.01, null) });
  const verdict = gateCandidate(unknownFees[0]!, inventory, policy);
  expect(verdict.eligible).toBe(false);
  expect(verdict.reasons).toContain("costs_incomplete");
  expect(verdict.reasons).toContain("net_unknown");

  const unqualified = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(0.01, 0.01, NOW, false) });
  expect(unqualified[0]!.researchOnly).toBe(true);
  expect(gateCandidate(unqualified[0]!, inventory, policy).reasons).toContain("research_only");
});

test("gate rejects stale quotes, negative net, missing gas and oversized plans with reasons", async () => {
  const inventory = syntheticInventory(NOW);
  const [stale] = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW + 60_000, swapQuoter: quoter(0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") });
  expect(gateCandidate(stale!, inventory, policy).reasons).toEqual(["quote_stale"]);
  const [losing] = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(-0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") });
  expect(gateCandidate(losing!, inventory, policy).reasons).toEqual(["net_below_minimum"]);
  const noGas: InventorySnapshot = { ...inventory, chains: inventory.chains.map((chain) => chain.chainIndex === "196" ? { ...chain, nativeBalance: 0 } : chain) };
  const [fine] = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") });
  expect(gateCandidate(fine!, noGas, policy).reasons).toEqual(["gas_below_reserve"]);
  expect(gateCandidate({ ...fine!, sizeUsd: 1000 }, inventory, policy).reasons).toEqual(expect.arrayContaining(["source_balance_insufficient", "size_above_max_plan", "size_above_capital_fraction"]));
  expect(() => gateCandidates([{ ...fine!, id: "hold" }], inventory, policy)).toThrow("Invalid candidate id");
});

test("Kuru mandate is eligible without quotes, research candidates never are", async () => {
  const inventory = syntheticInventory(NOW);
  const candidates = await buildCandidates({ inventory, policy, nowMs: NOW });
  const kuru = candidates.find((candidate) => candidate.kind === "kuru_spot_maker")!;
  expect(gateCandidate(kuru, inventory, policy).eligible).toBe(true);
  const research: OpportunityCandidate = { ...kuru, id: "meme_501_abc", kind: "memepump_research", researchOnly: true };
  expect(gateCandidate(research, inventory, policy).reasons).toContain("research_only");
});

test("Jev state is sanitized and decisions are validated against the eligible set", async () => {
  const inventory = syntheticInventory(NOW);
  const candidates = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(0.01) });
  const state = buildOperatorState(inventory, candidates);
  const serialized = JSON.stringify(state);
  expect(serialized).not.toContain(inventory.address);
  expect(serialized).not.toContain("0x754704");
  expect(state.candidates[0]!.netBps).toBeGreaterThan(0);
  const decision = await new MockOperatorModel().choose(state, candidates);
  expect(decision.choice).toBe("rt_143_usdc_mon");
  expect(Object.keys(decision.probabilities)).toEqual(["hold", ...candidates.map((candidate) => candidate.id)]);
  expect(() => validateOperatorDecision({ ...decision, choice: "rt_1_usdc_eth" }, candidates)).toThrow("unknown candidate");
  const half = Object.fromEntries(Object.keys(decision.probabilities).map((key) => [key, 0.5]));
  expect(() => validateOperatorDecision({ ...decision, probabilities: half }, candidates)).toThrow("do not sum to one");
  expect(() => validateOperatorDecision({ ...decision, probabilities: { hold: 1 } }, candidates)).toThrow("Invalid operator probabilities");
});

test("plans are bounded, idempotent and not live unless every gate opens", async () => {
  const inventory = syntheticInventory(NOW);
  const [candidate] = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") });
  const decision = await new MockOperatorModel().choose(buildOperatorState(inventory, [candidate!]), [candidate!]);
  const dry = buildExecutionPlan(candidate!, decision, policy, closedGate, NOW);
  expect(dry.executionQualification).toBe("qualified_dry_run");
  expect(dry.steps.map((step) => step.kind)).toEqual(["approve", "swap", "swap"]);
  expect(dry.maxLossUsd).toBe(25);
  expect(dry.expiresAtMs).toBe(NOW + policy.planTtlMs);
  expect(buildExecutionPlan(candidate!, decision, policy, closedGate, NOW + 10).idempotencyKey).toBe(dry.idempotencyKey);
  expect(buildExecutionPlan(candidate!, decision, policy, { ...openGate, signerAvailable: false }, NOW).executionQualification).toBe("qualified_dry_run");
  expect(buildExecutionPlan(candidate!, decision, policy, openGate, NOW).executionQualification).toBe("qualified_live");
  expect(() => buildExecutionPlan(candidate!, { ...decision, choice: "hold" }, policy, openGate, NOW)).toThrow("does not match");
});

test("executor blocks dry runs, expired plans, address mismatch, unknown routers and repeats; completes both legs once when qualified", async () => {
  const inventory = syntheticInventory(NOW);
  const [candidate] = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") });
  const decision = await new MockOperatorModel().choose(buildOperatorState(inventory, [candidate!]), [candidate!]);
  const sent: { to: string; data: string }[] = [];
  const signer: EvmSigner = {
    address: inventory.address,
    async sendTransaction(tx) { sent.push({ to: tx.to, data: tx.data }); return `0x${sent.length}`; },
    async waitForReceipt() { return true; },
  };
  const router = "0x" + "ab".repeat(20);
  const usdt = candidate!.from.tokenContractAddress;
  const tradeClient = { async get(_path: string, params: Record<string, string>) {
    const minReceive = params.fromTokenAddress === usdt ? candidate!.expectedLeg1OutAtomic! : candidate!.expectedOutAtomic!;
    return [{ tx: { to: router, data: "0xdead", value: "0", gas: "200000", minReceiveAmount: minReceive, signatureData: [{ to: "0x" + "ee".repeat(20), data: "0xbad" }] } }];
  } } as never;
  const allowPolicy = { ...policy, routerAllowlist: { "196": [router] } };
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  const base = { now: () => NOW, slippagePercent: 0.5, ledger, policy: allowPolicy, inventoryAddress: inventory.address, killSwitchExists: () => false, tradeClient, evmSigner: signer };
  const dry = buildExecutionPlan(candidate!, decision, policy, closedGate, NOW);
  expect((await executePlan(dry, candidate!, base)).status).toBe("dry_run");
  const live = buildExecutionPlan(candidate!, decision, policy, openGate, NOW);
  expect((await executePlan(live, candidate!, { ...base, now: () => NOW + policy.planTtlMs + 1 })).reasons).toEqual(["plan_expired"]);
  expect((await executePlan(live, candidate!, { ...base, inventoryAddress: "0x" + "11".repeat(20) })).reasons).toEqual(["signer_address_differs_from_inventory_address"]);
  expect((await executePlan(live, candidate!, { ...base, policy })).reasons).toEqual(["router_not_allowlisted"]);
  expect((await executePlan(live, candidate!, { ...base, killSwitchExists: () => true })).reasons).toEqual(["kill_switch_present"]);
  const tron = { ...candidate!, chainIndex: "195" };
  expect((await executePlan({ ...live, candidateId: tron.id }, tron, base)).reasons).toEqual(["signer_unavailable_for_chain_family"]);
  expect(sent).toHaveLength(0);

  const outcome = await executePlan(live, candidate!, base);
  expect(outcome.status).toBe("completed");
  expect(outcome.txHash).toBe("0x2");
  expect(outcome.closeTxHash).toBe("0x3");
  expect(sent.map((tx) => tx.to)).toEqual([usdt, router, router]);
  expect(sent[0]!.data).toBe(encodeApprove(router, candidate!.sizeAtomic));
  expect(sent[0]!.data).not.toContain("bad");
  expect(ledger.openLegs()).toHaveLength(0);
  expect(ledger.state().dailyPlans[new Date(NOW).toISOString().slice(0, 10)]).toBe(1);
  expect((await executePlan(live, candidate!, { ...base, now: () => NOW + 1 })).reasons).toEqual(["idempotency_key_already_executed", "cooldown_active"]);

  expect(minReceiveMatchesQuote("995", "1000", 0.5)).toBe(true);
  expect(minReceiveMatchesQuote("994", "1000", 0.5)).toBe(false);
  const lowClient = { async get() { return [{ tx: { to: router, data: "0xdead", value: "0", gas: "1", minReceiveAmount: "1" } }]; } } as never;
  const fresh = createOperatorLedger(emptyLedger(), () => {});
  expect((await executePlan(live, candidate!, { ...base, ledger: fresh, tradeClient: lowClient })).reasons).toEqual(["min_receive_below_quote"]);
});

test("a completed plan is reconciled against a fresh inventory and recorded in the ledger", async () => {
  const before = syntheticInventory(NOW);
  const after: InventorySnapshot = { ...before, chains: before.chains.map((chain) => chain.chainIndex === "196"
    ? { ...chain, assets: chain.assets.map((asset) => asset.symbol === "USDT" ? { ...asset, balance: 75.12, balanceText: "75.12", valueUsd: 75.12 } : asset) }
    : chain) };
  expect(reconcileRealizedUsd(before, after, "196", "0x1E4a5963aBFD975d8c9021ce480b42188849D41d")).toBeCloseTo(0.12, 9);
  expect(reconcileRealizedUsd(before, after, "501", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBeNull();
  expect(reconcileRealizedUsd(before, after, "143", "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")).toBe(0);

  const [candidate] = await buildRoundTripCandidates({ inventory: before, policy, nowMs: NOW, swapQuoter: quoter(0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") });
  const router = "0x" + "ab".repeat(20);
  const signer: EvmSigner = { address: before.address, async sendTransaction() { return "0xaa"; }, async waitForReceipt() { return true; } };
  const tradeClient = { async get(_path: string, params: Record<string, string>) {
    const minReceive = params.fromTokenAddress === candidate!.from.tokenContractAddress ? candidate!.expectedLeg1OutAtomic! : candidate!.expectedOutAtomic!;
    return [{ tx: { to: router, data: "0xdead", value: "0", gas: "200000", minReceiveAmount: minReceive } }];
  } } as never;
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  let reads = 0;
  const cycle = await runOperatorCycle({
    inventorySource: async () => (reads++ === 0 ? before : after), model: new MockOperatorModel(), policy, gate: openGate, now: () => NOW, jevUsdPerMTok: 0,
    candidateContext: { swapQuoter: quoter(0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") },
    executor: { now: () => NOW, slippagePercent: 0.5, ledger, policy: { ...policy, routerAllowlist: { "196": [router] } }, inventoryAddress: before.address, killSwitchExists: () => false, tradeClient, evmSigner: signer },
  });
  expect(cycle.execution.status).toBe("completed");
  expect(cycle.execution.realizedUsd).toBeCloseTo(0.12, 9);
  expect(cycle.ledger!.dayRealizedUsd).toBeCloseTo(0.12, 9);
  expect(reads).toBe(2);
});

test("a reverted first leg leaves a failed leg that blocks every later plan", async () => {
  const inventory = syntheticInventory(NOW);
  const [candidate] = await buildRoundTripCandidates({ inventory, policy, nowMs: NOW, swapQuoter: quoter(0.01), pairs: DEFAULT_PAIRS.filter((pair) => pair.chainIndex === "196") });
  const decision = await new MockOperatorModel().choose(buildOperatorState(inventory, [candidate!]), [candidate!]);
  const router = "0x" + "ab".repeat(20);
  let sends = 0;
  const signer: EvmSigner = { address: inventory.address, async sendTransaction() { sends++; return `0x${sends}`; }, async waitForReceipt(_c, hash) { return hash !== "0x2"; } };
  const tradeClient = { async get() { return [{ tx: { to: router, data: "0xdead", value: "0", gas: "200000", minReceiveAmount: candidate!.expectedLeg1OutAtomic } }]; } } as never;
  const ledger = createOperatorLedger(emptyLedger(), () => {});
  const live = buildExecutionPlan(candidate!, decision, policy, openGate, NOW);
  const deps = { now: () => NOW, slippagePercent: 0.5, ledger, policy: { ...policy, routerAllowlist: { "196": [router] } }, inventoryAddress: inventory.address, killSwitchExists: () => false, tradeClient, evmSigner: signer };
  const outcome = await executePlan(live, candidate!, deps);
  expect(outcome).toMatchObject({ status: "failed", reasons: ["leg1_reverted"], txHash: "0x2" });
  expect(ledger.openLegs()[0]!.status).toBe("failed");
  const other = { ...candidate!, id: "rt_other", pairKey: "other", quoteHash: "zz" };
  const otherPlan = buildExecutionPlan(other, { ...decision, choice: other.id, probabilities: { ...decision.probabilities, rt_other: decision.probabilities[candidate!.id]! } }, policy, openGate, NOW + 200_000);
  expect((await executePlan(otherPlan, other, { ...deps, now: () => NOW + 200_000 })).reasons).toEqual(["failed_leg_requires_manual_reconciliation"]);
});

test("a full cycle asks Jev only with eligible candidates, journals hold without inference and redacts the address", async () => {
  const inventory = syntheticInventory(NOW);
  let asked = 0;
  const model: OperatorModel = { name: "probe", async choose(state, eligible) { asked++; return new MockOperatorModel().choose(state, eligible); } };
  const bridgeQuoter: BridgeQuoter = { qualified: true, async quote(input) { return { fromAmountAtomic: input.amountAtomic, toAmountAtomic: input.amountAtomic, minimumReceivedAtomic: null, totalFeeUsd: 0.8, estimatedMinutes: 5, receivedAtMs: NOW }; } };
  const cycle = await runOperatorCycle({
    inventorySource: async () => inventory, model, policy, gate: closedGate, now: () => NOW, jevUsdPerMTok: 0.042,
    candidateContext: { swapQuoter: quoter(0.01), bridgeQuoter, homeChainIndex: "143" },
  });
  expect(asked).toBe(1);
  expect(cycle.eligibleIds).toEqual(["kuru_mon_usdc_maker", "rt_143_usdc_mon", "rt_196_usdt_okb"]);
  expect(cycle.verdicts.find((verdict) => verdict.candidateId === "br_196_143_usdt")!.reasons).toContain("net_below_minimum");
  expect(cycle.decision!.choice).toBe("rt_143_usdc_mon");
  expect(cycle.plan!.executionQualification).toBe("qualified_dry_run");
  expect(cycle.execution.status).toBe("dry_run");
  expect(cycle.inferenceUsd).toBeGreaterThan(0);
  expect(cycle.warnings).toContain("inventory_value_incomplete");
  expect(redactCycle(cycle).inventory.address).toBe("0x0000...0001");

  const quiet = await runOperatorCycle({ inventorySource: async () => ({ ...inventory, chains: inventory.chains.filter((chain) => chain.chainIndex === "501") }), model, policy, gate: closedGate, now: () => NOW, jevUsdPerMTok: 0.042, candidateContext: { swapQuoter: quoter(0.01) } });
  expect(asked).toBe(1);
  expect(quiet.decision).toBeNull();
  expect(quiet.execution.reasons).toEqual(["no_eligible_candidate"]);
  expect(quiet.inferenceUsd).toBe(0);
});
