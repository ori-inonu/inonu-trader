// T6.3 / SMT-4, AC-SMT-2: the on-chain smart money trail of a token, a score from 0 to 100 over normalised components
// with the absent ones left out and listed. V-TRAIL-1 of flow-engine.md 6. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { COMPONENTS, DEFAULT_TRAIL_WEIGHTS, boughtComponent, concentrationComponent, trailScore, walletsComponent, unsoldComponent } from "./trail";

describe("V-TRAIL-1", () => {
  const present = { compra: 0.8, carteiras: 0.6, naoVendida: 0.6, qualidade: null, concentracao: 0.5, risco: 1.0, liquidez: 0.4, fluxo: 0.7, sentimento: null };

  test("present weights 7.6, weighted sum 5.28, score 69.47, and the absent components are listed in order", () => {
    const result = trailScore(present, { honeypot: false });
    expect(result.nota).toBeCloseTo(69.47, 2);
    expect(result.componentesAusentes).toEqual(["qualidade", "sentimento"]);
    expect(result.componentes.compra).toBe(0.8);
    expect(result.pesos).toEqual(DEFAULT_TRAIL_WEIGHTS);
  });

  test("a honeypot zeroes the whole score", () => {
    expect(trailScore(present, { honeypot: true }).nota).toBe(0);
  });

  test("the default weights are the documented priors", () => {
    expect(DEFAULT_TRAIL_WEIGHTS).toEqual({ compra: 1.5, carteiras: 1.0, naoVendida: 1.0, qualidade: 1.0, concentracao: 1.0, risco: 1.5, liquidez: 0.8, fluxo: 0.8, sentimento: 0.4 });
    expect([...COMPONENTS]).toEqual(["compra", "carteiras", "naoVendida", "qualidade", "concentracao", "risco", "liquidez", "fluxo", "sentimento"]);
  });

  test("weights are configurable and recorded in the result", () => {
    const result = trailScore({ ...present, risco: 0 }, { honeypot: false, weights: { risco: 0.1 } });
    expect(result.pesos.risco).toBe(0.1);
    expect(result.pesos.compra).toBe(1.5);
  });

  test("with no component at all there is no score: null with every component listed as absent", () => {
    const none = Object.fromEntries(COMPONENTS.map((c) => [c, null])) as Parameters<typeof trailScore>[0];
    const result = trailScore(none, { honeypot: false });
    expect(result.nota).toBeNull();
    expect(result.componentesAusentes).toHaveLength(9);
  });

  test("a component outside 0 to 1 is an error, not a clamp", () => {
    expect(() => trailScore({ ...present, compra: 1.2 }, { honeypot: false })).toThrow();
    expect(() => trailScore({ ...present, compra: Number.NaN }, { honeypot: false })).toThrow();
  });

  test("a bad weight is an error", () => {
    expect(() => trailScore(present, { honeypot: false, weights: { compra: 0 } })).toThrow();
  });
});

describe("component helpers (the ones with a formula in the spec)", () => {
  test("bought: log1p of the net unsold amount over log1p of the P95 of the set, clamped to 1", () => {
    const set = [100, 200, 400, 800, 1600];
    expect(boughtComponent(0, set)).toBe(0);
    expect(boughtComponent(1600, set)).toBeCloseTo(1, 10); // the P95 of five values is the 5th
    expect(boughtComponent(100000, set)).toBe(1);
    expect(boughtComponent(400, set)).toBeCloseTo(Math.log1p(400) / Math.log1p(1600), 10);
    expect(boughtComponent(10, [])).toBeNull();
  });

  test("wallets: min(1, n / 10)", () => {
    expect(walletsComponent(0)).toBe(0);
    expect(walletsComponent(4)).toBe(0.4);
    expect(walletsComponent(25)).toBe(1);
  });

  test("unsold: 1 minus the mean sold percentage", () => {
    expect(unsoldComponent([10, 50])).toBeCloseTo(0.7, 10);
    expect(unsoldComponent([])).toBeNull();
  });

  test("concentration: the cluster label (Baixa 1, Media 0.5, Alta 0) or the top 10 holder share", () => {
    expect(concentrationComponent({ cluster: "Baixa" })).toBe(1);
    expect(concentrationComponent({ cluster: "Media" })).toBe(0.5);
    expect(concentrationComponent({ cluster: "Alta" })).toBe(0);
    expect(concentrationComponent({ cluster: "Média" })).toBe(0.5); // the provider may send the accent
    expect(concentrationComponent({ top10HolderPercent: 30 })).toBeCloseTo(0.7, 10);
    expect(concentrationComponent({})).toBeNull();
    expect(concentrationComponent({ cluster: "desconhecida", top10HolderPercent: 40 })).toBeCloseTo(0.6, 10);
  });
});
