import { expect, test } from "bun:test";
import { computeInsights, parseCycleLines } from "./insights";
import type { OperatorCycle } from "./types";

function cycle(overrides: Partial<OperatorCycle> & { startedAtMs: number }): OperatorCycle {
  return {
    cycleId: `c${overrides.startedAtMs}`, completedAtMs: overrides.startedAtMs + 5,
    inventory: { address: "0x0000...0001", observedAtMs: overrides.startedAtMs, source: "synthetic", queriedChains: ["196"], chains: [], knownValueUsd: 100, valueComplete: true, riskTokensExcluded: true },
    candidates: [], verdicts: [], eligibleIds: [], decision: null, plan: null,
    execution: { status: "blocked", reasons: ["no_eligible_candidate"], txHash: null, orderId: null },
    inferenceUsd: 0, warnings: [], ledger: null,
    ...overrides,
  };
}

const candidate = (id: string, kind: OperatorCycle["candidates"][number]["kind"], netUsd: number | null) => ({
  id, kind, title: id, chainIndex: "196", from: { chainIndex: "196", tokenContractAddress: "0x1", symbol: "USDT", decimals: 6 }, to: { chainIndex: "196", tokenContractAddress: "0x2", symbol: "OKB", decimals: 18 },
  sizeUsd: 10, sizeAtomic: "10000000", expectedOutAtomic: null, expectedLeg1OutAtomic: null, pairKey: "196:USDT/OKB", netUsd, priceImpactPercent: -0.1,
  costs: { networkFeeUsd: 0.01, tradingFeeUsd: 0, inferenceUsd: 0.0001, complete: true }, quoteAgeMs: 10, quoteHash: "h", notes: [], researchOnly: false,
});

test("insights aggregate decisions, executions, realized results and per-kind risk and return", () => {
  const cycles: OperatorCycle[] = [
    cycle({ startedAtMs: 2, candidates: [candidate("a", "dex_round_trip", 0.2), candidate("k", "kuru_spot_maker", null)], verdicts: [{ candidateId: "a", eligible: true, reasons: [] }, { candidateId: "k", eligible: true, reasons: [] }],
      decision: { choice: "a", probabilities: { hold: 0.2, a: 0.7, k: 0.1 }, confidence: null, latencyMs: 5, inputTokens: 100, model: "mock" },
      execution: { status: "completed", reasons: [], txHash: "0x1", orderId: null, realizedUsd: 0.15 }, inferenceUsd: 0.001 }),
    cycle({ startedAtMs: 1, candidates: [candidate("a", "dex_round_trip", -0.1)], verdicts: [{ candidateId: "a", eligible: false, reasons: ["net_below_minimum"] }] }),
    cycle({ startedAtMs: 3, candidates: [candidate("a", "dex_round_trip", 0.1)], verdicts: [{ candidateId: "a", eligible: true, reasons: [] }],
      decision: { choice: "hold", probabilities: { hold: 0.9, a: 0.1 }, confidence: null, latencyMs: 5, inputTokens: 100, model: "mock" },
      execution: { status: "blocked", reasons: ["jev_chose_hold"], txHash: null, orderId: null }, inferenceUsd: 0.001 }),
    cycle({ startedAtMs: 4, execution: { status: "completed", reasons: [], txHash: "0x2", orderId: null, realizedUsd: -0.05 } }),
  ];
  const insights = computeInsights(cycles);
  expect(insights.cycles).toBe(4);
  expect(insights.firstCycleAtMs).toBe(1);
  expect(insights.lastCycleAtMs).toBe(4);
  expect(insights.decisions).toEqual({ asked: 2, hold: 1, chosen: 1 });
  expect(insights.executions).toEqual({ completed: 2, blocked: 2 });
  expect(insights.realized).toMatchObject({ plans: 2, wins: 1, losses: 1, hitRate: 0.5, unknown: 0 });
  expect(insights.realized.totalUsd).toBeCloseTo(0.1, 9);
  expect(insights.inferenceUsd).toBeCloseTo(0.002, 9);
  const roundTrip = insights.byKind.find((entry) => entry.kind === "dex_round_trip")!;
  expect(roundTrip.seen).toBe(3);
  expect(roundTrip.eligible).toBe(2);
  expect(roundTrip.chosen).toBe(1);
  expect(roundTrip.avgNetUsd).toBeCloseTo((0.2 - 0.1 + 0.1) / 3, 9);
  expect(roundTrip.avgNetBps).toBeCloseTo(((200 - 100 + 100) / 3), 6);
  expect(roundTrip.eligibleRate).toBeCloseTo(2 / 3, 9);
  expect(roundTrip.chosenRate).toBe(0.5);
  expect(roundTrip.topReasons).toEqual([{ reason: "net_below_minimum", count: 1 }]);
  expect(insights.byKind[0]!.kind).toBe("dex_round_trip");
  expect(insights.series.map((point) => point.choice)).toEqual([null, "a", "hold", null]);
  expect(insights.series[1]!.chosenNetUsd).toBe(0.2);
  expect(insights.series[3]!.realizedUsd).toBe(-0.05);
});

test("journal lines that are malformed are skipped and an empty journal yields empty insights", () => {
  const good = JSON.stringify(cycle({ startedAtMs: 9 }));
  const cycles = parseCycleLines(`${good}\nnot json\n{"cycleId":"x"}\n\n`);
  expect(cycles).toHaveLength(1);
  const empty = computeInsights([]);
  expect(empty.cycles).toBe(0);
  expect(empty.realized.hitRate).toBeNull();
  expect(empty.byKind).toEqual([]);
  expect(empty.inferenceUsd).toBe(0);
});
