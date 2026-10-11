import { describe, expect, test } from "bun:test";
import { validateCaptureRecord, type CaptureRecord } from "./capture-format.ts";
import { CANDIDATE_DEFAULTS, buildEpoch, buildEpochCandidates, epochIdFor, type CandidateParams } from "./candidates.ts";
import { COST_TABLE } from "./outcomes.ts";
import { ReplaySource, SyntheticSource, syntheticConfig } from "./source.ts";
import { DAY_MS, HOUR_MS, roundTo, YEAR_MS, type LabCandidate } from "./types.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md sections 3.1 and 4. Titles start with the acceptance id (LB6, LB8).
// The hand-made fixture uses hourly bars so every feature can be checked by arithmetic.

const T0 = 1_800_000_000_000; // a multiple of 8 hours
const T = T0 + 28 * HOUR_MS; // not a settlement instant: the pending settlement is T0 + 32h
const SPOT = "SYNA-USDT";
const PERP = "SYNA-USDT-SWAP";

const PARAMS: CandidateParams = {
  stepMs: 6 * HOUR_MS,
  horizonMs: 24 * HOUR_MS,
  barMs: HOUR_MS,
  executionDelayMs: HOUR_MS,
  provenanceSource: "test",
  lookbackMs: 6 * HOUR_MS,
  minVolBars: 4,
  fundingSettlements: 3,
};

function rec(kind: CaptureRecord["kind"], t: number, inst: string, data: Record<string, unknown>): CaptureRecord {
  return validateCaptureRecord({ t, kind, inst, data });
}

/** Hourly candles whose closes are given, ending at T - 6h ... T (one close per hour). */
function hourlyCandles(inst: string, closes: readonly number[], lastEnd = T): CaptureRecord[] {
  return closes.map((close, i) => {
    const end = lastEnd - (closes.length - 1 - i) * HOUR_MS;
    const open = i === 0 ? close : (closes[i - 1] as number);
    return rec("candle", end, inst, {
      startMs: end - HOUR_MS,
      barMs: HOUR_MS,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
    });
  });
}

const SPOT_CLOSES = [100, 101, 100.5, 102, 103, 102.5, 104];
const PERP_CLOSES = [100.1, 101.2, 100.4, 102.3, 103.1, 102.8, 104.5];

function fixture(over: { drop?: (r: CaptureRecord) => boolean; extra?: CaptureRecord[] } = {}): CaptureRecord[] {
  const interval = 8 * HOUR_MS;
  const funding = (at: number, settleMs: number, rate: number) => rec("funding", at, PERP, { rate, settleMs, intervalMs: interval });
  const records: CaptureRecord[] = [
    ...hourlyCandles(SPOT, SPOT_CLOSES),
    ...hourlyCandles(PERP, PERP_CLOSES),
    rec("ticker", T, SPOT, { bid: 103.99, ask: 104.01, last: 104 }),
    rec("ticker", T, PERP, { bid: 104.48, ask: 104.52, last: 104.5 }),
    funding(T0, T0, 0.0001),
    funding(T0 + 8 * HOUR_MS, T0 + 8 * HOUR_MS, 0.00012),
    funding(T0 + 16 * HOUR_MS, T0 + 16 * HOUR_MS, 0.00008),
    funding(T0 + 24 * HOUR_MS, T0 + 24 * HOUR_MS, 0.0001),
    funding(T0 + 24 * HOUR_MS, T0 + 32 * HOUR_MS, 0.00011), // announcement of the pending settlement
    ...[1000, 1010, 1020, 1015, 1030, 1050, 1100].map((oi, i) => rec("oi", T - (6 - i) * HOUR_MS, PERP, { oi })),
  ];
  const kept = over.drop === undefined ? records : records.filter((r) => !over.drop!(r));
  return [...kept, ...(over.extra ?? [])];
}

function build(records: CaptureRecord[], params: CandidateParams = PARAMS, t = T) {
  const source = new ReplaySource(records, "replay:fixture");
  return buildEpochCandidates(source.asOf(t), params);
}

function byId(candidates: readonly LabCandidate[], id: string): LabCandidate {
  const found = candidates.find((c) => c.id === id);
  if (found === undefined) throw new Error(`candidate ${id} not found; have ${candidates.map((c) => c.id).join(", ")}`);
  return found;
}

describe("LB8 candidate set and hand-checked features", () => {
  const built = build(fixture());

  test("LB8 the defaults are the documented ones", () => {
    expect(CANDIDATE_DEFAULTS.lookbackMs).toBe(DAY_MS);
    expect(CANDIDATE_DEFAULTS.minVolBars).toBe(20);
    expect(CANDIDATE_DEFAULTS.fundingSettlements).toBe(6);
    expect(CANDIDATE_DEFAULTS.maxQuoteAgeMs).toBe(120_000);
  });

  test("LB8 one asset yields spot long, perp long, perp short and carry, sorted by id, all eligible", () => {
    expect(built.candidates.map((c) => c.id)).toEqual([
      `funding-carry.${PERP}.neutral`,
      `perp-directional.${PERP}.long`,
      `perp-directional.${PERP}.short`,
      `spot-momentum.${SPOT}.long`,
    ]);
    expect(built.eligibleIds).toEqual(built.candidates.map((c) => c.id));
    expect(built.ineligible).toEqual([]);
  });

  test("LB8 identity fields: time, horizon, validity, venue, provenance, hedge", () => {
    for (const c of built.candidates) {
      expect(c.observedAtMs).toBe(T);
      expect(c.horizonMs).toBe(PARAMS.horizonMs);
      expect(c.validUntilMs).toBe(T + PARAMS.stepMs);
      expect(c.venue).toBe("okx");
      expect(c.provenance).toEqual({ source: "test", externalAccessObserved: false });
    }
    expect(byId(built.candidates, `funding-carry.${PERP}.neutral`).hedgeInstrument).toBe(SPOT);
    expect(byId(built.candidates, `funding-carry.${PERP}.neutral`).side).toBe("neutral");
    expect(byId(built.candidates, `perp-directional.${PERP}.long`).hedgeInstrument).toBeNull();
    expect(byId(built.candidates, `spot-momentum.${SPOT}.long`).instrument).toBe(SPOT);
  });

  test("LB8 return over the lookback, from the closes known at the decision (hand computed: 104 against 100 is 400 bps)", () => {
    expect(byId(built.candidates, `spot-momentum.${SPOT}.long`).features.retLookbackBps).toBeCloseTo(400, 6);
    const perpRet = (104.5 / 100.1 - 1) * 1e4;
    expect(byId(built.candidates, `perp-directional.${PERP}.long`).features.retLookbackBps).toBeCloseTo(perpRet, 5);
    expect(byId(built.candidates, `perp-directional.${PERP}.short`).features.retLookbackBps).toBe(byId(built.candidates, `perp-directional.${PERP}.long`).features.retLookbackBps as number);
  });

  test("LB8 volatility over the horizon: sample sd of the hourly log returns times sqrt(horizon / bar)", () => {
    const returns = SPOT_CLOSES.slice(1).map((c, i) => Math.log(c / (SPOT_CLOSES[i] as number)));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sd = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1));
    expect(byId(built.candidates, `spot-momentum.${SPOT}.long`).features.volHorizonBps).toBeCloseTo(sd * Math.sqrt(24) * 1e4, 4);
  });

  test("LB8 spread and basis from the freshest quotes", () => {
    const spotSpread = (0.02 / 104) * 1e4;
    const perpSpread = (0.04 / 104.5) * 1e4;
    expect(byId(built.candidates, `spot-momentum.${SPOT}.long`).features.spreadBps).toBeCloseTo(spotSpread, 5);
    expect(byId(built.candidates, `perp-directional.${PERP}.long`).features.spreadBps).toBeCloseTo(perpSpread, 5);
    const carry = byId(built.candidates, `funding-carry.${PERP}.neutral`);
    expect(carry.features.spreadBps).toBeCloseTo(spotSpread + perpSpread, 5);
    expect(carry.features.basisBps).toBeCloseTo(((104.5 - 104) / 104) * 1e4, 5);
  });

  test("LB8 funding features in bps per settlement: next announced, last settled, mean and min of the last settlements", () => {
    const carry = byId(built.candidates, `funding-carry.${PERP}.neutral`);
    expect(carry.features.fundingNextBps).toBeCloseTo(1.1, 6);
    expect(carry.features.fundingLastBps).toBeCloseTo(1, 6);
    expect(carry.features.fundingMeanBps).toBeCloseTo(1, 6);
    expect(carry.features.fundingMinBps).toBeCloseTo(0.8, 6);
    expect(carry.features.settlementsInHorizon).toBe(3);
  });

  test("LB8 carry economics: conservative gross is min(min, next) times the settlements, net takes off costs and the cash opportunity", () => {
    const carry = byId(built.candidates, `funding-carry.${PERP}.neutral`);
    expect(carry.features.carryGrossBps).toBeCloseTo(0.8 * 3, 6);
    const costBps = 30 + 4 + (0.02 / 104) * 1e4 + (0.04 / 104.5) * 1e4;
    expect(carry.features.costBps).toBeCloseTo(costBps, 5);
    const opportunityBps = 0.0405 * (PARAMS.horizonMs / YEAR_MS) * 2 * 1e4;
    expect(carry.features.carryNetBps).toBeCloseTo(2.4 - costBps - opportunityBps, 5);
    expect(carry.costs).toEqual({ feeBps: 30, spreadBps: roundTo((0.02 / 104) * 1e4 + (0.04 / 104.5) * 1e4, 6), slippageBps: 4, fixedUsd: 0, notionalUsd: COST_TABLE.notionalUsd, complete: true });
  });

  test("LB8 open interest change over the lookback", () => {
    expect(byId(built.candidates, `perp-directional.${PERP}.long`).features.oiChangeBps).toBeCloseTo(1000, 6);
  });

  test("LB8 features are rounded to six decimals so the journal shows exactly what the policies saw", () => {
    for (const c of built.candidates) {
      for (const value of Object.values(c.features)) {
        if (value !== null) expect(value).toBe(roundTo(value, 6));
      }
    }
  });

  test("LB8 the planted score appears only when the source provides it", () => {
    expect("signalZ" in byId(built.candidates, `perp-directional.${PERP}.long`).features).toBe(false);
    const source = new SyntheticSource(syntheticConfig({ seed: 3, epochs: 6, plantedEdgeBps: 20 }));
    const t = source.epochTimes()[2] as number;
    const planted = buildEpochCandidates(source.asOf(t), { ...CANDIDATE_DEFAULTS, stepMs: source.config.stepMs, horizonMs: source.config.horizonMs, barMs: source.config.barMs, executionDelayMs: source.config.executionDelayMs, provenanceSource: source.id });
    const long = planted.candidates.find((c) => c.id === "perp-directional.SYNA-USDT-SWAP.long") as LabCandidate;
    expect(typeof long.features.signalZ).toBe("number");
    expect(long.features.signalZ).toBe(roundTo(source.asOf(t).extras["signalZ:SYNA-USDT-SWAP"] as number, 6));
  });
});

describe("LB8 unknown is null, never zero, and ineligible candidates are kept out", () => {
  test("LB8 too little history leaves the return and the volatility null", () => {
    const short = build(fixture({ drop: (r) => r.kind === "candle" && r.t < T - 2 * HOUR_MS }));
    const spot = byId(short.candidates, `spot-momentum.${SPOT}.long`);
    expect(spot.features.retLookbackBps).toBeNull();
    expect(spot.features.volHorizonBps).toBeNull();
    expect(spot.features.retLookbackBps).not.toBe(0);
  });

  test("LB8 fewer settled funding records than the lookback leaves mean and min null but keeps what is known", () => {
    const sparse = build(fixture({ drop: (r) => r.kind === "funding" && r.data.settleMs < T0 + 16 * HOUR_MS }));
    const carry = byId(sparse.candidates, `funding-carry.${PERP}.neutral`);
    expect(carry.features.fundingMeanBps).toBeNull();
    expect(carry.features.fundingMinBps).toBeNull();
    expect(carry.features.carryGrossBps).toBeNull();
    expect(carry.features.carryNetBps).toBeNull();
    expect(carry.features.fundingLastBps).toBeCloseTo(1, 6);
    expect(carry.features.fundingNextBps).toBeCloseTo(1.1, 6);
  });

  test("LB8 carry without a usable funding history is ineligible (unknown:funding) while the directional candidates stay eligible", () => {
    const none = build(fixture({ drop: (r) => r.kind === "funding" }));
    expect(none.eligibleIds).toEqual([`perp-directional.${PERP}.long`, `perp-directional.${PERP}.short`, `spot-momentum.${SPOT}.long`]);
    expect(none.ineligible).toEqual([{ id: `funding-carry.${PERP}.neutral`, reasons: ["unknown:funding"] }]);
    const carry = byId(none.candidates, `funding-carry.${PERP}.neutral`);
    expect(carry.features.fundingNextBps).toBeNull();
    expect(carry.features.settlementsInHorizon).toBeNull();
  });

  test("LB8 a missing spot quote makes the spot and the carry costs unknown: both ineligible, the perp-only candidates are not", () => {
    const noSpot = build(fixture({ drop: (r) => r.kind === "ticker" && r.inst === SPOT }));
    expect(noSpot.eligibleIds).toEqual([`perp-directional.${PERP}.long`, `perp-directional.${PERP}.short`]);
    expect(noSpot.ineligible.map((i) => i.id)).toEqual([`funding-carry.${PERP}.neutral`, `spot-momentum.${SPOT}.long`]);
    for (const entry of noSpot.ineligible) expect(entry.reasons).toContain("costs-unknown:spread");
    const spot = byId(noSpot.candidates, `spot-momentum.${SPOT}.long`);
    expect(spot.costs.spreadBps).toBeNull();
    expect(spot.costs.complete).toBe(false);
    expect(spot.features.spreadBps).toBeNull();
    expect(spot.features.costBps).toBeNull();
  });

  test("LB8 a missing perp quote makes every perp candidate ineligible", () => {
    const noPerp = build(fixture({ drop: (r) => r.kind === "ticker" && r.inst === PERP }));
    expect(noPerp.eligibleIds).toEqual([`spot-momentum.${SPOT}.long`]);
    expect(noPerp.ineligible.map((i) => i.id)).toEqual([`funding-carry.${PERP}.neutral`, `perp-directional.${PERP}.long`, `perp-directional.${PERP}.short`]);
  });

  test("LB8 a stale quote counts as unknown: older than the maximum age, the spread is null", () => {
    const stale = build(fixture({ drop: (r) => r.kind === "ticker" && r.inst === SPOT, extra: [rec("ticker", T - 121_000, SPOT, { bid: 103.99, ask: 104.01, last: 104 })] }));
    expect(byId(stale.candidates, `spot-momentum.${SPOT}.long`).costs.complete).toBe(false);
    const fresh = build(fixture({ drop: (r) => r.kind === "ticker" && r.inst === SPOT, extra: [rec("ticker", T - 120_000, SPOT, { bid: 103.99, ask: 104.01, last: 104 })] }));
    expect(byId(fresh.candidates, `spot-momentum.${SPOT}.long`).costs.complete).toBe(true);
  });

  test("LB8 missing open interest and missing perp quote leave the corresponding features null", () => {
    const noOi = build(fixture({ drop: (r) => r.kind === "oi" }));
    expect(byId(noOi.candidates, `perp-directional.${PERP}.long`).features.oiChangeBps).toBeNull();
    const noPerpQuote = build(fixture({ drop: (r) => r.kind === "ticker" && r.inst === PERP }));
    expect(byId(noPerpQuote.candidates, `funding-carry.${PERP}.neutral`).features.basisBps).toBeNull();
  });

  test("LB8 an ineligible candidate carries null, never zero, in every figure that depends on the missing quote", () => {
    const noSpot = build(fixture({ drop: (r) => (r.kind === "ticker" && r.inst === SPOT) || r.kind === "oi" }));
    const incomplete = noSpot.candidates.filter((c) => !c.costs.complete);
    expect(incomplete.map((c) => c.id)).toEqual([`funding-carry.${PERP}.neutral`, `spot-momentum.${SPOT}.long`]);
    for (const c of incomplete) {
      expect(c.costs.spreadBps).toBeNull();
      expect(c.features.costBps).toBeNull();
      expect(c.features.spreadBps).toBeNull();
    }
    const carry = byId(noSpot.candidates, `funding-carry.${PERP}.neutral`);
    expect(carry.features.carryNetBps).toBeNull();
    expect(carry.features.oiChangeBps).toBeNull();
    expect(carry.features.carryGrossBps).toBeCloseTo(2.4, 6);
  });

  test("LB8 before any data exists there are no candidates at all", () => {
    const source = new ReplaySource(fixture(), "replay:fixture");
    const early = buildEpochCandidates(source.asOf(T0 - DAY_MS), PARAMS);
    expect(early.candidates).toEqual([]);
    expect(early.eligibleIds).toEqual([]);
  });
});

describe("LB6 candidates are built from the past only", () => {
  const config = syntheticConfig({ seed: 11, epochs: 16, stepMs: 6 * HOUR_MS, horizonMs: 24 * HOUR_MS });
  const source = new SyntheticSource(config);
  const params: CandidateParams = { ...CANDIDATE_DEFAULTS, stepMs: config.stepMs, horizonMs: config.horizonMs, barMs: config.barMs, executionDelayMs: config.executionDelayMs, provenanceSource: source.id };

  function poisonedAfter(cut: number): ReplaySource {
    const mutated = source.records.map((record): CaptureRecord => {
      if (record.t <= cut) return record;
      if (record.kind === "candle") {
        const d = record.data;
        return validateCaptureRecord({ t: record.t, kind: "candle", inst: record.inst, data: { startMs: d.startMs, barMs: d.barMs, open: d.open * 7, high: d.high * 7, low: d.low * 7, close: d.close * 7 } });
      }
      if (record.kind === "ticker") return validateCaptureRecord({ t: record.t, kind: "ticker", inst: record.inst, data: { bid: record.data.bid * 7, ask: record.data.ask * 7, last: record.data.last * 7 } });
      if (record.kind === "funding") return validateCaptureRecord({ t: record.t, kind: "funding", inst: record.inst, data: { rate: -0.04, settleMs: record.data.settleMs, intervalMs: record.data.intervalMs } });
      if (record.kind === "oi") return validateCaptureRecord({ t: record.t, kind: "oi", inst: record.inst, data: { oi: record.data.oi * 9 } });
      return record;
    });
    return new ReplaySource(mutated, "replay:poisoned");
  }

  test("LB6 changing every record after t to absurd values does not change a single candidate, feature or cost at t", () => {
    for (const index of [0, 3, 7, 12, 15]) {
      const t = source.epochTimes()[index] as number;
      const clean = buildEpochCandidates(source.asOf(t), params);
      const poisoned = buildEpochCandidates(poisonedAfter(t).asOf(t), params);
      expect(JSON.stringify(poisoned)).toBe(JSON.stringify(clean));
      expect(clean.candidates.length).toBe(8);
    }
  });

  test("LB6 control: poisoning a record at or before t does change the candidates", () => {
    const t = source.epochTimes()[5] as number;
    const clean = buildEpochCandidates(source.asOf(t), params);
    const altered = buildEpochCandidates(poisonedAfter(t - 30 * 60_000).asOf(t), params);
    expect(JSON.stringify(altered)).not.toBe(JSON.stringify(clean));
  });

  test("LB6 at mid-run epochs of the synthetic source every candidate is eligible with complete costs", () => {
    const t = source.epochTimes()[6] as number;
    const built = buildEpochCandidates(source.asOf(t), params);
    expect(built.ineligible).toEqual([]);
    expect(built.eligibleIds.length).toBe(8);
    for (const c of built.candidates) expect(c.costs.complete).toBe(true);
  });

  test("LB6 buildEpoch wraps the candidates with the id e<t>, the index and the eligible lists", () => {
    const t = source.epochTimes()[2] as number;
    const epoch = buildEpoch(source.asOf(t), 2, params);
    expect(epoch.id).toBe(epochIdFor(t));
    expect(epoch.id).toBe(`e${t}`);
    expect(epoch.index).toBe(2);
    expect(epoch.t).toBe(t);
    expect(epoch.candidates.length).toBe(8);
    expect(epoch.eligibleIds.length).toBe(8);
  });
});
