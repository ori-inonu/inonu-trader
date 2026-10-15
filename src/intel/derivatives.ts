/**
 * The derivatives regime (T5.10, SMT-1, family E7) from the exchange's own public data, in TypeScript: the funding rate and the
 * change of the open interest over an hour. Both go to the Evidence Brief as DATA (`regime: { funding, oiVar, btcBeta }`). The
 * mapping from a regime to a modifier of the zones (the 0.8 to 1.2 of the spec) is not specified and has not been measured
 * (T6.6), so no market constant is invented here and the modifier of the zones stays neutral. A value that is not known is null.
 * Pure: the clock and the reads belong to the caller.
 */
export const OI_WINDOW_MS = 3_600_000;
/** How far from an hour old a sample may be and still stand for it. */
export const OI_TOLERANCE_MS = 600_000;
export const OI_MAX_SAMPLES = 48;

export interface OiSample {
  readonly ts: number;
  readonly oiUsd: number;
}

/** The funding rate of one funding interval, in basis points; null when it is not a finite number. */
export function fundingBps(rate: number): number | null {
  return Number.isFinite(rate) ? Math.round(rate * 10_000 * 1e6) / 1e6 : null;
}

const positive = (v: number): boolean => Number.isFinite(v) && v > 0;

/** Percent change of the newest sample against the one nearest to an hour before it, within the tolerance; null when there is none. */
export function oiVariationPct(samples: readonly OiSample[]): number | null {
  const valid = samples.filter((s) => Number.isFinite(s.ts));
  if (valid.length < 2) return null;
  const newest = valid.reduce((a, b) => (b.ts > a.ts ? b : a));
  const target = newest.ts - OI_WINDOW_MS;
  let base: OiSample | null = null;
  for (const s of valid) {
    if (s === newest) continue;
    const off = Math.abs(s.ts - target);
    if (off <= OI_TOLERANCE_MS && (base === null || off < Math.abs(base.ts - target))) base = s;
  }
  if (base === null || !positive(base.oiUsd) || !positive(newest.oiUsd)) return null;
  return ((newest.oiUsd - base.oiUsd) / base.oiUsd) * 100;
}

export interface Regime {
  readonly funding: number | null;
  readonly oiVar: number | null;
  readonly btcBeta: number | null;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** The regime as the Brief carries it: funding in basis points, the open interest change in percent, the beta never invented. */
export function regimeOf(input: { readonly funding: number | null; readonly oiVar: number | null }): Regime {
  return {
    funding: input.funding === null ? null : fundingBps(input.funding),
    oiVar: input.oiVar === null ? null : round2(input.oiVar),
    btcBeta: null,
  };
}
