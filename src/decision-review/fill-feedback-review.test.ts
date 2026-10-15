import { expect, test } from "bun:test";
import { createFillStore, fillFrom, roundTrips, type FillRecord } from "../agent/fills";
import type { SolanaReceiptEvidence } from "../server/solana-receipts";

// Independent contract checks of the proposed, not-yet-deployed feedback adapter. No API, key, wallet or financial file.
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const mint = "B".repeat(44), signature = (n: number) => String(n).repeat(88), at = 1_000_000;
const order = (side: "buy" | "sell", n: number) => ({ orderKey: "synthetic:" + n, atMs: at + n * 1000, side, address: mint, symbol: "SYNTH", ref: signature(n) });
const evidence = (side: "buy" | "sell", cashMint = USDC, extra = {}): SolanaReceiptEvidence => ({ status: "success", slot: 100,
  feeLamports: "5000", walletFeeLamports: "5000", nativeDeltaLamports: "-9000", blockTimeMs: at,
  tokenDeltas: [{ mint, decimals: 9, deltaMinor: side === "buy" ? "100" : "-100" }, { mint: cashMint, decimals: 6, deltaMinor: side === "buy" ? "-12000000" : "13000000" }], ...extra });

test("different settlement currencies cannot be added into a purported USD return", () => {
  const buy = fillFrom(order("buy", 1), evidence("buy"))!;
  const sell = fillFrom(order("sell", 2), evidence("sell", USDT))!;
  expect(roundTrips([buy, sell]).trips).toHaveLength(0);
});

test("one chain transaction cannot be counted twice under different order keys", () => {
  const rows: string[] = [], store = createFillStore({ read: () => rows, append: line => { rows.push(line); } });
  const fill = fillFrom(order("buy", 1), evidence("buy"))!;
  expect(store.add(fill)).toBe(true);
  expect(store.add({ ...fill, orderKey: "synthetic:another-order" })).toBe(false);
  expect(store.all()).toHaveLength(1);
});

test("a mint with conflicting token decimals has unknown attribution rather than a measured round trip", () => {
  const buy = fillFrom(order("buy", 1), evidence("buy"))!;
  const sell = fillFrom(order("sell", 2), evidence("sell"))!;
  expect(roundTrips([buy, { ...sell, tokenDecimals: 6 }]).trips).toHaveLength(0);
});

test("the actual wallet-paid fee and native movement survive feedback extraction, including a sponsored fee", () => {
  const fill = fillFrom(order("buy", 1), evidence("buy", USDC, { walletFeeLamports: "0", nativeDeltaLamports: "-1488440" })) as (FillRecord & { walletFeeLamports?: string; nativeDeltaLamports?: string }) | null;
  expect(fill?.walletFeeLamports).toBe("0");
  expect(fill?.nativeDeltaLamports).toBe("-1488440");
});

test("confirmed execution time comes from the chain, not the time a delayed local receipt updated the order", () => {
  expect(fillFrom({ ...order("buy", 1), atMs: at + 4 * 3_600_000 }, evidence("buy"))?.atMs).toBe(at);
});
