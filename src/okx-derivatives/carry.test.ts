import { expect, test } from "bun:test";
import { BASIS_SCENARIOS, CONSERVATIVE_SCENARIO_ID, evaluateCarry, type CarryEvaluation, type CarryLeg, type CarryLeverageRow } from "./carry.ts";
import { formatMicro, formatRat, parseDecimal, ratInt } from "./decimal.ts";
import { SYNTHETIC_NOW_MS, syntheticInput } from "./fixture.ts";
import { FUNDING_SCENARIOS } from "./funding.ts";
import { parseDerivativesInput } from "./snapshot.ts";

// Golden values below come from an independent exact-fraction computation of the SPEC formulas
// (Python fractions), not from this implementation.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

function run(mutate: (raw: Json) => void = () => {}, nowMs = SYNTHETIC_NOW_MS): CarryEvaluation {
  const raw = syntheticInput() as Json;
  mutate(raw);
  const parsed = parseDerivativesInput(raw);
  return evaluateCarry(parsed.snapshot, parsed.evaluation, nowMs);
}

const money = (value: bigint | null) => (value === null ? null : formatMicro(value));

function row(result: CarryEvaluation, leverage: number): CarryLeverageRow {
  const found = result.leverageTable.find((candidate) => candidate.leverage === leverage);
  if (found === undefined) throw new Error(`no row for ${leverage}x`);
  return found;
}

function legView(leg: CarryLeg | null) {
  if (leg === null) return null;
  return {
    role: leg.role,
    avg: formatRat(leg.avgPrice, 10, "floor"),
    worst: leg.worstPrice === null ? null : formatRat(leg.worstPrice, 10, "floor"),
    touch: formatRat(leg.touchPrice, 10, "floor"),
    notional: formatRat(leg.notional, 10, "floor"),
    slippagePpm: leg.slippagePpm,
    execution: money(leg.executionCostMicro),
    feePpm: leg.feePpm,
    fee: money(leg.feeMicro),
  };
}

test("OKX-DERIV D3/D4: the four legs of the synthetic carry match the independent exact computation", () => {
  const result = run();
  expect(result.reasons).toEqual([]);
  expect(result.trade.coin).toEqual(ratInt(40));
  expect(result.trade.coinCcy).toBe("SYN");
  expect(result.trade.quoteCcy).toBe("USDT");
  expect(result.trade.holdingSettlements).toBe(90);
  expect(legView(result.legs.spotOpen)).toEqual({ role: "taker", avg: "1000.125", worst: "1000.2", touch: "1000.1", notional: "40005", slippagePpm: 25n, execution: "5.000000", feePpm: 700n, fee: "28.003500" });
  expect(legView(result.legs.spotClose)).toEqual({ role: "taker", avg: "999.875", worst: "999.8", touch: "999.9", notional: "39995", slippagePpm: 26n, execution: "5.000000", feePpm: 700n, fee: "27.996500" });
  expect(legView(result.legs.perpOpen)).toEqual({ role: "taker", avg: "1000.95", worst: "1000.9", touch: "1001", notional: "40038", slippagePpm: 50n, execution: "6.000000", feePpm: 400n, fee: "16.015200" });
  expect(legView(result.legs.perpClose)).toEqual({ role: "taker", avg: "1001.25", worst: "1001.3", touch: "1001.2", notional: "40050", slippagePpm: 50n, execution: "6.000000", feePpm: 400n, fee: "16.020000" });
  expect(money(result.flatCostsMicro)).toBe("110.035200");
});

test("OKX-DERIV D6: the entry basis is in ppm and the funding value uses the mark price", () => {
  const result = run();
  expect(result.basis).toEqual({ spotMid: ratInt(1000), perpMid: dec("1001.1"), entryBasisPpm: 1100n });
  expect(result.funding.markPx).toEqual(dec("1001.1"));
  expect(result.funding.valuePerSettlement).toEqual(ratInt(40044));
});

test("OKX-DERIV D5: funding schedule, interval and the three scenario rates and flows", () => {
  const { funding } = run();
  expect(funding.intervalHours).toBe(8);
  expect(funding.schedule).toEqual({ firstMs: 1_800_028_800_000, lastMs: 1_802_592_000_000 });
  expect(funding.historyCount).toBe(9);
  expect(funding.historyMaxAbsRatePpm).toBe(130n);
  expect(funding.currentRatePpm).toBe(100n);
  expect(funding.scenarios.map((scenario) => [scenario.id, scenario.ratePpm, money(scenario.flowMicro)])).toEqual([
    ["recent_average", 100n, "360.396000"],
    ["worst_observed", 70n, "252.277200"],
    ["zero", 0n, "0.000000"],
  ]);
  expect(FUNDING_SCENARIOS).toEqual(["recent_average", "worst_observed", "zero"]);
  expect(BASIS_SCENARIOS).toEqual(["flat", "converge", "adverse"]);
});

test("OKX-DERIV D6/D7: nine scenarios of funding x basis with the exact components and net", () => {
  const result = run();
  const expected: Record<string, [string, string, string, string]> = {
    // [funding, basis cost, fees, net]; execution cost is 22.000000 in every scenario
    "recent_average|flat": ["360.396000", "0.000000", "88.035200", "250.360800"],
    "recent_average|converge": ["360.396000", "-44.000000", "88.035200", "294.360800"],
    "recent_average|adverse": ["360.396000", "80.000000", "88.067200", "170.328800"],
    "worst_observed|flat": ["252.277200", "0.000000", "88.035200", "142.242000"],
    "worst_observed|converge": ["252.277200", "-44.000000", "88.035200", "186.242000"],
    "worst_observed|adverse": ["252.277200", "80.000000", "88.067200", "62.210000"],
    "zero|flat": ["0.000000", "0.000000", "88.035200", "-110.035200"],
    "zero|converge": ["0.000000", "-44.000000", "88.035200", "-66.035200"],
    "zero|adverse": ["0.000000", "80.000000", "88.067200", "-190.067200"],
  };
  expect(result.scenarios.map((scenario) => scenario.id)).toEqual(Object.keys(expected));
  for (const scenario of result.scenarios) {
    const want = expected[scenario.id] as [string, string, string, string];
    expect(scenario.components).not.toBeNull();
    if (scenario.components === null) continue;
    expect([
      money(scenario.components.fundingMicro), money(scenario.components.basisCostMicro), money(scenario.components.feesMicro), money(scenario.netMicro),
    ]).toEqual(want);
    expect(money(scenario.components.executionCostMicro)).toBe("22.000000");
    // the net is exactly the sum of the displayed integer components
    expect(scenario.netMicro).toBe(scenario.components.fundingMicro - scenario.components.executionCostMicro - scenario.components.basisCostMicro - scenario.components.feesMicro);
  }
});

test("OKX-DERIV D6: the conservative scenario is worst observed funding with an adverse basis, and convergence is not credited to it", () => {
  const result = run();
  expect(CONSERVATIVE_SCENARIO_ID).toBe("worst_observed|adverse");
  expect(result.conservative.scenarioId).toBe("worst_observed|adverse");
  expect(money(result.conservative.netMicro)).toBe("62.210000");
  expect(result.conservative.netOnNotionalPpm).toBe(1553n);
  const net = (id: string) => result.scenarios.find((scenario) => scenario.id === id)?.netMicro ?? null;
  const conservative = net("worst_observed|adverse");
  const convergence = net("worst_observed|converge");
  expect(conservative !== null && convergence !== null && conservative < convergence).toBe(true);
});

test("OKX-DERIV D10: break-even settlements and hours per funding scenario, null when funding does not repay costs", () => {
  const { breakEven } = run();
  expect(breakEven).toEqual([
    { id: "recent_average", settlements: 28n, hours: 224n },
    { id: "worst_observed", settlements: 40n, hours: 320n },
    { id: "zero", settlements: null, hours: null },
  ]);
});

test("OKX-DERIV D12: the same carry at six leverages shows capital, return, distance, liquidations and verdicts side by side", () => {
  const result = run();
  expect(result.leverageTable.map((entry) => entry.leverage)).toEqual([1, 2, 3, 5, 10, 20]);
  const view = result.leverageTable.map((entry) => ({
    initialMargin: money(entry.initialMarginMicro),
    capital: money(entry.capitalMicro),
    distance: entry.liquidation?.distancePpm ?? null,
    conservativeReturn: entry.returnsPpm[CONSERVATIVE_SCENARIO_ID] ?? null,
    averageFlatReturn: entry.returnsPpm["recent_average|flat"] ?? null,
    maxDrawdown: entry.maxDrawdownPpm,
    liquidatedShocks: entry.shocksLiquidated,
    status: entry.verdict.status,
  }));
  expect(view).toEqual([
    { initialMargin: "40038.000000", capital: "80087.018700", distance: 991238n, conservativeReturn: 776n, averageFlatReturn: 3126n, maxDrawdown: 1580n, liquidatedShocks: 0, status: "eligible" },
    { initialMargin: "20019.000000", capital: "60068.018700", distance: 493428n, conservativeReturn: 1035n, averageFlatReturn: 4167n, maxDrawdown: 335105n, liquidatedShocks: 1, status: "eligible" },
    { initialMargin: "13346.000000", capital: "53395.018700", distance: 327492n, conservativeReturn: 1165n, averageFlatReturn: 4688n, maxDrawdown: 252010n, liquidatedShocks: 1, status: "eligible" },
    { initialMargin: "8007.600000", capital: "48056.618700", distance: 194743n, conservativeReturn: 1294n, averageFlatReturn: 5209n, maxDrawdown: 168919n, liquidatedShocks: 2, status: "ineligible" },
    { initialMargin: "4003.800000", capital: "44052.818700", distance: 95181n, conservativeReturn: 1412n, averageFlatReturn: 5683n, maxDrawdown: 93385n, liquidatedShocks: 3, status: "ineligible" },
    { initialMargin: "2001.900000", capital: "42050.918700", distance: 45400n, conservativeReturn: 1479n, averageFlatReturn: 5953n, maxDrawdown: 50224n, liquidatedShocks: 3, status: "ineligible" },
  ]);
  expect(row(result, 1).verdict.reasons).toEqual([]);
  expect(row(result, 3).verdict.reasons).toEqual([]);
  for (const leverage of [5, 10, 20]) {
    expect(row(result, leverage).verdict).toEqual({ status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor"] });
  }
  const prices = result.leverageTable.map((entry) => (entry.liquidation === null ? null : formatRat(entry.liquidation.priceExact, 10, "floor")));
  expect(prices).toEqual(["1993.1302270011", "1494.8476702508", "1328.7534846674", "1195.8781362007", "1096.2216248506", "1046.3933691756"]);
});

test("OKX-DERIV D7: returns of all nine scenarios at 3x are floored, so losses are never understated", () => {
  const entry = row(run(), 3);
  expect(entry.returnsPpm).toEqual({
    "recent_average|flat": 4688n, "recent_average|converge": 5512n, "recent_average|adverse": 3189n,
    "worst_observed|flat": 2663n, "worst_observed|converge": 3488n, "worst_observed|adverse": 1165n,
    "zero|flat": -2061n, "zero|converge": -1237n, "zero|adverse": -3560n,
  });
  expect(row(run(), 1).returnsPpm["zero|flat"]).toBe(-1374n);
});

test("OKX-DERIV D9: stress rows at 3x keep the margin on 10 and 25 percent and lose it on a 50 percent gap", () => {
  const stress = row(run(), 3).stress;
  expect(stress).not.toBeNull();
  if (stress === null) return;
  expect(stress.map((entry) => entry.id)).toEqual(["move_100000ppm", "move_250000ppm", "gap_500000ppm"]);
  const view = stress.map((entry) => ({
    liquidated: entry.liquidated, hedgeBroken: entry.hedgeBroken, remaining: money(entry.remainingMarginMicro),
    perpLeg: money(entry.perpLegPnlMicro), spot: money(entry.spotPnlMicro), credited: money(entry.creditedPnlMicro),
    afterCosts: money(entry.pnlAfterCostsMicro), beyond: money(entry.lossBeyondMarginMicro), drawdown: entry.drawdownPpm,
  }));
  expect(view).toEqual([
    { liquidated: false, hedgeBroken: false, remaining: "9342.200000", perpLeg: "-4003.800000", spot: "4000.500000", credited: "-3.300000", afterCosts: "-113.335200", beyond: "0.000000", drawdown: 2123n },
    { liquidated: false, hedgeBroken: false, remaining: "3336.500000", perpLeg: "-10009.500000", spot: "10001.250000", credited: "-8.250000", afterCosts: "-118.285200", beyond: "0.000000", drawdown: 2216n },
    { liquidated: true, hedgeBroken: true, remaining: "0.000000", perpLeg: "-13346.000000", spot: "20002.500000", credited: "-13346.000000", afterCosts: "-13456.035200", beyond: "6673.000000", drawdown: 252010n },
  ]);
});

test("OKX-DERIV D9: after a liquidation the unrealized spot gain is not credited, so 20x cannot look riskless", () => {
  const stress = row(run(), 20).stress;
  expect(stress).not.toBeNull();
  if (stress === null) return;
  expect(stress.every((entry) => entry.liquidated && entry.hedgeBroken)).toBe(true);
  expect(stress.map((entry) => money(entry.creditedPnlMicro))).toEqual(["-2001.900000", "-2001.900000", "-2001.900000"]);
  expect(stress.map((entry) => entry.drawdownPpm)).toEqual([50224n, 50224n, 50224n]);
  // the spot leg is up 10, 25 and 50 percent, and that gain is exactly what is withheld
  expect(stress.map((entry) => money(entry.spotPnlMicro))).toEqual(["4000.500000", "10001.250000", "20002.500000"]);
  expect(stress.map((entry) => money(entry.lossBeyondMarginMicro))).toEqual(["0.000000", "0.000000", "18017.100000"]);
  // the unlevered 1x carry survives every shock with the hedge intact
  const unlevered = row(run(), 1).stress ?? [];
  expect(unlevered.every((entry) => !entry.liquidated && !entry.hedgeBroken)).toBe(true);
});

test("OKX-DERIV D12: leverage changes capital, return and risk but never the profit in quote", () => {
  const result = run();
  // every row divides the very same net by a different capital: the profit in quote is not a function of leverage
  const floorDiv = (numerator: bigint, denominator: bigint) => {
    const quotient = numerator / denominator;
    return numerator % denominator !== 0n && numerator < 0n ? quotient - 1n : quotient;
  };
  for (const entry of result.leverageTable) {
    for (const scenario of result.scenarios) {
      expect(entry.returnsPpm[scenario.id]).toBe(floorDiv((scenario.netMicro as bigint) * 1_000_000n, entry.capitalMicro as bigint));
    }
  }
  const capitals = result.leverageTable.map((entry) => entry.capitalMicro as bigint);
  const distances = result.leverageTable.map((entry) => (entry.liquidation as { distancePpm: bigint }).distancePpm);
  const returns = result.leverageTable.map((entry) => entry.returnsPpm[CONSERVATIVE_SCENARIO_ID] as bigint);
  const liquidated = result.leverageTable.map((entry) => entry.shocksLiquidated as number);
  for (let index = 1; index < capitals.length; index += 1) {
    expect((capitals[index] as bigint) < (capitals[index - 1] as bigint)).toBe(true);
    expect((distances[index] as bigint) < (distances[index - 1] as bigint)).toBe(true);
    expect((returns[index] as bigint) >= (returns[index - 1] as bigint)).toBe(true);
    expect((liquidated[index] as number) >= (liquidated[index - 1] as number)).toBe(true);
  }
  // even at 20x the return on capital is less than twice the unlevered one, because the spot leg is not leveraged
  expect(Number(returns[5]) / Number(returns[0])).toBeLessThan(2);
});

test("OKX-DERIV D4: unknown fees stay unknown: no net, capital or return is ever filled with zero", () => {
  const result = run((raw) => { delete raw.snapshot.fees; });
  expect(result.reasons).toEqual(["unknown:fee_perp_taker", "unknown:fee_spot_taker"]);
  expect(result.legs.spotOpen?.feePpm).toBeNull();
  expect(result.legs.spotOpen?.feeMicro).toBeNull();
  expect(result.flatCostsMicro).toBeNull();
  expect(result.breakEven).toBeNull();
  for (const scenario of result.scenarios) {
    expect(scenario.netMicro).toBeNull();
    expect(scenario.components).toBeNull();
  }
  expect(result.conservative).toEqual({ scenarioId: "worst_observed|adverse", netMicro: null, netOnNotionalPpm: null });
  for (const entry of result.leverageTable) {
    expect(entry.capitalMicro).toBeNull();
    expect(Object.values(entry.returnsPpm).every((value) => value === null)).toBe(true);
    expect(entry.liquidation).toBeNull();
    expect(entry.stress).toBeNull();
    expect(entry.maxDrawdownPpm).toBeNull();
    // the margin does not depend on fees, so it is still computed
    expect(entry.initialMarginMicro).not.toBeNull();
  }
});

test("OKX-DERIV D11: a definitive limit wins over missing data and the reasons list both", () => {
  const result = run((raw) => { delete raw.snapshot.fees; });
  expect(result.leverageTable.map((entry) => entry.verdict.status)).toEqual(["unavailable", "unavailable", "unavailable", "ineligible", "ineligible", "ineligible"]);
  expect(row(result, 3).verdict.reasons).toEqual(["unknown:fee_perp_taker", "unknown:fee_spot_taker"]);
  expect(row(result, 5).verdict.reasons).toEqual(["limit:leverage_above_cap", "unknown:fee_perp_taker", "unknown:fee_spot_taker"]);
});

test("OKX-DERIV D4: only the fees of the roles in use are required, plus the taker fee for liquidation", () => {
  const result = run((raw) => {
    raw.evaluation.carry.roles = { spotOpen: "maker", perpOpen: "maker", spotClose: "maker", perpClose: "maker" };
    delete raw.snapshot.fees.perp.takerCost;
  });
  expect(result.reasons).toEqual(["unknown:fee_perp_taker"]);
  // the net uses only maker fees, so it is available; the liquidation needs the taker fee, so it is not
  expect(result.conservative.netMicro).not.toBeNull();
  expect(row(result, 3).liquidation).toBeNull();
  expect(row(result, 3).verdict.status).toBe("unavailable");

  const unknownMaker = run((raw) => {
    raw.evaluation.carry.roles = { spotOpen: "taker", perpOpen: "maker", spotClose: "taker", perpClose: "taker" };
    delete raw.snapshot.fees.perp.makerCost;
  });
  expect(unknownMaker.reasons).toEqual(["unknown:fee_perp_maker"]);
  expect(unknownMaker.conservative.netMicro).toBeNull();
});

test("OKX-DERIV D8: an unknown maintenance margin rate blocks liquidation, stress and the verdict but not the net", () => {
  const result = run((raw) => { delete raw.snapshot.maintenanceMarginRate; });
  expect(result.reasons).toEqual(["unknown:maintenance_margin_rate"]);
  expect(money(result.conservative.netMicro)).toBe("62.210000");
  for (const entry of result.leverageTable) {
    expect(entry.liquidation).toBeNull();
    expect(entry.stress).toBeNull();
    expect(entry.maxDrawdownPpm).toBeNull();
    expect(entry.shocksLiquidated).toBeNull();
    expect(entry.capitalMicro).not.toBeNull();
  }
  expect(row(result, 2).verdict).toEqual({ status: "unavailable", reasons: ["unknown:maintenance_margin_rate"] });
  expect(row(result, 5).verdict).toEqual({ status: "ineligible", reasons: ["limit:leverage_above_cap", "unknown:maintenance_margin_rate"] });
});

test("OKX-DERIV D3: thin books make the result unavailable instead of extrapolating a price", () => {
  const thinPerp = run((raw) => { raw.snapshot.books.perp.bids = [["1001.0", "10"]]; });
  expect(thinPerp.reasons).toEqual(["depth:perp_open"]);
  expect(thinPerp.legs.perpOpen).toBeNull();
  expect(thinPerp.legs.perpClose).not.toBeNull();
  expect(thinPerp.conservative.netMicro).toBeNull();
  for (const entry of thinPerp.leverageTable) {
    expect(entry.initialMarginMicro).toBeNull();
    expect(entry.capitalMicro).toBeNull();
    expect(entry.liquidation).toBeNull();
  }
  expect(row(thinPerp, 2).verdict).toEqual({ status: "unavailable", reasons: ["depth:perp_open"] });

  const thinSpotBids = run((raw) => { raw.snapshot.books.spot.bids = [["999.9", "39.999"]]; });
  expect(thinSpotBids.reasons).toEqual(["depth:spot_close"]);
  const thinSpotAsks = run((raw) => { raw.snapshot.books.spot.asks = [["1000.1", "39.999"]]; });
  expect(thinSpotAsks.reasons).toEqual(["depth:spot_open"]);
  const thinPerpAsks = run((raw) => { raw.snapshot.books.perp.asks = [["1001.2", "399"]]; });
  expect(thinPerpAsks.reasons).toEqual(["depth:perp_close"]);
  // exactly the needed depth is accepted
  const exact = run((raw) => { raw.snapshot.books.perp.bids = [["1001.0", "400"]]; });
  expect(exact.reasons).toEqual([]);
  expect(legView(exact.legs.perpOpen)?.avg).toBe("1001");
});

test("OKX-DERIV D3: an empty book side is insufficient depth for every leg of that market and has no mid", () => {
  const result = run((raw) => { raw.snapshot.books.spot.asks = []; });
  expect(result.reasons).toEqual(["depth:spot_close", "depth:spot_open"]);
  expect(result.basis).toBeNull();
  expect(result.legs.spotOpen).toBeNull();
  expect(result.legs.spotClose).toBeNull();
  expect(result.conservative.netMicro).toBeNull();
});

test("OKX-DERIV D3: a crossed or locked book is reported once, without inventing a depth failure", () => {
  const locked = run((raw) => { raw.snapshot.books.spot.asks[0][0] = "999.9"; });
  expect(locked.reasons).toEqual(["book:crossed_spot"]);
  expect(locked.legs.spotOpen).toBeNull();
  const crossedPerp = run((raw) => { raw.snapshot.books.perp.asks[0][0] = "1000.5"; });
  expect(crossedPerp.reasons).toEqual(["book:crossed_perp"]);
});

test("OKX-DERIV D11: a stale snapshot, with the maximum age as the exact boundary, is unavailable", () => {
  const atLimit = run(undefined, SYNTHETIC_NOW_MS + 57_000);
  expect(atLimit.reasons).toEqual([]);
  const justStale = run(undefined, SYNTHETIC_NOW_MS + 57_001);
  expect(justStale.reasons).toEqual(["stale:funding"]);
  const veryStale = run(undefined, SYNTHETIC_NOW_MS + 600_000);
  expect(veryStale.reasons).toEqual(["stale:funding", "stale:mark", "stale:perp_book", "stale:spot_book"]);
  expect(row(veryStale, 2).verdict.status).toBe("unavailable");
  // the numbers are still computed and shown, but the verdict cannot approve them
  expect(money(veryStale.conservative.netMicro)).toBe("62.210000");
});

test("OKX-DERIV D11: a timestamp in the future of the clock is unavailable and a skewed pair of books too", () => {
  const future = run(undefined, SYNTHETIC_NOW_MS - 2500);
  expect(future.reasons).toEqual(["future:mark", "future:perp_book", "future:spot_book"]);
  const skewed = run((raw) => { raw.snapshot.books.perp.tsMs = raw.snapshot.books.spot.tsMs - 5001; });
  expect(skewed.reasons).toEqual(["skew:books"]);
  const edge = run((raw) => { raw.snapshot.books.perp.tsMs = raw.snapshot.books.spot.tsMs - 5000; });
  expect(edge.reasons).toEqual([]);
});

test("OKX-DERIV D11: a pending settlement that is not in the future makes the funding schedule stale", () => {
  const result = run((raw) => { raw.snapshot.funding.fundingTimeMs = SYNTHETIC_NOW_MS; raw.snapshot.funding.nextFundingTimeMs = SYNTHETIC_NOW_MS + 8 * 3_600_000; });
  expect(result.reasons).toEqual(["stale:funding_schedule"]);
});

test("OKX-DERIV D5: a short funding history leaves only the zero-funding scenarios computed", () => {
  const result = run((raw) => { raw.snapshot.funding.history = raw.snapshot.funding.history.slice(0, 2); });
  expect(result.reasons).toEqual(["funding:insufficient_history"]);
  expect(result.funding.scenarios.map((scenario) => scenario.ratePpm)).toEqual([null, null, 0n]);
  expect(result.scenarios.filter((scenario) => scenario.fundingId === "zero").map((scenario) => money(scenario.netMicro))).toEqual(["-110.035200", "-66.035200", "-190.067200"]);
  expect(result.scenarios.filter((scenario) => scenario.fundingId !== "zero").every((scenario) => scenario.netMicro === null)).toBe(true);
  expect(result.conservative.netMicro).toBeNull();
  const lowered = run((raw) => { raw.snapshot.funding.history = raw.snapshot.funding.history.slice(0, 2); raw.evaluation.policy = { minFundingObservations: 2 }; });
  expect(lowered.reasons).toEqual([]);
});

test("OKX-DERIV D5: a settlement interval outside 1, 2, 4 and 8 hours is unavailable", () => {
  const result = run((raw) => { raw.snapshot.funding.nextFundingTimeMs = raw.snapshot.funding.fundingTimeMs + 3 * 3_600_000; });
  expect(result.reasons).toEqual(["funding:invalid_interval"]);
  expect(result.funding.intervalHours).toBeNull();
  expect(result.funding.schedule).toBeNull();
  expect(result.conservative.netMicro).toBeNull();
});

test("OKX-DERIV D5: the interval scales the schedule and break-even hours but not the funding per settlement", () => {
  for (const hours of [1, 2, 4] as const) {
    const result = run((raw) => { raw.snapshot.funding.nextFundingTimeMs = raw.snapshot.funding.fundingTimeMs + hours * 3_600_000; });
    expect(result.reasons).toEqual([]);
    expect(result.funding.intervalHours).toBe(hours);
    expect(result.funding.schedule).toEqual({ firstMs: 1_800_028_800_000, lastMs: 1_800_028_800_000 + 89 * hours * 3_600_000 });
    expect(result.breakEven?.[0]).toEqual({ id: "recent_average", settlements: 28n, hours: BigInt(28 * hours) });
    expect(money(result.conservative.netMicro)).toBe("62.210000");
  }
});

test("OKX-DERIV D2: an inverse contract, a suspended market or mismatched currencies stop every number", () => {
  const cases: Array<[string, (raw: Json) => void]> = [
    ["instrument:inverse_unsupported", (raw) => { raw.snapshot.perp.ctType = "inverse"; }],
    ["instrument:not_live", (raw) => { raw.snapshot.perp.state = "suspend"; }],
    ["instrument:not_live", (raw) => { raw.snapshot.spot.state = "preopen"; }],
    ["instrument:asset_mismatch", (raw) => { raw.snapshot.perp.ctValCcy = "OTHER"; }],
    ["instrument:quote_mismatch", (raw) => { raw.snapshot.perp.settleCcy = "USDC"; }],
  ];
  for (const [reason, mutate] of cases) {
    const result = run(mutate);
    expect(result.reasons).toEqual([reason]);
    expect(Object.values(result.legs).every((leg) => leg === null)).toBe(true);
    expect(result.conservative.netMicro).toBeNull();
    expect(row(result, 1).verdict).toEqual({ status: "unavailable", reasons: [reason] });
  }
});

test("OKX-DERIV D2: trade sizes that break lot or minimum sizes are reported and stop the pricing", () => {
  expect(run((raw) => { raw.evaluation.carry.contracts = "0.5"; }).reasons).toEqual(["size:perp_lot"]);
  expect(run((raw) => { raw.snapshot.perp.minSz = "1000"; }).reasons).toEqual(["size:perp_min"]);
  expect(run((raw) => { raw.snapshot.spot.lotSz = "0.3"; }).reasons).toEqual(["size:spot_lot"]);
  expect(run((raw) => { raw.snapshot.spot.minSz = "100"; }).reasons).toEqual(["size:spot_min"]);
  const result = run((raw) => { raw.evaluation.carry.contracts = "0.5"; });
  expect(result.legs.spotOpen).toBeNull();
  // the coin quantity is still reported
  expect(result.trade.coin).toEqual(dec("0.05"));
});

test("OKX-DERIV D11: access is an explicit fact: unknown is unavailable and denied is ineligible", () => {
  const unknown = run((raw) => { delete raw.snapshot.access; });
  expect(unknown.reasons).toEqual(["unknown:access_derivatives"]);
  expect(row(unknown, 1).verdict).toEqual({ status: "unavailable", reasons: ["unknown:access_derivatives"] });
  expect(money(unknown.conservative.netMicro)).toBe("62.210000");
  const denied = run((raw) => { raw.snapshot.access = { derivatives: "operator_denied" }; });
  expect(denied.reasons).toEqual(["access:derivatives_denied"]);
  expect(row(denied, 1).verdict).toEqual({ status: "ineligible", reasons: ["access:derivatives_denied"] });
});

test("OKX-DERIV D11: the leverage cap, instrument maximum, distance floor and buffer are configurable gates", () => {
  const raised = run((raw) => { raw.evaluation.policy = { maxLeverage: 5 }; });
  expect(row(raised, 5).verdict).toEqual({ status: "ineligible", reasons: ["limit:liquidation_distance_below_floor"] });
  expect(row(raised, 10).verdict.reasons).toEqual(["limit:leverage_above_cap", "limit:liquidation_distance_below_floor"]);
  const permissive = run((raw) => { raw.evaluation.policy = { maxLeverage: 125, minLiquidationDistancePpm: 0 }; });
  expect(permissive.leverageTable.map((entry) => entry.verdict.status)).toEqual(Array(6).fill("eligible"));
  const aboveInstrument = run((raw) => { raw.evaluation.leverages = [40, 60]; raw.evaluation.policy = { maxLeverage: 125, minLiquidationDistancePpm: 0 }; });
  expect(row(aboveInstrument, 40).verdict.status).toBe("eligible");
  expect(row(aboveInstrument, 60).verdict).toEqual({ status: "ineligible", reasons: ["limit:leverage_above_instrument_max"] });
  const floor = run((raw) => { raw.evaluation.policy = { minLiquidationDistancePpm: 327493 }; });
  expect(row(floor, 3).verdict).toEqual({ status: "ineligible", reasons: ["limit:liquidation_distance_below_floor"] });
  const exactFloor = run((raw) => { raw.evaluation.policy = { minLiquidationDistancePpm: 327492 }; });
  expect(row(exactFloor, 3).verdict.status).toBe("eligible");
});

test("OKX-DERIV D11: the net buffer must be strictly exceeded and does not depend on leverage", () => {
  const equal = run((raw) => { raw.evaluation.policy = { minNetOnNotionalPpm: 1553 }; });
  for (const entry of equal.leverageTable.slice(0, 3)) {
    expect(entry.verdict).toEqual({ status: "ineligible", reasons: ["limit:net_conservative_return_not_above_buffer"] });
  }
  const below = run((raw) => { raw.evaluation.policy = { minNetOnNotionalPpm: 1552 }; });
  for (const entry of below.leverageTable.slice(0, 3)) expect(entry.verdict.status).toBe("eligible");
  // a 20x return on capital would pass a return-based buffer, but the gate uses the unlevered metric
  const strict = run((raw) => { raw.evaluation.policy = { minNetOnNotionalPpm: 1553, maxLeverage: 125, minLiquidationDistancePpm: 0 }; });
  expect(strict.leverageTable.every((entry) => entry.verdict.reasons.includes("limit:net_conservative_return_not_above_buffer"))).toBe(true);
});

test("OKX-DERIV D5/D11: negative funding is an expense for the short and makes the conservative net fail every leverage", () => {
  const result = run((raw) => {
    const history = raw.snapshot.funding.history;
    for (const entry of history) entry.rate = "-0.00005";
    raw.snapshot.funding.currentRate = "-0.00005";
  });
  expect(result.funding.scenarios.map((scenario) => [scenario.ratePpm, money(scenario.flowMicro)])).toEqual([
    [-50n, "-180.198000"], [-50n, "-180.198000"], [0n, "0.000000"],
  ]);
  expect(result.scenarios.filter((scenario) => scenario.fundingId === "recent_average").map((scenario) => money(scenario.netMicro))).toEqual(["-290.233200", "-246.233200", "-370.265200"]);
  expect(money(result.conservative.netMicro)).toBe("-370.265200");
  expect(result.breakEven?.map((entry) => entry.settlements)).toEqual([null, null, null]);
  for (const entry of result.leverageTable.slice(0, 3)) {
    expect(entry.verdict).toEqual({ status: "ineligible", reasons: ["limit:net_conservative_return_not_above_buffer"] });
  }
  // the funding drag enters the stress table: 110.0352 of costs plus 180.198 of funding
  const stress = row(result, 3).stress ?? [];
  expect(stress.map((entry) => money(entry.pnlAfterCostsMicro))).toEqual(["-293.533200", "-298.483200", "-13636.233200"]);
  expect(stress.map((entry) => entry.drawdownPpm)).toEqual([5498n, 5591n, 255384n]);
});

test("OKX-DERIV D5: one negative print makes the worst observed rate negative while the average stays positive", () => {
  const result = run((raw) => { raw.snapshot.funding.history[4].rate = "-0.00020"; });
  // mean of 9, 10, 7, 11, -20, 10, 8, 12, 10 (x 10 ppm) is 63.33 ppm, rounded down for the short
  expect(result.funding.scenarios.map((scenario) => [scenario.ratePpm, money(scenario.flowMicro)])).toEqual([
    [63n, "227.049480"], [-200n, "-720.792000"], [0n, "0.000000"],
  ]);
  expect(money(result.conservative.netMicro)).toBe("-910.859200");
  expect(row(result, 2).verdict).toEqual({ status: "ineligible", reasons: ["limit:net_conservative_return_not_above_buffer"] });
});

test("OKX-DERIV D5/D10: the holding horizon scales funding linearly and can turn the conservative gate off", () => {
  const week = run((raw) => { raw.evaluation.holdingSettlements = 21; });
  expect(money(week.funding.scenarios[1]?.flowMicro ?? null)).toBe("58.864680");
  expect(money(week.conservative.netMicro)).toBe("-131.202520");
  expect(money(week.scenarios.find((scenario) => scenario.id === "recent_average|flat")?.netMicro ?? null)).toBe("-25.942800");
  expect(row(week, 2).verdict).toEqual({ status: "ineligible", reasons: ["limit:net_conservative_return_not_above_buffer"] });
  // break-even is independent of the horizon but now lies beyond it
  expect(week.breakEven?.[0]?.settlements).toBe(28n);
  const slow = run((raw) => { for (const entry of raw.snapshot.funding.history) entry.rate = "0.00001"; });
  expect(slow.breakEven?.[0]?.settlements).toBe(275n);
});

test("OKX-DERIV D3/D4: maker legs are filled at the mid with maker fees, no spread credit and no slippage", () => {
  const result = run((raw) => { raw.evaluation.carry.roles = { spotOpen: "maker", perpOpen: "maker", spotClose: "maker", perpClose: "maker" }; });
  expect(result.reasons).toEqual([]);
  expect(legView(result.legs.spotOpen)).toEqual({ role: "maker", avg: "1000", worst: null, touch: "1000.1", notional: "40000", slippagePpm: 0n, execution: "0.000000", feePpm: 500n, fee: "20.000000" });
  expect(legView(result.legs.perpClose)).toEqual({ role: "maker", avg: "1001.1", worst: null, touch: "1001.2", notional: "40044", slippagePpm: 0n, execution: "0.000000", feePpm: 100n, fee: "4.004400" });
  expect(money(result.flatCostsMicro)).toBe("48.008800");
  expect(money(result.scenarios.find((scenario) => scenario.id === "worst_observed|flat")?.netMicro ?? null)).toBe("204.268400");
  expect(money(result.conservative.netMicro)).toBe("124.260400");
  const entry = row(result, 3);
  expect(money(entry.initialMarginMicro)).toBe("13348.000000");
  expect(money(entry.capitalMicro)).toBe("53372.004400");
  // a maker book does not need depth for the size
  const thin = run((raw) => {
    raw.evaluation.carry.roles = { spotOpen: "maker", perpOpen: "maker", spotClose: "maker", perpClose: "maker" };
    raw.snapshot.books.perp.bids = [["1001.0", "1"]];
  });
  expect(thin.reasons).toEqual([]);
});

test("OKX-DERIV D1: sub-micro exact costs are rounded up, in every leg and the net stays an exact integer sum", () => {
  // 401 contracts are 40.1 coins and the spot prices have seven decimals, so the exact values have fractions of a micro unit
  const result = run((raw) => {
    raw.evaluation.carry.contracts = "401";
    raw.snapshot.spot.tickSz = "0.0000001";
    raw.snapshot.books.spot.asks = [["1000.1000001", "30"], ["1000.2000003", "40"], ["1000.3", "60"], ["1000.5", "100"]];
    raw.snapshot.books.spot.bids = [["999.9", "30"], ["999.8000007", "40"], ["999.7", "60"], ["999.5", "100"]];
  });
  expect(result.reasons).toEqual([]);
  // exact: 5.020004025 and 5.019994985 quote, so 5020004.025 and 5019994.985 micro units
  expect(result.legs.spotOpen?.executionCostMicro).toBe(5_020_005n);
  expect(result.legs.spotClose?.executionCostMicro).toBe(5_019_995n);
  for (const scenario of result.scenarios) {
    if (scenario.components === null || scenario.netMicro === null) throw new Error("expected components");
    expect(scenario.netMicro).toBe(scenario.components.fundingMicro - scenario.components.executionCostMicro - scenario.components.basisCostMicro - scenario.components.feesMicro);
  }
});

test("OKX-DERIV D14: evaluation is pure, deterministic and does not mutate its inputs", () => {
  const raw = syntheticInput() as Json;
  const parsed = parseDerivativesInput(raw);
  const freeze = (value: unknown): void => {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(parsed);
  const first = evaluateCarry(parsed.snapshot, parsed.evaluation, SYNTHETIC_NOW_MS);
  const second = evaluateCarry(parsed.snapshot, parsed.evaluation, SYNTHETIC_NOW_MS);
  expect(second).toEqual(first);
  for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => evaluateCarry(parsed.snapshot, parsed.evaluation, bad)).toThrow(RangeError);
  }
});
