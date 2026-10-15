/**
 * Transaction history section builder. History is a DIFFERENT concept from the active balance: it never enters the net worth,
 * and a window of six months is never a complete history (so it can never yield an acquisition cost).
 */

import { decAdd, decSub, parseDec, type Dec } from "./decimal.ts";
import { hashOf, safeScalar } from "./canonical.ts";
import { boundedChainIndex, buildIdentity, canonicalAccount, sanitizeDisplay } from "./identity.ts";
import { OK, freshnessReport, state, statusOfFreshness, statusOfState, worstStatus, FUTURE_TOLERANCE_MS } from "./state.ts";
import type { Coverage, CostBasisStatement, HistoryEntry, HistorySection, HistoryWindow, Issue, RejectedRow, SourceInfo, Status } from "./types.ts";

export const SIX_MONTHS_MS = 183 * 86_400_000;
const MIN_PLAUSIBLE_MS = 946_684_800_000;
const MAX_PLAUSIBLE_MS = 4_102_444_800_000;

export interface RawHistoryRow {
  readonly locator: string;
  readonly chainIndex: unknown;
  readonly txHash: unknown;
  readonly itype: unknown;
  readonly methodId: unknown;
  readonly nonce: unknown;
  readonly txTime: unknown;
  readonly from: unknown;
  readonly to: unknown;
  readonly tokenContractAddress: unknown;
  readonly amount: unknown;
  readonly symbol: unknown;
  readonly txFee: unknown;
  readonly txStatus: unknown;
  readonly hitBlacklist: unknown;
}

export interface HistoryBuildInput {
  readonly account: string;
  readonly requestedChains: readonly string[];
  readonly rows: readonly RawHistoryRow[];
  readonly source: SourceInfo;
  readonly fetchedAtMs: number;
  readonly nowMs: number;
  readonly maxAgeMs: number;
  readonly requestedFromMs: number | null;
  readonly requestedToMs: number | null;
  readonly pagesRead: number;
  readonly truncated: boolean;
  readonly stopReason: string;
  /** Honored only for a local import. The OKX answer can never declare completeness. */
  readonly declaredComplete?: boolean;
}

function readEpochMs(value: unknown): number | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d{10,16}$/.test(text)) return null;
  const parsed = Number(text);
  return parsed >= MIN_PLAUSIBLE_MS && parsed <= MAX_PLAUSIBLE_MS ? parsed : null;
}

function readOpaque(value: unknown): string | null {
  return typeof value === "string" && /^[\x21-\x7e]{6,128}$/.test(value) ? value : null;
}

/** Addresses of one side of a movement. A provider entry may carry several, comma separated. */
function addressesOf(side: unknown): string[] {
  if (!Array.isArray(side)) return [];
  const out: string[] = [];
  for (const item of side) {
    if (typeof item !== "object" || item === null) continue;
    const address = (item as Record<string, unknown>).address;
    if (typeof address === "string") for (const part of address.split(",")) if (part.trim() !== "") out.push(part.trim());
  }
  return out;
}

function directionOf(chainIndex: string, account: string, row: RawHistoryRow): HistoryEntry["direction"] {
  const mine = canonicalAccount(chainIndex, account);
  if (mine === null) return "unknown";
  const isMine = (address: string): boolean => canonicalAccount(chainIndex, address) === mine;
  const out = addressesOf(row.from).some(isMine);
  const incoming = addressesOf(row.to).some(isMine);
  return out && incoming ? "self" : out ? "out" : incoming ? "in" : "unknown";
}

export function buildHistorySection(input: HistoryBuildInput): HistorySection {
  const requested = [...new Set(input.requestedChains)];
  const rejected: RejectedRow[] = [];
  const issues: Issue[] = [];
  const entries = new Map<string, HistoryEntry>();
  let duplicatesCollapsed = 0;
  let lastTime: number | null = null;
  let outOfOrder = false;

  for (const row of input.rows) {
    const chainIndex = boundedChainIndex(row.chainIndex);
    const built = buildIdentity(row.chainIndex, row.tokenContractAddress);
    if (!built.ok) {
      rejected.push({ locator: row.locator, code: built.code === "unknown_network" ? "network_mismatch" : "contract_invalid_for_network", chainIndex });
      continue;
    }
    if (!requested.includes(built.identity.chainIndex)) {
      rejected.push({ locator: row.locator, code: "network_mismatch", chainIndex });
      continue;
    }
    const hash = readOpaque(row.txHash);
    if (hash === null) {
      rejected.push({ locator: row.locator, code: "tx_hash_unreadable", chainIndex });
      continue;
    }
    const itype = row.itype === "0" || row.itype === "1" || row.itype === "2" ? row.itype : null;
    const amount = parseDec(row.amount);
    const fee = parseDec(row.txFee);
    const txTimeMs = readEpochMs(row.txTime);
    const txStatus = row.txStatus === "success" || row.txStatus === "fail" || row.txStatus === "pending" ? row.txStatus : "unknown";
    if (txTimeMs !== null) {
      if (lastTime !== null && txTimeMs > lastTime) outOfOrder = true;
      lastTime = txTimeMs;
    }
    const direction = directionOf(built.identity.chainIndex, input.account, row);
    const entryId = hashOf([built.identity.key, hash, itype, safeScalar(row.methodId), safeScalar(row.nonce), safeScalar(row.amount), addressesOf(row.from), addressesOf(row.to)]).slice(0, 16);

    let entryState = OK;
    if (amount === null) entryState = state("unverified", "amount_unreadable");
    else if (txTimeMs === null) entryState = state("unverified", "time_unverified");
    else if (txTimeMs > input.fetchedAtMs + FUTURE_TOLERANCE_MS) entryState = state("future", "tx_time_in_future");
    else if (txStatus === "pending") entryState = state("unverified", "tx_pending");
    else if (txStatus === "unknown") entryState = state("unverified", "tx_status_unknown");

    if (entries.has(entryId)) {
      duplicatesCollapsed += 1;
      continue;
    }
    entries.set(entryId, {
      entryId,
      identity: built.identity,
      display: sanitizeDisplay(row.symbol),
      direction,
      itype,
      amountText: amount === null ? null : (row.amount as string),
      feeText: fee === null ? null : (row.txFee as string),
      feeUnit: null,
      txStatus,
      tx: { chainIndex: built.identity.chainIndex, hash },
      txTimeMs,
      hitBlacklist: typeof row.hitBlacklist === "boolean" ? row.hitBlacklist : null,
      state: entryState,
    });
  }

  const list = [...entries.values()].sort((a, b) => (b.txTimeMs ?? -1) - (a.txTimeMs ?? -1) || (a.entryId < b.entryId ? -1 : 1));
  const times = list.map((entry) => entry.txTimeMs).filter((value): value is number => value !== null);
  const completeness: HistoryWindow["completeness"] = input.declaredComplete === true && input.source.id === "local_import" ? "complete_declared" : input.truncated ? "partial_truncated" : "partial_six_months";
  const window: HistoryWindow = {
    requestedFromMs: input.requestedFromMs,
    requestedToMs: input.requestedToMs,
    providerLimitMonths: 6,
    coverageFromMs: Math.max(input.requestedFromMs ?? 0, input.nowMs - SIX_MONTHS_MS),
    oldestEntryMs: times.length === 0 ? null : Math.min(...times),
    newestEntryMs: times.length === 0 ? null : Math.max(...times),
    completeness,
  };

  const acceptedChains = new Set(list.map((entry) => entry.identity.chainIndex));
  const coverage: Coverage = {
    requested,
    observed: requested.filter((chain) => acceptedChains.has(chain)),
    notReported: requested.filter((chain) => !acceptedChains.has(chain)),
    tokenDiscovery: "unknown",
    status: completeness === "complete_declared" ? "complete_claimed" : "partial",
    pagesRead: input.pagesRead,
    truncated: input.truncated,
    stopReason: input.stopReason,
  };

  const timing = { fetchedAtMs: input.fetchedAtMs, sourceTimeMs: null, clockOffsetMs: null };
  const freshness = freshnessReport(timing, input.nowMs, input.maxAgeMs);
  for (const row of rejected) issues.push({ code: row.code, severity: "blocking", locator: row.locator });
  if (completeness !== "complete_declared") issues.push({ code: "history_window_partial", severity: "warning", locator: null });
  if (outOfOrder) issues.push({ code: "order_not_descending", severity: "warning", locator: null });
  if (input.truncated) issues.push({ code: "history_truncated", severity: "warning", locator: null });
  if (freshness.capture === "stale") issues.push({ code: "capture_stale", severity: "warning", locator: null });

  const status: Status = worstStatus([
    statusOfFreshness(freshness),
    ...list.map((entry) => statusOfState(entry.state.kind)),
    ...(rejected.length > 0 ? (["divergent"] as const) : []),
    ...(input.truncated ? (["incomplete"] as const) : []),
  ]);

  return { kind: "history", source: input.source, timing, freshness, coverage, window, entries: list, rejected, duplicatesCollapsed, issues, status };
}

/**
 * Net inflow per asset within the window: received minus sent, over successful, readable entries. The unit of the provider
 * amount is not declared, so the result is a SIGNAL (positive or not), never a balance. With `cutoffMs`, only movements up to
 * that instant count (the moment the active balances were read).
 */
export function netInflowByAsset(section: HistorySection, cutoffMs?: number): Map<string, Dec> {
  const result = new Map<string, Dec>();
  for (const entry of section.entries) {
    if (entry.txStatus !== "success" || entry.amountText === null || (entry.direction !== "in" && entry.direction !== "out")) continue;
    // Movements after the balances were read cannot explain what the balances showed.
    if (cutoffMs !== undefined && (entry.txTimeMs === null || entry.txTimeMs > cutoffMs)) continue;
    const amount = parseDec(entry.amountText);
    if (amount === null) continue;
    const current = result.get(entry.identity.key) ?? { units: 0n, scale: 0 };
    result.set(entry.identity.key, entry.direction === "in" ? decAdd(current, amount) : decSub(current, amount));
  }
  return result;
}

/**
 * Acquisition cost statements. A window that is not declared complete NEVER yields a cost: the provider history covers six
 * months, carries no price per movement and no cost method. Computing a cost from it would present a partial window as a
 * historical cost. This function is the guard; the calculation itself is not implemented (see the report).
 */
export function costBasisStatements(history: HistorySection | null): CostBasisStatement[] {
  if (history === null) return [];
  const seen = new Map<string, CostBasisStatement>();
  for (const entry of history.entries) {
    if (seen.has(entry.identity.key)) continue;
    const complete = history.window.completeness === "complete_declared";
    seen.set(entry.identity.key, {
      identity: entry.identity,
      method: "unknown",
      currency: null,
      basisText: null,
      coverage: complete ? "full_history" : "partial_window",
      state: complete ? state("unverified", "cost_method_not_implemented") : state("unverified", "history_window_partial"),
    });
  }
  return [...seen.values()].sort((a, b) => (a.identity.key < b.identity.key ? -1 : 1));
}

