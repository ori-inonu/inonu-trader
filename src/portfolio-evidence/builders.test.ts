/**
 * Unit tests of the history, Address Analysis, market and reconciliation builders. SYNTHETIC data only.
 */

import { describe, expect, test } from "bun:test";
import { buildAddressAnalysisSection } from "./address-analysis.ts";
import { buildBalanceSection } from "./balances.ts";
import { buildWalletEvidence } from "./evidence.ts";
import { FIXTURE_ACCOUNT, FIXTURE_NOW_MS, FIXTURE_TOKEN_A, FIXTURE_TOKEN_B, balanceRow, historyRow, pnlRow, syntheticBalanceRows } from "./fixtures.ts";
import { buildHistorySection, costBasisStatements, netInflowByAsset, SIX_MONTHS_MS } from "./history.ts";
import { assembleMarketSection, decimalsHintsOf, priceHintsOf } from "./market.ts";
import { compareRevision, reconcile } from "./reconcile.ts";
import { OK, state } from "./state.ts";
import { ADAPTER_VERSION, type MarketSection, type SourceInfo } from "./types.ts";

const NOW = FIXTURE_NOW_MS;
const SOURCE: SourceInfo = { id: "synthetic_fixture", endpoint: null, method: null, apiVersion: null, adapterVersion: ADAPTER_VERSION, tier: "not_applicable" };
const OTHER = "0x00000000000000000000000000000000000ee001";

function history(rows = [historyRow()], extra: Partial<Parameters<typeof buildHistorySection>[0]> = {}) {
  return buildHistorySection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows, source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: 60_000, requestedFromMs: null, requestedToMs: null, pagesRead: 1, truncated: false, stopReason: "exhausted", ...extra });
}
function balances(rows = syntheticBalanceRows(), extra: Partial<Parameters<typeof buildBalanceSection>[0]> = {}) {
  return buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows, source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000, ...extra });
}
function market(partial: Partial<Parameters<typeof assembleMarketSection>[0]> = {}): MarketSection {
  return assembleMarketSection({ source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: 60_000, ...partial });
}
const identityOf = (address: string) => ({ chainIndex: "1", family: "evm" as const, asset: { kind: "contract" as const, address }, key: `1:contract:${address}` });

describe("history section", () => {
  test("direction is decided against the account, including multi-address and self transfers", () => {
    const section = history([
      historyRow({ locator: "/in" }),
      historyRow({ locator: "/out", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000002", from: [{ address: FIXTURE_ACCOUNT.toUpperCase().replace("0X", "0x") }], to: [{ address: OTHER }] }),
      historyRow({ locator: "/self", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000003", from: [{ address: FIXTURE_ACCOUNT }], to: [{ address: FIXTURE_ACCOUNT }] }),
      historyRow({ locator: "/multi", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000004", from: [{ address: `${OTHER},${FIXTURE_ACCOUNT}` }], to: [{ address: OTHER }] }),
      historyRow({ locator: "/none", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000005", from: [{ address: OTHER }], to: [{ address: OTHER }] }),
    ]);
    const byHash = Object.fromEntries(section.entries.map((entry) => [entry.tx.hash.slice(-1), entry.direction]));
    expect(byHash).toEqual({ "1": "in", "2": "out", "3": "self", "4": "out", "5": "unknown" });
  });

  test("an empty fee stays unknown (never zero) and the fee unit is undeclared", () => {
    const entries = history([historyRow({ txFee: "" }), historyRow({ txHash: "0xfixturehash0000000000000000000000000000000000000000000000000009", txFee: "0.001" })]).entries;
    expect(entries.map((entry) => entry.feeText).sort((a, b) => String(a).localeCompare(String(b)))).toEqual(["0.001", null]);
    expect(entries.every((entry) => entry.feeUnit === null)).toBe(true);
  });

  test("status, time and amount problems become states; pending and unknown status are not final", () => {
    const section = history([
      historyRow({ locator: "/pending", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000011", txStatus: "pending" }),
      historyRow({ locator: "/status", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000012", txStatus: "weird" }),
      historyRow({ locator: "/time", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000013", txTime: "abc" }),
      historyRow({ locator: "/amount", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000014", amount: "1e3" }),
      historyRow({ locator: "/future", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000015", txTime: String(NOW + 3_600_000) }),
      historyRow({ locator: "/fail", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000016", txStatus: "fail" }),
    ]);
    const codes = Object.fromEntries(section.entries.map((entry) => [entry.tx.hash.slice(-2), entry.state.code]));
    expect(codes).toEqual({ "11": "tx_pending", "12": "tx_status_unknown", "13": "time_unverified", "14": "amount_unreadable", "15": "tx_time_in_future", "16": "ok" });
    expect(section.status).toBe("stale");
  });

  test("rows for other networks, with unreadable hashes or invalid contracts are rejected", () => {
    const section = history([
      historyRow({ locator: "/bsc", chainIndex: "56" }),
      historyRow({ locator: "/hash", txHash: "x" }),
      historyRow({ locator: "/mint", tokenContractAddress: "FixtureMint111111111111111111111111111111" }),
    ]);
    expect(section.rejected.map((row) => row.code)).toEqual(["network_mismatch", "tx_hash_unreadable", "contract_invalid_for_network"]);
    expect(section.status).toBe("divergent");
  });

  test("repeated movements collapse, distinct movements with the same hash do not", () => {
    const section = history([historyRow({ locator: "/a" }), historyRow({ locator: "/b" }), historyRow({ locator: "/c", itype: "0", tokenContractAddress: "" })]);
    expect(section.entries).toHaveLength(2);
    expect(section.duplicatesCollapsed).toBe(1);
  });

  test("out of order pages are flagged and the output order is deterministic", () => {
    const rows = [historyRow({ locator: "/old", txTime: String(NOW - 5000), txHash: "0xfixturehash0000000000000000000000000000000000000000000000000021" }), historyRow({ locator: "/new", txTime: String(NOW - 1000), txHash: "0xfixturehash0000000000000000000000000000000000000000000000000022" })];
    const section = history(rows);
    expect(section.issues.some((issue) => issue.code === "order_not_descending")).toBe(true);
    expect(section.entries.map((entry) => entry.txTimeMs)).toEqual([NOW - 1000, NOW - 5000]);
  });

  test("the window never starts before six months ago", () => {
    const section = history([historyRow()], { requestedFromMs: 1 });
    expect(section.window.coverageFromMs).toBe(NOW - SIX_MONTHS_MS);
    expect(history([historyRow()], { requestedFromMs: NOW - 1000 }).window.coverageFromMs).toBe(NOW - 1000);
  });

  test("net inflow counts only successful, directed, readable entries", () => {
    const section = history([
      historyRow({ locator: "/in", amount: "5" }),
      historyRow({ locator: "/out", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000031", from: [{ address: FIXTURE_ACCOUNT }], to: [{ address: OTHER }], amount: "2" }),
      historyRow({ locator: "/fail", txHash: "0xfixturehash0000000000000000000000000000000000000000000000000032", amount: "100", txStatus: "fail" }),
    ]);
    expect(netInflowByAsset(section).get(`1:contract:${FIXTURE_TOKEN_A}`)?.units).toBe(3n);
  });

  test("cost basis: none without history, and a partial window never yields a figure", () => {
    expect(costBasisStatements(null)).toEqual([]);
    expect(costBasisStatements(history()).every((statement) => statement.basisText === null && statement.coverage === "partial_window")).toBe(true);
  });
});

describe("Address Analysis section", () => {
  const build = (rows = [pnlRow()], overview: { realizedPnlUsd: unknown } | null = { realizedPnlUsd: "100" }) =>
    buildAddressAnalysisSection({ chainIndex: "1", timeFrame: "3", overview, rows, source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: 60_000, pagesRead: 1, truncated: false, stopReason: "exhausted" });

  test("every figure is provider reported and unverified, with the window it declares", () => {
    const section = build();
    expect(section.timeFrame).toBe("timeframe_7D");
    expect(section.statements.every((statement) => statement.basis === "provider_reported_unverified" && statement.costsKnown === "unknown" && statement.currency === "USD")).toBe(true);
    expect(section.statements.find((statement) => statement.scope === "overview")?.window).toBe("timeframe_7D");
    expect(section.statements.find((statement) => statement.scope === "token")?.window).toBe("unspecified_by_provider");
    expect(section.coverage.status).toBe("partial");
    expect(section.issues.some((issue) => issue.code === "pnl_method_and_window_undeclared")).toBe(true);
  });

  test("SELL_ALL is a marker, not a number; unreadable and missing figures are states", () => {
    const section = build([pnlRow({ unrealizedPnlUsd: "SELL_ALL", realizedPnlUsd: "1e3" }), pnlRow({ locator: "/2", tokenContractAddress: FIXTURE_TOKEN_B, realizedPnlUsd: undefined, unrealizedPnlUsd: "-5.5" })]);
    const byCode = section.statements.filter((statement) => statement.scope === "token").map((statement) => `${statement.class}:${statement.valueText}:${statement.state.code}`);
    expect(byCode).toEqual(["realized:null:pnl_unreadable", "unrealized_reported:null:provider_sell_all_marker", "realized:null:pnl_missing", "unrealized_reported:-5.5:provider_reported_unverified"]);
  });

  test("rows for another network, bad contracts and repeated tokens are rejected", () => {
    const section = build([pnlRow({ locator: "/a", chainIndex: "56" }), pnlRow({ locator: "/b", tokenContractAddress: "FixtureMint111111111111111111111111111111" }), pnlRow({ locator: "/c" }), pnlRow({ locator: "/d" })]);
    expect(section.rejected.map((row) => row.code)).toEqual(["network_mismatch", "contract_invalid_for_network", "duplicate_identity"]);
    expect(section.status).toBe("divergent");
  });

  test("a held quantity sold out is not a signal, and nothing returned is reported as not reported", () => {
    const empty = build([], null);
    expect(empty.coverage.notReported).toEqual(["1"]);
    const sold = build([pnlRow({ tokenPositionDuration: { holdingTimestamp: String(NOW - 9_000_000_000), sellOffTimestamp: String(NOW - 1_000_000_000) } })]);
    expect(sold.positions[0]!.soldOutAtMs).toBe(NOW - 1_000_000_000);
    const result = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: balances([balanceRow({ balance: "0", rawBalance: "0" })]), addressAnalysis: sold });
    expect(result.reconciliation.findings.filter((item) => item.rule === "RC2")).toEqual([]);
  });
});

describe("market evidence", () => {
  test("decimals and price hints only carry readable ok rows", () => {
    const section = market({
      tokenInfo: [{ identity: identityOf(FIXTURE_TOKEN_A), decimals: 6, state: OK }, { identity: identityOf(FIXTURE_TOKEN_B), decimals: null, state: state("unverified", "decimals_unreadable") }],
      prices: [{ identity: identityOf(FIXTURE_TOKEN_A), priceText: "4", currency: null, timeMs: NOW - 500, fetchedAtMs: NOW - 400, state: OK }, { identity: identityOf(FIXTURE_TOKEN_B), priceText: "0", currency: null, timeMs: null, fetchedAtMs: NOW - 400, state: state("unverified", "price_zero_unverified") }],
      missing: [{ key: "1:contract:0xabc", aspect: "price" }],
    });
    expect([...decimalsHintsOf(section).keys()]).toEqual([`1:contract:${FIXTURE_TOKEN_A}`]);
    expect([...priceHintsOf(section).keys()]).toEqual([`1:contract:${FIXTURE_TOKEN_A}`]);
    expect(section.status).toBe("incomplete");
    expect(decimalsHintsOf(null).size).toBe(0);
  });

  test("provider decimals unlock the value of a token whose raw balance is empty", () => {
    const hints = decimalsHintsOf(market({ tokenInfo: [{ identity: identityOf(FIXTURE_TOKEN_B), decimals: 18, state: OK }] }));
    const section = balances([balanceRow({ tokenContractAddress: FIXTURE_TOKEN_B, balance: "5", rawBalance: "", tokenPrice: "2" })], { decimalsHints: hints });
    expect(section.positions[0]!.quantity).toMatchObject({ atoms: "5000000000000000000", decimals: 18, decimalsSource: "provider_token_info" });
    expect(section.positions[0]!.valuation.valueText).toBe("10");
  });

  test("provider decimals that contradict the raw ratio are a conflict", () => {
    const hints = decimalsHintsOf(market({ tokenInfo: [{ identity: identityOf(FIXTURE_TOKEN_A), decimals: 18, state: OK }] }));
    const section = balances([balanceRow({ balance: "2.5", rawBalance: "2500000" })], { decimalsHints: hints });
    expect(section.positions[0]!.quantity.state).toEqual({ kind: "divergent", code: "decimals_conflict" });
    expect(section.positions[0]!.included).toBe(false);
  });

  test("a market price that agrees supplies the price clock; one that disagrees makes the value divergent", () => {
    const agree = priceHintsOf(market({ prices: [{ identity: identityOf(FIXTURE_TOKEN_A), priceText: "4.01", currency: null, timeMs: NOW - 700, fetchedAtMs: NOW - 400, state: OK }] }));
    const ok = balances([balanceRow()], { priceHints: agree });
    expect(ok.positions[0]!.valuation).toMatchObject({ priceAsOfMs: NOW - 700, priceSource: "okx_balance_api+okx_market_price", state: OK });
    const disagree = priceHintsOf(market({ prices: [{ identity: identityOf(FIXTURE_TOKEN_A), priceText: "8", currency: null, timeMs: NOW - 700, fetchedAtMs: NOW - 400, state: OK }] }));
    const bad = balances([balanceRow()], { priceHints: disagree });
    expect(bad.positions[0]!.valuation.state).toEqual({ kind: "divergent", code: "price_sources_disagree" });
    expect(bad.positions[0]!.included).toBe(false);
  });

  test("a market price does not rescue a zero balance price (its currency is undeclared)", () => {
    const hints = priceHintsOf(market({ prices: [{ identity: identityOf(FIXTURE_TOKEN_A), priceText: "4", currency: null, timeMs: NOW, fetchedAtMs: NOW - 400, state: OK }] }));
    const section = balances([balanceRow({ tokenPrice: "0" })], { priceHints: hints });
    expect(section.positions[0]!.valuation.valueText).toBeNull();
    expect(section.positions[0]!.caveats).toContain("market_price_available_currency_undeclared");
  });
});

describe("risk and liquidity observations", () => {
  const withMarket = (liquidityText: string | null, riskLevel: number | null, tags: string[] = []) => {
    const section = balances([balanceRow()]);
    return reconcile({
      balances: section,
      history: null,
      addressAnalysis: null,
      market: market({
        liquidity: [{ identity: identityOf(FIXTURE_TOKEN_A), poolsRead: 2, liquidityUsdLowerBoundText: liquidityText, scope: "top_pools_lower_bound", state: OK }],
        risk: [{ identity: identityOf(FIXTURE_TOKEN_A), riskControlLevel: riskLevel, tags, state: OK }],
      }),
    }).findings.filter((item) => item.rule === "RK");
  };

  test("a position that is large against the visible pools is flagged; a small one is not", () => {
    expect(withMarket("500", 1).map((item) => item.code)).toEqual(["position_large_vs_top_pools"]);
    expect(withMarket("1000000", 1)).toEqual([]);
    expect(withMarket("0", 1).map((item) => item.code)).toEqual(["no_visible_liquidity"]);
  });

  test("risk level 0 says nothing; levels 3 and up and the honeypot tag are flagged", () => {
    expect(withMarket("1000000", 0)).toEqual([]);
    expect(withMarket("1000000", 3).map((item) => item.code)).toEqual(["risk_elevated"]);
    expect(withMarket("1000000", 1, ["honeypot"]).map((item) => item.code)).toEqual(["risk_elevated"]);
  });
});

describe("reconciliation rules RC3 and RC5", () => {
  test("two contracts sharing a symbol on one network are a warning; the same symbol across networks is not", () => {
    const same = balances([balanceRow({ locator: "/a" }), balanceRow({ locator: "/b", tokenContractAddress: FIXTURE_TOKEN_B })]);
    const found = reconcile({ balances: same, history: null, market: null, addressAnalysis: null }).findings.filter((item) => item.code === "same_symbol_different_contract_on_network");
    expect(found).toHaveLength(1);
    const across = balances([balanceRow({ locator: "/a" }), balanceRow({ locator: "/b", chainIndex: "8453" })], { requestedChains: ["1", "8453"] });
    expect(reconcile({ balances: across, history: null, market: null, addressAnalysis: null }).findings.filter((item) => item.code === "same_symbol_different_contract_on_network")).toEqual([]);
  });

  test("revisions: older and conflicting ones are findings, a newer one is accepted", () => {
    const prev = { generatedAtMs: 2000, revision: 2, contentSha256: "a" };
    expect(compareRevision(null, prev)).toBeNull();
    expect(compareRevision(prev, { generatedAtMs: 3000, revision: 3, contentSha256: "b" })).toBeNull();
    expect(compareRevision(prev, { generatedAtMs: 1000, revision: 3, contentSha256: "b" })?.code).toBe("older_revision");
    expect(compareRevision(prev, { generatedAtMs: 3000, revision: 1, contentSha256: "b" })?.code).toBe("older_revision");
    expect(compareRevision(prev, { generatedAtMs: 2000, revision: 2, contentSha256: "b" })?.code).toBe("revision_conflict");
    expect(compareRevision(prev, { generatedAtMs: 2000, revision: 2, contentSha256: "a" })).toBeNull();
  });

  test("a clean wallet reconciles to valid", () => {
    const result = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: balances(syntheticBalanceRows(), { reportedTotal: { valueText: "50", assetType: "tokens", chains: ["1"], excludeRiskToken: "1", fetchedAtMs: NOW - 900 } }) });
    expect(result.reconciliation.findings.filter((item) => item.state.kind !== "ok")).toEqual([]);
    expect(result.status).toBe("valid");
  });
});
