import { describe, expect, test } from "bun:test";
import {
  BASELINE,
  DECK_VIEWS,
  ecosystemTotals,
  familySummaries,
  leverageBars,
  medianHeight,
  riskReading,
  sigmaFor,
  tierSteps,
} from "./growth-deck";

describe("medianHeight", () => {
  test("1x sits on the baseline, 4x at the top, 0.25x at the floor", () => {
    expect(medianHeight(1)).toBeCloseTo(BASELINE);
    expect(medianHeight(4)).toBeCloseTo(1);
    expect(medianHeight(0.25)).toBeCloseTo(0);
    expect(medianHeight(100)).toBe(1);
    expect(medianHeight(0)).toBe(0);
    expect(medianHeight(NaN)).toBe(0);
  });
});

describe("leverageBars", () => {
  const params = { capitalUsd: 100, sigma: 0.06, mu: 0, days: 30 };

  test("one bar per leverage, with text and bounded heights", () => {
    const bars = leverageBars(params);
    expect(bars.map((b) => b.leverage)).toEqual([1, 2, 3, 5, 10, 20]);
    for (const bar of bars) {
      expect(bar.medianHeight).toBeGreaterThanOrEqual(0);
      expect(bar.medianHeight).toBeLessThanOrEqual(1);
      expect(bar.touchHeight).toBeGreaterThanOrEqual(0);
      expect(bar.touchHeight).toBeLessThanOrEqual(1);
      expect(bar.leverageText.endsWith("x")).toBe(true);
    }
  });

  test("without edge the median shrinks with leverage and the touch probability grows", () => {
    const bars = leverageBars(params);
    for (let i = 1; i < bars.length; i += 1) {
      expect(bars[i]!.medianMultiple).toBeLessThan(bars[i - 1]!.medianMultiple);
      expect(bars[i]!.touchProbability).toBeGreaterThanOrEqual(bars[i - 1]!.touchProbability);
    }
    expect(bars[0]!.capitalText).toBeLessThan(100);
  });

  test("matches the R3 reference: sigma 6%, 30 days, 2x touches about 12.8%", () => {
    const bars = leverageBars(params, [2, 3]);
    expect(bars[0]!.touchProbability).toBeCloseTo(0.128, 2);
    expect(bars[1]!.touchProbability).toBeCloseTo(0.31, 1);
  });
});

describe("riskReading", () => {
  test("no edge means Kelly undefined and a shrinking median", () => {
    const reading = riskReading({ capitalUsd: 100, sigma: 0.04, mu: 0, days: 30 }, 5);
    expect(reading.kellyText).toContain("indefinido");
    expect(reading.verdict).toContain("encolhe");
  });

  test("with an edge, growth below twice Kelly and shrink above it", () => {
    const grow = riskReading({ capitalUsd: 100, sigma: 0.04, mu: 0.004, days: 30 }, 2);
    expect(grow.kellyText).toContain("Kelly 2,5x");
    expect(grow.verdict).toContain("cresce");
    const shrink = riskReading({ capitalUsd: 100, sigma: 0.04, mu: 0.004, days: 30 }, 10);
    expect(shrink.verdict).toContain("passa do dobro");
  });
});

describe("static deck data", () => {
  test("three views, known sigmas, five tier steps", () => {
    expect(DECK_VIEWS.map((v) => v.id)).toEqual(["risk", "limits", "ecosystem"]);
    expect(sigmaFor("BTC")).toBeCloseTo(0.0196);
    expect(sigmaFor("nope")).toBeCloseTo(0.0667);
    const steps = tierSteps();
    expect(steps.map((s) => s.tier.id)).toEqual(["T0", "T1", "T2-A", "T2-B", "T2-C"]);
    expect(steps[0]!.stateTone).toBe("active");
    expect(steps.filter((s) => s.stateTone === "blocked").length).toBe(3);
  });

  test("family summaries cover the whole catalog and shares sum to one", () => {
    const summaries = familySummaries();
    const totals = ecosystemTotals();
    expect(summaries.reduce((sum, s) => sum + s.counts.total, 0)).toBe(totals.total);
    for (const summary of summaries) {
      expect(summary.shares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
    }
  });

  test("no dashes or middle dots in any deck text", () => {
    const banned = /[–—·•]/;
    for (const view of DECK_VIEWS) expect(banned.test(view.label)).toBe(false);
    for (const step of tierSteps()) expect(banned.test(step.stateLabel)).toBe(false);
    const reading = riskReading({ capitalUsd: 1, sigma: 0.01, mu: 0, days: 1 }, 1);
    expect(banned.test(reading.verdict + reading.kellyText)).toBe(false);
  });
});
