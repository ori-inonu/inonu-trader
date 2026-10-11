/**
 * Semicircular gauge geometry. The angle runs from the left end (0 degrees, all sell) clockwise
 * over the top (90 degrees, balanced) to the right end (180 degrees, all buy), so the picture
 * reads the same way the numbers do: sell on the left, buy on the right.
 */

export function clampImbalance(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(-1, v));
}

/** -1 -> 0, 0 -> 90, 1 -> 180. */
export function imbalanceAngle(v: number): number {
  return (clampImbalance(v) + 1) * 90;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}

/** Point on the gauge circle at gauge angle `deg`. */
export function polar(cx: number, cy: number, r: number, deg: number): XY {
  const rad = (deg * Math.PI) / 180;
  return { x: cx - r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function n(v: number): string {
  return Number(v.toFixed(2)).toString();
}

/** SVG arc path along the gauge circle from `fromDeg` to `toDeg`, clockwise on screen. */
export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a = Math.min(fromDeg, toDeg);
  const b = Math.max(fromDeg, toDeg);
  const start = polar(cx, cy, r, a);
  const end = polar(cx, cy, r, b);
  const large = b - a > 180 ? 1 : 0;
  return `M${n(start.x)} ${n(start.y)} A${n(r)} ${n(r)} 0 ${large} 1 ${n(end.x)} ${n(end.y)}`;
}

/** The colored arc: from the balanced top point to the value. Empty string when the value is 0. */
export function valueArc(cx: number, cy: number, r: number, v: number): string {
  const deg = imbalanceAngle(v);
  if (Math.abs(deg - 90) < 0.05) return "";
  return arcPath(cx, cy, r, Math.min(deg, 90), Math.max(deg, 90));
}

/** A radial tick from radius r0 to r1 at gauge angle `deg`, as an SVG path. */
export function tickPath(cx: number, cy: number, r0: number, r1: number, deg: number): string {
  const a = polar(cx, cy, r0, deg);
  const b = polar(cx, cy, r1, deg);
  return `M${n(a.x)} ${n(a.y)} L${n(b.x)} ${n(b.y)}`;
}

/** Plain words for the state of the flow, never relying on color. */
export function flowWord(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "Indisponivel";
  if (v > 0.6) return "Compra forte";
  if (v > 0.15) return "Compra";
  if (v < -0.6) return "Venda forte";
  if (v < -0.15) return "Venda";
  return "Equilibrado";
}
