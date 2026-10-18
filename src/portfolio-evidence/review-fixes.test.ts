/**
 * Regression tests for the independent review of this module (docs/research/spec-review-20261012/spec-review-portfolio-evidence.md).
 * Each block names the finding it closes (F1 to F19) and, for F5, the surviving mutants. Written BEFORE the fixes: they failed
 * against the reviewed code. All data is SYNTHETIC.
 */

import { describe, expect, test } from "bun:test";
import { CANARY_CREDENTIALS, envelope, makeClock, makeFakeFetch, makeMemoryFs, makeMemoryFsState, makeStack, type FakeCall, type FakeReply } from "../onchainos/fakes.ts";
import { buildBalanceSection, type BalanceBuildInput } from "./balances.ts";
import { runCli, type CliIo } from "./cli.ts";
import { collectWalletEvidence, requestFingerprint, type CollectRequest } from "./collector.ts";
import { buildWalletEvidence, verifyEvidence } from "./evidence.ts";
import { FIXTURE_ACCOUNT, FIXTURE_NOW_MS, FIXTURE_TOKEN_A, FIXTURE_TOKEN_B, balanceRow, syntheticBalanceRows } from "./fixtures.ts";
import { buildIdentity } from "./identity.ts";
import { reconcile } from "./reconcile.ts";
import { createEvidenceStore } from "./store.ts";
import { ADAPTER_VERSION, type SourceInfo } from "./types.ts";
import { readPrices } from "./adapters/okx-read.ts";

const NOW = FIXTURE_NOW_MS;
const MAX_AGE = 60_000;
const SOURCE: SourceInfo = { id: "synthetic_fixture", endpoint: null, method: null, apiVersion: null, adapterVersion: ADAPTER_VERSION, tier: "not_applicable" };
const KEY_A = `1:contract:${FIXTURE_TOKEN_A}`;

function balances(rows = syntheticBalanceRows(), extra: Partial<BalanceBuildInput> = {}) {
  return buildBalanceSection({ account: FIXTURE_ACCOUNT, requestedChains: ["1"], rows, source: SOURCE, excludeRiskToken: "1", tokenDiscovery: "provider_all", fetchedAtMs: NOW - 1000, sourceTimeMs: null, nowMs: NOW, maxAgeMs: MAX_AGE, ...extra });
}
function evidence(section: ReturnType<typeof balances> | null, extra: Partial<Parameters<typeof buildWalletEvidence>[0]> = {}) {
  return buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: MAX_AGE, account: FIXTURE_ACCOUNT, balances: section, ...extra });
}
function router(routes: Record<string, FakeReply | ((call: FakeCall) => FakeReply)>) {
  return (call: FakeCall): FakeReply => {
    const route = routes[call.path];
    if (route === undefined) return { status: 404, body: "" };
    return typeof route === "function" ? route(call) : route;
  };
}
const rowA = { chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, address: FIXTURE_ACCOUNT, symbol: "FIXA", balance: "2.5", rawBalance: "2500000", tokenPrice: "4", isRiskToken: false };
const BALANCES_PATH = "/api/v6/dex/balance/all-token-balances-by-address";
const BASE: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1", totalValue: false, market: false };

describe("F1 the cache never serves evidence older than its own freshness limit", () => {
  test("a TTL longer than maxAge is capped at maxAge", async () => {
    const store = createEvidenceStore({ fs: makeMemoryFs(), dir: "mem://f1" });
    const { http, fake, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } }));
    const config = { origin: "synthetic_fixture" as const, maxAgeMs: 60_000, cacheTtlMs: 600_000 };
    await collectWalletEvidence({ http, now: clock.now, store }, BASE, config);
    clock.advance(30_000);
    expect((await collectWalletEvidence({ http, now: clock.now, store }, BASE, config)).cache.hit).toBe(true);
    clock.advance(470_000);
    const late = await collectWalletEvidence({ http, now: clock.now, store }, BASE, config);
    expect(late.cache.hit).toBe(false);
    expect(fake.calls).toHaveLength(2);
    expect(late.evidence.balances?.freshness.capture).toBe("fresh");
  });

  test("the fingerprint includes the freshness limit and the tolerance", () => {
    const a = requestFingerprint(BASE, { origin: "synthetic_fixture", maxAgeMs: 60_000 });
    expect(requestFingerprint(BASE, { origin: "synthetic_fixture", maxAgeMs: 30_000 })).not.toBe(a);
    expect(requestFingerprint(BASE, { origin: "synthetic_fixture", maxAgeMs: 60_000, valueToleranceUsd: "1" })).not.toBe(a);
    expect(requestFingerprint(BASE, { origin: "synthetic_fixture", maxAgeMs: 60_000 })).toBe(a);
  });
});

describe("F2 the price clock is evaluated and normalized", () => {
  const hint = (timeMs: number | null) => new Map([[KEY_A, { priceText: "4", timeMs }]]);

  test("an agreeing market price whose clock is far behind makes the value stale and uncounted", () => {
    const section = balances([balanceRow()], { priceHints: hint(NOW - 400 * 86_400_000) });
    expect(section.positions[0]!.valuation.state).toEqual({ kind: "stale", code: "price_time_stale" });
    expect(section.positions[0]!.valuation.valueText).toBeNull();
    expect(section.positions[0]!.included).toBe(false);
    expect(evidence(section).status).toBe("stale");
  });

  test("a price clock in the future is flagged the same way", () => {
    const section = balances([balanceRow()], { priceHints: hint(NOW + 3_600_000) });
    expect(section.positions[0]!.valuation.state).toEqual({ kind: "future", code: "price_time_in_future" });
    expect(section.positions[0]!.included).toBe(false);
  });

  test("a fresh price clock keeps the value", () => {
    const section = balances([balanceRow()], { priceHints: hint(NOW - 5_000) });
    expect(section.positions[0]!.valuation.state.kind).toBe("ok");
    expect(section.positions[0]!.valuation.priceAsOfMs).toBe(NOW - 5_000);
  });

  test("seconds and microseconds are not milliseconds: the price clock is read only in the millisecond range", async () => {
    const body = (time: string) => envelope([{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A, time, price: "4" }]);
    const token = [{ chainIndex: "1", tokenContractAddress: FIXTURE_TOKEN_A }];
    const read = async (time: string) => (await readPrices(makeStack([{ body: body(time) }]).http, token)).value.prices[0]!.timeMs;
    expect(await read("1759999990")).toBeNull();
    expect(await read("1759999990000000")).toBeNull();
    expect(await read("1759999990000")).toBe(1_759_999_990_000);
  });
});

describe("F3 unreadable safety fields fail closed", () => {
  for (const [name, value] of [["a string", "false"], ["a number", 0], ["null", null], ["absent", undefined]] as const) {
    test(`isRiskToken as ${name} is not counted`, () => {
      const section = balances([balanceRow({ isRiskToken: value })]);
      expect(section.positions[0]!.included).toBe(false);
      expect(section.positions[0]!.valuation.state).toEqual({ kind: "unverified", code: "risk_flag_unreadable" });
      expect(evidence(section).netWorth.valueText).toBeNull();
    });
  }

  for (const [name, value] of [["absent", undefined], ["null", null], ["empty", ""], ["a number", 7]] as const) {
    test(`a row whose address is ${name} cannot be tied to the account and is not counted`, () => {
      const section = balances([balanceRow({ address: value })]);
      expect(section.positions[0]!.included).toBe(false);
      expect(section.positions[0]!.valuation.state).toEqual({ kind: "unverified", code: "account_unverified" });
    });
  }

  test("a readable boolean and a matching address still count", () => {
    expect(balances([balanceRow()]).positions[0]!.included).toBe(true);
  });
});

describe("F4 a value the arithmetic cannot represent is never silently dropped from the sum", () => {
  test("it is uncounted and says why, so valuedCount always equals what was summed", () => {
    const row = balanceRow({ balance: "1000000000000000000000000000000.000000000000000001", rawBalance: "1000000000000000000000000000000000000000000000001", tokenPrice: "1.0000000000000000000000000000000000000000001" });
    const section = balances([row, balanceRow({ locator: "/2", tokenContractAddress: FIXTURE_TOKEN_B, balance: "1", rawBalance: "1000000000000000000", tokenPrice: "5" })]);
    const huge = section.positions.find((position) => position.identity.key === KEY_A)!;
    expect(huge.valuation.state).toEqual({ kind: "unverified", code: "value_exceeds_precision_limits" });
    expect(huge.included).toBe(false);
    const result = evidence(section);
    expect(result.netWorth.valuedCount).toBe(1);
    expect(result.netWorth.valueText).toBe("5");
  });
});

describe("F5 surviving mutants of the review get a test", () => {
  test("M08: provider decimals with a raw balance that disagrees is divergent", () => {
    const hints = new Map([[KEY_A, { decimals: 6, source: "provider_token_info" as const }]]);
    const section = balances([balanceRow({ balance: "2.5", rawBalance: "2500001" })], { decimalsHints: hints });
    expect(section.positions[0]!.quantity.state).toEqual({ kind: "divergent", code: "raw_balance_mismatch" });
    expect(section.positions[0]!.quantity.atoms).toBeNull();
  });

  test("M35: an unknown sum is never read as zero in the total comparison", () => {
    const withTotal = (valueText: string) => balances([balanceRow({ tokenPrice: "" })], { reportedTotal: { valueText, assetType: "tokens", chains: ["1"], excludeRiskToken: "1", fetchedAtMs: NOW - 900 } });
    const zero = reconcile({ balances: withTotal("0"), history: null, market: null, addressAnalysis: null });
    expect(zero.totalVsSum?.state).toEqual({ kind: "unverified", code: "no_valued_positions_to_compare" });
    expect(zero.totalVsSum?.withinTolerance).toBeNull();
    const ten = reconcile({ balances: withTotal("10"), history: null, market: null, addressAnalysis: null });
    expect(ten.totalVsSum?.state).toEqual({ kind: "unreconciled", code: "total_without_valued_positions" });
    expect(ten.totalVsSum?.deltaText).toBe("10");
  });

  test("M63 and M64: the evidence id and the schema are part of the verification", () => {
    const result = evidence(balances());
    expect(verifyEvidence(result)).toBe(true);
    expect(verifyEvidence({ ...result, evidenceId: "0000000000000000" })).toBe(false);
    expect(verifyEvidence({ ...result, schema: "wallet_evidence_v3" as never })).toBe(false);
  });

  test("M84: the order the rows arrive in does not change the evidence hash", () => {
    const rows = syntheticBalanceRows();
    expect(evidence(balances(rows)).contentSha256).toBe(evidence(balances([...rows].reverse())).contentSha256);
  });

  function io(overrides: Partial<CliIo> = {}) {
    const clock = makeClock();
    const out: string[] = [];
    const err: string[] = [];
    const fake = makeFakeFetch(() => ({ status: 404, body: "" }), clock);
    const base: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line), err: (line) => err.push(line), fs: makeMemoryFs() };
    return { io: { ...base, ...overrides }, out, err, fake, clock };
  }
  const credentials = { OKX_WEB3_API_KEY: CANARY_CREDENTIALS.apiKey, OKX_WEB3_API_SECRET: CANARY_CREDENTIALS.secretKey, OKX_WEB3_API_PASSPHRASE: CANARY_CREDENTIALS.passphrase };
  const live = ["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--live", "--credentials-from-env", "--allow-network"];

  test("M71: an unexpected failure prints no detail and exits 2", async () => {
    const { io: cli, err } = io({ env: credentials, now: () => { throw new Error(`boom ${FIXTURE_ACCOUNT}`); } });
    expect(await runCli(live, cli)).toBe(2);
    expect(err.join(" ")).toContain("falha inesperada");
    expect(err.join(" ")).not.toContain(FIXTURE_ACCOUNT);
  });
});

describe("F6 to F8 the command line", () => {
  function io(overrides: Partial<CliIo> = {}) {
    const clock = makeClock();
    const out: string[] = [];
    const err: string[] = [];
    const fake = makeFakeFetch(() => ({ status: 404, body: "" }), clock);
    const base: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line), err: (line) => err.push(line), fs: makeMemoryFs() };
    return { io: { ...base, ...overrides }, out, err, fake, clock };
  }
  const credentials = { OKX_WEB3_API_KEY: CANARY_CREDENTIALS.apiKey, OKX_WEB3_API_SECRET: CANARY_CREDENTIALS.secretKey, OKX_WEB3_API_PASSPHRASE: CANARY_CREDENTIALS.passphrase };
  const live = ["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--live", "--credentials-from-env", "--allow-network"];

  test("F6: an unknown argument is never echoed (it may carry a secret or an address)", async () => {
    for (const arg of ["--api-key=SEGREDO123", `--address=${FIXTURE_ACCOUNT}`, "SEGREDO456"]) {
      const { io: cli, err } = io();
      expect(await runCli(["plan", arg], cli)).toBe(2);
      expect(err.join(" ")).not.toContain("SEGREDO");
      expect(err.join(" ")).not.toContain(FIXTURE_ACCOUNT);
    }
    const { io: cli, err } = io();
    expect(await runCli(["segredo789"], cli)).toBe(2);
    expect(err.join(" ")).not.toContain("segredo789");
  });

  test("F7: a refresh where every section failed exits non-zero", async () => {
    const { io: cli, out } = io({ env: credentials });
    expect(await runCli(live, cli)).toBe(1);
    expect(out.join("\n")).toContain("http_404");
  });

  test("F8: --help in first position works, and --json keeps stdout parseable on a cache hit", async () => {
    const help = io();
    expect(await runCli(["--help"], help.io)).toBe(0);
    expect(help.out.length).toBeGreaterThan(3);
    const state = makeMemoryFsState();
    const clock = makeClock();
    const fake = makeFakeFetch(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } }), clock);
    const first = io({ env: credentials, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    const args = [...live, "--no-total", "--no-market", "--risk-filter", "1", "--store-dir", "mem://f8", "--cache-ttl-ms", "30000", "--json"];
    expect(await runCli(args, first.io)).toBe(0);
    const second = io({ env: credentials, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    expect(await runCli(args, second.io)).toBe(0);
    for (const line of second.out) expect(() => JSON.parse(line)).not.toThrow();
    expect(second.err.join(" ")).toContain("cache");
  });
});

describe("F12 provider text that can be echoed or stored is bounded", () => {
  test("rawBalance must be digits only and short, otherwise it is not kept", () => {
    const secretLike = `canary-${"x".repeat(5000)}`;
    const section = balances([balanceRow({ rawBalance: secretLike })]);
    expect(section.positions[0]!.quantity.rawText).toBeNull();
    expect(section.positions[0]!.quantity.state.code).toBe("raw_balance_unreadable");
    expect(JSON.stringify(section).includes("canary-")).toBe(false);
  });

  test("a rejected row keeps a chain index only when it is a short digit string", () => {
    const section = balances([balanceRow({ locator: "/a", chainIndex: `99${"9".repeat(500)}` }), balanceRow({ locator: "/b", chainIndex: "56" })]);
    expect(section.rejected).toEqual([{ locator: "/a", code: "network_mismatch", chainIndex: null }, { locator: "/b", code: "network_mismatch", chainIndex: "56" }]);
  });
});

describe("F13 the native coin alias is the native coin", () => {
  test("0xeee...eee on an EVM network is the native marker, so the two rows cannot be summed", () => {
    const alias = buildIdentity("1", "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
    expect(alias.ok && alias.identity.key).toBe("1:native");
    const section = balances([
      balanceRow({ locator: "/native", tokenContractAddress: "", symbol: "ETH", balance: "1", rawBalance: "1000000000000000000", tokenPrice: "3000" }),
      balanceRow({ locator: "/alias", tokenContractAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", symbol: "ETH", balance: "1", rawBalance: "1000000000000000000", tokenPrice: "3000" }),
    ]);
    expect(section.positions).toHaveLength(1);
    expect(section.duplicatesCollapsed).toBe(1);
    expect(evidence(section).netWorth.valueText).toBe("3000");
  });
});

describe("F14 the store checks whose file it read", () => {
  test("a file renamed to another account's path is not served", async () => {
    const state = makeMemoryFsState();
    const store = createEvidenceStore({ fs: makeMemoryFs(state), dir: "mem://f14" });
    const { http, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } }));
    const config = { origin: "synthetic_fixture" as const };
    const first = await collectWalletEvidence({ http, now: clock.now, store }, BASE, config);
    const otherAccount = "0x00000000000000000000000000000000000f9999";
    const fingerprint = requestFingerprint({ ...BASE, address: otherAccount }, config);
    const stolen = buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: MAX_AGE, account: FIXTURE_ACCOUNT, balances: null });
    // Put a valid evidence of account A under account B's file name.
    const otherSha = (await import("./evidence.ts")).accountRefOf(otherAccount).sha256;
    const path = `mem://f14/evidence-${otherSha.slice(0, 16)}-${fingerprint.slice(0, 16)}.json`;
    state.files.set(path, JSON.stringify(stolen));
    expect(store.latest(otherSha, fingerprint)).toBeNull();
    expect(first.evidence.accountRef.sha256).not.toBe(otherSha);
  });
});

describe("F15 an empty answer is not evidence of an empty wallet", () => {
  test("no rows for the requested networks is incomplete, not valid", () => {
    const section = balances([]);
    expect(section.status).toBe("incomplete");
    expect(section.issues.some((issue) => issue.code === "no_rows_returned")).toBe(true);
    expect(section.coverage.notReported).toEqual(["1"]);
  });
});

describe("F16 a total smaller than the sum is not explained by causes that only enlarge the total", () => {
  test("reported 40 against a sum of 50 has no candidate cause and is divergent", () => {
    const section = balances(syntheticBalanceRows(), { excludeRiskToken: null, reportedTotal: { valueText: "40", assetType: "all", chains: ["1"], excludeRiskToken: null, fetchedAtMs: NOW - 900 } });
    const gap = reconcile({ balances: section, history: null, market: null, addressAnalysis: null }).totalVsSum!;
    expect(gap.deltaText).toBe("-10");
    expect(gap.candidateCauses).toEqual([]);
    expect(gap.state).toEqual({ kind: "divergent", code: "total_differs_unexplained" });
  });

  test("a larger total keeps its causes", () => {
    const section = balances(syntheticBalanceRows(), { excludeRiskToken: null, reportedTotal: { valueText: "75", assetType: "all", chains: ["1"], excludeRiskToken: null, fetchedAtMs: NOW - 900 } });
    expect(reconcile({ balances: section, history: null, market: null, addressAnalysis: null }).totalVsSum!.candidateCauses).toContain("scope_includes_defi_positions");
  });
});

describe("F19 a store failure after the reads still returns the evidence", () => {
  test("the evidence comes back and the write failure is reported, not thrown", async () => {
    const state = makeMemoryFsState();
    const fs = makeMemoryFs(state, { before: (operation) => { if (operation === "writeAtomic") throw new Error("disco cheio"); } });
    const store = createEvidenceStore({ fs, dir: "mem://f19" });
    const { http, clock } = makeStack(router({ [BALANCES_PATH]: { body: envelope([{ tokenAssets: [rowA] }]) } }));
    const outcome = await collectWalletEvidence({ http, now: clock.now, store }, BASE, { origin: "synthetic_fixture" });
    expect(verifyEvidence(outcome.evidence)).toBe(true);
    expect(outcome.persisted).toEqual({ written: false, finding: null, replacedCorrupt: false, error: "store_write_failed" });
  });
});
