/**
 * The steady hand of the thermometer: the reading of who is in charge comes from a one minute window of trades and changes every second, and a person cannot act on
 * something that jumps. Three things keep it calm, and none of them changes what is true:
 *   - the value is smoothed (an exponential average over the samples), so one large trade does not swing it;
 *   - a change of band (buyers in charge, balanced, sellers in charge) needs the average to go PAST the edge by a margin AND the old band to have lasted a minimum time,
 *     so a value hovering at an edge does not flip back and forth;
 *   - the number shown moves in steps (5 points), so it does not rewrite itself every second.
 * Pure: the clock is passed in.
 */

export type Band = "sell2" | "sell1" | "flat" | "buy1" | "buy2";

/** The edges between the bands, on the scale of -1 (all sellers) to 1 (all buyers). */
export const EDGES = { strong: 0.5, mild: 0.15 } as const;

const ORDER: readonly Band[] = ["sell2", "sell1", "flat", "buy1", "buy2"];
/** The lower edge of each band but the lowest, in order: entering band i from below means going past EDGE[i - 1]. */
const LOWER_EDGE: readonly number[] = [-EDGES.strong, -EDGES.mild, EDGES.mild, EDGES.strong];

export function bandOf(value: number): Band {
  if (value >= EDGES.strong) return "buy2";
  if (value >= EDGES.mild) return "buy1";
  if (value > -EDGES.mild) return "flat";
  if (value > -EDGES.strong) return "sell1";
  return "sell2";
}

export interface StableReading {
  readonly band: Band;
  /** -100 to 100, in steps of `step`, and always inside the range of `band`: the word and the number never disagree while the band catches up with the average. */
  readonly pct: number;
  /** When this band began, on the clock of the samples: how long it has held is `now - sinceMs`, and a band that holds is worth more than a value of the second. */
  readonly sinceMs: number;
}

/** The range of the number inside each band, in points. */
const RANGE: Readonly<Record<Band, readonly [number, number]>> = {
  sell2: [-100, -EDGES.strong * 100],
  sell1: [-EDGES.strong * 100, -EDGES.mild * 100],
  flat: [-EDGES.mild * 100, EDGES.mild * 100],
  buy1: [EDGES.mild * 100, EDGES.strong * 100],
  buy2: [EDGES.strong * 100, 100],
};

export interface StabilizerOptions {
  /** Weight of the newest sample in the average, 0 to 1. */
  readonly alpha?: number;
  /** How far past an edge the average must go before the band changes. */
  readonly margin?: number;
  /** The least time a band is kept before it can change. */
  readonly dwellMs?: number;
  /** The number shown moves in steps of this many points. */
  readonly step?: number;
}

export function createStabilizer(options: StabilizerOptions = {}) {
  const alpha = options.alpha ?? 0.15;
  const margin = options.margin ?? 0.07;
  const dwellMs = options.dwellMs ?? 15_000;
  const step = options.step ?? 5;
  let average: number | null = null;
  let band: Band | null = null;
  let since = 0;

  /** What the screen shows: the average in steps, held inside the band that is shown. */
  const shown = (b: Band, avg: number): StableReading => {
    const [low, high] = RANGE[b];
    return { band: b, pct: Math.max(low, Math.min(high, Math.round((avg * 100) / step) * step)), sinceMs: since };
  };

  return {
    /** A sample (or null: nothing measured, which forgets nothing but shows nothing). Returns what the screen shows now, or null before there is a reading. */
    push(value: number | null, nowMs: number): StableReading | null {
      if (value === null || !Number.isFinite(value) || !Number.isFinite(nowMs)) return band === null || average === null ? null : shown(band, average);
      const v = Math.max(-1, Math.min(1, value));
      average = average === null ? v : average + alpha * (v - average);
      if (band === null) {
        band = bandOf(average);
        since = nowMs;
      } else if (nowMs - since >= dwellMs) {
        // one band at a time, and only past the edge by the margin
        const at = ORDER.indexOf(band);
        if (at < ORDER.length - 1 && average >= LOWER_EDGE[at]! + margin) {
          band = ORDER[at + 1]!;
          since = nowMs;
        } else if (at > 0 && average < LOWER_EDGE[at - 1]! - margin) {
          band = ORDER[at - 1]!;
          since = nowMs;
        }
      }
      return shown(band, average);
    },
    reset(): void {
      average = null;
      band = null;
      since = 0;
    },
  };
}
