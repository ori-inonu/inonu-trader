/**
 * System One: the fast leverage decision layer of Jev.
 *
 * One cycle reads a market (mark, index, funding, realized volatility), the wallet (capital and
 * exposure), derives the risk envelope of the current phase (src/policy/envelope.ts, R3 section 6),
 * enumerates leverage candidates inside that envelope, asks Jev for one choice and writes the
 * cycle. Nothing here signs or sends: execution stays behind the operator gates and the owner's
 * live authorization. Every number is typed and bounded; Jev only picks a key that already exists.
 */

import type { DerivedLimits, PhaseId } from "../policy/envelope";

export const SYSTEM_ONE_SCHEMA_VERSION = 1;

export const LEVERAGE_LADDER: readonly number[] = Object.freeze([1, 2, 3, 5]);
export const SIDES = ["long", "short"] as const;
export type Side = (typeof SIDES)[number];

export interface MarketReading {
  /** OKX instrument id of the perpetual, for example MON-USDT-SWAP. */
  instId: string;
  /** Spot or index reference used for the basis. */
  indexPrice: number | null;
  markPrice: number | null;
  /** Forecast funding rate per settlement, positive means longs pay shorts. */
  fundingRate: number | null;
  /** Settlement interval in milliseconds, 1 h to 8 h; null when unknown. */
  fundingIntervalMs: number | null;
  /** Daily realized volatility as a fraction, from closes of the candles used. */
  realizedSigmaDaily: number | null;
  candlesUsed: number;
  candleBarMs: number | null;
  /** Where the numbers came from; synthetic means an offline demo. */
  source: "okx_public_v5" | "synthetic";
  observedAtMs: number;
}

export interface WalletReading {
  /** Operational capital the envelope is derived from. */
  capitalUsd: number;
  knownValueUsd: number;
  valueComplete: boolean;
  /** Notional currently open in the instrument, zero when flat. */
  openNotionalUsd: number;
  openSide: Side | null;
  source: "okx_balance_api" | "synthetic" | "configured";
  observedAtMs: number;
}

export interface LeverageCandidate {
  id: string;
  side: Side;
  leverage: number;
  /** Margin committed, bounded by the order cap of the phase. */
  marginUsd: number;
  notionalUsd: number;
  /** Distance to the liquidation price as a fraction of the price, 1 / leverage. */
  liquidationDistance: number;
  /** Probability of touching liquidation inside the horizon at the realized sigma, no drift. */
  touchProbability: number | null;
  /** Median wealth multiple over the horizon without edge: pure volatility drag. */
  medianMultipleNoEdge: number | null;
  /** Funding carry per day as a fraction of notional from the side's point of view; positive earns. */
  fundingCarryPerDay: number | null;
  /** Expected funding carry over the horizon in USD, sign already from the side's point of view. */
  fundingCarryUsd: number | null;
  eligible: boolean;
  reasons: string[];
}

export interface LeverageBrief {
  schemaVersion: typeof SYSTEM_ONE_SCHEMA_VERSION;
  generatedAtMs: number;
  phase: PhaseId;
  horizonDays: number;
  market: MarketReading;
  wallet: WalletReading;
  limits: DerivedLimits;
  candidates: LeverageCandidate[];
  eligibleIds: string[];
  /** Plain statements Jev also sees: what is missing, what the phase forbids. */
  notes: string[];
}

export type DecisionStatus = "ok" | "invalid-choice" | "malformed" | "timeout" | "error";

export interface LeverageDecision {
  /** "hold" or an eligible candidate id. */
  choice: string;
  /** Decision weights over hold and every eligible candidate, not win rates. */
  probabilities: Record<string, number>;
  confidence: number | null;
  latencyMs: number;
  model: string;
  status: DecisionStatus;
}

export interface SystemOneCycle {
  schemaVersion: typeof SYSTEM_ONE_SCHEMA_VERSION;
  cycleId: string;
  startedAtMs: number;
  completedAtMs: number;
  brief: LeverageBrief;
  /** Null when no candidate was eligible: Jev was not asked and no inference was paid. */
  decision: LeverageDecision | null;
  chosen: LeverageCandidate | null;
  /** System One never executes. The status says why nothing moved. */
  execution: { status: "dry_run" | "blocked"; reasons: string[] };
  warnings: string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
