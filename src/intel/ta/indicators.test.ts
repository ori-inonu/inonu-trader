import { describe, expect, test } from "bun:test";
import chart from "../../../python/tests/vectors/chart-vectors.v1.json";
import extra from "./ta-extra-vectors.v1.json";
import { adx, atr, beta, bollinger, corr, donchian, efficiencyRatio, ema, logReturns, macd, rank, rollingStdev, rsi, sma, stdev, supertrend } from "./indicators";

/**
 * Parity with the Python reference. `chart-vectors.v1.json` is the file the web copy already uses; `ta-extra-vectors.v1.json`
 * was produced by running the Python functions that the web copy does not have (ADX, Donchian and the statistics).
 */
const TOL = chart.tolerance;
type Series = readonly (number | null)[];

function expectSeries(name: string, got: Series, want: Series, tol = TOL): void {
  expect(got.length, `${name}: length`).toBe(want.length);
  for (let i = 0; i < want.length; i += 1) {
    const g = got[i] ?? null;
    const w = want[i] ?? null;
    if (w === null) {
      expect(g, `${name}[${i}] expected null`).toBeNull();
      continue;
    }
    expect(g, `${name}[${i}] expected ${w}`).not.toBeNull();
    expect(Math.abs((g as number) - w) <= tol.abs + tol.rel * Math.abs(w), `${name}[${i}]: ${g} vs ${w}`).toBe(true);
  }
}

const C = chart.candles;

describe("chart golden vectors (same file as the web copy)", () => {
  for (const c of chart.cases) {
    if (!["sma", "ema", "rsi", "macd", "atr", "bollinger", "supertrend"].includes(c.fn)) continue;
    test(`case ${c.name} (${c.fn})`, () => {
      const p = c.params as Record<string, number>;
      switch (c.fn) {
        case "sma":
          return expectSeries(c.name, sma(C.close, p.n!), c.expected as Series);
        case "ema":
          return expectSeries(c.name, ema(C.close, p.n!), c.expected as Series);
        case "rsi":
          return expectSeries(c.name, rsi(C.close, p.n!), c.expected as Series);
        case "atr":
          return expectSeries(c.name, atr(C.high, C.low, C.close, p.n!), c.expected as Series);
        case "macd": {
          const got = macd(C.close, p.fast!, p.slow!, p.signal!);
          const want = c.expected as unknown as Record<"macd" | "signal" | "hist", Series>;
          for (const key of ["macd", "signal", "hist"] as const) expectSeries(`${c.name}.${key}`, got[key], want[key]);
          return;
        }
        case "bollinger": {
          const got = bollinger(C.close, p.n!, p.k!);
          const want = c.expected as unknown as Record<"mid" | "upper" | "lower" | "percentB" | "width", Series>;
          for (const key of ["mid", "upper", "lower", "percentB", "width"] as const) expectSeries(`${c.name}.${key}`, got[key], want[key]);
          return;
        }
        case "supertrend": {
          const got = supertrend(C.high, C.low, C.close, p.n!, p.mult!);
          const want = c.expected as unknown as Record<"line" | "dir", Series>;
          expectSeries(`${c.name}.line`, got.line, want.line);
          expectSeries(`${c.name}.dir`, got.dir, want.dir);
          return;
        }
      }
    });
  }
});

describe("ADX, Donchian and statistics against the Python reference", () => {
  const tol = extra.tolerance;
  test("adx, +DI and -DI", () => {
    const got = adx(extra.high, extra.low, extra.close, 14);
    expectSeries("adx", got.adx, extra.adx14.adx, tol);
    expectSeries("plusDi", got.plusDi, extra.adx14.plusDi, tol);
    expectSeries("minusDi", got.minusDi, extra.adx14.minusDi, tol);
  });
  test("a series shorter than 2n has no ADX", () => {
    const got = adx(extra.high.slice(0, 20), extra.low.slice(0, 20), extra.close.slice(0, 20), 14);
    expect(got.adx.every((v) => v === null)).toBe(true);
  });
  test("donchian", () => {
    const got = donchian(extra.high, extra.low, 20);
    expectSeries("upper", got.upper, extra.donchian20.upper, tol);
    expectSeries("lower", got.lower, extra.donchian20.lower, tol);
  });
  test("efficiency ratio, stdev, rank", () => {
    expect(Math.abs(efficiencyRatio(extra.close, 20)! - extra.efficiency20)).toBeLessThan(1e-9);
    expect(Math.abs(stdev(extra.close.slice(-30)) - extra.stdev)).toBeLessThan(1e-9);
    expect(rank(extra.close[extra.close.length - 1]!, extra.close.slice(-50))).toBe(extra.rank);
  });
  test("log returns, rolling stdev, correlation and beta", () => {
    const a = logReturns(extra.close);
    const m = logReturns(extra.market);
    expectSeries("rollingStdev", rollingStdev(a, 12).slice(-5), extra.rollingStdev12, tol);
    expect(Math.abs(corr(a, m)! - extra.corr)).toBeLessThan(1e-9);
    expect(Math.abs(beta(a, m)! - extra.beta)).toBeLessThan(1e-9);
  });
  test("flat inputs give null instead of a number", () => {
    expect(efficiencyRatio([5, 5, 5, 5], 3)).toBeNull();
    expect(corr([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(beta([1, 2, 3], [4, 4, 4])).toBeNull();
  });
  test("bad input is refused", () => {
    expect(() => logReturns([1, 0, 2])).toThrow(RangeError);
    expect(() => stdev([1])).toThrow(RangeError);
    expect(() => adx([1], [1], [1], 0)).toThrow(RangeError);
    expect(() => efficiencyRatio([1, 2], 5)).toThrow(RangeError);
  });
});
