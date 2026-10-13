import { describe, expect, test } from "bun:test";
import { excessKurtosis, logReturnsOf, mad, madSigma, mean, median, quantile, sampleStdDev, sampleVariance, skewness } from "./stats";

describe("descriptive statistics", () => {
  test("mean and sample variance match hand calculation", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    // squared deviations 2.25 + 0.25 + 0.25 + 2.25 = 5, divided by n - 1 = 3
    expect(sampleVariance([1, 2, 3, 4])).toBeCloseTo(5 / 3, 12);
    expect(sampleStdDev([1, 2, 3, 4])).toBeCloseTo(Math.sqrt(5 / 3), 12);
  });

  test("quantile uses linear interpolation of the sorted sample", () => {
    expect(quantile([5, 1, 4, 2, 3], 0.25)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6, 12);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([7], 0.3)).toBe(7);
  });

  test("median and mad", () => {
    expect(median([9, 1, 2, 2, 4, 1, 6])).toBe(2);
    // absolute deviations from 2: 1 1 0 0 2 4 7, whose median is 1
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
    expect(madSigma([1, 1, 2, 2, 4, 6, 9])).toBeCloseTo(1.482602218505602, 9);
  });

  test("skewness and excess kurtosis match hand calculation", () => {
    // mean 1.8, m2 = 2.56, m3 = 6.144, m4 = 21.2992
    expect(skewness([1, 1, 1, 1, 5])).toBeCloseTo(1.5, 12);
    expect(excessKurtosis([1, 1, 1, 1, 5])).toBeCloseTo(0.25, 12);
    expect(skewness([1, 2, 3])).toBeCloseTo(0, 12);
  });

  test("a sample that cannot support the statistic gives null, never zero or NaN", () => {
    expect(mean([])).toBeNull();
    expect(sampleVariance([1])).toBeNull();
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([1, 2], 1.5)).toBeNull();
    expect(median([1, Number.NaN])).toBeNull();
    expect(skewness([2, 2, 2])).toBeNull();
    expect(excessKurtosis([1, 2, 3])).toBeNull();
    expect(excessKurtosis([4, 4, 4, 4])).toBeNull();
  });

  test("a constant series has no shape: rounding noise is not dispersion", () => {
    for (const c of [0.1, 0.01, 1 / 3, -0.0007, 123456.789]) {
      const values = new Array(50).fill(c);
      expect(skewness(values)).toBeNull();
      expect(excessKurtosis(values)).toBeNull();
    }
  });

  test("a series with tiny but real dispersion still has a shape", () => {
    const values = Array.from({ length: 50 }, (_, i) => 1e-9 * (i % 7) + 0.5);
    expect(skewness(values)).not.toBeNull();
    expect(excessKurtosis(values)).not.toBeNull();
  });

  test("log returns reject any invalid close instead of skipping it", () => {
    expect(logReturnsOf([100, 110])![0]).toBeCloseTo(Math.log(1.1), 12);
    expect(logReturnsOf([100, 0, 110])).toBeNull();
    expect(logReturnsOf([100, Number.NaN])).toBeNull();
    expect(logReturnsOf([100])).toEqual([]);
  });
});
