/**
 * Regression tests for the SECOND independent review (the re-review of the fixes in review-fixes.test.ts), findings R1 to R10,
 * plus tests for the mutants that survived it. Written before the fixes. All data is SYNTHETIC.
 */

import { describe, expect, test } from "bun:test";
import { CANARY_CREDENTIALS, envelope, makeClock, makeFakeFetch, makeMemoryFs, makeMemoryFsState, makeStack, type FakeCall, type FakeReply } from "../onchainos/fakes.ts";
import { buildAddressAnalysisSection } from "./address-analysis.ts";
import { buildBalanceSection, type BalanceBuildInput } from "./balances.ts";
import { runCli, type CliIo } from "./cli.ts";
import { collectWalletEvidence, requestFingerprint, type CollectRequest } from "./collector.ts";
import { hashOf } from "./canonical.ts";
import { accountRefOf, buildWalletEvidence, verifyEvidence } from "./evidence.ts";
import { FIXTURE_ACCOUNT, FIXTURE_NOW_MS, FIXTURE_TOKEN_A, balanceRow, historyRow, pnlRow, syntheticBalanceRows } from "./fixtures.ts";
import { buildHistorySection } from "./history.ts";
import { buildIdentity } from "./identity.ts";
import { reconcile } from "./reconcile.ts";
import { EvidenceIntegrityError, createEvidenceStore, type EvidenceStore } from "./store.ts";
import { ADAPTER_VERSION, type SourceInfo } from "./types.ts";
import { readPrices } from "./adapters/okx-read.ts";

const NOW = FIXTURE_NOW_MS;
const MAX_AGE = 60_000;
const SOURCE: SourceInfo = { id: "synthetic_fixture", endpoint: null, method: null, apiVersion: null, adapterVersion: ADAPTER_VERSION, tier: "not_applicable" };
const KEY_A = `1:contract:${FIXTURE_TOKEN_A}`;
const BALANCES_PATH = "/api/v6/dex/balance/all-token-balances-by-address";
const HISTORY_PATH = "/api/v6/dex/post-transaction/transactions-by-address";
const OVERVIEW_PATH = "/api/v6/dex/market/portfolio/overview";
const RECENT_PATH = "/api/v6/dex/market/portfolio/recent-pnl";
const PRICE_PATH = "/api/v6/dex/market/price";
const INFO_PATH = "/api/v6/dex/market/token/basic-info";
const rowA = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "2.5", rawBalance: "2500000", tokenPrice: "4", isRiskToken: false };
const BASE: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1", totalValue: false, market: false };

function balances(rows = syntheticBalanceRows(), extra: Partial<BalanceBuildInput> = {}) {
  return buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows, source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: MAX_AGE, ...extra });
}
function router(routes: Record<string, FakeReply | ((call: FakeCall) => FakeReply)>) {
  return (call: FakeCall): FakeReply => {
    const route = routes[call.path];
    if (route === undefined) return { status: 404, body: "" };
    return typeof route === "function" ? route(call) : route;
  };
}

describe("R1 the price clock is compared with the moment the PRICE was read, not the balances", () => {
  test("a slow refresh (1 request per second, history and PnL before the market read) keeps the value", async () => {
    const { http, clock } = makeStack(
      router({
        [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) },
        [HISTORY_PATH]: { body: envelope([{ cursor: "", transactionList: [] }]) },
        [OVERVIEW_PATH]: { body: envelope({ realizedPnlUsd: "1" }) },
        [RECENT_PATH]: { body: envelope({ cursor: "", pnlList: [] }) },
        [PRICE_PATH]: (call) => ({ body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, time: String(call.atMs), price: "4" }]) }),
        [INFO_PATH]: { body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, decimal: "6" }]) },
      }),
      { requestsPerSecond: 1, burst: 1 },
    );
    const request: CollectRequest = { ...BASE, history: {}, addressAnalysis: { chains: ["1", "56"] }, market: { price: true, decimals: true } };
    const outcome = await collectWalletEvidence({ http, now: clock.now }, request, { origin: "synthetic_fixture" });
    const position = outcome.evidence.balances!.positions[0]!;
    expect(outcome.evidence.balances!.timing.fetchedAtMs).toBeLessThan(outcome.evidence.market!.prices[0]!.timeMs! - 5_000);
    expect(position.valuation.state).toEqual({ kind: "ok", code: "ok" });
    expect(position.included).toBe(true);
    expect(outcome.evidence.netWorth.valueText).toBe("10");
  });

  test("a price evidence records when it was read", async () => {
    const read = await readPrices(makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, time: "1759999990000", price: "4" }]) }]).http, [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }]);
    expect(typeof read.value.prices[0]!.fetchedAtMs).toBe("number");
  });

  test("the builder uses the hint's own read time as the reference, and its freshness boundaries are exact", () => {
    const hint = (timeMs: number, fetchedAtMs: number) => new Map([[KEY_A, { priceText: "4", timeMs, fetchedAtMs }]]);
    const at = (timeMs: number, readAt: number) => balances([balanceRow()], { fetchedAtMs: NOW - 20_000, priceHints: hint(timeMs, readAt) }).positions[0]!.valuation.state;
    expect(at(NOW - 500, NOW - 400)).toEqual({ kind: "ok", code: "ok" });
    // exactly maxAge old is fresh, one millisecond more is stale (guards a wrong unit or threshold)
    expect(at(NOW - MAX_AGE, NOW).kind).toBe("ok");
    expect(at(NOW - MAX_AGE - 1, NOW).kind).toBe("stale");
    // exactly the future tolerance is fresh, one millisecond more is future
    expect(at(NOW + 5_000, NOW).kind).toBe("ok");
    expect(at(NOW + 5_001, NOW).kind).toBe("future");
  });

  test("a hint without a read time falls back to the balances read time", () => {
    const state = balances([balanceRow()], { fetchedAtMs: NOW - 1000, priceHints: new Map([[KEY_A, { priceText: "4", timeMs: NOW - 400 * 86_400_000 }]]) }).positions[0]!.valuation.state;
    expect(state.kind).toBe("stale");
  });

  test("the price clock is read only as a plain 13 digit number of milliseconds", async () => {
    const token = [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }];
    const read = async (time: unknown) => (await readPrices(makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, time, price: "4" }]) }]).http, token)).value.prices[0]!.timeMs;
    for (const bad of ["1.75999999e12", "0x19a4f8c3a00", " 1759999990000 ", "1759999990000.5", "01759999990000", "5000000000000", "0999999999999", -1759999990000, 1.5, null]) expect(await read(bad)).toBeNull();
    expect(await read("1759999990000")).toBe(1_759_999_990_000);
    expect(await read(1759999990000)).toBe(1_759_999_990_000);
  });
});

describe("R2 the cache age is measured from the OLDEST capture inside the evidence", () => {
  const routes = router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } });
  const config = { origin: "synthetic_fixture" as const, maxAgeMs: 60_000, cacheTtlMs: 600_000 };

  test("a collection that took seconds does not stretch the life of its first read", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://r2" });
    const stack = makeStack(
      router({
        [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) },
        [HISTORY_PATH]: { body: envelope([{ cursor: "", transactionList: [] }]) },
        [OVERVIEW_PATH]: { body: envelope({ realizedPnlUsd: "1" }) },
        [RECENT_PATH]: { body: envelope({ cursor: "", pnlList: [] }) },
      }),
      { requestsPerSecond: 1, burst: 1 },
    );
    const request: CollectRequest = { ...BASE, history: {}, addressAnalysis: { chains: ["1"] } };
    const first = await collectWalletEvidence({ http: stack.http, now: stack.clock.now, store }, request, config);
    const oldest = first.evidence.balances!.timing.fetchedAtMs!;
    expect(first.evidence.generatedAtMs - oldest).toBeGreaterThanOrEqual(3_000);
    stack.clock.set(first.evidence.generatedAtMs + 58_000); // 58 s after generation, 61 s after the first read
    const second = await collectWalletEvidence({ http: stack.http, now: stack.clock.now, store }, request, config);
    expect(second.cache.hit).toBe(false);
    expect(second.evidence.revision).toBe(2);
  });

  test("boundaries: exactly maxAge is a hit, one millisecond more is a miss, a clock that went backwards is a miss", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://r2b" });
    const { http, clock } = makeStack(routes);
    const first = await collectWalletEvidence({ http, now: clock.now, store }, BASE, config);
    const t0 = first.evidence.balances!.timing.fetchedAtMs!;
    clock.set(t0 + 60_000);
    expect((await collectWalletEvidence({ http, now: clock.now, store }, BASE, config)).cache).toEqual({ hit: true, ageMs: 60_000 });
    clock.set(t0 + 60_001);
    expect((await collectWalletEvidence({ http, now: clock.now, store }, BASE, config)).cache.hit).toBe(false);
    const fresh = await collectWalletEvidence({ http, now: clock.now, store }, BASE, { ...config, forceRefresh: true });
    clock.set(fresh.evidence.balances!.timing.fetchedAtMs! - 1_000);
    expect((await collectWalletEvidence({ http, now: clock.now, store }, BASE, config)).cache.hit).toBe(false);
  });
});

describe("R3 evidence from a failed or interrupted refresh is never served from the cache", () => {
  test("all calls fail: the second run calls again instead of replaying the failure", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://r3" });
    const { http, fake, clock } = makeStack(() => ({ status: 500, body: "" }), { maxRetries: 0 });
    const config = { origin: "synthetic_fixture" as const, cacheTtlMs: 30_000 };
    const first = await collectWalletEvidence({ http, now: clock.now, store }, BASE, config);
    expect(first.evidence.collection?.errors.length).toBeGreaterThan(0);
    const calls = fake.calls.length;
    const second = await collectWalletEvidence({ http, now: clock.now, store }, BASE, config);
    expect(second.cache.hit).toBe(false);
    expect(fake.calls.length).toBeGreaterThan(calls);
  });

  test("a budget-truncated evidence is not served to a request that has a larger budget", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://r3b" });
    const { http, fake, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) }, "/api/v6/dex/balance/total-value-by-address": { body: envelope([{ totalValue: "10" }]) } }));
    const request: CollectRequest = { ...BASE, totalValue: true };
    await collectWalletEvidence({ http, now: clock.now, store }, request, { origin: "synthetic_fixture", cacheTtlMs: 30_000, maxCalls: 1 });
    const calls = fake.calls.length;
    const larger = await collectWalletEvidence({ http, now: clock.now, store }, request, { origin: "synthetic_fixture", cacheTtlMs: 30_000, maxCalls: 5 });
    expect(larger.cache.hit).toBe(false);
    expect(fake.calls.length).toBeGreaterThan(calls);
  });

  test("a refresh with an error in ANY part is not replayed, even when the balances were read", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://r3c" });
    const { http, fake, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) }, "/api/v6/dex/balance/total-value-by-address": { body: envelope([], "50001", "busy") } }));
    const request: CollectRequest = { ...BASE, totalValue: true };
    const config = { origin: "synthetic_fixture" as const, cacheTtlMs: 30_000 };
    const first = await collectWalletEvidence({ http, now: clock.now, store }, request, config);
    expect(first.evidence.balances).not.toBeNull();
    expect(first.evidence.collection?.errors).toHaveLength(1);
    const calls = fake.calls.length;
    expect((await collectWalletEvidence({ http, now: clock.now, store }, request, config)).cache.hit).toBe(false);
    expect(fake.calls.length).toBeGreaterThan(calls);
  });

  test("a refresh that only SKIPPED something (no error, no stop) is not replayed either", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://r3d" });
    const rowB = { ...rowA, tokenContractAddress: "0x00000000000000000000000000000000000b0002", symbol: "FIXB" };
    const { http, fake, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA, rowB] }]) }, "/api/v6/dex/market/token/top-liquidity": { body: envelope([{ liquidityUsd: "1000000" }]) } }));
    const request: CollectRequest = { ...BASE, market: { price: false, decimals: false, liquidity: true } };
    const config = { origin: "synthetic_fixture" as const, cacheTtlMs: 30_000, perTokenCap: 1 };
    const first = await collectWalletEvidence({ http, now: clock.now, store }, request, config);
    expect(first.evidence.collection).toMatchObject({ errors: [], stoppedBy: null });
    expect(first.evidence.collection?.skipped.length).toBeGreaterThan(0);
    const calls = fake.calls.length;
    expect((await collectWalletEvidence({ http, now: clock.now, store }, request, config)).cache.hit).toBe(false);
    expect(fake.calls.length).toBeGreaterThan(calls);
  });

  test("the fingerprint covers every budget", () => {
    const fp = (extra: { maxCalls?: number; maxPagesPerEndpoint?: number; deadlineMs?: number; perTokenCap?: number }) => requestFingerprint(BASE, { origin: "synthetic_fixture", ...extra });
    const base = fp({});
    for (const extra of [{ maxCalls: 5 }, { maxPagesPerEndpoint: 2 }, { deadlineMs: 10_000 }, { perTokenCap: 2 }]) expect(fp(extra)).not.toBe(base);
    expect(fp({ maxCalls: 12 })).toBe(base);
  });
});

describe("the command line (R3, R7, R8 and the surviving mutants)", () => {
  const credentials = { OKX_WEB3_API_KEY: CANARY_CREDENTIALS.apiKey, OKX_WEB3_API_SECRET: CANARY_CREDENTIALS.secretKey, OKX_WEB3_API_PASSPHRASE: CANARY_CREDENTIALS.passphrase };
  const live = ["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--live", "--credentials-from-env", "--allow-network", "--no-total", "--no-market", "--risk-filter", "1"];
  function io(overrides: Partial<CliIo> = {}, reply: (call: FakeCall) => FakeReply = router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } })) {
    const clock = makeClock();
    const out: string[] = [];
    const err: string[] = [];
    const fake = makeFakeFetch(reply, clock);
    const base: CliIo = { env: credentials, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line), err: (line) => err.push(line), fs: makeMemoryFs() };
    return { io: { ...base, ...overrides }, out, err, fake, clock };
  }

  test("R3: a cached failure is not served and never exits 0", async () => {
    const state = makeMemoryFsState();
    const args = [...live, "--store-dir", "mem://cli-r3", "--cache-ttl-ms", "30000"];
    const a = io({ fs: makeMemoryFs(state) }, () => ({ status: 500, body: "" }));
    expect(await runCli(args, a.io)).toBe(1);
    const b = io({ fs: makeMemoryFs(state), now: a.clock.now, sleep: a.clock.sleep, fetch: a.io.fetch }, () => ({ status: 500, body: "" }));
    expect(await runCli(args, b.io)).toBe(1);
    expect(b.out.join("\n")).toContain("falhou");
    expect(b.err.join("\n")).not.toContain("Servido do cache");
  });

  test("R7: a store write failure exits non-zero and still prints the evidence", async () => {
    const fs = makeMemoryFs(makeMemoryFsState(), { before: (operation) => { if (operation === "writeAtomic") throw new Error("disco cheio"); } });
    const { io: cli, out, err } = io({ fs });
    expect(await runCli([...live, "--store-dir", "mem://cli-r7"], cli)).toBe(1);
    expect(out.join("\n")).toContain("Patrimonio");
    expect([...out, ...err].join("\n")).toContain("store_write_failed");
  });

  test("R7: a refresh that skipped something exits non-zero", async () => {
    const { io: cli } = io({}, router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) }, "/api/v6/dex/balance/total-value-by-address": { body: envelope([{ totalValue: "10" }]) } }));
    expect(await runCli(["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--live", "--credentials-from-env", "--allow-network", "--no-market", "--risk-filter", "1", "--max-calls", "1"], cli)).toBe(1);
  });

  test("R7: an integrity failure of the store is not disguised as a write failure", async () => {
    const broken: EvidenceStore = { latest: () => null, put: () => { throw new EvidenceIntegrityError(); } };
    const { http, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } }));
    await expect(collectWalletEvidence({ http, now: clock.now, store: broken }, BASE, { origin: "synthetic_fixture" })).rejects.toBeInstanceOf(EvidenceIntegrityError);
    expect(() => createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://x" }).put({ contentSha256: "x" } as never, "a".repeat(64))).toThrow(EvidenceIntegrityError);
  });

  test("R8: --max-age-ms exists, and a TTL above it is reported as capped", async () => {
    const args = [...live, "--max-age-ms", "300000", "--cache-ttl-ms", "300000", "--store-dir", "mem://cli-r8"];
    const { io: cli, out, err } = io();
    expect(await runCli(args, cli)).toBe(0);
    expect([...out, ...err].join("\n")).not.toContain("limitado");
    const capped = io();
    expect(await runCli([...live, "--cache-ttl-ms", "300000", "--store-dir", "mem://cli-r8b"], capped.io)).toBe(0);
    expect([...capped.out, ...capped.err].join("\n")).toContain("limitado");
    expect(await runCli([...live, "--max-age-ms", "abc"], io().io)).toBe(2);
  });

  test("-h works like --help", async () => {
    const { io: cli, out } = io();
    expect(await runCli(["-h"], cli)).toBe(0);
    expect(out.length).toBeGreaterThan(3);
  });

  test("--json keeps stdout parseable even when the store fails and the quota note is printed", async () => {
    const fs = makeMemoryFs(makeMemoryFsState(), { before: (operation) => { if (operation === "writeAtomic") throw new Error("disco cheio"); } });
    const { io: cli, out, err } = io({ fs });
    await runCli([...live, "--store-dir", "mem://cli-json", "--json"], cli);
    expect(out).toHaveLength(1);
    expect(() => JSON.parse(out[0]!)).not.toThrow();
    expect(err.join("\n")).toContain("Requisicoes HTTP");
    expect(err.join("\n")).toContain("store_write_failed");
  });

  test("the plan lists the market endpoints with the tier of the project registry", async () => {
    const { io: cli, out } = io();
    await runCli(["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--liquidity", "--risk"], cli);
    const text = out.join("\n");
    expect(text).toContain("market.token.advanced-info: GET /api/v6/dex/market/token/advanced-info (tier premium");
    expect(text).toContain("market.price.price: POST /api/v6/dex/market/price (tier basic");
  });
});

describe("the market section records the tier of the endpoints it used", () => {
  test("basic for price and decimals; basic and premium when risk is read too", async () => {
    const routes = router({
      [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) },
      [PRICE_PATH]: (call) => ({ body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, time: String(call.atMs), price: "4" }]) }),
      [INFO_PATH]: { body: envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, decimal: "6" }]) },
      "/api/v6/dex/market/token/advanced-info": { body: envelope([{ riskControlLevel: "1", tokenTags: [] }]) },
    });
    const run = async (market: NonNullable<CollectRequest["market"]>) => {
      const { http, clock } = makeStack(routes);
      return (await collectWalletEvidence({ http, now: clock.now }, { ...BASE, market }, { origin: "synthetic_fixture" })).evidence.market!.source.tier;
    };
    expect(await run({ price: true, decimals: true })).toBe("basic");
    expect(await run({ price: true, decimals: true, risk: true })).toBe("basic+premium");
  });
});

describe("R5 and R6 identity and duplicates", () => {
  test("R5: only the exact lowercase 0x prefix makes the native alias; 0X is not an address", () => {
    expect(buildIdentity("1", "0xEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeee")).toMatchObject({ ok: true, identity: { key: "1:native" } });
    expect(buildIdentity("1", "0XEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeeeEEEEeeee")).toEqual({ ok: false, code: "invalid_contract_for_network" });
    expect(buildIdentity("501", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toEqual({ ok: false, code: "invalid_contract_for_network" });
  });

  test("R6: a duplicate whose risk flag differs, even as garbage, is a conflict and not collapsed", () => {
    for (const flag of ["garbage", undefined, true]) {
      const section = balances([balanceRow({ locator: "/a" }), balanceRow({ locator: "/b", isRiskToken: flag })]);
      expect(section.positions[0]!.state.kind).toBe("divergent");
      expect(section.positions[0]!.included).toBe(false);
    }
  });

  test("F3 survivor: one identical duplicate without an address makes the whole group unverified", () => {
    const section = balances([balanceRow({ locator: "/a" }), balanceRow({ locator: "/b", address: undefined })]);
    expect(section.positions).toHaveLength(1);
    expect(section.positions[0]!.valuation.state).toEqual({ kind: "unverified", code: "account_unverified" });
    expect(section.positions[0]!.included).toBe(false);
  });
});

describe("R10 the store checks the full account hash", () => {
  test("a different account hash with the same 16 hex prefix is not served", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://r10" });
    const { http, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } }));
    const config = { origin: "synthetic_fixture" as const };
    const outcome = await collectWalletEvidence({ http, now: clock.now, store }, BASE, config);
    const fingerprint = requestFingerprint(BASE, config);
    const sha = accountRefOf(FIXTURE_ACCOUNT).sha256;
    expect(store.latest(sha, fingerprint)?.contentSha256).toBe(outcome.evidence.contentSha256);
    expect(store.latest(`${sha.slice(0, 16)}${"0".repeat(48)}`, fingerprint)).toBeNull();
  });
});

describe("F16 and F5 survivors", () => {
  test("a negative gap keeps the causes that can lower a total", () => {
    const section = balances(syntheticBalanceRows(), { reportedTotal: { valueText: "40", assetType: "tokens", chains: ["1", "8453"], excludeRiskToken: "1", fetchedAtMs: NOW - 900 } });
    const gap = reconcile({ balances: section, history: null, market: null, addressAnalysis: null }).totalVsSum!;
    expect(gap.candidateCauses).toEqual(["chains_differ_between_calls"]);
    expect(gap.state).toEqual({ kind: "unreconciled", code: "total_differs_candidate_causes" });
  });

  test("a call made long after the balances is a cause of a negative gap too", () => {
    const section = balances(syntheticBalanceRows(), { reportedTotal: { valueText: "40", assetType: "tokens", chains: ["1"], excludeRiskToken: "1", fetchedAtMs: NOW + 120_000 } });
    expect(reconcile({ balances: section, history: null, market: null, addressAnalysis: null }).totalVsSum!.candidateCauses).toEqual(["calls_far_apart_in_time"]);
  });

  test("M64: a re-hashed evidence with another schema is still rejected", () => {
    const real = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: MAX_AGE, account: FIXTURE_ACCOUNT, balances: balances() });
    const { contentSha256: _hash, evidenceId: _id, ...body } = real;
    const forged = { ...body, schema: "wallet_evidence_v3" };
    const hash = hashOf(forged);
    expect(verifyEvidence({ ...forged, evidenceId: hash.slice(0, 16), contentSha256: hash } as never)).toBe(false);
  });
});

describe("F12 survivors: provider text is bounded in every section", () => {
  const long = `9${"9".repeat(500)}`;
  test("an unreadable balance keeps no provider text", () => {
    const section = balances([balanceRow({ balance: `secret-${"x".repeat(100)}` })]);
    expect(section.positions[0]!.quantity.displayText).toBeNull();
    expect(JSON.stringify(section)).not.toContain("secret-");
  });

  test("expected assets, history and Address Analysis keep a chain index only when it is short digits", () => {
    const expectedBad = balances([balanceRow()], { expectedAssets: [{ chainIndex: long, tokenContractAddress: "" }] });
    expect(expectedBad.rejected).toEqual([{ locator: "expected/invalid", code: "network_mismatch", chainIndex: null }]);
    const history = buildHistorySection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows: [historyRow({ chainIndex: long })], source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: MAX_AGE, requestedFromMs: null, requestedToMs: null, pagesRead: 1, truncated: false, stopReason: "exhausted" });
    expect(history.rejected[0]!.chainIndex).toBeNull();
    const pnl = buildAddressAnalysisSection({ chainIndex: "1", timeFrame: "4", overview: null, rows: [pnlRow({ chainIndex: long })], source: SOURCE, fetchedAtMs: NOW - 1000, nowMs: NOW, maxAgeMs: MAX_AGE, pagesRead: 1, truncated: false, stopReason: "exhausted" });
    expect(pnl.rejected[0]!.chainIndex).toBeNull();
  });
});
