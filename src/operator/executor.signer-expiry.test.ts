import { beforeEach, expect, mock, test } from "bun:test";

// This file runs alone: the only replaced dependency is the external ethers SDK.
const EXPIRES = 1_760_000_001_000;
let now = EXPIRES - 1;
let sdkCalls = 0;
const events: string[] = [];
let expireDuring: "network" | "fees" | null = "fees";
let chainId = 196;
let aboveCap = false;
beforeEach(() => { now = EXPIRES - 1; sdkCalls = 0; events.length = 0; expireDuring = "fees"; chainId = 196; aboveCap = false; });
class MockProvider {
  async getNetwork() { events.push("network"); if (expireDuring === "network") now = EXPIRES; return { chainId }; }
  async getFeeData() {
    events.push("fees");
    if (expireDuring === "fees") now = EXPIRES;
    return { maxFeePerGas: { gt: () => aboveCap } };
  }
}
class MockWallet {
  address = "0x" + "aa".repeat(20);
  constructor(_syntheticKey: string, public provider?: MockProvider) {}
  async sendTransaction() { events.push("sdk"); sdkCalls++; return { hash: "0x1234" }; }
}
mock.module("ethers", () => ({ ethers: {
  Wallet: MockWallet, providers: { JsonRpcProvider: MockProvider },
  utils: { parseUnits: () => 1 }, BigNumber: { from: (value: string) => value },
} }));
const { createEthersEvmSigner } = await import("./executor");
const transaction = { chainIndex: "196", to: "0x" + "ab".repeat(20), data: "0xdeadbeef", value: "0", gasLimit: "300000" };
const signerForTest = () => createEthersEvmSigner("synthetic-key-never-parsed", { "196": "https://synthetic.invalid" }, 1);
function freshnessGuard() {
  events.push("guard");
  if (now >= EXPIRES) throw new Error("plan_expired_before_leg1");
}

test("production signer blocks SDK handoff when fee preparation consumes the plan lifetime", async () => {
  const signer = await signerForTest();
  await expect(signer.sendTransaction(transaction, freshnessGuard)).rejects.toThrow("plan_expired_before_leg1");
  expect(events).toEqual(["network", "fees", "guard"]);
  expect(sdkCalls).toBe(0);
});

test("network lookup can consume the lifetime before fees are fetched; the guard still stops SDK handoff", async () => {
  expireDuring = "network";
  const signer = await signerForTest();
  await expect(signer.sendTransaction(transaction, freshnessGuard)).rejects.toThrow("plan_expired_before_leg1");
  expect(events).toEqual(["network", "fees", "guard"]);
  expect(sdkCalls).toBe(0);
});

test("fresh signer handoff invokes its guard after network and fee preparation", async () => {
  expireDuring = null;
  const signer = await signerForTest();
  expect(await signer.sendTransaction(transaction, freshnessGuard)).toBe("0x1234");
  expect(events).toEqual(["network", "fees", "guard", "sdk"]);
  expect(sdkCalls).toBe(1);
});

test("cached wallet still rechecks freshness after every fee lookup", async () => {
  expireDuring = null;
  const signer = await signerForTest();
  await signer.sendTransaction(transaction, freshnessGuard);
  expireDuring = "fees";
  await expect(signer.sendTransaction(transaction, freshnessGuard)).rejects.toThrow("plan_expired_before_leg1");
  expect(events).toEqual(["network", "fees", "guard", "sdk", "fees", "guard"]);
  expect(sdkCalls).toBe(1);
});

test("the signer propagates the original guard error without SDK submission", async () => {
  const error = new Error("kill_switch_present_before_approve2");
  const signer = await signerForTest();
  let observed: unknown;
  try { await signer.sendTransaction(transaction, () => { throw error; }); } catch (caught) { observed = caught; }
  expect(observed).toBe(error);
  expect(sdkCalls).toBe(0);
});

test("RPC chain mismatch still fails before fees, guard or SDK handoff", async () => {
  chainId = 1;
  const signer = await signerForTest();
  await expect(signer.sendTransaction(transaction, freshnessGuard)).rejects.toThrow("RPC chainId does not match chain 196");
  expect(events).toEqual(["network"]);
  expect(sdkCalls).toBe(0);
});

test("gas cap still fails before guard or SDK handoff", async () => {
  aboveCap = true;
  const signer = await signerForTest();
  await expect(signer.sendTransaction(transaction, freshnessGuard)).rejects.toThrow("gas price above OPERATOR_MAX_FEE_GWEI");
  expect(events).toEqual(["network", "fees"]);
  expect(sdkCalls).toBe(0);
});
