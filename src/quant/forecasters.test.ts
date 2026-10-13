import { describe, expect, test } from "bun:test";
import { envelopeForecaster, filteredSimulationForecaster, sideAwareForecaster } from "./forecasters";
import { gaussianTouchProbability, simulateExtremes, touchFromExtremes } from "./touch";
import { logReturnsOf } from "./stats";
import { sigmaBand } from "./volatility";
import { touchLiquidationProbability } from "../policy/envelope";
import { realizedVolatility } from "../system-one/volatility";
import { simulateCandles } from "./test-support";

const BAR = 900_000;
const ctx = { barMs: BAR, horizonDays: 3, seed: 1 };
const train = simulateCandles({ seed: 12, bars: 500, sigmaDaily: 0.05, barMs: BAR });

describe("envelope forecaster", () => {
  test("is exactly the production formula on the production sigma, blind to the side", () => {
    const p = envelopeForecaster().prepare(train, ctx)!;
    const sigma = realizedVolatility(train.map((c) => c.close), BAR).sigmaDaily!;
    expect(p("long", 0.2)).toBe(touchLiquidationProbability(5, sigma, 3));
    expect(p("short", 0.2)).toBe(p("long", 0.2));
    expect(p("long", 0.1)).toBe(touchLiquidationProbability(10, sigma, 3));
  });
  test("null when the production sigma is unknown", () => {
    expect(envelopeForecaster().prepare(train.slice(0, 15), ctx)).toBeNull();
  });
});

describe("side aware forecaster", () => {
  test("is the closed form with the band sigma, and separates the sides", () => {
    const central = sideAwareForecaster("central").prepare(train, ctx)!;
    const sigma = sigmaBand(train, BAR).central!;
    expect(central("short", 0.2)).toBe(gaussianTouchProbability({ side: "short", leverage: 5, sigmaDaily: sigma, horizonDays: 3 }));
    expect(central("short", 0.2)).toBeGreaterThan(central("long", 0.2));
  });
  test("the high variant is at least as risky as the central one", () => {
    const central = sideAwareForecaster("central").prepare(train, ctx)!;
    const high = sideAwareForecaster("high").prepare(train, ctx)!;
    expect(high("long", 0.1)).toBeGreaterThanOrEqual(central("long", 0.1));
    expect(sideAwareForecaster("high").name).toBe("side-aware-high");
  });
  test("null without enough bars", () => {
    expect(sideAwareForecaster("central").prepare(train.slice(0, 10), ctx)).toBeNull();
  });
});

describe("filtered simulation forecaster", () => {
  test("deterministic for a seed, different for another", () => {
    const f = filteredSimulationForecaster(1000);
    const a = f.prepare(train, ctx)!;
    const b = f.prepare(train, ctx)!;
    const c = f.prepare(train, { ...ctx, seed: 2 })!;
    expect(a("short", 0.1)).toBe(b("short", 0.1));
    expect(a("short", 0.1)).not.toBe(c("short", 0.1));
  });
  test("it answers for a distance as the touch of leverage 1 over that distance, with no margin", () => {
    const f = filteredSimulationForecaster(1000).prepare(train, ctx)!;
    const sample = simulateExtremes({ returns: logReturnsOf(train.map((c) => c.close))!, barMs: BAR, horizonDays: 3, seed: 1, paths: 1000 });
    if (sample.status !== "ok") throw new Error("expected a sample");
    for (const d of [0.05, 0.1, 0.2, 0.3]) {
      expect(f("long", d)).toBe(touchFromExtremes(sample, "long", 1 / d).probability);
      expect(f("short", d)).toBe(touchFromExtremes(sample, "short", 1 / d).probability);
    }
  });

  test("the extreme value variant has its own name and its own, different, answers", () => {
    const evt = filteredSimulationForecaster(1000, "evt");
    expect(evt.name).toBe("fhs-evt");
    expect(filteredSimulationForecaster(1000).name).toBe("fhs");
    const a = evt.prepare(train, ctx)!;
    const b = filteredSimulationForecaster(1000).prepare(train, ctx)!;
    expect(a("short", 0.05)).not.toBe(b("short", 0.05));
    expect(a("short", 0.05)).toBe(evt.prepare(train, ctx)!("short", 0.05));
  });

  test("null on a history too short for a fit", () => {
    expect(filteredSimulationForecaster(500).prepare(train.slice(0, 60), ctx)).toBeNull();
  });
});
