import { isCrossed, midPrice } from "./book.ts";
import { checkSize, coinQuantity } from "./contract.ts";
import { abs, add, ceilInt, div, floorInt, max, mul, PPM, ppmOf, rat, ratFromPpm, sub, toMicro, ZERO, type Rat } from "./decimal.ts";
import { feeMicro } from "./fees.ts";
import { assessFreshness, freshnessReasons, type SnapshotFreshness } from "./freshness.ts";
import {
  breakEvenSettlements, FUNDING_SCENARIOS, fundingFlowMicro, fundingIntervalHours, scenarioRatePpm, settlementSchedule, type FundingScenarioId,
} from "./funding.ts";
import { decideVerdict } from "./gate.ts";
import { priceLeg, type PricedLeg } from "./legs.ts";
import { initialMarginMicro, liquidationDistancePpm, liquidationPrice, stressRow, type StressRow } from "./margin.ts";
import type { CarryRoles, Evaluation, Role, Snapshot, Verdict } from "./types.ts";

// OpportunityEngine for the funding carry: long spot, short perpetual (linear SWAP), isolated margin.
// Pure function of a validated snapshot, an evaluation request and an explicit clock. No I/O.
//
// Every quantity is derived from exact rationals and rounded once, against the trader. A value that
// depends on an UNKNOWN or unusable input is null, never zero. See docs/OKX-DERIVATIVES-SPEC.md.

export type BasisScenarioId = "flat" | "converge" | "adverse";
export const BASIS_SCENARIOS: readonly BasisScenarioId[] = ["flat", "converge", "adverse"];
/** The scenario that gates the verdict. Convergence of the basis is never credited to it. */
export const CONSERVATIVE_SCENARIO_ID = "worst_observed|adverse";

export interface CarryLeg extends PricedLeg {
  /** Fee cost in ppm; null when UNKNOWN. */
  feePpm: bigint | null;
  feeMicro: bigint | null;
}

export interface CarryScenario {
  id: string;
  fundingId: FundingScenarioId;
  basisId: BasisScenarioId;
  components: { fundingMicro: bigint; executionCostMicro: bigint; basisCostMicro: bigint; feesMicro: bigint } | null;
  netMicro: bigint | null;
}

export interface CarryStressRow extends StressRow {
  id: string;
  /** True when the short leg was liquidated: the spot leg is left unhedged. */
  hedgeBroken: boolean;
  spotPnlMicro: bigint;
  /** Perp leg (capped at the margin) plus the spot leg; once the hedge is broken only a spot loss is credited. */
  creditedPnlMicro: bigint;
  pnlAfterCostsMicro: bigint | null;
  drawdownPpm: bigint | null;
}

export interface CarryLeverageRow {
  leverage: number;
  initialMarginMicro: bigint | null;
  capitalMicro: bigint | null;
  returnsPpm: Record<string, bigint | null>;
  liquidation: { priceExact: Rat; distancePpm: bigint } | null;
  stress: CarryStressRow[] | null;
  maxDrawdownPpm: bigint | null;
  shocksLiquidated: number | null;
  verdict: Verdict;
}

export interface CarryEvaluation {
  /** Reasons that apply to every leverage row. */
  reasons: string[];
  freshness: SnapshotFreshness;
  trade: { contracts: Rat; coin: Rat; coinCcy: string; quoteCcy: string; roles: CarryRoles; holdingSettlements: number };
  legs: { spotOpen: CarryLeg | null; perpOpen: CarryLeg | null; spotClose: CarryLeg | null; perpClose: CarryLeg | null };
  basis: { spotMid: Rat; perpMid: Rat; entryBasisPpm: bigint } | null;
  funding: {
    markPx: Rat;
    valuePerSettlement: Rat;
    intervalHours: 1 | 2 | 4 | 8 | null;
    schedule: { firstMs: number; lastMs: number } | null;
    historyCount: number;
    historyMaxAbsRatePpm: bigint | null;
    currentRatePpm: bigint;
    scenarios: Array<{ id: FundingScenarioId; ratePpm: bigint | null; flowMicro: bigint | null }>;
  };
  /** Execution cost plus the four fees at a flat basis; the fixed cost the funding must repay. */
  flatCostsMicro: bigint | null;
  scenarios: CarryScenario[];
  conservative: { scenarioId: string; netMicro: bigint | null; netOnNotionalPpm: bigint | null };
  breakEven: Array<{ id: FundingScenarioId; settlements: bigint | null; hours: bigint | null }> | null;
  leverageTable: CarryLeverageRow[];
}

type Market = "spot" | "perp";

const LEG_SPECS = [
  { name: "spotOpen", code: "spot_open", market: "spot", side: "buy" },
  { name: "perpOpen", code: "perp_open", market: "perp", side: "sell" },
  { name: "spotClose", code: "spot_close", market: "spot", side: "sell" },
  { name: "perpClose", code: "perp_close", market: "perp", side: "buy" },
] as const;

export function evaluateCarry(snapshot: Snapshot, evaluation: Evaluation, nowMs: number): CarryEvaluation {
  const { spot, perp } = snapshot;
  const policy = evaluation.policy;
  const roles = evaluation.carry.roles;
  const contracts = evaluation.carry.contracts;
  const holding = evaluation.holdingSettlements;
  const freshness = assessFreshness(snapshot, nowMs, policy);
  const reasons = new Set<string>();

  // Instrument support. The formulas assume a linear SWAP that settles in the spot quote currency.
  if (perp.ctType !== "linear") reasons.add("instrument:inverse_unsupported");
  if (perp.state !== "live" || spot.state !== "live") reasons.add("instrument:not_live");
  if (perp.ctValCcy !== spot.baseCcy) reasons.add("instrument:asset_mismatch");
  if (perp.settleCcy !== spot.quoteCcy) reasons.add("instrument:quote_mismatch");
  const instrumentBlocked = reasons.size > 0;

  // Access is a fact the operator must state.
  if (snapshot.access === "unknown") reasons.add("unknown:access_derivatives");
  else if (snapshot.access === "operator_denied") reasons.add("access:derivatives_denied");

  // Freshness of every timestamped input and the funding schedule.
  for (const reason of freshnessReasons(freshness, ["spot_book", "perp_book", "mark", "funding"], true)) reasons.add(reason);
  const funding = snapshot.funding;
  if (funding.fundingTimeMs <= nowMs) reasons.add("stale:funding_schedule");

  // Trade size: contracts to coins, then lot and minimum checks on both markets.
  const coin = coinQuantity(perp.ctVal, perp.ctMult, contracts);
  const perpSize = checkSize(contracts, perp.lotSz, perp.minSz);
  const spotSize = checkSize(coin, spot.lotSz, spot.minSz);
  if (perpSize === "lot") reasons.add("size:perp_lot");
  else if (perpSize !== "ok") reasons.add("size:perp_min");
  if (spotSize === "lot") reasons.add("size:spot_lot");
  else if (spotSize !== "ok") reasons.add("size:spot_min");
  const blocked = instrumentBlocked || perpSize !== "ok" || spotSize !== "ok";

  // Fees: every role in use, plus the perpetual taker fee that a forced liquidation charges.
  const feeRate = (market: Market, role: Role): bigint | null => {
    const pair = snapshot.fees[market];
    return role === "maker" ? pair.makerCostPpm : pair.takerCostPpm;
  };
  const legRoles: Record<(typeof LEG_SPECS)[number]["name"], Role> = {
    spotOpen: roles.spotOpen, perpOpen: roles.perpOpen, spotClose: roles.spotClose, perpClose: roles.perpClose,
  };
  for (const spec of LEG_SPECS) {
    const role = legRoles[spec.name];
    if (feeRate(spec.market, role) === null) reasons.add(`unknown:fee_${spec.market}_${role}`);
  }
  const perpTakerPpm = snapshot.fees.perp.takerCostPpm;
  if (perpTakerPpm === null) reasons.add("unknown:fee_perp_taker");
  const mmrPpm = snapshot.maintenanceMarginRatePpm;
  if (mmrPpm === null) reasons.add("unknown:maintenance_margin_rate");

  // Funding schedule and history.
  const intervalHours = fundingIntervalHours(funding.fundingTimeMs, funding.nextFundingTimeMs);
  if (intervalHours === null) reasons.add("funding:invalid_interval");
  const historyRates = funding.history.map((entry) => entry.rate);
  const historyOk = historyRates.length >= policy.minFundingObservations;
  if (!historyOk) reasons.add("funding:insufficient_history");
  const schedule = intervalHours === null ? null : settlementSchedule(funding.fundingTimeMs, intervalHours, holding);

  // Books: crossed books are reported once; an empty side leaves no mid and counts as insufficient depth.
  const spotBook = snapshot.books.spot;
  const perpBook = snapshot.books.perp;
  const crossed: Record<Market, boolean> = { spot: isCrossed(spotBook.bids, spotBook.asks), perp: isCrossed(perpBook.bids, perpBook.asks) };
  if (crossed.spot) reasons.add("book:crossed_spot");
  if (crossed.perp) reasons.add("book:crossed_perp");
  const mids: Record<Market, Rat | null> = { spot: midPrice(spotBook.bids, spotBook.asks), perp: midPrice(perpBook.bids, perpBook.asks) };

  const legs: CarryEvaluation["legs"] = { spotOpen: null, perpOpen: null, spotClose: null, perpClose: null };
  if (!blocked) {
    for (const spec of LEG_SPECS) {
      const book = spec.market === "spot" ? spotBook : perpBook;
      const role = legRoles[spec.name];
      const pricing = priceLeg({
        side: spec.side, role, bids: book.bids, asks: book.asks, mid: mids[spec.market],
        bookSize: spec.market === "spot" ? coin : contracts, coin,
      });
      if (!pricing.ok) {
        if (!(pricing.reason === "mid" && crossed[spec.market])) reasons.add(`depth:${spec.code}`);
        continue;
      }
      const rate = feeRate(spec.market, role);
      legs[spec.name] = { ...pricing.leg, feePpm: rate, feeMicro: rate === null ? null : feeMicro(rate, pricing.leg.notional) };
    }
  }
  const { spotOpen, perpOpen, spotClose, perpClose } = legs;

  const spotMid = mids.spot;
  const perpMid = mids.perp;
  const basis = !blocked && spotMid !== null && perpMid !== null
    ? { spotMid, perpMid, entryBasisPpm: ppmOf(div(sub(perpMid, spotMid), spotMid), "floor") }
    : null;

  // Funding scenarios for a short position, valued at the mark price.
  const valuePerSettlement = mul(coin, snapshot.mark.markPx);
  const fundingScenarios = FUNDING_SCENARIOS.map((id) => {
    let ratePpm: bigint | null = null;
    if (id === "zero") ratePpm = 0n;
    else if (historyOk && intervalHours !== null) ratePpm = scenarioRatePpm(id, historyRates, "short");
    const flowMicro = ratePpm === null ? null : fundingFlowMicro("short", valuePerSettlement, ratePpm, holding);
    return { id, ratePpm, flowMicro };
  });
  let historyMaxAbs: Rat | null = null;
  for (const rate of historyRates) {
    const magnitude = abs(rate);
    if (historyMaxAbs === null || magnitude.n * historyMaxAbs.d > historyMaxAbs.n * magnitude.d) historyMaxAbs = magnitude;
  }

  // Costs that do not depend on the funding or basis scenario.
  const executionCostMicro = spotOpen && perpOpen && spotClose && perpClose
    ? spotOpen.executionCostMicro + perpOpen.executionCostMicro + spotClose.executionCostMicro + perpClose.executionCostMicro
    : null;
  const fees = spotOpen && perpOpen && spotClose && perpClose && spotOpen.feeMicro !== null && perpOpen.feeMicro !== null && spotClose.feeMicro !== null
    && perpClose.feePpm !== null && perpClose.feeMicro !== null
    ? {
        spotOpen: spotOpen.feeMicro, perpOpen: perpOpen.feeMicro, spotClose: spotClose.feeMicro,
        perpClosePpm: perpClose.feePpm, perpCloseFlat: perpClose.feeMicro, perpCloseNotional: perpClose.notional,
      }
    : null;
  const flatCostsMicro = executionCostMicro !== null && fees !== null
    ? executionCostMicro + fees.spotOpen + fees.perpOpen + fees.spotClose + fees.perpCloseFlat
    : null;

  // Exit price shift of the perpetual per scenario, in quote per coin (positive hurts the short).
  const deltas: Record<BasisScenarioId, Rat> | null = basis === null ? null : {
    flat: ZERO,
    converge: sub(basis.spotMid, basis.perpMid),
    adverse: mul(ratFromPpm(policy.adverseBasisPpm), basis.spotMid),
  };

  const scenarios: CarryScenario[] = [];
  for (const fundingScenario of fundingScenarios) {
    for (const basisId of BASIS_SCENARIOS) {
      const delta = deltas === null ? null : deltas[basisId];
      let components: CarryScenario["components"] = null;
      let netMicro: bigint | null = null;
      if (fundingScenario.flowMicro !== null && delta !== null && executionCostMicro !== null && fees !== null) {
        // The closing fee of the perpetual is charged on the exit notional; a favorable shift never lowers it.
        const closeFee = feeMicro(fees.perpClosePpm, add(fees.perpCloseNotional, mul(coin, max(ZERO, delta))));
        components = {
          fundingMicro: fundingScenario.flowMicro,
          executionCostMicro,
          basisCostMicro: toMicro(mul(coin, delta), "ceil"),
          feesMicro: fees.spotOpen + fees.perpOpen + fees.spotClose + closeFee,
        };
        netMicro = components.fundingMicro - components.executionCostMicro - components.basisCostMicro - components.feesMicro;
      }
      scenarios.push({ id: `${fundingScenario.id}|${basisId}`, fundingId: fundingScenario.id, basisId, components, netMicro });
    }
  }

  const conservativeNet = scenarios.find((scenario) => scenario.id === CONSERVATIVE_SCENARIO_ID)?.netMicro ?? null;
  const perpNotionalMicro = perpOpen ? toMicro(perpOpen.notional, "ceil") : null;
  const netOnNotionalPpm = conservativeNet !== null && perpNotionalMicro !== null ? floorInt(rat(conservativeNet * PPM, perpNotionalMicro)) : null;

  const breakEven = flatCostsMicro === null ? null : fundingScenarios.map((entry) => {
    const settlements = entry.ratePpm === null ? null : breakEvenSettlements(flatCostsMicro, valuePerSettlement, entry.ratePpm, "short");
    return { id: entry.id, settlements, hours: settlements === null || intervalHours === null ? null : settlements * BigInt(intervalHours) };
  });

  // One row per leverage: the same trade, different margin.
  const entryPrice = perpOpen ? div(perpOpen.notional, coin) : null;
  const worstFlow = fundingScenarios.find((entry) => entry.id === "worst_observed")?.flowMicro ?? null;
  const fundingDragMicro = worstFlow === null ? null : worstFlow < 0n ? -worstFlow : 0n;
  const shockMoves = [
    ...policy.stressMovesPpm.map((ppm) => ({ ppm, gap: false })),
    { ppm: policy.stressGapPpm, gap: true },
  ];

  const leverageTable = evaluation.leverages.map((leverage): CarryLeverageRow => {
    const rowReasons = new Set(reasons);
    if (leverage > policy.maxLeverage) rowReasons.add("limit:leverage_above_cap");
    if (leverage > perp.maxLeverage) rowReasons.add("limit:leverage_above_instrument_max");

    const margin = perpOpen ? initialMarginMicro(perpOpen.notional, leverage) : null;
    const capital = spotOpen && perpOpen && spotOpen.feeMicro !== null && perpOpen.feeMicro !== null && margin !== null
      ? toMicro(spotOpen.notional, "ceil") + spotOpen.feeMicro + margin + perpOpen.feeMicro
      : null;
    const returnsPpm: Record<string, bigint | null> = {};
    for (const scenario of scenarios) {
      returnsPpm[scenario.id] = scenario.netMicro !== null && capital !== null ? floorInt(rat(scenario.netMicro * PPM, capital)) : null;
    }

    let liquidation: CarryLeverageRow["liquidation"] = null;
    if (entryPrice !== null && mmrPpm !== null && perpTakerPpm !== null) {
      liquidation = {
        priceExact: liquidationPrice("short", entryPrice, leverage, mmrPpm, perpTakerPpm),
        distancePpm: liquidationDistancePpm("short", leverage, mmrPpm, perpTakerPpm),
      };
      if (liquidation.distancePpm < BigInt(policy.minLiquidationDistancePpm)) rowReasons.add("limit:liquidation_distance_below_floor");
    }

    let stress: CarryStressRow[] | null = null;
    let maxDrawdownPpm: bigint | null = null;
    let shocksLiquidated: number | null = null;
    if (spotOpen && perpOpen && margin !== null && mmrPpm !== null && perpTakerPpm !== null) {
      stress = shockMoves.map(({ ppm, gap }): CarryStressRow => {
        const base = stressRow({
          side: "short", entryNotional: perpOpen.notional, initialMarginMicro: margin, leverage, mmrPpm, feePpm: perpTakerPpm, movePpm: BigInt(ppm), gap,
        });
        const spotPnlMicro = toMicro(mul(spotOpen.notional, ratFromPpm(ppm)), "floor");
        // Once the short leg is liquidated the spot leg is unhedged: an unrealized gain is not credited.
        const creditedPnlMicro = base.liquidated ? (spotPnlMicro < 0n ? spotPnlMicro : 0n) + base.perpLegPnlMicro : spotPnlMicro + base.perpLegPnlMicro;
        const pnlAfterCostsMicro = flatCostsMicro !== null && fundingDragMicro !== null ? creditedPnlMicro - flatCostsMicro - fundingDragMicro : null;
        const drawdownPpm = pnlAfterCostsMicro !== null && capital !== null
          ? ceilInt(rat((pnlAfterCostsMicro < 0n ? -pnlAfterCostsMicro : 0n) * PPM, capital))
          : null;
        return { ...base, id: `${gap ? "gap" : "move"}_${ppm}ppm`, hedgeBroken: base.liquidated, spotPnlMicro, creditedPnlMicro, pnlAfterCostsMicro, drawdownPpm };
      });
      shocksLiquidated = stress.filter((entry) => entry.liquidated).length;
      if (stress.every((entry) => entry.drawdownPpm !== null)) {
        maxDrawdownPpm = stress.reduce((worst, entry) => (entry.drawdownPpm as bigint > worst ? (entry.drawdownPpm as bigint) : worst), 0n);
      }
    }

    // The gate metric is the unlevered net over the perpetual notional: the same at every leverage.
    if (netOnNotionalPpm !== null && netOnNotionalPpm <= BigInt(policy.minNetOnNotionalPpm)) rowReasons.add("limit:net_conservative_return_not_above_buffer");

    return {
      leverage, initialMarginMicro: margin, capitalMicro: capital, returnsPpm, liquidation, stress, maxDrawdownPpm, shocksLiquidated,
      verdict: decideVerdict(rowReasons),
    };
  });

  return {
    reasons: [...decideVerdict(reasons).reasons],
    freshness,
    trade: { contracts, coin, coinCcy: perp.ctValCcy, quoteCcy: perp.settleCcy, roles, holdingSettlements: holding },
    legs,
    basis,
    funding: {
      markPx: snapshot.mark.markPx,
      valuePerSettlement,
      intervalHours,
      schedule,
      historyCount: historyRates.length,
      historyMaxAbsRatePpm: historyMaxAbs === null ? null : ppmOf(historyMaxAbs, "ceil"),
      currentRatePpm: ppmOf(funding.currentRate, "floor"),
      scenarios: fundingScenarios,
    },
    flatCostsMicro,
    scenarios,
    conservative: { scenarioId: CONSERVATIVE_SCENARIO_ID, netMicro: conservativeNet, netOnNotionalPpm },
    breakEven,
    leverageTable,
  };
}
