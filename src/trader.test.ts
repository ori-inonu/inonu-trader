import { test, expect } from "bun:test";
import { Trader } from "./trader";
import { config } from "./config";
import { replayJournal } from "./backtest";
const book = { block: 1, bid: 1.5, ask: 2.5, mid: 2, spreadBps: 100, imbalance: 0, levels: { bids: [], asks: [] }, depthBps: {} };
const decision = (action: string) => ({ action, probabilities: { buy: action === "buy" ? 1 : 0, sell: 0, hold: action === "hold" ? 1 : 0 }, upIn10: 0.5, latencyMs: 0, inputTokens: 1000 });
function fixture(action: string, journal: (row: unknown) => void = () => {}) {
  let sends = 0;
  const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, margin: { mon: 0, usdc: 0 }, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async (_: number, side: string, size: number) => { sends++; return { side, size, price: 2, gasMon: 0.1, status: "sim", txHash: null, cancel: [], orderId: null, capped: false }; } };
  const trader = new Trader(market as any, { name: "mock", decide: async () => decision(action) } as any, () => {}, undefined, undefined, journal);
  return { trader, sends: () => sends };
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
    const market = { quotePrice: (side: string) => side === "buy" ? book.bid : book.ask, estimatedGasMon: () => 0.1, wallet: null, readBook: async () => book, pollPending: async () => [], refresh: async () => {}, send: async (_: number, side: string, size: number) => ({ side, size, price: 2, gasMon: 0.1, status: "sim", txHash: null, cancel: [], orderId: null, capped: false }) };
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

test("a paper producer journal replays its quote and partial fill with the same identity", async () => {
  const old = { marginMon: config.marginMon, tradeSizeMon: config.tradeSizeMon, maxCapitalFraction: config.maxCapitalFraction, quoteIntervalBlocks: config.quoteIntervalBlocks };
  const oldFetch = globalThis.fetch;
  Object.assign(config, { marginMon: 0, tradeSizeMon: 1, maxCapitalFraction: 1, quoteIntervalBlocks: 100 });
  try {
    let polls = 0;
    // Synthetic RPC fixture: a taker sell of 0.25 MON at USD 2, after placement.
    const data = "0x" + [0n, 0n, 0n, 2_000_000_000_000_000_000n, 0n, 0n, 0n, 25n]
      .map(word => word.toString(16).padStart(64, "0")).join("");
    globalThis.fetch = (async (_input, init) => {
      expect(JSON.parse(init!.body as string).method).toBe("eth_getLogs");
      return Response.json({ result: polls++ === 0 ? [] : [{ blockNumber: "0x2", logIndex: "0x0", transactionHash: "fixture-only", data }] });
    }) as typeof fetch;
    const rows: unknown[] = [];
    const f = fixture("buy", row => rows.push(row));
    f.trader.attachTradeFeed(2);
    await f.trader.onBlock(1);
    await f.trader.onBlock(2);
    await f.trader.settle();
    expect(polls).toBe(2);
    const result = replayJournal(rows.map(row => JSON.stringify(row)).join("\n"));
    expect(result.quoteCount).toBe(1);
    expect(result.fillCount).toBe(1);
    expect(result.endingMon).toBe(0.25);
    expect(result.turnoverUsd).toBe(0.5);
    expect(result.costs.gasUsd).toBeCloseTo(0.2);
    expect(result.netPnlUsd).toBeCloseTo(-0.2);
  } finally { globalThis.fetch = oldFetch; Object.assign(config, old); }
});
