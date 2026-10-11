import { describe, expect, test } from "bun:test";
import { parseSystemOneCycle } from "./system-one";

const candidate = (id: string, side: "long" | "short", leverage: number, eligible: boolean) => ({
  id,
  side,
  leverage,
  marginUsd: 10,
  notionalUsd: 10 * leverage,
  liquidationDistance: 1 / leverage,
  touchProbability: 0.01 * leverage,
  medianMultipleNoEdge: 1 - 0.001 * leverage,
  fundingCarryPerDay: 0.0003,
  fundingCarryUsd: 0.02,
  eligible,
  reasons: eligible ? [] : ["above_leverage_cap"],
});

const cycle = {
  schemaVersion: 1,
  cycleId: "so-abc",
  startedAtMs: 1_000,
  completedAtMs: 2_000,
  brief: {
    phase: "fase-2",
    horizonDays: 7,
    market: { instId: "MON-USDT-SWAP", indexPrice: 0.025, markPrice: 0.02501, fundingRate: 0.0001, fundingIntervalMs: 28_800_000, realizedSigmaDaily: 0.04, candlesUsed: 96, candleBarMs: 900_000, source: "okx_public_v5", observedAtMs: 1_000 },
    wallet: { capitalUsd: 500, knownValueUsd: 500, valueComplete: true, openNotionalUsd: 0, openSide: null, source: "configured", observedAtMs: 1_000 },
    limits: { leverageCeiling: 2, leverageCap: 2, orderCapUsd: 10, exposureCapUsd: 125, liquidationDistanceFloor: 0.35, dailyStopUsd: 10, unknown: [] },
    candidates: [candidate("long-1x", "long", 1, true), candidate("long-2x", "long", 2, true), candidate("long-5x", "long", 5, false), { id: "broken" }],
    eligibleIds: ["long-1x", "long-2x"],
    notes: ["Probabilities are decision weights."],
  },
  decision: { choice: "long-2x", probabilities: { hold: 0.2, "long-1x": 0.1, "long-2x": 0.7, bad: "x" }, confidence: null, latencyMs: 120.4, model: "jev-latest", status: "ok" },
  chosen: candidate("long-2x", "long", 2, true),
  execution: { status: "dry_run", reasons: ["system_one_never_executes"] },
  warnings: [],
};

describe("parseSystemOneCycle", () => {
  test("parses a full cycle and drops malformed candidates and probabilities", () => {
    const parsed = parseSystemOneCycle(cycle);
    expect(parsed).not.toBeNull();
    expect(parsed!.cycleId).toBe("so-abc");
    expect(parsed!.brief.candidates.map((c) => c.id)).toEqual(["long-1x", "long-2x", "long-5x"]);
    expect(parsed!.decision?.probabilities).toEqual({ hold: 0.2, "long-1x": 0.1, "long-2x": 0.7 });
    expect(parsed!.chosen?.leverage).toBe(2);
    expect(parsed!.brief.limits.leverageCap).toBe(2);
    expect(parsed!.execution).toEqual({ status: "dry_run", reasons: ["system_one_never_executes"] });
  });

  test("a cycle without a decision parses with decision null", () => {
    const parsed = parseSystemOneCycle({ ...cycle, decision: null, chosen: null, execution: { status: "blocked", reasons: ["no_eligible_candidate"] } });
    expect(parsed?.decision).toBeNull();
    expect(parsed?.chosen).toBeNull();
    expect(parsed?.execution.status).toBe("blocked");
  });

  test("rejects anything that is not a cycle", () => {
    expect(parseSystemOneCycle(null)).toBeNull();
    expect(parseSystemOneCycle({})).toBeNull();
    expect(parseSystemOneCycle({ ...cycle, cycleId: "" })).toBeNull();
    expect(parseSystemOneCycle({ ...cycle, brief: { ...cycle.brief, candidates: "no" } })).toBeNull();
  });
});
