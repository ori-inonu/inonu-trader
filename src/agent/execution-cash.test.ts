import { describe, expect, test } from "bun:test";
import type { RawTokenAsset } from "../okx-wallet/portfolio";
import { bookFromAssets } from "./book";
import { saldoOf } from "./candidates";
import { sizesFor } from "./sizing-agent";
import { settlementFor, usdToRaw } from "./swap-args";

const NOW = 1_000_000;
const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const asset = (over: Partial<RawTokenAsset>): RawTokenAsset => ({ chainIndex: "501", tokenContractAddress: SOL_USDC, address: "wallet", symbol: "USDC", balance: "1", rawBalance: "1000000", tokenPrice: "1", isRiskToken: false, ...over });
const bookOf = (...assets: RawTokenAsset[]) => bookFromAssets([{ wallet: "agente", assets }], NOW).book;
const cashOn = (book: ReturnType<typeof bookOf>, chain = "501") => saldoOf(book, null)?.chains.find((c) => c.chainIndex === chain)?.cashUsd ?? 0;

/** The raw amount an order of `usd` dollars sends: what the tool is asked to move. */
const sentRaw = (usd: number, decimals: number): bigint => usdToRaw(usd, decimals) ?? 0n;

describe("the cash a purchase may use is what the coin that pays HOLDS, in whole units of that coin (composition of the wallet reading, the sizing and the order)", () => {
  test("a balance with a fraction of a cent is cut DOWN to the cent, never rounded up: 37.125 offers 37.12, so no size asks for more than the wallet holds", () => {
    const book = bookOf(asset({ balance: "37.125", rawBalance: "37125000" }));
    expect(cashOn(book)).toBe(37.12);
    const held = 37_125_000n;
    for (const usd of Object.values(sizesFor(cashOn(book)!))) expect(sentRaw(usd, 6)).toBeLessThanOrEqual(held);
  });

  test("a dollar coin priced above one is counted at its units, not at its price: 100 coins at 1.0004 offer 100, and the order never asks for 100.04 coins", () => {
    const book = bookOf(asset({ balance: "100", rawBalance: "100000000", tokenPrice: "1.0004" }));
    expect(cashOn(book)).toBe(100);
    for (const usd of Object.values(sizesFor(cashOn(book)!))) expect(sentRaw(usd, 6)).toBeLessThanOrEqual(100_000_000n);
  });

  test("a dollar coin priced below one keeps its lower value, which is the lower number of units it can pay with", () => {
    const book = bookOf(asset({ balance: "100", rawBalance: "100000000", tokenPrice: "0.9996" }));
    expect(cashOn(book)).toBe(99.96);
  });

  test("two dollar coins on one network are NOT one pot: the order pays in the biggest one only, so the cash offered is that coin's alone", () => {
    const book = bookOf(asset({ balance: "60", rawBalance: "60000000" }), asset({ tokenContractAddress: SOL_USDT, symbol: "USDT", balance: "40", rawBalance: "40000000" }));
    expect(settlementFor(book, "501")?.address).toBe(SOL_USDC);
    expect(cashOn(book)).toBe(60);
    for (const usd of Object.values(sizesFor(cashOn(book)!))) expect(sentRaw(usd, 6)).toBeLessThanOrEqual(60_000_000n);
  });

  test("a dollar coin whose decimals cannot be known exactly cannot pay: the network has no cash to offer, and a native coin never counts as cash", () => {
    const odd = bookOf(asset({ balance: "10", rawBalance: "10300000" }));
    expect(cashOn(odd)).toBe(0);
    const nativeOnly = bookOf(asset({ tokenContractAddress: "", symbol: "SOL", balance: "2", rawBalance: "2000000000", tokenPrice: "150" }));
    expect(cashOn(nativeOnly)).toBe(0);
  });

  test("each network keeps its own cash, and a network with no dollar coin is absent from the cash of the wallet", () => {
    const book = bookOf(asset({ balance: "25.5", rawBalance: "25500000" }), asset({ chainIndex: "8453", tokenContractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", balance: "12.341", rawBalance: "12341000" }));
    const saldo = saldoOf(book, null)!;
    expect(saldo.chains.map((c) => [c.chainIndex, c.cashUsd]).sort()).toEqual([["501", 25.5], ["8453", 12.34]]);
    expect(saldo.cashUsd).toBeCloseTo(37.84, 9);
  });
});

describe("what a purchase already sent has spent of the cash, until the wallet shows it (SF-1)", () => {
  test("the dollars of purchases not yet reflected are taken off the cash of their network, and never below zero", () => {
    const book = bookOf(asset({ balance: "400", rawBalance: "400000000" }));
    expect(saldoOf(book, null, null, { "501": 150 })!.chains.find((c) => c.chainIndex === "501")!.cashUsd).toBe(250);
    expect(saldoOf(book, null, null, { "501": 900 })!.chains.find((c) => c.chainIndex === "501")!.cashUsd).toBe(0);
    expect(saldoOf(book, null, null, { "1": 50 })!.chains.find((c) => c.chainIndex === "501")!.cashUsd).toBe(400);
  });
});
