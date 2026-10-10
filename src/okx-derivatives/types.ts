import type { Rat } from "./decimal.ts";

// Shared types and the closed vocabulary of verdict reasons for the offline OKX
// derivatives evaluator. Nothing here performs I/O.

export type Role = "maker" | "taker";
export type PositionSide = "long" | "short";
export type SourceClaim = "synthetic" | "operator_claimed";
export type AccessState = "unknown" | "operator_confirmed" | "operator_denied";
export type VerdictStatus = "eligible" | "ineligible" | "unavailable";

export interface Level {
  readonly price: Rat;
  readonly size: Rat;
}

export interface Book {
  readonly tsMs: number;
  /** Best (highest) price first. */
  readonly bids: readonly Level[];
  /** Best (lowest) price first. */
  readonly asks: readonly Level[];
}

export interface SpotInstrument {
  readonly instId: string;
  readonly baseCcy: string;
  readonly quoteCcy: string;
  readonly tickSz: Rat;
  readonly lotSz: Rat;
  readonly minSz: Rat;
  readonly state: string;
}

export interface PerpInstrument {
  readonly instId: string;
  readonly ctType: "linear" | "inverse";
  readonly ctVal: Rat;
  readonly ctMult: Rat;
  readonly ctValCcy: string;
  readonly settleCcy: string;
  readonly tickSz: Rat;
  readonly lotSz: Rat;
  readonly minSz: Rat;
  /** Maximum leverage advertised for the instrument (OKX field "lever"). */
  readonly maxLeverage: number;
  readonly state: string;
}

export interface MarkSnapshot {
  readonly tsMs: number;
  readonly markPx: Rat;
}

export interface FundingHistoryEntry {
  readonly fundingTimeMs: number;
  /** Signed settlement rate as an exact fraction per settlement period (positive: longs pay shorts). */
  readonly rate: Rat;
}

export interface FundingSnapshot {
  readonly tsMs: number;
  readonly currentRate: Rat;
  /** The pending settlement. */
  readonly fundingTimeMs: number;
  readonly nextFundingTimeMs: number;
  /** Oldest first. */
  readonly history: readonly FundingHistoryEntry[];
}

/** Trading fee COST in ppm of notional: positive pays, negative is a rebate. null is UNKNOWN. */
export interface FeePair {
  readonly makerCostPpm: bigint | null;
  readonly takerCostPpm: bigint | null;
}

export interface Fees {
  readonly spot: FeePair;
  readonly perp: FeePair;
}

export interface Snapshot {
  readonly spot: SpotInstrument;
  readonly perp: PerpInstrument;
  readonly books: { readonly spot: Book; readonly perp: Book };
  readonly mark: MarkSnapshot;
  readonly funding: FundingSnapshot;
  readonly fees: Fees;
  /** Maintenance margin rate of the applicable position tier, ppm. null is UNKNOWN. */
  readonly maintenanceMarginRatePpm: bigint | null;
  readonly access: AccessState;
}

export interface Policy {
  readonly maxLeverage: number;
  readonly minLiquidationDistancePpm: number;
  readonly minNetOnNotionalPpm: number;
  readonly maxSnapshotAgeMs: number;
  readonly maxBookSkewMs: number;
  readonly minFundingObservations: number;
  readonly adverseBasisPpm: number;
  readonly stressMovesPpm: readonly number[];
  readonly stressGapPpm: number;
}

export interface CarryRoles {
  readonly spotOpen: Role;
  readonly perpOpen: Role;
  readonly spotClose: Role;
  readonly perpClose: Role;
}

export interface DirectionalRoles {
  readonly open: Role;
  readonly close: Role;
}

export interface Evaluation {
  readonly carry: { readonly contracts: Rat; readonly roles: CarryRoles };
  readonly directional: { readonly side: PositionSide; readonly contracts: Rat; readonly roles: DirectionalRoles } | null;
  readonly leverages: readonly number[];
  readonly holdingSettlements: number;
  readonly policy: Policy;
}

export interface ParsedInput {
  readonly sourceClaim: SourceClaim;
  readonly snapshot: Snapshot;
  readonly evaluation: Evaluation;
  /** Key-sorted canonical JSON of the raw validated input, used for the report hash. */
  readonly canonicalJson: string;
}

export interface Verdict {
  readonly status: VerdictStatus;
  readonly reasons: readonly string[];
}

/** Facts that make the candidate definitively unsuitable. */
export const INELIGIBLE_REASON_CODES = [
  "limit:leverage_above_cap",
  "limit:leverage_above_instrument_max",
  "limit:liquidation_distance_below_floor",
  "limit:net_conservative_return_not_above_buffer",
  "access:derivatives_denied",
  "model:directional_no_modeled_edge",
] as const;

/** Missing, stale or unusable data: the evaluation cannot be trusted, so nothing is approved. */
export const UNAVAILABLE_REASON_CODES = [
  "unknown:access_derivatives",
  "unknown:fee_spot_maker",
  "unknown:fee_spot_taker",
  "unknown:fee_perp_maker",
  "unknown:fee_perp_taker",
  "unknown:maintenance_margin_rate",
  "stale:spot_book",
  "stale:perp_book",
  "stale:mark",
  "stale:funding",
  "stale:funding_schedule",
  "future:spot_book",
  "future:perp_book",
  "future:mark",
  "future:funding",
  "skew:books",
  "depth:spot_open",
  "depth:perp_open",
  "depth:spot_close",
  "depth:perp_close",
  "book:crossed_spot",
  "book:crossed_perp",
  "funding:insufficient_history",
  "funding:invalid_interval",
  "size:perp_lot",
  "size:perp_min",
  "size:spot_lot",
  "size:spot_min",
  "instrument:inverse_unsupported",
  "instrument:not_live",
  "instrument:asset_mismatch",
  "instrument:quote_mismatch",
] as const;

export type IneligibleReasonCode = (typeof INELIGIBLE_REASON_CODES)[number];
export type UnavailableReasonCode = (typeof UNAVAILABLE_REASON_CODES)[number];
export type ReasonCode = IneligibleReasonCode | UnavailableReasonCode;

export type DerivativesErrorCode =
  | "invalid_arguments"
  | "invalid_file"
  | "invalid_utf8"
  | "invalid_json"
  | "invalid_input"
  | "invalid_snapshot"
  | "invalid_evaluation"
  | "invalid_clock"
  | "internal_error";

export class DerivativesError extends Error {
  readonly code: DerivativesErrorCode;
  /** Schema path of the offending field. Built only from schema names and array indexes, never from input content. */
  readonly path: string;
  constructor(code: DerivativesErrorCode, path = "") {
    super(path === "" ? code : `${code} ${path}`);
    this.name = "DerivativesError";
    this.code = code;
    this.path = path;
  }
}
