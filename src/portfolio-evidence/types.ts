/**
 * Wallet evidence contract v1. Specification: docs/portfolio-evidence-v1/SPEC.md and docs/sdd/carteira-evidencia (design section 4).
 *
 * Pure types and closed vocabularies. No behavior, no input or output. Money is always decimal TEXT or integer TEXT (atoms),
 * never a JavaScript number. Unknown is a state, never a zero.
 */

export const EVIDENCE_SCHEMA = "wallet_evidence_v2" as const;
export const ADAPTER_VERSION = "portfolio-evidence-adapters-1" as const;

export type Origin = "synthetic_fixture" | "local_import" | "browser_wallet" | "public_rpc" | "okx_web3_api";

export type ChainFamily = "evm" | "solana" | "tron" | "sui" | "ton" | "bitcoin";

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const STATE_KINDS = ["ok", "missing", "omitted_by_filter", "stale", "future", "divergent", "unreconciled", "unverified"] as const;
export type StateKind = (typeof STATE_KINDS)[number];

/** A datum is either `ok` or carries the reason it is not. A state never projects a quantity or a value. */
export interface EvidenceState {
  readonly kind: StateKind;
  readonly code: string;
}

export const STATUSES = ["valid", "incomplete", "stale", "divergent", "unreconciled"] as const;
/** The five outcomes shown to a reader. `valid` means no open finding; it never means "complete since inception". */
export type Status = (typeof STATUSES)[number];

export type Freshness = "unknown" | "future" | "fresh" | "stale";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface AssetIdentity {
  readonly chainIndex: string;
  readonly family: ChainFamily;
  readonly asset: { readonly kind: "native_marker" } | { readonly kind: "contract"; readonly address: string };
  /** `${chainIndex}:native` or `${chainIndex}:contract:${canonical address}`. The symbol is never part of the key. */
  readonly key: string;
}

/** Presentation only. Third party text, control characters removed, bounded. */
export interface AssetDisplay {
  readonly symbol: string | null;
}

// ---------------------------------------------------------------------------
// Time, source, coverage, filters
// ---------------------------------------------------------------------------

export interface Timing {
  /** Local clock when the answer became knowable to us. */
  readonly fetchedAtMs: number | null;
  /** The provider's own clock for the datum, when it gives one. Never defaulted from `fetchedAtMs`. */
  readonly sourceTimeMs: number | null;
  /** Provider clock minus local clock, when measured. */
  readonly clockOffsetMs: number | null;
}

export interface FreshnessReport {
  /** Age of OUR reading against `nowMs`. */
  readonly capture: Freshness;
  /** Age of the provider datum against `fetchedAtMs`; `unknown` when the provider gives no clock. */
  readonly source: Freshness;
}

export interface SourceInfo {
  readonly id: string;
  readonly endpoint: string | null;
  readonly method: "GET" | "POST" | null;
  readonly apiVersion: "v6" | null;
  readonly adapterVersion: string;
  /** Documented plan tier of the endpoint, or unknown. */
  readonly tier: string;
}

export interface Coverage {
  readonly requested: readonly string[];
  /** Requested networks for which at least one row came back. */
  readonly observed: readonly string[];
  /** Requested networks with no row. This is NOT a zero balance: the wallet may be empty or the network unsupported. */
  readonly notReported: readonly string[];
  readonly tokenDiscovery: "provider_all" | "allowlist" | "unknown";
  readonly status: "complete_claimed" | "partial" | "unknown";
  readonly pagesRead: number;
  readonly truncated: boolean;
  readonly stopReason: string;
}

export interface RiskFilterInfo {
  /** What was sent: `0` filters, `1` does not filter, `default` means the parameter was omitted (the provider default is to filter). */
  readonly requested: "0" | "1" | "default" | "not_applicable";
  readonly effect: "applied" | "not_applied" | "unknown";
  /** Networks where the provider documents the honeypot filter. */
  readonly supportedChains: readonly string[];
}

export interface Filters {
  readonly riskToken: RiskFilterInfo;
  readonly other: readonly string[];
}

export interface Issue {
  readonly code: string;
  readonly severity: "info" | "warning" | "blocking";
  readonly locator: string | null;
}

// ---------------------------------------------------------------------------
// Active balance
// ---------------------------------------------------------------------------

export type DecimalsSource = "provider_token_info" | "registry_pinned" | "derived_raw_ratio" | "unknown";

export interface Quantity {
  /** Decimal text exactly as the provider sent it (token units). */
  readonly displayText: string | null;
  /** `rawBalance` exactly as sent; empty becomes null. */
  readonly rawText: string | null;
  /** Integer text. Present only when `decimals` is known and consistent with the provider text. */
  readonly atoms: string | null;
  readonly decimals: number | null;
  readonly decimalsSource: DecimalsSource;
  readonly unit: "token" | "unknown";
  readonly state: EvidenceState;
}

export interface Valuation {
  readonly currency: "USD" | null;
  readonly priceText: string | null;
  readonly priceSource: string | null;
  /** Provider clock for the price; null when the provider gives none. */
  readonly priceAsOfMs: number | null;
  readonly valueText: string | null;
  readonly state: EvidenceState;
}

export interface RiskFlag {
  readonly providerFlag: boolean | null;
  readonly honeypotFilterSupported: boolean;
  /** `not_flagged` only where the provider filter exists for the network; elsewhere a false flag says nothing. */
  readonly assessment: "flagged" | "not_flagged" | "unknown";
}

export interface BalancePosition {
  readonly identity: AssetIdentity;
  readonly display: AssetDisplay;
  readonly quantity: Quantity;
  readonly valuation: Valuation;
  readonly risk: RiskFlag;
  readonly membership: "selected" | "outside_selection" | "unknown";
  /** `expected_not_returned` is an asset another source says exists but the balance answer did not return. */
  readonly origin: "provider_row" | "expected_not_returned";
  readonly rowLocators: readonly string[];
  /** True when the position enters the net worth. */
  readonly included: boolean;
  readonly caveats: readonly string[];
  readonly state: EvidenceState;
}

/** Rows rejected before they could become positions (wrong network, wrong contract, wrong account, unreadable). */
export interface RejectedRow {
  readonly locator: string;
  readonly code: string;
  readonly chainIndex: string | null;
}

export interface ReportedTotal {
  readonly currency: "USD" | null;
  readonly valueText: string | null;
  readonly scope: "all" | "tokens" | "defi" | "unknown";
  readonly chains: readonly string[];
  readonly riskFilter: "applied" | "not_applied" | "unknown";
  readonly timing: Timing;
  readonly state: EvidenceState;
}

export interface BalanceSection {
  readonly kind: "balances";
  readonly source: SourceInfo;
  readonly timing: Timing;
  readonly freshness: FreshnessReport;
  readonly coverage: Coverage;
  readonly filters: Filters;
  readonly positions: readonly BalancePosition[];
  readonly rejected: readonly RejectedRow[];
  readonly duplicatesCollapsed: number;
  readonly reportedTotal: ReportedTotal | null;
  readonly issues: readonly Issue[];
  readonly status: Status;
}

// ---------------------------------------------------------------------------
// History, cost basis, PnL (distinct from the active balance)
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  readonly entryId: string;
  readonly identity: AssetIdentity;
  readonly display: AssetDisplay;
  readonly direction: "in" | "out" | "self" | "unknown";
  readonly itype: "0" | "1" | "2" | null;
  /** Decimal text as sent; its unit is not declared by the provider. */
  readonly amountText: string | null;
  readonly feeText: string | null;
  readonly feeUnit: null;
  readonly txStatus: "success" | "fail" | "pending" | "unknown";
  readonly tx: { readonly chainIndex: string; readonly hash: string };
  readonly txTimeMs: number | null;
  readonly hitBlacklist: boolean | null;
  readonly state: EvidenceState;
}

export interface HistoryWindow {
  readonly requestedFromMs: number | null;
  readonly requestedToMs: number | null;
  /** The provider documents a six month window. */
  readonly providerLimitMonths: 6;
  /** Earliest instant the window can possibly cover: the later of the requested start and now minus six months. */
  readonly coverageFromMs: number | null;
  readonly oldestEntryMs: number | null;
  readonly newestEntryMs: number | null;
  /** `complete_declared` only for a local import that declares it; this provider never does. */
  readonly completeness: "partial_six_months" | "partial_truncated" | "unknown" | "complete_declared";
}

export interface HistorySection {
  readonly kind: "history";
  readonly source: SourceInfo;
  readonly timing: Timing;
  readonly freshness: FreshnessReport;
  readonly coverage: Coverage;
  readonly window: HistoryWindow;
  readonly entries: readonly HistoryEntry[];
  readonly rejected: readonly RejectedRow[];
  readonly duplicatesCollapsed: number;
  readonly issues: readonly Issue[];
  readonly status: Status;
}

export interface CostBasisStatement {
  readonly identity: AssetIdentity;
  readonly method: "average" | "unknown";
  readonly currency: "USD" | null;
  readonly basisText: string | null;
  readonly coverage: "full_history" | "partial_window" | "unknown";
  readonly state: EvidenceState;
}

export type PnlClass = "realized" | "unrealized_reported" | "projected" | "simulated" | "inventory_delta";

export interface PnlStatement {
  readonly class: PnlClass;
  readonly scope: "overview" | "token";
  readonly identity: AssetIdentity | null;
  readonly currency: "USD";
  readonly valueText: string | null;
  /** The provider documents no accounting method and no completeness: every figure stays unverified. */
  readonly basis: "provider_reported_unverified";
  readonly window: string;
  readonly costsKnown: "unknown";
  readonly state: EvidenceState;
}

export interface PnlPosition {
  readonly identity: AssetIdentity;
  readonly display: AssetDisplay;
  /** The provider's own held quantity. Unit not declared. Used only as a signal for reconciliation. */
  readonly tokenBalanceAmountText: string | null;
  readonly tokenBalanceUsdText: string | null;
  readonly lastActiveMs: number | null;
  readonly holdingSinceMs: number | null;
  readonly soldOutAtMs: number | null;
  readonly state: EvidenceState;
}

export type DexTradeKind = "buy" | "sell" | "transfer_in" | "transfer_out" | "unknown";

/** One DEX trade or transfer of the provider's trade history (a different family from the on-chain transaction history). */
export interface DexTrade {
  readonly tradeId: string;
  readonly identity: AssetIdentity;
  readonly display: AssetDisplay;
  readonly kind: DexTradeKind;
  /** Token units, decimal text as sent; the unit is not declared by the provider. */
  readonly amountText: string | null;
  /** USD, decimal text as sent. */
  readonly valueUsdText: string | null;
  /** Price as sent; its unit is not declared. */
  readonly priceText: string | null;
  readonly pnlUsdText: string | null;
  readonly timeMs: number | null;
  readonly state: EvidenceState;
}

/**
 * Sums over the trades OBSERVED in the requested window. This is NOT a cost basis and NOT a historical cost: the window is
 * bounded, the provider keeps at most 1000 records and declares no completeness, and a transfer in has no price.
 */
export interface ObservedAcquisition {
  readonly identity: AssetIdentity;
  readonly buyCount: number;
  readonly buyAmountText: string | null;
  readonly buyValueUsdText: string | null;
  readonly sellCount: number;
  readonly sellAmountText: string | null;
  readonly sellValueUsdText: string | null;
  readonly transferInCount: number;
  readonly transferInAmountText: string | null;
  readonly transferOutCount: number;
  readonly transferOutAmountText: string | null;
  /** Trades of this asset that did not read cleanly and are NOT in the sums above. */
  readonly excludedTradeCount: number;
  readonly window: { readonly fromMs: number; readonly toMs: number };
  readonly coverage: "partial_window";
  readonly state: EvidenceState;
}

/** The provider's own consistency: its total PnL of a token against realized plus unrealized. */
export interface TokenPnlCheck {
  readonly identity: AssetIdentity;
  /** `isPnlSupported` as sent; null when it is not a boolean. */
  readonly supported: boolean | null;
  readonly totalText: string | null;
  readonly partsSumText: string | null;
  /** total minus (realized + unrealized), exact. */
  readonly deltaText: string | null;
  readonly state: EvidenceState;
}

export interface PortfolioSupport {
  /** Chains the provider lists for the portfolio family, or null when the list was not asked for. A sample list is not proof of absence. */
  readonly listedChains: readonly string[] | null;
  readonly requestedChainListed: boolean | null;
}

export interface AddressAnalysisSection {
  readonly kind: "address_analysis";
  readonly source: SourceInfo;
  readonly timing: Timing;
  readonly freshness: FreshnessReport;
  readonly coverage: Coverage;
  readonly timeFrame: string;
  readonly positions: readonly PnlPosition[];
  readonly statements: readonly PnlStatement[];
  readonly tokenPnlChecks: readonly TokenPnlCheck[];
  readonly trades: readonly DexTrade[];
  readonly tradesDuplicatesCollapsed: number;
  readonly acquisitions: readonly ObservedAcquisition[];
  readonly portfolioSupport: PortfolioSupport;
  readonly rejected: readonly RejectedRow[];
  readonly issues: readonly Issue[];
  readonly status: Status;
}

// ---------------------------------------------------------------------------
// Market evidence: price, decimals, liquidity, risk
// ---------------------------------------------------------------------------

export interface PriceEvidence {
  readonly identity: AssetIdentity;
  readonly priceText: string | null;
  /** The documentation does not declare the currency of the market price. */
  readonly currency: null;
  /** The provider's own clock for the price, in milliseconds; null when absent or not a plain millisecond value. */
  readonly timeMs: number | null;
  /** Local clock when THIS price answer was read. The price clock is judged against it, not against the balances read. */
  readonly fetchedAtMs: number | null;
  readonly state: EvidenceState;
}

export interface TokenInfoEvidence {
  readonly identity: AssetIdentity;
  readonly decimals: number | null;
  readonly state: EvidenceState;
}

export interface LiquidityEvidence {
  readonly identity: AssetIdentity;
  readonly poolsRead: number;
  /** The provider lists at most five pools: the sum is a lower bound of the real liquidity, never the total. */
  readonly liquidityUsdLowerBoundText: string | null;
  readonly scope: "top_pools_lower_bound";
  readonly state: EvidenceState;
}

export interface RiskEvidence {
  readonly identity: AssetIdentity;
  /** 0 means "undefined" and says nothing about safety. */
  readonly riskControlLevel: number | null;
  readonly tags: readonly string[];
  readonly state: EvidenceState;
}

export interface MarketSection {
  readonly kind: "market";
  readonly source: SourceInfo;
  readonly timing: Timing;
  readonly freshness: FreshnessReport;
  readonly prices: readonly PriceEvidence[];
  readonly tokenInfo: readonly TokenInfoEvidence[];
  readonly liquidity: readonly LiquidityEvidence[];
  readonly risk: readonly RiskEvidence[];
  /** Requested aspects the provider did not answer, by identity key: absent, never a row of zeros. */
  readonly missing: readonly { readonly key: string; readonly aspect: "price" | "token_info" | "liquidity" | "risk" }[];
  readonly issues: readonly Issue[];
  readonly status: Status;
}

// ---------------------------------------------------------------------------
// Reconciliation and aggregate
// ---------------------------------------------------------------------------

/** RC1 to RC6 are the SDD reconciliation rules. RK carries risk and liquidity observations; PN the provider's own PnL consistency. */
export type ReconciliationRule = "RC1" | "RC2" | "RC3" | "RC4" | "RC5" | "RC6" | "RK" | "PN";

export interface Finding {
  readonly rule: ReconciliationRule;
  readonly code: string;
  readonly state: EvidenceState;
  readonly identityKey: string | null;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface TotalVsSum {
  readonly reportedText: string | null;
  readonly sumText: string | null;
  /** reported minus sum, exact. Never rounded to make it close. */
  readonly deltaText: string | null;
  readonly toleranceText: string;
  readonly withinTolerance: boolean | null;
  /** Possible causes that were checked. None of them is quantified: the delta is not attributed to them. */
  readonly candidateCauses: readonly string[];
  readonly state: EvidenceState;
}

export interface ReconciliationReport {
  readonly findings: readonly Finding[];
  readonly totalVsSum: TotalVsSum | null;
  /** Worst status over EVERYTHING reconciled. */
  readonly status: Status;
  /** Worst status over the findings that bear on the active balances only (RC1, RC2, RC3, RC6 and RC4 of the balance rows). The net worth uses this one. */
  readonly balanceStatus: Status;
}

export interface NetWorth {
  readonly currency: "USD";
  /** Sum of valued, included, active balances. Null when no position is valued: unknown is not zero. */
  readonly valueText: string | null;
  readonly valuedCount: number;
  readonly unvaluedCount: number;
  readonly excludedCount: number;
  readonly basis: "sum_of_valued_active_balances";
  /** Why the figure may be smaller than the real wallet (omitted tokens, networks without rows, truncation). Empty only when coverage is claimed complete. */
  readonly caveats: readonly string[];
  /** Never part of this figure. */
  readonly excludes: readonly ["pnl", "cost_basis", "history", "defi_positions"];
  readonly status: Status;
}

export type SectionName = "balances" | "history" | "market" | "addressAnalysis";

/** Why a collection stopped before it finished, when it did. */
export type StopReason = "offline" | "access_denied" | "credentials_rejected" | "payment_required" | "rate_limited" | "deadline" | "call_budget";

export interface SectionError {
  readonly section: SectionName | "totalValue" | "riskProbe";
  /** Closed code, never provider text. */
  readonly code: string;
  readonly httpStatus: number | null;
  readonly apiCode: string | null;
}

/** What the on-demand refresh did. Absent sections are explained here instead of being left out silently. */
export interface CollectionReport {
  readonly trigger: "on_demand";
  readonly callsMade: number;
  readonly callBudget: number;
  readonly stoppedBy: StopReason | null;
  readonly errors: readonly SectionError[];
  /** Sections or calls not attempted, with the reason (budget, breaker, not requested). */
  readonly skipped: readonly { readonly what: string; readonly reason: string }[];
}

export interface WalletEvidence {
  readonly schema: typeof EVIDENCE_SCHEMA;
  /** First 16 hex characters of `contentSha256`. */
  readonly evidenceId: string;
  readonly revision: number;
  readonly origin: Origin;
  /** Always false for `synthetic_fixture`. A reader must show the label. */
  readonly realData: boolean;
  readonly trigger: "on_demand";
  readonly generatedAtMs: number;
  readonly maxAgeMs: number;
  readonly accountRef: { readonly sha256: string };
  readonly balances: BalanceSection | null;
  readonly history: HistorySection | null;
  readonly market: MarketSection | null;
  readonly addressAnalysis: AddressAnalysisSection | null;
  readonly costBasis: readonly CostBasisStatement[];
  readonly netWorth: NetWorth;
  readonly reconciliation: ReconciliationReport;
  /** `failed` means the read was attempted and errored (see `collection.errors`); it is not the same as not collected. */
  readonly sections: Readonly<Record<SectionName, Status | "not_collected" | "failed">>;
  readonly collection: CollectionReport | null;
  readonly status: Status;
  /** sha256 of the canonical JSON of this object without this field. */
  readonly contentSha256: string;
}
