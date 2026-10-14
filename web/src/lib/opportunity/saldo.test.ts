// The balance the page hands to the ecosystem click: what counts, what is cash, what is held, in the closed shape the core accepts. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { BalanceRow } from "../wallet/holdings";
import { saldoFromRows } from "./saldo";

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH = "0x4200000000000000000000000000000000000006";
const MINT = "So11111111111111111111111111111111111111112";

const row = (over: Partial<BalanceRow>): BalanceRow => ({ chainIndex: "8453", symbol: "ETH", tokenAddress: null, balance: 1, priceUsd: 2_500, valueUsd: 2_500, flaggedRisk: false, ...over });

const ROWS: BalanceRow[] = [
  row({ symbol: "USDC", tokenAddress: USDC_BASE, balance: 1_200, priceUsd: 1, valueUsd: 1_200 }),
  row({ chainIndex: "56", symbol: "USDT", tokenAddress: "0x55d398326f99059ff775485246999027b3197955", balance: 300, priceUsd: 1, valueUsd: 300 }),
  row({ symbol: "ETH" }),
  row({ symbol: "WETH", tokenAddress: WETH.toUpperCase().replace("0X", "0x"), valueUsd: 100 }),
  row({ chainIndex: "501", symbol: "SOL", tokenAddress: null, valueUsd: 400 }),
  row({ chainIndex: "501", symbol: "JUP", tokenAddress: MINT, valueUsd: 50 }),
  row({ symbol: "AIRDROP", tokenAddress: "0x00000000000000000000000000000000000000aa", valueUsd: 9_999, flaggedRisk: true }),
  row({ symbol: "NOPRICE", tokenAddress: "0x00000000000000000000000000000000000000bb", priceUsd: null, valueUsd: null }),
];

describe("what counts", () => {
  test("the rows with a price that the provider does not mark as risk, and nothing else", () => {
    const saldo = saldoFromRows(ROWS, 1_000)!;
    // 1,200 + 300 + 2,500 + 100 + 400 + 50: the flagged airdrop and the token with no price are out
    expect(saldo.totalUsd).toBe(4_550);
    expect(saldo.observedAtMs).toBe(1_000);
  });

  test("the cash is the stable coins, network by network, the largest first", () => {
    const saldo = saldoFromRows(ROWS, 1_000)!;
    expect(saldo.cashUsd).toBe(1_500);
    expect(saldo.chains).toEqual([{ chainIndex: "8453", cashUsd: 1_200 }, { chainIndex: "56", cashUsd: 300 }]);
  });

  test("what is held is the public address of each token, in the way the core keeps it, with the native coin as native", () => {
    const { holdings } = saldoFromRows(ROWS, 1_000)!;
    expect(holdings).toEqual([
      { chainIndex: "8453", address: "native", usd: 2_500 },
      { chainIndex: "501", address: "native", usd: 400 },
      { chainIndex: "8453", address: WETH, usd: 100 },
      { chainIndex: "501", address: MINT, usd: 50 },
    ]);
    // the cash is not a holding to be sized against, and a token that is not a public address is left out
    expect(saldoFromRows([row({ symbol: "ODD", tokenAddress: "not an address" }), row({ symbol: "USDC", tokenAddress: USDC_BASE, valueUsd: 10 })], 1)!.holdings).toEqual([]);
  });

  test("the same token on the same network is one holding, however many rows it came in", () => {
    const { holdings } = saldoFromRows([row({ symbol: "WETH", tokenAddress: WETH, valueUsd: 60 }), row({ symbol: "WETH", tokenAddress: WETH, valueUsd: 40 }), row({ symbol: "USDC", tokenAddress: USDC_BASE, valueUsd: 5 })], 1)!;
    expect(holdings).toEqual([{ chainIndex: "8453", address: WETH, usd: 100 }]);
  });
});

describe("when there is no portfolio to size against", () => {
  test("nothing with a price is no balance", () => {
    expect(saldoFromRows([], 1)).toBeNull();
    expect(saldoFromRows([row({ valueUsd: null, priceUsd: null })], 1)).toBeNull();
    expect(saldoFromRows([row({ flaggedRisk: true })], 1)).toBeNull();
    expect(saldoFromRows([row({ valueUsd: 0 })], 1)).toBeNull();
    expect(saldoFromRows([row({ valueUsd: Number.NaN })], 1)).toBeNull();
  });

  test("a moment that is not a moment is no balance", () => {
    expect(saldoFromRows(ROWS, 0)).toBeNull();
    expect(saldoFromRows(ROWS, 1.5)).toBeNull();
  });

  test("a portfolio of no cash at all is a balance with no cash: the core then offers no size", () => {
    const saldo = saldoFromRows([row({})], 1)!;
    expect(saldo.cashUsd).toBe(0);
    expect(saldo.chains).toEqual([]);
  });
});

describe("the share the person accepts to lose", () => {
  test("is passed through when it makes sense and is null otherwise, so the core keeps its default", () => {
    expect(saldoFromRows(ROWS, 1, 0.02)!.riskPct).toBe(0.02);
    for (const bad of [0, -1, 0.5, Number.NaN]) expect(saldoFromRows(ROWS, 1, bad)!.riskPct).toBeNull();
    expect(saldoFromRows(ROWS, 1)!.riskPct).toBeNull();
  });
});

describe("the limits of the core", () => {
  test("at most 40 holdings and 16 networks of cash, so a payload that leaves here is never refused for its size", () => {
    const many: BalanceRow[] = Array.from({ length: 60 }, (_, i) => row({ symbol: `T${i}`, tokenAddress: `0x${i.toString(16).padStart(40, "0")}`, valueUsd: 10 + i }));
    expect(saldoFromRows(many, 1)!.holdings).toHaveLength(40);
    const chains: BalanceRow[] = Array.from({ length: 20 }, (_, i) => row({ chainIndex: String(100 + i), symbol: "USDC", tokenAddress: USDC_BASE, valueUsd: 5 + i }));
    const saldo = saldoFromRows(chains, 1)!;
    expect(saldo.chains).toHaveLength(16);
    expect(saldo.chains.reduce((s, c) => s + c.cashUsd, 0)).toBeLessThanOrEqual(saldo.cashUsd + 0.01);
  });

  test("no address of a wallet anywhere in it", () => {
    expect(JSON.stringify(saldoFromRows(ROWS, 1))).not.toMatch(/wallet|account|owner/i);
  });
});
