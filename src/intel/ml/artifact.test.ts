import { describe, expect, test } from "bun:test";
import { FEATURE_NAMES } from "../features/types";
import { explainArtifact, scoreArtifact, trainArtifact, type Artifact } from "./artifact";
import { syntheticDataset } from "./synthetic";

const H = 12;
const STEP = 300_000;
const o = { horizonMs: H * STEP, gbdt: { maxTrees: 25, minLeaf: 30 } };
const dataset = syntheticDataset({ times: 1500, instruments: 2, horizonSteps: H, rho: 0.9, seed: 5 });
const planted = FEATURE_NAMES.indexOf("x.betaBtc48h");

describe("a stored model", () => {
  const a = trainArtifact(dataset, "logistic", o)!;

  test("is trained on the earlier rows and records where they came from", () => {
    expect(a.kind).toBe("logistic");
    expect(a.rows).toBe(dataset.samples.length);
    expect(a.fromMs).toBe(dataset.samples[0]!.t);
    expect(a.toMs).toBe(dataset.samples[dataset.samples.length - 1]!.t);
    expect(a.baseRate).toBeGreaterThan(0);
    expect(a.baseRate).toBeLessThan(1);
    expect(a.tau).toBeGreaterThan(0);
    expect(a.tau).toBeLessThanOrEqual(1);
  });

  test("survives JSON and scores every row the same afterwards, for both kinds of model", () => {
    for (const kind of ["logistic", "gbdt"] as const) {
      const m = trainArtifact(dataset, kind, o)!;
      const again = JSON.parse(JSON.stringify(m)) as Artifact;
      for (const s of dataset.samples.slice(0, 40)) expect(scoreArtifact(again, s.x)).toBe(scoreArtifact(m, s.x));
    }
  });

  test("a probability is a frequency between 0 and 1, and a row that says the future is up scores above one that says it is down", () => {
    const up = new Float64Array(dataset.names.length);
    const down = new Float64Array(dataset.names.length);
    up[planted] = 2;
    down[planted] = -2;
    for (const x of [up, down]) {
      const p = scoreArtifact(a, x);
      expect(p >= 0 && p <= 1).toBe(true);
    }
    expect(scoreArtifact(a, up)).toBeGreaterThan(scoreArtifact(a, down));
  });

  test("the explanation names the column that moved it, with its sign", () => {
    const row = new Float64Array(dataset.names.length);
    row[planted] = 2.5;
    const top = explainArtifact(a, row, 3);
    expect(top[0]!.feature).toBe("x.betaBtc48h");
    expect(top[0]!.delta).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    row[planted] = -2.5;
    expect(explainArtifact(a, row, 1)[0]!.delta).toBeLessThan(0);
  });

  test("too little data to train on is nothing, not a model", () => {
    expect(trainArtifact(syntheticDataset({ times: 100, instruments: 1, horizonSteps: H, rho: 0.9, seed: 1 }), "logistic", o)).toBeNull();
    expect(trainArtifact({ ...dataset, samples: [] }, "gbdt", o)).toBeNull();
  });

  test("the fit stops one horizon and one embargo before the validation block, so a label never sees the block that sets the threshold", () => {
    const first = dataset.samples[0]!.t;
    const last = dataset.samples[dataset.samples.length - 1]!.t;
    const cut = first + 0.8 * (last - first);
    const fit = dataset.samples.filter((s) => s.t + 2 * o.horizonMs <= cut);
    expect(fit.length).toBeLessThan(dataset.samples.filter((s) => s.t < cut).length);
    expect(a.baseRate).toBeCloseTo(fit.reduce((s, x) => s + x.y, 0) / fit.length, 12);
  });
});
