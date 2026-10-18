import { describe, expect, test } from "bun:test";
import { normalCdf, normalQuantile } from "./normal";
import { cornishFisherVar, hillIndex, historicalVarEs, tailProfile } from "./tail";
import { studentDraws, gaussianDraws } from "./test-support";

// Reference values: independent pure Python (math.erfc, statistics.NormalDist), scratchpad touch_vectors.py.
describe("normal distribution helpers", () => {
  test("cdf matches independent reference values", () => {
    const cases: [number, number][] = [
      [-6, 9.865876450377016e-10], [-3, 0.0013498980316300959], [-1.96, 0.024997895148220435], [-1, 0.15865525393145707],
      [0, 0.5], [0.5, 0.691462461274013], [1.96, 0.9750021048517796], [3, 0.9986501019683699],
    ];
    for (const [z, expected] of cases) expect(Math.abs(normalCdf(z) / expected - 1)).toBeLessThan(1e-12);
  });

  test("quantile matches independent reference values and inverts the cdf", () => {
    const cases: [number, number][] = [[0.001, -3.090232306167813], [0.01, -2.3263478740408408], [0.05, -1.6448536269514726], [0.5, 0], [0.975, 1.9599639845400536], [0.999, 3.090232306167813]];
    for (const [p, expected] of cases) expect(normalQuantile(p)).toBeCloseTo(expected, 10);
    for (const z of [-4.2, -0.3, 0.9, 2.7]) expect(normalQuantile(normalCdf(z))).toBeCloseTo(z, 9);
  });

  test("quantile refuses probabilities outside the open interval", () => {
    expect(() => normalQuantile(0)).toThrow("probability_invalid");
    expect(() => normalQuantile(1)).toThrow("probability_invalid");
    expect(() => normalQuantile(Number.NaN)).toThrow("probability_invalid");
  });
});

describe("historical VaR and expected shortfall", () => {
  const grid = Array.from({ length: 100 }, (_, i) => (i - 50) / 100); // -0.50 .. 0.49

  test("matches hand calculation: quantile by linear interpolation, ES is the mean of the tail", () => {
    // sorted position 99 * 0.05 = 4.95 between -0.46 and -0.45 gives -0.4505; the tail is -0.50 .. -0.46
    const r = historicalVarEs(grid, 0.95);
    expect(r.var!).toBeCloseTo(0.4505, 12);
    expect(r.es!).toBeCloseTo(0.48, 12);
    expect(r.tailCount).toBe(5);
  });

  test("a tail with fewer than three observations gives null, not a one point estimate", () => {
    const r = historicalVarEs(grid, 0.99);
    expect(r.var).toBeNull();
    expect(r.es).toBeNull();
    expect(r.tailCount).toBe(1);
  });

  test("loss is reported positive and a profitable tail is a negative loss, not clipped", () => {
    const allGains = Array.from({ length: 100 }, (_, i) => 0.01 + i / 10_000);
    expect(historicalVarEs(allGains, 0.95).var!).toBeLessThan(0);
  });

  test("invalid input", () => {
    expect(historicalVarEs([], 0.95).var).toBeNull();
    expect(historicalVarEs([0.1, Number.NaN], 0.95).var).toBeNull();
    expect(() => historicalVarEs(grid, 1)).toThrow("confidence_invalid");
    expect(() => historicalVarEs(grid, 0.4)).toThrow("confidence_invalid");
  });
});

describe("Cornish Fisher VaR", () => {
  const sample = [-0.08, -0.05, -0.03, -0.02, -0.01, -0.005, 0, 0.004, 0.006, 0.01, 0.012, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.05, 0.06, 0.09];
  test("matches the independent reference", () => {
    expect(cornishFisherVar(sample, 0.95)!).toBeCloseTo(0.05550929488857634, 12);
    expect(cornishFisherVar(sample, 0.99)!).toBeCloseTo(0.08993034652066653, 12);
  });
  test("without skew and kurtosis it reduces to the gaussian VaR", () => {
    const symmetric = [-2, -1, 0, 1, 2];
    // mean 0, sample sd sqrt(2.5), skew 0, excess kurtosis 1.7/2 - 3 = -1.3: compare against the formula with S = 0
    const sd = Math.sqrt(2.5);
    const z = normalQuantile(0.05);
    const K = -1.3;
    const zcf = z + ((z ** 3 - 3 * z) * K) / 24;
    expect(cornishFisherVar(symmetric, 0.95)!).toBeCloseTo(-(0 + sd * zcf), 12);
  });
  test("too few points or no dispersion is null", () => {
    expect(cornishFisherVar([0.01, 0.02, 0.03], 0.95)).toBeNull();
    expect(cornishFisherVar([0.01, 0.01, 0.01, 0.01, 0.01], 0.95)).toBeNull();
  });
});

describe("Hill tail index", () => {
  test("matches hand calculation", () => {
    // top 3 of 100 50 20 10 5 2 1 against the 4th largest (10): 1 / mean(ln 10, ln 5, ln 2) = 0.6514417228548777
    expect(hillIndex([1, 100, 5, 20, 50, 2, 10], 3)!).toBeCloseTo(0.6514417228548777, 12);
  });
  test("uses absolute values, so the sign of the return does not matter", () => {
    expect(hillIndex([-1, 100, -5, 20, -50, 2, -10], 3)!).toBeCloseTo(0.6514417228548777, 12);
  });
  test("refuses an order statistic it cannot use", () => {
    expect(hillIndex([1, 2, 3], 3)).toBeNull();
    expect(hillIndex([1, 2, 3], 0)).toBeNull();
    expect(hillIndex([0, 0, 0, 0], 2)).toBeNull();
  });
});

describe("tail profile", () => {
  test("Student t with 3 degrees of freedom is heavy tailed and the index lands near 3", () => {
    const profile = tailProfile(studentDraws(17, 6000, 3, 0.01));
    expect(profile.excessKurtosis!).toBeGreaterThan(3);
    expect(profile.heavyTailed).toBe(true);
    expect(profile.hill!).toBeGreaterThan(2.2);
    expect(profile.hill!).toBeLessThan(4.2);
    expect(profile.es99!).toBeGreaterThan(profile.var99!);
  });

  test("a gaussian sample is not heavy tailed", () => {
    const profile = tailProfile(gaussianDraws(17, 6000, 0.01));
    expect(Math.abs(profile.excessKurtosis!)).toBeLessThan(0.5);
    expect(profile.heavyTailed).toBe(false);
    expect(profile.cfVar99).not.toBeNull();
  });

  test("the Hill index separates a heavy tail from a thin one by more than a unit", () => {
    const fat = tailProfile(studentDraws(17, 6000, 3, 0.01));
    const thin = tailProfile(gaussianDraws(17, 6000, 0.01));
    expect(thin.hill!).toBeGreaterThan(fat.hill! + 1.5);
  });

  test("a moderately fat tail has a larger Cornish Fisher VaR than a gaussian of equal variance", () => {
    const fat = tailProfile(studentDraws(21, 6000, 8, 0.01));
    const thin = tailProfile(gaussianDraws(21, 6000, 0.01));
    expect(fat.cfVar99!).toBeGreaterThan(thin.cfVar99!);
  });

  test("outside the shape range the expansion is withheld and the historical tail carries the estimate", () => {
    const profile = tailProfile(studentDraws(17, 6000, 3, 0.01));
    expect(profile.cfVar99).toBeNull();
    expect(profile.es99!).toBeGreaterThan(profile.var99!);
  });

  test("the Hill index needs at least 100 returns", () => {
    expect(tailProfile(studentDraws(2, 99, 3, 0.01)).hill).toBeNull();
    expect(tailProfile(studentDraws(2, 100, 3, 0.01)).hill).not.toBeNull();
    expect(tailProfile(studentDraws(2, 100, 3, 0.01)).hillK).toBe(10);
    expect(tailProfile(studentDraws(2, 1000, 3, 0.01)).hillK).toBe(100);
  });

  test("the heavy tail flag switches at an excess kurtosis of 1", () => {
    const thin = tailProfile(gaussianDraws(5, 3000, 0.01));
    const fat = tailProfile(studentDraws(5, 3000, 5, 0.01));
    expect(thin.excessKurtosis!).toBeLessThan(1);
    expect(thin.heavyTailed).toBe(false);
    expect(fat.excessKurtosis!).toBeGreaterThan(1);
    expect(fat.heavyTailed).toBe(true);
  });

  test("a short sample reports what it can and null for the rest", () => {
    const profile = tailProfile(gaussianDraws(3, 30, 0.01));
    expect(profile.n).toBe(30);
    expect(profile.hill).toBeNull();
    expect(profile.var99).toBeNull();
    expect(profile.sigma).not.toBeNull();
  });

  test("an empty sample is all null", () => {
    const profile = tailProfile([]);
    expect(profile.n).toBe(0);
    expect(profile.sigma).toBeNull();
    expect(profile.heavyTailed).toBeNull();
  });
});
