import { describe, expect, test } from "bun:test";
import {
  COMPARISON_LEVERAGES,
  kellyLeverage,
  leverageComparison,
  liquidationDistanceFloor,
  liquidationTouchProbability,
  logGrowthPerDay,
  maxExposureFraction,
  maxLeverageForTouchProbability,
  maximalInequalityBound,
  meanWealthMultiple,
  medianWealthMultiple,
  normalCdf,
  riskVerdict,
  volatilityDragPerDay,
} from "./leverage-math";

// Every expected number below comes from docs/research/R3-estrategias-e-alavancagem.md (tables A to D and section 6).
// Reference values for the normal CDF were computed with Python's math.erfc (double precision).

const absClose = (actual: number, expected: number, tolerance: number) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};
const relClose = (actual: number, expected: number, relative: number) => {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(relative);
};

describe("normalCdf", () => {
  test("matches double precision reference values near the center", () => {
    const references: Array<[number, number]> = [
      [0, 0.5],
      [0.1, 0.539827837277029],
      [0.5, 0.691462461274013],
      [1, 0.8413447460685428],
      [1.5, 0.9331927987311419],
      [1.96, 0.9750021048517796],
      [2, 0.9772498680518209],
      [2.5, 0.9937903346742238],
      [3, 0.9986501019683699],
      [-1, 0.15865525393145707],
      [-1.5, 0.06680720126885809],
      [-1.96, 0.024997895148220435],
      [-2, 0.022750131948179216],
      [-2.5, 0.006209665325776139],
    ];
    for (const [x, expected] of references) absClose(normalCdf(x), expected, 1e-12);
  });

  test("keeps relative accuracy in the far lower tail", () => {
    const tails: Array<[number, number]> = [
      [-3, 0.0013498980316300959],
      [-3.5, 0.00023262907903552502],
      [-4, 3.1671241833119965e-5],
      [-5, 2.8665157187919455e-7],
      [-6, 9.865876450377016e-10],
      [-7, 1.279812543885835e-12],
      [-8, 6.220960574271819e-16],
      [-10, 7.619853024160595e-24],
    ];
    for (const [x, expected] of tails) relClose(normalCdf(x), expected, 1e-8);
  });

  test("is symmetric, monotonic and bounded", () => {
    let previous = -1;
    for (let x = -9; x <= 9; x += 0.25) {
      const value = normalCdf(x);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
      absClose(value + normalCdf(-x), 1, 1e-14);
    }
  });

  test("handles extremes and non finite input without throwing", () => {
    expect(normalCdf(-40)).toBe(0);
    expect(normalCdf(40)).toBe(1);
    expect(normalCdf(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(normalCdf(Number.POSITIVE_INFINITY)).toBe(1);
    expect(Number.isNaN(normalCdf(Number.NaN))).toBe(true);
  });
});

describe("volatility drag and log growth (R3 4.1 and table A)", () => {
  test("drag per day is 0.5*(L*sigma)^2", () => {
    absClose(volatilityDragPerDay(1, 0.02), 0.0002, 1e-12);
    absClose(volatilityDragPerDay(10, 0.04), 0.08, 1e-12);
    absClose(volatilityDragPerDay(20, 0.06), 0.72, 1e-12);
    absClose(volatilityDragPerDay(5, 0.02), 0.005, 1e-12);
  });

  test("log growth g(L) = L*mu - 0.5*L^2*sigma^2", () => {
    // Without edge every leverage above zero has negative growth.
    for (const leverage of COMPARISON_LEVERAGES) expect(logGrowthPerDay(leverage, 0, 0.04)).toBeLessThan(0);
    absClose(logGrowthPerDay(10, 0, 0.04), -0.08, 1e-12);
    // Edge 0.1% per day, sigma 4%: +0.03% at the Kelly point, 0 at 2x Kelly, negative beyond (R3 4.3).
    absClose(logGrowthPerDay(0.625, 0.001, 0.04), 0.0003125, 1e-12);
    absClose(logGrowthPerDay(1.25, 0.001, 0.04), 0, 1e-12);
    absClose(logGrowthPerDay(2, 0.001, 0.04), -0.0012, 1e-12);
    absClose(logGrowthPerDay(3, 0.001, 0.04), -0.0042, 1e-12);
    absClose(logGrowthPerDay(5, 0.001, 0.04), -0.015, 1e-12);
  });
});

describe("wealth multiples (R3 table D)", () => {
  test("median without edge, sigma 4%, 30 days matches the brief within 5% relative error", () => {
    const expected: Array<[number, number]> = [
      [3, 0.81],
      [5, 0.55],
      [10, 0.09],
      [20, 0.00007],
    ];
    for (const [leverage, multiple] of expected) relClose(medianWealthMultiple(leverage, 0, 0.04, 30), multiple, 0.05);
  });

  test("median matches the three digit values of table D", () => {
    const rows: Array<[number, number, number]> = [
      [1, 0.04, 0.976],
      [2, 0.04, 0.909],
      [3, 0.04, 0.806],
      [5, 0.06, 0.259],
      [10, 0.02, 0.549],
      [20, 0.02, 0.091],
    ];
    for (const [leverage, sigma, multiple] of rows) absClose(medianWealthMultiple(leverage, 0, sigma, 30), multiple, 0.0006);
  });

  test("mean is 1 when mu is zero and grows with the assumed drift", () => {
    for (const leverage of COMPARISON_LEVERAGES) expect(meanWealthMultiple(leverage, 0, 30)).toBe(1);
    absClose(meanWealthMultiple(1, 0.001, 30), Math.exp(0.03), 1e-12);
    absClose(meanWealthMultiple(3, 0.001, 10), Math.exp(0.03), 1e-12);
  });

  test("median equals exp(T*g(L)) and is the mean times exp(-T*drag)", () => {
    const leverage = 3, mu = 0.0007, sigma = 0.035, days = 12;
    absClose(medianWealthMultiple(leverage, mu, sigma, days), Math.exp(days * logGrowthPerDay(leverage, mu, sigma)), 1e-12);
    absClose(
      medianWealthMultiple(leverage, mu, sigma, days),
      meanWealthMultiple(leverage, mu, days) * Math.exp(-days * volatilityDragPerDay(leverage, sigma)),
      1e-12,
    );
  });
});

describe("Kelly leverage (R3 4.3, table B)", () => {
  test("edge 0.1% per day with sigma 4% gives 0.625x", () => {
    absClose(kellyLeverage(0.001, 0.04) as number, 0.625, 1e-12);
  });

  test("matches the other cells of table B", () => {
    absClose(kellyLeverage(0.0025, 0.02) as number, 6.25, 1e-9);
    absClose(kellyLeverage(0.0005, 0.02) as number, 1.25, 1e-9);
    absClose(kellyLeverage(0.005, 0.06) as number, 1.3889, 1e-3);
  });

  test("is undefined (null) when the edge is zero or negative", () => {
    expect(kellyLeverage(0, 0.04)).toBeNull();
    expect(kellyLeverage(-0.001, 0.04)).toBeNull();
    expect(kellyLeverage(0.001, 0)).toBeNull();
    expect(kellyLeverage(Number.NaN, 0.04)).toBeNull();
  });
});

describe("liquidation touch probability (R3 4.4, table C)", () => {
  test("sigma 4% over 7 days: 5x 5.9%, 10x 34.5%, 20x 63.7%", () => {
    absClose(liquidationTouchProbability(5, 0.04, 7), 0.059, 0.002);
    absClose(liquidationTouchProbability(10, 0.04, 7), 0.345, 0.002);
    absClose(liquidationTouchProbability(20, 0.04, 7), 0.637, 0.002);
  });

  test("sigma 6% over 30 days: 2x 12.8%, 3x 31%, 5x 54.3%", () => {
    absClose(liquidationTouchProbability(2, 0.06, 30), 0.128, 0.002);
    absClose(liquidationTouchProbability(3, 0.06, 30), 0.31, 0.002);
    // The brief rounds R3's 54,3% to 54%; the table value is the reference.
    absClose(liquidationTouchProbability(5, 0.06, 30), 0.543, 0.002);
  });

  test("sigma 4% over 30 days and the one day column match table C", () => {
    absClose(liquidationTouchProbability(2, 0.04, 30), 0.022, 0.002);
    absClose(liquidationTouchProbability(3, 0.04, 30), 0.128, 0.002);
    absClose(liquidationTouchProbability(5, 0.04, 30), 0.361, 0.002);
    absClose(liquidationTouchProbability(10, 0.04, 30), 0.648, 0.002);
    absClose(liquidationTouchProbability(20, 0.04, 30), 0.819, 0.002);
    absClose(liquidationTouchProbability(20, 0.02, 1), 0.012, 0.002);
    absClose(liquidationTouchProbability(10, 0.06, 7), 0.529, 0.002);
  });

  test("a 1.25% maintenance margin raises the probability as in R3", () => {
    absClose(liquidationTouchProbability(3, 0.04, 30, 0.0125), 0.143, 0.002);
    absClose(liquidationTouchProbability(5, 0.04, 30, 0.0125), 0.392, 0.002);
    absClose(liquidationTouchProbability(10, 0.04, 30, 0.0125), 0.69, 0.002);
  });

  test("grows with leverage, with volatility and with the horizon", () => {
    let previous = 0;
    for (const leverage of COMPARISON_LEVERAGES) {
      const value = liquidationTouchProbability(leverage, 0.04, 14);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(liquidationTouchProbability(5, 0.05, 7)).toBeGreaterThan(liquidationTouchProbability(5, 0.04, 7));
    expect(liquidationTouchProbability(5, 0.04, 14)).toBeGreaterThan(liquidationTouchProbability(5, 0.04, 7));
  });

  test("is certain when the maintenance margin already exceeds the liquidation distance", () => {
    expect(liquidationTouchProbability(100, 0.04, 7, 0.0125)).toBe(1);
  });

  test("stays inside [0, 1] for extreme but valid inputs", () => {
    for (const leverage of [0.1, 1, 50, 100]) {
      for (const sigma of [0.001, 0.5]) {
        for (const days of [0.5, 365]) {
          const value = liquidationTouchProbability(leverage, sigma, days);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("largest leverage for a touch probability budget (R3 4.4)", () => {
  test("5% budget, 7 days: 9.6x, 4.8x and 3.2x for sigma 2%, 4% and 6%", () => {
    absClose(maxLeverageForTouchProbability(0.05, 0.02, 7) as number, 9.6, 0.06);
    absClose(maxLeverageForTouchProbability(0.05, 0.04, 7) as number, 4.8, 0.06);
    absClose(maxLeverageForTouchProbability(0.05, 0.06, 7) as number, 3.2, 0.06);
  });

  test("5% budget, 30 days and 1% budget, 7 and 30 days", () => {
    absClose(maxLeverageForTouchProbability(0.05, 0.02, 30) as number, 4.7, 0.06);
    absClose(maxLeverageForTouchProbability(0.05, 0.04, 30) as number, 2.3, 0.06);
    absClose(maxLeverageForTouchProbability(0.05, 0.06, 30) as number, 1.6, 0.06);
    absClose(maxLeverageForTouchProbability(0.01, 0.02, 7) as number, 7.3, 0.06);
    absClose(maxLeverageForTouchProbability(0.01, 0.04, 7) as number, 3.7, 0.06);
    absClose(maxLeverageForTouchProbability(0.01, 0.06, 7) as number, 2.4, 0.06);
    absClose(maxLeverageForTouchProbability(0.01, 0.02, 30) as number, 3.5, 0.06);
    absClose(maxLeverageForTouchProbability(0.01, 0.04, 30) as number, 1.8, 0.06);
    absClose(maxLeverageForTouchProbability(0.01, 0.06, 30) as number, 1.2, 0.06);
  });

  test("the returned leverage respects the budget it was computed for", () => {
    const leverage = maxLeverageForTouchProbability(0.05, 0.04, 7) as number;
    absClose(liquidationTouchProbability(leverage, 0.04, 7), 0.05, 1e-6);
  });

  test("rejects budgets outside (0, 1)", () => {
    expect(maxLeverageForTouchProbability(0, 0.04, 7)).toBeNull();
    expect(maxLeverageForTouchProbability(1, 0.04, 7)).toBeNull();
    expect(maxLeverageForTouchProbability(Number.NaN, 0.04, 7)).toBeNull();
  });
});

describe("exposure fraction and liquidation floor (R3 4.8 and section 6)", () => {
  test("f_max = DLL/(2*sigma): 0.50, 0.25 and 0.17 for sigma 2%, 4% and 6% with DLL 2%", () => {
    absClose(maxExposureFraction(0.02, 0.02), 0.5, 1e-12);
    absClose(maxExposureFraction(0.02, 0.04), 0.25, 1e-12);
    absClose(maxExposureFraction(0.02, 0.06), 0.17, 0.005);
  });

  test("DLL 1% gives 0.25, 0.12 and 0.08", () => {
    absClose(maxExposureFraction(0.01, 0.02), 0.25, 1e-12);
    absClose(maxExposureFraction(0.01, 0.04), 0.125, 1e-12);
    absClose(maxExposureFraction(0.01, 0.06), 0.0833, 1e-3);
  });

  test("liquidation distance floor is max(35%, 2.5*sigma*sqrt(7))", () => {
    absClose(liquidationDistanceFloor(0.02), 0.35, 1e-12);
    absClose(liquidationDistanceFloor(0.04), 0.35, 1e-12);
    // MON, sigma 6.67%: 44% (R3 section 6).
    absClose(liquidationDistanceFloor(0.0667), 0.441, 0.001);
    absClose(liquidationDistanceFloor(0.06), 0.3969, 0.0005);
    // Crossing point: 2.5*sigma*sqrt(7) = 0.35.
    absClose(liquidationDistanceFloor(0.35 / (2.5 * Math.sqrt(7))), 0.35, 1e-12);
    expect(liquidationDistanceFloor(0.1)).toBeGreaterThan(0.35);
  });
});

describe("maximal inequality bound (R3 4.7)", () => {
  test("no edge: reaching 98.5x has probability at most 1.01%", () => {
    const multiple = 6700 / 68;
    absClose(multiple, 98.5, 0.05);
    absClose(maximalInequalityBound(multiple), 0.01015, 0.00002);
    expect(maximalInequalityBound(multiple)).toBeLessThan(0.0102);
  });

  test("is 1/c for c >= 1 and 1 below", () => {
    expect(maximalInequalityBound(10)).toBeCloseTo(0.1, 12);
    expect(maximalInequalityBound(1)).toBe(1);
    expect(maximalInequalityBound(0.5)).toBe(1);
    expect(Number.isNaN(maximalInequalityBound(Number.NaN))).toBe(true);
  });
});

describe("comparison table", () => {
  test("uses 1, 2, 3, 5, 10 and 20", () => {
    expect([...COMPARISON_LEVERAGES]).toEqual([1, 2, 3, 5, 10, 20]);
  });

  test("returns one row per leverage with the same numbers as the single functions", () => {
    const rows = leverageComparison({ sigma: 0.04, mu: 0, days: 30 });
    expect(rows.map((row) => row.leverage)).toEqual([1, 2, 3, 5, 10, 20]);
    for (const row of rows) {
      absClose(row.dragPerDay, volatilityDragPerDay(row.leverage, 0.04), 1e-15);
      absClose(row.medianMultiple, medianWealthMultiple(row.leverage, 0, 0.04, 30), 1e-15);
      absClose(row.touchProbability, liquidationTouchProbability(row.leverage, 0.04, 30), 1e-15);
      absClose(row.logGrowthPerDay, logGrowthPerDay(row.leverage, 0, 0.04), 1e-15);
    }
  });

  test("reproduces the sigma 4%, 30 day columns of tables C and D", () => {
    const rows = leverageComparison({ sigma: 0.04, mu: 0, days: 30 });
    const touch = [0.0, 0.022, 0.128, 0.361, 0.648, 0.819];
    const median = [0.976, 0.909, 0.806, 0.549, 0.091, 0.00007];
    rows.forEach((row, index) => {
      absClose(row.touchProbability, touch[index]!, 0.002);
      if (index < 5) absClose(row.medianMultiple, median[index]!, 0.001);
      else relClose(row.medianMultiple, median[index]!, 0.05);
    });
  });

  test("accepts custom leverages", () => {
    const rows = leverageComparison({ sigma: 0.03, mu: 0.001, days: 10 }, [1.5, 4]);
    expect(rows.map((row) => row.leverage)).toEqual([1.5, 4]);
  });
});

describe("risk verdict", () => {
  test("without edge the verdict never praises leverage", () => {
    expect(riskVerdict(0, 3, 0.04)).toBe("no-edge");
    expect(riskVerdict(-0.001, 1, 0.04)).toBe("no-edge");
    expect(riskVerdict(Number.NaN, 1, 0.04)).toBe("no-edge");
  });

  test("with an assumed edge the verdict depends on the Kelly point", () => {
    // Kelly leverage 0.625x, growth is positive below 1.25x.
    expect(riskVerdict(0.001, 1, 0.04)).toBe("edge-assumed-growth");
    expect(riskVerdict(0.001, 1.2, 0.04)).toBe("edge-assumed-growth");
    expect(riskVerdict(0.001, 1.25, 0.04)).toBe("edge-assumed-over-kelly");
    expect(riskVerdict(0.001, 5, 0.04)).toBe("edge-assumed-over-kelly");
  });
});
