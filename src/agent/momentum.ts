/**
 * The last hour of a token in five-minute bars: what it is doing NOW, as facts. The hourly history (timing.ts) says whether an entry is stretched; this says whether the token is alive this minute, racing, falling,
 * or has not moved at all for an hour (a stagnant token is a capital that earns nothing). Nothing here predicts: returns, a range, the pick-up of volume and the age of the data, each unknown when the bars do not
 * support it. The marks are observations for the model to weigh, never an order and never a reason to act by themselves. Pure.
 */
import type { Candle } from "../quant/types";

const BAR_MS = 5 * 60_000;

/** CHOICES of this code, not calibrated: they only decide what is worth pointing out. */
export const MOMENTUM = {
  /** Bars needed: an hour (twelve) and one more to measure the last move against. */
  minBars: 13,
  windowBars: 24,
  /** The last bar may have started this long ago; older and the data does not speak about now. */
  maxBarAgeMs: 20 * 60_000,
  /** The whole hour moved less than this, high to low, in percent of the price: nothing is happening. */
  stagnantRangePct: 0.5,
  /** The last fifteen minutes moved at least this much (up or down), percent. */
  fastMovePct: 5,
} as const;

export type MomentumMark = "estagnado" | "disparando" | "caindo_agora";

export interface MomentumFacts {
  readonly bars: number;
  /** The last close against the one before it, the last fifteen minutes and the last hour, percent. */
  readonly ret5mPct: number;
  readonly ret15mPct: number;
  readonly ret1hPct: number;
  /** High to low over the last hour as a percent of the last close. */
  readonly rangeHourPct: number;
  /** The mean volume of the last three bars over the nine before them; null without volume. */
  readonly volRatio: number | null;
  /** Minutes since the last bar started. */
  readonly barAgeMin: number;
  readonly marks: readonly MomentumMark[];
}

export const MOMENTUM_MARK_LABEL: Readonly<Record<MomentumMark, string>> = {
  estagnado: "estagnado: nao se moveu na ultima hora",
  disparando: "disparando: subiu muito nos ultimos 15 minutos",
  caindo_agora: "caindo agora: caiu muito nos ultimos 15 minutos",
};

/** A bar is sound when its prices are real and agree with each other: the open and the close lie between the low and the high. */
const sound = (c: Candle): boolean =>
  [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0) &&
  c.high >= c.low &&
  Math.min(c.open, c.close) >= c.low &&
  Math.max(c.open, c.close) <= c.high &&
  Number.isFinite(c.startMs) &&
  (c.volume === null || (Number.isFinite(c.volume) && c.volume >= 0));
const pct = (a: number, b: number): number => (a / b - 1) * 100;
const mean = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

export function momentumFacts(candles: readonly Candle[], nowMs: number): MomentumFacts | null {
  // only closed bars speak: the bar still open is dropped, and one that is not closed anywhere else in the series makes the series untrustworthy
  const all = candles.slice(-MOMENTUM.windowBars - 1);
  const lastClosed = all.length > 0 && all[all.length - 1]!.confirmed === false ? all.length - 1 : all.length;
  const closed = all.slice(0, lastClosed);
  if (closed.some((c) => c.confirmed === false)) return null;
  const window = closed.slice(-MOMENTUM.windowBars);
  if (window.length < MOMENTUM.minBars || !window.every(sound)) return null;
  // the grid is exact: every bar starts five minutes after the one before it, so a return over "three bars" really is fifteen minutes
  if (window.some((c, i) => i > 0 && c.startMs - window[i - 1]!.startMs !== BAR_MS)) return null;
  const last = window[window.length - 1]!;
  const age = nowMs - last.startMs;
  if (!(age >= -BAR_MS) || age > MOMENTUM.maxBarAgeMs) return null;
  const n = window.length;
  const close = last.close;
  const hour = window.slice(-12);
  const high = Math.max(...hour.map((c) => c.high));
  const low = Math.min(...hour.map((c) => c.low));
  const ret5 = pct(close, window[n - 2]!.close);
  const ret15 = pct(close, window[n - 4]!.close);
  const ret1h = pct(close, window[n - 13]!.close);
  const rangeHour = ((high - low) / close) * 100;
  const volumes = window.slice(-12).map((c) => c.volume);
  let volRatio: number | null = null;
  if (volumes.every((v): v is number => v !== null)) {
    const before = mean(volumes.slice(0, 9));
    volRatio = before > 0 ? mean(volumes.slice(9)) / before : null;
  }
  const marks: MomentumMark[] = [];
  if (rangeHour < MOMENTUM.stagnantRangePct) marks.push("estagnado");
  if (ret15 >= MOMENTUM.fastMovePct) marks.push("disparando");
  if (ret15 <= -MOMENTUM.fastMovePct) marks.push("caindo_agora");
  return { bars: n, ret5mPct: ret5, ret15mPct: ret15, ret1hPct: ret1h, rangeHourPct: rangeHour, volRatio, barAgeMin: Math.max(0, age) / 60_000, marks };
}

/**
 * The same facts, `elapsedMs` later, without asking the provider again: only the age of the last bar grows (a cache hit is not a new reading), and past the data window they are unknown, not a stale picture that claims to
 * be current. A clock that went backwards adds nothing. Pure.
 */
export function agedMomentum(facts: MomentumFacts, elapsedMs: number): MomentumFacts | null {
  const age = facts.barAgeMin + Math.max(0, elapsedMs) / 60_000;
  return age * 60_000 > MOMENTUM.maxBarAgeMs ? null : { ...facts, barAgeMin: age };
}
