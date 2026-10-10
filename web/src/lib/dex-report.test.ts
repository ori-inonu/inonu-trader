interface BunTestMatchers {
  readonly not: BunTestMatchers;
  toBe(expected: unknown): void;
  toBeGreaterThan(expected: number): void;
  toBeInstanceOf(expected: Function): void;
  toBeNull(): void;
  toBeObject(): void;
  toContain(expected: unknown): void;
  toEqual(expected: unknown): void;
  toHaveLength(expected: number): void;
  toHaveProperty(property: string, expected?: unknown): void;
  toMatch(expected: RegExp | string): void;
  toMatchObject(expected: unknown): void;
  toThrow(expected?: unknown): void;
}

interface BunTestRuntime {
  expect<T = unknown>(actual: T): BunTestMatchers;
  it(name: string, run: () => unknown): void;
  test(name: string, run: () => unknown): void;
  describe(name: string, run: () => void): void;
}

declare module "bun:test";

const load = require as {
  (moduleName: "bun:test"): BunTestRuntime;
  (moduleName: "./dex-report"): {
  formatAtomicAmount(value: string, decimals: number): string;
  parseDexReport(value: unknown, options: { nowWallMs: number }): any;
  };
};

const { expect, it } = load("bun:test");
const { formatAtomicAmount, parseDexReport } = load("./dex-report");

function validReport() {
  return {
    source: "synthetic",
    chainIndex: "1",
    tokenA: { address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", decimals: 6, metadataSource: "declared fixture", secret: "remove-me" },
    tokenB: { address: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", decimals: 6, metadataSource: "declared fixture" },
    inputAtomic: "9007199254740993",
    outputAtomic: "9007199254740994",
    quotedGrossDeltaAtomic: "1",
    status: "quoted_gross_delta",
    reasons: ["quoted_output_unit_inferred", "total_cost_coverage_unknown", "token_tax_fraction_unknown", "future_reason"],
    legs: [
      { inputAtomic: "9007199254740993", outputAtomic: "9007199254740994", priceImpactPercent: -0.1, fromTaxFraction: 0, toTaxFraction: null, networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null, extra: "remove-me" }, requestedAt: 1003, receivedAt: 1004, extra: "remove-me" },
      { inputAtomic: "9007199254740994", outputAtomic: "9007199254740994", priceImpactPercent: 0, fromTaxFraction: 0, toTaxFraction: 0, networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null }, requestedAt: 1005, receivedAt: 1006 },
    ],
    execution: "not_qualified",
    liveQualified: false,
    netAtomic: null,
    netStatus: "net_not_evaluated",
    costsCoverage: "unknown",
    costUsd: null,
    quotaRemaining: null,
    timing: { startedAt: 1000, completedAt: 1007, elapsedMs: 7, coverageRequestedAt: 1001, coverageReceivedAt: 1002, extra: "remove-me" },
    policy: { maxElapsedMs: 100, maxImpactMagnitudePercent: 1, extra: "remove-me" },
    schemaVersion: 999,
    extra: "remove-me",
  };
}

type PartialStatusReport = Omit<ReturnType<typeof validReport>, "outputAtomic" | "quotedGrossDeltaAtomic"> & {
  outputAtomic: string | null;
  quotedGrossDeltaAtomic: string | null;
};

it("normalizes an allowlisted report to internal V1 and strips extras at every level", () => {
  const parsed = parseDexReport(validReport(), { nowWallMs: 2000 }) as Record<string, any>;
  expect(parsed).toBeObject();
  expect(parsed.schemaVersion).toBe(1);
  expect(parsed.tokenA.address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(parsed.quotedGrossDeltaAtomic).toBe("1");
  expect(parsed).not.toHaveProperty("extra");
  expect(parsed).not.toHaveProperty("schemaVersion", 999);
  expect(parsed.tokenA).not.toHaveProperty("secret");
  expect(parsed.legs[0]).not.toHaveProperty("extra");
  expect(parsed.legs[0].networkEstimates).not.toHaveProperty("extra");
  expect(parsed.timing).not.toHaveProperty("extra");
  expect(parsed.policy).not.toHaveProperty("extra");
});
it("rejects an envelope, unknown provenance, and unsafe execution claims with one generic error", () => {
  const cases = [
    { schemaVersion: 1, report: validReport() },
    { ...validReport(), source: "private-address-sentinel" },
    { ...validReport(), liveQualified: true },
  ];
  for (const value of cases) {
    let caught: unknown;
    try {
      parseDexReport(value, { nowWallMs: 2000 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Invalid DEX report.");
  }
});

it("rejects Unicode control characters in contract identity and metadata", () => {
  const addressControl = validReport();
  addressControl.tokenA.address = `TAddress`;
  const metadataControl = validReport();
  metadataControl.tokenA.metadataSource = `sourcemarker`;
  for (const value of [addressControl, metadataControl]) {
    let caught: unknown;
    try {
      parseDexReport(value, { nowWallMs: 2000 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Invalid DEX report.");
  }
});

it("normalizes only enumerated EVM identities and preserves exact casing elsewhere", () => {
  const evm = validReport();
  evm.chainIndex = "10";
  evm.tokenA.address = "0xAbCd";
  evm.tokenB.address = "0xEf01";
  expect(parseDexReport(evm, { nowWallMs: 2000 }).tokenA.address).toBe("0xabcd");

  for (const chainIndex of ["195", "501", "784", "607", "999999"]) {
    const value = validReport();
    value.chainIndex = chainIndex;
    value.tokenA.address = "MiXeD-Token-A";
    value.tokenB.address = "mixed-token-a";
    const parsed = parseDexReport(value, { nowWallMs: 2000 });
    expect(parsed.tokenA.address).toBe("MiXeD-Token-A");
    expect(parsed.tokenB.address).toBe("mixed-token-a");
  }

  const duplicateEvm = validReport();
  duplicateEvm.tokenA.address = "0xAaAa";
  duplicateEvm.tokenB.address = "0xAAAA";
  expect(() => parseDexReport(duplicateEvm, { nowWallMs: 2000 })).toThrow("Invalid DEX report.");
});

it("keeps atomic formatting exact for large values and negative deltas", () => {
  expect(formatAtomicAmount("9007199254740993", 6)).toBe("9007199254.740993");
  expect(formatAtomicAmount("-5000", 6)).toBe("-0.005");
  expect(formatAtomicAmount("0", 6)).toBe("0");
  const max = "9".repeat(78);
  expect(formatAtomicAmount(max, 0)).toBe(max);
  expect(formatAtomicAmount("1", 255)).toBe(`0.${"0".repeat(254)}1`);
  for (const invalid of ["01", "+1", "1e3", "9".repeat(79), "-0"]) {
    expect(() => formatAtomicAmount(invalid, 6)).toThrow("Invalid DEX report.");
  }
});

it("accepts blocked or unknown reports with zero, one, or two continuous partial legs", () => {
  const base = validReport();
  for (const status of ["blocked", "unknown"] as const) {
    for (const count of [0, 1, 2]) {
      const value = validReport() as PartialStatusReport;
      value.status = status;
      value.outputAtomic = null;
      value.quotedGrossDeltaAtomic = null;
      value.legs = base.legs.slice(0, count);
      const parsed = parseDexReport(value, { nowWallMs: 2000 });
      expect(parsed.status).toBe(status);
      expect(parsed.legs).toHaveLength(count);
      expect(parsed.outputAtomic).toBeNull();
    }
  }

  const disconnected = validReport() as PartialStatusReport;
  disconnected.status = "unknown";
  disconnected.outputAtomic = null;
  disconnected.quotedGrossDeltaAtomic = null;
  disconnected.legs[1]!.inputAtomic = "77";
  expect(() => parseDexReport(disconnected, { nowWallMs: 2000 })).toThrow("Invalid DEX report.");
});
