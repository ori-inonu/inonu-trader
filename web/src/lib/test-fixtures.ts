import type { BlockEvent, Fill, Quote, Totals } from "./types";

export function totalsFixture(overrides: Partial<Totals> = {}): Totals {
  return {
    blocks: 0,
    decisions: 0,
    quotes: 0,
    fills: 0,
    reverted: 0,
    lateBlocks: 0,
    jevUsd: null,
    jevCostBasis: "unknown",
    gasMon: null,
    gasUsd: null,
    estimatedGasMon: 0,
    estimatedGasUsd: 0,
    observedGasMon: null,
    observedGasUsd: null,
    costsComplete: false,
    unknownCosts: [],
    realizedUsd: 0,
    pnlUsd: null,
    pnlMon: null,
    pnlPct: null,
    ...overrides,
  };
}

export function quoteFixture(overrides: Partial<Quote> = {}): Quote {
  return {
    side: "buy",
    price: 1,
    size: 1,
    txHash: null,
    gasMon: null,
    gasEstimateMon: null,
    gasEvidence: "unknown",
    cancel: [],
    status: "sent",
    orderId: null,
    capped: false,
    ...overrides,
  };
}

export function fillFixture(overrides: Partial<Fill> = {}): Fill {
  return {
    side: "buy",
    size: 1,
    price: 1,
    txHash: null,
    orderId: 1,
    simulated: false,
    ...overrides,
  };
}

export function eventFixture(overrides: Partial<BlockEvent> = {}): BlockEvent {
  return {
    block: 1,
    ts: 1,
    mid: 1.234567,
    bestBid: 1.2345,
    bestAsk: 1.2346,
    spreadBps: 0.8,
    decision: null,
    quote: null,
    fill: null,
    resting: { bidMon: 0, askMon: 0 },
    position: { side: "flat", size: 0, entryPrice: null, unrealizedUsd: 0, unrealizedMon: 0 },
    totals: totalsFixture(),
    ...overrides,
  };
}