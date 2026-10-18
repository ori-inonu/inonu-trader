import type { DerivativesVenueAdapter } from "./adapter.ts";
import {
  CONSERVATIVE_SCENARIO_ID, evaluateCarry, type CarryEvaluation, type CarryLeg, type CarryLeverageRow,
} from "./carry.ts";
import { formatMicro, formatRat, safeNumber, toMicro, type Rat, type Rounding } from "./decimal.ts";
import { evaluateDirectional, type DirectionalEvaluation, type DirectionalLeg } from "./directional.ts";
import type { ComponentFreshness } from "./freshness.ts";
import type { Role, Snapshot, Verdict } from "./types.ts";

// Builds the JSON report. Money is an exact 6-decimal string (field names end in Quote), ratios
// are integer ppm (names end in Ppm), prices are decimal strings with at most ten fractional
// digits rounded against the trader. A figure that depends on an unknown input is null.

export const REPORT_NOTES = {
  always: [
    "Avaliação offline e somente leitura: sem ordens, assinaturas, credenciais ou chamadas de rede. O veredito não é autorização financeira.",
    "Nenhum retorno é previsto ou prometido; cenários são hipóteses e a média recente não é uma previsão.",
    "Alavancagem não altera o lucro em cotação do mesmo trade: só reduz o capital comprometido e aproxima o preço de liquidação.",
    "A liquidação usa um modelo simplificado de margem isolada, não a fórmula exata da OKX; leia a distância como estimativa otimista.",
    "O livro na saída é suposto igual ao atual, e o funding usa o mark e o intervalo atuais, constantes durante a retenção.",
    "Valores desconhecidos aparecem como null e impedem a aprovação; nunca são tratados como zero.",
    "Arredondamento sempre contra o trader: custos e capital para cima; ganhos, retornos e margem restante para baixo.",
  ],
  maker: "Pernas maker são supostas executadas no ponto médio, sem crédito de spread e sem risco de fila ou de não execução.",
  synthetic: "Entrada sintética: todos os valores são inventados e não descrevem nenhum mercado real da OKX.",
  claimed: "Entrada informada pelo operador e não verificada contra a OKX: a origem dos valores não foi autenticada.",
  directional: "O ramo direcional é somente risco: sem lucro, retorno ou valor esperado, e o funding recebido não é contado como crédito.",
} as const;

interface VerdictReport {
  status: Verdict["status"];
  reasons: string[];
}

const money = (value: bigint | null): string | null => (value === null ? null : formatMicro(value));
const ppm = (value: bigint | null): number | null => (value === null ? null : safeNumber(value));
const price = (value: Rat, mode: Rounding): string => formatRat(value, 10, mode);
/** Parsed inputs have at most 18 fractional digits, so this rendering is exact. */
const exact = (value: Rat): string => formatRat(value, 18, "floor");
const verdictReport = (verdict: Verdict): VerdictReport => ({ status: verdict.status, reasons: [...verdict.reasons] });

function legReport(leg: CarryLeg | DirectionalLeg | null) {
  if (leg === null) return null;
  // Prices the trader pays round up and prices the trader receives round down.
  const mode: Rounding = leg.side === "buy" ? "ceil" : "floor";
  return {
    role: leg.role,
    side: leg.side,
    avgPrice: price(leg.avgPrice, mode),
    worstPrice: leg.worstPrice === null ? null : price(leg.worstPrice, mode),
    touchPrice: price(leg.touchPrice, mode),
    notionalQuote: formatMicro(toMicro(leg.notional, mode)),
    slippagePpm: safeNumber(leg.slippagePpm),
    executionCostQuote: formatMicro(leg.executionCostMicro),
    feePpm: ppm(leg.feePpm),
    feeQuote: money(leg.feeMicro),
  };
}

function freshnessReport(entry: ComponentFreshness) {
  return { tsMs: entry.tsMs, ageMs: entry.ageMs, status: entry.status };
}

function carryRowReport(row: CarryLeverageRow) {
  const returnsPpm: Record<string, number | null> = {};
  for (const [id, value] of Object.entries(row.returnsPpm)) returnsPpm[id] = ppm(value);
  return {
    leverage: row.leverage,
    initialMarginQuote: money(row.initialMarginMicro),
    capitalCommittedQuote: money(row.capitalMicro),
    returnsPpm,
    liquidation: row.liquidation === null ? null : { price: price(row.liquidation.priceExact, "floor"), distancePpm: safeNumber(row.liquidation.distancePpm) },
    stress: row.stress === null ? null : row.stress.map((entry) => ({
      id: entry.id,
      kind: entry.gap ? "gap" : "move",
      movePpm: safeNumber(entry.movePpm),
      liquidated: entry.liquidated,
      hedgeBroken: entry.hedgeBroken,
      remainingMarginQuote: formatMicro(entry.remainingMarginMicro),
      perpLegPnlQuote: formatMicro(entry.perpLegPnlMicro),
      spotPnlQuote: formatMicro(entry.spotPnlMicro),
      creditedPnlQuote: formatMicro(entry.creditedPnlMicro),
      lossBeyondMarginQuote: formatMicro(entry.lossBeyondMarginMicro),
      pnlAfterCostsQuote: money(entry.pnlAfterCostsMicro),
      drawdownPpm: ppm(entry.drawdownPpm),
    })),
    maxDrawdownPpm: ppm(row.maxDrawdownPpm),
    shocksLiquidated: row.shocksLiquidated,
    verdict: verdictReport(row.verdict),
  };
}

function carryReport(carry: CarryEvaluation) {
  const hoursPerSettlement = carry.funding.intervalHours;
  const leverages = (status: Verdict["status"]) => carry.leverageTable.filter((row) => row.verdict.status === status).map((row) => row.leverage);
  return {
    strategy: "funding_carry_long_spot_short_perp",
    summary: { eligible: leverages("eligible"), ineligible: leverages("ineligible"), unavailable: leverages("unavailable") },
    // The same trade at each leverage: the profit in quote never changes, return on capital and risk do.
    comparison: carry.leverageTable.map((row) => ({
      leverage: row.leverage,
      capitalCommittedQuote: money(row.capitalMicro),
      conservativeNetQuote: money(carry.conservative.netMicro),
      conservativeReturnPpm: ppm(row.returnsPpm[carry.conservative.scenarioId] ?? null),
      liquidationDistancePpm: row.liquidation === null ? null : safeNumber(row.liquidation.distancePpm),
      shocksLiquidated: row.shocksLiquidated,
      maxDrawdownPpm: ppm(row.maxDrawdownPpm),
      status: row.verdict.status,
      reasons: [...row.verdict.reasons],
    })),
    conservative: { scenarioId: carry.conservative.scenarioId, netQuote: money(carry.conservative.netMicro), netOnNotionalPpm: ppm(carry.conservative.netOnNotionalPpm) },
    trade: {
      contracts: exact(carry.trade.contracts),
      coinQty: exact(carry.trade.coin),
      coinCcy: carry.trade.coinCcy,
      quoteCcy: carry.trade.quoteCcy,
      holdingSettlements: carry.trade.holdingSettlements,
      roles: { ...carry.trade.roles },
    },
    reasons: [...carry.reasons],
    legs: {
      spotOpen: legReport(carry.legs.spotOpen),
      perpOpen: legReport(carry.legs.perpOpen),
      spotClose: legReport(carry.legs.spotClose),
      perpClose: legReport(carry.legs.perpClose),
    },
    basis: carry.basis === null ? null : { spotMid: price(carry.basis.spotMid, "floor"), perpMid: price(carry.basis.perpMid, "floor"), entryBasisPpm: safeNumber(carry.basis.entryBasisPpm) },
    funding: {
      markPx: exact(carry.funding.markPx),
      valuePerSettlementQuote: formatMicro(toMicro(carry.funding.valuePerSettlement, "floor")),
      intervalHours: carry.funding.intervalHours,
      schedule: carry.funding.schedule === null || hoursPerSettlement === null ? null : {
        firstSettlementMs: carry.funding.schedule.firstMs,
        lastSettlementMs: carry.funding.schedule.lastMs,
        holdingHours: hoursPerSettlement * carry.trade.holdingSettlements,
      },
      historyCount: carry.funding.historyCount,
      historyMaxAbsRatePpm: ppm(carry.funding.historyMaxAbsRatePpm),
      currentRatePpm: safeNumber(carry.funding.currentRatePpm),
      scenarios: carry.funding.scenarios.map((entry) => ({ id: entry.id, ratePpm: ppm(entry.ratePpm), flowQuote: money(entry.flowMicro) })),
    },
    scenarios: carry.scenarios.map((scenario) => ({
      id: scenario.id,
      funding: scenario.fundingId,
      basis: scenario.basisId,
      fundingQuote: money(scenario.components?.fundingMicro ?? null),
      executionCostQuote: money(scenario.components?.executionCostMicro ?? null),
      basisCostQuote: money(scenario.components?.basisCostMicro ?? null),
      feesQuote: money(scenario.components?.feesMicro ?? null),
      netQuote: money(scenario.netMicro),
    })),
    flatCostsQuote: money(carry.flatCostsMicro),
    breakEven: carry.breakEven === null ? null : carry.breakEven.map((entry) => ({ id: entry.id, settlements: ppm(entry.settlements), hours: ppm(entry.hours) })),
    leverageTable: carry.leverageTable.map(carryRowReport),
  };
}

function directionalReport(directional: DirectionalEvaluation) {
  const rounding: Rounding = directional.trade.side === "long" ? "ceil" : "floor";
  return {
    strategy: "directional_perp_risk_only",
    modeledEdge: "none",
    // Risk only: margin, distance to liquidation and the share of margin lost; never a profit figure.
    comparison: directional.leverageTable.map((row) => ({
      leverage: row.leverage,
      initialMarginQuote: money(row.initialMarginMicro),
      liquidationDistancePpm: row.liquidation === null ? null : safeNumber(row.liquidation.distancePpm),
      maxLossOfMarginPpm: ppm(row.maxLossOfMarginPpm),
      riskLimitsMet: row.riskLimitsMet,
      status: row.verdict.status,
      reasons: [...row.verdict.reasons],
    })),
    trade: {
      side: directional.trade.side,
      contracts: exact(directional.trade.contracts),
      coinQty: exact(directional.trade.coin),
      coinCcy: directional.trade.coinCcy,
      quoteCcy: directional.trade.quoteCcy,
      holdingSettlements: directional.trade.holdingSettlements,
      roles: { ...directional.trade.roles },
    },
    reasons: [...directional.reasons],
    legs: { open: legReport(directional.open), close: legReport(directional.close) },
    executionCostQuote: money(directional.executionCostMicro),
    feesQuote: money(directional.feesMicro),
    holdingCostAtFlatPrice: directional.holdingCosts.map((entry) => ({
      fundingId: entry.fundingId,
      ratePpm: ppm(entry.ratePpm),
      fundingDragQuote: money(entry.fundingDragMicro),
      totalQuote: money(entry.totalMicro),
    })),
    leverageTable: directional.leverageTable.map((row) => ({
      leverage: row.leverage,
      initialMarginQuote: money(row.initialMarginMicro),
      capitalCommittedQuote: money(row.capitalCommittedMicro),
      liquidation: row.liquidation === null ? null : { price: price(row.liquidation.priceExact, rounding), distancePpm: safeNumber(row.liquidation.distancePpm) },
      stress: row.stress === null ? null : row.stress.map((entry) => ({
        id: entry.id,
        kind: entry.gap ? "gap" : "move",
        movePpm: safeNumber(entry.movePpm),
        liquidated: entry.liquidated,
        remainingMarginQuote: formatMicro(entry.remainingMarginMicro),
        lossQuote: formatMicro(entry.lossMicro),
        lossBeyondMarginQuote: formatMicro(entry.lossBeyondMarginMicro),
        lossOfMarginPpm: safeNumber(entry.lossOfMarginPpm),
      })),
      maxLossOfMarginPpm: ppm(row.maxLossOfMarginPpm),
      riskLimitsMet: row.riskLimitsMet,
      verdict: verdictReport(row.verdict),
    })),
  };
}

/** Names of the unknown-able facts that were left unknown. */
function unknownInputs(snapshot: Snapshot): string[] {
  const unknown: string[] = [];
  if (snapshot.access === "unknown") unknown.push("access.derivatives");
  for (const market of ["spot", "perp"] as const) {
    if (snapshot.fees[market].makerCostPpm === null) unknown.push(`fees.${market}.makerCost`);
    if (snapshot.fees[market].takerCostPpm === null) unknown.push(`fees.${market}.takerCost`);
  }
  if (snapshot.maintenanceMarginRatePpm === null) unknown.push("maintenanceMarginRate");
  return unknown.sort();
}

export function buildDerivativesReport(adapter: DerivativesVenueAdapter, nowMs: number) {
  const snapshot = adapter.snapshot();
  const evaluation = adapter.evaluation();
  const carry = evaluateCarry(snapshot, evaluation, nowMs);
  const directional = evaluateDirectional(snapshot, evaluation, nowMs);
  const roles: Role[] = [...Object.values(evaluation.carry.roles), ...(evaluation.directional === null ? [] : Object.values(evaluation.directional.roles))];
  const notes: string[] = [...REPORT_NOTES.always];
  if (roles.includes("maker")) notes.push(REPORT_NOTES.maker);
  notes.push(adapter.sourceClaim === "synthetic" ? REPORT_NOTES.synthetic : REPORT_NOTES.claimed);
  if (directional !== null) notes.push(REPORT_NOTES.directional);
  const { perp, spot } = snapshot;
  const { policy } = evaluation;

  return {
    schema: "okx_derivatives_report_v1",
    source: adapter.sourceClaim,
    mode: adapter.mode,
    externalAccessObserved: false,
    liveQualified: false,
    financiallyAuthorized: false,
    execution: "not_qualified",
    generatedAtMs: nowMs,
    inputSha256: adapter.inputSha256(),
    // The answer first: what is unknown, the stated limits and the two strategies. Reference blocks follow.
    unknownInputs: unknownInputs(snapshot),
    notes,
    carry: carryReport(carry),
    directional: directional === null ? null : directionalReport(directional),
    model: {
      marginMode: "isolated",
      contractType: "linear_swap",
      liquidationModel: "simplified_isolated_v1",
      liquidationModelIsExchangeFormula: false,
      liquidationFormulaShort: "P_liq = entry * (1 + 1/L) / (1 + mmr + closeFee)",
      liquidationFormulaLong: "P_liq = entry * (1 - 1/L) / (1 - mmr - closeFee)",
      rounding: "against_trader",
      conservativeScenarioId: CONSERVATIVE_SCENARIO_ID,
      gateMetric: "conservative_net_over_perp_notional_ppm",
    },
    policy: {
      maxLeverage: policy.maxLeverage,
      minLiquidationDistancePpm: policy.minLiquidationDistancePpm,
      minNetOnNotionalPpm: policy.minNetOnNotionalPpm,
      maxSnapshotAgeMs: policy.maxSnapshotAgeMs,
      maxBookSkewMs: policy.maxBookSkewMs,
      minFundingObservations: policy.minFundingObservations,
      adverseBasisPpm: policy.adverseBasisPpm,
      stressMovesPpm: [...policy.stressMovesPpm],
      stressGapPpm: policy.stressGapPpm,
    },
    instrument: {
      quoteCcy: perp.settleCcy,
      perp: {
        instId: perp.instId, ctType: perp.ctType, ctVal: exact(perp.ctVal), ctMult: exact(perp.ctMult), ctValCcy: perp.ctValCcy, settleCcy: perp.settleCcy,
        tickSz: exact(perp.tickSz), lotSz: exact(perp.lotSz), minSz: exact(perp.minSz), maxLeverage: perp.maxLeverage, state: perp.state,
      },
      spot: {
        instId: spot.instId, baseCcy: spot.baseCcy, quoteCcy: spot.quoteCcy, tickSz: exact(spot.tickSz), lotSz: exact(spot.lotSz), minSz: exact(spot.minSz), state: spot.state,
      },
    },
    freshness: {
      spotBook: freshnessReport(carry.freshness.spotBook),
      perpBook: freshnessReport(carry.freshness.perpBook),
      mark: freshnessReport(carry.freshness.mark),
      funding: freshnessReport(carry.freshness.funding),
      booksSkewMs: carry.freshness.booksSkewMs,
      skewExceeded: carry.freshness.skewExceeded,
    },
    units: {
      money: "decimal string with exactly 6 fractional digits in the quote currency",
      ratio: "integer ppm (1e-6)",
      price: "decimal string with at most 10 fractional digits, rounded against the trader",
      size: "exact decimal string",
    },
    adapter: {
      venue: adapter.venue,
      kind: adapter.adapterKind,
      apiVersion: adapter.apiVersion,
      capabilities: { ...adapter.capabilities, blockers: [...adapter.capabilities.blockers] },
    },
  };
}

export type DerivativesReport = ReturnType<typeof buildDerivativesReport>;
