// Synthetic input for the offline derivatives evaluator. EVERY value here is invented: the
// instrument names, prices, depths, fee rates, maintenance margin rate and funding history do not
// describe any real OKX market and prove arithmetic only. The fixed clock keeps the demo
// deterministic.

const HOUR_MS = 3_600_000;

/** 2027-01-15T09:00:00Z, fixed so that the demo never depends on the local clock. */
export const SYNTHETIC_NOW_MS = 1_800_003_600_000;

const FUNDING_HISTORY_RATES = ["0.00009", "0.00010", "0.00007", "0.00011", "0.00013", "0.00010", "0.00008", "0.00012", "0.00010"];

/** A fresh, mutable, JSON-compatible copy of the synthetic input on every call. */
export function syntheticInput(): Record<string, unknown> {
  const pendingSettlementMs = SYNTHETIC_NOW_MS + 7 * HOUR_MS;
  return {
    schema: "okx_derivatives_input_v1",
    sourceClaim: "synthetic",
    snapshot: {
      spot: { instId: "SYN-USDT", baseCcy: "SYN", quoteCcy: "USDT", tickSz: "0.1", lotSz: "0.001", minSz: "0.001", state: "live" },
      perp: {
        instId: "SYN-USDT-SWAP", ctType: "linear", ctVal: "0.1", ctMult: "1", ctValCcy: "SYN", settleCcy: "USDT",
        tickSz: "0.1", lotSz: "1", minSz: "1", maxLeverage: 50, state: "live",
      },
      books: {
        spot: {
          tsMs: SYNTHETIC_NOW_MS - 2000,
          bids: [["999.9", "30"], ["999.8", "40"], ["999.7", "60"], ["999.5", "100"]],
          asks: [["1000.1", "30"], ["1000.2", "40"], ["1000.3", "60"], ["1000.5", "100"]],
        },
        perp: {
          tsMs: SYNTHETIC_NOW_MS - 1500,
          bids: [["1001.0", "200"], ["1000.9", "300"], ["1000.8", "500"], ["1000.5", "800"]],
          asks: [["1001.2", "200"], ["1001.3", "300"], ["1001.4", "500"], ["1001.7", "800"]],
        },
      },
      mark: { tsMs: SYNTHETIC_NOW_MS - 1200, markPx: "1001.1" },
      funding: {
        tsMs: SYNTHETIC_NOW_MS - 3000,
        currentRate: "0.00010",
        fundingTimeMs: pendingSettlementMs,
        nextFundingTimeMs: pendingSettlementMs + 8 * HOUR_MS,
        history: FUNDING_HISTORY_RATES.map((rate, index) => ({
          fundingTimeMs: pendingSettlementMs - (FUNDING_HISTORY_RATES.length - index) * 8 * HOUR_MS,
          rate,
        })),
      },
      fees: {
        spot: { makerCost: "0.0005", takerCost: "0.0007" },
        perp: { makerCost: "0.0001", takerCost: "0.0004" },
      },
      maintenanceMarginRate: "0.004",
      // A synthetic assumption so that the demo can show non-blocked verdicts. It is not a claim about any account.
      access: { derivatives: "operator_confirmed" },
    },
    evaluation: {
      carry: { contracts: "400" },
      directional: { side: "long", contracts: "400" },
      leverages: [1, 2, 3, 5, 10, 20],
      holdingSettlements: 90,
    },
  };
}
