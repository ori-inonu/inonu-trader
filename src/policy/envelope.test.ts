import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as envelope from "./envelope";
import {
  PHASES,
  PHASE_IDS,
  POLICY_SETTINGS_FIELDS,
  checkSettings,
  deriveLimits,
  kellyLeverage,
  kellyLowerBound,
  liquidationDistanceFloor,
  logGrowthPerDay,
  maxExposureFraction,
  medianWealthNoEdge,
  normalCdf,
  touchLiquidationProbability,
  volatilityDragPerDay,
  type PhaseId,
} from "./envelope";

// Spec: docs/POLITICA-DE-LIMITES.md. Test titles start with the acceptance id (L1..L27) defined there.
// Everything here is synthetic: no key, wallet, owner or real configuration.

const ROOT = resolve(import.meta.dir, "..", "..");
const DOC_PATH = resolve(ROOT, "docs", "POLITICA-DE-LIMITES.md");
const MODULE_PATH = resolve(import.meta.dir, "envelope.ts");
const THIS_PATH = resolve(import.meta.dir, "envelope.test.ts");
const CLI_PATH = resolve(ROOT, "scripts", "policy-envelope.ts");
const CLI_TEST_PATH = resolve(ROOT, "scripts", "policy-envelope.test.ts");

const ALL_PHASES: readonly PhaseId[] = ["fase-0", "fase-1", "fase-2"];
const SIGMAS = [0.02, 0.04, 0.06] as const;

type Loose = Record<string, unknown>;

/** Shows what was compared when a number is off. */
function near(label: string, actual: number, expected: number, tolerance: number): void {
  const shown = { label, expected, actual };
  expect({ ...shown, within: Math.abs(actual - expected) <= tolerance }).toEqual({ ...shown, within: true });
}

function nearRelative(label: string, actual: number, expected: number, relative: number): void {
  const shown = { label, expected, actual };
  expect({ ...shown, within: Math.abs(actual - expected) <= relative * Math.abs(expected) }).toEqual({ ...shown, within: true });
}

const ids = (list: readonly { id: string }[]): string[] => list.map((entry) => entry.id);

/** Deterministic PRNG so the property-style tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Mathematics (R3 section 4)
// ---------------------------------------------------------------------------

/** Reference values from libm erfc (Python math.erfc), computed outside this repository. */
const PHI_REFERENCE: readonly (readonly [number, number])[] = [
  [0, 0.5], [0.5, 0.691462461274013], [1, 0.8413447460685428], [1.96, 0.9750021048517796], [2.5, 0.9937903346742238],
  [-0.5, 0.30853753872598694], [-1, 0.15865525393145707], [-1.96, 0.024997895148220435], [-2, 0.022750131948179216],
  [-2.5, 0.006209665325776139], [-3, 0.0013498980316300959], [-4, 3.1671241833119965e-5], [-5, 2.8665157187919455e-7],
  [-6, 9.865876450377016e-10], [-7, 1.279812543885835e-12], [-8, 6.220960574271819e-16], [-10, 7.619853024160595e-24],
  [-20, 2.753624118606332e-89],
];

describe("L1 normalCdf", () => {
  test("L1 matches libm reference values: relative 1e-11 on the lower tail, absolute 1e-15 above zero", () => {
    for (const [z, expected] of PHI_REFERENCE) {
      const actual = normalCdf(z);
      if (z <= 0) nearRelative(`Phi(${z})`, actual, expected, 1e-11);
      else near(`Phi(${z})`, actual, expected, 1e-15);
    }
  });

  test("L1 is continuous where the series hands over to the continued fraction (x = |z|/sqrt(2) = 2)", () => {
    // Two points on each side of the switch (x = 1.99998, 1.999995 use the series; x = 2.000002, 2.00005 use the continued fraction).
    const around: readonly (readonly [number, number])[] = [
      [-2.8284, 0.0023390656954665997], [-2.82842, 0.0023389195507331883], [-2.82843, 0.0023388464814666117], [-2.8285, 0.002338335054464852],
      [-2 * Math.SQRT2, 0.0023388674905236327],
    ];
    for (const [z, expected] of around) nearRelative(`Phi(${z})`, normalCdf(z), expected, 1e-11);
    const left = normalCdf(-2 * Math.SQRT2 + 1e-12);
    const right = normalCdf(-2 * Math.SQRT2 - 1e-12);
    expect(Math.abs(left - right) / left).toBeLessThan(1e-9);
  });

  test("L1 is symmetric, monotone and always inside [0, 1]", () => {
    let previous = -1;
    for (let z = -10; z <= 10; z += 0.0625) {
      const value = normalCdf(z);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(Math.abs(value + normalCdf(-z) - 1)).toBeLessThan(1e-15);
      previous = value;
    }
  });

  test("L1 handles the limits and rejects NaN and non-numbers", () => {
    expect(normalCdf(Infinity)).toBe(1);
    expect(normalCdf(-Infinity)).toBe(0);
    expect(normalCdf(-50)).toBe(0);
    expect(normalCdf(50)).toBe(1);
    expect(() => normalCdf(Number.NaN)).toThrow(RangeError);
    expect(() => normalCdf("1" as unknown as number)).toThrow(RangeError);
    expect(() => normalCdf(undefined as unknown as number)).toThrow(RangeError);
  });

  test("L1 the daily-stop frequency of R3 section 4.8 follows from Phi (f = 1, DLL 2%: 15.9%, 30.9%, 36.9% of days)", () => {
    near("sigma 2%", normalCdf(-0.02 / 0.02), 0.159, 0.001);
    near("sigma 4%", normalCdf(-0.02 / 0.04), 0.309, 0.001);
    near("sigma 6%", normalCdf(-0.02 / 0.06), 0.369, 0.001);
  });
});

describe("L2 volatility drag and log growth", () => {
  // R3 Table A, percent per day. Rows L = 1, 2, 3, 5, 10, 20; columns sigma 2%, 4%, 6%.
  const DRAG: readonly (readonly [number, readonly number[]])[] = [
    [1, [0.02, 0.08, 0.18]], [2, [0.08, 0.32, 0.72]], [3, [0.18, 0.72, 1.62]],
    [5, [0.5, 2.0, 4.5]], [10, [2.0, 8.0, 18.0]], [20, [8.0, 32.0, 72.0]],
  ];

  test("L2 volatilityDragPerDay reproduces Table A of R3", () => {
    for (const [L, row] of DRAG) {
      SIGMAS.forEach((sigma, index) => near(`drag L=${L} sigma=${sigma}`, volatilityDragPerDay(L, sigma) * 100, row[index]!, 1e-9));
    }
    near("10x at 4%", volatilityDragPerDay(10, 0.04), 0.08, 1e-12);
    near("20x at 6%", volatilityDragPerDay(20, 0.06), 0.72, 1e-12);
  });

  test("L2 the minimum edge for g > 0 is drag / L: g is zero exactly there (Table A, second block)", () => {
    for (const [L] of DRAG) {
      for (const sigma of SIGMAS) near(`g=0 L=${L} sigma=${sigma}`, logGrowthPerDay(L, 0.5 * L * sigma * sigma, sigma), 0, 1e-15);
    }
    near("5x at 4% needs 0.40% per day", 0.5 * 5 * 0.04 * 0.04, 0.004, 1e-15);
  });

  test("L2 logGrowthPerDay reproduces the worked example of R3 (mu 0.1% per day, sigma 4%)", () => {
    const g = (L: number) => logGrowthPerDay(L, 0.001, 0.04) * 100;
    near("g(L*=0.625)", g(0.625), 0.03125, 1e-9);
    near("g(1.25)", g(1.25), 0, 1e-9);
    near("g(2)", g(2), -0.12, 1e-9);
    near("g(3)", g(3), -0.42, 1e-9);
    near("g(5)", g(5), -1.5, 1e-9);
    expect(g(0.625)).toBeGreaterThan(g(0.5));
    expect(g(0.625)).toBeGreaterThan(g(0.75));
  });

  test("L2 without edge (mu = 0) growth is negative for every positive leverage, and zero at L = 0", () => {
    for (const L of [0.01, 0.1, 0.5, 1, 2, 5, 10, 50]) {
      for (const sigma of SIGMAS) expect(logGrowthPerDay(L, 0, sigma)).toBeLessThan(0);
    }
    expect(logGrowthPerDay(0, 0, 0.04)).toBe(0);
    expect(volatilityDragPerDay(0, 0.04)).toBe(0);
  });
});

describe("L3 Kelly and its lower bound", () => {
  // R3 Table B, rows mu per day, columns sigma 2%, 4%, 6% (R3 prints two decimals).
  const KELLY: readonly (readonly [number, readonly number[]])[] = [
    [0.0002, [0.5, 0.12, 0.06]], [0.0005, [1.25, 0.31, 0.14]], [0.001, [2.5, 0.62, 0.28]],
    [0.0025, [6.25, 1.56, 0.69]], [0.005, [12.5, 3.12, 1.39]],
  ];

  test("L3 kellyLeverage is mu / sigma^2: 0.625 for mu 0.1% per day and sigma 4%, and Table B", () => {
    near("0.1% at 4%", kellyLeverage(0.001, 0.04), 0.625, 1e-12);
    for (const [mu, row] of KELLY) {
      SIGMAS.forEach((sigma, index) => near(`L* mu=${mu} sigma=${sigma}`, kellyLeverage(mu, sigma), row[index]!, 0.006));
    }
    expect(kellyLeverage(0, 0.04)).toBe(0);
    expect(kellyLeverage(-0.001, 0.04)).toBeLessThan(0);
  });

  test("L3 the standard error of the Kelly estimate is 4.6x, 2.6x and 1.3x for 30, 90 and 365 days at sigma 4% (R3 4.7)", () => {
    const mu = 0.05;
    const standardError = (days: number) => (kellyLeverage(mu, 0.04) - kellyLowerBound(mu, 0.04, days)) / 2;
    near("30 days", standardError(30), 4.564, 0.01);
    near("90 days", standardError(90), 2.635, 0.01);
    near("365 days", standardError(365), 1.309, 0.01);
    near("30 days against R3", standardError(30), 4.6, 0.05);
    near("90 days against R3", standardError(90), 2.6, 0.05);
    near("365 days against R3", standardError(365), 1.3, 0.05);
  });

  test("L3 the lower bound is positive if and only if t = mu * sqrt(days) / sigma exceeds 2, and never negative", () => {
    const sigma = 0.04;
    const days = 365;
    const muForT = (t: number) => (t * sigma) / Math.sqrt(days);
    expect(kellyLowerBound(muForT(2.01), sigma, days)).toBeGreaterThan(0);
    expect(kellyLowerBound(muForT(1.99), sigma, days)).toBe(0);
    expect(kellyLowerBound(muForT(2), sigma, days)).toBeLessThan(1e-9);
    expect(kellyLowerBound(0, sigma, 30)).toBe(0);
    expect(kellyLowerBound(-0.01, sigma, 30)).toBe(0);
    expect(kellyLowerBound(0.001, 0.04, 365)).toBe(0);
  });

  test("L3 a Sharpe 4.8 edge (mu 0.5% per day, sigma 2%) measured for 365 days gives lower bound 7.27 and a 1.82x leverage cap", () => {
    const bound = kellyLowerBound(0.005, 0.02, 365);
    near("lower bound", bound, 7.2658, 0.001);
    near("quarter of it", 0.25 * bound, 1.8165, 0.001);
  });
});

describe("L4 liquidation touch probability", () => {
  // R3 Table C in percent. Columns: sigma 2% (1 d, 7 d, 30 d), sigma 4% (1 d, 7 d, 30 d), sigma 6% (1 d, 7 d, 30 d).
  // 0 stands for "~0" (below 0.01%).
  const TABLE_C: readonly (readonly [number, readonly number[]])[] = [
    [1, [0, 0, 0, 0, 0, 0, 0, 0, 0.2]],
    [2, [0, 0, 0, 0, 0, 2.2, 0, 0.2, 12.8]],
    [3, [0, 0, 0.2, 0, 0.2, 12.8, 0, 3.6, 31.0]],
    [5, [0, 0.02, 6.8, 0, 5.9, 36.1, 0.09, 20.8, 54.3]],
    [10, [0, 5.9, 36.1, 1.2, 34.5, 64.8, 9.6, 52.9, 76.1]],
    [20, [1.2, 34.5, 64.8, 21.1, 63.7, 81.9, 40.5, 75.3, 87.9]],
  ];

  test("L4 reproduces the whole Table C of R3 within 0.002 absolute", () => {
    for (const [L, row] of TABLE_C) {
      let column = 0;
      for (const sigma of SIGMAS) {
        for (const days of [1, 7, 30]) {
          near(`P(touch) L=${L} sigma=${sigma} days=${days}`, touchLiquidationProbability(L, sigma, days), row[column]! / 100, 0.002);
          column += 1;
        }
      }
    }
  });

  test("L4 headline cases: sigma 4% over 7 days and sigma 6% over 30 days", () => {
    near("5x 4% 7d", touchLiquidationProbability(5, 0.04, 7), 0.059, 0.002);
    near("10x 4% 7d", touchLiquidationProbability(10, 0.04, 7), 0.345, 0.002);
    near("20x 4% 7d", touchLiquidationProbability(20, 0.04, 7), 0.637, 0.002);
    near("2x 6% 30d", touchLiquidationProbability(2, 0.06, 30), 0.128, 0.002);
    near("3x 6% 30d", touchLiquidationProbability(3, 0.06, 30), 0.31, 0.002);
    // R3 Table C prints 54,3% for this same cell (L=5, sigma=6%, 30 d); 0.54 was a truncation that the
    // 0.002 absolute tolerance of this test could not hold.
    near("5x 6% 30d", touchLiquidationProbability(5, 0.06, 30), 0.543, 0.002);
  });

  test("L4 a maintenance margin shrinks the distance: 1.25% at sigma 4% over 30 days gives 14.3%, 39.2% and 69.0%", () => {
    near("3x", touchLiquidationProbability(3, 0.04, 30, 0.0125), 0.143, 0.002);
    near("5x", touchLiquidationProbability(5, 0.04, 30, 0.0125), 0.392, 0.002);
    near("10x", touchLiquidationProbability(10, 0.04, 30, 0.0125), 0.69, 0.002);
    expect(touchLiquidationProbability(3, 0.04, 30, 0)).toBe(touchLiquidationProbability(3, 0.04, 30));
  });

  test("L4 the drawdown stop of R3 section 4.8 is the same formula with L = f / drawdown (10% stop, 30 days)", () => {
    near("f=1 at 4%", touchLiquidationProbability(1 / 0.1, 0.04, 30), 0.648, 0.002);
    near("f=0.25 at 4%", touchLiquidationProbability(0.25 / 0.1, 0.04, 30), 0.068, 0.002);
    near("f=1 at 2%", touchLiquidationProbability(1 / 0.1, 0.02, 30), 0.361, 0.002);
  });

  test("L4 edges and monotonicity: L = 0 gives 0, a non-positive distance gives 1, and risk grows with L, days and sigma", () => {
    expect(touchLiquidationProbability(0, 0.04, 7)).toBe(0);
    expect(touchLiquidationProbability(100, 0.04, 7, 0.02)).toBe(1);
    expect(touchLiquidationProbability(50, 0.04, 7, 0.02)).toBe(1);
    expect(touchLiquidationProbability(1e6, 0.04, 7)).toBeGreaterThan(0.999);
    for (const value of [touchLiquidationProbability(2, 0.04, 7), touchLiquidationProbability(1, 0.5, 365)]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    const byLeverage = [1, 2, 3, 5, 10, 20, 50].map((L) => touchLiquidationProbability(L, 0.04, 7));
    const byDays = [1, 7, 30, 90].map((days) => touchLiquidationProbability(5, 0.04, days));
    const bySigma = [0.01, 0.02, 0.04, 0.08].map((sigma) => touchLiquidationProbability(5, sigma, 7));
    for (const series of [byLeverage, byDays, bySigma]) {
      for (let index = 1; index < series.length; index += 1) expect(series[index]!).toBeGreaterThan(series[index - 1]!);
    }
  });
});

describe("L5 median wealth without edge", () => {
  // R3 Table D, 30 days. Rows L, columns sigma 2%, 4%, 6%. "~0" is 0.
  const TABLE_D: readonly (readonly [number, readonly number[]])[] = [
    [1, [0.994, 0.976, 0.947]], [2, [0.976, 0.909, 0.806]], [3, [0.947, 0.806, 0.615]],
    [5, [0.861, 0.549, 0.259]], [10, [0.549, 0.091, 0.0045]], [20, [0.091, 0.00007, 0]],
  ];

  test("L5 reproduces Table D of R3 within 5% relative", () => {
    for (const [L, row] of TABLE_D) {
      SIGMAS.forEach((sigma, index) => {
        const expected = row[index]!;
        const actual = medianWealthNoEdge(L, sigma, 30);
        if (expected === 0) expect(actual).toBeLessThan(1e-6);
        else nearRelative(`median L=${L} sigma=${sigma}`, actual, expected, 0.05);
      });
    }
  });

  test("L5 headline cases at sigma 4% over 30 days: 3x 0.81, 5x 0.55, 10x 0.09, 20x 0.00007", () => {
    nearRelative("3x", medianWealthNoEdge(3, 0.04, 30), 0.81, 0.05);
    nearRelative("5x", medianWealthNoEdge(5, 0.04, 30), 0.55, 0.05);
    nearRelative("10x", medianWealthNoEdge(10, 0.04, 30), 0.09, 0.05);
    nearRelative("20x", medianWealthNoEdge(20, 0.04, 30), 0.00007, 0.05);
  });

  test("L5 is exactly 1 without exposure and falls as leverage grows", () => {
    expect(medianWealthNoEdge(0, 0.04, 30)).toBe(1);
    const series = [0.5, 1, 2, 5, 10].map((L) => medianWealthNoEdge(L, 0.04, 30));
    for (let index = 1; index < series.length; index += 1) expect(series[index]!).toBeLessThan(series[index - 1]!);
  });
});

describe("L6 maximum exposure fraction", () => {
  test("L6 f_max = DLL / (2 sigma): 0.50, 0.25, 0.1667 for DLL 2% and sigma 2%, 4%, 6%", () => {
    near("sigma 2%", maxExposureFraction(0.02, 0.02), 0.5, 1e-12);
    near("sigma 4%", maxExposureFraction(0.02, 0.04), 0.25, 1e-12);
    near("sigma 6%", maxExposureFraction(0.02, 0.06), 1 / 6, 1e-12);
    near("sigma 6% against the two decimals R3 prints", maxExposureFraction(0.02, 0.06), 0.17, 0.005);
  });

  test("L6 DLL 1% halves it: 0.25, 0.125, 0.0833", () => {
    near("sigma 2%", maxExposureFraction(0.01, 0.02), 0.25, 1e-12);
    near("sigma 4%", maxExposureFraction(0.01, 0.04), 0.125, 1e-12);
    near("sigma 6%", maxExposureFraction(0.01, 0.06), 1 / 12, 1e-12);
  });
});

describe("L7 liquidation distance floor", () => {
  test("L7 is max(0.35, 2.5 sigma sqrt(7)): 0.35 for calm assets and 0.4412 for sigma 6.67% (R3: MON 44%)", () => {
    expect(liquidationDistanceFloor(0.02)).toBe(0.35);
    expect(liquidationDistanceFloor(0.04)).toBe(0.35);
    expect(liquidationDistanceFloor(0.05)).toBe(0.35);
    near("sigma 6.67%", liquidationDistanceFloor(0.0667), 0.44118, 1e-4);
    near("sigma 6%", liquidationDistanceFloor(0.06), 2.5 * 0.06 * Math.sqrt(7), 1e-15);
  });

  test("L7 the 0.35 floor and the volatility term cross at sigma of about 5.29%", () => {
    expect(liquidationDistanceFloor(0.0529)).toBe(0.35);
    expect(liquidationDistanceFloor(0.053)).toBeGreaterThan(0.35);
    const crossing = 0.35 / (2.5 * Math.sqrt(7));
    near("crossing", crossing, 0.0529, 0.0001);
  });

  test("L7 at the floor distance the 7-day touch probability is 2 Phi(-2.5), about 1.24% (R3)", () => {
    const sigma = 0.0667;
    const distance = liquidationDistanceFloor(sigma);
    near("touch at the floor", touchLiquidationProbability(1 / distance, sigma, 7), 2 * normalCdf(-2.5), 1e-12);
    near("R3 prints 1.2%", touchLiquidationProbability(1 / distance, sigma, 7), 0.012, 0.001);
  });
});

describe("L8 invalid mathematical input never becomes a number", () => {
  type Kind = "any" | "nonneg" | "positive" | "sigma" | "fraction";
  const BAD: Record<Kind, readonly unknown[]> = {
    any: [Number.NaN, Infinity, -Infinity, "1", null, undefined, true, {}],
    nonneg: [Number.NaN, Infinity, -1, "1", null, undefined, true],
    positive: [Number.NaN, Infinity, 0, -1, "1", null, undefined],
    sigma: [Number.NaN, Infinity, 0, -0.04, 1, 4, "0.04", null, undefined],
    fraction: [Number.NaN, 0, -0.02, 1, 2, "0.02", null, undefined],
  };
  const FUNCTIONS: readonly { name: string; fn: (...args: any[]) => number; valid: readonly unknown[]; kinds: readonly Kind[] }[] = [
    { name: "volatilityDragPerDay", fn: volatilityDragPerDay, valid: [5, 0.04], kinds: ["nonneg", "sigma"] },
    { name: "logGrowthPerDay", fn: logGrowthPerDay, valid: [2, 0.001, 0.04], kinds: ["nonneg", "any", "sigma"] },
    { name: "kellyLeverage", fn: kellyLeverage, valid: [0.001, 0.04], kinds: ["any", "sigma"] },
    { name: "kellyLowerBound", fn: kellyLowerBound, valid: [0.001, 0.04, 365], kinds: ["any", "sigma", "positive"] },
    { name: "touchLiquidationProbability", fn: touchLiquidationProbability, valid: [5, 0.04, 7], kinds: ["nonneg", "sigma", "positive"] },
    { name: "medianWealthNoEdge", fn: medianWealthNoEdge, valid: [5, 0.04, 30], kinds: ["nonneg", "sigma", "positive"] },
    { name: "maxExposureFraction", fn: maxExposureFraction, valid: [0.02, 0.04], kinds: ["fraction", "sigma"] },
    { name: "liquidationDistanceFloor", fn: liquidationDistanceFloor, valid: [0.04], kinds: ["sigma"] },
  ];

  test("L8 every function throws RangeError for each invalid argument and returns a finite number for valid ones", () => {
    for (const { name, fn, valid, kinds } of FUNCTIONS) {
      expect({ name, finite: Number.isFinite(fn(...valid)) }).toEqual({ name, finite: true });
      kinds.forEach((kind, position) => {
        for (const bad of BAD[kind]) {
          const args = [...valid];
          args[position] = bad;
          let threw: unknown;
          try { fn(...args); } catch (error) { threw = error; }
          expect({ name, position, bad: String(bad), isRangeError: threw instanceof RangeError }).toEqual({ name, position, bad: String(bad), isRangeError: true });
        }
      });
    }
  });

  test("L8 the maintenance margin is validated too (negative, 1 or more and non-numbers are refused)", () => {
    for (const bad of [Number.NaN, -0.01, 1, 2, "0.01", Infinity]) {
      expect(() => touchLiquidationProbability(3, 0.04, 30, bad as number)).toThrow(RangeError);
    }
    expect(Number.isFinite(touchLiquidationProbability(3, 0.04, 30, undefined))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

describe("L9 PHASES", () => {
  test("L9 holds the three phases of R3 section 6 with the values of the spec", () => {
    expect([...PHASE_IDS]).toEqual(["fase-0", "fase-1", "fase-2"]);
    expect(Object.keys(PHASES)).toEqual(["fase-0", "fase-1", "fase-2"]);
    const common = {
      dailyLossFraction: 0.02, weeklyStopFraction: 0.05, drawdownStopFraction: 0.1,
      cooldowns: { operationStopMs: 900_000, dailyStopMs: 86_400_000, weeklyStopMs: 259_200_000 }, drawdownReactivation: "manual",
    };
    expect(PHASES["fase-0"]).toMatchObject({
      id: "fase-0", leverageCeiling: 0, borrowingAllowed: false, kellyFraction: null, orderFraction: 0, exposureCeilingFraction: 0,
      dailyLossFraction: null, weeklyStopFraction: null, drawdownStopFraction: null, cooldowns: null, drawdownReactivation: null,
      requiresDedicatedWallet: false, requiresKillSwitch: false, requiresOutOfSampleEdge: false, liquidationFloor: false,
    });
    expect(PHASES["fase-1"]).toMatchObject({
      ...common, id: "fase-1", leverageCeiling: 1, borrowingAllowed: false, kellyFraction: null, orderFraction: 0.01, exposureCeilingFraction: 0.25,
      requiresDedicatedWallet: true, requiresKillSwitch: true, requiresOutOfSampleEdge: false, liquidationFloor: false,
    });
    expect(PHASES["fase-2"]).toMatchObject({
      ...common, id: "fase-2", leverageCeiling: 2, borrowingAllowed: true, kellyFraction: 0.25, orderFraction: 0.02, exposureCeilingFraction: 0.25,
      requiresDedicatedWallet: true, requiresKillSwitch: true, requiresOutOfSampleEdge: true, liquidationFloor: true,
    });
    for (const id of ALL_PHASES) expect(PHASES[id].name.length).toBeGreaterThan(0);
  });

  test("L9 is frozen all the way down and refuses mutation", () => {
    expect(Object.isFrozen(PHASES)).toBe(true);
    expect(Object.isFrozen(PHASE_IDS)).toBe(true);
    expect(Object.isFrozen(POLICY_SETTINGS_FIELDS)).toBe(true);
    for (const id of ALL_PHASES) {
      expect(Object.isFrozen(PHASES[id])).toBe(true);
      const cooldowns = PHASES[id].cooldowns;
      if (cooldowns !== null) expect(Object.isFrozen(cooldowns)).toBe(true);
    }
    expect(() => { (PHASES["fase-1"] as unknown as Loose).orderFraction = 0.5; }).toThrow();
    expect(() => { (PHASES as unknown as Loose)["fase-3"] = {}; }).toThrow();
    expect(() => { (PHASES["fase-1"].cooldowns as unknown as Loose).operationStopMs = 1; }).toThrow();
    expect(() => { (PHASE_IDS as unknown as string[]).push("fase-3"); }).toThrow();
    expect(PHASES["fase-1"].orderFraction).toBe(0.01);
  });

  test("L9 every fraction is an exact multiple of one basis point and every cooldown a safe integer", () => {
    for (const id of ALL_PHASES) {
      const spec = PHASES[id];
      for (const fraction of [spec.orderFraction, spec.exposureCeilingFraction, spec.dailyLossFraction, spec.weeklyStopFraction, spec.drawdownStopFraction, spec.kellyFraction]) {
        if (fraction === null) continue;
        expect(Math.abs(fraction * 10_000 - Math.round(fraction * 10_000))).toBeLessThan(1e-9);
      }
      if (spec.cooldowns !== null) for (const value of Object.values(spec.cooldowns)) expect(Number.isSafeInteger(value)).toBe(true);
    }
  });

  test("L9 phases only tighten or hold the loss limits as they advance, and fase-0 allows nothing", () => {
    expect(PHASES["fase-0"].leverageCeiling).toBe(0);
    expect(PHASES["fase-0"].orderFraction).toBe(0);
    expect(PHASES["fase-0"].exposureCeilingFraction).toBe(0);
    expect(PHASES["fase-1"].dailyLossFraction).toBe(PHASES["fase-2"].dailyLossFraction);
    expect(PHASES["fase-1"].weeklyStopFraction).toBe(PHASES["fase-2"].weeklyStopFraction);
    expect(PHASES["fase-1"].drawdownStopFraction).toBe(PHASES["fase-2"].drawdownStopFraction);
    expect(PHASES["fase-1"].cooldowns).toEqual(PHASES["fase-2"].cooldowns);
  });
});

describe("deriveLimits", () => {
  const FASE_1_CAPITAL_100 = {
    phase: "fase-1", capitalUsd: 100, sigmaDaily: 0.04,
    orderFraction: 0.01, orderCapUsd: 1, exposureFraction: 0.25, exposureCapUsd: 25,
    dailyStopFraction: 0.02, dailyStopUsd: 2, weeklyStopFraction: 0.05, weeklyStopUsd: 5, drawdownStopFraction: 0.1, drawdownStopUsd: 10,
    cooldownOperationStopMs: 900_000, cooldownDailyStopMs: 86_400_000, cooldownWeeklyStopMs: 259_200_000, drawdownReactivation: "manual",
    leverageCeiling: 1, leverageCap: 1, liquidationDistanceFloor: null, unknown: [],
  };

  test("L10 fase-0 allows nothing: zero caps, and null where a limit does not apply", () => {
    expect(deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-0" })).toEqual({
      phase: "fase-0", capitalUsd: 100, sigmaDaily: 0.04,
      orderFraction: 0, orderCapUsd: 0, exposureFraction: 0, exposureCapUsd: 0,
      dailyStopFraction: null, dailyStopUsd: null, weeklyStopFraction: null, weeklyStopUsd: null, drawdownStopFraction: null, drawdownStopUsd: null,
      cooldownOperationStopMs: null, cooldownDailyStopMs: null, cooldownWeeklyStopMs: null, drawdownReactivation: null,
      leverageCeiling: 0, leverageCap: 0, liquidationDistanceFloor: null, unknown: [],
    });
  });

  test("L11 fase-1 with capital 100 USD: order cap 1 USD, stops 2, 5 and 10 USD, exposure 25%, leverage 1, cooldowns in ms", () => {
    expect(deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-1" })).toEqual(FASE_1_CAPITAL_100 as any);
  });

  test("L11 fase-1 with capital 80 USD (R$ 400): order cap 0.8 USD, stops 1.6, 4 and 8 USD, exposure cap 20 USD", () => {
    const limits = deriveLimits({ capitalUsd: 80, sigmaDaily: 0.04, phase: "fase-1" });
    expect([limits.orderCapUsd, limits.dailyStopUsd, limits.weeklyStopUsd, limits.drawdownStopUsd, limits.exposureCapUsd]).toEqual([0.8, 1.6, 4, 8, 20]);
  });

  test("L11 exposure is min(25%, 2% / (2 sigma)): BTC, ETH, SOL at 25% and MON at about 15% (R3 section 6)", () => {
    const fraction = (sigmaDaily: number) => deriveLimits({ capitalUsd: 100, sigmaDaily, phase: "fase-1" }).exposureFraction;
    expect(fraction(0.0196)).toBe(0.25);
    expect(fraction(0.0246)).toBe(0.25);
    expect(fraction(0.0325)).toBe(0.25);
    expect(fraction(0.04)).toBe(0.25);
    expect(fraction(0.05)).toBe(0.2);
    expect(fraction(0.06)).toBe(0.1666);
    near("MON", fraction(0.0667), 0.15, 0.001);
    expect(fraction(0.0667)).toBe(0.1499);
    expect(fraction(0.08)).toBe(0.125);
    expect(fraction(0.15)).toBe(0.0666);
    expect(deriveLimits({ capitalUsd: 100, sigmaDaily: 0.0667, phase: "fase-1" }).exposureCapUsd).toBe(14.99);
  });

  test("L12 fase-2: order cap 2%, leverage ceiling 2, liquidation floor, and an undefined effective cap without the Kelly lower bound", () => {
    expect(deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-2" })).toEqual({
      ...FASE_1_CAPITAL_100, phase: "fase-2", orderFraction: 0.02, orderCapUsd: 2, leverageCeiling: 2, leverageCap: null,
      liquidationDistanceFloor: 0.35, unknown: ["kellyLowerBound"],
    } as any);
  });

  test("L12 with a Kelly lower bound the cap is min(2, 0.25 x bound); a bound of zero means no leverage; null counts as absent", () => {
    const cap = (kellyLowerBound: number | undefined | null) =>
      deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-2", kellyLowerBound: kellyLowerBound as number | undefined });
    expect(cap(8).leverageCap).toBe(2);
    expect(cap(40).leverageCap).toBe(2);
    expect(cap(4).leverageCap).toBe(1);
    expect(cap(2.5).leverageCap).toBe(0.625);
    expect(cap(0).leverageCap).toBe(0);
    near("7.2658 -> 1.8164", cap(7.2658).leverageCap!, 1.8164, 1e-12);
    expect(cap(8).unknown).toEqual([]);
    expect(cap(null).leverageCap).toBeNull();
    expect(cap(undefined).unknown).toEqual(["kellyLowerBound"]);
  });

  test("L12 the liquidation floor follows sigma: 0.35 up to about 5.29% and the volatility term above it (rounded up to a basis point)", () => {
    const floor = (sigmaDaily: number) => deriveLimits({ capitalUsd: 100, sigmaDaily, phase: "fase-2" }).liquidationDistanceFloor;
    expect(floor(0.02)).toBe(0.35);
    expect(floor(0.0667)).toBe(0.4412);
    expect(floor(0.06)).toBe(0.3969);
    expect(deriveLimits({ capitalUsd: 100, sigmaDaily: 0.0667, phase: "fase-1" }).liquidationDistanceFloor).toBeNull();
  });

  test("L12 the Kelly bound is validated but changes nothing outside fase-2", () => {
    const base = deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-1" });
    expect(deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-1", kellyLowerBound: 50 })).toEqual(base);
    expect(deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-0", kellyLowerBound: 50 }).leverageCap).toBe(0);
    expect(() => deriveLimits({ capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-1", kellyLowerBound: -1 })).toThrow(RangeError);
  });

  test("L13 USD values are exact integers of micro-dollars: capital in cents gives amount = cents x basis points / 1e6", () => {
    // The largest capital here is 99999999.999 USD, inside the documented 0 < capitalUsd <= 1e9 domain.
    // A larger fixture (1234567890.12 USD) would contradict L14, which requires 1000000000.01 USD to be refused.
    const cents = [100, 8_000, 10_000, 12_345, 99_999, 100_000_000, 99_999_999_999];
    for (const c of cents) {
      const capitalUsd = c / 100;
      for (const [phase, orderBps] of [["fase-1", 100], ["fase-2", 200]] as const) {
        const limits = deriveLimits({ capitalUsd, sigmaDaily: 0.04, phase });
        const shown = { c, phase };
        expect({ ...shown, order: limits.orderCapUsd }).toEqual({ ...shown, order: (c * orderBps) / 1e6 });
        expect({ ...shown, daily: limits.dailyStopUsd }).toEqual({ ...shown, daily: (c * 200) / 1e6 });
        expect({ ...shown, weekly: limits.weeklyStopUsd }).toEqual({ ...shown, weekly: (c * 500) / 1e6 });
        expect({ ...shown, drawdown: limits.drawdownStopUsd }).toEqual({ ...shown, drawdown: (c * 1000) / 1e6 });
        expect({ ...shown, exposure: limits.exposureCapUsd }).toEqual({ ...shown, exposure: (c * 2500) / 1e6 });
        expect(limits.capitalUsd).toBe(capitalUsd);
      }
    }
  });

  test("L13 across random capitals and volatilities nothing is NaN or infinite, USD has at most 6 decimals, and no cap is ever rounded up", () => {
    const random = mulberry32(20261010);
    for (let round = 0; round < 400; round += 1) {
      // Capital that is a whole number of micro-dollars (the unit the module reads), from cents to millions of dollars.
      const capitalMicro = Math.max(1, Math.round(random() * 10 ** (1 + Math.floor(random() * 6)) * 1_000_000));
      const capitalUsd = capitalMicro / 1_000_000;
      const sigmaDaily = 0.002 + random() * 0.2;
      for (const phase of ["fase-1", "fase-2"] as const) {
        const limits = deriveLimits({ capitalUsd, sigmaDaily, phase, kellyLowerBound: random() * 10 });
        const exactFraction = Math.min(0.25, 0.02 / (2 * sigmaDaily));
        // Each USD value is compared with the exact amount for the fraction it was derived from.
        const usd: readonly (readonly [string, number | null, number])[] = [
          ["orderCapUsd", limits.orderCapUsd, capitalUsd * PHASES[phase].orderFraction],
          ["dailyStopUsd", limits.dailyStopUsd, capitalUsd * 0.02],
          ["weeklyStopUsd", limits.weeklyStopUsd, capitalUsd * 0.05],
          ["drawdownStopUsd", limits.drawdownStopUsd, capitalUsd * 0.1],
          ["exposureCapUsd", limits.exposureCapUsd, capitalUsd * limits.exposureFraction],
        ];
        for (const [name, value, exact] of usd) {
          const shown = { name, capitalUsd, sigmaDaily, phase };
          expect({ ...shown, finite: Number.isFinite(value) }).toEqual({ ...shown, finite: true });
          expect({ ...shown, sixDecimals: Number(value!.toFixed(6)) === value }).toEqual({ ...shown, sixDecimals: true });
          expect({ ...shown, notAbove: value! <= exact + 1e-9 * Math.max(1, exact) }).toEqual({ ...shown, notAbove: true });
          expect({ ...shown, closeBelow: exact - value! <= 1.5e-6 + 1e-9 * Math.max(1, exact) }).toEqual({ ...shown, closeBelow: true });
        }
        expect(limits.exposureCapUsd).toBeLessThanOrEqual(capitalUsd * exactFraction + 1e-9 * Math.max(1, capitalUsd));
        expect(limits.exposureFraction).toBeLessThanOrEqual(exactFraction + 1e-12);
        expect(limits.exposureFraction).toBeGreaterThan(exactFraction - 1.0001e-4);
        const exactFloor = Math.max(0.35, 2.5 * sigmaDaily * Math.sqrt(7));
        if (phase === "fase-2") {
          expect(limits.liquidationDistanceFloor!).toBeGreaterThanOrEqual(exactFloor - 1e-12);
          expect(limits.liquidationDistanceFloor!).toBeLessThan(exactFloor + 1.0001e-4);
          expect(limits.leverageCap!).toBeLessThanOrEqual(2);
          expect(limits.leverageCap!).toBeGreaterThanOrEqual(0);
        }
        for (const value of [limits.cooldownOperationStopMs, limits.cooldownDailyStopMs, limits.cooldownWeeklyStopMs]) expect(Number.isSafeInteger(value)).toBe(true);
      }
    }
  });

  test("L13 sub-micro-dollar capital precision is rounded to the nearest micro-dollar, never into noise (33.333333 and 0.1 + 0.2)", () => {
    expect(deriveLimits({ capitalUsd: 33.333333, sigmaDaily: 0.04, phase: "fase-1" }).orderCapUsd).toBe(0.333333);
    expect(deriveLimits({ capitalUsd: 0.1 + 0.2, sigmaDaily: 0.04, phase: "fase-1" }).capitalUsd).toBe(0.3);
    expect(deriveLimits({ capitalUsd: 0.1 + 0.2, sigmaDaily: 0.04, phase: "fase-1" }).orderCapUsd).toBe(0.003);
    expect(deriveLimits({ capitalUsd: 1_000_000_000, sigmaDaily: 0.04, phase: "fase-1" }).orderCapUsd).toBe(10_000_000);
  });

  test("L14 refuses missing or invalid input instead of assuming a default", () => {
    const valid = { capitalUsd: 100, sigmaDaily: 0.04, phase: "fase-1" } as const;
    const attempt = (over: Loose) => () => deriveLimits({ ...valid, ...over } as any);
    for (const phase of ["fase-3", "", "FASE-1", "fase-1 ", undefined, null, 1, "__proto__", "constructor"]) expect(attempt({ phase })).toThrow(RangeError);
    for (const capitalUsd of [Number.NaN, 0, -1, Infinity, "100", undefined, null, 1_000_000_000.01, 1e-7, true]) expect(attempt({ capitalUsd })).toThrow(RangeError);
    for (const sigmaDaily of [Number.NaN, 0, 1, 4, -0.04, Infinity, "0.04", undefined, null]) expect(attempt({ sigmaDaily })).toThrow(RangeError);
    for (const kellyLowerBound of [-1, Number.NaN, "2", Infinity, true]) expect(attempt({ kellyLowerBound })).toThrow(RangeError);
    expect(() => (deriveLimits as any)()).toThrow();
    expect(() => deriveLimits(null as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// checkSettings
// ---------------------------------------------------------------------------

const PHASE_1_OK: Loose = {
  capitalUsd: 100, sigmaDaily: 0.04,
  leverage: 1, maxPlanUsd: 1, maxCapitalFractionPerPlan: 0.01, maxDailyNotionalUsd: 20, maxDailyPlans: 4,
  cooldownMs: 900_000, dailyStopCooldownMs: 86_400_000, weeklyStopCooldownMs: 259_200_000, drawdownManualReactivation: true,
  dailyStopPct: 0.02, weeklyStopPct: 0.05, drawdownStopPct: 0.1,
  killSwitchConfigured: true, dedicatedWallet: true,
};
const PHASE_2_OK: Loose = {
  ...PHASE_1_OK, maxPlanUsd: 2, maxCapitalFractionPerPlan: 0.02, leverage: 2,
  outOfSampleEdgeValidated: true, kellyLowerBound: 8, liquidationDistancePct: 0.5,
};
const PHASE_0_OK: Loose = { leverage: 0, maxPlanUsd: 0, maxCapitalFractionPerPlan: 0, maxDailyNotionalUsd: 0 };

const REQUIRED_PHASE_0 = ["leverage", "maxPlanUsd", "maxCapitalFractionPerPlan", "maxDailyNotionalUsd"];
const REQUIRED_PHASE_1 = [
  "capitalUsd", "sigmaDaily", "leverage", "maxPlanUsd", "maxCapitalFractionPerPlan", "maxDailyNotionalUsd", "cooldownMs",
  "dailyStopCooldownMs", "weeklyStopCooldownMs", "drawdownManualReactivation", "dailyStopPct", "weeklyStopPct", "drawdownStopPct",
  "killSwitchConfigured", "dedicatedWallet",
];
const REQUIRED_PHASE_2 = [...REQUIRED_PHASE_1, "outOfSampleEdgeValidated"];

const without = (settings: Loose, ...keys: string[]): Loose => {
  const copy = { ...settings };
  for (const key of keys) delete copy[key];
  return copy;
};

describe("checkSettings", () => {
  test("L15 the default phase is fase-0: any non-zero leverage is a violation, and the report names the phase it used", () => {
    const report = checkSettings({ leverage: 1 });
    expect(report.phase).toBe("fase-0");
    expect(report.ok).toBe(false);
    expect(report.violations.find((entry) => entry.id === "leverage")).toMatchObject({ id: "leverage", actual: 1, limit: 0 });
    expect(checkSettings({ leverage: 1 }, undefined).phase).toBe("fase-0");
    expect(ids(checkSettings({ ...PHASE_0_OK, leverage: 0.0001 }).violations)).toEqual(["leverage"]);
    expect(ids(checkSettings({ ...PHASE_0_OK, leverage: 1 }).violations)).toEqual(["leverage"]);
    expect(checkSettings(PHASE_0_OK).ok).toBe(true);
  });

  test("L15 a settings object that satisfies fase-1 is still judged by fase-0 unless fase-1 is chosen explicitly", () => {
    const implicit = checkSettings(PHASE_1_OK);
    expect(implicit.phase).toBe("fase-0");
    expect(implicit.ok).toBe(false);
    expect(checkSettings(PHASE_1_OK, "fase-0").ok).toBe(false);
    const explicit = checkSettings(PHASE_1_OK, "fase-1");
    expect(explicit.phase).toBe("fase-1");
    expect(explicit).toEqual({ phase: "fase-1", ok: true, violations: [], unknown: [] });
  });

  test("L15 an unknown phase is an error, never a guess", () => {
    for (const phase of ["fase-3", "", "FASE-1", null, 1, "__proto__"]) expect(() => checkSettings(PHASE_1_OK, phase as any)).toThrow(RangeError);
  });

  test("L15 the report has exactly the documented shape and ok is true only for no violations and no unknowns", () => {
    const report = checkSettings({ ...PHASE_1_OK, leverage: 2 }, "fase-1");
    expect(Object.keys(report)).toEqual(["phase", "ok", "violations", "unknown"]);
    expect(Object.keys(report.violations[0]!)).toEqual(["id", "message", "actual", "limit"]);
    for (const entry of report.violations) {
      expect(entry.message.startsWith(entry.id)).toBe(true);
      expect(entry.message.length).toBeGreaterThan(entry.id.length + 5);
    }
    const random = mulberry32(7);
    for (let round = 0; round < 200; round += 1) {
      const settings: Loose = {};
      for (const key of POLICY_SETTINGS_FIELDS) {
        if (random() < 0.5) continue;
        settings[key] = random() < 0.5 ? Math.round(random() * 100) / 100 : random() < 0.5;
      }
      for (const phase of ALL_PHASES) {
        const result = checkSettings(settings, phase);
        expect(result.ok).toBe(result.violations.length === 0 && result.unknown.length === 0);
      }
    }
  });

  test("L16 an empty object is never ok, and every required field is reported as unknown in a fixed order", () => {
    const expected: Record<PhaseId, string[]> = { "fase-0": REQUIRED_PHASE_0, "fase-1": REQUIRED_PHASE_1, "fase-2": REQUIRED_PHASE_2 };
    for (const phase of ALL_PHASES) {
      const report = checkSettings({}, phase);
      expect({ phase, ok: report.ok }).toEqual({ phase, ok: false });
      expect({ phase, violations: report.violations }).toEqual({ phase, violations: [] });
      expect({ phase, unknown: report.unknown }).toEqual({ phase, unknown: expected[phase] });
    }
    const canonical = [...POLICY_SETTINGS_FIELDS];
    for (const phase of ALL_PHASES) {
      const order = checkSettings({}, phase).unknown.map((name) => canonical.indexOf(name as any));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  test("L16 null counts as absent, non-objects count as an empty object, and an absent field is never read as zero or false", () => {
    const nulls = Object.fromEntries(REQUIRED_PHASE_1.map((key) => [key, null]));
    expect(checkSettings(nulls, "fase-1").unknown).toEqual(REQUIRED_PHASE_1);
    for (const nonObject of [null, undefined, [], "settings", 5, true]) {
      expect(checkSettings(nonObject as any, "fase-1")).toEqual({ phase: "fase-1", ok: false, violations: [], unknown: REQUIRED_PHASE_1 });
    }
    expect(checkSettings({ leverage: 0 }, "fase-0").unknown).toEqual(["maxPlanUsd", "maxCapitalFractionPerPlan", "maxDailyNotionalUsd"]);
    expect(checkSettings({ leverage: 0 }, "fase-0").ok).toBe(false);
    expect(checkSettings(without(PHASE_1_OK, "killSwitchConfigured"), "fase-1")).toMatchObject({ ok: false, violations: [], unknown: ["killSwitchConfigured"] });
    expect(checkSettings(without(PHASE_1_OK, "dedicatedWallet"), "fase-1")).toMatchObject({ ok: false, violations: [], unknown: ["dedicatedWallet"] });
    expect(checkSettings(without(PHASE_1_OK, "leverage"), "fase-1")).toMatchObject({ ok: false, violations: [], unknown: ["leverage"] });
  });

  test("L16 inherited properties do not count as provided fields", () => {
    const inherited = Object.create({ leverage: 1, killSwitchConfigured: true });
    expect(checkSettings(inherited, "fase-1").unknown).toEqual(REQUIRED_PHASE_1);
  });

  test("L16 a missing input that would decide a check is reported by name, not guessed", () => {
    expect(checkSettings(without(PHASE_1_OK, "capitalUsd"), "fase-1")).toMatchObject({ ok: false, violations: [], unknown: ["capitalUsd"] });
    expect(checkSettings(without(PHASE_1_OK, "sigmaDaily"), "fase-1")).toMatchObject({ ok: false, violations: [], unknown: ["sigmaDaily"] });
    expect(checkSettings(without(PHASE_1_OK, "capitalUsd", "sigmaDaily"), "fase-1").unknown).toEqual(["capitalUsd", "sigmaDaily"]);
  });

  // field, bad values, phase
  const INVALID_VALUES: readonly (readonly [string, readonly unknown[]])[] = [
    ["capitalUsd", ["100", 0, -5, Number.NaN, Infinity, true, 1_000_000_001, {}]],
    ["sigmaDaily", ["0.04", 0, -0.04, 1, 4, Number.NaN, true]],
    ["leverage", ["1", -1, Number.NaN, Infinity, true, {}, []]],
    ["maxPlanUsd", ["1", -1, Number.NaN, Infinity, true]],
    ["maxCapitalFractionPerPlan", ["0.01", -0.01, Number.NaN, Infinity, true]],
    ["maxDailyNotionalUsd", ["20", -1, Number.NaN, Infinity, false]],
    ["maxDailyPlans", ["4", -1, 1.5, Number.NaN, Infinity, true]],
    ["cooldownMs", ["900000", -1, Number.NaN, Infinity, true]],
    ["dailyStopCooldownMs", ["86400000", -1, Number.NaN, true]],
    ["weeklyStopCooldownMs", ["259200000", -1, Number.NaN, true]],
    ["drawdownManualReactivation", ["true", 1, 0, "yes", {}]],
    ["dailyStopPct", ["0.02", 0, -0.02, Number.NaN, Infinity, true]],
    ["weeklyStopPct", ["0.05", 0, -0.05, Number.NaN, true]],
    ["drawdownStopPct", ["0.1", 0, -0.1, Number.NaN, true]],
    ["killSwitchConfigured", ["true", 1, 0, "yes", {}]],
    ["dedicatedWallet", ["true", 1, 0, "yes", []]],
  ];

  test("L17 an invalid value in any field is exactly one violation with actual null, is never converted, and is not 'unknown'", () => {
    for (const [field, values] of INVALID_VALUES) {
      for (const bad of values) {
        const report = checkSettings({ ...PHASE_1_OK, [field]: bad }, "fase-1");
        const shown = { field, bad: String(bad) };
        expect({ ...shown, ids: ids(report.violations) }).toEqual({ ...shown, ids: [field] });
        expect({ ...shown, actual: report.violations[0]!.actual }).toEqual({ ...shown, actual: null });
        expect({ ...shown, unknown: report.unknown }).toEqual({ ...shown, unknown: [] });
        expect({ ...shown, ok: report.ok }).toEqual({ ...shown, ok: false });
      }
    }
  });

  test("L17 fase-2 only fields are validated too: Kelly bound, evidence flag and liquidation distance", () => {
    const attempt = (field: string, bad: unknown, base: Loose = PHASE_2_OK) => checkSettings({ ...base, [field]: bad }, "fase-2");
    for (const bad of ["8", -1, Number.NaN, Infinity, true]) expect(ids(attempt("kellyLowerBound", bad).violations)).toEqual(["kellyLowerBound"]);
    for (const bad of ["true", 1, 0, {}]) expect(ids(attempt("outOfSampleEdgeValidated", bad).violations)).toEqual(["outOfSampleEdgeValidated"]);
    for (const bad of ["0.5", 0, -0.5, 1.5, 50, Number.NaN, true]) expect(ids(attempt("liquidationDistancePct", bad).violations)).toEqual(["liquidationDistancePct"]);
  });

  test("L17 numbers that JSON can carry but cannot be real (1e999 parses to Infinity) are invalid, not huge", () => {
    const parsed = JSON.parse('{"leverage": 1e999, "maxPlanUsd": 0}') as Loose;
    expect(parsed.leverage).toBe(Infinity);
    expect(ids(checkSettings({ ...PHASE_1_OK, ...parsed }, "fase-1").violations)).toEqual(["leverage"]);
  });

  test("L18 fase-0 requires leverage and every execution allowance to be zero, and ignores the other fields", () => {
    expect(checkSettings(PHASE_0_OK, "fase-0")).toEqual({ phase: "fase-0", ok: true, violations: [], unknown: [] });
    expect(checkSettings({ ...PHASE_0_OK, maxDailyPlans: 0 }, "fase-0").ok).toBe(true);
    for (const field of ["leverage", "maxPlanUsd", "maxCapitalFractionPerPlan", "maxDailyNotionalUsd", "maxDailyPlans"]) {
      const report = checkSettings({ ...PHASE_0_OK, [field]: 3 }, "fase-0");
      expect({ field, ids: ids(report.violations), ok: report.ok }).toEqual({ field, ids: [field], ok: false });
      expect(report.violations[0]).toMatchObject({ actual: 3, limit: 0 });
    }
    const noise = { ...PHASE_0_OK, dailyStopPct: "x", killSwitchConfigured: "yes", capitalUsd: -1, sigmaDaily: 9, cooldownMs: "no", kellyLowerBound: "?" };
    expect(checkSettings(noise, "fase-0")).toEqual({ phase: "fase-0", ok: true, violations: [], unknown: [] });
  });

  test("L18 the fase-1 configuration is rejected by fase-0 field by field (the execution allowances and leverage)", () => {
    expect(ids(checkSettings(PHASE_1_OK, "fase-0").violations)).toEqual(["leverage", "maxPlanUsd", "maxCapitalFractionPerPlan", "maxDailyNotionalUsd", "maxDailyPlans"]);
  });

  test("L19 a complete configuration inside the fase-1 envelope is ok", () => {
    expect(checkSettings(PHASE_1_OK, "fase-1")).toEqual({ phase: "fase-1", ok: true, violations: [], unknown: [] });
    expect(checkSettings({ ...PHASE_1_OK, maxDailyPlans: 100000 }, "fase-1").ok).toBe(true);
    expect(checkSettings(without(PHASE_1_OK, "maxDailyPlans"), "fase-1").ok).toBe(true);
    expect(checkSettings({ ...PHASE_1_OK, someOtherField: "ignored", apiKey: "SYNTHETIC_CANARY" }, "fase-1")).toEqual({ phase: "fase-1", ok: true, violations: [], unknown: [] });
  });

  const MUTATIONS: readonly { name: string; over: Loose; id: string; actual: number | boolean; limit: number | boolean }[] = [
    { name: "leverage above 1", over: { leverage: 1.5 }, id: "leverage", actual: 1.5, limit: 1 },
    { name: "order above 1% of capital in USD", over: { maxPlanUsd: 1.01 }, id: "maxPlanUsd", actual: 1.01, limit: 1 },
    { name: "order above 1% as a fraction (the micro profile 5%)", over: { maxCapitalFractionPerPlan: 0.05 }, id: "maxCapitalFractionPerPlan", actual: 0.05, limit: 0.01 },
    { name: "daily notional above the 25% ceiling", over: { maxDailyNotionalUsd: 26 }, id: "maxDailyNotionalUsd", actual: 26, limit: 25 },
    { name: "daily stop looser than 2%", over: { dailyStopPct: 0.03 }, id: "dailyStopPct", actual: 0.03, limit: 0.02 },
    { name: "weekly stop looser than 5%", over: { weeklyStopPct: 0.06 }, id: "weeklyStopPct", actual: 0.06, limit: 0.05 },
    { name: "drawdown stop looser than 10%", over: { drawdownStopPct: 0.11 }, id: "drawdownStopPct", actual: 0.11, limit: 0.1 },
    { name: "operation cooldown under 15 minutes", over: { cooldownMs: 899_999 }, id: "cooldownMs", actual: 899_999, limit: 900_000 },
    { name: "daily-stop cooldown under 24 hours", over: { dailyStopCooldownMs: 3_600_000 }, id: "dailyStopCooldownMs", actual: 3_600_000, limit: 86_400_000 },
    { name: "weekly-stop cooldown under 72 hours", over: { weeklyStopCooldownMs: 86_400_000 }, id: "weeklyStopCooldownMs", actual: 86_400_000, limit: 259_200_000 },
    { name: "automatic reactivation after drawdown", over: { drawdownManualReactivation: false }, id: "drawdownManualReactivation", actual: false, limit: true },
    { name: "no kill switch", over: { killSwitchConfigured: false }, id: "killSwitchConfigured", actual: false, limit: true },
    { name: "wallet not dedicated", over: { dedicatedWallet: false }, id: "dedicatedWallet", actual: false, limit: true },
  ];

  test("L19 each rule broken on its own yields exactly its violation, with the actual and the limit", () => {
    for (const { name, over, id, actual, limit } of MUTATIONS) {
      const report = checkSettings({ ...PHASE_1_OK, ...over }, "fase-1");
      expect({ name, ids: ids(report.violations), ok: report.ok, unknown: report.unknown }).toEqual({ name, ids: [id], ok: false, unknown: [] });
      expect({ name, violation: report.violations[0] }).toEqual({ name, violation: expect.objectContaining({ id, actual, limit }) });
    }
  });

  test("L19 the boundary itself is accepted and float noise does not create violations", () => {
    expect(checkSettings({ ...PHASE_1_OK, leverage: 1 + 1e-12 }, "fase-1").ok).toBe(true);
    expect(checkSettings({ ...PHASE_1_OK, maxCapitalFractionPerPlan: 0.1 * 0.1 }, "fase-1").ok).toBe(true);
    expect(checkSettings({ ...PHASE_1_OK, capitalUsd: 30, maxPlanUsd: 0.1 + 0.2, maxDailyNotionalUsd: 5 }, "fase-1").ok).toBe(true);
    expect(checkSettings({ ...PHASE_1_OK, capitalUsd: 80, maxPlanUsd: 80 * 0.01, maxDailyNotionalUsd: 20 }, "fase-1").ok).toBe(true);
    expect(checkSettings({ ...PHASE_1_OK, maxDailyNotionalUsd: 25 }, "fase-1").ok).toBe(true);
    expect(ids(checkSettings({ ...PHASE_1_OK, maxPlanUsd: 1.000002 }, "fase-1").violations)).toEqual(["maxPlanUsd"]);
    expect(checkSettings({ ...PHASE_1_OK, dailyStopPct: 0.01, weeklyStopPct: 0.001, drawdownStopPct: 0.05, cooldownMs: 3_600_000 }, "fase-1").ok).toBe(true);
    expect(checkSettings({ ...PHASE_1_OK, leverage: 0, maxPlanUsd: 0, maxCapitalFractionPerPlan: 0, maxDailyNotionalUsd: 0 }, "fase-1").ok).toBe(true);
  });

  test("L19 stops are fractions: a value in percentage points is a violation, with a hint, never a pass", () => {
    for (const [field, pointValue] of [["dailyStopPct", 2], ["weeklyStopPct", 5], ["drawdownStopPct", 10]] as const) {
      const report = checkSettings({ ...PHASE_1_OK, [field]: pointValue }, "fase-1");
      expect(ids(report.violations)).toEqual([field]);
      expect(report.violations[0]).toMatchObject({ actual: pointValue });
      expect(report.violations[0]!.message).toContain("pontos percentuais");
    }
    expect(ids(checkSettings({ ...PHASE_1_OK, dailyStopPct: 0.5 }, "fase-1").violations)).toEqual(["dailyStopPct"]);
    expect(checkSettings({ ...PHASE_1_OK, dailyStopPct: 0 }, "fase-1").violations[0]!.message).not.toContain("pontos percentuais");
  });

  test("L19 the daily notional is held to f x capital: 25% at sigma 4%, about 15% at sigma 6.67%", () => {
    const at = (sigmaDaily: number, maxDailyNotionalUsd: number) => checkSettings({ ...PHASE_1_OK, sigmaDaily, maxDailyNotionalUsd }, "fase-1");
    expect(at(0.04, 25).ok).toBe(true);
    expect(at(0.0667, 14.99).ok).toBe(true);
    const over = at(0.0667, 20);
    expect(ids(over.violations)).toEqual(["maxDailyNotionalUsd"]);
    expect(over.violations[0]).toMatchObject({ actual: 20, limit: 14.99 });
    expect(at(0.06, 16.66).ok).toBe(true);
    expect(ids(at(0.06, 16.67).violations)).toEqual(["maxDailyNotionalUsd"]);
  });

  test("L19 without sigma the daily notional is unknown below the 25% ceiling and a certain violation above it", () => {
    const noSigma = (maxDailyNotionalUsd: number) => checkSettings({ ...without(PHASE_1_OK, "sigmaDaily"), maxDailyNotionalUsd }, "fase-1");
    expect(noSigma(20)).toMatchObject({ ok: false, violations: [], unknown: ["sigmaDaily"] });
    expect(noSigma(26)).toMatchObject({ ok: false, unknown: ["sigmaDaily"] });
    expect(ids(noSigma(26).violations)).toEqual(["maxDailyNotionalUsd"]);
    expect(noSigma(26).violations[0]).toMatchObject({ limit: 25 });
  });

  test("L19 without capital the USD checks cannot run: capital is unknown and nothing is guessed", () => {
    const report = checkSettings(without(PHASE_1_OK, "capitalUsd"), "fase-1");
    expect(report).toMatchObject({ ok: false, violations: [], unknown: ["capitalUsd"] });
    const huge = checkSettings({ ...without(PHASE_1_OK, "capitalUsd"), maxPlanUsd: 1_000_000, maxCapitalFractionPerPlan: 0.5 }, "fase-1");
    expect(ids(huge.violations)).toEqual(["maxCapitalFractionPerPlan"]);
    expect(huge.unknown).toEqual(["capitalUsd"]);
  });

  test("L19 the micro profile described in D8 (5 USD or 5% per plan, 20 USD and 4 plans a day, 15 minutes) breaks the fase-1 order cap", () => {
    const micro = { capitalUsd: 100, leverage: 1, maxPlanUsd: 5, maxCapitalFractionPerPlan: 0.05, maxDailyNotionalUsd: 20, maxDailyPlans: 4, cooldownMs: 900_000 };
    const report = checkSettings(micro, "fase-1");
    expect(ids(report.violations)).toEqual(["maxPlanUsd", "maxCapitalFractionPerPlan"]);
    expect(report.unknown).toEqual([
      "sigmaDaily", "dailyStopCooldownMs", "weeklyStopCooldownMs", "drawdownManualReactivation", "dailyStopPct", "weeklyStopPct", "drawdownStopPct",
      "killSwitchConfigured", "dedicatedWallet",
    ]);
    expect(report.ok).toBe(false);
  });

  test("L20 a complete configuration inside the fase-2 envelope is ok", () => {
    expect(checkSettings(PHASE_2_OK, "fase-2")).toEqual({ phase: "fase-2", ok: true, violations: [], unknown: [] });
  });

  test("L20 without the out-of-sample evidence flag fase-2 fails: absent is unknown, false is a violation, anything else is invalid", () => {
    const missing = checkSettings(without(PHASE_2_OK, "outOfSampleEdgeValidated"), "fase-2");
    expect(missing).toMatchObject({ ok: false, violations: [], unknown: ["outOfSampleEdgeValidated"] });
    const denied = checkSettings({ ...PHASE_2_OK, outOfSampleEdgeValidated: false }, "fase-2");
    expect(denied.ok).toBe(false);
    expect(denied.violations).toEqual([expect.objectContaining({ id: "outOfSampleEdgeValidated", actual: false, limit: true })]);
    expect(ids(checkSettings({ ...PHASE_2_OK, outOfSampleEdgeValidated: "true" }, "fase-2").violations)).toEqual(["outOfSampleEdgeValidated"]);
    expect(checkSettings({ ...PHASE_1_OK }, "fase-2").unknown).toContain("outOfSampleEdgeValidated");
    expect(checkSettings({ ...PHASE_1_OK, outOfSampleEdgeValidated: true }, "fase-1").ok).toBe(true);
  });

  test("L20 leverage is capped at 2 and at a quarter of the Kelly lower bound", () => {
    const withLeverage = (leverage: number, kelly: number | undefined) =>
      checkSettings({ ...PHASE_2_OK, leverage, kellyLowerBound: kelly, liquidationDistancePct: 0.5 }, "fase-2");
    expect(withLeverage(2, 8).ok).toBe(true);
    const tooMuch = withLeverage(2, 4);
    expect(ids(tooMuch.violations)).toEqual(["leverage"]);
    expect(tooMuch.violations[0]).toMatchObject({ actual: 2, limit: 1 });
    expect(withLeverage(1, 4).ok).toBe(true);
    expect(withLeverage(0.5, 2).ok).toBe(true);
    expect(ids(withLeverage(0.5, 1.9).violations)).toEqual(["leverage"]);
    expect(ids(withLeverage(1, 0).violations)).toEqual(["leverage"]);
    const ceiling = withLeverage(3, 100);
    expect(ids(ceiling.violations)).toEqual(["leverage"]);
    expect(ceiling.violations[0]).toMatchObject({ actual: 3, limit: 2 });
  });

  test("L20 a leverage above the ceiling is a violation even when the Kelly bound is unknown; below it, the bound is required", () => {
    const noBound = (leverage: number) => checkSettings(without({ ...PHASE_2_OK, leverage }, "kellyLowerBound"), "fase-2");
    expect(ids(noBound(3).violations)).toEqual(["leverage"]);
    expect(noBound(3).unknown).toEqual([]);
    expect(noBound(1)).toMatchObject({ ok: false, violations: [], unknown: ["kellyLowerBound"] });
    expect(noBound(0.5).unknown).toEqual(["kellyLowerBound"]);
    expect(noBound(0)).toMatchObject({ ok: true, violations: [], unknown: [] });
  });

  test("L20 above 1x the distance to liquidation must reach the floor max(35%, 2.5 sigma sqrt(7)); at or below 1x it is not asked for", () => {
    const at = (liquidationDistancePct: number | undefined, sigmaDaily = 0.04, leverage = 2) =>
      checkSettings({ ...PHASE_2_OK, sigmaDaily, leverage, liquidationDistancePct, maxDailyNotionalUsd: 10 }, "fase-2");
    expect(at(0.35).ok).toBe(true);
    const near35 = at(0.34);
    expect(ids(near35.violations)).toEqual(["liquidationDistancePct"]);
    expect(near35.violations[0]).toMatchObject({ actual: 0.34, limit: 0.35 });
    expect(at(undefined)).toMatchObject({ ok: false, violations: [], unknown: ["liquidationDistancePct"] });
    expect(ids(at(0.44, 0.0667).violations)).toEqual(["liquidationDistancePct"]);
    expect(at(0.4412, 0.0667).ok).toBe(true);
    expect(at(undefined, 0.04, 1).ok).toBe(true);
    expect(at(0.01, 0.04, 1).ok).toBe(true);
  });

  test("L20 fase-2 allows an order up to 2% but keeps the stops, cooldowns, kill switch and dedicated wallet of fase-1", () => {
    expect(checkSettings({ ...PHASE_2_OK, maxPlanUsd: 2.01 }, "fase-2").violations[0]).toMatchObject({ id: "maxPlanUsd", limit: 2 });
    expect(ids(checkSettings({ ...PHASE_2_OK, maxCapitalFractionPerPlan: 0.021 }, "fase-2").violations)).toEqual(["maxCapitalFractionPerPlan"]);
    expect(ids(checkSettings({ ...PHASE_1_OK, leverage: 1, outOfSampleEdgeValidated: true, kellyLowerBound: 4 }, "fase-2").violations)).toEqual([]);
    for (const { name, over, id } of MUTATIONS.filter((entry) => !["leverage above 1", "order above 1% of capital in USD", "order above 1% as a fraction (the micro profile 5%)"].includes(entry.name))) {
      const report = checkSettings({ ...PHASE_2_OK, ...over }, "fase-2");
      expect({ name, ids: ids(report.violations) }).toEqual({ name, ids: [id] });
    }
  });
});

// ---------------------------------------------------------------------------
// Purity, text hygiene, traceability
// ---------------------------------------------------------------------------

/** Executable code only: comments are dropped by the transpiler and whitespace is collapsed. */
function codeOf(path: string): string {
  return new Bun.Transpiler({ loader: "ts" }).transformSync(readFileSync(path, "utf8")).replace(/\s+/g, " ");
}

/** Byte sequences of: middle dot, en dash, em dash, minus sign, bullet, bullet operator, dot operator, hyphenation point, katakana middle dot. */
const BANNED_SEQUENCES: readonly (readonly number[])[] = [
  [0xc2, 0xb7], [0xe2, 0x80, 0x93], [0xe2, 0x80, 0x94], [0xe2, 0x88, 0x92], [0xe2, 0x80, 0xa2],
  [0xe2, 0x88, 0x99], [0xe2, 0x8b, 0x85], [0xe2, 0x80, 0xa7], [0xe3, 0x83, 0xbb],
];

function bannedBytesIn(path: string): string[] {
  const bytes = readFileSync(path);
  return BANNED_SEQUENCES.filter((sequence) => bytes.indexOf(Buffer.from(sequence)) !== -1).map((sequence) => sequence.map((byte) => byte.toString(16)).join(" "));
}

describe("purity of the module", () => {
  test("L25 src/policy/envelope.ts has no import, environment, file, network, clock or randomness access", () => {
    const code = codeOf(MODULE_PATH);
    const literal = [
      "process.env", "Bun.env", "import.meta", "Bun.file", "Bun.write", "Bun.spawn", "Bun.serve", "fetch(", "WebSocket", "XMLHttpRequest",
      "node:", "require(", "Date.now", "new Date", "Math.random", "randomUUID", "crypto.", "performance.now", "setTimeout", "setInterval", "queueMicrotask",
      "globalThis", "eval(", "new Function", "console.", "await ", "async ",
    ];
    for (const token of literal) expect({ token, found: code.includes(token) }).toEqual({ token, found: false });
    for (const pattern of [/\bDate\b/, /\bprocess\b/, /\bBun\b/, /\bcrypto\b/, /\bperformance\b/, /\bimport\b/, /\brequire\b/, /\bexport default\b/]) {
      expect({ pattern: String(pattern), found: pattern.test(code) }).toEqual({ pattern: String(pattern), found: false });
    }
    const source = readFileSync(MODULE_PATH, "utf8");
    expect(/^\s*import\s/m.test(source)).toBe(false);
    for (const word of ["ethers", "Wallet", "signTransaction", "sendTransaction", "Provider"]) expect({ word, found: code.includes(word) }).toEqual({ word, found: false });
  });

  test("L25 exports exactly the documented API and no function that selects, infers or promotes a phase", () => {
    expect(Object.keys(envelope).sort()).toEqual([
      "PHASES", "PHASE_IDS", "POLICY_SETTINGS_FIELDS", "checkSettings", "deriveLimits", "kellyLeverage", "kellyLowerBound", "liquidationDistanceFloor",
      "logGrowthPerDay", "maxExposureFraction", "medianWealthNoEdge", "normalCdf", "touchLiquidationProbability", "volatilityDragPerDay",
    ].sort());
    for (const name of Object.keys(envelope)) expect({ name, suspicious: /select|infer|promote|recommend|detect|authori[sz]e|execute|sign|send/i.test(name) }).toEqual({ name, suspicious: false });
    expect([...POLICY_SETTINGS_FIELDS]).toEqual([
      "capitalUsd", "sigmaDaily", "leverage", "maxPlanUsd", "maxCapitalFractionPerPlan", "maxDailyNotionalUsd", "maxDailyPlans",
      "cooldownMs", "dailyStopCooldownMs", "weeklyStopCooldownMs", "drawdownManualReactivation", "dailyStopPct", "weeklyStopPct", "drawdownStopPct",
      "killSwitchConfigured", "dedicatedWallet", "outOfSampleEdgeValidated", "kellyLowerBound", "liquidationDistancePct",
    ]);
  });

  test("L25 results do not depend on the environment, the clock or call order (same input, same output, twice)", () => {
    const first = JSON.stringify([deriveLimits({ capitalUsd: 80, sigmaDaily: 0.04, phase: "fase-1" }), checkSettings(PHASE_1_OK, "fase-1"), normalCdf(-1.234), touchLiquidationProbability(5, 0.04, 7)]);
    const second = JSON.stringify([deriveLimits({ capitalUsd: 80, sigmaDaily: 0.04, phase: "fase-1" }), checkSettings(PHASE_1_OK, "fase-1"), normalCdf(-1.234), touchLiquidationProbability(5, 0.04, 7)]);
    expect(second).toBe(first);
    const frozenInput = Object.freeze({ ...PHASE_1_OK });
    expect(checkSettings(frozenInput, "fase-1").ok).toBe(true);
    expect(frozenInput).toEqual(PHASE_1_OK);
  });
});

describe("text hygiene and traceability", () => {
  const DOC = readFileSync(DOC_PATH, "utf8");

  test("L26 no middle dot, en dash, em dash, minus sign or bullet anywhere in the doc, module, CLI or tests (byte-level scan)", () => {
    for (const path of [DOC_PATH, MODULE_PATH, THIS_PATH, CLI_PATH, CLI_TEST_PATH]) {
      expect({ path: path.replace(ROOT, ""), banned: bannedBytesIn(path) }).toEqual({ path: path.replace(ROOT, ""), banned: [] });
    }
  });

  test("L26 every message the module produces is free of banned marks", () => {
    const messages: string[] = [];
    for (const phase of ALL_PHASES) {
      for (const settings of [{}, PHASE_1_OK, PHASE_2_OK, PHASE_0_OK, { ...PHASE_2_OK, leverage: 9, dailyStopPct: 2, killSwitchConfigured: "x", liquidationDistancePct: 0.1, sigmaDaily: 0.07 }]) {
        for (const entry of checkSettings(settings, phase).violations) messages.push(entry.message);
      }
    }
    try { deriveLimits({ capitalUsd: -1, sigmaDaily: 0.04, phase: "fase-1" }); } catch (error) { messages.push((error as Error).message); }
    try { normalCdf(Number.NaN); } catch (error) { messages.push((error as Error).message); }
    try { checkSettings({}, "fase-9" as any); } catch (error) { messages.push((error as Error).message); }
    expect(messages.length).toBeGreaterThan(10);
    const banned = new RegExp(`[${BANNED_SEQUENCES.map((sequence) => Buffer.from(sequence).toString("utf8")).join("")}]`);
    for (const message of messages) expect({ message, banned: banned.test(message) }).toEqual({ message, banned: false });
  });

  test("L27 the module never uses words of approval or promise in executable code", () => {
    const code = codeOf(MODULE_PATH).toLowerCase();
    for (const word of ["aprovado", "liberado", "pronto para operar", "garantido", "lucro certo", "go-live", "safe to trade", "autorizado"]) {
      expect({ word, found: code.includes(word) }).toEqual({ word, found: false });
    }
  });

  test("L27 the doc defines L1 to L27, says ok is not authorization, and matches the code's constants", () => {
    for (let n = 1; n <= 27; n += 1) expect({ n, defined: new RegExp(`\\| L${n} \\|`).test(DOC) }).toEqual({ n, defined: true });
    expect(DOC).toContain("não é autorização");
    expect(DOC).toContain("não é aconselhamento");
    for (const id of ALL_PHASES) expect(DOC).toContain(id);
    for (const name of Object.keys(envelope).filter((key) => /^[a-z]/.test(key))) expect({ name, documented: DOC.includes(name) }).toEqual({ name, documented: true });
    for (const field of POLICY_SETTINGS_FIELDS) expect({ field, documented: DOC.includes(`\`${field}\``) }).toEqual({ field, documented: true });
    for (const token of ["900000", "86400000", "259200000", "0,25", "35%", "raiz(7)", "(2*sigma)", "RangeError", "grantsPermission"]) {
      expect({ token, documented: DOC.includes(token) }).toEqual({ token, documented: true });
    }
    expect(DOC).toContain(`${PHASES["fase-1"].cooldowns!.operationStopMs}`);
  });

  test("L27 every acceptance id of the doc is exercised by a test whose title starts with it", () => {
    const tests = readFileSync(THIS_PATH, "utf8") + readFileSync(CLI_TEST_PATH, "utf8");
    for (let n = 1; n <= 27; n += 1) {
      expect({ n, covered: new RegExp(`(?:test|it)\\(\\s*[\`"']L${n}[ :]`).test(tests) }).toEqual({ n, covered: true });
    }
  });
});
