// PF-1: the whole portfolio is read on connect: every network the provider reads for an 0x address, in small groups, and one group the provider refuses does not
// bring the others down. origin: synthetic_fixture, tests only (a fake reader; no network).
import { describe, expect, test } from "bun:test";
import type { BalanceRow, BalancesData, HoldingsError, HoldingsParams, HoldingsReader, HoldingsResult, NetworkRow } from "./holdings";
import { balancesResultOf, evmNetworksToRead, readPortfolioBalances } from "./portfolio-read";

const ADDRESS = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const meta = (ageMs = 0, stale = false) => ({ tier: "free" as const, cachedAtMs: 1, ageMs, stale, budget: { tier: "free" as const, used: 1, cap: null } });
const row = (chainIndex: string, over: Partial<BalanceRow> = {}): BalanceRow => ({ chainIndex, symbol: "ETH", tokenAddress: null, balance: 1, priceUsd: 100, valueUsd: 100, flaggedRisk: false, ...over });

/** A reader that answers balances from a table by network and records every call; a network listed as "bad" makes any group holding it fail. */
function fakeReader(table: Record<string, BalanceRow[]>, over: { bad?: readonly string[]; fatal?: HoldingsError; ageMs?: number; stale?: boolean } = {}) {
  const calls: string[][] = [];
  const balances = async (p: HoldingsParams, signal?: AbortSignal): Promise<HoldingsResult<BalancesData>> => {
    calls.push([...p.chains]);
    if (signal?.aborted) return { ok: false, error: "cancelled" };
    if (over.fatal !== undefined) return { ok: false, error: over.fatal };
    if (p.chains.some((c) => over.bad?.includes(c))) return { ok: false, error: "provider_error" };
    const rows = p.chains.flatMap((c) => table[c] ?? []);
    return { ok: true, data: { rows, total: rows.length }, meta: meta(over.ageMs ?? 0, over.stale ?? false) };
  };
  const reader = { balances } as unknown as HoldingsReader;
  return { reader, calls };
}

const clock = () => {
  let t = 1_000_000;
  return () => (t += 10);
};

describe("which networks an 0x address is read on", () => {
  const list: NetworkRow[] = [
    { chainIndex: "0", name: "Bitcoin" }, { chainIndex: "1", name: "Ethereum" }, { chainIndex: "195", name: "TRON" }, { chainIndex: "501", name: "Solana" }, { chainIndex: "784", name: "SUI" },
    { chainIndex: "11155111", name: "Sepolia" }, { chainIndex: "5000", name: "Mantle" }, { chainIndex: "8453", name: "Base" }, { chainIndex: "250", name: "Fantom" }, { chainIndex: "196", name: "X Layer" },
  ];

  test("the networks that do not use an 0x address, Solana and the test networks are left out, and the most used come first", () => {
    const all = evmNetworksToRead(list);
    for (const out of ["0", "195", "501", "784", "11155111"]) expect(all).not.toContain(out);
    expect(all.slice(0, 3)).toEqual(["1", "8453", "196"]);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("5000");
    expect(all).toContain("250");
  });

  test("with no list from the provider, the networks of the app's own registry are read", () => {
    const fallback = evmNetworksToRead(null);
    expect(fallback.length).toBeGreaterThan(5);
    expect(fallback).toContain("1");
    expect(fallback).not.toContain("501");
  });
});

describe("reading in groups", () => {
  test("the networks go in groups of four, in order, and every holding comes back with the largest value first", async () => {
    const { reader, calls } = fakeReader({ "1": [row("1", { symbol: "ETH", valueUsd: 500 })], "56": [row("56", { symbol: "BNB", valueUsd: 900 })], "8453": [row("8453", { symbol: "USDC", valueUsd: 20 })] });
    const r = await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56", "8453", "10", "137", "196"], now: clock() });
    expect(calls).toEqual([["1", "56", "8453", "10"], ["137", "196"]]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reading.rows.map((x) => x.symbol)).toEqual(["BNB", "ETH", "USDC"]);
      expect(r.reading.unanswered).toEqual([]);
      expect(r.reading.networks).toEqual(["1", "56", "8453", "10", "137", "196"]);
    }
  });

  test("a group the provider refuses is read again network by network, and only the networks that still fail are counted as unanswered", async () => {
    const { reader, calls } = fakeReader({ "1": [row("1", { valueUsd: 7 })], "56": [row("56", { symbol: "BNB", valueUsd: 8 })] }, { bad: ["137"] });
    const r = await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56", "137", "10"], now: clock() });
    expect(calls).toEqual([["1", "56", "137", "10"], ["1"], ["56"], ["137"], ["10"]]);
    expect(r.ok && r.reading.unanswered).toEqual(["137"]);
    expect(r.ok && r.reading.rows.map((x) => x.chainIndex).sort()).toEqual(["1", "56"]);
  });

  test("progress is reported after each group, with what was read so far", async () => {
    const { reader } = fakeReader({ "1": [row("1")], "56": [row("56", { symbol: "BNB" })] });
    const seen: Array<[number, number, number]> = [];
    await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56", "8453", "10", "137"], chunk: 2, now: clock(), onProgress: (reading, done, total) => seen.push([reading.rows.length, done, total]) });
    expect(seen).toEqual([[2, 2, 5], [2, 4, 5], [2, 5, 5]]);
  });

  test("an error that holds for every network stops the reading and is the error: the quota, the credentials, the clock, an old server", async () => {
    for (const fatal of ["budget_exhausted", "no_credentials", "clock_skew", "backend_stale", "provider_unauthorized", "network", "origin_denied"] as const) {
      const { reader, calls } = fakeReader({}, { fatal });
      const r = await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56", "8453", "10", "137"], chunk: 2, now: clock() });
      expect(r).toEqual({ ok: false, error: fatal });
      expect(calls.length).toBe(1);
    }
  });

  test("when every group fails even alone, the answer is the provider's error and not an empty wallet", async () => {
    const { reader } = fakeReader({}, { bad: ["1", "56"] });
    expect(await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56"], now: clock() })).toEqual({ ok: false, error: "provider_error" });
  });

  test("a wallet with nothing on the networks is an answer, an empty one", async () => {
    const { reader } = fakeReader({});
    const r = await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56"], now: clock() });
    expect(r.ok && r.reading.rows).toEqual([]);
    expect(r.ok && r.reading.unanswered).toEqual([]);
  });

  test("cancelling stops at once and says it was cancelled", async () => {
    const controller = new AbortController();
    const { reader, calls } = fakeReader({ "1": [row("1")] });
    const inner = reader.balances.bind(reader);
    (reader as { balances: HoldingsReader["balances"] }).balances = async (p, s) => {
      const out = await inner(p, s);
      controller.abort();
      return out;
    };
    const r = await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56", "8453", "10", "137"], chunk: 2, signal: controller.signal, now: clock() });
    expect(r).toEqual({ ok: false, error: "cancelled" });
    expect(calls.length).toBe(1);
  });

  test("the age of the reading is the oldest answer's: the moment it arrived minus the age the gateway reported; a copy served after a failure is marked", async () => {
    const { reader } = fakeReader({ "1": [row("1")] }, { ageMs: 4_000, stale: true });
    const now = () => 1_000_000;
    const r = await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1"], now });
    expect(r.ok && r.reading.observedAtMs).toBe(996_000);
    expect(r.ok && r.reading.receivedAtMs).toBe(1_000_000);
    expect(r.ok && r.reading.stale).toBe(true);
  });

  test("a request the reader would refuse (no networks, a bad address) is refused and nothing is called", async () => {
    const { reader, calls } = fakeReader({});
    expect(await readPortfolioBalances(reader, { address: ADDRESS, networks: [], now: clock() })).toEqual({ ok: false, error: "bad_request" });
    expect(calls).toEqual([]);
  });
});

describe("the reading as the panel's balances", () => {
  test("the rows, the count the provider had, and an age that is the oldest answer's, with the copy served after a failure marked", async () => {
    const { reader } = fakeReader({ "1": [row("1", { valueUsd: 7 })], "56": [row("56", { symbol: "BNB", valueUsd: 9 })] }, { ageMs: 6_000, stale: true });
    const r = await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1", "56", "8453", "10", "137"], chunk: 2, now: clock() });
    const balances = balancesResultOf(r);
    expect(balances.ok).toBe(true);
    if (balances.ok) {
      expect(balances.data.rows.map((x) => x.symbol)).toEqual(["BNB", "ETH"]);
      expect(balances.data.total).toBe(2);
      expect(balances.meta).toMatchObject({ tier: "free", ageMs: 6_000, stale: true });
    }
  });

  test("an error stays the error, and a wallet with nothing is an empty list, not an error", async () => {
    expect(balancesResultOf({ ok: false, error: "budget_exhausted" })).toEqual({ ok: false, error: "budget_exhausted" });
    const { reader } = fakeReader({});
    const empty = balancesResultOf(await readPortfolioBalances(reader, { address: ADDRESS, networks: ["1"], now: clock() }));
    expect(empty.ok && empty.data).toEqual({ rows: [], total: 0 });
  });
});
