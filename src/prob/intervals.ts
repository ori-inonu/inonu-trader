/**
 * Intervalos de confiança da biblioteca probabilística: Wilson para proporções e bootstrap POR AGRUPAMENTO (cluster
 * bootstrap). O agrupamento existe porque as amostras do agente são sobrepostas no tempo e dependentes por token: o
 * mesmo token aparece em dezenas de consultas seguidas, então a unidade de reamostragem é o token (ou um bloco de
 * tempo), nunca a linha. Reamostrar linhas daria intervalos curtos demais.
 * Puro: a semente vem de fora; nada de relógio, disco ou rede.
 */

import { createRng, randomInt } from "./rng.ts";

const Z95 = 1.959963984540054;

/** Intervalo de Wilson de 95% para uma proporção. Sem amostra (n = 0) devolve null, nunca um intervalo inventado. */
export function wilson(successes: number, n: number): [number, number] | null {
  if (!Number.isInteger(n) || !Number.isInteger(successes) || n < 0 || successes < 0 || successes > n) throw new RangeError("contagens inválidas");
  if (n === 0) return null;
  const p = successes / n;
  const z2 = Z95 * Z95;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Quantil com interpolação linear sobre um vetor JÁ ORDENADO em ordem crescente. Vetor vazio: null. */
export function quantileSorted(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (!(q >= 0 && q <= 1)) throw new RangeError("q deve estar entre 0 e 1");
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

/** Quantil de uma cópia ordenada dos valores finitos. */
export function quantile(values: readonly number[], q: number): number | null {
  return quantileSorted(values.filter(Number.isFinite).sort((a, b) => a - b), q);
}

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

export function mean(values: readonly number[]): number | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  let sum = 0;
  for (const v of finite) sum += v;
  return sum / finite.length;
}

export type NoIntervalReason = "poucos_agrupamentos" | "poucas_replicas_validas" | "sem_estimativa";

export interface BootstrapOptions {
  readonly resamples: number;
  readonly seed: number;
  /** Nível de erro total do intervalo bilateral. Padrão 0,05. */
  readonly alpha?: number;
  /** Menos agrupamentos que isto: sem intervalo. Padrão 3. */
  readonly minClusters?: number;
}

/** As réplicas de um bootstrap, ordenadas, para extrair intervalos de vários níveis do mesmo sorteio. */
export interface Draws {
  readonly estimate: number | null;
  readonly sorted: readonly number[];
  readonly clusters: number;
  readonly resamples: number;
  readonly reason: NoIntervalReason | null;
}

/**
 * Sorteia agrupamentos com reposição (o mesmo número de agrupamentos dos dados), junta as linhas deles e recalcula a
 * estatística. Sem agrupamentos suficientes, sem estimativa, ou com menos de 80% das réplicas válidas (a estatística
 * pode não existir numa réplica, como o AUC sem as duas classes), o sorteio é marcado com o motivo e não dá intervalo.
 */
export function clusterBootstrapDraws<R>(
  rows: readonly R[],
  clusterOf: (row: R) => string,
  statistic: (rows: readonly R[]) => number | null,
  options: Pick<BootstrapOptions, "resamples" | "seed" | "minClusters">,
): Draws {
  const minClusters = options.minClusters ?? 3;
  if (!Number.isInteger(options.resamples) || options.resamples < 1) throw new RangeError("resamples deve ser um inteiro positivo");
  const groups = new Map<string, R[]>();
  for (const row of rows) {
    const key = clusterOf(row);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [row]);
    else list.push(row);
  }
  const buckets = [...groups.values()];
  const estimate = rows.length === 0 ? null : statistic(rows);
  const base = { estimate, clusters: buckets.length, resamples: options.resamples };
  if (estimate === null) return { ...base, sorted: [], reason: "sem_estimativa" };
  if (buckets.length < minClusters) return { ...base, sorted: [], reason: "poucos_agrupamentos" };
  const rng = createRng(options.seed);
  const draws: number[] = [];
  for (let r = 0; r < options.resamples; r += 1) {
    const chosen: R[][] = [];
    let total = 0;
    for (let k = 0; k < buckets.length; k += 1) {
      const bucket = buckets[randomInt(rng, buckets.length)] as R[];
      chosen.push(bucket);
      total += bucket.length;
    }
    const sample = new Array<R>(total);
    let at = 0;
    for (const bucket of chosen) for (let i = 0; i < bucket.length; i += 1) sample[at++] = bucket[i] as R;
    const value = statistic(sample);
    if (value !== null && Number.isFinite(value)) draws.push(value);
  }
  draws.sort((a, b) => a - b);
  if (draws.length < 0.8 * options.resamples) return { ...base, sorted: draws, reason: "poucas_replicas_validas" };
  return { ...base, sorted: draws, reason: null };
}

/** Intervalo percentil de nível 1 - alpha a partir das réplicas; null se o sorteio não deu intervalo. */
export function intervalFromDraws(draws: Draws, alpha = 0.05): [number, number] | null {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError("alpha deve estar entre 0 e 1");
  if (draws.reason !== null) return null;
  const lo = quantileSorted(draws.sorted, alpha / 2);
  const hi = quantileSorted(draws.sorted, 1 - alpha / 2);
  return lo === null || hi === null ? null : [lo, hi];
}

export interface BootstrapResult {
  /** A estatística nos dados originais; null quando não se define. */
  readonly estimate: number | null;
  readonly lo: number | null;
  readonly hi: number | null;
  /** Número de agrupamentos (tokens ou blocos de tempo) nos dados. */
  readonly clusters: number;
  readonly resamples: number;
  /** Réplicas em que a estatística existia. */
  readonly valid: number;
  /** Por que não há intervalo, quando não há. */
  readonly reason: NoIntervalReason | null;
}

/** Bootstrap por agrupamento com um intervalo percentil. */
export function clusterBootstrap<R>(
  rows: readonly R[],
  clusterOf: (row: R) => string,
  statistic: (rows: readonly R[]) => number | null,
  options: BootstrapOptions,
): BootstrapResult {
  const alpha = options.alpha ?? 0.05;
  if (!(alpha > 0 && alpha < 1)) throw new RangeError("alpha deve estar entre 0 e 1");
  const draws = clusterBootstrapDraws(rows, clusterOf, statistic, options);
  const interval = intervalFromDraws(draws, alpha);
  return {
    estimate: draws.estimate,
    lo: interval === null ? null : interval[0],
    hi: interval === null ? null : interval[1],
    clusters: draws.clusters,
    resamples: draws.resamples,
    valid: draws.sorted.length,
    reason: draws.reason,
  };
}

export interface DoubleCi {
  readonly byToken: BootstrapResult;
  readonly byTime: BootstrapResult;
  /** Envoltória dos dois intervalos (o menor limite inferior e o maior superior); null se algum faltar. */
  readonly conservative: [number, number] | null;
  /** O mesmo, em níveis extras (por exemplo corrigido para várias comparações), do mesmo sorteio. */
  readonly extra: ReadonlyArray<{ readonly alpha: number; readonly conservative: [number, number] | null }>;
}

/**
 * Dois bootstraps: por token (dependência dentro do token) e por bloco de tempo (todos os tokens se movem com o mesmo
 * mercado, então linhas do mesmo bloco não são independentes). O intervalo conservador é a envoltória dos dois.
 */
export function doubleClusterCi<R>(
  rows: readonly R[],
  tokenOf: (row: R) => string,
  timeBlockOf: (row: R) => string,
  statistic: (rows: readonly R[]) => number | null,
  options: BootstrapOptions & { readonly extraAlphas?: readonly number[] },
): DoubleCi {
  const alpha = options.alpha ?? 0.05;
  const tokenDraws = clusterBootstrapDraws(rows, tokenOf, statistic, options);
  const timeDraws = clusterBootstrapDraws(rows, timeBlockOf, statistic, { ...options, seed: (options.seed ^ 0x9e3779b9) >>> 0 });
  const result = (draws: Draws): BootstrapResult => {
    const interval = intervalFromDraws(draws, alpha);
    return {
      estimate: draws.estimate,
      lo: interval === null ? null : interval[0],
      hi: interval === null ? null : interval[1],
      clusters: draws.clusters,
      resamples: draws.resamples,
      valid: draws.sorted.length,
      reason: draws.reason,
    };
  };
  const envelope = (a: number): [number, number] | null => {
    const t = intervalFromDraws(tokenDraws, a);
    const b = intervalFromDraws(timeDraws, a);
    return t === null || b === null ? null : [Math.min(t[0], b[0]), Math.max(t[1], b[1])];
  };
  return {
    byToken: result(tokenDraws),
    byTime: result(timeDraws),
    conservative: envelope(alpha),
    extra: (options.extraAlphas ?? []).map((a) => ({ alpha: a, conservative: envelope(a) })),
  };
}
