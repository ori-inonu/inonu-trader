/**
 * Candidate builder of the Jev Decision Lab: from a point-in-time view to the candidates of one epoch.
 * Specification: docs/JEV-LABORATORIO-DE-DECISAO.md sections 3.1 and 4.
 *
 * This is the ONLY place where raw records meet the policies, and it reads only `PointInTimeView`, whose cut-off is
 * the decision instant. Features are numbers or null (UNKNOWN, never zero) rounded to six decimals, so the journal
 * shows exactly what the policies saw. A candidate with any unknown cost component is not eligible: policies never
 * receive it. Pure and deterministic: no clock, no randomness, no I/O.
 */

import type { CandleData, FundingData } from "./capture-format.ts";
import { COST_TABLE, candidateCosts, capitalPerNotional, entryStartFor, type CostTable } from "./outcomes.ts";
import type { PointInTimeView } from "./source.ts";
import {
  DAY_MS,
  HOUR_MS,
  YEAR_MS,
  roundTo,
  type CandidateCosts,
  type Epoch,
  type FeatureMap,
  type IneligibleCandidate,
  type LabCandidate,
  type LabModality,
  type LabSide,
} from "./types.ts";

export interface CandidateParams {
  stepMs: number;
  horizonMs: number;
  barMs: number;
  executionDelayMs: number;
  /** Where the data came from, copied to every candidate's provenance. */
  provenanceSource: string;
  venue?: string;
  table?: CostTable;
  lookbackMs?: number;
  /** Fewest log returns that make the volatility known. */
  minVolBars?: number;
  /** How many settled funding rates make the funding mean and minimum known. */
  fundingSettlements?: number;
  /** A quote older than this is treated as unknown. */
  maxQuoteAgeMs?: number;
}

export const CANDIDATE_DEFAULTS = Object.freeze({
  venue: "okx",
  lookbackMs: DAY_MS,
  minVolBars: 20,
  fundingSettlements: 6,
  maxQuoteAgeMs: 120_000,
});

export function epochIdFor(t: number): string {
  return `e${t}`;
}

const PERP_SUFFIX = "-SWAP";

function r6(value: number): number {
  return roundTo(value, 6);
}

function orNull(value: number | null): number | null {
  return value === null ? null : r6(value);
}

interface Quote {
  mid: number;
  spreadBps: number;
}

function freshQuote(view: PointInTimeView, inst: string, maxAgeMs: number): Quote | null {
  const record = view.latest("ticker", inst);
  if (record === null || view.asOfMs - record.t > maxAgeMs) return null;
  const { bid, ask } = record.data;
  const mid = (bid + ask) / 2;
  return { mid, spreadBps: ((ask - bid) / mid) * 1e4 };
}

interface PriceFeatures {
  retLookbackBps: number | null;
  volHorizonBps: number | null;
}

function priceFeatures(view: PointInTimeView, inst: string, params: Required<Pick<CandidateParams, "barMs" | "horizonMs">> & { lookbackMs: number; minVolBars: number }): PriceFeatures {
  const { barMs, lookbackMs } = params;
  const none: PriceFeatures = { retLookbackBps: null, volHorizonBps: null };
  const history = view.history("candle", inst, view.asOfMs - lookbackMs - 3 * barMs).filter((record) => (record.data as CandleData).barMs === barMs);
  const last = history[history.length - 1];
  if (last === undefined) return none;
  const lastEnd = last.data.startMs + barMs;
  if (view.asOfMs - lastEnd > 2 * barMs) return none;
  const closeByEnd = new Map<number, number>();
  for (const record of history) closeByEnd.set(record.data.startMs + barMs, record.data.close);
  const now = closeByEnd.get(lastEnd) as number;
  const then = closeByEnd.get(lastEnd - lookbackMs);
  const retLookbackBps = then === undefined ? null : (now / then - 1) * 1e4;

  let volHorizonBps: number | null = null;
  const steps = Math.round(lookbackMs / barMs);
  if (then !== undefined && steps >= params.minVolBars) {
    const returns: number[] = [];
    for (let k = 1; k <= steps; k += 1) {
      const previous = closeByEnd.get(lastEnd - lookbackMs + (k - 1) * barMs);
      const current = closeByEnd.get(lastEnd - lookbackMs + k * barMs);
      if (previous === undefined || current === undefined) {
        returns.length = 0;
        break;
      }
      returns.push(Math.log(current / previous));
    }
    if (returns.length >= params.minVolBars && returns.length > 1) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (returns.length - 1);
      volHorizonBps = Math.sqrt(variance) * Math.sqrt(params.horizonMs / barMs) * 1e4;
    }
  }
  return { retLookbackBps, volHorizonBps };
}

interface FundingFeatures {
  fundingNextBps: number | null;
  fundingLastBps: number | null;
  fundingMeanBps: number | null;
  fundingMinBps: number | null;
  settlementsInHorizon: number | null;
}

function fundingFeatures(view: PointInTimeView, perp: string, settlements: number, entryStart: number, exit: number): FundingFeatures {
  const unknown: FundingFeatures = { fundingNextBps: null, fundingLastBps: null, fundingMeanBps: null, fundingMinBps: null, settlementsInHorizon: null };
  const records = view.history("funding", perp, view.asOfMs - (settlements + 3) * 8 * HOUR_MS);
  if (records.length === 0) return unknown;
  const finalBySettlement = new Map<number, FundingData>();
  for (const record of records) finalBySettlement.set(record.data.settleMs, record.data);
  const ordered = [...finalBySettlement.values()].sort((a, b) => a.settleMs - b.settleMs);
  const settled = ordered.filter((entry) => entry.settleMs <= view.asOfMs);
  const pending = ordered.find((entry) => entry.settleMs > view.asOfMs);
  const reference = ordered[ordered.length - 1] as FundingData;

  // Settlements strictly inside the holding window, from the schedule of the newest record.
  let count = 0;
  const firstK = Math.floor((entryStart - reference.settleMs) / reference.intervalMs) + 1;
  for (let at = reference.settleMs + firstK * reference.intervalMs; at < exit; at += reference.intervalMs) count += 1;

  const lastSettled = settled[settled.length - 1];
  const fresh = lastSettled !== undefined && view.asOfMs - lastSettled.settleMs <= 2 * lastSettled.intervalMs;
  let mean: number | null = null;
  let min: number | null = null;
  if (fresh && settled.length >= settlements) {
    const window = settled.slice(settled.length - settlements);
    const consecutive = window.every((entry, index) => index === 0 || entry.settleMs - (window[index - 1] as FundingData).settleMs === entry.intervalMs);
    if (consecutive) {
      mean = (window.reduce((a, b) => a + b.rate, 0) / window.length) * 1e4;
      min = Math.min(...window.map((entry) => entry.rate)) * 1e4;
    }
  }
  return {
    fundingNextBps: pending === undefined ? null : pending.rate * 1e4,
    fundingLastBps: fresh ? (lastSettled as FundingData).rate * 1e4 : null,
    fundingMeanBps: mean,
    fundingMinBps: min,
    settlementsInHorizon: count,
  };
}

function oiChangeBps(view: PointInTimeView, perp: string, lookbackMs: number): number | null {
  const records = view.history("oi", perp, view.asOfMs - 2 * lookbackMs);
  const latest = records[records.length - 1];
  if (latest === undefined || latest.t < view.asOfMs - lookbackMs) return null;
  let then: number | null = null;
  for (const record of records) {
    if (record.t <= latest.t - lookbackMs) then = record.data.oi;
  }
  if (then === null || then <= 0) return null;
  return (latest.data.oi / then - 1) * 1e4;
}

function roundedCosts(costs: CandidateCosts): CandidateCosts {
  return { ...costs, spreadBps: costs.spreadBps === null ? null : r6(costs.spreadBps) };
}

function totalCostBps(costs: CandidateCosts): number | null {
  if (!costs.complete || costs.feeBps === null || costs.spreadBps === null || costs.slippageBps === null || costs.fixedUsd === null) return null;
  return costs.feeBps + costs.spreadBps + costs.slippageBps + (costs.fixedUsd / costs.notionalUsd) * 1e4;
}

export interface BuiltCandidates {
  candidates: LabCandidate[];
  eligibleIds: string[];
  ineligible: IneligibleCandidate[];
}

/** All candidates that exist at the cut-off of the view, sorted by id, with their eligibility. */
export function buildEpochCandidates(view: PointInTimeView, params: CandidateParams): BuiltCandidates {
  const venue = params.venue ?? CANDIDATE_DEFAULTS.venue;
  const table = params.table ?? COST_TABLE;
  const lookbackMs = params.lookbackMs ?? CANDIDATE_DEFAULTS.lookbackMs;
  const minVolBars = params.minVolBars ?? CANDIDATE_DEFAULTS.minVolBars;
  const fundingSettlements = params.fundingSettlements ?? CANDIDATE_DEFAULTS.fundingSettlements;
  const maxQuoteAgeMs = params.maxQuoteAgeMs ?? CANDIDATE_DEFAULTS.maxQuoteAgeMs;
  const priceParams = { barMs: params.barMs, horizonMs: params.horizonMs, lookbackMs, minVolBars };
  const t = view.asOfMs;
  const entryStart = entryStartFor(t, { barMs: params.barMs, horizonMs: params.horizonMs, executionDelayMs: params.executionDelayMs });
  const exit = entryStart + params.horizonMs;
  const opportunityBpsAt1x = (modality: LabModality): number => table.cashYieldAnnual * (params.horizonMs / YEAR_MS) * (capitalPerNotional(modality, 1) as number) * 1e4;

  const instruments = new Set<string>([...view.instruments("ticker"), ...view.instruments("candle"), ...view.instruments("funding")]);
  const perps = [...instruments].filter((inst) => inst.endsWith(PERP_SUFFIX)).sort();
  const spots = [...instruments].filter((inst) => !inst.endsWith(PERP_SUFFIX)).sort();

  const candidates: LabCandidate[] = [];
  const reasonsById = new Map<string, string[]>();
  const base = (modality: LabModality, instrument: string, hedgeInstrument: string | null, side: LabSide, costs: CandidateCosts, features: FeatureMap, extraReasons: string[]): void => {
    const id = `${modality}.${instrument}.${side}`;
    const reasons: string[] = [];
    if (costs.spreadBps === null) reasons.push("costs-unknown:spread");
    if (costs.fixedUsd === null) reasons.push("costs-unknown:fixed");
    reasons.push(...extraReasons);
    candidates.push({
      id,
      modality,
      instrument,
      hedgeInstrument,
      venue,
      observedAtMs: t,
      horizonMs: params.horizonMs,
      side,
      features,
      costs,
      validUntilMs: t + params.stepMs,
      provenance: { source: params.provenanceSource, externalAccessObserved: false },
    });
    if (reasons.length > 0) reasonsById.set(id, reasons);
  };
  const withSignal = (features: FeatureMap, inst: string): FeatureMap => {
    const signal = view.extras[`signalZ:${inst}`];
    if (signal !== undefined) features.signalZ = r6(signal);
    return features;
  };

  for (const spot of spots) {
    const quote = freshQuote(view, spot, maxQuoteAgeMs);
    const costs = roundedCosts(candidateCosts("spot-momentum", { spot: quote === null ? null : quote.spreadBps, perp: null }, table));
    const price = priceFeatures(view, spot, priceParams);
    const costBps = totalCostBps(costs);
    base(
      "spot-momentum",
      spot,
      null,
      "long",
      costs,
      withSignal({ retLookbackBps: orNull(price.retLookbackBps), volHorizonBps: orNull(price.volHorizonBps), spreadBps: costs.spreadBps, costBps: orNull(costBps) }, spot),
      [],
    );
  }

  for (const perp of perps) {
    const spot = perp.slice(0, -PERP_SUFFIX.length);
    const hasSpot = spots.includes(spot);
    const perpQuote = freshQuote(view, perp, maxQuoteAgeMs);
    const spotQuote = hasSpot ? freshQuote(view, spot, maxQuoteAgeMs) : null;
    const price = priceFeatures(view, perp, priceParams);
    const funding = fundingFeatures(view, perp, fundingSettlements, entryStart, exit);
    const oiChange = oiChangeBps(view, perp, lookbackMs);
    const basisBps = perpQuote !== null && spotQuote !== null ? ((perpQuote.mid - spotQuote.mid) / spotQuote.mid) * 1e4 : null;

    const directionalCosts = roundedCosts(candidateCosts("perp-directional", { spot: null, perp: perpQuote === null ? null : perpQuote.spreadBps }, table));
    const directionalBps = totalCostBps(directionalCosts);
    for (const side of ["long", "short"] as const) {
      base(
        "perp-directional",
        perp,
        null,
        side,
        directionalCosts,
        withSignal(
          {
            retLookbackBps: orNull(price.retLookbackBps),
            volHorizonBps: orNull(price.volHorizonBps),
            spreadBps: directionalCosts.spreadBps,
            basisBps: orNull(basisBps),
            fundingNextBps: orNull(funding.fundingNextBps),
            fundingLastBps: orNull(funding.fundingLastBps),
            fundingMeanBps: orNull(funding.fundingMeanBps),
            fundingMinBps: orNull(funding.fundingMinBps),
            settlementsInHorizon: funding.settlementsInHorizon,
            oiChangeBps: orNull(oiChange),
            costBps: orNull(directionalBps),
          },
          perp,
        ),
        [],
      );
    }

    if (hasSpot) {
      const carryCosts = roundedCosts(candidateCosts("funding-carry", { spot: spotQuote === null ? null : spotQuote.spreadBps, perp: perpQuote === null ? null : perpQuote.spreadBps }, table));
      const carryBps = totalCostBps(carryCosts);
      // Conservative gross carry: the lowest recent settled rate (or the announced rate, if lower) for every settlement.
      let gross: number | null = null;
      if (funding.fundingMinBps !== null && funding.settlementsInHorizon !== null) {
        const worst = funding.fundingNextBps === null ? funding.fundingMinBps : Math.min(funding.fundingMinBps, funding.fundingNextBps);
        gross = worst * funding.settlementsInHorizon;
      }
      const net = gross === null || carryBps === null ? null : gross - carryBps - opportunityBpsAt1x("funding-carry");
      base(
        "funding-carry",
        perp,
        spot,
        "neutral",
        carryCosts,
        {
          retLookbackBps: orNull(price.retLookbackBps),
          volHorizonBps: orNull(price.volHorizonBps),
          spreadBps: carryCosts.spreadBps,
          basisBps: orNull(basisBps),
          fundingNextBps: orNull(funding.fundingNextBps),
          fundingLastBps: orNull(funding.fundingLastBps),
          fundingMeanBps: orNull(funding.fundingMeanBps),
          fundingMinBps: orNull(funding.fundingMinBps),
          settlementsInHorizon: funding.settlementsInHorizon,
          carryGrossBps: orNull(gross),
          carryNetBps: orNull(net),
          oiChangeBps: orNull(oiChange),
          costBps: orNull(carryBps),
        },
        funding.fundingMinBps === null || funding.settlementsInHorizon === null ? ["unknown:funding"] : [],
      );
    }
  }

  candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ineligible: IneligibleCandidate[] = [];
  const eligibleIds: string[] = [];
  for (const candidate of candidates) {
    const reasons = reasonsById.get(candidate.id);
    if (reasons === undefined) eligibleIds.push(candidate.id);
    else ineligible.push({ id: candidate.id, reasons });
  }
  return { candidates, eligibleIds, ineligible };
}

/** The epoch record for the cut-off of the view. */
export function buildEpoch(view: PointInTimeView, index: number, params: CandidateParams): Epoch {
  return { id: epochIdFor(view.asOfMs), index, t: view.asOfMs, ...buildEpochCandidates(view, params) };
}
