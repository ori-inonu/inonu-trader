import { describe, expect, test } from "bun:test";
import { buildQuantAnnex, type QuantAnnex } from "../quant/annex";
import { simulateCandles } from "../quant/test-support";
import { buildLeverageBrief } from "./brief";
import { runSystemOneCycle } from "./cycle";
import { buildSystemOneState, inputsText, MockSystemOneModel, systemOneQuestions } from "./decide";
import { publicSystemOneView } from "./public-view";
import { syntheticReadings } from "./readings";
import { LEVERAGE_LADDER, SIDES } from "./types";

const NOW = 1_800_000_000_000;
const BAR = 900_000;

// The exact text the model was given before the quant annex existed. It must not change without the annex.
const ORIGINAL_INPUTS = "Every candidate already passed the phase envelope: leverage cap, liquidation floor, order and exposure caps, complete inventory. Touch probabilities assume no drift. Funding carry is from the candidate side's point of view. Probabilities are decision weights, not win rates.";

const ladder = SIDES.flatMap((side) => LEVERAGE_LADDER.map((leverage) => ({ id: `${side}-${leverage}x`, side, leverage })));

function annexFor(nowMs: number): QuantAnnex {
  const candles = simulateCandles({ seed: 3, bars: 400, sigmaDaily: 0.05, barMs: BAR, substeps: 20, startMs: nowMs - 400 * BAR });
  return buildQuantAnnex({ candles, barMs: BAR, nowMs, horizonDays: 7, candidates: ladder, seed: 5, paths: 1000 });
}

const phase2 = () => ({ ...syntheticReadings({ nowMs: NOW, capitalUsd: 1000, fundingRate: -0.0003 }), phase: "fase-2" as const, kellyLowerBound: 12 });
const deps = { model: new MockSystemOneModel(), now: () => NOW, cycleId: () => "so-test" };
/** The mock reports its wall clock latency, which differs between two runs; everything else must match. */
const stable = <T extends { decision: { latencyMs: number } | null }>(cycle: T): T => (cycle.decision ? { ...cycle, decision: { ...cycle.decision, latencyMs: 0 } } : cycle);

describe("model inputs text", () => {
  test("without the annex the text is exactly the original", () => {
    const brief = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    expect(inputsText(brief)).toBe(ORIGINAL_INPUTS);
  });
  test("the effective choice prompt payload matches the original literal", () => {
    const brief = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const eligible = brief.candidates.filter((candidate) => candidate.eligible);
    expect(systemOneQuestions(brief, eligible)).toEqual({
      leverage: {
        type: "choice",
        instructions: {
          question: "Which single leverage candidate should System One open now, or should it hold?",
          goal: "Act as the fast decision layer of the wallet. Grow median wealth over the horizon while keeping the probability of touching liquidation low. Never exceed the listed caps; prefer hold when carry and basis are small relative to drag and liquidation risk.",
          inputs: ORIGINAL_INPUTS,
        },
        criteria: {
          hold: "Do not open or add to a position now. Choose this when the funding carry, the basis and the realized volatility do not justify the liquidation risk inside the horizon, or when any input is missing.",
          "long-1x": "Open a long position at 1x with margin 20 USD (notional 20 USD). Choose this only when the expected funding carry and basis over the horizon outweigh the volatility drag and the probability of touching liquidation listed for it.",
          "long-2x": "Open a long position at 2x with margin 20 USD (notional 40 USD). Choose this only when the expected funding carry and basis over the horizon outweigh the volatility drag and the probability of touching liquidation listed for it.",
          "short-1x": "Open a short position at 1x with margin 20 USD (notional 20 USD). Choose this only when the expected funding carry and basis over the horizon outweigh the volatility drag and the probability of touching liquidation listed for it.",
          "short-2x": "Open a short position at 2x with margin 20 USD (notional 40 USD). Choose this only when the expected funding carry and basis over the horizon outweigh the volatility drag and the probability of touching liquidation listed for it.",
        },
      },
    });
  });
  test("with the annex the original text is kept and the new figures are explained", () => {
    const brief = { ...buildLeverageBrief({ ...phase2(), nowMs: NOW }), quant: annexFor(NOW) };
    const text = inputsText(brief);
    expect(text.startsWith(ORIGINAL_INPUTS)).toBe(true);
    expect(text).toContain("sideAwareTouch");
    expect(text).toContain("simulatedTouch");
    expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0xb7, 0x2013, 0x2014)}]`));
  });

  test("the added text tells the model what zero means, that low values are a floor, and the calibrated range", () => {
    const brief = { ...buildLeverageBrief({ ...phase2(), nowMs: NOW }), quant: annexFor(NOW) };
    const added = inputsText(brief).slice(ORIGINAL_INPUTS.length);
    expect(added).toContain("fewer than 1 hit");
    expect(added).toContain("simulationPaths");
    expect(added).toContain("simulatedStdError");
    expect(added).toContain("floor");
    expect(added).toContain("1 to 4 horizon sigmas");
    expect(added).toContain("does not change which candidates are eligible");
  });

  test("the added text describes, it never instructs: no ranking, choosing or recommending words", () => {
    const brief = { ...buildLeverageBrief({ ...phase2(), nowMs: NOW }), quant: annexFor(NOW) };
    const added = inputsText(brief).slice(ORIGINAL_INPUTS.length);
    expect(added).not.toMatch(/\b(prefer|choose|select|pick|recommend|recommended|best|safest|lowest|highest|should|must|avoid|rank|ranked|buy|sell|hold)\b/i);
  });
});

describe("state Jev sees", () => {
  test("has no quant key when the brief has no annex", () => {
    const brief = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const state = buildSystemOneState(brief, brief.candidates.filter((c) => c.eligible));
    expect("quant" in state).toBe(false);
  });

  test("carries a compact quant view for the eligible candidates only", () => {
    const base = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const brief = { ...base, quant: annexFor(NOW) };
    const eligible = brief.candidates.filter((c) => c.eligible);
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.length).toBeLessThan(brief.candidates.length);
    const state = buildSystemOneState(brief, eligible);
    expect(state.quant?.status).toBe("ok");
    if (state.quant?.status !== "ok") throw new Error("expected ok");
    expect(state.quant.candidates.map((c) => c.id)).toEqual(eligible.map((c) => c.id));
    expect(state.quant.dataGrade).toBe("A");
    expect(JSON.stringify(state.quant)).not.toMatch(/NaN|Infinity/);
  });

  test("every model facing field is exactly the annex field it is named after (a hand made annex, all values distinct)", () => {
    const annex: QuantAnnex = {
      schemaVersion: 1, status: "ok", horizonDays: 7,
      quality: { grade: "B", coverage: 0.9, usable: 600, fresh: true, issues: { gap: 1 } },
      sigma: { low: 0.011, central: 0.022, high: 0.033, dispersion: 0.5, regime: "stressed", tailRatio: 1.7, recentRatio: 2.2 },
      tail: { returns: 599, excessKurtosis: 6.5, hillIndex: 2.9, es99: 0.04, heavyTailed: true },
      clustering: { alpha: 0.1, beta: 0.8, persistence: 0.9, halfLifeBars: 6.58, atBoundary: false },
      simulation: { paths: 4000, steps: 672, seed: 9, sigmaStartDaily: 0.05 },
      simulationSkipped: null,
      candidates: ladder.map((c, i) => ({ id: c.id, sideAwareTouch: 0.001 * (i + 1), simulatedTouch: 0.01 * (i + 1), simulatedStdError: 0.0001 * (i + 1) })),
    };
    const base = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const eligible = base.candidates.filter((c) => c.eligible);
    const state = buildSystemOneState({ ...base, quant: annex }, eligible);
    const byId = (id: string) => ladder.findIndex((c) => c.id === id) + 1;
    expect(state.quant).toEqual({
      status: "ok", dataGrade: "B",
      sigmaDaily: { low: 0.011, central: 0.022, high: 0.033 },
      regime: "stressed", tailRatio: 1.7, excessKurtosis: 6.5, hillIndex: 2.9, clusteringHalfLifeBars: 6.58,
      simulationPaths: 4000, simulationSkipped: null,
      candidates: eligible.map((c) => ({ id: c.id, sideAwareTouch: 0.001 * byId(c.id), simulatedTouch: 0.01 * byId(c.id), simulatedStdError: 0.0001 * byId(c.id) })),
    });
  });

  test("a clustering fit at the edge of the grid or a skipped simulation reaches the model as null, not as a number", () => {
    const base = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const eligible = base.candidates.filter((c) => c.eligible);
    const annex = annexFor(NOW);
    if (annex.status !== "ok") throw new Error("expected ok");
    const edge: QuantAnnex = { ...annex, clustering: { alpha: 0.09, beta: 0.4, persistence: 0.49, halfLifeBars: null, atBoundary: true } };
    expect((buildSystemOneState({ ...base, quant: edge }, eligible).quant as { clusteringHalfLifeBars: unknown }).clusteringHalfLifeBars).toBeNull();
    const skipped: QuantAnnex = { ...annex, clustering: null, simulation: null, simulationSkipped: "budget_exceeded", candidates: annex.candidates.map((c) => ({ ...c, simulatedTouch: null, simulatedStdError: null })) };
    const quant = buildSystemOneState({ ...base, quant: skipped }, eligible).quant as { simulationPaths: unknown; simulationSkipped: unknown; candidates: { simulatedTouch: unknown }[] };
    expect(quant.simulationPaths).toBeNull();
    expect(quant.simulationSkipped).toBe("budget_exceeded");
    expect(quant.candidates.every((c) => c.simulatedTouch === null)).toBe(true);
  });

  test("the model facing quant block has exactly these keys and nothing that ranks or recommends", () => {
    const base = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const eligible = base.candidates.filter((c) => c.eligible);
    const state = buildSystemOneState({ ...base, quant: annexFor(NOW) }, eligible);
    const quant = state.quant as Record<string, unknown> & { candidates: Record<string, unknown>[]; sigmaDaily: Record<string, unknown> };
    expect(Object.keys(quant).sort()).toEqual(["candidates", "clusteringHalfLifeBars", "dataGrade", "excessKurtosis", "hillIndex", "regime", "sigmaDaily", "simulationPaths", "simulationSkipped", "status", "tailRatio"]);
    expect(Object.keys(quant.sigmaDaily).sort()).toEqual(["central", "high", "low"]);
    for (const c of quant.candidates) expect(Object.keys(c).sort()).toEqual(["id", "sideAwareTouch", "simulatedStdError", "simulatedTouch"]);
  });

  test("an unavailable annex tells the model the evidence is missing, without numbers", () => {
    const base = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const brief = { ...base, quant: buildQuantAnnex({ candles: [], barMs: BAR, nowMs: NOW, horizonDays: 7, candidates: ladder, seed: 1 }) };
    const state = buildSystemOneState(brief, brief.candidates.filter((c) => c.eligible));
    expect(state.quant).toEqual({ status: "unavailable", reason: "too_few_candles", dataGrade: "F" });
  });
});

describe("cycle with the annex", () => {
  test("attaches the annex and changes nothing else about the cycle", async () => {
    const without = await runSystemOneCycle(phase2(), deps);
    const withAnnex = await runSystemOneCycle({ ...phase2(), quant: annexFor(NOW) }, deps);
    expect(withAnnex.brief.quant?.status).toBe("ok");
    const { quant: _quant, ...briefWithout } = withAnnex.brief;
    expect(briefWithout).toEqual(without.brief);
    expect(stable(withAnnex).decision).toEqual(stable(without).decision);
    expect(withAnnex.chosen).toEqual(without.chosen);
    expect(withAnnex.execution).toEqual(without.execution);
    expect(withAnnex.warnings).toEqual(without.warnings);
    expect(withAnnex.brief.eligibleIds).toEqual(without.brief.eligibleIds);
  });

  test("whatever the annex says, eligibility, choice, probabilities and execution do not move (extreme values, distinct per candidate)", async () => {
    const without = await runSystemOneCycle(phase2(), deps);
    for (const level of [0, 0.5, 0.99, 1]) {
      const annex: QuantAnnex = {
        schemaVersion: 1, status: "ok", horizonDays: 7,
        quality: { grade: "F", coverage: 0, usable: 0, fresh: false, issues: {} },
        sigma: { low: 0.9, central: 0.9, high: 0.9, dispersion: 9, regime: "stressed", tailRatio: 9, recentRatio: 9 },
        tail: { returns: 1, excessKurtosis: 99, hillIndex: 0.1, es99: 0.9, heavyTailed: true },
        clustering: null, simulation: null, simulationSkipped: "budget_exceeded",
        candidates: ladder.map((c, i) => ({ id: c.id, sideAwareTouch: level, simulatedTouch: level === 0.5 ? 0.99 - 0.1 * i : level, simulatedStdError: 0 })),
      };
      const withAnnex = await runSystemOneCycle({ ...phase2(), quant: annex }, deps);
      expect(withAnnex.brief.eligibleIds).toEqual(without.brief.eligibleIds);
      expect(withAnnex.brief.candidates).toEqual(without.brief.candidates);
      expect(stable(withAnnex).decision).toEqual(stable(without).decision);
      expect(withAnnex.chosen).toEqual(without.chosen);
      expect(withAnnex.execution).toEqual(without.execution);
    }
  });

  test("the model sees the candidates in the envelope's order, not reordered by any annex value", () => {
    const base = buildLeverageBrief({ ...phase2(), nowMs: NOW });
    const eligible = base.candidates.filter((c) => c.eligible);
    const annex = annexFor(NOW);
    if (annex.status !== "ok") throw new Error("expected ok");
    const reversed: QuantAnnex = { ...annex, candidates: annex.candidates.map((c, i) => ({ ...c, simulatedTouch: 0.9 - 0.1 * i })) };
    const state = buildSystemOneState({ ...base, quant: reversed }, eligible);
    expect(state.candidates.map((c) => c.id)).toEqual(eligible.map((c) => c.id));
    expect((state.quant as { candidates: { id: string }[] }).candidates.map((c) => c.id)).toEqual(eligible.map((c) => c.id));
  });

  test("a cycle without the annex serializes exactly as before", async () => {
    const cycle = await runSystemOneCycle(phase2(), deps);
    expect(JSON.stringify(cycle)).not.toContain("quant");
  });

  test("the annex is copied, so mutating the caller's object cannot change the cycle", async () => {
    const quant = annexFor(NOW);
    const cycle = await runSystemOneCycle({ ...phase2(), quant }, deps);
    (quant as { status: string }).status = "tampered";
    expect(cycle.brief.quant?.status).toBe("ok");
  });

  test("the public projection differs only by the allowlisted quant block", async () => {
    const without = await runSystemOneCycle(phase2(), deps);
    const withAnnex = await runSystemOneCycle({ ...phase2(), quant: annexFor(NOW) }, deps);
    const a = publicSystemOneView(stable(without)) as { brief: Record<string, unknown> };
    const b = publicSystemOneView(stable(withAnnex)) as { brief: Record<string, unknown> };
    expect("quant" in a.brief).toBe(false);
    expect(b.brief.quant).toBeDefined();
    const { quant: _quant, ...briefB } = b.brief;
    expect({ ...b, brief: briefB }).toEqual(a);
  });
});
