/**
 * The rest of the Address Analysis (portfolio) family: latest PnL of a token, DEX trade history and supported chains.
 * Written before the code. All data is SYNTHETIC; the numbers of the latest-PnL case copy the INCONSISTENCY the OKX page's own
 * example has (total 1371.68, realized -685.4, unrealized 685.4), to prove it is flagged instead of trusted.
 */

import { describe, expect, test } from "bun:test";
import { envelope, makeClock, makeStack, type FakeCall, type FakeReply } from "../onchainos/fakes.ts";
import { OnchainosError } from "../onchainos/errors.ts";
import { buildAddressAnalysisSection, type AddressAnalysisBuildInput, type RawDexTrade, type RawLatestPnl } from "./address-analysis.ts";
import { buildBalanceSection } from "./balances.ts";
import { runCli, type CliIo } from "./cli.ts";
import { collectWalletEvidence, planCalls, type CollectRequest } from "./collector.ts";
import { buildWalletEvidence } from "./evidence.ts";
import { FIXTURE_ACCOUNT, FIXTURE_NOW_MS, FIXTURE_TOKEN_A, FIXTURE_TOKEN_B, balanceRow } from "./fixtures.ts";
import { readDexHistory, readLatestPnl, readPortfolioSupportedChains } from "./adapters/okx-read.ts";
import { ADAPTER_VERSION, type SourceInfo } from "./types.ts";
import { makeFakeFetch, makeMemoryFs } from "../onchainos/fakes.ts";

const NOW = FIXTURE_NOW_MS;
const SOURCE: SourceInfo = { id: "synthetic_fixture", endpoint: null, method: null, apiVersion: null, adapterVersion: ADAPTER_VERSION, tier: "not_applicable" };
const LATEST_PATH = "/api/v6/dex/market/portfolio/token/latest-pnl";
const DEX_PATH = "/api/v6/dex/market/portfolio/dex-history";
const SUPPORT_PATH = "/api/v6/dex/market/portfolio/supported/chain";
const OVERVIEW_PATH = "/api/v6/dex/market/portfolio/overview";
const RECENT_PATH = "/api/v6/dex/market/portfolio/recent-pnl";
const BALANCES_PATH = "/api/v6/dex/balance/all-token-balances-by-address";
const KEY_A = `1:contract:${FIXTURE_TOKEN_A}`;
const DAY = 86_400_000;

const latestRaw = (extra: Partial<RawLatestPnl> = {}): RawLatestPnl => ({ totalPnlUsd: "1371.68", unrealizedPnlUsd: "685.4", realizedPnlUsd: "-685.4", isPnlSupported: true, ...extra });
const trade = (n: number, extra: Partial<RawDexTrade> = {}): RawDexTrade => ({
  locator: `/page/0/transactionList/${n}`,
  type: "1",
  chainIndex: "1",
  tokenContractAddress: FIXTURE_TOKEN_A,
  tokenSymbol: "FIXA",
  valueUsd: "100",
  amount: "2",
  price: "50",
  marketCap: "1000000",
  pnlUsd: "0",
  time: String(NOW - n * 3_600_000),
  ...extra,
});

function section(extra: Partial<AddressAnalysisBuildInput> = {}) {
  return buildAddressAnalysisSection({ chainIndex: "1", timeFrame: "4", overview: null, rows: [], source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: 60_000, pagesRead: 1, truncated: false, stopReason: "exhausted", ...extra });
}
const tradesInput = (rows: RawDexTrade[], extra: Record<string, unknown> = {}) => ({ trades: { rows, beginMs: NOW - 30 * DAY, endMs: NOW, pagesRead: 1, truncated: false, stopReason: "exhausted", ...extra } });

describe("latest PnL of one token", () => {
  test("the reader asks for chain, wallet and token and keeps the provider fields as sent", async () => {
    const { http, fake } = makeStack([{ body: envelope({ ...latestRaw(), totalPnlPercent: "5", realizedPnlPercent: "-1", unrealizedPnlPercent: "2" }) }]);
    const read = await readLatestPnl(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, tokenContractAddress: FIXTURE_TOKEN_A });
    expect(fake.calls[0]!.path).toBe(LATEST_PATH);
    expect(fake.calls[0]!.method).toBe("GET");
    expect(fake.calls[0]!.query).toContain("chainIndex=1");
    expect(fake.calls[0]!.query).toContain(`walletAddress=${FIXTURE_ACCOUNT}`);
    expect(fake.calls[0]!.query).toContain(`tokenContractAddress=${FIXTURE_TOKEN_A}`);
    expect(read.value).toMatchObject({ totalPnlUsd: "1371.68", realizedPnlUsd: "-685.4", unrealizedPnlUsd: "685.4", isPnlSupported: true });
  });

  test("a bad chain, wallet or token is refused before any call", async () => {
    const { http, fake } = makeStack([]);
    const args = { chainIndex: "1", address: FIXTURE_ACCOUNT, tokenContractAddress: FIXTURE_TOKEN_A };
    await expect(readLatestPnl(http, { ...args, chainIndex: "999999" })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readLatestPnl(http, { ...args, address: "nope" })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readLatestPnl(http, { ...args, tokenContractAddress: "FixtureMint111111111111111111111111111111" })).rejects.toBeInstanceOf(OnchainosError);
    expect(fake.calls).toHaveLength(0);
  });

  test("the provider's own example does not add up: total is not realized plus unrealized, and that is flagged", () => {
    const result = section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw() }] });
    const check = result.tokenPnlChecks[0]!;
    expect(check.identity.key).toBe(KEY_A);
    expect(check.totalText).toBe("1371.68");
    expect(check.partsSumText).toBe("0");
    expect(check.deltaText).toBe("1371.68");
    expect(check.state).toEqual({ kind: "divergent", code: "pnl_total_differs_from_parts" });
    expect(result.status).toBe("divergent");
    expect(result.statements.filter((statement) => statement.scope === "token").every((statement) => statement.basis === "provider_reported_unverified")).toBe(true);
  });

  test("a consistent answer is only consistent, never verified; an unsupported token has no figures", () => {
    const ok = section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60" }) }] });
    expect(ok.tokenPnlChecks[0]!.state.kind).toBe("ok");
    expect(ok.tokenPnlChecks[0]!.deltaText).toBe("0");
    expect(ok.statements.find((statement) => statement.class === "realized" && statement.scope === "token")?.state.kind).toBe("unverified");
    const unsupported = section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ isPnlSupported: false }) }] });
    expect(unsupported.tokenPnlChecks[0]!.supported).toBe(false);
    expect(unsupported.statements.filter((statement) => statement.scope === "token").every((statement) => statement.valueText === null && statement.state.code === "pnl_not_supported_for_token")).toBe(true);
  });

  test("an unreadable or missing figure never becomes a number; SELL_ALL is a marker", () => {
    const result = section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ totalPnlUsd: "1e3", realizedPnlUsd: undefined, unrealizedPnlUsd: "SELL_ALL" }) }] });
    expect(result.tokenPnlChecks[0]).toMatchObject({ totalText: null, partsSumText: null, deltaText: null });
    expect(result.tokenPnlChecks[0]!.state.kind).toBe("unverified");
  });

  test("a token on another network is rejected", () => {
    const result = section({ tokenPnl: [{ token: { chainIndex: "56", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw() }] });
    expect(result.tokenPnlChecks).toHaveLength(0);
    expect(result.rejected.map((row) => row.code)).toEqual(["network_mismatch"]);
  });
});

describe("DEX trade history", () => {
  const page = (rows: unknown[], cursor: string) => envelope({ cursor, transactionList: rows });
  const wire = (n: number) => ({ type: "1", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", valueUsd: "100", amount: "2", price: "50", marketCap: "1", pnlUsd: "0", time: String(NOW - n * 3_600_000) });

  test("the reader sends the required window, walks the cursor and stops at the page cap", async () => {
    const { http, fake } = makeStack((_call, index) => ({ body: page([wire(index * 2 + 1), wire(index * 2 + 2)], `c${index + 1}`) }));
    const read = await readDexHistory(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - 30 * DAY, endMs: NOW, types: "1,2", maxPages: 2 });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]!.path).toBe(DEX_PATH);
    for (const part of ["chainIndex=1", `walletAddress=${FIXTURE_ACCOUNT}`, `begin=${NOW - 30 * DAY}`, `end=${NOW}`, "type=1%2C2", "limit=100"]) expect(fake.calls[0]!.query).toContain(part);
    expect(fake.calls[1]!.query).toContain("cursor=c1");
    expect(read).toMatchObject({ pages: 2, truncated: true, stopReason: "max_pages" });
    expect(read.rows).toHaveLength(4);
    expect(read.rows[0]!.locator).toBe("/page/0/transactionList/0");
  });

  test("an exhausted cursor is complete for the window; the window and types are validated before any call", async () => {
    const { http, fake } = makeStack([{ body: page([wire(1)], "") }]);
    const read = await readDexHistory(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 3 });
    expect(read.stopReason).toBe("exhausted");
    expect(read.truncated).toBe(false);
    expect(fake.calls[0]!.query).not.toContain("type=");
    const bad = [{ beginMs: NOW, endMs: NOW - 1 }, { beginMs: 5, endMs: 10 }, { beginMs: NOW - DAY, endMs: NOW, types: "5" }, { beginMs: NOW - DAY, endMs: NOW, types: "1,1" }, { beginMs: NOW - DAY, endMs: NOW, types: "a" }];
    for (const extra of bad) await expect(readDexHistory(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, maxPages: 1, ...extra })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readDexHistory(http, { chainIndex: "1", address: "nope", beginMs: NOW - DAY, endMs: NOW, maxPages: 1 })).rejects.toBeInstanceOf(OnchainosError);
    expect(fake.calls).toHaveLength(1);
  });

  test("a malformed page fails closed", async () => {
    const { http } = makeStack([{ body: envelope({ cursor: "", transactionList: "x" }) }]);
    await expect(readDexHistory(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 1 })).rejects.toBeInstanceOf(OnchainosError);
  });

  test("trades keep kind, identity and text exactly; a duplicate collapses; a trade outside the window or on another network is not trusted", () => {
    const result = section(tradesInput([
      trade(1),
      trade(1, { locator: "/dup" }),
      trade(2, { type: "2", valueUsd: "30", amount: "1" }),
      trade(3, { type: "3", valueUsd: "0", amount: "4" }),
      trade(4, { type: "4", valueUsd: "0", amount: "1" }),
      trade(5, { type: "9" }),
      trade(6, { time: String(NOW - 90 * DAY) }),
      trade(7, { chainIndex: "56" }),
      trade(8, { tokenContractAddress: "FixtureMint111111111111111111111111111111" }),
      trade(9, { amount: "1e3" }),
    ]));
    expect(result.trades).toHaveLength(7);
    const byCode = Object.fromEntries(result.trades.map((item) => [item.state.code + ":" + item.kind, true]));
    expect(byCode["ok:buy"]).toBe(true);
    expect(byCode["ok:sell"]).toBe(true);
    expect(byCode["ok:transfer_in"]).toBe(true);
    expect(byCode["ok:transfer_out"]).toBe(true);
    expect(byCode["trade_type_unknown:unknown"]).toBe(true);
    expect(byCode["trade_outside_requested_window:buy"]).toBe(true);
    expect(byCode["amount_unreadable:buy"]).toBe(true);
    expect(result.tradesDuplicatesCollapsed).toBe(1);
    expect(result.rejected.map((row) => row.code)).toEqual(["network_mismatch", "contract_invalid_for_network"]);
    expect(result.status).toBe("divergent");
  });

  test("acquisitions are sums over what was OBSERVED in the window, never a cost basis", () => {
    const result = section(tradesInput([trade(1), trade(2, { valueUsd: "50", amount: "1" }), trade(3, { type: "2", valueUsd: "30", amount: "1" }), trade(4, { type: "3", valueUsd: "0", amount: "4" })]));
    expect(result.acquisitions).toHaveLength(1);
    expect(result.acquisitions[0]).toMatchObject({
      buyCount: 2, buyAmountText: "3", buyValueUsdText: "150",
      sellCount: 1, sellAmountText: "1", sellValueUsdText: "30",
      transferInCount: 1, transferInAmountText: "4",
      coverage: "partial_window",
    });
    expect(result.acquisitions[0]!.identity.key).toBe(KEY_A);
    expect(result.acquisitions[0]!.state).toEqual({ kind: "unverified", code: "observed_window_only" });
    const evidence = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: null, addressAnalysis: result });
    expect(evidence.costBasis).toEqual([]);
  });

  test("the window is partial by construction: a cap or a truncated walk says so", () => {
    const capped = section(tradesInput([trade(1)], { truncated: true, stopReason: "max_pages" }));
    expect(capped.coverage.truncated).toBe(true);
    expect(capped.issues.some((issue) => issue.code === "dex_history_truncated")).toBe(true);
    expect(capped.status).toBe("incomplete");
    expect(section(tradesInput([trade(1)])).issues.some((issue) => issue.code === "dex_history_window_only")).toBe(true);
  });

  test("trades never change the net worth (A3 holds for this family too)", () => {
    const balances = buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow()], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000 });
    const withTrades = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances, addressAnalysis: section({ ...tradesInput([trade(1, { valueUsd: "999999999", pnlUsd: "888888888" })]), tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ totalPnlUsd: "777777777" }) }] }) });
    expect(withTrades.netWorth.valueText).toBe("10");
  });

  test("a net buy in the window with a zero active balance needs reconciliation", () => {
    const zero = buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow({ balance: "0", rawBalance: "0" })], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000 });
    const evidence = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: zero, addressAnalysis: section(tradesInput([trade(1), trade(2, { type: "2", amount: "1" })])) });
    const rc2 = evidence.reconciliation.findings.find((item) => item.rule === "RC2")!;
    expect(rc2).toMatchObject({ code: "historical_quantity_active_zero", detail: { signal: "dex_history_window_net_buy" } });
    expect(evidence.status).toBe("unreconciled");
    const flat = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: zero, addressAnalysis: section(tradesInput([trade(1), trade(2, { type: "2", amount: "2" })])) });
    expect(flat.reconciliation.findings.filter((item) => item.rule === "RC2")).toEqual([]);
  });

  test("a provider PnL inconsistency becomes a PN finding", () => {
    const evidence = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: null, addressAnalysis: section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw() }] }) });
    expect(evidence.reconciliation.findings.find((item) => item.rule === "PN")).toMatchObject({ code: "pnl_total_differs_from_parts", state: { kind: "divergent" } });
  });
});

describe("supported chains of the portfolio family", () => {
  test("the reader returns the listed chain indexes, deduplicated, and rejects garbage", async () => {
    const { http, fake } = makeStack([{ body: envelope([{ chainIndex: "1", chainName: "Ethereum" }, { chainIndex: "501" }, { chainIndex: "1" }]) }, { body: envelope([{ chainIndex: { evil: true } }]) }, { body: envelope("x") }]);
    const read = await readPortfolioSupportedChains(http);
    expect(fake.calls[0]!.path).toBe(SUPPORT_PATH);
    expect(read.value).toEqual(["1", "501"]);
    await expect(readPortfolioSupportedChains(http)).rejects.toBeInstanceOf(OnchainosError);
    await expect(readPortfolioSupportedChains(http)).rejects.toBeInstanceOf(OnchainosError);
  });

  test("the section records whether the requested chain is listed; a list is not proof of absence", () => {
    expect(section({ supportedChains: ["1", "501"] }).portfolioSupport).toEqual({ listedChains: ["1", "501"], requestedChainListed: true });
    expect(section({ supportedChains: ["501"] }).portfolioSupport).toEqual({ listedChains: ["501"], requestedChainListed: false });
    expect(section({ supportedChains: null }).portfolioSupport).toEqual({ listedChains: null, requestedChainListed: null });
    expect(section({ supportedChains: ["501"] }).issues.some((issue) => issue.code === "chain_not_listed_as_supported")).toBe(true);
  });
});

describe("the collector wires the whole family", () => {
  const rowA = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "2.5", rawBalance: "2500000", tokenPrice: "4", isRiskToken: false };
  const router = (routes: Record<string, FakeReply | ((call: FakeCall) => FakeReply)>) => (call: FakeCall): FakeReply => {
    const route = routes[call.path];
    if (route === undefined) return { status: 404, body: "" };
    return typeof route === "function" ? route(call) : route;
  };
  const routes = (listed: string[] = ["1", "501"]) => router({
    [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) },
    [SUPPORT_PATH]: { body: envelope(listed.map((chainIndex) => ({ chainIndex }))) },
    [OVERVIEW_PATH]: { body: envelope({ realizedPnlUsd: "5" }) },
    [RECENT_PATH]: { body: envelope({ cursor: "", pnlList: [] }) },
    [LATEST_PATH]: { body: envelope(latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60" })) },
    [DEX_PATH]: (call) => ({ body: envelope({ cursor: "", transactionList: [{ type: "1", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", valueUsd: "100", amount: "2", price: "50", marketCap: "1", pnlUsd: "0", time: String(call.atMs - 3_600_000) }] }) }),
  });
  const request = (extra: Partial<NonNullable<Exclude<CollectRequest["addressAnalysis"], false>>> = {}): CollectRequest => ({
    address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1", totalValue: false, market: false,
    addressAnalysis: { chains: ["1"], tokens: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }], dexHistory: { days: 30 }, supportCheck: true, ...extra },
  });

  test("support check, overview, recent PnL, latest PnL and DEX history, in that order, into one section", async () => {
    const { http, fake, clock } = makeStack(routes());
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request(), { origin: "synthetic_fixture" });
    expect(fake.calls.map((call) => call.path)).toEqual([BALANCES_PATH, SUPPORT_PATH, OVERVIEW_PATH, RECENT_PATH, LATEST_PATH, DEX_PATH]);
    const analysis = outcome.evidence.addressAnalysis!;
    expect(analysis.portfolioSupport).toEqual({ listedChains: ["1", "501"], requestedChainListed: true });
    expect(analysis.tokenPnlChecks[0]!.state.kind).toBe("ok");
    expect(analysis.trades).toHaveLength(1);
    expect(analysis.acquisitions[0]).toMatchObject({ buyCount: 1, buyValueUsdText: "100", coverage: "partial_window" });
    const begin = Number(new URLSearchParams(fake.calls.at(-1)!.query).get("begin"));
    const end = Number(new URLSearchParams(fake.calls.at(-1)!.query).get("end"));
    expect(end - begin).toBe(30 * DAY);
    expect(outcome.evidence.netWorth.valueText).toBe("10");
    expect(outcome.evidence.costBasis).toEqual([]);
  });

  test("a chain the support list does not carry is skipped and said so, not queried", async () => {
    const { http, fake, clock } = makeStack(routes(["501"]));
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request(), { origin: "synthetic_fixture" });
    expect(fake.calls.map((call) => call.path)).toEqual([BALANCES_PATH, SUPPORT_PATH]);
    expect(outcome.evidence.collection?.skipped).toContainEqual({ what: "portfolio.1", reason: "chain_not_listed_as_supported" });
    expect(outcome.evidence.addressAnalysis).toBeNull();
    expect(outcome.evidence.status).not.toBe("valid");
  });

  test("without the opt-ins none of the new endpoints is called", async () => {
    const { http, fake, clock } = makeStack(routes());
    await collectWalletEvidence({ http, now: clock.now }, { ...request(), addressAnalysis: { chains: ["1"] } }, { origin: "synthetic_fixture" });
    expect(fake.calls.map((call) => call.path)).toEqual([BALANCES_PATH, OVERVIEW_PATH, RECENT_PATH]);
  });

  test("the per-token cap limits the latest PnL calls and says what was left out", async () => {
    const { http, fake, clock } = makeStack(routes());
    const tokens = [FIXTURE_TOKEN_A, FIXTURE_TOKEN_B].map((tokenContractAddress) => ({ chainIndex: "1", tokenContractAddress }));
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request({ tokens, dexHistory: undefined, supportCheck: false }), { origin: "synthetic_fixture", perTokenCap: 1 });
    expect(fake.calls.filter((call) => call.path === LATEST_PATH)).toHaveLength(1);
    expect(outcome.evidence.collection?.skipped).toContainEqual({ what: "portfolio.latestPnl", reason: "only_first_1_tokens_read" });
  });

  test("a failing latest PnL read is an error of the section and does not take the others down", async () => {
    const { http, clock } = makeStack(router({ ...{}, [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) }, [OVERVIEW_PATH]: { body: envelope({ realizedPnlUsd: "5" }) }, [RECENT_PATH]: { body: envelope({ cursor: "", pnlList: [] }) }, [LATEST_PATH]: { body: envelope([], "51000", "bad") } }));
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request({ dexHistory: undefined, supportCheck: false }), { origin: "synthetic_fixture" });
    expect(outcome.evidence.collection?.errors).toEqual([{ section: "addressAnalysis", code: "api_error_51000", httpStatus: 200, apiCode: "51000" }]);
    expect(outcome.evidence.addressAnalysis).not.toBeNull();
  });

  test("the plan counts the new calls", () => {
    const plan = planCalls(request({ chains: ["1", "56"] }), { maxPagesPerEndpoint: 3, perTokenCap: 5 });
    const byWhat = Object.fromEntries(plan.map((item) => [item.what, item.max]));
    expect(byWhat["portfolio.supportedChain"]).toBe(1);
    expect(byWhat["portfolio.latestPnl"]).toBe(2);
    expect(byWhat["portfolio.dexHistory"]).toBe(6);
  });
});

describe("the command line", () => {
  function io(overrides: Partial<CliIo> = {}) {
    const clock = makeClock();
    const out: string[] = [];
    const err: string[] = [];
    const fake = makeFakeFetch(() => ({ status: 404, body: "" }), clock);
    const base: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line), err: (line) => err.push(line), fs: makeMemoryFs() };
    return { io: { ...base, ...overrides }, out, err };
  }
  test("plan lists the family and accepts the new options; bad values are a usage error", async () => {
    const { io: cli, out } = io();
    const args = ["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--pnl-chains", "1", "--pnl-tokens", `1:${FIXTURE_TOKEN_A}`, "--dex-history", "--dex-days", "30", "--support-check"];
    expect(await runCli(args, cli)).toBe(0);
    const text = out.join("\n");
    for (const id of ["portfolio.supportedChain", "portfolio.latestPnl", "portfolio.dexHistory"]) expect(text).toContain(id);
    expect(text).toContain("GET /api/v6/dex/market/portfolio/dex-history");
    for (const bad of [["--pnl-tokens", "garbage"], ["--dex-days", "0"], ["--dex-days", "x"], ["--dex-days", "9999"]]) {
      const run = io();
      expect(await runCli(["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--pnl-chains", "1", ...bad], run.io)).toBe(2);
    }
  });
});

describe("a request option set to undefined is the same as an omitted one", () => {
  test("the fingerprint does not break and does not change", async () => {
    const { requestFingerprint } = await import("./collector.ts");
    const base: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], addressAnalysis: { chains: ["1"] } };
    const withUndefined: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], addressAnalysis: { chains: ["1"], tokens: undefined, dexHistory: undefined, supportCheck: undefined }, history: undefined };
    expect(requestFingerprint(withUndefined, { origin: "synthetic_fixture" })).toBe(requestFingerprint(base, { origin: "synthetic_fixture" }));
  });
});

describe("boundaries and gaps found by the mutation campaign of this family", () => {
  test("the provider's PnL consistency tolerance: exactly 0.01 USD is rounding, 0.02 is a gap", () => {
    const at = (total: string) => section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ totalPnlUsd: total, realizedPnlUsd: "40", unrealizedPnlUsd: "60" }) }] }).tokenPnlChecks[0]!;
    expect(at("100.01").state.kind).toBe("ok");
    expect(at("99.99").state.kind).toBe("ok");
    expect(at("100.02").state).toEqual({ kind: "divergent", code: "pnl_total_differs_from_parts" });
    expect(at("99.98").deltaText).toBe("-0.02");
  });

  test("a trade whose USD value cannot be read is not trusted and is left out of the sums", () => {
    const result = section(tradesInput([trade(1), trade(2, { valueUsd: "abc" }), trade(3, { valueUsd: undefined })]));
    expect(result.trades.map((item) => item.state.code).sort()).toEqual(["ok", "value_unreadable", "value_unreadable"]);
    expect(result.acquisitions[0]).toMatchObject({ buyCount: 1, buyValueUsdText: "100", buyAmountText: "2" });
  });

  test("an asset the DEX history says was bought but the balances did not return becomes an expectation, never a zero", async () => {
    const rowOther = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, address: FIXTURE_ACCOUNT, symbol: "FIXB", balance: "1", rawBalance: "1000000", tokenPrice: "1", isRiskToken: false };
    const { http, clock } = makeStack((call: FakeCall): FakeReply => {
      if (call.path === BALANCES_PATH) return { body: envelope([{ tokenAssets: [rowOther] }]) };
      if (call.path === OVERVIEW_PATH) return { body: envelope({ realizedPnlUsd: "0" }) };
      if (call.path === RECENT_PATH) return { body: envelope({ cursor: "", pnlList: [] }) };
      if (call.path === DEX_PATH) return { body: envelope({ cursor: "", transactionList: [{ type: "1", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", valueUsd: "100", amount: "2", price: "50", marketCap: "1", pnlUsd: "0", time: String(call.atMs - 3_600_000) }] }) };
      return { status: 404, body: "" };
    });
    const request: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "0", totalValue: false, market: false, addressAnalysis: { chains: ["1"], dexHistory: { days: 7 } } };
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, { origin: "synthetic_fixture" });
    const missing = outcome.evidence.balances!.positions.find((item) => item.identity.key === KEY_A)!;
    expect(missing.origin).toBe("expected_not_returned");
    expect(missing.quantity.state.kind).toBe("omitted_by_filter");
    expect(missing.quantity.atoms).toBeNull();
    expect(outcome.evidence.reconciliation.findings.find((item) => item.rule === "RC2")).toMatchObject({ code: "historical_quantity_active_unknown", detail: { signal: "dex_history_window_net_buy" } });
    expect(outcome.evidence.netWorth.valueText).toBe("1");
  });

  test("the extra Address Analysis options need --pnl-chains", async () => {
    for (const extra of [["--dex-history"], ["--support-check"], ["--pnl-tokens", `1:${FIXTURE_TOKEN_A}`], ["--dex-days", "30", "--dex-history"]]) {
      const clock = makeClock();
      const err: string[] = [];
      const fake = makeFakeFetch(() => ({ status: 404, body: "" }), clock);
      const cli: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: () => undefined, err: (line) => err.push(line), fs: makeMemoryFs() };
      expect(await runCli(["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", ...extra], cli)).toBe(2);
      expect(err.join(" ")).toContain("--pnl-chains");
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Third review (layer 3 = the family above). Findings F1..F10 of that review, then the tests for its surviving mutants.
// ---------------------------------------------------------------------------------------------------------------------

describe("third review F1 a provider type that names an object property is not a trade kind", () => {
  test("constructor, toString, valueOf, hasOwnProperty and __proto__ are unknown kinds and the evidence still builds", () => {
    for (const type of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "prototype"]) {
      const result = section(tradesInput([trade(1, { type })]));
      expect(result.trades[0]!.kind).toBe("unknown");
      expect(result.trades[0]!.state.code).toBe("trade_type_unknown");
      expect(() => buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: null, addressAnalysis: result })).not.toThrow();
    }
  });
});

describe("third review F2 provider values that cannot be hashed never throw out of a builder", () => {
  const nested = (depth: number): unknown => (depth === 0 ? "x" : [nested(depth - 1)]);

  test("a non finite number or a deeply nested value in a trade is an unreadable field", () => {
    const result = section(tradesInput([
      trade(1, { amount: Infinity as unknown as string }),
      trade(2, { price: nested(60) as string }),
      trade(3, { time: { a: 1 } as unknown as string }),
      trade(4, { type: ["1"] as unknown as string }),
    ]));
    // amount, time and type are unreadable in three of them; an unreadable price alone leaves a trade readable (price is not summed)
    expect(result.trades.filter((item) => item.state.kind !== "ok")).toHaveLength(3);
    expect(result.trades.find((item) => item.priceText === null && item.state.kind === "ok")).toBeDefined();
    expect(() => buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: null, addressAnalysis: result })).not.toThrow();
  });

  test("the same holds for the on-chain history builder", async () => {
    const { buildHistorySection } = await import("./history.ts");
    const { historyRow } = await import("./fixtures.ts");
    const built = () => buildHistorySection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [historyRow({ nonce: Infinity as never, methodId: nested(60) as never, amount: "1" })], source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: 60_000, requestedFromMs: null, requestedToMs: null, pagesRead: 1, truncated: false, stopReason: "exhausted" });
    expect(built).not.toThrow();
    expect(built().entries).toHaveLength(1);
  });

  test("through the collector: a raw 1e999 in a provider body does not abort a paid refresh", async () => {
    const body = '{"code":"0","msg":"","data":{"cursor":"","transactionList":[{"type":"1","chainIndex":"1","tokenContractAddress":"' + FIXTURE_TOKEN_A + '","tokenSymbol":"X","valueUsd":"1","amount":1e999,"price":"1","marketCap":"1","pnlUsd":"0","time":1e999}]}}';
    const { http, clock } = makeStack((call: FakeCall): FakeReply => {
      if (call.path === BALANCES_PATH) return { body: envelope([{ tokenAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "1", rawBalance: "1000000", tokenPrice: "1", isRiskToken: false }] }]) };
      if (call.path === OVERVIEW_PATH) return { body: envelope({ realizedPnlUsd: "0" }) };
      if (call.path === RECENT_PATH) return { body: envelope({ cursor: "", pnlList: [] }) };
      if (call.path === DEX_PATH) return { body };
      return { status: 404, body: "" };
    });
    const request: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1", totalValue: false, market: false, addressAnalysis: { chains: ["1"], dexHistory: { days: 7 } } };
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, { origin: "synthetic_fixture" });
    expect(outcome.evidence.addressAnalysis?.trades[0]?.state.kind).toBe("unverified");
  });
});

describe("third review F3 provider PnL findings never change the status of the net worth", () => {
  const cleanBalances = () => buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow()], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000 });
  const withAnalysis = (extra: Partial<AddressAnalysisBuildInput>) => buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: cleanBalances(), addressAnalysis: section(extra) });

  test("the provider's own inconsistent example degrades the overall evidence, not the net worth", () => {
    const result = withAnalysis({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw() }] });
    expect(result.netWorth.valueText).toBe("10");
    expect(result.netWorth.status).toBe("valid");
    expect(result.reconciliation.balanceStatus).toBe("valid");
    expect(result.reconciliation.status).toBe("divergent");
    expect(result.status).toBe("divergent");
  });

  test("an unsupported token or rejected family rows do not touch it either", () => {
    const unsupported = withAnalysis({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ isPnlSupported: false }) }] });
    expect(unsupported.netWorth.status).toBe("valid");
    expect(unsupported.status).not.toBe("valid");
    const rejected = withAnalysis({ ...tradesInput([trade(1, { chainIndex: "56" })]) });
    expect(rejected.netWorth.status).toBe("valid");
    expect(rejected.status).toBe("divergent");
  });

  test("a balance problem still degrades the net worth", () => {
    const zero = buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow({ balance: "0", rawBalance: "0" })], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000 });
    const result = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: zero, addressAnalysis: section(tradesInput([trade(1)])) });
    expect(result.reconciliation.balanceStatus).toBe("unreconciled");
    expect(result.netWorth.status).toBe("unreconciled");
  });
});

describe("third review F4 and F5 the provider's record ceiling and its cursor", () => {
  const dexPage = (n: number, last: boolean) => ({ body: envelope({ cursor: last ? "" : `c${n}`, transactionList: Array.from({ length: 100 }, (_, i) => ({ type: "1", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", valueUsd: "1", amount: "1", price: "1", marketCap: "1", pnlUsd: "0", time: String(NOW - (n * 100 + i) * 1000) })) }) });
  const pnlPage = (n: number, last: boolean) => ({ body: envelope({ cursor: last ? "" : `c${n}`, pnlList: Array.from({ length: 100 }, () => ({ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A })) }) });

  test("1000 DEX trades with a final empty cursor are still a possibly cut window", async () => {
    const full = makeStack((_call, index) => dexPage(index, index === 9));
    const read = await readDexHistory(full.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - 30 * DAY, endMs: NOW, maxPages: 10 });
    expect(read.rows).toHaveLength(1000);
    expect(read).toMatchObject({ truncated: true, stopReason: "provider_record_ceiling" });
    const short = makeStack((_call, index) => dexPage(index, index === 8));
    const shortRead = await readDexHistory(short.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - 30 * DAY, endMs: NOW, maxPages: 10 });
    expect(shortRead.rows).toHaveLength(900);
    expect(shortRead).toMatchObject({ truncated: false, stopReason: "exhausted" });
  });

  test("the same ceiling applies to the recent PnL list", async () => {
    const { readRecentPnl } = await import("./adapters/okx-read.ts");
    const full = makeStack((_call, index) => pnlPage(index, index === 9));
    const read = await readRecentPnl(full.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, maxPages: 10 });
    expect(read).toMatchObject({ truncated: true, stopReason: "provider_record_ceiling" });
  });

  test("a section built from a ceiling walk is incomplete", () => {
    const result = section(tradesInput([trade(1)], { truncated: true, stopReason: "provider_record_ceiling" }));
    expect(result.status).toBe("incomplete");
    expect(result.coverage.stopReason).toBe("dex_history:provider_record_ceiling");
  });

  test("a cursor that is not a string fails closed in every paged reader", async () => {
    const { readRecentPnl, readTransactions } = await import("./adapters/okx-read.ts");
    for (const cursor of [12345, { next: 1 }, true]) {
      await expect(readDexHistory(makeStack([{ body: envelope({ cursor, transactionList: [] }) }]).http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 2 })).rejects.toBeInstanceOf(OnchainosError);
      await expect(readRecentPnl(makeStack([{ body: envelope({ cursor, pnlList: [] }) }]).http, { chainIndex: "1", address: FIXTURE_ACCOUNT, maxPages: 2 })).rejects.toBeInstanceOf(OnchainosError);
      await expect(readTransactions(makeStack([{ body: envelope([{ cursor, transactionList: [] }]) }]).http, { address: FIXTURE_ACCOUNT, chains: ["1"], maxPages: 2 })).rejects.toBeInstanceOf(OnchainosError);
    }
    const ok = await readDexHistory(makeStack([{ body: envelope({ transactionList: [] }) }]).http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 2 });
    expect(ok.stopReason).toBe("exhausted");
  });
});

describe("third review F6 the DEX net buy signal only fires when it is sound", () => {
  const zeroBalances = (fetchedAtMs = NOW - 1000) => buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow({ balance: "0", rawBalance: "0" })], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000 });
  const rc2 = (rows: RawDexTrade[], fetchedAtMs?: number) => buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: zeroBalances(fetchedAtMs), addressAnalysis: section(tradesInput(rows)) }).reconciliation.findings.filter((item) => item.rule === "RC2");

  test("an asset with a trade that cannot be read has an unknown net position, not a positive one", () => {
    expect(rc2([trade(1), trade(2, { type: "2", amount: "2", valueUsd: "" })])).toEqual([]);
    expect(rc2([trade(1), trade(2, { type: "2", amount: "2", time: "abc" })])).toEqual([]);
    expect(rc2([trade(1), trade(2, { type: "9", amount: "2" })])).toEqual([]);
  });

  test("a trade made after the balances were read cannot explain a zero balance", () => {
    const balancesAt = NOW - 10 * 3_600_000;
    expect(rc2([trade(1)], balancesAt)).toEqual([]);
    expect(rc2([trade(11)], balancesAt)).toHaveLength(1);
  });

  test("transfers in count, transfers out and sells subtract", () => {
    expect(rc2([trade(1, { type: "3", amount: "4" })])).toHaveLength(1);
    expect(rc2([trade(1, { type: "3", amount: "4" }), trade(2, { type: "4", amount: "4" })])).toEqual([]);
    expect(rc2([trade(1, { type: "3", amount: "4" }), trade(2, { type: "2", amount: "5" })])).toEqual([]);
  });

  test("the same holds for the on-chain history signal", async () => {
    const { buildHistorySection, netInflowByAsset } = await import("./history.ts");
    const { historyRow } = await import("./fixtures.ts");
    const history = buildHistorySection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [historyRow({ txTime: String(NOW - 500) })], source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: 60_000, requestedFromMs: null, requestedToMs: null, pagesRead: 1, truncated: false, stopReason: "exhausted" });
    expect(netInflowByAsset(history, NOW - 1000).size).toBe(0);
    expect(netInflowByAsset(history, NOW).size).toBe(1);
    const evidence = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: zeroBalances(), history });
    expect(evidence.reconciliation.findings.filter((item) => item.rule === "RC2")).toEqual([]);
  });
});

describe("third review F7 to F10", () => {
  test("F7: collapsed duplicate fills are said, make the sums possibly low and the section incomplete; excluded trades are counted", () => {
    const result = section(tradesInput([trade(1), trade(1, { locator: "/dup" }), trade(2, { valueUsd: "x" }), trade(3, { valueUsd: "50", amount: "1" })]));
    expect(result.tradesDuplicatesCollapsed).toBe(1);
    expect(result.issues.some((issue) => issue.code === "dex_trades_collapsed")).toBe(true);
    expect(result.status).toBe("incomplete");
    expect(result.acquisitions[0]).toMatchObject({ buyCount: 2, excludedTradeCount: 1 });
  });

  test("F8: a repeated token in the request is read once and is not a provider fault; a token outside the pnl chains is said", async () => {
    const routes = (call: FakeCall): FakeReply => {
      if (call.path === BALANCES_PATH) return { body: envelope([{ tokenAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "1", rawBalance: "1000000", tokenPrice: "1", isRiskToken: false }] }]) };
      if (call.path === OVERVIEW_PATH) return { body: envelope({ realizedPnlUsd: "0" }) };
      if (call.path === RECENT_PATH) return { body: envelope({ cursor: "", pnlList: [] }) };
      if (call.path === LATEST_PATH) return { body: envelope(latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60" })) };
      return { status: 404, body: "" };
    };
    const { http, fake, clock } = makeStack(routes);
    const token = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A };
    const request: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1", totalValue: false, market: false, addressAnalysis: { chains: ["1"], tokens: [token, { ...token, tokenContractAddress: FIXTURE_TOKEN_A.toUpperCase().replace("0X", "0x") }, { chainIndex: "56", tokenContractAddress: FIXTURE_TOKEN_A }] } };
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, { origin: "synthetic_fixture" });
    expect(fake.calls.filter((call) => call.path === LATEST_PATH)).toHaveLength(1);
    expect(outcome.evidence.collection?.errors).toEqual([]);
    expect(outcome.evidence.addressAnalysis?.rejected).toEqual([]);
    expect(outcome.evidence.collection?.skipped).toContainEqual({ what: "portfolio.latestPnl", reason: "token_chain_not_in_pnl_chains" });
  });

  test("F8: --dex-days without --dex-history is a usage error", async () => {
    const clock = makeClock();
    const err: string[] = [];
    const fake = makeFakeFetch(() => ({ status: 404, body: "" }), clock);
    const cli: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: () => undefined, err: (line) => err.push(line), fs: makeMemoryFs() };
    expect(await runCli(["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--pnl-chains", "1", "--dex-days", "30"], cli)).toBe(2);
    expect(err.join(" ")).toContain("--dex-history");
  });

  test("F9: a section where nothing came back is incomplete, not valid", () => {
    const empty = section({});
    expect(empty.coverage.observed).toEqual([]);
    expect(empty.status).toBe("incomplete");
    expect(section(tradesInput([])).status).toBe("incomplete");
    expect(section({ overview: { realizedPnlUsd: "1" } }).status).toBe("valid");
  });

  test("F10: required fields were added, so the schema name changed and the old one is refused", () => {
    const result = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: null });
    expect(result.schema).toBe("wallet_evidence_v2");
  });
});

describe("third review: tests for the logic its surviving mutants showed unpinned", () => {
  const check = (extra: Partial<RawLatestPnl>) => section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60", ...extra }) }] }).tokenPnlChecks[0]!;

  test("PN check: the gap is symmetric, negative figures work, and an unreadable support flag fails closed", () => {
    expect(check({ totalPnlUsd: "99.5" }).state.kind).toBe("divergent");
    expect(check({ totalPnlUsd: "100.5" }).state.kind).toBe("divergent");
    expect(check({ totalPnlUsd: "-50", realizedPnlUsd: "-30", unrealizedPnlUsd: "-20" })).toMatchObject({ totalText: "-50", partsSumText: "-50", deltaText: "0", state: { kind: "ok" } });
    expect(check({ isPnlSupported: "false" })).toMatchObject({ supported: null, state: { kind: "unverified", code: "pnl_support_flag_unreadable" } });
    expect(check({ isPnlSupported: undefined }).state.code).toBe("pnl_support_flag_unreadable");
    expect(check({ isPnlSupported: true }).state.kind).toBe("ok");
    expect(check({ isPnlSupported: false }).state.code).toBe("pnl_not_supported_for_token");
  });

  test("PN check: a repeated token is rejected as a duplicate", () => {
    const token = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A };
    const result = section({ tokenPnl: [{ token, raw: latestRaw() }, { token, raw: latestRaw() }] });
    expect(result.tokenPnlChecks).toHaveLength(1);
    expect(result.rejected.map((row) => row.code)).toEqual(["duplicate_identity"]);
  });

  test("window edges: begin and end are inside, one tolerance more is outside", () => {
    const at = (timeMs: number) => section(tradesInput([trade(1, { time: String(timeMs) })])).trades[0]!.state.code;
    const begin = NOW - 30 * DAY;
    expect(at(begin)).toBe("ok");
    expect(at(begin - 1)).toBe("trade_outside_requested_window");
    expect(at(NOW)).toBe("ok");
    expect(at(NOW + 5_000)).toBe("ok");
    expect(at(NOW + 5_001)).toBe("trade_outside_requested_window");
  });

  test("trade identity: trades that differ in any field are different trades", () => {
    const base = trade(1);
    const variants = [{ type: "2" }, { time: String(NOW - 7_200_000 - 1) }, { amount: "3" }, { valueUsd: "101" }, { price: "51" }, { tokenContractAddress: FIXTURE_TOKEN_B }];
    const result = section(tradesInput([base, ...variants.map((extra, index) => trade(1, { locator: `/v${index}`, ...extra }))]));
    expect(result.tradesDuplicatesCollapsed).toBe(0);
    expect(result.trades).toHaveLength(1 + variants.length);
    expect(new Set(result.trades.map((item) => item.tradeId)).size).toBe(1 + variants.length);
  });

  test("order and coverage: newest trade first, assets sorted, pages and stop reason combined", () => {
    const result = section({ ...tradesInput([trade(3), trade(1), trade(2), trade(1, { tokenContractAddress: FIXTURE_TOKEN_B, locator: "/b" })], { pagesRead: 4, truncated: true, stopReason: "max_pages" }), pagesRead: 2 });
    expect(result.trades.map((item) => item.timeMs)).toEqual([NOW - 3_600_000, NOW - 3_600_000, NOW - 2 * 3_600_000, NOW - 3 * 3_600_000]);
    expect(result.acquisitions.map((item) => item.identity.key)).toEqual([KEY_A, `1:contract:${FIXTURE_TOKEN_B}`].sort());
    expect(result.coverage).toMatchObject({ requested: ["1"], observed: ["1"], notReported: [], pagesRead: 6, truncated: true, stopReason: "dex_history:max_pages", status: "partial" });
    const recentCut = section({ ...tradesInput([trade(1)], { truncated: true, stopReason: "max_pages" }), truncated: true, stopReason: "repeated_cursor" });
    expect(recentCut.coverage.stopReason).toBe("repeated_cursor");
    expect(section({}).coverage).toMatchObject({ observed: [], notReported: ["1"], truncated: false });
  });

  test("a transfer in is counted in its own bucket and a non ok trade is never summed", () => {
    const result = section(tradesInput([trade(1, { type: "3", amount: "4", valueUsd: "0" }), trade(2, { type: "4", amount: "1", valueUsd: "0" }), trade(3, { amount: "x" })]));
    expect(result.acquisitions[0]).toMatchObject({ buyCount: 0, buyAmountText: null, transferInCount: 1, transferInAmountText: "4", transferOutCount: 1, transferOutAmountText: "1", excludedTradeCount: 1 });
  });

  test("the support list is copied and compared exactly", () => {
    const list = ["1"];
    const result = section({ supportedChains: list });
    list.push("56");
    expect(result.portfolioSupport.listedChains).toEqual(["1"]);
    expect(section({ supportedChains: [] }).portfolioSupport).toEqual({ listedChains: [], requestedChainListed: false });
  });
});

describe("third review: the request fingerprint and the command line are pinned", () => {
  test("every request field changes the fingerprint", async () => {
    const { requestFingerprint } = await import("./collector.ts");
    const base: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"] };
    const fp = (request: CollectRequest, origin: "synthetic_fixture" | "okx_web3_api" = "synthetic_fixture") => requestFingerprint(request, { origin });
    const reference = fp(base);
    const variants: CollectRequest[] = [
      { ...base, chains: ["1", "8453"] },
      { ...base, excludeRiskToken: "1" },
      { ...base, totalValue: false },
      { ...base, totalAssetType: "all" },
      { ...base, history: {} },
      { ...base, history: { beginMs: NOW - DAY, endMs: NOW } },
      { ...base, addressAnalysis: { chains: ["1"] } },
      { ...base, addressAnalysis: { chains: ["1"], supportCheck: true } },
      { ...base, addressAnalysis: { chains: ["1"], dexHistory: { days: 7 } } },
      { ...base, addressAnalysis: { chains: ["1"], tokens: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }] } },
      { ...base, market: false },
      { ...base, market: { liquidity: true } },
      { ...base, riskProbe: true },
      { ...base, expectedAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }] },
      { ...base, address: "0x00000000000000000000000000000000000f9999" },
    ];
    for (const variant of variants) expect(fp(variant)).not.toBe(reference);
    expect(fp(base, "okx_web3_api")).not.toBe(reference);
    expect(new Set(variants.map((variant) => fp(variant))).size).toBe(variants.length);
    expect(fp({ ...base, chains: ["1"] })).toBe(reference);
  });

  test("plan: the new calls appear only when their options are given", async () => {
    const run = async (extra: string[]) => {
      const clock = makeClock();
      const out: string[] = [];
      const fake = makeFakeFetch(() => ({ status: 404, body: "" }), clock);
      const cli: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line.trim()), err: () => undefined, fs: makeMemoryFs() };
      expect(await runCli(["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", ...extra], cli)).toBe(0);
      return out.filter((line) => /: ate \d+ chamada/.test(line));
    };
    expect((await run([])).some((line) => line.startsWith("portfolio."))).toBe(false);
    const plain = await run(["--pnl-chains", "1"]);
    expect(plain).toContain("portfolio.overview: ate 1 chamada(s)");
    expect(plain.some((line) => /latestPnl|dexHistory|supportedChain/.test(line))).toBe(false);
    const full = await run(["--pnl-chains", "1", "--pnl-tokens", `1:${FIXTURE_TOKEN_A},1:${FIXTURE_TOKEN_B}`, "--dex-history", "--support-check"]);
    expect(full).toContain("portfolio.supportedChain: ate 1 chamada(s)");
    expect(full).toContain("portfolio.latestPnl: ate 2 chamada(s)");
    expect(full).toContain("portfolio.dexHistory: ate 3 chamada(s)");
  });

  test("the CLI maps its options into the request that is actually sent", async () => {
    const clock = makeClock();
    const out: string[] = [];
    const fake = makeFakeFetch((call: FakeCall): FakeReply => {
      if (call.path === BALANCES_PATH) return { body: envelope([{ tokenAssets: [] }]) };
      if (call.path === SUPPORT_PATH) return { body: envelope([{ chainIndex: "1" }]) };
      if (call.path === OVERVIEW_PATH) return { body: envelope({ realizedPnlUsd: "0" }) };
      if (call.path === RECENT_PATH) return { body: envelope({ cursor: "", pnlList: [] }) };
      if (call.path === LATEST_PATH) return { body: envelope(latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60" })) };
      if (call.path === DEX_PATH) return { body: envelope({ cursor: "", transactionList: [] }) };
      return { status: 404, body: "" };
    }, clock);
    const cli: CliIo = { env: { OKX_WEB3_API_KEY: "k", OKX_WEB3_API_SECRET: "s", OKX_WEB3_API_PASSPHRASE: "p" }, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line), err: () => undefined, fs: makeMemoryFs() };
    await runCli(["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--live", "--credentials-from-env", "--allow-network", "--no-total", "--no-market", "--risk-filter", "1", "--pnl-chains", "1", "--pnl-tokens", `1:${FIXTURE_TOKEN_A}`, "--dex-history", "--dex-days", "7", "--support-check"], cli);
    expect(fake.calls.map((call) => call.path)).toEqual([BALANCES_PATH, SUPPORT_PATH, OVERVIEW_PATH, RECENT_PATH, LATEST_PATH, DEX_PATH]);
    const query = new URLSearchParams(fake.calls.at(-1)!.query);
    expect(Number(query.get("end")) - Number(query.get("begin"))).toBe(7 * DAY);
    expect(new URLSearchParams(fake.calls[4]!.query).get("tokenContractAddress")).toBe(FIXTURE_TOKEN_A);
  });
});

describe("third review: reader parameters and report lines", () => {
  test("dex-history passes the optional token and the type filter, and refuses bad windows, tokens and caps", async () => {
    const dex = makeStack([{ body: envelope({ cursor: "", transactionList: [] }) }]);
    await readDexHistory(dex.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, types: "1", tokenContractAddress: FIXTURE_TOKEN_A, maxPages: 1 });
    const query = new URLSearchParams(dex.fake.calls[0]!.query);
    expect(query.get("tokenContractAddress")).toBe(FIXTURE_TOKEN_A);
    expect(query.get("type")).toBe("1");
    await expect(readDexHistory(dex.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, tokenContractAddress: "FixtureMint111111111111111111111111111111", maxPages: 1 })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readDexHistory(dex.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 11 })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readDexHistory(dex.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 0 })).rejects.toBeInstanceOf(OnchainosError);
    await expect(readDexHistory(dex.http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: 4_102_444_800_001, maxPages: 1 })).rejects.toBeInstanceOf(OnchainosError);
  });

  test("the support reader refuses a row it cannot read, and a long chain index", async () => {
    const bad = makeStack([{ body: envelope([{ chainIndex: "9".repeat(40) }]) }, { body: envelope([null]) }]);
    await expect(readPortfolioSupportedChains(bad.http)).rejects.toBeInstanceOf(OnchainosError);
    await expect(readPortfolioSupportedChains(bad.http)).rejects.toBeInstanceOf(OnchainosError);
  });

  test("the summary says what the family found, and what it is not", async () => {
    const { summarizeEvidence } = await import("./report.ts");
    const analysis = section({ ...tradesInput([trade(1)]), tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw() }], supportedChains: ["501"] });
    const text = summarizeEvidence(buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: null, addressAnalysis: analysis })).join("\n");
    expect(text).toContain("pnl_total_differs_from_parts");
    expect(text).toContain("1371.68");
    expect(text).toContain("nao e custo de aquisicao");
    expect(text).toContain("Rede nao listada pelo provedor");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Tests for the mutants of the third review that survived the first round of fixes (51 of 134). Each block names the mutant ids.
// ---------------------------------------------------------------------------------------------------------------------

describe("survivors: builder details (A12 A13 A15 A19 A20 A26 A29 A30 N06 N09 B02)", () => {
  test("A12: transfers in and transfers out are counted separately (asymmetric on purpose)", () => {
    const result = section(tradesInput([trade(1, { type: "3", amount: "2", valueUsd: "0" }), trade(2, { type: "3", amount: "3", valueUsd: "0" }), trade(3, { type: "4", amount: "1", valueUsd: "0" })]));
    expect(result.acquisitions[0]).toMatchObject({ transferInCount: 2, transferInAmountText: "5", transferOutCount: 1, transferOutAmountText: "1" });
  });

  test("A13: assets are listed by key, whatever order their trades arrive in", () => {
    const result = section(tradesInput([trade(1, { tokenContractAddress: FIXTURE_TOKEN_B }), trade(5)]));
    expect(result.acquisitions.map((item) => item.identity.key)).toEqual([KEY_A, `1:contract:${FIXTURE_TOKEN_B}`]);
  });

  test("A15: trades with the same time have a stable order, by trade id", () => {
    const result = section(tradesInput([trade(1, { amount: "3" }), trade(1, { amount: "4" }), trade(1, { amount: "5" })]));
    const ids = result.trades.map((item) => item.tradeId);
    expect(ids).toEqual([...ids].sort());
    expect(result.trades).toHaveLength(3);
  });

  test("A19: a latest PnL answer alone is an observation, so the section is not 'nothing returned'", () => {
    const result = section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60" }) }] });
    expect(result.coverage.observed).toEqual(["1"]);
    expect(result.issues.some((issue) => issue.code === "nothing_returned")).toBe(false);
    expect(result.status).toBe("valid");
  });

  test("A20 and A26: a trade that does not read cleanly makes the section incomplete or divergent", () => {
    expect(section(tradesInput([trade(1, { amount: "x" })])).status).toBe("incomplete");
    expect(section(tradesInput([trade(1, { time: "abc" })])).trades[0]!.state).toEqual({ kind: "unverified", code: "time_unverified" });
    expect(section(tradesInput([trade(1, { time: "abc" })])).status).toBe("incomplete");
    expect(section(tradesInput([trade(1, { time: String(NOW - 90 * DAY) })])).status).toBe("divergent");
  });

  test("A29, A30 and N09: price and PnL texts are kept only when they are numbers, PnL keeps its sign", () => {
    const result = section(tradesInput([trade(1, { price: "abc", pnlUsd: "-5.5" }), trade(2, { price: "50", pnlUsd: "oops" }), trade(3, { price: "50.25", pnlUsd: "12" })]));
    const by = (n: number) => result.trades.find((item) => item.timeMs === NOW - n * 3_600_000)!;
    expect(by(1)).toMatchObject({ priceText: null, pnlUsdText: "-5.5" });
    expect(by(2)).toMatchObject({ priceText: "50", pnlUsdText: null });
    expect(by(3)).toMatchObject({ priceText: "50.25", pnlUsdText: "12" });
  });

  test("N06: the observed window is the requested one", () => {
    const result = section(tradesInput([trade(1)]));
    expect(result.acquisitions[0]!.window).toEqual({ fromMs: NOW - 30 * DAY, toMs: NOW });
  });

  test("B02: when both safety fields are unreadable the risk flag is the reported reason", () => {
    const row = balanceRow({ isRiskToken: undefined, address: undefined });
    const result = buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [row], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000 });
    expect(result.positions[0]!.valuation.state.code).toBe("risk_flag_unreadable");
  });
});

describe("survivors: readers (R01 R02 R06 R07 R09 R12 R15 R16 R21)", () => {
  const refuses = async (run: (http: ReturnType<typeof makeStack>["http"]) => Promise<unknown>) => {
    const { http, fake } = makeStack([]);
    await expect(run(http)).rejects.toMatchObject({ kind: "invalid_request" });
    expect(fake.calls).toHaveLength(0);
  };
  const base = { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 1 };

  test("dex-history refuses a bad request before any call, with the right reason (not a masked network error)", async () => {
    await refuses((http) => readDexHistory(http, { ...base, beginMs: NOW, endMs: NOW }));
    await refuses((http) => readDexHistory(http, { ...base, maxPages: 11 }));
    await refuses((http) => readDexHistory(http, { ...base, tokenContractAddress: "FixtureMint111111111111111111111111111111" }));
    await refuses((http) => readDexHistory(http, { ...base, endMs: 4_102_444_800_001 }));
    await refuses((http) => readDexHistory(http, { ...base, beginMs: 1.5 }));
    await refuses((http) => readDexHistory(http, { ...base, endMs: Number.NaN }));
    await refuses((http) => readDexHistory(http, { ...base, beginMs: 946_684_799_999 }));
  });

  test("the edges that are valid are accepted", async () => {
    const { http, fake } = makeStack([{ body: envelope({ cursor: "", transactionList: [] }) }]);
    await readDexHistory(http, { ...base, beginMs: 946_684_800_000, endMs: 4_102_444_800_000, maxPages: 10 });
    expect(fake.calls).toHaveLength(1);
  });

  test("R12 and R15: two groups in one answer are ambiguous for latest-pnl and for dex-history", async () => {
    await expect(readLatestPnl(makeStack([{ body: envelope([latestRaw(), latestRaw()]) }]).http, { chainIndex: "1", address: FIXTURE_ACCOUNT, tokenContractAddress: FIXTURE_TOKEN_A })).rejects.toMatchObject({ kind: "schema" });
    await expect(readDexHistory(makeStack([{ body: envelope([{ cursor: "", transactionList: [] }, { cursor: "", transactionList: [] }]) }]).http, base)).rejects.toMatchObject({ kind: "schema" });
    const one = await readLatestPnl(makeStack([{ body: envelope([latestRaw()]) }]).http, { chainIndex: "1", address: FIXTURE_ACCOUNT, tokenContractAddress: FIXTURE_TOKEN_A });
    expect(one.value.totalPnlUsd).toBe("1371.68");
  });

  test("R16: each row says which page and which row it came from", async () => {
    const { http } = makeStack((_call, index) => ({ body: envelope({ cursor: index === 0 ? "c1" : "", transactionList: [{ type: "1", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, amount: "1", valueUsd: "1", time: String(NOW - 1000) }] }) }));
    const read = await readDexHistory(http, { ...base, maxPages: 3 });
    expect(read.rows.map((row) => row.locator)).toEqual(["/page/0/transactionList/0", "/page/1/transactionList/0"]);
  });

  test("R21: the token goes to the provider exactly as the caller wrote it (Solana mints are case sensitive)", async () => {
    const { FIXTURE_SOLANA_ACCOUNT, FIXTURE_SOLANA_MINT } = await import("./fixtures.ts");
    const { http, fake } = makeStack([{ body: envelope(latestRaw()) }]);
    await readLatestPnl(http, { chainIndex: "501", address: FIXTURE_SOLANA_ACCOUNT, tokenContractAddress: FIXTURE_SOLANA_MINT });
    expect(new URLSearchParams(fake.calls[0]!.query).get("tokenContractAddress")).toBe(FIXTURE_SOLANA_MINT);
  });
});

describe("survivors: the collector's Address Analysis wiring (C01 C03 C04 C05 C06 C07 C08 C09 C12 C14 C15 C19)", () => {
  const ROW_A = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "2.5", rawBalance: "2500000", tokenPrice: "4", isRiskToken: false };
  const reply = (over: Record<string, FakeReply | ((call: FakeCall) => FakeReply)> = {}) => {
    const base: Record<string, FakeReply | ((call: FakeCall) => FakeReply)> = {
      [BALANCES_PATH]: { body: envelope([{ tokenAssets: [ROW_A] }]) },
      [SUPPORT_PATH]: { body: envelope([{ chainIndex: "1" }]) },
      [OVERVIEW_PATH]: { body: envelope({ realizedPnlUsd: "0" }) },
      [RECENT_PATH]: { body: envelope({ cursor: "", pnlList: [] }) },
      [LATEST_PATH]: { body: envelope(latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60" })) },
      [DEX_PATH]: { body: envelope({ cursor: "", transactionList: [] }) },
      ...over,
    };
    return (call: FakeCall): FakeReply => {
      const route = base[call.path];
      if (route === undefined) return { status: 404, body: "" };
      return typeof route === "function" ? route(call) : route;
    };
  };
  const request = (analysis: Extract<CollectRequest["addressAnalysis"], object>): CollectRequest => ({ address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1", totalValue: false, market: false, addressAnalysis: analysis });
  const run = (script: (call: FakeCall) => FakeReply, analysis: Extract<CollectRequest["addressAnalysis"], object>, config: Partial<Parameters<typeof collectWalletEvidence>[2]> = {}, stackOptions: NonNullable<Parameters<typeof makeStack>[1]> = {}) => {
    const stack = makeStack(script, stackOptions);
    return collectWalletEvidence({ http: stack.http, now: stack.clock.now }, request(analysis), { origin: "synthetic_fixture", ...config }).then((outcome) => ({ outcome, stack }));
  };
  const tokenC = "0x00000000000000000000000000000000000c0003";
  const tok = (tokenContractAddress: string) => ({ chainIndex: "1", tokenContractAddress });

  test("C01: the per-token note appears only when tokens exceed the cap", async () => {
    const two = await run(reply(), { chains: ["1"], tokens: [tok(FIXTURE_TOKEN_A), tok(FIXTURE_TOKEN_B)] }, { perTokenCap: 2 });
    expect(two.outcome.evidence.collection?.skipped).toEqual([]);
    const three = await run(reply(), { chains: ["1"], tokens: [tok(FIXTURE_TOKEN_A), tok(FIXTURE_TOKEN_B), tok(tokenC)] }, { perTokenCap: 2 });
    expect(three.outcome.evidence.collection?.skipped).toContainEqual({ what: "portfolio.latestPnl", reason: "only_first_2_tokens_read" });
  });

  test("C03: the DEX window ends when the DEX read starts, not when the refresh started", async () => {
    const { outcome, stack } = await run(reply(), { chains: ["1"], dexHistory: { days: 7 } }, {}, { requestsPerSecond: 1, burst: 1 });
    const call = stack.fake.calls.find((item) => item.path === DEX_PATH)!;
    const query = new URLSearchParams(call.query);
    const first = stack.fake.calls[0]!.atMs;
    expect(Number(query.get("end"))).toBeGreaterThanOrEqual(first + 2_000);
    expect(Number(query.get("end")) - Number(query.get("begin"))).toBe(7 * DAY);
    expect(outcome.evidence.addressAnalysis).not.toBeNull();
  });

  test("C04: an explicit window is sent as given", async () => {
    const { stack } = await run(reply(), { chains: ["1"], dexHistory: { beginMs: NOW - 5 * DAY, endMs: NOW - DAY } });
    const query = new URLSearchParams(stack.fake.calls.find((item) => item.path === DEX_PATH)!.query);
    expect(query.get("begin")).toBe(String(NOW - 5 * DAY));
    expect(query.get("end")).toBe(String(NOW - DAY));
  });

  test("C05: an empty support list skips every chain, it is not ignored", async () => {
    const { stack, outcome } = await run(reply({ [SUPPORT_PATH]: { body: envelope([]) } }), { chains: ["1"], supportCheck: true });
    expect(stack.fake.calls.map((call) => call.path)).toEqual([BALANCES_PATH, SUPPORT_PATH]);
    expect(outcome.evidence.collection?.skipped).toContainEqual({ what: "portfolio.1", reason: "chain_not_listed_as_supported" });
  });

  test("C06: a net zero position in the DEX history does not become an expected asset", async () => {
    const legs = (call: FakeCall) => ({ body: envelope({ cursor: "", transactionList: [{ type: "1", amount: "2" }, { type: "2", amount: "2" }].map((leg, index) => ({ ...leg, chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, tokenSymbol: "FIXB", valueUsd: "10", price: "5", marketCap: "1", pnlUsd: "0", time: String(call.atMs - (index + 1) * 60_000) })) }) });
    const { outcome } = await run(reply({ [DEX_PATH]: legs }), { chains: ["1"], dexHistory: { days: 1 } });
    expect(outcome.evidence.balances!.positions.some((position) => position.identity.key === `1:contract:${FIXTURE_TOKEN_B}`)).toBe(false);
  });

  test("C07, C08, C14, C15, C19: the section is as old as its oldest read, and exists with any single read", async () => {
    const all = await run(reply(), { chains: ["1"], tokens: [tok(FIXTURE_TOKEN_A)], dexHistory: { days: 1 } }, {}, { requestsPerSecond: 1, burst: 1 });
    const overviewAt = all.stack.fake.calls.find((call) => call.path === OVERVIEW_PATH)!.atMs;
    expect(all.outcome.evidence.addressAnalysis!.timing.fetchedAtMs).toBe(overviewAt);

    const onlyDex = await run(reply({ [OVERVIEW_PATH]: { status: 404, body: "" }, [RECENT_PATH]: { status: 404, body: "" } }), { chains: ["1"], dexHistory: { days: 1 } }, {}, { requestsPerSecond: 1, burst: 1, maxRetries: 0 });
    const dexAt = onlyDex.stack.fake.calls.find((call) => call.path === DEX_PATH)!.atMs;
    expect(onlyDex.outcome.evidence.addressAnalysis).not.toBeNull();
    expect(onlyDex.outcome.evidence.addressAnalysis!.timing.fetchedAtMs).toBe(dexAt);

    const onlyLatest = await run(reply({ [OVERVIEW_PATH]: { status: 404, body: "" }, [RECENT_PATH]: { status: 404, body: "" } }), { chains: ["1"], tokens: [tok(FIXTURE_TOKEN_A)] }, {}, { requestsPerSecond: 1, burst: 1, maxRetries: 0 });
    const latestAt = onlyLatest.stack.fake.calls.find((call) => call.path === LATEST_PATH)!.atMs;
    expect(onlyLatest.outcome.evidence.addressAnalysis!.tokenPnlChecks).toHaveLength(1);
    expect(onlyLatest.outcome.evidence.addressAnalysis!.timing.fetchedAtMs).toBe(latestAt);
  });

  test("C12: a DEX window with no trades is still a DEX window (the section says it was read)", async () => {
    const { outcome } = await run(reply(), { chains: ["1"], dexHistory: { days: 1 } });
    expect(outcome.evidence.addressAnalysis!.issues.some((issue) => issue.code === "dex_history_window_only")).toBe(true);
    expect(outcome.evidence.addressAnalysis!.acquisitions).toEqual([]);
  });

  test("C09: the plan caps the latest PnL calls per chain at the per-token cap", () => {
    const tokens = Array.from({ length: 7 }, (_, index) => tok(`0x${String(index + 1).padStart(40, "0")}`));
    const plan = planCalls(request({ chains: ["1", "56"], tokens }), { maxPagesPerEndpoint: 3, perTokenCap: 5 });
    expect(plan.find((item) => item.what === "portfolio.latestPnl")!.max).toBe(10);
  });
});

describe("survivors: the oldest capture of an evidence (C23 C24 C25 C26)", () => {
  test("each section can be the oldest one", async () => {
    const { oldestCaptureMs } = await import("./evidence.ts");
    const { buildHistorySection } = await import("./history.ts");
    const { assembleMarketSection } = await import("./market.ts");
    const { historyRow } = await import("./fixtures.ts");
    const build = (times: { balances: number; total: number; history: number; market: number; analysis: number }) =>
      buildWalletEvidence({
        origin: "synthetic_fixture",
        nowMs: NOW,
        maxAgeMs: 600_000,
        account: FIXTURE_ACCOUNT,
        balances: buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow()], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: times.balances, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 600_000, reportedTotal: { valueText: "10", assetType: "tokens", chains: ["1"], excludeRiskToken: "1", fetchedAtMs: times.total } }),
        history: buildHistorySection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [historyRow()], source: SOURCE, fetchedAtMs: times.history, nowMs: NOW, maxAgeMs: 600_000, requestedFromMs: null, requestedToMs: null, pagesRead: 1, truncated: false, stopReason: "exhausted" }),
        market: assembleMarketSection({ source: SOURCE, fetchedAtMs: times.market, nowMs: NOW, maxAgeMs: 600_000 }),
        addressAnalysis: section({ fetchedAtMs: times.analysis, overview: { realizedPnlUsd: "1" }, maxAgeMs: 600_000 }),
      });
    const base = { balances: NOW - 1000, total: NOW - 1000, history: NOW - 1000, market: NOW - 1000, analysis: NOW - 1000 };
    for (const key of ["balances", "total", "history", "market", "analysis"] as const) expect({ key, oldest: oldestCaptureMs(build({ ...base, [key]: NOW - 5000 })) }).toEqual({ key, oldest: NOW - 5000 });
    expect(oldestCaptureMs(buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: null }))).toBeNull();
  });
});

describe("survivors: reconciliation of the family (X01 X02 X03 X06)", () => {
  const zero = () => buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow({ balance: "0", rawBalance: "0" })], source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000 });
  const evidenceOf = (analysis: ReturnType<typeof section>) => buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances: zero(), addressAnalysis: analysis });

  test("X01 and X02: an unverified PnL check is a finding too, and the divergence carries its exact delta", () => {
    const bad = evidenceOf(section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw() }] })).reconciliation.findings.find((item) => item.rule === "PN")!;
    expect(bad.detail).toEqual({ totalText: "1371.68", partsSumText: "0", deltaText: "1371.68" });
    const unsupported = evidenceOf(section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ isPnlSupported: false }) }] })).reconciliation.findings.find((item) => item.rule === "PN")!;
    expect(unsupported).toMatchObject({ code: "pnl_not_supported_for_token", state: { kind: "unverified" } });
    const clean = evidenceOf(section({ tokenPnl: [{ token: { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }, raw: latestRaw({ totalPnlUsd: "100", realizedPnlUsd: "40", unrealizedPnlUsd: "60" }) }] }));
    expect(clean.reconciliation.findings.filter((item) => item.rule === "PN")).toEqual([]);
  });

  test("X03: the provider's own balance signal wins over the DEX signal", () => {
    const result = evidenceOf(section({ rows: [pnlRowWithBalance()], ...tradesInput([trade(1)]) }));
    expect(result.reconciliation.findings.find((item) => item.rule === "RC2")!.detail.signal).toBe("provider_pnl_balance");
  });

  test("X06: rejected rows of the family are RC4 findings that name their section", () => {
    const result = evidenceOf(section(tradesInput([trade(1, { chainIndex: "56" })])));
    expect(result.reconciliation.findings.find((item) => item.rule === "RC4")!.detail).toMatchObject({ section: "address_analysis", locator: "/page/0/transactionList/1" });
  });
});

function pnlRowWithBalance() {
  return { locator: "/p/0", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", lastActiveTimestamp: String(NOW - 1000), unrealizedPnlUsd: "1", realizedPnlUsd: "1", totalPnlUsd: "2", tokenBalanceUsd: "10", tokenBalanceAmount: "2.5", tokenPositionDuration: { holdingTimestamp: String(NOW - 5_000_000_000_0), sellOffTimestamp: "" } };
}

describe("survivors: the command line options (L01 to L06 L14 L15)", () => {
  function io(overrides: Partial<CliIo> = {}, reply: (call: FakeCall) => FakeReply = () => ({ status: 404, body: "" })) {
    const clock = makeClock();
    const out: string[] = [];
    const err: string[] = [];
    const fake = makeFakeFetch(reply, clock);
    const base: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line), err: (line) => err.push(line), fs: makeMemoryFs() };
    return { io: { ...base, ...overrides }, out, err, fake, clock };
  }
  const plan = (extra: string[]) => runCli(["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--pnl-chains", "1", ...extra], io().io);

  test("L01 and L02: --dex-days accepts 1 and 365 and refuses 0 and 366", async () => {
    expect(await plan(["--dex-history", "--dex-days", "1"])).toBe(0);
    expect(await plan(["--dex-history", "--dex-days", "365"])).toBe(0);
    expect(await plan(["--dex-history", "--dex-days", "0"])).toBe(2);
    expect(await plan(["--dex-history", "--dex-days", "366"])).toBe(2);
  });

  test("L04, L05, L06: --pnl-tokens needs a numeric chain, a colon and a contract of at most 128 characters", async () => {
    expect(await plan(["--pnl-tokens", `1:${"a".repeat(128)}`])).toBe(0);
    expect(await plan(["--pnl-tokens", `1:${"a".repeat(129)}`])).toBe(2);
    expect(await plan(["--pnl-tokens", "1:"])).toBe(2);
    expect(await plan(["--pnl-tokens", `:${FIXTURE_TOKEN_A}`])).toBe(2);
    expect(await plan(["--pnl-tokens", `x1:${FIXTURE_TOKEN_A}`])).toBe(2);
    expect(await plan(["--pnl-tokens", `1:${FIXTURE_TOKEN_A},,56:${FIXTURE_TOKEN_A}`])).toBe(0);
  });

  const credentials = { OKX_WEB3_API_KEY: "k", OKX_WEB3_API_SECRET: "s", OKX_WEB3_API_PASSPHRASE: "p" };
  const liveBase = ["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--live", "--credentials-from-env", "--allow-network", "--no-total", "--no-market", "--risk-filter", "1"];
  const answers = (call: FakeCall): FakeReply => {
    if (call.path === BALANCES_PATH) return { body: envelope([{ tokenAssets: [] }]) };
    if (call.path === OVERVIEW_PATH) return { body: envelope({ realizedPnlUsd: "0" }) };
    if (call.path === RECENT_PATH) return { body: envelope({ cursor: "", pnlList: [] }) };
    if (call.path === DEX_PATH) return { body: envelope({ cursor: "", transactionList: [] }) };
    return { status: 404, body: "" };
  };

  test("L03: without --dex-days the window is 30 days", async () => {
    const run = io({ env: credentials }, answers);
    await runCli([...liveBase, "--pnl-chains", "1", "--dex-history"], run.io);
    const query = new URLSearchParams(run.fake.calls.find((call) => call.path === DEX_PATH)!.query);
    expect(Number(query.get("end")) - Number(query.get("begin"))).toBe(30 * DAY);
  });

  test("L14 and L15: the time frame and every pnl chain reach the provider", async () => {
    const run = io({ env: credentials }, answers);
    await runCli([...liveBase, "--pnl-chains", "1,56", "--pnl-timeframe", "2"], run.io);
    const overviews = run.fake.calls.filter((call) => call.path === OVERVIEW_PATH);
    expect(overviews.map((call) => new URLSearchParams(call.query).get("chainIndex"))).toEqual(["1", "56"]);
    expect(overviews.every((call) => new URLSearchParams(call.query).get("timeFrame") === "2")).toBe(true);
  });
});

describe("survivors of my own campaign on the corrected code", () => {
  test("collapsed duplicate fills alone make the section incomplete and are said", () => {
    const result = section(tradesInput([trade(1), trade(1, { locator: "/dup" })]));
    expect(result.tradesDuplicatesCollapsed).toBe(1);
    expect(result.issues.some((issue) => issue.code === "dex_trades_collapsed")).toBe(true);
    expect(result.status).toBe("incomplete");
    expect(section(tradesInput([trade(1)])).status).toBe("valid");
  });

  test("a page that returns more rows than a page can hold is cut at the row cap", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ type: "1", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", valueUsd: "1", amount: "1", price: "1", marketCap: "1", pnlUsd: "0", time: String(NOW - i * 1000) }));
    const { http } = makeStack([{ body: envelope({ cursor: "c1", transactionList: rows }) }]);
    const read = await readDexHistory(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - DAY, endMs: NOW, maxPages: 1 });
    expect(read.rows).toHaveLength(100);
    expect(read).toMatchObject({ truncated: true, stopReason: "max_rows" });
  });

  test("a walk cut by the page cap keeps that reason even when it also reached 1000 rows", async () => {
    const page = (n: number) => ({ body: envelope({ cursor: `c${n}`, transactionList: Array.from({ length: 100 }, (_, i) => ({ type: "1", chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, tokenSymbol: "FIXA", valueUsd: "1", amount: "1", price: "1", marketCap: "1", pnlUsd: "0", time: String(NOW - (n * 100 + i) * 1000) })) }) });
    const { http } = makeStack((_call, index) => page(index));
    const read = await readDexHistory(http, { chainIndex: "1", address: FIXTURE_ACCOUNT, beginMs: NOW - 30 * DAY, endMs: NOW, maxPages: 10 });
    expect(read.rows).toHaveLength(1000);
    expect(read).toMatchObject({ truncated: true, stopReason: "max_pages" });
  });

  test("an asset the provider was expected to return and did not degrades the balance status itself", () => {
    const balances = buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [balanceRow()], source: SOURCE, excludeRiskToken: null, tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: 60_000, expectedAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B }] });
    const result = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: 60_000, account: FIXTURE_ACCOUNT, balances });
    expect(result.reconciliation.findings.some((item) => item.rule === "RC6")).toBe(true);
    expect(result.reconciliation.balanceStatus).toBe("incomplete");
  });
});
