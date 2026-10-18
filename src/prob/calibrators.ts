/**
 * Calibradores de probabilidade: por faixas (com mínimo de amostras por faixa), isotônica (PAV) e Platt.
 *
 * Contrato comum: `fit*` recebe as probabilidades brutas e os desfechos 0/1 da JANELA DE AJUSTE e devolve um
 * calibrador, ou null quando a amostra não basta (sem as duas classes, ou abaixo do mínimo). `predict(p)` devolve a
 * probabilidade calibrada, ou null quando não há base para responder (faixa rala, entrada inválida). Nunca se inventa
 * um número para cobrir falta de dado: quem consome decide o que fazer com o null (abster-se é uma resposta válida).
 * Puro: nenhum desses ajustes lê relógio, disco ou aleatoriedade.
 */

import { quantileSorted } from "./intervals.ts";

export interface Calibrator {
  readonly kind: "faixas" | "isotonica" | "platt";
  /** Amostras usadas no ajuste. */
  readonly n: number;
  predict(p: number): number | null;
  /** Parâmetros ajustados, para o relatório. */
  describe(): Record<string, unknown>;
}

function validate(scores: readonly number[], y: readonly number[]): void {
  if (scores.length !== y.length) throw new RangeError("scores e y devem ter o mesmo tamanho");
  for (let i = 0; i < scores.length; i += 1) {
    const s = scores[i] as number;
    if (!(s >= 0 && s <= 1)) throw new RangeError("probabilidade fora de [0, 1] ou não finita");
    const yi = y[i] as number;
    if (yi !== 0 && yi !== 1) throw new RangeError("desfecho deve ser 0 ou 1");
  }
}

function bothClasses(y: readonly number[]): boolean {
  let positives = 0;
  for (const v of y) positives += v;
  return positives > 0 && positives < y.length;
}

// ---------------------------------------------------------------------------
// Por faixas
// ---------------------------------------------------------------------------

export interface BinnedOptions {
  /** Número de faixas por quantis dos escores de ajuste (ignorado se `edges` for dado). Padrão 5. */
  readonly bins?: number;
  /** Cortes explícitos, estritamente crescentes. Faixa i cobre (corte[i-1], corte[i]]. */
  readonly edges?: readonly number[];
  /** Faixa com menos amostras que isto devolve null. Padrão 20. */
  readonly minPerBin?: number;
  /** Pseudo-contagens em direção à taxa-base do ajuste. Padrão 0 (frequência crua). */
  readonly priorStrength?: number;
}

export function fitBinned(scores: readonly number[], y: readonly number[], options: BinnedOptions = {}): Calibrator | null {
  validate(scores, y);
  const minPerBin = options.minPerBin ?? 20;
  const prior = options.priorStrength ?? 0;
  if (scores.length === 0 || !bothClasses(y)) return null;
  let edges: number[];
  if (options.edges !== undefined) {
    edges = [...options.edges];
    for (let i = 1; i < edges.length; i += 1) if (!((edges[i] as number) > (edges[i - 1] as number))) throw new RangeError("cortes devem ser estritamente crescentes");
  } else {
    const bins = options.bins ?? 5;
    if (!Number.isInteger(bins) || bins < 1) throw new RangeError("bins deve ser um inteiro positivo");
    const sorted = [...scores].sort((a, b) => a - b);
    edges = [];
    for (let i = 1; i < bins; i += 1) {
      const e = quantileSorted(sorted, i / bins) as number;
      if (edges.length === 0 || e > (edges[edges.length - 1] as number)) edges.push(e);
    }
  }
  const slots = edges.length + 1;
  const counts = new Array<number>(slots).fill(0);
  const hits = new Array<number>(slots).fill(0);
  const binOf = (p: number): number => {
    let b = 0;
    while (b < edges.length && p > (edges[b] as number)) b += 1;
    return b;
  };
  let positives = 0;
  for (let i = 0; i < scores.length; i += 1) {
    const b = binOf(scores[i] as number);
    counts[b] = (counts[b] as number) + 1;
    hits[b] = (hits[b] as number) + (y[i] as number);
    positives += y[i] as number;
  }
  const base = positives / scores.length;
  return {
    kind: "faixas",
    n: scores.length,
    predict(p) {
      if (!(p >= 0 && p <= 1)) return null;
      const b = binOf(p);
      const n = counts[b] as number;
      if (n < minPerBin || n === 0) return null;
      return ((hits[b] as number) + prior * base) / (n + prior);
    },
    describe: () => ({ edges, counts, hits, minPerBin, priorStrength: prior, baseRate: base }),
  };
}

// ---------------------------------------------------------------------------
// Isotônica (pool adjacent violators)
// ---------------------------------------------------------------------------

interface Block {
  minScore: number;
  maxScore: number;
  weight: number;
  value: number;
}

export interface IsotonicOptions {
  /** Menos amostras que isto: sem calibrador. Padrão 30. */
  readonly minSamples?: number;
}

/**
 * Regressão isotônica crescente por PAV. Escores iguais são agrupados antes (um só ponto com peso). A previsão é
 * linear entre blocos vizinhos e constante nas pontas. Exige pelo menos dois escores distintos e as duas classes.
 */
export function fitIsotonic(scores: readonly number[], y: readonly number[], options: IsotonicOptions = {}): Calibrator | null {
  validate(scores, y);
  const minSamples = options.minSamples ?? 30;
  if (scores.length < minSamples || !bothClasses(y)) return null;
  const order = Array.from({ length: scores.length }, (_, i) => i).sort((a, b) => (scores[a] as number) - (scores[b] as number));
  const points: Block[] = [];
  for (const idx of order) {
    const s = scores[idx] as number;
    const last = points[points.length - 1];
    if (last !== undefined && last.maxScore === s) {
      last.value = (last.value * last.weight + (y[idx] as number)) / (last.weight + 1);
      last.weight += 1;
    } else points.push({ minScore: s, maxScore: s, weight: 1, value: y[idx] as number });
  }
  if (points.length < 2) return null;
  const stack: Block[] = [];
  for (const point of points) {
    stack.push({ ...point });
    while (stack.length >= 2 && (stack[stack.length - 2] as Block).value >= (stack[stack.length - 1] as Block).value) {
      const top = stack.pop() as Block;
      const below = stack[stack.length - 1] as Block;
      const weight = below.weight + top.weight;
      below.value = (below.value * below.weight + top.value * top.weight) / weight;
      below.weight = weight;
      below.maxScore = top.maxScore;
    }
  }
  const blocks = stack;
  return {
    kind: "isotonica",
    n: scores.length,
    predict(p) {
      if (!(p >= 0 && p <= 1)) return null;
      const first = blocks[0] as Block;
      const last = blocks[blocks.length - 1] as Block;
      if (p <= first.maxScore) return first.value;
      if (p >= last.minScore) return last.value;
      for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i] as Block;
        if (p >= b.minScore && p <= b.maxScore) return b.value;
        const next = blocks[i + 1];
        if (next !== undefined && p > b.maxScore && p < next.minScore) {
          const t = (p - b.maxScore) / (next.minScore - b.maxScore);
          return b.value + t * (next.value - b.value);
        }
      }
      return last.value;
    },
    describe: () => ({ blocks: blocks.map((b) => ({ minScore: b.minScore, maxScore: b.maxScore, weight: b.weight, value: b.value })) }),
  };
}

// ---------------------------------------------------------------------------
// Platt
// ---------------------------------------------------------------------------

export interface PlattOptions {
  /** Menos amostras que isto: sem calibrador. Padrão 30. */
  readonly minSamples?: number;
  readonly maxIter?: number;
}

const LOGIT_CLIP = 1e-4;
const logit = (p: number): number => {
  const q = Math.min(1 - LOGIT_CLIP, Math.max(LOGIT_CLIP, p));
  return Math.log(q / (1 - q));
};
const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/**
 * Platt: p' = sigmoid(a * logit(p) + b), ajustado por Newton com os alvos suavizados de Platt (evitam separação
 * perfeita em amostra pequena). Uma crista mínima em `a` mantém o sistema bem condicionado.
 */
export function fitPlatt(scores: readonly number[], y: readonly number[], options: PlattOptions = {}): Calibrator | null {
  validate(scores, y);
  const minSamples = options.minSamples ?? 30;
  const maxIter = options.maxIter ?? 100;
  if (scores.length < minSamples || !bothClasses(y)) return null;
  const n = scores.length;
  let n1 = 0;
  for (const v of y) n1 += v;
  const n0 = n - n1;
  const hi = (n1 + 1) / (n1 + 2);
  const lo = 1 / (n0 + 2);
  const x = scores.map(logit);
  const t = y.map((v) => (v === 1 ? hi : lo));
  const ridge = 1e-6;
  let a = 1;
  let b = Math.log((n1 + 1) / (n0 + 1));
  const loss = (aa: number, bb: number): number => {
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const z = aa * (x[i] as number) + bb;
      const ti = t[i] as number;
      sum += Math.max(z, 0) - z * ti + Math.log1p(Math.exp(-Math.abs(z)));
    }
    return sum + 0.5 * ridge * aa * aa;
  };
  let current = loss(a, b);
  for (let iter = 0; iter < maxIter; iter += 1) {
    let ga = ridge * a;
    let gb = 0;
    let haa = ridge;
    let hab = 0;
    let hbb = 0;
    for (let i = 0; i < n; i += 1) {
      const xi = x[i] as number;
      const p = sigmoid(a * xi + b);
      const r = p - (t[i] as number);
      const w = Math.max(p * (1 - p), 1e-12);
      ga += r * xi;
      gb += r;
      haa += w * xi * xi;
      hab += w * xi;
      hbb += w;
    }
    const det = haa * hbb - hab * hab;
    if (!(Math.abs(det) > 1e-18)) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    let step = 1;
    let improved = false;
    for (let h = 0; h < 30; h += 1) {
      const candidate = loss(a - step * da, b - step * db);
      if (candidate <= current + 1e-12) {
        a -= step * da;
        b -= step * db;
        improved = candidate < current - 1e-12;
        current = candidate;
        break;
      }
      step /= 2;
    }
    if (!improved || Math.max(Math.abs(da), Math.abs(db)) * step < 1e-9) break;
  }
  return {
    kind: "platt",
    n,
    predict(p) {
      if (!(p >= 0 && p <= 1)) return null;
      return sigmoid(a * logit(p) + b);
    },
    describe: () => ({ slope: a, intercept: b }),
  };
}
