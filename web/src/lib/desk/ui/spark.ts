/** Geometry for small line charts. Pure, so the watchlist and the flow panel share it and tests can check it. */

export type Point = readonly [number, number];

function finite(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

/**
 * Maps a series onto a w by h box, oldest at the left. A flat series sits on the middle line.
 * `pad` keeps the stroke inside the box. Fewer than 2 finite values return no points.
 */
export function sparkPoints(values: readonly number[], w: number, h: number, pad = 1): Point[] {
  const v = finite(values);
  if (v.length < 2 || w <= pad * 2 || h <= pad * 2) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  const range = hi - lo;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return v.map((x, i) => [
    pad + (i / (v.length - 1)) * innerW,
    range === 0 ? h / 2 : pad + (1 - (x - lo) / range) * innerH,
  ]);
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export function pointsToPath(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${fmt(x)} ${fmt(y)}`).join(" ");
}

/** Line path for the series, "" when there is not enough data. */
export function sparkPath(values: readonly number[], w: number, h: number, pad = 1): string {
  return pointsToPath(sparkPoints(values, w, h, pad));
}

/** Closed area path from the line down to the bottom edge, "" when there is not enough data. */
export function sparkArea(values: readonly number[], w: number, h: number, pad = 1): string {
  const pts = sparkPoints(values, w, h, pad);
  if (!pts.length) return "";
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${pointsToPath(pts)} L${fmt(last[0])} ${fmt(h)} L${fmt(first[0])} ${fmt(h)} Z`;
}

/** Running total of a series: [1, -2, 3] becomes [1, -1, 2]. */
export function cumulative(values: readonly number[]): number[] {
  let total = 0;
  return values.map((v) => {
    total += Number.isFinite(v) ? v : 0;
    return total;
  });
}

/** Y position of the zero line inside the same box, or null when zero is outside the series range. */
export function sparkZeroY(values: readonly number[], h: number, pad = 1): number | null {
  const v = finite(values);
  if (v.length < 2 || h <= pad * 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  if (lo > 0 || hi < 0 || hi === lo) return null;
  return pad + (1 - (0 - lo) / (hi - lo)) * (h - pad * 2);
}
