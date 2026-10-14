// T9.4, WAL-4: the reading of the Solana account that feeds the manual consultation. One free read of the balances through the local gateway, when the person asks; the moment
// of the reading is when the gateway observed it (its answer minus the age it reports), so a cached answer cannot pass for a fresh one. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { HoldingsReader } from "./holdings";
import { readSolanaHoldings } from "./solana-reading";

const ACCOUNT = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NOW = 1_800_000_000_000;
const meta = (ageMs: number) => ({ tier: "free" as const, cachedAtMs: NOW - ageMs, ageMs, stale: false, budget: { tier: "free" as const, used: 1, cap: null } });
const brow = (over: Record<string, unknown> = {}) => ({ chainIndex: "501", symbol: "SOL", tokenAddress: null, balance: 2.5, priceUsd: 150, valueUsd: 375, flaggedRisk: false, ...over });

function fakeReader(result: Awaited<ReturnType<HoldingsReader["balances"]>>) {
  const asked: unknown[] = [];
  const reader = {
    balances: async (params: unknown) => {
      asked.push(params);
      return result;
    },
  } as Pick<HoldingsReader, "balances">;
  return { reader, asked };
}

describe("the reading", () => {
  test("it asks the Solana account on network 501 once, and the rows come back as holdings", async () => {
    const f = fakeReader({ ok: true, data: { rows: [brow(), brow({ symbol: "USDC", tokenAddress: MINT, balance: 40, valueUsd: 40 })], total: 2 }, meta: meta(3000) });
    const r = await readSolanaHoldings(f.reader, ACCOUNT, NOW);
    expect(f.asked).toEqual([{ address: ACCOUNT, chains: ["501"] }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reading.rows).toEqual([
        { symbol: "SOL", tokenAddress: null, balance: 2.5, valueUsd: 375, flaggedRisk: false },
        { symbol: "USDC", tokenAddress: MINT, balance: 40, valueUsd: 40, flaggedRisk: false },
      ]);
      expect(r.reading.total).toBe(2);
    }
  });

  test("the moment of the reading is the moment the gateway observed it: now minus the age it reported", async () => {
    const f = fakeReader({ ok: true, data: { rows: [brow()], total: 1 }, meta: meta(25_000) });
    const r = await readSolanaHoldings(f.reader, ACCOUNT, NOW);
    expect(r.ok && r.reading.observedAtMs).toBe(NOW - 25_000);
  });

  test("an age that makes no sense never puts the reading in the future or before the epoch", async () => {
    const negative = await readSolanaHoldings(fakeReader({ ok: true, data: { rows: [brow()], total: 1 }, meta: meta(-5000) }).reader, ACCOUNT, NOW);
    expect(negative.ok && negative.reading.observedAtMs).toBe(NOW);
    const huge = await readSolanaHoldings(fakeReader({ ok: true, data: { rows: [brow()], total: 1 }, meta: meta(NOW * 10) }).reader, ACCOUNT, NOW);
    expect(huge.ok && huge.reading.observedAtMs).toBe(0);
  });

  test("an empty account is a reading with no rows, not an error and not zero of something", async () => {
    const r = await readSolanaHoldings(fakeReader({ ok: true, data: { rows: [], total: 0 }, meta: meta(0) }).reader, ACCOUNT, NOW);
    expect(r.ok && r.reading.rows.length).toBe(0);
  });

  test("when the gateway kept only the largest rows, the reading says how many there were", async () => {
    const r = await readSolanaHoldings(fakeReader({ ok: true, data: { rows: [brow()], total: 4344 }, meta: meta(0) }).reader, ACCOUNT, NOW);
    expect(r.ok && r.reading.total).toBe(4344);
  });

  test("every failure of the reader is passed on as it is: no data, a refusal, no connection", async () => {
    for (const error of ["sem_dados", "no_credentials", "budget_exhausted", "network", "schema", "bad_request"] as const) {
      expect(await readSolanaHoldings(fakeReader({ ok: false, error }).reader, ACCOUNT, NOW)).toEqual({ ok: false, error });
    }
  });

  test("an account that is not a Solana address is refused without asking anything", async () => {
    const f = fakeReader({ ok: true, data: { rows: [], total: 0 }, meta: meta(0) });
    for (const account of ["", "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", `${ACCOUNT}x&y`, "short"]) {
      expect(await readSolanaHoldings(f.reader, account, NOW)).toEqual({ ok: false, error: "bad_request" });
    }
    expect(f.asked.length).toBe(0);
  });
});
