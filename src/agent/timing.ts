/**
 * The quality of the moment to enter (AUT-4): the code's answer to "do not buy at the top and get stuck with the loss". From the last day or two of hourly bars it measures where the price is inside its
 * range, how overbought it is, how far it already ran and how fast it is falling, and marks the entries that would be chasing. A mark that says the price is extended, parabolic or in free fall is a FACT the model weighs, not a
 * closure: the model is asked whether the entry is late and whether the fall goes on, and its own answer lets the purchase through or skips it (conviction.ts). A pullback inside strength is a family in favour. Every threshold is a CHOICE of this code, conservative and not
 * calibrated; the Placar is what will say whether the guard earns its keep. Unknown history is NO facts, never "calm". Pure: no clock, no network.
 */
import type { Candle } from "../quant/types";

export const TIMING = {
  /** The bars looked at (hourly): two days. */
  windowBars: 48,
  /** Under this many bars the facts are not given. A token a few hours old has facts from the hours it has (what needs a longer window is null), and is offered with a mark that says it is young. */
  minBars: 6,
  /** From this many bars the history is a full day: a candidate with fewer carries the mark `historico_curto` and a wider assumed loss. */
  fullBars: 24,
  rsiPeriod: 14,
  atrBars: 14,
  /** Marks. */
  extended: { minRangePos: 0.85, rsi: 70, aboveMeanPct: 4, aboveMeanAtr: 3 },
  parabolic: { runUpPct: 40, ret24hPct: 30 },
  falling: { ret4hPct: -6 },
  volatile: { expansion: 2.5 },
  /** Families. */
  pullback: { minDrawPct: 3, maxDrawPct: 25, minRsi: 35, maxRsi: 62, minRet4hPct: -3, minRet24hPct: -10 },
  steady: { minRet24hPct: 2, maxRet24hPct: 15, minRangePos: 0.4, maxRangePos: 0.85, minRsi: 50, maxRsi: 68 },
} as const;

export interface TimingFacts {
  /** Bars used. */
  readonly bars: number;
  readonly lastClose: number;
  /** Where the last close sits between the lowest low (0) and the highest high (1) of the window. */
  readonly rangePos: number | null;
  /** The last close against the mean close of the window, percent. */
  readonly aboveMeanPct: number | null;
  readonly rsi: number | null;
  readonly ret4hPct: number | null;
  readonly ret24hPct: number | null;
  /** From the lowest low of the window to the last close, percent. */
  readonly runUpPct: number | null;
  /** How far under the highest high of the window the last close is, percent (never negative). */
  readonly drawFromHighPct: number | null;
  /** Mean true range over the last bars as a percent of the close: the size of a normal hour. */
  readonly atrPct: number | null;
  /** The mean range of the last three bars over the mean range of the window. */
  readonly volExpansion: number | null;
  /** Standard deviation of the hourly log returns of the window, percent: the size of a normal hour's move, for the target and stop plans. */
  readonly sigmaHourPct: number | null;
}

export type TimingMark = "esticado" | "parabolico" | "caindo" | "volatil";
export type TimingFamily = "retracao" | "alta_com_folego";

export const TIMING_MARK_LABEL: Readonly<Record<TimingMark, string>> = {
  esticado: "esticado: preco no topo da faixa e sobrecomprado",
  parabolico: "parabolico: subiu demais em pouco tempo",
  caindo: "caindo rapido: faca caindo",
  volatil: "volatilidade da ultima hora bem acima do normal",
};

/** Wilder's RSI. Null when there are not enough closes; a flat series is neutral. */
export function rsiOf(closes: readonly number[], period: number): number | null {
  if (closes.length < period + 1 || closes.some((c) => !Number.isFinite(c))) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  if (gain === 0) return 0;
  return 100 - 100 / (1 + gain / loss);
}

const sound = (c: Candle): boolean => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0) && c.high >= c.low && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close);

/** The newest bar may have started up to this long ago and still be the present: an open hourly bar, plus a provider that lags. Older, and the "last close" is a price from the past. */
export const MAX_STALE_MS = 3 * 3_600_000;
/** Two consecutive bars of the history may be at most this far apart: a hole of days is not an hourly series. */
export const MAX_GAP_MS = 3 * 3_600_000;

/** The facts of the entry from hourly bars, oldest first. Null when the history is short, out of order, has a bar that cannot be real, or (given `nowMs`) ends too long ago to describe the present. */
export function timingFacts(candles: readonly Candle[], nowMs?: number): TimingFacts | null {
  const window = candles.slice(-TIMING.windowBars);
  if (window.length < TIMING.minBars || !window.every(sound)) return null;
  if (window.some((c, i) => i > 0 && !(c.startMs > window[i - 1]!.startMs && c.startMs - window[i - 1]!.startMs <= MAX_GAP_MS))) return null;
  if (nowMs !== undefined && !(nowMs - window[window.length - 1]!.startMs <= MAX_STALE_MS)) return null;
  const closes = window.map((c) => c.close);
  const n = closes.length;
  const last = closes[n - 1]!;
  const high = Math.max(...window.map((c) => c.high));
  const low = Math.min(...window.map((c) => c.low));
  const mean = closes.reduce((s, v) => s + v, 0) / n;
  const trs = window.map((c, i) => {
    const prev = i === 0 ? c.close : window[i - 1]!.close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)) / c.close;
  });
  const atr = trs.slice(-TIMING.atrBars);
  const ranges = window.map((c) => (c.high - c.low) / c.close);
  const meanRange = ranges.reduce((s, v) => s + v, 0) / n;
  const recentRange = ranges.slice(-3).reduce((s, v) => s + v, 0) / 3;
  const logs = closes.slice(1).map((c, i) => Math.log(c / closes[i]!));
  const logMean = logs.reduce((s, v) => s + v, 0) / logs.length;
  const sigmaHour = Math.sqrt(logs.reduce((s, v) => s + (v - logMean) ** 2, 0) / (logs.length - 1));
  const back = (bars: number): number | null => (n > bars ? (last / closes[n - 1 - bars]! - 1) * 100 : null);
  return {
    bars: n,
    lastClose: last,
    rangePos: high > low ? (last - low) / (high - low) : 0.5,
    aboveMeanPct: (last / mean - 1) * 100,
    rsi: rsiOf(closes, TIMING.rsiPeriod),
    ret4hPct: back(4),
    ret24hPct: back(24),
    runUpPct: (last / low - 1) * 100,
    drawFromHighPct: Math.max(0, (1 - last / high) * 100),
    atrPct: (atr.reduce((s, v) => s + v, 0) / atr.length) * 100,
    volExpansion: meanRange > 0 ? recentRange / meanRange : null,
    sigmaHourPct: Number.isFinite(sigmaHour) && sigmaHour > 0 ? sigmaHour * 100 : null,
  };
}

const num = (v: number | null): v is number => v !== null && Number.isFinite(v);

/** The marks of an entry that would be chasing (or is unusually jumpy). Unknown facts make no mark: the caller decides what unknown means. */
export function timingMarks(f: TimingFacts | null): TimingMark[] {
  if (f === null) return [];
  const T = TIMING;
  const out: TimingMark[] = [];
  const stretched = num(f.aboveMeanPct) && f.aboveMeanPct >= Math.max(T.extended.aboveMeanPct, T.extended.aboveMeanAtr * (f.atrPct ?? 0));
  if (num(f.rangePos) && f.rangePos >= T.extended.minRangePos && ((num(f.rsi) && f.rsi >= T.extended.rsi) || stretched)) out.push("esticado");
  if ((num(f.runUpPct) && f.runUpPct >= T.parabolic.runUpPct) || (num(f.ret24hPct) && f.ret24hPct >= T.parabolic.ret24hPct)) out.push("parabolico");
  if (num(f.ret4hPct) && f.ret4hPct <= T.falling.ret4hPct) out.push("caindo");
  if (num(f.volExpansion) && f.volExpansion >= T.volatile.expansion) out.push("volatil");
  return out;
}

/** The price is extended, parabolic or falling fast: the entry is marked as risky and the model is asked about it (it is not closed by the code). Volatility alone is information. */
export const entryBlocked = (marks: readonly TimingMark[]): boolean => marks.some((m) => m === "esticado" || m === "parabolico" || m === "caindo");

/** Descriptive families in favour of the moment (never a recommendation). */
export function timingFamilies(f: TimingFacts | null): TimingFamily[] {
  if (f === null || entryBlocked(timingMarks(f))) return [];
  const T = TIMING;
  const out: TimingFamily[] = [];
  const p = T.pullback;
  if (num(f.drawFromHighPct) && f.drawFromHighPct >= p.minDrawPct && f.drawFromHighPct <= p.maxDrawPct && num(f.rsi) && f.rsi >= p.minRsi && f.rsi <= p.maxRsi && num(f.ret4hPct) && f.ret4hPct >= p.minRet4hPct && num(f.ret24hPct) && f.ret24hPct >= p.minRet24hPct) out.push("retracao");
  const s = T.steady;
  if (num(f.ret24hPct) && f.ret24hPct >= s.minRet24hPct && f.ret24hPct <= s.maxRet24hPct && num(f.rangePos) && f.rangePos >= s.minRangePos && f.rangePos < s.maxRangePos && num(f.rsi) && f.rsi >= s.minRsi && f.rsi <= s.maxRsi) out.push("alta_com_folego");
  return out;
}
