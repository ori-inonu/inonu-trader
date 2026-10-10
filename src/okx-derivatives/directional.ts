import { isCrossed, midPrice } from "./book.ts";
import { checkSize, coinQuantity } from "./contract.ts";
import { ceilInt, div, mul, PPM, rat, type Rat } from "./decimal.ts";
import { feeMicro } from "./fees.ts";
import { assessFreshness, freshnessReasons, type SnapshotFreshness } from "./freshness.ts";
import {
  FUNDING_SCENARIOS, fundingFlowMicro, fundingIntervalHours, scenarioRatePpm, settlementSchedule, type FundingScenarioId,
} from "./funding.ts";
import { decideVerdict } from "./gate.ts";
import { priceLeg, type PricedLeg } from "./legs.ts";
import { initialMarginMicro, liquidationDistancePpm, liquidationPrice, stressRow } from "./margin.ts";
import type { DirectionalRoles, Evaluation, PositionSide, Role, Snapshot, Verdict } from "./types.ts";

// A directional leveraged perpetual evaluated as RISK ONLY: liquidation distance, a stress table
// and the deterministic holding cost at a flat price. There is deliberately no profit, return or
// expected value anywhere in this module: leverage creates no edge, and a directional position has
// no modeled edge. Funding that the position would RECEIVE is not counted as a credit, so the
// holding cost never turns into a gain. The verdict is never "eligible".

export interface DirectionalLeg extends PricedLeg {
  feePpm: bigint | null;
  feeMicro: bigint | null;
}

export interface DirectionalStressRow {
  id: string;
  movePpm: bigint;
  gap: boolean;
  liquidated: boolean;
  remainingMarginMicro: bigint;
  /** Price-path loss of the perpetual, capped at the initial margin once liquidated. */
  lossMicro: bigint;
  lossBeyondMarginMicro: bigint;
  /** lossMicro as ppm of the initial margin, rounded up. */
  lossOfMarginPpm: bigint;
}

export interface DirectionalLeverageRow {
  leverage: number;
  initialMarginMicro: bigint | null;
  /** Initial margin plus the opening fee. */
  capitalCommittedMicro: bigint | null;
  liquidation: { priceExact: Rat; distancePpm: bigint } | null;
  stress: DirectionalStressRow[] | null;
  maxLossOfMarginPpm: bigint | null;
  /** Leverage within the cap and the instrument maximum, and distance at or above the floor; null when distance is unknown. */
  riskLimitsMet: boolean | null;
  verdict: Verdict;
}

export interface DirectionalHoldingCost {
  fundingId: FundingScenarioId;
  /** Market funding rate in ppm (positive: longs pay shorts), rounded against the side. */
  ratePpm: bigint | null;
  /** Funding paid over the holding horizon; received funding counts as zero. */
  fundingDragMicro: bigint | null;
  /** Execution cost plus fees plus funding drag at a flat price. */
  totalMicro: bigint | null;
}

export interface DirectionalEvaluation {
  reasons: string[];
  freshness: SnapshotFreshness;
  trade: { side: PositionSide; contracts: Rat; coin: Rat; coinCcy: string; quoteCcy: string; roles: DirectionalRoles; holdingSettlements: number };
  open: DirectionalLeg | null;
  close: DirectionalLeg | null;
  funding: { markPx: Rat; valuePerSettlement: Rat; intervalHours: 1 | 2 | 4 | 8 | null; schedule: { firstMs: number; lastMs: number } | null };
  executionCostMicro: bigint | null;
  feesMicro: bigint | null;
  holdingCosts: DirectionalHoldingCost[];
  leverageTable: DirectionalLeverageRow[];
}

export function evaluateDirectional(snapshot: Snapshot, evaluation: Evaluation, nowMs: number): DirectionalEvaluation | null {
  const request = evaluation.directional;
  if (request === null) return null;
  const { perp } = snapshot;
  const policy = evaluation.policy;
  const { side, contracts, roles } = request;
  const holding = evaluation.holdingSettlements;
  const freshness = assessFreshness(snapshot, nowMs, policy);
  const reasons = new Set<string>();

  if (perp.ctType !== "linear") reasons.add("instrument:inverse_unsupported");
  if (perp.state !== "live") reasons.add("instrument:not_live");
  const instrumentBlocked = reasons.size > 0;

  if (snapshot.access === "unknown") reasons.add("unknown:access_derivatives");
  else if (snapshot.access === "operator_denied") reasons.add("access:derivatives_denied");

  // Only the perpetual market and the funding data are used here: the spot book does not matter.
  for (const reason of freshnessReasons(freshness, ["perp_book", "mark", "funding"], false)) reasons.add(reason);
  const funding = snapshot.funding;
  if (funding.fundingTimeMs <= nowMs) reasons.add("stale:funding_schedule");

  const coin = coinQuantity(perp.ctVal, perp.ctMult, contracts);
  const sizeCheck = checkSize(contracts, perp.lotSz, perp.minSz);
  if (sizeCheck === "lot") reasons.add("size:perp_lot");
  else if (sizeCheck !== "ok") reasons.add("size:perp_min");
  const blocked = instrumentBlocked || sizeCheck !== "ok";

  const feeRate = (role: Role): bigint | null => (role === "maker" ? snapshot.fees.perp.makerCostPpm : snapshot.fees.perp.takerCostPpm);
  for (const role of [roles.open, roles.close]) {
    if (feeRate(role) === null) reasons.add(`unknown:fee_perp_${role}`);
  }
  const takerPpm = snapshot.fees.perp.takerCostPpm;
  if (takerPpm === null) reasons.add("unknown:fee_perp_taker");
  const mmrPpm = snapshot.maintenanceMarginRatePpm;
  if (mmrPpm === null) reasons.add("unknown:maintenance_margin_rate");

  const intervalHours = fundingIntervalHours(funding.fundingTimeMs, funding.nextFundingTimeMs);
  if (intervalHours === null) reasons.add("funding:invalid_interval");
  const historyRates = funding.history.map((entry) => entry.rate);
  const historyOk = historyRates.length >= policy.minFundingObservations;
  if (!historyOk) reasons.add("funding:insufficient_history");
  const schedule = intervalHours === null ? null : settlementSchedule(funding.fundingTimeMs, intervalHours, holding);

  const book = snapshot.books.perp;
  const crossed = isCrossed(book.bids, book.asks);
  if (crossed) reasons.add("book:crossed_perp");
  const mid = midPrice(book.bids, book.asks);

  // A long opens by buying (asks) and closes by selling (bids); a short is the reverse.
  const legFor = (name: "open" | "close"): DirectionalLeg | null => {
    if (blocked) return null;
    const role = roles[name];
    const buying = (side === "long") === (name === "open");
    const pricing = priceLeg({ side: buying ? "buy" : "sell", role, bids: book.bids, asks: book.asks, mid, bookSize: contracts, coin });
    if (!pricing.ok) {
      if (!(pricing.reason === "mid" && crossed)) reasons.add(`depth:perp_${name}`);
      return null;
    }
    const rate = feeRate(role);
    return { ...pricing.leg, feePpm: rate, feeMicro: rate === null ? null : feeMicro(rate, pricing.leg.notional) };
  };
  const open = legFor("open");
  const close = legFor("close");

  const executionCostMicro = open && close ? open.executionCostMicro + close.executionCostMicro : null;
  const feesMicro = open && close && open.feeMicro !== null && close.feeMicro !== null ? open.feeMicro + close.feeMicro : null;

  const valuePerSettlement = mul(coin, snapshot.mark.markPx);
  const holdingCosts = FUNDING_SCENARIOS.map((fundingId): DirectionalHoldingCost => {
    let ratePpm: bigint | null = null;
    if (fundingId === "zero") ratePpm = 0n;
    else if (historyOk && intervalHours !== null) ratePpm = scenarioRatePpm(fundingId, historyRates, side);
    const flow = ratePpm === null ? null : fundingFlowMicro(side, valuePerSettlement, ratePpm, holding);
    const fundingDragMicro = flow === null ? null : flow < 0n ? -flow : 0n;
    const totalMicro = fundingDragMicro !== null && executionCostMicro !== null && feesMicro !== null ? executionCostMicro + feesMicro + fundingDragMicro : null;
    return { fundingId, ratePpm, fundingDragMicro, totalMicro };
  });

  const entryPrice = open ? div(open.notional, coin) : null;
  const shockMoves = [
    ...policy.stressMovesPpm.map((ppm) => ({ ppm, gap: false })),
    { ppm: policy.stressGapPpm, gap: true },
  ];

  const leverageTable = evaluation.leverages.map((leverage): DirectionalLeverageRow => {
    const rowReasons = new Set(reasons);
    rowReasons.add("model:directional_no_modeled_edge");
    const aboveCap = leverage > policy.maxLeverage;
    const aboveInstrument = leverage > perp.maxLeverage;
    if (aboveCap) rowReasons.add("limit:leverage_above_cap");
    if (aboveInstrument) rowReasons.add("limit:leverage_above_instrument_max");

    const margin = open ? initialMarginMicro(open.notional, leverage) : null;
    const capitalCommittedMicro = margin !== null && open && open.feeMicro !== null ? margin + open.feeMicro : null;

    let liquidation: DirectionalLeverageRow["liquidation"] = null;
    if (entryPrice !== null && mmrPpm !== null && takerPpm !== null) {
      liquidation = {
        priceExact: liquidationPrice(side, entryPrice, leverage, mmrPpm, takerPpm),
        distancePpm: liquidationDistancePpm(side, leverage, mmrPpm, takerPpm),
      };
      if (liquidation.distancePpm < BigInt(policy.minLiquidationDistancePpm)) rowReasons.add("limit:liquidation_distance_below_floor");
    }

    let stress: DirectionalStressRow[] | null = null;
    let maxLossOfMarginPpm: bigint | null = null;
    if (open && margin !== null && mmrPpm !== null && takerPpm !== null) {
      stress = shockMoves.map(({ ppm, gap }): DirectionalStressRow => {
        const base = stressRow({ side, entryNotional: open.notional, initialMarginMicro: margin, leverage, mmrPpm, feePpm: takerPpm, movePpm: BigInt(ppm), gap });
        const lossMicro = -base.perpLegPnlMicro;
        return {
          id: `${gap ? "gap" : "move"}_${ppm}ppm`,
          movePpm: base.movePpm,
          gap,
          liquidated: base.liquidated,
          remainingMarginMicro: base.remainingMarginMicro,
          lossMicro,
          lossBeyondMarginMicro: base.lossBeyondMarginMicro,
          lossOfMarginPpm: ceilInt(rat(lossMicro * PPM, margin)),
        };
      });
      maxLossOfMarginPpm = stress.reduce((worst, entry) => (entry.lossOfMarginPpm > worst ? entry.lossOfMarginPpm : worst), 0n);
    }

    const riskLimitsMet = liquidation === null
      ? null
      : !aboveCap && !aboveInstrument && liquidation.distancePpm >= BigInt(policy.minLiquidationDistancePpm);

    return { leverage, initialMarginMicro: margin, capitalCommittedMicro, liquidation, stress, maxLossOfMarginPpm, riskLimitsMet, verdict: decideVerdict(rowReasons) };
  });

  return {
    reasons: [...decideVerdict(reasons).reasons],
    freshness,
    trade: { side, contracts, coin, coinCcy: perp.ctValCcy, quoteCcy: perp.settleCcy, roles, holdingSettlements: holding },
    open,
    close,
    funding: { markPx: snapshot.mark.markPx, valuePerSettlement, intervalHours, schedule },
    executionCostMicro,
    feesMicro,
    holdingCosts,
    leverageTable,
  };
}
