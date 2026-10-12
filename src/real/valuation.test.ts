import { describe, expect, test } from "bun:test";
import { deriveObservedValuation, type ObservedValuationInput, type ValuationObservation } from "./valuation.ts";
import type { Inventory } from "./types.ts";

const TOKEN = "0x1111111111111111111111111111111111111111";
const NOW = 1_000;

type FixtureInput = ObservedValuationInput & { observation: ValuationObservation };
function fixture(): FixtureInput {
  const expected = { identityKey: "a".repeat(64), chainIndex: "196", revision: 3, correlationId: "synthetic-cycle" };
  const inventory: Inventory = {
    assets: [{ chainIndex: "196", tokenContractAddress: TOKEN, symbol: "FIXTURE", balance: "9007199254.740993",
      rawBalance: "9007199254740993", decimals: null, tokenPriceUsd: "2.5", valueUsd: null, isRiskToken: null }],
    coverage: { observedAssets: 1, rawBalanceKnown: 1, usdKnown: 0, scope: "observed-tokens-only" },
    knownValueUsd: null, completeValueUsd: null, blockNumber: null,
  };
  return {
    now: NOW,
    expected,
    inventoryEnvelope: {
      ...expected, status: "ready", source: "onchainos-rest-v6", mode: "unverified",
      endpoint: "/api/v6/dex/balance/all-token-balances-by-address", method: "GET",
      requestedAtMs: 800, receivedAtMs: 850, sourceAtMs: null, expiresAtMs: 1_600,
      httpStatus: 200, unit: "balance-unit-unknown", error: null, priceSource: "balance-tokenPrice-usd",
      data: inventory,
    },
    observation: {
      status: "qualified",
      context: { ...expected, blockNumber: "123", blockHash: `0x${"b".repeat(64)}`, observedAtMs: 900, expiresAtMs: 1_400 },
      tokens: [{ token: TOKEN, balanceRaw: "9007199254740993", decimals: 6 }],
    },
  };
}

describe("observed-token USD derivation (synthetic public seam)", () => {
  test("preserves exact valuation above MAX_SAFE_INTEGER and binds the observed subset to block and expiry", () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const result = deriveObservedValuation(input);
    expect(result.assets[0]?.valueUsd).toBe("22517998136.8524825");
    expect(result.knownValueUsd).toBe("22517998136.8524825");
    expect(result.completeValueUsd).toBe("22517998136.8524825");
    expect(result.coverage).toEqual({ observedAssets: 1, qualifiedAssets: 1, unknownAssets: 0, scope: "observed-tokens-only" });
    expect(result.context).toEqual({ ...input.observation.context, expiresAtMs: 1_400 });
    expect(result).toMatchObject({ status: "complete", mode: "unverified", observation: "unverified", exercisedReal: false,
      financiallyQualified: false, executionEnabled: false });
    expect(JSON.stringify(input)).toBe(before);
  });

  test("keeps partial unknown assets separate and leaves an entirely unknown subtotal null", () => {
    const input = fixture();
    const other = "0x2222222222222222222222222222222222222222";
    input.inventoryEnvelope.data!.assets.push({ chainIndex: "196", tokenContractAddress: other, balance: "1",
      rawBalance: "1000000", tokenPriceUsd: null });
    input.observation.tokens.push({ token: other, balanceRaw: "1000000", decimals: 6 });
    const partial = deriveObservedValuation(input);
    expect(partial.status).toBe("partial");
    expect(partial.assets[1]).toMatchObject({ valueUsd: null, reasons: ["usd-price-unknown"] });
    expect(partial.knownValueUsd).toBe("22517998136.8524825");
    expect(partial.completeValueUsd).toBeNull();
    expect(partial.coverage).toEqual({ observedAssets: 2, qualifiedAssets: 1, unknownAssets: 1, scope: "observed-tokens-only" });
    input.inventoryEnvelope.data!.assets[0]!.tokenPriceUsd = null;
    const unknown = deriveObservedValuation(input);
    expect(unknown.status).toBe("unknown");
    expect(unknown.knownValueUsd).toBeNull();
    expect(unknown.completeValueUsd).toBeNull();
  });

  test("never infers decimals from redundant balances and rejects absent or invalid independent decimals", () => {
    for (const decimals of [null, -1, 0.5, 256, Number.NaN]) {
      const input = fixture();
      input.inventoryEnvelope.data!.assets[0]!.balance = "1000000";
      input.inventoryEnvelope.data!.assets[0]!.rawBalance = "1000000";
      input.inventoryEnvelope.data!.assets[0]!.tokenPriceUsd = "2";
      input.observation.tokens[0]!.balanceRaw = "1000000";
      input.observation.tokens[0]!.decimals = decimals;
      const result = deriveObservedValuation(input);
      expect(result.assets[0]?.valueUsd).toBeNull();
      expect(result.assets[0]?.reasons).toContain("decimals-unqualified");
      expect(result.knownValueUsd).toBeNull();
      expect(result.coverage.unknownAssets).toBe(1);
    }
  });

  test("requires exact uint256 raw agreement and compatible display whenever the provider supplies it", () => {
    const cases: { raw?: string | null; observed?: string | null; display?: string | null; reason: string }[] = [
      { raw: "9007199254740994", reason: "raw-balance-divergence" },
      { raw: null, reason: "provider-raw-unqualified" },
      { observed: null, reason: "observed-raw-unqualified" },
      { raw: "-1", reason: "provider-raw-unqualified" },
      { raw: "1e6", reason: "provider-raw-unqualified" },
      { raw: "115792089237316195423570985008687907853269984665640564039457584007913129639936", reason: "provider-raw-unqualified" },
      { observed: "01", reason: "observed-raw-unqualified" },
      { display: "9007199254.740994", reason: "display-balance-divergence" },
      { display: "9.007199254740993e9", reason: "display-balance-unqualified" },
    ];
    for (const item of cases) {
      const input = fixture();
      if ("raw" in item) input.inventoryEnvelope.data!.assets[0]!.rawBalance = item.raw!;
      if ("observed" in item) input.observation.tokens[0]!.balanceRaw = item.observed!;
      if ("display" in item) input.inventoryEnvelope.data!.assets[0]!.balance = item.display!;
      const result = deriveObservedValuation(input);
      expect(result.assets[0]?.valueUsd).toBeNull();
      expect(result.assets[0]?.reasons).toContain(item.reason);
      expect(result.knownValueUsd).toBeNull();
    }
    const absentDisplay = fixture();
    absentDisplay.inventoryEnvelope.data!.assets[0]!.balance = null;
    expect(deriveObservedValuation(absentDisplay).completeValueUsd).toBe("22517998136.8524825");
  });

  test("uses only explicitly namespaced live-TTL Balance USD fields and rejects invalid decimal prices", () => {
    const cases: [((input: FixtureInput) => void), string][] = [
      [input => { input.inventoryEnvelope.priceSource = null; }, "usd-source-unqualified"],
      [input => { input.inventoryEnvelope.expiresAtMs = NOW; }, "usd-source-expired"],
      [input => { input.inventoryEnvelope.sourceAtMs = NOW + 1; }, "inventory-envelope-unqualified"],
      [input => { input.inventoryEnvelope.receivedAtMs = NOW + 1; }, "inventory-envelope-unqualified"],
      [input => { input.inventoryEnvelope.requestedAtMs = 900; }, "inventory-envelope-unqualified"],
      [input => { input.inventoryEnvelope.endpoint = "/api/v6/dex/market/price"; }, "inventory-envelope-unqualified"],
      [input => { input.inventoryEnvelope.unit = "USD"; }, "inventory-envelope-unqualified"],
      [input => { input.inventoryEnvelope.httpStatus = 500; }, "inventory-envelope-unqualified"],
      [input => { input.inventoryEnvelope.status = "blocked"; }, "inventory-envelope-unqualified"],
    ];
    for (const [mutate, reason] of cases) {
      const input = fixture(); mutate(input);
      const result = deriveObservedValuation(input);
      expect(result.assets[0]?.valueUsd).toBeNull();
      expect(result.reasons).toContain(reason);
      expect(result.completeValueUsd).toBeNull();
    }
    for (const price of ["-1", "2e0", "NaN", "Infinity", "02", "2."]) {
      const input = fixture(); input.inventoryEnvelope.data!.assets[0]!.tokenPriceUsd = price;
      expect(deriveObservedValuation(input).assets[0]).toMatchObject({ valueUsd: null, reasons: ["usd-price-unqualified"] });
    }
    const shorterPriceTTL = fixture(); shorterPriceTTL.inventoryEnvelope.expiresAtMs = 1_200;
    expect(deriveObservedValuation(shorterPriceTTL).context?.expiresAtMs).toBe(1_200);
  });

  test("invalidates valuation when identity, chain, revision, correlation, qualification or block binding changes", () => {
    const cases: [((input: FixtureInput) => void), string][] = [
      [input => { input.observation.context.identityKey = "c".repeat(64); }, "observation-context-divergence"],
      [input => { input.observation.context.chainIndex = "143"; }, "observation-context-divergence"],
      [input => { input.observation.context.revision++; }, "observation-context-divergence"],
      [input => { input.observation.context.correlationId = "other-cycle"; }, "observation-context-divergence"],
      [input => { input.inventoryEnvelope.identityKey = "c".repeat(64); }, "inventory-context-divergence"],
      [input => { input.inventoryEnvelope.revision++; }, "inventory-context-divergence"],
      [input => { input.inventoryEnvelope.chainIndex = "143"; }, "inventory-context-divergence"],
      [input => { input.inventoryEnvelope.correlationId = "other-cycle"; }, "inventory-context-divergence"],
      [input => { input.expected.revision = -1; }, "expected-context-unqualified"],
      [input => { input.now = Number.NaN; }, "expected-context-unqualified"],
      [input => { input.observation.status = "blocked"; }, "observation-unqualified"],
      [input => { input.observation.context.blockNumber = "0x7b"; }, "observation-block-unqualified"],
      [input => { input.observation.context.blockHash = "0x"; }, "observation-block-unqualified"],
      [input => { input.observation.context.blockHash = `0x${"0".repeat(64)}`; }, "observation-block-unqualified"],
      [input => { input.observation.context.expiresAtMs = NOW; }, "observation-expired"],
      [input => { input.observation.context.observedAtMs = NOW + 1; }, "observation-time-unqualified"],
    ];
    for (const [mutate, reason] of cases) {
      const input = fixture(); mutate(input);
      const result = deriveObservedValuation(input);
      expect(result.assets[0]?.valueUsd).toBeNull();
      expect(result.reasons).toContain(reason);
      expect(result.context).toBeNull();
      expect(result.coverage.qualifiedAssets).toBe(0);
    }
  });

  test("rejects missing, duplicated or cross-chain token observations without double counting inventory", () => {
    const missing = fixture(); missing.observation.tokens = [];
    const missingResult = deriveObservedValuation(missing);
    expect(missingResult.assets[0]).toMatchObject({ valueUsd: null, decimals: null, reasons: ["token-observation-missing"] });
    expect(missingResult.knownValueUsd).toBeNull();
    const duplicateObservation = fixture();
    duplicateObservation.observation.tokens.push({ ...duplicateObservation.observation.tokens[0]! });
    expect(deriveObservedValuation(duplicateObservation).assets[0]).toMatchObject({ valueUsd: null, reasons: ["token-observation-ambiguous"] });
    const duplicateInventory = fixture();
    duplicateInventory.inventoryEnvelope.data!.assets.push({ ...duplicateInventory.inventoryEnvelope.data!.assets[0]! });
    const duplicated = deriveObservedValuation(duplicateInventory);
    expect(duplicated.assets.every(asset => asset.valueUsd === null && asset.reasons.includes("inventory-token-ambiguous"))).toBe(true);
    expect(duplicated.coverage).toEqual({ observedAssets: 2, qualifiedAssets: 0, unknownAssets: 2, scope: "observed-tokens-only" });
    const otherChain = fixture(); otherChain.inventoryEnvelope.data!.assets[0]!.chainIndex = "143";
    expect(deriveObservedValuation(otherChain).assets[0]).toMatchObject({ valueUsd: null, reasons: ["asset-chain-divergence"] });
    const invalidToken = fixture(); invalidToken.inventoryEnvelope.data!.assets[0]!.tokenContractAddress = "unknown-token";
    expect(deriveObservedValuation(invalidToken).assets[0]).toMatchObject({ valueUsd: null, reasons: ["token-address-unqualified"] });
  });

  test("keeps every observed inventory asset unknown when the independent observation is absent", () => {
    const result = deriveObservedValuation({ ...fixture(), observation: null });
    expect(result.status).toBe("unknown");
    expect(result.assets[0]).toMatchObject({ valueUsd: null, decimals: null, reasons: ["observation-missing"] });
    expect(result.context).toBeNull();
    expect(result.knownValueUsd).toBeNull();
    expect(result.coverage.unknownAssets).toBe(1);
  });

  test("retains uint256 and decimals boundary values, zero and exact mixed-scale subtotals without rounding", () => {
    const maximum = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const maxInput = fixture();
    Object.assign(maxInput.inventoryEnvelope.data!.assets[0]!, { rawBalance: maximum, balance: maximum, tokenPriceUsd: "1" });
    Object.assign(maxInput.observation.tokens[0]!, { balanceRaw: maximum, decimals: 0 });
    expect(deriveObservedValuation(maxInput).completeValueUsd).toBe(maximum);
    const tiny = fixture();
    Object.assign(tiny.inventoryEnvelope.data!.assets[0]!, { rawBalance: "1", balance: null, tokenPriceUsd: "0.1" });
    Object.assign(tiny.observation.tokens[0]!, { balanceRaw: "1", decimals: 255 });
    expect(deriveObservedValuation(tiny).completeValueUsd).toBe(`0.${"0".repeat(255)}1`);
    const zero = fixture();
    Object.assign(zero.inventoryEnvelope.data!.assets[0]!, { rawBalance: "0", balance: "0.000", tokenPriceUsd: "2.5" });
    zero.observation.tokens[0]!.balanceRaw = "0";
    expect(deriveObservedValuation(zero)).toMatchObject({ status: "complete", knownValueUsd: "0", completeValueUsd: "0" });
    const mixed = fixture();
    const other = "0x2222222222222222222222222222222222222222";
    mixed.inventoryEnvelope.data!.assets.push({ chainIndex: "196", tokenContractAddress: other,
      rawBalance: "3", balance: "0.03", tokenPriceUsd: "0.1" });
    mixed.observation.tokens.push({ token: other, balanceRaw: "3", decimals: 2 });
    expect(deriveObservedValuation(mixed).completeValueUsd).toBe("22517998136.8554825");
    mixed.inventoryEnvelope.data!.assets = [];
    expect(deriveObservedValuation(mixed)).toMatchObject({ status: "unknown", knownValueUsd: null, completeValueUsd: null,
      coverage: { observedAssets: 0, qualifiedAssets: 0, unknownAssets: 0, scope: "observed-tokens-only" } });
  });
});
