/**
 * The columns of the quiet rain behind the screen: strings of binary and hexadecimal digits that fall slowly, a technical texture and nothing else. Decorative on purpose: the digits mean nothing and say nothing about
 * the agent. Each column is made from its own index with a fixed seed, so the same index is always the same column and a wider window only adds columns. Durations are long and every column is faint: the rain moves,
 * it never blinks, and it must never get in the way of what is drawn over it.
 */

export interface RainColumn {
  /** Horizontal position in pixels from the left edge. */
  readonly x: number;
  /** The digits, top to bottom; the last one is the head of the column. */
  readonly glyphs: string;
  readonly sizePx: number;
  /** One fall, top to bottom, in seconds. */
  readonly durationS: number;
  /** Negative, so the columns are already spread over the screen when it opens. */
  readonly delayS: number;
  /** How visible the brightest part is, 0 to 1. Always faint. */
  readonly opacity: number;
}

export const RAIN_STEP_PX = 26;
export const RAIN_MAX_COLUMNS = 160;
export const RAIN_DURATION_S = { min: 14, max: 38 } as const;
export const RAIN_OPACITY_MAX = 0.22;

const ALPHABET = "0101010110ABCDEF0123456789";

/** A small seeded generator (mulberry32): the same seed, the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rainColumn(index: number): RainColumn {
  const r = seeded(0x51ed + index * 7919);
  const length = 14 + Math.floor(r() * 18);
  let glyphs = "";
  for (let i = 0; i < length; i++) glyphs += ALPHABET[Math.floor(r() * ALPHABET.length)];
  const durationS = RAIN_DURATION_S.min + r() * (RAIN_DURATION_S.max - RAIN_DURATION_S.min);
  return {
    x: index * RAIN_STEP_PX + Math.floor(r() * 8),
    glyphs,
    sizePx: 11 + Math.floor(r() * 5),
    durationS: Math.round(durationS * 10) / 10,
    delayS: -Math.round(r() * durationS * 10) / 10,
    opacity: Math.round((0.07 + r() * (RAIN_OPACITY_MAX - 0.07)) * 100) / 100,
  };
}

/** How many columns a window of that width gets. */
export const rainColumnCount = (widthPx: number): number => (Number.isFinite(widthPx) && widthPx > 0 ? Math.min(RAIN_MAX_COLUMNS, Math.ceil(widthPx / RAIN_STEP_PX) + 1) : 0);
