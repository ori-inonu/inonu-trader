import { describe, expect, test } from "bun:test";
import { liquidationPrice, liquidationRatio } from "../okx-derivatives/margin.ts";
import { rat } from "../okx-derivatives/decimal.ts";
import { normalCdf, touchLiquidationProbability } from "../policy/envelope.ts";
import { validateCaptureRecord, type CaptureRecord } from "./capture-format.ts";
import {
  COST_TABLE,
  candidateCosts,
  capitalPerNotional,
  computeEpochOutcomes,
  computeOutcome,
  exitFor,
  entryStartFor,
  returnOnCapital,
  scanLiquidation,
  type OutcomeParams,
} from "./outcomes.ts";
import { Rng } from "./rng.ts";
import { LeakError, ReplaySource, SyntheticSource, sampleBarExtremes, syntheticConfig, type FutureWindow } from "./source.ts";
import { HOUR_MS, LEVERAGES, YEAR_MS, type CandidateCosts, type Epoch, type LabCandidate, type LabModality, type LabSide, type Outcome } from "./types.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md sections 5 and 6. Titles start with the acceptance id.
// Hand-made fixtures use one minute bars so every number can be checked by hand.

const BAR = 60_000;
const T = 1_800_000_000_000;
const PERP = "SYNA-USDT-SWAP";
const SPOT = "SYNA-USDT";
const NO_OPPORTUNITY = { ...COST_TABLE, cashYieldAnnual: 0 };
const PARAMS: OutcomeParams = { barMs: BAR, horizonMs: 3 * BAR, executionDelayMs: BAR, table: NO_OPPORTUNITY };

type Bar = readonly [open: number, high: number, low: number, close: number];

function rec(kind: CaptureRecord["kind"], t: number, inst: string, data: Record<string, unknown>): CaptureRecord {
  return validateCaptureRecord({ t, kind, inst, data });
}

function candles(inst: string, firstStart: number, list: readonly (Bar | null)[]): CaptureRecord[] {
  const out: CaptureRecord[] = [];
  list.forEach((bar, index) => {
    if (bar === null) return;
    const start = firstStart + index * BAR;
    out.push(rec("candle", start + BAR, inst, { startMs: start, barMs: BAR, open: bar[0], high: bar[1], low: bar[2], close: bar[3] }));
  });
  return out;
}

function funding(t: number, settleMs: number, rate: number, inst = PERP): CaptureRecord {
  return rec("funding", t, inst, { rate, settleMs, intervalMs: 28_800_000 });
}

/** A filler record far enough in the future so the fixture covers the horizon plus the capture lag. */
const FILLER = rec("mark", T + 10 * BAR, PERP, { price: 100 });

const LONG_BARS: Bar[] = [
  [100, 101, 99.5, 100.5],
  [100.5, 102, 100, 101],
  [101, 103, 100.8, 102],
];

const COSTS_PERP: CandidateCosts = { feeBps: 10, spreadBps: 2, slippageBps: 2, fixedUsd: 0, notionalUsd: 100, complete: true };
const COSTS_CARRY: CandidateCosts = { feeBps: 30, spreadBps: 3, slippageBps: 4, fixedUsd: 0, notionalUsd: 100, complete: true };
const COSTS_SPOT: CandidateCosts = { feeBps: 20, spreadBps: 2, slippageBps: 2, fixedUsd: 0, notionalUsd: 100, complete: true };

function candidate(over: Partial<LabCandidate> & { modality: LabModality; side: LabSide }): LabCandidate {
  const instrument = over.instrument ?? (over.modality === "spot-momentum" ? SPOT : PERP);
  return {
    id: `${over.modality}.${instrument}.${over.side}`,
    instrument,
    hedgeInstrument: over.modality === "funding-carry" ? SPOT : null,
    venue: "okx",
    observedAtMs: T,
    horizonMs: PARAMS.horizonMs,
    features: {},
    costs: over.modality === "funding-carry" ? COSTS_CARRY : over.modality === "spot-momentum" ? COSTS_SPOT : COSTS_PERP,
    validUntilMs: T + 6 * 3_600_000,
    provenance: { source: "test", externalAccessObserved: false },
    ...over,
  };
}

function epochOf(c: LabCandidate): Epoch {
  return { id: `e${T}`, index: 0, t: T, candidates: [c], eligibleIds: [c.id], ineligible: [] };
}

function run(records: CaptureRecord[], c: LabCandidate, params: OutcomeParams = PARAMS): Outcome {
  const source = new ReplaySource([...records, FILLER], "replay:test");
  const outcomes = computeEpochOutcomes(epochOf(c), source, params);
  expect(outcomes.length).toBe(1);
  return outcomes[0] as Outcome;
}

const settledFunding = (rate: number, inst = PERP): CaptureRecord => funding(T + 2.5 * BAR, T + 2.5 * BAR, rate, inst);

describe("LB9 net return and the single cost table", () => {
  test("LB9 the table is frozen, declares every number once and has unknown (null) fixed cost for modalities without data", () => {
    expect(Object.isFrozen(COST_TABLE)).toBe(true);
    expect(COST_TABLE.feeTakerBps).toEqual({ spot: 10, perp: 5 });
    expect(COST_TABLE.slippageBpsPerSide).toBe(1);
    expect(COST_TABLE.cashYieldAnnual).toBe(0.0405);
    expect(COST_TABLE.maintenanceMarginRate).toBe(0.0125);
    expect(COST_TABLE.captureLagMs).toBe(5000);
    expect(COST_TABLE.notionalUsd).toBe(100);
    expect(COST_TABLE.fixedUsdPerRoundTrip["funding-carry"]).toBe(0);
    expect(COST_TABLE.fixedUsdPerRoundTrip["perp-directional"]).toBe(0);
    expect(COST_TABLE.fixedUsdPerRoundTrip["spot-momentum"]).toBe(0);
    for (const unsupported of ["yield-allocation", "dex-signal", "kuru-maker"] as const) expect(COST_TABLE.fixedUsdPerRoundTrip[unsupported]).toBeNull();
  });

  test("LB9 long: gross 2%, funding paid 0.02%, costs 14 bps, net 1.84% of notional (hand computed)", () => {
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002)], candidate({ modality: "perp-directional", side: "long" }));
    expect(outcome.complete).toBe(true);
    expect(outcome.incompleteReason).toBeNull();
    expect(outcome.entryMs).toBe(T + BAR);
    expect(outcome.horizonEndMs).toBe(T + 4 * BAR);
    expect(outcome.grossReturn).toBeCloseTo(0.02, 12);
    expect(outcome.fundingReturn).toBeCloseTo(-0.0002, 12);
    expect(outcome.costReturn).toBeCloseTo(0.0014, 12);
    expect(outcome.opportunityCost).toBe(0);
    expect(outcome.netReturn).toBeCloseTo(0.0184, 12);
    expect(outcome.capitalPerNotional).toBe(1);
  });

  test("LB9 short: gross -2%, funding received 0.02%, net -2.12%", () => {
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002)], candidate({ modality: "perp-directional", side: "short" }));
    expect(outcome.grossReturn).toBeCloseTo(-0.02, 12);
    expect(outcome.fundingReturn).toBeCloseTo(0.0002, 12);
    expect(outcome.netReturn).toBeCloseTo(-0.0212, 12);
  });

  test("LB9 carry: gross is the spot move minus the perp move, funding is received, capital per notional is 2", () => {
    const spotBars: Bar[] = [[100, 100.8, 99.9, 100.5], [100.5, 101.2, 100.4, 101], [101, 101.8, 100.9, 101.5]];
    const perpBars: Bar[] = [[100.4, 101, 100, 100.9], [100.9, 101.6, 100.8, 101.3], [101.3, 102, 101.1, 101.7]];
    const outcome = run([...candles(SPOT, T + BAR, spotBars), ...candles(PERP, T + BAR, perpBars), settledFunding(0.0002)], candidate({ modality: "funding-carry", side: "neutral" }));
    const gross = 101.5 / 100 - 1 - (101.7 / 100.4 - 1);
    expect(outcome.grossReturn).toBeCloseTo(gross, 12);
    expect(outcome.fundingReturn).toBeCloseTo(0.0002, 12);
    expect(outcome.costReturn).toBeCloseTo(0.0037, 12);
    expect(outcome.netReturn).toBeCloseTo(gross + 0.0002 - 0.0037, 12);
    expect(outcome.capitalPerNotional).toBe(2);
    expect(returnOnCapital(outcome)).toBeCloseTo((gross + 0.0002 - 0.0037) / 2, 12);
  });

  test("LB9 spot long needs no funding record: funding is a known zero", () => {
    const outcome = run(candles(SPOT, T + BAR, LONG_BARS), candidate({ modality: "spot-momentum", side: "long" }));
    expect(outcome.complete).toBe(true);
    expect(outcome.fundingReturn).toBe(0);
    expect(outcome.netReturn).toBeCloseTo(0.02 - 0.0024, 12);
  });

  test("LB9 the opportunity cost charges the cash yield on the committed capital for the holding period", () => {
    const params: OutcomeParams = { ...PARAMS, table: COST_TABLE };
    const long = run([...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002)], candidate({ modality: "perp-directional", side: "long" }), params);
    const perHorizon = (0.0405 * (3 * BAR)) / YEAR_MS;
    expect(long.opportunityCost).toBeCloseTo(perHorizon, 15);
    expect(long.netReturn).toBeCloseTo(0.0184 - perHorizon, 12);
    const spotBars = candles(SPOT, T + BAR, LONG_BARS);
    const perpBars = candles(PERP, T + BAR, LONG_BARS);
    const carry = run([...spotBars, ...perpBars, settledFunding(0.0002)], candidate({ modality: "funding-carry", side: "neutral" }), params);
    expect(carry.opportunityCost).toBeCloseTo(2 * perHorizon, 15);
  });

  test("LB9 a fixed cost in USD is converted with the notional and added to the cost", () => {
    const withFixed = candidate({ modality: "perp-directional", side: "long", costs: { ...COSTS_PERP, fixedUsd: 0.5 } });
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002)], withFixed);
    expect(outcome.costReturn).toBeCloseTo(0.0014 + 0.005, 12);
  });

  test("LB9 changing the table changes the result", () => {
    const records = [...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002)];
    const base = run(records, candidate({ modality: "perp-directional", side: "long" }));
    const pricier = run(records, candidate({ modality: "perp-directional", side: "long", costs: { ...COSTS_PERP, feeBps: 40 } }));
    expect((base.netReturn as number) - (pricier.netReturn as number)).toBeCloseTo(0.003, 12);
  });

  test("LB9 returnOnCapital divides by the capital per notional and the passive form pays no trading cost", () => {
    const records = [...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002)];
    const outcome = run(records, candidate({ modality: "perp-directional", side: "long" }));
    expect(returnOnCapital(outcome)).toBeCloseTo(0.0184, 12);
    expect(returnOnCapital(outcome, true)).toBeCloseTo(0.02 - 0.0002, 12);
    expect(returnOnCapital({ ...outcome, complete: false, netReturn: null })).toBeNull();
  });

  test("LB9 capital per notional is 1/L for a directional perp, 1 + 1/L for a carry and 1 for spot", () => {
    expect(capitalPerNotional("perp-directional", 1)).toBe(1);
    expect(capitalPerNotional("perp-directional", 10)).toBeCloseTo(0.1, 15);
    expect(capitalPerNotional("funding-carry", 1)).toBe(2);
    expect(capitalPerNotional("funding-carry", 3)).toBeCloseTo(1 + 1 / 3, 15);
    expect(capitalPerNotional("spot-momentum", 1)).toBe(1);
    expect(capitalPerNotional("kuru-maker", 1)).toBeNull();
  });

  test("LB9 entry is on the bar grid one delay after the decision and the exit is one horizon later", () => {
    expect(entryStartFor(T, PARAMS)).toBe(T + BAR);
    expect(entryStartFor(T + 1, PARAMS)).toBe(T + 2 * BAR);
    expect(exitFor(T, PARAMS)).toBe(T + 4 * BAR);
    expect(entryStartFor(T, { ...PARAMS, executionDelayMs: 0 })).toBe(T);
  });
});

describe("LB8 unknown costs never become zero", () => {
  test("LB8 candidateCosts: an unknown spread leaves the component null and the costs incomplete", () => {
    const known = candidateCosts("funding-carry", { spot: 2, perp: 1 });
    expect(known).toEqual({ feeBps: 30, spreadBps: 3, slippageBps: 4, fixedUsd: 0, notionalUsd: 100, complete: true });
    const unknownSpot = candidateCosts("funding-carry", { spot: null, perp: 1 });
    expect(unknownSpot.spreadBps).toBeNull();
    expect(unknownSpot.complete).toBe(false);
    const directional = candidateCosts("perp-directional", { spot: null, perp: 1.5 });
    expect(directional).toEqual({ feeBps: 10, spreadBps: 1.5, slippageBps: 2, fixedUsd: 0, notionalUsd: 100, complete: true });
    const spot = candidateCosts("spot-momentum", { spot: 2, perp: null });
    expect(spot).toEqual({ feeBps: 20, spreadBps: 2, slippageBps: 2, fixedUsd: 0, notionalUsd: 100, complete: true });
  });

  test("LB8 a modality without data has an unknown fixed cost, so its candidates are never complete", () => {
    for (const modality of ["yield-allocation", "dex-signal", "kuru-maker"] as const) {
      const costs = candidateCosts(modality, { spot: 1, perp: 1 });
      expect(costs.fixedUsd).toBeNull();
      expect(costs.complete).toBe(false);
    }
  });

  test("LB8 an outcome asked for a candidate with incomplete costs is incomplete (costs-unknown), not computed with a zero", () => {
    const unknownCosts = candidate({ modality: "perp-directional", side: "long", costs: { ...COSTS_PERP, spreadBps: null, complete: false } });
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002)], unknownCosts);
    expect(outcome.complete).toBe(false);
    expect(outcome.incompleteReason).toBe("costs-unknown");
    expect(outcome.netReturn).toBeNull();
    expect(outcome.costReturn).toBeNull();
  });

  test("LB8 an unsupported modality is incomplete (modality-unsupported)", () => {
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS)], candidate({ modality: "kuru-maker", side: "neutral", costs: { ...COSTS_PERP, fixedUsd: null, complete: false } }));
    expect(outcome.complete).toBe(false);
    expect(outcome.incompleteReason).toBe("modality-unsupported");
  });
});

describe("LB10 funding sign and schedule", () => {
  const perpCandles = candles(PERP, T + BAR, LONG_BARS);

  test("LB10 only settlements inside the holding window count", () => {
    const records = [
      ...perpCandles,
      funding(T - 1000, T, 0.01), // exactly at the decision, before the entry: not in the window
      funding(T + 2.5 * BAR, T + 2.5 * BAR, 0.0002),
      funding(T + 2.6 * BAR, T + 9 * BAR, 0.03), // after the exit: not in the window
    ];
    const outcome = run(records, candidate({ modality: "perp-directional", side: "short" }));
    expect(outcome.complete).toBe(true);
    expect(outcome.fundingReturn).toBeCloseTo(0.0002, 12);
  });

  test("LB10 three hourly settlements inside the window are all counted, with the sign of the side", () => {
    const hour = 3_600_000;
    const params: OutcomeParams = { ...PARAMS, horizonMs: 3 * hour, barMs: hour, executionDelayMs: hour, table: NO_OPPORTUNITY };
    const entry = T + hour; // T is a multiple of an hour
    const hourBars: Bar[] = [[100, 101, 99, 100.5], [100.5, 101, 100, 100.8], [100.8, 102, 100.5, 101]];
    const hourCandles = hourBars.map((bar, i) => rec("candle", entry + (i + 1) * hour, PERP, { startMs: entry + i * hour, barMs: hour, open: bar[0], high: bar[1], low: bar[2], close: bar[3] }));
    const settlements = [entry + 0.5 * hour, entry + 1.5 * hour, entry + 2.5 * hour].map((at) => rec("funding", at, PERP, { rate: 0.0001, settleMs: at, intervalMs: hour }));
    const source = new ReplaySource([...hourCandles, ...settlements, rec("mark", entry + 10 * hour, PERP, { price: 100 })], "replay:hour");
    const long = computeEpochOutcomes(epochOf(candidate({ modality: "perp-directional", side: "long", horizonMs: 3 * hour })), source, params)[0] as Outcome;
    expect(long.complete).toBe(true);
    expect(long.fundingReturn).toBeCloseTo(-0.0003, 12);
    const short = computeEpochOutcomes(epochOf(candidate({ modality: "perp-directional", side: "short", horizonMs: 3 * hour })), source, params)[0] as Outcome;
    expect(short.fundingReturn).toBeCloseTo(0.0003, 12);
  });

  test("LB10 carry receives positive funding and pays negative funding (it is short the perp)", () => {
    const spotBars: Bar[] = [[100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100]];
    const perpBars: Bar[] = [[100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100]];
    const base = [...candles(SPOT, T + BAR, spotBars), ...candles(PERP, T + BAR, perpBars)];
    const positive = run([...base, settledFunding(0.0005)], candidate({ modality: "funding-carry", side: "neutral" }));
    const negative = run([...base, settledFunding(-0.0005)], candidate({ modality: "funding-carry", side: "neutral" }));
    expect(positive.fundingReturn).toBeCloseTo(0.0005, 12);
    expect(negative.fundingReturn).toBeCloseTo(-0.0005, 12);
  });

  test("LB10 the rate used is the last record of that settlement: the settled value replaces the announcement", () => {
    const settleMs = T + 2.5 * BAR;
    const records = [...perpCandles, funding(T - 3 * BAR, settleMs, 0.0001), funding(settleMs, settleMs, 0.0004)];
    const outcome = run(records, candidate({ modality: "perp-directional", side: "short" }));
    expect(outcome.fundingReturn).toBeCloseTo(0.0004, 12);
  });

  test("LB10 an announcement published before the decision is enough when no later record exists", () => {
    const settleMs = T + 2.5 * BAR;
    const outcome = run([...perpCandles, funding(T - 3 * BAR, settleMs, 0.0001)], candidate({ modality: "perp-directional", side: "short" }));
    expect(outcome.complete).toBe(true);
    expect(outcome.fundingReturn).toBeCloseTo(0.0001, 12);
  });

  test("LB10 boundary: a settlement exactly at the entry is not charged; exactly at the exit it counts only as a payment", () => {
    const entry = T + BAR;
    const exit = T + 4 * BAR;
    const atEntry = run([...perpCandles, funding(entry, entry, 0.01), funding(T + 2 * BAR, T + 2.5 * BAR, 0.0002)], candidate({ modality: "perp-directional", side: "short" }));
    expect(atEntry.fundingReturn).toBeCloseTo(0.0002, 12);
    const receiveAtExit = run([...perpCandles, funding(exit, exit, 0.0007)], candidate({ modality: "perp-directional", side: "short" }));
    expect(receiveAtExit.complete).toBe(true);
    expect(receiveAtExit.fundingReturn).toBe(0);
    const payAtExit = run([...perpCandles, funding(exit, exit, 0.0007)], candidate({ modality: "perp-directional", side: "long" }));
    expect(payAtExit.fundingReturn).toBeCloseTo(-0.0007, 12);
  });

  test("LB10 an expected settlement without any record makes the outcome incomplete (funding-unobserved)", () => {
    const hour = 3_600_000;
    const params: OutcomeParams = { ...PARAMS, horizonMs: 3 * hour, barMs: hour, executionDelayMs: hour, table: NO_OPPORTUNITY };
    const entry = T + hour;
    const hourCandles = [0, 1, 2].map((i) => rec("candle", entry + (i + 1) * hour, PERP, { startMs: entry + i * hour, barMs: hour, open: 100, high: 101, low: 99, close: 100 }));
    // settlements at +0.5h and +2.5h are recorded, the one at +1.5h is missing
    const present = [entry + 0.5 * hour, entry + 2.5 * hour].map((s) => rec("funding", s, PERP, { rate: 0.0001, settleMs: s, intervalMs: hour }));
    const source = new ReplaySource([...hourCandles, ...present, rec("mark", entry + 10 * hour, PERP, { price: 100 })], "replay:hole");
    const outcome = computeEpochOutcomes(epochOf(candidate({ modality: "perp-directional", side: "long", horizonMs: 3 * hour })), source, params)[0] as Outcome;
    expect(outcome.complete).toBe(false);
    expect(outcome.incompleteReason).toBe("funding-unobserved");
    expect(outcome.fundingReturn).toBeNull();
    expect(outcome.netReturn).toBeNull();
  });

  test("LB10 no funding record at all for a perp candidate is funding-unobserved, never a zero funding", () => {
    const outcome = run(perpCandles, candidate({ modality: "perp-directional", side: "long" }));
    expect(outcome.complete).toBe(false);
    expect(outcome.incompleteReason).toBe("funding-unobserved");
  });

  test("LB10 a funding record that only arrives after the horizon end plus the capture lag is not used", () => {
    const settleMs = T + 2.5 * BAR;
    const late = funding(T + 4 * BAR + COST_TABLE.captureLagMs + 1, settleMs, 0.0004);
    const outcome = run([...perpCandles, late], candidate({ modality: "perp-directional", side: "short" }));
    expect(outcome.complete).toBe(false);
    expect(outcome.incompleteReason).toBe("funding-unobserved");
  });
});

describe("LB11 incomplete outcomes", () => {
  const funded = settledFunding(0.0002);

  test("LB11 missing entry bar, exit bar and a gap in the middle have their own reasons", () => {
    const entryMissing = run([...candles(PERP, T + BAR, [null, LONG_BARS[1] as Bar, LONG_BARS[2] as Bar]), funded], candidate({ modality: "perp-directional", side: "long" }));
    expect(entryMissing.incompleteReason).toBe("entry-bar-missing");
    const exitMissing = run([...candles(PERP, T + BAR, [LONG_BARS[0] as Bar, LONG_BARS[1] as Bar, null]), funded], candidate({ modality: "perp-directional", side: "long" }));
    expect(exitMissing.incompleteReason).toBe("exit-bar-missing");
    const gap = run([...candles(PERP, T + BAR, [LONG_BARS[0] as Bar, null, LONG_BARS[2] as Bar]), funded], candidate({ modality: "perp-directional", side: "long" }));
    expect(gap.incompleteReason).toBe("candle-gap");
  });

  test("LB11 an incomplete outcome has every number null, an honest reason and null leverage rows, never zeros", () => {
    const outcome = run([...candles(PERP, T + BAR, [LONG_BARS[0] as Bar, null, LONG_BARS[2] as Bar]), funded], candidate({ modality: "perp-directional", side: "long" }));
    expect(outcome.complete).toBe(false);
    for (const field of ["grossReturn", "fundingReturn", "costReturn", "opportunityCost", "netReturn", "capitalPerNotional"] as const) expect(outcome[field]).toBeNull();
    expect(outcome.leverage.map((row) => row.leverage)).toEqual([...LEVERAGES]);
    for (const row of outcome.leverage) {
      expect(row.liquidated).toBeNull();
      expect(row.equityMultiple).toBeNull();
    }
    expect(returnOnCapital(outcome)).toBeNull();
  });

  test("LB11 a horizon that runs past the data is horizon-beyond-data", () => {
    const records = [...candles(PERP, T + BAR, LONG_BARS), funded];
    const source = new ReplaySource(records, "replay:short"); // coverage ends at the last candle, no filler
    const outcome = computeEpochOutcomes(epochOf(candidate({ modality: "perp-directional", side: "long" })), source, PARAMS)[0] as Outcome;
    expect(outcome.complete).toBe(false);
    expect(outcome.incompleteReason).toBe("horizon-beyond-data");
  });

  test("LB11 the outcome carries its epoch and candidate ids and keeps a leverage row for each level", () => {
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS), funded], candidate({ modality: "perp-directional", side: "long" }));
    expect(outcome.epochId).toBe(`e${T}`);
    expect(outcome.candidateId).toBe(`perp-directional.${PERP}.long`);
    expect(outcome.leverage.map((row) => row.leverage)).toEqual([1, 2, 3, 5, 10]);
  });
});

describe("LB7 an outcome never uses data past the horizon end", () => {
  const source = new SyntheticSource(syntheticConfig({ seed: 5, epochs: 12, stepMs: 6 * HOUR_MS, horizonMs: 24 * HOUR_MS }));
  const params: OutcomeParams = { barMs: 15 * 60_000, horizonMs: 24 * HOUR_MS, executionDelayMs: 15 * 60_000 };
  const t = source.epochTimes()[4] as number;
  const synthCandidate = candidate({
    modality: "perp-directional",
    instrument: "SYNA-USDT-SWAP",
    side: "long",
    observedAtMs: t,
    horizonMs: params.horizonMs,
    costs: { feeBps: 10, spreadBps: 3, slippageBps: 2, fixedUsd: 0, notionalUsd: 100, complete: true },
  });
  const epoch: Epoch = { id: `e${t}`, index: 4, t, candidates: [synthCandidate], eligibleIds: [synthCandidate.id], ineligible: [] };
  const deadline = exitFor(t, params) + COST_TABLE.captureLagMs;

  test("LB7 every window asked of the source ends at the horizon end plus the capture lag", () => {
    class Spy extends SyntheticSource {
      readonly calls: Array<[number, number]> = [];
      override future(t0: number, t1: number, kinds?: Parameters<SyntheticSource["future"]>[2], insts?: Parameters<SyntheticSource["future"]>[3]): FutureWindow {
        this.calls.push([t0, t1]);
        return super.future(t0, t1, kinds, insts);
      }
    }
    const spy = new Spy(source.config);
    const outcomes = computeEpochOutcomes(epoch, spy, params);
    expect(outcomes[0]?.complete).toBe(true);
    expect(spy.calls.length).toBeGreaterThan(0);
    for (const [from, to] of spy.calls) {
      expect(to).toBeLessThanOrEqual(deadline);
      expect(from).toBeLessThanOrEqual(to);
    }
  });

  function poisoned(from: number): ReplaySource {
    const mutated = source.records.map((record): CaptureRecord => {
      if (record.t <= from) return record;
      if (record.kind === "candle") {
        const d = record.data;
        return validateCaptureRecord({ t: record.t, kind: "candle", inst: record.inst, data: { startMs: d.startMs, barMs: d.barMs, open: d.open * 50, high: d.high * 50, low: d.low * 50, close: d.close * 50 } });
      }
      if (record.kind === "funding") return validateCaptureRecord({ t: record.t, kind: "funding", inst: record.inst, data: { rate: 0.04, settleMs: record.data.settleMs, intervalMs: record.data.intervalMs } });
      return record;
    });
    return new ReplaySource(mutated, "replay:poisoned");
  }

  test("LB7 poisoning everything after the deadline does not change the outcome, poisoning inside the window does", () => {
    const clean = computeEpochOutcomes(epoch, source, params);
    expect(clean[0]?.complete).toBe(true);
    expect(computeEpochOutcomes(epoch, poisoned(deadline), params)).toEqual(clean);
    const inside = computeEpochOutcomes(epoch, poisoned(deadline - 4 * 15 * 60_000), params);
    expect(inside).not.toEqual(clean);
  });

  test("LB7 the synthetic source and a replay of the same records give the same outcome", () => {
    const replay = new ReplaySource(source.records, "replay:copy");
    expect(computeEpochOutcomes(epoch, replay, params)).toEqual(computeEpochOutcomes(epoch, source, params));
  });

  test("LB7 asking for outcomes inside a decision window is a LeakError", () => {
    const fresh = new SyntheticSource(source.config);
    fresh.openDecision(t);
    try {
      expect(() => computeEpochOutcomes(epoch, fresh, params)).toThrow(LeakError);
    } finally {
      fresh.closeDecision();
    }
  });
});

describe("LB12 leverage counterfactual", () => {
  const funded = settledFunding(0.0002);
  const longCandidate = candidate({ modality: "perp-directional", side: "long" });
  const MMR_PPM = 12_500n;
  const FEE_PPM = 500n;

  function flags(outcome: Outcome): boolean[] {
    return outcome.leverage.map((row) => row.liquidated as boolean);
  }

  test("LB12 without a crash nobody is liquidated and the multiple is 1 + L * (gross + funding - costs) (hand computed)", () => {
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS), funded], longCandidate);
    expect(flags(outcome)).toEqual([false, false, false, false, false]);
    const x = 0.02 - 0.0002 - 0.0014;
    outcome.leverage.forEach((row, index) => {
      const leverage = LEVERAGES[index] as (typeof LEVERAGES)[number];
      expect(row.leverage).toBe(leverage);
      expect(row.applicable).toBe(true);
      expect(row.equityMultiple).toBeCloseTo(1 + leverage * x, 12);
    });
  });

  test("LB12 a crash to 90 liquidates only 10x (liquidation price 91.2), 70 adds 5x (81.1), 55 adds 3x (67.6), and a liquidated multiple is exactly 0", () => {
    const crash = (low: number): Bar[] => [LONG_BARS[0] as Bar, [100.5, 102, low, 101], LONG_BARS[2] as Bar];
    const ninety = run([...candles(PERP, T + BAR, crash(90)), funded], longCandidate);
    expect(flags(ninety)).toEqual([false, false, false, false, true]);
    expect(ninety.leverage[4]?.equityMultiple).toBe(0);
    expect(ninety.leverage[3]?.equityMultiple).toBeCloseTo(1 + 5 * 0.0184, 12);
    const seventy = run([...candles(PERP, T + BAR, crash(70)), funded], longCandidate);
    expect(flags(seventy)).toEqual([false, false, false, true, true]);
    const fifty = run([...candles(PERP, T + BAR, crash(55)), funded], longCandidate);
    expect(flags(fifty)).toEqual([false, false, true, true, true]);
  });

  test("LB12 a 1x long is never liquidated, even when the price falls almost to zero", () => {
    const wipe: Bar[] = [LONG_BARS[0] as Bar, [100.5, 102, 0.5, 101], LONG_BARS[2] as Bar];
    const outcome = run([...candles(PERP, T + BAR, wipe), funded], longCandidate);
    expect(outcome.leverage[0]?.liquidated).toBe(false);
    expect(outcome.leverage[1]?.liquidated).toBe(true);
  });

  test("LB12 a short is liquidated by the high, not the low: 10x at about 108.6, 5x at about 118.4, 3x at about 131.6", () => {
    const spike = (high: number): Bar[] => [LONG_BARS[0] as Bar, [100.5, high, 100, 101], LONG_BARS[2] as Bar];
    const shortCandidate = candidate({ modality: "perp-directional", side: "short" });
    const modest = run([...candles(PERP, T + BAR, spike(105)), funded], shortCandidate);
    expect(flags(modest)).toEqual([false, false, false, false, false]);
    const big = run([...candles(PERP, T + BAR, spike(109)), funded], shortCandidate);
    // ratio_short(10x) = 1.1 / 1.013 = 1.0859; entry 99.98 after the adverse fill: liquidation near 108.57
    expect(flags(big)).toEqual([false, false, false, false, true]);
    const huge = run([...candles(PERP, T + BAR, spike(125)), funded], shortCandidate);
    expect(flags(huge)).toEqual([false, false, false, true, true]);
  });

  test("LB12 the liquidation price comes from src/okx-derivatives/margin.ts (same ratio, no funding paid)", () => {
    const entry = 100;
    for (const side of ["long", "short"] as const) {
      for (const leverage of LEVERAGES) {
        const scan = scanLiquidation({ side, entryPrice: entry, leverage, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars: [{ endMs: 1, high: entry, low: entry }], fundingPayments: [] });
        const exact = liquidationPrice(side, rat(100n), leverage, MMR_PPM, FEE_PPM);
        expect(scan.liquidationPrice).toBeCloseTo(Number(exact.n) / Number(exact.d), 9);
        const ratio = liquidationRatio(side, leverage, MMR_PPM, FEE_PPM);
        expect(scan.liquidationPrice / entry).toBeCloseTo(Number(ratio.n) / Number(ratio.d), 12);
      }
    }
  });

  test("LB12 funding already paid moves the liquidation price closer, for a long and for a short", () => {
    const entry = 100;
    const longBars = [{ endMs: 10, high: 100, low: 92 }];
    const without = scanLiquidation({ side: "long", entryPrice: entry, leverage: 10, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars: longBars, fundingPayments: [] });
    expect(without.liquidated).toBe(false);
    const withFunding = scanLiquidation({ side: "long", entryPrice: entry, leverage: 10, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars: longBars, fundingPayments: [{ settleMs: 5, paid: 0.02 }] });
    expect(withFunding.liquidated).toBe(true);
    expect(withFunding.fundingPaid).toBeCloseTo(0.02, 12);
    const shortBars = [{ endMs: 10, high: 107.9, low: 100 }];
    expect(scanLiquidation({ side: "short", entryPrice: entry, leverage: 10, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars: shortBars, fundingPayments: [] }).liquidated).toBe(false);
    expect(scanLiquidation({ side: "short", entryPrice: entry, leverage: 10, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars: shortBars, fundingPayments: [{ settleMs: 5, paid: 0.02 }] }).liquidated).toBe(true);
  });
  test("LB12 non-liquidated scan counts funding only through the final bar", () => {
    const scan = scanLiquidation({
      side: "long",
      entryPrice: 100,
      leverage: 10,
      maintenanceMarginPpm: MMR_PPM,
      feePpm: FEE_PPM,
      bars: [{ endMs: 10, high: 100, low: 100 }],
      fundingPayments: [{ settleMs: 5, paid: 0.01 }, { settleMs: 10, paid: 0.005 }, { settleMs: 15, paid: 0.02 }],
    });
    expect(scan.liquidated).toBe(false);
    expect(scan.atMs).toBe(null);
    expect(scan.fundingPaid).toBe(0.015);
  });

  test("LB12 a payment after the bar is not applied to it, and the first liquidating bar is reported", () => {
    const bars = [
      { endMs: 10, high: 100, low: 99 },
      { endMs: 20, high: 100, low: 92 },
      { endMs: 30, high: 100, low: 60 },
    ];
    const scan = scanLiquidation({ side: "long", entryPrice: 100, leverage: 10, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars, fundingPayments: [{ settleMs: 25, paid: 0.02 }] });
    expect(scan.liquidated).toBe(true);
    expect(scan.atMs).toBe(30);
    const early = scanLiquidation({ side: "long", entryPrice: 100, leverage: 10, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars, fundingPayments: [{ settleMs: 15, paid: 0.02 }] });
    expect(early.atMs).toBe(20);
  });

  test("LB12 monotone in leverage: liquidated at L implies liquidated at every larger L (random paths, funding and sides)", () => {
    const rng = new Rng(17, "monotone");
    for (let trial = 0; trial < 300; trial += 1) {
      let price = 100;
      const bars: Array<{ endMs: number; high: number; low: number }> = [];
      for (let i = 0; i < 30; i += 1) {
        const move = 0.04 * rng.normal();
        const next = price * Math.exp(move);
        const high = Math.max(price, next) * (1 + Math.abs(0.01 * rng.normal()));
        const low = Math.min(price, next) * (1 - Math.abs(0.01 * rng.normal()));
        bars.push({ endMs: (i + 1) * 10, high, low });
        price = next;
      }
      const payments = trial % 2 === 0 ? [] : [{ settleMs: 100, paid: 0.003 * rng.next() }, { settleMs: 200, paid: 0.003 * rng.next() }];
      for (const side of ["long", "short"] as const) {
        let seen = false;
        for (const leverage of LEVERAGES) {
          const { liquidated } = scanLiquidation({ side, entryPrice: 100, leverage, maintenanceMarginPpm: MMR_PPM, feePpm: FEE_PPM, bars, fundingPayments: payments });
          if (seen) expect(liquidated).toBe(true);
          if (liquidated) seen = true;
        }
      }
    }
  });

  test("LB12 carry: the perp short is liquidated by the high, the spot is left unhedged and only a spot loss is credited", () => {
    const spotFall: Bar[] = [[100, 100.2, 99, 99.2], [99.2, 99.4, 97.5, 97.6], [97.6, 97.8, 96.8, 97]];
    // the perp spikes to 120 in bar 1 and ends at 98: the 10x short (about 109) and the 5x short (about 118.9) are liquidated, 3x (about 132) is not
    const perpSpike: Bar[] = [[100.4, 100.6, 99.4, 99.6], [99.6, 120, 97.4, 97.8], [97.8, 98, 97, 98]];
    const outcome = run([...candles(SPOT, T + BAR, spotFall), ...candles(PERP, T + BAR, perpSpike), funded], candidate({ modality: "funding-carry", side: "neutral" }));
    expect(outcome.complete).toBe(true);
    const row = (leverage: number) => outcome.leverage.find((r) => r.leverage === leverage) as Outcome["leverage"][number];
    expect(row(10).liquidated).toBe(true);
    expect(row(5).liquidated).toBe(true);
    expect(row(3).liquidated).toBe(false);
    expect(row(1).liquidated).toBe(false);
    const spotReturn = 97 / 100 - 1;
    const costs = 0.0037;
    // liquidated carry at 10x: capital 1.1, loses the 1/10 margin, credits only the negative spot move, pays the costs
    const expected10 = 1 + (Math.min(spotReturn, 0) - 0 - 1 / 10 - costs) / (1 + 1 / 10);
    expect(row(10).equityMultiple).toBeCloseTo(Math.max(0, expected10), 12);
    const gross = 97 / 100 - 1 - (98 / 100.4 - 1);
    const x = gross + 0.0002 - costs;
    expect(row(3).equityMultiple).toBeCloseTo(1 + x / (1 + 1 / 3), 12);
    expect(row(1).equityMultiple).toBeCloseTo(1 + x / 2, 12);
    expect(outcome.capitalPerNotional).toBe(2);
  });

  test("LB12 spot candidates are not leverageable: rows are not applicable and carry no numbers", () => {
    const outcome = run(candles(SPOT, T + BAR, LONG_BARS), candidate({ modality: "spot-momentum", side: "long" }));
    expect(outcome.leverage.map((row) => row.leverage)).toEqual([...LEVERAGES]);
    for (const row of outcome.leverage) {
      expect(row.applicable).toBe(false);
      expect(row.liquidated).toBeNull();
      expect(row.equityMultiple).toBeNull();
    }
  });

  test("LB12 the cash opportunity cost is charged on the equity, not multiplied by the leverage", () => {
    const params: OutcomeParams = { ...PARAMS, table: COST_TABLE };
    const outcome = run([...candles(PERP, T + BAR, LONG_BARS), funded], longCandidate, params);
    const perHorizon = (0.0405 * (3 * BAR)) / YEAR_MS;
    expect(outcome.leverage[0]?.equityMultiple).toBeCloseTo(1 + 0.0184 - perHorizon, 12);
    expect(outcome.leverage[4]?.equityMultiple).toBeCloseTo(1 + 10 * 0.0184 - perHorizon, 12);
    expect(returnOnCapital(outcome)).toBeCloseTo((outcome.leverage[0]?.equityMultiple as number) - 1, 12);
  });
});

describe("LB13 consistency of the counterfactual with the closed forms", () => {
  /** P(min of the log price over T days <= -a) for a Brownian motion with drift nu and volatility sigma (reflection principle). */
  function gbmLowerTouch(a: number, sigma: number, days: number, nu: number): number {
    const s = sigma * Math.sqrt(days);
    return normalCdf((-a - nu * days) / s) + Math.exp((-2 * nu * a) / (sigma * sigma)) * normalCdf((-a + nu * days) / s);
  }
  function gbmUpperTouch(a: number, sigma: number, days: number, nu: number): number {
    const s = sigma * Math.sqrt(days);
    return normalCdf((-a + nu * days) / s) + Math.exp((2 * nu * a) / (sigma * sigma)) * normalCdf((-a - nu * days) / s);
  }

  const cases: ReadonlyArray<readonly [leverage: 10 | 5, sigma: number, days: number]> = [
    [10, 0.03, 5],
    [10, 0.02, 5],
    [5, 0.04, 5],
  ];

  for (const [leverage, sigma, days] of cases) {
    test(`LB13 L=${leverage}, sigma=${sigma}, ${days} days: the engine matches the exact GBM touch probability and envelope.ts sits between the long and the short value`, () => {
      const barsPerDay = 24;
      const trials = 4000;
      const rng = new Rng(2026, `touch:${leverage}:${sigma}`);
      const dt = 1 / barsPerDay;
      const variance = sigma * sigma * dt;
      const nu = -(sigma * sigma) / 2;
      let hitsLong = 0;
      let hitsShort = 0;
      for (let trial = 0; trial < trials; trial += 1) {
        let x = 0;
        const bars: Array<{ endMs: number; high: number; low: number }> = [];
        for (let j = 0; j < days * barsPerDay; j += 1) {
          const next = x + nu * dt + sigma * Math.sqrt(dt) * rng.normal();
          const { max, min } = sampleBarExtremes(x, next, variance, rng.nextOpen(), rng.nextOpen());
          bars.push({ endMs: (j + 1) * 1000, high: Math.exp(max), low: Math.exp(min) });
          x = next;
        }
        if (scanLiquidation({ side: "long", entryPrice: 1, leverage, maintenanceMarginPpm: 12_500n, feePpm: 500n, bars, fundingPayments: [] }).liquidated) hitsLong += 1;
        if (scanLiquidation({ side: "short", entryPrice: 1, leverage, maintenanceMarginPpm: 12_500n, feePpm: 500n, bars, fundingPayments: [] }).liquidated) hitsShort += 1;
      }
      const ratioLong = liquidationRatio("long", leverage, 12_500n, 500n);
      const ratioShort = liquidationRatio("short", leverage, 12_500n, 500n);
      const aLong = -Math.log(Number(ratioLong.n) / Number(ratioLong.d));
      const aShort = Math.log(Number(ratioShort.n) / Number(ratioShort.d));
      const exactLong = gbmLowerTouch(aLong, sigma, days, nu);
      const exactShort = gbmUpperTouch(aShort, sigma, days, nu);
      const se = (p: number): number => Math.sqrt((p * (1 - p)) / trials);
      expect(Math.abs(hitsLong / trials - exactLong)).toBeLessThan(4 * se(exactLong) + 0.002);
      expect(Math.abs(hitsShort / trials - exactShort)).toBeLessThan(4 * se(exactShort) + 0.002);
      const envelope = touchLiquidationProbability(leverage, sigma, days, 0.0125);
      // the arithmetic approximation of R3 does not know which side is touched: it falls between the two exact values
      expect(envelope).toBeGreaterThan(Math.min(exactLong, exactShort));
      expect(envelope).toBeLessThan(Math.max(exactLong, exactShort));
      expect(Math.abs(envelope / ((exactLong + exactShort) / 2) - 1)).toBeLessThan(0.08);
    });
  }

  test("LB13 the liquidation distance is (1/L - m - f) / (1 - m - f), close to R3 1/L - m, and the engine uses exactly the okx-derivatives ratio", () => {
    for (const leverage of [2, 3, 5, 10] as const) {
      const ratio = liquidationRatio("long", leverage, 12_500n, 500n);
      const distance = 1 - Number(ratio.n) / Number(ratio.d);
      expect(distance).toBeCloseTo((1 / leverage - 0.0125 - 0.0005) / (1 - 0.0125 - 0.0005), 12);
      expect(Math.abs(distance - (1 / leverage - 0.0125))).toBeLessThan(0.01);
      const scan = scanLiquidation({ side: "long", entryPrice: 1, leverage, maintenanceMarginPpm: 12_500n, feePpm: 500n, bars: [{ endMs: 1, high: 1, low: 1 }], fundingPayments: [] });
      expect(1 - scan.liquidationPrice).toBeCloseTo(distance, 12);
    }
  });
});

describe("LB12 epoch level behavior", () => {
  test("LB12 computeEpochOutcomes returns one outcome per eligible candidate, in the eligible order", () => {
    const long = candidate({ modality: "perp-directional", side: "long" });
    const short = candidate({ modality: "perp-directional", side: "short" });
    const epoch: Epoch = { id: `e${T}`, index: 0, t: T, candidates: [short, long], eligibleIds: [short.id, long.id], ineligible: [] };
    const source = new ReplaySource([...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002), FILLER], "replay:two");
    const outcomes = computeEpochOutcomes(epoch, source, PARAMS);
    expect(outcomes.map((o) => o.candidateId)).toEqual([short.id, long.id]);
  });

  test("LB12 computeOutcome is exposed for one candidate and a window and agrees with the epoch function", () => {
    const long = candidate({ modality: "perp-directional", side: "long" });
    const source = new ReplaySource([...candles(PERP, T + BAR, LONG_BARS), settledFunding(0.0002), FILLER], "replay:one");
    const window = source.future(T - COST_TABLE.fundingLookbackMs, exitFor(T, PARAMS) + COST_TABLE.captureLagMs);
    const direct = computeOutcome(long, `e${T}`, window, PARAMS);
    expect(direct).toEqual(computeEpochOutcomes(epochOf(long), source, PARAMS)[0] as Outcome);
  });

  test("LB12 the year used by the opportunity cost has 365 days", () => {
    expect(YEAR_MS).toBe(365 * 86_400_000);
  });
});
