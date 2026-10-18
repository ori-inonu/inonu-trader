import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { utils } from "ethers";
import { preparedProposalDigest, transactionDigest } from "./preflight.ts";
import { createSemanticProofEvaluator } from "./semantic-proof.ts";
import type { DecodedSwapProof, SemanticSnapshot } from "./semantic-proof.ts";
import type { NormalizedQuote, PreparedProposal, SourceEnvelope, UnsignedTransaction } from "./types.ts";

// Fictional boundary fixtures only: no wallet, RPC, ABI or deployment is qualified.
const ADDRESS = "0x1111111111111111111111111111111111111111";
const FROM = "0x2222222222222222222222222222222222222222";
const TO = "0x3333333333333333333333333333333333333333";
const ROUTER = "0x4444444444444444444444444444444444444444";
const SPENDER = "0x5555555555555555555555555555555555555555";
const IDENTITY = createHash("sha256").update(`196:${ADDRESS}`).digest("hex");
const HASH = "a".repeat(64);
const BLOCK_HASH = `0x${"b".repeat(64)}`;
const SIGNATURE = "fixtureSwap(address,address,address,uint256,uint256,uint256)";
const ABI_JSON = JSON.stringify([`function ${SIGNATURE}`]);
const ABI_HASH = createHash("sha256").update(ABI_JSON).digest("hex");
const CALLDATA = new utils.Interface(JSON.parse(ABI_JSON)).encodeFunctionData("fixtureSwap", [ADDRESS, FROM, TO, "9007199254740993", "1990000", "10"]);
const SELECTOR = CALLDATA.slice(0, 10);

function envelope<T>(endpoint: string, unit: string, data: T): SourceEnvelope<T> {
  return { status: "ready", source: "onchainos-rest-v6", mode: "unverified", endpoint, method: "GET", chainIndex: "196",
    correlationId: "fixture-cycle", requestedAtMs: 1000, receivedAtMs: 1100, sourceAtMs: null, expiresAtMs: 10000,
    httpStatus: 200, unit, error: null, data };
}

function input() {
  const transaction: UnsignedTransaction = { chainIndex: "196", to: ROUTER, data: CALLDATA, value: "0",
    minReceiveAmount: "1990000", gas: "21000", gasPrice: "1000000000", maxPriorityFeePerGas: null,
    slippagePercent: "0.5", signed: false };
  const proposal: PreparedProposal = { id: "", correlationId: "fixture-cycle", identityKey: IDENTITY, revision: 2, chainIndex: "196",
    fromToken: FROM, toToken: TO, amountRaw: "9007199254740993", expectedOutputRaw: "2000000", minReceiveAmountRaw: "1990000",
    balanceRaw: "9007199254740994", slippagePercent: "0.5", requestedAtMs: 1000, expiresAtMs: 10000, executionEnabled: false,
    transaction, preflight: { status: "blocked", checkedAtMs: 1100, executionEnabled: false, structuralChecksPassed: true,
      semanticChecksPassed: false, simulation: "not-exercised", reasons: [], transactionHash: transactionDigest(transaction) } };
  proposal.id = preparedProposalDigest(proposal);
  const quote: NormalizedQuote = { chainIndex: "196", swapMode: "exactIn", fromTokenAmount: "9007199254740993", toTokenAmount: "2000000",
    fromToken: { tokenContractAddress: FROM, decimals: 18, decimalsSource: "provider-reference", priceUsd: "1", isHoneyPot: false, taxRate: "0" },
    toToken: { tokenContractAddress: TO, decimals: 6, decimalsSource: "provider-reference", priceUsd: "1", isHoneyPot: false, taxRate: "0" },
    priceImpactPercent: "0.1", estimatedNetworkFeeUsd: "0.021", estimatedGasRaw: "21000000000000", routeCount: 1,
    mainRoute: null, routes: [{ fromToken: FROM, toToken: TO, fromTokenIndex: null, toTokenIndex: null, dexName: "fixture", percent: "100" }],
    amountUnit: "smallest-token-unit" };
  return { address: ADDRESS, proposal, quote: envelope("/api/v6/dex/aggregator/quote", "smallest-token-unit", quote),
    build: envelope("/api/v6/dex/aggregator/swap", "unsigned-evm-transaction", {quote:structuredClone(quote),transaction}),
    expected: { identityKey: IDENTITY, chainIndex: "196", revision: 2, correlationId: "fixture-cycle" } };
}

test("missing read-only proof stays blocked and cannot certify real or expose wallet data", async () => {
  const result = await createSemanticProofEvaluator({ ports: { observe: async () => null, decode: async () => null }, now: () => 2000 }).evaluate(input());
  expect(result.localReasons).toEqual(["read-only-proof-unavailable"]);
  expect(result.localChecksPassed).toBe(false);
  expect(result).toMatchObject({ status: "blocked", observation: "unverified", exercisedReal: false, financiallyQualified: false,
    semanticChecksPassed: false, executionEnabled: false, simulation: "not-exercised" });
  expect(JSON.stringify(result)).not.toContain(ADDRESS);
  expect(JSON.stringify(result)).not.toContain(CALLDATA);
});

function snapshot(): SemanticSnapshot {
  return {
    context: { identityKey: IDENTITY, chainIndex: "196", revision: 2, correlationId: "fixture-cycle", blockNumber: "123",
      blockHash: BLOCK_HASH, observedAtMs: 1200, expiresAtMs: 9000 },
    tokens: [
      { token: FROM, balanceRaw: "9007199254740994", displayBalance: "0.009007199254740994", decimals: 18,
        decimalsMethod: "erc20-decimals" as const, sourceReference: "fixture:erc20-decimals", sourceSha256: HASH, codeHash: `0x${HASH}` },
      { token: TO, balanceRaw: "0", displayBalance: "0", decimals: 6,
        decimalsMethod: "erc20-decimals" as const, sourceReference: "fixture:erc20-decimals", sourceSha256: HASH, codeHash: `0x${HASH}` },
    ],
    deployment: { router: ROUTER, runtimeCodeHash: `0x${HASH}`, implementationCodeHash: null as string | null, abiSha256: ABI_HASH, abiJson: ABI_JSON,
      sourceSha256: HASH, sourceReference: "fixture:deployment", spender: SPENDER, spenderCodeHash: `0x${HASH}`,
      selectors: [{ selector: SELECTOR, signature: SIGNATURE, semanticsSha256: HASH }] },
    allowance: { token: FROM, spender: SPENDER, amountRaw: "9007199254740993", blockNumber: "123", blockHash: BLOCK_HASH },
    nativeBalanceRaw: "21000000000001",
    fees: { gasLimitRaw: "21000", gasPriceRaw: "1000000000", additionalFeeRaw: "0", reserveRaw: "1", maximumFeeRaw: "21000000000000",
      nativeDecimals: 18, nativePriceUsd: "1000", maximumFeeUsd: "0.021", chainIndex: "196", sourceReference: "fixture:fee-policy", sourceSha256: HASH },
  };
}

function decoded(): DecodedSwapProof {
  return { transactionHash: transactionDigest(input().proposal.transaction), chainIndex: "196", router: ROUTER,
    runtimeCodeHash: `0x${HASH}`, abiSha256: ABI_HASH, semanticsSha256: HASH, selector: SELECTOR, signature: SIGNATURE,
    reencodedCalldata: CALLDATA, uninterpretedPaths: [] as string[], sender: ADDRESS, receiver: ADDRESS,
    fromToken: FROM, toToken: TO, amountRaw: "9007199254740993", minimumOutputRaw: "1990000", valueRaw: "0", deadlineSeconds: "10",
    spender: SPENDER };
}

test("unknown deployment cannot pass even when a decoder supplies apparently matching fields", async () => {
  const state = { ...snapshot(), deployment: null };
  const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());
  expect(result.localChecksPassed).toBe(false);
  expect(result.localReasons).toContain("deployment-proof-unavailable");
});

test("tampered or stale proposal is rejected before a wallet-bearing read is requested", async () => {
  for (const corrupt of [
    (value: ReturnType<typeof input>) => { value.proposal.identityKey = HASH; },
    (value: ReturnType<typeof input>) => { value.expected.revision = 3; },
    (value: ReturnType<typeof input>) => { value.expected.chainIndex = "143"; },
    (value: ReturnType<typeof input>) => { value.expected.correlationId = "other-cycle"; },
    (value: ReturnType<typeof input>) => { value.proposal.transaction.value = "1"; },
    (value: ReturnType<typeof input>) => { value.proposal.expiresAtMs = 1999; value.proposal.id = preparedProposalDigest(value.proposal); },
  ]) {
    const candidate = input(); corrupt(candidate);
    let reads = 0;
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => { reads++; return snapshot(); }, decode: async () => decoded() }, now: () => 2000 }).evaluate(candidate);
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("proposal-binding-invalid");
    expect(reads).toBe(0);
  }
});

test("quote and build must bind to the same cycle, raw amounts, source contract and transaction", async () => {
  for (const corrupt of [
    (value: ReturnType<typeof input>) => { value.quote.correlationId = "other-cycle"; },
    (value: ReturnType<typeof input>) => { value.quote.expiresAtMs = 2000; },
    (value: ReturnType<typeof input>) => { value.quote.unit = "whole-token"; },
    (value: ReturnType<typeof input>) => { value.quote.endpoint = "/api/v5/market/ticker"; },
    (value: ReturnType<typeof input>) => { value.quote.data!.fromTokenAmount = "9007199254740992"; },
    (value: ReturnType<typeof input>) => { value.quote.data!.toToken.tokenContractAddress = FROM; },
    (value: ReturnType<typeof input>) => { value.build.data!.transaction = { ...value.build.data!.transaction, gas: "21001" }; },
    (value: ReturnType<typeof input>) => { value.build.httpStatus = 500; },
  ]) {
    const candidate = input(); corrupt(candidate);
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => snapshot(), decode: async () => decoded() }, now: () => 2000 }).evaluate(candidate);
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("quote-build-binding-invalid");
  }
});

test("read-only snapshot must have the same identity, cycle, chain and a fresh explicit block", async () => {
  for (const corrupt of [
    (state: ReturnType<typeof snapshot>) => { state.context.identityKey = HASH; },
    (state: ReturnType<typeof snapshot>) => { state.context.chainIndex = "143"; },
    (state: ReturnType<typeof snapshot>) => { state.context.revision = 1; },
    (state: ReturnType<typeof snapshot>) => { state.context.correlationId = "other-cycle"; },
    (state: ReturnType<typeof snapshot>) => { state.context.blockNumber = "latest"; },
    (state: ReturnType<typeof snapshot>) => { state.context.blockHash = "0x"; },
    (state: ReturnType<typeof snapshot>) => { state.context.expiresAtMs = 2000; },
    (state: ReturnType<typeof snapshot>) => { state.context.observedAtMs = 2001; },
  ]) {
    const state = snapshot(); corrupt(state);
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("read-only-context-invalid");
  }
});

test("independent decimals and exact same-block inventory must agree with quote and proposal", async () => {
  for (const corrupt of [
    (state: SemanticSnapshot) => { state.tokens[0]!.decimals = null; },
    (state: SemanticSnapshot) => { state.tokens[0]!.decimals = 6; },
    (state: SemanticSnapshot) => { state.tokens[0]!.decimalsMethod = "native-chain-metadata"; },
    (state: SemanticSnapshot) => { state.tokens[0]!.balanceRaw = "9007199254740993"; },
    (state: SemanticSnapshot) => { state.tokens[0]!.balanceRaw = null; },
    (state: SemanticSnapshot) => { state.tokens[0]!.displayBalance = "0.009007199254740993"; },
    (state: SemanticSnapshot) => { state.tokens[0]!.balanceRaw = (2n ** 256n).toString(); },
    (state: SemanticSnapshot) => { state.tokens[0]!.sourceSha256 = "unknown"; },
    (state: SemanticSnapshot) => { state.tokens.push({ ...state.tokens[0]! }); },
  ]) {
    const state = snapshot(); corrupt(state);
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("token-inventory-proof-invalid");
  }
});

test("deployment ABI and complete decoder must bind selector, code and every calldata byte", async () => {
  for (const corrupt of [
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { state.deployment!.runtimeCodeHash = "0x"; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { state.deployment!.abiJson = "[]"; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { state.deployment!.sourceReference = ""; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { state.deployment!.selectors = []; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { state.deployment!.selectors[0]!.signature = "other()"; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { decode.abiSha256 = HASH; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { decode.transactionHash = HASH; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { decode.reencodedCalldata = `${CALLDATA}00`; },
    (state: SemanticSnapshot, decode: DecodedSwapProof) => { decode.uninterpretedPaths = ["nested.extraData"]; },
  ]) {
    const state = snapshot(), decode = decoded(); corrupt(state, decode);
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decode }, now: () => 2000 }).evaluate(input());
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons.some(reason => ["deployment-proof-invalid", "calldata-proof-invalid"].includes(reason))).toBe(true);
  }
});

test("decoded swap binds sender, receiver, assets, exact amount, value, minimum and deadline", async () => {
  for (const corrupt of [
    (decode: DecodedSwapProof) => { decode.sender = TO; },
    (decode: DecodedSwapProof) => { decode.receiver = TO; },
    (decode: DecodedSwapProof) => { decode.fromToken = TO; },
    (decode: DecodedSwapProof) => { decode.toToken = FROM; },
    (decode: DecodedSwapProof) => { decode.spender = ROUTER; },
    (decode: DecodedSwapProof) => { decode.amountRaw = "9007199254740992"; },
    (decode: DecodedSwapProof) => { decode.minimumOutputRaw = "1989999"; },
    (decode: DecodedSwapProof) => { decode.valueRaw = "1"; },
    (decode: DecodedSwapProof) => { decode.deadlineSeconds = "9"; },
    (decode: DecodedSwapProof) => { decode.deadlineSeconds = "unknown"; },
  ]) {
    const decode = decoded(); corrupt(decode);
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => snapshot(), decode: async () => decode }, now: () => 2000 }).evaluate(input());
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("swap-semantics-invalid");
  }
});

test("ERC20 allowance must cover the exact input for the evidenced spender at the same block", async () => {
  for (const corrupt of [
    (state: SemanticSnapshot) => { state.allowance = null; },
    (state: SemanticSnapshot) => { state.allowance!.token = TO; },
    (state: SemanticSnapshot) => { state.allowance!.spender = ROUTER; },
    (state: SemanticSnapshot) => { state.allowance!.amountRaw = null; },
    (state: SemanticSnapshot) => { state.allowance!.amountRaw = "9007199254740992"; },
    (state: SemanticSnapshot) => { state.allowance!.blockNumber = "124"; },
    (state: SemanticSnapshot) => { state.allowance!.blockHash = `0x${HASH}`; },
  ]) {
    const state = snapshot(); corrupt(state);
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("allowance-proof-invalid");
  }
});

test("explicit fee bound, USD budget, reserve and native coverage use exact arithmetic", async () => {
  for (const corrupt of [
    (state: SemanticSnapshot) => { state.fees = null; },
    (state: SemanticSnapshot) => { state.fees!.chainIndex = "143"; },
    (state: SemanticSnapshot) => { state.fees!.gasLimitRaw = null; },
    (state: SemanticSnapshot) => { state.fees!.gasLimitRaw = "21001"; },
    (state: SemanticSnapshot) => { state.fees!.gasPriceRaw = null; },
    (state: SemanticSnapshot) => { state.fees!.additionalFeeRaw = null; },
    (state: SemanticSnapshot) => { state.fees!.reserveRaw = null; },
    (state: SemanticSnapshot) => { state.fees!.maximumFeeRaw = "20999999999999"; },
    (state: SemanticSnapshot) => { state.fees!.nativeDecimals = null; },
    (state: SemanticSnapshot) => { state.fees!.nativePriceUsd = null; },
    (state: SemanticSnapshot) => { state.fees!.maximumFeeUsd = "0.020999999999999999999999999999"; },
    (state: SemanticSnapshot) => { state.nativeBalanceRaw = null; },
    (state: SemanticSnapshot) => { state.nativeBalanceRaw = "21000000000000"; },
    (state: SemanticSnapshot) => { state.fees!.sourceSha256 = "unknown"; },
  ]) {
    const state = snapshot(); corrupt(state);
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("fee-coverage-proof-invalid");
  }
});

test("empty token bytecode cannot prove ERC20 balances or decimals", async () => {
  for (const hash of [`0x${"0".repeat(64)}`, utils.keccak256("0x")]) {
    const state = snapshot(); state.tokens[0]!.codeHash = hash;
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => state, decode: async () => decoded() }, now: () => 2000 }).evaluate(input());
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("token-inventory-proof-invalid");
  }
});

test("failed or malformed read boundaries return a sanitized blocked result", async () => {
  for (const ports of [
    { observe: async (): Promise<SemanticSnapshot | null> => { throw new Error(`fixture-private ${ADDRESS} ${CALLDATA}`); }, decode: async () => decoded() },
    { observe: async () => snapshot(), decode: async (): Promise<DecodedSwapProof | null> => { throw new Error(`fixture-private ${ADDRESS}`); } },
    { observe: async () => ({ ...snapshot(), tokens: [null] } as unknown as SemanticSnapshot), decode: async () => decoded() },
  ]) {
    let result = null;
    try { result = await createSemanticProofEvaluator({ ports, now: () => 2000 }).evaluate(input()); } catch { /* Test fails below if boundary errors escape. */ }
    expect(result).not.toBeNull();
    expect(result!.localChecksPassed).toBe(false);
    expect(result!.localReasons).toContain("proof-boundary-failed");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ADDRESS);
    expect(serialized).not.toContain(CALLDATA);
    expect(serialized).not.toContain("fixture-private");
  }
});

test("proof that expires or changes while awaiting the decoder must be discarded", async () => {
  for (const corrupt of [
    (candidate: ReturnType<typeof input>, state: SemanticSnapshot, setClock: (value: number) => void) => { setClock(9000); },
    (candidate: ReturnType<typeof input>, state: SemanticSnapshot, setClock: (value: number) => void) => { state.context.revision = 3; },
    (candidate: ReturnType<typeof input>, state: SemanticSnapshot, setClock: (value: number) => void) => { candidate.quote.data!.fromTokenAmount = "9007199254740992"; },
    (candidate: ReturnType<typeof input>, state: SemanticSnapshot, setClock: (value: number) => void) => {
      candidate.proposal.expiresAtMs = 2000; candidate.proposal.id = preparedProposalDigest(candidate.proposal);
    },
  ]) {
    const candidate = input(), state = snapshot(); let clock = 2000;
    const result = await createSemanticProofEvaluator({ ports: { observe: async () => state,
      decode: async () => { corrupt(candidate, state, value => { clock = value; }); return decoded(); } }, now: () => clock }).evaluate(candidate);
    expect(result.localChecksPassed).toBe(false);
    expect(result.localReasons).toContain("proof-changed-or-expired");
  }
});

test("consistent fictional inputs prove local consistency without certifying real or enabling execution", async () => {
  const result = await createSemanticProofEvaluator({ ports: { observe: async () => snapshot(), decode: async () => decoded() }, now: () => 2000 }).evaluate(input());
  expect(result.localChecksPassed).toBe(true);
  expect(result.localReasons).toEqual([]);
  expect(result).toMatchObject({ status: "blocked", observation: "unverified", exercisedReal: false, financiallyQualified: false,
    semanticChecksPassed: false, executionEnabled: false, simulation: "not-exercised", checkedAtMs: 2000 });
  expect(result.remainingRequirements).toEqual(["production-evidence-not-authenticated", "remote-simulation-not-exercised", "economic-risk-policy-unqualified"]);
  expect(JSON.stringify(result)).not.toContain(ADDRESS);
  expect(JSON.stringify(result)).not.toContain(CALLDATA);
});
