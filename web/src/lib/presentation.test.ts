import { describe, expect, test } from "bun:test";
import { presentFeed } from "./presentation";
import type { BlockEvent, ConnectionState, Meta } from "./types";

function meta(overrides: Partial<Meta> = {}): Meta {
  return {
    model: "jev-test",
    wallet: null,
    dryRun: false,
    market: "MON/USDC",
    startedAt: 1,
    ...overrides,
  };
}

function event(
  block: number,
  action: "buy" | "sell" | "hold",
  quoteSide: "buy" | "sell" | null,
  fillSide: "buy" | "sell" | null,
): BlockEvent {
  return {
    block,
    ts: block,
    mid: 1,
    bestBid: 0.99,
    bestAsk: 1.01,
    spreadBps: 2,
    decision: { action, probabilities: { buy: 0.5, sell: 0.25, hold: 0.25 }, upIn10: 0, latencyMs: 1, late: false },
    quote: quoteSide ? { side: quoteSide, price: 1, size: 1, txHash: "0xfixture", gasMon: null, gasEstimateMon: 0.1, gasEvidence: "unknown", cancel: [], status: "lost", orderId: null, capped: false } : null,
    fill: fillSide ? { side: fillSide, size: 1, price: 1, txHash: null, orderId: block, simulated: false } : null,
    resting: { bidMon: 0, askMon: 0 },
    position: { side: "flat", size: 0, entryPrice: null, unrealizedUsd: 0, unrealizedMon: 0 },
    totals: { blocks: 0, decisions: 0, quotes: 0, fills: 0, reverted: 0, lateBlocks: 0, jevUsd: null, jevCostBasis: "unknown", gasMon: null, gasUsd: null, estimatedGasMon: 0, estimatedGasUsd: 0, observedGasMon: null, observedGasUsd: null, costsComplete: false, unknownCosts: ["receipt-gas"], realizedUsd: 0, pnlUsd: null, pnlMon: null, pnlPct: null },
  };
}

describe("feed presentation", () => {
  test("shows simulation only for strict dry-run evidence", () => {
    expect(presentFeed(meta({ dryRun: true }), "live")).toEqual({
      executionLabel: "Simulação",
      declaredModeLabel: null,
      sourceLabel: "Fonte não informada",
      connectionLabel: "Feed conectado",
    });
  });

  test("keeps absent or false execution evidence unverified", () => {
    expect(presentFeed(null, "connecting")).toEqual({
      executionLabel: "Execução não verificada",
      declaredModeLabel: null,
      sourceLabel: "Fonte não informada",
      connectionLabel: "Conectando ao feed",
    });
    expect(presentFeed(meta({ dryRun: false }), "reconnecting").executionLabel).toBe(
      "Execução não verificada",
    );
  });

  test("reports only a known consistent declared mode and source", () => {
    expect(
      presentFeed(meta({ dryRun: false, mode: "live", dataSource: "Kuru" }), "live"),
    ).toEqual({
      executionLabel: "Execução não verificada",
      declaredModeLabel: "Modo declarado: live",
      sourceLabel: "Fonte: Kuru",
      connectionLabel: "Feed conectado",
    });
    expect(presentFeed(meta({ dryRun: false, mode: "simulation" }), "live").declaredModeLabel).toBe(
      null,
    );
    expect(presentFeed(meta({ dryRun: true, mode: "live" }), "live").declaredModeLabel).toBe(
      null,
    );
    expect(presentFeed(meta({ dryRun: false, mode: "unknown" }), "live").declaredModeLabel).toBe(
      null,
    );
  });

  test("filters by recorded order and fill side before display limits", async () => {
    const { filterFeedEvents } = await import("./presentation");
    const events = [
      event(1, "buy", "buy", null),
      event(2, "hold", "buy", null),
      event(3, "hold", null, "sell"),
      event(4, "sell", null, "buy"),
      event(5, "buy", null, null),
    ];

    expect(filterFeedEvents(events, "buy", "orders").map((item) => item.block)).toEqual([1, 2]);
    expect(filterFeedEvents(events, "buy", "fills").map((item) => item.block)).toEqual([4]);
    expect(filterFeedEvents(events, "buy", "all").map((item) => item.block)).toEqual([1, 2, 4, 5]);
    expect(filterFeedEvents(events, "hold", "all").map((item) => item.block)).toEqual([2, 3]);
    expect(filterFeedEvents(events, "hold", "orders")).toEqual([]);
    expect(filterFeedEvents(events, "all", "fills").map((item) => item.block)).toEqual([3, 4]);
    expect(events.map((item) => item.block)).toEqual([1, 2, 3, 4, 5]);
  });

  test("keeps hold, late, and absent decision labels distinct", async () => {
    const { presentDecision } = await import("./presentation");
    const probabilities = { buy: 0.6, sell: 0.2, hold: 0.2 };

    expect(presentDecision({ action: "hold", late: false, probabilities }).label).toBe("Manter");
    expect(presentDecision({ action: "buy", late: true, probabilities }).label).toBe("Resposta tardia");
    expect(presentDecision(null).label).toBe("Aguardando decisão");
    expect(presentDecision({ action: "sell", late: false, probabilities: { buy: Number.NaN, sell: 0.5, hold: 0.5 } }).probabilities.buy).toBe("Indisponível");
  });

  test("chart windows select only existing recent events without changing the source", async () => {
    const { sliceChartWindow } = await import("./presentation");
    const events = Array.from({ length: 140 }, (_, index) => event(index + 1, "hold", null, null));

    expect(sliceChartWindow(events, 32).map((item) => item.block)).toEqual(
      Array.from({ length: 32 }, (_, index) => index + 109),
    );
    expect(sliceChartWindow(events, 64)).toHaveLength(64);
    expect(sliceChartWindow(events, 128)).toHaveLength(128);
    expect(sliceChartWindow(events.slice(0, 12), 64).map((item) => item.block)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(events).toHaveLength(140);
  });
});
