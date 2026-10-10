import { test, expect, mock } from "bun:test";
import { config } from "./config";
let receiptFixture: unknown = null;
const receiptRpcCalls: string[] = [];
mock.module("./chain", () => ({
  rpc: async (method: string) => {
    receiptRpcCalls.push(method);
    if (method === "eth_getTransactionReceipt") return receiptFixture;
    throw new Error(`unexpected fixture RPC method: ${method}`);
  },
}));
const { Trader } = await import("./trader.ts");
const { AmbiguousBroadcastError, Market } = await import("./market.ts");
const book = { block: 1, bid: 1.5, ask: 2.5, mid: 2, spreadBps: 100, imbalance: 0, levels: { bids: [], asks: [] }, depthBps: {} };
const RECEIPT_ATTEMPT_HASH = `0x${"ab".repeat(32)}`;
const RECEIPT_OTHER_HASH = `0x${"cd".repeat(32)}`;
const decision = (action: string) => ({ action, probabilities: { buy: action === "buy" ? 1 : 0, sell: 0, hold: action === "hold" ? 1 : 0 }, upIn10: 0.5, latencyMs: 0, inputTokens: 1000 });
function fixture(action: string) {
  let sends = 0;
  const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, margin: { mon: 0, usdc: 0 }, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async (_: number, side: string, size: number) => { sends++; return { side, size, price: 2, gasMon: 0.1, gasEstimateMon: 0.1, gasEvidence: "estimate", status: "sim", txHash: null, cancel: [], orderId: null, capped: false }; } };
  const trader = new Trader(market as any, { name: "mock", decide: async () => decision(action) } as any, () => {}, undefined, undefined, () => {});
  return { trader, sends: () => sends };
}

function marketWithReceiptAttempt(kind: "quote" | "cancel", cancel: number[] = []) {
  receiptFixture = null;
  receiptRpcCalls.length = 0;
  const market = new Market() as any;
  market.wallet = { address: "0x0000000000000000000000000000000000000001" };
  market.pending.set(RECEIPT_ATTEMPT_HASH, {
    block: 1,
    quote: {
      side: "buy", price: 2, size: 1, txHash: RECEIPT_ATTEMPT_HASH,
      gasMon: null, gasEstimateMon: 0.1, gasEvidence: "pending", cancel,
      status: "sent", orderId: null, capped: false,
    },
    gasLimit: market.gasLimit,
    kind,
    lostReported: false,
  });
  return market;
}

function encodedMarketLog(market: any, eventName: string, args: unknown[]) {
  const encoded = market.iface.encodeEventLog(market.iface.getEvent(eventName), args);
  return { address: config.market, topics: encoded.topics, data: encoded.data };
}
test("an overlapping newer block invalidates a delayed model result", async () => {
  const old = config.marginMon; config.marginMon = 0;
  try {
    let release!: (value: any) => void, sends = 0;
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async () => { sends++; } };
    const trader = new Trader(market as any, { name: "mock", decide: () => new Promise(r => release = r) } as any, () => {}, undefined, undefined, () => {});
    const pending = trader.onBlock(1); await Bun.sleep(1); await trader.onBlock(2); release(decision("buy")); await pending;
    expect(sends).toBe(0);
  } finally { config.marginMon = old; }
});

test("an overlapping block clears an existing paper order while inference is pending", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1 });
  try {
    let release!: (value: any) => void, calls = 0;
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async (_: number, side: string, size: number) => ({ side, size, price: 2, gasMon: 0.1, gasEstimateMon: 0.1, gasEvidence: "estimate", status: "sim", txHash: null, cancel: [], orderId: null, capped: false }) };
    const trader = new Trader(market as any, { name: "mock", decide: () => ++calls === 1 ? Promise.resolve(decision("buy")) : new Promise(r => release = r) } as any, () => {}, undefined, undefined, () => {});
    await trader.onBlock(1);
    expect(trader.history.at(-1)!.resting.bidMon).toBe(1);
    const pending = trader.onBlock(2); await Bun.sleep(1); await trader.onBlock(3);
    const resting = trader.history.at(-1)!.resting.bidMon;
    release(decision("buy")); await pending;
    expect(resting).toBe(0);
  } finally { Object.assign(config, old); }
});
test("spending latch prevents new orders after the threshold", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, maxSpendUsd: config.maxSpendUsd };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, maxSpendUsd: 0.1 });
  try { const f = fixture("buy"); await f.trader.onBlock(1); expect(f.sends()).toBe(1); expect(f.trader.stopReason).toBe("session-spend"); expect(f.trader.history.at(-1)!.resting.bidMon).toBe(0); await f.trader.onBlock(101); expect(f.sends()).toBe(1); } finally { Object.assign(config, old); }
});
test("hold never sends an order and mock incurs no Jev bill", async () => {
  const old = config.marginMon; config.marginMon = 0;
  try { const f = fixture("hold"); await f.trader.onBlock(1); expect(f.sends()).toBe(0); expect(f.trader.history[0]!.totals.jevUsd).toBe(0); } finally { config.marginMon = old; }
});

test("economically infeasible spread makes no inference or order call", async () => {
  const old = config.marginMon; config.marginMon = 0;
  try {
    let calls = 0, sends = 0;
    const market = { wallet: null, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, quotePrice: (side: string) => side === "buy" ? 1.999999 : 2.000001, estimatedGasMon: () => 0.1, send: async () => { sends++; } };
    const trader = new Trader(market as any, { name: "mock", decide: async () => { calls++; return decision("buy"); } } as any, () => {}, undefined, undefined, () => {});
    await trader.onBlock(1);
    expect(calls).toBe(0); expect(sends).toBe(0); expect(trader.history[0]!.decision).toBeNull();
  } finally { config.marginMon = old; }
});
test("paper gas reduces P&L and interval suppresses another decision", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1 });
  try { const f = fixture("buy"); await f.trader.onBlock(1); expect(f.trader.history.at(-1)!.resting.bidMon).toBe(1); await f.trader.onBlock(2); expect(f.sends()).toBe(1); expect(f.trader.history.at(-1)!.resting.bidMon).toBe(0); expect(f.trader.history.at(-1)!.totals.pnlUsd).toBeCloseTo(-0.2); } finally { Object.assign(config, old); }
});

test("an unresolved model deadline stops, clears paper orders, and only accounts a late result", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks, maxDecisionMs: config.maxDecisionMs };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1, maxDecisionMs: 30 });
  let release!: (value: any) => void;
  let pending: Promise<void> | undefined;
  try {
    let calls = 0, sends = 0;
    const journal: any[] = [];
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async (_: number, side: string, size: number) => { sends++; return { side, size, price: 2, gasMon: 0.1, gasEstimateMon: 0.1, gasEvidence: "estimate", status: "sim", txHash: null, cancel: [], orderId: null, capped: false }; } };
    const trader = new Trader(market as any, { name: "jev", decide: () => { calls++; return calls === 1 ? Promise.resolve(decision("buy")) : new Promise(resolve => release = resolve); } } as any, () => {}, undefined, undefined, row => journal.push(row));
    await trader.onBlock(1);
    expect(trader.history.at(-1)!.resting.bidMon).toBe(1);

    const started = performance.now();
    pending = trader.onBlock(2);
    const returned = await Promise.race([pending.then(() => true), Bun.sleep(250).then(() => false)]);
    expect(returned).toBe(true);
    expect(performance.now() - started).toBeLessThan(250);
    expect(trader.stopReason).toContain("timeout");
    expect(trader.history.at(-1)!.block).toBe(2);
    expect(trader.history.at(-1)!.resting.bidMon).toBe(0);
    await trader.onBlock(3);
    expect(calls).toBe(2);
    expect(sends).toBe(1);
    expect(trader.history.at(-1)!.decision).toBeNull();
    expect(trader.history.at(-1)!.resting.bidMon).toBe(0);

    release(decision("buy"));
    await Bun.sleep(1);
    await trader.onBlock(4);
    expect(trader.stopReason).toContain("timeout");
    expect(calls).toBe(2);
    expect(sends).toBe(1);
    expect(trader.history.at(-1)!.totals.jevUsd).toBeCloseTo(2 * (1000 / 1e6) * config.jevUsdPerMTok, 8);
    expect(journal.filter(row => row.kind === "cost")).toHaveLength(3);
    expect(journal.filter(row => row.kind === "cost").map(row => row.status)).toEqual(["known", "unknown", "known"]);
  } finally {
    if (release) release(decision("buy"));
    if (pending) await pending;
    Object.assign(config, old);
  }
});

test("a late model rejection is handled without replacing the timeout stop or retrying", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks, maxDecisionMs: config.maxDecisionMs };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1, maxDecisionMs: 30 });
  let reject!: (error: Error) => void;
  let pending: Promise<void> | undefined;
  try {
    let calls = 0, sends = 0;
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async () => { sends++; } };
    const trader = new Trader(market as any, { name: "jev", decide: () => { calls++; return new Promise((_resolve, rejectPromise) => reject = rejectPromise); } } as any, () => {}, undefined, undefined, () => {});
    pending = trader.onBlock(1);
    const returned = await Promise.race([pending.then(() => true), Bun.sleep(250).then(() => false)]);
    expect(returned).toBe(true);
    const reason = trader.stopReason;
    await trader.onBlock(2);
    expect(trader.history.at(-1)!.block).toBe(2);
    expect(calls).toBe(1);
    reject(new Error("late rejection"));
    await Bun.sleep(1);
    await trader.onBlock(3);
    expect(trader.stopReason).toBe(reason);
    expect(calls).toBe(1);
    expect(sends).toBe(0);
  } finally {
    if (reject) reject(new Error("test cleanup"));
    if (pending) await pending;
    Object.assign(config, old);
  }
});

test("unknown paid inference usage is journaled and latches a no-send incomplete-cost hold", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1 });
  try {
    let sends = 0;
    const journal: any[] = [];
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, margin: { mon: 0, usdc: 0 }, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async () => { sends++; } };
    const trader = new Trader(market as any, { name: "jev", decide: async () => ({ ...decision("buy"), inputTokens: null }) } as any, () => {}, undefined, undefined, row => journal.push(row));

    await trader.onBlock(1);

    expect(sends).toBe(0);
    expect(trader.stopReason).toBe("unknown-inference-cost");
    expect(journal).toContainEqual(expect.objectContaining({ kind: "cost", block: 1, status: "unknown", jevUsd: null }));
    expect(trader.history.at(-1)!.totals.jevUsd).toBeNull();
    expect(trader.history.at(-1)!.totals.pnlUsd).toBeNull();
    await trader.onBlock(2);
    expect(sends).toBe(0);
  } finally { Object.assign(config, old); }
});

test("a paid evaluator rejection is retained as unknown possible spend", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1 });
  try {
    let sends = 0;
    const journal: any[] = [];
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, margin: { mon: 0, usdc: 0 }, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async () => { sends++; } };
    const trader = new Trader(market as any, { name: "jev", decide: async () => { throw new Error("synthetic evaluator failure"); } } as any, () => {}, undefined, undefined, row => journal.push(row));

    await trader.onBlock(1);

    expect(sends).toBe(0);
    expect(trader.stopReason).toBe("unknown-inference-cost");
    expect(journal).toContainEqual(expect.objectContaining({ kind: "cost", block: 1, status: "unknown", jevUsd: null }));
    expect(trader.history.at(-1)!.totals.pnlUsd).toBeNull();
  } finally { Object.assign(config, old); }
});

test("an explicit zero-token paid response remains known rather than unknown", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1 });
  try {
    const journal: any[] = [];
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, margin: { mon: 0, usdc: 0 }, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async () => ({ side: "buy", size: 1, price: book.bid, gasMon: 0.1, gasEvidence: "estimate", status: "sim", txHash: null, cancel: [], orderId: null, capped: false }) };
    const trader = new Trader(market as any, { name: "jev", decide: async () => ({ ...decision("buy"), inputTokens: 0 }) } as any, () => {}, undefined, undefined, row => journal.push(row));

    await trader.onBlock(1);

    expect(trader.stopReason).toBeNull();
    expect(journal).toContainEqual(expect.objectContaining({ kind: "cost", block: 1, status: "known", jevUsd: 0 }));
  } finally { Object.assign(config, old); }
});

test("unknown lost receipt cost remains exposed, incomplete, latched, and blocks later sends", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1 });
  try {
    let sends = 0;
    const journal: any[] = [];
    const sentQuote = { side: "buy", price: book.bid, size: 1, txHash: "0xfixture", gasMon: null, gasEstimateMon: 0.1, gasEvidence: "pending", cancel: [], status: "sent", orderId: null, capped: false };
    const market = {
      quotePrice: (side: string) => side === "buy" ? book.bid : book.ask,
      estimatedGasMon: () => 0.1,
      wallet: { address: "fixture" },
      margin: { mon: 0, usdc: 100 },
      readBook: async () => book,
      pollPending: async (block: number) => block === 2 ? [{ block: 1, quote: { ...sentQuote, status: "lost", gasEvidence: "unknown" }, canceled: [] }] : [],
      refresh: async () => {},
      send: async () => { sends++; return sentQuote; },
    };
    const trader = new Trader(market as any, { name: "mock", decide: async () => decision("buy") } as any, () => {}, undefined, undefined, row => journal.push(row));

    await trader.onBlock(1);
    await trader.onBlock(2);
    await trader.settle();

    expect(trader.stopReason).toContain("unknown-transaction");
    expect(trader.history.at(-1)!.resting.bidMon).toBe(1);
    expect(trader.history.at(-1)!.totals.gasMon).toBeNull();
    expect(trader.history.at(-1)!.totals.pnlUsd).toBeNull();
    expect(trader.history.at(-1)!.totals.costsComplete).toBe(false);
    expect(journal).toContainEqual(expect.objectContaining({ kind: "quote", quote: expect.objectContaining({ status: "lost", gasMon: null, gasEvidence: "unknown" }) }));
    await trader.onBlock(3);
    expect(sends).toBe(1);
  } finally { Object.assign(config, old); }
});

test("replacement receipt journal retains the canceled order reconciliation", () => {
  const journal: any[] = [];
  const market = { wallet: null, margin: { mon: 0, usdc: 0 }, estimatedGasMon: () => 0.1 };
  const trader = new Trader(market as any, { name: "mock", decide: async () => decision("hold") } as any, () => {}, undefined, undefined, row => journal.push(row));
  (trader as any).lastBook = book;
  const quote = { side: "sell", size: 1, price: book.ask, txHash: "0xreplace", gasMon: 0.1, gasEvidence: "observed", cancel: [41], status: "placed", orderId: 42, capped: false };

  (trader as any).applyQuoteResult({ block: 1, quote, canceled: [41], kind: "quote" });

  expect(journal).toContainEqual(expect.objectContaining({ kind: "quote", quote, canceled: [41] }));
});

test("net P&L logging labels incomplete cost evidence instead of printing a numeric total", async () => {
  const { formatNetPnl } = await import("./trader.ts") as any;
  expect(formatNetPnl(null)).toBe("unknown (incomplete cost evidence)");
  expect(formatNetPnl(1.25)).toBe("$1.25");
});

test("Trader rejects placed quote results without a safe positive order identity", () => {
  const invalidIds = [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"];

  for (const [index, orderId] of invalidIds.entries()) {
    const journal: any[] = [];
    const txHash = `0x${String(index + 1).padStart(64, "0")}`;
    const market = { wallet: { address: "fixture" }, margin: { mon: 0, usdc: 0 }, estimatedGasMon: () => 0.1 };
    const trader = new Trader(market as any, { name: "mock", decide: async () => decision("hold") } as any, () => {}, undefined, undefined, row => journal.push(row));
    const quote = {
      side: "buy", size: 1, price: book.bid, txHash, gasMon: 0.01, gasEstimateMon: 0.1,
      gasEvidence: "observed", cancel: [], status: "placed", orderId, capped: false,
    };
    (trader as any).lastBook = book;
    (trader as any).inflight.set(txHash, quote);

    (trader as any).applyQuoteResult({ block: 1, quote, canceled: [], kind: "quote" });

    expect(trader.stopReason, `order id ${String(orderId)}`).toContain("unknown-transaction");
    expect((trader as any).inflight.has(txHash), `order id ${String(orderId)}`).toBe(true);
    expect((trader as any).restingMon("buy"), `order id ${String(orderId)}`).toBe(1);
    expect(journal.at(-1).quote.status, `order id ${String(orderId)}`).toBe("lost");
    expect((trader as any).totals.costsComplete, `order id ${String(orderId)}`).toBe(false);
    expect((trader as any).totals.pnlUsd, `order id ${String(orderId)}`).toBeNull();
  }
});

test("ambiguous order broadcast journals unknown costs and retains attempt exposure without retrying", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks };
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 1 });
  try {
    const txHash = `0x${"ab".repeat(32)}`;
    const quote = { side: "buy", size: 1, price: book.bid, txHash, gasMon: null, gasEstimateMon: 0.1, gasEvidence: "unknown", cancel: [], status: "lost", orderId: null, capped: false };
    const ambiguous = new AmbiguousBroadcastError(quote as any, "quote");
    const journal: any[] = [];
    let sends = 0;
    const market = {
      wallet: { address: "fixture" }, margin: { mon: 0, usdc: 100 },
      quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1,
      readBook: async () => book, pollPending: async () => [], refresh: async () => {},
      send: async () => { sends++; throw ambiguous; },
    };
    const trader = new Trader(market as any, { name: "mock", decide: async () => decision("buy") } as any, () => {}, undefined, undefined, row => journal.push(row));

    await trader.onBlock(1);
    await trader.settle();

    expect(sends).toBe(1);
    expect(trader.stopReason).toContain("unknown-transaction");
    expect(trader.history.at(-1)!.quote).toMatchObject({ status: "lost", txHash, gasMon: null, gasEvidence: "unknown" });
    expect(trader.history.at(-1)!.resting.bidMon).toBe(1);
    expect(trader.history.at(-1)!.totals.gasMon).toBeNull();
    expect(trader.history.at(-1)!.totals.gasUsd).toBeNull();
    expect(trader.history.at(-1)!.totals.pnlUsd).toBeNull();
    expect(trader.history.at(-1)!.totals.costsComplete).toBe(false);
    expect(journal).toContainEqual(expect.objectContaining({ kind: "quote", quote: expect.objectContaining({ status: "lost", txHash, gasMon: null }) }));

    await trader.onBlock(2);
    await trader.settle();
    expect(sends).toBe(1);
    expect(trader.history.at(-1)!.resting.bidMon).toBe(1);
  } finally { Object.assign(config, old); }
});

test("only matching final evidence reconciles ambiguous quote costs once and never unlatches the hold", () => {
  const txHash = `0x${"cd".repeat(32)}`;
  const otherHash = `0x${"ef".repeat(32)}`;
  const market = { wallet: { address: "fixture" }, margin: { mon: 0, usdc: 0 }, estimatedGasMon: () => 0.1 };
  const journal: any[] = [];
  const trader = new Trader(market as any, { name: "mock", decide: async () => decision("hold") } as any, () => {}, undefined, undefined, row => journal.push(row));
  (trader as any).lastBook = book;
  const lost = { side: "buy", size: 1, price: book.bid, txHash, gasMon: null, gasEstimateMon: 0.1, gasEvidence: "unknown", cancel: [], status: "lost", orderId: null, capped: false };
  (trader as any).inflight.set(txHash, lost);
  (trader as any).recordUnknownExecution(txHash, "broadcast-acknowledgement-unknown");
  (trader as any).recordUnknownReceiptCost(txHash, "broadcast-gas-unknown");
  const stopReason = trader.stopReason;
  const unrelated = { ...lost, txHash: otherHash, status: "placed", orderId: 88, gasMon: 0.03, gasEvidence: "observed" };

  (trader as any).applyQuoteResult({ block: 1, quote: unrelated, canceled: [], kind: "quote" });

  expect((trader as any).inflight.has(txHash)).toBe(true);
  expect((trader as any).totals.unknownCosts.some((item: string) => item.includes(txHash))).toBe(true);
  expect((trader as any).totals.gasMon).toBeNull();
  expect(trader.stopReason).toBe(stopReason);

  const final = { ...lost, status: "placed", orderId: 77, gasMon: 0.01, gasEvidence: "observed" };
  (trader as any).applyQuoteResult({ block: 1, quote: final, canceled: [], kind: "quote" });
  (trader as any).applyQuoteResult({ block: 1, quote: final, canceled: [], kind: "quote" });

  expect((trader as any).inflight.has(txHash)).toBe(false);
  expect((trader as any).totals.unknownCosts.some((item: string) => item.includes(txHash))).toBe(false);
  expect((trader as any).totals.observedGasMon).toBeCloseTo(0.04);
  expect((trader as any).totals.gasMon).toBeCloseTo(0.04);
  expect(trader.stopReason).toBe(stopReason);
});

test("ambiguous cancellation keeps its hash, null costs, and hold until the matching final receipt", async () => {
  const old = { marginMon: config.marginMon };
  config.marginMon = 0;
  try {
    const txHash = `0x${"12".repeat(32)}`;
    const otherHash = `0x${"34".repeat(32)}`;
    const cancelQuote = { side: "buy", size: 1, price: 1, txHash, gasMon: null, gasEstimateMon: 0.1, gasEvidence: "unknown", cancel: [41], status: "lost", orderId: null, capped: false };
    const ambiguous = new AmbiguousBroadcastError(cancelQuote as any, "cancel");
    const journal: any[] = [];
    const market = {
      wallet: { address: "fixture" }, margin: { mon: 0, usdc: 0 }, estimatedGasMon: () => 0.1,
      cancelOrders: async () => { throw ambiguous; },
    };
    const trader = new Trader(market as any, { name: "mock", decide: async () => decision("hold") } as any, () => {}, undefined, undefined, row => journal.push(row));
    (trader as any).lastBook = book;
    (trader as any).orders.set(41, { side: "sell", price: book.ask, size: 1, block: 1 });

    await (trader as any).clearOrders(2);

    const uncertain = journal.find(row => row.kind === "cancel");
    expect(uncertain).toMatchObject({ txHash, status: "unknown", gasMon: null, gasEvidence: "unknown", canceled: [41] });
    expect((trader as any).pendingCancels.get(txHash)).toEqual([41]);
    expect((trader as any).totals.gasMon).toBeNull();
    expect((trader as any).totals.gasUsd).toBeNull();
    expect((trader as any).totals.observedGasMon).toBeNull();
    expect((trader as any).totals.costsComplete).toBe(false);
    expect(trader.stopReason).toContain("unknown-transaction");
    const stopReason = trader.stopReason;

    const unrelated = { ...cancelQuote, side: "sell", cancel: [], txHash: otherHash, status: "placed", orderId: 88, gasMon: 0.03, gasEvidence: "observed" };
    (trader as any).applyQuoteResult({ block: 2, quote: unrelated, canceled: [], kind: "quote" });
    expect((trader as any).totals.unknownCosts.some((item: string) => item.includes(txHash))).toBe(true);
    expect((trader as any).totals.gasMon).toBeNull();

    const final = { ...cancelQuote, status: "placed", gasMon: 0.01, gasEvidence: "observed" };
    (trader as any).applyQuoteResult({ block: 2, quote: final, canceled: [41], kind: "cancel" });
    (trader as any).applyQuoteResult({ block: 2, quote: final, canceled: [41], kind: "cancel" });

    expect((trader as any).pendingCancels.has(txHash)).toBe(false);
    expect((trader as any).orders.has(41)).toBe(false);
    expect((trader as any).totals.unknownCosts.some((item: string) => item.includes(txHash))).toBe(false);
    expect((trader as any).totals.observedGasMon).toBeCloseTo(0.04);
    expect((trader as any).totals.gasMon).toBeCloseTo(0.04);
    expect(trader.stopReason).toBe(stopReason);
  } finally { config.marginMon = old.marginMon; }
});

test("mutating callback events cannot alter history or the trader accounting accumulator", async () => {
  const old = config.marginMon;
  config.marginMon = 0;
  try {
    const market = {
      wallet: null, margin: { mon: 0, usdc: 0 },
      quotePrice: (side: string) => side === "buy" ? book.bid : book.ask,
      estimatedGasMon: () => 0.1, readBook: async () => book,
      pollPending: async () => [], refresh: async () => {},
    };
    let callbackEvent: any;
    const trader = new Trader(
      market as any,
      { name: "mock", decide: async () => decision("hold") } as any,
      event => {
        callbackEvent = event;
        event.totals.unknownCosts.push("callback mutation");
        event.totals.estimatedGasMon = 99;
        event.totals.gasMon = 99;
        event.decision!.probabilities.hold = 0;
        event.position.side = "short";
        event.resting.bidMon = 99;
      },
      undefined,
      undefined,
      () => {},
    );

    await trader.onBlock(1);

    const stored = trader.history[0]!;
    expect(stored).not.toBe(callbackEvent);
    expect(stored.totals.unknownCosts).toEqual([]);
    expect(stored.totals.estimatedGasMon).toBe(0);
    expect(stored.totals.gasMon).toBe(0);
    expect(stored.decision!.probabilities.hold).toBe(1);
    expect(stored.position.side).toBe("flat");
    expect(stored.resting.bidMon).toBe(0);
    expect((trader as any).totals.unknownCosts).toEqual([]);
    expect((trader as any).totals.estimatedGasMon).toBe(0);
    expect((trader as any).totals.gasMon).toBe(0);
  } finally { config.marginMon = old; }
});

test("a mismatched Market quote receipt reaches Trader as unresolved without releasing exposure", async () => {
  const market = marketWithReceiptAttempt("quote");
  const quote = market.pending.get(RECEIPT_ATTEMPT_HASH).quote;
  const trader = new Trader(
    market,
    { name: "mock", decide: async () => decision("hold") } as any,
    () => {}, undefined, undefined, () => {},
  ) as any;
  trader.lastBook = book;
  trader.inflight.set(RECEIPT_ATTEMPT_HASH, quote);
  trader.recordPendingReceiptCost(RECEIPT_ATTEMPT_HASH, "receipt-pending");
  receiptFixture = {
    transactionHash: RECEIPT_OTHER_HASH,
    status: "0x1",
    effectiveGasPrice: "0x3b9aca00",
    logs: [encodedMarketLog(market, "OrderCreated", [7, "0x0000000000000000000000000000000000000001", 1, 2, true])],
  };

  trader.confirmPending(2);
  await trader.settle();

  expect(market.pending.has(RECEIPT_ATTEMPT_HASH)).toBe(true);
  expect(market.pending.get(RECEIPT_ATTEMPT_HASH).quote.txHash).toBe(RECEIPT_ATTEMPT_HASH);
  expect(trader.inflight.has(RECEIPT_ATTEMPT_HASH)).toBe(true);
  expect(trader.restingMon("buy")).toBe(1);
  expect(trader.stopReason).toContain("unknown-transaction");
  expect(trader.totals.gasMon).toBeNull();
  expect(trader.totals.gasUsd).toBeNull();
  expect(trader.totals.costsComplete).toBe(false);
  expect(trader.totals.unknownCosts.some((entry: string) => entry.includes(RECEIPT_ATTEMPT_HASH))).toBe(true);
  expect(receiptRpcCalls).toEqual(["eth_getTransactionReceipt"]);
});

test("a mismatched Market cancellation receipt cannot clear Trader order exposure or uncertainty", async () => {
  const market = marketWithReceiptAttempt("cancel", [41]);
  const quote = market.pending.get(RECEIPT_ATTEMPT_HASH).quote;
  const trader = new Trader(
    market,
    { name: "mock", decide: async () => decision("hold") } as any,
    () => {}, undefined, undefined, () => {},
  ) as any;
  trader.lastBook = book;
  trader.orders.set(41, { side: "sell", price: book.ask, size: 1, block: 1 });
  trader.pendingCancels.set(RECEIPT_ATTEMPT_HASH, [41]);
  trader.recordUnknownExecution(RECEIPT_ATTEMPT_HASH, "cancellation-broadcast-acknowledgement-unknown");
  trader.recordUnknownReceiptCost(RECEIPT_ATTEMPT_HASH, "cancellation-gas-unknown");
  receiptFixture = {
    transactionHash: RECEIPT_OTHER_HASH,
    status: "0x1",
    effectiveGasPrice: "0x3b9aca00",
    logs: [encodedMarketLog(market, "OrdersCanceled", [[41], "0x0000000000000000000000000000000000000001"])],
  };

  trader.confirmPending(2);
  await trader.settle();

  expect(quote.txHash).toBe(RECEIPT_ATTEMPT_HASH);
  expect(market.pending.has(RECEIPT_ATTEMPT_HASH)).toBe(true);
  expect(trader.pendingCancels.get(RECEIPT_ATTEMPT_HASH)).toEqual([41]);
  expect(trader.orders.has(41)).toBe(true);
  expect(trader.totals.unknownCosts.some((entry: string) => entry.includes(RECEIPT_ATTEMPT_HASH))).toBe(true);
  expect(trader.totals.gasMon).toBeNull();
  expect(trader.totals.gasUsd).toBeNull();
  expect(trader.totals.costsComplete).toBe(false);
  expect(trader.stopReason).toContain("unknown-transaction");
  expect(receiptRpcCalls).toEqual(["eth_getTransactionReceipt"]);
});
