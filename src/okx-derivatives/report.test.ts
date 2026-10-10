import { expect, test } from "bun:test";
import { createFixtureAdapter, createSyntheticAdapter } from "./adapter.ts";
import { canonicalJson, sha256Hex } from "./canonical.ts";
import { SYNTHETIC_NOW_MS, syntheticInput } from "./fixture.ts";
import { buildDerivativesReport, REPORT_NOTES } from "./report.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

// Em dash, en dash and middle dot are forbidden in rendered text; built from char codes so this file does not contain them.
const TYPOGRAPHY = new RegExp(`[${String.fromCharCode(0x2014, 0x2013, 0x00b7)}]`);

function build(mutate: (raw: Json) => void = () => {}, mode: "synthetic" | "imported" = "synthetic", nowMs = SYNTHETIC_NOW_MS): Json {
  const raw = syntheticInput() as Json;
  mutate(raw);
  return JSON.parse(JSON.stringify(buildDerivativesReport(createFixtureAdapter(raw, mode), nowMs))) as Json;
}

function walk(value: unknown, visit: (key: string, child: unknown, path: string) => void, path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, visit, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child, `${path}.${key}`);
      walk(child, visit, `${path}.${key}`);
    }
  }
}

test("OKX-DERIV D15: the synthetic report carries the non-negotiable qualification fields", () => {
  const report = build();
  expect(report.schema).toBe("okx_derivatives_report_v1");
  expect(report.source).toBe("synthetic");
  expect(report.mode).toBe("synthetic");
  expect(report.externalAccessObserved).toBe(false);
  expect(report.liveQualified).toBe(false);
  expect(report.financiallyAuthorized).toBe(false);
  expect(report.execution).toBe("not_qualified");
  expect(report.generatedAtMs).toBe(SYNTHETIC_NOW_MS);
  expect(report.inputSha256).toBe(sha256Hex(canonicalJson(syntheticInput())));
  expect(Object.keys(report).sort()).toEqual([
    "adapter", "carry", "directional", "execution", "externalAccessObserved", "financiallyAuthorized", "freshness", "generatedAtMs", "inputSha256",
    "instrument", "liveQualified", "mode", "model", "notes", "policy", "schema", "source", "units", "unknownInputs",
  ]);
  expect(report.adapter).toEqual({
    venue: "okx", kind: "offline_fixture", apiVersion: "okx_v5_normalized_snapshot_v1",
    capabilities: { read: true, authenticated: false, demo: false, live: false, signer: false, network: false, blockers: ["execution_not_qualified", "no_credentials", "no_network_client", "no_signer", "offline_fixture_only"] },
  });
});

test("OKX-DERIV D15: the answer comes first: headline fields, limits and strategies precede the reference blocks", () => {
  expect(Object.keys(build())).toEqual([
    "schema", "source", "mode", "externalAccessObserved", "liveQualified", "financiallyAuthorized", "execution", "generatedAtMs", "inputSha256",
    "unknownInputs", "notes", "carry", "directional", "model", "policy", "instrument", "freshness", "units", "adapter",
  ]);
  expect(Object.keys(build().carry).slice(0, 4)).toEqual(["strategy", "summary", "comparison", "conservative"]);
  expect(Object.keys(build().directional).slice(0, 4)).toEqual(["strategy", "modeledEdge", "comparison", "trade"]);
});

test("OKX-DERIV D12: the carry comparison puts return on capital next to liquidation distance, with the same profit in every row", () => {
  const { comparison } = build().carry;
  expect(comparison).toEqual([
    { leverage: 1, capitalCommittedQuote: "80087.018700", conservativeNetQuote: "62.210000", conservativeReturnPpm: 776, liquidationDistancePpm: 991238, shocksLiquidated: 0, maxDrawdownPpm: 1580, status: "eligible", reasons: [] },
    { leverage: 2, capitalCommittedQuote: "60068.018700", conservativeNetQuote: "62.210000", conservativeReturnPpm: 1035, liquidationDistancePpm: 493428, shocksLiquidated: 1, maxDrawdownPpm: 335105, status: "eligible", reasons: [] },
    { leverage: 3, capitalCommittedQuote: "53395.018700", conservativeNetQuote: "62.210000", conservativeReturnPpm: 1165, liquidationDistancePpm: 327492, shocksLiquidated: 1, maxDrawdownPpm: 252010, status: "eligible", reasons: [] },
    { leverage: 5, capitalCommittedQuote: "48056.618700", conservativeNetQuote: "62.210000", conservativeReturnPpm: 1294, liquidationDistancePpm: 194743, shocksLiquidated: 2, maxDrawdownPpm: 168919, status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor"] },
    { leverage: 10, capitalCommittedQuote: "44052.818700", conservativeNetQuote: "62.210000", conservativeReturnPpm: 1412, liquidationDistancePpm: 95181, shocksLiquidated: 3, maxDrawdownPpm: 93385, status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor"] },
    { leverage: 20, capitalCommittedQuote: "42050.918700", conservativeNetQuote: "62.210000", conservativeReturnPpm: 1479, liquidationDistancePpm: 45400, shocksLiquidated: 3, maxDrawdownPpm: 50224, status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor"] },
  ]);
  expect(new Set(comparison.map((row: Json) => row.conservativeNetQuote)).size).toBe(1);
  const unknown = build((raw) => { delete raw.snapshot.fees; }).carry.comparison;
  expect(unknown.map((row: Json) => [row.capitalCommittedQuote, row.conservativeNetQuote, row.conservativeReturnPpm, row.liquidationDistancePpm, row.maxDrawdownPpm])).toEqual(Array(6).fill([null, null, null, null, null]));
});

test("OKX-DERIV D13: the directional comparison shows only margin, distance, margin loss and the risk verdict", () => {
  const { comparison } = build().directional;
  expect(comparison).toEqual([
    { leverage: 1, initialMarginQuote: "40050.000000", liquidationDistancePpm: 1000000, maxLossOfMarginPpm: 500000, riskLimitsMet: true, status: "ineligible", reasons: ["model:directional_no_modeled_edge"] },
    { leverage: 2, initialMarginQuote: "20025.000000", liquidationDistancePpm: 497790, maxLossOfMarginPpm: 1000000, riskLimitsMet: true, status: "ineligible", reasons: ["model:directional_no_modeled_edge"] },
    { leverage: 3, initialMarginQuote: "13350.000000", liquidationDistancePpm: 330387, maxLossOfMarginPpm: 1000000, riskLimitsMet: true, status: "ineligible", reasons: ["model:directional_no_modeled_edge"] },
    { leverage: 5, initialMarginQuote: "8010.000000", liquidationDistancePpm: 196464, maxLossOfMarginPpm: 1000000, riskLimitsMet: false, status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor", "model:directional_no_modeled_edge"] },
    { leverage: 10, initialMarginQuote: "4005.000000", liquidationDistancePpm: 96022, maxLossOfMarginPpm: 1000000, riskLimitsMet: false, status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor", "model:directional_no_modeled_edge"] },
    { leverage: 20, initialMarginQuote: "2002.500000", liquidationDistancePpm: 45801, maxLossOfMarginPpm: 1000000, riskLimitsMet: false, status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor", "model:directional_no_modeled_edge"] },
  ]);
});

test("OKX-DERIV D8: the model block states that the liquidation formula is a simplified approximation, not the exchange formula", () => {
  const { model } = build();
  expect(model).toEqual({
    marginMode: "isolated",
    contractType: "linear_swap",
    liquidationModel: "simplified_isolated_v1",
    liquidationModelIsExchangeFormula: false,
    liquidationFormulaShort: "P_liq = entry * (1 + 1/L) / (1 + mmr + closeFee)",
    liquidationFormulaLong: "P_liq = entry * (1 - 1/L) / (1 - mmr - closeFee)",
    rounding: "against_trader",
    conservativeScenarioId: "worst_observed|adverse",
    gateMetric: "conservative_net_over_perp_notional_ppm",
  });
  expect(build().units).toEqual({
    money: "decimal string with exactly 6 fractional digits in the quote currency",
    ratio: "integer ppm (1e-6)",
    price: "decimal string with at most 10 fractional digits, rounded against the trader",
    size: "exact decimal string",
  });
});

test("OKX-DERIV D1: every money field is an exact 6-decimal string, every ratio an integer, and no number is a float", () => {
  const isPpm = (value: unknown): boolean => {
    if (value === null) return true;
    if (typeof value === "number") return Number.isSafeInteger(value);
    if (Array.isArray(value)) return value.every(isPpm);
    if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isPpm);
    return false;
  };
  for (const report of [build(), build((raw) => { delete raw.snapshot.fees; }), build((raw) => { raw.evaluation.carry.roles = { spotOpen: "maker", perpOpen: "maker", spotClose: "maker", perpClose: "maker" }; })]) {
    let moneyFields = 0;
    let ratioFields = 0;
    walk(report, (key, child, path) => {
      if (key.endsWith("Quote")) {
        moneyFields += 1;
        expect(child === null || (typeof child === "string" && /^-?\d+\.\d{6}$/.test(child)), path).toBe(true);
      }
      if (key.endsWith("Ppm")) {
        ratioFields += 1;
        expect(isPpm(child), path).toBe(true);
      }
      if (typeof child === "number") expect(Number.isInteger(child), path).toBe(true);
      if (key.endsWith("Ms")) expect(child === null || Number.isSafeInteger(child), path).toBe(true);
    });
    expect(moneyFields).toBeGreaterThan(60);
    expect(ratioFields).toBeGreaterThan(25);
    // numbers are safe integers (checked above), so JSON never needs exponent notation; NaN and Infinity never appear
    expect(/NaN|Infinity|undefined/.test(JSON.stringify(report))).toBe(false);
  }
});

test("OKX-DERIV D12: the carry report shows legs, funding, nine scenarios, break-even and the conservative gate", () => {
  const { carry } = build();
  expect(carry.strategy).toBe("funding_carry_long_spot_short_perp");
  expect(carry.reasons).toEqual([]);
  expect(carry.trade).toEqual({
    contracts: "400", coinQty: "40", coinCcy: "SYN", quoteCcy: "USDT", holdingSettlements: 90,
    roles: { spotOpen: "taker", perpOpen: "taker", spotClose: "taker", perpClose: "taker" },
  });
  expect(carry.legs.spotOpen).toEqual({ role: "taker", side: "buy", avgPrice: "1000.125", worstPrice: "1000.2", touchPrice: "1000.1", notionalQuote: "40005.000000", slippagePpm: 25, executionCostQuote: "5.000000", feePpm: 700, feeQuote: "28.003500" });
  expect(carry.legs.perpOpen).toEqual({ role: "taker", side: "sell", avgPrice: "1000.95", worstPrice: "1000.9", touchPrice: "1001", notionalQuote: "40038.000000", slippagePpm: 50, executionCostQuote: "6.000000", feePpm: 400, feeQuote: "16.015200" });
  expect(carry.basis).toEqual({ spotMid: "1000", perpMid: "1001.1", entryBasisPpm: 1100 });
  expect(carry.funding).toEqual({
    markPx: "1001.1", valuePerSettlementQuote: "40044.000000", intervalHours: 8,
    schedule: { firstSettlementMs: 1_800_028_800_000, lastSettlementMs: 1_802_592_000_000, holdingHours: 720 },
    historyCount: 9, historyMaxAbsRatePpm: 130, currentRatePpm: 100,
    scenarios: [
      { id: "recent_average", ratePpm: 100, flowQuote: "360.396000" },
      { id: "worst_observed", ratePpm: 70, flowQuote: "252.277200" },
      { id: "zero", ratePpm: 0, flowQuote: "0.000000" },
    ],
  });
  expect(carry.scenarios).toHaveLength(9);
  expect(carry.scenarios[5]).toEqual({ id: "worst_observed|adverse", funding: "worst_observed", basis: "adverse", fundingQuote: "252.277200", executionCostQuote: "22.000000", basisCostQuote: "80.000000", feesQuote: "88.067200", netQuote: "62.210000" });
  expect(carry.flatCostsQuote).toBe("110.035200");
  expect(carry.conservative).toEqual({ scenarioId: "worst_observed|adverse", netQuote: "62.210000", netOnNotionalPpm: 1553 });
  expect(carry.breakEven).toEqual([
    { id: "recent_average", settlements: 28, hours: 224 },
    { id: "worst_observed", settlements: 40, hours: 320 },
    { id: "zero", settlements: null, hours: null },
  ]);
  expect(carry.summary).toEqual({ eligible: [1, 2, 3], ineligible: [5, 10, 20], unavailable: [] });
});

test("OKX-DERIV D12: the leverage table pairs return on capital with liquidation distance and the liquidated shocks", () => {
  const { carry } = build();
  expect(carry.leverageTable.map((row: Json) => row.leverage)).toEqual([1, 2, 3, 5, 10, 20]);
  const three = carry.leverageTable[2];
  expect(three.initialMarginQuote).toBe("13346.000000");
  expect(three.capitalCommittedQuote).toBe("53395.018700");
  expect(three.returnsPpm["worst_observed|adverse"]).toBe(1165);
  expect(three.liquidation).toEqual({ price: "1328.7534846674", distancePpm: 327492 });
  expect(three.maxDrawdownPpm).toBe(252010);
  expect(three.shocksLiquidated).toBe(1);
  expect(three.verdict).toEqual({ status: "eligible", reasons: [] });
  expect(three.stress[2]).toEqual({
    id: "gap_500000ppm", kind: "gap", movePpm: 500000, liquidated: true, hedgeBroken: true, remainingMarginQuote: "0.000000", perpLegPnlQuote: "-13346.000000",
    spotPnlQuote: "20002.500000", creditedPnlQuote: "-13346.000000", lossBeyondMarginQuote: "6673.000000", pnlAfterCostsQuote: "-13456.035200", drawdownPpm: 252010,
  });
  expect(three.stress[0].kind).toBe("move");
  const twenty = carry.leverageTable[5];
  expect(twenty.liquidation.distancePpm).toBe(45400);
  expect(twenty.shocksLiquidated).toBe(3);
  expect(twenty.verdict).toEqual({ status: "ineligible", reasons: ["limit:leverage_above_cap", "limit:liquidation_distance_below_floor"] });
  // the table makes both effects visible: return improves a little while the distance collapses
  expect(carry.leverageTable[0].returnsPpm["worst_observed|adverse"]).toBeLessThan(twenty.returnsPpm["worst_observed|adverse"]);
  expect(carry.leverageTable[0].liquidation.distancePpm).toBeGreaterThan(twenty.liquidation.distancePpm * 20);
});

test("OKX-DERIV D1: prices the trader pays are rounded up and prices the trader receives down, at ten decimals", () => {
  const report = build((raw) => {
    raw.evaluation.carry.contracts = "30";
    raw.snapshot.books.spot.asks = [["1000.1", "1"], ["1000.2", "2"], ["1000.3", "60"]];
    raw.snapshot.books.spot.bids = [["999.9", "1"], ["999.8", "2"], ["999.7", "60"]];
  });
  // exact averages 1000.16666... (buy) and 999.83333... (sell)
  expect(report.carry.legs.spotOpen.avgPrice).toBe("1000.1666666667");
  expect(report.carry.legs.spotClose.avgPrice).toBe("999.8333333333");
});

test("OKX-DERIV D13: the directional branch is risk only and contains no profit, return or PnL words", () => {
  const { directional } = build();
  expect(directional.strategy).toBe("directional_perp_risk_only");
  expect(directional.modeledEdge).toBe("none");
  expect(directional.trade).toEqual({ side: "long", contracts: "400", coinQty: "40", coinCcy: "SYN", quoteCcy: "USDT", holdingSettlements: 90, roles: { open: "taker", close: "taker" } });
  expect(directional.executionCostQuote).toBe("12.000000");
  expect(directional.feesQuote).toBe("32.035200");
  expect(directional.holdingCostAtFlatPrice).toEqual([
    { fundingId: "recent_average", ratePpm: 100, fundingDragQuote: "360.396000", totalQuote: "404.431200" },
    { fundingId: "worst_observed", ratePpm: 130, fundingDragQuote: "468.514800", totalQuote: "512.550000" },
    { fundingId: "zero", ratePpm: 0, fundingDragQuote: "0.000000", totalQuote: "44.035200" },
  ]);
  const three = directional.leverageTable[2];
  expect(three).toEqual({
    leverage: 3, initialMarginQuote: "13350.000000", capitalCommittedQuote: "13366.020000", liquidation: { price: "670.4499799117", distancePpm: 330387 },
    stress: [
      { id: "move_100000ppm", kind: "move", movePpm: 100000, liquidated: false, remainingMarginQuote: "9345.000000", lossQuote: "4005.000000", lossBeyondMarginQuote: "0.000000", lossOfMarginPpm: 300000 },
      { id: "move_250000ppm", kind: "move", movePpm: 250000, liquidated: false, remainingMarginQuote: "3337.500000", lossQuote: "10012.500000", lossBeyondMarginQuote: "0.000000", lossOfMarginPpm: 750000 },
      { id: "gap_500000ppm", kind: "gap", movePpm: 500000, liquidated: true, remainingMarginQuote: "0.000000", lossQuote: "13350.000000", lossBeyondMarginQuote: "6675.000000", lossOfMarginPpm: 1000000 },
    ],
    maxLossOfMarginPpm: 1000000, riskLimitsMet: true,
    verdict: { status: "ineligible", reasons: ["model:directional_no_modeled_edge"] },
  });
  const forbidden = ["profit", "return", "pnl", "gain", "yield", "income", "apy", "apr", "earn", "lucro", "retorno", "ganho", "rendimento"];
  walk(directional, (key, child, path) => {
    expect(forbidden.some((word) => key.toLowerCase().includes(word)), path).toBe(false);
    if (typeof child === "string") expect(forbidden.some((word) => child.toLowerCase().includes(word)), path).toBe(false);
  });
  for (const row of directional.leverageTable) expect(row.verdict.status).not.toBe("eligible");
  expect(build((raw) => { delete raw.evaluation.directional; }).directional).toBeNull();
});

test("OKX-DERIV D4: unknown inputs are listed and every dependent figure is null, never a zero string", () => {
  const report = build((raw) => { delete raw.snapshot.fees; delete raw.snapshot.maintenanceMarginRate; delete raw.snapshot.access; });
  expect(report.unknownInputs).toEqual(["access.derivatives", "fees.perp.makerCost", "fees.perp.takerCost", "fees.spot.makerCost", "fees.spot.takerCost", "maintenanceMarginRate"]);
  expect(report.carry.reasons).toEqual(["unknown:access_derivatives", "unknown:fee_perp_taker", "unknown:fee_spot_taker", "unknown:maintenance_margin_rate"]);
  expect(report.carry.flatCostsQuote).toBeNull();
  expect(report.carry.conservative).toEqual({ scenarioId: "worst_observed|adverse", netQuote: null, netOnNotionalPpm: null });
  expect(report.carry.breakEven).toBeNull();
  for (const scenario of report.carry.scenarios) expect(scenario.netQuote).toBeNull();
  for (const row of report.carry.leverageTable) {
    expect(row.capitalCommittedQuote).toBeNull();
    expect(row.liquidation).toBeNull();
    expect(row.stress).toBeNull();
    expect(row.maxDrawdownPpm).toBeNull();
    expect(Object.values(row.returnsPpm).every((value) => value === null)).toBe(true);
  }
  expect(report.carry.summary).toEqual({ eligible: [], ineligible: [5, 10, 20], unavailable: [1, 2, 3] });
  expect(JSON.stringify(report.carry.scenarios)).not.toContain('"netQuote":"0.000000"');
  expect(build().unknownInputs).toEqual([]);
});

test("OKX-DERIV D14: an imported report keeps the claim of the file and is marked imported, never authenticated", () => {
  const imported = build(undefined, "imported");
  expect(imported.mode).toBe("imported");
  expect(imported.source).toBe("synthetic");
  expect(imported.externalAccessObserved).toBe(false);
  const claimed = build((raw) => { raw.sourceClaim = "operator_claimed"; }, "imported");
  expect(claimed.source).toBe("operator_claimed");
  expect(claimed.liveQualified).toBe(false);
  expect(claimed.financiallyAuthorized).toBe(false);
  expect(claimed.notes.some((note: string) => note.includes("informada pelo operador"))).toBe(true);
  expect(imported.notes.some((note: string) => note.includes("inventados"))).toBe(true);
  expect(claimed.inputSha256).not.toBe(imported.inputSha256);
});

test("OKX-DERIV D17: notes are Portuguese statements of the limits, free of em dashes, en dashes and middle dots", () => {
  const maker = build((raw) => { raw.evaluation.carry.roles = { spotOpen: "maker", perpOpen: "taker", spotClose: "taker", perpClose: "taker" }; });
  const base = build();
  expect(base.notes).toEqual(expect.arrayContaining(REPORT_NOTES.always));
  expect(base.notes.some((note: string) => note.includes("ponto médio"))).toBe(false);
  expect(maker.notes.some((note: string) => note.includes("ponto médio"))).toBe(true);
  for (const note of [...base.notes, ...maker.notes]) {
    expect(typeof note).toBe("string");
    expect(note.length).toBeGreaterThan(20);
    expect(TYPOGRAPHY.test(note)).toBe(false);
  }
  expect(TYPOGRAPHY.test(JSON.stringify(base))).toBe(false);
});

test("OKX-DERIV D15: the report is deterministic and echoes the policy, instrument and freshness it used", () => {
  const first = JSON.stringify(buildDerivativesReport(createSyntheticAdapter(), SYNTHETIC_NOW_MS));
  const second = JSON.stringify(buildDerivativesReport(createSyntheticAdapter(), SYNTHETIC_NOW_MS));
  expect(second).toBe(first);
  const report = JSON.parse(first) as Json;
  expect(report.policy).toEqual({
    maxLeverage: 3, minLiquidationDistancePpm: 250000, minNetOnNotionalPpm: 1000, maxSnapshotAgeMs: 60000, maxBookSkewMs: 5000,
    minFundingObservations: 3, adverseBasisPpm: 2000, stressMovesPpm: [100000, 250000], stressGapPpm: 500000,
  });
  expect(report.instrument).toEqual({
    quoteCcy: "USDT",
    perp: { instId: "SYN-USDT-SWAP", ctType: "linear", ctVal: "0.1", ctMult: "1", ctValCcy: "SYN", settleCcy: "USDT", tickSz: "0.1", lotSz: "1", minSz: "1", maxLeverage: 50, state: "live" },
    spot: { instId: "SYN-USDT", baseCcy: "SYN", quoteCcy: "USDT", tickSz: "0.1", lotSz: "0.001", minSz: "0.001", state: "live" },
  });
  expect(report.freshness).toEqual({
    spotBook: { tsMs: SYNTHETIC_NOW_MS - 2000, ageMs: 2000, status: "fresh" },
    perpBook: { tsMs: SYNTHETIC_NOW_MS - 1500, ageMs: 1500, status: "fresh" },
    mark: { tsMs: SYNTHETIC_NOW_MS - 1200, ageMs: 1200, status: "fresh" },
    funding: { tsMs: SYNTHETIC_NOW_MS - 3000, ageMs: 3000, status: "fresh" },
    booksSkewMs: 500, skewExceeded: false,
  });
});

test("OKX-DERIV D11: a stale or future snapshot is reported as unavailable with its reasons on every row", () => {
  const stale = build(undefined, "synthetic", SYNTHETIC_NOW_MS + 600_000);
  expect(stale.carry.reasons).toEqual(["stale:funding", "stale:mark", "stale:perp_book", "stale:spot_book"]);
  expect(stale.carry.summary).toEqual({ eligible: [], ineligible: [5, 10, 20], unavailable: [1, 2, 3] });
  expect(stale.freshness.spotBook.status).toBe("stale");
  const future = build(undefined, "synthetic", SYNTHETIC_NOW_MS - 2500);
  expect(future.freshness.spotBook).toEqual({ tsMs: SYNTHETIC_NOW_MS - 2000, ageMs: null, status: "future" });
  expect(future.carry.summary.unavailable).toEqual([1, 2, 3]);
});
