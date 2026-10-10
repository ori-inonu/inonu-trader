import { expect, test } from "bun:test";
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
  expect(report.liveRequestsPerformed).toBe(0);
  expect(report.apiCostUsd).toBeNull();
  expect(report.items).toHaveLength(1);
  expect(report.items[0]?.screening.status).toBe("research_candidate");
  expect(report.items[0]?.screening.executionQualification).toBe("not_qualified");
});

test("legacy live mode is rejected before checking arguments or credentials", async () => {
  let policyReads = 0;
  let clientCreations = 0;
  const deps = dependencies({
    readPolicy: async () => {
      policyReads++;
      return policy;
    },
    createClient: () => {
      clientCreations++;
      throw new Error("must not create a client without credentials");
    },
  });

  await expect(runOkxScan(["--live"], {}, deps)).rejects.toThrow(
    "Legacy OKX live mode is disabled. Use 'bun --no-env-file run scripts/okx-market-scan.ts --help' for the protocol-aware, coverage-aware scanner.",
  );
  expect(policyReads).toBe(0);
  expect(clientCreations).toBe(0);
});

test("legacy live mode is fenced before policy loading or client creation", async () => {
  let policyReads = 0;
  let clientCreations = 0;
  const deps = dependencies({
    readPolicy: async () => {
      policyReads++;
      return policy;
    },
    createClient: () => {
      clientCreations++;
      throw new Error("unexpected legacy client creation");
    },
  });

  await expect(runOkxScan([
    "--live", "--chain-index", "1", "--stage", "NEW", "--address-comparison", "case-sensitive",
    "--limit", "1", "--policy", "policy.json",
  ], {
    OKX_API_KEY: "fixture-api-key",
    OKX_SECRET_KEY: "fixture-secret",
    OKX_API_PASSPHRASE: "fixture-passphrase",
  }, deps)).rejects.toThrow(
    "Legacy OKX live mode is disabled. Use 'bun --no-env-file run scripts/okx-market-scan.ts --help' for the protocol-aware, coverage-aware scanner.",
  );
  expect(policyReads).toBe(0);
  expect(clientCreations).toBe(0);
});


