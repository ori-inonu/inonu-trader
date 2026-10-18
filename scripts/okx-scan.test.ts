import { expect, test } from "bun:test";
import { createOkxReadOnlyClient, type OkxFetch, type OkxReadOnlyClient } from "../src/okx-api";
import { runOkxScan } from "./okx-scan";
import type { OkxScanDependencies, SyntheticScanFixture } from "./okx-scan";

const policy = {
  maxPriceAgeMs: 60_000,
  minPoolLiquidityUsd: 10_000,
  minHolders: 100,
  maxTop10HolderPercent: 50,
  maxRiskControlLevel: 2,
};
const identity = { chainIndex: "1", tokenContractAddress: "0xabc" };
const now = new Date("2026-10-09T20:00:00.000Z");

function syntheticFixture(): SyntheticScanFixture {
  return {
    source: "synthetic_fixture",
    policy,
    tokens: [{
      identity,
      addressComparison: "case-insensitive",
      price: "1.25",
      priceAgeMs: 0,
      holders: "1000",
      tokenTags: ["smartMoneyBuy"],
      top10HoldPercent: "20",
      riskControlLevel: "1",
      pools: [{ poolAddress: "synthetic-pool", liquidityUsd: "20000" }],
      honeypotAssessment: "not_detected",
    }],
  };
}

function dependencies(overrides: Partial<OkxScanDependencies> = {}): OkxScanDependencies {
  return {
    loadFixture: async () => syntheticFixture(),
    readPolicy: async () => policy,
    createClient: () => {
      throw new Error("unexpected OKX client creation");
    },
    now: () => now,
    ...overrides,
  };
}

test("default invocation is synthetic offline and never creates an OKX client", async () => {
  const report = await runOkxScan([], {}, dependencies());

  expect(report.mode).toBe("synthetic_fixture");
  expect(report.dataOrigin).toBe("synthetic_only");
  expect(report.implementationProvenance).toBe("synthetic_fixture");
  expect(report.externalAccessObserved).toBe(false);
  expect(report.clientMethodInvocations).toBe(0);
  expect(Object.hasOwn(report, "liveRequestsPerformed")).toBe(false);
  expect(report.apiCostUsd).toBeNull();
  expect(report.items).toHaveLength(1);
  expect(report.items[0]?.screening.status).toBe("research_candidate");
  expect(report.items[0]?.screening.executionQualification).toBe("not_qualified");
});

test("live mode requires explicit chain, stage, address comparison, bounded limit, policy and credentials before creating a client", async () => {
  let clientCreations = 0;
  const deps = dependencies({
    createClient: () => {
      clientCreations++;
      throw new Error("must not create a client without credentials");
    },
  });

  await expect(runOkxScan(["--live"], {}, deps)).rejects.toThrow("Live mode requires explicit network, stage, address comparison, limit and policy");
  await expect(runOkxScan([
    "--live", "--chain-index", "1", "--stage", "NEW", "--address-comparison", "case-sensitive",
    "--limit", "30", "--policy", "policy.json",
  ], {}, deps)).rejects.toThrow("Live mode requires complete OKX API credentials");
  expect(clientCreations).toBe(0);
});

test("arbitrary injected client labels and method calls do not establish OKX source or external access", async () => {
  const calls: string[] = [];
  const client: OkxReadOnlyClient = Object.assign({
    async getMemePumpSupportedChains() {
      calls.push("chains");
      return [];
    },
    async getMemePumpTokenList(input: Parameters<OkxReadOnlyClient["getMemePumpTokenList"]>[0]) {
      calls.push(`tokens:${input.chainIndex}:${input.stage}:${input.limit}`);
      return { items: [identity] };
    },
    async getTokenPriceInfo(tokens: Parameters<OkxReadOnlyClient["getTokenPriceInfo"]>[0]) {
      calls.push(`price:${tokens.length}`);
      return [{ ...identity, time: String(now.getTime()), price: "1.25", holders: "1000" }];
    },
    async getTokenAdvancedInfo() {
      calls.push("advanced");
      return { ...identity, tokenTags: ["smartMoneyBuy"], top10HoldPercent: "20", riskControlLevel: "1" };
    },
    async getTokenTopLiquidity() {
      calls.push("liquidity");
      return [{ pool: "TOKEN/USDC", poolAddress: "pool-1", liquidityUsd: "20000" }];
    },
  }, { implementationProvenance: "okx_api_factory", source: "okx_authenticated" });
  const deps = dependencies({
    readPolicy: async () => policy,
    createClient: () => client,
  });
  const report = await runOkxScan([
    "--live", "--chain-index", "1", "--stage", "NEW", "--address-comparison", "case-insensitive",
    "--limit", "1", "--policy", "policy.json",
  ], {
    OKX_API_KEY: "fixture-api-key",
    OKX_SECRET_KEY: "fixture-secret",
    OKX_API_PASSPHRASE: "fixture-passphrase",
  }, deps);

  expect(calls).toEqual(["tokens:1:NEW:1", "price:1", "advanced", "liquidity"]);
  expect(report.mode).toBe("read_only_scan");
  expect(report.dataOrigin).toBe("unknown");
  expect(report.implementationProvenance).toBe("unknown");
  expect(report.externalAccessObserved).toBe(false);
  expect(report.clientMethodInvocations).toBe(4);
  expect(Object.hasOwn(report, "liveRequestsPerformed")).toBe(false);
  expect(report.apiCostUsd).toBeNull();
  expect(report.items[0]?.screening.status).toBe("unknown");
  expect(report.items[0]?.screening.reasons).toContain("honeypot_unknown");
  expect(report.items[0]?.screening.executionQualification).toBe("not_qualified");
  expect(JSON.stringify(report)).not.toContain("fixture-secret");
});

test("factory provenance is implementation-only and does not transfer to copied or wrapped clients", async () => {
  const transportInvocations: string[] = [];
  const fetcher: OkxFetch = async (input) => {
    transportInvocations.push(input);
    const path = new URL(input).pathname;
    if (path.endsWith("/tokenList"))
      return new Response(JSON.stringify({ code: "0", data: { items: [identity] } }));
    if (path.endsWith("/price-info"))
      return new Response(JSON.stringify({ code: "0", data: [{ ...identity, time: String(now.getTime()), price: "1.25", holders: "1000" }] }));
    if (path.endsWith("/advanced-info"))
      return new Response(JSON.stringify({ code: "0", data: { ...identity, tokenTags: [], top10HoldPercent: "20", riskControlLevel: "1" } }));
    if (path.endsWith("/top-liquidity"))
      return new Response(JSON.stringify({ code: "0", data: [{ pool: "TOKEN/USDC", poolAddress: "pool-1", liquidityUsd: "20000" }] }));
    throw new Error("unexpected fixture transport path");
  };
  const factoryClient = createOkxReadOnlyClient({
    credentials: { apiKey: "fixture-api-key", secretKey: "fixture-secret", passphrase: "fixture-passphrase" },
    fetcher,
    now: () => now,
    allowLiveRequests: true,
  });
  const cases: { provenance: "okx_api_factory" | "unknown"; client: OkxReadOnlyClient }[] = [
    { provenance: "okx_api_factory", client: factoryClient },
    { provenance: "unknown", client: { ...factoryClient } },
    { provenance: "unknown", client: new Proxy(factoryClient, {}) },
  ];

  for (const item of cases) {
    const report = await runOkxScan([
      "--live", "--chain-index", "1", "--stage", "NEW", "--address-comparison", "case-insensitive",
      "--limit", "1", "--policy", "policy.json",
    ], {
      OKX_API_KEY: "fixture-api-key",
      OKX_SECRET_KEY: "fixture-secret",
      OKX_API_PASSPHRASE: "fixture-passphrase",
    }, dependencies({ readPolicy: async () => policy, createClient: () => item.client }));

    expect(report.mode).toBe("read_only_scan");
    expect(report.dataOrigin).toBe("unknown");
    expect(report.implementationProvenance).toBe(item.provenance);
    expect(report.externalAccessObserved).toBe(false);
    expect(report.clientMethodInvocations).toBe(4);
    expect(report.apiCostUsd).toBeNull();
    expect(report.quotaStatus).toBe("unknown");
    expect(report.items[0]?.screening.executionQualification).toBe("not_qualified");
  }
  expect(transportInvocations).toHaveLength(12);
});

test("live mode rejects limits above 30 before loading credentials or making requests", async () => {
  let clientCreations = 0;
  const deps = dependencies({
    createClient: () => {
      clientCreations++;
      throw new Error("unexpected client creation");
    },
  });

  await expect(runOkxScan([
    "--live", "--chain-index", "1", "--stage", "NEW", "--address-comparison", "case-sensitive",
    "--limit", "31", "--policy", "policy.json",
  ], {}, deps)).rejects.toThrow("Invalid live scan arguments");
  expect(clientCreations).toBe(0);
});

test("legacy live scan joins case variants for an EVM token identity", async () => {
  const listed = { chainIndex: "1", tokenContractAddress: "0xAaBb" };
  const returned = { chainIndex: "1", tokenContractAddress: "0xaabb" };
  const client: OkxReadOnlyClient = {
    async getMemePumpSupportedChains() { return []; },
    async getMemePumpTokenList() { return { items: [listed] }; },
    async getTokenPriceInfo() { return [{ ...returned, time: String(now.getTime()), price: "1.25", holders: "1000" }]; },
    async getTokenAdvancedInfo() { return { ...returned, tokenTags: [], top10HoldPercent: "20", riskControlLevel: "1" }; },
    async getTokenTopLiquidity() { return []; },
  };
  const report = await runOkxScan([
    "--live", "--chain-index", "1", "--stage", "NEW", "--address-comparison", "case-insensitive",
    "--limit", "1", "--policy", "policy.json",
  ], {
    OKX_API_KEY: "fixture-api-key",
    OKX_SECRET_KEY: "fixture-secret",
    OKX_API_PASSPHRASE: "fixture-passphrase",
  }, dependencies({ readPolicy: async () => policy, createClient: () => client }));

  expect(report.items).toHaveLength(1);
  expect(report.items[0]?.opportunity.identityCompatible).toBe(true);
  expect(report.items[0]?.opportunity.price).toBe(1.25);
  expect(report.items[0]?.opportunity.riskControlLevel).toBe(1);
});

test("legacy live scan rejects EVM casing duplicates before requesting prices", async () => {
  const calls: string[] = [];
  const client: OkxReadOnlyClient = {
    async getMemePumpSupportedChains() { return []; },
    async getMemePumpTokenList() {
      calls.push("tokens");
      return { items: [
        { chainIndex: "1", tokenContractAddress: "0xAaBb" },
        { chainIndex: "1", tokenContractAddress: "0xaabb" },
      ] };
    },
    async getTokenPriceInfo() { calls.push("prices"); return []; },
    async getTokenAdvancedInfo() { calls.push("advanced"); return {}; },
    async getTokenTopLiquidity() { calls.push("liquidity"); return []; },
  };
  await expect(runOkxScan([
    "--live", "--chain-index", "1", "--stage", "NEW", "--address-comparison", "case-insensitive",
    "--limit", "2", "--policy", "policy.json",
  ], {
    OKX_API_KEY: "fixture-api-key",
    OKX_SECRET_KEY: "fixture-secret",
    OKX_API_PASSPHRASE: "fixture-passphrase",
  }, dependencies({ readPolicy: async () => policy, createClient: () => client })))
    .rejects.toThrow("OKX token response contained duplicate identities");
  expect(calls).toEqual(["tokens"]);
});
