/**
 * Shared types and constants of the Jev Decision Lab (docs/JEV-LABORATORIO-DE-DECISAO.md, section 3).
 *
 * The lab is SHADOW ONLY: it records hypothetical decisions and measures what they would have returned. It never
 * executes, signs, sends or reads secrets. Synthetic data proves arithmetic and the statistical machinery, never profit.
 *
 * Convention used everywhere: `null` means UNKNOWN and is never read as zero.
 */

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
/** The year used by every annualization: 365 days, as in R3 (days to detect a Sharpe). */
export const YEAR_DAYS = 365;
export const YEAR_MS = YEAR_DAYS * DAY_MS;

export const LAB_MODALITIES = ["funding-carry", "perp-directional", "spot-momentum", "yield-allocation", "dex-signal", "kuru-maker"] as const;
export type LabModality = (typeof LAB_MODALITIES)[number];

export const LAB_SIDES = ["long", "short", "neutral"] as const;
export type LabSide = (typeof LAB_SIDES)[number];

/** Leverage levels of the counterfactual. */
export const LEVERAGES = [1, 2, 3, 5, 10] as const;
export type Leverage = (typeof LEVERAGES)[number];

/** A feature value: a number, or null for UNKNOWN. Never zero for unknown. */
export type FeatureMap = Record<string, number | null>;

export interface CandidateCosts {
  /** Round-trip taker fees of every leg, in bps of notional. null: unknown. */
  feeBps: number | null;
  /** Round-trip spread crossing of every leg, in bps of notional, from quotes observed at decision time. null: unknown. */
  spreadBps: number | null;
  /** Round-trip slippage proxy of every leg, in bps of notional. null: unknown. */
  slippageBps: number | null;
  /** Gas or other fixed cost of one round trip, in USD. null: unknown. */
  fixedUsd: number | null;
  /** Nominal size that turns fixed and inference USD costs into fractions. */
  notionalUsd: number;
  /** True only when no component above is null. */
  complete: boolean;
}

export interface Provenance {
  /** Where the data came from, for example "synthetic:seed=7" or "replay:<digest>". */
  source: string;
  /** Always false in this module: the lab never touches the network. */
  externalAccessObserved: boolean;
}

export interface LabCandidate {
  /** "<modality>.<instrument>.<side>", unique inside an epoch. */
  id: string;
  modality: LabModality;
  instrument: string;
  /** Spot leg of a carry; null otherwise. */
  hedgeInstrument: string | null;
  venue: string;
  observedAtMs: number;
  horizonMs: number;
  side: LabSide;
  features: FeatureMap;
  costs: CandidateCosts;
  validUntilMs: number;
  provenance: Provenance;
}

export interface IneligibleCandidate {
  id: string;
  reasons: string[];
}

export interface Epoch {
  /** "e<t>"; the idempotency key of the journal. */
  id: string;
  index: number;
  t: number;
  /** Every candidate built at t, eligible or not. */
  candidates: LabCandidate[];
  eligibleIds: string[];
  ineligible: IneligibleCandidate[];
}

export type DecisionStatus = "ok" | "invalid-choice" | "malformed" | "timeout" | "error";
export const DECISION_STATUSES: readonly DecisionStatus[] = ["ok", "invalid-choice", "malformed", "timeout", "error"];

export interface PolicyDecision {
  policyId: string;
  epochId: string;
  /** An eligible candidate id, or "hold". */
  choice: string;
  /** Over ["hold", ...eligible ids]. */
  probabilities: Record<string, number>;
  latencyMs: number;
  /** null: the provider did not supply valid usage. Never zero. */
  inputTokens: number | null;
  /** Inference cost in USD. null: unknown. Never zero. */
  costUsd: number | null;
  status: DecisionStatus;
  note: string | null;
}

export interface LeverageOutcome {
  leverage: Leverage;
  /** False for unleveraged candidates (spot): the counterfactual keeps them at 1x. */
  applicable: boolean;
  liquidated: boolean | null;
  /** Terminal equity as a multiple of the equity committed to the decision; 0 when liquidated. */
  equityMultiple: number | null;
}

export const INCOMPLETE_REASONS = [
  "horizon-beyond-data",
  "entry-bar-missing",
  "exit-bar-missing",
  "candle-gap",
  "funding-unobserved",
  "costs-unknown",
  "modality-unsupported",
] as const;
export type IncompleteReason = (typeof INCOMPLETE_REASONS)[number];

export interface Outcome {
  epochId: string;
  candidateId: string;
  /** Start of the entry bar; null when the outcome is incomplete before an entry was found. */
  entryMs: number | null;
  /** End of the holding window (the exit bar close). */
  horizonEndMs: number;
  /** Every return below is a fraction of NOTIONAL; null when the outcome is incomplete. */
  grossReturn: number | null;
  fundingReturn: number | null;
  costReturn: number | null;
  opportunityCost: number | null;
  netReturn: number | null;
  /** Capital committed per unit of notional at 1x: 1 (directional, spot) or 2 (carry). */
  capitalPerNotional: number | null;
  leverage: LeverageOutcome[];
  complete: boolean;
  incompleteReason: IncompleteReason | null;
}

export type CandidateEligibility = { eligible: true; reasons: [] } | { eligible: false; reasons: string[] };

export const HOLD = "hold";

/** Rounds to a fixed number of decimals so values written to the journal are short and stable. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Freezes a value and everything reachable from it. Used for what policies receive. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
