import { expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Book, Market, Quote, Side } from "./market";
import type { Action, Decision, Model, TradeState } from "./model";
import type { BlockEvent } from "./trader";

mock.module("./config", () => ({
  config: {
    tradeSizeMon: 200,
    maxPositionMon: 200,
    refreshBlocks: 1000,
    jevUsdPerMTok: 0.042,
    bankrollUsd: 100,
    historySize: 20,
    horizonBlocks: 100,
  },
}));
mock.module("./market", () => ({}));
mock.module("./trades", () => ({
  TradeFeed: class {
    poll() { return Promise.resolve(); }
    drainPrints() { return []; }
    drainFills() { return []; }
    summary() { return { count: 0, buyMon: 0, sellMon: 0, cvdMon: 0, vwap: null, lastPrice: null, lastSide: null }; }
    recent() { return []; }
  },
}));
const { Trader } = await import("./trader");

const book: Book = {
  block: 1,
  bid: 1,
  ask: 1.01,
  mid: 1.005,
  spreadBps: 99.5,
  imbalance: 0,
  levels: { bids: [[1, 1000]], asks: [[1.01, 1000]] },
  depthBps: { "10": { bid: 1000, ask: 1000 } },
};

const decision = (action: Action): Decision => ({
  action,
  probabilities: { buy: action === "buy" ? 0.9 : 0.1, sell: action === "sell" ? 0.9 : 0.1, hold: action === "hold" ? 1 : 0 },
  upIn10: action === "buy" ? 0.9 : 0.1,
  latencyMs: 1,
  inputTokens: 7,
});

async function run(actions: readonly unknown[]) {
  const scratchRoot = process.env.TMPDIR || tmpdir();
  const journalCwd = mkdtempSync(join(scratchRoot, "jev-trader-direction-"));
  const originalCwd = process.cwd();
  const sent: { block: number; side: Side; capped: boolean }[] = [];
  const events: BlockEvent[] = [];
  const market = {
    address: null,
    wallet: null,
    margin: { mon: 0, usdc: 0 },
    readBook: async () => book,
    pollPending: async () => [],
    refresh: async () => {},
    send: async (blockNumber: number, side: Side, size: number, _book: Book, cancel: number[], capped: boolean): Promise<Quote> => {
      sent.push({ block: blockNumber, side, capped });
      return { side, price: side === "buy" ? book.bid : book.ask, size, txHash: null, gasMon: 0, cancel, status: "sim", orderId: null, capped };
    },
  } as unknown as Market;
  let index = 0;
  const model: Model = {
    name: "public-seam-fake",
    decide: async (_state: TradeState) => decision(actions[index++] as Action),
  };

  process.chdir(journalCwd);
  try {
    const trader = new Trader(market, model, (event) => events.push(event));
    for (let i = 0; i < actions.length; i++) await trader.onBlock(i + 1);
  } finally {
    process.chdir(originalCwd);
    rmSync(journalCwd, { recursive: true, force: true });
  }
  return { sent, events };
}

test("a buy blocked by the existing cap is rejected without substituting a sell", async () => {
  const { sent, events } = await run(["buy", "buy"]);

  expect(sent.map(({ side }) => side)).toEqual(["buy"]);
  expect(events[1]?.decision?.action).toBe("buy");
  expect(events[1]?.quote).toBeNull();
});

test("a sell blocked by the existing cap is rejected without substituting a buy", async () => {
  const { sent, events } = await run(["sell", "sell"]);

  expect(sent.map(({ side }) => side)).toEqual(["sell"]);
  expect(events[1]?.decision?.action).toBe("sell");
  expect(events[1]?.quote).toBeNull();
});

test("eligible model directions are submitted unchanged", async () => {
  const { sent, events } = await run(["buy", "sell"]);

  expect(sent).toEqual([
    { block: 1, side: "buy", capped: false },
    { block: 2, side: "sell", capped: false },
  ]);
  expect(events.map((event) => event.decision?.action)).toEqual(["buy", "sell"]);
  expect(events.map((event) => event.quote?.side)).toEqual(["buy", "sell"]);
});

test("hold and malformed directions produce no quote or fill", async () => {
  const { sent, events } = await run(["hold", "sideways"]);

  expect(sent).toEqual([]);
  expect(events[0]?.decision?.action).toBe("hold");
  expect(events[1]?.decision?.action as string | undefined).toBe("sideways");
  expect(events.map((event) => event.quote)).toEqual([null, null]);
  expect(events.map((event) => event.fill)).toEqual([null, null]);
});
