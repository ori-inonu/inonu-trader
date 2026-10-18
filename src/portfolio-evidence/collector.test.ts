/**
 * Collector and store tests: the REAL signed client over a scripted fake fetch with canary credentials.
 * Everything is SYNTHETIC; the origin is `synthetic_fixture` because no request reaches OKX.
 */

import { describe, expect, test } from "bun:test";
import { CANARY_PASSPHRASE, CANARY_SECRET, envelope, makeClock, makeFakeFetch, makeMemoryFs, makeMemoryFsState, makeStack, type FakeCall, type FakeReply } from "../onchainos/fakes.ts";
import { createOnchainosHttp } from "../onchainos/http.ts";
import { classify, collectWalletEvidence, planCalls, requestFingerprint, CollectorUsageError, type CollectRequest } from "./collector.ts";
import { verifyEvidence, accountRefOf } from "./evidence.ts";
import { FIXTURE_ACCOUNT, FIXTURE_RISK_TOKEN, FIXTURE_TOKEN_A, FIXTURE_TOKEN_B } from "./fixtures.ts";
import { createEvidenceStore } from "./store.ts";
import { OnchainosError } from "../onchainos/errors.ts";

const rowA = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "2.5", rawBalance: "2500000", tokenPrice: "4", isRiskToken: false };
const rowEth = { chainIndex: "1", tokenContractAddress: "", address: FIXTURE_ACCOUNT, symbol: "ETH", balance: "0.01", rawBalance: "10000000000000000", tokenPrice: "3000", isRiskToken: false };
const rowB = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, address: FIXTURE_ACCOUNT, symbol: "FIXB", balance: "5", rawBalance: "", tokenPrice: "2", isRiskToken: false };

/** Routes by path so the order of calls does not matter. */
function router(routes: Record<string, FakeReply | ((call: FakeCall) => FakeReply)>) {
  return (call: FakeCall): FakeReply => {
    const route = routes[call.path];
    if (route === undefined) return { status: 404, body: "" };
    return typeof route === "function" ? route(call) : route;
  };
}

const BASE: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1" };
const CONFIG = { origin: "synthetic_fixture" as const, maxAgeMs: 600_000 };

describe("a full on-demand refresh", () => {
  test("reads balances, total, prices and decimals and builds one verified evidence", async () => {
    const { http, fake, clock } = makeStack(
      router({
        "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA, rowEth, rowB] }]) },
        "/api/v6/dex/balance/total-value-by-address": { body: envelope([{ totalValue: "50" }]) },
        "/api/v6/dex/market/price": { body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, time: "1700000000000", price: "4" }, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, time: "1700000000000", price: "2" }]) },
        "/api/v6/dex/market/token/basic-info": { body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, decimal: "6" }, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, decimal: "18" }]) },
      }),
    );
    const outcome = await collectWalletEvidence({ http, now: clock.now }, BASE, CONFIG);
    const evidence = outcome.evidence;
    expect(verifyEvidence(evidence)).toBe(true);
    expect(evidence.origin).toBe("synthetic_fixture");
    expect(evidence.realData).toBe(false);
    expect(evidence.collection).toMatchObject({ trigger: "on_demand", callsMade: 4, stoppedBy: null, errors: [], skipped: [] });
    expect(fake.calls.map((call) => call.path)).toEqual([
      "/api/v6/dex/balance/all-token-balances-by-address",
      "/api/v6/dex/balance/total-value-by-address",
      "/api/v6/dex/market/price",
      "/api/v6/dex/market/token/basic-info",
    ]);
    const priced = evidence.balances!.positions.find((position) => position.identity.key === `1:contract:${FIXTURE_TOKEN_B}`)!;
    expect(priced.quantity).toMatchObject({ atoms: "5000000000000000000", decimals: 18, decimalsSource: "provider_token_info" });
    expect(priced.valuation.priceAsOfMs).toBe(1_700_000_000_000);
    expect(evidence.netWorth.valueText).toBe("50");
    expect(evidence.reconciliation.totalVsSum?.state.kind).toBe("ok");
    expect(evidence.status).toBe("valid");
    expect(JSON.stringify(outcome)).not.toContain(CANARY_SECRET);
    expect(JSON.stringify(outcome)).not.toContain(CANARY_PASSPHRASE);
    expect(JSON.stringify(outcome)).not.toContain(FIXTURE_ACCOUNT);
    expect(outcome.quota?.costKnown).toBe(false);
  });

  test("no scheduling: nothing happens after the call returns", async () => {
    const { http, fake, clock } = makeStack(router({ "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA] }]) } }));
    await collectWalletEvidence({ http, now: clock.now }, { ...BASE, totalValue: false, market: false }, CONFIG);
    const calls = fake.calls.length;
    clock.advance(10 * 60_000);
    await Promise.resolve();
    expect(fake.calls.length).toBe(calls);
  });

  test("history and Address Analysis feed the signals: an omitted asset is flagged, never zero", async () => {
    const { http, clock } = makeStack(
      router({
        "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowEth] }]) },
        "/api/v6/dex/post-transaction/transactions-by-address": {
          body: envelope([{ cursor: "", transactionList: [{ chainIndex: "1", txHash: "0xfixturehash00000000000000000000000001", itype: "2", txTime: String(1_700_000_000_000 - 1000), from: [{ address: "0x00000000000000000000000000000000000ee001" }], to: [{ address: FIXTURE_ACCOUNT }], tokenContractAddress: FIXTURE_RISK_TOKEN, amount: "7", symbol: "RSK", txFee: "", txStatus: "success" }] }]),
        },
        "/api/v6/dex/market/portfolio/overview": { body: envelope({ realizedPnlUsd: "999999" }) },
        "/api/v6/dex/market/portfolio/recent-pnl": { body: envelope({ cursor: "", pnlList: [{ chainIndex: "1", tokenContractAddress: FIXTURE_RISK_TOKEN, tokenSymbol: "RSK", tokenBalanceAmount: "7", tokenBalanceUsd: "700", realizedPnlUsd: "1", unrealizedPnlUsd: "2" }] }) },
      }),
    );
    const outcome = await collectWalletEvidence({ http, now: clock.now }, { ...BASE, excludeRiskToken: undefined, totalValue: false, market: false, history: {}, addressAnalysis: { chains: ["1"] } }, CONFIG);
    const evidence = outcome.evidence;
    const omitted = evidence.balances!.positions.find((position) => position.identity.key === `1:contract:${FIXTURE_RISK_TOKEN}`)!;
    expect(omitted.quantity.state.kind).toBe("omitted_by_filter");
    expect(omitted.quantity.atoms).toBeNull();
    const rc2 = evidence.reconciliation.findings.filter((item) => item.rule === "RC2").map((item) => item.code);
    expect(rc2).toEqual(["historical_quantity_active_unknown"]);
    expect(evidence.netWorth.valueText).toBe("30");
    expect(evidence.status).toBe("unreconciled");
    expect(evidence.addressAnalysis!.statements.some((statement) => statement.valueText === "999999")).toBe(true);
    expect(evidence.netWorth.valueText).not.toBe("1000029");
  });

  test("the risk probe turns an omission into a flagged position when the filtered answer left it out", async () => {
    const probeRow = { chainIndex: "1", tokenContractAddress: FIXTURE_RISK_TOKEN, address: FIXTURE_ACCOUNT, symbol: "RSK", balance: "7", rawBalance: "7000000", tokenPrice: "100", isRiskToken: true };
    const { http, fake, clock } = makeStack(
      router({
        "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowEth] }]) },
        "/api/v6/dex/balance/token-balances-by-address": { body: envelope([{ tokenAssets: [probeRow] }]) },
      }),
    );
    const outcome = await collectWalletEvidence({ http, now: clock.now }, { ...BASE, excludeRiskToken: "0", totalValue: false, market: false, riskProbe: true, expectedAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_RISK_TOKEN }] }, CONFIG);
    const position = outcome.evidence.balances!.positions.find((item) => item.identity.key === `1:contract:${FIXTURE_RISK_TOKEN}`)!;
    expect(position.origin).toBe("provider_row");
    expect(position.risk.assessment).toBe("flagged");
    expect(position.included).toBe(false);
    expect(JSON.parse(fake.calls.at(-1)!.body!).excludeRiskToken).toBe("1");
    expect(outcome.evidence.netWorth.valueText).toBe("30");
  });
});

describe("liquidity and risk end to end through the signed client", () => {
  const rowB2 = { ...rowB, rawBalance: "5000000000000000000" };
  const base = (extra: Record<string, FakeReply | ((call: FakeCall) => FakeReply)> = {}) =>
    router({
      "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA, rowB2] }]) },
      "/api/v6/dex/market/token/top-liquidity": (call) => ({ body: envelope(call.query.includes(FIXTURE_TOKEN_A.slice(2)) ? [{ liquidityUsd: "500" }] : [{ liquidityUsd: "9000000" }]) }),
      "/api/v6/dex/market/token/advanced-info": (call) => ({ body: envelope([call.query.includes(FIXTURE_TOKEN_A.slice(2)) ? { riskControlLevel: "4", tokenTags: [] } : { riskControlLevel: "1", tokenTags: [] }]) }),
      ...extra,
    });
  const request: CollectRequest = { ...BASE, totalValue: false, market: { price: false, decimals: false, liquidity: true, risk: true } };

  test("one liquidity read and one risk read per token, and the findings reach the evidence", async () => {
    const { http, fake, clock } = makeStack(base());
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, CONFIG);
    expect(fake.calls.map((call) => call.path)).toEqual([
      "/api/v6/dex/balance/all-token-balances-by-address",
      "/api/v6/dex/market/token/top-liquidity",
      "/api/v6/dex/market/token/advanced-info",
      "/api/v6/dex/market/token/top-liquidity",
      "/api/v6/dex/market/token/advanced-info",
    ]);
    const market = outcome.evidence.market!;
    expect(market.liquidity.map((row) => [row.identity.key, row.liquidityUsdLowerBoundText, row.scope])).toEqual([
      [`1:contract:${FIXTURE_TOKEN_A}`, "500", "top_pools_lower_bound"],
      [`1:contract:${FIXTURE_TOKEN_B}`, "9000000", "top_pools_lower_bound"],
    ]);
    expect(market.risk.map((row) => row.riskControlLevel)).toEqual([4, 1]);
    const rk = outcome.evidence.reconciliation.findings.filter((item) => item.rule === "RK");
    expect(rk.map((item) => `${item.code}:${item.identityKey}`).sort()).toEqual([`position_large_vs_top_pools:1:contract:${FIXTURE_TOKEN_A}`, `risk_elevated:1:contract:${FIXTURE_TOKEN_A}`].sort());
    expect(outcome.evidence.status).not.toBe("valid");
    expect(verifyEvidence(outcome.evidence)).toBe(true);
  });

  test("the per-token cap limits those reads and says what was left out", async () => {
    const { http, fake, clock } = makeStack(base());
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, { ...CONFIG, perTokenCap: 1 });
    expect(fake.calls.filter((call) => call.path.includes("/market/token/"))).toHaveLength(2);
    expect(outcome.evidence.collection?.skipped).toEqual([{ what: "market.per_token", reason: "only_first_1_tokens_read" }]);
    expect(outcome.evidence.status).not.toBe("valid");
  });

  test("a plan that does not include the risk endpoint (403) ends the refresh but keeps what was read", async () => {
    const { http, fake, clock } = makeStack(base({ "/api/v6/dex/market/token/advanced-info": { status: 403, body: "" } }), { maxRetries: 0 });
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, CONFIG);
    expect(outcome.evidence.collection?.stoppedBy).toBe("access_denied");
    expect(outcome.evidence.collection?.errors).toEqual([{ section: "market", code: "access_denied_or_region_restricted", httpStatus: 403, apiCode: null }]);
    expect(outcome.evidence.market?.liquidity).toHaveLength(1);
    expect(outcome.evidence.market?.risk).toEqual([]);
    expect(outcome.evidence.balances?.positions).toHaveLength(2);
    expect(fake.calls.at(-1)!.path).toBe("/api/v6/dex/market/token/advanced-info");
  });

  test("risk level 0 reaches the evidence as unknown, never as safe", async () => {
    const { http, clock } = makeStack(base({ "/api/v6/dex/market/token/advanced-info": { body: envelope([{ riskControlLevel: "0", tokenTags: [] }]) } }));
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, CONFIG);
    expect(outcome.evidence.market?.risk.every((row) => row.riskControlLevel === 0)).toBe(true);
    expect(outcome.evidence.reconciliation.findings.some((item) => item.code === "risk_elevated")).toBe(false);
  });
});

describe("limits", () => {
  test("the call budget ends the refresh and the missing parts are explained, not dropped", async () => {
    const { http, fake, clock } = makeStack(
      router({
        "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA, rowEth] }]) },
        "/api/v6/dex/balance/total-value-by-address": { body: envelope([{ totalValue: "40" }]) },
      }),
    );
    const outcome = await collectWalletEvidence({ http, now: clock.now }, BASE, { ...CONFIG, maxCalls: 2 });
    expect(fake.calls).toHaveLength(2);
    expect(outcome.evidence.collection?.stoppedBy).toBe("call_budget");
    expect(outcome.evidence.collection?.skipped.map((item) => item.what)).toEqual(["market.price", "market.token.basic-info"]);
    expect(outcome.evidence.market).toBeNull();
    expect(outcome.evidence.status).not.toBe("valid");
  });

  test("the deadline ends the refresh before the next call", async () => {
    const clock = makeClock();
    const fake = makeFakeFetch(() => { clock.advance(40_000); return { body: envelope([{ tokenAssets: [rowEth] }]) }; }, clock);
    const http = createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, credentials: { apiKey: "k", secretKey: "s", passphrase: "p" }, allowNetwork: true, requestsPerSecond: 10, burst: 10 });
    const outcome = await collectWalletEvidence({ http, now: clock.now }, { ...BASE, market: false }, { ...CONFIG, deadlineMs: 30_000 });
    expect(fake.calls).toHaveLength(1);
    expect(outcome.evidence.collection?.stoppedBy).toBe("deadline");
  });

  test("history pagination is capped by the page limit", async () => {
    const page = (n: number) => ({ body: envelope([{ cursor: `c${n}`, transactionList: [{ chainIndex: "1", txHash: `0xfixturehash${String(n).padStart(24, "0")}`, itype: "2", txTime: String(1_700_000_000_000 - n * 1000), from: [], to: [{ address: FIXTURE_ACCOUNT }], tokenContractAddress: FIXTURE_TOKEN_A, amount: "1", symbol: "FIXA", txFee: "", txStatus: "success" }] }]) });
    let n = 0;
    const { http, fake, clock } = makeStack(
      router({
        "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA] }]) },
        "/api/v6/dex/post-transaction/transactions-by-address": () => page((n += 1)),
      }),
    );
    const outcome = await collectWalletEvidence({ http, now: clock.now }, { ...BASE, totalValue: false, market: false, history: {} }, { ...CONFIG, maxPagesPerEndpoint: 2 });
    expect(fake.calls.filter((call) => call.path.includes("transactions-by-address"))).toHaveLength(2);
    expect(outcome.evidence.history?.coverage).toMatchObject({ pagesRead: 2, truncated: true, stopReason: "max_pages" });
    expect(outcome.evidence.history?.window.completeness).toBe("partial_truncated");
  });

  test("invalid limits and an empty chain list are usage errors before any call", async () => {
    const { http, fake, clock } = makeStack([]);
    await expect(collectWalletEvidence({ http, now: clock.now }, BASE, { ...CONFIG, maxCalls: 0 })).rejects.toBeInstanceOf(CollectorUsageError);
    await expect(collectWalletEvidence({ http, now: clock.now }, BASE, { ...CONFIG, maxCalls: 1000 })).rejects.toBeInstanceOf(CollectorUsageError);
    await expect(collectWalletEvidence({ http, now: clock.now }, { ...BASE, chains: [] }, CONFIG)).rejects.toBeInstanceOf(CollectorUsageError);
    expect(fake.calls).toHaveLength(0);
  });

  test("the plan states the worst case without touching the network", () => {
    const plan = planCalls({ ...BASE, history: {}, addressAnalysis: { chains: ["1", "501"] }, market: { liquidity: true, risk: true }, riskProbe: true }, { maxPagesPerEndpoint: 3, perTokenCap: 5 });
    expect(plan.map((item) => item.what)).toEqual(["balance.all", "balance.total", "history.byAddress", "portfolio.overview", "portfolio.recentPnl", "market.price", "market.token.basic-info", "market.token.top-liquidity", "market.token.advanced-info", "balance.specific"]);
    expect(plan.reduce((sum, item) => sum + item.max, 0)).toBe(1 + 1 + 3 + 2 + 6 + 1 + 1 + 5 + 5 + 1);
  });
});

describe("failures end the refresh without a workaround", () => {
  const failing = (reply: FakeReply) => makeStack(() => reply, { maxRetries: 0 });

  for (const [name, reply, code, stopped] of [
    ["credential rejected", { status: 401, body: { code: "50111", msg: "x" } }, "credentials_rejected", "credentials_rejected"],
    ["access denied or region", { status: 403, body: "" }, "access_denied_or_region_restricted", "access_denied"],
    ["legal restriction", { status: 451, body: "" }, "access_denied_or_region_restricted", "access_denied"],
    ["payment demanded", { status: 402, body: "" }, "payment_required", "payment_required"],
    ["rate limited", { status: 429, body: "" }, "rate_limited", "rate_limited"],
  ] as const) {
    test(name, async () => {
      const { http, fake, clock } = failing(reply);
      const outcome = await collectWalletEvidence({ http, now: clock.now }, BASE, CONFIG);
      expect(fake.calls).toHaveLength(1);
      expect(outcome.evidence.collection?.stoppedBy).toBe(stopped);
      expect(outcome.evidence.collection?.errors[0]).toMatchObject({ section: "balances", code });
      expect(outcome.evidence.sections.balances).toBe("failed");
      expect(outcome.evidence.balances).toBeNull();
      expect(outcome.evidence.netWorth.valueText).toBeNull();
      expect(outcome.evidence.status).toBe("incomplete");
      expect(outcome.evidence.collection?.skipped.map((item) => item.reason).every((reason) => reason.startsWith("stopped_by_"))).toBe(true);
    });
  }

  test("an offline client: nothing is sent and the evidence says offline, with no example data", async () => {
    const { http, fake, clock } = makeStack([], { allowNetwork: false });
    const outcome = await collectWalletEvidence({ http, now: clock.now }, BASE, CONFIG);
    expect(fake.calls).toHaveLength(0);
    expect(outcome.evidence.collection?.stoppedBy).toBe("offline");
    expect(outcome.evidence.collection?.callsMade).toBe(0);
    expect(outcome.evidence.balances).toBeNull();
    expect(outcome.evidence.netWorth.valueText).toBeNull();
    expect(outcome.evidence.sections.balances).toBe("failed");
  });

  test("a section that errors does not take the others down", async () => {
    const { http, clock } = makeStack(
      router({
        "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA] }]) },
        "/api/v6/dex/balance/total-value-by-address": { body: envelope([], "50001", "busy") },
        "/api/v6/dex/market/price": { body: "not json" },
        "/api/v6/dex/market/token/basic-info": { body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, decimal: "6" }]) },
      }),
    );
    const outcome = await collectWalletEvidence({ http, now: clock.now }, BASE, CONFIG);
    expect(outcome.evidence.collection?.errors.map((error) => `${error.section}:${error.code}`)).toEqual(["totalValue:api_error_50001", "market:schema_mismatch"]);
    expect(outcome.evidence.balances).not.toBeNull();
    expect(outcome.evidence.balances!.reportedTotal).toBeNull();
    expect(outcome.evidence.market!.tokenInfo).toHaveLength(1);
    expect(outcome.evidence.status).toBe("incomplete");
  });

  test("a partial answer keeps what was readable and flags the rest", async () => {
    const { http, clock } = makeStack(
      router({ "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA, { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_B, address: FIXTURE_ACCOUNT, symbol: "FIXB", balance: "", rawBalance: "", tokenPrice: "2", isRiskToken: false }] }]) } }),
    );
    const outcome = await collectWalletEvidence({ http, now: clock.now }, { ...BASE, totalValue: false, market: false }, CONFIG);
    const codes = outcome.evidence.balances!.positions.map((position) => position.state.code).sort();
    expect(codes).toEqual(["balance_missing", "ok"]);
    expect(outcome.evidence.netWorth.valueText).toBe("10");
    expect(outcome.evidence.status).toBe("incomplete");
  });

  test("classification is closed and never echoes provider text", () => {
    expect(classify(new OnchainosError("http", "x", { httpStatus: 404 })).stop).toBeNull();
    expect(classify(new Error("boom")).code).toBe("unexpected");
    expect(classify(new OnchainosError("api", "x", { apiCode: "51001", providerMessage: "secret words" })).code).toBe("api_error_51001");
  });
});

describe("cache and persistence", () => {
  const routes = router({ "/api/v6/dex/balance/all-token-balances-by-address": { body: envelope([{ tokenAssets: [rowA, rowEth] }]) } });
  const request: CollectRequest = { ...BASE, totalValue: false, market: false };

  test("a hit inside the TTL makes no call; past the TTL it refreshes with a higher revision", async () => {
    const state = makeMemoryFsState();
    const store = createEvidenceStore({ fs: makeMemoryFs(state), dir: "mem://pe" });
    const { http, fake, clock } = makeStack(routes);
    const first = await collectWalletEvidence({ http, now: clock.now, store }, request, { ...CONFIG, cacheTtlMs: 30_000 });
    expect(first.cache.hit).toBe(false);
    expect(first.persisted?.written).toBe(true);
    expect(first.evidence.revision).toBe(1);

    clock.advance(10_000);
    const second = await collectWalletEvidence({ http, now: clock.now, store }, request, { ...CONFIG, cacheTtlMs: 30_000 });
    expect(second.cache).toEqual({ hit: true, ageMs: 10_000 });
    expect(second.evidence.contentSha256).toBe(first.evidence.contentSha256);
    expect(fake.calls).toHaveLength(1);

    clock.advance(60_000);
    const third = await collectWalletEvidence({ http, now: clock.now, store }, request, { ...CONFIG, cacheTtlMs: 30_000 });
    expect(third.cache.hit).toBe(false);
    expect(third.evidence.revision).toBe(2);
    expect(fake.calls).toHaveLength(2);
  });

  test("forceRefresh bypasses the cache; a different request does not share it", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://pe" });
    const { http, fake, clock } = makeStack(routes);
    await collectWalletEvidence({ http, now: clock.now, store }, request, { ...CONFIG, cacheTtlMs: 60_000 });
    await collectWalletEvidence({ http, now: clock.now, store }, request, { ...CONFIG, cacheTtlMs: 60_000, forceRefresh: true });
    await collectWalletEvidence({ http, now: clock.now, store }, { ...request, excludeRiskToken: "0" }, { ...CONFIG, cacheTtlMs: 60_000 });
    expect(fake.calls).toHaveLength(3);
    expect(requestFingerprint(request, CONFIG)).not.toBe(requestFingerprint({ ...request, excludeRiskToken: "0" }, CONFIG));
    expect(requestFingerprint(request, CONFIG)).not.toBe(requestFingerprint(request, { origin: "okx_web3_api" }));
  });

  test("the file never holds the account address, writes are atomic, and the journal is rotated", async () => {
    const state = makeMemoryFsState();
    const store = createEvidenceStore({ fs: makeMemoryFs(state), dir: "mem://pe", maxJournalBytes: 400 });
    const { http, clock } = makeStack(routes);
    for (let index = 0; index < 4; index += 1) {
      await collectWalletEvidence({ http, now: clock.now, store }, request, { ...CONFIG });
      clock.advance(1000);
    }
    const files = [...state.files.entries()];
    for (const [, text] of files) expect(text.includes(FIXTURE_ACCOUNT)).toBe(false);
    expect(state.log.filter((entry) => entry.startsWith("writeAtomic:evidence-")).length).toBe(4);
    expect([...state.files.keys()].some((path) => path.endsWith("journal.1.jsonl"))).toBe(true);
    expect(files.find(([path]) => path.endsWith("journal.jsonl"))![1].length).toBeLessThanOrEqual(400);
  });

  test("a late revision never overwrites a newer one", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://pe" });
    const newer = (await collectWalletEvidence({ http: makeStack(routes).http, now: () => 1_700_000_100_000, store }, request, CONFIG)).evidence;
    const fp = requestFingerprint(request, CONFIG);
    const stale = { ...newer, revision: 0 };
    // rebuild a valid but older evidence
    const { buildWalletEvidence } = await import("./evidence.ts");
    const older = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: 1_700_000_000_000, maxAgeMs: 1, account: FIXTURE_ACCOUNT, balances: null, revision: 1 });
    const result = store.put(older, fp);
    expect(result.written).toBe(false);
    expect(result.finding?.code).toBe("older_revision");
    expect(store.latest(accountRefOf(FIXTURE_ACCOUNT).sha256, fp)?.contentSha256).toBe(newer.contentSha256);
    expect(stale.revision).toBe(0);
  });

  test("a damaged or altered file is ignored, never trusted", async () => {
    const state = makeMemoryFsState();
    const store = createEvidenceStore({ fs: makeMemoryFs(state), dir: "mem://pe" });
    const { http, clock } = makeStack(routes);
    const first = await collectWalletEvidence({ http, now: clock.now, store }, request, CONFIG);
    const path = [...state.files.keys()].find((key) => key.includes("evidence-"))!;
    const altered = JSON.parse(state.files.get(path)!);
    altered.netWorth.valueText = "123456789";
    state.files.set(path, JSON.stringify(altered));
    const fp = requestFingerprint(request, CONFIG);
    expect(store.latest(first.evidence.accountRef.sha256, fp)).toBeNull();
    state.files.set(path, "{not json");
    expect(store.latest(first.evidence.accountRef.sha256, fp)).toBeNull();
    const again = await collectWalletEvidence({ http, now: clock.now, store }, request, { ...CONFIG, cacheTtlMs: 60_000 });
    expect(again.cache.hit).toBe(false);
    expect(again.persisted).toMatchObject({ written: true, replacedCorrupt: true });
  });

  test("evidence with a broken hash is never written", () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://pe" });
    expect(() => store.put({ contentSha256: "x" } as never, "a".repeat(64))).toThrow();
  });
});
