import type { DeskBar, DeskCandle } from "../types";
import { type Ctx2DLike, type DeskPalette, snap, snapLine, withAlpha } from "./canvas";
import { fmtClock, fmtDayMonth, fmtNumber } from "./format";

/** Preferred width of one candle slot in CSS px, and the hard limits when the series is short or very long. */
export const TARGET_SLOT = 7;
export const MIN_SLOT = 3;
export const MAX_SLOT = 16;
/** Empty slots kept at the right of the newest candle so the last price tag has air. */
export const RIGHT_SLOTS = 2;
export const TIME_AXIS_H = 18;
export const PAD_TOP = 8;
export const VOLUME_GAP = 4;
/** Advance width of one monospaced digit at the axis font size. */
const CHAR_W = 6.4;
const WICK_W = 1;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Pointer position over the chart: the candle index in `candles` and the pointer y in CSS px. */
export interface HoverPoint {
  readonly index: number;
  readonly y: number | null;
}

export interface CandleChartInput {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly candles: readonly DeskCandle[];
  readonly bar: DeskBar;
  readonly decimals: number;
  readonly last: number | null;
  readonly vwap: number | null;
  readonly hover: HoverPoint | null;
  readonly palette: DeskPalette;
  /** Font for axis labels, size included, for example '10.5px "Geist Mono", monospace'. */
  readonly font: string;
  readonly showVolume?: boolean;
}

export interface ChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly plot: Rect;
  readonly volume: Rect;
  readonly axis: Rect;
  readonly timeAxis: Rect;
  /** Width of one candle slot. */
  readonly slot: number;
  /** Width of a candle body. */
  readonly body: number;
  /** Index into the input candles of the first visible candle. */
  readonly firstIndex: number;
  readonly count: number;
  readonly lo: number;
  readonly hi: number;
  readonly volMax: number;
  /** True when the VWAP is close enough to the visible range to be drawn. */
  readonly vwapVisible: boolean;
  /** Price to y in CSS px. */
  yPrice(px: number): number;
  /** y in CSS px back to price. */
  priceAt(y: number): number;
  /** Center x of the k-th visible candle, k from 0 to count - 1. */
  xCenter(k: number): number;
  /** Candle index (into the input candles) nearest to x, or null when nothing is visible. */
  indexAt(x: number): number | null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Round tick values inside [lo, hi], about `target` of them. */
export function niceTicks(lo: number, hi: number, target: number): number[] {
  const range = hi - lo;
  if (!(range > 0) || target < 1) return [];
  const rough = range / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  const out: number[] = [];
  const first = Math.ceil(lo / step - 1e-9);
  for (let i = first; i * step <= hi + step * 1e-9; i += 1) out.push(Number((i * step).toPrecision(12)));
  return out;
}

/** Body width for a slot: about 70 percent of it, odd so it centers on the 1px wick. */
export function bodyWidth(slot: number): number {
  let w = Math.floor(slot * 0.7);
  if (w < 1) w = 1;
  if (w > 1 && w % 2 === 0) w -= 1;
  return w;
}

export function computeGeometry(input: CandleChartInput): ChartGeometry {
  const { width, height, candles, decimals } = input;
  const lastCandle = candles.length ? candles[candles.length - 1] : null;
  const ref = Number.isFinite(input.last ?? Number.NaN) ? (input.last as number) : lastCandle?.close ?? 1;
  const labelLen = fmtNumber(ref * 1.001, decimals).length;
  const axisW = Math.round(clamp(labelLen * CHAR_W + 14, 46, 108));
  const innerW = Math.max(1, width - axisW);

  const showVolume = input.showVolume !== false;
  const column = Math.max(0, height - PAD_TOP - TIME_AXIS_H);
  const volH = showVolume && column >= 90 ? clamp(Math.round(column * 0.16), 18, 72) : 0;
  const gap = volH > 0 ? VOLUME_GAP : 0;
  const plot: Rect = { x: 0, y: PAD_TOP, w: innerW, h: Math.max(1, column - volH - gap) };
  const volume: Rect = { x: 0, y: plot.y + plot.h + gap, w: innerW, h: volH };
  const timeAxis: Rect = { x: 0, y: height - TIME_AXIS_H, w: innerW, h: TIME_AXIS_H };
  const axis: Rect = { x: innerW, y: 0, w: axisW, h: height - TIME_AXIS_H };

  const capacity = Math.max(1, Math.floor(innerW / TARGET_SLOT) - RIGHT_SLOTS);
  const count = Math.min(candles.length, capacity);
  const firstIndex = candles.length - count;
  const slot = clamp(innerW / (count + RIGHT_SLOTS), MIN_SLOT, MAX_SLOT);

  let lo = Infinity;
  let hi = -Infinity;
  let volMax = 0;
  for (let i = firstIndex; i < candles.length; i += 1) {
    const c = candles[i];
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
    if (c.volBase > volMax) volMax = c.volBase;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const last = input.last;
  if (last !== null && Number.isFinite(last)) {
    lo = Math.min(lo, last);
    hi = Math.max(hi, last);
  }
  const range0 = hi - lo;
  let vwapVisible = false;
  const vwap = input.vwap;
  if (vwap !== null && Number.isFinite(vwap) && range0 >= 0) {
    const slack = Math.max(range0 * 0.25, Math.abs(vwap) * 1e-6);
    if (vwap >= lo - slack && vwap <= hi + slack) {
      vwapVisible = true;
      lo = Math.min(lo, vwap);
      hi = Math.max(hi, vwap);
    }
  }
  const tick = 10 ** -decimals;
  let pad = (hi - lo) * 0.06;
  if (!(hi - lo > 0)) pad = Math.max(Math.abs(hi) * 0.001, tick * 5);
  lo -= pad;
  hi += pad;

  const span = hi - lo;
  const yPrice = (px: number): number => plot.y + ((hi - px) / span) * plot.h;
  const priceAt = (y: number): number => hi - ((y - plot.y) / plot.h) * span;
  const xCenter = (k: number): number => innerW - (RIGHT_SLOTS + count - k - 0.5) * slot;
  const indexAt = (x: number): number | null => {
    if (count === 0) return null;
    const k = Math.round((x - innerW) / slot + RIGHT_SLOTS + count - 0.5);
    return firstIndex + clamp(k, 0, count - 1);
  };

  return {
    width, height, plot, volume, axis, timeAxis, slot, body: bodyWidth(slot), firstIndex, count,
    lo, hi, volMax, vwapVisible, yPrice, priceAt, xCenter, indexAt,
  };
}

function isUp(c: DeskCandle): boolean {
  return c.close >= c.open;
}

/** Wick center and body left edge of the k-th visible candle, snapped so both land on whole device pixels. */
export function candleX(geom: ChartGeometry, k: number, dpr: number): { wick: number; left: number } {
  const wick = snapLine(geom.xCenter(k), dpr, WICK_W);
  return { wick, left: snap(wick - geom.body / 2, dpr) };
}

function tagBox(ctx: Ctx2DLike, geom: ChartGeometry, y: number, text: string, fill: string, ink: string, font: string): void {
  const h = 16;
  const top = clamp(y - h / 2, geom.plot.y - 4, geom.timeAxis.y - h);
  ctx.fillStyle = fill;
  ctx.fillRect(geom.axis.x, top, geom.axis.w, h);
  ctx.fillStyle = ink;
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, geom.axis.x + 6, top + h / 2 + 0.5);
}

/**
 * Draws candles, volume, VWAP, the last price line and tag, the axes and the crosshair.
 * Returns the geometry so the caller can map pointer positions without recomputing it.
 */
export function drawCandleChart(ctx: Ctx2DLike, input: CandleChartInput): ChartGeometry {
  const geom = computeGeometry(input);
  const { palette: p, dpr, candles, decimals } = input;
  const boldFont = input.font.replace(/^(\d)/, "600 $1");

  ctx.save();
  ctx.clearRect(0, 0, geom.width, geom.height);
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  ctx.setLineDash([]);

  if (geom.count === 0) {
    ctx.restore();
    return geom;
  }

  // Horizontal grid and the price scale.
  const target = clamp(Math.floor(geom.plot.h / 44), 2, 8);
  const ticks = niceTicks(geom.lo, geom.hi, target);
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(p.edge, 0.7);
  ctx.beginPath();
  for (const t of ticks) {
    const y = snapLine(geom.yPrice(t), dpr);
    ctx.moveTo(0, y);
    ctx.lineTo(geom.plot.w, y);
  }
  ctx.stroke();
  ctx.font = input.font;
  ctx.fillStyle = p.ink3;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const t of ticks) ctx.fillText(fmtNumber(t, decimals), geom.axis.x + 6, geom.yPrice(t) + 0.5);

  // Time scale.
  const every = Math.max(1, Math.ceil(76 / geom.slot));
  ctx.fillStyle = p.ink3;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  const marks: number[] = [];
  for (let k = geom.count - 1; k >= 0; k -= every) marks.push(k);
  marks.reverse();
  let previousDay = "";
  for (const k of marks) {
    const c = candles[geom.firstIndex + k];
    const day = fmtDayMonth(c.tsMs);
    // Intraday bars show the clock, and the date at the first mark of a new day.
    const label = input.bar === "1D" || (previousDay !== "" && day !== previousDay) ? day : fmtClock(c.tsMs);
    previousDay = day;
    const w = ctx.measureText(label).width;
    const x = clamp(geom.xCenter(k), w / 2 + 2, geom.plot.w - w / 2 - 2);
    ctx.fillText(label, x, geom.timeAxis.y + 5);
  }

  // Volume under the candles.
  if (geom.volume.h > 0 && geom.volMax > 0) {
    for (let k = 0; k < geom.count; k += 1) {
      const c = candles[geom.firstIndex + k];
      const h = Math.max(1, (c.volBase / geom.volMax) * geom.volume.h);
      const x = candleX(geom, k, dpr).left;
      const color = isUp(c) ? p.buy : p.sell;
      if (c.confirmed) {
        ctx.fillStyle = withAlpha(color, 0.42);
        ctx.fillRect(x, geom.volume.y + geom.volume.h - h, geom.body, h);
      } else {
        ctx.fillStyle = withAlpha(color, 0.14);
        ctx.fillRect(x, geom.volume.y + geom.volume.h - h, geom.body, h);
        ctx.strokeStyle = withAlpha(color, 0.9);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, geom.volume.y + geom.volume.h - h + 0.5, Math.max(0, geom.body - 1), Math.max(0, h - 1));
      }
    }
  }

  // Candles.
  for (let k = 0; k < geom.count; k += 1) {
    const c = candles[geom.firstIndex + k];
    const color = isUp(c) ? p.buy : p.sell;
    const { wick, left: x } = candleX(geom, k, dpr);
    const yHigh = geom.yPrice(c.high);
    const yLow = geom.yPrice(c.low);
    const yOpen = geom.yPrice(c.open);
    const yClose = geom.yPrice(c.close);
    const top = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yClose - yOpen));

    ctx.strokeStyle = color;
    ctx.lineWidth = WICK_W;
    ctx.beginPath();
    ctx.moveTo(wick, snap(yHigh, dpr));
    ctx.lineTo(wick, snap(yLow, dpr));
    ctx.stroke();

    const y = snap(top, dpr);
    if (c.confirmed) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, geom.body, bodyH);
    } else {
      // The forming candle is hollow: an outline over a faint fill, so it never reads as final.
      ctx.fillStyle = withAlpha(color, 0.2);
      ctx.fillRect(x, y, geom.body, bodyH);
      ctx.strokeStyle = color;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, geom.body - 1), Math.max(0, bodyH - 1));
    }
  }

  // VWAP.
  const vwap = input.vwap;
  if (geom.vwapVisible && vwap !== null) {
    const y = snapLine(geom.yPrice(vwap), dpr);
    ctx.strokeStyle = withAlpha(p.signal, 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(geom.plot.w, y);
    ctx.stroke();
    ctx.font = input.font;
    ctx.fillStyle = withAlpha(p.signal, 0.9);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("VWAP", 4, y - 4);
  }

  // Last price line and tag.
  const lastCandle = candles[candles.length - 1];
  const lastPx = input.last ?? lastCandle.close;
  const lastColor = lastPx >= lastCandle.open ? p.buy : p.sell;
  const yLast = snapLine(geom.yPrice(lastPx), dpr);
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = withAlpha(lastColor, 0.85);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yLast);
  ctx.lineTo(geom.plot.w, yLast);
  ctx.stroke();
  ctx.restore();

  if (geom.vwapVisible && vwap !== null) {
    const yv = geom.yPrice(vwap);
    if (Math.abs(yv - yLast) >= 17) {
      tagBox(ctx, geom, yv, fmtNumber(vwap, decimals), withAlpha(p.signal, 0.2), p.signal, input.font);
    }
  }
  tagBox(ctx, geom, yLast, fmtNumber(lastPx, decimals), lastColor, p.well, boldFont);

  // Crosshair.
  const hover = input.hover;
  if (hover && hover.index >= geom.firstIndex && hover.index < candles.length) {
    const k = hover.index - geom.firstIndex;
    const c = candles[hover.index];
    const x = candleX(geom, k, dpr).wick;
    const hy = clamp(hover.y ?? geom.yPrice(c.close), geom.plot.y, geom.plot.y + geom.plot.h);
    const yy = snapLine(hy, dpr);
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = withAlpha(p.ink2, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, geom.plot.y);
    ctx.lineTo(x, geom.volume.h > 0 ? geom.volume.y + geom.volume.h : geom.plot.y + geom.plot.h);
    ctx.moveTo(0, yy);
    ctx.lineTo(geom.plot.w, yy);
    ctx.stroke();
    ctx.restore();

    tagBox(ctx, geom, hy, fmtNumber(geom.priceAt(hy), decimals), p.edgeStrong, p.ink, input.font);

    const label = input.bar === "1D" ? fmtDayMonth(c.tsMs) : `${fmtDayMonth(c.tsMs)} ${fmtClock(c.tsMs)}`;
    ctx.font = input.font;
    const w = ctx.measureText(label).width + 10;
    const lx = clamp(x - w / 2, 0, geom.plot.w - w);
    ctx.fillStyle = p.edgeStrong;
    ctx.fillRect(lx, geom.timeAxis.y + 1, w, TIME_AXIS_H - 3);
    ctx.fillStyle = p.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx + w / 2, geom.timeAxis.y + TIME_AXIS_H / 2);
  }

  ctx.restore();
  return geom;
}
