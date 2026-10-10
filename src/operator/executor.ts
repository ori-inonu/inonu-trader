import { chainByIndex } from "../okx-wallet/chains";
import { EVM_NATIVE_PLACEHOLDER } from "./candidates";
import type { SolanaSigner } from "../okx-wallet/solana-signer";
import { prepareEvmSwap, TRADE_PATHS, type OkxTradeClient, type PreparedEvmTransaction } from "../okx-wallet/trade";
import type { OperatorLedger } from "./ledger";
import { planIsFresh } from "./plan";
import type { ExecutionOutcome, ExecutionPlan, OperatorPolicy, OpportunityCandidate } from "./types";

/**
 * Execution is the last, separately gated stage. A plan is sent only when it is
 * qualified_live, fresh, allowed by the persistent ledger (daily caps, cooldown,
 * kill switch, no open leg on the pair), targets an allowlisted router, and the
 * prepared transaction's minimum output matches the candidate's quote within the
 * slippage cap. Approvals are built locally for the exact amount; remote
 * approval calldata is never forwarded. Everything else is journaled as
 * blocked or dry_run with explicit reasons.
 */
export interface EvmSigner {
  readonly address: string;
  sendTransaction(tx: { chainIndex: string; to: string; data: string; value: string; gasLimit: string }): Promise<string>;
  /** Resolves true on success receipt, false on revert; throws on timeout. */
  waitForReceipt(chainIndex: string, txHash: string, timeoutMs: number): Promise<boolean>;
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
  if (!/^(0|[1-9]\d{0,77})$/.test(amountAtomic)) throw new Error("Invalid approve amount");
  return APPROVE_SELECTOR + spender.slice(2).toLowerCase().padStart(64, "0") + BigInt(amountAtomic).toString(16).padStart(64, "0");
}

function blocked(reasons: string[]): ExecutionOutcome {
  return { status: "blocked", reasons, txHash: null, orderId: null };
}

function failed(reason: string, txHash: string | null = null): ExecutionOutcome {
  return { status: "failed", reasons: [reason], txHash, orderId: null };
}

function allowlisted(policy: OperatorPolicy, chainIndex: string, address: string): boolean {
  const list = policy.routerAllowlist[chainIndex] ?? [];
  const evm = chainByIndex(chainIndex)?.kind === "evm";
  return list.some((entry) => evm ? entry.toLowerCase() === address.toLowerCase() : entry === address);
}

/** True when `minReceive` is at least the quoted output reduced by the slippage cap. */
export function minReceiveMatchesQuote(minReceiveAtomic: string, quotedOutAtomic: string, slippagePercent: number): boolean {
  const quoted = BigInt(quotedOutAtomic);
  const floor = (quoted * BigInt(Math.round((100 - slippagePercent) * 10_000))) / BigInt(1_000_000);
  return BigInt(minReceiveAtomic) >= floor;
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

  const ledgerReasons = deps.ledger.checkBeforeExecute({
    idempotencyKey: plan.idempotencyKey, pairKey: candidate.pairKey, sizeUsd: candidate.sizeUsd, nowMs: deps.now(), killSwitchExists: deps.killSwitchExists(),
  }, deps.policy);
  if (ledgerReasons.length) return blocked(ledgerReasons);

  if (chain.kind === "evm") return executeEvmRoundTrip(plan, candidate, deps);
  if (chain.kind === "solana") return executeSolanaRoundTrip(plan, candidate, deps);
  return blocked(["signer_unavailable_for_chain_family"]);
}

async function executeEvmRoundTrip(plan: ExecutionPlan, candidate: OpportunityCandidate, deps: ExecutorDeps): Promise<ExecutionOutcome> {
  const signer = deps.evmSigner;
  if (!signer) return blocked(["evm_signer_missing"]);
  if (signer.address.toLowerCase() !== deps.inventoryAddress.toLowerCase()) return blocked(["signer_address_differs_from_inventory_address"]);
  const receiptTimeoutMs = deps.receiptTimeoutMs ?? 120_000;

  let leg1: PreparedEvmTransaction;
  try {
    leg1 = await prepareEvmSwap(deps.tradeClient!, {
      chainIndex: candidate.chainIndex, fromTokenAddress: candidate.from.tokenContractAddress, toTokenAddress: candidate.to.tokenContractAddress,
      amountAtomic: candidate.sizeAtomic, slippagePercent: deps.slippagePercent, userWalletAddress: signer.address,
    });
  } catch (error) {
    return failed(`prepare_failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
  const reasons: string[] = [];
  if (!allowlisted(deps.policy, candidate.chainIndex, leg1.to)) reasons.push("router_not_allowlisted");
  if (leg1.minReceiveAmount === null) reasons.push("min_receive_unknown");
  else if (!minReceiveMatchesQuote(leg1.minReceiveAmount, candidate.expectedLeg1OutAtomic!, deps.slippagePercent)) reasons.push("min_receive_below_quote");
  if (!planIsFresh(plan, deps.now())) reasons.push("plan_expired_after_prepare");
  if (reasons.length) return blocked(reasons);

  deps.ledger.recordExecution({ idempotencyKey: plan.idempotencyKey, sizeUsd: candidate.sizeUsd!, nowMs: deps.now(), leg: {
    planId: plan.planId, candidateId: candidate.id, pairKey: candidate.pairKey, chainIndex: candidate.chainIndex, openedAtMs: deps.now(),
    txHash: "", intermediateAtomic: leg1.minReceiveAmount!, status: "leg1_sent", closeTxHash: null, note: null,
  } });
  let txHash: string;
  try {
    if (!isNativeEvm(candidate.from.tokenContractAddress)) {
      const approveHash = await signer.sendTransaction({ chainIndex: candidate.chainIndex, to: candidate.from.tokenContractAddress, data: encodeApprove(leg1.to, candidate.sizeAtomic), value: "0", gasLimit: "120000" });
      const approved = await signer.waitForReceipt(candidate.chainIndex, approveHash, receiptTimeoutMs);
      if (!approved) { deps.ledger.updateLeg(plan.planId, { status: "failed", note: "approve_reverted" }); return failed("approve_reverted", approveHash); }
    }
    const gasLimit = ((BigInt(leg1.gas) * BigInt(3)) / BigInt(2)).toString();
    txHash = await signer.sendTransaction({ chainIndex: candidate.chainIndex, to: leg1.to, data: leg1.data, value: leg1.value, gasLimit });
    deps.ledger.updateLeg(plan.planId, { txHash });
  } catch (error) {
    deps.ledger.updateLeg(plan.planId, { status: "failed", note: `send_failed: ${error instanceof Error ? error.message : "unknown"}` });
    return failed(`send_failed: ${error instanceof Error ? error.message : "unknown"}`);
  }

  let confirmed: boolean;
  try { confirmed = await signer.waitForReceipt(candidate.chainIndex, txHash, receiptTimeoutMs); } catch {
    deps.ledger.updateLeg(plan.planId, { status: "failed", note: "leg1_receipt_timeout" });
    return { status: "sent", reasons: ["leg1_sent_receipt_timeout; reconcile manually before any new plan"], txHash, orderId: null };
  }
  if (!confirmed) { deps.ledger.updateLeg(plan.planId, { status: "failed", note: "leg1_reverted" }); return failed("leg1_reverted", txHash); }
  deps.ledger.updateLeg(plan.planId, { status: "leg1_confirmed" });

  // Second leg: sell the minimum intermediate amount back; the ledger keeps the leg open until it confirms.
  let leg2: PreparedEvmTransaction;
  try {
    leg2 = await prepareEvmSwap(deps.tradeClient!, {
      chainIndex: candidate.chainIndex, fromTokenAddress: candidate.to.tokenContractAddress, toTokenAddress: candidate.from.tokenContractAddress,
      amountAtomic: leg1.minReceiveAmount!, slippagePercent: deps.slippagePercent, userWalletAddress: signer.address,
    });
  } catch (error) {
    deps.ledger.updateLeg(plan.planId, { status: "failed", note: `leg2_prepare_failed: ${error instanceof Error ? error.message : "unknown"}` });
    return { status: "sent", reasons: [`leg2_prepare_failed: ${error instanceof Error ? error.message : "unknown"}`], txHash, orderId: null };
  }
  if (!allowlisted(deps.policy, candidate.chainIndex, leg2.to) || leg2.minReceiveAmount === null) {
    deps.ledger.updateLeg(plan.planId, { status: "failed", note: "leg2_router_or_min_receive_invalid" });
    return { status: "sent", reasons: ["leg2_blocked: router_not_allowlisted_or_min_receive_unknown"], txHash, orderId: null };
  }
  try {
    if (!isNativeEvm(candidate.to.tokenContractAddress)) {
      const approveHash = await signer.sendTransaction({ chainIndex: candidate.chainIndex, to: candidate.to.tokenContractAddress, data: encodeApprove(leg2.to, leg1.minReceiveAmount!), value: "0", gasLimit: "120000" });
      if (!(await signer.waitForReceipt(candidate.chainIndex, approveHash, receiptTimeoutMs))) throw new Error("leg2_approve_reverted");
    }
    const closeTxHash = await signer.sendTransaction({ chainIndex: candidate.chainIndex, to: leg2.to, data: leg2.data, value: leg2.value, gasLimit: ((BigInt(leg2.gas) * BigInt(3)) / BigInt(2)).toString() });
    deps.ledger.updateLeg(plan.planId, { status: "leg2_sent", closeTxHash });
    const closed = await signer.waitForReceipt(candidate.chainIndex, closeTxHash, receiptTimeoutMs);
    deps.ledger.updateLeg(plan.planId, { status: closed ? "closed" : "failed", note: closed ? null : "leg2_reverted" });
    return closed
      ? { status: "completed", reasons: ["both_legs_confirmed; realized result pending reconciliation of balances"], txHash, orderId: null, closeTxHash }
      : { status: "sent", reasons: ["leg2_reverted; position open in the intermediate asset"], txHash, orderId: null, closeTxHash };
  } catch (error) {
    deps.ledger.updateLeg(plan.planId, { status: "failed", note: `leg2_failed: ${error instanceof Error ? error.message : "unknown"}` });
    return { status: "sent", reasons: [`leg2_failed: ${error instanceof Error ? error.message : "unknown"}`], txHash, orderId: null };
  }
}

async function executeSolanaRoundTrip(plan: ExecutionPlan, candidate: OpportunityCandidate, deps: ExecutorDeps): Promise<ExecutionOutcome> {
  const signer = deps.solanaSigner;
  if (!signer) return blocked(["solana_signer_missing"]);
  if (signer.address !== deps.inventoryAddress) return blocked(["signer_address_differs_from_inventory_address"]);
  const receiptTimeoutMs = deps.receiptTimeoutMs ?? 90_000;
  const swapData = async (from: string, to: string, amount: string) => {
    const data = await deps.tradeClient!.get(TRADE_PATHS.swap, {
      chainIndex: "501", fromTokenAddress: from, toTokenAddress: to, amount, slippagePercent: String(deps.slippagePercent), userWalletAddress: signer.address,
    });
    const first = data[0];
    const tx = first && typeof first.tx === "object" && first.tx !== null ? first.tx as Record<string, unknown> : null;
    if (!tx || typeof tx.data !== "string" || !tx.data) throw new Error("swap response lacks tx.data");
    const minReceive = typeof tx.minReceiveAmount === "string" && /^(0|[1-9]\d{0,77})$/.test(tx.minReceiveAmount) ? tx.minReceiveAmount : null;
    return { data: tx.data, minReceive };
  };
  let leg1: { data: string; minReceive: string | null };
  try { leg1 = await swapData(candidate.from.tokenContractAddress, candidate.to.tokenContractAddress, candidate.sizeAtomic); } catch (error) {
    return failed(`prepare_failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
  const reasons: string[] = [];
  if ((deps.policy.routerAllowlist["501"] ?? []).length === 0) reasons.push("router_allowlist_missing");
  if (leg1.minReceive === null) reasons.push("min_receive_unknown");
  else if (!minReceiveMatchesQuote(leg1.minReceive, candidate.expectedLeg1OutAtomic!, deps.slippagePercent)) reasons.push("min_receive_below_quote");
  if (!planIsFresh(plan, deps.now())) reasons.push("plan_expired_after_prepare");
  if (reasons.length) return blocked(reasons);

  deps.ledger.recordExecution({ idempotencyKey: plan.idempotencyKey, sizeUsd: candidate.sizeUsd!, nowMs: deps.now(), leg: {
    planId: plan.planId, candidateId: candidate.id, pairKey: candidate.pairKey, chainIndex: "501", openedAtMs: deps.now(),
    txHash: "", intermediateAtomic: leg1.minReceive!, status: "leg1_sent", closeTxHash: null, note: null,
  } });
  let txHash: string;
  try { txHash = await signer.signAndSend(leg1.data); deps.ledger.updateLeg(plan.planId, { txHash }); } catch (error) {
    deps.ledger.updateLeg(plan.planId, { status: "failed", note: `send_failed: ${error instanceof Error ? error.message : "unknown"}` });
    return failed(`send_failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
  if (!(await signer.confirm(txHash, receiptTimeoutMs))) { deps.ledger.updateLeg(plan.planId, { status: "failed", note: "leg1_not_confirmed" }); return failed("leg1_not_confirmed", txHash); }
  deps.ledger.updateLeg(plan.planId, { status: "leg1_confirmed" });
  try {
    const leg2 = await swapData(candidate.to.tokenContractAddress, candidate.from.tokenContractAddress, leg1.minReceive!);
    if (leg2.minReceive === null) throw new Error("leg2_min_receive_unknown");
    const closeTxHash = await signer.signAndSend(leg2.data);
    deps.ledger.updateLeg(plan.planId, { status: "leg2_sent", closeTxHash });
    const closed = await signer.confirm(closeTxHash, receiptTimeoutMs);
    deps.ledger.updateLeg(plan.planId, { status: closed ? "closed" : "failed", note: closed ? null : "leg2_not_confirmed" });
    return closed
      ? { status: "completed", reasons: ["both_legs_confirmed; realized result pending reconciliation of balances"], txHash, orderId: null, closeTxHash }
      : { status: "sent", reasons: ["leg2_not_confirmed; position open in the intermediate asset"], txHash, orderId: null, closeTxHash };
  } catch (error) {
    deps.ledger.updateLeg(plan.planId, { status: "failed", note: `leg2_failed: ${error instanceof Error ? error.message : "unknown"}` });
    return { status: "sent", reasons: [`leg2_failed: ${error instanceof Error ? error.message : "unknown"}`], txHash, orderId: null };
  }
}

/** ethers v5 signer bound to one RPC per chain with a gas price cap; built only when the live gate opens. */
export async function createEthersEvmSigner(privateKey: string, rpcByChain: Record<string, string>, maxFeeGwei: number): Promise<EvmSigner> {
  const { ethers } = await import("ethers");
  const wallets = new Map<string, InstanceType<typeof ethers.Wallet>>();
  const address = new ethers.Wallet(privateKey).address;
  const walletFor = (chainIndex: string) => {
    const rpc = rpcByChain[chainIndex];
    if (!rpc) throw new Error(`No RPC configured for chain ${chainIndex}`);
    let wallet = wallets.get(chainIndex);
    if (!wallet) {
      wallet = new ethers.Wallet(privateKey, new ethers.providers.JsonRpcProvider(rpc));
      wallets.set(chainIndex, wallet);
    }
    return wallet;
  };
  return {
    address,
    async sendTransaction(tx) {
      const wallet = walletFor(tx.chainIndex);
      const feeData = await wallet.provider.getFeeData();
      const cap = ethers.utils.parseUnits(String(maxFeeGwei), "gwei");
      const suggested = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (suggested && suggested.gt(cap)) throw new Error("gas price above OPERATOR_MAX_FEE_GWEI");
      const response = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: ethers.BigNumber.from(tx.value), gasLimit: ethers.BigNumber.from(tx.gasLimit), maxFeePerGas: cap });
      return response.hash;
    },
    async waitForReceipt(chainIndex, txHash, timeoutMs) {
      const receipt = await walletFor(chainIndex).provider.waitForTransaction(txHash, 1, timeoutMs);
      if (!receipt) throw new Error("receipt timeout");
      return receipt.status === 1;
    },
  };
}
