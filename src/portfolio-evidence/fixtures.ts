/**
 * SYNTHETIC fixtures. Every address, contract, balance, price and total below is INVENTED for tests and the offline
 * demonstration. None of them is a capture, a real wallet or a real market value. The bodies follow the SHAPE the OKX
 * documentation publishes (field names and types), which proves nothing about live behavior.
 *
 * `FIXTURE_LABEL` travels with every demonstration so a reader can never mistake it for data.
 */

import type { RawBalanceRow } from "./balances.ts";
import type { RawHistoryRow } from "./history.ts";
import type { RawPnlRow } from "./address-analysis.ts";

export const FIXTURE_LABEL = "DADO SINTETICO: valores inventados para teste, nao e captura real" as const;

/** Invented EVM address (not a known wallet). */
export const FIXTURE_ACCOUNT = "0x00000000000000000000000000000000000f1401";
export const FIXTURE_NOW_MS = 1_760_000_000_000;

/** Invented contracts. */
export const FIXTURE_TOKEN_A = "0x00000000000000000000000000000000000a0001";
export const FIXTURE_TOKEN_B = "0x00000000000000000000000000000000000b0002";
export const FIXTURE_RISK_TOKEN = "0x00000000000000000000000000000000000c0003";
export const FIXTURE_SOLANA_ACCOUNT = "So1anaFixtureAccount11111111111111111111111";
export const FIXTURE_SOLANA_MINT = "FixtureMint111111111111111111111111111111";

export function balanceRow(overrides: Partial<RawBalanceRow> & { locator?: string } = {}): RawBalanceRow {
  return {
    locator: "/data/0/tokenAssets/0",
    chainIndex: "1",
    tokenContractAddress: FIXTURE_TOKEN_A,
    address: FIXTURE_ACCOUNT,
    symbol: "FIXA",
    balance: "2.5",
    rawBalance: "2500000",
    tokenPrice: "4",
    isRiskToken: false,
    ...overrides,
  };
}

/** Two valued ERC-20 style rows and a native coin: 10 (FIXA, 6 decimals), 10 (FIXB, 18 decimals), 30 (native ETH, pinned 18). */
export function syntheticBalanceRows(): RawBalanceRow[] {
  return [
    balanceRow({ locator: "/data/0/tokenAssets/0" }),
    balanceRow({ locator: "/data/0/tokenAssets/1", tokenContractAddress: FIXTURE_TOKEN_B, symbol: "FIXB", balance: "5", rawBalance: "5000000000000000000", tokenPrice: "2" }),
    balanceRow({ locator: "/data/0/tokenAssets/2", tokenContractAddress: "", symbol: "ETH", balance: "0.01", rawBalance: "10000000000000000", tokenPrice: "3000" }),
  ];
}

export function historyRow(overrides: Partial<RawHistoryRow> & { locator?: string } = {}): RawHistoryRow {
  return {
    locator: "/data/0/transactionList/0",
    chainIndex: "1",
    txHash: "0xfixturehash0000000000000000000000000000000000000000000000000001",
    itype: "2",
    methodId: "0xa9059cbb",
    nonce: "1",
    txTime: String(FIXTURE_NOW_MS - 86_400_000),
    from: [{ address: "0x00000000000000000000000000000000000ee001", amount: "3" }],
    to: [{ address: FIXTURE_ACCOUNT, amount: "3" }],
    tokenContractAddress: FIXTURE_TOKEN_A,
    amount: "3",
    symbol: "FIXA",
    txFee: "",
    txStatus: "success",
    hitBlacklist: false,
    ...overrides,
  };
}

export function pnlRow(overrides: Partial<RawPnlRow> & { locator?: string } = {}): RawPnlRow {
  return {
    locator: "/data/pnlList/0",
    chainIndex: "1",
    tokenContractAddress: FIXTURE_TOKEN_A,
    tokenSymbol: "FIXA",
    lastActiveTimestamp: String(FIXTURE_NOW_MS - 3_600_000),
    unrealizedPnlUsd: "12.5",
    realizedPnlUsd: "100000",
    totalPnlUsd: "100012.5",
    tokenBalanceUsd: "10",
    tokenBalanceAmount: "2.5",
    tokenPositionDuration: { holdingTimestamp: String(FIXTURE_NOW_MS - 5_000_000_000), sellOffTimestamp: "" },
    ...overrides,
  };
}
