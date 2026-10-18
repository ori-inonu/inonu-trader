import { createHash } from "node:crypto";
import { utils } from "ethers";
import { checkPreparedProposal, minimumOutputRaw, preparedProposalDigest, transactionDigest } from "./preflight.ts";
import type { NormalizedQuote, PreparedProposal, SourceEnvelope, SwapBuild, UnsignedTransaction } from "./types.ts";

export interface SemanticProofInput {
  /** Ephemeral wallet input; never returned or persisted by this module. Consent is enforced by the caller. */
  address: string;
  proposal: PreparedProposal;
  quote: SourceEnvelope<NormalizedQuote>;
  build: SourceEnvelope<SwapBuild>;
  expected: { identityKey: string; chainIndex: string; revision: number; correlationId: string };
}

/** Only read operations. Unknown deployment or decoder remains an explicit dependency. */
export interface SemanticReadPorts {
  observe(input: SemanticProofInput): Promise<SemanticSnapshot | null>;
  decode(input: SemanticProofInput, snapshot: SemanticSnapshot): Promise<DecodedSwapProof | null>;
}

export interface ProofSource { sourceReference: string; sourceSha256: string }
export interface TokenStateProof extends ProofSource {
  token: string;
  balanceRaw: string | null;
  displayBalance: string | null;
  decimals: number | null;
  decimalsMethod: "erc20-decimals" | "native-chain-metadata";
  codeHash: string | null;
}
export interface DeploymentProof extends ProofSource {
  router: string;
  runtimeCodeHash: string;
  implementationCodeHash: string | null;
  abiSha256: string;
  /** Exact complete source artifact bytes, not a hand-picked selector fragment. */
  abiJson: string;
  spender: string;
  spenderCodeHash: string;
  selectors: { selector: string; signature: string; semanticsSha256: string }[];
}
export interface FeeProof extends ProofSource {
  chainIndex: string;
  gasLimitRaw: string | null;
  gasPriceRaw: string | null;
  additionalFeeRaw: string | null;
  reserveRaw: string | null;
  maximumFeeRaw: string | null;
  nativeDecimals: number | null;
  nativePriceUsd: string | null;
  maximumFeeUsd: string | null;
}
export interface SemanticSnapshot {
  /** All token/deployment/fee reads in this snapshot must refer to this same block and wallet. */
  context: { identityKey: string; chainIndex: string; revision: number; correlationId: string; blockNumber: string;
    blockHash: string; observedAtMs: number; expiresAtMs: number };
  tokens: TokenStateProof[];
  deployment: DeploymentProof | null;
  allowance: { token: string; spender: string; amountRaw: string | null; blockNumber: string; blockHash: string } | null;
  nativeBalanceRaw: string | null;
  fees: FeeProof | null;
}
/** Decoder boundary must interpret every packed/nested region; no generic selector acceptance. */
export interface DecodedSwapProof {
  transactionHash: string;
  chainIndex: string;
  router: string;
  runtimeCodeHash: string;
  abiSha256: string;
  semanticsSha256: string;
  selector: string;
  signature: string;
  reencodedCalldata: string;
  uninterpretedPaths: string[];
  sender: string;
  receiver: string;
  fromToken: string;
  toToken: string;
  amountRaw: string;
  minimumOutputRaw: string;
  valueRaw: string;
  deadlineSeconds: string;
  spender: string;
}

export interface SemanticProofResult {
  status: "blocked";
  observation: "unverified";
  exercisedReal: false;
  financiallyQualified: false;
  semanticChecksPassed: false;
  executionEnabled: false;
  simulation: "not-exercised";
  localChecksPassed: boolean;
  checkedAtMs: number | null;
  proposalHash: string;
  transactionHash: string;
  localReasons: string[];
  remainingRequirements: string[];
}

function validEnvelope<T>(value: SourceEnvelope<T>, input: SemanticProofInput, now: number, endpoint: string, unit: string): boolean {
  return value.status === "ready" && value.source === "onchainos-rest-v6" && value.mode === "unverified"
    && value.endpoint === endpoint && value.method === "GET" && value.chainIndex === input.expected.chainIndex
    && value.correlationId === input.expected.correlationId && value.unit === unit && value.error === null && value.data !== null
    && value.httpStatus !== null && Number.isInteger(value.httpStatus) && value.httpStatus >= 200 && value.httpStatus < 300
    && [value.requestedAtMs, value.receivedAtMs, value.expiresAtMs].every(time => Number.isSafeInteger(time) && time >= 0)
    && value.requestedAtMs <= value.receivedAtMs && value.receivedAtMs <= now && value.expiresAtMs > now
    && input.proposal.expiresAtMs <= value.expiresAtMs
    && (value.sourceAtMs === null || Number.isSafeInteger(value.sourceAtMs) && value.sourceAtMs >= 0 && value.sourceAtMs <= value.receivedAtMs);
}

const RAW = /^(?:0|[1-9]\d{0,77})$/;
const HEX_HASH = /^0x[\da-f]{64}$/i;
const SHA_HASH = /^[\da-f]{64}$/i;
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
function uint(value: string | null): value is string {
  return value !== null && RAW.test(value) && BigInt(value) < 2n ** 256n;
}
function source(value: ProofSource): boolean {
  return typeof value.sourceReference === "string" && value.sourceReference.trim().length > 0 && SHA_HASH.test(value.sourceSha256);
}
function decimals(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 255;
}
function displayMatches(display: string | null, raw: string, places: number): boolean {
  if (display === null) return true;
  if (!/^(?:0|[1-9]\d{0,77})(?:\.\d{1,255})?$/.test(display)) return false;
  const [whole = "0", fraction = ""] = display.split(".");
  return BigInt(whole + fraction) * 10n ** BigInt(places) === BigInt(raw) * 10n ** BigInt(fraction.length);
}
function codeHash(value: string): boolean {
  return HEX_HASH.test(value) && !/^0x0{64}$/i.test(value) && value.toLowerCase() !== utils.keccak256("0x");
}
function deploymentValid(deployment: DeploymentProof, tx: UnsignedTransaction): boolean {
  try {
    const selector = tx.data.slice(0, 10).toLowerCase();
    const rules = deployment.selectors.filter(rule => rule.selector.toLowerCase() === selector);
    const abi = new utils.Interface(JSON.parse(deployment.abiJson));
    const fragment = abi.getFunction(selector);
    return source(deployment) && codeHash(deployment.runtimeCodeHash)
      && (deployment.implementationCodeHash === null || codeHash(deployment.implementationCodeHash))
      && deployment.router.toLowerCase() === tx.to.toLowerCase() && /^0x[\da-f]{40}$/i.test(deployment.spender)
      && codeHash(deployment.spenderCodeHash) && SHA_HASH.test(deployment.abiSha256)
      && createHash("sha256").update(deployment.abiJson).digest("hex") === deployment.abiSha256
      && rules.length === 1 && rules[0]!.signature === fragment.format(utils.FormatTypes.sighash)
      && utils.id(rules[0]!.signature).slice(0, 10) === selector && SHA_HASH.test(rules[0]!.semanticsSha256);
  } catch { return false; }
}

function exactDecimal(value: string | null): { numerator: bigint; denominator: bigint } | null {
  if (value === null || !/^(?:0|[1-9]\d{0,77})(?:\.\d{1,255})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function feeCoverageValid(proof: SemanticSnapshot, p: PreparedProposal, quote: NormalizedQuote): boolean {
  const fee = proof.fees;
  if (fee === null || !source(fee) || fee.chainIndex !== p.chainIndex || !decimals(fee.nativeDecimals)
    || !uint(fee.gasLimitRaw) || BigInt(fee.gasLimitRaw) === 0n || fee.gasLimitRaw !== p.transaction.gas
    || !uint(fee.gasPriceRaw) || BigInt(fee.gasPriceRaw) === 0n || fee.gasPriceRaw !== p.transaction.gasPrice
    || p.transaction.maxPriorityFeePerGas !== null || !uint(fee.additionalFeeRaw) || !uint(fee.reserveRaw)
    || !uint(fee.maximumFeeRaw) || !uint(proof.nativeBalanceRaw) || !uint(p.transaction.value)
    || !uint(quote.estimatedGasRaw)) return false;
  const price = exactDecimal(fee.nativePriceUsd), budget = exactDecimal(fee.maximumFeeUsd);
  const quoteUsd = exactDecimal(quote.estimatedNetworkFeeUsd);
  if (price === null || price.numerator === 0n || budget === null || quoteUsd === null) return false;
  const gasCost = BigInt(fee.gasLimitRaw) * BigInt(fee.gasPriceRaw);
  const total = gasCost + BigInt(fee.additionalFeeRaw);
  return total < 2n ** 256n && total <= BigInt(fee.maximumFeeRaw) && BigInt(quote.estimatedGasRaw) === gasCost
    && total + BigInt(p.transaction.value) + BigInt(fee.reserveRaw) <= BigInt(proof.nativeBalanceRaw)
    && (p.fromToken.toLowerCase() !== NATIVE || proof.nativeBalanceRaw === p.balanceRaw)
    && total * price.numerator * budget.denominator <= budget.numerator * 10n ** BigInt(fee.nativeDecimals) * price.denominator
    && quoteUsd.numerator * budget.denominator <= budget.numerator * quoteUsd.denominator;
}

export function createSemanticProofEvaluator(options: { ports: SemanticReadPorts; now: () => number }) {
  return { async evaluate(input: SemanticProofInput): Promise<SemanticProofResult> {
    let checkedAtMs: number | null = null;
    let proposalHash = "", transactionHash = "";
    try {
    const now = options.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("invalid-clock");
    checkedAtMs = now;
    const inputFingerprint = fingerprint(input);
    const p = input.proposal;
    proposalHash = preparedProposalDigest(p);
    transactionHash = transactionDigest(p.transaction);
    const identity = createHash("sha256").update(`${input.expected.chainIndex}:${input.address.toLowerCase()}`).digest("hex");
    const valid = /^0x[\da-f]{40}$/i.test(input.address) && ["196", "143"].includes(input.expected.chainIndex)
      && identity === input.expected.identityKey && p.chainIndex === input.expected.chainIndex
      && p.correlationId === input.expected.correlationId && Number.isSafeInteger(input.expected.revision) && input.expected.revision >= 0
      && Number.isSafeInteger(p.requestedAtMs) && p.requestedAtMs >= 0 && p.requestedAtMs <= now
      && p.executionEnabled === false && checkPreparedProposal(p, { ...input.expected, now }).structuralChecksPassed;
    const localReasons = valid ? [] : ["proposal-binding-invalid"];
    const quote = input.quote.data;
    const bound = validEnvelope(input.quote, input, now, "/api/v6/dex/aggregator/quote", "smallest-token-unit")
      && validEnvelope(input.build, input, now, "/api/v6/dex/aggregator/swap", "unsigned-evm-transaction")
      && quote !== null && quote.chainIndex === p.chainIndex && quote.swapMode === "exactIn" && quote.amountUnit === "smallest-token-unit"
      && quote.fromToken.tokenContractAddress.toLowerCase() === p.fromToken.toLowerCase()
      && quote.toToken.tokenContractAddress.toLowerCase() === p.toToken.toLowerCase()
      && quote.fromTokenAmount === p.amountRaw && quote.toTokenAmount === p.expectedOutputRaw
      && input.build.data !== null && fingerprint(input.build.data.quote) === fingerprint(quote)
      && transactionDigest(input.build.data.transaction) === transactionDigest(p.transaction);
    if (valid && !bound) localReasons.push("quote-build-binding-invalid");
    const proof = valid && bound ? await options.ports.observe(input) : null;
    const proofFingerprint = fingerprint(proof);
    if (valid && bound && proof === null) localReasons.push("read-only-proof-unavailable");
    if (proof !== null && proof.deployment === null) localReasons.push("deployment-proof-unavailable");
    if (proof !== null) {
      const context = proof.context;
      if (context.identityKey !== input.expected.identityKey || context.chainIndex !== input.expected.chainIndex
        || context.revision !== input.expected.revision || context.correlationId !== input.expected.correlationId
        || !uint(context.blockNumber) || !HEX_HASH.test(context.blockHash) || /^0x0{64}$/i.test(context.blockHash)
        || ![context.observedAtMs, context.expiresAtMs].every(time => Number.isSafeInteger(time) && time >= 0)
        || context.observedAtMs < p.requestedAtMs || context.observedAtMs > now || context.expiresAtMs <= now) localReasons.push("read-only-context-invalid");
      const from = proof.tokens.filter(token => token.token.toLowerCase() === p.fromToken.toLowerCase());
      const to = proof.tokens.filter(token => token.token.toLowerCase() === p.toToken.toLowerCase());
      const tokenValid = (token: TokenStateProof | undefined, expectedDecimals: number | null) => token !== undefined
        && decimals(token.decimals) && token.decimals === expectedDecimals && uint(token.balanceRaw) && source(token)
        && (token.token.toLowerCase() === NATIVE ? token.decimalsMethod === "native-chain-metadata"
          : token.decimalsMethod === "erc20-decimals" && token.codeHash !== null && codeHash(token.codeHash))
        && displayMatches(token.displayBalance, token.balanceRaw, token.decimals);
      if (from.length !== 1 || to.length !== 1 || !tokenValid(from[0], quote!.fromToken.decimals) || !tokenValid(to[0], quote!.toToken.decimals)
        || from[0]!.balanceRaw !== p.balanceRaw || !uint(p.amountRaw) || BigInt(p.amountRaw) === 0n
        || uint(from[0]!.balanceRaw) && BigInt(p.amountRaw) > BigInt(from[0]!.balanceRaw)) localReasons.push("token-inventory-proof-invalid");
      if (proof.deployment !== null && !deploymentValid(proof.deployment, p.transaction)) localReasons.push("deployment-proof-invalid");
      if (proof.deployment !== null) {
        const allowance = proof.allowance;
        if (p.fromToken.toLowerCase() === NATIVE ? allowance !== null
          : allowance === null || allowance.token.toLowerCase() !== p.fromToken.toLowerCase()
            || allowance.spender.toLowerCase() !== proof.deployment.spender.toLowerCase()
            || allowance.blockNumber !== context.blockNumber || allowance.blockHash.toLowerCase() !== context.blockHash.toLowerCase()
            || !uint(allowance.amountRaw) || !uint(p.amountRaw) || BigInt(allowance.amountRaw) < BigInt(p.amountRaw)) localReasons.push("allowance-proof-invalid");
      }
      if (!feeCoverageValid(proof, p, quote!)) localReasons.push("fee-coverage-proof-invalid");
      if (localReasons.length === 0 && proof.deployment !== null) {
        const decoded = await options.ports.decode(input, proof);
        const deployment = proof.deployment;
        const rule = deployment.selectors.find(item => item.selector.toLowerCase() === p.transaction.data.slice(0, 10).toLowerCase())!;
        if (decoded === null || decoded.transactionHash !== transactionDigest(p.transaction) || decoded.chainIndex !== p.chainIndex
          || decoded.router.toLowerCase() !== deployment.router.toLowerCase() || decoded.runtimeCodeHash !== deployment.runtimeCodeHash
          || decoded.abiSha256 !== deployment.abiSha256 || decoded.semanticsSha256 !== rule.semanticsSha256
          || decoded.selector.toLowerCase() !== rule.selector.toLowerCase() || decoded.signature !== rule.signature
          || decoded.reencodedCalldata.toLowerCase() !== p.transaction.data.toLowerCase() || decoded.uninterpretedPaths.length !== 0) localReasons.push("calldata-proof-invalid");
        if (decoded !== null) {
          const minimum = minimumOutputRaw(p.expectedOutputRaw, p.slippagePercent);
          if (decoded.sender.toLowerCase() !== input.address.toLowerCase() || decoded.receiver.toLowerCase() !== input.address.toLowerCase()
            || decoded.fromToken.toLowerCase() !== p.fromToken.toLowerCase() || decoded.toToken.toLowerCase() !== p.toToken.toLowerCase()
            || decoded.spender.toLowerCase() !== deployment.spender.toLowerCase() || !uint(decoded.amountRaw) || decoded.amountRaw !== p.amountRaw
            || !uint(decoded.minimumOutputRaw) || decoded.minimumOutputRaw !== p.minReceiveAmountRaw
            || decoded.minimumOutputRaw !== p.transaction.minReceiveAmount || minimum === null
            || uint(decoded.minimumOutputRaw) && BigInt(decoded.minimumOutputRaw) < BigInt(minimum)
            || !uint(decoded.valueRaw) || decoded.valueRaw !== p.transaction.value || !uint(decoded.deadlineSeconds)
            || uint(decoded.deadlineSeconds) && (BigInt(decoded.deadlineSeconds) * 1000n < BigInt(p.expiresAtMs)
              || BigInt(decoded.deadlineSeconds) * 1000n <= BigInt(now))) localReasons.push("swap-semantics-invalid");
        }
      }
    }
    const finished = options.now();
    checkedAtMs = Number.isSafeInteger(finished) && finished >= 0 ? finished : null;
    if (checkedAtMs === null || finished < now || p.expiresAtMs <= finished || input.quote.expiresAtMs <= finished
      || input.build.expiresAtMs <= finished || proof !== null && proof.context.expiresAtMs <= finished
      || inputFingerprint !== fingerprint(input) || proofFingerprint !== fingerprint(proof)) localReasons.push("proof-changed-or-expired");
    return blockedResult(checkedAtMs, proposalHash, transactionHash, localReasons);
    } catch { return blockedResult(checkedAtMs, proposalHash, transactionHash, ["proof-boundary-failed"]); }
  } };
}

function blockedResult(checkedAtMs: number | null, proposalHash: string, transactionHash: string, localReasons: string[]): SemanticProofResult {
  return { status: "blocked", observation: "unverified", exercisedReal: false, financiallyQualified: false,
    semanticChecksPassed: false, executionEnabled: false, simulation: "not-exercised", localChecksPassed: localReasons.length === 0,
    checkedAtMs, proposalHash, transactionHash, localReasons,
    remainingRequirements: ["production-evidence-not-authenticated", "remote-simulation-not-exercised", "economic-risk-policy-unqualified"] };
}
