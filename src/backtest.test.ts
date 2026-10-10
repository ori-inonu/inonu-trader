import { describe, expect, test } from "bun:test";
import { replayJournal } from "./backtest.ts";

const session = {
  kind: "session",
  ts: 1_000,
  sessionId: "hand-worked-paper",
  dataSource: "real-market-paper",
  model: "mock",
  bankrollUsd: 100,
  initialMon: 2,
  initialMid: 10,
  makerFeeBps: 100,
} as const;

describe("replayJournal", () => {
  test("replays funded spot fills and charges each recorded cost once", () => {
    const result = replayJournal([
      session,
      { kind: "block", block: 1, ts: 1_000, mid: 10, decision: { action: "hold" }, totals: { jevUsd: 99 } },
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "q-1", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "buy-1",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 1, price: 9, simulated: true, orderId: "q-1" },
      },
      {
        kind: "block",
        block: 3,
        ts: 1_015,
        mid: 11,
        quote: { side: "buy", size: 1, price: 10, status: "sim", orderId: "q-2", gasMon: 0.01 },
      },
      {
        kind: "quote",
        block: 3,
        ts: 1_016,
        mid: 11,
        quote: { side: "sell", size: 1, price: 10, status: "sim", orderId: "q-3", gasMon: 0.02 },
      },
      {
        kind: "quote",
        block: 3,
        ts: 1_017,
        mid: 11,
        quote: { side: "sell", size: 1, price: 10, status: "sim", orderId: "q-4", gasMon: 0 },
      },
      { kind: "cost", block: 3, ts: 1_018, mid: 11, jevUsd: 0.5 },
      {
        kind: "quote",
        block: 3,
        ts: 1_019,
        mid: 11,
        quote: { side: "sell", size: 1, price: 12, status: "sim", orderId: "q-5", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "sell-1",
        block: 4,
        ts: 1_025,
        mid: 11,
        fill: { side: "sell", size: 0.5, price: 12, simulated: true, orderId: "q-5" },
      },
    ]);

    expect(result.dataSource).toBe("real-market-paper");
    expect(result.durationMs).toBe(25);
    expect(result.decisionCount).toBe(1);
    expect(result.quoteCount).toBe(5);
    expect(result.fillCount).toBe(2);
    expect(result.turnoverUsd).toBe(15);
    expect(result.costs).toEqual({ gasUsd: 0.33, jevUsd: 0.5, makerFeeUsd: 0.15, totalUsd: 0.98 });
    expect(result.endingCashUsd).toBe(76.02);
    expect(result.endingMon).toBe(2.5);
    expect(result.finalEquityUsd).toBe(103.52);
    expect(result.netPnlUsd).toBe(3.52);
  });

  test("tracks peak-to-trough drawdown from each recorded mark", () => {
    const result = replayJournal([
      session,
      { kind: "block", block: 1, ts: 1_010, mid: 8, decision: "hold" },
      { kind: "block", block: 2, ts: 1_020, mid: 12, decision: "hold" },
      { kind: "block", block: 3, ts: 1_030, mid: 9, decision: "hold" },
    ]);

    expect(result.initialEquityUsd).toBe(100);
    expect(result.finalEquityUsd).toBe(98);
    expect(result.netPnlUsd).toBe(-2);
    expect(result.maxDrawdownUsd).toBe(6);
    expect(result.maxDrawdownPct).toBe(5.76923077);
  });

  test("rejects empty, malformed, and unfunded journals", () => {
    expect(() => replayJournal([])).toThrow("journal is empty");
    expect(() => replayJournal(`${JSON.stringify(session)}\n{`)).toThrow("line 2 is malformed JSON");
    expect(() => replayJournal([
      session,
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "sell", size: 2.1, price: 10, status: "sim", orderId: "oversell-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "oversell",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "sell", size: 2.1, price: 10, simulated: true, orderId: "oversell-order" },
      },
    ])).toThrow("sells more MON than the funded inventory");
  });

  test("does not charge unconfirmed sent gas and labels linked synthetic fills", () => {
    const sentResult = replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "buy", size: 0.1, price: 9, status: "sent", orderId: "pending", txHash: "0xsent", gasMon: 0.1 },
      },
    ]);
    const syntheticResult = replayJournal([
      { ...session, dataSource: "synthetic" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "buy", size: 0.1, price: 9, status: "sim", orderId: "synthetic-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "synthetic-buy",
        block: 2,
        ts: 1_020,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 9, simulated: true, orderId: "synthetic-order" },
      },
    ]);

    expect(sentResult.costs.gasUsd).toBe(0);
    expect(sentResult.receiptCount).toBe(0);
    expect(syntheticResult.costs.gasUsd).toBe(0);
    expect(syntheticResult.quoteCount).toBe(1);
    expect(syntheticResult.fillCountsByProvenance).toEqual({ paper: 0, synthetic: 1, live: 0 });
    expect(syntheticResult.caveats.some((line) => line.includes("does not forecast future returns"))).toBe(true);
  });

  test("links live partial fills to a confirmed order and counts sent and placed stages once", () => {
    const result = replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "block",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sent", orderId: null, txHash: "0xlive-order", gasMon: 0.01 },
      },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "placed", orderId: 42, txHash: "0xlive-order", gasMon: 0.01 },
      },
      {
        kind: "fill",
        id: "live-partial-1",
        block: 2,
        ts: 1_020,
        mid: 10,
        fill: { side: "buy", size: 0.4, price: 9, simulated: false, orderId: 42 },
      },
      {
        kind: "fill",
        id: "live-partial-2",
        block: 3,
        ts: 1_030,
        mid: 10,
        fill: { side: "buy", size: 0.6, price: 9, simulated: false, orderId: 42 },
      },
    ]);

    expect(result.quoteCount).toBe(1);
    expect(result.receiptCount).toBe(1);
    expect(result.fillCount).toBe(2);
    expect(result.fillCountsByProvenance).toEqual({ paper: 0, synthetic: 0, live: 2 });
    expect(result.costs.gasUsd).toBe(0.1);
  });

  test("rejects header-only or malformed quote journals", () => {
    expect(() => replayJournal([session])).toThrow("no market or accounting events");
    expect(() => replayJournal([
      session,
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { status: "sim", gasMon: 0.1 },
      },
    ])).toThrow("quote.side is required");
    expect(() => replayJournal([
      session,
      {
        kind: "block",
        block: 1,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 1, price: 9, simulated: true },
      },
    ])).toThrow("aggregated block.fill");
  });

  test("keeps delayed fills in journal arrival order even when their block is older", () => {
    const result = replayJournal([
      session,
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "delayed-order", gasMon: 0 },
      },
      { kind: "block", block: 3, ts: 1_010, mid: 10, decision: "hold" },
      {
        kind: "fill",
        id: "delayed-1",
        block: 2,
        ts: 1_020,
        mid: 10,
        fill: { side: "buy", size: 1, price: 9, simulated: true, orderId: "delayed-order" },
      },
    ]);

    expect(result.fillCount).toBe(1);
    expect(result.endingMon).toBe(3);
    expect(result.finalEquityUsd).toBe(100.91);
  });

  test("rejects duplicate fill identities and fills that contradict session provenance", () => {
    const fill = {
      kind: "fill",
      id: "same-fill",
      block: 1,
      ts: 1_010,
      mid: 10,
      fill: { side: "buy", size: 0.1, price: 9, simulated: true, orderId: "duplicate-order" },
    } as const;
    const quote = {
      kind: "quote",
      block: 1,
      ts: 1_005,
      mid: 10,
      quote: { side: "buy", size: 0.1, price: 9, status: "sim", orderId: "duplicate-order", gasMon: 0 },
    } as const;
    expect(() => replayJournal([session, quote, fill, { ...fill, ts: 1_020 }])).toThrow("duplicate fill id same-fill");
    expect(() => replayJournal([session, quote, {
      ...fill,
      id: "wrong-provenance",
      fill: { ...fill.fill, simulated: false },
    }])).toThrow("conflicts with session.dataSource");
  });

  test("rejects a fill without a prior matching eligible quote", () => {
    expect(() => replayJournal([
      session,
      {
        kind: "fill",
        id: "unlinked-fill",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 9, simulated: true, orderId: "sim-order-1" },
      },
    ])).toThrow("has no prior eligible quote/order");
  });

  test("does not infer an order identity missing from a produced simulated quote", () => {
    expect(() => replayJournal([
      session,
      {
        kind: "block",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "buy", size: 0.1, price: 9, status: "sim", orderId: null, txHash: null, gasMon: 0.01 },
      },
      {
        kind: "fill",
        id: "producer-sim-fill",
        block: 2,
        ts: 1_020,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 9, simulated: true, orderId: -1, txHash: null },
      },
    ])).toThrow("has no prior eligible quote/order");
  });

  test("rejects a lost live quote instead of treating its missing receipt as zero-cost", () => {
    expect(() => replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "buy", size: 0.1, price: 9, status: "lost", orderId: null, txHash: "0xlost", gasMon: 0 },
      },
    ])).toThrow("lost quote has an unknown receipt");
  });

  test("rejects a fill on the wrong side of its matching quote", () => {
    expect(() => replayJournal([
      session,
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "side-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "wrong-side",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "sell", size: 0.1, price: 9, simulated: true, orderId: "side-order" },
      },
    ])).toThrow("fill side does not match quote/order");
  });

  test("rejects a fill at a different price than its matching quote", () => {
    expect(() => replayJournal([
      session,
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "price-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "wrong-price",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 8.99, simulated: true, orderId: "price-order" },
      },
    ])).toThrow("fill price does not match quote/order");
  });

  test("rejects cumulative partial fills above the quoted order size", () => {
    expect(() => replayJournal([
      session,
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "overfill-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "partial-1",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 0.6, price: 9, simulated: true, orderId: "overfill-order" },
      },
      {
        kind: "fill",
        id: "partial-2",
        block: 2,
        ts: 1_011,
        mid: 10,
        fill: { side: "buy", size: 0.6, price: 9, simulated: true, orderId: "overfill-order" },
      },
    ])).toThrow("fill size exceeds remaining quote/order size");
  });

  test("rejects a repeated eligible order identity that could reset filled capacity", () => {
    expect(() => replayJournal([
      session,
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "reused-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "reused-partial-1",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 0.6, price: 9, simulated: true, orderId: "reused-order" },
      },
      {
        kind: "quote",
        block: 3,
        ts: 1_020,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "reused-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "reused-partial-2",
        block: 4,
        ts: 1_030,
        mid: 10,
        fill: { side: "buy", size: 0.6, price: 9, simulated: true, orderId: "reused-order" },
      },
    ])).toThrow("duplicate eligible quote/order id");
  });

  test("rejects a fill whose market block predates quote placement", () => {
    expect(() => replayJournal([
      session,
      {
        kind: "quote",
        block: 2,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "future-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "before-placement",
        block: 1,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 9, simulated: true, orderId: "future-order" },
      },
    ])).toThrow("fill block precedes its quote/order placement");
  });

  test("rejects a simulated quote inside a live session", () => {
    expect(() => replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: { side: "buy", size: 1, price: 9, status: "sim", orderId: "paper-order", gasMon: 0 },
      },
      {
        kind: "fill",
        id: "misattributed-live-fill",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 9, simulated: false, orderId: "paper-order" },
      },
    ])).toThrow("quote.status sim conflicts with session.dataSource");
  });

  test("rejects fills linked only to sent or reverted live quotes", () => {
    for (const status of ["sent", "reverted"] as const) {
      const quote = {
        kind: "quote",
        block: 1,
        ts: 1_005,
        mid: 10,
        quote: {
          side: "buy",
          size: 1,
          price: 9,
          status,
          orderId: "unconfirmed-order",
          txHash: "0xunconfirmed",
          gasMon: 0.01,
        },
      };
      expect(() => replayJournal([
        { ...session, dataSource: "live" },
        quote,
        {
          kind: "fill",
          id: `unconfirmed-${status}`,
          block: 2,
          ts: 1_010,
          mid: 10,
          fill: { side: "buy", size: 0.1, price: 9, simulated: false, orderId: "unconfirmed-order" },
        },
      ])).toThrow("has no prior eligible quote/order");
    }
  });

  test("charges a confirmed cancellation once when its transaction hash is shared with a receipt", () => {
    const result = replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "sell", size: 1, price: 10, status: "placed", orderId: "live-1", txHash: "0xCancelTx", gasMon: 0.02 },
      },
      { kind: "cancel", block: 1, ts: 1_020, mid: 10, txHash: "0xcanceltx", gasMon: 0.02 },
    ]);

    expect(result.receiptCount).toBe(1);
    expect(result.costs.gasUsd).toBe(0.2);
    expect(result.assumptions.some((line) => line.includes("cancellation receipt gas"))).toBe(true);
  });

  test("requires a transaction hash and finite nonnegative cancellation gas", () => {
    const cancel = { kind: "cancel", block: 1, ts: 1_010, mid: 10, txHash: "0xcancel", gasMon: 0.01 } as const;

    expect(() => replayJournal([session, { ...cancel, txHash: undefined }])).toThrow("cancel).txHash must be a non-empty string");
    expect(() => replayJournal([session, { ...cancel, gasMon: -0.01 }])).toThrow("cancel).gasMon must be a finite number >= 0");
    expect(() => replayJournal([session, { ...cancel, gasMon: Number.POSITIVE_INFINITY }])).toThrow("cancel).gasMon must be a finite number >= 0");
  });

  test("rejects conflicting gas values when a cancellation repeats a receipt transaction", () => {
    expect(() => replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "sell", size: 1, price: 10, status: "placed", txHash: "0xCancelTx", gasMon: 0.02 },
      },
      { kind: "cancel", block: 1, ts: 1_020, mid: 10, txHash: "0xcanceltx", gasMon: 0.03 },
    ])).toThrow("repeats transaction 0xcanceltx with conflicting gas amounts");
  });
});
