/**
 * Wallet evidence aggregate: net worth, reconciliation, statuses and the content hash. Pure.
 *
 * The net worth is the sum of valued ACTIVE balances and nothing else. PnL, history and cost basis are separate statements
 * and no operation of this module adds them to it (acceptance A3).
 */

import { hashOf, sha256Hex } from "./canonical.ts";
import { decToText } from "./decimal.ts";
import { sumIncluded } from "./balances.ts";
import { costBasisStatements } from "./history.ts";
import { reconcile, type ReconcileOptions } from "./reconcile.ts";
import { worstStatus } from "./state.ts";
import { EVIDENCE_SCHEMA } from "./types.ts";
import type {
  AddressAnalysisSection,
  BalanceSection,
  HistorySection,
  MarketSection,
  CollectionReport,
  NetWorth,
  Origin,
  SectionName,
  Status,
  WalletEvidence,
} from "./types.ts";

export interface WalletEvidenceInput {
  readonly origin: Origin;
  readonly nowMs: number;
  readonly maxAgeMs: number;
  /** Used only to derive `accountRef`; never stored. */
  readonly account: string;
  readonly balances: BalanceSection | null;
  readonly history?: HistorySection | null;
  readonly market?: MarketSection | null;
  readonly addressAnalysis?: AddressAnalysisSection | null;
  readonly revision?: number;
  readonly options?: ReconcileOptions;
  readonly collection?: CollectionReport | null;
}

/** A hash is not secrecy: addresses are public. It only keeps the address out of files, logs and reports. */
export function accountRefOf(account: string): { sha256: string } {
  const normalized = /^0x/i.test(account) ? account.toLowerCase() : account;
  return { sha256: sha256Hex(`wallet-evidence-account:${normalized}`) };
}

function netWorthOf(balances: BalanceSection | null, reconciliationStatus: Status): NetWorth {
  const excludes = ["pnl", "cost_basis", "history", "defi_positions"] as const;
  if (balances === null) {
    return { currency: "USD", valueText: null, valuedCount: 0, unvaluedCount: 0, excludedCount: 0, basis: "sum_of_valued_active_balances", caveats: ["balances_not_collected"], excludes, status: "incomplete" };
  }
  // Coverage that is not claimed complete means the real wallet may hold more than this figure sums.
  const caveats: string[] = [];
  if (balances.filters.riskToken.effect === "applied") caveats.push("risk_filter_applied_tokens_may_be_omitted");
  if (balances.coverage.tokenDiscovery === "allowlist") caveats.push("token_discovery_is_an_allowlist");
  if (balances.coverage.notReported.length > 0) caveats.push(`networks_without_rows:${balances.coverage.notReported.length}`);
  if (balances.coverage.truncated) caveats.push("answer_truncated");
  const sum = sumIncluded(balances);
  const valued = balances.positions.filter((position) => position.included).length;
  const unvalued = balances.positions.length - valued;
  const excluded = balances.rejected.length + balances.positions.filter((position) => position.state.kind === "divergent").length;
  return {
    currency: "USD",
    valueText: sum === null ? null : decToText(sum),
    valuedCount: valued,
    unvaluedCount: unvalued,
    excludedCount: excluded,
    basis: "sum_of_valued_active_balances",
    caveats,
    excludes,
    status: worstStatus([balances.status, reconciliationStatus, unvalued > 0 || sum === null || caveats.length > 0 ? "incomplete" : "valid"]),
  };
}

export function buildWalletEvidence(input: WalletEvidenceInput): WalletEvidence {
  const history = input.history ?? null;
  const market = input.market ?? null;
  const addressAnalysis = input.addressAnalysis ?? null;
  const reconciliation = reconcile({ balances: input.balances, history, market, addressAnalysis }, input.options);
  const failedSections = new Set((input.collection?.errors ?? []).map((error) => error.section));
  const sectionStatus = (name: SectionName, section: { status: Status } | null): Status | "not_collected" | "failed" =>
    section !== null ? section.status : failedSections.has(name) ? "failed" : "not_collected";
  const sections: Record<SectionName, Status | "not_collected" | "failed"> = {
    balances: sectionStatus("balances", input.balances),
    history: sectionStatus("history", history),
    market: sectionStatus("market", market),
    addressAnalysis: sectionStatus("addressAnalysis", addressAnalysis),
  };
  const collected = Object.values(sections).filter((status): status is Status => status !== "not_collected" && status !== "failed");
  // A refresh that failed, was stopped or skipped something is never `valid`: what was not read is not evidence.
  const anyFailed =
    Object.values(sections).includes("failed") ||
    (input.collection?.errors.length ?? 0) > 0 ||
    (input.collection?.stoppedBy ?? null) !== null ||
    (input.collection?.skipped.length ?? 0) > 0;
  const netWorth = netWorthOf(input.balances, reconciliation.balanceStatus);
  const status = worstStatus([...collected, reconciliation.status, netWorth.status, ...(anyFailed ? (["incomplete"] as const) : [])]);

  const body = {
    schema: EVIDENCE_SCHEMA,
    revision: input.revision ?? 1,
    origin: input.origin,
    realData: input.origin !== "synthetic_fixture",
    trigger: "on_demand" as const,
    generatedAtMs: input.nowMs,
    maxAgeMs: input.maxAgeMs,
    accountRef: accountRefOf(input.account),
    balances: input.balances,
    history,
    market,
    addressAnalysis,
    costBasis: costBasisStatements(history),
    netWorth,
    reconciliation,
    sections,
    collection: input.collection ?? null,
    status,
  };
  const contentSha256 = hashOf(body);
  return { ...body, evidenceId: contentSha256.slice(0, 16), contentSha256 };
}

/** The oldest local capture time found in any section: a cached evidence is as old as its oldest read, not as its build time. */
export function oldestCaptureMs(evidence: WalletEvidence): number | null {
  const times = [evidence.balances?.timing.fetchedAtMs, evidence.balances?.reportedTotal?.timing.fetchedAtMs, evidence.history?.timing.fetchedAtMs, evidence.market?.timing.fetchedAtMs, evidence.addressAnalysis?.timing.fetchedAtMs].filter((value): value is number => typeof value === "number");
  return times.length === 0 ? null : Math.min(...times);
}

/** True only for an evidence whose refresh read everything it set out to read: no error, no stop, nothing skipped, balances present. */
export function isCleanCollection(evidence: WalletEvidence): boolean {
  const collection = evidence.collection;
  return collection !== null && collection.errors.length === 0 && collection.stoppedBy === null && collection.skipped.length === 0 && evidence.balances !== null;
}

/** Recomputes the hash. False means the object was altered after it was built, or is not a v1 evidence. */
export function verifyEvidence(evidence: WalletEvidence): boolean {
  try {
    const { contentSha256, evidenceId, ...body } = evidence;
    return evidence.schema === EVIDENCE_SCHEMA && hashOf(body) === contentSha256 && contentSha256.slice(0, 16) === evidenceId;
  } catch {
    return false;
  }
}

