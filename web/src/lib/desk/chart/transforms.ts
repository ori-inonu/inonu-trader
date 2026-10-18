/**
 * Chart transforms: Heikin Ashi and close based Renko. Spec section 6.
 * Line by line port of python/jev_analytics/transforms.py.
 */

import { atr } from "./indicators";

const MAX_BRICKS = 100_000;

export interface HeikinAshiBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function heikinAshi(candles: readonly { open: number; high: number; low: number; close: number }[]): HeikinAshiBar[] {
  const out: HeikinAshiBar[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const k = candles[i]!;
    const haClose = (k.open + k.high + k.low + k.close) / 4;
    const prev = out[out.length - 1];
    const haOpen = prev === undefined ? (k.open + k.close) / 2 : (prev.open + prev.close) / 2;
    out.push({
      open: haOpen,
      high: Math.max(k.high, haOpen, haClose),
      low: Math.min(k.low, haOpen, haClose),
      close: haClose,
    });
  }
  return out;
}

/** Nearest value, on a log scale, of {1, 2, 2.5, 5, 10} * 10^k. Ties go to the smaller candidate. */
export function niceStep(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError("value must be positive and finite");
  }
  const k = Math.floor(Math.log10(value));
  const base = 10 ** k;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const candidate = factor * base;
    const distance = Math.abs(Math.log(value) - Math.log(candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return Number(best.toPrecision(12));
}

export interface RenkoBrick {
  open: number;
  close: number;
  dir: 1 | -1;
  tsMs: number;
  /** Index of the source candle that completed the brick. */
  sourceIndex: number;
}

/**
 * Close based Renko. Bricks sit on integer levels (level * size), so repeated bricks never drift.
 *
 * Without a brick: up when close >= (ref+1)*size, down when close <= (ref-1)*size, ref = floor(c0/size).
 * After an up brick (open level o, close level o+1): another up when close >= (o+2)*size, reversal down
 * when close <= (o-1)*size. Symmetric after a down brick. Each brick carries the timestamp and index of
 * the bar that completed it.
 */
export function renko(closes: readonly number[], ts: readonly number[], size: number): RenkoBrick[] {
  if (!(size > 0) || !Number.isFinite(size)) {
    throw new RangeError("brick size must be positive and finite");
  }
  if (closes.length !== ts.length) {
    throw new RangeError("closes and ts must have the same length");
  }
  const bricks: RenkoBrick[] = [];
  if (closes.length === 0) return bricks;
  const ref = Math.floor(closes[0]! / size);
  let direction = 0;
  let openLevel = ref;
  let closeLevel = ref;

  const add = (newOpen: number, newClose: number, index: number): void => {
    if (bricks.length >= MAX_BRICKS) {
      throw new RangeError("too many bricks: brick size is too small for this series");
    }
    direction = newClose > newOpen ? 1 : -1;
    openLevel = newOpen;
    closeLevel = newClose;
    bricks.push({
      open: newOpen * size,
      close: newClose * size,
      dir: direction as 1 | -1,
      tsMs: ts[index]!,
      sourceIndex: index,
    });
  };

  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i]!;
    for (;;) {
      if (direction === 0) {
        if (c >= (ref + 1) * size) add(ref, ref + 1, i);
        else if (c <= (ref - 1) * size) add(ref, ref - 1, i);
        else break;
      } else if (direction === 1) {
        if (c >= (closeLevel + 1) * size) add(closeLevel, closeLevel + 1, i);
        else if (c <= (openLevel - 1) * size) add(openLevel, openLevel - 1, i);
        else break;
      } else {
        if (c <= (closeLevel - 1) * size) add(closeLevel, closeLevel - 1, i);
        else if (c >= (openLevel + 1) * size) add(openLevel, openLevel + 1, i);
        else break;
      }
    }
  }
  return bricks;
}

/** Signed length of the trailing run of same direction bricks: +n up, -n down, 0 without bricks. */
export function renkoRun(bricks: readonly RenkoBrick[]): number {
  if (bricks.length === 0) return 0;
  const last = bricks[bricks.length - 1]!.dir;
  let n = 0;
  for (let i = bricks.length - 1; i >= 0; i -= 1) {
    if (bricks[i]!.dir !== last) break;
    n += 1;
  }
  return last * n;
}

export type RenkoSizeMode = "atr" | "pct";

/**
 * Renko brick size from the last CONFIRMED candle only: niceStep(ATR(14)) in "atr" mode,
 * niceStep(pct/100 * close) in "pct" mode. Returns null when it cannot be computed.
 */
export function renkoBrickSize(
  candles: readonly { high: number; low: number; close: number; confirmed: boolean }[],
  mode: RenkoSizeMode,
  pct: number,
): number | null {
  const confirmed = candles.filter((k) => k.confirmed);
  const last = confirmed[confirmed.length - 1];
  if (last === undefined) return null;
  try {
    if (mode === "pct") {
      return niceStep((pct / 100) * last.close);
    }
    const a = atr(
      confirmed.map((k) => k.high),
      confirmed.map((k) => k.low),
      confirmed.map((k) => k.close),
      14,
    );
    const lastAtr = a[a.length - 1];
    if (lastAtr === null || lastAtr === undefined || lastAtr <= 0) return null;
    return niceStep(lastAtr);
  } catch {
    return null;
  }
}
