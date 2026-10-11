import { chainByIndex } from "../okx-wallet/chains";
import { EVM_NATIVE_PLACEHOLDER } from "./candidates";
import type { SolanaSigner } from "../okx-wallet/solana-signer";
import { fetchApproveSpender, prepareEvmSwap, type OkxTradeClient, type PreparedEvmTransaction } from "../okx-wallet/trade";
import type { OperatorLedger } from "./ledger";
import { planIsFresh } from "./plan";
import type { ExecutionOutcome, ExecutionPlan, OperatorPolicy, OpportunityCandidate } from "./types";

/**
 * Execution is the last, separately gated stage. A plan is sent only when it is
 * qualified_live, fresh, allowed by the persistent ledger (daily, weekly and
 * drawdown caps, cooldown, kill switch, no open leg on the pair), and when the
 * prepared transaction passes every static check: router, spender and selector
 * allowlists, exact value, gas limit cap, minimum output within the slippage cap
 * and a successful eth_call simulation (R5 F2). The kill switch is read again
 * before every send (R5 F4), together with the fixed plan expiry. Approvals are built locally for the exact amount
 * to the spender OKX reports; remote approval calldata is never forwarded.
 * Solana execution is disabled until a transaction policy exists (R5 C1, F1).
 */
export const SOLANA_LIVE_ENABLED = false;

export interface EvmSigner {
  readonly address: string;
  /** Invoke beforeSubmit synchronously after asynchronous preparation, immediately before SDK handoff; propagate a thrown guard. */
  sendTransaction(tx: { chainIndex: string; to: string; data: string; value: string; gasLimit: string }, beforeSubmit: () => void): Promise<string>;
  /** Resolves with the receipt status and the native gas cost paid; throws on timeout. */
  waitForReceipt(chainIndex: string, txHash: string, timeoutMs: number): Promise<{ success: boolean; gasCostNative: number | null }>;
  /** eth_call with the same calldata; resolves false when the call reverts. */
  simulate(tx: { chainIndex: string; to: string; data: string; value: string }): Promise<boolean>;
}

export interface ExecutorDeps {
  tradeClient?: OkxTradeClient;
  evmSigner?: EvmSigner;
  solanaSigner?: SolanaSigner;
  ledger: OperatorLedger;
  policy: OperatorPolicy;
  /** Address the inventory was read for; must equal the signer address. */
  inventoryAddress: string;
  now: () => number;
  slippagePercent: number;
  killSwitchExists: () => boolean;
  receiptTimeoutMs?: number;
}

const APPROVE_SELECTOR = "0x095ea7b3";

function isNativeEvm(tokenContractAddress: string): boolean {
  return tokenContractAddress.toLowerCase() === EVM_NATIVE_PLACEHOLDER.toLowerCase();
}

export function encodeApprove(spender: string, amountAtomic: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(spender)) throw new Error("Invalid spender");
  if (!/^(0|[1-9]\d{0,77})$/.test(amountAtomic) || BigInt(amountAtomic) >= BigInt(2) ** BigInt(256)) throw new Error("Invalid approve amount");
  return APPROVE_SELECTOR + spender.slice(2).toLowerCase().padStart(64, "0") + BigInt(amountAtomic).toString(16).padStart(64, "0");
}

/** Removes URLs, hex blobs and base58 blobs so journals never carry RPC hosts, calldata or keys (R5 M1, F7). */
export function sanitizeError(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown";
  return text
    .replace(/https?:\/\/[^\s"']+/g, "[url]")
    .replace(/0x[0-9a-fA-F]{16,}/g, "[hex]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,}\b/g, "[b58]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function blocked(reasons: string[]): ExecutionOutcome {
  return { status: "blocked", reasons, txHash: null, orderId: null };
}

function failed(reason: string, txHash: string | null = null): ExecutionOutcome {
  return { status: "failed", reasons: [reason], txHash, orderId: null };
}

function inList(list: string[] | undefined, address: string, evm: boolean): boolean {
  return (list ?? []).some((entry) => evm ? entry.toLowerCase() === address.toLowerCase() : entry === address);
}

/** True when `minReceive` is at least the quoted output reduced by the slippage cap. */
export function minReceiveMatchesQuote(minReceiveAtomic: string, quotedOutAtomic: string, slippagePercent: number): boolean {
  const quoted = BigInt(quotedOutAtomic);
  const floor = (quoted * BigInt(Math.round((100 - slippagePercent) * 10_000))) / BigInt(1_000_000);
  return BigInt(minReceiveAtomic) >= floor;
}

/**
 * Static checks on one prepared leg (R5 F2). Every list is mandatory for live:
 * a missing router, spender or selector allowlist refuses the leg.
 */
export function checkPreparedLeg(prepared: PreparedEvmTransaction, input: { chainIndex: string; fromNative: boolean; amountAtomic: string; expectedOutAtomic: string; slippagePercent: number; policy: OperatorPolicy }): string[] {
  const reasons: string[] = [];
  const { policy, chainIndex } = input;
  if (!(policy.routerAllowlist[chainIndex] ?? []).length) reasons.push("router_allowlist_missing");
  else if (!inList(policy.routerAllowlist[chainIndex], prepared.to, true)) reasons.push("router_not_allowlisted");
  const selectors = policy.selectorAllowlist[chainIndex] ?? [];
  const selector = prepared.data.slice(0, 10).toLowerCase();
  if (!selectors.length) reasons.push("selector_allowlist_missing");
  else if (prepared.data.length < 10 || !selectors.includes(selector)) reasons.push("selector_not_allowlisted");
  const expectedValue = input.fromNative ? input.amountAtomic : "0";
  if (BigInt(prepared.value) !== BigInt(expectedValue)) reasons.push("value_mismatch");
  if (BigInt(prepared.gas) > BigInt(policy.maxGasLimit)) reasons.push("gas_limit_above_maximum");
  if (prepared.minReceiveAmount === null) reasons.push("min_receive_unknown");
  else if (!minReceiveMatchesQuote(prepared.minReceiveAmount, input.expectedOutAtomic, input.slippagePercent)) reasons.push("min_receive_below_quote");
  return reasons;
}

export async function executePlan(plan: ExecutionPlan, candidate: OpportunityCandidate, deps: ExecutorDeps): Promise<ExecutionOutcome> {
  if (plan.candidateId !== candidate.id) return failed("plan_candidate_mismatch");
  if (plan.executionQualification === "not_qualified") return blocked(["plan_not_qualified"]);
  if (plan.executionQualification === "qualified_dry_run") return { status: "dry_run", reasons: ["dry_run_default"], txHash: null, orderId: null };
  if (!planIsFresh(plan, deps.now())) return blocked(["plan_expired"]);
  const chain = chainByIndex(candidate.chainIndex);
  if (!chain) return blocked(["chain_unknown"]);
  if (candidate.kind !== "dex_round_trip") return blocked(["executor_supports_dex_round_trip_only"]);
  if (candidate.sizeUsd === null || candidate.expectedLeg1OutAtomic === null || candidate.expectedOutAtomic === null) return blocked(["candidate_quote_incomplete"]);
  if (!deps.tradeClient) return blocked(["trade_client_missing"]);

  // The daily notional counts both legs of a round trip (R5 B8).
  const ledgerReasons = deps.ledger.checkBeforeExecute({
    idempotencyKey: plan.idempotencyKey, pairKey: candidate.pairKey, sizeUsd: candidate.sizeUsd * 2, nowMs: deps.now(), killSwitchExists: deps.killSwitchExists(),
  }, deps.policy);
  if (ledgerReasons.length) return blocked(ledgerReasons);

  if (chain.kind === "solana") return SOLANA_LIVE_ENABLED ? blocked(["solana_policy_missing"]) : blocked(["solana_live_disabled_pending_policy"]);
  if (chain.kind !== "evm") return blocked(["signer_unavailable_for_chain_family"]);
  return executeEvmRoundTrip(plan, candidate, deps);
}

async function executeEvmRoundTrip(plan: ExecutionPlan, candidate: OpportunityCandidate, deps: ExecutorDeps): Promise<ExecutionOutcome> {
  const signer = deps.evmSigner;
  if (!signer) return blocked(["evm_signer_missing"]);
  if (signer.address.toLowerCase() !== deps.inventoryAddress.toLowerCase()) return blocked(["signer_address_differs_from_inventory_address"]);
  const receiptTimeoutMs = deps.receiptTimeoutMs ?? 120_000;
  const chainIndex = candidate.chainIndex;
  const fromNative = isNativeEvm(candidate.from.tokenContractAddress);
  const toNative = isNativeEvm(candidate.to.tokenContractAddress);

  // Spender for approvals comes from OKX and must be allowlisted (R5 A2).
  let spender: string | null = null;
  if (!fromNative || !toNative) {
    try {
      spender = await fetchApproveSpender(deps.tradeClient!, chainIndex, fromNative ? candidate.to.tokenContractAddress : candidate.from.tokenContractAddress, candidate.sizeAtomic);
    } catch (error) {
      return failed(`spender_lookup_failed: ${sanitizeError(error)}`);
    }
    if (!(deps.policy.spenderAllowlist[chainIndex] ?? []).length) return blocked(["spender_allowlist_missing"]);
    if (!inList(deps.policy.spenderAllowlist[chainIndex], spender, true)) return blocked(["spender_not_allowlisted"]);
  }

  let leg1: PreparedEvmTransaction;
  try {
    leg1 = await prepareEvmSwap(deps.tradeClient!, {
      chainIndex, fromTokenAddress: candidate.from.tokenContractAddress, toTokenAddress: candidate.to.tokenContractAddress,
      amountAtomic: candidate.sizeAtomic, slippagePercent: deps.slippagePercent, userWalletAddress: signer.address,
    });
  } catch (error) {
    return failed(`prepare_failed: ${sanitizeError(error)}`);
  }
  const reasons = checkPreparedLeg(leg1, { chainIndex, fromNative, amountAtomic: candidate.sizeAtomic, expectedOutAtomic: candidate.expectedLeg1OutAtomic!, slippagePercent: deps.slippagePercent, policy: deps.policy });
  if (!planIsFresh(plan, deps.now())) reasons.push("plan_expired_after_prepare");
  if (reasons.length) return blocked(reasons);

  const stopRequested = () => deps.killSwitchExists();
  const send = async (tx: { to: string; data: string; value: string; gasLimit: string }, stage: string) => {
    const beforeSubmit = () => {
      if (stopRequested()) throw new Error(`kill_switch_present_before_${stage}`);
      if (!planIsFresh(plan, deps.now())) throw new Error(`plan_expired_before_${stage}`);
    };
    beforeSubmit();
    return signer.sendTransaction({ chainIndex, ...tx }, beforeSubmit);
  };
  const gasLimitFor = (prepared: PreparedEvmTransaction) => ((BigInt(prepared.gas) * BigInt(3)) / BigInt(2)).toString();
  let gasCostNative = 0;
  const settle = async (txHash: string) => {
    const receipt = await signer.waitForReceipt(chainIndex, txHash, receiptTimeoutMs);
    if (receipt.gasCostNative !== null) gasCostNative += receipt.gasCostNative;
    return receipt.success;
  };

  if (stopRequested()) return blocked(["kill_switch_present"]);
  deps.ledger.recordExecution({ idempotencyKey: plan.idempotencyKey, sizeUsd: candidate.sizeUsd! * 2, nowMs: deps.now(), leg: {
    planId: plan.planId, candidateId: candidate.id, pairKey: candidate.pairKey, chainIndex, openedAtMs: deps.now(),
    txHash: "", intermediateAtomic: leg1.minReceiveAmount!, status: "leg1_sent", closeTxHash: null, note: null,
  } });
  const fail = (note: string, outcome: ExecutionOutcome) => { deps.ledger.updateLeg(plan.planId, { status: "failed", note }); return outcome; };

  let txHash: string;
  try {
    if (!fromNative) {
      const approveHash = await send({ to: candidate.from.tokenContractAddress, data: encodeApprove(spender!, candidate.sizeAtomic), value: "0", gasLimit: "120000" }, "approve1");
      deps.ledger.updateLeg(plan.planId, { approveTxHash: approveHash });
      if (!(await settle(approveHash))) return fail("approve_reverted", failed("approve_reverted", approveHash));
    }
    if (!(await signer.simulate({ chainIndex, to: leg1.to, data: leg1.data, value: leg1.value }))) return fail("leg1_simulation_reverted", blocked(["leg1_simulation_reverted"]));
    txHash = await send({ to: leg1.to, data: leg1.data, value: leg1.value, gasLimit: gasLimitFor(leg1) }, "leg1");
    deps.ledger.updateLeg(plan.planId, { txHash });
  } catch (error) {
    return fail(`send_failed: ${sanitizeError(error)}`, failed(`send_failed: ${sanitizeError(error)}`));
  }

  let confirmed: boolean;
  try { confirmed = await settle(txHash); } catch {
    return fail("leg1_receipt_timeout", { status: "sent", reasons: ["leg1_sent_receipt_timeout; reconcile manually before any new plan"], txHash, orderId: null });
  }
  if (!confirmed) return fail("leg1_reverted", failed("leg1_reverted", txHash));
  deps.ledger.updateLeg(plan.planId, { status: "leg1_confirmed" });

  // Second leg: sell the minimum intermediate amount back; the ledger keeps the leg open until it confirms.
  let leg2: PreparedEvmTransaction;
  try {
    leg2 = await prepareEvmSwap(deps.tradeClient!, {
      chainIndex, fromTokenAddress: candidate.to.tokenContractAddress, toTokenAddress: candidate.from.tokenContractAddress,
      amountAtomic: leg1.minReceiveAmount!, slippagePercent: deps.slippagePercent, userWalletAddress: signer.address,
    });
  } catch (error) {
    return fail(`leg2_prepare_failed: ${sanitizeError(error)}`, { status: "sent", reasons: [`leg2_prepare_failed: ${sanitizeError(error)}`], txHash, orderId: null });
  }
  const leg2Reasons = checkPreparedLeg(leg2, { chainIndex, fromNative: toNative, amountAtomic: leg1.minReceiveAmount!, expectedOutAtomic: candidate.expectedOutAtomic!, slippagePercent: deps.slippagePercent, policy: deps.policy });
  if (leg2Reasons.length) return fail(`leg2_blocked: ${leg2Reasons.join(",")}`, { status: "sent", reasons: [`leg2_blocked: ${leg2Reasons.join(",")}`], txHash, orderId: null });
  try {
    if (!toNative) {
      const approveHash = await send({ to: candidate.to.tokenContractAddress, data: encodeApprove(spender!, leg1.minReceiveAmount!), value: "0", gasLimit: "120000" }, "approve2");
      deps.ledger.updateLeg(plan.planId, { closeApproveTxHash: approveHash });
      if (!(await settle(approveHash))) throw new Error("leg2_approve_reverted");
    }
    if (!(await signer.simulate({ chainIndex, to: leg2.to, data: leg2.data, value: leg2.value }))) throw new Error("leg2_simulation_reverted");
    const closeTxHash = await send({ to: leg2.to, data: leg2.data, value: leg2.value, gasLimit: gasLimitFor(leg2) }, "leg2");
    deps.ledger.updateLeg(plan.planId, { status: "leg2_sent", closeTxHash });
    const closed = await settle(closeTxHash);
    deps.ledger.updateLeg(plan.planId, { status: closed ? "closed" : "failed", note: closed ? null : "leg2_reverted" });
    return closed
      ? { status: "completed", reasons: ["both_legs_confirmed; realized result pending reconciliation of balances"], txHash, orderId: null, closeTxHash, gasCostNative }
      : { status: "sent", reasons: ["leg2_reverted; position open in the intermediate asset"], txHash, orderId: null, closeTxHash, gasCostNative };
  } catch (error) {
    return fail(`leg2_failed: ${sanitizeError(error)}`, { status: "sent", reasons: [`leg2_failed: ${sanitizeError(error)}`], txHash, orderId: null, gasCostNative });
  }
}

/** ethers v5 signer bound to one RPC per chain with a gas price cap and a chainId check; built only when the live gate opens. */
export async function createEthersEvmSigner(privateKey: string, rpcByChain: Record<string, string>, maxFeeGwei: number): Promise<EvmSigner> {
  const { ethers } = await import("ethers");
  const wallets = new Map<string, InstanceType<typeof ethers.Wallet>>();
  const address = new ethers.Wallet(privateKey).address;
  const walletFor = async (chainIndex: string) => {
    const rpc = rpcByChain[chainIndex];
    if (!rpc) throw new Error(`No RPC configured for chain ${chainIndex}`);
    let wallet = wallets.get(chainIndex);
    if (!wallet) {
      const provider = new ethers.providers.JsonRpcProvider(rpc);
      const expected = chainByIndex(chainIndex)?.evmChainIdHex;
      const network = await provider.getNetwork();
      if (!expected || BigInt(expected) !== BigInt(network.chainId)) throw new Error(`RPC chainId does not match chain ${chainIndex}`);
      wallet = new ethers.Wallet(privateKey, provider);
      wallets.set(chainIndex, wallet);
    }
    return wallet;
  };
  return {
    address,
    async sendTransaction(tx, beforeSubmit) {
      const wallet = await walletFor(tx.chainIndex);
      const feeData = await wallet.provider.getFeeData();
      const cap = ethers.utils.parseUnits(String(maxFeeGwei), "gwei");
      const suggested = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (suggested && suggested.gt(cap)) throw new Error("gas price above OPERATOR_MAX_FEE_GWEI");
      // The SDK/network may await internally; this guard covers our own handoff only.
      beforeSubmit();
      const response = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: ethers.BigNumber.from(tx.value), gasLimit: ethers.BigNumber.from(tx.gasLimit), maxFeePerGas: cap });
      return response.hash;
    },
    async waitForReceipt(chainIndex, txHash, timeoutMs) {
      const wallet = await walletFor(chainIndex);
      const receipt = await wallet.provider.waitForTransaction(txHash, 1, timeoutMs);
      if (!receipt) throw new Error("receipt timeout");
      const price = receipt.effectiveGasPrice ?? null;
      const gasCostNative = price ? Number(ethers.utils.formatEther(receipt.gasUsed.mul(price))) : null;
      return { success: receipt.status === 1, gasCostNative };
    },
    async simulate(tx) {
      const wallet = await walletFor(tx.chainIndex);
      try {
        await wallet.provider.call({ from: address, to: tx.to, data: tx.data, value: ethers.BigNumber.from(tx.value) });
        return true;
      } catch {
        return false;
      }
    },
  };
}
