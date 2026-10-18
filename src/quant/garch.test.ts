import { describe, expect, test } from "bun:test";
import { fitGarch11, garchFilter, standardize } from "./garch";
import { gaussianDraws, simulateGarchReturns } from "./test-support";

// Reference values: independent pure Python recursion (scratchpad garch_vectors.py).
const R5 = [0.01, -0.02, 0.005, 0.03, -0.015];
const PARAMS = { omega: 1e-6, alpha: 0.1, beta: 0.8 };

describe("garchFilter", () => {
  test("variances, residuals, log likelihood and the next variance match the independent recursion", () => {
    const f = garchFilter(R5, PARAMS)!;
    const variances = [0.00033, 0.000275, 0.00026100000000000006, 0.00021230000000000006, 0.00026084000000000003];
    const residuals = [0.5504818825631803, -1.2060453783110545, 0.30949223029508643, 2.0589521684658303, -0.9287614123549648];
    f.variances.forEach((v, i) => expect(v).toBeCloseTo(variances[i]!, 15));
    f.residuals.forEach((z, i) => expect(z).toBeCloseTo(residuals[i]!, 12));
    expect(f.logLik).toBeCloseTo(17.110009038919426, 10);
    expect(f.nextVariance).toBeCloseTo(0.00023217200000000003, 15);
    expect(f.longRunVariance).toBeCloseTo(0.00033, 15);
  });

  test("an explicit long run variance sets the starting variance", () => {
    const f = garchFilter(R5, PARAMS, 4e-4)!;
    expect(f.variances[0]).toBeCloseTo(4e-4, 15);
  });

  test("unusable input gives null", () => {
    expect(garchFilter([], PARAMS)).toBeNull();
    expect(garchFilter([0.01, Number.NaN], PARAMS)).toBeNull();
    expect(garchFilter([0, 0, 0], PARAMS)).toBeNull();
    expect(garchFilter(R5, { omega: -1, alpha: 0.1, beta: 0.8 })).toBeNull();
    expect(garchFilter(R5, { omega: 1e-6, alpha: 0.5, beta: 0.6 })).toBeNull();
  });
});

describe("standardize", () => {
  test("centers and rescales to unit second moment", () => {
    const z = standardize([0.5504818825631803, -1.2060453783110545, 0.30949223029508643, 2.0589521684658303, -0.9287614123549648])!;
    const expected = [0.33676071210423836, -1.1658872579519834, 0.1306024475265652, 1.6272045688500738, -0.9286804705288937];
    z.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 12));
    expect(z.reduce((a, b) => a + b, 0) / z.length).toBeCloseTo(0, 12);
    expect(z.reduce((a, b) => a + b * b, 0) / z.length).toBeCloseTo(1, 12);
  });
  test("a constant sample has no shape to standardize", () => {
    expect(standardize([1, 1, 1])).toBeNull();
    expect(standardize([])).toBeNull();
  });
});

describe("fitGarch11", () => {
  test("recovers the clustering parameters of a simulated process within sampling error", () => {
    const returns = simulateGarchReturns(31, 5000, { alpha: 0.1, beta: 0.85, sigma: 0.01 });
    const fit = fitGarch11(returns)!;
    expect(fit.alpha).toBeGreaterThan(0.06);
    expect(fit.alpha).toBeLessThan(0.15);
    expect(fit.beta).toBeGreaterThan(0.78);
    expect(fit.beta).toBeLessThan(0.92);
    expect(fit.persistence).toBeCloseTo(fit.alpha + fit.beta, 12);
    expect(fit.halfLifeBars!).toBeGreaterThan(5);
    expect(fit.omega).toBeCloseTo((1 - fit.alpha - fit.beta) * fit.longRunVariance, 15);
  });

  test("independent returns show no meaningful ARCH effect", () => {
    const fit = fitGarch11(gaussianDraws(77, 3000, 0.01))!;
    expect(fit.alpha).toBeLessThanOrEqual(0.05);
  });

  test("the fitted model explains clustered data better than a constant variance", () => {
    const returns = simulateGarchReturns(5, 3000, { alpha: 0.12, beta: 0.84, sigma: 0.01 });
    const fit = fitGarch11(returns)!;
    const constant = garchFilter(returns, { omega: fit.longRunVariance, alpha: 0, beta: 0 })!;
    expect(fit.logLik).toBeGreaterThan(constant.logLik + 20);
  });

  test("a sample that is too short or has no dispersion gives null", () => {
    expect(fitGarch11(gaussianDraws(1, 50, 0.01))).toBeNull();
    expect(fitGarch11(new Array(300).fill(0))).toBeNull();
  });

  test("the fit is deterministic", () => {
    const returns = simulateGarchReturns(9, 800, { alpha: 0.08, beta: 0.88, sigma: 0.01 });
    expect(JSON.stringify(fitGarch11(returns))).toBe(JSON.stringify(fitGarch11(returns)));
  });

  test("atBoundary is true exactly when the best grid point sits on an edge of the grid", () => {
    let sawEdge = false;
    let sawInterior = false;
    for (let seed = 1; seed <= 20; seed += 1) {
      const fit = fitGarch11(simulateGarchReturns(seed, 150, { alpha: 0.09, beta: 0.8, sigma: 0.01 }))!;
      const onEdge = fit.alpha >= 0.3 - 1e-9 || fit.beta >= 0.98 - 1e-9 || fit.persistence >= 0.995 - 1e-9 || fit.beta <= 0.4 + 1e-9;
      expect(fit.atBoundary).toBe(onEdge);
      if (onEdge) sawEdge = true; else sawInterior = true;
    }
    expect(sawEdge || sawInterior).toBe(true);
  });
});
