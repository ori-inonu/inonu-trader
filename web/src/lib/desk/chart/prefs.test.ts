import { describe, expect, test } from "bun:test";
import {
  CHART_PREFS_KEY,
  DEFAULT_INDICATOR_IDS,
  defaultChartPrefs,
  loadChartPrefs,
  parseChartPrefs,
  saveChartPrefs,
  type ChartPrefs,
} from "./prefs";

/** Minimal Storage double. */
function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("parseChartPrefs", () => {
  test("a valid payload round-trips", () => {
    const prefs = parseChartPrefs({ version: 2, kind: "area", indicators: ["ema9"], renko: { mode: "pct", pct: 0.5 }, smc: { n: 5 } });
    expect(prefs.kind).toBe("area");
    expect(prefs.indicators).toEqual(["ema9"]);
    expect(prefs.renko).toEqual({ mode: "pct", pct: 0.5 });
    expect(prefs.smc.n).toBe(5);
    expect(prefs.version).toBe(2);
  });

  test("every known chart kind is accepted", () => {
    for (const kind of ["candles", "heikin", "ohlc", "line", "area", "renko"] as const) {
      expect(parseChartPrefs({ kind }).kind).toBe(kind);
    }
  });

  test("defaults on null, garbage and non objects", () => {
    for (const raw of [null, undefined, 3, "x", true, []]) {
      expect(parseChartPrefs(raw)).toEqual(defaultChartPrefs());
    }
  });

  test("an unknown kind falls back to candles but keeps valid neighbours", () => {
    const prefs = parseChartPrefs({ version: 2, kind: "weird", indicators: ["ema9"], renko: { mode: "atr", pct: 0.25 } });
    expect(prefs.kind).toBe("candles");
    expect(prefs.indicators).toEqual(["ema9"]);
  });

  test("indicators keeps only known string ids", () => {
    const prefs = parseChartPrefs({ version: 2, indicators: ["ema9", 3, null, "rsi", "a", "ema200", "smZones"] });
    expect(prefs.indicators).toEqual(["ema9", "rsi", "ema200", "smZones"]);
  });

  test("unknown indicator ids are discarded", () => {
    expect(parseChartPrefs({ version: 2, indicators: ["smStructure", "bogus", "vwap"] }).indicators).toEqual(["smStructure", "vwap"]);
  });

  test("indicators that are not an array fall back to the default", () => {
    expect(parseChartPrefs({ version: 2, indicators: "ema9" }).indicators).toEqual([...DEFAULT_INDICATOR_IDS]);
  });

  test("the levels id of the Jev structure lines is a known indicator", () => {
    expect(parseChartPrefs({ version: 2, indicators: ["levels", "bogus"] }).indicators).toEqual(["levels"]);
  });

  test("a payload without version 2 migrates: kind and renko kept, indicators become the new default once", () => {
    const old = { kind: "heikin", indicators: ["ema9", "rsi"], renko: { mode: "pct", pct: 0.5 } };
    const prefs = parseChartPrefs(old);
    expect(prefs.version).toBe(2);
    expect(prefs.kind).toBe("heikin");
    expect(prefs.renko).toEqual({ mode: "pct", pct: 0.5 });
    expect(prefs.indicators).toEqual([...DEFAULT_INDICATOR_IDS]);
    expect(prefs.smc.n).toBe(3);
  });

  test("smc.n clamps to the 2 to 10 range and defaults on garbage", () => {
    expect(parseChartPrefs({ version: 2, smc: { n: 2 } }).smc.n).toBe(2);
    expect(parseChartPrefs({ version: 2, smc: { n: 10 } }).smc.n).toBe(10);
    expect(parseChartPrefs({ version: 2, smc: { n: 1 } }).smc.n).toBe(2);
    expect(parseChartPrefs({ version: 2, smc: { n: 42 } }).smc.n).toBe(10);
    expect(parseChartPrefs({ version: 2, smc: { n: 2.5 } }).smc.n).toBe(3);
    expect(parseChartPrefs({ version: 2, smc: { n: "x" } }).smc.n).toBe(3);
    expect(parseChartPrefs({ version: 2, smc: null }).smc.n).toBe(3);
    expect(parseChartPrefs({ version: 2 }).smc.n).toBe(3);
  });

  test("renko mode falls back to atr and pct clamps to a positive finite number", () => {
    expect(parseChartPrefs({ renko: { mode: "weird", pct: 0.5 } }).renko).toEqual({ mode: "atr", pct: 0.5 });
    expect(parseChartPrefs({ renko: { mode: "pct", pct: -2 } }).renko.pct).toBe(0.25);
    expect(parseChartPrefs({ renko: { mode: "pct", pct: "big" } }).renko.pct).toBe(0.25);
    expect(parseChartPrefs({ renko: null }).renko).toEqual({ mode: "atr", pct: 0.25 });
  });

  test("the defaults are the documented shape", () => {
    expect(defaultChartPrefs()).toEqual({
      version: 2,
      kind: "candles",
      indicators: ["smStructure", "smBlocks", "smGaps", "smLiquidity", "smZones", "smWallets", "volume", "levels"],
      renko: { mode: "atr", pct: 0.25 },
      smc: { n: 3 },
    });
  });
});

describe("loadChartPrefs and saveChartPrefs", () => {
  test("missing key and invalid JSON both give defaults", () => {
    expect(loadChartPrefs(storage())).toEqual(defaultChartPrefs());
    expect(loadChartPrefs(storage({ [CHART_PREFS_KEY]: "{not json" }))).toEqual(defaultChartPrefs());
    expect(loadChartPrefs(storage({ [CHART_PREFS_KEY]: "42" }))).toEqual(defaultChartPrefs());
  });

  test("a stored valid payload is loaded", () => {
    const store = storage({
      [CHART_PREFS_KEY]: JSON.stringify({ version: 2, kind: "line", indicators: ["x", "macd"], renko: { mode: "pct", pct: 1 }, smc: { n: 8 } }),
    });
    const prefs = loadChartPrefs(store);
    expect(prefs.kind).toBe("line");
    expect(prefs.indicators).toEqual(["macd"]);
    expect(prefs.renko.pct).toBe(1);
    expect(prefs.smc.n).toBe(8);
  });

  test("a stored version 1 payload migrates on load", () => {
    const store = storage({ [CHART_PREFS_KEY]: JSON.stringify({ kind: "line", indicators: ["x", "macd"], renko: { mode: "pct", pct: 1 } }) });
    const prefs = loadChartPrefs(store);
    expect(prefs.kind).toBe("line");
    expect(prefs.renko.pct).toBe(1);
    expect(prefs.indicators).toEqual([...DEFAULT_INDICATOR_IDS]);
  });

  test("save writes JSON under the versioned key and load reads it back", () => {
    const store = storage();
    const prefs: ChartPrefs = { version: 2, kind: "ohlc", indicators: ["ema21"], renko: { mode: "atr", pct: 0.25 }, smc: { n: 2 } };
    saveChartPrefs(store, prefs);
    expect(store.dump()[CHART_PREFS_KEY]).toBe(JSON.stringify(prefs));
    expect(loadChartPrefs(store)).toEqual(prefs);
  });

  test("a null storage never throws", () => {
    expect(loadChartPrefs(null)).toEqual(defaultChartPrefs());
    expect(() => saveChartPrefs(null, defaultChartPrefs())).not.toThrow();
  });
});
