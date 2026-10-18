import type { DeskLiquiditySlice } from "../types";
import { type Ctx2DLike, type DeskPalette, withAlpha } from "./canvas";
import { fmtCompact, fmtNumber } from "./format";

/**
 * The liquidity wall: price across, time receding, resting depth rising.
 *
 * Layout of a slice, as the data layer documents it in types.ts: `bins.length` bins of equal width
 * spanning mid minus 60 bps to mid plus 60 bps (60 bins of 2 bps), bin 0 the lowest price. The lower
 * half is bid depth, the upper half ask depth, and with an odd count the middle bin straddles mid.
 * Every slice is drawn centered on the mid line.
 *
 * Reach: OKX publishes 400 levels, which covers only part of the +/-60 bps window on a liquid pair.
 * A slice carries `reachBidBps` and `reachAskBps`, the distance up to which the book is known. A bin
 * beyond the reach is UNKNOWN, not empty. The window therefore crops to the reach of the newest
 * slice, and any bin of an older slice that lies beyond its own reach is drawn as a dotted trace at
 * the floor instead of as a wall.
 */
export const SLICE_HALF_SPAN_BPS = 60;
export const DEPTH_WINDOW_S = 90;

/** Screen vector per unit of each axis, before scaling. Price runs right and a hair down, time recedes up and right. */
const U_AXIS = { x: 1, y: 0.06 } as const;
const V_AXIS = { x: 0.34, y: -0.26 } as const;
/** Height of a full-scale wall, in the same units. It grows with the panel's aspect ratio so a squarer panel gets taller walls. */
const WALL_MIN = 0.28;
const WALL_MAX = 0.6;

const MARGIN = { left: 58, right: 44, top: 24, bottom: 24 } as const;

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface Projection {
  readonly width: number;
  readonly height: number;
  /** Pixels per unit. */
  readonly scale: number;
  /** Full height of a wall of depth 1, in px. */
  readonly wallPx: number;
  readonly corners: { readonly fl: Vec; readonly fr: Vec; readonly bl: Vec; readonly br: Vec };
  /** u: 0 (lowest price) to 1 (highest). v: 0 (newest, front) to 1 (oldest, back). h: 0 to 1 of the wall scale. */
  project(u: number, v: number, h: number): Vec;
}

/** Fits the whole scene, floor and tallest wall included, inside the canvas with room for labels. */
export function makeProjection(width: number, height: number): Projection {
  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const minX = 0;
  const maxX = U_AXIS.x + V_AXIS.x;
  const floorTop = Math.min(0, U_AXIS.y, V_AXIS.y, U_AXIS.y + V_AXIS.y);
  const maxY = Math.max(0, U_AXIS.y, V_AXIS.y, U_AXIS.y + V_AXIS.y);
  const boxW = maxX - minX;
  // Walls take the height the panel can spare, within limits, so the wall is not a flat strip in a tall panel.
  const wall = Math.min(WALL_MAX, Math.max(WALL_MIN, (innerH / innerW) * boxW - (maxY - floorTop)));
  const minY = floorTop - wall;
  const boxH = maxY - minY;
  const scale = Math.max(1, Math.min(innerW / boxW, innerH / boxH));
  const ox = MARGIN.left + (innerW - boxW * scale) / 2 - minX * scale;
  const oy = MARGIN.top + (innerH - boxH * scale) / 2 - minY * scale;

  const project = (u: number, v: number, h: number): Vec => ({
    x: ox + scale * (u * U_AXIS.x + v * V_AXIS.x),
    y: oy + scale * (u * U_AXIS.y + v * V_AXIS.y - h * wall),
  });

  return {
    width,
    height,
    scale,
    wallPx: wall * scale,
    corners: { fl: project(0, 0, 0), fr: project(1, 0, 0), bl: project(0, 1, 0), br: project(1, 1, 0) },
    project,
  };
}

/** Which side of the book a bin belongs to, from its position among `count` bins. */
export function binSide(index: number, count: number): "bid" | "ask" | "mid" {
  const center = (count - 1) / 2;
  if (index < center - 1e-9) return "bid";
  if (index > center + 1e-9) return "ask";
  return "mid";
}

/** Distance in bps from mid to the edge of bin `index` that is farthest from mid. */
export function farEdgeBps(index: number, count: number): number {
  const w = (2 * SLICE_HALF_SPAN_BPS) / count;
  const mid = count / 2;
  if (index + 1 <= mid + 1e-9) return (mid - index) * w;
  if (index >= mid - 1e-9) return (index + 1 - mid) * w;
  return w / 2;
}

/** True when the book is known across the whole of bin `index` of this slice. */
export function binKnown(slice: DeskLiquiditySlice, index: number): boolean {
  const n = slice.bins.length;
  const bidReach = slice.reachBidBps ?? SLICE_HALF_SPAN_BPS;
  const askReach = slice.reachAskBps ?? SLICE_HALF_SPAN_BPS;
  const far = farEdgeBps(index, n);
  const side = binSide(index, n);
  const reach = side === "bid" ? bidReach : side === "ask" ? askReach : Math.min(bidReach, askReach);
  return far <= reach + 1e-9;
}

export interface ViewWindow {
  /** First bin shown. */
  readonly first: number;
  /** One past the last bin shown. */
  readonly end: number;
  /** Half width of the window in bps. */
  readonly halfBps: number;
  /** True when the window is narrower than the full slice because the book reach is short. */
  readonly limited: boolean;
}

/** The bins worth drawing, from the reach of one slice (normally the newest). Always symmetric around mid. */
export function viewWindow(slice: DeskLiquiditySlice): ViewWindow {
  const n = slice.bins.length;
  const w = (2 * SLICE_HALF_SPAN_BPS) / n;
  const perSide = Math.floor(n / 2);
  const reach = Math.min(
    slice.reachBidBps ?? SLICE_HALF_SPAN_BPS,
    slice.reachAskBps ?? SLICE_HALF_SPAN_BPS,
    SLICE_HALF_SPAN_BPS,
  );
  const wanted = Math.floor(reach / w + 1e-9);
  const count = Math.min(perSide, Math.max(Math.min(2, perSide), wanted));
  const first = perSide - count;
  const end = n - perSide + count;
  return { first, end, halfBps: ((end - first) / 2) * w, limited: count < perSide };
}

export interface SliceView {
  readonly slice: DeskLiquiditySlice;
  /** 0 for the newest moment, 1 for the oldest second still drawn. */
  readonly v: number;
  /** 1 at the front, fading toward the back. */
  readonly fade: number;
}

/** Opacity of a slice at depth v: full at the front, a faint trace at the back. */
export function sliceFade(v: number): number {
  const t = Math.min(1, Math.max(0, v));
  return Number((1 - 0.88 * t ** 0.7).toFixed(4));
}

/**
 * Slices inside the window, ordered for the painter: oldest (back) first, newest (front) last.
 * Slices older than the window, with fewer than two bins, or laid out with a different number of
 * bins than the newest one (so they cannot be compared bin for bin) are dropped.
 */
export function layoutSlices(
  slices: readonly DeskLiquiditySlice[],
  nowMs: number,
  windowS = DEPTH_WINDOW_S,
): SliceView[] {
  const views: SliceView[] = [];
  for (const slice of slices) {
    if (slice.bins.length < 2) continue;
    const v = Math.max(0, (nowMs - slice.tsMs) / 1000 / windowS);
    if (v > 1) continue;
    views.push({ slice, v, fade: sliceFade(v) });
  }
  views.sort((a, b) => b.v - a.v);
  const front = views.length ? views[views.length - 1].slice.bins.length : 0;
  return views.filter((view) => view.slice.bins.length === front);
}

/** The deepest known bin inside the window, across the drawn slices. */
export function maxDepthOf(views: readonly SliceView[], win?: ViewWindow): number {
  let max = 0;
  for (const { slice } of views) {
    const from = win ? win.first : 0;
    const to = win ? win.end : slice.bins.length;
    for (let i = from; i < to; i += 1) {
      const b = slice.bins[i];
      if (Number.isFinite(b) && b > max && binKnown(slice, i)) max = b;
    }
  }
  return max;
}

/** Sum of known bid side and ask side depth of one slice (the middle bin of an odd count counts for neither). */
export function sideTotals(slice: DeskLiquiditySlice): { bid: number; ask: number } {
  let bid = 0;
  let ask = 0;
  const n = slice.bins.length;
  for (let i = 0; i < n; i += 1) {
    if (!binKnown(slice, i)) continue;
    const b = Number.isFinite(slice.bins[i]) ? slice.bins[i] : 0;
    const side = binSide(i, n);
    if (side === "bid") bid += b;
    else if (side === "ask") ask += b;
  }
  return { bid, ask };
}

function smoothThrough(ctx: Ctx2DLike, pts: readonly Vec[]): void {
  if (pts.length < 2) return;
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i += 1) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

export interface LiquidityInput {
  readonly width: number;
  readonly height: number;
  readonly slices: readonly DeskLiquiditySlice[];
  /** Reference time for the depth axis, in the same clock as the slice timestamps. */
  readonly nowMs: number;
  readonly midPx: number | null;
  readonly midDecimals: number;
  readonly palette: DeskPalette;
  readonly font: string;
  readonly windowS?: number;
}

export interface LiquidityStats {
  readonly drawn: number;
  readonly maxDepth: number;
  readonly window: ViewWindow | null;
  readonly projection: Projection;
}

interface Run {
  readonly pts: Vec[];
  readonly known: boolean[];
}

interface Profile {
  /** Whole ridge from the first bin to the last, left to right. */
  readonly all: Vec[];
  readonly bid: Run;
  readonly ask: Run;
  readonly floorLeft: Vec;
  readonly floorRight: Vec;
  readonly floorMid: Vec;
}

function buildProfile(proj: Projection, slice: DeskLiquiditySlice, v: number, maxDepth: number, win: ViewWindow): Profile {
  const m = win.end - win.first;
  const heights: number[] = [];
  const known: boolean[] = [];
  for (let j = 0; j < m; j += 1) {
    const i = win.first + j;
    const ok = binKnown(slice, i);
    const b = slice.bins[i];
    known.push(ok);
    heights.push(ok && maxDepth > 0 && Number.isFinite(b) ? Math.max(0, b) / maxDepth : 0);
  }
  const all: Vec[] = heights.map((h, j) => proj.project((j + 0.5) / m, v, h));
  const hMid = m % 2 === 1 ? heights[(m - 1) / 2] : (heights[m / 2 - 1] + heights[m / 2]) / 2;
  const mid = proj.project(0.5, v, hMid);
  const bid: Run = { pts: [], known: [] };
  const ask: Run = { pts: [], known: [] };
  for (let j = 0; j < m; j += 1) {
    const side = binSide(j, m);
    if (side === "bid") {
      bid.pts.push(all[j]);
      bid.known.push(known[j]);
    } else if (side === "ask") {
      ask.pts.push(all[j]);
      ask.known.push(known[j]);
    }
  }
  // The shared point on the mid line takes the knownness of the bin next to it.
  const midBinKnown = m % 2 === 1 ? known[(m - 1) / 2] : true;
  bid.pts.push(mid);
  bid.known.push(bid.known.length ? bid.known[bid.known.length - 1] && midBinKnown : midBinKnown);
  ask.pts.unshift(mid);
  ask.known.unshift(ask.known.length ? ask.known[0] && midBinKnown : midBinKnown);
  return {
    all,
    bid,
    ask,
    floorLeft: proj.project(0.5 / m, v, 0),
    floorRight: proj.project((m - 0.5) / m, v, 0),
    floorMid: proj.project(0.5, v, 0),
  };
}

function fillRidge(ctx: Ctx2DLike, pts: readonly Vec[], floorStart: Vec, floorEnd: Vec, style: string): void {
  ctx.beginPath();
  ctx.moveTo(floorStart.x, floorStart.y);
  ctx.lineTo(pts[0].x, pts[0].y);
  smoothThrough(ctx, pts);
  ctx.lineTo(floorEnd.x, floorEnd.y);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/** Strokes the top of a ridge: known stretches in the side color, unknown stretches dotted and grey. */
function strokeRidge(ctx: Ctx2DLike, run: Run, knownStyle: string, unknownStyle: string, width: number): void {
  const { pts, known } = run;
  let start = 0;
  while (start < pts.length - 1) {
    const segKnown = known[start] && known[start + 1];
    let stop = start + 1;
    while (stop < pts.length - 1 && (known[stop] && known[stop + 1]) === segKnown) stop += 1;
    const piece = pts.slice(start, stop + 1);
    ctx.beginPath();
    ctx.moveTo(piece[0].x, piece[0].y);
    smoothThrough(ctx, piece);
    ctx.strokeStyle = segKnown ? knownStyle : unknownStyle;
    ctx.lineWidth = segKnown ? width : 1;
    ctx.setLineDash(segKnown ? [] : [2, 3]);
    ctx.stroke();
    start = stop;
  }
  ctx.setLineDash([]);
}

/** Label for the ends of the price axis: "-14 bps" and "+14 bps". */
export function halfSpanLabel(halfBps: number): string {
  const text = Number.isInteger(halfBps) ? String(halfBps) : fmtNumber(halfBps, 1);
  return `${text} bps`;
}

/**
 * Draws the wall back to front. Each slice is first filled opaque with the well color, which hides
 * whatever sits behind it, then tinted by side and traced along its top, so older slices read as
 * ridges peeking over newer ones and fade into the distance.
 */
export function drawLiquiditySurface(ctx: Ctx2DLike, input: LiquidityInput): LiquidityStats {
  const { width, height, palette: p } = input;
  const windowS = input.windowS ?? DEPTH_WINDOW_S;
  const proj = makeProjection(width, height);
  const views = layoutSlices(input.slices, input.nowMs, windowS);
  const win = views.length ? viewWindow(views[views.length - 1].slice) : null;
  const maxDepth = win ? maxDepthOf(views, win) : 0;
  const { fl, fr, bl, br } = proj.corners;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.setLineDash([]);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Floor plane and its edges.
  ctx.beginPath();
  ctx.moveTo(fl.x, fl.y);
  ctx.lineTo(fr.x, fr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fillStyle = withAlpha(p.edge, 0.22);
  ctx.fill();
  ctx.strokeStyle = withAlpha(p.edgeStrong, 0.85);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  for (const u of [0.25, 0.75]) {
    const a = proj.project(u, 0, 0);
    const b = proj.project(u, 1, 0);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = withAlpha(p.edge, 0.9);
  ctx.stroke();

  // The wall, back to front.
  if (win) {
    views.forEach((view, order) => {
      const profile = buildProfile(proj, view.slice, view.v, maxDepth, win);
      const front = order === views.length - 1;

      fillRidge(ctx, profile.all, profile.floorLeft, profile.floorRight, p.well);
      if (profile.bid.pts.length >= 2) {
        fillRidge(ctx, profile.bid.pts, profile.floorLeft, profile.floorMid, withAlpha(p.buy, 0.34 * view.fade + 0.03));
      }
      if (profile.ask.pts.length >= 2) {
        fillRidge(ctx, profile.ask.pts, profile.floorMid, profile.floorRight, withAlpha(p.sell, 0.34 * view.fade + 0.03));
      }
      const lineWidth = front ? 1.6 : 1;
      const strokeAlpha = Math.max(0.1, 0.95 * view.fade);
      const unknown = withAlpha(p.ink3, Math.max(0.12, 0.7 * view.fade));
      if (profile.bid.pts.length >= 2) strokeRidge(ctx, profile.bid, withAlpha(p.buy, strokeAlpha), unknown, lineWidth);
      if (profile.ask.pts.length >= 2) strokeRidge(ctx, profile.ask, withAlpha(p.sell, strokeAlpha), unknown, lineWidth);
    });
  }

  // Mid line along the depth axis, on top so it stays readable through the walls.
  const midFront = proj.project(0.5, 0, 0);
  const midBack = proj.project(0.5, 1, 0);
  ctx.beginPath();
  ctx.moveTo(midFront.x, midFront.y);
  ctx.lineTo(midBack.x, midBack.y);
  ctx.strokeStyle = withAlpha(p.signal, 0.85);
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // Height ruler at the front left corner.
  if (maxDepth > 0) {
    const x = fl.x - 8;
    const top = proj.project(0, 0, 1);
    ctx.beginPath();
    ctx.moveTo(x, fl.y);
    ctx.lineTo(x, top.y);
    ctx.moveTo(x - 3, fl.y);
    ctx.lineTo(x, fl.y);
    ctx.moveTo(x - 3, top.y);
    ctx.lineTo(x, top.y);
    ctx.strokeStyle = withAlpha(p.ink4, 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = input.font;
    ctx.fillStyle = p.ink3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmtCompact(maxDepth), x - 6, top.y);
    ctx.fillText("0", x - 6, fl.y);
  }

  // Window label, top left, above the wall: how far from mid the book is known.
  if (win) {
    ctx.font = input.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.ink3;
    ctx.fillText(`Janela ${halfSpanLabel(win.halfBps)}${win.limited ? ", alcance do livro" : ""}`, 8, 11);
  }

  // Axis words along the front edge and the depth edge.
  const baseline = height - 8;
  ctx.font = input.font;
  ctx.textBaseline = "alphabetic";
  const roomy = width >= 380;
  const span = win ? halfSpanLabel(win.halfBps) : "";
  ctx.textAlign = "left";
  ctx.fillStyle = p.buy;
  ctx.fillText(roomy && win ? `Compra -${span}` : "Compra", fl.x, baseline);
  ctx.textAlign = "right";
  ctx.fillStyle = p.sell;
  ctx.fillText(roomy && win ? `+${span} Venda` : "Venda", fr.x, baseline);
  if (input.midPx !== null && Number.isFinite(input.midPx)) {
    ctx.textAlign = "center";
    ctx.fillStyle = p.signal;
    ctx.fillText(fmtNumber(input.midPx, input.midDecimals), midFront.x, baseline);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = p.ink3;
  ctx.fillText("agora", fr.x + 8, fr.y);
  ctx.fillText(`-${windowS} s`, br.x + 8, br.y);

  ctx.restore();
  return { drawn: views.length, maxDepth, window: win, projection: proj };
}
