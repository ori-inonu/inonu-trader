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

// ---------------------------------------------------------------------------
// Report types (docs/JEV-LABORATORIO-DE-DECISAO.md sections 7 to 9)
// ---------------------------------------------------------------------------

/** Per-epoch result of one policy, already reduced to the quantities the statistics need. */
export interface EpochResult {
  /** The policy took a position (did not hold). */
  trade: boolean;
  /** Modality of the chosen candidate; null on hold. */
  modality: LabModality | null;
  /** Net return on the capital committed at 1x (0 on hold). Excess over cash. */
  returnOnCapital: number;
  /** Terminal equity multiple of the decision at each leverage; 1 on hold; the 1x value when the trade is not leverageable. */
  equityMultiple: Record<Leverage, number>;
  liquidated: Record<Leverage, boolean>;
  /** The trade has a leverageable (derivative) candidate. */
  levered: boolean;
}

export interface MeanTestReport {
  n: number;
  /** Return units are basis points of the committed capital per epoch. */
  meanBps: number;
  sdBps: number;
  lag: number | null;
  /** floor(n / (lag + 1)): how many roughly independent blocks the sample holds. */
  effectiveSamples: number | null;
  seBps: number | null;
  t: number | null;
  df: number | null;
  pOneSided: number | null;
  ci95Bps: [number, number] | null;
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  n: number;
  meanPredicted: number | null;
  observedFrequency: number | null;
  wilson95: [number, number] | null;
}

export interface CalibrationReport {
  n: number;
  baseRate: number;
  brier: number;
  brierBaseRate: number;
  /** 1 - brier / brierBaseRate; null when the base-rate predictor is perfect. */
  skill: number | null;
  reliability: ReliabilityBin[];
}

export interface LeverageReportRow {
  leverage: Leverage;
  /** Share of the policy's trades that a derivative could lever; null with no trades. */
  applicableShare: number | null;
  observed: { finalEquity: number; maxDrawdown: number; minEquity: number; liquidations: number; liquidationRate: number | null } | null;
  bootstrap: {
    resamples: number;
    blockLength: number;
    ruinFraction: number;
    medianFinalEquity: number;
    p05FinalEquity: number;
    p95FinalEquity: number;
    probLiquidation: number;
    probRuin: number;
  } | null;
  /** Closed form without edge from src/policy/envelope.ts at the realized volatility of what was traded. Context, not a forecast. */
  reference: { sigmaDaily: number; medianWealthNoEdge: number; touchLiquidationProbability: number } | null;
}

export interface PolicyReport {
  id: string;
  baseline: boolean;
  tested: boolean;
  passive: boolean;
  chooser: { name: string; isMock: boolean } | null;
  epochs: number;
  usableEpochs: number;
  incompleteDecisions: number;
  trades: number;
  holds: number;
  /** Decisions by status; everything but "ok" was turned into a hold. */
  statuses: Record<DecisionStatus, number>;
  tradeRate: number | null;
  tradesPerDay: number | null;
  hitRate: number | null;
  mean: MeanTestReport | null;
  /** Holm adjusted p-value of the one-sided test "mean > 0"; null when the policy is not in the family. */
  adjustedP: number | null;
  maxDrawdown: number | null;
  sharpe: { annualized: number | null; daysToDetect: number | null; caveat: string };
  /** Daily mean and sd of the tranche portfolio (section 7.5) and the Kelly lower bound they imply. */
  portfolio: { dailyMean: number | null; dailySd: number | null; kellyLowerBound: number | null; leverageCapPhase2: number | null };
  byModality: Array<{ modality: LabModality; trades: number; mean: MeanTestReport | null; adjustedP: number | null }>;
  inference: {
    costKnown: boolean;
    consulted: number;
    costUsdTotal: number | null;
    inputTokensTotal: number | null;
    latencyMs: { p50: number; p95: number; p99: number } | null;
    shareAboveMaxDecision: number | null;
  };
  calibration: CalibrationReport | null;
  leverage: LeverageReportRow[];
}

export interface PairedReport {
  policy: string;
  baseline: string;
  n: number;
  mean: MeanTestReport | null;
  /** t >= 2 and the lower bound of the 95% interval above zero. */
  significantlyBetter: boolean | null;
}

export interface MultipleTestingEntry {
  policy: string;
  modality: LabModality | null;
  p: number | null;
  adjustedP: number | null;
  rejected: boolean;
}

export interface MultipleTesting {
  method: "holm";
  alpha: number;
  family: MultipleTestingEntry[];
}

export interface RunInfo {
  epochs: number;
  pendingEpochs: number;
  firstEpochMs: number;
  lastEpochMs: number;
  spanDays: number;
  stepMs: number;
  horizonMs: number;
  /** K = ceil(horizon / step). */
  overlap: number;
  seed: number | null;
  plantedEdgeBps: number | null;
  /** Declared by the operator, not verifiable by the lab. */
  frozenAtMs: number | null;
  /** Share of the epochs with a usable result for the policy under test. */
  completeness: number | null;
}

export type CriterionStatus = "passed" | "failed" | "unknown";

export interface Criterion {
  id: string;
  description: string;
  requirement: string;
  observed: number | string | null;
}

export interface GateResult {
  recommendation: string;
  /** The gate cannot recommend anything else. */
  recommendedPhase: "fase-0";
  passed: Criterion[];
  failed: Criterion[];
  unknown: Criterion[];
  grantsPermission: false;
}

export interface LabReport {
  schema: "jev-lab-report-v1";
  mode: "synthetic" | "replay";
  source: string;
  jev: { chooser: string; isMock: boolean; realJevCalled: boolean; warning: string | null };
  run: RunInfo;
  costTable: Record<string, unknown>;
  policies: PolicyReport[];
  paired: PairedReport[];
  multipleTesting: MultipleTesting;
  /** Tested policies with a Holm significant positive mean that also beat every baseline. */
  flagged: string[];
  gate: GateResult;
  notes: string[];
  disclaimer: string;
}

/** What promotionGate reads. */
export type GateInput = Pick<LabReport, "mode" | "run" | "policies" | "paired" | "multipleTesting">;
