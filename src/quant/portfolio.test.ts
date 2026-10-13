import { describe, expect, test } from "bun:test";
import { analyzePortfolio, concentration, ledoitWolf, scenarioLoss } from "./portfolio";
import { mulberry32, normalDraw } from "./types";
import { studentDraws } from "./test-support";

// Reference values: independent pure Python implementation (scratchpad portfolio_vectors.py) of Ledoit and Wolf 2004
// linear shrinkage toward a scaled identity, risk contributions, diversification ratio, normal VaR and drawdown.
const X = [
  [0.010, 0.012, -0.004], [-0.008, -0.010, 0.006], [0.004, 0.006, 0.001], [0.012, 0.009, -0.008],
  [-0.015, -0.013, 0.010], [0.002, 0.001, 0.003], [0.007, 0.011, -0.002], [-0.003, -0.006, 0.004],
  [0.009, 0.004, -0.006], [-0.011, -0.007, 0.007], [0.005, 0.008, 0.000], [-0.006, -0.002, 0.002],
];
const column = (j: number) => X.map((row) => row[j]!);
const BAR = 900_000;
const positions = [{ key: "A", valueUsd: 5000 }, { key: "B", valueUsd: 3000 }, { key: "C", valueUsd: 2000 }];
const returns = [{ key: "A", returns: column(0) }, { key: "B", returns: column(1) }, { key: "C", returns: column(2) }];
const near = (a: number | null, b: number, digits = 12) => expect(Math.abs((a as number) / b - 1)).toBeLessThan(10 ** -digits);

describe("concentration", () => {
  test("weights, HHI, effective N and top shares by hand", () => {
    const c = concentration([{ key: "A", valueUsd: 5000 }, { key: "B", valueUsd: 3000 }, { key: "C", valueUsd: 1500 }, { key: "D", valueUsd: 500 }]);
    expect(c.weights.map((w) => w.weight)).toEqual([0.5, 0.3, 0.15, 0.05]);
    near(c.hhi, 0.365);
    near(c.effectiveN, 1 / 0.365);
    expect(c.topShare).toBe(0.5);
    near(c.top3Share, 0.95);
    expect(c.totalValueUsd).toBe(10_000);
    expect(c.complete).toBe(true);
  });

  test("a position without a value is excluded and named, never counted as zero", () => {
    const withUnknown = concentration([{ key: "A", valueUsd: 5000 }, { key: "B", valueUsd: null }, { key: "C", valueUsd: 5000 }]);
    const without = concentration([{ key: "A", valueUsd: 5000 }, { key: "C", valueUsd: 5000 }]);
    expect(withUnknown.excluded).toEqual([{ key: "B", reason: "value_unknown" }]);
    expect(withUnknown.complete).toBe(false);
    expect(withUnknown.weights).toEqual(without.weights);
    expect(withUnknown.hhi).toBe(without.hhi);
  });

  test("negative, non finite and duplicated entries are excluded with their reason", () => {
    const c = concentration([{ key: "A", valueUsd: 100 }, { key: "B", valueUsd: -5 }, { key: "C", valueUsd: Number.NaN }, { key: "A", valueUsd: 999 }]);
    expect(c.excluded).toEqual([{ key: "B", reason: "value_invalid" }, { key: "C", reason: "value_invalid" }, { key: "A", reason: "duplicate_key" }]);
    expect(c.weights).toEqual([{ key: "A", weight: 1 }]);
  });

  test("nothing valued gives null measures, not zeros", () => {
    for (const input of [[], [{ key: "A", valueUsd: null }], [{ key: "A", valueUsd: 0 }]]) {
      const c = concentration(input);
      expect(c.hhi).toBeNull();
      expect(c.effectiveN).toBeNull();
      expect(c.topShare).toBeNull();
      expect(c.top3Share).toBeNull();
    }
    expect(concentration([]).totalValueUsd).toBeNull();
    expect(concentration([{ key: "A", valueUsd: null }]).totalValueUsd).toBeNull();
    expect(concentration([{ key: "A", valueUsd: 0 }]).totalValueUsd).toBe(0);
  });
});

describe("ledoitWolf", () => {
  test("matches the independent reference", () => {
    const r = ledoitWolf(X)!;
    near(r.shrinkage, 0.11137270060587141);
    const expected = [
      [7.068329443642298e-05, 5.794590514799214e-05, -3.69891113372806e-05],
      [5.794590514799214e-05, 6.593777781674183e-05, -3.244106745079815e-05],
      [-3.69891113372806e-05, -3.244106745079815e-05, 2.9948372191279626e-05],
    ];
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) near(r.cov[i]![j]!, expected[i]![j]!);
    expect(r.cov[0]![1]).toBe(r.cov[1]![0]);
  });
  test("the shrinkage intensity never exceeds one, even when the estimation noise is larger than the dispersion", () => {
    // reference (scratchpad gaps.py): b2bar 0.0077329 exceeds d2 0.0053346, so the intensity is capped at 1 and the result is mu * I
    const r = ledoitWolf([[-0.02, 0.88], [-0.22, 0.01], [-0.97, 0.22]])!;
    expect(r.shrinkage).toBe(1);
    near(r.cov[0]![0]!, 0.1523111111111111);
    near(r.cov[1]![1]!, 0.1523111111111111);
    expect(r.cov[0]![1]).toBe(0);
  });
  test("one asset needs no shrinkage", () => {
    const r = ledoitWolf(X.map((row) => [row[0]!]))!;
    expect(r.shrinkage).toBe(0);
    near(r.cov[0]![0]!, 7.258333333333333e-05);
  });
  test("shrinkage falls as observations grow", () => {
    const random = mulberry32(3);
    const make = (n: number) => Array.from({ length: n }, () => { const f = normalDraw(random); return [0.01 * (f + normalDraw(random)), 0.01 * (f + normalDraw(random)), 0.01 * normalDraw(random)]; });
    expect(ledoitWolf(make(2000))!.shrinkage).toBeLessThan(ledoitWolf(make(25))!.shrinkage);
  });
  test("unusable input is null", () => {
    expect(ledoitWolf([])).toBeNull();
    expect(ledoitWolf([[0.01, 0.02]])).toBeNull();
    expect(ledoitWolf([[0.01, 0.02], [0.01]])).toBeNull();
    expect(ledoitWolf([[0.01, Number.NaN], [0.02, 0.01], [0.03, 0.02]])).toBeNull();
  });
});

describe("analyzePortfolio", () => {
  const base = { positions, returns, barMs: BAR, minObservations: 10, horizonBars: 1 };

  test("per bar volatility, risk contributions, diversification ratio, normal VaR and ES, drawdown match the reference", () => {
    const a = analyzePortfolio(base);
    expect(a.risk.status).toBe("ok");
    if (a.risk.status !== "ok") return;
    const r = a.risk;
    near(r.sigmaBar, 0.005558433203980187);
    near(r.contributions.find((c) => c.key === "A")!.share, 0.7335469459341126);
    near(r.contributions.find((c) => c.key === "B")!.share, 0.4104009576170868);
    near(r.contributions.find((c) => c.key === "C")!.share, -0.1439479035511994);
    near(r.contributions.reduce((s, c) => s + c.share, 0), 1);
    near(r.diversificationRatio, 1.3914410963973092);
    near(r.normal.var95, 0.0091428090157343);
    near(r.normal.var99, 0.012930849267077327);
    near(r.normal.es99, 0.014814415218090305);
    near(r.maxDrawdown, 0.009355958105965234);
    near(r.shrinkage, 0.11137270060587141);
    expect(r.riskedShare).toBe(1);
    expect(r.sigmaDaily).toBeCloseTo(r.sigmaBar * Math.sqrt(96), 12);
  });

  test("a negative contribution marks an asset that offsets risk, and shares always sum to one", () => {
    const a = analyzePortfolio(base);
    if (a.risk.status !== "ok") throw new Error("expected risk");
    expect(a.risk.contributions.some((c) => c.share < 0)).toBe(true);
  });

  test("a historical tail needs at least three points; with 12 observations it stays null instead of a one point estimate", () => {
    const a = analyzePortfolio(base);
    if (a.risk.status !== "ok") throw new Error("expected risk");
    expect(a.risk.historical.var95).toBeNull();
    expect(a.risk.historical.es99).toBeNull();
    expect(a.risk.tailRatioEs99).toBeNull();
  });

  test("a position without returns drops out of the risk, is named, and the rest is renormalised", () => {
    const partial = analyzePortfolio({ ...base, returns: returns.slice(0, 2) });
    if (partial.risk.status !== "ok") throw new Error("expected risk");
    expect(partial.risk.excluded).toEqual([{ key: "C", reason: "no_returns" }]);
    expect(partial.risk.riskedShare).toBeCloseTo(0.8, 12);
    const direct = analyzePortfolio({ ...base, positions: positions.slice(0, 2), returns: returns.slice(0, 2) });
    if (direct.risk.status !== "ok") throw new Error("expected risk");
    expect(partial.risk.sigmaBar).toBe(direct.risk.sigmaBar);
  });

  test("returns of another length, invalid returns and unknown values are excluded with a reason", () => {
    const messy = analyzePortfolio({
      ...base,
      positions: [...positions, { key: "D", valueUsd: null }, { key: "E", valueUsd: 100 }],
      returns: [returns[0]!, returns[1]!, { key: "C", returns: column(2).slice(0, 5) }, { key: "E", returns: [...column(0).slice(0, 11), Number.NaN] }],
    });
    if (messy.risk.status !== "ok") throw new Error("expected risk");
    expect(messy.risk.excluded).toEqual([{ key: "C", reason: "returns_length_mismatch" }, { key: "E", reason: "returns_invalid" }]);
    expect(messy.concentration.excluded).toEqual([{ key: "D", reason: "value_unknown" }]);
  });

  test("too few observations or nothing with returns is unavailable with a reason", () => {
    expect(analyzePortfolio({ ...base, minObservations: 50 }).risk).toEqual({ status: "unavailable", reason: "too_few_observations" });
    expect(analyzePortfolio({ ...base, returns: [] }).risk).toEqual({ status: "unavailable", reason: "no_returns" });
    expect(analyzePortfolio({ ...base, positions: [] }).risk).toEqual({ status: "unavailable", reason: "no_value" });
  });

  test("independent assets diversify and identical assets do not", () => {
    const random = mulberry32(9);
    const indep = Array.from({ length: 4 }, (_, i) => ({ key: `I${i}`, returns: Array.from({ length: 3000 }, () => 0.01 * normalDraw(random)) }));
    const pos = indep.map((x) => ({ key: x.key, valueUsd: 1000 }));
    const diversified = analyzePortfolio({ positions: pos, returns: indep, barMs: BAR });
    if (diversified.risk.status !== "ok") throw new Error("expected risk");
    expect(diversified.risk.diversificationRatio!).toBeGreaterThan(1.8);
    const one = Array.from({ length: 3000 }, () => 0.01 * normalDraw(random));
    const twins = [{ key: "X", returns: one }, { key: "Y", returns: one }];
    const same = analyzePortfolio({ positions: [{ key: "X", valueUsd: 1 }, { key: "Y", valueUsd: 1 }], returns: twins, barMs: BAR });
    if (same.risk.status !== "ok") throw new Error("expected risk");
    expect(same.risk.diversificationRatio!).toBeGreaterThanOrEqual(1);
    expect(same.risk.diversificationRatio!).toBeLessThan(1.02);
  });

  test("fat tailed returns make the historical expected shortfall exceed the normal one", () => {
    const factor = studentDraws(5, 4000, 3, 0.01);
    const own = [studentDraws(6, 4000, 3, 0.01), studentDraws(7, 4000, 3, 0.01)];
    const series = own.map((o, i) => ({ key: `T${i}`, returns: o.map((x, t) => 0.7 * (factor[t] as number) + 0.7 * x) }));
    const a = analyzePortfolio({ positions: series.map((s) => ({ key: s.key, valueUsd: 500 })), returns: series, barMs: BAR, horizonBars: 1 });
    if (a.risk.status !== "ok") throw new Error("expected risk");
    expect(a.risk.historical.es99).not.toBeNull();
    expect(a.risk.tailRatioEs99!).toBeGreaterThan(1.05);
  });

  test("the horizon uses overlapping sums of the portfolio return", () => {
    const random = mulberry32(4);
    const series = [{ key: "Z", returns: Array.from({ length: 1500 }, () => 0.002 * normalDraw(random)) }];
    const a = analyzePortfolio({ positions: [{ key: "Z", valueUsd: 10 }], returns: series, barMs: BAR, horizonBars: 24 });
    if (a.risk.status !== "ok") throw new Error("expected risk");
    near(a.risk.normal.var95, 1.6448536269514726 * a.risk.sigmaBar * Math.sqrt(24), 10);
    expect(a.risk.historical.var95!).toBeGreaterThan(0);
    expect(a.risk.horizonBars).toBe(24);
  });

  test("historical VaR and ES over a horizon use overlapping window sums, matching an independent computation", () => {
    // 400 returns from a fixed LCG (scratchpad gaps.py), horizon 5: 396 overlapping sums
    let state = 777n;
    const r = Array.from({ length: 400 }, () => {
      state = (1103515245n * state + 12345n) % 2147483648n;
      return Math.round(((Number(state) / 2147483648 - 0.5) * 0.02) * 1e6) / 1e6;
    });
    expect(r.slice(0, 4)).toEqual([-0.004548, -0.006971, -0.004274, 0.001268]);
    const a = analyzePortfolio({ positions: [{ key: "Z", valueUsd: 1 }], returns: [{ key: "Z", returns: r }], barMs: BAR, horizonBars: 5 });
    if (a.risk.status !== "ok") throw new Error("expected risk");
    expect(a.risk.historical.var95!).toBeCloseTo(0.02186125, 9);
    expect(a.risk.historical.es95!).toBeCloseTo(0.02733945, 9);
    expect(a.risk.historical.var99!).toBeCloseTo(0.0307373, 9);
    expect(a.risk.historical.es99!).toBeCloseTo(0.0317595, 9);
  });

  test("when two lengths tie, the longer series defines the grid and the shorter ones are excluded", () => {
    const random = mulberry32(14);
    const make = (n: number) => Array.from({ length: n }, () => 0.01 * normalDraw(random));
    const returnsOf = [{ key: "A", returns: make(40) }, { key: "B", returns: make(40) }, { key: "C", returns: make(30) }, { key: "D", returns: make(30) }];
    const a = analyzePortfolio({ positions: ["A", "B", "C", "D"].map((key) => ({ key, valueUsd: 100 })), returns: returnsOf, barMs: BAR, minObservations: 10 });
    if (a.risk.status !== "ok") throw new Error("expected risk");
    expect(a.risk.observations).toBe(40);
    expect(a.risk.excluded).toEqual([{ key: "C", reason: "returns_length_mismatch" }, { key: "D", reason: "returns_length_mismatch" }]);
  });

  test("the drawdown is measured from the starting value, so a series that only falls has a drawdown from bar one", () => {
    const falling = [{ key: "Z", returns: new Array(20).fill(-0.01) }];
    const a = analyzePortfolio({ positions: [{ key: "Z", valueUsd: 1 }], returns: falling, barMs: BAR, minObservations: 10 });
    if (a.risk.status !== "ok") throw new Error("expected risk");
    expect(a.risk.maxDrawdown).toBeCloseTo(1 - Math.exp(-0.2), 12);
  });

  test("deterministic and does not mutate its input", () => {
    const frozen = Object.freeze({ ...base, positions: Object.freeze(positions.map((p) => Object.freeze({ ...p }))), returns: Object.freeze(returns.map((r) => Object.freeze({ key: r.key, returns: Object.freeze([...r.returns]) }))) });
    expect(JSON.stringify(analyzePortfolio(frozen))).toBe(JSON.stringify(analyzePortfolio(frozen)));
  });

  test("argument errors", () => {
    expect(() => analyzePortfolio({ ...base, barMs: 0 })).toThrow("bar_invalid");
    expect(() => analyzePortfolio({ ...base, horizonBars: 0 })).toThrow("option_invalid");
    expect(() => analyzePortfolio({ ...base, minObservations: 1 })).toThrow("option_invalid");
  });
});

describe("scenarioLoss", () => {
  test("loss of a stated shock on the valued weights, naming what was not shocked", () => {
    const r = scenarioLoss([{ key: "A", valueUsd: 6000 }, { key: "B", valueUsd: 3000 }, { key: "C", valueUsd: 1000 }, { key: "D", valueUsd: null }], { A: -0.2, B: -0.1 });
    near(r.lossFraction as number, 0.15);
    near(r.lossUsd as number, 1500);
    expect(r.unshocked).toEqual(["C"]);
    expect(r.excluded).toEqual([{ key: "D", reason: "value_unknown" }]);
  });
  test("no valued position gives null", () => {
    expect(scenarioLoss([], { A: -0.2 })).toEqual({ lossFraction: null, lossUsd: null, unshocked: [], excluded: [] });
  });
  test("a shock must be a finite fraction above -1", () => {
    expect(() => scenarioLoss([{ key: "A", valueUsd: 1 }], { A: -1.5 })).toThrow("shock_invalid");
    expect(() => scenarioLoss([{ key: "A", valueUsd: 1 }], { A: Number.NaN })).toThrow("shock_invalid");
  });
});
