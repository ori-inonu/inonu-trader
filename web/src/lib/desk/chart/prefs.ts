/**
 * Persisted chart preferences (spec G3/G4), localStorage key `jev.chart.prefs.v1`.
 *
 * Any content that is not exactly the expected shape falls back to the defaults, field by field where
 * possible, so a hand edited or older payload never breaks the desk. Unknown indicator ids are dropped.
 */

import type { ChartKind } from "./types";

export const CHART_PREFS_KEY = "jev.chart.prefs.v1";

const KINDS: readonly ChartKind[] = ["candles", "heikin", "ohlc", "line", "area", "renko"];
const RENKO_MODES = ["atr", "pct"] as const;
export type RenkoMode = (typeof RENKO_MODES)[number];

/** Indicator ids persisted in prefs.indicators. Smart money groups first, then classics, panes and levels. */
export const INDICATOR_IDS = [
  "smStructure",
  "smBlocks",
  "smGaps",
  "smLiquidity",
  "smZones",
  "smWallets",
  "ema9",
  "ema21",
  "ema50",
  "ema200",
  "bb",
  "vwap",
  "supertrend",
  "rsi",
  "macd",
  "volume",
  "levels",
] as const;
export type IndicatorId = (typeof INDICATOR_IDS)[number];

/** Prefs written by this version of the desk. Older payloads keep kind and renko but get the new indicators. */
export const PREFS_VERSION = 2;

export const SMC_N_MIN = 2;
export const SMC_N_MAX = 10;
export const SMC_N_DEFAULT = 3;
/** Pivot strength values the popover offers (a subset of the valid range). */
export const SMC_N_OPTIONS: readonly number[] = [2, 3, 5, 8];

export interface ChartPrefs {
  version: typeof PREFS_VERSION;
  kind: ChartKind;
  indicators: IndicatorId[];
  renko: { mode: RenkoMode; pct: number };
  smc: { n: number };
}

export const RENKO_DEFAULT_PCT = 0.25;
/** Percent values the Renko size selector offers. */
export const RENKO_PCT_OPTIONS: readonly number[] = [0.1, 0.25, 0.5, 1];

export const DEFAULT_INDICATOR_IDS: readonly IndicatorId[] = ["smStructure", "smBlocks", "smGaps", "smLiquidity", "smZones", "smWallets", "volume", "levels"];

export function defaultChartPrefs(): ChartPrefs {
  return { version: PREFS_VERSION, kind: "candles", indicators: [...DEFAULT_INDICATOR_IDS], renko: { mode: "atr", pct: RENKO_DEFAULT_PCT }, smc: { n: SMC_N_DEFAULT } };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseChartPrefs(raw: unknown): ChartPrefs {
  const base = defaultChartPrefs();
  if (!isRecord(raw)) return base;
  const kind = KINDS.find((k) => k === raw.kind) ?? base.kind;
  // A saved object without version 2 migrates: kind and renko survive, the indicators adopt the
  // new smart money default list once, and smc.n starts at the default.
  const migrated = raw.version !== PREFS_VERSION;
  const indicators = !migrated && Array.isArray(raw.indicators)
    ? raw.indicators.filter((i): i is IndicatorId => typeof i === "string" && (INDICATOR_IDS as readonly string[]).includes(i))
    : base.indicators;
  let renko = base.renko;
  const rk = raw.renko;
  if (isRecord(rk)) {
    const mode = RENKO_MODES.find((m) => m === rk.mode) ?? base.renko.mode;
    const pct = typeof rk.pct === "number" && Number.isFinite(rk.pct) && rk.pct > 0 ? rk.pct : base.renko.pct;
    renko = { mode, pct };
  }
  const smcN =
    !migrated && isRecord(raw.smc) && typeof raw.smc.n === "number" && Number.isInteger(raw.smc.n)
      ? Math.min(SMC_N_MAX, Math.max(SMC_N_MIN, raw.smc.n))
      : base.smc.n;
  return { version: PREFS_VERSION, kind, indicators, renko, smc: { n: smcN } };
}

/** The smallest slice of Storage the prefs need; `null` on the server or when storage is blocked. */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadChartPrefs(storage: PrefsStorage | null): ChartPrefs {
  if (storage === null) return defaultChartPrefs();
  let raw: string | null = null;
  try {
    raw = storage.getItem(CHART_PREFS_KEY);
  } catch {
    return defaultChartPrefs();
  }
  if (raw === null) return defaultChartPrefs();
  try {
    return parseChartPrefs(JSON.parse(raw));
  } catch {
    return defaultChartPrefs();
  }
}

export function saveChartPrefs(storage: PrefsStorage | null, prefs: ChartPrefs): void {
  if (storage === null) return;
  try {
    storage.setItem(CHART_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked: prefs stay session only.
  }
}
