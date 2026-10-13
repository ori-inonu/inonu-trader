import { describe, expect, test } from "bun:test";
import { buildQuantAnnex } from "../quant/annex";
import { simulateCandles } from "../quant/test-support";
import { runSystemOneCycle } from "./cycle";
import { MockSystemOneModel } from "./decide";
import { publicSystemOneView } from "./public-view";
import { syntheticReadings } from "./readings";
import { LEVERAGE_LADDER, SIDES } from "./types";

const NOW = 1_800_000_000_000;
const BAR = 900_000;
const ladder = SIDES.flatMap((side) => LEVERAGE_LADDER.map((leverage) => ({ id: `${side}-${leverage}x`, side, leverage })));
const deps = { model: new MockSystemOneModel(), now: () => NOW, cycleId: () => "so-test" };
const input = () => ({ ...syntheticReadings({ nowMs: NOW, capitalUsd: 1000, fundingRate: -0.0003 }), phase: "fase-2" as const, kellyLowerBound: 12 });
const annex = () => buildQuantAnnex({
  candles: simulateCandles({ seed: 3, bars: 400, sigmaDaily: 0.05, barMs: BAR, substeps: 20, startMs: NOW - 400 * BAR }),
  barMs: BAR, nowMs: NOW, horizonDays: 7, candidates: ladder, seed: 5, paths: 1000,
});

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.push(k); keysDeep(v, out); }
  return out;
}

describe("publicSystemOneView with the quant annex", () => {
  test("a cycle without the annex projects exactly as before: no quant key", async () => {
    const view = publicSystemOneView(await runSystemOneCycle(input(), deps)) as { brief: Record<string, unknown> };
    expect("quant" in view.brief).toBe(false);
  });

  test("an ok annex is projected field by field, rounded as given", async () => {
    const a = annex();
    if (a.status !== "ok") throw new Error("expected ok");
    const view = publicSystemOneView(await runSystemOneCycle({ ...input(), quant: a }, deps)) as { brief: { quant: Record<string, unknown> } };
    const q = view.brief.quant as { status: string; dataGrade: string; horizonDays: number; sigma: Record<string, unknown>; tail: Record<string, unknown>; candidates: { id: string; sideAwareTouch: number | null; simulatedTouch: number | null; simulatedStdError: number | null }[] };
    expect(q.status).toBe("ok");
    expect(q.dataGrade).toBe(a.quality.grade);
    expect(q.horizonDays).toBe(7);
    expect(q.sigma).toEqual({ low: a.sigma.low, central: a.sigma.central, high: a.sigma.high, regime: a.sigma.regime });
    expect(q.tail).toEqual({ excessKurtosis: a.tail.excessKurtosis, hillIndex: a.tail.hillIndex, heavyTailed: a.tail.heavyTailed });
    expect(q.candidates.map((c) => c.id)).toEqual(ladder.map((c) => c.id));
    expect(q.candidates[7]).toEqual({ id: "short-5x", sideAwareTouch: a.candidates[7]!.sideAwareTouch, simulatedTouch: a.candidates[7]!.simulatedTouch, simulatedStdError: a.candidates[7]!.simulatedStdError });
  });

  test("only allowlisted fields are published, with exactly these keys at every level", async () => {
    const view = publicSystemOneView(await runSystemOneCycle({ ...input(), quant: annex() }, deps)) as { brief: { quant: Record<string, unknown> } };
    const q = view.brief.quant as { sigma: object; tail: object; simulation: object; candidates: object[] };
    expect(Object.keys(view.brief.quant).sort()).toEqual(["candidates", "dataGrade", "horizonDays", "sigma", "simulation", "status", "tail"]);
    expect(Object.keys(q.sigma).sort()).toEqual(["central", "high", "low", "regime"]);
    expect(Object.keys(q.tail).sort()).toEqual(["excessKurtosis", "heavyTailed", "hillIndex"]);
    expect(Object.keys(q.simulation).sort()).toEqual(["paths", "skipped"]);
    for (const c of q.candidates) expect(Object.keys(c).sort()).toEqual(["id", "sideAwareTouch", "simulatedStdError", "simulatedTouch"]);
    const keys = new Set(keysDeep(view.brief.quant));
    for (const forbidden of ["clustering", "seed", "issues", "quality", "alpha", "beta", "returns", "es99", "steps", "sigmaStartDaily"]) expect(keys.has(forbidden)).toBe(false);
  });

  test("the simulation block says how many paths stand behind a simulated zero, or why there are none", async () => {
    const a = annex();
    if (a.status !== "ok") throw new Error("expected ok");
    const ran = (publicSystemOneView(await runSystemOneCycle({ ...input(), quant: a }, deps)) as { brief: { quant: { simulation: unknown } } }).brief.quant.simulation;
    expect(ran).toEqual({ paths: 1000, skipped: null });
    const skipped = { ...a, simulation: null, simulationSkipped: "budget_exceeded" as const };
    const view = publicSystemOneView(await runSystemOneCycle({ ...input(), quant: skipped }, deps)) as { brief: { quant: { simulation: unknown } } };
    expect(view.brief.quant.simulation).toEqual({ paths: null, skipped: "budget_exceeded" });
  });

  test("an unavailable annex publishes the reason and the grade only", async () => {
    const empty = buildQuantAnnex({ candles: [], barMs: BAR, nowMs: NOW, horizonDays: 7, candidates: ladder, seed: 1 });
    const view = publicSystemOneView(await runSystemOneCycle({ ...input(), quant: empty }, deps)) as { brief: { quant: unknown } };
    expect(view.brief.quant).toEqual({ status: "unavailable", reason: "too_few_candles", dataGrade: "F" });
  });

  test("hostile or malformed annex content is dropped or neutralised, never copied", async () => {
    const cycle = await runSystemOneCycle(input(), deps);
    const hostile = (quant: unknown) => publicSystemOneView({ ...cycle, brief: { ...cycle.brief, quant } }) as { brief: Record<string, unknown> } | null;
    expect("quant" in hostile("not an object")!.brief).toBe(false);
    expect("quant" in hostile({ status: "ok", quality: { grade: "Z" } })!.brief).toBe(false);
    expect("quant" in hostile({ status: "ok" })!.brief).toBe(false);
    const withJunk = hostile({
      status: "ok", quality: { grade: "A" }, horizonDays: 7,
      sigma: { low: 0.05, central: 0.05, high: 0.06, regime: "<script>", extra: 1 },
      tail: { excessKurtosis: Number.NaN, hillIndex: 4, heavyTailed: "yes" },
      candidates: [
        { id: "long-1x", sideAwareTouch: 2, simulatedTouch: 0.1, simulatedStdError: 0.01, note: "buy now" },
        { id: "long-99x", sideAwareTouch: 0.1, simulatedTouch: 0.1, simulatedStdError: 0.01 },
        { id: "short-5x", sideAwareTouch: 0.2, simulatedTouch: Number.POSITIVE_INFINITY, simulatedStdError: 0.01 },
      ],
    })!.brief.quant as { sigma: Record<string, unknown>; tail: Record<string, unknown>; candidates: Record<string, unknown>[] };
    expect(withJunk.sigma).toEqual({ low: 0.05, central: 0.05, high: 0.06, regime: null });
    expect(withJunk.tail).toEqual({ excessKurtosis: null, hillIndex: 4, heavyTailed: null });
    expect(withJunk.candidates).toEqual([
      { id: "long-1x", sideAwareTouch: null, simulatedTouch: 0.1, simulatedStdError: 0.01 },
      { id: "short-5x", sideAwareTouch: 0.2, simulatedTouch: null, simulatedStdError: 0.01 },
    ]);
    expect(JSON.stringify(withJunk)).not.toContain("buy now");
  });

  test("the rest of the projection is identical with and without the annex", async () => {
    const without = await runSystemOneCycle(input(), deps);
    const withAnnex = await runSystemOneCycle({ ...input(), quant: annex() }, deps);
    const strip = (cycle: typeof without) => ({ ...cycle, decision: cycle.decision ? { ...cycle.decision, latencyMs: 0 } : null });
    const a = publicSystemOneView(strip(without)) as { brief: Record<string, unknown> };
    const b = publicSystemOneView(strip(withAnnex)) as { brief: Record<string, unknown> };
    const { quant: _quant, ...briefB } = b.brief;
    expect({ ...b, brief: briefB }).toEqual(a);
  });
});
