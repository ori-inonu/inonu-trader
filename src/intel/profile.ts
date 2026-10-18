/**
 * Delta, cumulative delta, absorption and the volume profile (T5.4, FLX-7). Operational definitions of our own, see
 * flow-engine.md 2.6 and 2.7. They describe what was measured; none of them says what to do.
 *
 * Warm-up (FLX-12) is the caller's decision: `absorption` returns null when the P90 of the prior candles or the ATR is
 * not available, and the session CVD is only reported once thresholds.ts says the window is complete.
 */
import { cmpDec, decToString, parseDec, subDec } from "./decimal";
import type { LevelRow } from "./factors";
import { percentile } from "./thresholds";

type Volumes = { readonly c: number; readonly v: number };

/** Net aggression of a candle: what was bought minus what was sold, given either totals or the levels. */
export function candleDelta(candle: Volumes | { readonly levels: readonly LevelRow[] }): number {
  if ("levels" in candle) return candle.levels.reduce((sum, row) => sum + row.c - row.v, 0);
  return candle.c - candle.v;
}

/** Running sum of the candle deltas, in order. */
export function cumulativeDelta(candles: readonly Volumes[]): number[] {
  let total = 0;
  return candles.map((candle) => (total += candleDelta(candle)));
}

export interface AbsorptionInput {
  /** The aggressor side being tested. */
  readonly side: "c" | "v";
  /** That side's volume in the candle, in units. */
  readonly volume: number;
  /** P90 of that side's volume over the prior candles; null during warm-up. */
  readonly p90Prior: number | null;
  readonly open: string;
  readonly close: string;
  readonly atr14: number | null;
  /** Largest displacement against the side, as a share of the ATR. Default a quarter. */
  readonly maxDisplacementAtr?: number;
}

export interface Absorption {
  readonly absorcao: boolean;
  readonly lado: "c" | "v";
  readonly razaoVolume: number;
  readonly deslocamentoEmATR: number;
}

const DEFAULT_MAX_DISPLACEMENT_ATR = 0.25;

/**
 * A lot of aggression (the P90 of the prior candles or more) that moved the price little in its own direction: for
 * selling a small fall, for buying a small rise. The displacement is measured with exact decimals and only the ratio to
 * the ATR is floating point.
 */
export function absorption(input: AbsorptionInput): Absorption | null {
  const open = parseDec(input.open);
  const close = parseDec(input.close);
  if (open === null || close === null) throw new RangeError("open and close must be decimal prices");
  if (input.p90Prior === null || input.p90Prior <= 0 || input.atr14 === null || !(input.atr14 > 0)) return null;
  const towards = input.side === "v" ? subDec(open, close) : subDec(close, open);
  const displacement = cmpDec(towards, { int: 0n, scale: 0 }) > 0 ? Number(decToString(towards)) : 0;
  const deslocamentoEmATR = displacement / input.atr14;
  const razaoVolume = input.volume / input.p90Prior;
  const absorcao = input.volume >= input.p90Prior && deslocamentoEmATR <= (input.maxDisplacementAtr ?? DEFAULT_MAX_DISPLACEMENT_ATR);
  return { absorcao, lado: input.side, razaoVolume, deslocamentoEmATR };
}

export interface VolumeProfile {
  /** Level of the largest volume; null for an empty window. */
  readonly poc: number | null;
  /** Value area: the smallest contiguous range around the POC holding at least 70% of the volume. */
  readonly val: number | null;
  readonly vah: number | null;
  /** High volume nodes: strict local maxima at or above P80. */
  readonly hvn: number[];
  /** Low volume nodes: strict local minima with volume, at or below P20. */
  readonly lvn: number[];
  readonly total: number;
}

const VALUE_AREA_PERCENT = 70;
const HVN_PERCENT = 80;
const LVN_PERCENT = 20;

export function volumeProfile(rows: readonly LevelRow[], options: { readonly closeLevel?: number } = {}): VolumeProfile {
  const volume = new Map<number, number>();
  for (const row of rows) volume.set(row.level, (volume.get(row.level) ?? 0) + row.c + row.v);
  const total = [...volume.values()].reduce((sum, v) => sum + v, 0);
  if (volume.size === 0 || total === 0) return { poc: null, val: null, vah: null, hvn: [], lvn: [], total: 0 };

  const levels = [...volume.keys()];
  const lowest = Math.min(...levels);
  const highest = Math.max(...levels);
  const at = (level: number) => volume.get(level) ?? 0; // a gap is a level with no volume

  // POC: the largest volume; a tie goes to the level closest to the close, then to the lower level
  const distance = (level: number) => (options.closeLevel === undefined ? 0 : Math.abs(level - options.closeLevel));
  const poc = [...levels].sort((a, b) => at(b) - at(a) || distance(a) - distance(b) || a - b)[0]!;

  // value area: widen around the POC by the larger neighbour (a tie goes up) until 70% of the volume is inside
  let val = poc;
  let vah = poc;
  let inside = at(poc);
  while (inside * 100 < VALUE_AREA_PERCENT * total) {
    const up = vah < highest ? at(vah + 1) : -1;
    const down = val > lowest ? at(val - 1) : -1;
    if (up < 0 && down < 0) break;
    if (up >= down) {
      vah += 1;
      inside += up;
    } else {
      val -= 1;
      inside += down;
    }
  }

  // nodes: runs of equal volume count once, at their lowest level, and the window edges are never extremes
  const observed = [...volume.values()].filter((v) => v > 0);
  const high = percentile(observed, HVN_PERCENT)!;
  const low = percentile(observed, LVN_PERCENT)!;
  const runs: { level: number; v: number }[] = [];
  for (let level = lowest; level <= highest; level += 1) {
    const v = at(level);
    if (runs.length === 0 || runs[runs.length - 1]!.v !== v) runs.push({ level, v });
  }
  const hvn: number[] = [];
  const lvn: number[] = [];
  for (let i = 1; i < runs.length - 1; i += 1) {
    const { level, v } = runs[i]!;
    const before = runs[i - 1]!.v;
    const after = runs[i + 1]!.v;
    if (v > before && v > after && v >= high) hvn.push(level);
    if (v > 0 && v < before && v < after && v <= low) lvn.push(level);
  }
  return { poc, val, vah, hvn, lvn, total };
}
