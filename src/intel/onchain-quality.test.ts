import { describe, expect, test } from "bun:test";
import { qualityFromWallets } from "./onchain-quality";

const board = [
  { wallet: "WalletA1111111111111111111111111111111111", winRatePct: 60 },
  { wallet: "WalletB2222222222222222222222222222222222", winRatePct: 40 },
  { wallet: "WalletC3333333333333333333333333333333333", winRatePct: null },
];

describe("qualityFromWallets: the mean win rate of the tracked wallets of a token (F2-DIG-1, F2-DIG-11)", () => {
  test("averages the win rate of the wallets found on the leaderboard, as a fraction", () => {
    const r = qualityFromWallets(["WalletA1111111111111111111111111111111111", "WalletB2222222222222222222222222222222222", "WalletZ9999999999999999999999999999999999"], board);
    expect(r.value).toBeCloseTo(0.5, 12);
    expect(r.matched).toBe(2);
    expect(r.reason).toBeNull();
  });
  test("a wallet counted twice counts once", () => {
    const r = qualityFromWallets(["WalletA1111111111111111111111111111111111", "WalletA1111111111111111111111111111111111"], board);
    expect(r.matched).toBe(1);
    expect(r.value).toBeCloseTo(0.6, 12);
  });
  test("EVM addresses are compared in lower case, other chains exactly", () => {
    const evm = [{ wallet: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD", winRatePct: 50 }];
    expect(qualityFromWallets(["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"], evm).matched).toBe(1);
    expect(qualityFromWallets(["walleta1111111111111111111111111111111111"], board).matched).toBe(0);
  });
  test("a wallet with an unknown or out of range win rate is not matched", () => {
    expect(qualityFromWallets(["WalletC3333333333333333333333333333333333"], board)).toEqual({ value: null, matched: 0, reason: "sem_juncao" });
    expect(qualityFromWallets(["X".repeat(30)], [{ wallet: "X".repeat(30), winRatePct: 130 }]).reason).toBe("sem_juncao");
  });
  test("no wallets at all is a different reason from wallets that match nothing", () => {
    expect(qualityFromWallets([], board)).toEqual({ value: null, matched: 0, reason: "sem_enderecos" });
    expect(qualityFromWallets(["WalletZ9999999999999999999999999999999999"], board)).toEqual({ value: null, matched: 0, reason: "sem_juncao" });
    expect(qualityFromWallets(["WalletA1111111111111111111111111111111111"], []).reason).toBe("sem_juncao");
  });
});
