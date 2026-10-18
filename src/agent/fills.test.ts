import { describe, expect, test } from "bun:test";
import type { SolanaReceiptEvidence } from "../server/solana-receipts";
import { createFillStore, execBrief, fillFrom, roundTrips, tokenTripsBrief, type FillRecord } from "./fills";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 14, 20, 0, 0);
const sig = (n: number) => String(n).repeat(88).slice(0, 88);

const evidence = (deltas: { mint: string; decimals: number; deltaMinor: string }[], over: Partial<SolanaReceiptEvidence> = {}): SolanaReceiptEvidence => ({ status: "success", slot: 9, feeLamports: "30250", walletFeeLamports: "30250", nativeDeltaLamports: "-1000", blockTimeMs: T0, tokenDeltas: deltas, ...over });
const order = (over: Record<string, unknown> = {}) => ({ orderKey: "c1:buy:x", atMs: T0, side: "buy" as const, address: MINT, symbol: "STONK", ref: sig(1), ...over });
const buyEvidence = evidence([{ mint: USDC, decimals: 6, deltaMinor: "-12000000" }, { mint: MINT, decimals: 9, deltaMinor: "110034676384" }]);
const sellEvidence = evidence([{ mint: USDC, decimals: 6, deltaMinor: "11947276" }, { mint: MINT, decimals: 9, deltaMinor: "-110034676384" }]);

describe("a real fill is read from the final transaction of the order: the token that moved and the stablecoin that moved the other way", () => {
  test("a purchase brings the token in and takes a stablecoin out; a sale does the opposite; the amounts are in the currency that moved, exact until the end", () => {
    expect(fillFrom(order(), buyEvidence)).toMatchObject({ kind: "fill", orderKey: "c1:buy:x", side: "buy", mint: MINT, symbol: "STONK", signature: sig(1), tokenMinor: "110034676384", tokenDecimals: 9, cashMint: USDC, cashUnits: 12, feeLamports: "30250" });
    const sold = fillFrom(order({ orderKey: "c2:hold:x", side: "sell", ref: sig(2) }), sellEvidence)!;
    expect(sold.cashMint).toBe(USDC);
    expect(sold.cashUnits).toBeCloseTo(11.947276, 9);
    expect(sold.tokenMinor).toBe("110034676384");
  });

  test("a transaction that does not move the token of the order the way the order says, or is not final success, is no fill of that order", () => {
    expect(fillFrom(order(), sellEvidence)).toBeNull();
    expect(fillFrom(order({ side: "sell" }), buyEvidence)).toBeNull();
    expect(fillFrom(order(), evidence([{ mint: USDC, decimals: 6, deltaMinor: "-12000000" }]))).toBeNull();
    expect(fillFrom(order(), { ...buyEvidence, status: "failed" })).toBeNull();
    expect(fillFrom(order(), { ...buyEvidence, status: "pending" })).toBeNull();
    expect(fillFrom(order(), { ...buyEvidence, tokenDeltas: null })).toBeNull();
    expect(fillFrom(order({ ref: null }), buyEvidence)).toBeNull();
  });

  test("when no stablecoin moved against the token (the other side was SOL, say) the amount is UNKNOWN, never zero; and when two different stablecoins moved it is unknown too, never a sum of two currencies", () => {
    const none = fillFrom(order(), evidence([{ mint: MINT, decimals: 9, deltaMinor: "5000000000" }]))!;
    expect(none.cashMint).toBeNull();
    expect(none.cashUnits).toBeNull();
    expect(none.tokenMinor).toBe("5000000000");
    const both = fillFrom(order(), evidence([{ mint: MINT, decimals: 9, deltaMinor: "100" }, { mint: USDC, decimals: 6, deltaMinor: "-6000000" }, { mint: USDT, decimals: 6, deltaMinor: "-6000000" }]))!;
    expect(both.cashMint).toBeNull();
    expect(both.cashUnits).toBeNull();
  });

  test("the fee the wallet really paid and its native movement survive, a sponsored fee (zero for this wallet) included, and none of them is rounded or turned into dollars", () => {
    const f = fillFrom(order(), { ...buyEvidence, feeLamports: "136480", walletFeeLamports: "0", nativeDeltaLamports: "-1488440" })!;
    expect(f.feeLamports).toBe("136480");
    expect(f.walletFeeLamports).toBe("0");
    expect(f.nativeDeltaLamports).toBe("-1488440");
    // what the evidence does not say stays unsaid
    const bare = fillFrom(order(), { status: "success", slot: 1, feeLamports: null, nativeDeltaLamports: null, tokenDeltas: buyEvidence.tokenDeltas })!;
    expect(bare.walletFeeLamports).toBeNull();
    expect(bare.nativeDeltaLamports).toBeNull();
  });

  test("the time of a fill is the time of the block when the chain says it, not the time a delayed reconciliation updated the order", () => {
    const late = fillFrom(order({ atMs: T0 + 4 * 3_600_000 }), buyEvidence)!;
    expect(late.atMs).toBe(T0);
    expect(late.atSource).toBe("chain");
    const unknown = fillFrom(order({ atMs: T0 + 1000 }), { ...buyEvidence, blockTimeMs: null })!;
    expect(unknown.atMs).toBe(T0 + 1000);
    expect(unknown.atSource).toBe("ledger");
  });
});

describe("the round trips: what came back against what went out in the SAME currency, per token, and nothing it cannot match", () => {
  const fill = (over: Partial<FillRecord> & { side: "buy" | "sell" }): FillRecord => ({ kind: "fill", orderKey: `k${Math.random()}`, atMs: T0, atSource: "chain", mint: MINT, symbol: "STONK", signature: sig(Math.floor(Math.random() * 9) + 1), tokenMinor: "100", tokenDecimals: 9, cashMint: USDC, cashUnits: 12, feeLamports: null, walletFeeLamports: null, nativeDeltaLamports: null, ...over });

  test("a bought and sold position is one round trip: the amount back minus the amount out, the minutes between", () => {
    const trips = roundTrips([fill({ side: "buy", orderKey: "b", atMs: T0, tokenMinor: "110034676384", cashUnits: 12 }), fill({ side: "sell", orderKey: "s", atMs: T0 + 16 * MIN, tokenMinor: "110034676384", cashUnits: 11.947276 })]);
    expect(trips.trips).toHaveLength(1);
    expect(trips.trips[0]).toMatchObject({ symbol: "STONK", cashMint: USDC, costUnits: 12, proceedsUnits: 11.947276, minutes: 16 });
    expect(trips.trips[0]!.netUnits).toBeCloseTo(-0.052724, 9);
    expect(trips.unmatchedSells).toBe(0);
  });

  test("different settlement currencies are never added: a purchase paid in one stablecoin and a sale received in another is unknown", () => {
    const trips = roundTrips([fill({ side: "buy", orderKey: "b", cashMint: USDC, cashUnits: 12 }), fill({ side: "sell", orderKey: "s", atMs: T0 + MIN, cashMint: USDT, cashUnits: 13 })]);
    expect(trips.trips).toEqual([]);
    expect(trips.unknownValue).toBe(1);
  });

  test("a mint seen with two different token decimals has unknown attribution: the raw amounts are not comparable", () => {
    const trips = roundTrips([fill({ side: "buy", orderKey: "b" }), fill({ side: "sell", orderKey: "s", atMs: T0 + MIN, tokenDecimals: 6 })]);
    expect(trips.trips).toEqual([]);
    expect(trips.unknownValue).toBe(1);
  });

  test("a sale of a token the agent never bought has no entry: it counts apart, and an amount that came in is not a profit", () => {
    const trips = roundTrips([fill({ side: "sell", orderKey: "old", tokenMinor: "500", cashUnits: 25.9 })]);
    expect(trips.trips).toEqual([]);
    expect(trips.unmatchedSells).toBe(1);
  });

  test("a part of a position sold takes its share of the cost, first in first out, and what is still held is not a trip", () => {
    const trips = roundTrips([fill({ side: "buy", orderKey: "b1", tokenMinor: "100", cashUnits: 10 }), fill({ side: "buy", orderKey: "b2", atMs: T0 + MIN, tokenMinor: "100", cashUnits: 20 }), fill({ side: "sell", orderKey: "s1", atMs: T0 + 5 * MIN, tokenMinor: "150", cashUnits: 30 })]);
    expect(trips.trips).toHaveLength(1);
    // 100 tokens at 10 and 50 of the second lot (10): cost 20, and the sale of 150 tokens brought 30
    expect(trips.trips[0]).toMatchObject({ costUnits: 20, proceedsUnits: 30, netUnits: 10 });
    expect(trips.heldMint).toEqual({ [MINT]: "50" });
  });

  test("an amount that is unknown on either side makes the trip unknown, never a gain or a loss of zero", () => {
    const trips = roundTrips([fill({ side: "buy", orderKey: "b", cashMint: null, cashUnits: null }), fill({ side: "sell", orderKey: "s", atMs: T0 + MIN, cashUnits: 11 })]);
    expect(trips.trips).toEqual([]);
    expect(trips.unknownValue).toBe(1);
  });

  test("tokens are never mixed: another mint has its own lots", () => {
    const other = "So11111111111111111111111111111111111111112";
    const trips = roundTrips([fill({ side: "buy", orderKey: "b", mint: MINT }), fill({ side: "sell", orderKey: "s", atMs: T0 + MIN, mint: other, symbol: "OTHER" })]);
    expect(trips.trips).toEqual([]);
    expect(trips.unmatchedSells).toBe(1);
  });

  test("the minutes of a trip come from the time of the blocks, so a late reconciliation does not stretch it", () => {
    const trips = roundTrips([fill({ side: "buy", orderKey: "b", atMs: T0 }), fill({ side: "sell", orderKey: "s", atMs: T0 + 16 * MIN })]);
    expect(trips.trips[0]!.minutes).toBe(16);
  });
});

describe("what the model reads: the return of closed round trips in the same stablecoin, with its limits said", () => {
  const f = (over: Partial<FillRecord> & { side: "buy" | "sell"; orderKey: string }): FillRecord => ({ kind: "fill", atMs: T0, atSource: "chain", mint: MINT, symbol: "STONK", signature: sig(7), tokenMinor: "100", tokenDecimals: 9, cashMint: USDC, cashUnits: 12, feeLamports: null, walletFeeLamports: null, nativeDeltaLamports: null, ...over });

  test("nothing real yet is null, and the numbers are percentages of what went out, rounded, bounded and never called profit", () => {
    expect(execBrief([])).toBeNull();
    const fills: FillRecord[] = [
      f({ orderKey: "b", side: "buy", signature: sig(1), cashUnits: 12 }),
      f({ orderKey: "s", side: "sell", atMs: T0 + 16 * MIN, signature: sig(2), cashUnits: 11.947276 }),
      f({ orderKey: "old", side: "sell", atMs: T0 - 100 * MIN, signature: sig(3), mint: "So11111111111111111111111111111111111111112", symbol: "PEDRO", tokenMinor: "9", tokenDecimals: 6, cashUnits: 25.9 }),
    ];
    const brief = execBrief(fills)!;
    // percent of what went out, never dollars: the model does not read the size of the wallet
    expect(brief).toEqual({ voltas: 1, retorno: -0.44, ultimas: [{ s: "STONK", m: 16, p: -0.44 }], sem_entrada: 1, desconhecidas: 0 });
    expect(JSON.stringify(brief)).not.toMatch(/lucro|profit|ganho|usd/i);
  });

  test("when the trips were settled in different stablecoins the aggregate is unknown (null), never a percent of mixed currencies; each trip keeps its own percent", () => {
    const fills: FillRecord[] = [];
    for (const [i, cash] of [USDC, USDT].entries()) {
      const mint = `Mint${i}`.padEnd(44, "1");
      fills.push(f({ orderKey: `b${i}`, side: "buy", mint, signature: sig(i + 1), cashMint: cash, cashUnits: 10, atMs: T0 + i * 100 * MIN }));
      fills.push(f({ orderKey: `s${i}`, side: "sell", mint, signature: sig(i + 5), cashMint: cash, cashUnits: 11, atMs: T0 + i * 100 * MIN + 10 * MIN }));
    }
    const brief = execBrief(fills)!;
    expect(brief.voltas).toBe(2);
    expect(brief.retorno).toBeNull();
    expect(brief.ultimas.map((u) => u.p)).toEqual([10, 10]);
  });

  test("at most three of the latest trips are listed, newest first, and a symbol is cleaned", () => {
    const fills: FillRecord[] = [];
    for (let i = 0; i < 5; i++) {
      const mint = `Mint${i}`.padEnd(44, "1");
      fills.push(f({ orderKey: `b${i}`, side: "buy", mint, symbol: i === 4 ? "BAD<script>" : `T${i}`, signature: sig(i + 1), tokenMinor: "10", tokenDecimals: 6, cashUnits: 10, atMs: T0 + i * 100 * MIN }));
      fills.push(f({ orderKey: `s${i}`, side: "sell", mint, symbol: i === 4 ? "BAD<script>" : `T${i}`, signature: sig(i + 11), tokenMinor: "10", tokenDecimals: 6, cashUnits: 10 + i, atMs: T0 + i * 100 * MIN + 10 * MIN }));
    }
    const brief = execBrief(fills)!;
    expect(brief.voltas).toBe(5);
    expect(brief.ultimas).toHaveLength(3);
    expect(brief.ultimas.map((u) => u.s)).toEqual(["BADscript", "T3", "T2"]);
    // 50 out and 60 back over the five trips, all in one stablecoin: 20 percent of what went out
    expect(brief.retorno).toBe(20);
    expect(brief.ultimas.map((u) => u.p)).toEqual([40, 30, 20]);
  });

  test("a trip that could not be valued is counted as unknown, so a rejected or unreadable fill is never a complete history and never a return of zero", () => {
    const brief = execBrief([f({ orderKey: "b", side: "buy", signature: sig(1), cashMint: null, cashUnits: null }), f({ orderKey: "s", side: "sell", atMs: T0 + MIN, signature: sig(2), cashUnits: 11 })])!;
    expect(brief.voltas).toBe(0);
    expect(brief.retorno).toBeNull();
    expect(brief.desconhecidas).toBe(1);
  });

  test("tokenTripsBrief groups closed round trips by token mint with trip count, last hold minutes, last return percent and minutes since exit", () => {
    expect(tokenTripsBrief([])).toEqual({});
    const fills: FillRecord[] = [
      f({ orderKey: "b1", side: "buy", signature: sig(1), cashUnits: 11, atMs: T0 }),
      f({ orderKey: "s1", side: "sell", signature: sig(2), cashUnits: 10.9689, atMs: T0 + 2 * MIN }),
      f({ orderKey: "b2", side: "buy", signature: sig(3), cashUnits: 11, atMs: T0 + 4 * MIN }),
      f({ orderKey: "s2", side: "sell", signature: sig(4), cashUnits: 10.9914, atMs: T0 + 6 * MIN }),
    ];
    expect(tokenTripsBrief(fills, T0 + 8 * MIN)).toEqual({ [MINT]: { n: 2, m: 2, p: -0.08, ag: 2 } });
  });
});

describe("the store of fills is a file that tolerates a bad line and never keeps one order, or one transaction, twice", () => {
  test("adding keeps one fill per order and per signature, reading is tolerant, and what was added survives a restart", () => {
    const lines: string[] = ["not json", JSON.stringify({ kind: "something else" })];
    const store = createFillStore({ read: () => lines, append: (l) => void lines.push(l) });
    const fill = fillFrom(order(), buyEvidence)!;
    expect(store.has("c1:buy:x")).toBe(false);
    expect(store.add(fill)).toBe(true);
    expect(store.add(fill)).toBe(false);
    // the same transaction under another order key is the same fill, never a second one
    expect(store.add({ ...fill, orderKey: "c9:another-order" })).toBe(false);
    expect(store.has("c1:buy:x")).toBe(true);
    expect(store.all()).toHaveLength(1);
    const reopened = createFillStore({ read: () => lines, append: () => {} });
    expect(reopened.all()).toEqual(store.all());
    // and a file written with the same transaction twice is read as one
    const dup = createFillStore({ read: () => [JSON.stringify(fill), JSON.stringify({ ...fill, orderKey: "c9:another-order" })], append: () => {} });
    expect(dup.all()).toHaveLength(1);
  });
});
