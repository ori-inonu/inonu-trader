/**
 * Adaptive thresholds (T5.5, FLX-8, FLX-12).
 *
 * No market constant is fixed. `minVol`, `Q` and `T` come from percentiles of the instrument's OWN recent candles:
 *
 *   minVol  P50 of the total volume of a level
 *   Q       P90 of the volume of ONE aggressor side at a level
 *   T       P99 of the size of a single trade, over the last trades
 *
 * Volume is compared per tick (the level volume divided by the bin width), so candles of different bin widths are
 * comparable, and the result is scaled back to the width of the candle being analysed. Percentiles use the nearest
 * rank with integer arithmetic, no interpolation. The only floor is one unit, and a unit is the instrument's lot, which
 * is metadata of the instrument and not a market value.
 *
 * Until N candles have closed nothing is returned but the warm-up state (`aquecimento`): a partial window is never used
 * as if it were complete.
 */
import type { LevelRow } from "./factors";

const WARMUP_CANDLES = 50;
const TRADE_WINDOW = 2_000;
const P_MIN_VOL = 50;
const P_SIDE = 90;
const P_TRADE = 99;

/** Nearest-rank percentile of whole numbers: rank = ceil(P * N / 100), at least 1. Null for an empty list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!Number.isInteger(p) || p < 0 || p > 100) throw new RangeError("P is a whole number from 0 to 100");
  if (values.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p * values.length) / 100));
  return [...values].sort((a, b) => a - b)[rank - 1]!;
}

export interface Ratio {
  readonly num: number;
  readonly den: number;
}

const compareRatio = (a: Ratio, b: Ratio): number => {
  const left = BigInt(a.num) * BigInt(b.den);
  const right = BigInt(b.num) * BigInt(a.den);
  return left < right ? -1 : left > right ? 1 : 0;
};

/** The same percentile over fractions, compared exactly; ties keep their input order. */
export function percentileRatio(values: readonly Ratio[], p: number): Ratio | null {
  if (!Number.isInteger(p) || p < 0 || p > 100) throw new RangeError("P is a whole number from 0 to 100");
  if (values.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p * values.length) / 100));
  return [...values].sort(compareRatio)[rank - 1]!;
}

export interface ThresholdCandle {
  /** Bin width, in ticks, of the footprint this candle was built with. */
  readonly binTicks: number;
  readonly levels: readonly Pick<LevelRow, "c" | "v">[];
  /** When this minute closed, by the clock of the engine. Kept only so the memory of a previous run can age each minute by itself. */
  readonly closedAtMs?: number;
}

export interface ThresholdInput {
  /** Closed candles, oldest first. */
  readonly candles: readonly ThresholdCandle[];
  /** Bin width of the candle the thresholds will be applied to. */
  readonly currentBinTicks: number;
  /** Sizes of the latest single trades, in units. */
  readonly tradeUnits: readonly number[];
  readonly warmupCandles?: number;
}

export type Thresholds =
  | { readonly ok: true; readonly minVol: number; readonly q: number; readonly t: number | null; readonly tReason?: "sem_negocios" }
  | { readonly ok: false; readonly reason: "aquecimento"; readonly have: number; readonly need: number };

/** Scales a per-tick ratio to the current bin width, rounding up, never below one unit. */
const scaled = (ratio: Ratio | null, bins: number): number => (ratio === null ? 1 : Math.max(1, Math.ceil((ratio.num * bins) / ratio.den)));

export function adaptiveThresholds(input: ThresholdInput): Thresholds {
  const need = input.warmupCandles ?? WARMUP_CANDLES;
  if (!Number.isSafeInteger(need) || need < 1) throw new RangeError("warmupCandles must be a positive whole number");
  if (!Number.isSafeInteger(input.currentBinTicks) || input.currentBinTicks < 1) throw new RangeError("currentBinTicks must be a positive whole number");
  if (input.candles.length < need) return { ok: false, reason: "aquecimento", have: input.candles.length, need };

  const totals: Ratio[] = [];
  const sides: Ratio[] = [];
  for (const candle of input.candles.slice(-need)) {
    for (const level of candle.levels) {
      if (level.c + level.v > 0) totals.push({ num: level.c + level.v, den: candle.binTicks });
      if (level.c > 0) sides.push({ num: level.c, den: candle.binTicks });
      if (level.v > 0) sides.push({ num: level.v, den: candle.binTicks });
    }
  }
  const minVol = scaled(percentileRatio(totals, P_MIN_VOL), input.currentBinTicks);
  const q = scaled(percentileRatio(sides, P_SIDE), input.currentBinTicks);
  const recent = percentile(input.tradeUnits.slice(-TRADE_WINDOW), P_TRADE);
  return recent === null ? { ok: true, minVol, q, t: null, tReason: "sem_negocios" } : { ok: true, minVol, q, t: Math.max(1, recent) };
}
