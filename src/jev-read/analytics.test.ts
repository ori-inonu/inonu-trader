import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { ANALYSIS_INPUTS_TEXT, stateForModel } from "./decide";
import {
  ANALYTICS_MAX_AGE_MS,
  analysisFor,
  FileAnalyticsSource,
  parseAnalyticsPack,
  projectAnalysis,
  type AnalysisCost,
  type AnalysisCrossAsset,
  type AnalysisDerivatives,
  type AnalysisLevel,
  type AnalysisMomentum,
  type AnalysisSmc,
  type AnalysisStructure,
  type AnalysisTrend,
  type AnalysisVolatility,
  type TapeAnalysis,
} from "./analytics";
import { FUTURE_TOLERANCE_MS, type TapeState } from "./types";

const NOW = 2_000_000_000_000;
const GENERATED = NOW - 30_000;

const TREND: AnalysisTrend = { regime: "up", adx15m: 38.24, efficiency15m: 0.387, emaStack15m: 1, emaStack1h: 0, emaStack4h: 1, extensionAtr15m: 4.26 };
const MOMENTUM: AnalysisMomentum = { rsi5m: 70.3, rsi15m: 56.3, rsi1h: 48.9, macdHistAtr15m: -0.084 };
const VOLATILITY: AnalysisVolatility = { atrBps15m: 65.7, atrBps1h: 64.6, volRank24h: 0.011, bbWidthRank15m: 0.53, bbPercentB15m: 0.577, expectedAbsMove5mBps: 22.02 };
const LEVELS: readonly AnalysisLevel[] = [
  { kind: "support", px: 109.51912, tf: "1h", touches: 2 },
  { kind: "resistance", px: 111.55745, tf: "1h", touches: 1 },
];
const STRUCTURE: AnalysisStructure = {
  donchianPos1h: 0.876,
  levels: LEVELS,
  renkoRun15m: 5,
  resistanceBps: 32.6,
  resistanceTouches: 1,
  supportBps: 9.2,
  supportTouches: 2,
};
const DERIVATIVES: AnalysisDerivatives = {
  fundingPctile: 0.556,
  fundingZ: 0.02,
  longShortRatio: 1.2,
  longShortZ: -1.52,
  oiChange1hPct: 1.104,
  oiPriceRegime: "long_buildup",
  takerBuyShare1h: 0.545,
};
const CROSS: AnalysisCrossAsset = { betaBtc48h: 0.008, corrBtc48h: 0.008, relStrengthVsBtc24hBps: -0.0 };
const COST: AnalysisCost = { assumedRoundTripFeeBps: 20, moveToCost: 1.079, spreadBps: 0.4 };

function features(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { trend: TREND, momentum: MOMENTUM, volatility: VOLATILITY, structure: STRUCTURE, derivatives: DERIVATIVES, crossAsset: CROSS, cost: COST, onchain: null, ...over };
}

function pack(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "jev-analytics",
    engine: { name: "jev_analytics", version: "1.0.0" },
    generatedAtMs: GENERATED,
    source: "okx-public-v5",
    budget: { windowSec: 60, calls: 26, byEndpoint: {} },
    instruments: { "ETH-USDT": { instId: "ETH-USDT", asOfMs: NOW, completeness: 1, features: features(), unavailable: { onchain: "no_credentials" } } },
    ...over,
  };
}

const sampleFixture = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "analytics-pack.sample.json"), "utf8")) as {
  pack: { generatedAtMs: number; instruments: Record<string, unknown> };
};

describe("projectAnalysis", () => {
  test("accepts a full analysis and copies only allowlisted fields", () => {
    const out = projectAnalysis({ ageSec: 12, ...features(), junk: "x", trend: { ...TREND, free: "text" } });
    expect(out).not.toBeNull();
    expect(out).toEqual({
      ageSec: 12,
      trend: TREND,
      momentum: MOMENTUM,
      volatility: VOLATILITY,
      structure: STRUCTURE,
      derivatives: DERIVATIVES,
      crossAsset: CROSS,
      cost: COST,
    });
    expect("onchain" in (out as object)).toBe(false);
    expect("junk" in (out as object)).toBe(false);
  });

  test("needs an integer ageSec from 0 to 86400", () => {
    for (const ageSec of [-1, 86401, 1.5, "12", null, Number.NaN]) {
      expect(projectAnalysis({ ageSec, trend: TREND })).toBeNull();
    }
    expect(projectAnalysis({ ageSec: 0, trend: TREND })).not.toBeNull();
    expect(projectAnalysis({ ageSec: 86400, trend: TREND })).not.toBeNull();
  });

  test("returns null when no section survives and when the input is not a record", () => {
    expect(projectAnalysis(null)).toBeNull();
    expect(projectAnalysis("x")).toBeNull();
    expect(projectAnalysis({ ageSec: 3 })).toBeNull();
    expect(projectAnalysis({ ageSec: 3, trend: "up" })).toBeNull();
  });

  test("a section that violates a constraint is dropped, the rest survive", () => {
    const out = projectAnalysis({ ageSec: 5, ...features(), trend: { ...TREND, adx15m: 101 } });
    expect(out).not.toBeNull();
    expect(out?.trend).toBeUndefined();
    expect(out?.momentum).toEqual(MOMENTUM);
    // A NaN buried in a number field drops its section too.
    const nan = projectAnalysis({ ageSec: 5, ...features(), volatility: { ...VOLATILITY, atrBps15m: Number.NaN } });
    expect(nan?.volatility).toBeUndefined();
    expect(nan?.trend).toEqual(TREND);
  });

  test("closed vocabularies are enforced: a string outside them drops the section", () => {
    expect(projectAnalysis({ ageSec: 1, ...features(), trend: { ...TREND, regime: "moon" } })?.trend).toBeUndefined();
    expect(
      projectAnalysis({ ageSec: 1, ...features(), derivatives: { ...DERIVATIVES, oiPriceRegime: "squeeze" } })?.derivatives,
    ).toBeUndefined();
  });

  test("per-field bounds: ranks in (0,1], rsi 0..100, stacks in {-1,0,1}", () => {
    expect(projectAnalysis({ ageSec: 1, ...features(), volatility: { ...VOLATILITY, volRank24h: 0 } })?.volatility).toBeUndefined();
    expect(projectAnalysis({ ageSec: 1, ...features(), volatility: { ...VOLATILITY, volRank24h: 1.2 } })?.volatility).toBeUndefined();
    expect(projectAnalysis({ ageSec: 1, ...features(), momentum: { ...MOMENTUM, rsi15m: 104 } })?.momentum).toBeUndefined();
    expect(projectAnalysis({ ageSec: 1, ...features(), trend: { ...TREND, emaStack1h: 2 } })?.trend).toBeUndefined();
    // donchianPos1h may sit outside 0..1: the price can be beyond the 24h range.
    expect(projectAnalysis({ ageSec: 1, structure: { ...STRUCTURE, donchianPos1h: -1.04 } })?.structure).not.toBeNull();
  });

  test("structure: support and resistance fields accept null, levels keep only valid entries", () => {
    const sparse = { ...STRUCTURE, supportBps: null, supportTouches: null, resistanceBps: null, resistanceTouches: null };
    expect(projectAnalysis({ ageSec: 1, structure: sparse })?.structure).toEqual(sparse);
    expect(projectAnalysis({ ageSec: 1, structure: { ...STRUCTURE, supportBps: -1 } })?.structure).toBeUndefined();
    expect(projectAnalysis({ ageSec: 1, structure: { ...STRUCTURE, renkoRun15m: 1.5 } })?.structure).toBeUndefined();
    const seven = { ...STRUCTURE, levels: Array.from({ length: 7 }, (_, i) => ({ px: 100 + i, kind: "support", touches: 1, tf: "15m" })) };
    expect(projectAnalysis({ ageSec: 1, structure: seven })?.structure).toBeUndefined();
    const badLevel = { ...STRUCTURE, levels: [...LEVELS, { px: 0, kind: "support", touches: 1, tf: "15m" }] };
    expect(projectAnalysis({ ageSec: 1, structure: badLevel })?.structure).toBeUndefined();
  });

  test("derivatives needs at least one non null field", () => {
    const allNull = { fundingZ: null, fundingPctile: null, oiChange1hPct: null, oiPriceRegime: null, longShortRatio: null, longShortZ: null, takerBuyShare1h: null };
    expect(projectAnalysis({ ageSec: 1, derivatives: allNull })).toBeNull();
    const out = projectAnalysis({ ageSec: 1, derivatives: { ...allNull, fundingZ: 0.1 } });
    expect(out?.derivatives).toEqual({ ...allNull, fundingZ: 0.1 });
    expect(projectAnalysis({ ageSec: 1, derivatives: { ...allNull, takerBuyShare1h: 1.4 } })?.derivatives).toBeUndefined();
  });

  test("a forbidden key anywhere makes the whole analysis null", () => {
    for (const key of ["buy", "sell", "hold", "action", "signal", "signals", "recommend", "recommendation", "vote", "side"]) {
      const out = projectAnalysis({ ageSec: 1, trend: { ...TREND, [key]: 0.5 } });
      expect(out, key).toBeNull();
    }
    expect(projectAnalysis({ ageSec: 1, trend: TREND, nested: { deep: { buy: 1 } } })).toBeNull();
  });
});

describe("parseAnalyticsPack", () => {
  test("parses the schema 1 pack and keeps instruments with their features", () => {
    const parsed = parseAnalyticsPack(pack());
    expect(parsed).not.toBeNull();
    expect(parsed?.generatedAtMs).toBe(GENERATED);
    expect(parsed?.instruments["ETH-USDT"]?.features).toBeTruthy();
    // The envelope extras do not survive the allowlist copy.
    expect("budget" in (parsed as object)).toBe(false);
  });

  test("rejects wrong version, kind, stamp and malformed instrument keys", () => {
    expect(parseAnalyticsPack(null)).toBeNull();
    expect(parseAnalyticsPack({ ...pack(), schemaVersion: 2 })).toBeNull();
    expect(parseAnalyticsPack({ ...pack(), kind: "other" })).toBeNull();
    expect(parseAnalyticsPack({ ...pack(), generatedAtMs: 0 })).toBeNull();
    expect(parseAnalyticsPack({ ...pack(), generatedAtMs: 1.5 })).toBeNull();
    expect(parseAnalyticsPack({ ...pack(), instruments: "x" })).toBeNull();
    const badKey = pack({ instruments: { "eth-usdt": { instId: "eth-usdt", features: features() } } });
    expect(parseAnalyticsPack(badKey)).toBeNull();
    const mismatch = pack({ instruments: { "ETH-USDT": { instId: "BTC-USDT", features: features() } } });
    expect(parseAnalyticsPack(mismatch)).toBeNull();
  });

  test("caps the instrument list at 32", () => {
    const instruments: Record<string, unknown> = {};
    for (let i = 0; i < 33; i += 1) instruments[`T${i}-USDT`] = { instId: `T${i}-USDT`, features: features() };
    expect(parseAnalyticsPack(pack({ instruments }))).toBeNull();
    delete instruments["T32-USDT"];
    expect(parseAnalyticsPack(pack({ instruments }))).not.toBeNull();
  });

  test("a forbidden key anywhere in the raw pack invalidates it all", () => {
    const tainted = pack();
    (tainted.instruments as Record<string, { features: Record<string, unknown> }>)["ETH-USDT"]!.features["action"] = "buy";
    expect(parseAnalyticsPack(tainted)).toBeNull();
    const deep = pack({ instruments: { "ETH-USDT": { instId: "ETH-USDT", features: { trend: { ...TREND, nested: { signal: 1 } } } } } });
    expect(parseAnalyticsPack(deep)).toBeNull();
  });

  test("parses the checked in sample fixture", () => {
    const parsed = parseAnalyticsPack(sampleFixture.pack);
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed?.instruments ?? {}).sort()).toEqual(["BTC-USDT", "ETH-USDT", "MON-USDT"]);
  });
});

describe("analysisFor", () => {
  const parsed = () => {
    const p = parseAnalyticsPack(pack());
    if (p === null) throw new Error("fixture pack failed to parse");
    return p;
  };

  test("projects a fresh pack into the tape analysis with its age in seconds", () => {
    const out = analysisFor(parsed(), "ETH-USDT", NOW);
    expect(out).not.toBeNull();
    expect(out?.ageSec).toBe(30);
    expect(out?.trend).toEqual(TREND);
    expect(out?.structure?.levels).toEqual(LEVELS);
    expect(out?.derivatives).toEqual(DERIVATIVES);
  });

  test("missing instrument, stale pack and a pack from the future all give null", () => {
    const p = parsed();
    expect(analysisFor(p, "SOL-USDT", NOW)).toBeNull();
    expect(analysisFor(p, "ETH-USDT", GENERATED + ANALYTICS_MAX_AGE_MS + 1)).toBeNull();
    expect(analysisFor(p, "ETH-USDT", GENERATED + ANALYTICS_MAX_AGE_MS)).not.toBeNull();
    expect(analysisFor(p, "ETH-USDT", GENERATED - FUTURE_TOLERANCE_MS - 1)).toBeNull();
    expect(analysisFor(p, "ETH-USDT", GENERATED - FUTURE_TOLERANCE_MS)).not.toBeNull();
  });

  test("a custom maxAgeMs is honored and the age floors at zero", () => {
    const p = parsed();
    expect(analysisFor(p, "ETH-USDT", NOW, 10_000)).toBeNull();
    expect(analysisFor(p, "ETH-USDT", GENERATED - 1_000)?.ageSec).toBe(0);
  });
});

describe("FileAnalyticsSource", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "jev-analytics-"));
    dirs.push(d);
    return d;
  };

  test("reads the pack for an instrument and reports presence and age", () => {
    const dir = tmp();
    const file = join(dir, "latest.json");
    writeFileSync(file, JSON.stringify(pack()));
    const source = new FileAnalyticsSource(file);
    const analysis = source.read("ETH-USDT", NOW);
    expect(analysis?.trend).toEqual(TREND);
    expect(source.read("BTC-USDT", NOW)).toBeNull();
    expect(source.status(NOW)).toEqual({ present: true, ageSec: 30 });
    expect(source.read("ETH-USDT", NOW + ANALYTICS_MAX_AGE_MS + 1)).toBeNull();
  });

  test("never throws: missing file, bad json and oversize all give null", () => {
    const dir = tmp();
    const missing = new FileAnalyticsSource(join(dir, "nope.json"));
    expect(missing.read("ETH-USDT", NOW)).toBeNull();
    expect(missing.status(NOW)).toEqual({ present: false, ageSec: null });

    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json");
    expect(new FileAnalyticsSource(bad).read("ETH-USDT", NOW)).toBeNull();

    const big = join(dir, "big.json");
    writeFileSync(big, " ".repeat(1_000_001));
    expect(new FileAnalyticsSource(big).read("ETH-USDT", NOW)).toBeNull();

    const wrong = join(dir, "wrong.json");
    writeFileSync(wrong, JSON.stringify({ hello: 1 }));
    expect(new FileAnalyticsSource(wrong).status(NOW)).toEqual({ present: false, ageSec: null });
  });

  test("caches by file stat and picks up a rewrite", () => {
    const dir = tmp();
    const file = join(dir, "latest.json");
    writeFileSync(file, JSON.stringify(pack()));
    const source = new FileAnalyticsSource(file);
    expect(source.read("ETH-USDT", NOW)?.momentum).toEqual(MOMENTUM);
    // A file replaced between reads is re-parsed.
    writeFileSync(file, JSON.stringify(pack({ generatedAtMs: GENERATED - 60_000 })));
    // Bump the mtime so the cache sees the change even on a coarse filesystem clock.
    const past = new Date(Date.now() - 5_000);
    utimesSync(file, past, past);
    expect(source.status(NOW)).toEqual({ present: true, ageSec: 90 });
  });
});

describe("stateForModel and the prompt contract", () => {
  const analysis = (): TapeAnalysis => {
    const p = parseAnalyticsPack(sampleFixture.pack);
    if (p === null) throw new Error("sample pack failed to parse");
    const out = analysisFor(p, "ETH-USDT", sampleFixture.pack.generatedAtMs);
    if (out === null) throw new Error("sample analysis failed to project");
    return out;
  };

  const state = (): TapeState =>
    ({
      instId: "ETH-USDT",
      horizonMinutes: 5,
      mid: 110,
      spreadBps: 0.4,
      bookImbalanceTop5: 0.1,
      depthQuoteTop5: { bid: 1, ask: 1 },
      returnsBps: { m1: 1, m5: 2, m15: 3, m30: 4 },
      volBpsPerMinute: 1,
      flow60s: { count: 1, buyBase: 1, sellBase: 1, imbalance: 0, cvdBase: 0, vwap: 110, lastPx: 110, lastSide: "buy" },
      change24hPct: 1,
      rangePosition24h: 0.5,
      fundingRatePct: 0.01,
      analysis: analysis(),
    }) as TapeState;

  test("strips only analysis.levels and never mutates the input state", () => {
    const s = state();
    const out = stateForModel(s);
    const json = JSON.stringify(out);
    expect(json).not.toContain('"levels"');
    const a = out.analysis;
    expect(a).toBeDefined();
    expect(a?.structure).toBeDefined();
    expect("levels" in (a?.structure ?? {})).toBe(false);
    expect(a?.trend).toEqual(TREND);
    // The input still carries levels for the UI.
    expect(s.analysis?.structure?.levels).toEqual(analysis().structure?.levels);
  });

  test("every analysis key the model receives is described in ANALYSIS_INPUTS_TEXT", () => {
    const out = stateForModel(state());
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        keys.add(key);
        walk(item);
      }
    };
    walk(out.analysis);
    for (const key of keys) {
      expect(new RegExp(`\\b${key}\\b`).test(ANALYSIS_INPUTS_TEXT)).toBe(true);
    }
    expect(keys.has("ageSec")).toBe(true);
  });

  test("the web drift guard fixture equals the projected analysis of the sample pack", () => {
    const expected = analysis();
    const fixturePath = join(import.meta.dir, "..", "..", "web", "src", "lib", "test-fixtures", "analysis-view.eth.json");
    const onDisk = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(expected)));
  });
});

describe("smart money digest inside structure", () => {
  const SMC = {
    demandBlockBps: 12.5,
    supplyBlockBps: null,
    gapsUp: 2,
    gapsDown: 0,
    gapNearestBps: 0,
    lastBreak: { kind: "CHoCH", dir: "down", ageBars: 4 },
    rangePos: 0.34,
    rangeState: "inside",
    poolAboveBps: 21,
    poolBelowBps: null,
    lastSweep: { kind: "lows", ageBars: 2 },
  } satisfies AnalysisSmc;

  test("a valid digest survives on both timeframes and a missing one is simply absent", () => {
    const both = projectAnalysis({ ageSec: 5, structure: { ...STRUCTURE, smc15m: SMC, smc1h: SMC } })?.structure;
    expect(both?.smc15m).toEqual(SMC);
    expect(both?.smc1h).toEqual(SMC);
    const one = projectAnalysis({ ageSec: 5, structure: { ...STRUCTURE, smc15m: SMC, smc1h: null } })?.structure;
    expect(one?.smc15m).toEqual(SMC);
    expect("smc1h" in (one as object)).toBe(false);
    expect(projectAnalysis({ ageSec: 5, structure: STRUCTURE })?.structure).toEqual(STRUCTURE);
  });

  test("a broken digest is dropped without taking the structure down", () => {
    const bad: Record<string, unknown>[] = [
      { ...SMC, demandBlockBps: -1 },
      { ...SMC, gapNearestBps: Number.POSITIVE_INFINITY },
      { ...SMC, gapsUp: 1.5 },
      { ...SMC, gapsDown: -1 },
      { ...SMC, rangePos: 1.2 },
      { ...SMC, rangeState: "middle" },
      { ...SMC, lastBreak: { kind: "BREAK", dir: "up", ageBars: 1 } },
      { ...SMC, lastBreak: { kind: "BOS", dir: "sideways", ageBars: 1 } },
      { ...SMC, lastBreak: { kind: "BOS", dir: "up", ageBars: -1 } },
      { ...SMC, lastSweep: { kind: "both", ageBars: 1 } },
      { ...SMC, lastSweep: { kind: "highs", ageBars: 1.5 } },
      { ...SMC, poolAboveBps: "21" },
    ];
    for (const smc15m of bad) {
      const structure = projectAnalysis({ ageSec: 5, structure: { ...STRUCTURE, smc15m } })?.structure;
      expect(structure).toEqual(STRUCTURE);
    }
  });

  test("unknown keys inside the digest are never copied", () => {
    const structure = projectAnalysis({ ageSec: 5, structure: { ...STRUCTURE, smc15m: { ...SMC, note: "free text", lastBreak: { ...SMC.lastBreak, why: "x" } } } })?.structure;
    expect(structure?.smc15m).toEqual(SMC);
    expect(JSON.stringify(structure)).not.toContain("free text");
  });

  test("a decision-flavored key anywhere inside the digest refuses the whole analysis", () => {
    expect(projectAnalysis({ ageSec: 5, structure: { ...STRUCTURE, smc15m: { ...SMC, action: "buy" } } })).toBeNull();
    expect(projectAnalysis({ ageSec: 5, structure: { ...STRUCTURE, smc15m: { ...SMC, lastBreak: { ...SMC.lastBreak, side: "up" } } } })).toBeNull();
  });

  test("the model receives the digest and the prompt names every field of it", () => {
    for (const word of ["smc15m", "smc1h", "demandBlockBps", "supplyBlockBps", "gapsUp", "gapsDown", "gapNearestBps", "lastBreak", "rangePos", "rangeState", "poolAboveBps", "poolBelowBps", "lastSweep", "ageBars", "BOS", "CHoCH"]) {
      expect(ANALYSIS_INPUTS_TEXT).toContain(word);
    }
  });
});
