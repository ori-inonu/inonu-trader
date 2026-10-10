import { expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Book, Market, Quote, QuoteResult, Side } from "./market";
import type { Action, Decision, Model, TradeState } from "./model";
import type { BlockEvent } from "./trader";

const repoRoot = "C:/Users/gabri/jev-trader-release-v0.0.2-receipt-safety";
mock.module(`${repoRoot}/src/config.ts`, () => ({
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
mock.module(`${repoRoot}/src/market.ts`, () => ({}));
mock.module(`${repoRoot}/src/trades.ts`, () => ({
  TradeFeed: class {
    poll() { return Promise.resolve(); }
    drainPrints() { return []; }
    drainFills() { return []; }
    summary() { return { count: 0, buyMon: 0, sellMon: 0, cvdMon: 0, vwap: null, lastPrice: null, lastSide: null }; }
    recent() { return []; }
  },
}));
const { Trader } = await import(`${repoRoot}/src/trader.ts`);

const book: Book = {
  block: 101,
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
  upIn10: action === "buy" ? 0.9 : action === "sell" ? 0.1 : 0.5,
  latencyMs: 1,
  inputTokens: 7,
});

async function runUncertainThen(priorAction: Action, nextAction: Action, outcomeStatus: "unverified" | "lost" = "unverified") {
  const scratchRoot = process.env.TMPDIR || tmpdir();
  const journalCwd = mkdtempSync(join(scratchRoot, "jev-trader-receipt-"));
  const originalCwd = process.cwd();
  const sent: { block: number; side: Side }[] = [];
  const events: BlockEvent[] = [];
  const quoteCallbacks: { block: number; quote: Quote }[] = [];
  let priorQuote: Quote | null = null;
  let polls = 0;
  const market = {
    address: null,
    wallet: null,
    margin: { mon: 0, usdc: 0 },
    readBook: async () => book,
    pollPending: async (): Promise<QuoteResult[]> => {
      polls++;
      if (polls === 1 || !priorQuote) return [];
      return [{
        block: 1,
        // Fixture-only: `provenance` is not part of the production Quote type; this checks passthrough in history and callbacks.
        quote: { ...priorQuote, status: outcomeStatus as any, orderId: null, gasMon: 0,
          provenance: { originBlock: 1, snapshotBlock: 101, target: null, inclusion: null, finality: "unobserved" } } as unknown as Quote,
        canceled: [9001],
      }];
    },
    refresh: async () => {},
    send: async (blockNumber: number, side: Side, size: number, _book: Book, cancel: number[], capped: boolean): Promise<Quote> => {
      sent.push({ block: blockNumber, side });
      // Receipt-safety fixture shape: gasEstimateMon and gasEvidence are not set here.
      priorQuote = { side, price: side === "buy" ? book.bid : book.ask, size, txHash: `0x${"1".repeat(64)}`,
        gasMon: 0.02, cancel, status: "sent", orderId: null, capped } as unknown as Quote;
      return priorQuote as Quote;
    },
  } as unknown as Market;
  let index = 0;
  const actions: Action[] = [priorAction, nextAction];
  const model: Model = {
    name: "public-seam-fake",
    decide: async (_state: TradeState) => decision(actions[index++]!),
  };

  process.chdir(journalCwd);
  try {
    const trader = new Trader(market, model, (event: BlockEvent) => events.push(event), undefined,
      (block: number, quote: Quote) => quoteCallbacks.push({ block, quote }));
    await trader.onBlock(1);
    await trader.onBlock(2);
    return { trader, sent, events, quoteCallbacks };
  } finally {
    process.chdir(originalCwd);
    rmSync(journalCwd, { recursive: true, force: true });
  }
}

test("unverified buy exposure quarantines a sell without rewriting the decision", async () => {
  const { trader, sent, events, quoteCallbacks } = await runUncertainThen("buy", "sell");

  expect(sent).toEqual([{ block: 1, side: "buy" }]);
  expect(events[1]?.decision?.action).toBe("sell");
  expect(events[1]?.decision?.probabilities).toEqual({ buy: 0.1, sell: 0.9, hold: 0 });
  expect(events[1]?.quote).toBeNull();
  expect(events[1]?.resting.bidMon).toBe(200);
  expect(events[1]?.totals.gasMon).toBe(0);
  expect(trader.history[0]?.quote?.status as string).toBe("unverified");
  expect(quoteCallbacks).toHaveLength(1);
  expect(quoteCallbacks[0]?.quote.status as string).toBe("unverified");
  const serialized = JSON.parse(JSON.stringify(trader.history)) as BlockEvent[];
  const provenanceOf = (quote: Quote | null | undefined) => (quote as unknown as { provenance?: { originBlock?: number; finality?: string; inclusion?: unknown } } | null | undefined)?.provenance;
  expect(provenanceOf(serialized[0]?.quote)?.originBlock).toBe(1);
  expect(provenanceOf(serialized[0]?.quote)?.finality).toBe("unobserved");
  const serializedCallback = JSON.parse(JSON.stringify(quoteCallbacks)) as typeof quoteCallbacks;
  expect(provenanceOf(serializedCallback[0]?.quote)?.inclusion).toBeNull();
});

test("unverified sell exposure quarantines a buy without rewriting the decision", async () => {
  const { trader, sent, events } = await runUncertainThen("sell", "buy");

  expect(sent).toEqual([{ block: 1, side: "sell" }]);
  expect(events[1]?.decision?.action).toBe("buy");
  expect(events[1]?.decision?.probabilities).toEqual({ buy: 0.9, sell: 0.1, hold: 0 });
  expect(events[1]?.quote).toBeNull();
  expect(events[1]?.resting.askMon).toBe(200);
  expect(trader.history[0]?.quote?.status as string).toBe("unverified");
});

test("lost receipt outcomes retain risk and quarantine the next eligible direction", async () => {
  const { trader, sent, events } = await runUncertainThen("buy", "sell", "lost");

  expect(sent).toEqual([{ block: 1, side: "buy" }]);
  expect(events[1]?.decision?.action).toBe("sell");
  expect(events[1]?.quote).toBeNull();
  expect(events[1]?.resting.bidMon).toBe(200);
  expect(events[1]?.totals.gasMon).toBe(0);
  expect(trader.history[0]?.quote?.status).toBe("lost");
});
