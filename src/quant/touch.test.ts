import { describe, expect, test } from "bun:test";
import { gaussianTouchProbability, liquidationBarrier, simulateExtremes, touchFromExtremes } from "./touch";
import { gaussianDraws, simulateGarchReturns } from "./test-support";
import { touchLiquidationProbability } from "../policy/envelope";

const DAY = 86_400_000;
const BAR15 = 900_000;

// Reference values: independent pure Python (math.erfc), scratchpad touch_vectors.py. sigma 0.06 per day, 7 days.
const G = (side: "long" | "short", leverage: number, extra: object = {}) =>
  gaussianTouchProbability({ side, leverage, sigmaDaily: 0.06, horizonDays: 7, ...extra });
const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe("liquidationBarrier", () => {
  test("is the log of the adverse price move, by side", () => {
    const long5 = liquidationBarrier("long", 5);
    const short5 = liquidationBarrier("short", 5);
    expect(long5.state === "level" && long5.log).toBeCloseTo(Math.log(0.8), 14);
    expect(short5.state === "level" && short5.log).toBeCloseTo(Math.log(1.2), 14);
  });
  test("the short barrier is closer in log price than the long one", () => {
    const long = liquidationBarrier("long", 3);
    const short = liquidationBarrier("short", 3);
    expect(long.state === "level" && short.state === "level" && Math.abs(long.log) > short.log).toBe(true);
  });
  test("a 1x long can never be liquidated, a 1x short can", () => {
    expect(liquidationBarrier("long", 1).state).toBe("unreachable");
    expect(liquidationBarrier("short", 1).state).toBe("level");
  });
  test("a maintenance margin at or above the distance means immediate liquidation", () => {
    expect(liquidationBarrier("long", 5, 0.2).state).toBe("immediate");
    expect(liquidationBarrier("short", 5, 0.25).state).toBe("immediate");
  });
  test("invalid inputs fail with constant codes", () => {
    expect(() => liquidationBarrier("long", 0)).toThrow("leverage_invalid");
    expect(() => liquidationBarrier("long", Number.NaN)).toThrow("leverage_invalid");
    expect(() => liquidationBarrier("long", 2, 1)).toThrow("margin_invalid");
    expect(() => liquidationBarrier("sideways" as never, 2)).toThrow("side_invalid");
  });
});

describe("gaussianTouchProbability", () => {
  test("matches the independent reference for both sides across leverage", () => {
    const longs: [number, number][] = [[2, 1.2630135766187878e-05], [3, 0.010643512924451247], [5, 0.15982147192266072], [10, 0.5068766657091364]];
    const shorts: [number, number][] = [[2, 0.010643512924451214], [3, 0.06995117278254617], [5, 0.2507548475744455], [10, 0.5482412215868513]];
    for (const [l, p] of longs) expect(rel(G("long", l), p)).toBeLessThan(1e-9);
    for (const [l, p] of shorts) expect(rel(G("short", l), p)).toBeLessThan(1e-9);
  });

  test("a maintenance margin raises both probabilities as in the reference", () => {
    expect(rel(G("long", 5, { maintenanceMargin: 0.01 }), 0.1843705392464547)).toBeLessThan(1e-9);
    expect(rel(G("short", 5, { maintenanceMargin: 0.01 }), 0.2731650679006569)).toBeLessThan(1e-9);
  });

  test("a log drift matches the reference, including the martingale drift minus sigma squared over two", () => {
    expect(rel(G("long", 5, { logDriftDaily: -0.0018 }), 0.17832769744179572)).toBeLessThan(1e-9);
    expect(rel(G("short", 5, { logDriftDaily: -0.0018 }), 0.2284958069235029)).toBeLessThan(1e-9);
    expect(rel(G("long", 5, { logDriftDaily: 0.01 }), 0.0808422693492785)).toBeLessThan(1e-9);
    expect(rel(G("short", 5, { logDriftDaily: 0.01 }), 0.3937444193240258)).toBeLessThan(1e-9);
  });

  test("the symmetric envelope formula gets both sides wrong in opposite directions", () => {
    const envelope = touchLiquidationProbability(5, 0.06, 7);
    expect(envelope).toBeCloseTo(0.2077120857275567, 12);
    expect(G("long", 5)).toBeLessThan(envelope);
    expect(G("short", 5)).toBeGreaterThan(envelope);
    expect(G("short", 5) / envelope).toBeGreaterThan(1.2);
  });

  test("a 3x long and a 2x short have the same log barrier and the same probability", () => {
    expect(rel(G("long", 3), G("short", 2))).toBeLessThan(1e-9);
  });

  test("monotone in leverage, sigma and horizon", () => {
    for (const side of ["long", "short"] as const) {
      expect(G(side, 3)).toBeLessThan(G(side, 5));
      expect(G(side, 5)).toBeLessThan(G(side, 10));
      expect(gaussianTouchProbability({ side, leverage: 5, sigmaDaily: 0.04, horizonDays: 7 })).toBeLessThan(G(side, 5));
      expect(gaussianTouchProbability({ side, leverage: 5, sigmaDaily: 0.06, horizonDays: 3 })).toBeLessThan(G(side, 5));
    }
  });

  test("special states", () => {
    expect(G("long", 1)).toBe(0);
    expect(G("long", 5, { maintenanceMargin: 0.2 })).toBe(1);
  });

  test("a drift so extreme that the formula would overflow is refused, not turned into NaN", () => {
    expect(() => G("long", 5, { logDriftDaily: 5 })).toThrow("drift_out_of_range");
  });

  test("a sigma so small that its square underflows is refused, not turned into NaN", () => {
    expect(() => gaussianTouchProbability({ side: "long", leverage: 5, sigmaDaily: 1e-170, horizonDays: 7 })).toThrow("sigma_invalid");
    expect(() => gaussianTouchProbability({ side: "short", leverage: 5, sigmaDaily: 1e-9, horizonDays: 7 })).toThrow("sigma_invalid");
    expect(Number.isFinite(gaussianTouchProbability({ side: "short", leverage: 5, sigmaDaily: 1e-4, horizonDays: 7 }))).toBe(true);
  });

  test("invalid inputs", () => {
    expect(() => gaussianTouchProbability({ side: "long", leverage: 5, sigmaDaily: 0, horizonDays: 7 })).toThrow("sigma_invalid");
    expect(() => gaussianTouchProbability({ side: "long", leverage: 5, sigmaDaily: 4, horizonDays: 7 })).toThrow("sigma_invalid");
    expect(() => gaussianTouchProbability({ side: "long", leverage: 5, sigmaDaily: 0.05, horizonDays: 0 })).toThrow("horizon_invalid");
  });
});

describe("simulateExtremes", () => {
  const perBar = (sigmaDaily: number, barMs: number) => sigmaDaily / Math.sqrt(DAY / barMs);

  test("constant volatility on coarse bars matches the analytic probability only because of the bridge correction", () => {
    // 7 daily steps: monitoring the closes alone would put the 5x long near 0.10 instead of 0.16
    const returns = gaussianDraws(3, 3000, perBar(0.06, DAY));
    const sample = simulateExtremes({ returns, barMs: DAY, horizonDays: 7, seed: 42, paths: 20_000, dynamic: false, sigmaStartDaily: 0.06 });
    if (sample.status !== "ok") throw new Error("expected a sample");
    expect(sample.steps).toBe(7);
    for (const [side, leverage, analytic] of [["long", 5, 0.15982147192266072], ["short", 5, 0.2507548475744455], ["long", 3, 0.010643512924451247], ["short", 3, 0.06995117278254617], ["long", 10, 0.5068766657091364]] as const) {
      const t = touchFromExtremes(sample, side, leverage);
      expect(Math.abs(t.probability - analytic)).toBeLessThan(4 * t.stdError + 0.004);
    }
  });

  test("constant volatility on fine bars agrees with the analytic probability", () => {
    const returns = gaussianDraws(4, 2000, perBar(0.06, BAR15));
    const sample = simulateExtremes({ returns, barMs: BAR15, horizonDays: 7, seed: 7, paths: 6000, dynamic: false, sigmaStartDaily: 0.06 });
    if (sample.status !== "ok") throw new Error("expected a sample");
    expect(sample.steps).toBe(672);
    for (const [side, leverage, analytic] of [["long", 5, 0.15982147192266072], ["short", 5, 0.2507548475744455]] as const) {
      const t = touchFromExtremes(sample, side, leverage);
      expect(Math.abs(t.probability - analytic)).toBeLessThan(4 * t.stdError + 0.004);
    }
  });

  test("clustered fat tailed returns: far barriers are far likelier than the gaussian says, near barriers slightly less", () => {
    const returns = simulateGarchReturns(21, 3000, { alpha: 0.08, beta: 0.9, sigma: perBar(0.04, BAR15), tDf: 4 });
    const sigmaDaily = Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length) * Math.sqrt(DAY / BAR15);
    const sampleFor = (horizonDays: number, paths: number) => {
      const s = simulateExtremes({ returns, barMs: BAR15, horizonDays, seed: 5, paths, sigmaStartDaily: sigmaDaily });
      if (s.status !== "ok") throw new Error("expected a sample");
      expect(s.dynamic).toBe(true);
      return s;
    };
    // 3 days, 3x short: the barrier sits about 3.6 gaussian sigmas out (gaussian 3e-5), the tails reach it (about 2e-3)
    const far = sampleFor(3, 8000);
    const farTouch = touchFromExtremes(far, "short", 3);
    const farGaussian = gaussianTouchProbability({ side: "short", leverage: 3, sigmaDaily, horizonDays: 3 });
    expect(farTouch.probability).toBeGreaterThan(10 * farGaussian);
    expect(farTouch.probability).toBeGreaterThan(farGaussian + 3 * farTouch.stdError);
    // 7 days, 12x long: about one gaussian sigma out, where a scale mixture has less mass than the gaussian
    const near = sampleFor(7, 8000);
    const nearTouch = touchFromExtremes(near, "long", 12);
    const nearGaussian = gaussianTouchProbability({ side: "long", leverage: 12, sigmaDaily, horizonDays: 7 });
    expect(nearTouch.probability).toBeLessThan(nearGaussian);
    expect(nearTouch.probability).toBeGreaterThan(0.8 * nearGaussian);
  });

  test("probability grows with leverage and the short side is riskier than the long side on symmetric data", () => {
    const returns = gaussianDraws(8, 1500, perBar(0.05, BAR15));
    const sample = simulateExtremes({ returns, barMs: BAR15, horizonDays: 5, seed: 1, paths: 4000 });
    if (sample.status !== "ok") throw new Error("expected a sample");
    const p = (side: "long" | "short", l: number) => touchFromExtremes(sample, side, l).probability;
    expect(p("long", 2)).toBeLessThanOrEqual(p("long", 3));
    expect(p("long", 3)).toBeLessThan(p("long", 5));
    expect(p("short", 3)).toBeLessThan(p("short", 5));
    expect(p("short", 5)).toBeGreaterThan(p("long", 5));
  });

  test("only the newest 5000 returns feed the fit, the filter and the residual pool, so an old regime cannot contaminate them", () => {
    const old = gaussianDraws(31, 1000, 0.05);
    const recent = gaussianDraws(32, 5000, 0.002);
    const sample = simulateExtremes({ returns: [...old, ...recent], barMs: BAR15, horizonDays: 1, seed: 4, paths: 200 });
    if (sample.status !== "ok") throw new Error("expected a sample");
    expect(sample.residualCount).toBe(5000);
    const mean2 = recent.reduce((a, b) => a + b * b, 0) / recent.length;
    expect(sample.garch!.longRunVariance).toBeCloseTo(mean2, 15);
    expect(sample.sigmaStartDaily).toBeLessThan(0.002 * Math.sqrt(96) * 2);
  });

  test("the residual model defaults to empirical, evt needs enough residuals and says what ran", () => {
    const long = gaussianDraws(41, 1500, 0.005);
    const short = gaussianDraws(42, 110, 0.005);
    const run = (returns: number[], tail?: "empirical" | "evt") => {
      const s = simulateExtremes({ returns, barMs: BAR15, horizonDays: 1, seed: 3, paths: 300, ...(tail ? { tail } : {}) });
      if (s.status !== "ok") throw new Error("expected a sample");
      return s.tailModel;
    };
    expect(run(long)).toBe("empirical");
    expect(run(long, "empirical")).toBe("empirical");
    expect(run(long, "evt")).toBe("evt");
    expect(run(short, "evt")).toBe("empirical");
  });

  test("with the extreme value tails a far barrier gets at least the empirical probability on fat tailed clustered data, and a near one agrees", () => {
    const returns = simulateGarchReturns(61, 1500, { alpha: 0.08, beta: 0.9, sigma: perBar(0.04, BAR15), tDf: 3 });
    const sample = (tail: "empirical" | "evt") => {
      const s = simulateExtremes({ returns, barMs: BAR15, horizonDays: 3, seed: 8, paths: 12_000, tail });
      if (s.status !== "ok") throw new Error("expected a sample");
      return s;
    };
    const emp = sample("empirical");
    const evt = sample("evt");
    const far = (s: typeof emp) => touchFromExtremes(s, "short", 3);
    const near = (s: typeof emp) => touchFromExtremes(s, "long", 12);
    expect(far(evt).probability).toBeGreaterThanOrEqual(far(emp).probability - 2 * far(emp).stdError);
    expect(Math.abs(near(evt).probability - near(emp).probability)).toBeLessThan(4 * (near(evt).stdError + near(emp).stdError));
  });

  test("the evt run is deterministic for a seed", () => {
    const returns = simulateGarchReturns(62, 1200, { alpha: 0.08, beta: 0.9, sigma: perBar(0.04, BAR15), tDf: 4 });
    const probe = () => {
      const s = simulateExtremes({ returns, barMs: BAR15, horizonDays: 2, seed: 5, paths: 500, tail: "evt" });
      if (s.status !== "ok") throw new Error("expected a sample");
      return Array.from(s.maxLog.slice(0, 10));
    };
    expect(probe()).toEqual(probe());
  });

  test("immediate and unreachable barriers do not depend on the sample", () => {
    const sample = simulateExtremes({ returns: gaussianDraws(9, 400, 0.005), barMs: BAR15, horizonDays: 2, seed: 2, paths: 500 });
    if (sample.status !== "ok") throw new Error("expected a sample");
    expect(touchFromExtremes(sample, "long", 1)).toEqual({ probability: 0, stdError: 0 });
    expect(touchFromExtremes(sample, "long", 5, 0.2)).toEqual({ probability: 1, stdError: 0 });
  });

  test("the same seed gives the same sample and another seed gives another", () => {
    const returns = gaussianDraws(10, 500, 0.005);
    const run = (seed: number) => {
      const s = simulateExtremes({ returns, barMs: BAR15, horizonDays: 2, seed, paths: 800 });
      if (s.status !== "ok") throw new Error("expected a sample");
      return touchFromExtremes(s, "short", 5).probability;
    };
    expect(run(1)).toBe(run(1));
    expect(run(1)).not.toBe(run(2));
  });

  test("what cannot be supported is unavailable with a reason, never a number", () => {
    expect(simulateExtremes({ returns: gaussianDraws(1, 30, 0.005), barMs: BAR15, horizonDays: 2, seed: 1 })).toEqual({ status: "unavailable", reason: "too_few_returns" });
    expect(simulateExtremes({ returns: [...gaussianDraws(1, 200, 0.005), Number.NaN], barMs: BAR15, horizonDays: 2, seed: 1 })).toEqual({ status: "unavailable", reason: "returns_invalid" });
    expect(simulateExtremes({ returns: new Array(200).fill(0), barMs: BAR15, horizonDays: 2, seed: 1 })).toEqual({ status: "unavailable", reason: "sigma_zero" });
  });

  test("budget and argument errors", () => {
    const returns = gaussianDraws(1, 300, 0.005);
    expect(() => simulateExtremes({ returns, barMs: BAR15, horizonDays: 20, seed: 1, paths: 50_000 })).toThrow("budget_exceeded");
    expect(() => simulateExtremes({ returns, barMs: BAR15, horizonDays: 2, seed: 1, paths: 10 })).toThrow("option_invalid");
    expect(() => simulateExtremes({ returns, barMs: 0, horizonDays: 2, seed: 1 })).toThrow("bar_invalid");
    expect(() => simulateExtremes({ returns, barMs: BAR15, horizonDays: 0, seed: 1 })).toThrow("horizon_invalid");
    expect(() => simulateExtremes({ returns, barMs: BAR15, horizonDays: 2, seed: Number.NaN })).toThrow("option_invalid");
  });
});
