/**
 * The chart layer of Inonu (T5.7, T6.4, T7.5), pure drawing over the desk's shared geometry.
 *
 * Two passes, like the smart money layers: `drawInonuBehind` paints the zones under the candles, `drawInonuFront` paints what
 * the engine measured (a strip of aggressed volume on the right edge, imbalances, runs, the point of control) and, last, the
 * decision of the model. Everything the ENGINE draws is descriptive (demand, supply, measured levels); the words of an order
 * appear only on the decision chip, because that one is the model's own answer and says who gave it (FLX-10).
 *
 * Nothing here moves: no timers, no frames, no blinking. A mark that needs an adaptive threshold is simply absent while the
 * engine warms up, and the strip says how far the warm-up is. Zones are capped, labels never overlap (a label that does not
 * fit is dropped, not squeezed), and everything is clipped to the price pane.
 */
import type { ChartOverlay, OverlayZone } from "../../inonu/overlay";
import type { Veredito } from "../../veredito/types";
import type { Ctx2DLike, DeskPalette } from "../ui/canvas";
import { snapLine, withAlpha } from "../ui/canvas";
import type { CandleLike, ChartGeometry } from "../ui/draw-chart";

/** At most this many zones are drawn: the ones nearest to the price. */
export const MAX_ZONES_DRAWN = 6;
const MAX_RUNS_PER_KIND = 3;
const STRIP_MAX_W = 72;
const STRIP_SHARE = 0.16;
const LABEL_H = 11;
const CHIP_H = 16;

export type InonuAction = "buy" | "sell" | "hold";

/** The answer of the model as the chart keeps it: its own word, the candidate it chose, when, and which model. */
export interface ChartDecision {
  readonly action: InonuAction;
  readonly candidateId: string | null;
  readonly atMs: number;
  readonly instId: string;
  readonly modelo: string;
  /** The Veredito of that answer (its plan, its reasons), when the answer had one: the thermometer shows it without opening the Inonu tab. The chart ignores it. */
  readonly veredito?: Veredito;
}

export interface InonuShow {
  readonly zones: boolean;
  readonly flow: boolean;
  readonly decision: boolean;
}

export interface InonuLayerInput {
  /** What the engine measured; null while it is not available. */
  readonly overlay: ChartOverlay | null;
  /** The newest answer of the model for this instrument; null when none. */
  readonly decision: ChartDecision | null;
  /** Older answers for this instrument, drawn as small glyphs at the bar they were given. */
  readonly trail?: readonly ChartDecision[];
  readonly show: InonuShow;
  readonly nowMs: number;
}

interface PlacedBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const overlaps = (a: PlacedBox, b: PlacedBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const visible = (geom: ChartGeometry, low: number, high: number): boolean => high > geom.lo && low < geom.hi;
const inside = (geom: ChartGeometry, price: number): boolean => price > geom.lo && price < geom.hi;
const stripWidth = (geom: ChartGeometry): number => Math.min(STRIP_MAX_W, Math.round(geom.plot.w * STRIP_SHARE));

function clipped(ctx: Ctx2DLike, geom: ChartGeometry, body: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(geom.plot.x, geom.plot.y, geom.plot.w, geom.plot.h);
  ctx.clip();
  body();
  ctx.restore();
}

/**
 * Greedy label placer: drawn only when the box fits the clip and touches no label already placed. `shifts` are the vertical
 * offsets tried in order, so a label that collides with a neighbour moves a line up or down before it is given up.
 */
function place(ctx: Ctx2DLike, placed: PlacedBox[], clip: ChartGeometry["plot"], text: string, x: number, y: number, color: string, font: string, shifts: readonly number[] = [0], plate: string | null = null): boolean {
  ctx.font = font;
  const w = ctx.measureText(text).width + 4;
  for (const shift of shifts) {
    const cy = y + shift;
    const box: PlacedBox = { x: x - w / 2, y: cy - LABEL_H / 2, w, h: LABEL_H };
    if (box.x < clip.x || box.x + box.w > clip.x + clip.w || box.y < clip.y || box.y + box.h > clip.y + clip.h) continue;
    if (placed.some((other) => overlaps(box, other))) continue;
    placed.push(box);
    if (plate !== null) {
      ctx.fillStyle = plate;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, cy + 0.5);
    return true;
  }
  return false;
}

/** Index of the newest candle that opened at or before `ts`, or -1 when `ts` is older than the whole series. */
function candleIndexAt(candles: readonly CandleLike[], ts: number): number {
  let lo = 0;
  let hi = candles.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.tsMs <= ts) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Left edge of the slot of candle `index`; objects born before the window start at the left edge of the plot. */
function slotLeft(geom: ChartGeometry, index: number): number {
  const k = index - geom.firstIndex;
  if (index < 0 || k < 0) return geom.plot.x;
  if (k >= geom.count) return geom.plot.x + geom.plot.w;
  return geom.xCenter(k) - geom.slot / 2;
}

const lastClose = (candles: readonly CandleLike[]): number | null => (candles.length === 0 ? null : candles[candles.length - 1]!.close);

function zoneTone(zone: OverlayZone, p: DeskPalette): string {
  return zone.lado === "demanda" ? p.buy : zone.lado === "oferta" ? p.sell : p.ink2;
}

const ZONE_WORD: Record<OverlayZone["lado"], string> = { demanda: "Demanda", oferta: "Oferta", neutra: "Neutra" };

interface ZoneBox {
  readonly zone: OverlayZone;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function zoneBox(geom: ChartGeometry, candles: readonly CandleLike[], zone: OverlayZone): ZoneBox {
  const right = geom.plot.x + geom.plot.w;
  const x = slotLeft(geom, candleIndexAt(candles, zone.primeiroTs));
  const top = geom.yPrice(zone.alto);
  const bottom = geom.yPrice(zone.baixo);
  return { zone, x, y: top, w: Math.max(1, right - x), h: Math.max(1, bottom - top) };
}

/** The zones to draw: inside the visible price range, the ones nearest to the price first, at most MAX_ZONES_DRAWN. */
function pickZones(geom: ChartGeometry, candles: readonly CandleLike[], overlay: ChartOverlay): OverlayZone[] {
  const reference = overlay.price ?? lastClose(candles) ?? 0;
  const gap = (z: OverlayZone): number => (reference < z.baixo ? z.baixo - reference : reference > z.alto ? reference - z.alto : 0);
  return overlay.zonas
    .filter((z) => visible(geom, z.baixo, z.alto))
    .sort((a, b) => gap(a) - gap(b) || b.nota - a.nota)
    .slice(0, MAX_ZONES_DRAWN);
}

/** Zones under the candles: a translucent box from the bar they were found to the right edge, with a dotted invalidation line. */
export function drawInonuBehind(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], layer: InonuLayerInput, p: DeskPalette, dpr: number, font: string): void {
  const overlay = layer.overlay;
  if (overlay === null || !layer.show.zones || geom.count === 0) return;
  const zones = pickZones(geom, candles, overlay);
  if (zones.length === 0) return;
  const right = geom.plot.x + geom.plot.w;
  const labelRight = right - stripWidth(geom);
  const placed: PlacedBox[] = [];
  clipped(ctx, geom, () => {
    for (const zone of zones) {
      const box = zoneBox(geom, candles, zone);
      const tone = zoneTone(zone, p);
      const tested = zone.estado === "testada";
      ctx.fillStyle = withAlpha(tone, 0.08 + clamp(zone.nota / 100, 0, 1) * 0.1);
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = withAlpha(tone, tested ? 0.75 : 0.5);
      ctx.lineWidth = 1;
      if (tested) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(1, box.h - 1));
        ctx.restore();
      } else {
        ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(1, box.h - 1));
      }
      if (zone.invalidacao !== null && inside(geom, zone.invalidacao)) {
        const y = snapLine(geom.yPrice(zone.invalidacao), dpr);
        ctx.save();
        ctx.setLineDash([1, 3]);
        ctx.strokeStyle = withAlpha(tone, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.restore();
      }
      const text = `${ZONE_WORD[zone.lado]} ${Math.round(zone.nota)}${tested ? " testada" : ""}`;
      ctx.font = font;
      const w = ctx.measureText(text).width + 4;
      const x = Math.min(box.x + w / 2 + 3, labelRight - w / 2 - 2);
      const y = box.h >= 14 ? box.y + box.h / 2 : box.y - 7;
      place(ctx, placed, geom.plot, text, x, y, withAlpha(tone, 0.95), font, [0], withAlpha(p.well, 0.7));
    }
  });
}

function triangle(ctx: Ctx2DLike, cx: number, cy: number, half: number, pointsRight: boolean): void {
  const tip = pointsRight ? cx + half : cx - half;
  const base = pointsRight ? cx - half : cx + half;
  ctx.beginPath();
  ctx.moveTo(base, cy - half);
  ctx.lineTo(tip, cy);
  ctx.lineTo(base, cy + half);
  ctx.closePath();
  ctx.fill();
}

function diamond(ctx: Ctx2DLike, cx: number, cy: number, half: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - half);
  ctx.lineTo(cx + half, cy);
  ctx.lineTo(cx, cy + half);
  ctx.lineTo(cx - half, cy);
  ctx.closePath();
  ctx.fill();
}

type Side = "c" | "v";
const sideTone = (side: Side | "n", p: DeskPalette): string => (side === "c" ? p.buy : side === "v" ? p.sell : p.ink2);

function drawFlow(ctx: Ctx2DLike, geom: ChartGeometry, overlay: ChartOverlay, p: DeskPalette, dpr: number, font: string, placed: PlacedBox[]): void {
  const right = geom.plot.x + geom.plot.w;
  const stripW = stripWidth(geom);
  const stripLeft = right - stripW;
  const levels = overlay.niveis.filter((l) => visible(geom, l.baixo, l.alto));
  const busiest = levels.reduce((m, l) => Math.max(m, l.c + l.v), 0);

  // The value area and the point of control: thin lines across the pane, named at the left.
  const profile = overlay.perfil;
  const line = (price: number, color: string, dash: number[]): number => {
    const y = snapLine(geom.yPrice(price), dpr);
    ctx.save();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(geom.plot.x, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.restore();
    return y;
  };
  const named: Array<{ readonly name: string; readonly price: number | null; readonly color: string; readonly dash: number[] }> = [
    { name: "POC", price: profile.poc === null ? null : (profile.poc.baixo + profile.poc.alto) / 2, color: withAlpha(p.signal, 0.6), dash: [] },
    { name: "VAL", price: profile.val, color: withAlpha(p.ink2, 0.5), dash: [2, 3] },
    { name: "VAH", price: profile.vah, color: withAlpha(p.ink2, 0.5), dash: [2, 3] },
  ];
  named.forEach((item, index) => {
    if (item.price === null || !inside(geom, item.price)) return;
    const y = line(item.price, item.color, item.dash);
    // The three names sit in a row at the left, so lines that are a few pixels apart still keep a readable tag each.
    place(ctx, placed, geom.plot, item.name, geom.plot.x + 16 + index * 28, y - 7, withAlpha(p.ink3, 0.95), font);
  });

  // The aggressed volume of the window, level by level: the buying part next to the axis and the selling part to its left, scaled to the busiest level.
  const rows = levels.map((level) => {
    const yTop = geom.yPrice(level.alto);
    const yBottom = geom.yPrice(level.baixo);
    const wBuy = busiest > 0 ? (level.c / busiest) * stripW : 0;
    const wSell = busiest > 0 ? (level.v / busiest) * stripW : 0;
    return { level, y: yTop + 0.5, h: Math.max(1, yBottom - yTop - 1), mid: (yTop + yBottom) / 2, wBuy, wSell, left: right - wBuy - wSell };
  });
  for (const row of rows) {
    if (row.wBuy >= 0.5) {
      ctx.fillStyle = withAlpha(p.buy, 0.45);
      ctx.fillRect(right - row.wBuy, row.y, row.wBuy, row.h);
    }
    if (row.wSell >= 0.5) {
      ctx.fillStyle = withAlpha(p.sell, 0.45);
      ctx.fillRect(right - row.wBuy - row.wSell, row.y, row.wSell, row.h);
    }
  }

  // Fator Volume: an outline on the level, in the colour of the side that dominated it.
  for (const row of rows) {
    if (row.level.volume === null) continue;
    ctx.strokeStyle = withAlpha(sideTone(row.level.volume, p), 0.95);
    ctx.lineWidth = 1;
    ctx.strokeRect(row.left - 0.5, row.y, Math.max(2, right - row.left + 0.5), row.h);
  }

  // Measured imbalances: a small arrow on the open end of the bar. Buying points right, selling points left.
  for (const row of rows) {
    const { imb, alerta } = row.level;
    if (imb === "c" || imb === "cv") {
      ctx.fillStyle = withAlpha(p.buy, 0.95);
      triangle(ctx, Math.max(geom.plot.x + 3, row.left - 5), row.mid, 3, true);
    }
    if (imb === "v" || imb === "cv") {
      ctx.fillStyle = withAlpha(p.sell, 0.95);
      triangle(ctx, Math.max(geom.plot.x + 3, row.left - (imb === "cv" ? 11 : 5)), row.mid, 3, false);
    }
    if (alerta !== null && alerta.c) {
      ctx.fillStyle = withAlpha(p.buy, 0.95);
      diamond(ctx, right - 4, row.mid - (alerta.v ? 3 : 0), 2.5);
    }
    if (alerta !== null && alerta.v) {
      ctx.fillStyle = withAlpha(p.sell, 0.95);
      diamond(ctx, right - 4, row.mid + (alerta.c ? 3 : 0), 2.5);
    }
  }

  // High and low volume nodes: short ticks on the left border of the strip.
  const ticks: Array<{ readonly band: { readonly baixo: number; readonly alto: number }; readonly color: string }> = [
    ...profile.hvn.map((band) => ({ band, color: withAlpha(p.signal, 0.6) })),
    ...profile.lvn.map((band) => ({ band, color: withAlpha(p.ink4, 0.8) })),
  ];
  for (const tick of ticks) {
    if (!visible(geom, tick.band.baixo, tick.band.alto)) continue;
    const top = geom.yPrice(tick.band.alto);
    ctx.fillStyle = tick.color;
    ctx.fillRect(stripLeft - 3, top, 3, Math.max(1, geom.yPrice(tick.band.baixo) - top));
  }

  // Runs of levels, as brackets to the left of the strip: stacked imbalances, progression and exhaustion.
  const bracket = (slot: number, baixo: number, alto: number, color: string, text: string): void => {
    if (!visible(geom, baixo, alto)) return;
    const x = stripLeft - 8 - slot * 5;
    const top = geom.yPrice(alto);
    const bottom = Math.max(top + 2, geom.yPrice(baixo));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 3, top);
    ctx.lineTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineTo(x + 3, bottom);
    ctx.stroke();
    ctx.font = font;
    const w = ctx.measureText(text).width + 4;
    place(ctx, placed, geom.plot, text, x - w / 2 - 3, (top + bottom) / 2, color, font, [0, 12, -12, 24, -24], withAlpha(p.well, 0.7));
  };
  const strongest = <T extends { readonly n: number }>(list: readonly T[]): T[] => [...list].sort((a, b) => b.n - a.n).slice(0, MAX_RUNS_PER_KIND);
  for (const run of strongest(overlay.corridas.sequencial)) bracket(0, run.baixo, run.alto, withAlpha(sideTone(run.lado, p), 0.9), `Seq ${run.n}`);
  for (const run of strongest(overlay.corridas.progressao)) bracket(1, run.baixo, run.alto, withAlpha(sideTone(run.lado, p), 0.9), `Prog ${run.n}`);
  for (const run of strongest(overlay.corridas.exaustao)) bracket(2, run.baixo, run.alto, withAlpha(p.hold, 0.9), `Exaustao ${run.n}`);

  // Notes at the top of the strip: how far the warm-up is, and an absorption when there is one.
  const notes: string[] = [];
  if (!overlay.aquecimento.pronto) notes.push(`Fluxo aquecendo ${overlay.aquecimento.fechadas}/${overlay.aquecimento.necessarias}`);
  if (overlay.absorcao !== null) notes.push(`Absorcao ${overlay.absorcao.lado} x${overlay.absorcao.razaoVolume.toFixed(1)}`);
  let noteY = geom.plot.y + 26;
  for (const note of notes) {
    ctx.font = font;
    const w = ctx.measureText(note).width + 4;
    place(ctx, placed, geom.plot, note, right - w / 2 - 4, noteY, withAlpha(p.ink3, 0.95), font);
    noteY += LABEL_H + 1;
  }
}

// "esperar", not "manter": a person who holds nothing has nothing to keep, and the card of the verdict already says "esperar"
const ACTION_WORD: Record<InonuAction, string> = { buy: "comprar", sell: "vender", hold: "esperar" };

function actionTone(action: InonuAction, p: DeskPalette): string {
  return action === "buy" ? p.buy : action === "sell" ? p.sell : p.hold;
}

/** "ha 3 min": how long ago the model answered. */
export function ageText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 10) return "agora";
  if (seconds < 60) return `ha ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `ha ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `ha ${hours} h`;
  return `ha ${Math.floor(hours / 24)} d`;
}

function glyph(ctx: Ctx2DLike, cx: number, cy: number, size: number, action: InonuAction, color: string): void {
  const half = size / 2;
  ctx.fillStyle = color;
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

function drawDecision(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], layer: InonuLayerInput, p: DeskPalette, font: string): void {
  const right = geom.plot.x + geom.plot.w;
  const overlay = layer.overlay;
  const matches = (d: ChartDecision): boolean => overlay === null || overlay.instId === d.instId;

  // Older answers: a small glyph at the bar they were given, under the low for a buy and over the high for a sell.
  for (const old of layer.trail ?? []) {
    if (!matches(old)) continue;
    const index = candleIndexAt(candles, old.atMs);
    const k = index - geom.firstIndex;
    const candle = candles[index];
    if (index < 0 || k < 0 || k >= geom.count || candle === undefined) continue;
    const y = old.action === "buy" ? geom.yPrice(candle.low) + 8 : old.action === "sell" ? geom.yPrice(candle.high) - 8 : geom.yPrice(candle.close);
    glyph(ctx, geom.xCenter(k), clamp(y, geom.plot.y + 5, geom.plot.y + geom.plot.h - 5), 7, old.action, withAlpha(actionTone(old.action, p), 0.85));
  }

  const decision = layer.decision;
  if (decision === null || !matches(decision)) return;
  const tone = actionTone(decision.action, p);

  // Where it sits: on the zone the model chose, else on the live price; "manter" has no price and goes to the top corner.
  let zone: OverlayZone | null = null;
  if (overlay !== null && decision.candidateId !== null && decision.candidateId.startsWith("zona:")) {
    const id = decision.candidateId.slice("zona:".length);
    zone = overlay.zonas.find((z) => z.id === id) ?? null;
  }
  let y = geom.plot.y + CHIP_H / 2 + 2;
  if (decision.action !== "hold") {
    const price = zone !== null ? (zone.baixo + zone.alto) / 2 : overlay?.price ?? lastClose(candles);
    if (price !== null) y = clamp(geom.yPrice(price), geom.plot.y + CHIP_H / 2 + 2, geom.plot.y + geom.plot.h - CHIP_H / 2 - 2);
  }

  if (zone !== null && visible(geom, zone.baixo, zone.alto)) {
    const box = zoneBox(geom, candles, zone);
    ctx.strokeStyle = withAlpha(tone, 0.9);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(box.x + 0.75, box.y + 0.75, Math.max(0, box.w - 1.5), Math.max(1, box.h - 1.5));
  }

  const text = `Inonu: ${ACTION_WORD[decision.action]}, ${ageText(layer.nowMs - decision.atMs)}`;
  ctx.font = font.replace(/^(\d)/, "600 $1");
  const w = ctx.measureText(text).width + 12;
  const boxX = Math.max(geom.plot.x + 2, right - 20 - w);
  const boxY = y - CHIP_H / 2;
  glyph(ctx, right - 10, y, 8, decision.action, tone);
  ctx.fillStyle = p.well;
  ctx.fillRect(boxX, boxY, w, CHIP_H);
  ctx.strokeStyle = withAlpha(tone, 0.65);
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, w - 1, CHIP_H - 1);
  ctx.fillStyle = tone;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, boxX + w / 2, y + 0.5);
}

/** The measured flow, then the decision of the model, over the candles. */
export function drawInonuFront(ctx: Ctx2DLike, geom: ChartGeometry, candles: readonly CandleLike[], layer: InonuLayerInput, p: DeskPalette, dpr: number, font: string): void {
  if (geom.count === 0) return;
  const overlay = layer.overlay;
  const flow = overlay !== null && layer.show.flow;
  const decide = layer.show.decision && (layer.decision !== null || (layer.trail?.length ?? 0) > 0);
  if (!flow && !decide) return;
  clipped(ctx, geom, () => {
    const placed: PlacedBox[] = [];
    if (flow && overlay !== null) drawFlow(ctx, geom, overlay, p, dpr, font, placed);
    if (decide) drawDecision(ctx, geom, candles, layer, p, font);
  });
}
