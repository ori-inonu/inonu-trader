import { expect, test } from "bun:test";
import { buildLeverageBrief } from "./brief";
import { runSystemOneCycle } from "./cycle";
import { syntheticReadings } from "./readings";
import type { SystemOneModel } from "./decide";

const nowMs = 1_760_000_000_000;
const readings = syntheticReadings({ nowMs, capitalUsd: 1000, sigmaDaily: 0.04 });

test("model mutations cannot rewrite the local risk envelope", async () => {
  const model: SystemOneModel = { name: "fixture", choose: async (brief, eligible) => {
    eligible[0]!.leverage = 99;
    eligible[0]!.notionalUsd = 999999;
    brief.wallet.capitalUsd = 999999;
    brief.eligibleIds.push("long-99x");
    return { choice: eligible[0]!.id, probabilities: { [eligible[0]!.id]: 1 }, confidence: 1, latencyMs: 0, model: "fixture", status: "ok" };
  } };
  const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2" }, { model, now: () => nowMs });
  expect(cycle.brief.wallet.capitalUsd).toBe(1000);
  expect(cycle.brief.eligibleIds).not.toContain("long-99x");
  expect(cycle.chosen?.leverage).toBe(1);
  expect(cycle.chosen!.notionalUsd).toBeLessThanOrEqual(cycle.brief.limits.exposureCapUsd);
});

test("phase 1 spot permission cannot admit perpetual candidates, even at 1x", () => {
  const brief = buildLeverageBrief({ ...readings, phase: "fase-1", nowMs });
  expect(brief.eligibleIds).toEqual([]);
  expect(brief.candidates.every(c => c.reasons.includes("phase_requires_spot"))).toBe(true);
});

test.each([null, NaN, Infinity])("unknown funding %s never reaches the model", async (fundingRate) => {
  let calls = 0;
  const cycle = await runSystemOneCycle({ ...readings, market: { ...readings.market, fundingRate }, phase: "fase-2", kellyLowerBound: 12 }, {
    now: () => nowMs,
    model: { name: "sentinel", choose: async () => { calls++; throw new Error("must not run"); } },
  });
  expect(cycle.brief.eligibleIds).toEqual([]);
  expect(calls).toBe(0);
  expect(cycle.execution.status).toBe("blocked");
});

test.each(["error", "timeout", "malformed", "invalid-choice", "unexpected"])("model status %s cannot select a candidate", async (status) => {
  const model = { name: "fixture", choose: async () => ({ choice: "long-1x", probabilities: { "long-1x": 1 }, confidence: 1, latencyMs: 1, model: "fixture", status }) } as SystemOneModel;
  const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2" }, { model, now: () => nowMs });
  expect(cycle.chosen).toBeNull();
  expect(cycle.execution.status).toBe("blocked");
  expect(cycle.decision?.choice).toBe("hold");
});

test("provider errors cannot enter the published cycle", async () => {
  const model = { name: "fixture", choose: async () => { throw new Error("https://private.example?api_key=SECRET"); } };
  const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2" }, { model, now: () => nowMs });
  expect(JSON.stringify(cycle)).not.toContain("SECRET");
  expect(cycle.warnings).toEqual(["decision_failed"]);
});

test("pre-cancelled cycles never invoke the model", async () => {
  let calls = 0;
  const model = { name: "fixture", choose: async () => { calls++; return new Promise<never>(() => {}); } };
  const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2" }, { model, now: () => nowMs, signal: AbortSignal.abort() });
  expect(calls).toBe(0);
  expect(cycle.decision?.status).toBe("timeout");
});

test("deadline closes a model that ignores cancellation", async () => {
  const model = { name: "fixture", choose: async () => new Promise<never>(() => {}) };
  const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2" }, { model, now: () => nowMs, timeoutMs: 10 });
  expect(cycle.decision?.status).toBe("timeout");
  expect(cycle.execution.status).toBe("blocked");
}, 1000);

test("elapsed deadline blocks a fulfilled model before the delayed timer can fire", async () => {
  const model: SystemOneModel = { name: "fixture", choose: async (_brief, eligible) => {
    const until = performance.now() + 30;
    while (performance.now() < until) { /* reproduce a blocked event loop */ }
    const choice = eligible[0]!.id;
    return { choice, probabilities: { [choice]: 1 }, confidence: 1, latencyMs: 30, model: "fixture", status: "ok" };
  } };
  const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2" }, { model, now: () => nowMs, timeoutMs: 10 });
  expect(cycle.decision?.status).toBe("timeout");
  expect(cycle.chosen).toBeNull();
  expect(cycle.execution.status).toBe("blocked");
});

test("leverage never multiplies the total exposure allowance", () => {
  const input = { ...readings, phase: "fase-2" as const, nowMs, kellyLowerBound: 12 };
  const initial = buildLeverageBrief(input);
  const wallet = { ...readings.wallet, openSide: "long" as const, openNotionalUsd: initial.limits.exposureCapUsd - 1 };
  const brief = buildLeverageBrief({ ...input, wallet });
  expect(brief.candidates.find(c => c.id === "long-2x")?.reasons).toContain("exposure_cap_reached");
  expect(brief.candidates.filter(c => c.eligible).every(c => wallet.openNotionalUsd + c.notionalUsd <= brief.limits.exposureCapUsd)).toBe(true);
});

test.each([NaN, Infinity, -1])("invalid open exposure %s blocks eligibility", (openNotionalUsd) => {
  const brief = buildLeverageBrief({ ...readings, wallet: { ...readings.wallet, openNotionalUsd }, phase: "fase-2", nowMs });
  expect(brief.eligibleIds).toEqual([]);
});

test.each([null, 0, NaN, Infinity])("unknown settlement interval %s blocks carry decisions", (fundingIntervalMs) => {
  const brief = buildLeverageBrief({ ...readings, market: { ...readings.market, fundingIntervalMs }, phase: "fase-2", nowMs });
  expect(brief.eligibleIds).toEqual([]);
  expect(brief.candidates.every(c => c.fundingCarryUsd === null)).toBe(true);
});

test.each([0, -1, NaN, Infinity])("invalid mark %s blocks eligibility", (markPrice) => {
  const brief = buildLeverageBrief({ ...readings, market: { ...readings.market, markPrice }, phase: "fase-2", nowMs });
  expect(brief.eligibleIds).toEqual([]);
});

test.each([NaN, Infinity, -1])("invalid model weight %s blocks the cycle", async (weight) => {
  const model: SystemOneModel = { name: "fixture", choose: async () => ({ choice: "long-1x", probabilities: { "long-1x": weight, hold: 1 }, confidence: null, latencyMs: 0, model: "fixture", status: "ok" }) };
  const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2" }, { model, now: () => nowMs });
  expect(cycle.execution.status).toBe("blocked");
  expect(cycle.decision?.status).toBe("malformed");
});
