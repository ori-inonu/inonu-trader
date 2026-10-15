import { describe, expect, test } from "bun:test";
import { buildSeries } from "./equity";
import { equityPause, equitySeries, parseSnapshotLine, snapshotOf, tradesOf } from "./equity-log";
import type { OrderRecord } from "./ledger";
import type { Book, Position } from "./types";

const HOUR = 3_600_000;
const NOW = 10_000_000_000;
const TOKEN = "EZ7RFLpHv14NK8b6wQuRefLvspYTy1TFpj5756TKpump";

const pos = (over: Partial<Position> = {}): Position => ({ id: `token:501:${TOKEN}`, chainIndex: "501", address: TOKEN, symbol: "PINCHA", wallet: "agente", usd: 20, balanceMinor: "5000000", decimals: 6, isCash: false, priceUsd: 4, ...over });
const cash = (usd: number): Position => ({ id: "token:501:USDC", chainIndex: "501", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", wallet: "agente", usd, balanceMinor: String(Math.round(usd * 1e6)), decimals: 6, isCash: true, priceUsd: 1 });
const book = (positions: Position[], over: Partial<Book> = {}): Book => ({ observedAtMs: NOW, positions, cashByChain: {}, totalUsd: 120, agentUsd: positions.filter((p) => p.wallet === "agente").reduce((s, p) => s + (p.usd ?? 0), 0), ...over });

describe("a reading of the wallet, as the equity series wants it", () => {
  test("the agent's own wallet only, quantities in whole units and the price they were valued at", () => {
    const s = snapshotOf(book([cash(100), pos(), pos({ id: "x", address: "A".repeat(44), wallet: "principal", usd: 900 })]), NOW);
    expect(s.atMs).toBe(NOW);
    expect(s.usd).toBeCloseTo(120, 9);
    expect(s.holdings).toEqual([
      { id: "501:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", units: 100, priceUsd: 1 },
      { id: `501:${TOKEN}`, units: 5, priceUsd: 4 },
    ]);
  });

  test("an EVM address is one id in any case, a Solana one is kept as it is", () => {
    const evm = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
    const a = snapshotOf(book([pos({ chainIndex: "1", address: evm, balanceMinor: "1000000000000000000", decimals: 18, usd: 4, priceUsd: 4 })]), NOW);
    expect(a.holdings[0]!.id).toBe(`1:${evm.toLowerCase()}`);
    expect(snapshotOf(book([pos()]), NOW).holdings[0]!.id).toBe(`501:${TOKEN}`);
  });

  test("a price is the one the balance came with, else value over units", () => {
    const noPrice = snapshotOf(book([pos({ priceUsd: undefined, usd: 20 })]), NOW);
    expect(noPrice.holdings[0]!.priceUsd).toBeCloseTo(4, 9);
  });

  test("a holding whose value nobody proved (unpriced, or priced but backed by no pool) is carried at price zero: the wallet is valued WITHOUT it and the reading is not lost", () => {
    const nothing = snapshotOf(book([cash(100), pos({ priceUsd: null, usd: null })]), NOW);
    expect(nothing.holdings[1]).toEqual({ id: `501:${TOKEN}`, units: 5, priceUsd: 0 });
    expect(nothing.usd).toBeCloseTo(100, 9);
    // the claimed price of an unverified token is a claim, never a price
    const claimed = snapshotOf(book([cash(100), pos({ priceUsd: 1e9, usd: null })]), NOW);
    expect(claimed.holdings[1]!.priceUsd).toBe(0);
    expect(claimed.usd).toBeCloseTo(100, 9);
  });

  test("a token the provider flagged vanishes from the book: it is carried from the previous reading at price zero, so that its disappearance is a loss and not a withdrawal", () => {
    const before = snapshotOf(book([cash(1000), pos({ usd: 500, priceUsd: 100 })]), NOW - 20 * HOUR);
    const flagged = book([cash(1000)], { flaggedKeys: [`501:${TOKEN}`] });
    const now = snapshotOf(flagged, NOW, before);
    expect(now.holdings).toContainEqual({ id: `501:${TOKEN}`, units: 5, priceUsd: 0 });
    expect(now.usd).toBeCloseTo(1000, 9);
    // the series sees the wallet lose a third; without the carry the vanished units would be told apart as money taken out
    expect(equityPause([before, now], [], NOW)).toBe("queda_do_dia");
    expect(equityPause([before, snapshotOf(flagged, NOW)], [], NOW)).toBeNull();
    // a token that is simply gone (sold) and not flagged is not carried
    expect(snapshotOf(book([cash(1000)]), NOW, before).holdings).toHaveLength(1);
  });

  test("the rug: a token that was backed by a pool and no longer is drops out of the wallet's value, and the breaker sees it", () => {
    const before = snapshotOf(book([cash(1000), pos({ usd: 500, priceUsd: 100 })]), NOW - 20 * HOUR);
    const rugged = snapshotOf(book([cash(1000), pos({ usd: null, priceUsd: 100 })]), NOW);
    expect(rugged.usd).toBeCloseTo(1000, 9);
    expect(equityPause([before, rugged], [], NOW)).toBe("queda_do_dia");
  });

  test("an airdrop of a spam token with an absurd claimed price is neither a flow nor a gap: the series goes on", () => {
    const a = snapshotOf(book([cash(1000)]), NOW - 2 * HOUR);
    const b = snapshotOf(book([cash(1000), pos({ id: "spam", address: "S".repeat(44), balanceMinor: "9000000000000", decimals: 6, usd: null, priceUsd: 1e9 })]), NOW);
    const series = buildSeries([a, b], []);
    expect(series.gaps).toBe(0);
    expect(series.flowsUsd).toBe(0);
    expect(series.points).toHaveLength(2);
  });

  test("a balance that was not read exactly makes the whole reading unvalued: it is skipped rather than guessed", () => {
    expect(snapshotOf(book([cash(100), pos({ balanceMinor: null })]), NOW).usd).toBeNull();
    expect(snapshotOf(book([cash(100), pos({ decimals: null })]), NOW).usd).toBeNull();
    expect(snapshotOf(book([cash(100)], { agentUsd: null }), NOW).usd).toBeNull();
  });

  test("a line of the file is read back as it was written, and anything else is not a reading", () => {
    const s = snapshotOf(book([cash(100), pos()]), NOW);
    expect(parseSnapshotLine(JSON.stringify(s))).toEqual(s);
    expect(parseSnapshotLine("not json")).toBeNull();
    expect(parseSnapshotLine(JSON.stringify({ atMs: "x", usd: 1, holdings: [] }))).toBeNull();
    expect(parseSnapshotLine(JSON.stringify({ atMs: 1, usd: 1, holdings: [{ id: "a", units: "many", priceUsd: 1 }] }))).toBeNull();
    expect(parseSnapshotLine(JSON.stringify({ atMs: 1, usd: null, holdings: [] }))).toEqual({ atMs: 1, usd: null, holdings: [] });
  });
});

describe("the orders the agent sent, as trades", () => {
  const order = (over: Partial<OrderRecord> = {}): OrderRecord => ({ kind: "order", cycleId: "c1", atMs: NOW, orderKey: "c1:a", stage: "executada", candidateId: "a", side: "buy", stance: "buy_third", chainIndex: "501", symbol: "X", address: TOKEN, wallet: "agente", usd: 12, amountMinor: null, ref: "h", reason: null, profile: "alvo_5", source: "modelo", ...over });

  test("what went out, or may have, counts once per order (the stages of one order are one trade), and what did not leave does not count", () => {
    const records = [order({ stage: "preparada" }), order({ stage: "enviando" }), order({ stage: "executada" }), order({ orderKey: "c1:b", stage: "falhou", usd: 50 }), order({ orderKey: "c1:c", stage: "incerta", usd: 7, atMs: NOW + 5 }), order({ orderKey: "c1:d", wallet: "principal", usd: 99 })];
    expect(tradesOf(records)).toEqual([
      { atMs: NOW, usd: 12 },
      { atMs: NOW + 5, usd: 7 },
    ]);
  });
});

describe("the circuit breaker on what the wallet really did", () => {
  const same = (priceOfToken: number, atMs: number) => snapshotOf(book([cash(1000), pos({ usd: 5 * priceOfToken, priceUsd: priceOfToken })]), atMs);

  test("a wallet that lost more than the day's limit pauses new purchases, with the reason", () => {
    // five tokens falling from 100 to 40: 500 -> 200 on a wallet of 1500 -> 1200 (minus 20 percent)
    const out = equityPause([same(100, NOW - 20 * HOUR), same(40, NOW - HOUR)], [], NOW);
    expect(out).toBe("queda_do_dia");
  });

  test("a wallet that is only moving about, a deposit, or a series too short to say anything does not pause", () => {
    expect(equityPause([same(100, NOW - 20 * HOUR), same(98, NOW - HOUR)], [], NOW)).toBeNull();
    expect(equityPause([same(100, NOW - HOUR)], [], NOW)).toBeNull();
    expect(equityPause([], [], NOW)).toBeNull();
    // 1000 more dollars of cash arrived between two readings: a deposit, not a result
    const deposit = [snapshotOf(book([cash(1000), pos()]), NOW - 20 * HOUR), snapshotOf(book([cash(2000), pos()]), NOW - HOUR)];
    expect(equityPause(deposit, [], NOW)).toBeNull();
  });

  test("it is exactly what the series says (the module the breaker reads)", () => {
    const readings = [same(100, NOW - 20 * HOUR), same(40, NOW - HOUR)];
    expect(buildSeries(readings, []).points.length).toBe(2);
  });
});

describe("the value of the wallet over time, for the screen", () => {
  const line = (atMs: number, holdings: { id: string; units: number; priceUsd: number | null }[]) => JSON.stringify({ atMs, usd: null, holdings });

  test("each reading is the sum of what it counted, units over price, in time order, and what has no price is left out of that reading", () => {
    const lines = [line(NOW, [{ id: "501:USDC", units: 100, priceUsd: 1 }, { id: "501:T", units: 5, priceUsd: 4 }]), line(NOW + HOUR, [{ id: "501:USDC", units: 100, priceUsd: 1 }, { id: "501:T", units: 5, priceUsd: 6 }, { id: "501:U", units: 9, priceUsd: null }])];
    expect(equitySeries(lines)).toEqual([{ t: NOW, v: 120 }, { t: NOW + HOUR, v: 130 }]);
  });

  test("a line that is not a reading, or sums to nothing, is not a point", () => {
    expect(equitySeries(["garbage", "", line(NOW, []), line(NOW + 1, [{ id: "a", units: 1, priceUsd: null }])])).toEqual([]);
  });

  test("a long series is thinned to at most the points asked, evenly, keeping the first and the last", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => line(NOW + i * 60_000, [{ id: "501:USDC", units: 100 + i, priceUsd: 1 }]));
    const series = equitySeries(lines, 100);
    expect(series.length).toBeLessThanOrEqual(100);
    expect(series[0]).toEqual({ t: NOW, v: 100 });
    expect(series.at(-1)).toEqual({ t: NOW + 999 * 60_000, v: 1099 });
    for (let i = 1; i < series.length; i++) expect(series[i]!.t).toBeGreaterThan(series[i - 1]!.t);
  });

  test("values are rounded to the cent: a screen does not need more", () => {
    expect(equitySeries([line(NOW, [{ id: "a", units: 3, priceUsd: 1.234567 }])])).toEqual([{ t: NOW, v: 3.7 }]);
  });
});
