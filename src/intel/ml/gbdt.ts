/**
 * Small gradient boosted trees for a yes or no outcome (INT-3.3, ML-1): histogram splits (at most 32 bins per column, a bin of its
 * own for a missing value), Newton steps on the log loss, depth at most 3, a few hundred trees at most, early stopping on a block of
 * time the training never saw. Deterministic: the only randomness is the seeded sub-sampling of rows and columns, from the lab's
 * generator. Pure: no clock, no disk, no network.
 *
 * It is a learner for a few days of five minute snapshots, so it is kept small and regularised on purpose; the walk-forward test
 * around it decides whether it learned anything at all.
 */
import { Rng } from "../../lab/rng";
import { sigmoid } from "./logistic";

export interface GbdtParams {
  readonly maxDepth?: number;
  readonly maxTrees?: number;
  readonly learningRate?: number;
  readonly bins?: number;
  readonly minLeaf?: number;
  /** L2 on the leaf values. */
  readonly lambda?: number;
  /** The smallest gain a split must bring. */
  readonly gamma?: number;
  readonly rowSample?: number;
  readonly colSample?: number;
  /** Stop when the validation loss has not improved in this many trees. */
  readonly patience?: number;
  readonly seed?: number;
}

type Node = { readonly f: number; readonly b: number; readonly l: number; readonly r: number } | { readonly v: number };

export interface GbdtModel {
  readonly kind: "gbdt";
  readonly bias: number;
  /** Per column, the ascending thresholds of its bins (a value above k thresholds is in bin k + 1; bin 0 is a missing value). */
  readonly thresholds: readonly (readonly number[])[];
  readonly trees: readonly (readonly Node[])[];
  readonly bestIteration: number;
}

const DEFAULTS = { maxDepth: 3, maxTrees: 200, learningRate: 0.05, bins: 32, minLeaf: 50, lambda: 5, gamma: 0, rowSample: 0.8, colSample: 0.8, patience: 20, seed: 1 } as const;

function quantileThresholds(column: ArrayLike<number>, n: number, p: number, j: number, bins: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = column[i * p + j]!;
    if (Number.isFinite(v)) values.push(v);
  }
  values.sort((a, b) => a - b);
  const out: number[] = [];
  for (let q = 1; q < bins; q += 1) {
    const t = values[Math.min(values.length - 1, Math.floor((q * values.length) / bins))];
    if (t !== undefined && (out.length === 0 || t > out[out.length - 1]!)) out.push(t);
  }
  // a threshold equal to the largest value would leave the top bin empty
  while (out.length > 0 && values.length > 0 && out[out.length - 1]! >= values[values.length - 1]!) out.pop();
  return out;
}

const binOf = (value: number, thresholds: readonly number[]): number => {
  if (!Number.isFinite(value)) return 0;
  let lo = 0;
  let hi = thresholds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (value > thresholds[mid]!) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
};

/** `x` row major (n by p, a missing value is NaN); `y` 0 or 1. The validation block is used only to stop early. */
export function trainGbdt(
  x: Float64Array,
  y: Uint8Array,
  n: number,
  p: number,
  validation: { readonly x: Float64Array; readonly y: Uint8Array; readonly n: number } | null,
  params: GbdtParams = {},
): GbdtModel {
  if (x.length !== n * p || y.length !== n) throw new RangeError("x must be n by p and y must have n entries");
  if (n < 2) throw new RangeError("need at least two samples");
  const o = { ...DEFAULTS, ...params };
  const rng = new Rng(o.seed >>> 0, "gbdt");

  const thresholds = Array.from({ length: p }, (_, j) => quantileThresholds(x, n, p, j, o.bins));
  const binned = new Uint8Array(n * p);
  // the same bins, column major: the histogram of one column walks the rows in order, which is the cache friendly way
  const byColumn = new Uint8Array(n * p);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < p; j += 1) {
      const b = binOf(x[i * p + j]!, thresholds[j]!);
      binned[i * p + j] = b;
      byColumn[j * n + i] = b;
    }
  }
  const vBinned = validation === null ? null : new Uint8Array(validation.n * p);
  if (validation !== null && vBinned !== null) for (let i = 0; i < validation.n; i += 1) for (let j = 0; j < p; j += 1) vBinned[i * p + j] = binOf(validation.x[i * p + j]!, thresholds[j]!);

  let positives = 0;
  for (let i = 0; i < n; i += 1) positives += y[i]!;
  const rate = Math.min(1 - 1e-6, Math.max(1e-6, positives / n));
  const bias = Math.log(rate / (1 - rate));
  const score = new Float64Array(n).fill(bias);
  const vScore = validation === null ? null : new Float64Array(validation.n).fill(bias);

  const trees: Node[][] = [];
  let bestLoss = Infinity;
  let bestIteration = 0;
  const g = new Float64Array(n);
  const h = new Float64Array(n);
  const maxBins = o.bins + 2;

  for (let t = 0; t < o.maxTrees; t += 1) {
    for (let i = 0; i < n; i += 1) {
      const pr = sigmoid(score[i]!);
      g[i] = pr - y[i]!;
      h[i] = Math.max(pr * (1 - pr), 1e-9);
    }
    const rows: number[] = [];
    for (let i = 0; i < n; i += 1) if (o.rowSample >= 1 || rng.next() < o.rowSample) rows.push(i);
    const cols: number[] = [];
    for (let j = 0; j < p; j += 1) if (o.colSample >= 1 || rng.next() < o.colSample) cols.push(j);
    if (rows.length < 2 * o.minLeaf || cols.length === 0) break;

    const tree: Node[] = [];
    const grow = (members: number[], depth: number): number => {
      let G = 0;
      let H = 0;
      for (const i of members) {
        G += g[i]!;
        H += h[i]!;
      }
      const leaf = (): number => {
        tree.push({ v: (-G / (H + o.lambda)) * o.learningRate });
        return tree.length - 1;
      };
      if (depth >= o.maxDepth || members.length < 2 * o.minLeaf) return leaf();
      let best = { gain: o.gamma, f: -1, b: -1 };
      const parent = (G * G) / (H + o.lambda);
      for (const j of cols) {
        const hg = new Float64Array(maxBins);
        const hh = new Float64Array(maxBins);
        const hc = new Int32Array(maxBins);
        const base = j * n;
        for (let m = 0; m < members.length; m += 1) {
          const i = members[m]!;
          const b = byColumn[base + i]!;
          hg[b]! += g[i]!;
          hh[b]! += h[i]!;
          hc[b]! += 1;
        }
        let gl = 0;
        let hl = 0;
        let cl = 0;
        for (let b = 0; b <= thresholds[j]!.length; b += 1) {
          gl += hg[b]!;
          hl += hh[b]!;
          cl += hc[b]!;
          const cr = members.length - cl;
          if (cl < o.minLeaf || cr < o.minLeaf) continue;
          const gain = (gl * gl) / (hl + o.lambda) + ((G - gl) * (G - gl)) / (H - hl + o.lambda) - parent;
          if (gain > best.gain) best = { gain, f: j, b };
        }
      }
      if (best.f < 0) return leaf();
      const left: number[] = [];
      const right: number[] = [];
      const split = best.f * n;
      for (let m = 0; m < members.length; m += 1) {
        const i = members[m]!;
        (byColumn[split + i]! <= best.b ? left : right).push(i);
      }
      const at = tree.length;
      tree.push({ f: best.f, b: best.b, l: -1, r: -1 });
      const l = grow(left, depth + 1);
      const r = grow(right, depth + 1);
      tree[at] = { f: best.f, b: best.b, l, r };
      return at;
    };
    grow(rows, 0);
    trees.push(tree);

    const walk = (nodes: readonly Node[], row: Uint8Array, offset: number): number => {
      let k = 0;
      for (;;) {
        const node = nodes[k]!;
        if ("v" in node) return node.v;
        k = row[offset + node.f]! <= node.b ? node.l : node.r;
      }
    };
    for (let i = 0; i < n; i += 1) score[i]! += walk(tree, binned, i * p);

    if (validation !== null && vBinned !== null && vScore !== null) {
      let loss = 0;
      for (let i = 0; i < validation.n; i += 1) {
        vScore[i]! += walk(tree, vBinned, i * p);
        const pr = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(vScore[i]!)));
        loss -= validation.y[i]! === 1 ? Math.log(pr) : Math.log(1 - pr);
      }
      loss /= validation.n;
      if (loss < bestLoss - 1e-9) {
        bestLoss = loss;
        bestIteration = trees.length;
      } else if (trees.length - bestIteration >= o.patience) break;
    } else {
      bestIteration = trees.length;
    }
  }
  return { kind: "gbdt", bias, thresholds, trees: trees.slice(0, bestIteration), bestIteration };
}

function rawScoreGbdt(model: GbdtModel, row: ArrayLike<number>): number {
  let s = model.bias;
  for (const tree of model.trees) {
    let k = 0;
    for (;;) {
      const node = tree[k]!;
      if ("v" in node) {
        s += node.v;
        break;
      }
      k = binOf(row[node.f]!, model.thresholds[node.f]!) <= node.b ? node.l : node.r;
    }
  }
  return s;
}

export const predictGbdt = (model: GbdtModel, row: ArrayLike<number>): number => sigmoid(rawScoreGbdt(model, row));
