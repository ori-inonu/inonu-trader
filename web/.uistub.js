// Temporary UI audit harness: stubs EventSource so the dashboard renders with a populated feed.
(() => {
  const totals = (n) => ({
    blocks: n, decisions: n, quotes: n, fills: n, reverted: 0, lateBlocks: 0,
    jevUsd: 12345.67, jevCostBasis: "wallet", gasMon: 0.02, gasUsd: 3.1,
    estimatedGasMon: 0.02, estimatedGasUsd: 3.1, observedGasMon: 0.02, observedGasUsd: 3.1,
    costsComplete: true, unknownCosts: [], realizedUsd: 12.5, pnlUsd: 42.25, pnlMon: 0.03, pnlPct: 0.7,
  });
  const event = (block) => ({
    block,
    ts: Date.now(),
    mid: 1.234567 + block * 0.00001,
    bestBid: 1.2345,
    bestAsk: 1.2346,
    spreadBps: 0.8,
    decision: { action: ["buy", "sell", "hold"][block % 3], probabilities: { buy: 0.62, sell: 0.22, hold: 0.16 }, upIn10: 0.42, latencyMs: 187, late: false },
    quote: null,
    fill: null,
    resting: { bidMon: 0, askMon: 0 },
    position: { side: "flat", size: 0, entryPrice: null, unrealizedUsd: 0, unrealizedMon: 0 },
    totals: totals(810012 + block),
  });

  class FakeEventSource extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.readyState = 1;
      this.listeners = {};
      setTimeout(() => {
        this.onopen && this.onopen({});
        this.dispatch("snapshot", {
          market: "MON/USDC on Kuru",
          wallet: "0x7F3a4c9B21e5D6f8A0b3C4D5e6F708192a3B4c5D6",
          dryRun: false,
          model: "jev-decision-core-v3-long-model-name",
          startedAt: Date.now() - 3600_000,
          dataSource: "Kuru",
          history: [event(8), event(9), event(10)],
        });
        let n = 11;
        setInterval(() => { this.dispatch("block", event(n)); n += 1; }, 300);
      }, 30);
    }
    dispatch(type, data) {
      this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
    close() { this.readyState = 2; }
  }
  window.EventSource = FakeEventSource;
})();