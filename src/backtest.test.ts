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
        quote: { side: "buy", size: 1, price: 10, status: "sim", orderId: "q-2", gasMon: 0.01, gasEstimateMon: 0.01, gasEvidence: "estimate" },
      },
      {
        kind: "quote",
        block: 3,
        ts: 1_016,
        mid: 11,
        quote: { side: "sell", size: 1, price: 10, status: "reverted", orderId: "q-3", txHash: "0xreceipt", gasMon: 0.02, gasEvidence: "observed" },
      },
      {
        kind: "quote",
        block: 3,
        ts: 1_017,
        mid: 11,
        quote: { side: "sell", size: 1, price: 10, status: "reverted", orderId: "q-4", txHash: "0xreceipt", gasMon: 0.02, gasEvidence: "observed" },
      },
      { kind: "cost", block: 3, ts: 1_018, mid: 11, jevUsd: 0.5 },
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
    expect(result.quoteCount).toBe(3);
    expect(result.fillCount).toBe(2);
    expect(result.turnoverUsd).toBe(15);
    expect(result.costs).toEqual({ gasUsd: 0.33, estimatedGasUsd: 0.11, observedGasUsd: 0.22, jevUsd: 0.5, makerFeeUsd: 0.15, totalUsd: 0.98 });
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
        kind: "fill",
        id: "oversell",
        block: 2,
        ts: 1_010,
        mid: 10,
        fill: { side: "sell", size: 2.1, price: 10, simulated: true },
      },
    ])).toThrow("sells more MON than the funded inventory");
  });

  test("does not charge unconfirmed sent gas and withholds incomplete replay output", () => {
    expect(() => replayJournal([
      { ...session, dataSource: "synthetic" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "buy", size: 0.1, price: 9, status: "sent", orderId: "pending", txHash: "0xsent", gasMon: 0.1 },
      },
      {
        kind: "fill",
        id: "synthetic-buy",
        block: 2,
        ts: 1_020,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 9, simulated: true },
      },
    ])).toThrow(/pending|unresolved|receipt/i);
  });

  test("labels synthetic fills without inventing an unobserved transaction receipt", () => {
    const result = replayJournal([
      { ...session, dataSource: "synthetic" },
      {
        kind: "fill",
        id: "synthetic-buy",
        block: 2,
        ts: 1_020,
        mid: 10,
        fill: { side: "buy", size: 0.1, price: 9, simulated: true },
      },
    ]);

    expect(result.quoteCount).toBe(0);
    expect(result.fillCountsByProvenance).toEqual({ paper: 0, synthetic: 1, live: 0 });
    expect(result.caveats.some((line) => line.includes("does not forecast future returns"))).toBe(true);
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
      { kind: "block", block: 3, ts: 1_010, mid: 10, decision: "hold" },
      {
        kind: "fill",
        id: "delayed-1",
        block: 2,
        ts: 1_020,
        mid: 10,
        fill: { side: "buy", size: 1, price: 9, simulated: true },
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
      fill: { side: "buy", size: 0.1, price: 9, simulated: true },
    } as const;
    expect(() => replayJournal([session, fill, { ...fill, ts: 1_020 }])).toThrow("duplicate fill id same-fill");
    expect(() => replayJournal([session, {
      ...fill,
      id: "wrong-provenance",
      fill: { ...fill.fill, simulated: false },
    }])).toThrow("conflicts with session.dataSource");
  });

  test("charges a confirmed cancellation once when its transaction hash is shared with a receipt", () => {
    const result = replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "sell", size: 1, price: 10, status: "placed", orderId: "live-1", txHash: "0xCancelTx", gasMon: 0.02, gasEvidence: "observed" },
      },
      { kind: "cancel", block: 1, ts: 1_020, mid: 10, txHash: "0xcanceltx", gasMon: 0.02, gasEvidence: "observed", status: "placed" },
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
        quote: { side: "sell", size: 1, price: 10, status: "placed", txHash: "0xCancelTx", gasMon: 0.02, gasEvidence: "observed" },
      },
      { kind: "cancel", block: 1, ts: 1_020, mid: 10, txHash: "0xcanceltx", gasMon: 0.03, gasEvidence: "observed", status: "placed" },
    ])).toThrow("repeats transaction 0xcanceltx with conflicting gas amounts");
  });

  test("does not report net profit when a lost receipt is represented by zero gas", () => {
    expect(() => replayJournal([
      session,
      { kind: "block", block: 1, ts: 1_010, mid: 11 },
      {
        kind: "quote",
        block: 1,
        ts: 1_020,
        mid: 11,
        quote: { side: "buy", size: 1, price: 10, status: "lost", txHash: "0xlost", gasMon: 0 },
      },
    ])).toThrow(/lost|unknown|unresolved/i);
  });

  test("withholds complete replay results while a sent transaction has no receipt", () => {
    expect(() => replayJournal([
      session,
      { kind: "block", block: 1, ts: 1_010, mid: 11 },
      {
        kind: "quote",
        block: 1,
        ts: 1_020,
        mid: 11,
        quote: { side: "buy", size: 1, price: 10, status: "sent", txHash: "0xpending", gasMon: 0.5 },
      },
    ])).toThrow(/pending|unresolved|receipt/i);
  });

  test("withholds replay completion when a confirmed replacement omits cancellation reconciliation", () => {
    expect(() => replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "sell", size: 1, price: 10, status: "sent", txHash: "0xreplace", orderId: null, gasMon: null, gasEstimateMon: 0.1, gasEvidence: "pending", cancel: [41] },
      },
      {
        kind: "quote",
        block: 1,
        ts: 1_020,
        mid: 10,
        quote: { side: "sell", size: 1, price: 10, status: "placed", txHash: "0xreplace", orderId: 42, gasMon: 0.1, gasEvidence: "observed", cancel: [41] },
      },
    ])).toThrow(/cancell?ation|unresolved.*execution/i);
  });

  test("accepts a replacement receipt only when canceled order ids reconcile", () => {
    const result = replayJournal([
      { ...session, dataSource: "live" },
      {
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "sell", size: 1, price: 10, status: "sent", txHash: "0xreplace", orderId: null, gasMon: null, gasEstimateMon: 0.1, gasEvidence: "pending", cancel: [41] },
      },
      {
        kind: "quote",
        block: 1,
        ts: 1_020,
        mid: 10,
        canceled: [41],
        quote: { side: "sell", size: 1, price: 10, status: "placed", txHash: "0xreplace", orderId: 42, gasMon: 0.1, gasEvidence: "observed", cancel: [41] },
      },
    ]);

    expect(result.quoteCount).toBe(1);
    expect(result.receiptCount).toBe(1);
    expect(result.costs.observedGasUsd).toBe(1);
  });

  test("resolves journaled unknown Jev usage once when late evidence arrives", () => {
    const lateCost = { kind: "cost", block: 1, ts: 1_030, mid: 11, inferenceId: "inference-1", status: "known", jevUsd: 1 };
    const result = replayJournal([
      session,
      { kind: "block", block: 1, ts: 1_010, mid: 11 },
      { kind: "cost", block: 1, ts: 1_020, mid: 11, inferenceId: "inference-1", status: "unknown", jevUsd: null, reason: "usage-unresolved" },
      lateCost,
      { ...lateCost, ts: 1_040 },
    ]);

    expect(result.costs.jevUsd).toBe(1);
    expect(result.netPnlUsd).toBe(1);
  });

  test("refuses a replay that ends with unresolved Jev cost evidence", () => {
    expect(() => replayJournal([
      session,
      { kind: "block", block: 1, ts: 1_010, mid: 11 },
      { kind: "cost", block: 1, ts: 1_020, mid: 11, inferenceId: "inference-1", status: "unknown", jevUsd: null, reason: "usage-missing" },
    ])).toThrow(/unresolved.*cost|unknown.*cost/i);
  });

  test("counts a sent-lost-placed duplicate receipt as one quote and one gas charge", () => {
    const sent = {
      side: "buy", size: 0.1, price: 9, status: "sent", orderId: null,
      txHash: "0xabababababababababababababababababababababababababababababababab",
      gasMon: null, gasEstimateMon: 0.02, gasEvidence: "pending", cancel: [],
    } as const;
    const lost = { ...sent, status: "lost", gasEvidence: "unknown" } as const;
    const placed = { ...sent, status: "placed", orderId: 7, gasMon: 0.01, gasEvidence: "observed" } as const;
    const result = replayJournal([
      session,
      { kind: "quote", block: 1, ts: 1_010, mid: 10, quote: sent },
      { kind: "quote", block: 1, ts: 1_020, mid: 10, quote: lost },
      { kind: "quote", block: 1, ts: 1_030, mid: 10, quote: placed },
      { kind: "quote", block: 1, ts: 1_040, mid: 10, quote: placed },
    ]);

    expect(result.quoteCount).toBe(1);
    expect(result.receiptCount).toBe(1);
    expect(result.costs.observedGasUsd).toBe(0.1);
  });

  test("ambiguous cancellation replay stays incomplete until its hash confirms requested order ids", () => {
    const txHash = `0x${"12".repeat(32)}`;
    const unknownCancel = {
      kind: "cancel", block: 1, ts: 1_010, mid: 10, txHash, gasMon: null,
      gasEstimateMon: 0.02, gasEvidence: "unknown", status: "unknown", canceled: [41],
    } as const;
    const unrelated = { ...unknownCancel, ts: 1_020, txHash: `0x${"34".repeat(32)}`, gasMon: 0.03, gasEvidence: "observed", status: "placed" } as const;
    const finalMissingIds = { ...unknownCancel, ts: 1_030, gasMon: 0.01, gasEvidence: "observed", status: "placed", canceled: [] } as const;

    expect(() => replayJournal([session, unknownCancel])).toThrow(/unresolved.*execution|unresolved.*receipt/i);
    expect(() => replayJournal([session, unknownCancel, unrelated])).toThrow(/unresolved.*execution|unresolved.*receipt/i);
    expect(() => replayJournal([session, unknownCancel, finalMissingIds])).toThrow(/unresolved.*execution/i);

    const final = { ...finalMissingIds, ts: 1_040, canceled: [41] } as const;
    const duplicate = { ...final, ts: 1_050 } as const;
    const result = replayJournal([session, unknownCancel, final, duplicate]);

    expect(result.receiptCount).toBe(1);
    expect(result.costs.observedGasUsd).toBe(0.1);
  });
});
