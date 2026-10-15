/**
 * The factors of the opportunity engine: what a pair's own daily history says about whether it is cheap against itself, whether the fall seems to have stopped and whether more money is
 * trading it than usual. Pure: candles in, numbers and three yes or no readings out, no clock, no network.
 *
 * It DESCRIBES. A factor is a measurement with a limit named in `OPPORTUNITY_RULES`, and "holds" only says the measurement is past the limit. The engine never says buy: the model
 * ("Pedir ao Inonu") chooses among the candidates this code puts forward, and a reading here is a reason to look, not a forecast. The limits were fixed BEFORE they were measured on
 * history (see `scripts/opportunity-backtest.ts` and its evidence), and the screen tells what that measurement found.
 */

/** One closed day (or the day in progress, as the last one): quote volume in dollars. Oldest first in every list. */
export interface DayCandle {
  readonly ts: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volQuote: number;
}

/** The limits. Fixed before the history was looked at; the backtest reports how they did and does not move them silently. */
export const OPPORTUNITY_RULES = {
  /** "Cheap against itself": in the lower part of the 30 day range... */
  posMax: 0.35,
  /** ...and at least this far under the 90 day high (a fraction). */
  drawdownMin: 0.25,
  /** "The fall seems to stop": the lows of the last N days did not go under the lows of the M days before... */
  recentDays: 3,
  priorDays: 10,
  /** ...and the close is above the mean of the last five closes. */
  smaDays: 5,
  /** "More money than usual": the volume of the day is at least this many times the mean of the seven days before. */
  volRatioMin: 1.3,
  volMeanDays: 7,
  rangeDays: 30,
  highDays: 90,
  rsiDays: 14,
  atrDays: 14,
} as const;

/**
 * How far out of the ordinary a pair is today, for ITS OWN normal: the move of the 24 hours in units of its usual daily range (capped at four), plus how many times its volume is above
 * the mean of the seven days before (above one, capped at four). It is direction blind on purpose: it says that something is happening, not which way. It is the order of the board
 * because no reading of the price history was measured to predict a return (see the backtest), so the honest use of the board is to point at where to look, and to leave the choice to the
 * Inonu, who sees what the flow engine sees. Zero when nothing is out of the ordinary or when a number is missing.
 */
export function attention(change24h: number | null, atrPct: number | null, volRatio: number | null): number {
  const move = change24h !== null && atrPct !== null && atrPct > 0 && Number.isFinite(change24h) ? Math.min(Math.abs(change24h) / atrPct, 4) / 4 : 0;
  const volume = volRatio !== null && Number.isFinite(volRatio) ? Math.min(Math.max(volRatio - 1, 0), 3) / 3 : 0;
  return move + volume;
}

/** The 24 hour move in units of the usual daily range, signed; null when either is missing. */
export function moveInAtr(change24h: number | null, atrPct: number | null): number | null {
  return change24h !== null && atrPct !== null && atrPct > 0 && Number.isFinite(change24h) ? change24h / atrPct : null;
}

/** Candles a read needs: the 90 day high, and one more day for the first change. */
export const MIN_CANDLES = OPPORTUNITY_RULES.highDays + 1;

export interface FactorRead {
  readonly price: number;
  /** Where the price sits in the 30 day range, 0 (at the low) to 1 (at the high). */
  readonly pos30: number;
  /** How far under the 90 day high, as a fraction (0.31 is 31% under). */
  readonly drawdown90: number;
  readonly rsi14: number | null;
  /** How far the 30 day high is above the price, as a fraction. */
  readonly roomToHigh30: number;
  /** How far the price is above the 30 day low, as a fraction. */
  readonly gapToLow30: number;
  /** Room up divided by gap down; null when the price is at the low (nothing to divide by). */
  readonly roomRatio: number | null;
  /** Volume of the day over the mean of the seven days before; null when that mean is zero. */
  readonly volRatio: number | null;
  readonly noNewLow: boolean;
  readonly aboveSma5: boolean;
  /** Mean true range of 14 days over the price. */
  readonly atrPct: number | null;
  /** Mean daily quote volume of the last 30 days, the liquidity the history shows. */
  readonly meanVol30: number;
  readonly held: { readonly desconto: boolean; readonly virada: boolean; readonly participacao: boolean };
  /** How many of the three hold. */
  readonly count: number;
}

const finite = (v: number): boolean => Number.isFinite(v);
const mean = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

/** The relative strength index of Wilder over the last `period` changes; null with too few closes. */
export function rsiWilder(closes: readonly number[], period = OPPORTUNITY_RULES.rsiDays): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

function atrPercent(candles: readonly DayCandle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const ranges: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i]!;
    const prev = candles[i - 1]!.close;
    ranges.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
  }
  let atr = mean(ranges.slice(0, period));
  for (let i = period; i < ranges.length; i += 1) atr = (atr * (period - 1) + ranges[i]!) / period;
  const last = candles[candles.length - 1]!.close;
  return last > 0 ? atr / last : null;
}

/**
 * The factors at the last candle of `candles`. `null` when the series is too short or has a broken number (a price that is not positive, a high under a low): a read that cannot be
 * trusted is no read, never a guess. The last candle may be the day in progress: its close is then the last price and its volume the day so far (or the 24 hours, which the caller passes in).
 */
export function readFactors(candles: readonly DayCandle[]): FactorRead | null {
  const R = OPPORTUNITY_RULES;
  if (candles.length < MIN_CANDLES) return null;
  for (const c of candles) {
    if (![c.open, c.high, c.low, c.close, c.volQuote].every(finite) || c.close <= 0 || c.low <= 0 || c.high < c.low || c.volQuote < 0) return null;
  }
  const last = candles[candles.length - 1]!;
  const price = last.close;
  const window = (n: number) => candles.slice(-n);

  const w30 = window(R.rangeDays);
  const high30 = Math.max(...w30.map((c) => c.high));
  const low30 = Math.min(...w30.map((c) => c.low));
  const pos30 = high30 > low30 ? (price - low30) / (high30 - low30) : 0.5;
  const high90 = Math.max(...window(R.highDays).map((c) => c.high));
  const drawdown90 = 1 - price / high90;

  const roomToHigh30 = high30 / price - 1;
  const gapToLow30 = price / low30 - 1;
  const roomRatio = gapToLow30 > 1e-9 ? roomToHigh30 / gapToLow30 : null;

  const before = candles.slice(-1 - R.volMeanDays, -1);
  const meanBefore = mean(before.map((c) => c.volQuote));
  const volRatio = meanBefore > 0 ? last.volQuote / meanBefore : null;

  const recentLow = Math.min(...window(R.recentDays).map((c) => c.low));
  const priorLow = Math.min(...candles.slice(-R.recentDays - R.priorDays, -R.recentDays).map((c) => c.low));
  const noNewLow = recentLow >= priorLow;
  const sma5 = mean(window(R.smaDays).map((c) => c.close));
  const aboveSma5 = price > sma5;

  const held = {
    desconto: pos30 <= R.posMax && drawdown90 >= R.drawdownMin,
    virada: noNewLow && aboveSma5,
    participacao: volRatio !== null && volRatio >= R.volRatioMin,
  };
  return {
    price,
    pos30,
    drawdown90,
    rsi14: rsiWilder(candles.map((c) => c.close)),
    roomToHigh30,
    gapToLow30,
    roomRatio,
    volRatio,
    noNewLow,
    aboveSma5,
    atrPct: atrPercent(window(R.atrDays + 1), R.atrDays),
    meanVol30: mean(w30.map((c) => c.volQuote)),
    held,
    count: Number(held.desconto) + Number(held.virada) + Number(held.participacao),
  };
}
