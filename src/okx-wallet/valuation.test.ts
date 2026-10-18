import { expect, test } from "bun:test";
import { normalizeInventory, syntheticInventory, type InventorySnapshot, type RawTokenAsset } from "./portfolio";
import { loadOperatorConfig } from "../operator/config";
import { runOperatorCycle, type CycleDeps } from "../operator/cycle";

const ADDRESS = "0x0000000000000000000000000000000000000001";
const NOW = 1_760_000_000_000;
const SCALE308 = "1" + "0".repeat(308);
const MAX_FINITE_DECIMAL = "17976931348623157" + "0".repeat(292);
const TOTAL_ERROR = "Inventory USD total is not representable";

function asset(balance: string, tokenPrice: string, chainIndex = "196", native = false): RawTokenAsset {
  return { chainIndex, address: ADDRESS, tokenContractAddress: native ? "" : ADDRESS, symbol: native ? "OKB" : "FIXTURE",
    balance, rawBalance: balance, tokenPrice, isRiskToken: false };
}

function inventory(assets: RawTokenAsset[], queriedChains = ["196"]): InventorySnapshot {
  return normalizeInventory({ address: ADDRESS, queriedChains, assets, observedAtMs: NOW,
    source: "synthetic", riskTokensExcluded: true });
}

function expectFiniteNumbers(value: unknown): void {
  if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(expectFiniteNumbers);
  else if (value !== null && typeof value === "object") Object.values(value).forEach(expectFiniteNumbers);
}

function expectTotalError(action: () => unknown): void {
  let error: unknown;
  try { action(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error);
  expect(error?.constructor).toBe(Error);
  expect((error as Error).message).toBe(TOTAL_ERROR);
}

test("F01 product overflow is unknown while finite assets retain their subtotal", () => {
  const assets = [asset(SCALE308, "10"), asset("2", "3", "196", true)];
  const original = JSON.parse(JSON.stringify(assets));
  const result = inventory(assets);
  const chain = result.chains[0]!;
  const unpriced = chain.assets[0]!;
  expect(unpriced).toMatchObject({ balanceText: SCALE308, balance: 1e308, priceUsd: 10, valueUsd: null });
  expect(chain.knownValueUsd).toBe(6);
  expect(chain.nativeBalance).toBe(2);
  expect(chain.valueComplete).toBe(false);
  expect(result.knownValueUsd).toBe(6);
  expect(result.valueComplete).toBe(false);
  expect(assets).toEqual(original);
  expectFiniteNumbers(result);
});

test("F02 chain aggregate overflow rejects with the exact fixed ordinary Error", () => {
  const balance = "8" + "0".repeat(307);
  expectTotalError(() => inventory([asset(balance, "1"), asset(balance, "1"), asset(balance, "1")]));
});

test("F03 portfolio aggregate overflow rejects with the same fixed ordinary Error", () => {
  const balance = "9" + "0".repeat(307);
  expectTotalError(() => inventory([asset(balance, "1", "196"), asset(balance, "1", "143")], ["196", "143"]));
});

test("F04 invalid or individually non-finite balance stays unknown", () => {
  for (const balance of ["", "-1", "NaN", "Infinity", "1e308", "0x1", " 1", "1" + "0".repeat(309)]) {
    const result = inventory([asset(balance, "1")]);
    expect(result.chains[0]!.assets[0]).toMatchObject({ balanceText: balance, balance: null, priceUsd: 1, valueUsd: null });
    expect(result.knownValueUsd).toBe(0);
    expect(result.valueComplete).toBe(false);
    expectFiniteNumbers(result);
  }
});

test("F04 invalid or individually non-finite price stays unknown", () => {
  for (const price of ["", "-1", "NaN", "Infinity", "1e308", "0x1", " 1", "1" + "0".repeat(309)]) {
    const result = inventory([asset("2", price)]);
    expect(result.chains[0]!.assets[0]).toMatchObject({ balance: 2, priceUsd: null, valueUsd: null });
    expect(result.knownValueUsd).toBe(0);
    expect(result.valueComplete).toBe(false);
    expectFiniteNumbers(result);
  }
});

test("F04 and F06 valid zero products remain known even with maximum-scale operands", () => {
  for (const [balance, price] of [["0", SCALE308], [SCALE308, "0"], ["0", "0"]]) {
    const result = inventory([asset(balance!, price!)]);
    expect(result.chains[0]!.assets[0]!.valueUsd).toBe(0);
    expect(result.knownValueUsd).toBe(0);
    expect(result.valueComplete).toBe(true);
    expectFiniteNumbers(result);
  }
});

test("F04 empty and absent queried chains preserve existing subtotal and completeness semantics", () => {
  const result = inventory([], ["196", "143"]);
  expect(result.queriedChains).toEqual(["196", "143"]);
  expect(result.chains).toEqual([]);
  expect(result.knownValueUsd).toBe(0);
  expect(result.valueComplete).toBe(true);
});

test("F05 preserves provenance, chain order, native balance and foreign-chain filtering", () => {
  const assets = [asset("2.5", "4", "196", true), { ...asset("3", "2", "143"), isRiskToken: true }, asset(SCALE308, "10", "1")];
  const result = normalizeInventory({ address: ADDRESS, queriedChains: ["143", "196", "501"], assets, observedAtMs: NOW,
    source: "okx_balance_api", riskTokensExcluded: false });
  expect(result).toMatchObject({ address: ADDRESS, observedAtMs: NOW, source: "okx_balance_api",
    riskTokensExcluded: false, queriedChains: ["143", "196", "501"], knownValueUsd: 16, valueComplete: true });
  expect(result.chains.map(chain => chain.chainIndex)).toEqual(["143", "196"]);
  expect(result.chains[0]!.assets[0]!.isRiskToken).toBe(true);
  expect(result.chains[1]).toMatchObject({ chainName: "X Layer", nativeSymbol: "OKB", nativeBalance: 2.5 });
  expect(result.chains[1]!.assets[0]).toMatchObject({ native: true, tokenContractAddress: "", balanceText: "2.5", balance: 2.5 });
  expectFiniteNumbers(result);
});

test("F05 observation-time validation still precedes chain-list validation", () => {
  expect(() => normalizeInventory({ address: ADDRESS, queriedChains: [], assets: [], observedAtMs: 0,
    source: "synthetic", riskTokensExcluded: true })).toThrow("Invalid observation time");
  expect(() => inventory([], [])).toThrow("Invalid chain list");
});

test("F05 ordinary synthetic fixture totals and incomplete price remain unchanged", () => {
  const result = syntheticInventory(NOW);
  expect(result.knownValueUsd).toBe(155);
  expect(result.valueComplete).toBe(false);
  expect(result.chains.map(chain => chain.knownValueUsd)).toEqual([62.5, 85, 7.5]);
  expectFiniteNumbers(result);
});

test("F06 maximum finite product and near-range chain and portfolio sums remain finite", () => {
  expect(Number(MAX_FINITE_DECIMAL)).toBe(Number.MAX_VALUE);
  const maximum = inventory([asset(MAX_FINITE_DECIMAL, "1")]);
  expect(maximum.knownValueUsd).toBe(Number.MAX_VALUE);
  expect(maximum.valueComplete).toBe(true);
  const balance = "8" + "0".repeat(307);
  const sameChain = inventory([asset(balance, "1"), asset(balance, "1")]);
  const acrossChains = inventory([asset(balance, "1", "196"), asset(balance, "1", "143")], ["196", "143"]);
  for (const result of [maximum, sameChain, acrossChains]) expectFiniteNumbers(result);
  expect(sameChain.knownValueUsd).toBe(1.6e308);
  expect(acrossChains.knownValueUsd).toBe(1.6e308);
  expect(acrossChains.valueComplete).toBe(true);
});

test("F06 unknown price mixed with finite assets retains only the known subtotal", () => {
  const result = inventory([asset(SCALE308, ""), asset("4", "2")]);
  expect(result.chains[0]!.assets[0]!.balance).toBe(1e308);
  expect(result.chains[0]!.assets[0]!.priceUsd).toBeNull();
  expect(result.knownValueUsd).toBe(8);
  expect(result.valueComplete).toBe(false);
  expectFiniteNumbers(result);
});

test("F07 rejected aggregate cannot reach candidate, model or executor access", async () => {
  const { policy } = loadOperatorConfig({ OPERATOR_PROFILE: "standard" });
  let modelCalls = 0, candidateReads = 0, executorReads = 0;
  const balance = "9" + "0".repeat(307);
  const deps: CycleDeps = { inventorySource: async () => inventory([asset(balance, "1", "196"), asset(balance, "1", "143")], ["196", "143"]),
    model: { name: "local-unused-double", async choose(): Promise<never> { modelCalls++; throw new Error("model must not run"); } },
    policy, gate: { operatorExecute: false, operatorLiveAck: false, realModel: false, signerAvailable: false },
    now: () => NOW, jevUsdPerMTok: null,
    get candidateContext(): never { candidateReads++; throw new Error("candidates must not run"); },
    get executor(): never { executorReads++; throw new Error("executor must not run"); },
  };
  let error: unknown;
  try { await runOperatorCycle(deps); } catch (caught) { error = caught; }
  expect(error?.constructor).toBe(Error);
  expect((error as Error).message).toBe(TOTAL_ERROR);
  expect(modelCalls).toBe(0);
  expect(candidateReads).toBe(0);
  expect(executorReads).toBe(0);
});
