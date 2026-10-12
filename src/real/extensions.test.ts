import { expect, test } from "bun:test";
import { OnchainosError } from "../onchainos/errors.ts";
import type { EndpointRef, HttpInfo, HttpResult, OnchainosHttp, QueryInput, ReadMeta } from "../onchainos/http.ts";
import { createRealExtensions, type RealExtensionsInput } from "./extensions.ts";

const INPUT = { correlationId: "extensions-1", chainIndex: "196", revision: 2 };
const DEFI_CHAINS = "/api/v6/defi/product/supported-chains";
const DEFI_DETAIL = "/api/v6/defi/product/detail";
const LEADERBOARD = "/api/v6/dex/market/leaderboard/list";
const SIGNALS = "/api/v6/dex/market/signal/list";
const CONFIG = {
  defi: { qualifiedChainIndexes: ["196"], ttlMs: 60000, investmentId: "17" },
  signals: { qualifiedChainIndexes: ["196"], ttlMs: 30000,
    leaderboardQuery: { timeFrame: "1d", sortBy: "pnl" } },
} as const;
const ENABLED = { ...INPUT, enabledFamilies: ["defi", "signals"], config: CONFIG } as const;
type RecordedCall = { path: string; query: QueryInput | undefined };

function recorder(reply?: (call: RecordedCall) => Promise<HttpResult> | HttpResult, info: Partial<HttpInfo> = {}) {
  const calls: RecordedCall[] = [];
  const posts: unknown[] = [];
  const http = {
    info: { source: "onchainos-rest-v6", origin: "fixture", ready: true, requestsPerSecond: 1,
      burst: 1, timeoutMs: 1000, maxRetries: 0, ...info },
    async get(endpoint: EndpointRef, query?: QueryInput) {
      const call = { path: endpoint.path, query };
      calls.push(call);
      return reply ? reply(call) : response(call.path, []);
    },
    async post(_endpoint: EndpointRef, body: unknown) {
      posts.push(body);
      throw new Error("POST must never be called");
    },
  } as unknown as OnchainosHttp;
  return { calls, posts, http, adapter: createRealExtensions({ http, now: () => 1200 }) };
}

function response(path: string, data: unknown, meta: Partial<ReadMeta> = {}): HttpResult {
  return { data, meta: { source: "onchainos-rest-v6", endpoint: path, tier: "unknown", httpStatus: 200,
    attempts: 1, requestedAtMs: 1000, receivedAtMs: 1100, ...meta } };
}

test("EX01 default OFF and missing family config produce stable blocks without requests", async () => {
  const { adapter, calls, posts } = recorder();
  for (const enabledFamilies of [undefined, [], ["defi", "signals"]] as const) {
    const result = await adapter.read({ ...INPUT, enabledFamilies });
    expect(result.envelopes.defiChains.error).toBe(enabledFamilies?.length ? "extension-config-required" : "extension-disabled");
    expect(result.envelopes.defiDetail.data).toBeNull();
    expect(result.envelopes.leaderboard.status).toBe("blocked");
    expect(result.capabilities).toHaveLength(4);
    expect(result.capabilities.every((item) => item.reason !== null && !item.exercisedReal && !item.financiallyQualified)).toBe(true);
  }
  expect(calls).toHaveLength(0);
  expect(posts).toHaveLength(0);
});

test("EX02/EX03 unavailable transport or absent family-specific chain qualification blocks before every request", async () => {
  for (const [info, expected] of [
    [{ ready: false }, "web3-credentials-unavailable"],
    [{ maxRetries: 2 }, "extension-retries-not-zero"],
    [{ source: "okx-public-v5" }, "extension-source-incompatible"],
  ] as const) {
    const { adapter, calls, posts } = recorder(undefined, info);
    const result = await adapter.read(ENABLED);
    expect(Object.values(result.envelopes).every((item) => item.status === "blocked" && item.error === expected)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(posts).toHaveLength(0);
  }
  const { adapter, calls } = recorder();
  const result = await adapter.read({ ...ENABLED, config: {
    defi: { ...CONFIG.defi, qualifiedChainIndexes: ["1"] },
    signals: { ...CONFIG.signals, qualifiedChainIndexes: ["501"] },
  } });
  expect(Object.values(result.envelopes).every((item) => item.error === "extension-chain-unqualified")).toBe(true);
  expect(calls).toHaveLength(0);
});

test("EX04 eligible reads are exactly three serial GETs through existing clients with fixed invocation chain", async () => {
  const resolvers: Array<(value: HttpResult) => void> = [];
  const { adapter, calls, posts } = recorder(() => new Promise<HttpResult>((resolve) => resolvers.push(resolve)));
  const pending = adapter.read(ENABLED);
  await Bun.sleep(0);
  expect(calls.map((call) => call.path)).toEqual([DEFI_CHAINS]);
  resolvers[0]!(response(DEFI_CHAINS, [{ chainIndex: "196", network: "XLAYER" }]));
  await Bun.sleep(0);
  expect(calls.map((call) => call.path)).toEqual([DEFI_CHAINS, DEFI_DETAIL]);
  expect(calls[1]!.query).toEqual({ investmentId: "17" });
  resolvers[1]!(response(DEFI_DETAIL, { investmentId: "17", chainIndex: "196", rate: "0.03", tvl: "1000" }));
  await Bun.sleep(0);
  expect(calls.map((call) => call.path)).toEqual([DEFI_CHAINS, DEFI_DETAIL, LEADERBOARD]);
  expect(calls[2]!.query?.chainIndex).toBe("196");
  expect(calls[2]!.query?.timeFrame).toBe(1);
  expect(calls[2]!.query?.sortBy).toBe(1);
  resolvers[2]!(response(LEADERBOARD, [{ realizedPnlUsd: "-2", txs: "3" }]));
  const result = await pending;
  expect(Object.values(result.envelopes).map((item) => item.status)).toEqual(["ready", "ready", "ready"]);
  expect(posts).toHaveLength(0);
});

test("EX07 abort before read sends nothing and abort in flight discards late data and prevents later GETs", async () => {
  const first = recorder();
  const already = new AbortController();
  already.abort();
  const before = await first.adapter.read(ENABLED, already.signal);
  expect(first.calls).toHaveLength(0);
  expect(Object.values(before.envelopes).every((item) => item.error === "extension-aborted" && item.data === null)).toBe(true);

  let resolveFirst!: (value: HttpResult) => void;
  const inFlight = recorder(() => new Promise<HttpResult>((resolve) => { resolveFirst = resolve; }));
  const controller = new AbortController();
  const pending = inFlight.adapter.read(ENABLED, controller.signal);
  await Bun.sleep(0);
  expect(inFlight.calls).toHaveLength(1);
  controller.abort();
  resolveFirst(response(DEFI_CHAINS, [{ chainIndex: "196" }]));
  const result = await pending;
  expect(inFlight.calls).toHaveLength(1);
  expect(Object.values(result.envelopes).every((item) => item.error === "extension-aborted" && item.data === null && item.httpStatus === null)).toBe(true);
  expect(result.capabilities.every((item) => !item.exercisedReal && !item.financiallyQualified)).toBe(true);
});

test("invalid identity and family config fail closed before that family's first request and never echo arbitrary input", async () => {
  for (const change of [
    { correlationId: "https://private.invalid/secret" }, { correlationId: "a".repeat(97) },
    { chainIndex: "x-layer" }, { revision: -1 }, { revision: 0.5 },
    { enabledFamilies: ["funding"] }, { address: "private-wallet-sentinel" },
  ]) {
    const { adapter, calls } = recorder();
    const result = await adapter.read({ ...ENABLED, ...change } as unknown as RealExtensionsInput);
    expect(calls).toHaveLength(0);
    expect(Object.values(result.envelopes).every((item) => item.error === "invalid-extension-input")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("https://private.invalid");
    expect(JSON.stringify(result)).not.toContain("private-wallet-sentinel");
  }
  for (const change of [
    { ttlMs: 0 }, { ttlMs: -1 }, { ttlMs: Infinity }, { ttlMs: NaN },
    { investmentId: "non-numeric" }, { qualifiedChainIndexes: "196" },
  ]) {
    const { adapter, calls } = recorder();
    const result = await adapter.read({ ...ENABLED, enabledFamilies: ["defi"], config: {
      defi: { ...CONFIG.defi, ...change },
    } } as unknown as RealExtensionsInput);
    expect(calls).toHaveLength(0);
    expect(result.envelopes.defiChains.error).toBe("invalid-extension-config");
  }
  for (const leaderboardQuery of [
    { timeFrame: "1h", sortBy: "pnl" }, { timeFrame: "1d", sortBy: "random" },
    { timeFrame: "1d", sortBy: "pnl", walletType: "smart_money_signal_only" },
    { timeFrame: "1d", sortBy: "pnl", address: "private-wallet-sentinel" },
  ]) {
    const { adapter, calls } = recorder();
    const result = await adapter.read({ ...ENABLED, enabledFamilies: ["signals"], config: {
      signals: { ...CONFIG.signals, leaderboardQuery },
    } } as unknown as RealExtensionsInput);
    expect(calls).toHaveLength(0);
    expect(result.envelopes.leaderboard.error).toBe("invalid-extension-config");
  }
});

test("EX08 incompatible metadata is rejected without copying source, endpoint or invalid collection times", async () => {
  for (const meta of [
    { source: "okx-public-v5" }, { endpoint: "https://private.invalid/wallet" },
    { requestedAtMs: NaN }, { receivedAtMs: Infinity }, { receivedAtMs: 999 }, { attempts: 2 },
  ] as const) {
    const { adapter, calls } = recorder((call) => response(call.path, [], meta));
    const result = await adapter.read({ ...ENABLED, enabledFamilies: ["signals"] });
    expect(calls).toHaveLength(1);
    expect(result.envelopes.leaderboard.status).toBe("error");
    expect(result.envelopes.leaderboard.error).toBe("extension-metadata-incompatible");
    expect(result.envelopes.leaderboard.data).toBeNull();
    expect(result.envelopes.leaderboard.source).toBe("onchainos-rest-v6");
    expect(result.envelopes.leaderboard.endpoint).toBe(LEADERBOARD);
    expect(JSON.stringify(result)).not.toContain("https://private.invalid");
  }
  const { adapter } = recorder((call) => response(call.path, [], { httpStatus: undefined }));
  const result = await adapter.read({ ...ENABLED, enabledFamilies: ["signals"] });
  expect(result.envelopes.leaderboard.status).toBe("ready");
  expect(result.envelopes.leaderboard.httpStatus).toBeNull();
});

test("wrong or missing DeFi detail chain identity never produces eligible detail data", async () => {
  for (const chainIndex of ["1", null]) {
    const { adapter, calls } = recorder((call) => response(call.path,
      call.path === DEFI_CHAINS ? [{ chainIndex: "196" }] : { investmentId: "17", chainIndex, rate: "3" }));
    const result = await adapter.read({ ...ENABLED, enabledFamilies: ["defi"] });
    expect(calls).toHaveLength(2);
    expect(result.envelopes.defiChains.status).toBe("ready");
    expect(result.envelopes.defiDetail.status).toBe("blocked");
    expect(result.envelopes.defiDetail.error).toBe("defi-detail-identity-mismatch");
    expect(result.envelopes.defiDetail.data).toBeNull();
  }
});

test("EX05 catalog revocation blocks detail while the independently qualified leaderboard continues", async () => {
  const { adapter, calls } = recorder((call) => response(call.path,
    call.path === DEFI_CHAINS ? [{ chainIndex: "1" }] : []));
  const result = await adapter.read(ENABLED);
  expect(calls.map((call) => call.path)).toEqual([DEFI_CHAINS, LEADERBOARD]);
  expect(result.envelopes.defiChains.status).toBe("ready");
  expect(result.envelopes.defiDetail.error).toBe("defi-chain-not-listed");
  expect(result.envelopes.defiDetail.data).toBeNull();
  expect(result.envelopes.leaderboard.status).toBe("ready");

  const noId = recorder((call) => response(call.path, [{ chainIndex: "196" }]));
  const withoutId = await noId.adapter.read({ ...ENABLED, enabledFamilies: ["defi"], config: {
    defi: { qualifiedChainIndexes: ["196"], ttlMs: 60000 },
  } });
  expect(noId.calls.map((call) => call.path)).toEqual([DEFI_CHAINS]);
  expect(withoutId.envelopes.defiDetail.error).toBe("defi-investment-id-required");
});

test("EX06/EX12 partial failures preserve own status and categorical error while independent GET remains ready", async () => {
  const secret = "provider-private-wallet-url-key-sentinel";
  const { adapter, calls } = recorder((call) => {
    if (call.path === DEFI_CHAINS) throw new OnchainosError("http", secret, {
      endpoint: `https://private.invalid/${secret}`, httpStatus: 403, providerMessage: secret, apiCode: secret,
    });
    return response(call.path, []);
  });
  const result = await adapter.read(ENABLED);
  expect(calls.map((call) => call.path)).toEqual([DEFI_CHAINS, LEADERBOARD]);
  expect(result.envelopes.defiChains.status).toBe("error");
  expect(result.envelopes.defiChains.error).toBe("onchainos-http");
  expect(result.envelopes.defiChains.httpStatus).toBe(403);
  expect(result.envelopes.defiChains.data).toBeNull();
  expect(result.envelopes.defiDetail.error).toBe("defi-catalog-unavailable");
  expect(result.envelopes.defiDetail.httpStatus).toBeNull();
  expect(result.envelopes.leaderboard.status).toBe("ready");
  expect(result.envelopes.leaderboard.httpStatus).toBe(200);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain("https://private.invalid");

  for (const failure of [new Error(secret), new OnchainosError(secret as "http", secret)]) {
    const failed = recorder(() => { throw failure; });
    const sample = await failed.adapter.read({ ...ENABLED, enabledFamilies: ["signals"] });
    expect(sample.envelopes.leaderboard.error).toBe("onchainos-schema");
    expect(sample.envelopes.leaderboard.httpStatus).toBeNull();
    expect(JSON.stringify(sample)).not.toContain(secret);
  }
});

test("EX08–EX14 metadata, unknown units, normalized values and capabilities remain honest and provider text is dropped", async () => {
  const sentinel = "untrusted-symbol-name-logo-wallet-key-url";
  const { adapter, calls, posts } = recorder((call) => response(call.path,
    call.path === DEFI_CHAINS ? [{ chainIndex: "196", name: sentinel, url: sentinel }]
      : call.path === DEFI_DETAIL ? { investmentId: "17", chainIndex: "196", rate: "0", tvl: "1000",
        feeRate: "0.03", rateTypeDesc: "APY", name: sentinel, url: sentinel, walletAddress: sentinel }
        : [{ realizedPnlUsd: "-2", realizedPnlPercent: "-10", winRatePercent: "0", txVolume: "5", txs: "0",
          lastActiveTimestamp: "1700000000000", walletAddress: sentinel, name: sentinel, logo: sentinel,
          topPnlTokenList: [{ symbol: sentinel, tokenPnlUsd: "0", tokenPnlPercent: "0" }] }]));
  const result = await adapter.read(ENABLED);
  expect(result.correlationId).toBe(INPUT.correlationId);
  expect(result.chainIndex).toBe(INPUT.chainIndex);
  expect(result.revision).toBe(INPUT.revision);
  for (const [key, path, ttl] of [["defiChains", DEFI_CHAINS, 60000], ["defiDetail", DEFI_DETAIL, 60000],
    ["leaderboard", LEADERBOARD, 30000]] as const) {
    expect(result.envelopes[key]).toMatchObject({ source: "onchainos-rest-v6", mode: "unverified", method: "GET",
      endpoint: path, chainIndex: "196", correlationId: INPUT.correlationId, requestedAtMs: 1000,
      receivedAtMs: 1100, expiresAtMs: 1100 + ttl, sourceAtMs: null, unit: null, httpStatus: 200, error: null });
  }
  expect(result.envelopes.defiDetail.data).toMatchObject({ investmentId: "17", advertisedRate: 0, tvl: 1000,
    feeRate: 0.03, utilizationRate: null, rateKind: "APY", isInvestable: null });
  expect(result.envelopes.leaderboard.data?.[0]).toMatchObject({ realizedPnlUsd: -2, realizedPnlPercent: -10,
    winRatePercent: 0, avgBuyValueUsd: null, txVolumeUsd: 5, txs: 0, lastActiveTimestampMs: 1700000000000 });
  expect(result.envelopes.leaderboard.data?.[0]?.topPnlTokens[0]).toEqual({ tokenContractAddress: null,
    tokenPnlUsd: 0, tokenPnlPercent: 0 });
  expect(JSON.stringify(result)).not.toContain(sentinel);
  expect(result.capabilities.every((row) => row.documented && row.implemented && !row.exercisedReal && !row.financiallyQualified)).toBe(true);
  expect(result.capabilities.filter((row) => row.method === "GET").every((row) => row.integrated && row.status === "ready")).toBe(true);
  expect(result.capabilities.find((row) => row.endpoint === SIGNALS)).toMatchObject({ method: "POST", integrated: false,
    status: "blocked", reason: "latest-signals-post-excluded", nextRequirement: "separate-post-profile-budget-and-endpoint-chain-entitlement-qualification" });
  expect(result.capabilities.some((row) => row.family === "funding")).toBe(false);
  expect(calls).toHaveLength(3);
  expect(posts).toHaveLength(0);
});

test("EX15 concurrent reads keep identities separate and an invocation snapshots caller configuration", async () => {
  const resolvers: Array<(value: HttpResult) => void> = [];
  const { adapter, calls } = recorder(() => new Promise<HttpResult>((resolve) => resolvers.push(resolve)));
  const first: RealExtensionsInput = { ...INPUT, enabledFamilies: ["defi", "signals"], config: {
    defi: { ...CONFIG.defi, qualifiedChainIndexes: ["196"] },
    signals: { ...CONFIG.signals, qualifiedChainIndexes: ["196"] },
  } };
  const a = adapter.read(first);
  const b = adapter.read({ ...ENABLED, correlationId: "extensions-2", revision: 3, enabledFamilies: ["signals"] });
  await Bun.sleep(0);
  expect(calls.map((call) => call.path)).toEqual([DEFI_CHAINS, LEADERBOARD]);
  first.chainIndex = "1";
  first.correlationId = "mutated";
  first.revision = 99;
  first.config!.defi!.investmentId = "99";
  first.config!.signals!.leaderboardQuery = { timeFrame: "3m", sortBy: "roi" };
  resolvers[1]!(response(LEADERBOARD, []));
  const second = await b;
  expect(second).toMatchObject({ correlationId: "extensions-2", chainIndex: "196", revision: 3 });
  expect(second.envelopes.leaderboard.correlationId).toBe("extensions-2");
  resolvers[0]!(response(DEFI_CHAINS, [{ chainIndex: "196" }]));
  await Bun.sleep(0);
  expect(calls[2]?.path).toBe(DEFI_DETAIL);
  expect(calls[2]?.query?.investmentId).toBe("17");
  resolvers[2]!(response(DEFI_DETAIL, { investmentId: "17", chainIndex: "196" }));
  await Bun.sleep(0);
  expect(calls[3]?.query).toMatchObject({ chainIndex: "196", timeFrame: 1, sortBy: 1 });
  resolvers[3]!(response(LEADERBOARD, []));
  const original = await a;
  expect(original).toMatchObject({ correlationId: INPUT.correlationId, chainIndex: "196", revision: 2 });
  expect(Object.values(original.envelopes).every((item) => item.chainIndex === "196" && item.correlationId === INPUT.correlationId)).toBe(true);
  expect(calls).toHaveLength(4);
});

test("EX02 transport gate is rechecked before subsequent GETs if readiness changes in flight", async () => {
  let resolveFirst!: (value: HttpResult) => void;
  const { adapter, calls, http } = recorder(() => new Promise<HttpResult>((resolve) => { resolveFirst = resolve; }));
  const pending = adapter.read(ENABLED);
  await Bun.sleep(0);
  Object.assign(http.info, { maxRetries: 2 });
  resolveFirst(response(DEFI_CHAINS, [{ chainIndex: "196" }]));
  // Every later endpoint must block rather than inherit the earlier transport eligibility.
  await Bun.sleep(0);
  expect(calls).toHaveLength(1);
  const result = await pending;
  expect(result.envelopes.defiChains.status).toBe("ready");
  expect(result.envelopes.defiDetail.error).toBe("extension-retries-not-zero");
  expect(result.envelopes.leaderboard.error).toBe("extension-retries-not-zero");
});
