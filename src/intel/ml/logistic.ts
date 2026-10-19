/**
 * L2 regularised logistic regression by iteratively reweighted least squares (INT-3.2, ML-1). Deterministic: no randomness at all,
 * the same data gives the same coefficients on the same runtime. The intercept is not penalised. Pure.
 *
 * It is the honest baseline of the learner: a handful of coefficients that a person can read, trained on standardised columns.
 * A model that cannot beat the base rate with this much structure will not be rescued by a bigger one trained on the same few days.
 */
export interface LogisticModel {
  readonly kind: "logistic";
  /** Intercept first, then one coefficient per column. */
  readonly weights: readonly number[];
  readonly iterations: number;
  readonly converged: boolean;
}

export interface LogisticOptions {
  /** The L2 strength on the coefficients (not on the intercept), added to the diagonal of the sum over the samples. Default 1. */
  readonly l2?: number;
  readonly maxIterations?: number;
  readonly tolerance?: number;
}

const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
export { sigmoid };

/** Solves A x = b for a symmetric positive definite A by Cholesky; null when A is not positive definite. */
export function choleskySolve(a: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = a[i * n + j]!;
      for (let k = 0; k < j; k += 1) sum -= l[i * n + k]! * l[j * n + k]!;
      if (i === j) {
        if (!(sum > 1e-12)) return null;
        l[i * n + i] = Math.sqrt(sum);
      } else {
        l[i * n + j] = sum / l[j * n + j]!;
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = b[i]!;
    for (let k = 0; k < i; k += 1) sum -= l[i * n + k]! * y[k]!;
    y[i] = sum / l[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k += 1) sum -= l[k * n + i]! * x[k]!;
    x[i] = sum / l[i * n + i]!;
  }
  return x;
}

/** `x` is row major, `n` rows by `p` columns, with no intercept column; `y` is 0 or 1. */
export function trainLogistic(x: Float64Array, y: Uint8Array, n: number, p: number, options: LogisticOptions = {}): LogisticModel {
  if (x.length !== n * p || y.length !== n) throw new RangeError("x must be n by p and y must have n entries");
  if (n < 2) throw new RangeError("need at least two samples");
  const lambda = options.l2 ?? 1;
  const maxIterations = options.maxIterations ?? 50;
  const tolerance = options.tolerance ?? 1e-8;
  const d = p + 1;
  const w = new Float64Array(d);
  // start at the base rate so a column of zeros is the exact answer of an empty model
  let positives = 0;
  for (let i = 0; i < n; i += 1) positives += y[i]!;
  const rate = Math.min(1 - 1e-6, Math.max(1e-6, positives / n));
  w[0] = Math.log(rate / (1 - rate));

  let converged = false;
  let iterations = 0;
  const z = new Float64Array(n);
  for (; iterations < maxIterations; iterations += 1) {
    const grad = new Float64Array(d);
    const hess = new Float64Array(d * d);
    for (let i = 0; i < n; i += 1) {
      let s = w[0]!;
      for (let j = 0; j < p; j += 1) s += w[j + 1]! * x[i * p + j]!;
      z[i] = s;
      const prob = sigmoid(s);
      const weight = Math.max(prob * (1 - prob), 1e-9);
      const err = y[i]! - prob;
      grad[0]! += err;
      hess[0]! += weight;
      for (let j = 0; j < p; j += 1) {
        const xj = x[i * p + j]!;
        grad[j + 1]! += err * xj;
        hess[(j + 1) * d]! += weight * xj;
        hess[j + 1]! += weight * xj;
        for (let k = 0; k <= j; k += 1) {
          const v = weight * xj * x[i * p + k]!;
          hess[(j + 1) * d + k + 1]! += v;
          if (k !== j) hess[(k + 1) * d + j + 1]! += v;
        }
      }
    }
    for (let j = 1; j < d; j += 1) {
      grad[j]! -= lambda * w[j]!;
      hess[j * d + j]! += lambda;
    }
    hess[0]! += 1e-9;
    const step = choleskySolve(hess, grad, d);
    if (step === null) break;
    let largest = 0;
    for (let j = 0; j < d; j += 1) {
      w[j]! += step[j]!;
      largest = Math.max(largest, Math.abs(step[j]!));
    }
    if (largest < tolerance) {
      converged = true;
      iterations += 1;
      break;
    }
  }
  return { kind: "logistic", weights: Array.from(w), iterations, converged };
}

/** Probability that y is 1 for one row of `p` columns. */
export function predictLogistic(model: LogisticModel, row: ArrayLike<number>): number {
  let s = model.weights[0]!;
  for (let j = 1; j < model.weights.length; j += 1) s += model.weights[j]! * row[j - 1]!;
  return sigmoid(s);
}

const logitOf = (model: LogisticModel, row: ArrayLike<number>): number => {
  let s = model.weights[0]!;
  for (let j = 1; j < model.weights.length; j += 1) s += model.weights[j]! * row[j - 1]!;
  return s;
};
