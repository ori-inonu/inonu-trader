import { describe, expect, test } from "bun:test";
import { buildQuantAnnex, QUANT_ANNEX_SCHEMA, type QuantAnnex } from "./annex";
import { candlesFromPublicRows } from "./rows";
import { gaussianTouchProbability } from "./touch";
import { sigmaBand } from "./volatility";
import { tailProfile } from "./tail";
import { fitGarch11 } from "./garch";
import { logReturnsOf } from "./stats";
import { simulateCandles } from "./test-support";
import { QuantError, type Candle } from "./types";

const BAR = 900_000;
const LADDER = [1, 2, 3, 5].flatMap((leverage) => (["long", "short"] as const).map((side) => ({ id: `${side}-${leverage}x`, side, leverage })));

function market(bars = 600, seed = 3): Candle[] {
  return simulateCandles({ seed, bars, sigmaDaily: 0.05, barMs: BAR, substeps: 30 });
}
const nowAfter = (c: readonly Candle[]) => (c.length ? c[c.length - 1]!.startMs : 1_800_000_000_000) + BAR + 1_000;
const base = (candles: Candle[]) => ({ candles, barMs: BAR, nowMs: nowAfter(candles), horizonDays: 3, candidates: LADDER, seed: 11, paths: 1500 });

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.push(k); keysDeep(v, out); }
  return out;
}
const ok = (annex: QuantAnnex) => {
  if (annex.status !== "ok") throw new Error(`expected ok, got ${annex.reason}`);
  return annex;
};

describe("buildQuantAnnex", () => {
  test("an audited, fresh series gives quality, a sigma band, tail shape and per candidate touch probabilities", () => {
    const annex = ok(buildQuantAnnex(base(market())));
    expect(annex.schemaVersion).toBe(QUANT_ANNEX_SCHEMA);
    expect(annex.quality.grade).toBe("A");
    expect(annex.quality.fresh).toBe(true);
    expect(annex.sigma.central!).toBeGreaterThan(0.03);
    expect(annex.sigma.low!).toBeLessThanOrEqual(annex.sigma.central!);
    expect(annex.sigma.high!).toBeGreaterThanOrEqual(annex.sigma.central!);
    expect(annex.candidates.map((c) => c.id)).toEqual(LADDER.map((c) => c.id));
    for (const c of annex.candidates) {
      for (const value of [c.sideAwareTouch, c.simulatedTouch]) {
        expect(value).not.toBeNull();
        expect(value!).toBeGreaterThanOrEqual(0);
        expect(value!).toBeLessThanOrEqual(1);
      }
    }
    expect(annex.simulation).toMatchObject({ paths: 1500, steps: 288, seed: 11 });
  });

  test("the side aware figure is the closed form with the band sigma, and a 1x long cannot be liquidated", () => {
    const candles = market();
    const annex = ok(buildQuantAnnex(base(candles)));
    const sigma = sigmaBand(candles, BAR).central!;
    const short3 = annex.candidates.find((c) => c.id === "short-3x")!;
    expect(short3.sideAwareTouch!).toBeCloseTo(Math.round(gaussianTouchProbability({ side: "short", leverage: 3, sigmaDaily: sigma, horizonDays: 3 }) * 1e6) / 1e6, 6);
    expect(annex.candidates.find((c) => c.id === "long-1x")!.sideAwareTouch).toBe(0);
    expect(annex.candidates.find((c) => c.id === "short-5x")!.sideAwareTouch!).toBeGreaterThan(annex.candidates.find((c) => c.id === "long-5x")!.sideAwareTouch!);
  });

  test("the same input gives the same annex; another seed moves only the simulated figures", () => {
    const candles = market();
    const a = ok(buildQuantAnnex(base(candles)));
    const b = ok(buildQuantAnnex(base(candles)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = ok(buildQuantAnnex({ ...base(candles), seed: 12 }));
    expect(c.candidates.map((x) => x.sideAwareTouch)).toEqual(a.candidates.map((x) => x.sideAwareTouch));
    expect(c.candidates.map((x) => x.simulatedTouch)).not.toEqual(a.candidates.map((x) => x.simulatedTouch));
  });

  test("lost bars lower the grade but the contiguous suffix still produces an annex", () => {
    const candles = market();
    const gapped = [...candles.slice(0, 40), ...candles.slice(45)];
    const annex = ok(buildQuantAnnex(base(gapped)));
    expect(annex.quality.grade).toBe("C");
    expect(annex.quality.coverage).toBeLessThan(1);
    expect(annex.quality.usable).toBe(gapped.length - 40);
    expect(annex.quality.issues.gap).toBe(1);
  });

  test("a stale series gives no numbers at all", () => {
    const candles = market();
    const annex = buildQuantAnnex({ ...base(candles), nowMs: nowAfter(candles) + 10 * BAR });
    expect(annex.status).toBe("unavailable");
    if (annex.status === "unavailable") {
      expect(annex.reason).toBe("stale");
      expect(annex.quality.grade).toBe("F");
    }
    expect(JSON.stringify(annex)).not.toContain("Touch");
  });

  test("too few bars is unavailable with its own reason", () => {
    const annex = buildQuantAnnex(base(market(15)));
    expect(annex).toMatchObject({ status: "unavailable", reason: "too_few_candles" });
    expect(buildQuantAnnex(base([]))).toMatchObject({ status: "unavailable", reason: "too_few_candles" });
  });

  test("enough bars for a band but not for a fit gives sigma and the closed form, with null simulated figures", () => {
    const annex = ok(buildQuantAnnex(base(market(60))));
    expect(annex.simulation).toBeNull();
    expect(annex.clustering).toBeNull();
    expect(annex.candidates.every((c) => c.simulatedTouch === null && c.simulatedStdError === null)).toBe(true);
    expect(annex.candidates.some((c) => c.sideAwareTouch !== null)).toBe(true);
  });

  test("the annex carries evidence only: no decision flavored key at any depth, and plain finite JSON", () => {
    const annex = buildQuantAnnex(base(market()));
    const forbidden = new Set(["buy", "sell", "hold", "action", "signal", "signals", "recommend", "recommendation", "vote", "choice", "choose", "decision", "order"]);
    expect(keysDeep(annex).filter((k) => forbidden.has(k.toLowerCase()))).toEqual([]);
    const text = JSON.stringify(annex);
    expect(text).not.toMatch(/NaN|Infinity/);
    expect(JSON.parse(text)).toEqual(annex);
  });

  test("never mutates its input", () => {
    const candles = Object.freeze(market().map((c) => Object.freeze({ ...c })));
    const candidates = Object.freeze(LADDER.map((c) => Object.freeze({ ...c })));
    expect(() => buildQuantAnnex({ ...base([...candles]), candidates })).not.toThrow();
  });

  test("invalid candidates and options are refused with constant codes", () => {
    const candles = market();
    expect(() => buildQuantAnnex({ ...base(candles), candidates: [{ id: "x", side: "long", leverage: 0 }] })).toThrow(QuantError);
    expect(() => buildQuantAnnex({ ...base(candles), horizonDays: 0 })).toThrow("horizon_invalid");
    expect(() => buildQuantAnnex({ ...base(candles), barMs: 0 })).toThrow("bar_invalid");
  });
});

describe("candlesFromPublicRows", () => {
  const row = (startMs: number, close: string, extra: Partial<{ open: string | null; high: string | null; low: string | null; vol: string | null; confirmed: boolean }> = {}) =>
    ({ startMs, open: "100", high: "101", low: "99", close, vol: "5", confirmed: true, ...extra });

  test("parses decimals and keeps the order it was given", () => {
    const candles = candlesFromPublicRows([row(2000, "100.5"), row(1000, "100")]);
    expect(candles.map((c) => c.startMs)).toEqual([2000, 1000]);
    expect(candles[0]).toEqual({ startMs: 2000, open: 100, high: 101, low: 99, close: 100.5, volume: 5, confirmed: true });
  });

  test("an unreadable price becomes NaN so the audit reports it instead of the row vanishing", () => {
    const [candle] = candlesFromPublicRows([row(1000, "abc")]);
    expect(Number.isNaN(candle!.close)).toBe(true);
    const [missing] = candlesFromPublicRows([row(1000, "100", { high: null })]);
    expect(Number.isNaN(missing!.high)).toBe(true);
  });

  test("missing volume is null, not zero", () => {
    expect(candlesFromPublicRows([row(1000, "100", { vol: null })])[0]!.volume).toBeNull();
  });
});

describe("buildQuantAnnex robustness and exact shape", () => {
  const okOf = (annex: QuantAnnex) => {
    if (annex.status !== "ok") throw new Error(`expected ok, got ${annex.reason}`);
    return annex;
  };

  test("a simulation that would exceed the work budget is skipped with its reason; the closed form and the cycle survive", () => {
    const candles = simulateCandles({ seed: 3, bars: 600, sigmaDaily: 0.05, barMs: 60_000, substeps: 10 });
    const annex = okOf(buildQuantAnnex({ candles, barMs: 60_000, nowMs: candles[candles.length - 1]!.startMs + 61_000, horizonDays: 7, candidates: LADDER, seed: 1 }));
    expect(annex.simulation).toBeNull();
    expect(annex.simulationSkipped).toBe("budget_exceeded");
    expect(annex.clustering).toBeNull();
    expect(annex.candidates.every((c) => c.simulatedTouch === null && c.simulatedStdError === null)).toBe(true);
    expect(annex.candidates.some((c) => c.sideAwareTouch !== null)).toBe(true);
  });

  test("an absurd horizon cannot throw out of the annex", () => {
    const candles = market();
    for (const horizonDays of [60, 1e9]) {
      expect(() => buildQuantAnnex({ ...base(candles), horizonDays })).not.toThrow();
    }
    expect(okOf(buildQuantAnnex({ ...base(market()), horizonDays: 1e9 })).simulationSkipped).toBe("budget_exceeded");
  });

  test("a run that simulates has no skip reason", () => {
    expect(okOf(buildQuantAnnex(base(market()))).simulationSkipped).toBeNull();
  });

  test("a short history says the simulation was skipped for lack of returns", () => {
    expect(okOf(buildQuantAnnex(base(market(60)))).simulationSkipped).toBe("too_few_returns");
  });

  test("a clustering fit that sits on the edge of the grid carries no half life", () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const annex = okOf(buildQuantAnnex(base(market(150, seed))));
      if (annex.clustering === null) continue;
      checked += 1;
      expect(typeof annex.clustering.atBoundary).toBe("boolean");
      if (annex.clustering.atBoundary) expect(annex.clustering.halfLifeBars).toBeNull();
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("the annex has exactly these keys at every level: evidence only, nothing else can slip in", () => {
    const annex = okOf(buildQuantAnnex(base(market())));
    expect(Object.keys(annex).sort()).toEqual(["candidates", "clustering", "horizonDays", "quality", "schemaVersion", "sigma", "simulation", "simulationSkipped", "status", "tail"]);
    expect(Object.keys(annex.quality).sort()).toEqual(["coverage", "fresh", "grade", "issues", "usable"]);
    expect(Object.keys(annex.sigma).sort()).toEqual(["central", "dispersion", "high", "low", "recentRatio", "regime", "tailRatio"]);
    expect(Object.keys(annex.tail).sort()).toEqual(["es99", "excessKurtosis", "heavyTailed", "hillIndex", "returns"]);
    expect(Object.keys(annex.clustering!).sort()).toEqual(["alpha", "atBoundary", "beta", "halfLifeBars", "persistence"]);
    expect(Object.keys(annex.simulation!).sort()).toEqual(["paths", "seed", "sigmaStartDaily", "steps"]);
    for (const c of annex.candidates) expect(Object.keys(c).sort()).toEqual(["id", "sideAwareTouch", "simulatedStdError", "simulatedTouch"]);
  });

  test("every field is the quantity it is named after, checked against the independent modules", () => {
    const candles = market();
    const annex = okOf(buildQuantAnnex(base(candles)));
    const band = sigmaBand(candles, BAR);
    expect(annex.sigma.low).toBe(Math.round(band.low! * 1e6) / 1e6);
    expect(annex.sigma.central).toBe(Math.round(band.central! * 1e6) / 1e6);
    expect(annex.sigma.high).toBe(Math.round(band.high! * 1e6) / 1e6);
    expect(annex.sigma.regime).toBe(band.regime);
    expect(annex.sigma.tailRatio).toBe(Math.round(band.tailRatio! * 1e3) / 1e3);
    expect(annex.sigma.recentRatio).toBe(Math.round(band.recentRatio! * 1e3) / 1e3);
    expect(annex.sigma.dispersion).toBe(Math.round(band.dispersion! * 1e4) / 1e4);
    const profile = tailProfile(logReturnsOf(candles.map((c) => c.close))!);
    expect(annex.tail.returns).toBe(candles.length - 1);
    expect(annex.tail.excessKurtosis).toBe(Math.round(profile.excessKurtosis! * 1e3) / 1e3);
    expect(annex.tail.hillIndex).toBe(Math.round(profile.hill! * 1e3) / 1e3);
    expect(annex.tail.es99).toBe(Math.round(profile.es99! * 1e6) / 1e6);
    expect(annex.tail.heavyTailed).toBe(profile.heavyTailed);
    expect(annex.horizonDays).toBe(3);
    expect(annex.simulation!.paths).toBe(1500);
    expect(annex.simulation!.steps).toBe(288);
    expect(annex.clustering!.alpha).toBeGreaterThan(0);
    expect(annex.clustering!.beta).toBeGreaterThan(0);
    expect(annex.clustering!.persistence).toBeCloseTo(annex.clustering!.alpha + annex.clustering!.beta, 3);
  });

  test("the clustering parameters are the fitted alpha and beta, not swapped", () => {
    const candles = market();
    const annex = okOf(buildQuantAnnex(base(candles)));
    const fit = fitGarch11(logReturnsOf(candles.map((c) => c.close))!)!;
    expect(annex.clustering!.alpha).toBe(fit.alpha);
    expect(annex.clustering!.beta).toBe(fit.beta);
    expect(annex.clustering!.alpha).not.toBe(annex.clustering!.beta);
    expect(annex.clustering!.atBoundary).toBe(fit.atBoundary);
  });

  test("the standard error is the binomial one with its one path floor, and it is not the probability", () => {
    const annex = okOf(buildQuantAnnex(base(market())));
    for (const c of annex.candidates) {
      const p = c.simulatedTouch!;
      const expected = Math.sqrt(Math.max(p * (1 - p), 1 / 1500) / 1500);
      if (p > 0 && p < 1) expect(c.simulatedStdError!).toBeCloseTo(expected, 5);
    }
  });

  test("a maintenance margin moves both probabilities exactly as the underlying functions say", () => {
    const candles = market();
    const withMargin = okOf(buildQuantAnnex({ ...base(candles), maintenanceMargin: 0.05 }));
    const without = okOf(buildQuantAnnex(base(candles)));
    const sigma = sigmaBand(candles, BAR).central!;
    const long5 = withMargin.candidates.find((c) => c.id === "long-5x")!;
    expect(long5.sideAwareTouch).toBe(Math.round(gaussianTouchProbability({ side: "long", leverage: 5, sigmaDaily: sigma, horizonDays: 3, maintenanceMargin: 0.05 }) * 1e6) / 1e6);
    expect(long5.sideAwareTouch!).toBeGreaterThan(without.candidates.find((c) => c.id === "long-5x")!.sideAwareTouch!);
    expect(long5.simulatedTouch!).toBeGreaterThan(without.candidates.find((c) => c.id === "long-5x")!.simulatedTouch!);
    expect(withMargin.candidates.find((c) => c.id === "long-3x")!.sideAwareTouch!).toBeGreaterThan(without.candidates.find((c) => c.id === "long-3x")!.sideAwareTouch!);
  });

  test("a margin at or above the liquidation distance means a certain touch in both estimates", () => {
    const annex = okOf(buildQuantAnnex({ ...base(market()), maintenanceMargin: 0.3 }));
    const long3 = annex.candidates.find((c) => c.id === "long-5x")!;
    expect(long3.sideAwareTouch).toBe(1);
    expect(long3.simulatedTouch).toBe(1);
  });

  test("filtering the issue counts keeps only what occurred", () => {
    const candles = market();
    const annex = okOf(buildQuantAnnex(base([...candles.slice(0, 40), ...candles.slice(45)])));
    expect(annex.quality.issues).toEqual({ gap: 1 });
  });
});
