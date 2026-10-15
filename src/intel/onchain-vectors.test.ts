/**
 * The golden vectors of the on-chain digest (fase-2 SPEC F2-DIG-8). python/tools/make_onchain_vectors.py writes them with its
 * own implementation of each formula (no import from here); the TypeScript runtime must reproduce every expected value.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { concentrationFromGateway } from "./onchain-adapt";
import { flowComponent, liquidityComponent } from "./onchain-components";
import { riskComponent } from "./onchain-risk";
import { percentile } from "./thresholds";
import { DEFAULT_TRAIL_WEIGHTS, boughtComponent, trailScore, type Component } from "./trail";

const V = JSON.parse(readFileSync(fileURLToPath(new URL("../../python/tests/vectors/onchain-vectors.v1.json", import.meta.url)), "utf8")) as {
  origin: string;
  weights: Record<string, number>;
  percentile: Array<{ values: number[]; p: number; expected: number | null }>;
  liquidity: Array<{ value: number | null; set: number[]; expected: number | null }>;
  bought: Array<{ net: number; set: number[]; expected: number | null }>;
  flow: Array<{ buy: number; sell: number; expected: number | null }>;
  risk: Array<{ level: number | null; expected: number | null }>;
  concentration: Array<{ label: string | null; top10: number | null; expected: number | null }>;
  trail: Array<{ name: string; components: Record<Component, number | null>; honeypot: boolean; expected: { nota: number | null; ausentes: string[] } }>;
};

/** |a - b| <= 1e-9 x max(1, |b|); both null counts as equal. */
function same(a: number | null, b: number | null): void {
  if (b === null || a === null) {
    expect(a).toBe(b);
    return;
  }
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(b)));
}

describe("onchain golden vectors (written by Python, reproduced by TypeScript)", () => {
  test("they are labelled synthetic and the weights are the ones the trail uses", () => {
    expect(V.origin).toBe("synthetic_fixture");
    expect(V.weights).toEqual({ ...DEFAULT_TRAIL_WEIGHTS });
  });

  test.each(V.percentile.map((c, i) => [i, c] as const))("percentile %i", (_i, c) => same(percentile(c.values, c.p), c.expected));
  test.each(V.liquidity.map((c, i) => [i, c] as const))("liquidity %i", (_i, c) => same(liquidityComponent(c.value, c.set), c.expected));
  test.each(V.bought.map((c, i) => [i, c] as const))("bought %i", (_i, c) => same(boughtComponent(c.net, c.set), c.expected));
  test.each(V.flow.map((c, i) => [i, c] as const))("flow %i", (_i, c) => same(flowComponent({ buyUsd: c.buy, sellUsd: c.sell }), c.expected));
  test.each(V.risk.map((c, i) => [i, c] as const))("risk %i", (_i, c) => same(riskComponent(c.level).value, c.expected));
  test.each(V.concentration.map((c, i) => [i, c] as const))("concentration %i", (_i, c) => {
    same(concentrationFromGateway({ cluster: c.label === null ? null : { concentration: c.label }, risk: c.top10 === null ? null : { top10HoldPct: c.top10 } }).value, c.expected);
  });
  test.each(V.trail.map((c) => [c.name, c] as const))("trail %s", (_name, c) => {
    const r = trailScore(c.components, { honeypot: c.honeypot });
    same(r.nota, c.expected.nota);
    expect(r.componentesAusentes as string[]).toEqual(c.expected.ausentes);
  });

  test("V-TRAIL-1 stays 69.47, as flow-engine.md of the installer says", () => {
    const v = V.trail.find((c) => c.name === "V-TRAIL-1")!;
    expect(Math.round(trailScore(v.components, { honeypot: false }).nota! * 100) / 100).toBe(69.47);
  });
});
