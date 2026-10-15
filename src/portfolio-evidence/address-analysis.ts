/**
 * Address Analysis section builder (the provider's portfolio family: PnL overview, recent PnL, latest PnL of a token, DEX
 * trade history, supported chains). Everything here is `provider_reported_unverified`: the documentation declares no
 * accounting method, no history window and no completeness, and its own latest-PnL example does not add up.
 * PnL and trades are therefore separate statements, never an addend of the net worth, and the observed acquisitions are sums
 * over a bounded window, never a cost basis.
 */

import { hashOf, safeScalar } from "./canonical.ts";
import { decAdd, decCmp, decSub, decSum, decToText, parseDec, type Dec } from "./decimal.ts";
import { boundedChainIndex, buildIdentity, sanitizeDisplay } from "./identity.ts";
import { FUTURE_TOLERANCE_MS, OK, freshnessReport, state, statusOfFreshness, statusOfState, worstStatus } from "./state.ts";
import type {
  AddressAnalysisSection,
  AssetIdentity,
  Coverage,
  DexTrade,
  DexTradeKind,
  EvidenceState,
  Issue,
  ObservedAcquisition,
  PnlPosition,
  PnlStatement,
  RejectedRow,
  SourceInfo,
  Status,
  TokenPnlCheck,
} from "./types.ts";

export const TIME_FRAMES = Object.freeze({ "1": "1D", "2": "3D", "3": "7D", "4": "1M", "5": "3M" } as const);
export type TimeFrameCode = keyof typeof TIME_FRAMES;

/** The provider rounds its figures; a gap up to this many USD between its total and the parts is not an inconsistency. */
export const PNL_PARTS_TOLERANCE_USD = "0.01";

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

export interface RawLatestPnl {
  readonly totalPnlUsd?: unknown;
  readonly unrealizedPnlUsd?: unknown;
  readonly realizedPnlUsd?: unknown;
  readonly isPnlSupported?: unknown;
}

export interface RawDexTrade {
  readonly locator: string;
  readonly type: unknown;
  readonly chainIndex: unknown;
  readonly tokenContractAddress: unknown;
  readonly tokenSymbol: unknown;
  readonly valueUsd: unknown;
  readonly amount: unknown;
  readonly price: unknown;
  readonly marketCap: unknown;
  readonly pnlUsd: unknown;
  readonly time: unknown;
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
  /** Latest PnL of named tokens (the answer carries no identity, so the request supplies it). */
  readonly tokenPnl?: readonly { readonly token: { readonly chainIndex: string; readonly tokenContractAddress: string }; readonly raw: RawLatestPnl }[];
  /** DEX trade history of the requested window. */
  readonly trades?: {
    readonly rows: readonly RawDexTrade[];
    readonly beginMs: number;
    readonly endMs: number;
    readonly pagesRead: number;
    readonly truncated: boolean;
    readonly stopReason: string;
  };
  /** Chains the provider lists for the portfolio family; null or absent when the list was not asked for. */
  readonly supportedChains?: readonly string[] | null;
}

function epoch(value: unknown): number | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== "string" || !/^[1-9]\d{12}$/.test(text)) return null;
  const parsed = Number(text);
  return parsed <= 4_102_444_800_000 ? parsed : null;
}

function signedStatement(klass: PnlStatement["class"], scope: PnlStatement["scope"], identity: AssetIdentity | null, raw: unknown, window: string): PnlStatement {
  const base = { class: klass, scope, identity, currency: "USD" as const, basis: "provider_reported_unverified" as const, window, costsKnown: "unknown" as const };
  if (raw === undefined || raw === null || raw === "") return { ...base, valueText: null, state: state("missing", "pnl_missing") };
  if (raw === "SELL_ALL") return { ...base, valueText: null, state: state("unverified", "provider_sell_all_marker") };
  if (parseDec(raw, true) === null) return { ...base, valueText: null, state: state("unverified", "pnl_unreadable") };
  return { ...base, valueText: raw as string, state: state("unverified", "provider_reported_unverified") };
}

function unsupportedStatement(klass: PnlStatement["class"], identity: AssetIdentity): PnlStatement {
  return { class: klass, scope: "token", identity, currency: "USD", valueText: null, basis: "provider_reported_unverified", window: "unspecified_by_provider", costsKnown: "unknown", state: state("unverified", "pnl_not_supported_for_token") };
}

function checkOf(identity: AssetIdentity, raw: RawLatestPnl): TokenPnlCheck {
  const supported = typeof raw.isPnlSupported === "boolean" ? raw.isPnlSupported : null;
  const flagState = (figures: EvidenceState): EvidenceState => (supported === null && figures.kind === "ok" ? state("unverified", "pnl_support_flag_unreadable") : figures);
  if (supported === false) return { identity, supported, totalText: null, partsSumText: null, deltaText: null, state: state("unverified", "pnl_not_supported_for_token") };
  const total = parseDec(raw.totalPnlUsd, true);
  const realized = parseDec(raw.realizedPnlUsd, true);
  const unrealized = parseDec(raw.unrealizedPnlUsd, true);
  const totalText = total === null ? null : decToText(total);
  if (total === null || realized === null || unrealized === null) {
    return { identity, supported, totalText, partsSumText: null, deltaText: null, state: state("unverified", "pnl_figures_unreadable") };
  }
  const parts = decAdd(realized, unrealized);
  const delta = decSub(total, parts);
  const tolerance = parseDec(PNL_PARTS_TOLERANCE_USD)!;
  const absolute: Dec = delta.units < 0n ? { units: -delta.units, scale: delta.scale } : delta;
  return {
    identity,
    supported,
    totalText,
    partsSumText: decToText(parts),
    deltaText: decToText(delta),
    state: flagState(decCmp(absolute, tolerance) <= 0 ? OK : state("divergent", "pnl_total_differs_from_parts")),
  };
}

const KIND_OF_TYPE: ReadonlyMap<string, DexTradeKind> = new Map<string, DexTradeKind>([["1", "buy"], ["2", "sell"], ["3", "transfer_in"], ["4", "transfer_out"]]);

function textOf(value: unknown): string | null {
  return parseDec(value, true) === null ? null : (value as string);
}

function sumOf(values: readonly Dec[]): string | null {
  const sum = decSum(values);
  return sum === null ? null : decToText(sum);
}

/** Net position change over the OBSERVED trades of the window: buys and transfers in minus sells and transfers out. */
export function netPositionFromTrades(section: AddressAnalysisSection, cutoffMs?: number): Map<string, Dec> {
  const result = new Map<string, Dec>();
  // An asset with ANY trade that did not read cleanly has an unknown net position: summing only the readable legs could invent one.
  const unknown = new Set(section.trades.filter((trade) => trade.state.kind !== "ok").map((trade) => trade.identity.key));
  for (const trade of section.trades) {
    if (trade.state.kind !== "ok" || trade.kind === "unknown" || unknown.has(trade.identity.key)) continue;
    // Trades after the balances were read cannot explain what the balances showed.
    if (cutoffMs !== undefined && (trade.timeMs === null || trade.timeMs > cutoffMs)) continue;
    const amount = parseDec(trade.amountText);
    if (amount === null) continue;
    const current = result.get(trade.identity.key) ?? { units: 0n, scale: 0 };
    result.set(trade.identity.key, trade.kind === "buy" || trade.kind === "transfer_in" ? decAdd(current, amount) : decSub(current, amount));
  }
  return result;
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
    const chainIndex = boundedChainIndex(row.chainIndex);
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

  // Latest PnL of named tokens: the answer carries no identity, the request does.
  const tokenPnlChecks: TokenPnlCheck[] = [];
  const checked = new Set<string>();
  for (const item of input.tokenPnl ?? []) {
    const built = buildIdentity(item.token.chainIndex, item.token.tokenContractAddress);
    const chainIndex = boundedChainIndex(item.token.chainIndex);
    const locator = `latest/${chainIndex ?? "invalid"}`;
    if (!built.ok) {
      rejected.push({ locator, code: built.code === "unknown_network" ? "network_mismatch" : "contract_invalid_for_network", chainIndex });
      continue;
    }
    if (built.identity.chainIndex !== input.chainIndex) {
      rejected.push({ locator, code: "network_mismatch", chainIndex });
      continue;
    }
    if (checked.has(built.identity.key)) {
      rejected.push({ locator, code: "duplicate_identity", chainIndex });
      continue;
    }
    checked.add(built.identity.key);
    const check = checkOf(built.identity, item.raw);
    tokenPnlChecks.push(check);
    if (check.supported === false) {
      statements.push(unsupportedStatement("realized", built.identity), unsupportedStatement("unrealized_reported", built.identity));
    } else {
      statements.push(signedStatement("realized", "token", built.identity, item.raw.realizedPnlUsd, "unspecified_by_provider"));
      statements.push(signedStatement("unrealized_reported", "token", built.identity, item.raw.unrealizedPnlUsd, "unspecified_by_provider"));
    }
  }

  // DEX trade history of the window.
  const trades: DexTrade[] = [];
  let tradesDuplicatesCollapsed = 0;
  const window = input.trades === undefined ? null : { fromMs: input.trades.beginMs, toMs: input.trades.endMs };
  if (input.trades !== undefined && window !== null) {
    const tradeIds = new Set<string>();
    for (const row of input.trades.rows) {
      const built = buildIdentity(row.chainIndex, row.tokenContractAddress);
      const chainIndex = boundedChainIndex(row.chainIndex);
      if (!built.ok) {
        rejected.push({ locator: row.locator, code: built.code === "unknown_network" ? "network_mismatch" : "contract_invalid_for_network", chainIndex });
        continue;
      }
      if (built.identity.chainIndex !== input.chainIndex) {
        rejected.push({ locator: row.locator, code: "network_mismatch", chainIndex });
        continue;
      }
      const kind: DexTradeKind = typeof row.type === "string" ? (KIND_OF_TYPE.get(row.type) ?? "unknown") : "unknown";
      const amount = parseDec(row.amount);
      const value = parseDec(row.valueUsd);
      const timeMs = epoch(row.time);
      let tradeState: EvidenceState = OK;
      if (kind === "unknown") tradeState = state("unverified", "trade_type_unknown");
      else if (amount === null) tradeState = state("unverified", "amount_unreadable");
      else if (value === null) tradeState = state("unverified", "value_unreadable");
      else if (timeMs === null) tradeState = state("unverified", "time_unverified");
      else if (timeMs < window.fromMs || timeMs > window.toMs + FUTURE_TOLERANCE_MS) tradeState = state("divergent", "trade_outside_requested_window");
      const tradeId = hashOf([built.identity.key, safeScalar(row.type), safeScalar(row.time), safeScalar(row.amount), safeScalar(row.valueUsd), safeScalar(row.price)]).slice(0, 16);
      if (tradeIds.has(tradeId)) {
        tradesDuplicatesCollapsed += 1;
        continue;
      }
      tradeIds.add(tradeId);
      trades.push({
        tradeId,
        identity: built.identity,
        display: sanitizeDisplay(row.tokenSymbol),
        kind,
        amountText: amount === null ? null : (row.amount as string),
        valueUsdText: value === null ? null : (row.valueUsd as string),
        priceText: parseDec(row.price) === null ? null : (row.price as string),
        pnlUsdText: textOf(row.pnlUsd),
        timeMs,
        state: tradeState,
      });
    }
    trades.sort((a, b) => (b.timeMs ?? -1) - (a.timeMs ?? -1) || (a.tradeId < b.tradeId ? -1 : 1));
  }

  // Observed acquisitions: sums over the trades that read cleanly, per asset. Never a cost basis.
  const acquisitions: ObservedAcquisition[] = [];
  if (window !== null) {
    const byAsset = new Map<string, DexTrade[]>();
    for (const trade of trades) {
      if (trade.state.kind !== "ok") continue;
      const list = byAsset.get(trade.identity.key) ?? [];
      list.push(trade);
      byAsset.set(trade.identity.key, list);
    }
    for (const [, list] of [...byAsset].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const pick = (kind: DexTradeKind, field: "amountText" | "valueUsdText"): Dec[] =>
        list.filter((trade) => trade.kind === kind).map((trade) => parseDec(trade[field])).filter((value): value is Dec => value !== null);
      const count = (kind: DexTradeKind): number => list.filter((trade) => trade.kind === kind).length;
      acquisitions.push({
        identity: list[0]!.identity,
        buyCount: count("buy"),
        buyAmountText: sumOf(pick("buy", "amountText")),
        buyValueUsdText: sumOf(pick("buy", "valueUsdText")),
        sellCount: count("sell"),
        sellAmountText: sumOf(pick("sell", "amountText")),
        sellValueUsdText: sumOf(pick("sell", "valueUsdText")),
        transferInCount: count("transfer_in"),
        transferInAmountText: sumOf(pick("transfer_in", "amountText")),
        transferOutCount: count("transfer_out"),
        transferOutAmountText: sumOf(pick("transfer_out", "amountText")),
        excludedTradeCount: trades.filter((trade) => trade.identity.key === list[0]!.identity.key && trade.state.kind !== "ok").length,
        window,
        coverage: "partial_window",
        state: state("unverified", "observed_window_only"),
      });
    }
  }

  const tradesTruncated = input.trades?.truncated === true;
  const truncated = input.truncated || tradesTruncated;
  const timing = { fetchedAtMs: input.fetchedAtMs, sourceTimeMs: null, clockOffsetMs: null };
  const freshness = freshnessReport(timing, input.nowMs, input.maxAgeMs);
  const observed = positions.length > 0 || input.overview !== null || tokenPnlChecks.length > 0 || trades.length > 0 ? [input.chainIndex] : [];
  const coverage: Coverage = {
    requested: [input.chainIndex],
    observed,
    notReported: observed.length === 0 ? [input.chainIndex] : [],
    tokenDiscovery: "unknown",
    status: "partial",
    pagesRead: input.pagesRead + (input.trades?.pagesRead ?? 0),
    truncated,
    stopReason: input.truncated || input.trades === undefined || !tradesTruncated ? input.stopReason : `dex_history:${input.trades.stopReason}`,
  };

  const listedChains = input.supportedChains === undefined || input.supportedChains === null ? null : [...input.supportedChains];
  const portfolioSupport = { listedChains, requestedChainListed: listedChains === null ? null : listedChains.includes(input.chainIndex) };

  for (const row of rejected) issues.push({ code: row.code, severity: "blocking", locator: row.locator });
  issues.push({ code: "pnl_method_and_window_undeclared", severity: "warning", locator: null });
  if (input.truncated) issues.push({ code: "pnl_list_truncated", severity: "warning", locator: null });
  if (input.trades !== undefined) issues.push({ code: "dex_history_window_only", severity: "warning", locator: null });
  if (tradesTruncated) issues.push({ code: "dex_history_truncated", severity: "warning", locator: null });
  // Identical fills can be real: collapsing them may understate the sums, so say it and do not call the section complete.
  if (tradesDuplicatesCollapsed > 0) issues.push({ code: "dex_trades_collapsed", severity: "warning", locator: null });
  if (observed.length === 0) issues.push({ code: "nothing_returned", severity: "warning", locator: null });
  if (portfolioSupport.requestedChainListed === false) issues.push({ code: "chain_not_listed_as_supported", severity: "warning", locator: null });

  const status: Status = worstStatus([
    statusOfFreshness(freshness),
    ...positions.map((position) => statusOfState(position.state.kind)),
    ...trades.map((trade) => statusOfState(trade.state.kind)),
    ...tokenPnlChecks.map((check) => statusOfState(check.state.kind)),
    ...(rejected.length > 0 ? (["divergent"] as const) : []),
    ...(truncated || tradesDuplicatesCollapsed > 0 || observed.length === 0 ? (["incomplete"] as const) : []),
  ]);

  return {
    kind: "address_analysis",
    source: input.source,
    timing,
    freshness,
    coverage,
    timeFrame: overviewWindow,
    positions,
    statements,
    tokenPnlChecks,
    trades,
    tradesDuplicatesCollapsed,
    acquisitions,
    portfolioSupport,
    rejected,
    issues,
    status,
  };
}
