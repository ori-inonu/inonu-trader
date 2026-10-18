import { afterAll, expect, mock, test } from "bun:test";

// NOT INTEGRATED. This is a conformance suite for the receipt-safety variant (branch hermes/release-v0.0.2-receipt-safety):
// strict receipt witness validation, "unverified" quarantine and quote provenance. main's Market does not implement that
// hardening, so these tests cannot pass against main. Set RECEIPT_SAFETY_SOURCE to a checkout of that branch (with its
// dependencies installed) to run them, alone and never inside the full suite because they mock modules by path.
// Without it the whole file is one skipped test. They stay as the specification for porting the hardening.
const repoRoot = process.env.RECEIPT_SAFETY_SOURCE;
if (!repoRoot) {
  test.skip("receipt-safety Market conformance (set RECEIPT_SAFETY_SOURCE to run; hardening not integrated in main)", () => {});
} else {
const { ethers: actualEthers } = await import(`${repoRoot}/node_modules/ethers/lib/index.js`);
const orderBookArtifact = await import(`${repoRoot}/node_modules/@kuru-labs/kuru-sdk/abi/OrderBook.json`);
const orderBookInterface = new actualEthers.utils.Interface(orderBookArtifact.default.abi);
const orderCreatedFragment = orderBookInterface.getEvent("OrderCreated");
const ordersCanceledFragment = orderBookInterface.getEvent("OrdersCanceled");

const MARKET_ADDRESS = "0x0000000000000000000000000000000000000001";
const OWNER_ADDRESS = "0x0000000000000000000000000000000000000002";
const FOREIGN_ADDRESS = "0x0000000000000000000000000000000000000003";
const NON_KEY_PLACEHOLDER = "UNUSED_BY_FAKE_WALLET_NOT_A_KEY";
const RECEIPT_BLOCK_HASH = `0x${"a".repeat(64)}`;
const TX_HASH = `0x${"1".padStart(64, "0")}`;

interface FakeLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  removed: boolean;
}

interface FakeReceipt {
  status: unknown;
  blockNumber: unknown;
  blockHash: unknown;
  transactionHash: unknown;
  logs: unknown;
  effectiveGasPrice?: unknown;
}

interface Fixture {
  submissions: { hash: string; fakePayload: { fakeSignature: true; nonce?: number; to?: string } }[];
  receipts: Map<string, FakeReceipt>;
  signerCalls: { nonce?: number; to?: string }[];
}

let fixture: Fixture;
let networkAttempts = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  networkAttempts++;
  throw new Error("Network is forbidden in this isolated Market receipt test");
}) as unknown as typeof fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
  expect(networkAttempts).toBe(0);
});

class FakeStaticJsonRpcProvider {
  constructor(readonly connection: string, readonly network: number) {}
}

class FakeWallet {
  readonly address = OWNER_ADDRESS;

  constructor(privateKey: string, readonly provider: unknown) {
    if (privateKey !== NON_KEY_PLACEHOLDER) throw new Error("Unexpected signer input");
    if (!(provider instanceof FakeStaticJsonRpcProvider)) throw new Error("Real provider boundary detected");
  }

  async signTransaction(tx: { nonce?: number; to?: string }): Promise<string> {
    fixture.signerCalls.push({ nonce: tx.nonce, to: tx.to });
    return JSON.stringify({ fakeSignature: true, nonce: tx.nonce, to: tx.to });
  }
}

const fakeEthers = {
  ...actualEthers,
  Wallet: FakeWallet,
  providers: { ...actualEthers.providers, StaticJsonRpcProvider: FakeStaticJsonRpcProvider },
};
mock.module(`${repoRoot}/node_modules/ethers`, () => ({ ...fakeEthers, ethers: fakeEthers }));
mock.module(`${repoRoot}/node_modules/@kuru-labs/kuru-sdk`, () => ({}));
mock.module(`${repoRoot}/src/config.ts`, () => ({
  config: {
    dryRun: false,
    privateKey: NON_KEY_PLACEHOLDER,
    rpcUrl: "https://market-receipt-test.invalid",
    readRpcUrl: "https://market-receipt-test.invalid",
    chainId: 1,
    market: MARKET_ADDRESS,
    gasLimitFallback: 200000,
    maxFeeGwei: 140,
    priorityFeeGwei: 2,
    quoteInsideTicks: 1,
    pendingBlocks: 8,
  },
}));
mock.module(`${repoRoot}/src/chain.ts`, () => ({
  rpc: async (method: string, params: unknown[] = []): Promise<unknown> => {
    if (method === "eth_sendRawTransaction") {
      const fakePayload = JSON.parse(String(params[0])) as Fixture["submissions"][number]["fakePayload"];
      if (fakePayload.fakeSignature !== true) throw new Error("Non-fake signer payload reached RPC boundary");
      const hash = `0x${String(fixture.submissions.length + 1).padStart(64, "0")}`;
      fixture.submissions.push({ hash, fakePayload });
      return hash;
    }
    if (method === "eth_getTransactionReceipt") return fixture.receipts.get(String(params[0])) ?? null;
    throw new Error(`Unexpected fake RPC method: ${method}`);
  },
}));
mock.module(`${repoRoot}/src/book.ts`, () => ({
  readBook: async () => { throw new Error("readBook is not part of this Market receipt test"); },
  readVaultParams: async () => { throw new Error("readVaultParams is not part of this Market receipt test"); },
  vaultActive: () => false,
  log10: (value: number) => Math.log10(value),
}));

const { Market } = await import(`${repoRoot}/src/market.ts`);
type MarketInstance = InstanceType<typeof Market>;
type MarketBook = Parameters<MarketInstance["send"]>[3];

function setup() {
  fixture = { submissions: [], receipts: new Map(), signerCalls: [] };
  const market = new Market();
  expect(market.provider).toBeInstanceOf(FakeStaticJsonRpcProvider);
  expect(market.wallet).toBeInstanceOf(FakeWallet);
  market.params = {
    pricePrecision: actualEthers.BigNumber.from(1000),
    sizePrecision: actualEthers.BigNumber.from(1),
    baseAssetAddress: MARKET_ADDRESS,
    baseAssetDecimals: actualEthers.BigNumber.from(18),
    quoteAssetAddress: MARKET_ADDRESS,
    quoteAssetDecimals: actualEthers.BigNumber.from(6),
    tickSize: actualEthers.BigNumber.from(1),
    minSize: actualEthers.BigNumber.from(1),
    maxSize: actualEthers.BigNumber.from(1000000),
    takerFeeBps: actualEthers.BigNumber.from(0),
    makerFeeBps: actualEthers.BigNumber.from(0),
  };
  const book = {
    block: 100,
    bid: 1,
    ask: 1.01,
    mid: 1.005,
    spreadBps: 99.5,
    imbalance: 0,
    levels: { bids: [[1, 1000]], asks: [[1.01, 1000]] },
    depthBps: { "10": { bid: 1000, ask: 1000 } },
  } as MarketBook;
  return { market, book };
}

function orderCreatedLog(
  address: string,
  owner: string,
  orderId: number,
  transactionHash: string,
  overrides: Partial<FakeLog> = {},
): FakeLog {
  const encoded = orderBookInterface.encodeEventLog(orderCreatedFragment, [orderId, owner, 200, 1000, true]);
  return {
    address,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber: "0x67",
    blockHash: RECEIPT_BLOCK_HASH,
    transactionHash,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
    ...overrides,
  };
}

function canceledLog(
  address: string,
  owner: string,
  orderIds: number[],
  transactionHash: string,
  overrides: Partial<FakeLog> = {},
): FakeLog {
  const encoded = orderBookInterface.encodeEventLog(ordersCanceledFragment, [orderIds, owner]);
  return {
    address,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber: "0x67",
    blockHash: RECEIPT_BLOCK_HASH,
    transactionHash,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
    ...overrides,
  };
}

function receiptFor(
  txHash: string,
  logs: unknown[],
  options: Partial<FakeReceipt> = {},
): FakeReceipt {
  return {
    status: "0x1",
    blockNumber: "0x67",
    blockHash: RECEIPT_BLOCK_HASH,
    transactionHash: txHash,
    logs,
    ...options,
  };
}

async function sendAndPoll(
  logs: (txHash: string) => unknown[],
  options: Partial<FakeReceipt> = {},
) {
  const { market, book } = setup();
  const submittedQuote = await market.send(101, "buy", 200, book, [], false);
  fixture.receipts.set(submittedQuote.txHash!, receiptFor(submittedQuote.txHash!, logs(submittedQuote.txHash!), options));
  const results = await market.pollPending(103);
  expect(results).toHaveLength(1);
  return { market, submittedQuote, result: results[0]!, rawFakeReceipt: fixture.receipts.get(submittedQuote.txHash!)! };
}

test("same-market OrderCreated from a foreign owner is unverified and cannot place or cancel our orders", async () => {
  const { result } = await sendAndPoll((txHash) => [
    orderCreatedLog(MARKET_ADDRESS, FOREIGN_ADDRESS, 4401, txHash),
    canceledLog(MARKET_ADDRESS, FOREIGN_ADDRESS, [71], txHash),
  ]);

  expect(result.quote.status as string).toBe("unverified");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
});

test("a successful-looking receipt without an explicit status is unverified", async () => {
  const { result } = await sendAndPoll(
    (txHash) => [orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5502, txHash)],
    { status: undefined },
  );

  expect(result.quote.status as string).toBe("unverified");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
});

test("a receipt for a different transaction cannot prove placement or cancellation", async () => {
  const { result } = await sendAndPoll(
    (txHash) => [
      orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5503, txHash),
      canceledLog(MARKET_ADDRESS, OWNER_ADDRESS, [72], txHash),
    ],
    { transactionHash: `0x${"2".repeat(64)}` },
  );

  expect(result.quote.status as string).toBe("unverified");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
});

test("a consistent receipt keeps origin and snapshot separate from observed inclusion", async () => {
  const { submittedQuote, result } = await sendAndPoll((txHash) => [
    orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5504, txHash),
  ]);

  expect(result.block).toBe(101);
  expect((submittedQuote as any).provenance).toEqual({
    originBlock: 101,
    snapshotBlock: 100,
    target: null,
    inclusion: null,
    finality: "unobserved",
  });
  expect((result.quote as any).provenance).toEqual({
    originBlock: 101,
    snapshotBlock: 100,
    target: null,
    inclusion: {
      blockNumber: 103,
      blockHash: RECEIPT_BLOCK_HASH,
      transactionHash: TX_HASH,
    },
    finality: "unobserved",
  });
  expect(result.quote.status as string).toBe("placed");
  expect(result.quote.orderId).toBe(5504);
});

test("an own order witness with contradictory inclusion identity is unverified", async () => {
  const { result } = await sendAndPoll((txHash) => [
    orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5505, txHash, {
      blockNumber: "0x68",
      blockHash: `0x${"b".repeat(64)}`,
      transactionHash: `0x${"2".repeat(64)}`,
    }),
  ]);

  expect(result.quote.status as string).toBe("unverified");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
});

test("malformed log containers emit one unverified result and do not vanish on parser failure", async () => {
  const { market, book } = setup();
  const submittedQuote = await market.send(101, "buy", 200, book, [], false);
  fixture.receipts.set(submittedQuote.txHash!, receiptFor(submittedQuote.txHash!, [], { logs: { invalid: true } }));

  const first = await market.pollPending(103);
  expect(first).toHaveLength(1);
  expect(first[0]?.quote.status as string).toBe("unverified");
  expect(first[0]?.quote.orderId).toBeNull();
  expect(first[0]?.canceled).toEqual([]);
  expect(await market.pollPending(104)).toEqual([]);
});

test("an observed unverified receipt quarantines later Market sends before signing", async () => {
  const { market, book } = setup();
  const firstQuote = await market.send(101, "buy", 200, book, [], false);
  fixture.receipts.set(firstQuote.txHash!, receiptFor(firstQuote.txHash!, []));
  const result = await market.pollPending(103);
  expect(result[0]?.quote.status as string).toBe("unverified");

  let blocked = false;
  try { await market.send(104, "sell", 200, book, [], false); }
  catch { blocked = true; }

  expect(blocked).toBe(true);
  expect(fixture.signerCalls).toHaveLength(1);
  expect(fixture.submissions).toHaveLength(1);
});

test("a foreign contract cannot cancel our order even when the owner matches", async () => {
  const { result } = await sendAndPoll((txHash) => [
    orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5510, txHash),
    canceledLog(FOREIGN_ADDRESS, OWNER_ADDRESS, [71], txHash),
  ]);

  expect(result.quote.status as string).toBe("placed");
  expect(result.quote.orderId).toBe(5510);
  expect(result.canceled).toEqual([]);
});

test("only a same-market same-owner cancellation witness changes canceled ids", async () => {
  const { result } = await sendAndPoll((txHash) => [
    orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5517, txHash),
    canceledLog(MARKET_ADDRESS, OWNER_ADDRESS, [74, 75], txHash, { logIndex: 1 }),
    canceledLog(MARKET_ADDRESS, FOREIGN_ADDRESS, [76], txHash, { logIndex: 2 }),
  ]);

  expect(result.quote.status as string).toBe("placed");
  expect(result.quote.orderId).toBe(5517);
  expect(result.canceled).toEqual([74, 75]);
});

test("multiple own OrderCreated witnesses are ambiguous and yield no order or cancellation effects", async () => {
  const { result } = await sendAndPoll((txHash) => [
    orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5511, txHash),
    orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5512, txHash, { logIndex: 1 }),
    canceledLog(MARKET_ADDRESS, OWNER_ADDRESS, [72], txHash, { logIndex: 2 }),
  ]);

  expect(result.quote.status as string).toBe("unverified");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
});

test("a removed own witness is unverified", async () => {
  const { result } = await sendAndPoll((txHash) => [
    orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5513, txHash, { removed: true }),
  ]);

  expect(result.quote.status as string).toBe("unverified");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
});

test("a receipt missing its transaction identity cannot borrow identity from its log", async () => {
  const { result } = await sendAndPoll(
    (txHash) => [orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5514, txHash)],
    { transactionHash: undefined },
  );

  expect(result.quote.status as string).toBe("unverified");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
  expect((result.quote as any).provenance.inclusion).toBeNull();
});

test("malformed status, block, hash, log and gas encodings remain unverified", async () => {
  const malformedReceipts: Partial<FakeReceipt>[] = [
    { status: "0x01" },
    { blockNumber: "0x067" },
    { blockHash: "0x1234" },
    { logs: [null] },
    { effectiveGasPrice: "0x01" },
  ];
  for (const malformed of malformedReceipts) {
    const { result } = await sendAndPoll(
      (txHash) => [orderCreatedLog(MARKET_ADDRESS, OWNER_ADDRESS, 5515, txHash)],
      malformed,
    );
    expect(result.quote.status as string).toBe("unverified");
    expect(result.quote.orderId).toBeNull();
    expect(result.canceled).toEqual([]);
  }
});

test("a canonical revert ignores impossible order and cancellation effects", async () => {
  const { result } = await sendAndPoll(
    (txHash) => [
      orderCreatedLog(FOREIGN_ADDRESS, FOREIGN_ADDRESS, 5516, txHash),
      canceledLog(FOREIGN_ADDRESS, FOREIGN_ADDRESS, [73], txHash),
    ],
    { status: "0x0" },
  );

  expect(result.quote.status as string).toBe("reverted");
  expect(result.quote.orderId).toBeNull();
  expect(result.canceled).toEqual([]);
});

test("a lost Market submission quarantines later sends before signing", async () => {
  const { market, book } = setup();
  const firstQuote = await market.send(101, "sell", 200, book, [], false);
  const result = await market.pollPending(109);
  expect(result).toHaveLength(1);
  expect(result[0]?.quote.status).toBe("lost");

  let blocked = false;
  try { await market.send(110, "buy", 200, book, [], false); }
  catch { blocked = true; }

  expect(blocked).toBe(true);
  expect(fixture.signerCalls).toHaveLength(1);
  expect(fixture.submissions).toHaveLength(1);
  expect(result[0]?.quote.txHash).toBe(firstQuote.txHash);
});
}
