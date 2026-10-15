/**
 * Reconciliation rules RC1 to RC6 and the risk/liquidity observations (RK). Pure.
 *
 * Principles:
 *  - a difference is never closed by rounding: the exact delta is reported, and the possible causes are only CANDIDATES,
 *    none of them quantified;
 *  - a historical quantity with an active balance of zero (or an unknown one) is `unreconciled`, never silently consistent;
 *  - an omitted asset is never a zero balance.
 */

import { decAbs, decCmp, decIsZero, decSub, decToText, parseDec, ratioBps } from "./decimal.ts";
import { sumIncluded } from "./balances.ts";
import { netInflowByAsset } from "./history.ts";
import { netPositionFromTrades } from "./address-analysis.ts";
import { OK, state, statusOfState, worstStatus } from "./state.ts";
import type { AddressAnalysisSection, BalancePosition, BalanceSection, Finding, HistorySection, MarketSection, ReconciliationReport, Status, TotalVsSum } from "./types.ts";

export const DEFAULT_VALUE_TOLERANCE_USD = "0.01";
export const DEFAULT_THIN_LIQUIDITY_BPS = 100;
export const DEFAULT_SKEW_TOLERANCE_MS = 60_000;
/** Risk levels from this value up are "medium high" or worse. Level 0 is "undefined" and says nothing. */
export const ELEVATED_RISK_LEVEL = 3;

export interface ReconcileOptions {
  readonly valueToleranceUsd?: string;
  readonly thinLiquidityBps?: number;
  readonly skewToleranceMs?: number;
}

export interface ReconcileInput {
  readonly balances: BalanceSection | null;
  readonly history: HistorySection | null;
  readonly market: MarketSection | null;
  readonly addressAnalysis: AddressAnalysisSection | null;
}

function finding(rule: Finding["rule"], code: string, kind: Exclude<Finding["state"]["kind"], "ok">, identityKey: string | null, detail: Finding["detail"] = {}): Finding {
  return { rule, code, state: state(kind, code), identityKey, detail };
}

function totalVsSum(balances: BalanceSection, options: ReconcileOptions): TotalVsSum | null {
  const reported = balances.reportedTotal;
  if (reported === null) return null;
  const tolerance = parseDec(options.valueToleranceUsd ?? DEFAULT_VALUE_TOLERANCE_USD) ?? parseDec(DEFAULT_VALUE_TOLERANCE_USD)!;
  const toleranceText = decToText(tolerance);
  const reportedDec = reported.valueText === null ? null : parseDec(reported.valueText);
  const sum = sumIncluded(balances);
  const base = { reportedText: reported.valueText, sumText: sum === null ? null : decToText(sum), toleranceText };
  if (reportedDec === null) return { ...base, deltaText: null, withinTolerance: null, candidateCauses: [], state: state("unverified", "reported_total_unreadable") };

  const causes: string[] = [];
  if (reported.scope === "all" || reported.scope === "defi") causes.push("scope_includes_defi_positions");
  const sameChains = reported.chains.length === balances.coverage.requested.length && reported.chains.every((chain) => balances.coverage.requested.includes(chain));
  if (!sameChains) causes.push("chains_differ_between_calls");
  if (reported.riskFilter !== balances.filters.riskToken.effect) causes.push("risk_filter_differs_between_calls");
  else if (balances.filters.riskToken.effect === "applied") causes.push("risk_filter_applied_may_omit_tokens");
  if (balances.positions.some((position) => position.origin === "provider_row" && !position.included && position.state.kind !== "divergent")) causes.push("unvalued_positions");
  if (balances.positions.some((position) => position.origin === "expected_not_returned")) causes.push("expected_assets_not_returned");
  if (balances.rejected.length > 0) causes.push("rejected_rows");
  if (balances.positions.some((position) => position.state.kind === "divergent")) causes.push("divergent_positions_excluded");
  const skewMs = Math.abs((reported.timing.fetchedAtMs ?? 0) - (balances.timing.fetchedAtMs ?? 0));
  if (skewMs > (options.skewToleranceMs ?? DEFAULT_SKEW_TOLERANCE_MS)) causes.push("calls_far_apart_in_time");

  if (sum === null) {
    if (decIsZero(reportedDec)) return { ...base, deltaText: null, withinTolerance: null, candidateCauses: causes, state: state("unverified", "no_valued_positions_to_compare") };
    return { ...base, deltaText: decToText(reportedDec), withinTolerance: false, candidateCauses: causes, state: state("unreconciled", "total_without_valued_positions") };
  }
  const delta = decSub(reportedDec, sum);
  const within = decCmp(decAbs(delta), tolerance) <= 0;
  if (within) return { ...base, deltaText: decToText(delta), withinTolerance: true, candidateCauses: [], state: OK };
  // A reported total SMALLER than the sum cannot be explained by causes that only make the total larger (DeFi scope,
  // unvalued or omitted assets, rejected rows). Only causes that can lower a total against the sum remain.
  const lowersTotal = new Set(["chains_differ_between_calls", "risk_filter_differs_between_calls", "calls_far_apart_in_time"]);
  const relevant = delta.units < 0n ? causes.filter((cause) => lowersTotal.has(cause)) : causes;
  return {
    ...base,
    deltaText: decToText(delta),
    withinTolerance: false,
    candidateCauses: relevant,
    // With candidate causes the gap is flagged and explained qualitatively; without any it is unexplained and divergent.
    state: relevant.length > 0 ? state("unreconciled", "total_differs_candidate_causes") : state("divergent", "total_differs_unexplained"),
  };
}

function positionByKey(balances: BalanceSection): Map<string, BalancePosition> {
  return new Map(balances.positions.map((position) => [position.identity.key, position]));
}

export function reconcile(input: ReconcileInput, options: ReconcileOptions = {}): ReconciliationReport {
  const findings: Finding[] = [];
  const { balances, history, market, addressAnalysis } = input;
  let total: TotalVsSum | null = null;

  if (balances !== null) {
    // RC1: reported total against the sum of valued positions.
    total = totalVsSum(balances, options);
    if (total !== null && total.state.kind !== "ok") {
      findings.push(finding("RC1", total.state.code, total.state.kind as Exclude<Finding["state"]["kind"], "ok">, null, { deltaText: total.deltaText, reportedText: total.reportedText, sumText: total.sumText, candidateCauses: total.candidateCauses.join(",") }));
    }

    // RC3: identity.
    for (const position of balances.positions) {
      if (position.state.kind === "divergent" && position.caveats.includes("conflicting_duplicates")) {
        findings.push(finding("RC3", position.state.code, "divergent", position.identity.key, { rows: position.rowLocators.length }));
      }
    }
    if (balances.duplicatesCollapsed > 0) findings.push({ rule: "RC3", code: "duplicate_collapsed", state: OK, identityKey: null, detail: { collapsed: balances.duplicatesCollapsed } });
    const bySymbol = new Map<string, Set<string>>();
    for (const position of balances.positions) {
      if (position.display.symbol === null || position.origin !== "provider_row") continue;
      const label = `${position.identity.chainIndex}|${position.display.symbol.toUpperCase()}`;
      const keys = bySymbol.get(label) ?? new Set<string>();
      keys.add(position.identity.key);
      bySymbol.set(label, keys);
    }
    for (const [label, keys] of bySymbol) if (keys.size > 1) findings.push(finding("RC3", "same_symbol_different_contract_on_network", "unverified", null, { label, assets: keys.size }));

    // RC6: assets another source expects that the balance answer did not return.
    for (const position of balances.positions) {
      if (position.origin === "expected_not_returned") findings.push(finding("RC6", position.state.code, position.state.kind as "omitted_by_filter" | "missing", position.identity.key, { filter: balances.filters.riskToken.effect }));
    }

    // RC2: valuation against quantity.
    for (const position of balances.positions) {
      if (position.quantity.state.kind === "ok" && position.quantity.atoms !== "0" && position.valuation.state.code === "price_zero_unverified") {
        findings.push(finding("RC2", "valuation_zero_with_quantity", "unreconciled", position.identity.key, { quantity: position.quantity.displayText }));
      }
    }
  }

  // RC4: rejected rows of any section.
  for (const [section, rejected] of [["balances", balances?.rejected ?? []], ["history", history?.rejected ?? []], ["address_analysis", addressAnalysis?.rejected ?? []]] as const) {
    for (const row of rejected) findings.push(finding("RC4", row.code, "divergent", null, { section, locator: row.locator, chainIndex: row.chainIndex }));
  }

  // RC2: historical quantity against the active balance.
  if (balances !== null) {
    const byKey = positionByKey(balances);
    const signals = new Map<string, string>();
    if (addressAnalysis !== null) {
      for (const position of addressAnalysis.positions) {
        const amount = parseDec(position.tokenBalanceAmountText);
        if (amount !== null && amount.units > 0n && position.soldOutAtMs === null) signals.set(position.identity.key, "provider_pnl_balance");
      }
    }
    if (history !== null) {
      for (const [key, inflow] of netInflowByAsset(history, balances.timing.fetchedAtMs ?? undefined)) if (inflow.units > 0n && !signals.has(key)) signals.set(key, "history_window_net_inflow");
    }
    if (addressAnalysis !== null) {
      for (const [key, net] of netPositionFromTrades(addressAnalysis, balances.timing.fetchedAtMs ?? undefined)) if (net.units > 0n && !signals.has(key)) signals.set(key, "dex_history_window_net_buy");
    }
    for (const [key, signal] of [...signals].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const position = byKey.get(key);
      if (position === undefined) {
        findings.push(finding("RC2", "historical_quantity_active_absent", "unreconciled", key, { signal, activeState: "absent_from_answer" }));
      } else if (position.origin === "expected_not_returned" || position.quantity.state.kind === "missing" || position.quantity.state.kind === "omitted_by_filter") {
        findings.push(finding("RC2", "historical_quantity_active_unknown", "unreconciled", key, { signal, activeState: position.quantity.state.code }));
      } else if (position.quantity.state.kind === "ok" && position.quantity.atoms === "0") {
        findings.push(finding("RC2", "historical_quantity_active_zero", "unreconciled", key, { signal, activeState: "zero" }));
      }
    }
  }

  // PN: the provider's own PnL consistency (its total against realized plus unrealized).
  for (const check of addressAnalysis?.tokenPnlChecks ?? []) {
    if (check.state.kind === "ok") continue;
    findings.push(finding("PN", check.state.code, check.state.kind as Exclude<Finding["state"]["kind"], "ok">, check.identity.key, { totalText: check.totalText, partsSumText: check.partsSumText, deltaText: check.deltaText }));
  }

  // RK: risk and liquidity observations. They reconcile nothing; they keep an exposed position from looking safe.
  if (balances !== null) {
    for (const position of balances.positions) {
      if (position.risk.assessment === "flagged") findings.push(finding("RK", "risk_flagged_by_provider", "unverified", position.identity.key, { counted: position.included }));
    }
  }
  if (market !== null) {
    for (const row of market.risk) {
      if (row.state.kind !== "ok") continue;
      if ((row.riskControlLevel !== null && row.riskControlLevel >= ELEVATED_RISK_LEVEL) || row.tags.includes("honeypot") || row.tags.includes("lowLiquidity")) {
        findings.push(finding("RK", "risk_elevated", "unverified", row.identity.key, { level: row.riskControlLevel, tags: row.tags.join(",") }));
      }
    }
    if (balances !== null) {
      const byKey = positionByKey(balances);
      for (const row of market.liquidity) {
        const position = byKey.get(row.identity.key);
        const value = parseDec(position?.valuation.valueText);
        const lowerBound = parseDec(row.liquidityUsdLowerBoundText);
        if (position === undefined || value === null || lowerBound === null) continue;
        const share = ratioBps(value, lowerBound);
        if (lowerBound.units === 0n && value.units > 0n) findings.push(finding("RK", "no_visible_liquidity", "unverified", row.identity.key, {}));
        else if (share !== null && share > BigInt(options.thinLiquidityBps ?? DEFAULT_THIN_LIQUIDITY_BPS)) findings.push(finding("RK", "position_large_vs_top_pools", "unverified", row.identity.key, { shareBps: Number(share) }));
      }
    }
  }

  const statusOf = (list: readonly Finding[]): Status => worstStatus(list.map((item) => statusOfState(item.state.kind)).concat(list.length === 0 ? ["valid"] : []));
  // Only findings about the active balances bear on the net worth; provider PnL, family rows and risk notes do not.
  const bearsOnBalances = (item: Finding): boolean => item.rule === "RC1" || item.rule === "RC2" || item.rule === "RC3" || item.rule === "RC5" || item.rule === "RC6" || (item.rule === "RC4" && item.detail.section === "balances");
  return { findings, totalVsSum: total, status: statusOf(findings), balanceStatus: statusOf(findings.filter(bearsOnBalances)) };
}

/** RC5: a late or conflicting revision never replaces a newer one. */
export function compareRevision(
  previous: { readonly generatedAtMs: number; readonly revision: number; readonly contentSha256: string } | null,
  next: { readonly generatedAtMs: number; readonly revision: number; readonly contentSha256: string },
): Finding | null {
  if (previous === null) return null;
  if (next.revision < previous.revision || next.generatedAtMs < previous.generatedAtMs) {
    return finding("RC5", "older_revision", "stale", null, { previousRevision: previous.revision, nextRevision: next.revision });
  }
  if (next.revision === previous.revision && next.contentSha256 !== previous.contentSha256) {
    return finding("RC5", "revision_conflict", "divergent", null, { revision: next.revision });
  }
  return null;
}
