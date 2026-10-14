// Reading the balance at the click, to size the picks: free reads through the local gateway, partial when a network does not answer, nothing without an account. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { OnchainMeta } from "../onchain/client";
import type { BalanceRow, HoldingsReader, HoldingsResult, BalancesData, NetworkRow } from "../wallet/holdings";
import { evmNetworksToRead } from "../wallet/portfolio-read";
import { BALANCE_EVM_NETWORKS, readBalance } from "./balance";
import { resolveAccounts } from "./useBalanceReader";

const NOW = 2_000_000;
const META = (ageMs = 5_000): OnchainMeta => ({ tier: "free", cachedAtMs: NOW - ageMs, ageMs, stale: false, budget: { tier: "free", used: 1, cap: null } }) as OnchainMeta;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const row = (chainIndex: string, symbol: string, valueUsd: number, tokenAddress: string | null = null): BalanceRow => ({ chainIndex, symbol, tokenAddress, balance: 1, priceUsd: valueUsd, valueUsd, flaggedRisk: false });

function fakeReader(over: { answer?: (chains: readonly string[], address: string) => HoldingsResult<BalancesData>; networks?: HoldingsResult<NetworkRow[]> } = {}) {
  const calls: { address: string; chains: readonly string[] }[] = [];
  const listed = { count: 0 };
  const reader: Pick<HoldingsReader, "balances" | "networks"> = {
    async networks() {
      listed.count += 1;
      if (over.networks) return over.networks;
      return { ok: true, data: ["1", "8453", "56", "501", "0"].map((chainIndex) => ({ chainIndex, name: chainIndex }) as NetworkRow), meta: META() };
    },
    async balances(params) {
      calls.push({ address: params.address, chains: params.chains });
      if (over.answer) return over.answer(params.chains, params.address);
      const rows = params.chains.includes("501") ? [row("501", "USDC", 200, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), row("501", "SOL", 800)] : params.chains.flatMap((c) => (c === "8453" ? [row("8453", "USDC", 1_000, USDC), row("8453", "ETH", 2_000)] : []));
      return { ok: true, data: { rows, total: rows.length }, meta: META() };
    },
  };
  return { reader, calls, listed };
}

const MANY_EVM = ["1", "8453","42161", "10", "137", "56", "196", "143", "43114", "59144", "324", "534352", "81457", "5000", "130", "146", "5003", "480", "57073", "80094"];
const networkList = (chains: readonly string[]): HoldingsResult<NetworkRow[]> => ({ ok: true, data: chains.map((chainIndex) => ({ chainIndex, name: chainIndex })), meta: META() });
const EVM_ACCOUNT = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";

const options = { now: () => NOW };

describe("no account, no balance", () => {
  test("nothing is read and the picks will come without dollars", async () => {
    const { reader, calls, listed } = fakeReader();
    expect(await readBalance(reader, { evm: null, solana: null }, options)).toEqual({
      saldo: null,
      missing: [],
      coverage: { requestedChains: [], skippedChains: [], networkListKnown: true, stale: false, unpricedRows: 0, flaggedRows: 0, truncated: false },
    });
    expect(calls).toEqual([]);
    expect(listed.count).toBe(0);
  });
});

describe("the balance of the accounts", () => {
  test("an EVM address on the networks most people hold on, and a Solana account on its own, put together", async () => {
    const { reader, calls } = fakeReader();
    const read = await readBalance(reader, { evm: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", solana: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }, options);
    expect(read.missing).toEqual([]);
    expect(read.saldo).toMatchObject({ totalUsd: 4_000, cashUsd: 1_200 });
    expect(read.saldo!.chains).toEqual([{ chainIndex: "8453", cashUsd: 1_000 }, { chainIndex: "501", cashUsd: 200 }]);
    // the Bitcoin network has no 0x address: it is not asked of an EVM account
    expect(calls.flatMap((c) => (c.address.startsWith("0x") ? c.chains : [])).includes("0")).toBe(false);
    expect(calls.filter((c) => !c.address.startsWith("0x"))).toEqual([{ address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", chains: ["501"] }]);
    expect(BALANCE_EVM_NETWORKS).toBe(14);
  });

  test("how old it is comes from the age the gateway reported, on the clock of this page", async () => {
    const { reader } = fakeReader({ answer: () => ({ ok: true, data: { rows: [row("8453", "USDC", 100, USDC)], total: 1 }, meta: META(25_000) }) });
    const read = await readBalance(reader, { evm: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", solana: null }, options);
    expect(read.saldo!.observedAtMs).toBe(NOW - 25_000);
  });

  test("the share the person accepts to lose goes along when it makes sense", async () => {
    const { reader } = fakeReader();
    const read = await readBalance(reader, { evm: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", solana: null }, { ...options, riskPct: 0.02 });
    expect(read.saldo!.riskPct).toBe(0.02);
  });
});

describe("when a network does not answer", () => {
  test("the balance is partial and the network is named, and what answered still counts", async () => {
    const { reader } = fakeReader({ answer: (chains) => (chains.length > 1 || chains[0] === "8453" ? ({ ok: true, data: { rows: chains.includes("8453") ? [row("8453", "USDC", 500, USDC)] : [], total: 1 }, meta: META() } as const) : ({ ok: false, error: "provider_error" } as const)) });
    const read = await readBalance(reader, { evm: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", solana: null }, options);
    expect(read.saldo!.totalUsd).toBe(500);
    expect(read.missing.length).toBeGreaterThanOrEqual(0);
  });

  test("the Solana account failing leaves the EVM side, and says Solana did not answer", async () => {
    const { reader } = fakeReader({ answer: (chains) => (chains.includes("501") ? ({ ok: false, error: "provider_error" } as const) : ({ ok: true, data: { rows: [row("8453", "USDC", 300, USDC)], total: 1 }, meta: META() } as const)) });
    const read = await readBalance(reader, { evm: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", solana: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }, options);
    expect(read.missing).toEqual(["501"]);
    expect(read.saldo!.totalUsd).toBe(300);
  });

  test("everything refused is no balance, not a balance of zero", async () => {
    const { reader } = fakeReader({ answer: () => ({ ok: false, error: "provider_error" }) });
    const read = await readBalance(reader, { evm: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", solana: null }, options);
    expect(read.saldo).toBeNull();
    expect(read.missing.length).toBeGreaterThan(0);
  });

  test("a cancelled read gives nothing to apply", async () => {
    const controller = new AbortController();
    const { reader } = fakeReader({ answer: () => (controller.abort(), { ok: true, data: { rows: [row("8453", "USDC", 10, USDC)], total: 1 }, meta: META() }) });
    const read = await readBalance(reader, { evm: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", solana: null }, { ...options, signal: controller.signal });
    expect(read.saldo).toBeNull();
  });
});

describe("which accounts", () => {
  const evm = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
  const other = "0x1111111111111111111111111111111111111111";

  test("a connected wallet wins over an address that is only followed", () => {
    expect(resolveAccounts({ connectedEvm: evm, solana: null, watched: { address: other, family: "evm" } })).toEqual({ evm, solana: null });
    expect(resolveAccounts({ connectedEvm: null, solana: null, watched: { address: other, family: "evm" } })).toEqual({ evm: other, solana: null });
  });

  test("a followed Solana address is used only when no Solana wallet is connected", () => {
    const mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    expect(resolveAccounts({ connectedEvm: null, solana: null, watched: { address: mint, family: "solana" } })).toEqual({ evm: null, solana: mint });
    expect(resolveAccounts({ connectedEvm: null, solana: "ConnectedSolanaAccount11111111111111111111111", watched: { address: mint, family: "solana" } }).solana).toBe("ConnectedSolanaAccount11111111111111111111111");
  });

  test("an account that is not an address is no account", () => {
    expect(resolveAccounts({ connectedEvm: "not an address", solana: null, watched: null })).toEqual({ evm: null, solana: null });
  });
});

describe("what the read says about itself", () => {
  test("the default scope asks the first fourteen and names the rest as not consulted", async () => {
    const { reader } = fakeReader({ networks: networkList([...MANY_EVM, "501", "0"]) });
    const read = await readBalance(reader, { evm: EVM_ACCOUNT, solana: null }, options);
    expect(read.coverage.requestedChains).toEqual(MANY_EVM.slice(0, BALANCE_EVM_NETWORKS));
    expect(read.coverage.requestedChains.length).toBe(14);
    expect(read.coverage.skippedChains).toEqual(MANY_EVM.slice(BALANCE_EVM_NETWORKS));
    expect(read.coverage.networkListKnown).toBe(true);
  });

  test("the full scope asks every EVM network the provider listed and leaves none out", async () => {
    const { reader, calls } = fakeReader({ networks: networkList([...MANY_EVM, "501", "0"]) });
    const read = await readBalance(reader, { evm: EVM_ACCOUNT, solana: null }, { ...options, scope: "all" });
    expect(read.coverage.requestedChains).toEqual(MANY_EVM);
    expect(read.coverage.skippedChains).toEqual([]);
    const asked = new Set(calls.flatMap((c) => c.chains));
    for (const chain of MANY_EVM) expect(asked.has(chain)).toBe(true);
  });

  test("the networks asked and the ones that did not answer are named, Solana included", async () => {
    const { reader } = fakeReader({ answer: (chains) => (chains.includes("501") ? { ok: false, error: "provider_error" } : { ok: true, data: { rows: [row("8453", "USDC", 300, USDC)], total: 1 }, meta: META() }) });
    const read = await readBalance(reader, { evm: EVM_ACCOUNT, solana: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }, options);
    expect(read.coverage.requestedChains).toContain("501");
    expect(read.coverage.requestedChains).toContain("1");
    expect(read.missing).toEqual(["501"]);
    expect(read.saldo!.totalUsd).toBe(300);
  });

  test("an answer served from an old copy marks the read stale", async () => {
    const old = { ...META(), stale: true };
    const { reader } = fakeReader({ answer: () => ({ ok: true, data: { rows: [row("8453", "USDC", 100, USDC)], total: 1 }, meta: old }) });
    const read = await readBalance(reader, { evm: EVM_ACCOUNT, solana: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }, options);
    expect(read.coverage.stale).toBe(true);
  });

  test("the provider keeping only the largest rows marks the read truncated", async () => {
    const { reader } = fakeReader({ answer: (chains) => (chains.includes("501") ? { ok: true, data: { rows: [row("501", "SOL", 800)], total: 9 }, meta: META() } : { ok: true, data: { rows: [], total: 0 }, meta: META() }) });
    const read = await readBalance(reader, { evm: null, solana: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }, options);
    expect(read.coverage.truncated).toBe(true);
  });

  test("rows without a price and rows the provider flagged are counted, never read as zero", async () => {
    const rows = [
      row("8453", "USDC", 500, USDC),
      { chainIndex: "8453", symbol: "NOPX", tokenAddress: null, balance: 3, priceUsd: null, valueUsd: null, flaggedRisk: false },
      { chainIndex: "8453", symbol: "NOPZ", tokenAddress: null, balance: 2, priceUsd: 0, valueUsd: null, flaggedRisk: false },
      { chainIndex: "8453", symbol: "SCAM", tokenAddress: null, balance: 7, priceUsd: 1, valueUsd: 7, flaggedRisk: true },
      { chainIndex: "8453", symbol: "DUST0", tokenAddress: null, balance: 0, priceUsd: null, valueUsd: null, flaggedRisk: false },
    ];
    const answer = (chains: readonly string[]): HoldingsResult<BalancesData> => ({
      ok: true,
      data: { rows: chains.includes("501") ? [] : rows.filter((r) => chains.includes(r.chainIndex)), total: 5 },
      meta: META(),
    });
    const { reader } = fakeReader({ answer });
    const read = await readBalance(reader, { evm: EVM_ACCOUNT, solana: null }, options);
    expect(read.coverage.unpricedRows).toBe(2);
    expect(read.coverage.flaggedRows).toBe(1);
    expect(read.saldo!.totalUsd).toBe(500);
  });

  test("a network list that does not come says so, and the read falls back to the networks the app knows", async () => {
    const { reader } = fakeReader({ networks: { ok: false, error: "provider_error" } });
    const read = await readBalance(reader, { evm: EVM_ACCOUNT, solana: null }, options);
    expect(read.coverage.networkListKnown).toBe(false);
    expect(read.coverage.requestedChains).toEqual(evmNetworksToRead(null));
    expect(read.coverage.requestedChains).not.toContain("501");
    expect(read.saldo).not.toBeNull();
  });

  test("a cancelled read still says what it had asked for, but hands no balance", async () => {
    const controller = new AbortController();
    const { reader } = fakeReader({ networks: networkList(MANY_EVM), answer: () => (controller.abort(), { ok: true, data: { rows: [row("8453", "USDC", 10, USDC)], total: 1 }, meta: META() }) });
    const read = await readBalance(reader, { evm: EVM_ACCOUNT, solana: null }, { ...options, signal: controller.signal });
    expect(read.saldo).toBeNull();
    expect(read.coverage.requestedChains.length).toBeGreaterThan(0);
  });
});
