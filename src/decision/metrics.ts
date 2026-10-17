/** Estatística descritiva pura, compartilhada pelo benchmark, pelo auditor de baseline e pela telemetria de latência. */

/** Percentil por nearest-rank sobre um vetor JÁ ORDENADO. `p` em [0,100]. Vetor vazio é erro de programação. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) throw new Error("percentil de série vazia");
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export const round = (x: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export interface Dist {
  readonly n: number;
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly mean: number;
  readonly max: number;
}

/** Resumo de uma série. Valores não finitos são descartados; sem nenhum valor, null (nunca zero inventado). */
export function dist(values: Iterable<number>, digits = 3): Dist | null {
  const sorted = Float64Array.from([...values].filter(Number.isFinite)).sort();
  if (sorted.length === 0) return null;
  let sum = 0;
  for (const v of sorted) sum += v;
  return {
    n: sorted.length,
    min: round(sorted[0]!, digits),
    p50: round(percentile(sorted, 50), digits),
    p95: round(percentile(sorted, 95), digits),
    p99: round(percentile(sorted, 99), digits),
    mean: round(sum / sorted.length, digits),
    max: round(sorted[sorted.length - 1]!, digits),
  };
}

export interface Drawdown {
  /** Maior queda de pico a vale, em % do pico. */
  readonly pct: number;
  readonly peak: number;
  readonly trough: number;
  readonly peakAtMs: number;
  readonly troughAtMs: number;
  /** Primeiro instante depois do vale em que a série voltou ao pico; null se não voltou. */
  readonly recoveredAtMs: number | null;
}

/** Drawdown máximo de uma série temporal de valores positivos, na ordem dada. Menos de 2 pontos: null. */
export function maxDrawdown(points: readonly { readonly atMs: number; readonly value: number }[]): Drawdown | null {
  const series = points.filter((p) => Number.isFinite(p.value) && p.value > 0);
  if (series.length < 2) return null;
  let peak = series[0]!;
  let best: { pct: number; peak: typeof peak; trough: typeof peak } = { pct: 0, peak, trough: peak };
  for (const point of series) {
    if (point.value > peak.value) peak = point;
    const pct = ((peak.value - point.value) / peak.value) * 100;
    if (pct > best.pct) best = { pct, peak, trough: point };
  }
  const recovered = series.find((p) => p.atMs > best.trough.atMs && p.value >= best.peak.value);
  return {
    pct: round(best.pct, 2),
    peak: best.peak.value,
    trough: best.trough.value,
    peakAtMs: best.peak.atMs,
    troughAtMs: best.trough.atMs,
    recoveredAtMs: best.pct === 0 ? null : (recovered?.atMs ?? null),
  };
}
