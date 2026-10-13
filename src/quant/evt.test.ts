import { describe, expect, test } from "bun:test";
import { fitGpd, fitTails, gpdQuantile, makeResidualSampler, tailFraction } from "./evt";
import { gaussianDraws, studentDraws } from "./test-support";
import { mulberry32 } from "./types";

// Reference values: independent pure Python implementation of Hosking and Wallis (1987) probability weighted moments
// (scratchpad gpd_vectors.py).
const EXCESSES = [
  1.277041, 0.961203, 0.749365, 0.412586, 0.103805, 0.240077, 0.142039, 0.447743, 0.316995, 0.650449, 0.504504, 0.117553,
  0.096285, 0.06778, 0.175195, 0.844037, 0.617632, 2.402915, 0.919913, 0.225337, 0.798352, 1.261075, 0.089941, 1.538732,
];

/** GPD draws by inverse transform with the given shape and scale. */
function gpdSample(seed: number, n: number, xi: number, sigma: number): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: n }, () => gpdQuantile(random(), xi, sigma));
}

describe("fitGpd", () => {
  test("matches the independent reference", () => {
    const fit = fitGpd(EXCESSES)!;
    expect(fit.xi).toBeCloseTo(-0.08855700319390492, 12);
    expect(fit.sigma).toBeCloseTo(0.6785589928483576, 12);
    expect(fit.n).toBe(24);
  });

  test("recovers the parameters of a simulated generalized Pareto sample", () => {
    for (const [xi, sigma] of [[0.2, 1.5], [0, 1], [0.4, 0.7]] as const) {
      const fit = fitGpd(gpdSample(7, 6000, xi, sigma))!;
      expect(Math.abs(fit.xi - xi)).toBeLessThan(0.07);
      expect(Math.abs(fit.sigma / sigma - 1)).toBeLessThan(0.12);
    }
  });

  test("the shape is clamped to a range with finite variance and the scale follows from the sample mean", () => {
    const fit = fitGpd(gpdSample(3, 40, 0.9, 1))!;
    expect(fit.xi).toBeLessThanOrEqual(0.45);
    expect(fit.xi).toBeGreaterThanOrEqual(-0.25);
    const mean = fit.mean;
    expect(fit.sigma).toBeCloseTo(mean * (1 - fit.xi), 12);
    const bounded = fitGpd(new Array(40).fill(1))!;
    expect(bounded.xi).toBe(-0.25);
    // a sample whose true shape is 0.8 would give an estimate near that; it is held at the 0.45 ceiling
    const heavy = fitGpd(gpdSample(3, 3000, 0.8, 1))!;
    expect(heavy.xi).toBe(0.45);
    expect(heavy.sigma).toBeCloseTo(heavy.mean * (1 - 0.45), 12);
  });

  test("too few, negative, non finite or all zero excesses give null", () => {
    expect(fitGpd(EXCESSES.slice(0, 19))).toBeNull();
    expect(fitGpd([...EXCESSES.slice(0, 23), -0.1])).toBeNull();
    expect(fitGpd([...EXCESSES.slice(0, 23), Number.NaN])).toBeNull();
    expect(fitGpd(new Array(30).fill(0))).toBeNull();
    expect(fitGpd(EXCESSES.slice(0, 10), { minExcesses: 8 })).not.toBeNull();
  });
});

describe("gpdQuantile", () => {
  test("matches the independent reference for positive, zero and negative shape", () => {
    expect(gpdQuantile(0.1, 0.2, 1.5)).toBeCloseTo(0.15971765700101337, 12);
    expect(gpdQuantile(0.5, 0.2, 1.5)).toBeCloseTo(1.1152376624777633, 12);
    expect(gpdQuantile(0.9, 0.2, 1.5)).toBeCloseTo(4.386698943458352, 12);
    expect(gpdQuantile(0.99, 0.2, 1.5)).toBeCloseTo(11.339148236321847, 12);
    expect(gpdQuantile(0.1, 0, 1.5)).toBeCloseTo(0.15804077348673942, 12);
    expect(gpdQuantile(0.99, 0, 1.5)).toBeCloseTo(6.907755278982137, 12);
    expect(gpdQuantile(0.5, -0.2, 1.5)).toBeCloseTo(0.9708707752790691, 12);
    expect(gpdQuantile(0.99, -0.2, 1.5)).toBeCloseTo(4.5141962208487705, 12);
  });

  test("is increasing in the probability and starts at zero", () => {
    expect(gpdQuantile(0, 0.2, 1)).toBe(0);
    expect(gpdQuantile(0.3, 0.2, 1)).toBeLessThan(gpdQuantile(0.6, 0.2, 1));
  });

  test("a probability of 1 or outside [0, 1) is refused", () => {
    expect(() => gpdQuantile(1, 0.2, 1)).toThrow("probability_invalid");
    expect(() => gpdQuantile(-0.1, 0.2, 1)).toThrow("probability_invalid");
    expect(() => gpdQuantile(Number.NaN, 0.2, 1)).toThrow("probability_invalid");
    expect(() => gpdQuantile(0.5, 0.2, 0)).toThrow("option_invalid");
  });
});

describe("tailFraction", () => {
  test("gives about 30 points per tail, between 5 and 15 percent", () => {
    expect(tailFraction(2000)).toBe(0.05);
    expect(tailFraction(671)).toBe(0.05);
    expect(tailFraction(300)).toBeCloseTo(0.1, 12);
    expect(tailFraction(100)).toBe(0.15);
  });
});

describe("fitTails", () => {
  test("splits a standardized sample into a centre and two fitted tails", () => {
    const z = gaussianDraws(11, 2000, 1);
    const t = fitTails(z)!;
    expect(t.k).toBe(100);
    expect(t.central.length).toBe(2000 - 200);
    expect(t.upper.threshold).toBeGreaterThan(1.4);
    expect(t.upper.threshold).toBeLessThan(1.9);
    expect(t.lower.threshold).toBeLessThan(-1.4);
    expect(Math.abs(t.upper.xi)).toBeLessThan(0.3);
    expect(t.upper.n).toBe(100);
    expect(t.lower.n).toBe(100);
    expect(Math.min(...t.central)).toBe(t.lower.threshold);
    expect(Math.max(...t.central)).toBe(t.upper.threshold);
  });

  test("a fat tailed sample has a positive fitted shape on both sides", () => {
    const t = fitTails(studentDraws(12, 4000, 3, 1))!;
    expect(t.upper.xi).toBeGreaterThan(0.1);
    expect(t.lower.xi).toBeGreaterThan(0.1);
  });

  test("too few residuals to fit a tail is null", () => {
    expect(fitTails(gaussianDraws(1, 100, 1))).toBeNull();
    expect(fitTails([1, 2, Number.NaN, 4])).toBeNull();
  });
});

describe("makeResidualSampler", () => {
  const z = studentDraws(21, 800, 4, 1);

  test("the empirical sampler never leaves the sample", () => {
    const s = makeResidualSampler(z, "empirical");
    expect(s.model).toBe("empirical");
    const random = mulberry32(1);
    const max = Math.max(...z.map(Math.abs));
    for (let i = 0; i < 20_000; i += 1) expect(Math.abs(s.draw(random))).toBeLessThanOrEqual(max);
  });

  test("the extreme value sampler reaches beyond the largest observed residual and keeps the first two moments", () => {
    const s = makeResidualSampler(z, "evt");
    expect(s.model).toBe("evt");
    const random = mulberry32(2);
    const max = Math.max(...z.map(Math.abs));
    const draws = Array.from({ length: 400_000 }, () => s.draw(random));
    expect(draws.filter((d) => Math.abs(d) > max).length).toBeGreaterThan(0);
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    const m2 = draws.reduce((a, b) => a + b * b, 0) / draws.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(m2).toBeGreaterThan(0.85);
    expect(m2).toBeLessThan(1.25);
  });

  test("it reproduces the empirical share of draws beyond the tail thresholds", () => {
    const s = makeResidualSampler(z, "evt");
    const t = fitTails(z)!;
    const random = mulberry32(3);
    let beyond = 0;
    const n = 200_000;
    for (let i = 0; i < n; i += 1) {
      const d = s.draw(random);
      if (d < t.lower.threshold || d > t.upper.threshold) beyond += 1;
    }
    expect(beyond / n).toBeCloseTo((2 * t.k) / z.length, 2);
  });

  test("without enough residuals for the tails it falls back to the empirical sampler and says so", () => {
    expect(makeResidualSampler(gaussianDraws(5, 120, 1), "evt").model).toBe("empirical");
  });

  test("the same seed gives the same draws", () => {
    const run = (seed: number) => {
      const s = makeResidualSampler(z, "evt");
      const r = mulberry32(seed);
      return Array.from({ length: 50 }, () => s.draw(r));
    };
    expect(run(9)).toEqual(run(9));
    expect(run(9)).not.toEqual(run(10));
  });

  test("an empty or non finite residual set is refused", () => {
    expect(() => makeResidualSampler([], "empirical")).toThrow("option_invalid");
    expect(() => makeResidualSampler([1, Number.NaN], "empirical")).toThrow("option_invalid");
  });
});
