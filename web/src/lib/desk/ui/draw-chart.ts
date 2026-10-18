/**
 * Generic renderer of the desk chart: candles, OHLC bars, line and area over one shared
 * geometry (price axis, time axis, volume pane, crosshair), plus the Jev decision layer -
 * a marker per real decision, a thin decision lane under the price pane and a label chip
 * on the newest marker.
 *
 * The x position of a bar is its INDEX in the series, never its timestamp, so the same
 * geometry carries time candles today and Renko bricks in phase F2. Markers anchor through
 * `barIndex`: for time candles it is the index of the candle open at the read instant; for
 * Renko a single pure function will remap it to the brick current at that instant.
 */

import type { DecisionMarker } from "../chart/decisions";
import { drawInonuBehind, drawInonuFront, type InonuLayerInput } from "../chart/inonu-layer";
import type { SmcResult } from "../chart/smc";
import {
  bollinger,
  ema,
  macd,
  rsi,
  supertrend,
  type BollingerResult,
  type Num,
  type SupertrendResult,
} from "../chart/indicators";
import type { IndicatorId } from "../chart/prefs";
import type { ChartKind } from "../chart/types";
import type { DeskBar } from "../types";
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
/** Height of the decision lane under the price pane, when decisions exist. */
export const DECISION_LANE_H = 18;
/** Indicator pane height limits and the share of the column the price pane always keeps (G4). */
export const PANE_MIN_H = 64;
export const PANE_MAX_H = 96;
export const MIN_PRICE_SHARE = 0.55;
/** Advance width of one monospaced digit at the axis font size. */
const CHAR_W = 6.4;
const WICK_W = 1;

/** Marker glyph size follows the slot but stays readable on dense and sparse series. */
const GLYPH_MIN = 7;
const GLYPH_MAX = 11;
const LANE_GLYPH_MIN = 4;
const LANE_GLYPH_MAX = 7;

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

/** A screen position of one decision glyph, in CSS px inside the canvas box. */
export interface MarkerPoint {
  /** Index into `input.markers`. */
  readonly markerIndex: number;
  readonly x: number;
  /** Center y of the glyph (offset from the decision price so it does not cover the bar). */
  readonly y: number;
  /** y of the decision price itself. */
  readonly priceY: number;
}

/** The smallest slice of a candle the renderer needs. DeskCandle and ChartBar both satisfy it. */
export interface CandleLike {
  readonly tsMs: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volBase: number;
  readonly confirmed: boolean;
}

/** The h/l/c rows an indicator is computed on, index aligned with the drawn bars (G4). */
export interface IndicatorSource {
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/** Result of every indicator the renderer can compute, all null for the ids that are off. */
export interface ComputedIndicators {
  readonly ema9: Num[] | null;
  readonly ema21: Num[] | null;
  readonly ema50: Num[] | null;
  readonly ema200: Num[] | null;
  readonly bb: BollingerResult | null;
  readonly supertrend: SupertrendResult | null;
  readonly rsi: Num[] | null;
  readonly macd: { readonly macd: Num[]; readonly signal: Num[]; readonly hist: Num[] } | null;
}

/** Indicator ids the chart falls back to when the caller passes none: the smart money default set. */
export const DEFAULT_INDICATORS: readonly IndicatorId[] = ["smStructure", "smBlocks", "smGaps", "smLiquidity", "smZones", "smWallets", "volume", "levels"];

/** Computes exactly the indicator ids that are on, on the given h/l/c source. */
export function computeIndicators(source: readonly IndicatorSource[], ids: ReadonlySet<IndicatorId>): ComputedIndicators {
  const closes = source.map((b) => b.close);
  return {
    ema9: ids.has("ema9") ? ema(closes, 9) : null,
    ema21: ids.has("ema21") ? ema(closes, 21) : null,
    ema50: ids.has("ema50") ? ema(closes, 50) : null,
    ema200: ids.has("ema200") ? ema(closes, 200) : null,
    bb: ids.has("bb") ? bollinger(closes, 20, 2) : null,
    supertrend: ids.has("supertrend") ? supertrend(source.map((b) => b.high), source.map((b) => b.low), closes, 10, 3) : null,
    rsi: ids.has("rsi") ? rsi(closes, 14) : null,
    macd: ids.has("macd") ? macd(closes, 12, 26, 9) : null,
  };
}

export type PaneId = "volume" | "rsi" | "macd";

export interface ChartPane {
  readonly id: PaneId;
  readonly rect: Rect;
}

/** A Jev computed level: horizontal line across the price pane. Descriptive structure, never a decision. */
export interface ChartLevel {
  readonly px: number;
  readonly kind: "support" | "resistance";
  readonly touches: number;
}

export interface CandleChartInput {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly candles: readonly CandleLike[];
  readonly bar: DeskBar;
  readonly decimals: number;
  readonly last: number | null;
  readonly vwap: number | null;
  readonly hover: HoverPoint | null;
  readonly palette: DeskPalette;
  /** Font for axis labels, size included, for example '10.5px "Geist Mono", monospace'. */
  readonly font: string;
  readonly showVolume?: boolean;
  /** Series type, defaults to candles. */
  readonly kind?: ChartKind;
  /** Jev decision markers, oldest first. Defaults to none. */
  readonly markers?: readonly DecisionMarker[];
  /** Active indicators; defaults to VWAP + volume, the F1 look. Renko drops vwap and volume itself. */
  readonly indicators?: readonly IndicatorId[];
  /** The h/l/c series indicators run on, index aligned with `candles`; defaults to it. For Heikin
   * Ashi this must be the real candles, for Renko the bricks. */
  readonly indicatorSource?: readonly IndicatorSource[];
  /** Jev computed structure levels, drawn on every kind when the "levels" indicator is on. */
  readonly levels?: readonly ChartLevel[];
  /** Smart money reading of the confirmed series plus which groups are on. Renko ignores it. */
  readonly smc?: {
    readonly result: SmcResult;
    readonly show: {
      readonly structure: boolean;
      readonly blocks: boolean;
      readonly gaps: boolean;
      readonly liquidity: boolean;
      readonly zones: boolean;
    };
  };
  /**
   * Tracked-wallet purchase marks of an on-chain token, grouped by the index of the candle each
   * happened in (computed by walletMarksByIndex). Provider-observed buys, never Jev decisions.
   */
  readonly wallets?: ReadonlyMap<number, readonly WalletMarkLike[]>;
  /** What the flow engine measured and the model's answer, drawn by chart/inonu-layer. Renko ignores it. */
  readonly inonu?: InonuLayerInput;
}

/** Structural twin of onchain WalletMark so the renderer never imports the fetch layer. */
export interface WalletMarkLike {
  readonly tsMs: number;
  readonly walletType: "smart_money" | "kol" | "whale";
  readonly count: number;
  readonly amountUsd: number;
  readonly soldPct: number | null;
}

export interface ChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly plot: Rect;
  readonly volume: Rect;
  readonly axis: Rect;
  readonly timeAxis: Rect;
  /** The decision lane under the price pane; h is 0 when there are no decisions. */
  readonly lane: Rect;
  /** Indicator panes under the lane, top to bottom (volume, rsi, macd order). */
  readonly panes: readonly ChartPane[];
  /** Indicator series computed for this geometry, null entries for the ids that are off. */
  readonly indicators: ComputedIndicators;
  /** Indicator ids actually drawn after the Renko restrictions are applied. */
  readonly activeIndicators: readonly IndicatorId[];
  /** Screen position of every visible decision glyph. */
  readonly markerPoints: readonly MarkerPoint[];
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

/** A line or area chart ranges over closes; OHLC types range over the wicks. */
const CLOSE_RANGED: ReadonlySet<ChartKind> = new Set(["line", "area"]);

export function computeGeometry(input: CandleChartInput): ChartGeometry {
  const { width, height, candles, decimals } = input;
  const kind = input.kind ?? "candles";
  const markers = input.markers ?? [];
  const lastCandle = candles.length ? candles[candles.length - 1] : null;
  const ref = Number.isFinite(input.last ?? Number.NaN) ? (input.last as number) : lastCandle?.close ?? 1;
  const labelLen = fmtNumber(ref * 1.001, decimals).length;
  const axisW = Math.round(clamp(labelLen * CHAR_W + 14, 46, 108));
  const innerW = Math.max(1, width - axisW);

  // Renko has no base volume and no VWAP; those ids are dropped before anything is computed.
  let ids = (input.indicators ?? DEFAULT_INDICATORS) as readonly IndicatorId[];
  if (kind === "renko") ids = ids.filter((id) => id !== "vwap" && id !== "volume");
  const activeIndicators = ids;
  const want = new Set(ids);
  const source = input.indicatorSource ?? candles;
  const indicators = computeIndicators(source, want);

  const showVolume = input.showVolume !== false;
  const column = Math.max(0, height - PAD_TOP - TIME_AXIS_H);
  // The decision lane lives directly under the price pane; a very short canvas drops it first.
  const laneH = markers.length > 0 && column >= 200 ? DECISION_LANE_H : 0;
  const body = column - laneH;

  // Indicator panes stack under the lane in a fixed order. Each one is 64 to 96 px and the price
  // pane keeps at least MIN_PRICE_SHARE of the column: whatever would squeeze it below that is
  // dropped, and since panes stack top down the bottom ones (macd, then rsi, then volume) go first.
  const paneH = clamp(Math.round(body * 0.16), PANE_MIN_H, PANE_MAX_H);
  const minPlot = Math.ceil(body * MIN_PRICE_SHARE);
  const wantedPanes: PaneId[] = [];
  if (want.has("volume") && showVolume) wantedPanes.push("volume");
  if (want.has("rsi")) wantedPanes.push("rsi");
  if (want.has("macd")) wantedPanes.push("macd");
  const fitPanes: PaneId[] = [];
  let used = 0;
  for (const id of wantedPanes) {
    if (body - used - paneH - VOLUME_GAP < minPlot) break;
    used += paneH + VOLUME_GAP;
    fitPanes.push(id);
  }

  const plot: Rect = { x: 0, y: PAD_TOP, w: innerW, h: Math.max(1, body - used) };
  const lane: Rect = { x: 0, y: plot.y + plot.h, w: innerW, h: laneH };
  const panes: ChartPane[] = [];
  let paneY = lane.y + lane.h + (fitPanes.length > 0 ? VOLUME_GAP : 0);
  for (const id of fitPanes) {
    panes.push({ id, rect: { x: 0, y: paneY, w: innerW, h: paneH } });
    paneY += paneH + VOLUME_GAP;
  }
  const volume = panes.find((pane) => pane.id === "volume")?.rect ?? { x: 0, y: 0, w: innerW, h: 0 };
  const timeAxis: Rect = { x: 0, y: height - TIME_AXIS_H, w: innerW, h: TIME_AXIS_H };
  const axis: Rect = { x: innerW, y: 0, w: axisW, h: height - TIME_AXIS_H };

  const capacity = Math.max(1, Math.floor(innerW / TARGET_SLOT) - RIGHT_SLOTS);
  const count = Math.min(candles.length, capacity);
  const firstIndex = candles.length - count;
  const slot = clamp(innerW / (count + RIGHT_SLOTS), MIN_SLOT, MAX_SLOT);
  const glyph = clamp(slot * 0.9, GLYPH_MIN, GLYPH_MAX);

  const rangedByClose = CLOSE_RANGED.has(kind);
  let lo = Infinity;
  let hi = -Infinity;
  let volMax = 0;
  for (let i = firstIndex; i < candles.length; i += 1) {
    const c = candles[i];
    const loV = rangedByClose ? c.close : c.low;
    const hiV = rangedByClose ? c.close : c.high;
    if (loV < lo) lo = loV;
    if (hiV > hi) hi = hiV;
    if (c.volBase > volMax) volMax = c.volBase;
  }
  const markerPoints: MarkerPoint[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const m = markers[i];
    const k = m.barIndex - firstIndex;
    if (k < 0 || k >= count) continue;
    if (m.price < lo) lo = m.price;
    if (m.price > hi) hi = m.price;
    markerPoints.push({ markerIndex: i, x: 0, y: 0, priceY: 0 });
  }
  // Overlay indicator values inside the visible window widen the range so their lines never clip.
  const overlaySeries: readonly (readonly Num[] | null)[] = [
    indicators.ema9, indicators.ema21, indicators.ema50, indicators.ema200,
    indicators.bb?.upper ?? null, indicators.bb?.lower ?? null, indicators.supertrend?.line ?? null,
  ];
  for (const series of overlaySeries) {
    if (series === null) continue;
    for (let i = firstIndex; i < candles.length && i < series.length; i += 1) {
      const v = series[i];
      if (v === null || v === undefined) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
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
  const vwap = want.has("vwap") ? input.vwap : null;
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

  // Fill in the marker positions now that the price mapping exists. The glyph sits a few px off
  // the decision price, below it for a buy and above it for a sell, so it never covers the bar.
  let point = 0;
  for (let i = 0; i < markers.length; i += 1) {
    const m = markers[i];
    const k = m.barIndex - firstIndex;
    if (k < 0 || k >= count) continue;
    const x = xCenter(k);
    const priceY = clamp(yPrice(m.price), plot.y + 4, plot.y + plot.h - 4);
    const y = m.action === "buy" ? priceY + glyph * 0.7 + 3 : m.action === "sell" ? priceY - glyph * 0.7 - 3 : priceY;
    markerPoints[point] = { markerIndex: i, x, y, priceY };
    point += 1;
  }

  return {
    width, height, plot, volume, axis, timeAxis, lane, panes, indicators, activeIndicators, markerPoints, slot, body: bodyWidth(slot), firstIndex, count,
    lo, hi, volMax, vwapVisible, yPrice, priceAt, xCenter, indexAt,
  };
}

function isUp(c: CandleLike): boolean {
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

const ACTION_COLOR: Record<DecisionMarker["action"], keyof DeskPalette> = { buy: "buy", sell: "sell", hold: "hold" };
const ACTION_WORD: Record<DecisionMarker["action"], string> = { buy: "COMPRAR", sell: "VENDER", hold: "MANTER" };

/** One decision glyph centered at (cx, cy): triangle up for buy, down for sell, diamond for hold. */
export function drawDecisionGlyph(ctx: Ctx2DLike, cx: number, cy: number, size: number, action: DecisionMarker["action"], p: DeskPalette): void {
  const half = size / 2;
  ctx.fillStyle = p[ACTION_COLOR[action]];
  ctx.beginPath();
  if (action === "hold") {
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half * 0.7, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half * 0.7, cy);
  } else if (action === "buy") {
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy + half);
    ctx.lineTo(cx - half, cy + half);
  } else {
    ctx.moveTo(cx, cy + half);
    ctx.lineTo(cx + half, cy - half);
    ctx.lineTo(cx - half, cy - half);
  }
  ctx.closePath();
  ctx.fill();
}

const WALLET_COLOR: Record<WalletMarkLike["walletType"], keyof DeskPalette> = { smart_money: "signal", kol: "hold", whale: "ink" };

/**
 * One small diamond per tracked-wallet purchase, 6 px under the low of the candle it happened in.
 * Out-of-window marks are already dropped by the index map; whatever is left is clipped to the
 * price pane. These are OKX-indexed buys, never decisions, so they get a neutral shape and no lane.
 */
export function drawWalletMarks(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], wallets: ReadonlyMap<number, readonly WalletMarkLike[]>, p: DeskPalette, dpr: number): void {
  const half = 3.5;
  for (const [index, marks] of wallets) {
    const k = index - geom.firstIndex;
    if (k < 0 || k >= geom.count) continue;
    const c = candles[index];
    if (!c) continue;
    const x = geom.xCenter(k);
    const y = Math.min(geom.yPrice(c.low) + 6, geom.plot.y + geom.plot.h - half - 1);
    let row = 0;
    for (const mark of marks) {
      const cy = y + row * (half * 2 + 1.5);
      ctx.fillStyle = p[WALLET_COLOR[mark.walletType]];
      ctx.beginPath();
      ctx.moveTo(x, snap(cy - half, dpr));
      ctx.lineTo(x + half, snap(cy, dpr));
      ctx.lineTo(x, snap(cy + half, dpr));
      ctx.lineTo(x - half, snap(cy, dpr));
      ctx.closePath();
      ctx.fill();
      row += 1;
    }
  }
}

function drawCandlesSeries(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], p: DeskPalette, dpr: number): void {
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
}

function drawOhlcSeries(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], p: DeskPalette, dpr: number): void {
  const arm = Math.max(2, Math.floor(geom.body / 2));
  for (let k = 0; k < geom.count; k += 1) {
    const c = candles[geom.firstIndex + k];
    const color = c.confirmed ? (isUp(c) ? p.buy : p.sell) : withAlpha(isUp(c) ? p.buy : p.sell, 0.45);
    const { wick } = candleX(geom, k, dpr);
    ctx.strokeStyle = color;
    ctx.lineWidth = WICK_W;
    ctx.beginPath();
    ctx.moveTo(wick, snap(geom.yPrice(c.high), dpr));
    ctx.lineTo(wick, snap(geom.yPrice(c.low), dpr));
    const yOpen = snapLine(geom.yPrice(c.open), dpr, WICK_W);
    const yClose = snapLine(geom.yPrice(c.close), dpr, WICK_W);
    ctx.moveTo(wick - arm, yOpen);
    ctx.lineTo(wick, yOpen);
    ctx.moveTo(wick, yClose);
    ctx.lineTo(wick + arm, yClose);
    ctx.stroke();
  }
}

/** Polyline of closes in order; for `line` and `area` series. */
function closePath(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[]): void {
  ctx.beginPath();
  for (let k = 0; k < geom.count; k += 1) {
    const c = candles[geom.firstIndex + k];
    const x = geom.xCenter(k);
    const y = geom.yPrice(c.close);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function drawLineSeries(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], p: DeskPalette, dpr: number, area: boolean): void {
  if (area) {
    const gradient = ctx.createLinearGradient(0, geom.plot.y, 0, geom.plot.y + geom.plot.h);
    gradient.addColorStop(0, withAlpha(p.signal, 0.28));
    gradient.addColorStop(1, withAlpha(p.signal, 0.02));
    closePath(ctx, geom, candles);
    ctx.lineTo(geom.xCenter(geom.count - 1), geom.plot.y + geom.plot.h);
    ctx.lineTo(geom.xCenter(0), geom.plot.y + geom.plot.h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }
  closePath(ctx, geom, candles);
  ctx.strokeStyle = p.signal;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // The newest close gets a small dot so the forming value has a clear anchor.
  const lastC = candles[geom.firstIndex + geom.count - 1];
  const dx = geom.xCenter(geom.count - 1);
  const dy = geom.yPrice(lastC.close);
  ctx.fillStyle = p.signal;
  ctx.beginPath();
  ctx.moveTo(dx + 2, dy);
  ctx.lineTo(dx, dy + 2);
  ctx.lineTo(dx - 2, dy);
  ctx.lineTo(dx, dy - 2);
  ctx.closePath();
  ctx.fill();
  void dpr;
}

/** Renko bricks: a filled rect from open to close per brick, coloured by direction. */
function drawRenkoSeries(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], p: DeskPalette, dpr: number): void {
  for (let k = 0; k < geom.count; k += 1) {
    const c = candles[geom.firstIndex + k];
    const color = isUp(c) ? p.buy : p.sell;
    const { left } = candleX(geom, k, dpr);
    const yOpen = geom.yPrice(c.open);
    const yClose = geom.yPrice(c.close);
    const top = snap(Math.min(yOpen, yClose), dpr);
    const h = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillStyle = withAlpha(color, 0.85);
    ctx.fillRect(left, top, geom.body, h);
    ctx.strokeStyle = withAlpha(color, 0.95);
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, geom.body - 1), Math.max(0, h - 1));
  }
}

/** A polyline over a null tolerant overlay series, breaking wherever the window is incomplete. */
function strokeOverlay(ctx: Ctx2DLike, geom: ChartGeometry, values: readonly Num[], color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  for (let k = 0; k < geom.count; k += 1) {
    const i = geom.firstIndex + k;
    const v = i < values.length ? values[i] : null;
    if (v === null || v === undefined) {
      started = false;
      continue;
    }
    const x = geom.xCenter(k);
    const y = geom.yPrice(v);
    if (started) ctx.lineTo(x, y);
    else {
      ctx.moveTo(x, y);
      started = true;
    }
  }
  ctx.stroke();
}

/** Bollinger band fill, drawn before the candles so the bodies stay on top. Alpha is 6 percent. */
function drawBollingerFill(ctx: Ctx2DLike, geom: ChartGeometry, bb: BollingerResult, p: DeskPalette): void {
  ctx.beginPath();
  let any = false;
  for (let k = 0; k < geom.count; k += 1) {
    const i = geom.firstIndex + k;
    const u = i < bb.upper.length ? bb.upper[i] : null;
    if (u === null || u === undefined) continue;
    const x = geom.xCenter(k);
    const y = geom.yPrice(u);
    if (any) ctx.lineTo(x, y);
    else {
      ctx.moveTo(x, y);
      any = true;
    }
  }
  if (!any) return;
  for (let k = geom.count - 1; k >= 0; k -= 1) {
    const i = geom.firstIndex + k;
    const l = i < bb.lower.length ? bb.lower[i] : null;
    if (l === null || l === undefined) continue;
    ctx.lineTo(geom.xCenter(k), geom.yPrice(l));
  }
  ctx.closePath();
  ctx.fillStyle = withAlpha(p.ink2, 0.06);
  ctx.fill();
}

/** Overlay lines on the price pane: EMAs, Bollinger and the supertrend, in that draw order. */
function drawOverlays(ctx: Ctx2DLike, geom: ChartGeometry, p: DeskPalette): void {
  const ind = geom.indicators;
  if (ind.bb !== null) {
    strokeOverlay(ctx, geom, ind.bb.upper, withAlpha(p.ink2, 0.55), 1);
    strokeOverlay(ctx, geom, ind.bb.lower, withAlpha(p.ink2, 0.55), 1);
    strokeOverlay(ctx, geom, ind.bb.mid, withAlpha(p.ink2, 0.9), 1);
  }
  if (ind.ema9 !== null) strokeOverlay(ctx, geom, ind.ema9, withAlpha(p.signal, 0.9), 1);
  if (ind.ema21 !== null) strokeOverlay(ctx, geom, ind.ema21, withAlpha(p.hold, 0.9), 1);
  if (ind.ema50 !== null) strokeOverlay(ctx, geom, ind.ema50, withAlpha(p.ink2, 0.9), 1);
  if (ind.ema200 !== null) strokeOverlay(ctx, geom, ind.ema200, withAlpha(p.ink, 0.8), 1);
  const st = ind.supertrend;
  if (st !== null) {
    // One segment per direction run: the line breaks at every flip and changes colour with it.
    let started = false;
    let currentDir = 0;
    ctx.lineWidth = 1.4;
    for (let k = 0; k < geom.count; k += 1) {
      const i = geom.firstIndex + k;
      const v = i < st.line.length ? st.line[i] : null;
      const d = i < st.dir.length ? st.dir[i] : null;
      if (v === null || v === undefined || d === null || d === undefined) {
        if (started) {
          ctx.stroke();
          started = false;
        }
        continue;
      }
      if (!started || d !== currentDir) {
        if (started) ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = d === 1 ? p.buy : p.sell;
        ctx.moveTo(geom.xCenter(k), geom.yPrice(v));
        started = true;
        currentDir = d;
      } else {
        ctx.lineTo(geom.xCenter(k), geom.yPrice(v));
      }
    }
    if (started) ctx.stroke();
  }
}

/** Pane header: a separator line on top and a small label inside the pane. */
function paneChrome(ctx: Ctx2DLike, pane: ChartPane, label: string, p: DeskPalette, dpr: number, font: string): void {
  const y = snapLine(pane.rect.y, dpr);
  ctx.strokeStyle = withAlpha(p.edge, 0.9);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(pane.rect.w, y);
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = p.ink4;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, 4, pane.rect.y + 3);
}

/** A polyline inside a pane with its own y mapping, breaking on incomplete windows. */
function paneSeries(ctx: Ctx2DLike, geom: ChartGeometry, values: readonly Num[], yOf: (v: number) => number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  for (let k = 0; k < geom.count; k += 1) {
    const i = geom.firstIndex + k;
    const v = i < values.length ? values[i] : null;
    if (v === null || v === undefined) {
      started = false;
      continue;
    }
    const x = geom.xCenter(k);
    if (started) ctx.lineTo(x, yOf(v));
    else {
      ctx.moveTo(x, yOf(v));
      started = true;
    }
  }
  ctx.stroke();
}

/** RSI 14 pane: fixed 0 to 100 scale, guides at 30 and 70 and a midline at 50. */
function drawRsiPane(ctx: Ctx2DLike, geom: ChartGeometry, pane: ChartPane, values: readonly Num[], p: DeskPalette, dpr: number, font: string): void {
  paneChrome(ctx, pane, "RSI 14", p, dpr, font);
  const r = pane.rect;
  const yOf = (v: number): number => r.y + ((100 - v) / 100) * r.h;
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = withAlpha(p.edgeStrong, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const g of [30, 70]) {
    const y = snapLine(yOf(g), dpr);
    ctx.moveTo(0, y);
    ctx.lineTo(r.w, y);
  }
  ctx.setLineDash([1, 3]);
  const yMid = snapLine(yOf(50), dpr);
  ctx.moveTo(0, yMid);
  ctx.lineTo(r.w, yMid);
  ctx.stroke();
  ctx.restore();
  ctx.font = font;
  ctx.fillStyle = p.ink4;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  for (const g of [30, 70]) ctx.fillText(String(g), r.w - 4, yOf(g) - 1);
  paneSeries(ctx, geom, values, yOf, withAlpha(p.signal, 0.95), 1.2);
}

/** MACD 12/26/9 pane: sign coloured histogram, macd line and signal line on a symmetric scale. */
function drawMacdPane(
  ctx: Ctx2DLike,
  geom: ChartGeometry,
  pane: ChartPane,
  values: { readonly macd: Num[]; readonly signal: Num[]; readonly hist: Num[] },
  p: DeskPalette,
  dpr: number,
  font: string,
): void {
  paneChrome(ctx, pane, "MACD 12/26/9", p, dpr, font);
  const r = pane.rect;
  let maxAbs = 0;
  for (const series of [values.macd, values.signal, values.hist]) {
    for (let i = geom.firstIndex; i < geom.firstIndex + geom.count && i < series.length; i += 1) {
      const v = series[i];
      if (v !== null && v !== undefined && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
  }
  if (maxAbs <= 0) return;
  const cy = r.y + r.h / 2;
  const yOf = (v: number): number => cy - (v / maxAbs) * (r.h / 2 - 4);
  const yZero = snapLine(cy, dpr);
  ctx.strokeStyle = withAlpha(p.edgeStrong, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yZero);
  ctx.lineTo(r.w, yZero);
  ctx.stroke();
  const barW = Math.max(1, Math.floor(geom.body * 0.6));
  for (let k = 0; k < geom.count; k += 1) {
    const i = geom.firstIndex + k;
    const h = i < values.hist.length ? values.hist[i] : null;
    if (h === null || h === undefined) continue;
    const x = geom.xCenter(k);
    const y = yOf(h);
    const color = h >= 0 ? p.buy : p.sell;
    ctx.fillStyle = withAlpha(color, 0.5);
    ctx.fillRect(x - barW / 2, Math.min(y, cy), barW, Math.max(1, Math.abs(y - cy)));
  }
  paneSeries(ctx, geom, values.macd, yOf, withAlpha(p.signal, 0.95), 1.2);
  paneSeries(ctx, geom, values.signal, yOf, withAlpha(p.hold, 0.95), 1.2);
}

/** Caps per smart money family so busy structure stays readable (SMC, spec 3.4). */
export const SMC_MAX_BLOCKS = 6;
export const SMC_MAX_GAPS = 8;
export const SMC_MAX_EVENTS = 8;
export const SMC_MAX_POOLS = 6;
const SMC_LABEL_H = 11;

interface PlacedBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const boxesOverlap = (a: PlacedBox, b: PlacedBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Greedy label placer: a label is drawn only when its box fits inside `clip` and does not overlap a
 * label already placed. Returns true when the label was drawn. All smart money labels go through it.
 */
function placeLabel(
  ctx: Ctx2DLike,
  placed: PlacedBox[],
  clip: Rect,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string,
): boolean {
  const w = ctx.measureText(text).width + 4;
  const box: PlacedBox = { x: x - w / 2, y: y - SMC_LABEL_H / 2, w, h: SMC_LABEL_H };
  if (box.x < clip.x || box.x + box.w > clip.x + clip.w || box.y < clip.y || box.y + box.h > clip.y + clip.h) return false;
  for (const other of placed) if (boxesOverlap(box, other)) return false;
  placed.push(box);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  return true;
}

/** Center x of a series index, clamped to the plot so objects born before the window still anchor. */
function smcX(geom: ChartGeometry, index: number): number {
  const k = index - geom.firstIndex;
  if (k < 0) return geom.plot.x;
  if (k >= geom.count) return geom.plot.x + geom.plot.w;
  return geom.xCenter(k);
}

/** How far `price` sits outside [low, high]; 0 when inside. Used to pick the nearest zones. */
const edgeDist = (price: number, low: number, high: number): number => (price < low ? low - price : price > high ? price - high : 0);

/** True when a price band overlaps the visible price range at all. */
const bandVisible = (geom: ChartGeometry, low: number, high: number): boolean => high > geom.lo && low < geom.hi;

/** Smart money layers behind the candles: premium and discount zones, imbalances and order blocks. */
function drawSmcBehind(ctx: Ctx2DLike, geom: ChartGeometry, input: CandleChartInput, smc: NonNullable<CandleChartInput["smc"]>, p: DeskPalette, dpr: number): void {
  const placed: PlacedBox[] = [];
  const clip = geom.plot;
  const r = smc.result;
  const last = input.last ?? (input.candles.length ? input.candles[input.candles.length - 1]!.close : null);
  const right = geom.plot.x + geom.plot.w;

  // Premium and discount zone: the top half of the last structure range sells, the bottom buys,
  // both from the older of the two pivots to the right edge. The equilibrium cuts it in two.
  if (smc.show.zones && r.range !== null && bandVisible(geom, r.range.low, r.range.high)) {
    const { low, high, lowIndex, highIndex } = r.range;
    const mid = (low + high) / 2;
    const x0 = smcX(geom, Math.min(lowIndex, highIndex));
    const yHigh = geom.yPrice(high);
    const yMid = geom.yPrice(mid);
    const yLow = geom.yPrice(low);
    ctx.fillStyle = withAlpha(p.sell, 0.05);
    ctx.fillRect(x0, yHigh, right - x0, yMid - yHigh);
    ctx.fillStyle = withAlpha(p.buy, 0.05);
    ctx.fillRect(x0, yMid, right - x0, yLow - yMid);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = withAlpha(p.ink2, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, snapLine(yMid, dpr));
    ctx.lineTo(right, snapLine(yMid, dpr));
    ctx.stroke();
    ctx.restore();
    placeLabel(ctx, placed, clip, "EQ", right - 14, yMid, withAlpha(p.ink2, 0.85), input.font);
    placeLabel(ctx, placed, clip, "Premium", x0 + 26, yHigh + 8, withAlpha(p.ink4, 0.95), input.font);
    placeLabel(ctx, placed, clip, "Desconto", x0 + 26, yLow - 8, withAlpha(p.ink4, 0.95), input.font);
  }

  // Fair value gaps still open: only the unfilled part of the band is shaded, nearest to price first.
  if (smc.show.gaps) {
    const live = r.fvgs
      .filter((g) => g.fill < 1 && bandVisible(geom, g.low, g.high))
      .sort((a, b) => edgeDist(last ?? 0, a.low, a.high) - edgeDist(last ?? 0, b.low, b.high))
      .slice(0, SMC_MAX_GAPS);
    for (const gap of live) {
      const span = gap.high - gap.low;
      const bandLow = gap.dir === "up" ? gap.low : gap.low + gap.fill * span;
      const bandHigh = gap.dir === "up" ? gap.high - gap.fill * span : gap.high;
      const yTop = geom.yPrice(bandHigh);
      const yBot = geom.yPrice(bandLow);
      const x0 = smcX(geom, gap.index - 2);
      const color = gap.dir === "up" ? p.buy : p.sell;
      ctx.fillStyle = withAlpha(color, 0.1);
      ctx.fillRect(x0, yTop, right - x0, Math.max(1, yBot - yTop));
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = withAlpha(color, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, snapLine(yTop, dpr));
      ctx.lineTo(right, snapLine(yTop, dpr));
      ctx.stroke();
      ctx.restore();
      if (yBot - yTop >= 12) placeLabel(ctx, placed, clip, "FVG", x0 + 16, (yTop + yBot) / 2, withAlpha(color, 0.9), input.font);
    }
  }

  // Order blocks still untouched: solid-ish box from the block candle to the right edge.
  if (smc.show.blocks) {
    const live = r.orderBlocks
      .filter((b) => b.mitigatedAt === null && bandVisible(geom, b.low, b.high))
      .sort((a, b) => edgeDist(last ?? 0, a.low, a.high) - edgeDist(last ?? 0, b.low, b.high))
      .slice(0, SMC_MAX_BLOCKS);
    for (const block of live) {
      const yTop = geom.yPrice(block.high);
      const yBot = geom.yPrice(block.low);
      const x0 = smcX(geom, block.index);
      const color = block.dir === "up" ? p.buy : p.sell;
      ctx.fillStyle = withAlpha(color, 0.14);
      ctx.fillRect(x0, yTop, right - x0, Math.max(1, yBot - yTop));
      ctx.strokeStyle = withAlpha(color, 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, yTop + 0.5, Math.max(0, right - x0 - 1), Math.max(1, yBot - yTop - 1));
      placeLabel(ctx, placed, clip, "OB", x0 + 14, (yTop + yBot) / 2, withAlpha(color, 0.95), input.font);
    }
  }
}

/** Smart money layers above the candles: structure events and liquidity pools and sweeps. */
function drawSmcFront(ctx: Ctx2DLike, geom: ChartGeometry, input: CandleChartInput, smc: NonNullable<CandleChartInput["smc"]>, p: DeskPalette, dpr: number): void {
  const placed: PlacedBox[] = [];
  const clip = geom.plot;
  const r = smc.result;
  const right = geom.plot.x + geom.plot.w;

  // Structure: a line at the broken level from the swing to the break bar, solid for BOS and
  // dashed for CHoCH, newest eight events.
  if (smc.show.structure) {
    for (const ev of r.events.slice(-SMC_MAX_EVENTS)) {
      if (!(ev.level > geom.lo && ev.level < geom.hi)) continue;
      if (ev.index < geom.firstIndex) continue;
      const y = snapLine(geom.yPrice(ev.level), dpr);
      const x0 = smcX(geom, ev.swingIndex);
      const x1 = smcX(geom, ev.index);
      const color = ev.dir === "up" ? p.buy : p.sell;
      ctx.save();
      if (ev.type === "CHoCH") ctx.setLineDash([4, 3]);
      ctx.strokeStyle = withAlpha(color, 0.85);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.restore();
      placeLabel(ctx, placed, clip, ev.type, (x0 + x1) / 2, y - 8, withAlpha(p.ink3, 0.95), input.font);
    }
  }

  // Liquidity: at most six pools, newest activity first. Active pools are dashed lines to the
  // right edge labelled EQH or EQL; a swept pool leaves a small triangle at the sweep bar.
  if (smc.show.liquidity) {
    const pools = [...r.pools]
      .sort((a, b) => (b.sweptAt ?? b.indices[b.indices.length - 1] ?? 0) - (a.sweptAt ?? a.indices[a.indices.length - 1] ?? 0))
      .slice(0, SMC_MAX_POOLS);
    for (const pool of pools) {
      if (!(pool.price > geom.lo && pool.price < geom.hi)) continue;
      const y = snapLine(geom.yPrice(pool.price), dpr);
      if (pool.sweptAt !== null) {
        const x = smcX(geom, pool.sweptAt);
        ctx.fillStyle = withAlpha(p.hold, 0.9);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 4, y + 7);
        ctx.lineTo(x - 4, y + 7);
        ctx.closePath();
        ctx.fill();
        placeLabel(ctx, placed, clip, "Varredura", x + 26, y + 12, withAlpha(p.ink3, 0.95), input.font);
      } else if (pool.takenAt === null) {
        const x0 = smcX(geom, pool.indices[0] ?? 0);
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = withAlpha(p.ink2, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.restore();
        placeLabel(ctx, placed, clip, pool.kind === "eqh" ? "EQH" : "EQL", right - 16, y - 7, withAlpha(p.ink2, 0.9), input.font);
      }
    }
  }
}

/**
 * Draws the price series, volume, VWAP, the last price line and tag, the decision lane and
 * markers, the axes and the crosshair. Returns the geometry so the caller can map pointer
 * positions without recomputing it.
 */
export function drawChart(ctx: Ctx2DLike, input: CandleChartInput): ChartGeometry {
  const geom = computeGeometry(input);
  const { palette: p, dpr, candles, decimals } = input;
  const kind = input.kind ?? "candles";
  const markers = input.markers ?? [];
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

  // The price series itself. The Bollinger fill goes first so bodies and bricks sit on top of it.
  // Smart money zones, imbalances and blocks also sit behind the candles; structure and liquidity
  // go above them. Renko drops every smart money layer: its indices do not map to the bricks.
  const smc = kind === "renko" ? null : (input.smc ?? null);
  if (smc !== null) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(geom.plot.x, geom.plot.y, geom.plot.w, geom.plot.h);
    ctx.clip();
    drawSmcBehind(ctx, geom, input, smc, p, dpr);
    ctx.restore();
  }
  if (kind !== "renko" && input.inonu !== undefined) drawInonuBehind(ctx, geom, candles, input.inonu, p, dpr, input.font);
  if (geom.indicators.bb !== null) drawBollingerFill(ctx, geom, geom.indicators.bb, p);
  if (kind === "ohlc") drawOhlcSeries(ctx, geom, candles, p, dpr);
  else if (kind === "line") drawLineSeries(ctx, geom, candles, p, dpr, false);
  else if (kind === "area") drawLineSeries(ctx, geom, candles, p, dpr, true);
  else if (kind === "renko") drawRenkoSeries(ctx, geom, candles, p, dpr);
  else drawCandlesSeries(ctx, geom, candles, p, dpr);
  drawOverlays(ctx, geom, p);
  if (smc !== null) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(geom.plot.x, geom.plot.y, geom.plot.w, geom.plot.h);
    ctx.clip();
    drawSmcFront(ctx, geom, input, smc, p, dpr);
    ctx.restore();
  }
  if (input.wallets !== undefined && input.wallets.size > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(geom.plot.x, geom.plot.y, geom.plot.w, geom.plot.h);
    ctx.clip();
    drawWalletMarks(ctx, geom, candles, input.wallets, p, dpr);
    ctx.restore();
  }
  if (kind !== "renko" && input.inonu !== undefined) drawInonuFront(ctx, geom, candles, input.inonu, p, dpr, input.font);

  // Jev computed levels: thin dashed lines across the price pane, supports in the buy tone and
  // resistances in the sell tone at 55 percent, with a small right aligned touches label.
  if ((input.indicators ?? DEFAULT_INDICATORS).includes("levels") && input.levels !== undefined) {
    const labelFont = input.font.replace(/^(\d)/, "500 $1");
    for (const level of input.levels) {
      if (!(level.px > geom.lo && level.px < geom.hi)) continue;
      const color = level.kind === "support" ? p.buy : p.sell;
      const y = snapLine(geom.yPrice(level.px), dpr);
      ctx.strokeStyle = withAlpha(color, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(geom.plot.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const text = `${level.kind === "support" ? "S" : "R"} ${fmtNumber(level.px, decimals)} x${level.touches}`;
      ctx.font = labelFont;
      ctx.fillStyle = withAlpha(color, 0.9);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(text, geom.plot.w - 4, clamp(y - 7, geom.plot.y + 6, geom.plot.y + geom.plot.h - 6));
    }
  }

  // Decision lane: one small glyph per visible decision, right under the price pane.
  if (geom.lane.h > 0) {
    ctx.fillStyle = withAlpha(p.edge, 0.28);
    ctx.fillRect(0, geom.lane.y, geom.lane.w, geom.lane.h);
    const yLine = snapLine(geom.lane.y, dpr);
    ctx.strokeStyle = withAlpha(p.edge, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yLine);
    ctx.lineTo(geom.lane.w, yLine);
    ctx.stroke();
    const laneSize = clamp(geom.slot * 0.6, LANE_GLYPH_MIN, LANE_GLYPH_MAX);
    const cy = geom.lane.y + geom.lane.h / 2;
    for (const mp of geom.markerPoints) {
      drawDecisionGlyph(ctx, mp.x, cy, laneSize, markers[mp.markerIndex].action, p);
    }
  }

  // Volume pane under the lane.
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

  // RSI and MACD panes, in the order the geometry stacked them.
  for (const pane of geom.panes) {
    if (pane.id === "volume") {
      if (geom.volume.h > 0) paneChrome(ctx, pane, "VOL", p, dpr, input.font);
    } else if (pane.id === "rsi") {
      if (geom.indicators.rsi !== null) drawRsiPane(ctx, geom, pane, geom.indicators.rsi, p, dpr, input.font);
    } else if (pane.id === "macd") {
      if (geom.indicators.macd !== null) drawMacdPane(ctx, geom, pane, geom.indicators.macd, p, dpr, input.font);
    }
  }

  // Decision markers on the price pane.
  const glyphSize = clamp(geom.slot * 0.9, GLYPH_MIN, GLYPH_MAX);
  for (const mp of geom.markerPoints) {
    drawDecisionGlyph(ctx, mp.x, mp.y, glyphSize, markers[mp.markerIndex].action, p);
  }

  // The newest visible decision gets a label chip with a short leader line.
  const newest = geom.markerPoints.length ? geom.markerPoints[geom.markerPoints.length - 1] : null;
  if (newest !== null) {
    const m = markers[newest.markerIndex];
    const text = `${ACTION_WORD[m.action]} ${Math.round(m.weights[m.action] * 100)}%`;
    ctx.font = boldFont;
    const h = 16;
    const w = ctx.measureText(text).width + 12;
    const bx = clamp(newest.x - w / 2, 2, Math.max(2, geom.plot.w - w - 2));
    let by = newest.y - glyphSize - 8 - h;
    if (by < geom.plot.y + 2) by = Math.min(newest.y + glyphSize + 8, geom.plot.y + geom.plot.h - h - 2);
    ctx.strokeStyle = withAlpha(p[ACTION_COLOR[m.action]], 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(newest.x, newest.y + (m.action === "sell" ? -glyphSize / 2 : glyphSize / 2));
    ctx.lineTo(clamp(newest.x, bx + 4, bx + w - 4), by + (by < newest.y ? h : 0));
    ctx.stroke();
    ctx.fillStyle = p.well;
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = withAlpha(p[ACTION_COLOR[m.action]], 0.65);
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = p[ACTION_COLOR[m.action]];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + w / 2, by + h / 2 + 0.5);
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
    const lastPane = geom.panes.length > 0 ? geom.panes[geom.panes.length - 1] : null;
    ctx.lineTo(x, lastPane !== null ? lastPane.rect.y + lastPane.rect.h : geom.lane.y + geom.lane.h);
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
