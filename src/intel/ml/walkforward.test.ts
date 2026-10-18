import { describe, expect, test } from "bun:test";
import { GATE, evaluate, quantile, walkForward, type ModelKind, type WalkOptions } from "./walkforward";
import { syntheticDataset } from "./synthetic";

const H = 12;
const STEP = 300_000;
const opts: Omit<WalkOptions, "model"> = { horizonMs: H * STEP, stepMs: STEP, gbdt: { maxTrees: 25, minLeaf: 30 } };
const MODELS: readonly ModelKind[] = ["logistic", "gbdt"];

function judge(seed: number, rho: number, times = 1000, instruments = 2, models: readonly ModelKind[] = MODELS) {
  const d = syntheticDataset({ times, instruments, horizonSteps: H, rho, seed });
  const runs = models.map((model) => walkForward(d, { ...opts, model }));
  return { d, runs, ev: evaluate(runs, d, opts) };
}

describe("time only moves forward (ML-3)", () => {
  const { runs } = judge(1, 0.5, 1500);
  test("every fitted row, with its label window and the embargo, ended before the test block starts", () => {
    for (const run of runs) {
      expect(run.folds.filter((f) => f.skipped === null).length).toBeGreaterThanOrEqual(3);
      for (const f of run.folds) {
        if (f.skipped !== null) continue;
        expect(f.fitUntilMs! + 2 * H * STEP).toBeLessThanOrEqual(f.testFromMs); // the horizon, then an embargo of one more
        expect(f.validationUntilMs! + 2 * H * STEP).toBeLessThanOrEqual(f.testFromMs);
        expect(f.fitUntilMs!).toBeLessThan(f.validationUntilMs!);
      }
    }
  });
  test("the blocks are contiguous and every out of sample prediction lies inside its own block", () => {
    const run = runs[0]!;
    const ok = run.folds.filter((f) => f.skipped === null);
    for (let i = 1; i < run.folds.length; i += 1) expect(run.folds[i]!.testFromMs).toBeCloseTo(run.folds[i - 1]!.testToMs, 3);
    for (const p of run.oos) {
      const f = run.folds[p.fold]!;
      expect(p.t >= f.testFromMs && p.t < f.testToMs).toBe(true);
    }
    expect(run.oos.length).toBe(ok.reduce((s, f) => s + f.tested, 0));
  });
  test("the first block of time is never predicted: it is only ever training", () => {
    const run = runs[0]!;
    const first = Math.min(...run.oos.map((p) => p.t));
    expect(first).toBeGreaterThan(run.folds[0]!.testFromMs - 1);
  });
  test("the threshold of a block comes from its validation, so it is the same for every row of the block", () => {
    const run = runs[1]!;
    for (const f of run.folds) {
      if (f.skipped !== null) continue;
      expect(new Set(run.oos.filter((p) => p.fold === f.fold).map((p) => p.tau)).size).toBe(1);
    }
  });
});

describe("no edge, no promotion (ML-4)", () => {
  test("on pure noise the gate says no, in every one of 5 worlds, for both models", () => {
    let promoted = 0;
    for (let seed = 1; seed <= 5; seed += 1) promoted += judge(seed, 0).ev.filter((e) => e.promoted).length;
    expect(promoted).toBe(0);
  }, 60_000);
  test("and it says why: no proof against zero, nor against the simple rules", () => {
    const { ev } = judge(2, 0, 800);
    for (const e of ev) {
      expect(e.promoted).toBe(false);
      expect(e.reasons).toContain("media_liquida_nao_positiva");
      expect(e.reasons).toContain("sem_prova_contra_zero");
      expect(e.reasons.some((r) => r.startsWith("sem_prova_contra_"))).toBe(true);
    }
  });
});

describe("a planted edge is found (ML-4)", () => {
  test("a column that knows the future with a correlation of 0.9 is promoted in most worlds (9000 rows, the linear model reads it)", () => {
    let worlds = 0;
    for (let seed = 1; seed <= 3; seed += 1) {
      const { ev } = judge(seed, 0.9, 3000, 3, ["logistic"]);
      if (ev.some((e) => e.promoted)) worlds += 1;
    }
    expect(worlds).toBeGreaterThanOrEqual(2);
  }, 60_000);
  test("what is measured is the cost-aware policy: positive net bps, tests against zero and every baseline, Holm never below the raw p", () => {
    const { ev } = judge(3, 0.9, 3000, 3, ["logistic"]);
    const best = ev.find((e) => e.promoted)!;
    expect(best).toBeDefined();
    expect(best.policyMeanBps!).toBeGreaterThan(0);
    expect(best.tests.map((t) => t.versus)).toEqual(["zero", "sempre", "tendencia", "estrutura", "aleatorio"]);
    for (const e of ev) for (const t of e.tests) expect(t.pHolm).toBeGreaterThanOrEqual(t.pOneSided - 1e-12);
    expect(best.trades).toBeGreaterThanOrEqual(GATE.minTrades);
    expect(best.skill!).toBeGreaterThan(0);
    expect(best.ece!).toBeLessThanOrEqual(GATE.maxEce);
  }, 60_000);
});

describe("the gate", () => {
  test("a table that is too short to train on is skipped fold by fold, and nothing is promoted", () => {
    const d = syntheticDataset({ times: 150, instruments: 1, horizonSteps: H, rho: 0.9, seed: 1 });
    const run = walkForward(d, { ...opts, model: "logistic" });
    expect(run.oos).toEqual([]);
    expect(run.folds.every((f) => f.skipped !== null)).toBe(true);
    const [ev] = evaluate([run], d, opts);
    expect(ev!.promoted).toBe(false);
    expect(ev!.reasons).toContain("sem_previsao_fora_da_amostra");
  });
  test("an empty table is not an error", () => {
    const d = { ...syntheticDataset({ times: 10, instruments: 1, horizonSteps: 2, rho: 0, seed: 1 }), samples: [] };
    const run = walkForward(d, { ...opts, model: "gbdt" });
    expect(run).toEqual({ model: "gbdt", folds: [], oos: [] });
  });
  test("the Holm correction is over every comparison of every model: adding a model cannot lower a p value", () => {
    const { d, runs } = judge(4, 0.3, 800);
    const alone = evaluate([runs[0]!], d, opts)[0]!;
    const both = evaluate(runs, d, opts)[0]!;
    alone.tests.forEach((t, i) => expect(both.tests[i]!.pHolm).toBeGreaterThanOrEqual(t.pHolm - 1e-12));
  });
  test("judging several tables multiplies the corrected p by how many were judged, and never lowers it", () => {
    const { d, runs } = judge(4, 0.3, 800);
    const one = evaluate(runs, d, opts, 1)[0]!;
    const two = evaluate(runs, d, opts, 2)[0]!;
    one.tests.forEach((t, i) => expect(two.tests[i]!.pHolm).toBeCloseTo(Math.min(1, t.pHolm * 2), 12));
  });
  test("the whole evaluation is deterministic", () => {
    expect(JSON.stringify(judge(5, 0.5, 600).ev)).toBe(JSON.stringify(judge(5, 0.5, 600).ev));
  });
});

describe("quantile", () => {
  test("by position in the sorted values", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.8)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantile([7], 0.5)).toBe(7);
  });
});
