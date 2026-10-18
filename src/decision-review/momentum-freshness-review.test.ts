import { expect, test } from "bun:test";
import { createMomentumReader } from "../agent/live";
import type { OnchainGatewayInternal } from "../onchain-read/gateway";

// Independent cache/freshness contract. Synthetic candles, no API, wallet, keys or orders.
const MINUTE = 60_000, start = 1_800_000_000_000;
const identity = { candidateId: "synthetic:momentum-age", chainIndex: "501", address: "B".repeat(44) };
const bars = (lastStart: number) => Array.from({ length: 24 }, (_, i) => ({
  ts: lastStart - (23 - i) * 5 * MINUTE, open: 100, high: 102, low: 99, close: 101, volume: 1, confirmed: true,
}));
function fixture(initialAgeMin: number) {
  let now = start, calls = 0;
  const gateway = { callInternal: async () => { calls++; return { ok: true, data: bars(start - initialAgeMin * MINUTE), meta: { ageMs: 0, stale: false } }; } } as unknown as Pick<OnchainGatewayInternal, "callInternal">;
  return { reader: createMomentumReader({ gateway, now: () => now }), advance: (minutes: number) => { now += minutes * MINUTE; }, calls: () => calls };
}

test("cached momentum ages with the clock without spending another provider request", async () => {
  const f = fixture(6), signal = new AbortController().signal;
  const first = await f.reader.read(identity, signal);
  expect(first?.barAgeMin).toBe(6);
  f.advance(2);
  expect((await f.reader.read(identity, signal))?.barAgeMin).toBe(8);
  expect(first?.barAgeMin).toBe(6);
  expect(f.calls()).toBe(1);
});

test("cached momentum that has aged beyond the twenty-minute data window cannot keep claiming it is current", async () => {
  const f = fixture(19), signal = new AbortController().signal;
  expect((await f.reader.read(identity, signal))?.barAgeMin).toBe(19);
  f.advance(2);
  expect(await f.reader.read(identity, signal)).toBeNull();
});
