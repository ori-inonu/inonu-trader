// T5.10, SMT-1, E7: the derivatives regime from the exchange's own public data, in TypeScript. The funding rate and the change of the
// open interest over an hour go to the Evidence Brief as DATA; no market constant turns them into a modifier of the zones (that
// mapping is not specified and not measured, T6.6), so the modifier stays neutral. A value that is not known is null.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { OI_MAX_SAMPLES, OI_TOLERANCE_MS, OI_WINDOW_MS, fundingBps, oiVariationPct, regimeOf, type OiSample } from "./derivatives";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const sample = (minutesAgo: number, oiUsd: number): OiSample => ({ ts: NOW - minutesAgo * MIN, oiUsd });

describe("funding", () => {
  test("a rate per funding interval becomes basis points, with the sign kept", () => {
    expect(fundingBps(0.0001)).toBe(1);
    expect(fundingBps(-0.00025)).toBe(-2.5);
    expect(fundingBps(0)).toBe(0);
  });

  test("a rate that is not a finite number is unknown", () => {
    expect(fundingBps(Number.NaN)).toBeNull();
    expect(fundingBps(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("the change of the open interest over an hour", () => {
  test("is the newest sample against the one closest to an hour before it, in percent", () => {
    expect(oiVariationPct([sample(60, 1_000), sample(30, 1_050), sample(0, 1_100)])).toBeCloseTo(10, 9);
    expect(oiVariationPct([sample(62, 2_000), sample(0, 1_800)])).toBeCloseTo(-10, 9);
  });

  test("with no sample about an hour old the window is not covered, and that is unknown, never a shorter window passed off as an hour", () => {
    expect(oiVariationPct([sample(0, 1_100)])).toBeNull();
    expect(oiVariationPct([sample(20, 1_000), sample(0, 1_100)])).toBeNull();
    expect(oiVariationPct([])).toBeNull();
    expect(oiVariationPct([sample(60 + OI_TOLERANCE_MS / MIN + 1, 1_000), sample(0, 1_100)])).toBeNull();
  });

  test("the sample inside the tolerance that is nearest to the hour is the one used", () => {
    const v = oiVariationPct([sample(68, 500), sample(61, 1_000), sample(55, 800), sample(0, 1_100)]);
    expect(v).toBeCloseTo(10, 9);
  });

  test("a base of zero, or a sample that is not a positive number, is unknown", () => {
    expect(oiVariationPct([sample(60, 0), sample(0, 1_100)])).toBeNull();
    expect(oiVariationPct([sample(60, Number.NaN), sample(0, 1_100)])).toBeNull();
    expect(oiVariationPct([sample(60, 1_000), sample(0, Number.NaN)])).toBeNull();
  });

  test("samples may come in any order, and the constants are the documented ones", () => {
    expect(oiVariationPct([sample(0, 1_100), sample(60, 1_000)])).toBeCloseTo(10, 9);
    expect(OI_WINDOW_MS).toBe(3_600_000);
    expect(OI_TOLERANCE_MS).toBe(600_000);
    expect(OI_MAX_SAMPLES).toBeGreaterThanOrEqual(24);
  });
});

describe("the regime of the Brief", () => {
  test("carries what is known and leaves the rest null", () => {
    expect(regimeOf({ funding: 0.0001, oiVar: 10.123456 })).toEqual({ funding: 1, oiVar: 10.12, btcBeta: null });
    expect(regimeOf({ funding: null, oiVar: null })).toEqual({ funding: null, oiVar: null, btcBeta: null });
    expect(regimeOf({ funding: -0.00025, oiVar: null })).toEqual({ funding: -2.5, oiVar: null, btcBeta: null });
  });

  test("the beta against BTC is not measured here and is never invented", () => {
    expect(regimeOf({ funding: 0.01, oiVar: 1 }).btcBeta).toBeNull();
  });
});
