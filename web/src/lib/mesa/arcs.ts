export interface DonutSegment {
  /** Visible length of the arc along the circumference. */
  readonly length: number;
  /** Where the arc starts along the circumference. */
  readonly offset: number;
}

/**
 * Splits a ring into arcs proportional to the weights. Unknown, negative or non finite weights give no arcs at all:
 * a ring is drawn only from a complete, valid set of weights. Weights are normalized, never trusted to sum to one.
 */
export function donutSegments(weights: readonly (number | null)[], circumference: number, gap: number): DonutSegment[] {
  const none = weights.map(() => ({ length: 0, offset: 0 }));
  if (weights.some((w) => w === null || !Number.isFinite(w) || w < 0)) return none;
  const values = weights as readonly number[];
  const total = values.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) return none;
  let cursor = 0;
  return values.map((w) => {
    const span = (w / total) * circumference;
    const segment = { length: span > 0 ? Math.max(0, span - gap) : 0, offset: cursor };
    cursor += span;
    return segment;
  });
}
