import { describe, expect, test } from "bun:test";
import { deriveLimits, kellyLowerBound, medianWealthNoEdge, touchLiquidationProbability } from "../policy/envelope.ts";
import { describePolicy, holdPolicy } from "./policies.ts";
import { Rng } from "./rng.ts";
import {
  CRITERION_IDS,
  assignHolm,
  bootstrapLeverage,
  brierScore,
  buildPairedReport,
  buildPolicyReport,
  calibrationReport,
  daysToDetectSharpe,
  defaultLag,
  holmAdjust,
  meanReport,
  meanTest,
  movingBlockResample,
  neweyWestLrv,
  percentile,
  portfolioDaily,
  promotionGate,
  sharpeAnnualized,
  studentTCdf,
  studentTQuantile,
  trancheEquity,
  wilsonInterval,
  type PolicyInputs,
  type StatsContext,
} from "./stats.ts";
import { DAY_MS, HOUR_MS, LEVERAGES, YEAR_DAYS, type EpochResult, type GateInput, type Leverage, type LabModality, type PairedReport, type PolicyReport } from "./types.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md sections 6 to 8. Titles start with the acceptance id (LB13, LB14, LB18 to LB21).
// Everything is synthetic arithmetic.

const BANNED = new RegExp(`[${[0xb7, 0x2013, 0x2014, 0x2212, 0x2022, 0x2219, 0x22c5, 0x2027, 0x30fb].map((c) => String.fromCharCode(c)).join("")}]`);

describe("LB18 Student t distribution", () => {
  test("LB18 the cdf matches textbook values and the Cauchy closed form", () => {
    expect(studentTCdf(0, 7)).toBeCloseTo(0.5, 12);
    expect(studentTCdf(1, 1)).toBeCloseTo(0.75, 10);
    expect(studentTCdf(2.228, 10)).toBeCloseTo(0.975, 3);
    expect(studentTCdf(2.042, 30)).toBeCloseTo(0.975, 3);
    expect(studentTCdf(2.015, 5)).toBeCloseTo(0.95, 3);
    expect(studentTCdf(1.96, 100000)).toBeCloseTo(0.975, 3);
  });

  test("LB18 the cdf is symmetric, monotone and between 0 and 1", () => {
    for (const df of [1, 2, 5, 29, 200]) {
      let previous = 0;
      for (let t = -8; t <= 8; t += 0.25) {
        const value = studentTCdf(t, df);
        expect(value).toBeGreaterThanOrEqual(previous);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        expect(value + studentTCdf(-t, df)).toBeCloseTo(1, 10);
        previous = value;
      }
    }
  });

  test("LB18 the 97.5% quantile matches the tables", () => {
    expect(studentTQuantile(0.975, 1)).toBeCloseTo(12.7062, 3);
    expect(studentTQuantile(0.975, 5)).toBeCloseTo(2.5706, 3);
    expect(studentTQuantile(0.975, 10)).toBeCloseTo(2.2281, 3);
    expect(studentTQuantile(0.975, 30)).toBeCloseTo(2.0423, 3);
    expect(studentTQuantile(0.975, 1000)).toBeCloseTo(1.9623, 3);
    expect(studentTQuantile(0.5, 9)).toBeCloseTo(0, 10);
  });

  test("LB18 invalid arguments are refused", () => {
    for (const df of [0, -1, Number.NaN]) expect(() => studentTCdf(1, df)).toThrow(RangeError);
    expect(() => studentTQuantile(1, 5)).toThrow(RangeError);
    expect(() => studentTQuantile(0, 5)).toThrow(RangeError);
  });
});

describe("LB18 Newey-West", () => {
  test("LB18 the lag rule: max(3K, floor(4 (n/100)^(2/9))) capped at n - 2", () => {
    expect(defaultLag(400, 1)).toBe(5);
    expect(defaultLag(400, 4)).toBe(12);
    expect(defaultLag(400, 8)).toBe(24);
    expect(defaultLag(100, 1)).toBe(4);
    expect(defaultLag(1000, 1)).toBe(Math.floor(4 * (10 ** (2 / 9))));
    expect(defaultLag(10, 8)).toBe(8);
    expect(defaultLag(5, 1)).toBe(3);
  });

  test("LB18 the estimator equals a direct double-sum implementation of the formula (with and without the small sample inflation)", () => {
    const rng = new Rng(4, "nw");
    const xs = Array.from({ length: 60 }, (_, i) => rng.normal() + 0.3 * Math.sin(i / 3));
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    for (const lag of [0, 1, 4, 9]) {
      let expected = 0;
      for (let i = 0; i < n; i += 1) {
        for (let k = 0; k < n; k += 1) {
          const distance = Math.abs(i - k);
          if (distance > lag) continue;
          expected += (1 - distance / (lag + 1)) * ((xs[i] as number) - mean) * ((xs[k] as number) - mean);
        }
      }
      expected /= n;
      expect(neweyWestLrv(xs, lag, false)).toBeCloseTo(expected, 10);
      expect(neweyWestLrv(xs, lag)).toBeCloseTo((expected * n) / (n - lag), 10);
    }
  });

  test("LB18 for independent data the long-run variance is about the variance; for K overlapping sums it is about K times larger", () => {
    const rng = new Rng(8, "overlap");
    const n = 3000;
    const increments = Array.from({ length: n + 7 }, () => rng.normal());
    const iid = increments.slice(0, n);
    const lrvIid = neweyWestLrv(iid, defaultLag(n, 1));
    expect(lrvIid / 1).toBeGreaterThan(0.85);
    expect(lrvIid).toBeLessThan(1.15);
    for (const K of [4, 8]) {
      const sums = Array.from({ length: n }, (_, e) => increments.slice(e, e + K).reduce((a, b) => a + b, 0));
      const gamma0 = sums.reduce((a, b) => a + b * b, 0) / n;
      const lrv = neweyWestLrv(sums, defaultLag(n, K));
      // true values: gamma0 = K and long-run variance = K^2
      expect(Math.abs(gamma0 / K - 1)).toBeLessThan(0.15);
      expect(lrv / (K * K)).toBeGreaterThan(0.75);
      expect(lrv / (K * K)).toBeLessThan(1.15);
    }
  });

  test("LB18 meanTest on a small hand-made series: mean, sd, df, p and interval follow the documented formulas", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const test = meanTest(xs, 1);
    expect(test.n).toBe(10);
    expect(test.mean).toBeCloseTo(5.5, 12);
    expect(test.sd).toBeCloseTo(Math.sqrt(82.5 / 9), 12);
    expect(test.lag).toBe(defaultLag(10, 1));
    expect(test.lrv).toBeCloseTo(neweyWestLrv(xs, test.lag as number), 12);
    expect(test.se).toBeCloseTo(Math.sqrt((test.lrv as number) / 10), 12);
    expect(test.t).toBeCloseTo(5.5 / (test.se as number), 10);
    expect(test.df).toBe(Math.max(1, Math.floor(10 / ((test.lag as number) + 1)) - 1));
    expect(test.effectiveSamples).toBe(Math.floor(10 / ((test.lag as number) + 1)));
    expect(test.pOneSided).toBeCloseTo(1 - studentTCdf(test.t as number, test.df as number), 12);
    const half = studentTQuantile(0.975, test.df as number) * (test.se as number);
    expect(test.ci95?.[0]).toBeCloseTo(5.5 - half, 10);
    expect(test.ci95?.[1]).toBeCloseTo(5.5 + half, 10);
  });

  test("LB18 a degenerate or tiny sample gives null inference, never zero or infinity", () => {
    const constant = meanTest(new Array(50).fill(0), 4);
    expect(constant).toMatchObject({ n: 50, mean: 0, sd: 0, lrv: null, se: null, t: null, df: null, pOneSided: null, ci95: null });
    const tiny = meanTest([1, 2, 3], 1);
    expect(tiny.t).toBeNull();
    expect(tiny.pOneSided).toBeNull();
    expect(tiny.mean).toBe(2);
    const empty = meanTest([], 1);
    expect(empty).toMatchObject({ n: 0, t: null, ci95: null });
    expect(Number.isNaN(empty.mean)).toBe(false);
    expect(() => meanTest([1, Number.NaN, 3, 4, 5, 6, 7, 8, 9, 10], 1)).toThrow(RangeError);
  });

  test("LB18 the report form is in basis points, rounded, and survives JSON", () => {
    const report = meanReport(meanTest([0.001, 0.002, -0.001, 0.003, 0.002, 0.001, 0.0, 0.002, 0.004, -0.002, 0.001, 0.003], 1));
    expect(report.meanBps).toBeCloseTo(13.3333, 3);
    expect(report.sdBps).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    const degenerate = meanReport(meanTest(new Array(20).fill(0), 1));
    expect(degenerate).toMatchObject({ n: 20, meanBps: 0, sdBps: 0, t: null, ci95Bps: null, seBps: null, pOneSided: null });
  });
});

describe("LB19 size and power of the mean test under overlapping horizons", () => {
  /** Overlapping sums of K independent standard normals, shifted by a known mean. */
  function overlappingSeries(rng: Rng, n: number, K: number, mean: number): number[] {
    const z = Array.from({ length: n + K - 1 }, () => rng.normal());
    return Array.from({ length: n }, (_, e) => {
      let sum = 0;
      for (let j = 0; j < K; j += 1) sum += z[e + j] as number;
      return sum + mean;
    });
  }

  for (const K of [1, 4, 8]) {
    test(`LB19 with no edge and K=${K} the one-sided test at 5% rejects about 5% of 1500 null samples, and t >= 2 about 2% to 3%`, () => {
      const rng = new Rng(2026, `size:${K}`);
      let rejections = 0;
      let twoRule = 0;
      const reps = 1500;
      for (let rep = 0; rep < reps; rep += 1) {
        const result = meanTest(overlappingSeries(rng, 400, K, 0), K);
        if ((result.pOneSided as number) < 0.05) rejections += 1;
        if ((result.t as number) >= 2) twoRule += 1;
      }
      expect(rejections / reps).toBeGreaterThan(0.03);
      expect(rejections / reps).toBeLessThan(0.08);
      expect(twoRule / reps).toBeLessThan(0.055);
    });
  }

  test("LB19 with a real edge of about six standard errors the test finds it in every sample, and the interval brackets the truth", () => {
    const rng = new Rng(77, "power");
    const K = 4;
    const n = 400;
    // long-run variance is K^2 per unit, so the standard error of the mean is K / sqrt(n); edge = 6 standard errors
    const edge = (6 * K) / Math.sqrt(n);
    let found = 0;
    let covered = 0;
    const reps = 300;
    for (let rep = 0; rep < reps; rep += 1) {
      const result = meanTest(overlappingSeries(rng, n, K, edge), K);
      if ((result.t as number) >= 2 && (result.pOneSided as number) < 0.05 && (result.ci95 as [number, number])[0] > 0) found += 1;
      const [lo, hi] = result.ci95 as [number, number];
      if (lo <= edge && edge <= hi) covered += 1;
    }
    expect(found / reps).toBeGreaterThan(0.97);
    expect(covered / reps).toBeGreaterThan(0.9);
    expect(covered / reps).toBeLessThan(0.99);
  });

  test("LB19 ignoring the overlap would be wrong: the naive t of overlapping sums rejects a null far too often", () => {
    const rng = new Rng(5, "naive");
    const reps = 600;
    let naive = 0;
    let robust = 0;
    for (let rep = 0; rep < reps; rep += 1) {
      const xs = overlappingSeries(rng, 400, 8, 0);
      const result = meanTest(xs, 8);
      const naiveT = result.mean / (result.sd / Math.sqrt(xs.length));
      if (naiveT >= 2) naive += 1;
      if ((result.t as number) >= 2) robust += 1;
    }
    expect(naive / reps).toBeGreaterThan(0.15);
    expect(robust / reps).toBeLessThan(0.06);
  });
});

describe("LB20 Holm, Brier, reliability, Sharpe and days needed", () => {
  test("LB20 Holm: sorted step-down adjustment, monotone, capped at one, in the original order", () => {
    expect(holmAdjust([0.01, 0.04, 0.03, 0.005])).toEqual([0.03, 0.06, 0.06, 0.02].map((v) => expect.closeTo(v, 12)));
    expect(holmAdjust([0.02])).toEqual([0.02]);
    expect(holmAdjust([])).toEqual([]);
    expect(holmAdjust([0.4, 0.6])).toEqual([expect.closeTo(0.8, 12), expect.closeTo(0.8, 12)]);
    expect(holmAdjust([0.5, 0.9, 0.8])).toEqual([1, 1, 1]);
    const adjusted = holmAdjust([0.001, 0.002, 0.003, 0.2]);
    expect(adjusted[0]).toBeCloseTo(0.004, 12);
    expect(adjusted[1]).toBeCloseTo(0.006, 12);
    expect(adjusted[2]).toBeCloseTo(0.006, 12);
    expect(adjusted[3]).toBeCloseTo(0.2, 12);
    for (const bad of [[-0.1], [1.1], [Number.NaN]]) expect(() => holmAdjust(bad)).toThrow(RangeError);
  });

  test("LB20 Holm never adjusts below the raw p-value and equals Bonferroni for the smallest", () => {
    const rng = new Rng(3, "holm");
    for (let trial = 0; trial < 50; trial += 1) {
      const ps = Array.from({ length: 6 }, () => rng.next());
      const adjusted = holmAdjust(ps);
      const smallest = ps.indexOf(Math.min(...ps));
      expect(adjusted[smallest]).toBeCloseTo(Math.min(1, ps[smallest]! * ps.length), 12);
      ps.forEach((p, i) => expect(adjusted[i]!).toBeGreaterThanOrEqual(p));
    }
  });

  test("LB20 Brier score of a toy forecast and the constant base rate reference", () => {
    const ps = [0.9, 0.8, 0.2, 0.1];
    const hits = [true, false, false, false];
    expect(brierScore(ps, hits)).toBeCloseTo((0.01 + 0.64 + 0.04 + 0.01) / 4, 12);
    const report = calibrationReport(ps.map((p, i) => ({ p, hit: hits[i] as boolean })));
    expect(report).not.toBeNull();
    expect(report?.n).toBe(4);
    expect(report?.baseRate).toBeCloseTo(0.25, 12);
    expect(report?.brier).toBeCloseTo(0.175, 12);
    expect(report?.brierBaseRate).toBeCloseTo((0.5625 + 3 * 0.0625) / 4, 12);
    expect(report?.skill).toBeCloseTo(1 - 0.175 / 0.1875, 12);
    expect(calibrationReport([])).toBeNull();
  });

  test("LB20 the reliability table has ten bins, puts p = 1 in the last, and reports the observed frequency with a Wilson interval", () => {
    const pairs = [
      { p: 0.9, hit: true },
      { p: 0.8, hit: false },
      { p: 0.2, hit: false },
      { p: 0.1, hit: false },
      { p: 1, hit: true },
      { p: 0, hit: false },
    ];
    const report = calibrationReport(pairs);
    const bins = report?.reliability ?? [];
    expect(bins.length).toBe(10);
    expect(bins.map((b) => b.n)).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 1, 2]);
    expect(bins[0]).toMatchObject({ lower: 0, upper: 0.1, n: 1, meanPredicted: 0, observedFrequency: 0 });
    expect(bins[9]).toMatchObject({ lower: 0.9, upper: 1, n: 2, observedFrequency: 1 });
    expect(bins[9]?.meanPredicted).toBeCloseTo(0.95, 12);
    expect(bins[3]).toEqual({ lower: 0.3, upper: 0.4, n: 0, meanPredicted: null, observedFrequency: null, wilson95: null });
    const [lo, hi] = wilsonInterval(5, 10);
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
    expect(wilsonInterval(0, 10)[0]).toBeCloseTo(0, 12);
    expect(wilsonInterval(10, 10)[1]).toBeCloseTo(1, 12);
    expect(() => wilsonInterval(3, 0)).toThrow(RangeError);
    expect(() => calibrationReport([{ p: 1.5, hit: true }])).toThrow(RangeError);
  });

  test("LB20 days to detect a Sharpe at t = 2 reproduce the R3 table: 5840, 1460, 365, 162, 91 and 58 days", () => {
    expect(daysToDetectSharpe(0.5)).toBeCloseTo(5840, 6);
    expect(daysToDetectSharpe(1)).toBeCloseTo(1460, 6);
    expect(daysToDetectSharpe(2)).toBeCloseTo(365, 6);
    expect(daysToDetectSharpe(3)).toBeCloseTo(162.2222, 3);
    expect(daysToDetectSharpe(4)).toBeCloseTo(91.25, 6);
    expect(daysToDetectSharpe(5)).toBeCloseTo(58.4, 6);
    expect(daysToDetectSharpe(2, 3)).toBeCloseTo(821.25, 6);
    expect(daysToDetectSharpe(0)).toBeNull();
    expect(daysToDetectSharpe(-1)).toBeNull();
    expect(YEAR_DAYS).toBe(365);
  });

  test("LB20 worked example of the spec: 12 bps per decision with 300 bps of deviation, K = 4, step 6 h needs 10000 decisions and about 2500 days", () => {
    const snr = 12 / 300;
    const K = 4;
    const stepsPerYear = 4 * 365;
    // long-run variance of overlapping sums of K independent unit draws is K^2 relative to unit variance: with sd 300 bps it is K * sd^2
    const mean = 12;
    const lrv = K * 300 * 300;
    const sharpe = sharpeAnnualized(mean, lrv, stepsPerYear);
    expect(sharpe).toBeCloseTo((snr / Math.sqrt(K)) * Math.sqrt(1460), 9);
    expect(sharpe).toBeCloseTo(0.7642, 3);
    expect(daysToDetectSharpe(sharpe as number)).toBeCloseTo(2499.8, 0);
    expect(K * (2 / snr) ** 2).toBe(10000);
    expect((10000 * 6) / 24).toBe(2500);
    expect(daysToDetectSharpe(2 * Math.sqrt(365 / 100))).toBeCloseTo(100, 8);
  });

  test("LB20 Sharpe is t * sqrt(steps per year / n) and independent of K, and the daily portfolio statistics are consistent with it", () => {
    const rng = new Rng(12, "sharpe");
    const K = 4;
    const n = 800;
    const xs = Array.from({ length: n + K - 1 }, () => rng.normal() * 0.01 + 0.0004);
    const series = Array.from({ length: n }, (_, e) => xs.slice(e, e + K).reduce((a, b) => a + b, 0));
    const result = meanTest(series, K);
    const stepsPerDay = 4;
    const sharpe = sharpeAnnualized(result.mean, result.lrv as number, stepsPerDay * 365) as number;
    expect(sharpe).toBeCloseTo((result.t as number) * Math.sqrt((stepsPerDay * 365) / n), 9);
    const daily = portfolioDaily(result.mean, result.lrv as number, K, stepsPerDay);
    expect((daily.dailyMean / daily.dailySd) * Math.sqrt(365)).toBeCloseTo(sharpe, 9);
    expect(daily.dailyMean).toBeCloseTo((result.mean / K) * stepsPerDay, 12);
    expect(daily.dailySd).toBeCloseTo(Math.sqrt((result.lrv as number) * stepsPerDay) / K, 12);
    expect(sharpeAnnualized(0.1, 0, 1460)).toBeNull();
  });

  test("LB20 percentile uses the nearest rank on a sorted copy", () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 0.95)).toBe(5);
    expect(percentile([1], 0.99)).toBe(1);
    expect(percentile([1, 2, 3, 4], 0.25)).toBe(1);
    expect(() => percentile([], 0.5)).toThrow(RangeError);
  });
});

describe("LB14 tranche equity and the block bootstrap", () => {
  test("LB14 hand-made path with two concurrent tranches: equity 1.105, minimum 1.0 and drawdown 4.76%", () => {
    const path = trancheEquity([1.1, 0.9, 1.2], 2);
    expect(path.final).toBeCloseTo(1.105, 12);
    expect(path.path.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 1, 1.05, 1, 1.105]);
    expect(path.minEquity).toBeCloseTo(1, 12);
    expect(path.maxDrawdown).toBeCloseTo(0.05 / 1.05, 12);
  });

  test("LB14 with one tranche at a time the equity is the product of the multiples; holds change nothing; a zero multiple wipes the account", () => {
    expect(trancheEquity([1.1, 1, 0.8, 1.05], 1).final).toBeCloseTo(1.1 * 0.8 * 1.05, 12);
    expect(trancheEquity([1, 1, 1], 3).final).toBe(1);
    const wiped = trancheEquity([1.2, 0, 1.3], 1);
    expect(wiped.final).toBe(0);
    expect(wiped.minEquity).toBe(0);
    expect(wiped.maxDrawdown).toBe(1);
    expect(trancheEquity([], 4).final).toBe(1);
  });

  test("LB14 a liquidated tranche costs only its share of the equity: one zero among K = 4 concurrent tranches loses a quarter", () => {
    const path = trancheEquity([0, 1, 1, 1, 1, 1, 1], 4);
    expect(path.final).toBeCloseTo(0.75, 12);
    expect(path.minEquity).toBeCloseTo(0.75, 12);
  });

  test("LB14 invalid inputs are refused", () => {
    expect(() => trancheEquity([1], 0)).toThrow(RangeError);
    expect(() => trancheEquity([Number.NaN], 1)).toThrow(RangeError);
    expect(() => trancheEquity([-0.1], 1)).toThrow(RangeError);
  });

  test("LB14 moving blocks: indices of length n, made of runs of consecutive indices, reproducible from the seed", () => {
    const a = movingBlockResample(50, 5, new Rng(1, "mbb"));
    const b = movingBlockResample(50, 5, new Rng(1, "mbb"));
    expect(a).toEqual(b);
    expect(a.length).toBe(50);
    for (let start = 0; start < 50; start += 5) {
      for (let k = 1; k < 5; k += 1) expect(a[start + k]).toBe((a[start] as number) + k);
    }
    for (const index of a) expect(index >= 0 && index < 50).toBe(true);
    expect(movingBlockResample(50, 5, new Rng(2, "mbb"))).not.toEqual(a);
    expect(movingBlockResample(7, 3, new Rng(1, "x")).length).toBe(7);
    expect(() => movingBlockResample(10, 11, new Rng(1, "x"))).toThrow(RangeError);
  });

  const options = { holdSteps: 1, resamples: 2000, blockLength: 4, seed: 20261011, ruinFraction: 0.5 };

  test("LB14 deterministic: the same seed gives the same summary byte for byte, another seed another one", () => {
    const multiples = Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? 0.97 : 1.02));
    const series = [{ leverage: 1 as Leverage, multiples, liquidated: multiples.map(() => false) }];
    const first = bootstrapLeverage(series, options);
    expect(JSON.stringify(bootstrapLeverage(series, options))).toBe(JSON.stringify(first));
    expect(JSON.stringify(bootstrapLeverage(series, { ...options, seed: 1 }))).not.toBe(JSON.stringify(first));
  });

  test("LB14 a constant multiple has no dispersion: median = p5 = p95 = m^n, nothing liquidates", () => {
    const multiples = new Array<number>(30).fill(1.01);
    const [row] = bootstrapLeverage([{ leverage: 1, multiples, liquidated: multiples.map(() => false) }], options);
    expect(row?.medianFinalEquity).toBeCloseTo(1.01 ** 30, 10);
    expect(row?.p05FinalEquity).toBeCloseTo(1.01 ** 30, 10);
    expect(row?.p95FinalEquity).toBeCloseTo(1.01 ** 30, 10);
    expect(row?.probLiquidation).toBe(0);
    expect(row?.probRuin).toBe(0);
    expect(row).toMatchObject({ resamples: 2000, blockLength: 4, ruinFraction: 0.5 });
  });

  test("LB14 probability of liquidation matches the exact block-coverage probability: 1 - (33/37)^10 for one liquidation among 40 with blocks of 4", () => {
    const n = 40;
    const multiples = new Array<number>(n).fill(1.001);
    const liquidated = new Array<boolean>(n).fill(false);
    multiples[17] = 0;
    liquidated[17] = true;
    const [row] = bootstrapLeverage([{ leverage: 10, multiples, liquidated }], options);
    const expected = 1 - (33 / 37) ** 10;
    expect(Math.abs((row?.probLiquidation as number) - expected)).toBeLessThan(0.04);
    // with one tranche at a time a zero multiple ends the account, so ruin and liquidation coincide
    expect(row?.probRuin).toBe(row?.probLiquidation);
    expect(row?.p05FinalEquity).toBe(0);
    expect(row?.leverage).toBe(10);
  });

  test("LB14 with four concurrent tranches a single liquidation is not ruin (it costs a quarter of the equity)", () => {
    const n = 40;
    const multiples = new Array<number>(n).fill(1);
    const liquidated = new Array<boolean>(n).fill(false);
    multiples[17] = 0;
    liquidated[17] = true;
    const [row] = bootstrapLeverage([{ leverage: 5, multiples, liquidated }], { ...options, holdSteps: 4, blockLength: 4 });
    expect((row?.probLiquidation as number)).toBeGreaterThan(0.3);
    expect(row?.probRuin).toBeLessThan(row?.probLiquidation as number);
    expect(row?.medianFinalEquity).toBeGreaterThan(0.7);
  });

  test("LB14 every leverage level is resampled with the same blocks of epochs", () => {
    const n = 40;
    const base = Array.from({ length: n }, (_, i) => (i === 9 ? -1 : 1) * 0.01);
    const series = LEVERAGES.map((leverage) => ({
      leverage,
      multiples: base.map((r) => Math.max(0, 1 + leverage * r)),
      liquidated: base.map((r) => 1 + leverage * r <= 0),
    }));
    const rows = bootstrapLeverage(series, options);
    expect(rows.map((r) => r.leverage)).toEqual([...LEVERAGES]);
    // more leverage, more dispersion: p95 - p05 grows with L
    const spread = rows.map((r) => r.p95FinalEquity - r.p05FinalEquity);
    for (let i = 1; i < spread.length; i += 1) expect(spread[i] as number).toBeGreaterThan(spread[i - 1] as number);
  });

  test("LB13 without edge the median of the resampled wealth agrees in the log with exp(-0.5 L^2 sigma^2 T) of envelope.ts, averaged over seeds", () => {
    // Continuously rebalanced constant leverage on a driftless GBM: one tranche at a time (K = 1) of 1 day each.
    const sigma = 0.03;
    const days = 40;
    const reps = 60;
    for (const L of [3, 5] as const) {
      let sum = 0;
      for (let rep = 0; rep < reps; rep += 1) {
        const rng = new Rng(9, `wealth:${L}:${rep}`);
        const multiples: number[] = [];
        for (let d = 0; d < days; d += 1) {
          const simple = Math.exp(sigma * rng.normal() - (sigma * sigma) / 2) - 1; // driftless simple return of the day
          multiples.push(Math.max(0, 1 + L * simple));
        }
        sum += Math.log(trancheEquity(multiples, 1).final);
      }
      const meanLog = sum / reps;
      const theory = Math.log(medianWealthNoEdge(L, sigma, days));
      const sd = L * sigma * Math.sqrt(days);
      expect(Math.abs(meanLog - theory)).toBeLessThan(4 * (sd / Math.sqrt(reps)));
      expect(meanLog).toBeLessThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Policy level assembly
// ---------------------------------------------------------------------------

const CTX: StatsContext = {
  stepMs: 6 * HOUR_MS,
  horizonMs: 24 * HOUR_MS,
  maxDecisionMs: 1500,
  bootstrap: { resamples: 500, seed: 20261011, ruinFraction: 0.5 },
  maintenanceMarginRate: 0.0125,
  alpha: 0.05,
};

function multiples(x: number): Record<Leverage, number> {
  return { 1: 1 + x, 2: 1 + 2 * x, 3: 1 + 3 * x, 5: 1 + 5 * x, 10: 1 + 10 * x };
}

function trade(x: number, modality: LabModality = "perp-directional"): EpochResult {
  return { trade: true, modality, returnOnCapital: x, equityMultiple: multiples(x), liquidated: { 1: false, 2: false, 3: false, 5: false, 10: false }, levered: true };
}

const HOLD_RESULT: EpochResult = { trade: false, modality: null, returnOnCapital: 0, equityMultiple: multiples(0), liquidated: { 1: false, 2: false, 3: false, 5: false, 10: false }, levered: false };

function inputsOf(id: string, results: Array<EpochResult | null>, over: Partial<PolicyInputs> = {}): PolicyInputs {
  return {
    descriptor: { id, baseline: id !== "jev", tested: id === "jev" || id === "momentum-rule", passive: false, chooser: null },
    results,
    statuses: { ok: results.length, "invalid-choice": 0, malformed: 0, timeout: 0, error: 0 },
    consulted: 0,
    costUsd: [],
    inputTokens: [],
    latencyMs: [],
    calibrationPairs: [],
    sigmaDailyReference: null,
    ...over,
  };
}
function sparseLrv(values: ReadonlyArray<number | null>, overlap: number): number {
  const observed = values.filter((value): value is number => value !== null);
  const n = observed.length;
  const center = observed.reduce((sum, value) => sum + value, 0) / n;
  const lag = defaultLag(n, overlap);
  let total = 0;
  for (let j = 0; j <= lag; j += 1) {
    let gamma = 0;
    for (let t = j; t < values.length; t += 1) {
      const current = values[t];
      const prior = values[t - j];
      if (current !== null && current !== undefined && prior !== null && prior !== undefined) gamma += (current - center) * (prior - center);
    }
    gamma /= n;
    total += j === 0 ? gamma : 2 * (1 - j / (lag + 1)) * gamma;
  }
  return (total * n) / (n - lag);
}

function sparseT(values: ReadonlyArray<number | null>, overlap: number): number {
  const observed = values.filter((value): value is number => value !== null);
  const mean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
  return mean / Math.sqrt(sparseLrv(values, overlap) / observed.length);
}

test("LB20 sparse HAC oracle preserves original epoch distances", () => {
  const returns = [0.03, -0.01, 0.02, -0.02, 0.03, -0.01, 0.02, -0.02];
  const results: Array<EpochResult | null> = Array.from({ length: returns.length * 2 }, (_, i) =>
    i % 2 === 0 ? trade(returns[i / 2] as number, i % 4 === 0 ? "perp-directional" : "funding-carry") : null,
  );
  const sparse = returns.flatMap((value) => [value, null]);
  const denseReport = buildPolicyReport(inputsOf("dense", returns.map((value) => trade(value))), CTX);
  expect(denseReport.mean).toEqual(meanReport(meanTest(returns, 4)));
  const report = buildPolicyReport(inputsOf("jev", results), CTX);
  expect(report.mean?.n).toBe(returns.length);
  expect(report.mean?.t as number).toBeCloseTo(sparseT(sparse, 4), 8);

  for (const modality of ["perp-directional", "funding-carry"] as const) {
    const entry = report.byModality.find((item) => item.modality === modality);
    const contribution = results.map((result) => (result === null ? null : result.modality === modality ? result.returnOnCapital : 0));
    expect(entry?.mean?.t as number).toBeCloseTo(sparseT(contribution, 4), 8);
  }

  const paired = buildPairedReport(inputsOf("jev", results), inputsOf("hold", new Array<EpochResult>(results.length).fill(HOLD_RESULT)), CTX);
  expect(paired.n).toBe(returns.length);
  expect(paired.mean?.t).toBeCloseTo(sparseT(sparse, 4), 8);
});

describe("LB14 policy statistics", () => {
  const rng = new Rng(31, "policy");
  const results: Array<EpochResult | null> = Array.from({ length: 200 }, (_, i) => {
    if (i % 5 === 0) return HOLD_RESULT;
    if (i === 7) return null;
    return trade((rng.normal() * 0.01 + 0.0006), i % 2 === 0 ? "perp-directional" : "funding-carry");
  });
  const inputs = inputsOf("jev", results, { sigmaDailyReference: 0.03 });
  const report = buildPolicyReport(inputs, CTX);

  test("LB14 counts: usable epochs, incomplete decisions, trades and holds", () => {
    const usable = results.filter((r) => r !== null) as EpochResult[];
    expect(report.epochs).toBe(200);
    expect(report.usableEpochs).toBe(usable.length);
    expect(report.incompleteDecisions).toBe(1);
    expect(report.trades).toBe(usable.filter((r) => r.trade).length);
    expect(report.holds).toBe(usable.filter((r) => !r.trade).length);
    expect(report.tradeRate).toBeCloseTo(report.trades / usable.length, 12);
    expect(report.tradesPerDay).toBeCloseTo((report.trades / usable.length) * 4, 12);
    expect(report.statuses.ok).toBe(200);
  });

  test("LB14 mean inference excludes incomplete epochs without changing their temporal distance", () => {
    const usable = results.filter((r) => r !== null) as EpochResult[];
    const raw = meanTest(usable.map((r) => r.returnOnCapital), 4);
    expect(report.mean?.n).toBe(raw.n);
    expect(report.mean?.meanBps).toBeCloseTo(raw.mean * 1e4, 6);
    expect(report.mean?.sdBps).toBeCloseTo(raw.sd * 1e4, 6);
    expect(report.mean?.lag).toBe(raw.lag);
    expect(report.mean?.t as number).toBeCloseTo(sparseT(results.map((r) => r?.returnOnCapital ?? null), 4), 8);
    const trades = usable.filter((r) => r.trade);
    expect(report.hitRate).toBeCloseTo(trades.filter((r) => r.returnOnCapital > 0).length / trades.length, 12);
  });

  test("LB20 Sharpe uses long-run variance with original epoch gaps", () => {
    const usable = results.filter((r) => r !== null) as EpochResult[];
    const mean = meanTest(usable.map((r) => r.returnOnCapital), 4).mean;
    const lrv = sparseLrv(results.map((r) => r?.returnOnCapital ?? null), 4);
    const expected = sharpeAnnualized(mean, lrv, 4 * 365);
    expect(report.sharpe.annualized).toBeCloseTo(expected as number, 9);
    if ((expected as number) > 0) expect(report.sharpe.daysToDetect).toBeCloseTo(daysToDetectSharpe(expected as number) as number, 6);
    expect(report.sharpe.caveat).toContain("não");
    expect(report.sharpe.caveat).not.toMatch(BANNED);
  });

  test("LB21 the Kelly lower bound and the phase 2 cap come from envelope.ts applied to the tranche portfolio", () => {
    const usable = results.filter((r) => r !== null) as EpochResult[];
    const mean = meanTest(usable.map((r) => r.returnOnCapital), 4).mean;
    const lrv = sparseLrv(results.map((r) => r?.returnOnCapital ?? null), 4);
    const daily = portfolioDaily(mean, lrv, 4, 4);
    expect(report.portfolio.dailyMean).toBeCloseTo(daily.dailyMean, 12);
    expect(report.portfolio.dailySd).toBeCloseTo(daily.dailySd, 12);
    const spanDays = (200 * CTX.stepMs) / DAY_MS;
    const bound = kellyLowerBound(daily.dailyMean, daily.dailySd, spanDays);
    expect(report.portfolio.kellyLowerBound).toBeCloseTo(bound, 12);
    const cap = deriveLimits({ capitalUsd: 1, sigmaDaily: daily.dailySd, phase: "fase-2", kellyLowerBound: bound }).leverageCap;
    expect(report.portfolio.leverageCapPhase2).toBe(cap);
  });

  test("LB14 the leverage block has one row per level; the 1x row is the unlevered curve and risk grows with L", () => {
    expect(report.leverage.map((row) => row.leverage)).toEqual([...LEVERAGES]);
    const series = (results.filter((r) => r !== null) as EpochResult[]).map((r) => r.equityMultiple[1]);
    const curve = trancheEquity(series, 4);
    expect(report.leverage[0]?.observed).toMatchObject({ finalEquity: curve.final, maxDrawdown: curve.maxDrawdown, minEquity: curve.minEquity, liquidations: 0 });
    expect(report.maxDrawdown).toBeCloseTo(curve.maxDrawdown, 12);
    expect(report.leverage[4]?.observed?.maxDrawdown as number).toBeGreaterThan(report.leverage[0]?.observed?.maxDrawdown as number);
    for (const row of report.leverage) {
      expect(row.applicableShare).toBe(1);
      expect(row.bootstrap?.resamples).toBe(500);
      expect(row.bootstrap?.blockLength).toBe(12);
    }
  });

  test("LB13 the closed-form reference at the realized volatility is the one of envelope.ts", () => {
    const days = (200 * CTX.stepMs) / DAY_MS;
    for (const row of report.leverage) {
      expect(row.reference).toEqual({
        sigmaDaily: 0.03,
        medianWealthNoEdge: medianWealthNoEdge(row.leverage, 0.03, days),
        touchLiquidationProbability: touchLiquidationProbability(row.leverage, 0.03, CTX.horizonMs / DAY_MS, 0.0125),
      });
    }
    const noSigma = buildPolicyReport(inputsOf("jev", results, { sigmaDailyReference: null }), CTX);
    for (const row of noSigma.leverage) expect(row.reference).toBeNull();
  });

  test("LB14 by modality: counts and contribution inference preserve gaps", () => {
    expect(report.byModality.map((m) => m.modality).sort()).toEqual(["funding-carry", "perp-directional"]);
    const usable = results.filter((r) => r !== null) as EpochResult[];
    for (const entry of report.byModality) {
      expect(entry.trades).toBe(usable.filter((r) => r.modality === entry.modality).length);
      const contribution = results.map((r) => (r === null ? null : r.modality === entry.modality ? r.returnOnCapital : 0));
      const dense = meanTest(contribution.filter((value): value is number => value !== null), 4);
      expect(entry.mean?.n).toBe(dense.n);
      expect(entry.mean?.meanBps).toBeCloseTo(dense.mean * 1e4, 6);
      expect(entry.mean?.t).toBeCloseTo(sparseT(contribution, 4), 8);
    }
  });

  test("LB14 a policy that only holds has no inference and an unchanged account, and no bootstrap", () => {
    const holdReport = buildPolicyReport(inputsOf("hold", new Array<EpochResult>(60).fill(HOLD_RESULT)), CTX);
    expect(holdReport.mean).toMatchObject({ n: 60, meanBps: 0, t: null, pOneSided: null, ci95Bps: null });
    expect(holdReport.trades).toBe(0);
    expect(holdReport.hitRate).toBeNull();
    expect(holdReport.sharpe).toMatchObject({ annualized: null, daysToDetect: null });
    expect(holdReport.portfolio).toEqual({ dailyMean: null, dailySd: null, kellyLowerBound: null, leverageCapPhase2: null });
    for (const row of holdReport.leverage) {
      expect(row.applicableShare).toBeNull();
      expect(row.observed).toMatchObject({ finalEquity: 1, maxDrawdown: 0, liquidations: 0, liquidationRate: null });
      expect(row.bootstrap).toBeNull();
    }
    expect(holdReport.byModality).toEqual([]);
  });

  test("LB16 inference: known cost needs every consulted decision priced; latency percentiles and the share above the 1500 ms limit", () => {
    const base = results.slice(0, 10);
    const known = buildPolicyReport(
      inputsOf("jev", base, { consulted: 10, costUsd: new Array(10).fill(0.0001), inputTokens: new Array(10).fill(2000), latencyMs: [100, 200, 300, 400, 500, 600, 700, 800, 900, 2000] }),
      CTX,
    );
    expect(known.inference).toMatchObject({ costKnown: true, consulted: 10, inputTokensTotal: 20000 });
    expect(known.inference.costUsdTotal).toBeCloseTo(0.001, 12);
    expect(known.inference.latencyMs).toEqual({ p50: 500, p95: 2000, p99: 2000 });
    expect(known.inference.shareAboveMaxDecision).toBeCloseTo(0.1, 12);
    const unknown = buildPolicyReport(inputsOf("jev", base, { consulted: 10, costUsd: [0.0001, ...new Array(9).fill(null)], inputTokens: new Array(10).fill(null), latencyMs: new Array(10).fill(0) }), CTX);
    expect(unknown.inference.costKnown).toBe(false);
    expect(unknown.inference.costUsdTotal).toBeNull();
    expect(unknown.inference.inputTokensTotal).toBeNull();
    const rule = buildPolicyReport(inputsOf("momentum-rule", base), CTX);
    expect(rule.inference).toMatchObject({ costKnown: true, consulted: 0, costUsdTotal: 0, inputTokensTotal: 0, latencyMs: null, shareAboveMaxDecision: null });
  });

  test("LB16 calibration appears only when the policy supplies probabilities", () => {
    expect(report.calibration).toBeNull();
    const withPairs = buildPolicyReport(inputsOf("jev", results, { calibrationPairs: [{ p: 0.7, hit: true }, { p: 0.7, hit: false }, { p: 0.3, hit: false }] }), CTX);
    expect(withPairs.calibration?.n).toBe(3);
    expect(withPairs.calibration?.reliability.length).toBe(10);
  });

  test("LB14 an unleveraged trade (spot) keeps the 1x curve at every level and lowers the applicable share", () => {
    const spot: EpochResult = { ...trade(0.01, "spot-momentum"), levered: false, equityMultiple: multiples(0.01), liquidated: { 1: false, 2: false, 3: false, 5: false, 10: false } };
    for (const level of LEVERAGES) spot.equityMultiple[level] = 1.01;
    const mixed = buildPolicyReport(inputsOf("jev", [spot, trade(0.02), spot, trade(-0.01), ...new Array(20).fill(HOLD_RESULT)]), CTX);
    expect(mixed.leverage[0]?.applicableShare).toBeCloseTo(0.5, 12);
    const pureSpot = buildPolicyReport(inputsOf("buy-and-hold", new Array(30).fill(spot)), CTX);
    for (const row of pureSpot.leverage) expect(row.applicableShare).toBe(0);
  });

  test("LB14 the report survives a JSON round trip and carries no NaN", () => {
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
  });
});

describe("LB20 paired comparison and Holm family", () => {
  test("LB20 the paired series uses only epochs usable for both, and the difference test is the Newey-West test of the difference", () => {
    const a: Array<EpochResult | null> = [];
    const b: Array<EpochResult | null> = [];
    const rng = new Rng(1, "paired");
    for (let i = 0; i < 240; i += 1) {
      const common = rng.normal() * 0.01;
      a.push(i === 3 ? null : trade(common + 0.002 + rng.normal() * 0.002));
      b.push(i === 9 ? null : trade(common + rng.normal() * 0.002));
    }
    const paired = buildPairedReport(inputsOf("jev", a), inputsOf("random", b), CTX);
    expect(paired).toMatchObject({ policy: "jev", baseline: "random", n: 238 });
    const diff: Array<number | null> = [];
    for (let i = 0; i < 240; i += 1) diff.push(a[i] !== null && b[i] !== null ? (a[i] as EpochResult).returnOnCapital - (b[i] as EpochResult).returnOnCapital : null);
    const usableDiff = diff.filter((value): value is number => value !== null);
    const dense = meanTest(usableDiff, 4);
    expect(paired.mean?.n).toBe(dense.n);
    expect(paired.mean?.meanBps).toBeCloseTo(dense.mean * 1e4, 6);
    expect(paired.mean?.t).toBeCloseTo(sparseT(diff, 4), 8);
    expect(paired.significantlyBetter).toBe(true);
    const flipped = buildPairedReport(inputsOf("random", b), inputsOf("jev", a), CTX);
    expect(flipped.significantlyBetter).toBe(false);
    expect(flipped.mean?.meanBps).toBeCloseTo(-(paired.mean?.meanBps as number), 5);
  });

  test("LB20 against a policy that holds, the paired test is the test of the policy itself", () => {
    const rng = new Rng(2, "vs-hold");
    const strategy = Array.from({ length: 200 }, () => trade(rng.normal() * 0.01 + 0.001));
    const paired = buildPairedReport(inputsOf("jev", strategy), inputsOf("hold", new Array<EpochResult>(200).fill(HOLD_RESULT)), CTX);
    const own = meanTest(strategy.map((r) => r.returnOnCapital), 4);
    expect(paired.mean?.meanBps).toBeCloseTo(own.mean * 1e4, 5);
    expect(paired.mean?.t).toBeCloseTo(own.t as number, 8);
  });

  test("LB20 too few shared epochs give an undetermined comparison, never a verdict", () => {
    const paired = buildPairedReport(inputsOf("jev", [trade(0.01), trade(0.02)]), inputsOf("random", [trade(0), trade(0)]), CTX);
    expect(paired.significantlyBetter).toBeNull();
    expect(paired.mean?.t).toBeNull();
  });

  test("LB20 Holm family: every policy with a defined test, plus each modality with at least 30 trades; hold is not in it", () => {
    const rng = new Rng(6, "family");
    const make = (id: string, mean: number): PolicyReport => buildPolicyReport(inputsOf(id, Array.from({ length: 300 }, (_, i) => (i % 4 === 0 ? HOLD_RESULT : trade(rng.normal() * 0.01 + mean, i % 2 === 0 ? "perp-directional" : "funding-carry")))), CTX);
    const policies = [make("hold", 0), make("random", -0.0005), make("jev", 0.004)];
    policies[0] = buildPolicyReport(inputsOf("hold", new Array<EpochResult>(300).fill(HOLD_RESULT)), CTX);
    const family = assignHolm(policies, CTX.alpha, 30);
    expect(family.method).toBe("holm");
    expect(family.alpha).toBe(0.05);
    expect(family.family.some((entry) => entry.policy === "hold")).toBe(false);
    expect(family.family.filter((entry) => entry.modality === null).map((entry) => entry.policy).sort()).toEqual(["jev", "random"]);
    expect(family.family.filter((entry) => entry.modality !== null).length).toBe(4);
    for (const entry of family.family) {
      expect(entry.adjustedP).toBeGreaterThanOrEqual(entry.p as number);
      expect(entry.rejected).toBe((entry.adjustedP as number) < 0.05);
    }
    const jev = policies.find((p) => p.id === "jev") as PolicyReport;
    expect(jev.adjustedP).toBe(family.family.find((entry) => entry.policy === "jev" && entry.modality === null)?.adjustedP as number);
    expect(policies[0]?.adjustedP).toBeNull();
    expect(jev.adjustedP as number).toBeLessThan(0.05);
    const random = policies.find((p) => p.id === "random") as PolicyReport;
    expect(random.adjustedP as number).toBeGreaterThan(0.5);
    const adjusted = holmAdjust(family.family.map((entry) => entry.p as number));
    family.family.forEach((entry, i) => expect(entry.adjustedP).toBeCloseTo(adjusted[i] as number, 12));
  });

  test("LB20 modalities with fewer trades than the minimum are reported but not tested", () => {
    const few = buildPolicyReport(inputsOf("jev", [...Array.from({ length: 100 }, () => trade(0.001)), ...Array.from({ length: 10 }, () => trade(0.002, "funding-carry"))]), CTX);
    const family = assignHolm([few], CTX.alpha, 30);
    expect(family.family.some((entry) => entry.modality === "funding-carry")).toBe(false);
    expect(few.byModality.map((m) => m.modality).sort()).toEqual(["funding-carry", "perp-directional"]);
  });
});

// ---------------------------------------------------------------------------
// Promotion gate
// ---------------------------------------------------------------------------

function strongPolicy(): PolicyReport {
  const rng = new Rng(404, "gate");
  const results = Array.from({ length: 1500 }, () => trade(rng.normal() * 0.004 + 0.0035));
  const report = buildPolicyReport(
    inputsOf("jev", results, { consulted: 1500, costUsd: new Array(1500).fill(0.0001), inputTokens: new Array(1500).fill(2000), latencyMs: new Array(1500).fill(900) }),
    CTX,
  );
  report.adjustedP = 0.001;
  return report;
}

function pairedOf(policy: string, baseline: string, better: boolean | null): PairedReport {
  return {
    policy,
    baseline,
    n: 1500,
    mean: better === null ? null : { n: 1500, meanBps: 20, sdBps: 50, lag: 12, effectiveSamples: 115, seBps: 3, t: better ? 6 : 0.4, df: 114, pOneSided: better ? 0 : 0.3, ci95Bps: better ? [14, 26] : [-5, 6] },
    significantlyBetter: better,
  };
}

function gateInput(over: Partial<GateInput> = {}): GateInput {
  return {
    mode: "replay",
    run: { epochs: 1500, pendingEpochs: 0, firstEpochMs: 1_800_000_000_000, lastEpochMs: 1_800_000_000_000 + 1499 * CTX.stepMs, spanDays: 375, stepMs: CTX.stepMs, horizonMs: CTX.horizonMs, overlap: 4, seed: null, plantedEdgeBps: null, frozenAtMs: null, completeness: 1 },
    policies: [strongPolicy()],
    paired: ["hold", "random", "buy-and-hold", "momentum-rule", "carry-rule"].map((b) => pairedOf("jev", b, true)),
    multipleTesting: { method: "holm", alpha: 0.05, family: [] },
    ...over,
  };
}

function ids(list: ReadonlyArray<{ id: string }>): string[] {
  return list.map((c) => c.id);
}

describe("LB21 promotion gate", () => {
  test("LB21 the criteria ids are the documented ones, in order", () => {
    expect([...CRITERION_IDS]).toEqual([
      "dados-reais",
      "dias-minimos",
      "amostra-efetiva",
      "resultados-completos",
      "custo-de-inferencia",
      "t-newey-west",
      "limite-inferior-positivo",
      "correcao-holm",
      "contra-baselines",
      "kelly-alavancagem",
      "janela-fora-da-amostra",
      "fills-reais-conciliados",
      "autorizacao-e-assinante",
    ]);
  });

  test("LB21 it can only recommend fase-0 and grants nothing, whatever the evidence", () => {
    for (const input of [gateInput(), gateInput({ mode: "synthetic" }), gateInput({ policies: [] })]) {
      const gate = promotionGate(input);
      expect(gate.recommendedPhase).toBe("fase-0");
      expect(gate.grantsPermission).toBe(false);
      expect(gate.recommendation.startsWith("Recomendação: permanecer na fase-0")).toBe(true);
      expect(gate.recommendation).not.toMatch(/fase-1|fase-2.*(autoriz|libera|pode)/i);
      expect(gate.recommendation).not.toMatch(BANNED);
      expect(gate.recommendation).toContain("Nada aqui prova lucro");
      const all = [...gate.passed, ...gate.failed, ...gate.unknown];
      expect(new Set(ids(all)).size).toBe(all.length);
      for (const criterion of all) {
        expect(criterion.description).not.toMatch(BANNED);
        expect(criterion.requirement).not.toMatch(BANNED);
      }
    }
  });

  test("LB21 strong real-data evidence passes every statistical criterion and still leaves the structural ones unknown", () => {
    const gate = promotionGate(gateInput());
    expect(ids(gate.passed)).toEqual(["dias-minimos", "amostra-efetiva", "resultados-completos", "custo-de-inferencia", "t-newey-west", "limite-inferior-positivo", "correcao-holm", "contra-baselines", "kelly-alavancagem"]);
    expect(ids(gate.failed)).toEqual([]);
    expect(ids(gate.unknown)).toEqual(["dados-reais", "janela-fora-da-amostra", "fills-reais-conciliados", "autorizacao-e-assinante"]);
    expect(gate.recommendation).toContain("Isto não concede nada");
    expect(gate.recommendation).toContain("bun run qualify:live");
    expect(gate.recommendation).toContain("o dono decide");
    expect(gate.recommendation).toContain("assinante separado");
    expect(gate.recommendation).toContain("fills reais conciliados");
  });

  test("LB21 synthetic data never passes: dados-reais fails and the text asks for insufficient evidence", () => {
    const gate = promotionGate(gateInput({ mode: "synthetic" }));
    expect(ids(gate.failed)).toEqual(["dados-reais"]);
    expect(gate.recommendation).toContain("Evidência insuficiente");
    expect(gate.recommendation).not.toContain("Isto não concede nada: o dono decide");
  });

  test("LB21 the Kelly criterion uses kellyLowerBound of envelope.ts and reports the phase 2 cap only as information", () => {
    const policy = strongPolicy();
    const gate = promotionGate(gateInput({ policies: [policy] }));
    const kelly = gate.passed.find((c) => c.id === "kelly-alavancagem");
    expect(kelly).toBeDefined();
    const bound = policy.portfolio.kellyLowerBound as number;
    expect(bound).toBeGreaterThan(0);
    expect(bound).toBeCloseTo(kellyLowerBound(policy.portfolio.dailyMean as number, policy.portfolio.dailySd as number, 375), 6);
    expect(String(kelly?.observed)).toContain(String(Math.round(bound * 100) / 100));
    expect(gate.recommendation).toContain("Alavancagem permanece em 0x na fase-0");
    // a weak policy has no positive lower bound: leverage is not supported
    const noise = new Rng(8, "weak");
    const weak = buildPolicyReport(inputsOf("jev", Array.from({ length: 400 }, () => trade(noise.normal() * 0.01 + 0.0001))), CTX);
    const failed = promotionGate(gateInput({ policies: [weak] }));
    expect(ids(failed.failed)).toContain("kelly-alavancagem");
  });

  test("LB21 each statistical criterion fails on its own when its evidence is missing", () => {
    const base = gateInput();
    const run = (patch: Partial<GateInput["run"]>) => promotionGate({ ...base, run: { ...base.run, ...patch } });
    expect(ids(run({ spanDays: 89.9 }).failed)).toContain("dias-minimos");
    expect(ids(run({ spanDays: 90 }).passed)).toContain("dias-minimos");
    expect(ids(run({ completeness: 0.94 }).failed)).toContain("resultados-completos");
    expect(ids(run({ completeness: 0.95 }).passed)).toContain("resultados-completos");
    expect(ids(run({ completeness: null }).unknown)).toContain("resultados-completos");

    const policy = strongPolicy();
    const patch = (fn: (p: PolicyReport) => void): ReturnType<typeof promotionGate> => {
      const clone = JSON.parse(JSON.stringify(policy)) as PolicyReport;
      fn(clone);
      return promotionGate({ ...base, policies: [clone] });
    };
    expect(ids(patch((p) => { (p.mean as NonNullable<typeof p.mean>).t = 1.99; }).failed)).toContain("t-newey-west");
    expect(ids(patch((p) => { (p.mean as NonNullable<typeof p.mean>).ci95Bps = [-0.1, 5]; }).failed)).toContain("limite-inferior-positivo");
    expect(ids(patch((p) => { p.adjustedP = 0.05; }).failed)).toContain("correcao-holm");
    expect(ids(patch((p) => { p.adjustedP = null; }).unknown)).toContain("correcao-holm");
    expect(ids(patch((p) => { (p.mean as NonNullable<typeof p.mean>).effectiveSamples = 29; }).failed)).toContain("amostra-efetiva");
    expect(ids(patch((p) => { p.inference.costKnown = false; }).unknown)).toContain("custo-de-inferencia");
    expect(ids(patch((p) => { p.mean = null; }).unknown)).toContain("t-newey-west");
  });

  test("LB21 beating the baselines needs every comparison: one non-significant or missing row is enough to fail or leave it unknown", () => {
    const base = gateInput();
    const one = promotionGate({ ...base, paired: [...base.paired.slice(0, 4), pairedOf("jev", "carry-rule", false)] });
    expect(ids(one.failed)).toContain("contra-baselines");
    expect(one.recommendation).toContain("Evidência insuficiente");
    const undetermined = promotionGate({ ...base, paired: [...base.paired.slice(0, 4), pairedOf("jev", "carry-rule", null)] });
    expect(ids(undetermined.unknown)).toContain("contra-baselines");
    const none = promotionGate({ ...base, paired: [] });
    expect(ids(none.unknown)).toContain("contra-baselines");
  });

  test("LB21 a declared frozen window passes only if the first epoch is not earlier than the declaration", () => {
    const base = gateInput();
    expect(ids(promotionGate({ ...base, run: { ...base.run, frozenAtMs: base.run.firstEpochMs } }).passed)).toContain("janela-fora-da-amostra");
    expect(ids(promotionGate({ ...base, run: { ...base.run, frozenAtMs: base.run.firstEpochMs + 1 } }).failed)).toContain("janela-fora-da-amostra");
    expect(ids(promotionGate(base).unknown)).toContain("janela-fora-da-amostra");
  });

  test("LB21 fills and authorization are never evaluable here: unknown in every case, even for an excellent report", () => {
    const gate = promotionGate(gateInput({ run: { ...gateInput().run, frozenAtMs: 1 } }));
    expect(ids(gate.unknown)).toEqual(expect.arrayContaining(["fills-reais-conciliados", "autorizacao-e-assinante"]));
    for (const id of ["fills-reais-conciliados", "autorizacao-e-assinante"]) {
      expect(ids(gate.passed)).not.toContain(id);
      expect(ids(gate.failed)).not.toContain(id);
    }
  });

  test("LB21 without a policy under test every statistical criterion is unknown and the text still recommends fase-0", () => {
    const gate = promotionGate(gateInput({ policies: [] }));
    expect(ids(gate.unknown)).toContain("t-newey-west");
    expect(gate.passed.length).toBeLessThanOrEqual(2);
    expect(gate.recommendation.startsWith("Recomendação: permanecer na fase-0")).toBe(true);
  });

  test("LB21 the gate is deterministic and does not modify its input", () => {
    const input = gateInput();
    const snapshot = JSON.stringify(input);
    expect(JSON.stringify(promotionGate(input))).toBe(JSON.stringify(promotionGate(input)));
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test("LB21 the descriptor of the policy under test is the jev policy, not a baseline", () => {
    expect(describePolicy(holdPolicy()).tested).toBe(false);
    expect(strongPolicy().tested).toBe(true);
  });
});
