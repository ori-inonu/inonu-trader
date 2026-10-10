import { expect, test } from "bun:test";
import { evaluateDirectional, type DirectionalEvaluation, type DirectionalLeg, type DirectionalLeverageRow } from "./directional.ts";
import { formatMicro, formatRat, ratInt } from "./decimal.ts";
import { SYNTHETIC_NOW_MS, syntheticInput } from "./fixture.ts";
import { parseDerivativesInput } from "./snapshot.ts";

// Golden values come from an independent exact-fraction computation of the SPEC formulas.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function run(mutate: (raw: Json) => void = () => {}, nowMs = SYNTHETIC_NOW_MS): DirectionalEvaluation {
  const raw = syntheticInput() as Json;
  mutate(raw);
  const parsed = parseDerivativesInput(raw);
  const result = evaluateDirectional(parsed.snapshot, parsed.evaluation, nowMs);
  if (result === null) throw new Error("expected a directional evaluation");
  return result;
}

const runShort = (mutate: (raw: Json) => void = () => {}, nowMs = SYNTHETIC_NOW_MS) => run((raw) => { raw.evaluation.directional.side = "short"; mutate(raw); }, nowMs);
const money = (value: bigint | null) => (value === null ? null : formatMicro(value));

function legView(leg: DirectionalLeg | null) {
  if (leg === null) return null;
  return {
    role: leg.role, avg: formatRat(leg.avgPrice, 10, "floor"), worst: leg.worstPrice === null ? null : formatRat(leg.worstPrice, 10, "floor"),
    touch: formatRat(leg.touchPrice, 10, "floor"), notional: formatRat(leg.notional, 10, "floor"), slippagePpm: leg.slippagePpm,
    execution: money(leg.executionCostMicro), feePpm: leg.feePpm, fee: money(leg.feeMicro),
  };
}

/** The liquidation price is shown rounded down for a short and up for a long. */
function rowView(entry: DirectionalLeverageRow, side: "long" | "short") {
  return {
    leverage: entry.leverage,
    initialMargin: money(entry.initialMarginMicro),
    capital: money(entry.capitalCommittedMicro),
    distance: entry.liquidation?.distancePpm ?? null,
    price: entry.liquidation === null ? null : formatRat(entry.liquidation.priceExact, 10, side === "long" ? "ceil" : "floor"),
    stress: (entry.stress ?? []).map((stress) => [stress.liquidated, money(stress.remainingMarginMicro), money(stress.lossMicro), money(stress.lossBeyondMarginMicro), stress.lossOfMarginPpm]),
    maxLoss: entry.maxLossOfMarginPpm,
    met: entry.riskLimitsMet,
  };
}

test("OKX-DERIV D13: a long perpetual is priced through the asks to open and the bids to close", () => {
  const result = run();
  expect(result.reasons).toEqual([]);
  expect(result.trade.side).toBe("long");
  expect(result.trade.coin).toEqual(ratInt(40));
  expect(legView(result.open)).toEqual({ role: "taker", avg: "1001.25", worst: "1001.3", touch: "1001.2", notional: "40050", slippagePpm: 50n, execution: "6.000000", feePpm: 400n, fee: "16.020000" });
  expect(legView(result.close)).toEqual({ role: "taker", avg: "1000.95", worst: "1000.9", touch: "1001", notional: "40038", slippagePpm: 50n, execution: "6.000000", feePpm: 400n, fee: "16.015200" });
  expect(money(result.executionCostMicro)).toBe("12.000000");
  expect(money(result.feesMicro)).toBe("32.035200");
});

test("OKX-DERIV D13: the loss at a flat price is execution, fees and the funding the long pays; paid funding grows with the worst print", () => {
  const { holdingCosts } = run();
  expect(holdingCosts.map((entry) => [entry.fundingId, entry.ratePpm, money(entry.fundingDragMicro), money(entry.totalMicro)])).toEqual([
    ["recent_average", 100n, "360.396000", "404.431200"],
    ["worst_observed", 130n, "468.514800", "512.550000"],
    ["zero", 0n, "0.000000", "44.035200"],
  ]);
});

test("OKX-DERIV D13/D8/D9: liquidation, margin and stress of the long at six leverages", () => {
  const view = run().leverageTable.map((entry) => rowView(entry, "long"));
  expect(view).toEqual([
    { leverage: 1, initialMargin: "40050.000000", capital: "40066.020000", distance: 1000000n, price: "0", stress: [[false, "36045.000000", "4005.000000", "0.000000", 100000n], [false, "30037.500000", "10012.500000", "0.000000", 250000n], [false, "20025.000000", "20025.000000", "0.000000", 500000n]], maxLoss: 500000n, met: true },
    { leverage: 2, initialMargin: "20025.000000", capital: "20041.020000", distance: 497790n, price: "502.8374849338", stress: [[false, "16020.000000", "4005.000000", "0.000000", 200000n], [false, "10012.500000", "10012.500000", "0.000000", 500000n], [true, "0.000000", "20025.000000", "0.000000", 1000000n]], maxLoss: 1000000n, met: true },
    { leverage: 3, initialMargin: "13350.000000", capital: "13366.020000", distance: 330387n, price: "670.4499799117", stress: [[false, "9345.000000", "4005.000000", "0.000000", 300000n], [false, "3337.500000", "10012.500000", "0.000000", 750000n], [true, "0.000000", "13350.000000", "6675.000000", 1000000n]], maxLoss: 1000000n, met: true },
    { leverage: 5, initialMargin: "8010.000000", capital: "8026.020000", distance: 196464n, price: "804.539975894", stress: [[false, "4005.000000", "4005.000000", "0.000000", 500000n], [true, "0.000000", "8010.000000", "0.000000", 1000000n], [true, "0.000000", "8010.000000", "12015.000000", 1000000n]], maxLoss: 1000000n, met: false },
    { leverage: 10, initialMargin: "4005.000000", capital: "4021.020000", distance: 96022n, price: "905.1074728807", stress: [[true, "0.000000", "4005.000000", "0.000000", 1000000n], [true, "0.000000", "4005.000000", "0.000000", 1000000n], [true, "0.000000", "4005.000000", "16020.000000", 1000000n]], maxLoss: 1000000n, met: false },
    { leverage: 20, initialMargin: "2002.500000", capital: "2018.520000", distance: 45801n, price: "955.3912213741", stress: [[true, "0.000000", "2002.500000", "0.000000", 1000000n], [true, "0.000000", "2002.500000", "0.000000", 1000000n], [true, "0.000000", "2002.500000", "18022.500000", 1000000n]], maxLoss: 1000000n, met: false },
  ]);
});

test("OKX-DERIV D13: a short perpetual is priced through the bids to open; funding it receives is never counted", () => {
  const result = runShort();
  expect(result.reasons).toEqual([]);
  expect(legView(result.open)).toEqual({ role: "taker", avg: "1000.95", worst: "1000.9", touch: "1001", notional: "40038", slippagePpm: 50n, execution: "6.000000", feePpm: 400n, fee: "16.015200" });
  expect(legView(result.close)).toEqual({ role: "taker", avg: "1001.25", worst: "1001.3", touch: "1001.2", notional: "40050", slippagePpm: 50n, execution: "6.000000", feePpm: 400n, fee: "16.020000" });
  // positive funding is income for a short; a risk-only view ignores credits, so the drag is zero in every scenario
  expect(result.holdingCosts.map((entry) => [entry.fundingId, entry.ratePpm, money(entry.fundingDragMicro), money(entry.totalMicro)])).toEqual([
    ["recent_average", 100n, "0.000000", "44.035200"],
    ["worst_observed", 70n, "0.000000", "44.035200"],
    ["zero", 0n, "0.000000", "44.035200"],
  ]);
  const view = result.leverageTable.map((entry) => rowView(entry, "short"));
  expect(view[2]).toEqual({ leverage: 3, initialMargin: "13346.000000", capital: "13362.015200", distance: 327492n, price: "1328.7534846674", stress: [[false, "9342.200000", "4003.800000", "0.000000", 300000n], [false, "3336.500000", "10009.500000", "0.000000", 750000n], [true, "0.000000", "13346.000000", "6673.000000", 1000000n]], maxLoss: 1000000n, met: true });
  expect(view[5]).toEqual({ leverage: 20, initialMargin: "2001.900000", capital: "2017.915200", distance: 45400n, price: "1046.3933691756", stress: [[true, "0.000000", "2001.900000", "0.000000", 1000000n], [true, "0.000000", "2001.900000", "0.000000", 1000000n], [true, "0.000000", "2001.900000", "18017.100000", 1000000n]], maxLoss: 1000000n, met: false });
  expect(view[0]?.stress).toEqual([[false, "36034.200000", "4003.800000", "0.000000", 100000n], [false, "30028.500000", "10009.500000", "0.000000", 250000n], [false, "20019.000000", "20019.000000", "0.000000", 500000n]]);
});

test("OKX-DERIV D13: a long that would receive funding does not get that credit either", () => {
  const result = run((raw) => {
    for (const entry of raw.snapshot.funding.history) entry.rate = "-0.00005";
    raw.snapshot.funding.currentRate = "-0.00005";
  });
  // the worst print for a long is the highest rate, which is negative here: the long receives and the drag is zero
  expect(result.holdingCosts.map((entry) => [entry.ratePpm, money(entry.fundingDragMicro), money(entry.totalMicro)])).toEqual([
    [-50n, "0.000000", "44.035200"], [-50n, "0.000000", "44.035200"], [0n, "0.000000", "44.035200"],
  ]);
  // while a short in the same market pays 180.198 over 90 settlements
  const short = runShort((raw) => {
    for (const entry of raw.snapshot.funding.history) entry.rate = "-0.00005";
    raw.snapshot.funding.currentRate = "-0.00005";
  });
  expect(short.holdingCosts.map((entry) => [entry.ratePpm, money(entry.fundingDragMicro), money(entry.totalMicro)])).toEqual([
    [-50n, "180.198000", "224.233200"], [-50n, "180.198000", "224.233200"], [0n, "0.000000", "44.035200"],
  ]);
});

test("OKX-DERIV D13: the directional branch exposes only risk: no profit, return, PnL, gain, yield or income key anywhere", () => {
  const forbidden = ["profit", "return", "pnl", "gain", "yield", "income", "apy", "apr", "earn", "net"];
  const walk = (value: unknown, path: string): string[] => {
    if (value === null || typeof value !== "object") return [];
    const found: string[] = [];
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.some((word) => key.toLowerCase().includes(word))) found.push(`${path}.${key}`);
      found.push(...walk(child, `${path}.${key}`));
    }
    return found;
  };
  expect(walk(run(), "long")).toEqual([]);
  expect(walk(runShort(), "short")).toEqual([]);
});

test("OKX-DERIV D13: a directional perpetual is never eligible, whatever the policy says", () => {
  const permissive = (raw: Json) => { raw.evaluation.policy = { maxLeverage: 125, minLiquidationDistancePpm: 0, minNetOnNotionalPpm: 0 }; };
  for (const result of [run(permissive), runShort(permissive), run(), runShort()]) {
    for (const entry of result.leverageTable) {
      expect(entry.verdict.status).not.toBe("eligible");
      expect(entry.verdict.reasons).toContain("model:directional_no_modeled_edge");
    }
  }
  const verdicts = run().leverageTable.map((entry) => [entry.verdict.status, entry.verdict.reasons, entry.riskLimitsMet]);
  expect(verdicts).toEqual([
    ["ineligible", ["model:directional_no_modeled_edge"], true],
    ["ineligible", ["model:directional_no_modeled_edge"], true],
    ["ineligible", ["model:directional_no_modeled_edge"], true],
    ["ineligible", ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor", "model:directional_no_modeled_edge"], false],
    ["ineligible", ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor", "model:directional_no_modeled_edge"], false],
    ["ineligible", ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor", "model:directional_no_modeled_edge"], false],
  ]);
  const aboveInstrument = run((raw) => { raw.evaluation.leverages = [60]; permissive(raw); });
  expect(aboveInstrument.leverageTable[0]?.verdict.reasons).toEqual(["limit:leverage_above_instrument_max", "model:directional_no_modeled_edge"]);
  expect(aboveInstrument.leverageTable[0]?.riskLimitsMet).toBe(false);
});

test("OKX-DERIV D13/D11: the leverage cap alone breaks the risk limits, even with a comfortable liquidation distance", () => {
  const result = run((raw) => { raw.evaluation.policy = { maxLeverage: 1 }; });
  expect(result.leverageTable.map((entry) => entry.riskLimitsMet)).toEqual([true, false, false, false, false, false]);
  expect(result.leverageTable[1]?.verdict.reasons).toEqual(["limit:leverage_above_cap", "model:directional_no_modeled_edge"]);
  expect(result.leverageTable[1]?.liquidation?.distancePpm).toBe(497790n);
});

test("OKX-DERIV D13/D1: the share of margin lost is rounded up, so 29.99999 percent is not shown as 29.9999", () => {
  // 401 contracts make the margin a non-terminating fraction: 40150.13 / 3 = 13383.376666...
  const three = run((raw) => { raw.evaluation.directional.contracts = "401"; }).leverageTable.find((entry) => entry.leverage === 3);
  expect(money(three?.initialMarginMicro ?? null)).toBe("13383.376667");
  expect(money(three?.stress?.[0]?.lossMicro ?? null)).toBe("4015.013000");
  // the exact ratio is 299999.99999 ppm: rounded up to 300000, never down to 299999
  expect(three?.stress?.[0]?.lossOfMarginPpm).toBe(300000n);
});

test("OKX-DERIV D13: unknown inputs stay unknown: no cost, margin table or verdict is filled with zero", () => {
  const noFees = run((raw) => { delete raw.snapshot.fees; });
  expect(noFees.reasons).toEqual(["unknown:fee_perp_taker"]);
  expect(noFees.feesMicro).toBeNull();
  expect(noFees.holdingCosts.every((entry) => entry.totalMicro === null)).toBe(true);
  for (const entry of noFees.leverageTable) {
    expect(entry.liquidation).toBeNull();
    expect(entry.stress).toBeNull();
    expect(entry.maxLossOfMarginPpm).toBeNull();
    expect(entry.riskLimitsMet).toBeNull();
    expect(entry.initialMarginMicro).not.toBeNull();
    expect(entry.verdict.reasons).toContain("unknown:fee_perp_taker");
  }
  const noMmr = run((raw) => { delete raw.snapshot.maintenanceMarginRate; });
  expect(noMmr.reasons).toEqual(["unknown:maintenance_margin_rate"]);
  expect(noMmr.leverageTable[0]?.liquidation).toBeNull();
  expect(noMmr.executionCostMicro).not.toBeNull();
  expect(noMmr.leverageTable[0]?.verdict).toEqual({ status: "ineligible", reasons: ["model:directional_no_modeled_edge", "unknown:maintenance_margin_rate"] });
});

test("OKX-DERIV D13: only the perpetual market matters: spot book, spot fees and spot lots are irrelevant", () => {
  const result = run((raw) => {
    raw.snapshot.books.spot.tsMs = 1;
    raw.snapshot.books.spot.asks = [];
    delete raw.snapshot.fees.spot;
    raw.snapshot.spot.lotSz = "0.3";
    raw.snapshot.perp.ctValCcy = "OTHER";
  });
  expect(result.reasons).toEqual([]);
  expect(result.leverageTable[0]?.liquidation).not.toBeNull();
});

test("OKX-DERIV D13/D3: depth is taken from the side the direction needs and a thin book is unavailable", () => {
  expect(run((raw) => { raw.snapshot.books.perp.asks = [["1001.2", "399"]]; }).reasons).toEqual(["depth:perp_open"]);
  expect(run((raw) => { raw.snapshot.books.perp.bids = [["1001.0", "399"]]; }).reasons).toEqual(["depth:perp_close"]);
  expect(runShort((raw) => { raw.snapshot.books.perp.bids = [["1001.0", "399"]]; }).reasons).toEqual(["depth:perp_open"]);
  expect(runShort((raw) => { raw.snapshot.books.perp.asks = [["1001.2", "399"]]; }).reasons).toEqual(["depth:perp_close"]);
  const thin = run((raw) => { raw.snapshot.books.perp.asks = [["1001.2", "399"]]; });
  expect(thin.open).toBeNull();
  expect(thin.leverageTable.every((entry) => entry.initialMarginMicro === null && entry.liquidation === null)).toBe(true);
  expect(run((raw) => { raw.snapshot.books.perp.asks = [["1000.5", "400"]]; }).reasons).toEqual(["book:crossed_perp"]);
});

test("OKX-DERIV D13/D11: staleness of the perpetual book, mark and funding applies; spot book timing does not", () => {
  expect(run(undefined, SYNTHETIC_NOW_MS + 57_001).reasons).toEqual(["stale:funding"]);
  expect(run(undefined, SYNTHETIC_NOW_MS + 600_000).reasons).toEqual(["stale:funding", "stale:mark", "stale:perp_book"]);
  expect(run(undefined, SYNTHETIC_NOW_MS - 2500).reasons).toEqual(["future:mark", "future:perp_book"]);
  expect(run((raw) => { raw.snapshot.funding.fundingTimeMs = SYNTHETIC_NOW_MS; raw.snapshot.funding.nextFundingTimeMs = SYNTHETIC_NOW_MS + 8 * 3_600_000; }).reasons).toEqual(["stale:funding_schedule"]);
  // book skew is a carry-only concern
  expect(run((raw) => { raw.snapshot.books.perp.tsMs = raw.snapshot.books.spot.tsMs - 9000; }).reasons).toEqual([]);
});

test("OKX-DERIV D13/D5: funding history problems make the funding-dependent costs unavailable but not the others", () => {
  const short = run((raw) => { raw.snapshot.funding.history = raw.snapshot.funding.history.slice(0, 2); });
  expect(short.reasons).toEqual(["funding:insufficient_history"]);
  expect(short.holdingCosts.map((entry) => [entry.fundingId, money(entry.totalMicro)])).toEqual([["recent_average", null], ["worst_observed", null], ["zero", "44.035200"]]);
  const invalid = run((raw) => { raw.snapshot.funding.nextFundingTimeMs = raw.snapshot.funding.fundingTimeMs + 3 * 3_600_000; });
  expect(invalid.reasons).toEqual(["funding:invalid_interval"]);
  expect(invalid.funding.schedule).toBeNull();
});

test("OKX-DERIV D13/D3/D4: roles are explicit per leg; a maker leg is at the mid with maker fees", () => {
  const result = run((raw) => { raw.evaluation.directional.roles = { open: "maker", close: "maker" }; });
  expect(result.reasons).toEqual([]);
  expect(legView(result.open)).toEqual({ role: "maker", avg: "1001.1", worst: null, touch: "1001.2", notional: "40044", slippagePpm: 0n, execution: "0.000000", feePpm: 100n, fee: "4.004400" });
  expect(money(result.executionCostMicro)).toBe("0.000000");
  expect(money(result.feesMicro)).toBe("8.008800");
  const missing = run((raw) => { raw.evaluation.directional.roles = { open: "maker", close: "taker" }; delete raw.snapshot.fees.perp.makerCost; });
  expect(missing.reasons).toEqual(["unknown:fee_perp_maker"]);
});

test("OKX-DERIV D2/D11: an inverse contract, a suspended market, bad sizes and access are reported", () => {
  expect(run((raw) => { raw.snapshot.perp.ctType = "inverse"; }).reasons).toEqual(["instrument:inverse_unsupported"]);
  expect(run((raw) => { raw.snapshot.perp.state = "suspend"; }).reasons).toEqual(["instrument:not_live"]);
  expect(run((raw) => { raw.evaluation.directional.contracts = "0.5"; }).reasons).toEqual(["size:perp_lot"]);
  expect(run((raw) => { raw.snapshot.perp.minSz = "1000"; }).reasons).toEqual(["size:perp_min"]);
  expect(run((raw) => { delete raw.snapshot.access; }).reasons).toEqual(["unknown:access_derivatives"]);
  const denied = run((raw) => { raw.snapshot.access = { derivatives: "operator_denied" }; });
  expect(denied.reasons).toEqual(["access:derivatives_denied"]);
  expect(denied.leverageTable[0]?.verdict.reasons).toEqual(["access:derivatives_denied", "model:directional_no_modeled_edge"]);
  const blocked = run((raw) => { raw.snapshot.perp.ctType = "inverse"; });
  expect(blocked.open).toBeNull();
  expect(blocked.close).toBeNull();
});

test("OKX-DERIV D13: there is nothing to evaluate when no directional section is requested", () => {
  const raw = syntheticInput() as Json;
  delete raw.evaluation.directional;
  const parsed = parseDerivativesInput(raw);
  expect(evaluateDirectional(parsed.snapshot, parsed.evaluation, SYNTHETIC_NOW_MS)).toBeNull();
});

test("OKX-DERIV D13/D14: the directional evaluation is deterministic and validates the clock", () => {
  const parsed = parseDerivativesInput(syntheticInput());
  const first = evaluateDirectional(parsed.snapshot, parsed.evaluation, SYNTHETIC_NOW_MS);
  expect(evaluateDirectional(parsed.snapshot, parsed.evaluation, SYNTHETIC_NOW_MS)).toEqual(first);
  for (const bad of [-1, 1.5, Number.NaN]) expect(() => evaluateDirectional(parsed.snapshot, parsed.evaluation, bad)).toThrow(RangeError);
});
