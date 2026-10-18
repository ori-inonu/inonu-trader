import { describe, expect, test } from "bun:test";
import {
  CALM_RATIO,
  STRESSED_RATIO,
  regimeOf,
  closeToCloseVariance,
  ewmaVariance,
  garmanKlassVariance,
  parkinsonVariance,
  rogersSatchellVariance,
  sigmaBand,
  sigmaBandFromAudit,
  yangZhangVariance,
} from "./volatility";
import { auditCandles } from "./candles";
import { DAY_MS, type Candle } from "./types";
import { simulateCandles, sigmaOfEstimates } from "./test-support";

const BAR = 900_000;
const T0 = 1_800_000_000_000;

const mk = (rows: readonly (readonly [number, number, number, number])[]): Candle[] =>
  rows.map(([open, high, low, close], i) => ({ startMs: T0 + i * BAR, open, high, low, close, volume: 1, confirmed: true }));

// Reference values come from an independent pure Python implementation of the published formulas
// (scratchpad vol_vectors.py): Parkinson 1980, Garman Klass 1980, Rogers Satchell 1991, Yang Zhang 2000.
const EIGHT = mk([
  [100.0, 103.0, 99.0, 102.0],
  [102.5, 104.0, 101.0, 101.5],
  [101.0, 102.0, 98.5, 99.0],
  [99.5, 101.5, 98.0, 100.5],
  [100.0, 105.0, 99.5, 104.0],
  [104.5, 106.0, 103.0, 103.5],
  [103.0, 104.0, 100.0, 101.0],
  [101.5, 103.5, 100.5, 103.0],
]);

const R30 = [
  0.003103, -0.003904, 0.003499, -0.007865, 0.000331, -0.000207, 0.002049, -0.002601, -0.004867, -0.002516,
  0.006512, -0.006546, -0.004044, 0.002871, 0.005793, 0.009756, 0.006011, -0.000715, 0.00078, 0.00251,
  -0.005, 0.004078, 0.004326, 0.00959, -0.00342, -0.001091, 0.004168, 0.004798, -0.006544, -0.009686,
];

function candlesFromReturns(returns: readonly number[], range = 0.002): Candle[] {
  let price = 100;
  const out: Candle[] = [{ startMs: T0, open: price, high: price * (1 + range), low: price * (1 - range), close: price, volume: 1, confirmed: true }];
  returns.forEach((r, i) => {
    const open = price;
    price *= Math.exp(r);
    out.push({ startMs: T0 + (i + 1) * BAR, open, high: Math.max(open, price) * (1 + range), low: Math.min(open, price) * (1 - range), close: price, volume: 1, confirmed: true });
  });
  return out;
}

describe("per bar variance estimators against independent reference values", () => {
  test("close to close", () => {
    expect(closeToCloseVariance(EIGHT)!).toBeCloseTo(0.0005060204465231851, 14);
  });
  test("Parkinson", () => {
    expect(parkinsonVariance(EIGHT)!).toBeCloseTo(0.0004958645526199538, 14);
    expect(parkinsonVariance(mk([[100, 110, 100, 105]]))!).toBeCloseTo(0.0032763713930836426, 14);
  });
  test("Garman Klass", () => {
    expect(garmanKlassVariance(EIGHT)!).toBeCloseTo(0.0005319926176350264, 14);
    expect(garmanKlassVariance(mk([[100, 110, 100, 105]]))!).toBeCloseTo(0.0036224491401759375, 14);
  });
  test("Rogers Satchell", () => {
    expect(rogersSatchellVariance(EIGHT)!).toBeCloseTo(0.0005036151460089571, 14);
    expect(rogersSatchellVariance(mk([[100, 110, 100, 105]]))!).toBeCloseTo(0.00443383105466165, 14);
  });
  test("Yang Zhang", () => {
    expect(yangZhangVariance(EIGHT)!).toBeCloseTo(0.0005164965437187406, 14);
  });
  test("EWMA seeded with the first 20 squared returns, then updated", () => {
    expect(ewmaVariance(R30, 0.94)!).toBeCloseTo(2.8075493958142057e-05, 18);
  });
  test("EWMA with constant squared returns stays at that value", () => {
    const alternating = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
    expect(ewmaVariance(alternating, 0.94)!).toBeCloseTo(1e-4, 15);
  });
});

describe("per bar variance estimators refuse what they cannot support", () => {
  test("empty, single bar for close based estimators, and invalid bars", () => {
    expect(closeToCloseVariance([])).toBeNull();
    expect(closeToCloseVariance(EIGHT.slice(0, 2))).toBeNull();
    expect(yangZhangVariance(EIGHT.slice(0, 2))).toBeNull();
    expect(parkinsonVariance([])).toBeNull();
    expect(ewmaVariance([], 0.94)).toBeNull();
    const broken = [...EIGHT];
    broken[3] = { ...broken[3]!, low: 0 };
    expect(parkinsonVariance(broken)).toBeNull();
    expect(garmanKlassVariance(broken)).toBeNull();
    expect(rogersSatchellVariance(broken)).toBeNull();
    expect(yangZhangVariance(broken)).toBeNull();
    expect(closeToCloseVariance(broken)).toBeNull();
  });
  test("lambda outside (0, 1) is refused", () => {
    expect(() => ewmaVariance(R30, 1)).toThrow("option_invalid");
    expect(() => ewmaVariance(R30, 0)).toThrow("option_invalid");
  });
});

describe("sigmaBand", () => {
  const SIGMA = 0.05;

  test("every estimator recovers a known daily sigma on a long simulated path", () => {
    // 240 sub steps per bar keep the discrete monitoring bias of highs and lows (about 4 percent) well inside the tolerance
    const candles = simulateCandles({ seed: 11, bars: 1500, sigmaDaily: SIGMA, barMs: BAR, substeps: 240 });
    const band = sigmaBand(candles, BAR);
    for (const name of ["closeToClose", "garmanKlass", "rogersSatchell", "yangZhang", "robust"] as const) {
      const value = band.estimates[name].sigmaDaily!;
      expect(Math.abs(value / SIGMA - 1)).toBeLessThan(0.1);
    }
    // discretely sampled highs and lows bias the pure range estimator down by a few percent
    expect(Math.abs(band.estimates.parkinson.sigmaDaily! / SIGMA - 1)).toBeLessThan(0.15);
    expect(band.low!).toBeLessThanOrEqual(band.central!);
    expect(band.central!).toBeLessThanOrEqual(band.high!);
    expect(band.regime).toBe("normal");
    expect(band.available).toBe(6);
  });

  test("range based estimators are more stable across samples than close to close", () => {
    const closeEstimates: number[] = [];
    const parkinsonEstimates: number[] = [];
    const yangZhangEstimates: number[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const band = sigmaBand(simulateCandles({ seed, bars: 100, sigmaDaily: SIGMA, barMs: BAR, substeps: 60 }), BAR);
      closeEstimates.push(band.estimates.closeToClose.sigmaDaily!);
      parkinsonEstimates.push(band.estimates.parkinson.sigmaDaily!);
      yangZhangEstimates.push(band.estimates.yangZhang.sigmaDaily!);
    }
    expect(sigmaOfEstimates(parkinsonEstimates)).toBeLessThan(0.6 * sigmaOfEstimates(closeEstimates));
    expect(sigmaOfEstimates(yangZhangEstimates)).toBeLessThan(0.5 * sigmaOfEstimates(closeEstimates));
  });

  test("central is the median of the five full sample estimators and low and high span all six", () => {
    const band = sigmaBand(simulateCandles({ seed: 21, bars: 300, sigmaDaily: 0.05, barMs: BAR }), BAR);
    const five = (["closeToClose", "parkinson", "garmanKlass", "rogersSatchell", "yangZhang"] as const).map((n) => band.estimates[n].sigmaDaily!).sort((a, b) => a - b);
    const six = [...five, band.estimates.ewma.sigmaDaily!];
    expect(five[4]).toBeGreaterThan(five[2]!);
    expect(band.central).toBe(five[2]!);
    expect(band.low).toBe(Math.min(...six));
    expect(band.high).toBe(Math.max(...six));
  });

  test("a late volatility shock lifts the EWMA above the full sample and the regime reads stressed", () => {
    const candles = simulateCandles({ seed: 5, bars: 400, sigmaDaily: SIGMA, barMs: BAR, sigmaMultiplier: (i) => (i >= 385 ? 4 : 1) });
    const band = sigmaBand(candles, BAR);
    expect(band.estimates.ewma.sigmaDaily!).toBeGreaterThan(1.5 * band.central!);
    expect(band.regime).toBe("stressed");
    expect(band.high!).toBe(band.estimates.ewma.sigmaDaily!);
  });

  test("a long calm after a rough start reads calm", () => {
    const candles = simulateCandles({ seed: 5, bars: 400, sigmaDaily: SIGMA, barMs: BAR, sigmaMultiplier: (i) => (i < 300 ? 2.5 : 0.5) });
    expect(sigmaBand(candles, BAR).regime).toBe("calm");
  });

  test("one corrupt-looking spike inflates close to close far more than the robust estimator", () => {
    const candles = simulateCandles({ seed: 9, bars: 300, sigmaDaily: SIGMA, barMs: BAR });
    const spiked = candles.map((c, i) => (i === 150 ? { ...c, close: c.close * 1.4, high: c.close * 1.4 } : c));
    const clean = sigmaBand(candles, BAR);
    const dirty = sigmaBand(spiked, BAR);
    expect(dirty.estimates.closeToClose.sigmaDaily!).toBeGreaterThan(2 * clean.estimates.closeToClose.sigmaDaily!);
    expect(dirty.estimates.robust.sigmaDaily! / clean.estimates.robust.sigmaDaily!).toBeLessThan(1.1);
    expect(dirty.tailRatio!).toBeGreaterThan(2);
    expect(clean.tailRatio!).toBeLessThan(1.3);
  });

  test("too few bars: every estimate is null with a reason and no number is invented", () => {
    const band = sigmaBand(simulateCandles({ seed: 1, bars: 15, sigmaDaily: SIGMA, barMs: BAR }), BAR);
    expect(band.central).toBeNull();
    expect(band.low).toBeNull();
    expect(band.high).toBeNull();
    expect(band.regime).toBeNull();
    expect(band.available).toBe(0);
    for (const estimate of Object.values(band.estimates)) {
      expect(estimate.sigmaDaily).toBeNull();
      expect(estimate.reason).toBe("too_few_candles");
    }
  });

  test("a series that never moves is sigma_zero, not zero", () => {
    const flat: Candle[] = Array.from({ length: 40 }, (_, i) => ({ startMs: T0 + i * BAR, open: 100, high: 100, low: 100, close: 100, volume: 1, confirmed: true }));
    const band = sigmaBand(flat, BAR);
    expect(band.central).toBeNull();
    expect(band.estimates.closeToClose.reason).toBe("sigma_zero");
    expect(band.estimates.robust.reason).toBe("sigma_zero");
  });

  test("a structurally invalid bar makes every estimate unavailable with candle_invalid", () => {
    const candles = simulateCandles({ seed: 2, bars: 40, sigmaDaily: SIGMA, barMs: BAR });
    candles[10] = { ...candles[10]!, low: -1 };
    const band = sigmaBand(candles, BAR);
    expect(band.available).toBe(0);
    expect(band.estimates.garmanKlass.reason).toBe("candle_invalid");
  });

  test("scaling uses the bar length: the same returns on hourly bars scale by sqrt(24)", () => {
    const candles15 = candlesFromReturns(R30.concat(R30));
    const candles60 = candles15.map((c, i) => ({ ...c, startMs: T0 + i * 3_600_000 }));
    const s15 = sigmaBand(candles15, BAR).estimates.closeToClose.sigmaDaily!;
    const s60 = sigmaBand(candles60, 3_600_000).estimates.closeToClose.sigmaDaily!;
    expect(s15 / s60).toBeCloseTo(Math.sqrt(DAY_MS / BAR / 24), 10);
  });

  test("an invalid bar length is refused", () => {
    expect(() => sigmaBand(EIGHT, 0)).toThrow("bar_invalid");
  });

  test("the band from an audit is unavailable when the audit is stale or unusable", () => {
    const candles = simulateCandles({ seed: 3, bars: 60, sigmaDaily: SIGMA, barMs: BAR });
    const last = candles[candles.length - 1]!;
    const fresh = sigmaBandFromAudit(auditCandles(candles, BAR, last.startMs + BAR + 5));
    expect(fresh.central).not.toBeNull();
    const stale = sigmaBandFromAudit(auditCandles(candles, BAR, last.startMs + 10 * BAR));
    expect(stale.central).toBeNull();
    expect(stale.estimates.closeToClose.reason).toBe("stale");
    const empty = sigmaBandFromAudit(auditCandles([], BAR, T0));
    expect(empty.estimates.closeToClose.reason).toBe("too_few_candles");
  });

  test("the band is deterministic", () => {
    const candles = simulateCandles({ seed: 4, bars: 120, sigmaDaily: SIGMA, barMs: BAR });
    expect(JSON.stringify(sigmaBand(candles, BAR))).toBe(JSON.stringify(sigmaBand(candles, BAR)));
  });
});

describe("regime, dispersion and the default decay", () => {
  test("the regime boundaries are inclusive and the thresholds are the documented ones", () => {
    expect(STRESSED_RATIO).toBe(1.5);
    expect(CALM_RATIO).toBeCloseTo(2 / 3, 15);
    expect(regimeOf(1.5)).toBe("stressed");
    expect(regimeOf(1.4999)).toBe("normal");
    expect(regimeOf(CALM_RATIO)).toBe("calm");
    expect(regimeOf(CALM_RATIO + 1e-9)).toBe("normal");
    expect(regimeOf(1)).toBe("normal");
    expect(regimeOf(null)).toBeNull();
    expect(regimeOf(Number.NaN)).toBeNull();
  });

  test("dispersion is the spread of the band over its centre", () => {
    const band = sigmaBand(simulateCandles({ seed: 31, bars: 300, sigmaDaily: 0.05, barMs: BAR }), BAR);
    expect(band.dispersion).toBeCloseTo((band.high! - band.low!) / band.central!, 14);
  });

  test("the EWMA in the band uses a decay of 0.94 unless told otherwise", () => {
    const candles = simulateCandles({ seed: 32, bars: 200, sigmaDaily: 0.05, barMs: BAR });
    const returns = candles.slice(1).map((c, i) => Math.log(c.close / candles[i]!.close));
    const expected = Math.sqrt(ewmaVariance(returns, 0.94)! * (DAY_MS / BAR));
    expect(sigmaBand(candles, BAR).estimates.ewma.sigmaDaily!).toBeCloseTo(expected, 14);
    expect(sigmaBand(candles, BAR, { lambda: 0.8 }).estimates.ewma.sigmaDaily!).not.toBeCloseTo(expected, 6);
  });

  test("the minimum number of bars is the documented 21", () => {
    expect(sigmaBand(simulateCandles({ seed: 1, bars: 20, sigmaDaily: 0.05, barMs: BAR }), BAR).central).toBeNull();
    expect(sigmaBand(simulateCandles({ seed: 1, bars: 21, sigmaDaily: 0.05, barMs: BAR }), BAR).central).not.toBeNull();
  });
});
