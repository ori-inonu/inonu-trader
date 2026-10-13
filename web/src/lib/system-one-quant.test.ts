import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemOneView } from "../components/SystemOne/SystemOne";
import { parseSystemOneCycle, type SystemOneState } from "./system-one";

const ladder = (["long", "short"] as const).flatMap((side) => [1, 2, 3, 5].map((leverage) => ({
  id: `${side}-${leverage}x`, side, leverage, marginUsd: 10, notionalUsd: 10 * leverage, liquidationDistance: 1 / leverage,
  touchProbability: 0.02, medianMultipleNoEdge: 0.99, fundingCarryPerDay: 0.0003, fundingCarryUsd: 0.02, eligible: false, reasons: ["phase_0_observes_only"],
})));

const quantOk = {
  status: "ok", dataGrade: "A", horizonDays: 7,
  sigma: { low: 0.0505, central: 0.0532, high: 0.0544, regime: "normal" },
  tail: { excessKurtosis: 0.9, hillIndex: 4.23, heavyTailed: false },
  simulation: { paths: 5000, skipped: null },
  candidates: ladder.map((c, i) => ({ id: c.id, sideAwareTouch: i === 7 ? 0.0477 : 0, simulatedTouch: i === 7 ? 0.0413 : i === 0 ? 0 : 0.00005, simulatedStdError: 0.003 })),
};

const base = {
  schemaVersion: 1, cycleId: "so-abc", startedAtMs: 1_000, completedAtMs: 2_000,
  brief: {
    phase: "fase-0", horizonDays: 7,
    market: { instId: "MON-USDT-SWAP", indexPrice: null, markPrice: 0.025, fundingRate: 0.0001, fundingIntervalMs: 28_800_000, realizedSigmaDaily: 0.05, candlesUsed: 299, source: "okx_public_v5", observedAtMs: 1_000 },
    wallet: { capitalUsd: 500, knownValueUsd: 0, valueComplete: false, openNotionalUsd: 0, openSide: null, source: "configured" },
    limits: { leverageCeiling: 0, leverageCap: 0, orderCapUsd: 0, exposureCapUsd: 0, liquidationDistanceFloor: null, dailyStopUsd: null },
    candidates: ladder, eligibleIds: [], notes: [],
  },
  decision: null, chosen: null, execution: { status: "blocked", reasons: ["no_eligible_candidate"] }, warnings: [],
};
const withQuant = (quant: unknown) => ({ ...base, brief: { ...base.brief, quant } });
const render = (cycle: ReturnType<typeof parseSystemOneCycle>) => {
  const state: SystemOneState = { status: "ready", cycle, error: null, ageMs: 1_000 };
  return renderToStaticMarkup(createElement(SystemOneView, { state, reducedMotion: true }));
};

describe("parseSystemOneCycle with the quant annex", () => {
  test("a cycle without the annex has no quant key at all", () => {
    const parsed = parseSystemOneCycle(base)!;
    expect("quant" in parsed.brief).toBe(false);
  });

  test("an ok annex is read field by field", () => {
    const quant = parseSystemOneCycle(withQuant(quantOk))!.brief.quant!;
    if (quant.status !== "ok") throw new Error("expected ok");
    expect(quant.dataGrade).toBe("A");
    expect(quant.sigma).toEqual({ low: 0.0505, central: 0.0532, high: 0.0544, regime: "normal" });
    expect(quant.tail.hillIndex).toBe(4.23);
    expect(quant.simulation).toEqual({ paths: 5000, skipped: null });
    expect(quant.candidates).toHaveLength(8);
    expect(quant.candidates[7]).toEqual({ id: "short-5x", sideAwareTouch: 0.0477, simulatedTouch: 0.0413, simulatedStdError: 0.003 });
  });

  test("a simulation that did not run keeps its reason; a bad paths count becomes unknown", () => {
    const skipped = parseSystemOneCycle(withQuant({ ...quantOk, simulation: { paths: null, skipped: "budget_exceeded" } }))!.brief.quant!;
    if (skipped.status !== "ok") throw new Error("expected ok");
    expect(skipped.simulation).toEqual({ paths: null, skipped: "budget_exceeded" });
    for (const simulation of [{ paths: -3, skipped: null }, { paths: 1.5, skipped: null }, { paths: "5000", skipped: "weird" }, "x", undefined]) {
      const q = parseSystemOneCycle(withQuant({ ...quantOk, simulation }))!.brief.quant!;
      if (q.status !== "ok") throw new Error("expected ok");
      expect(q.simulation).toEqual({ paths: null, skipped: null });
    }
  });

  test("unavailable keeps only the reason and the grade", () => {
    const quant = parseSystemOneCycle(withQuant({ status: "unavailable", reason: "stale", dataGrade: "F", candidates: [{ id: "long-1x", sideAwareTouch: 0.5 }] }))!.brief.quant!;
    expect(quant).toEqual({ status: "unavailable", reason: "stale", dataGrade: "F" });
  });

  test("probabilities outside [0, 1] or not finite become unknown, never a value", () => {
    const bad = { ...quantOk, candidates: [{ id: "long-1x", sideAwareTouch: 1.5, simulatedTouch: Number.NaN, simulatedStdError: -1 }] };
    const quant = parseSystemOneCycle(withQuant(bad))!.brief.quant!;
    if (quant.status !== "ok") throw new Error("expected ok");
    expect(quant.candidates).toEqual([{ id: "long-1x", sideAwareTouch: null, simulatedTouch: null, simulatedStdError: null }]);
  });

  test("candidates outside the ladder are dropped", () => {
    const odd = { ...quantOk, candidates: [{ id: "long-9x", sideAwareTouch: 0.1, simulatedTouch: 0.1, simulatedStdError: 0 }, { id: "short-2x", sideAwareTouch: 0.1, simulatedTouch: 0.1, simulatedStdError: 0 }] };
    const quant = parseSystemOneCycle(withQuant(odd))!.brief.quant!;
    if (quant.status !== "ok") throw new Error("expected ok");
    expect(quant.candidates.map((c) => c.id)).toEqual(["short-2x"]);
  });

  test("an unknown grade or status drops the whole annex without rejecting the cycle", () => {
    for (const quant of [{ ...quantOk, dataGrade: "Z" }, { ...quantOk, status: "maybe" }, "text", 7, { status: "ok" }]) {
      const parsed = parseSystemOneCycle(withQuant(quant));
      expect(parsed).not.toBeNull();
      expect("quant" in parsed!.brief).toBe(false);
    }
  });
});

describe("SystemOneView with the quant annex", () => {
  test("shows the block with the grade, the sigma band and the three probabilities per candidate", () => {
    const html = render(parseSystemOneCycle(withQuant(quantOk)));
    expect(html).toContain("Risco medido de liquidacao");
    expect(html).toContain("Dados limpos");
    expect(html).toContain("5.05%");
    expect(html).toContain("5.44%");
    expect(html).toContain("4.77%");
    expect(html).toContain("4.13%");
    expect(html).toContain("short-5x");
  });

  test("tiny and zero probabilities are shown honestly, not as zero", () => {
    const html = render(parseSystemOneCycle(withQuant(quantOk)));
    expect(html).toContain("&lt;0.01%");
    expect(html).toContain(">0%<");
  });

  test("a simulated zero reads as less than one hit in the paths that ran, never as impossible", () => {
    const html = render(parseSystemOneCycle(withQuant(quantOk)));
    expect(html).toContain("&lt;0.02%");
    expect(html).toContain("menos de 1 acerto em 5000 caminhos");
  });

  test("when the simulation did not run its column is unknown and the reason is stated", () => {
    const html = render(parseSystemOneCycle(withQuant({ ...quantOk, simulation: { paths: null, skipped: "budget_exceeded" }, candidates: quantOk.candidates.map((c) => ({ ...c, simulatedTouch: null })) })));
    expect(html).toContain("simulacao nao rodou");
    expect(html).not.toContain("&lt;0.02%");
  });

  test("the block says what it is: risk description, no drift, deep tail is a floor, eligibility unchanged", () => {
    const html = render(parseSystemOneCycle(withQuant(quantOk)));
    expect(html).toContain("sem deriva");
    expect(html).toContain("piso");
    expect(html).toContain("nao mudam quais candidatos sao elegiveis");
  });

  test("an unavailable annex says why and prints no probability", () => {
    const html = render(parseSystemOneCycle(withQuant({ status: "unavailable", reason: "stale", dataGrade: "F" })));
    expect(html).toContain("Risco medido de liquidacao");
    expect(html).toContain("velas velhas");
    expect(html).not.toContain("<table");
  });

  test("without the annex the section is absent", () => {
    expect(render(parseSystemOneCycle(base))).not.toContain("Risco medido");
  });

  test("project text rules: no middle dot, en dash or em dash anywhere in the block", () => {
    const html = render(parseSystemOneCycle(withQuant(quantOk)));
    const block = html.slice(html.indexOf("Risco medido de liquidacao"));
    expect(new RegExp(`[${String.fromCharCode(0xb7, 0x2013, 0x2014)}]`).test(block)).toBe(false);
    expect(/blink|pulse|infinite/i.test(block)).toBe(false);
  });
});
