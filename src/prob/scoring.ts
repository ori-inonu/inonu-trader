/**
 * Regras de pontuação e discriminação da biblioteca probabilística: Brier, log loss, ECE, tabela de confiabilidade,
 * Brier skill contra a taxa-base e AUC. Tudo puro. Onde não há amostra suficiente o resultado é null: nunca um número
 * inventado e nunca zero no lugar de "não sei".
 *
 * Convenções: `p` são probabilidades em [0, 1] e `y` são desfechos 0 ou 1, na mesma ordem. Entrada fora do domínio é
 * erro de programação e lança RangeError (dado ruim deve ser filtrado antes, com a contagem do que foi descartado).
 */

import { wilson } from "./intervals.ts";

function check(p: readonly number[], y: readonly number[]): void {
  if (p.length !== y.length) throw new RangeError("p e y devem ter o mesmo tamanho");
  for (let i = 0; i < p.length; i += 1) {
    const pi = p[i] as number;
    const yi = y[i] as number;
    if (!(pi >= 0 && pi <= 1)) throw new RangeError("probabilidade fora de [0, 1] ou não finita");
    if (yi !== 0 && yi !== 1) throw new RangeError("desfecho deve ser 0 ou 1");
  }
}

/** Fração de desfechos 1. Sem dados: null. */
export function baseRate(y: readonly number[]): number | null {
  if (y.length === 0) return null;
  let sum = 0;
  for (const v of y) sum += v;
  return sum / y.length;
}

export function brier(p: readonly number[], y: readonly number[]): number | null {
  check(p, y);
  if (p.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < p.length; i += 1) {
    const d = (p[i] as number) - (y[i] as number);
    sum += d * d;
  }
  return sum / p.length;
}

/** Log loss em nats. A probabilidade é limitada a [eps, 1 - eps] para que 0 e 1 não deem infinito. */
export function logLoss(p: readonly number[], y: readonly number[], eps = 1e-12): number | null {
  check(p, y);
  if (p.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < p.length; i += 1) {
    const q = Math.min(1 - eps, Math.max(eps, p[i] as number));
    sum -= (y[i] as number) === 1 ? Math.log(q) : Math.log(1 - q);
  }
  return sum / p.length;
}

/**
 * Brier skill: 1 - Brier(modelo) / Brier(previsão constante `reference`). A referência é a taxa-base ESTIMADA ANTES
 * (na janela de ajuste), nunca a taxa da própria janela de avaliação, que seria olhar o futuro. Positivo: melhor que
 * a taxa-base. Null quando a referência acerta tudo (Brier zero) ou não há dados.
 */
export function brierSkill(p: readonly number[], y: readonly number[], reference: number): number | null {
  if (!(reference >= 0 && reference <= 1)) throw new RangeError("referência fora de [0, 1]");
  const model = brier(p, y);
  const base = brier(new Array<number>(p.length).fill(reference), y);
  if (model === null || base === null || !(base > 0)) return null;
  return 1 - model / base;
}

/**
 * AUC pela estatística de Mann-Whitney (probabilidade de um positivo ter escore maior que um negativo, com empate
 * valendo meio), o que equivale a posto médio nos empates: as probabilidades do Jev vêm arredondadas a duas casas e há
 * muitos empates. Null sem as duas classes. 0,5 é "sem discriminação".
 */
export function auc(scores: readonly number[], y: readonly number[]): number | null {
  if (scores.length !== y.length) throw new RangeError("scores e y devem ter o mesmo tamanho");
  const n = scores.length;
  let positives = 0;
  for (let i = 0; i < n; i += 1) {
    const yi = y[i] as number;
    if (yi !== 0 && yi !== 1) throw new RangeError("desfecho deve ser 0 ou 1");
    if (!Number.isFinite(scores[i] as number)) throw new RangeError("score não finito");
    positives += yi;
  }
  const negatives = n - positives;
  if (positives === 0 || negatives === 0) return null;
  // ordena só os negativos (ordenação numérica nativa) e conta, para cada positivo, quantos negativos ficam abaixo e empatados
  const neg = new Float64Array(negatives);
  let k = 0;
  for (let i = 0; i < n; i += 1) if ((y[i] as number) === 0) neg[k++] = scores[i] as number;
  neg.sort();
  let wins = 0;
  for (let i = 0; i < n; i += 1) {
    if ((y[i] as number) !== 1) continue;
    const s = scores[i] as number;
    let lo = 0;
    let hi = negatives;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((neg[mid] as number) < s) lo = mid + 1;
      else hi = mid;
    }
    const below = lo;
    hi = negatives;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((neg[mid] as number) <= s) lo = mid + 1;
      else hi = mid;
    }
    wins += below + 0.5 * (lo - below);
  }
  return wins / (positives * negatives);
}

export interface ReliabilityBin {
  readonly lower: number;
  readonly upper: number;
  readonly n: number;
  /** Probabilidade média prevista na faixa; null se a faixa está vazia. */
  readonly meanP: number | null;
  /** Frequência observada; null quando a faixa tem menos que `minPerBin` amostras. */
  readonly observed: number | null;
  readonly wilson: [number, number] | null;
  readonly sufficient: boolean;
}

export interface ReliabilityOptions {
  readonly bins?: number;
  /** Faixa com menos amostras que isto não informa frequência observada. Padrão 10. */
  readonly minPerBin?: number;
}

/** Tabela de confiabilidade em faixas de largura igual sobre [0, 1]. */
export function reliabilityTable(p: readonly number[], y: readonly number[], options: ReliabilityOptions = {}): ReliabilityBin[] {
  check(p, y);
  const bins = options.bins ?? 10;
  const minPerBin = options.minPerBin ?? 10;
  if (!Number.isInteger(bins) || bins < 1) throw new RangeError("bins deve ser um inteiro positivo");
  const sumP = new Array<number>(bins).fill(0);
  const hits = new Array<number>(bins).fill(0);
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < p.length; i += 1) {
    const b = Math.min(bins - 1, Math.floor((p[i] as number) * bins));
    sumP[b] = (sumP[b] as number) + (p[i] as number);
    hits[b] = (hits[b] as number) + (y[i] as number);
    counts[b] = (counts[b] as number) + 1;
  }
  return Array.from({ length: bins }, (_, b): ReliabilityBin => {
    const n = counts[b] as number;
    const sufficient = n >= minPerBin && n > 0;
    return {
      lower: b / bins,
      upper: (b + 1) / bins,
      n,
      meanP: n === 0 ? null : (sumP[b] as number) / n,
      observed: sufficient ? (hits[b] as number) / n : null,
      wilson: sufficient ? wilson(hits[b] as number, n) : null,
      sufficient,
    };
  });
}

/**
 * Erro de calibração esperado (ECE): média, ponderada pelo tamanho da faixa, de |frequência observada - probabilidade
 * média|. Usa todas as faixas não vazias (inclusive as ralas, que inflam o ECE em amostra pequena: leia junto com a
 * tabela). Null sem dados.
 */
export function ece(p: readonly number[], y: readonly number[], bins = 10): number | null {
  check(p, y);
  if (p.length === 0) return null;
  const sumP = new Array<number>(bins).fill(0);
  const hits = new Array<number>(bins).fill(0);
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < p.length; i += 1) {
    const b = Math.min(bins - 1, Math.floor((p[i] as number) * bins));
    sumP[b] = (sumP[b] as number) + (p[i] as number);
    hits[b] = (hits[b] as number) + (y[i] as number);
    counts[b] = (counts[b] as number) + 1;
  }
  let total = 0;
  for (let b = 0; b < bins; b += 1) {
    const n = counts[b] as number;
    if (n === 0) continue;
    total += n * Math.abs((hits[b] as number) / n - (sumP[b] as number) / n);
  }
  return total / p.length;
}

/** Correlação de Spearman (posto médio nos empates). Null com menos de 3 pares ou sem variação. */
export function spearman(x: readonly number[], y: readonly number[]): number | null {
  if (x.length !== y.length) throw new RangeError("x e y devem ter o mesmo tamanho");
  const n = x.length;
  if (n < 3) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += rx[i] as number;
    my += ry[i] as number;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = (rx[i] as number) - mx;
    const b = (ry[i] as number) - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  if (!(sxx > 0) || !(syy > 0)) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function ranks(values: readonly number[]): number[] {
  const n = values.length;
  for (const v of values) if (!Number.isFinite(v)) throw new RangeError("valor não finito");
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (values[a] as number) - (values[b] as number));
  const out = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && (values[order[j + 1] as number] as number) === (values[order[i] as number] as number)) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k] as number] = r;
    i = j + 1;
  }
  return out;
}
