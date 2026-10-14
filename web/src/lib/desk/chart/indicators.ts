/**
 * Technical indicators on plain arrays, oldest first. `null` marks a value whose window is not complete.
 *
 * Line by line port of python/jev_analytics/indicators.py (spec section 6). The Python reference uses
 * math.fsum for its seeds; Neumaier summation keeps the same accuracy within the vector tolerance.
 */

export type Num = number | null;

function need(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError("period must be a positive integer");
  }
}

/** Neumaier compensated sum, matching math.fsum accuracy for these magnitudes. */
function fsum(xs: Iterable<number>): number {
  let sum = 0;
  let c = 0;
  for (const x of xs) {
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) c += (sum - t) + x;
    else c += (x - t) + sum;
    sum = t;
  }
  return sum + c;
}

export function sma(x: readonly number[], n: number): Num[] {
  need(n);
  const out: Num[] = new Array<Num>(x.length).fill(null);
  if (x.length < n) return out;
  let total = fsum(x.slice(0, n));
  out[n - 1] = total / n;
  for (let i = n; i < x.length; i += 1) {
    total += x[i]! - x[i - n]!;
    out[i] = total / n;
  }
  return out;
}

function firstValue(x: readonly Num[]): number {
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] !== null) return i;
  }
  return x.length;
}

/** EMA seeded with the SMA of the first n defined values. Leading nulls are skipped. */
export function ema(x: readonly Num[], n: number): Num[] {
  need(n);
  const out: Num[] = new Array<Num>(x.length).fill(null);
  const start = firstValue(x);
  if (x.length - start < n) return out;
  const alpha = 2 / (n + 1);
  let e = fsum(x.slice(start, start + n).map((v) => v as number)) / n;
  out[start + n - 1] = e;
  for (let i = start + n; i < x.length; i += 1) {
    e = alpha * (x[i] as number) + (1 - alpha) * e;
    out[i] = e;
  }
  return out;
}

/** Wilder RSI. First value at index n. A flat window (no gain and no loss) is 50. */
export function rsi(x: readonly number[], n = 14): Num[] {
  need(n);
  const out: Num[] = new Array<Num>(x.length).fill(null);
  if (x.length <= n) return out;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < x.length; i += 1) {
    gains.push(Math.max(x[i]! - x[i - 1]!, 0));
    losses.push(Math.max(x[i - 1]! - x[i]!, 0));
  }
  let avgGain = fsum(gains.slice(0, n)) / n;
  let avgLoss = fsum(losses.slice(0, n)) / n;
  const value = (g: number, l: number): number => {
    if (l === 0) return g === 0 ? 50 : 100;
    return 100 - 100 / (1 + g / l);
  };
  out[n] = value(avgGain, avgLoss);
  for (let i = n; i < gains.length; i += 1) {
    avgGain = (avgGain * (n - 1) + gains[i]!) / n;
    avgLoss = (avgLoss * (n - 1) + losses[i]!) / n;
    out[i + 1] = value(avgGain, avgLoss);
  }
  return out;
}

/** MACD with each EMA seeded at its own start. line from index slow-1, signal from slow-1+signal-1. */
export function macd(x: readonly number[], fast = 12, slow = 26, signal = 9): { macd: Num[]; signal: Num[]; hist: Num[] } {
  if (fast >= slow) throw new RangeError("fast must be shorter than slow");
  const fastEma = ema(x, fast);
  const slowEma = ema(x, slow);
  const line: Num[] = fastEma.map((f, i) => (f !== null && slowEma[i] !== null ? f - (slowEma[i] as number) : null));
  const sig = ema(line, signal);
  const hist: Num[] = line.map((m, i) => (m !== null && sig[i] !== null ? m - (sig[i] as number) : null));
  return { macd: line, signal: sig, hist };
}

/** TR from index 1 (needs the previous close), as TA-Lib does. */
export function trueRange(h: readonly number[], l: readonly number[], c: readonly number[]): Num[] {
  const out: Num[] = new Array<Num>(c.length).fill(null);
  for (let i = 1; i < c.length; i += 1) {
    out[i] = Math.max(h[i]! - l[i]!, Math.abs(h[i]! - c[i - 1]!), Math.abs(l[i]! - c[i - 1]!));
  }
  return out;
}

/** Wilder ATR. First value at index n: the mean of TR[1..n]. */
export function atr(h: readonly number[], l: readonly number[], c: readonly number[], n = 14): Num[] {
  need(n);
  const size = c.length;
  const out: Num[] = new Array<Num>(size).fill(null);
  if (size <= n) return out;
  const tr = trueRange(h, l, c);
  let value = fsum(tr.slice(1, n + 1).map((v) => v as number)) / n;
  out[n] = value;
  for (let i = n + 1; i < size; i += 1) {
    value = (value * (n - 1) + (tr[i] as number)) / n;
    out[i] = value;
  }
  return out;
}

export interface BollingerResult {
  mid: Num[];
  upper: Num[];
  lower: Num[];
  percentB: Num[];
  width: Num[];
}

/** Bollinger bands with the population standard deviation (divisor n). */
export function bollinger(x: readonly number[], n = 20, k = 2): BollingerResult {
  need(n);
  const size = x.length;
  const mid = sma(x, n);
  const upper: Num[] = new Array<Num>(size).fill(null);
  const lower: Num[] = new Array<Num>(size).fill(null);
  const percentB: Num[] = new Array<Num>(size).fill(null);
  const width: Num[] = new Array<Num>(size).fill(null);
  for (let i = n - 1; i < size; i += 1) {
    const m = mid[i] as number;
    const sd = Math.sqrt(fsum(x.slice(i - n + 1, i + 1).map((v) => (v - m) ** 2)) / n);
    const up = m + k * sd;
    const lo = m - k * sd;
    upper[i] = up;
    lower[i] = lo;
    percentB[i] = up !== lo ? (x[i]! - lo) / (up - lo) : null;
    width[i] = m !== 0 ? (up - lo) / m : null;
  }
  return { mid, upper, lower, percentB, width };
}

export interface SupertrendResult {
  line: Num[];
  dir: Num[];
}

/**
 * Supertrend. `dir` is +1 (up, line is the lower band) or -1 (down, line is the upper band).
 * Starts at +1; flips and band carry follow the Python reference exactly.
 */
export function supertrend(h: readonly number[], l: readonly number[], c: readonly number[], n = 10, mult = 3): SupertrendResult {
  const size = c.length;
  const line: Num[] = new Array<Num>(size).fill(null);
  const dir: Num[] = new Array<Num>(size).fill(null);
  const a = atr(h, l, c, n);
  if (size <= n) return { line, dir };
  let finalUp = 0;
  let finalLo = 0;
  let d = 1;
  for (let i = n; i < size; i += 1) {
    const hl2 = (h[i]! + l[i]!) / 2;
    const basicUp = hl2 + mult * (a[i] as number);
    const basicLo = hl2 - mult * (a[i] as number);
    if (i === n) {
      finalUp = basicUp;
      finalLo = basicLo;
    } else {
      const prevClose = c[i - 1]!;
      finalUp = basicUp < finalUp || prevClose > finalUp ? basicUp : finalUp;
      finalLo = basicLo > finalLo || prevClose < finalLo ? basicLo : finalLo;
      if (d === 1 && c[i]! < finalLo) d = -1;
      else if (d === -1 && c[i]! > finalUp) d = 1;
    }
    dir[i] = d;
    line[i] = d === 1 ? finalLo : finalUp;
  }
  return { line, dir };
}
