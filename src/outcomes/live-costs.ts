/** Conservative cost defaults for the runtime outcome recorder. Unknown costs remain null. */
export const COST_TABLE = Object.freeze({
  schema: "jev-lab-costs-v1" as const,
  feeTakerBps: Object.freeze({ spot: 10, perp: 5 }),
  slippageBpsPerSide: 1,
  fixedUsdPerRoundTrip: Object.freeze({
    "funding-carry": 0,
    "perp-directional": 0,
    "spot-momentum": 0,
    "yield-allocation": null,
    "dex-signal": null,
    "kuru-maker": null,
  }),
  cashYieldAnnual: 0.0405,
  maintenanceMarginRate: 0.0125,
  captureLagMs: 5_000,
  notionalUsd: 100,
  fundingLookbackMs: 2 * 86_400_000,
});
