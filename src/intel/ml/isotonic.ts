/**
 * Isotonic calibration by the pool adjacent violators algorithm (INT-3.4, ML-1): turns the score of a model into a frequency that
 * never goes down as the score goes up. Fitted on data the model did not train on. Pure and deterministic.
 */
export interface Isotonic {
  /** Block centres in score order, ascending, and the observed frequency of each. */
  readonly x: readonly number[];
  readonly y: readonly number[];
}

export function fitIsotonic(scores: readonly number[], labels: ArrayLike<number>): Isotonic {
  if (scores.length !== labels.length || scores.length === 0) throw new RangeError("scores and labels must have the same, non zero length");
  const order = scores.map((s, i) => i).sort((a, b) => scores[a]! - scores[b]! || a - b);
  interface Block { sumX: number; sumY: number; weight: number }
  const stack: Block[] = [];
  for (const i of order) {
    stack.push({ sumX: scores[i]!, sumY: labels[i]!, weight: 1 });
    // merge while the frequency of the previous block is not lower than the one that just arrived
    while (stack.length > 1) {
      const top = stack[stack.length - 1]!;
      const below = stack[stack.length - 2]!;
      if (below.sumY / below.weight <= top.sumY / top.weight) break;
      stack.splice(stack.length - 2, 2, { sumX: below.sumX + top.sumX, sumY: below.sumY + top.sumY, weight: below.weight + top.weight });
    }
  }
  return { x: stack.map((b) => b.sumX / b.weight), y: stack.map((b) => b.sumY / b.weight) };
}

/** The calibrated frequency of a score: linear between block centres, flat outside them. */
export function applyIsotonic(model: Isotonic, score: number): number {
  const { x, y } = model;
  if (x.length === 0) throw new RangeError("an empty calibration");
  if (score <= x[0]!) return y[0]!;
  if (score >= x[x.length - 1]!) return y[y.length - 1]!;
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid]! <= score) lo = mid;
    else hi = mid;
  }
  const span = x[hi]! - x[lo]!;
  return span === 0 ? y[lo]! : y[lo]! + ((y[hi]! - y[lo]!) * (score - x[lo]!)) / span;
}
