import { expect, test } from "bun:test";
import type { GetPort, ReadMeta } from "../onchainos/http";
import { configuredWallet } from "./readings";

test("configured capital is not evidence of complete wallet inventory", () => {
  const wallet = configuredWallet(1000, Date.now());
  expect(wallet.valueComplete).toBe(false);
  expect(wallet.knownValueUsd).toBe(0);
});
import { readPublicMarket, syntheticReadings } from "./readings";
import { buildLeverageBrief } from "./brief";

const now = 1_760_000_000_000;
const bar = 900_000;
function port(change: (rows: string[][]) => string[][] = rows => rows, ts = now): GetPort {
  return { async get(endpoint, query) {
    const meta: ReadMeta = { source: "okx-public-v5", endpoint: endpoint.path, tier: "public", httpStatus: 200, attempts: 1, requestedAtMs: now, receivedAtMs: now };
    if (endpoint.path.endsWith("mark-price")) return { data: [{ instId: query?.instId, markPx: "1", ts: String(ts) }], meta };
    if (endpoint.path.endsWith("funding-rate")) return { data: [{ instId: query?.instId, fundingRate: "0.001", ts: String(ts), fundingTime: String(now + bar), nextFundingTime: String(now + bar + 28_800_000) }], meta };
    return { data: change(Array.from({ length: 40 }, (_, i) => [String(now - (i + 1) * bar), "1", "2", "0.5", String(1 + (i % 3) * 0.01), "1", "1", "1", "1"])), meta };
  } };
}

test("unconfirmed candles never contribute to volatility", async () => {
  const market = await readPublicMarket(port(rows => rows.map(row => [...row.slice(0, 8), "0"])), { nowMs: now });
  expect(market.candlesUsed).toBe(0);
  expect(market.realizedSigmaDaily).toBeNull();
});
test.each(["duplicate", "gap", "old", "future"])("invalid %s candle series has unknown volatility", async kind => {
  const market = await readPublicMarket(port(rows => {
    if (kind === "duplicate") rows[1]![0] = rows[0]![0]!;
    if (kind === "gap") rows.splice(10, 1);
    if (kind === "old") rows.forEach(row => row[0] = String(Number(row[0]) - 10 * bar));
    if (kind === "future") rows[0]![0] = String(now + bar);
    return rows;
  }), { nowMs: now });
  expect(market.realizedSigmaDaily).toBeNull();
});
test("upstream timestamps are preserved and stale mark and funding are unknown", async () => {
  const market = await readPublicMarket(port(undefined, now - 600_000), { nowMs: now });
  expect(market.observedAtMs).toBe(now - 600_000);
  expect(market.markPrice).toBeNull();
  expect(market.fundingRate).toBeNull();
});

test("freshness uses one completion-time clock sample after awaited public reads", async () => {
  let completedReads = 0;
  let samples = 0;
  const source = port(undefined, now + 100);
  const delayed: GetPort = { async get(endpoint, query) {
    const result = await source.get(endpoint, query);
    completedReads += 1;
    return result;
  } };
  const market = await readPublicMarket(delayed, { nowMs: now, now: () => {
    expect(completedReads).toBe(3);
    samples += 1;
    return now + 200;
  } });
  expect(market.markPrice).toBe(1);
  expect(market.fundingRate).toBe(0.001);
  expect(market.observedAtMs).toBe(now + 100);
  expect(samples).toBe(1);
  const future = await readPublicMarket(port(undefined, now + 201), { nowMs: now, now: () => now + 200 });
  expect(future.markPrice).toBeNull();
  expect(future.fundingRate).toBeNull();
  const stale = await readPublicMarket(port(), { nowMs: now, now: () => now + 600_000 });
  expect(stale.markPrice).toBeNull();
  expect(stale.fundingRate).toBeNull();
});
test.each([now - 600_000, now + 1, NaN])("stale or invalid reading %s cannot produce eligible candidates", timestamp => {
  const input = syntheticReadings({ nowMs: now, capitalUsd: 1000 });
  input.market.observedAtMs = timestamp;
  expect(buildLeverageBrief({ ...input, nowMs: now, phase: "fase-2", kellyLowerBound: 12 }).eligibleIds).toEqual([]);
  input.market.observedAtMs = now;
  input.wallet.observedAtMs = timestamp;
  expect(buildLeverageBrief({ ...input, nowMs: now, phase: "fase-2", kellyLowerBound: 12 }).eligibleIds).toEqual([]);
});
