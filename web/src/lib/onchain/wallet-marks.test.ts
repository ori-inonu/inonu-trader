import { describe, expect, test } from "bun:test";
import type { DeskCandle } from "../desk/types";
import type { Signal } from "./client";
import { candleIndexForTs, signalMarks, WALLET_MARKS_MAX, walletMarksByIndex, type WalletMark } from "./wallet-marks";

const signal = (tsMs: number, over: Partial<Signal> = {}): Signal => ({
  tsMs,
  chainIndex: "1",
  walletType: "smart_money",
  walletCount: 2,
  amountUsd: 500,
  priceUsd: 1,
  soldRatioPct: 40,
  token: { address: "0xt", symbol: "TKN", marketCap: null, holders: null, top10HoldPct: null },
  ...over,
});

const desk = (tsMs: number): DeskCandle => ({ tsMs, open: 1, high: 2, low: 0.5, close: 1.5, volBase: 1, volQuote: 1, confirmed: true });
const mark = (tsMs: number): WalletMark => ({ tsMs, walletType: "smart_money", count: 1, amountUsd: 10, soldPct: null });

describe("signalMarks", () => {
  test("orders oldest first and maps the provider fields", () => {
    const out = signalMarks([signal(300), signal(100), signal(200, { walletType: "kol", walletCount: 5, soldRatioPct: null })]);
    expect(out.map((m) => m.tsMs)).toEqual([100, 200, 300]);
    expect(out[1]).toMatchObject({ walletType: "kol", count: 5, soldPct: null });
  });

  test("keeps at most WALLET_MARKS_MAX, the newest win", () => {
    const many = Array.from({ length: WALLET_MARKS_MAX + 10 }, (_, i) => signal(i + 1));
    const out = signalMarks(many);
    expect(out).toHaveLength(WALLET_MARKS_MAX);
    expect(out[0]!.tsMs).toBe(11);
    expect(out[WALLET_MARKS_MAX - 1]!.tsMs).toBe(WALLET_MARKS_MAX + 10);
  });
});

describe("candleIndexForTs", () => {
  const candles = [desk(1000), desk(2000), desk(3000)];

  test("finds the candle whose interval contains the timestamp", () => {
    expect(candleIndexForTs(candles, 1000, 1000)).toBe(0);
    expect(candleIndexForTs(candles, 1500, 1000)).toBe(0);
    expect(candleIndexForTs(candles, 1999, 1000)).toBe(0);
    expect(candleIndexForTs(candles, 2000, 1000)).toBe(1);
    expect(candleIndexForTs(candles, 3999, 1000)).toBe(2);
  });

  test("returns -1 outside the series", () => {
    expect(candleIndexForTs(candles, 999, 1000)).toBe(-1);
    expect(candleIndexForTs(candles, 4000, 1000)).toBe(-1);
    expect(candleIndexForTs([], 1000, 1000)).toBe(-1);
  });
});

describe("walletMarksByIndex", () => {
  test("groups marks under their candle and drops out-of-range marks", () => {
    const candles = [desk(1000), desk(2000), desk(3000)];
    const out = walletMarksByIndex([mark(1500), mark(2500), mark(2600), mark(50)], candles, 1000);
    expect(out.get(0)?.length).toBe(1);
    expect(out.get(1)?.length).toBe(2);
    expect(out.has(2)).toBe(false);
  });

  test("empty marks give an empty map", () => {
    expect(walletMarksByIndex([], [desk(0)], 1000).size).toBe(0);
  });
});
