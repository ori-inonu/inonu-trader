/**
 * Density decisions of the panels that share a short column (watchlist and aggressor flow), taken
 * from the measured size of the panel body. Pure, so every breakpoint is tested without a browser.
 * The rule everywhere: shrink first, drop decoration next, and never drop the essential content.
 */

// Watchlist ----------------------------------------------------------------------------------

export const WATCH_HEADER_H = 22;
export const WATCH_MIN_ROW_H = 15;
export const WATCH_MAX_ROW_H = 46;

export interface WatchlistLayout {
  /** Column header shown. It is the first thing to go when rows get thin. */
  readonly header: boolean;
  /** Height of every row in px. All rows the panel was given are always rendered at this height. */
  readonly rowH: number;
  readonly level: "full" | "snug" | "tight";
  readonly spark: boolean;
  readonly vol: boolean;
  readonly fund: boolean;
  /** Sparkline and volume bar heights in px. */
  readonly sparkH: number;
  readonly volH: number;
  /** True only when even the thinnest row cannot fit every row. The list then scrolls inside the panel. */
  readonly scroll: boolean;
  /** grid-template-columns for the header and every row. */
  readonly template: string;
  /** Minimum width a row needs before a column would clip. The panel scrolls sideways past it. */
  readonly minW: number;
  readonly padX: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The last price is essential content: its grid track never shrinks below this width. */
export const WATCH_PX_MIN_W = 60;

const WATCH_GAP = 8;
const WATCH_VOL_W = 78;
const WATCH_FUND_W = 62;

/**
 * Rows keep priority over everything else. As the height shrinks the header goes, then the
 * sparkline and the volume bar, and rows only get thinner (down to 15px) before the list would scroll.
 * In width the rule is the same: the symbol, price and change always stay readable, decoration
 * (funding, then volume, then the sparkline) drops when it no longer fits, and only when even the
 * essential columns overflow does the panel scroll sideways. Under 300 px (the right wing of a
 * 1280 to 1440 px desk) the columns tighten first, so the trend line survives as a slimmer one.
 */
export function watchlistLayout(width: number, height: number, rowCount: number, starW = 0): WatchlistLayout {
  const n = Math.max(1, rowCount);
  const withHeader = (height - WATCH_HEADER_H) / n;
  const header = withHeader >= 26;
  const rawRowH = header ? withHeader : height / n;
  const level = rawRowH >= 30 ? "full" : rawRowH >= 22 ? "snug" : "tight";
  const tight = level === "tight";
  const rowH = clamp(Math.floor(rawRowH), WATCH_MIN_ROW_H, WATCH_MAX_ROW_H);

  const compact = width < 300;
  const sym = width >= 350 ? 62 : compact ? 56 : 58;
  const chg = width >= 350 ? 62 : compact ? 54 : 58;
  const padX = width >= 350 ? 12 : compact ? 6 : 8;
  const sparkW = width >= 350 ? 60 : compact ? 40 : 56;
  const core = starW + 2 * padX + sym + WATCH_PX_MIN_W + chg + 2 * WATCH_GAP;

  let spark = width >= 250 && !tight;
  if (spark && core + WATCH_GAP + sparkW > width) spark = false;
  let vol = width >= 350 && !tight;
  if (vol && core + (spark ? WATCH_GAP + sparkW : 0) + WATCH_GAP + WATCH_VOL_W > width) vol = false;
  let fund = width >= 430;
  if (fund && core + (spark ? WATCH_GAP + sparkW : 0) + (vol ? WATCH_GAP + WATCH_VOL_W : 0) + WATCH_GAP + WATCH_FUND_W > width) fund = false;

  const tracks = [`${sym}px`, `minmax(${WATCH_PX_MIN_W}px, 1fr)`, `${chg}px`];
  if (spark) tracks.push(`${sparkW}px`);
  if (vol) tracks.push(`${WATCH_VOL_W}px`);
  if (fund) tracks.push(`${WATCH_FUND_W}px`);

  const minW = core + (spark ? WATCH_GAP + sparkW : 0) + (vol ? WATCH_GAP + WATCH_VOL_W : 0) + (fund ? WATCH_GAP + WATCH_FUND_W : 0);

  return {
    header,
    rowH,
    level,
    spark,
    vol,
    fund,
    sparkH: clamp(rowH - 8, 10, 22),
    volH: clamp(rowH - 8, 10, 18),
    scroll: rawRowH < WATCH_MIN_ROW_H,
    template: tracks.join(" "),
    minW,
    padX,
  };
}

// Aggressor flow -----------------------------------------------------------------------------

export type FlowMode = "full" | "compact" | "bar";

export interface FlowLayout {
  /** full: gauge, 2x2 numbers, sparkline. compact: the same with the numbers in one row. bar: a thin bias bar instead of the arc. */
  readonly mode: FlowMode;
  readonly statCols: 2 | 4;
  readonly spark: boolean;
}

/** Height of the thin bias bar block, of one row of numbers and of two, and the least a sparkline needs. */
const BAR_BLOCK_H = 38;
const STATS_ONE_ROW_H = 34;
const STATS_TWO_ROWS_H = 72;
const SPARK_MIN_H = 32;
const FLOW_PAD_V = 16;
const FLOW_GAP = 4;

export function flowLayout(width: number, height: number): FlowLayout {
  const mode: FlowMode = height >= 250 ? "full" : height >= 170 ? "compact" : "bar";
  const statCols: 2 | 4 = mode === "full" ? 2 : width >= 250 ? 4 : 2;
  if (mode !== "bar") return { mode, statCols, spark: true };
  const stats = statCols === 4 ? STATS_ONE_ROW_H : STATS_TWO_ROWS_H;
  const needed = FLOW_PAD_V + BAR_BLOCK_H + FLOW_GAP + stats + FLOW_GAP + SPARK_MIN_H;
  return { mode, statCols, spark: height >= needed };
}
