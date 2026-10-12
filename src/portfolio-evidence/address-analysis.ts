/**
 * Address Analysis section builder (provider PnL). Everything here is `provider_reported_unverified`: the documentation
 * declares no accounting method, no history window and no completeness, and its own example does not add up.
 * PnL is therefore a separate statement, never an addend of the net worth.
 */

import { parseDec } from "./decimal.ts";
import { buildIdentity, sanitizeDisplay } from "./identity.ts";
import { OK, freshnessReport, state, statusOfFreshness, statusOfState, worstStatus } from "./state.ts";
import type { AddressAnalysisSection, AssetIdentity, Coverage, EvidenceState, Issue, PnlPosition, PnlStatement, RejectedRow, SourceInfo, Status } from "./types.ts";

export const TIME_FRAMES = Object.freeze({ "1": "1D", "2": "3D", "3": "7D", "4": "1M", "5": "3M" } as const);
export type TimeFrameCode = keyof typeof TIME_FRAMES;

export interface RawPnlRow {
  readonly locator: string;
  readonly chainIndex: unknown;
  readonly tokenContractAddress: unknown;
  readonly tokenSymbol: unknown;
  readonly lastActiveTimestamp: unknown;
  readonly unrealizedPnlUsd: unknown;
  readonly realizedPnlUsd: unknown;
  readonly totalPnlUsd: unknown;
  readonly tokenBalanceUsd: unknown;
  readonly tokenBalanceAmount: unknown;
  readonly tokenPositionDuration: unknown;
}

export interface RawOverview {
  readonly realizedPnlUsd: unknown;
}

export interface AddressAnalysisBuildInput {
  readonly chainIndex: string;
  readonly timeFrame: TimeFrameCode | null;
  readonly overview: RawOverview | null;
  readonly rows: readonly RawPnlRow[];
  readonly source: SourceInfo;
  readonly fetchedAtMs: number;
  readonly nowMs: number;
  readonly maxAgeMs: number;
  readonly pagesRead: number;
  readonly truncated: boolean;
  readonly stopReason: string;
}

function epoch(value: unknown): number | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d{10,16}$/.test(text)) return null;
  const parsed = Number(text);
  return parsed >= 946_684_800_000 && parsed <= 4_102_444_800_000 ? parsed : null;
}

function signedStatement(klass: PnlStatement["class"], scope: PnlStatement["scope"], identity: AssetIdentity | null, raw: unknown, window: string): PnlStatement {
  const base = { class: klass, scope, identity, currency: "USD" as const, basis: "provider_reported_unverified" as const, window, costsKnown: "unknown" as const };
  if (raw === undefined || raw === null || raw === "") return { ...base, valueText: null, state: state("missing", "pnl_missing") };
  if (raw === "SELL_ALL") return { ...base, valueText: null, state: state("unverified", "provider_sell_all_marker") };
  if (parseDec(raw, true) === null) return { ...base, valueText: null, state: state("unverified", "pnl_unreadable") };
  return { ...base, valueText: raw as string, state: state("unverified", "provider_reported_unverified") };
}

export function buildAddressAnalysisSection(input: AddressAnalysisBuildInput): AddressAnalysisSection {
  const rejected: RejectedRow[] = [];
  const issues: Issue[] = [];
  const positions: PnlPosition[] = [];
  const statements: PnlStatement[] = [];
  const overviewWindow = input.timeFrame === null ? "timeframe_not_given" : `timeframe_${TIME_FRAMES[input.timeFrame]}`;

  if (input.overview !== null) statements.push(signedStatement("realized", "overview", null, input.overview.realizedPnlUsd, overviewWindow));

  const seen = new Set<string>();
  for (const row of input.rows) {
    const built = buildIdentity(row.chainIndex, row.tokenContractAddress);
    const chainIndex = typeof row.chainIndex === "string" ? row.chainIndex : null;
    if (!built.ok) {
      rejected.push({ locator: row.locator, code: built.code === "unknown_network" ? "network_mismatch" : "contract_invalid_for_network", chainIndex });
      continue;
    }
    if (built.identity.chainIndex !== input.chainIndex) {
      rejected.push({ locator: row.locator, code: "network_mismatch", chainIndex });
      continue;
    }
    if (seen.has(built.identity.key)) {
      rejected.push({ locator: row.locator, code: "duplicate_identity", chainIndex });
      continue;
    }
    seen.add(built.identity.key);
    const amount = parseDec(row.tokenBalanceAmount);
    const usd = parseDec(row.tokenBalanceUsd);
    const duration = typeof row.tokenPositionDuration === "object" && row.tokenPositionDuration !== null ? (row.tokenPositionDuration as Record<string, unknown>) : {};
    const positionState: EvidenceState = amount === null ? state("missing", "token_balance_amount_unreadable") : OK;
    positions.push({
      identity: built.identity,
      display: sanitizeDisplay(row.tokenSymbol),
      tokenBalanceAmountText: amount === null ? null : (row.tokenBalanceAmount as string),
      tokenBalanceUsdText: usd === null ? null : (row.tokenBalanceUsd as string),
      lastActiveMs: epoch(row.lastActiveTimestamp),
      holdingSinceMs: epoch(duration.holdingTimestamp),
      soldOutAtMs: epoch(duration.sellOffTimestamp),
      state: positionState,
    });
    statements.push(signedStatement("realized", "token", built.identity, row.realizedPnlUsd, "unspecified_by_provider"));
    statements.push(signedStatement("unrealized_reported", "token", built.identity, row.unrealizedPnlUsd, "unspecified_by_provider"));
  }

  const timing = { fetchedAtMs: input.fetchedAtMs, sourceTimeMs: null, clockOffsetMs: null };
  const freshness = freshnessReport(timing, input.nowMs, input.maxAgeMs);
  const observed = positions.length > 0 || input.overview !== null ? [input.chainIndex] : [];
  const coverage: Coverage = {
    requested: [input.chainIndex],
    observed,
    notReported: observed.length === 0 ? [input.chainIndex] : [],
    tokenDiscovery: "unknown",
    status: "partial",
    pagesRead: input.pagesRead,
    truncated: input.truncated,
    stopReason: input.stopReason,
  };

  for (const row of rejected) issues.push({ code: row.code, severity: "blocking", locator: row.locator });
  issues.push({ code: "pnl_method_and_window_undeclared", severity: "warning", locator: null });
  if (input.truncated) issues.push({ code: "pnl_list_truncated", severity: "warning", locator: null });

  const status: Status = worstStatus([
    statusOfFreshness(freshness),
    ...positions.map((position) => statusOfState(position.state.kind)),
    ...(rejected.length > 0 ? (["divergent"] as const) : []),
    ...(input.truncated ? (["incomplete"] as const) : []),
  ]);

  return { kind: "address_analysis", source: input.source, timing, freshness, coverage, timeFrame: overviewWindow, positions, statements, rejected, issues, status };
}
