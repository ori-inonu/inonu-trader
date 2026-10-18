import { createHash } from "node:crypto";
import { chainByIndex } from "../okx-wallet/chains.ts";
import type { PairRequest, PreparedProposal, PreflightResult, UnsignedTransaction } from "./types.ts";

const NATIVE_EVM = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const RAW = /^(?:0|[1-9]\d{0,77})$/;

export function transactionDigest(transaction: UnsignedTransaction): string {
  return createHash("sha256").update(JSON.stringify([
    transaction.chainIndex, transaction.to, transaction.data, transaction.value, transaction.minReceiveAmount,
    transaction.gas, transaction.gasPrice, transaction.maxPriorityFeePerGas, transaction.slippagePercent, transaction.signed,
  ])).digest("hex");
}

/** Bind every sampled proposal parameter in addition to the unsigned transaction. */
export function preparedProposalDigest(proposal: PreparedProposal): string {
  return createHash("sha256").update(JSON.stringify([
    proposal.correlationId, proposal.identityKey, proposal.revision, proposal.chainIndex, proposal.fromToken, proposal.toToken,
    proposal.amountRaw, proposal.expectedOutputRaw, proposal.minReceiveAmountRaw, proposal.balanceRaw, proposal.slippagePercent,
    proposal.requestedAtMs, proposal.expiresAtMs, proposal.executionEnabled, transactionDigest(proposal.transaction),
  ])).digest("hex");
}

/** Exact floor(output * (100 - percent) / 100), with no binary floating point. */
export function minimumOutputRaw(output: string, percent: string): string {
  if (!RAW.test(output) || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,36})?$/.test(percent)) throw new Error("invalid preflight quantities");
  const [whole = "0", fraction = ""] = percent.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const slippage = BigInt(whole + fraction);
  if (slippage > 100n * scale) throw new Error("invalid slippage range");
  return (BigInt(output) * (100n * scale - slippage) / (100n * scale)).toString();
}

/**
 * This checks the response's structure and consistency only. No router ABI,
 * spender allowlist, independent decimals or simulation has been qualified.
 * Those missing proofs deliberately prevent semantic approval in every result.
 */
export function preflightUnsignedSwap(input: {
  transaction: UnsignedTransaction;
  pair: PairRequest;
  expectedOutputRaw: string;
  balanceRaw: string;
  chainIndex: string;
  expiresAtMs: number;
  now: number;
}): PreflightResult {
  const { transaction: tx, pair, now } = input;
  const structural: string[] = [];
  if (chainByIndex(input.chainIndex)?.kind !== "evm") structural.push("transaction-encoding-unqualified");
  if (tx.chainIndex !== input.chainIndex) structural.push("transaction-chain-mismatch");
  if (!/^0x[\da-f]{40}$/i.test(tx.to)) structural.push("transaction-router-invalid");
  if (!/^0x(?:[\da-f]{2}){4,65536}$/i.test(tx.data)) structural.push("transaction-calldata-invalid");
  if (!RAW.test(tx.value)) structural.push("transaction-value-invalid");
  if (tx.signed !== false) structural.push("transaction-must-be-unsigned");
  if (tx.slippagePercent !== pair.slippagePercent) structural.push("transaction-slippage-mismatch");
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(input.expiresAtMs) || input.expiresAtMs < 0) structural.push("proposal-time-invalid");
  if (input.expiresAtMs <= now) structural.push("proposal-stale");
  if (!RAW.test(pair.amount) || !RAW.test(input.balanceRaw) || BigInt(pair.amount) === 0n || BigInt(pair.amount) > BigInt(input.balanceRaw)) structural.push("inventory-coverage-insufficient");
  if (RAW.test(tx.value) && RAW.test(pair.amount) && BigInt(tx.value) !== (pair.fromToken === NATIVE_EVM ? BigInt(pair.amount) : 0n)) structural.push("transaction-native-value-mismatch");
  try {
    const minimum = minimumOutputRaw(input.expectedOutputRaw, pair.slippagePercent);
    if (tx.minReceiveAmount === null || !RAW.test(tx.minReceiveAmount) || BigInt(tx.minReceiveAmount) < BigInt(minimum) || BigInt(tx.minReceiveAmount) > BigInt(input.expectedOutputRaw)) structural.push("minimum-output-mismatch");
  } catch { structural.push("proposal-quantities-invalid"); }
  for (const value of [tx.gas, tx.gasPrice, tx.maxPriorityFeePerGas]) if (value !== null && !RAW.test(value)) structural.push("transaction-gas-invalid");
  return { status: "blocked", checkedAtMs: now, executionEnabled: false, structuralChecksPassed: structural.length === 0,
    semanticChecksPassed: false, simulation: "not-exercised", transactionHash: transactionDigest(tx), reasons: [...new Set([
      ...structural, "router-policy-unqualified", "calldata-abi-unqualified", "spender-allowance-unqualified",
      "token-decimals-unqualified", "gas-budget-unqualified", "price-impact-policy-unqualified", "token-tax-policy-unqualified", "remote-simulation-not-exercised",
    ])] };
}

/** Recheck immutable session identity/revision, age and transaction digest at consumption. */
export function checkPreparedProposal(proposal: PreparedProposal, state: { identityKey: string; chainIndex: string; revision: number; now: number }): PreflightResult {
  const result = preflightUnsignedSwap({ transaction: proposal.transaction, pair: { fromToken: proposal.fromToken, toToken: proposal.toToken,
    amount: proposal.amountRaw, slippagePercent: proposal.slippagePercent }, expectedOutputRaw: proposal.expectedOutputRaw,
    balanceRaw: proposal.balanceRaw, chainIndex: state.chainIndex, expiresAtMs: proposal.expiresAtMs, now: state.now });
  if (proposal.identityKey !== state.identityKey) result.reasons.unshift("proposal-identity-mismatch");
  if (proposal.revision !== state.revision) result.reasons.unshift("proposal-revision-mismatch");
  if (proposal.preflight.transactionHash !== result.transactionHash) result.reasons.unshift("proposal-transaction-mutated");
  if (proposal.id !== preparedProposalDigest(proposal)) result.reasons.unshift("proposal-parameters-mutated");
  if (result.reasons.some((reason) => reason.startsWith("proposal-identity") || reason.startsWith("proposal-revision") || reason.startsWith("proposal-transaction") || reason.startsWith("proposal-parameters"))) result.structuralChecksPassed = false;
  return result;
}
