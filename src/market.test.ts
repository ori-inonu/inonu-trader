import { expect, mock, test } from "bun:test";
import { BigNumber, ethers } from "ethers";
import { config } from "./config";

let fixtureReceipt: unknown = null;
let broadcastFailure: unknown = null;
let broadcastAck: unknown = null;
const rpcCalls: string[] = [];
mock.module("./chain", () => ({
  rpc: async (method: string) => {
    rpcCalls.push(method);
    if (method === "eth_getTransactionReceipt") return fixtureReceipt;
    if (method === "eth_sendRawTransaction") {
      if (broadcastFailure) throw broadcastFailure;
      return broadcastAck;
    }
    if (method === "eth_getTransactionCount") return "0x1";
    throw new Error(`unexpected fixture RPC method: ${method}`);
  },
}));

const MarketModule = await import("./market.ts");
const { Market } = MarketModule;
const PENDING_HASH = `0x${"ab".repeat(32)}`;

function pendingReceipt(fields: Record<string, unknown>) {
  return { transactionHash: PENDING_HASH, ...fields };
}

function pendingMarket(receipt: unknown) {
  fixtureReceipt = receipt;
  rpcCalls.length = 0;
  const market = new Market() as any;
  market.wallet = { address: "0x0000000000000000000000000000000000000001" };
  market.pending.set(PENDING_HASH, {
    block: 1,
    quote: {
      side: "buy",
      price: 2,
      size: 1,
      txHash: PENDING_HASH,
      gasMon: 0.5,
      gasEstimateMon: 0.5,
      gasEvidence: "pending",
      cancel: [],
      status: "sent",
      orderId: null,
      capped: false,
    },
    gasLimit: BigNumber.from(1_000_000),
  });
  return market;
}

const fixtureSignedTransaction = ethers.utils.serializeTransaction(
  {
    type: 2,
    chainId: 143,
    nonce: 0,
    maxPriorityFeePerGas: 1,
    maxFeePerGas: 2,
    gasLimit: 21_000,
    to: "0x0000000000000000000000000000000000000002",
    value: 0,
    data: "0x",
  },
  { v: 0, r: `0x${"11".repeat(32)}`, s: `0x${"22".repeat(32)}` },
);

function broadcastMarket() {
  const market = new Market() as any;
  market.wallet = {
    address: "0x0000000000000000000000000000000000000001",
    signTransaction: async () => fixtureSignedTransaction,
  };
  market.params = {
    pricePrecision: BigNumber.from(1_000_000),
    sizePrecision: BigNumber.from(1_000_000),
    tickSize: BigNumber.from(1),
  };
  market.buildTx = () => ({});
  return market;
}

function eventLog(market: any, eventName: string, args: unknown[], address = config.market) {
  const encoded = market.iface.encodeEventLog(market.iface.getEvent(eventName), args);
  return { address, topics: encoded.topics, data: encoded.data };
}

function orderCreatedLog(market: any, orderId: number, owner = "0x0000000000000000000000000000000000000001", address = config.market) {
  return eventLog(market, "OrderCreated", [BigNumber.from(orderId), owner, BigNumber.from(1), BigNumber.from(2), true], address);
}

test("an ambiguous broadcast is tracked by the hash of the signed bytes and never resyncs the nonce", async () => {
  fixtureReceipt = null;
  broadcastFailure = new Error("fixture acknowledgement lost");
  broadcastAck = null;
  rpcCalls.length = 0;
  const market = broadcastMarket();
  const expectedHash = ethers.utils.keccak256(fixtureSignedTransaction);
  let thrown: any;

  try {
    await market.send(1, "buy", 1, { block: 1, bid: 1.5, ask: 2.5, mid: 2, spreadBps: 100, imbalance: 0, levels: { bids: [], asks: [] }, depthBps: {} }, [], false);
  } catch (error) { thrown = error; }

  expect(thrown?.name).toBe("AmbiguousBroadcastError");
  expect(thrown?.txHash).toBe(expectedHash);
  expect(thrown?.quote?.status).toBe("lost");
  expect(market.pending.has(expectedHash)).toBe(true);
  expect(rpcCalls).toEqual(["eth_sendRawTransaction"]);
});

test("a mismatched successful broadcast acknowledgement cannot replace the signed-byte identity", async () => {
  fixtureReceipt = null;
  broadcastFailure = null;
  broadcastAck = "0xcaller-supplied-hash";
  rpcCalls.length = 0;
  const market = broadcastMarket();
  const expectedHash = ethers.utils.keccak256(fixtureSignedTransaction);
  let thrown: any;

  try {
    await market.send(1, "buy", 1, { block: 1, bid: 1.5, ask: 2.5, mid: 2, spreadBps: 100, imbalance: 0, levels: { bids: [], asks: [] }, depthBps: {} }, [], false);
  } catch (error) { thrown = error; }

  expect(thrown?.name).toBe("AmbiguousBroadcastError");
  expect(thrown?.txHash).toBe(expectedHash);
  expect(market.pending.has(expectedHash)).toBe(true);
});

test("a signing failure remains a pre-broadcast failure with no pending attempt", async () => {
  broadcastFailure = null;
  broadcastAck = null;
  rpcCalls.length = 0;
  const market = broadcastMarket();
  const signerFailure = new Error("fixture signer failure");
  market.wallet.signTransaction = async () => { throw signerFailure; };
  let thrown: unknown;

  try {
    await market.send(1, "buy", 1, { block: 1, bid: 1.5, ask: 2.5, mid: 2, spreadBps: 100, imbalance: 0, levels: { bids: [], asks: [] }, depthBps: {} }, [], false);
  } catch (error) { thrown = error; }

  expect(thrown).toBe(signerFailure);
  expect(rpcCalls).toEqual([]);
  expect(market.pending.size).toBe(0);
});

test("a matching broadcast acknowledgement returns its locally derived hash", async () => {
  fixtureReceipt = null;
  broadcastFailure = null;
  broadcastAck = ethers.utils.keccak256(fixtureSignedTransaction);
  rpcCalls.length = 0;
  const market = broadcastMarket();

  const quote = await market.send(1, "buy", 1, { block: 1, bid: 1.5, ask: 2.5, mid: 2, spreadBps: 100, imbalance: 0, levels: { bids: [], asks: [] }, depthBps: {} }, [], false);

  expect(quote.status).toBe("sent");
  expect(quote.txHash).toBe(broadcastAck);
  expect(market.pending.has(quote.txHash!)).toBe(true);
});

test("receipt gas uses the charged gas limit and observed effective gas price", async () => {
  const market = pendingMarket(null);
  fixtureReceipt = pendingReceipt({
    status: "0x1",
    effectiveGasPrice: ethers.utils.parseUnits("1", "gwei").toHexString(),
    gasUsed: "0x5208",
    logs: [orderCreatedLog(market, 7)],
  });
  const [result] = await market.pollPending(2);

  expect(result!.quote.gasMon).toBeCloseTo(0.001, 12);
  expect(result!.quote.gasEvidence).toBe("observed");
  expect(result!.quote.status).toBe("placed");
});

test("missing effective receipt gas remains unknown instead of using the configured fee fallback", async () => {
  const market = pendingMarket(null);
  fixtureReceipt = pendingReceipt({ status: "0x1", logs: [orderCreatedLog(market, 8)] });
  const [result] = await market.pollPending(2);

  expect(result!.quote.gasMon).toBeNull();
  expect(result!.quote.gasEvidence).toBe("unknown");
  expect(result!.quote.gasEstimateMon).toBe(0.5);
});

test("invalid receipt gas remains unknown without discarding a valid execution status", async () => {
  const market = pendingMarket(null);
  fixtureReceipt = pendingReceipt({ status: "0x1", effectiveGasPrice: "invalid", logs: [orderCreatedLog(market, 9)] });
  const [result] = await market.pollPending(2);

  expect(result!.quote.gasMon).toBeNull();
  expect(result!.quote.gasEvidence).toBe("unknown");
  expect(result!.quote.status).toBe("placed");
});

test("a successful quote receipt without one trustworthy owner order identity stays unresolved", async () => {
  const cases = [
    { label: "no OrderCreated", logs: (_market: any) => [] },
    { label: "wrong owner", logs: (market: any) => [orderCreatedLog(market, 10, "0x0000000000000000000000000000000000000002")] },
    { label: "wrong contract", logs: (market: any) => [orderCreatedLog(market, 10, undefined, "0x0000000000000000000000000000000000000003")] },
    { label: "zero order id", logs: (market: any) => [orderCreatedLog(market, 0)] },
    { label: "malformed log", logs: () => [{ address: config.market, topics: [], data: "0x" }] },
  ];

  for (const entry of cases) {
    const market = pendingMarket(null);
    fixtureReceipt = pendingReceipt({ status: "0x1", logs: entry.logs(market) });
    const [result] = await market.pollPending(2);

    expect(result!.quote.status, entry.label).toBe("lost");
    expect(result!.quote.orderId, entry.label).toBeNull();
    expect(market.pending.has(PENDING_HASH), entry.label).toBe(true);
  }
});

test("a successful quote receipt accepts only the configured market, our owner, and a positive safe id", async () => {
  const market = pendingMarket(null);
  fixtureReceipt = pendingReceipt({ status: "0x1", logs: [orderCreatedLog(market, 11)] });
  const [result] = await market.pollPending(2);

  expect(result!.quote.status).toBe("placed");
  expect(result!.quote.orderId).toBe(11);
  expect(market.pending.has(PENDING_HASH)).toBe(false);
});

test("a cancellation receipt reconciles OrdersCanceled without requiring OrderCreated", async () => {
  const market = pendingMarket(null);
  const pending = market.pending.get(PENDING_HASH);
  pending.kind = "cancel";
  pending.quote.cancel = [41];
  fixtureReceipt = pendingReceipt({ status: "0x1", logs: [eventLog(market, "OrdersCanceled", [[BigNumber.from(41)], "0x0000000000000000000000000000000000000001"])] });
  const [result] = await market.pollPending(2);

  expect(result!.kind).toBe("cancel");
  expect(result!.quote.status).toBe("placed");
  expect(result!.quote.orderId).toBeNull();
  expect(result!.canceled).toEqual([41]);
});

test("receipt identity is correlated to the pending map key before status gas or logs are read", async () => {
  const market = pendingMarket(null);
  const accessed: string[] = [];
  const receipt: Record<string, unknown> = { transactionHash: `0x${"cd".repeat(32)}` };
  Object.defineProperties(receipt, {
    status: { get() { accessed.push("status"); return "0x1"; } },
    effectiveGasPrice: { get() { accessed.push("effectiveGasPrice"); return ethers.utils.parseUnits("1", "gwei").toHexString(); } },
    logs: { get() { accessed.push("logs"); return [orderCreatedLog(market, 7)]; } },
  });
  fixtureReceipt = receipt;

  const [result] = await market.pollPending(2);

  expect(accessed).toEqual([]);
  expect(result!.quote).toMatchObject({ txHash: PENDING_HASH, status: "lost", orderId: null, gasMon: null, gasEvidence: "unknown" });
  expect(result!.canceled).toEqual([]);
  expect(market.pending.has(PENDING_HASH)).toBe(true);
});

test("missing or malformed transaction hashes cannot establish a placed quote", async () => {
  const invalidHashes: unknown[] = [undefined, "", ` ${PENDING_HASH}`, `${PENDING_HASH} `, `0x${"gg".repeat(32)}`];

  for (const transactionHash of invalidHashes) {
    const market = pendingMarket(null);
    const receipt: Record<string, unknown> = {
      status: "0x1",
      effectiveGasPrice: ethers.utils.parseUnits("1", "gwei").toHexString(),
      logs: [orderCreatedLog(market, 17)],
    };
    if (transactionHash !== undefined) receipt.transactionHash = transactionHash;
    fixtureReceipt = receipt;

    const [result] = await market.pollPending(2);

    expect(result!.quote, String(transactionHash)).toMatchObject({ txHash: PENDING_HASH, status: "lost", orderId: null, gasMon: null, gasEvidence: "unknown" });
    expect(result!.canceled, String(transactionHash)).toEqual([]);
    expect(market.pending.has(PENDING_HASH), String(transactionHash)).toBe(true);
  }
});

test("a mismatched reverted receipt cannot establish reversion or observed gas", async () => {
  const market = pendingMarket(null);
  fixtureReceipt = {
    transactionHash: `0x${"cd".repeat(32)}`,
    status: "0x0",
    effectiveGasPrice: ethers.utils.parseUnits("1", "gwei").toHexString(),
    logs: [],
  };

  const [result] = await market.pollPending(2);

  expect(result!.quote).toMatchObject({ txHash: PENDING_HASH, status: "lost", orderId: null, gasMon: null, gasEvidence: "unknown" });
  expect(market.pending.has(PENDING_HASH)).toBe(true);
});

test("a mismatched receipt remains retryable and a matching late receipt reconciles once", async () => {
  const market = pendingMarket(null);
  fixtureReceipt = {
    transactionHash: `0x${"cd".repeat(32)}`,
    status: "0x1",
    effectiveGasPrice: ethers.utils.parseUnits("1", "gwei").toHexString(),
    logs: [orderCreatedLog(market, 18)],
  };
  const [unresolved] = await market.pollPending(2);
  expect(unresolved!.quote.status).toBe("lost");
  expect(market.pending.has(PENDING_HASH)).toBe(true);

  fixtureReceipt = pendingReceipt({
    status: "0x1",
    effectiveGasPrice: ethers.utils.parseUnits("1", "gwei").toHexString(),
    logs: [orderCreatedLog(market, 19)],
  });
  const [late] = await market.pollPending(3);

  expect(late!.quote).toMatchObject({ txHash: PENDING_HASH, status: "placed", orderId: 19, gasEvidence: "observed" });
  expect(market.pending.has(PENDING_HASH)).toBe(false);
  expect(await market.pollPending(4)).toEqual([]);
  expect(rpcCalls).toEqual(["eth_getTransactionReceipt", "eth_getTransactionReceipt"]);
});

test("a missing receipt becomes a lost quote with unknown cost and no nonce resync RPC", async () => {
  const originalPendingBlocks = config.pendingBlocks;
  config.pendingBlocks = 1;
  try {
    const market = pendingMarket(null);
    const [result] = await market.pollPending(2);

    expect(result!.quote.status).toBe("lost");
    expect(result!.quote.gasMon).toBeNull();
    expect(result!.quote.gasEvidence).toBe("unknown");
    expect(rpcCalls).toEqual(["eth_getTransactionReceipt"]);
  } finally {
    config.pendingBlocks = originalPendingBlocks;
  }
});

test("gas log formatting distinguishes estimates, pending receipts, observed cost, and unknown cost", () => {
  const formatQuoteGas = (MarketModule as any).formatQuoteGas as (quote: unknown) => string;
  expect(formatQuoteGas({ gasMon: 0.5, gasEvidence: "estimate" })).toContain("estimate");
  expect(formatQuoteGas({ gasMon: null, gasEstimateMon: 0.5, gasEvidence: "pending" })).toContain("pending");
  expect(formatQuoteGas({ gasMon: 0.01, gasEvidence: "observed" })).toContain("observed");
  expect(formatQuoteGas({ gasMon: null, gasEvidence: "unknown" })).toContain("unknown");
});
