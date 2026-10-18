/**
 * Active balance section builder. Pure: it receives rows already read by an adapter (or a fixture) and decides, row by row,
 * what is evidence and what is only a claim.
 *
 * Rules enforced here (docs/portfolio-evidence-v1/SPEC.md):
 *  - identity is network + contract; a row for a network that was not requested, a contract that is invalid for its
 *    network or an account that is not the requested one is REJECTED, never summed (PE-01, RC4);
 *  - a quantity without known decimals has no atoms and no value (PE-02);
 *  - a price of "0" or "" never produces a value, unless the quantity itself is exactly zero (PE-03);
 *  - repeated identities are collapsed only when identical, and become `divergent` when they disagree (RC3);
 *  - an asset another source says exists but the answer did not return is `omitted_by_filter` (filter applied) or `missing`,
 *    never a zero balance (RC6, A1).
 */

import { chainByIndex } from "../okx-wallet/chains.ts";
import {
  atomsToDec,
  decAbs,
  decIsZero,
  decMul,
  decSub,
  decSum,
  decToAtoms,
  decToText,
  deriveDecimals,
  parseAtoms,
  parseDec,
  ratioBps,
  type Dec,
} from "./decimal.ts";
import { boundedChainIndex, buildIdentity, canonicalAccount, sanitizeDisplay } from "./identity.ts";
import { OK, freshnessOf, freshnessReport, state, statusOfFreshness, statusOfState, worstStatus } from "./state.ts";
import type {
  AssetIdentity,
  BalancePosition,
  BalanceSection,
  Coverage,
  DecimalsSource,
  EvidenceState,
  Filters,
  Issue,
  Quantity,
  RejectedRow,
  ReportedTotal,
  RiskFlag,
  SourceInfo,
  Status,
  Valuation,
} from "./types.ts";

/** Networks where the provider documents the risky airdrop and honeypot filter. */
export const HONEYPOT_FILTER_CHAINS: readonly string[] = Object.freeze(["1", "56", "501", "8453"]);
export const DEFAULT_PRICE_TOLERANCE_BPS = 200;

export interface RawBalanceRow {
  /** Where the row came from in the provider answer, for example `/data/0/tokenAssets/3`. */
  readonly locator: string;
  readonly chainIndex: unknown;
  readonly tokenContractAddress: unknown;
  readonly address: unknown;
  readonly symbol: unknown;
  readonly balance: unknown;
  readonly rawBalance: unknown;
  readonly tokenPrice: unknown;
  readonly isRiskToken: unknown;
}

export interface DecimalsHint {
  readonly decimals: number;
  readonly source: Extract<DecimalsSource, "provider_token_info">;
}

export interface PriceHint {
  readonly priceText: string;
  readonly timeMs: number | null;
  /** When the market price was read. Absent: the balances read time is the reference (a weaker comparison). */
  readonly fetchedAtMs?: number | null;
}

export interface ReportedTotalInput {
  readonly valueText: unknown;
  readonly assetType: "all" | "tokens" | "defi";
  readonly chains: readonly string[];
  readonly excludeRiskToken: "0" | "1" | null;
  readonly fetchedAtMs: number;
}

export interface BalanceBuildInput {
  /** The requested account. Used to match rows; never stored. */
  readonly account: string;
  readonly requestedChains: readonly string[];
  readonly rows: readonly RawBalanceRow[];
  readonly source: SourceInfo;
  /** Value sent as `excludeRiskToken`; null when the parameter was omitted (provider default: filter). */
  readonly excludeRiskToken: "0" | "1" | null;
  readonly tokenDiscovery: "provider_all" | "allowlist";
  readonly fetchedAtMs: number;
  readonly sourceTimeMs: number | null;
  readonly clockOffsetMs?: number | null;
  readonly nowMs: number;
  readonly maxAgeMs: number;
  readonly pagesRead?: number;
  readonly truncated?: boolean;
  readonly stopReason?: string;
  /** Assets another source (watchlist, history, provider PnL) says exist. Absent ones are never zero. */
  readonly expectedAssets?: readonly { readonly chainIndex: string; readonly tokenContractAddress: string }[];
  readonly decimalsHints?: ReadonlyMap<string, DecimalsHint>;
  readonly priceHints?: ReadonlyMap<string, PriceHint>;
  readonly priceToleranceBps?: number;
  readonly reportedTotal?: ReportedTotalInput | null;
}

interface Candidate {
  readonly identity: AssetIdentity;
  readonly row: RawBalanceRow;
  /** True only when the row carried an address and it is the requested account. */
  readonly accountVerified: boolean;
}

function isRecordOfText(value: unknown): value is string {
  return typeof value === "string";
}

function quantityOf(identity: AssetIdentity, row: RawBalanceRow, hint: DecimalsHint | undefined): Quantity {
  const rawBalance = row.rawBalance;
  // Provider text is kept only in the shape it must have; anything else could be an echoed secret or a huge string.
  const rawText = isRecordOfText(rawBalance) && /^\d{1,80}$/.test(rawBalance) ? rawBalance : null;
  const base = { rawText, atoms: null, decimals: null, decimalsSource: "unknown" as DecimalsSource, unit: "unknown" as const };

  if (row.balance === undefined || row.balance === null || row.balance === "") {
    return { ...base, displayText: null, state: state("missing", "balance_missing") };
  }
  const display = parseDec(row.balance);
  if (display === null) return { ...base, displayText: null, state: state("unverified", "balance_unreadable") };
  const displayText = row.balance as string;

  let raw: bigint | null = null;
  if (rawBalance !== undefined && rawBalance !== null && rawBalance !== "") {
    raw = parseAtoms(rawBalance);
    if (raw === null) return { ...base, displayText, state: state("unverified", "raw_balance_unreadable") };
  }

  // A zero quantity is exactly zero in any scale. It is a reported zero, not an absence.
  if (decIsZero(display)) {
    if (raw !== null && raw !== 0n) return { ...base, displayText, state: state("divergent", "raw_balance_mismatch") };
    return { ...base, displayText, atoms: "0", state: OK };
  }

  const native = identity.asset.kind === "native_marker";
  const pinned = native ? (chainByIndex(identity.chainIndex)?.nativeDecimals ?? null) : null;
  const derived = raw !== null ? deriveDecimals(display, raw) : null;
  const candidates: { decimals: number; source: DecimalsSource }[] = [];
  if (hint !== undefined) candidates.push({ decimals: hint.decimals, source: hint.source });
  if (pinned !== null) candidates.push({ decimals: pinned, source: "registry_pinned" });
  if (derived !== null) candidates.push({ decimals: derived, source: "derived_raw_ratio" });

  if (candidates.some((candidate) => candidate.decimals !== candidates[0]!.decimals)) {
    return { ...base, displayText, state: state("divergent", "decimals_conflict") };
  }
  const chosen = candidates[0];
  if (chosen === undefined) {
    // raw present but not a power-of-ten multiple of the displayed balance, or no raw at all.
    if (raw !== null) return { ...base, displayText, state: state("divergent", "raw_balance_mismatch") };
    return { ...base, displayText, state: state("unverified", "decimals_unknown") };
  }
  const atoms = decToAtoms(display, chosen.decimals);
  if (atoms === null) return { ...base, displayText, decimals: chosen.decimals, decimalsSource: chosen.source, state: state("divergent", "balance_exceeds_decimals") };
  if (raw !== null && raw !== atoms) return { ...base, displayText, decimals: chosen.decimals, decimalsSource: chosen.source, state: state("divergent", "raw_balance_mismatch") };
  return { displayText, rawText, atoms: atoms.toString(), decimals: chosen.decimals, decimalsSource: chosen.source, unit: "token", state: OK };
}

function riskOf(identity: AssetIdentity, flag: unknown): RiskFlag {
  const providerFlag = typeof flag === "boolean" ? flag : null;
  const honeypotFilterSupported = HONEYPOT_FILTER_CHAINS.includes(identity.chainIndex);
  const assessment = providerFlag === true ? "flagged" : providerFlag === false && honeypotFilterSupported ? "not_flagged" : "unknown";
  return { providerFlag, honeypotFilterSupported, assessment };
}

interface ValuationContext {
  readonly hint: PriceHint | undefined;
  readonly toleranceBps: number;
  readonly accountVerified: boolean;
  readonly fetchedAtMs: number;
  readonly maxAgeMs: number;
}

function valuationOf(row: RawBalanceRow, quantity: Quantity, risk: RiskFlag, context: ValuationContext): { valuation: Valuation; caveats: string[] } {
  const { hint, toleranceBps } = context;
  const caveats: string[] = [];
  const empty = { currency: null, priceText: null, priceSource: null, priceAsOfMs: null, valueText: null } as const;

  if (quantity.state.kind !== "ok") return { valuation: { ...empty, state: state("missing", "quantity_unavailable") }, caveats };
  // Safety fields that cannot be read fail CLOSED: the position is not counted until they can be.
  if (typeof row.isRiskToken !== "boolean") return { valuation: { ...empty, state: state("unverified", "risk_flag_unreadable") }, caveats: ["risk_flag_unreadable"] };
  if (!context.accountVerified) return { valuation: { ...empty, state: state("unverified", "account_unverified") }, caveats: ["account_unverified_in_row"] };

  const quantityZero = quantity.atoms === "0";
  const rawPrice = row.tokenPrice;
  const priceDec = parseDec(rawPrice);
  const priceTextRaw = typeof rawPrice === "string" && rawPrice !== "" ? rawPrice : null;

  if (quantityZero) {
    return { valuation: { currency: "USD", priceText: priceDec === null ? null : (priceTextRaw as string), priceSource: priceDec === null ? null : "okx_balance_api", priceAsOfMs: null, valueText: "0", state: OK }, caveats };
  }
  if (rawPrice === undefined || rawPrice === null || rawPrice === "") return { valuation: { ...empty, state: state("missing", "price_missing") }, caveats };
  if (priceDec === null) return { valuation: { ...empty, state: state("unverified", "price_unreadable") }, caveats };
  if (decIsZero(priceDec)) {
    if (hint !== undefined) caveats.push("market_price_available_currency_undeclared");
    return { valuation: { currency: "USD", priceText: priceTextRaw, priceSource: "okx_balance_api", priceAsOfMs: null, valueText: null, state: state("unverified", "price_zero_unverified") }, caveats };
  }
  if (quantity.atoms === null || quantity.decimals === null) return { valuation: { ...empty, currency: "USD", priceText: priceTextRaw, priceSource: "okx_balance_api", state: state("unverified", "decimals_unknown") }, caveats };

  let priceAsOfMs: number | null = null;
  let priceSource = "okx_balance_api";
  if (hint !== undefined) {
    const marketPrice = parseDec(hint.priceText);
    if (marketPrice !== null && !decIsZero(marketPrice)) {
      const spread = ratioBps(decAbs(decSub(priceDec, marketPrice)), marketPrice);
      if (spread !== null && spread > BigInt(toleranceBps)) {
        return { valuation: { currency: "USD", priceText: priceTextRaw, priceSource: "okx_balance_api", priceAsOfMs: null, valueText: null, state: state("divergent", "price_sources_disagree") }, caveats };
      }
      priceAsOfMs = hint.timeMs;
      priceSource = "okx_balance_api+okx_market_price";
      // The market price is the only price clock there is: if it is not current, nothing vouches for the value.
      if (priceAsOfMs !== null) {
        const clock = freshnessOf(priceAsOfMs, hint.fetchedAtMs ?? context.fetchedAtMs, context.maxAgeMs);
        if (clock === "stale") return { valuation: { currency: "USD", priceText: priceTextRaw, priceSource, priceAsOfMs, valueText: null, state: state("stale", "price_time_stale") }, caveats };
        if (clock === "future") return { valuation: { currency: "USD", priceText: priceTextRaw, priceSource, priceAsOfMs, valueText: null, state: state("future", "price_time_in_future") }, caveats };
      }
    }
  }
  if (priceAsOfMs === null) caveats.push("price_time_unknown");
  if (risk.assessment === "flagged") {
    return { valuation: { currency: "USD", priceText: priceTextRaw, priceSource, priceAsOfMs, valueText: null, state: state("unverified", "risk_flagged_value_not_counted") }, caveats };
  }
  const valueText = decToText(decMul(atomsToDec(BigInt(quantity.atoms), quantity.decimals), priceDec));
  // A value this layer cannot read back is never summed; counting it as valued would let the sum silently drop it.
  if (parseDec(valueText) === null) return { valuation: { currency: "USD", priceText: priceTextRaw, priceSource, priceAsOfMs, valueText: null, state: state("unverified", "value_exceeds_precision_limits") }, caveats };
  return { valuation: { currency: "USD", priceText: priceTextRaw, priceSource, priceAsOfMs, valueText, state: OK }, caveats };
}

/** The more severe of two states; on a tie the first wins. */
export function worseState(a: EvidenceState, b: EvidenceState): EvidenceState {
  return worstStatus([statusOfState(a.kind), statusOfState(b.kind)]) === statusOfState(a.kind) ? a : b;
}

function signatureOf(candidate: Candidate): string {
  const display = parseDec(candidate.row.balance);
  const raw = parseAtoms(candidate.row.rawBalance);
  const price = parseDec(candidate.row.tokenPrice);
  return JSON.stringify([display === null ? String(candidate.row.balance) : decToText(display), raw === null ? String(candidate.row.rawBalance ?? "") : raw.toString(), price === null ? String(candidate.row.tokenPrice ?? "") : decToText(price), JSON.stringify(candidate.row.isRiskToken ?? null)]);
}

function emptyPosition(identity: AssetIdentity, symbol: unknown, origin: BalancePosition["origin"], quantityState: EvidenceState, locators: readonly string[]): BalancePosition {
  const risk = riskOf(identity, undefined);
  return {
    identity,
    display: sanitizeDisplay(symbol),
    quantity: { displayText: null, rawText: null, atoms: null, decimals: null, decimalsSource: "unknown", unit: "unknown", state: quantityState },
    valuation: { currency: null, priceText: null, priceSource: null, priceAsOfMs: null, valueText: null, state: state("missing", "quantity_unavailable") },
    risk,
    membership: "selected",
    origin,
    rowLocators: locators,
    included: false,
    caveats: [],
    state: quantityState,
  };
}

export function buildBalanceSection(input: BalanceBuildInput): BalanceSection {
  const requested = [...new Set(input.requestedChains)];
  const toleranceBps = input.priceToleranceBps ?? DEFAULT_PRICE_TOLERANCE_BPS;
  const rejected: RejectedRow[] = [];
  const issues: Issue[] = [];
  const candidates: Candidate[] = [];

  // 1. Identity, network and account checks. A row that fails any of them is rejected, not summed.
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
    let accountVerified = false;
    // An address that is absent or not text is unreadable (the row cannot be tied to the account, so it is not counted);
    // text that is not the requested account is a different account and the row is rejected.
    if (typeof row.address === "string" && row.address !== "") {
      const expected = canonicalAccount(built.identity.chainIndex, input.account);
      const returned = canonicalAccount(built.identity.chainIndex, row.address);
      if (expected === null || returned === null || expected !== returned) {
        rejected.push({ locator: row.locator, code: "account_mismatch", chainIndex });
        continue;
      }
      accountVerified = true;
    }
    candidates.push({ identity: built.identity, row, accountVerified });
  }

  // 2. Group by identity. Identical repeats collapse; conflicting repeats are divergent and never summed.
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const list = groups.get(candidate.identity.key) ?? [];
    list.push(candidate);
    groups.set(candidate.identity.key, list);
  }

  let duplicatesCollapsed = 0;
  const positions: BalancePosition[] = [];
  for (const [key, group] of groups) {
    const first = group[0]!;
    const locators = group.map((member) => member.row.locator);
    const identical = group.every((member) => signatureOf(member) === signatureOf(first));
    if (group.length > 1 && !identical) {
      const derived = new Set(
        group.map((member) => {
          const display = parseDec(member.row.balance);
          const raw = parseAtoms(member.row.rawBalance);
          return display !== null && raw !== null ? deriveDecimals(display, raw) : null;
        }).filter((value): value is number => value !== null),
      );
      const code = derived.size > 1 ? "decimals_conflict" : "duplicate_identity_conflict";
      const position = emptyPosition(first.identity, first.row.symbol, "provider_row", state("divergent", code), locators);
      positions.push({ ...position, caveats: ["conflicting_duplicates"], valuation: { ...position.valuation, state: state("divergent", code) } });
      issues.push({ code, severity: "blocking", locator: locators[0] ?? null });
      continue;
    }
    if (group.length > 1) duplicatesCollapsed += group.length - 1;
    const hint = input.decimalsHints?.get(key);
    const quantity = quantityOf(first.identity, first.row, hint);
    const risk = riskOf(first.identity, first.row.isRiskToken);
    const { valuation, caveats } = valuationOf(first.row, quantity, risk, {
      hint: input.priceHints?.get(key),
      toleranceBps,
      accountVerified: group.every((member) => member.accountVerified),
      fetchedAtMs: input.fetchedAtMs,
      maxAgeMs: input.maxAgeMs,
    });
    if (group.length > 1) caveats.push(`duplicate_collapsed:${group.length - 1}`);
    if (risk.assessment === "flagged") caveats.push("risk_flagged");
    const counted = quantity.state.kind === "ok" && valuation.state.kind === "ok" && valuation.valueText !== null;
    positions.push({
      identity: first.identity,
      display: sanitizeDisplay(first.row.symbol),
      quantity,
      valuation,
      risk,
      membership: "selected",
      origin: "provider_row",
      rowLocators: locators,
      included: counted,
      caveats,
      state: worseState(quantity.state, valuation.state),
    });
  }

  // 3. Filters and coverage.
  const requestedFilter = input.excludeRiskToken === null ? "default" : input.excludeRiskToken;
  const filters: Filters = {
    riskToken: {
      requested: requestedFilter,
      effect: input.excludeRiskToken === "1" ? "not_applied" : "applied",
      supportedChains: HONEYPOT_FILTER_CHAINS,
    },
    other: [],
  };

  // 4. Expected assets that did not come back: omitted by filter or missing, never zero.
  const present = new Set(positions.map((position) => position.identity.key));
  for (const expected of input.expectedAssets ?? []) {
    const built = buildIdentity(expected.chainIndex, expected.tokenContractAddress);
    if (!built.ok) {
      const safeChain = boundedChainIndex(expected.chainIndex);
      rejected.push({ locator: `expected/${safeChain ?? "invalid"}`, code: built.code === "unknown_network" ? "network_mismatch" : "contract_invalid_for_network", chainIndex: safeChain });
      continue;
    }
    if (!requested.includes(built.identity.chainIndex)) continue;
    if (present.has(built.identity.key)) continue;
    present.add(built.identity.key);
    const code = filters.riskToken.effect === "applied" ? "risk_filter_may_have_omitted" : "not_returned_by_provider";
    const kind = filters.riskToken.effect === "applied" ? "omitted_by_filter" : "missing";
    positions.push(emptyPosition(built.identity, null, "expected_not_returned", state(kind, code), [`expected/${built.identity.key}`]));
  }

  positions.sort((a, b) => (a.identity.key < b.identity.key ? -1 : a.identity.key > b.identity.key ? 1 : 0));

  const acceptedChains = new Set(positions.filter((position) => position.origin === "provider_row").map((position) => position.identity.chainIndex));
  const observed = requested.filter((chain) => acceptedChains.has(chain));
  const notReported = requested.filter((chain) => !acceptedChains.has(chain));
  const truncated = input.truncated === true;
  const complete = filters.riskToken.effect === "not_applied" && input.tokenDiscovery === "provider_all" && !truncated && rejected.length === 0;
  const coverage: Coverage = {
    requested,
    observed,
    notReported,
    tokenDiscovery: input.tokenDiscovery,
    status: complete ? "complete_claimed" : "partial",
    pagesRead: input.pagesRead ?? 1,
    truncated,
    stopReason: input.stopReason ?? "single_answer",
  };

  const timing = { fetchedAtMs: input.fetchedAtMs, sourceTimeMs: input.sourceTimeMs, clockOffsetMs: input.clockOffsetMs ?? null };
  const freshness = freshnessReport(timing, input.nowMs, input.maxAgeMs);

  for (const row of rejected) issues.push({ code: row.code, severity: "blocking", locator: row.locator });
  if (filters.riskToken.effect === "applied") issues.push({ code: "coverage_partial_risk_filter", severity: "warning", locator: null });
  for (const chain of requested) if (!HONEYPOT_FILTER_CHAINS.includes(chain)) issues.push({ code: `risk_filter_not_documented_on_network:${chain}`, severity: "info", locator: null });
  if (timing.sourceTimeMs === null) issues.push({ code: "source_time_unknown", severity: "info", locator: null });
  if (freshness.capture === "stale") issues.push({ code: "capture_stale", severity: "warning", locator: null });
  if (freshness.capture === "future") issues.push({ code: "capture_time_in_future", severity: "warning", locator: null });
  if (truncated) issues.push({ code: "answer_truncated", severity: "warning", locator: null });
  // An answer with no rows says nothing about the wallet: it may be empty, or the network may be unsupported.
  const emptyAnswer = input.rows.length === 0;
  if (emptyAnswer) issues.push({ code: "no_rows_returned", severity: "warning", locator: null });

  const status: Status = worstStatus([
    statusOfFreshness(freshness),
    ...positions.map((position) => statusOfState(position.state.kind)),
    ...(rejected.length > 0 ? (["divergent"] as const) : []),
    ...(truncated || emptyAnswer ? (["incomplete"] as const) : []),
  ]);

  return {
    kind: "balances",
    source: input.source,
    timing,
    freshness,
    coverage,
    filters,
    positions,
    rejected,
    duplicatesCollapsed,
    reportedTotal: input.reportedTotal === undefined || input.reportedTotal === null ? null : buildReportedTotal(input.reportedTotal),
    issues,
    status,
  };
}

export function buildReportedTotal(input: ReportedTotalInput): ReportedTotal {
  const parsed = parseDec(input.valueText);
  return {
    currency: parsed === null ? null : "USD",
    valueText: parsed === null ? null : (input.valueText as string),
    scope: input.assetType,
    chains: [...new Set(input.chains)],
    riskFilter: input.excludeRiskToken === "1" ? "not_applied" : "applied",
    timing: { fetchedAtMs: input.fetchedAtMs, sourceTimeMs: null, clockOffsetMs: null },
    state: parsed === null ? state("unverified", "reported_total_unreadable") : OK,
  };
}

/** Sum of the positions that enter the net worth, exact. Null when none does: unknown is not zero. */
export function sumIncluded(section: BalanceSection): Dec | null {
  const values: Dec[] = [];
  for (const position of section.positions) {
    if (!position.included || position.valuation.valueText === null) continue;
    const value = parseDec(position.valuation.valueText);
    if (value !== null) values.push(value);
  }
  return decSum(values);
}
