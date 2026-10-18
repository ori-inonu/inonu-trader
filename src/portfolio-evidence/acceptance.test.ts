/**
 * Acceptance A1 to A7 of docs/portfolio-evidence-v1/SPEC.md. Every datum here is SYNTHETIC (see fixtures.ts).
 */

import { describe, expect, test } from "bun:test";
import { buildAddressAnalysisSection } from "./address-analysis.ts";
import { buildBalanceSection, type BalanceBuildInput } from "./balances.ts";
import { verifyEvidence, buildWalletEvidence } from "./evidence.ts";
import { FIXTURE_ACCOUNT, FIXTURE_LABEL, FIXTURE_NOW_MS, FIXTURE_RISK_TOKEN, FIXTURE_TOKEN_A, FIXTURE_TOKEN_B, balanceRow, historyRow, pnlRow, syntheticBalanceRows } from "./fixtures.ts";
import { buildHistorySection } from "./history.ts";
import { ADAPTER_VERSION, type SourceInfo } from "./types.ts";

const NOW = FIXTURE_NOW_MS;
const MAX_AGE = 60_000;
const SOURCE: SourceInfo = { id: "synthetic_fixture", endpoint: null, method: null, apiVersion: null, adapterVersion: ADAPTER_VERSION, tier: "not_applicable" };

function balances(rows = syntheticBalanceRows(), extra: Partial<BalanceBuildInput> = {}) {
  return buildBalanceSection({
    account: FIXTURE_ACCOUNT,
    requestedChains: ["1"],
    rows,
    source: SOURCE,
    excludeRiskToken: null,
    tokenDiscovery: "provider_all",
    fetchedAtMs: NOW - 1_000,
    sourceTimeMs: null,
    nowMs: NOW,
    maxAgeMs: MAX_AGE,
    ...extra,
  });
}

function history(rows = [historyRow()], extra: Partial<Parameters<typeof buildHistorySection>[0]> = {}) {
  return buildHistorySection({
    account: FIXTURE_ACCOUNT,
    requestedChains: ["1"],
    rows,
    source: SOURCE,
    fetchedAtMs: NOW - 1_000,
    nowMs: NOW,
    maxAgeMs: MAX_AGE,
    requestedFromMs: null,
    requestedToMs: null,
    pagesRead: 1,
    truncated: false,
    stopReason: "exhausted",
    ...extra,
  });
}

function pnl(rows = [pnlRow()]) {
  return buildAddressAnalysisSection({
    chainIndex: "1",
    timeFrame: "4",
    overview: { realizedPnlUsd: "100000" },
    rows,
    source: SOURCE,
    fetchedAtMs: NOW - 1_000,
    nowMs: NOW,
    maxAgeMs: MAX_AGE,
    pagesRead: 1,
    truncated: false,
    stopReason: "exhausted",
  });
}

function evidence(input: Partial<Parameters<typeof buildWalletEvidence>[0]> & { balances: ReturnType<typeof balances> | null }) {
  return buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: MAX_AGE, account: FIXTURE_ACCOUNT, ...input });
}

describe("A1 token omitted by the risk filter never becomes a zero balance", () => {
  test("an expected asset absent from a filtered answer is omitted_by_filter, has no quantity and is not counted", () => {
    const section = balances(syntheticBalanceRows(), { expectedAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_RISK_TOKEN }] });
    const omitted = section.positions.find((position) => position.identity.key === `1:contract:${FIXTURE_RISK_TOKEN}`)!;
    expect(omitted.origin).toBe("expected_not_returned");
    expect(omitted.quantity.state).toEqual({ kind: "omitted_by_filter", code: "risk_filter_may_have_omitted" });
    expect(omitted.quantity.atoms).toBeNull();
    expect(omitted.quantity.displayText).toBeNull();
    expect(omitted.valuation.valueText).toBeNull();
    expect(omitted.included).toBe(false);
    const result = evidence({ balances: section });
    expect(result.netWorth.valueText).toBe("50");
    expect(result.reconciliation.findings.some((item) => item.rule === "RC6" && item.state.kind === "omitted_by_filter")).toBe(true);
    expect(result.status).not.toBe("valid");
  });

  test("with the filter off, an absent expected asset is missing (not returned), still not zero", () => {
    const section = balances(syntheticBalanceRows(), { excludeRiskToken: "1", expectedAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_RISK_TOKEN }] });
    const absent = section.positions.find((position) => position.identity.key === `1:contract:${FIXTURE_RISK_TOKEN}`)!;
    expect(absent.quantity.state.kind).toBe("missing");
    expect(absent.quantity.atoms).toBeNull();
  });

  test("with the filter on, even a clean answer cannot be called complete: the net worth carries the caveat", () => {
    const filtered = evidence({ balances: balances() });
    expect(filtered.netWorth.caveats).toContain("risk_filter_applied_tokens_may_be_omitted");
    expect(filtered.netWorth.status).toBe("incomplete");
    expect(filtered.status).toBe("incomplete");
    const unfiltered = evidence({ balances: balances(syntheticBalanceRows(), { excludeRiskToken: "1" }) });
    expect(unfiltered.netWorth.caveats).toEqual([]);
    expect(unfiltered.status).toBe("valid");
    const silent = evidence({ balances: balances(syntheticBalanceRows(), { excludeRiskToken: "1", requestedChains: ["1", "8453"] }) });
    expect(silent.netWorth.caveats).toEqual(["networks_without_rows:1"]);
  });

  test("a returned zero is a reported zero, distinct from an omission", () => {
    const section = balances([balanceRow({ balance: "0", rawBalance: "0", tokenPrice: "4" })]);
    expect(section.positions[0]!.quantity.atoms).toBe("0");
    expect(section.positions[0]!.quantity.state.kind).toBe("ok");
    expect(section.positions[0]!.valuation.valueText).toBe("0");
  });
});

describe("A2 historical quantity with a zeroed active balance requires reconciliation", () => {
  test("provider PnL says the address holds a quantity, the active balance is zero: unreconciled", () => {
    const section = balances([balanceRow({ balance: "0", rawBalance: "0" })]);
    const result = evidence({ balances: section, addressAnalysis: pnl() });
    const hit = result.reconciliation.findings.find((item) => item.rule === "RC2")!;
    expect(hit.code).toBe("historical_quantity_active_zero");
    expect(hit.state.kind).toBe("unreconciled");
    expect(result.status).toBe("unreconciled");
  });

  test("net inflow in the history window with a zero active balance: unreconciled", () => {
    const section = balances([balanceRow({ balance: "0", rawBalance: "0" })]);
    const result = evidence({ balances: section, history: history() });
    expect(result.reconciliation.findings.find((item) => item.rule === "RC2")?.detail.signal).toBe("history_window_net_inflow");
    expect(result.status).toBe("unreconciled");
  });

  test("the asset absent from the active answer is not read as zero: it needs reconciliation with its own code", () => {
    const section = balances([balanceRow({ tokenContractAddress: FIXTURE_TOKEN_B, symbol: "FIXB", balance: "5", rawBalance: "5000000000000000000" })]);
    const result = evidence({ balances: section, addressAnalysis: pnl() });
    expect(result.reconciliation.findings.find((item) => item.rule === "RC2")?.code).toBe("historical_quantity_active_absent");
  });

  test("a positive active balance consistent with the history raises no RC2 finding", () => {
    const result = evidence({ balances: balances(), history: history(), addressAnalysis: pnl() });
    expect(result.reconciliation.findings.filter((item) => item.rule === "RC2")).toEqual([]);
  });

  test("positive quantity with a zero price is flagged, never valued as consistent", () => {
    const section = balances([balanceRow({ tokenPrice: "0" })]);
    expect(section.positions[0]!.valuation.valueText).toBeNull();
    const result = evidence({ balances: section });
    expect(result.reconciliation.findings.some((item) => item.code === "valuation_zero_with_quantity" && item.state.kind === "unreconciled")).toBe(true);
  });
});

describe("A3 PnL is never added to the net worth", () => {
  test("a very large provider PnL leaves the net worth unchanged", () => {
    const without = evidence({ balances: balances() });
    const withPnl = evidence({ balances: balances(), addressAnalysis: pnl() });
    expect(without.netWorth.valueText).toBe("50");
    expect(withPnl.netWorth.valueText).toBe("50");
    expect(withPnl.netWorth.excludes).toEqual(["pnl", "cost_basis", "history", "defi_positions"]);
    expect(withPnl.addressAnalysis!.statements.every((statement) => statement.basis === "provider_reported_unverified")).toBe(true);
    expect(withPnl.addressAnalysis!.statements.find((statement) => statement.scope === "overview")?.valueText).toBe("100000");
  });

  test("history entries do not enter the net worth either", () => {
    const withHistory = evidence({ balances: balances(), history: history([historyRow({ amount: "1000000" })]) });
    expect(withHistory.netWorth.valueText).toBe("50");
  });
});

describe("A4 difference between the reported total and the sum of the positions", () => {
  const total = (valueText: string, extra: Partial<NonNullable<BalanceBuildInput["reportedTotal"]>> = {}) => ({
    valueText,
    assetType: "tokens" as const,
    chains: ["1"],
    excludeRiskToken: "1" as const,
    fetchedAtMs: NOW - 1_000,
    ...extra,
  });

  test("equal totals reconcile", () => {
    const result = evidence({ balances: balances(syntheticBalanceRows(), { excludeRiskToken: "1", reportedTotal: total("50") }) });
    expect(result.reconciliation.totalVsSum?.state.kind).toBe("ok");
    expect(result.reconciliation.totalVsSum?.deltaText).toBe("0");
  });

  test("a gap is reported exactly and attributed to candidate causes, never closed", () => {
    const section = balances(syntheticBalanceRows(), { reportedTotal: total("75", { assetType: "all", excludeRiskToken: null }) });
    const result = evidence({ balances: section });
    const gap = result.reconciliation.totalVsSum!;
    expect(gap.reportedText).toBe("75");
    expect(gap.sumText).toBe("50");
    expect(gap.deltaText).toBe("25");
    expect(gap.state.kind).toBe("unreconciled");
    expect(gap.candidateCauses).toContain("scope_includes_defi_positions");
    expect(gap.candidateCauses).toContain("risk_filter_applied_may_omit_tokens");
    expect(result.status).toBe("unreconciled");
  });

  test("a gap with no candidate cause is divergent and unexplained", () => {
    const result = evidence({ balances: balances(syntheticBalanceRows(), { excludeRiskToken: "1", reportedTotal: total("75") }) });
    expect(result.reconciliation.totalVsSum?.state).toEqual({ kind: "divergent", code: "total_differs_unexplained" });
    expect(result.reconciliation.totalVsSum?.deltaText).toBe("25");
    expect(result.status).toBe("divergent");
  });

  test("tolerance is explicit and the sub-tolerance delta stays visible", () => {
    const inside = evidence({ balances: balances(syntheticBalanceRows(), { excludeRiskToken: "1", reportedTotal: total("50.004") }) });
    expect(inside.reconciliation.totalVsSum?.state.kind).toBe("ok");
    expect(inside.reconciliation.totalVsSum?.deltaText).toBe("0.004");
    const outside = evidence({ balances: balances(syntheticBalanceRows(), { excludeRiskToken: "1", reportedTotal: total("50.02") }) });
    expect(outside.reconciliation.totalVsSum?.state.kind).not.toBe("ok");
  });

  test("an unvalued position is a candidate cause of a larger reported total", () => {
    const rows = [...syntheticBalanceRows(), balanceRow({ locator: "/x", tokenContractAddress: FIXTURE_RISK_TOKEN, symbol: "NOPX", tokenPrice: "" })];
    const result = evidence({ balances: balances(rows, { excludeRiskToken: "1", reportedTotal: total("60") }) });
    expect(result.reconciliation.totalVsSum?.candidateCauses).toContain("unvalued_positions");
    expect(result.netWorth.unvaluedCount).toBe(1);
    expect(result.netWorth.valueText).toBe("50");
  });
});

describe("A5 six months of history is not a historical cost", () => {
  test("OKX style history never yields a cost and says why", () => {
    const section = history();
    expect(section.window.completeness).toBe("partial_six_months");
    expect(section.window.providerLimitMonths).toBe(6);
    expect(section.window.coverageFromMs).toBeGreaterThanOrEqual(NOW - 183 * 86_400_000);
    const result = evidence({ balances: balances(), history: section });
    expect(result.costBasis.length).toBe(1);
    expect(result.costBasis[0]!.basisText).toBeNull();
    expect(result.costBasis[0]!.coverage).toBe("partial_window");
    expect(result.costBasis[0]!.state.code).toBe("history_window_partial");
  });

  test("the provider cannot declare completeness, only a local import can", () => {
    const fromProvider = history([historyRow()], { declaredComplete: true });
    expect(fromProvider.window.completeness).toBe("partial_six_months");
    const imported = history([historyRow()], { declaredComplete: true, source: { ...SOURCE, id: "local_import" } });
    expect(imported.window.completeness).toBe("complete_declared");
    const statement = evidence({ balances: balances(), history: imported }).costBasis[0]!;
    expect(statement.coverage).toBe("full_history");
    expect(statement.basisText).toBeNull();
    expect(statement.state.code).toBe("cost_method_not_implemented");
  });

  test("a truncated walk is marked as such", () => {
    const section = history([historyRow()], { truncated: true, stopReason: "max_pages" });
    expect(section.window.completeness).toBe("partial_truncated");
    expect(section.status).toBe("incomplete");
  });
});

describe("A6 wrong network or contract, duplicates, decimals, old data, partial answers", () => {
  test("a row from a network that was not requested is rejected and never summed", () => {
    const rows = [...syntheticBalanceRows(), balanceRow({ locator: "/bsc", chainIndex: "56", tokenContractAddress: FIXTURE_TOKEN_A, balance: "1000", rawBalance: "1000000000000000000000", tokenPrice: "1" })];
    const section = balances(rows);
    expect(section.rejected).toEqual([{ locator: "/bsc", code: "network_mismatch", chainIndex: "56" }]);
    expect(section.status).toBe("divergent");
    expect(evidence({ balances: section }).netWorth.valueText).toBe("50");
  });

  test("a network the registry does not know, and a contract that is not valid for its network, are rejected", () => {
    const section = balances([
      balanceRow({ locator: "/unknown", chainIndex: "999999" }),
      balanceRow({ locator: "/solana-mint-on-evm", tokenContractAddress: "FixtureMint111111111111111111111111111111" }),
      balanceRow({ locator: "/not-text", chainIndex: 1 as unknown as string }),
    ]);
    expect(section.rejected.map((row) => row.code)).toEqual(["network_mismatch", "contract_invalid_for_network", "network_mismatch"]);
    expect(section.positions).toEqual([]);
  });

  test("a row that belongs to another account is rejected", () => {
    const section = balances([balanceRow({ address: "0x00000000000000000000000000000000000ee999" })]);
    expect(section.rejected[0]?.code).toBe("account_mismatch");
  });

  test("identical repeats collapse once and are counted", () => {
    const section = balances([balanceRow({ locator: "/a" }), balanceRow({ locator: "/b", tokenContractAddress: FIXTURE_TOKEN_A.toUpperCase().replace("0X", "0x") })]);
    expect(section.positions.length).toBe(1);
    expect(section.duplicatesCollapsed).toBe(1);
    expect(section.positions[0]!.valuation.valueText).toBe("10");
  });

  test("conflicting repeats are divergent, carry no quantity and are not summed", () => {
    const section = balances([balanceRow({ locator: "/a" }), balanceRow({ locator: "/b", balance: "9", rawBalance: "9000000" })]);
    const position = section.positions[0]!;
    expect(position.state).toEqual({ kind: "divergent", code: "duplicate_identity_conflict" });
    expect(position.quantity.displayText).toBeNull();
    expect(position.included).toBe(false);
    expect(evidence({ balances: section }).netWorth.valueText).toBeNull();
  });

  test("the same contract with different decimals is a decimals conflict", () => {
    const section = balances([balanceRow({ locator: "/a" }), balanceRow({ locator: "/b", balance: "2.5", rawBalance: "2500000000000000000" })]);
    expect(section.positions[0]!.state.code).toBe("decimals_conflict");
  });

  test("decimals: derived from the raw ratio, pinned for the native coin, unknown without raw", () => {
    const section = balances([
      balanceRow({ locator: "/derived" }),
      balanceRow({ locator: "/native", tokenContractAddress: "", balance: "1.5", rawBalance: "", tokenPrice: "2" }),
      balanceRow({ locator: "/unknown", tokenContractAddress: FIXTURE_TOKEN_B, balance: "7", rawBalance: "", tokenPrice: "2" }),
    ]);
    const by = (locator: string) => section.positions.find((position) => position.rowLocators.includes(locator))!;
    expect(by("/derived").quantity).toMatchObject({ atoms: "2500000", decimals: 6, decimalsSource: "derived_raw_ratio", unit: "token" });
    expect(by("/native").quantity).toMatchObject({ atoms: "1500000000000000000", decimals: 18, decimalsSource: "registry_pinned" });
    expect(by("/native").valuation.valueText).toBe("3");
    expect(by("/unknown").quantity.atoms).toBeNull();
    expect(by("/unknown").quantity.state.code).toBe("decimals_unknown");
    expect(by("/unknown").valuation.valueText).toBeNull();
  });

  test("a raw balance that disagrees with a pinned scale is divergent, not corrected", () => {
    const section = balances([balanceRow({ tokenContractAddress: "", balance: "1", rawBalance: "1000" })]);
    expect(section.positions[0]!.quantity.state.kind).toBe("divergent");
    expect(section.positions[0]!.included).toBe(false);
  });

  test("amounts keep full precision beyond what a JavaScript number holds", () => {
    const section = balances([balanceRow({ balance: "123456789.123456789012345678", rawBalance: "123456789123456789012345678", tokenContractAddress: FIXTURE_TOKEN_B, tokenPrice: "1.000000000000000001" })]);
    expect(section.positions[0]!.quantity.atoms).toBe("123456789123456789012345678");
    expect(section.positions[0]!.valuation.valueText).toBe("123456789.123456789135802467123456789012345678"); // checked with Python Decimal, 80 digits
  });

  test("old data: capture age past the limit is stale, a future capture is flagged", () => {
    const old = balances(syntheticBalanceRows(), { fetchedAtMs: NOW - 10 * MAX_AGE });
    expect(old.freshness.capture).toBe("stale");
    expect(old.status).toBe("stale");
    expect(evidence({ balances: old }).status).toBe("stale");
    const future = balances(syntheticBalanceRows(), { fetchedAtMs: NOW + 10 * MAX_AGE });
    expect(future.freshness.capture).toBe("future");
    expect(future.status).toBe("stale");
  });

  test("fetched_at and source_time are separate: a provider clock far behind makes the source stale, the capture stays fresh", () => {
    const section = balances(syntheticBalanceRows(), { sourceTimeMs: NOW - 10 * MAX_AGE });
    expect(section.freshness).toEqual({ capture: "fresh", source: "stale" });
    expect(section.timing.fetchedAtMs).toBe(NOW - 1_000);
    expect(section.timing.sourceTimeMs).toBe(NOW - 10 * MAX_AGE);
  });

  test("a measured clock offset puts the provider clock on the local timeline", () => {
    const ahead = balances(syntheticBalanceRows(), { sourceTimeMs: NOW + 120_000 });
    expect(ahead.freshness.source).toBe("future");
    const corrected = balances(syntheticBalanceRows(), { sourceTimeMs: NOW + 120_000, clockOffsetMs: 120_000 });
    expect(corrected.freshness.source).toBe("fresh");
  });

  test("partial answer: unreadable fields become states, and the rest of the rows survive", () => {
    const section = balances([
      balanceRow({ locator: "/ok" }),
      balanceRow({ locator: "/no-balance", tokenContractAddress: FIXTURE_TOKEN_B, balance: undefined }),
      balanceRow({ locator: "/exp", tokenContractAddress: "0x00000000000000000000000000000000000d0004", balance: "1e5", rawBalance: "" }),
      balanceRow({ locator: "/no-price", tokenContractAddress: "0x00000000000000000000000000000000000d0005", tokenPrice: undefined }),
    ]);
    const codes = Object.fromEntries(section.positions.map((position) => [position.rowLocators[0], position.state.code]));
    expect(codes["/ok"]).toBe("ok");
    expect(codes["/no-balance"]).toBe("balance_missing");
    expect(codes["/exp"]).toBe("balance_unreadable");
    expect(codes["/no-price"]).toBe("price_missing");
    expect(section.status).toBe("incomplete");
  });

  test("a networks with no row is reported as not reported, never as a zero balance", () => {
    const section = balances(syntheticBalanceRows(), { requestedChains: ["1", "8453"] });
    expect(section.coverage.observed).toEqual(["1"]);
    expect(section.coverage.notReported).toEqual(["8453"]);
    expect(section.coverage.status).toBe("partial");
  });

  test("a risk flagged token is excluded from the net worth", () => {
    const section = balances([balanceRow(), balanceRow({ locator: "/risk", tokenContractAddress: FIXTURE_RISK_TOKEN, isRiskToken: true, balance: "100", rawBalance: "100000000", tokenPrice: "5" })], { excludeRiskToken: "1" });
    const risk = section.positions.find((position) => position.rowLocators.includes("/risk"))!;
    expect(risk.risk.assessment).toBe("flagged");
    expect(risk.included).toBe(false);
    expect(evidence({ balances: section }).netWorth.valueText).toBe("10");
  });

  test("a false risk flag on a network without the provider filter says nothing", () => {
    const section = balances([balanceRow({ chainIndex: "10", tokenContractAddress: "" , balance: "1", rawBalance: "1000000000000000000", tokenPrice: "3000" })], { requestedChains: ["10"] });
    expect(section.positions[0]!.risk.assessment).toBe("unknown");
  });
});

describe("A7 synthetic fixtures are labeled and absence of real data is not masked", () => {
  test("a synthetic evidence says so in the data and carries no real-data claim", () => {
    const result = evidence({ balances: balances() });
    expect(result.origin).toBe("synthetic_fixture");
    expect(result.realData).toBe(false);
    expect(result.trigger).toBe("on_demand");
    expect(FIXTURE_LABEL.startsWith("DADO SINTETICO")).toBe(true);
    expect(verifyEvidence(result)).toBe(true);
  });

  test("the account address is not part of the evidence, only its hash", () => {
    const text = JSON.stringify(evidence({ balances: balances(), history: history(), addressAnalysis: pnl() }));
    expect(text.includes(FIXTURE_ACCOUNT)).toBe(false);
    expect(text.includes(FIXTURE_ACCOUNT.toUpperCase().replace("0X", ""))).toBe(false);
  });

  test("no collected data is incomplete with no value, not an example and not zero", () => {
    const result = evidence({ balances: null });
    expect(result.status).toBe("incomplete");
    expect(result.netWorth.valueText).toBeNull();
    expect(result.sections).toEqual({ balances: "not_collected", history: "not_collected", market: "not_collected", addressAnalysis: "not_collected" });
  });

  test("tampering with the content breaks the hash", () => {
    const result = evidence({ balances: balances() });
    const tampered = { ...result, netWorth: { ...result.netWorth, valueText: "999999" } };
    expect(verifyEvidence(tampered)).toBe(false);
  });

  test("the same input yields the same hash", () => {
    expect(evidence({ balances: balances() }).contentSha256).toBe(evidence({ balances: balances() }).contentSha256);
  });
});
