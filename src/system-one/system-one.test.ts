import { describe, expect, test } from "bun:test";
import { buildLeverageBrief, buildLeverageCandidates, fundingCarryPerDay } from "./brief";
import { runSystemOneCycle } from "./cycle";
import { MockSystemOneModel, buildSystemOneState, decisionFromEvaluation, validateLeverageDecision } from "./decide";
import { configuredWallet, readPublicMarket, syntheticCloses, syntheticReadings } from "./readings";
import { LEVERAGE_LADDER, type LeverageCandidate } from "./types";
import { MIN_RETURNS, logReturns, realizedVolatility, sampleStdDev } from "./volatility";
import type { GetPort, ReadMeta } from "../onchainos/http";

const NOW = 1_760_000_000_000;

describe("volatility", () => {
  test("log returns and sample standard deviation", () => {
    expect(logReturns([1, Math.E])).toEqual([1]);
    expect(logReturns([1, 0])).toEqual([]);
    expect(sampleStdDev([1])).toBeNull();
    expect(sampleStdDev([1, 3])).toBeCloseTo(Math.SQRT2);
  });

  test("too few returns and invalid closes read as unknown, never zero", () => {
    expect(realizedVolatility([1, 2, 3], 900_000)).toEqual({ sigmaDaily: null, returnsUsed: 2, reason: "too_few_returns" });
    expect(realizedVolatility([1, -1, 2], 900_000).reason).toBe("close_invalid");
    expect(realizedVolatility(new Array(MIN_RETURNS + 1).fill(2), 900_000).reason).toBe("sigma_zero");
    expect(realizedVolatility([1, 2], 0).reason).toBe("bar_unknown");
  });

  test("recovers the daily sigma of a synthetic walk within a tolerance", () => {
    const closes = syntheticCloses(11, 2_000, 1, 0.06, 900_000);
    const result = realizedVolatility(closes, 900_000);
    expect(result.reason).toBeNull();
    expect(result.sigmaDaily as number).toBeGreaterThan(0.045);
    expect(result.sigmaDaily as number).toBeLessThan(0.075);
  });
});

describe("funding carry", () => {
  test("longs pay a positive rate, shorts receive it, three settlements a day by default", () => {
    expect(fundingCarryPerDay("long", 0.0001, 8 * 3_600_000)).toBeCloseTo(-0.0003);
    expect(fundingCarryPerDay("short", 0.0001, 8 * 3_600_000)).toBeCloseTo(0.0003);
    expect(fundingCarryPerDay("short", 0.0001, null)).toBeCloseTo(0.0003);
    expect(fundingCarryPerDay("short", null, null)).toBeNull();
  });
});

describe("brief", () => {
  const readings = syntheticReadings({ nowMs: NOW, capitalUsd: 1_000, sigmaDaily: 0.04 });

  test("phase 0 observes only: a full ladder of candidates, none eligible", () => {
    const brief = buildLeverageBrief({ ...readings, phase: "fase-0", nowMs: NOW });
    expect(brief.candidates).toHaveLength(LEVERAGE_LADDER.length * 2);
    expect(brief.eligibleIds).toEqual([]);
    expect(brief.candidates.every((candidate) => candidate.reasons.includes("phase_0_observes_only"))).toBe(true);
    expect(brief.notes.some((note) => note.includes("Phase 0"))).toBe(true);
  });

  test("phase 1 allows only 1x and sizes the margin by the order cap", () => {
    const brief = buildLeverageBrief({ ...readings, phase: "fase-1", nowMs: NOW });
    expect(brief.eligibleIds.sort()).toEqual(["long-1x", "short-1x"]);
    const long1 = brief.candidates.find((candidate) => candidate.id === "long-1x") as LeverageCandidate;
    expect(long1.marginUsd).toBeLessThanOrEqual(brief.limits.orderCapUsd);
    expect(long1.notionalUsd).toBeCloseTo(long1.marginUsd);
    const long3 = brief.candidates.find((candidate) => candidate.id === "long-3x") as LeverageCandidate;
    expect(long3.reasons).toContain("borrowing_not_allowed_in_phase");
  });

  test("phase 2 without a Kelly bound keeps leverage above 1x undefined, with a bound it opens 2x", () => {
    const closed = buildLeverageBrief({ ...readings, phase: "fase-2", nowMs: NOW });
    expect(closed.limits.leverageCap).toBeNull();
    expect(closed.eligibleIds.every((id) => id.endsWith("-1x"))).toBe(true);
    const open = buildLeverageBrief({ ...readings, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 });
    expect(open.limits.leverageCap).toBe(2);
    expect(open.eligibleIds.sort()).toEqual(["long-1x", "long-2x", "short-1x", "short-2x"]);
    const long5 = open.candidates.find((candidate) => candidate.id === "long-5x") as LeverageCandidate;
    expect(long5.reasons).toContain("above_leverage_ceiling");
  });

  test("unknown sigma makes nothing eligible and the touch probabilities unknown", () => {
    const market = { ...readings.market, realizedSigmaDaily: null };
    const brief = buildLeverageBrief({ market, wallet: readings.wallet, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 });
    expect(brief.eligibleIds).toEqual([]);
    expect(brief.candidates.every((candidate) => candidate.touchProbability === null)).toBe(true);
    expect(brief.candidates.every((candidate) => candidate.reasons.includes("sigma_unknown"))).toBe(true);
  });

  test("an open position only allows adding on the same side", () => {
    const wallet = { ...readings.wallet, openNotionalUsd: 5, openSide: "long" as const };
    const candidates = buildLeverageCandidates({ market: readings.market, wallet, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 }, buildLeverageBrief({ market: readings.market, wallet, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 }).limits);
    expect(candidates.filter((candidate) => candidate.side === "short").every((candidate) => candidate.reasons.includes("would_flip_open_position"))).toBe(true);
    expect(candidates.find((candidate) => candidate.id === "long-1x")?.eligible).toBe(true);
  });

  test("2x cannot enlarge the total exposure ceiling when a position is already open", () => {
    const wallet = { ...readings.wallet, openNotionalUsd: 230, openSide: "long" as const };
    const market = { ...readings.market, realizedSigmaDaily: 0.04 };
    const brief = buildLeverageBrief({ market, wallet, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 });
    // Capital 1000, sigma 4%: exposure cap 250, order margin 20.
    // The 1x proposal totals 250; the 2x proposal totals 270.
    expect(brief.limits.exposureCapUsd).toBe(250);
    expect(brief.candidates.find((candidate) => candidate.id === "long-1x")?.eligible).toBe(true);
    expect(brief.candidates.find((candidate) => candidate.id === "long-2x")?.reasons).toContain("exposure_cap_reached");
    expect(brief.eligibleIds).not.toContain("long-2x");
  });

  test.each([18.4049999995, 18.405, 18.4050000005])("fractional cap includes decimal equality but rejects excess: %s", (openNotionalUsd) => {
    const brief = buildLeverageBrief({
      market: { ...readings.market, realizedSigmaDaily: 0.04 },
      wallet: { ...readings.wallet, capitalUsd: 80.02, openSide: "long", openNotionalUsd },
      phase: "fase-2", kellyLowerBound: 12, nowMs: NOW,
    });
    const candidate = brief.candidates.find((value) => value.id === "long-1x")!;
    expect(brief.limits.exposureCapUsd).toBe(20.005);
    expect(candidate.notionalUsd).toBe(1.6);
    expect(candidate.eligible).toBe(openNotionalUsd <= 18.405);
    expect(candidate.reasons.includes("exposure_cap_reached")).toBe(openNotionalUsd > 18.405);
    expect(brief.eligibleIds.includes(candidate.id)).toBe(openNotionalUsd <= 18.405);
  });

  test.each([
    [1, 229.99, true],
    [1, 230, true],
    [1, 230.01, false],
    [1, 230.0000000005, false],
    [2, 209.99, true],
    [2, 210, true],
    [2, 210.01, false],
    [2, 210.0000000005, false],
  ] as const)("%ix with open notional %s respects the inclusive total ceiling", (leverage, openNotionalUsd, allowed) => {
    const market = { ...readings.market, realizedSigmaDaily: 0.04 };
    const wallet = { ...readings.wallet, openNotionalUsd, openSide: "long" as const };
    const brief = buildLeverageBrief({ market, wallet, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 });
    const id = `long-${leverage}x`;
    const candidate = brief.candidates.find((candidate) => candidate.id === id)!;
    expect(brief.limits.exposureCapUsd).toBe(250);
    expect(candidate.eligible).toBe(allowed);
    expect(candidate.reasons.includes("exposure_cap_reached")).toBe(!allowed);
    expect(brief.eligibleIds.includes(id)).toBe(allowed);
  });

  test("touch probability and drag grow with leverage", () => {
    const brief = buildLeverageBrief({ ...readings, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 });
    const longs = brief.candidates.filter((candidate) => candidate.side === "long");
    for (let i = 1; i < longs.length; i += 1) {
      expect(longs[i]!.touchProbability as number).toBeGreaterThanOrEqual(longs[i - 1]!.touchProbability as number);
      expect(longs[i]!.medianMultipleNoEdge as number).toBeLessThan(longs[i - 1]!.medianMultipleNoEdge as number);
    }
  });
});

describe("decision validation", () => {
  const readings = syntheticReadings({ nowMs: NOW, capitalUsd: 1_000, sigmaDaily: 0.04 });
  const brief = buildLeverageBrief({ ...readings, phase: "fase-2", nowMs: NOW, kellyLowerBound: 12 });
  const eligible = brief.candidates.filter((candidate) => candidate.eligible);

  test("only hold or an eligible id is accepted; anything else becomes hold with a status", () => {
    expect(validateLeverageDecision(null, eligible).status).toBe("malformed");
    expect(validateLeverageDecision({ choice: "long-5x", model: "m" }, eligible)).toMatchObject({ choice: "hold", status: "invalid-choice", model: "m" });
    const ok = validateLeverageDecision({ choice: "long-2x", probabilities: { hold: 1, "long-2x": 3 }, confidence: 2, latencyMs: 12, model: "m" }, eligible);
    expect(ok.status).toBe("ok");
    expect(ok.confidence).toBe(1);
    expect(ok.probabilities["long-2x"]).toBeCloseTo(0.75);
    expect(Object.values(ok.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  test("evaluation results are read from answers.leverage or the top level", () => {
    const nested = decisionFromEvaluation({ answers: { leverage: { choice: "short-1x", probabilities: { "short-1x": 0.9, hold: 0.1 } } } }, eligible, 20, "jev");
    expect(nested).toMatchObject({ choice: "short-1x", status: "ok", model: "jev", latencyMs: 20 });
    const flat = decisionFromEvaluation({ answer: "hold" }, eligible, 5, "jev");
    expect(flat.choice).toBe("hold");
    expect(decisionFromEvaluation("nope", eligible, 5, "jev").status).toBe("malformed");
  });

  test("the state Jev sees carries no address, no source and no timestamps", () => {
    const state = buildSystemOneState(brief, eligible);
    const text = JSON.stringify(state);
    expect(text).not.toContain("observedAtMs");
    expect(text).not.toContain("source");
    expect(text).not.toContain("0x");
    expect(state.candidates.map((candidate) => candidate.id)).toEqual(eligible.map((candidate) => candidate.id));
    expect(state.market.basisBps).not.toBeNull();
  });
});

describe("cycle", () => {
  test("phase 0: no eligible, Jev not asked, blocked", async () => {
    const readings = syntheticReadings({ nowMs: NOW, capitalUsd: 500 });
    const cycle = await runSystemOneCycle({ ...readings, phase: "fase-0" }, { model: new MockSystemOneModel(), now: () => NOW, cycleId: () => "c1" });
    expect(cycle.decision).toBeNull();
    expect(cycle.chosen).toBeNull();
    expect(cycle.execution).toEqual({ status: "blocked", reasons: ["system_one_never_executes", "no_eligible_candidate", "jev_not_asked"] });
  });

  test("phase 2 with positive short carry: the mock picks a short, still a dry run", async () => {
    const readings = syntheticReadings({ nowMs: NOW, capitalUsd: 1_000, sigmaDaily: 0.02, fundingRate: 0.002 });
    const cycle = await runSystemOneCycle({ ...readings, phase: "fase-2", kellyLowerBound: 12 }, { model: new MockSystemOneModel(), now: () => NOW, cycleId: () => "c2" });
    expect(cycle.decision?.status).toBe("ok");
    expect(cycle.chosen?.side).toBe("short");
    expect(cycle.execution.status).toBe("dry_run");
    expect(cycle.execution.reasons).toEqual(["system_one_never_executes"]);
  });

  test("a failing model becomes a hold with an error status and a warning", async () => {
    const readings = syntheticReadings({ nowMs: NOW, capitalUsd: 1_000, sigmaDaily: 0.02 });
    const model = { name: "broken", choose: async () => { throw new Error("boom"); } };
    const cycle = await runSystemOneCycle({ ...readings, phase: "fase-1" }, { model, now: () => NOW, cycleId: () => "c3" });
    expect(cycle.decision).toMatchObject({ choice: "hold", status: "error", model: "broken" });
    expect(cycle.warnings[0]).toContain("decision_failed: boom");
    expect(cycle.execution.status).toBe("blocked");
  });
});

describe("public market reading", () => {
  test("reads mark, funding and candles through the port and orders candles oldest first", async () => {
    const calls: string[] = [];
    const meta = (path: string): ReadMeta => ({ source: "okx-public-v5", endpoint: path, tier: "public", httpStatus: 200, attempts: 1, requestedAtMs: NOW, receivedAtMs: NOW + 1 });
    const port: GetPort = {
      async get(endpoint, query) {
        calls.push(endpoint.path);
        if (endpoint.path.endsWith("mark-price")) return { data: [{ instId: query?.instId, instType: "SWAP", markPx: "0.0251", ts: String(NOW) }], meta: meta(endpoint.path) };
        if (endpoint.path.endsWith("funding-rate")) return { data: [{ instId: query?.instId, fundingRate: "0.0001", fundingTime: String(NOW + 3_600_000), nextFundingTime: String(NOW + 9 * 3_600_000), method: "current_period", settState: "settled" }], meta: meta(endpoint.path) };
        const rows = Array.from({ length: 40 }, (_, i) => [String(NOW - i * 900_000), "0.025", "0.026", "0.024", String(0.025 + (i % 3) * 0.0001), "1", "1", "1", "1"]);
        return { data: rows, meta: meta(endpoint.path) };
      },
    };
    const market = await readPublicMarket(port, { nowMs: NOW, candles: 40 });
    expect(calls.map((path) => path.split("/").pop())).toEqual(["mark-price", "funding-rate", "candles"]);
    expect(market.markPrice).toBeCloseTo(0.0251);
    expect(market.fundingRate).toBeCloseTo(0.0001);
    expect(market.fundingIntervalMs).toBe(8 * 3_600_000);
    expect(market.candlesUsed).toBe(40);
    expect(market.realizedSigmaDaily).not.toBeNull();
    expect(market.source).toBe("okx_public_v5");
    expect(configuredWallet(250, NOW)).toMatchObject({ capitalUsd: 250, source: "configured", openSide: null });
  });
});
