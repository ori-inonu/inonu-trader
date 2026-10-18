/**
 * Point-in-time outcome engine of the Jev Decision Lab, with the single table of conservative cost defaults and the
 * leverage counterfactual. Specification: docs/JEV-LABORATORIO-DE-DECISAO.md sections 5 and 6.
 *
 * An outcome measures what a hypothetical decision taken at `t` WOULD have returned. It may read data only up to the
 * horizon end plus `captureLagMs`; the only reads of the future in the whole lab happen here, through
 * `DataSource.future()`, and never while a decision window is open.
 *
 * Liquidation reuses `liquidationRatio` of src/okx-derivatives/margin.ts (the same simplified isolated margin model
 * as the offline evaluator) and adds the funding already PAID to the numerator, which only brings the liquidation
 * price closer. No order is placed, nothing is signed, nothing leaves the process.
 *
 * Unknown stays unknown: an incomplete outcome carries `null` numbers and a reason, never zeros.
 */

import { liquidationRatio } from "../okx-derivatives/margin.ts";
import type { CandleData, CaptureRecord, FundingData } from "./capture-format.ts";
import type { DataSource, FutureWindow } from "./source.ts";
import {
 LEVERAGES,
 YEAR_MS,
 deepFreeze,
 type CandidateCosts,
 type Epoch,
 type IncompleteReason,
 type LabCandidate,
 type LabModality,
 type LeverageOutcome,
 type Outcome,
} from "./types.ts";

type Market = "spot" | "perp";

export interface CostTable {
 readonly schema: "jev-lab-costs-v1";
 /** Taker fee per side and per leg, in bps. Every leg is taker (conservative). */
 readonly feeTakerBps: { readonly spot: number; readonly perp: number };
 /** Slippage proxy per side and per leg, in bps. */
 readonly slippageBpsPerSide: number;
 /** Fixed cost of one round trip in USD; null is UNKNOWN (no data model for the modality yet). */
 readonly fixedUsdPerRoundTrip: Readonly<Record<LabModality, number | null>>;
 /** Cash yield forgone by committed capital (the hold baseline earns it): T-bill 3 months, R3. */
 readonly cashYieldAnnual: number;
 /** Maintenance margin rate used by the liquidation model (R3 reference, not a venue tier table). */
 readonly maintenanceMarginRate: number;
 /** How long after the horizon end the exit bar may still be recorded. */
 readonly captureLagMs: number;
 /** Reference size that turns fixed and inference USD costs into fractions. */
 readonly notionalUsd: number;
 /** How far before the decision the funding announcements are read (the first settlement may be announced earlier). */
 readonly fundingLookbackMs: number;
}

/** THE table of conservative defaults. Every number the outcome engine assumes about costs is here. */
export const COST_TABLE: CostTable = deepFreeze({
 schema: "jev-lab-costs-v1" as const,
 feeTakerBps: { spot: 10, perp: 5 },
 slippageBpsPerSide: 1,
 fixedUsdPerRoundTrip: {
  "funding-carry": 0,
  "perp-directional": 0,
  "spot-momentum": 0,
  "yield-allocation": null,
  "dex-signal": null,
  "kuru-maker": null,
 },
 cashYieldAnnual: 0.0405,
 maintenanceMarginRate: 0.0125,
 captureLagMs: 5_000,
 notionalUsd: 100,
 fundingLookbackMs: 2 * 86_400_000,
});

/** The legs of each modality. Modalities without data in the capture format have none: they are unsupported. */
export const MODALITY_LEGS: Readonly<Record<LabModality, readonly Market[]>> = deepFreeze({
 "funding-carry": ["spot", "perp"] as Market[],
 "perp-directional": ["perp"] as Market[],
 "spot-momentum": ["spot"] as Market[],
 "yield-allocation": [] as Market[],
 "dex-signal": [] as Market[],
 "kuru-maker": [] as Market[],
});

const LEVERAGEABLE: ReadonlySet<LabModality> = new Set<LabModality>(["funding-carry", "perp-directional"]);

/**
 * Costs of a candidate from the spreads observed at decision time. Components that cannot be known are null and the
 * costs are then NOT complete: the candidate is ineligible and nothing treats the gap as zero.
 */
export function candidateCosts(modality: LabModality, spreads: { spot: number | null; perp: number | null }, table: CostTable = COST_TABLE): CandidateCosts {
 const legs = MODALITY_LEGS[modality];
 const fixedUsd = table.fixedUsdPerRoundTrip[modality];
 if (legs.length === 0) return { feeBps: null, spreadBps: null, slippageBps: null, fixedUsd, notionalUsd: table.notionalUsd, complete: false };
 const feeBps = legs.reduce((sum, leg) => sum + 2 * table.feeTakerBps[leg], 0);
 const slippageBps = legs.length * 2 * table.slippageBpsPerSide;
 let spreadBps: number | null = 0;
 for (const leg of legs) {
  const spread = spreads[leg];
  if (spread === null || !Number.isFinite(spread) || spread < 0) {
   spreadBps = null;
   break;
  }
  spreadBps += spread;
 }
 return { feeBps, spreadBps, slippageBps, fixedUsd, notionalUsd: table.notionalUsd, complete: spreadBps !== null && fixedUsd !== null };
}

/** Capital committed per unit of notional: directional 1/L, carry 1 + 1/L (spot in full plus perp margin), spot 1. null if not applicable. */
export function capitalPerNotional(modality: LabModality, leverage = 1): number | null {
 if (modality === "perp-directional") return 1 / leverage;
 if (modality === "funding-carry") return 1 + 1 / leverage;
 if (modality === "spot-momentum") return leverage === 1 ? 1 : null;
 return null;
}

export interface OutcomeParams {
 barMs: number;
 horizonMs: number;
 executionDelayMs: number;
 table?: CostTable;
}

function ceilTo(value: number, multiple: number): number {
 return Math.ceil(value / multiple) * multiple;
}

/** Start of the entry bar: one execution delay after the decision, on the bar grid. */
export function entryStartFor(t: number, params: OutcomeParams): number {
 return ceilTo(t + params.executionDelayMs, params.barMs);
}

/** End of the holding window. */
export function exitFor(t: number, params: OutcomeParams): number {
 return entryStartFor(t, params) + params.horizonMs;
}

export interface FundingPayment {
 settleMs: number;
 /** Funding PAID, as a fraction of the notional (at or above zero). Funding received is never credited on the path. */
 paid: number;
}

export interface ScanBar {
 endMs: number;
 high: number;
 low: number;
}

export interface ScanInput {
 side: "long" | "short";
 entryPrice: number;
 leverage: number;
 maintenanceMarginPpm: bigint;
 feePpm: bigint;
 bars: readonly ScanBar[];
 fundingPayments: readonly FundingPayment[];
}

export interface ScanResult {
 liquidated: boolean;
 /** End of the first bar that liquidated the position. */
 atMs: number | null;
 /** Funding paid up to that bar (or up to the last bar when not liquidated). */
 fundingPaid: number;
 /** Liquidation price before any funding was paid: entry * liquidationRatio of okx-derivatives. */
 liquidationPrice: number;
}

/**
 * Walks the bars in order. Liquidation price of a long: entry * (ratio + F / (1 - m - f)); of a short:
 * entry * (ratio - F / (1 + m + f)), with `ratio` from okx-derivatives and F the funding paid so far. A payment is
 * applied to the bar whose end is at or after the settlement and to every later bar. The test is on the bar extreme
 * (low for a long, high for a short), so with the exact bridge extremes of the synthetic source it reproduces
 * continuous monitoring.
 */
const RATIO_CACHE = new Map<string, number>();

/** liquidationRatio of okx-derivatives as a number, memoized: the same few combinations are asked for thousands of times. */
function liquidationRatioNumber(side: "long" | "short", leverage: number, maintenanceMarginPpm: bigint, feePpm: bigint): number {
 const key = `${side}|${leverage}|${maintenanceMarginPpm}|${feePpm}`;
 const cached = RATIO_CACHE.get(key);
 if (cached !== undefined) return cached;
 const exact = liquidationRatio(side, leverage, maintenanceMarginPpm, feePpm);
 const value = Number(exact.n) / Number(exact.d);
 RATIO_CACHE.set(key, value);
 return value;
}

export function scanLiquidation(input: ScanInput): ScanResult {
 const ratio = liquidationRatioNumber(input.side, input.leverage, input.maintenanceMarginPpm, input.feePpm);
 const costs = Number(input.maintenanceMarginPpm + input.feePpm) / 1e6;
 const denominator = input.side === "long" ? 1 - costs : 1 + costs;
 const base = input.entryPrice * ratio;
 const payments = [...input.fundingPayments].sort((a, b) => a.settleMs - b.settleMs);
 for (const payment of payments) {
  if (!Number.isFinite(payment.paid) || payment.paid < 0) throw new RangeError("funding paid must be a finite number at or above zero");
 }
 let pointer = 0;
 let paid = 0;
 for (const bar of input.bars) {
  while (pointer < payments.length && (payments[pointer] as FundingPayment).settleMs <= bar.endMs) {
   paid += (payments[pointer] as FundingPayment).paid;
   pointer += 1;
  }
  const adjusted = input.side === "long" ? ratio + paid / denominator : ratio - paid / denominator;
  const price = input.entryPrice * adjusted;
  const touched = input.side === "long" ? bar.low <= price : bar.high >= price;
  if (touched) return { liquidated: true, atMs: bar.endMs, fundingPaid: paid, liquidationPrice: base };
 }
 return { liquidated: false, atMs: null, fundingPaid: paid, liquidationPrice: base };
}

function leverageRows(modality: LabModality, fill: (leverage: (typeof LEVERAGES)[number]) => { liquidated: boolean | null; equityMultiple: number | null }): LeverageOutcome[] {
 const applicable = LEVERAGEABLE.has(modality);
 return LEVERAGES.map((leverage) => ({ leverage, applicable, ...(applicable ? fill(leverage) : { liquidated: null, equityMultiple: null }) }));
}

function incomplete(candidate: LabCandidate, epochId: string, reason: IncompleteReason, entryMs: number | null, horizonEndMs: number): Outcome {
 return {
  epochId,
  candidateId: candidate.id,
  entryMs,
  horizonEndMs,
  grossReturn: null,
  fundingReturn: null,
  costReturn: null,
  opportunityCost: null,
  netReturn: null,
  capitalPerNotional: null,
  leverage: leverageRows(candidate.modality, () => ({ liquidated: null, equityMultiple: null })),
  complete: false,
  incompleteReason: reason,
 };
}

interface FundingFlows {
 /** Market rates (positive: longs pay shorts) of every settlement inside the holding window. */
 settlements: Array<{ settleMs: number; rate: number }>;
}

/**
 * The settlements of the holding window and their final rates. The final rate of a settlement is the LAST record
 * stamped for it inside the window of data. The expected schedule is derived from a reference record
 * (settleMs + k * interval) and united with every observed settlement, so a skipped period is detected.
 * Returns null when any expected settlement has no rate.
 */
function fundingFor(records: readonly CaptureRecord[], perp: string, entryStart: number, exit: number): FundingFlows | null {
 const finalRate = new Map<number, { rate: number; intervalMs: number }>();
 for (const record of records) {
  if (record.kind !== "funding" || record.inst !== perp) continue;
  const data = record.data as FundingData;
  finalRate.set(data.settleMs, { rate: data.rate, intervalMs: data.intervalMs });
 }
 if (finalRate.size === 0) return null;
 let reference: { settleMs: number; intervalMs: number } | null = null;
 for (const [settleMs, value] of finalRate) {
  if (settleMs <= entryStart) {
   if (reference === null || reference.settleMs > entryStart || settleMs > reference.settleMs) reference = { settleMs, intervalMs: value.intervalMs };
  } else if (reference === null || (reference.settleMs > entryStart && settleMs < reference.settleMs)) {
   reference = { settleMs, intervalMs: value.intervalMs };
  }
 }
 const expected = new Set<number>();
 if (reference !== null) {
  const first = Math.floor((entryStart - reference.settleMs) / reference.intervalMs) + 1;
  for (let at = reference.settleMs + first * reference.intervalMs; at <= exit; at += reference.intervalMs) expected.add(at);
 }
 for (const settleMs of finalRate.keys()) {
  if (settleMs > entryStart && settleMs <= exit) expected.add(settleMs);
 }
 const settlements: FundingFlows["settlements"] = [];
 for (const settleMs of [...expected].sort((a, b) => a - b)) {
  const found = finalRate.get(settleMs);
  if (found === undefined) return null;
  settlements.push({ settleMs, rate: found.rate });
 }
 return { settlements };
}

function candleMap(records: readonly CaptureRecord[], inst: string, barMs: number): Map<number, CandleData> {
 const map = new Map<number, CandleData>();
 for (const record of records) {
  if (record.kind === "candle" && record.inst === inst && record.data.barMs === barMs) map.set(record.data.startMs, record.data);
 }
 return map;
}

/**
 * Outcome of ONE candidate from a window of future records (at least the candles of its instruments and the funding
 * of its perp). Pure: the same candidate and window always give the same outcome.
 */
export function computeOutcome(candidate: LabCandidate, epochId: string, window: FutureWindow, params: OutcomeParams): Outcome {
 const table = params.table ?? COST_TABLE;
 if (candidate.horizonMs !== params.horizonMs) throw new RangeError("candidate horizon differs from the run horizon");
 if (params.horizonMs % params.barMs !== 0) throw new RangeError("horizon must be a multiple of the bar length");
 const entryStart = entryStartFor(candidate.observedAtMs, params);
 const exit = entryStart + params.horizonMs;
 const legs = MODALITY_LEGS[candidate.modality];
 if (legs.length === 0) return incomplete(candidate, epochId, "modality-unsupported", null, exit);
 const costs = candidate.costs;
 if (!costs.complete || costs.feeBps === null || costs.spreadBps === null || costs.slippageBps === null || costs.fixedUsd === null) {
  return incomplete(candidate, epochId, "costs-unknown", null, exit);
 }
 if (exit + table.captureLagMs > window.coversUntilMs) return incomplete(candidate, epochId, "horizon-beyond-data", entryStart, exit);

 const perpInstrument = candidate.modality === "spot-momentum" ? null : candidate.instrument;
 const spotInstrument = candidate.modality === "funding-carry" ? candidate.hedgeInstrument : candidate.modality === "spot-momentum" ? candidate.instrument : null;
 if (candidate.modality === "funding-carry" && spotInstrument === null) throw new RangeError("a carry candidate needs its hedge (spot) instrument");

 const barCount = params.horizonMs / params.barMs;
 const series = new Map<string, Array<CandleData | undefined>>();
 for (const inst of [perpInstrument, spotInstrument]) {
  if (inst === null || series.has(inst)) continue;
  const map = candleMap(window.records, inst, params.barMs);
  series.set(inst, Array.from({ length: barCount }, (_, j) => map.get(entryStart + j * params.barMs)));
 }
 let entryMissing = false;
 let exitMissing = false;
 let gap = false;
 for (const bars of series.values()) {
  if (bars[0] === undefined) entryMissing = true;
  else if (bars[barCount - 1] === undefined) exitMissing = true;
  for (let j = 1; j < barCount - 1; j += 1) if (bars[j] === undefined) gap = true;
 }
 if (entryMissing) return incomplete(candidate, epochId, "entry-bar-missing", entryStart, exit);
 if (exitMissing) return incomplete(candidate, epochId, "exit-bar-missing", entryStart, exit);
 if (gap) return incomplete(candidate, epochId, "candle-gap", entryStart, exit);

 const perpBars = perpInstrument === null ? null : (series.get(perpInstrument) as CandleData[]);
 const spotBars = spotInstrument === null ? null : (series.get(spotInstrument) as CandleData[]);
 const first = (bars: CandleData[] | null): number => (bars as CandleData[])[0]!.open;
 const last = (bars: CandleData[] | null): number => (bars as CandleData[])[barCount - 1]!.close;

 // Gross return on notional.
 let gross: number;
 if (candidate.modality === "funding-carry") gross = last(spotBars) / first(spotBars) - 1 - (last(perpBars) / first(perpBars) - 1);
 else if (candidate.modality === "perp-directional") gross = (candidate.side === "short" ? -1 : 1) * (last(perpBars) / first(perpBars) - 1);
 else gross = last(spotBars) / first(spotBars) - 1;

 // Funding: the perp leg only. Short and carry receive the market rate, a long pays it.
 let funding = 0;
 const payments: FundingPayment[] = [];
 if (perpInstrument !== null) {
  const flows = fundingFor(window.records, perpInstrument, entryStart, exit);
  if (flows === null) return incomplete(candidate, epochId, "funding-unobserved", entryStart, exit);
  const receives = candidate.modality === "funding-carry" || candidate.side === "short";
  for (const settlement of flows.settlements) {
   const flow = receives ? settlement.rate : -settlement.rate;
   if (settlement.settleMs === exit && flow > 0) continue;
   funding += flow;
   if (flow < 0) payments.push({ settleMs: settlement.settleMs, paid: -flow });
  }
 }

 const { feeBps, spreadBps, slippageBps, fixedUsd } = costs;
 const costReturn = (feeBps + spreadBps + slippageBps) / 1e4 + fixedUsd / costs.notionalUsd;
 const capitalAt1x = capitalPerNotional(candidate.modality, 1) as number;
 const holdingYears = params.horizonMs / YEAR_MS;
 const opportunityPerCapital = table.cashYieldAnnual * holdingYears;
 const opportunityCost = opportunityPerCapital * capitalAt1x;
 const net = gross + funding - costReturn - opportunityCost;
 const x = gross + funding - costReturn;

 const rows: LeverageOutcome[] = leverageRows(candidate.modality, (leverage) => {
  const perpSide: "long" | "short" = candidate.modality === "funding-carry" ? "short" : candidate.side === "short" ? "short" : "long";
  const legCount = legs.length;
  const adverse = (spreadBps + slippageBps) / 2 / legCount / 1e4;
  const entryPrice = first(perpBars) * (perpSide === "long" ? 1 + adverse : 1 - adverse);
  const scan = scanLiquidation({
   side: perpSide,
   entryPrice,
   leverage,
   maintenanceMarginPpm: BigInt(Math.round(table.maintenanceMarginRate * 1e6)),
   feePpm: BigInt(Math.round(table.feeTakerBps.perp * 100)),
   bars: (perpBars as CandleData[]).map((bar) => ({ endMs: bar.startMs + bar.barMs, high: bar.high, low: bar.low })),
   fundingPayments: payments,
  });
  const capital = capitalPerNotional(candidate.modality, leverage) as number;
  if (!scan.liquidated) return { liquidated: false, equityMultiple: Math.max(0, 1 + x / capital - opportunityPerCapital) };
  if (candidate.modality === "perp-directional") return { liquidated: true, equityMultiple: 0 };
  // Carry: the perp margin is lost, the spot leg is left unhedged and only a loss of the spot is credited.
  const spotReturn = last(spotBars) / first(spotBars) - 1;
  const credited = Math.min(spotReturn, 0) - scan.fundingPaid - 1 / leverage - costReturn;
  return { liquidated: true, equityMultiple: Math.max(0, 1 + credited / capital - opportunityPerCapital) };
 });

 return {
  epochId,
  candidateId: candidate.id,
  entryMs: entryStart,
  horizonEndMs: exit,
  grossReturn: gross,
  fundingReturn: funding,
  costReturn,
  opportunityCost,
  netReturn: net,
  capitalPerNotional: capitalAt1x,
  leverage: rows,
  complete: true,
  incompleteReason: null,
 };
}

/**
 * Outcomes of every ELIGIBLE candidate of an epoch, in the eligible order. This is the only place that reads the
 * future of the source: two reads, both ending at the horizon end plus the capture lag.
 */
export function computeEpochOutcomes(epoch: Epoch, source: DataSource, params: OutcomeParams): Outcome[] {
 const table = params.table ?? COST_TABLE;
 const byId = new Map(epoch.candidates.map((candidate) => [candidate.id, candidate] as const));
 const eligible: LabCandidate[] = [];
 for (const id of epoch.eligibleIds) {
  const found = byId.get(id);
  if (found !== undefined) eligible.push(found);
 }
 if (eligible.length === 0) return [];
 const entryStart = entryStartFor(epoch.t, params);
 const until = entryStart + params.horizonMs + table.captureLagMs;
 const instruments = new Set<string>();
 const perps = new Set<string>();
 for (const candidate of eligible) {
  instruments.add(candidate.instrument);
  if (candidate.hedgeInstrument !== null) instruments.add(candidate.hedgeInstrument);
  if (candidate.modality !== "spot-momentum") perps.add(candidate.instrument);
 }
 const candles = source.future(entryStart, until, ["candle"], [...instruments]);
 const fundingWindow = perps.size === 0 ? { records: [] as readonly CaptureRecord[] } : source.future(epoch.t - table.fundingLookbackMs, until, ["funding"], [...perps]);
 const window: FutureWindow = { fromMs: candles.fromMs, toMs: until, coversUntilMs: candles.coversUntilMs, records: [...candles.records, ...fundingWindow.records] };
 return eligible.map((candidate) => computeOutcome(candidate, epoch.id, window, params));
}

/**
 * Return on the capital committed at 1x: netReturn / capitalPerNotional. The passive form (buy and hold benchmark)
 * pays no trading cost: gross + funding - opportunity. null when the outcome is incomplete.
 */
export function returnOnCapital(outcome: Outcome, passive = false): number | null {
 if (!outcome.complete || outcome.netReturn === null || outcome.capitalPerNotional === null) return null;
 if (!passive) return outcome.netReturn / outcome.capitalPerNotional;
 if (outcome.grossReturn === null || outcome.fundingReturn === null || outcome.opportunityCost === null) return null;
 return (outcome.grossReturn + outcome.fundingReturn - outcome.opportunityCost) / outcome.capitalPerNotional;
}
