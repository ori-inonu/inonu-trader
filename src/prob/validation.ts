/**
 * Validação walk-forward com purga no tempo.
 *
 * Regra de ouro: o ajuste usa só o passado e a avaliação só o futuro. Como cada rótulo olha `horizonMs` para a frente,
 * uma linha de treino cujo rótulo ainda não tinha terminado quando o teste começou carrega informação do período de
 * teste. Essas linhas são PURGADAS (removidas do treino e contadas). O treino é expansivo: todo o passado purgado.
 *
 * Os blocos são cortados por contagem de linhas, mas nunca no meio de um instante repetido (linhas com o mesmo
 * instante ficam juntas). Dobras sem treino ou sem teste suficientes são devolvidas em `skipped`, com o motivo:
 * não se descarta nada em silêncio. Puro.
 */

export interface Fold {
  readonly index: number;
  /** Índices (das posições originais) de treino, já purgados. */
  readonly train: number[];
  readonly test: number[];
  readonly purged: number;
  readonly trainEndMs: number | null;
  readonly testStartMs: number;
  readonly testEndMs: number;
}

export interface SkippedFold {
  readonly index: number;
  readonly reason: "treino_insuficiente" | "teste_insuficiente";
  readonly train: number;
  readonly test: number;
  readonly purged: number;
}

export interface WalkForwardOptions {
  /** Número de dobras de teste; os dados são cortados em folds + 1 blocos (o primeiro só treina). */
  readonly folds: number;
  /** Quanto cada rótulo olha para a frente. */
  readonly horizonMs: number;
  /** Folga extra entre o fim do rótulo de treino e o início do teste. Padrão 0. */
  readonly embargoMs?: number;
  readonly minTrain: number;
  readonly minTest: number;
}

export interface WalkForward {
  readonly folds: Fold[];
  readonly skipped: SkippedFold[];
}

export function walkForwardFolds(times: readonly number[], options: WalkForwardOptions): WalkForward {
  const { folds, horizonMs, minTrain, minTest } = options;
  const embargo = options.embargoMs ?? 0;
  if (!Number.isInteger(folds) || folds < 1) throw new RangeError("folds deve ser um inteiro positivo");
  if (!(horizonMs >= 0) || !(embargo >= 0)) throw new RangeError("horizonte e folga não podem ser negativos");
  for (const t of times) if (!Number.isFinite(t)) throw new RangeError("instante não finito");
  const order = Array.from({ length: times.length }, (_, i) => i).sort((a, b) => (times[a] as number) - (times[b] as number) || a - b);
  const total = order.length;
  const chunks = folds + 1;
  // cortes por contagem, empurrados para a frente até caírem entre instantes distintos
  const cuts: number[] = [0];
  for (let k = 1; k < chunks; k += 1) {
    let cut = Math.round((k * total) / chunks);
    cut = Math.max(cut, cuts[cuts.length - 1] as number);
    while (cut > 0 && cut < total && (times[order[cut] as number] as number) === (times[order[cut - 1] as number] as number)) cut += 1;
    cuts.push(Math.min(cut, total));
  }
  cuts.push(total);
  const out: Fold[] = [];
  const skipped: SkippedFold[] = [];
  for (let k = 1; k <= folds; k += 1) {
    const testIdx = order.slice(cuts[k] as number, cuts[k + 1] as number);
    const past = order.slice(0, cuts[k] as number);
    if (testIdx.length === 0) {
      skipped.push({ index: k, reason: "teste_insuficiente", train: past.length, test: 0, purged: 0 });
      continue;
    }
    const testStart = times[testIdx[0] as number] as number;
    const testEnd = times[testIdx[testIdx.length - 1] as number] as number;
    const train = past.filter((i) => (times[i] as number) + horizonMs + embargo <= testStart);
    const purged = past.length - train.length;
    if (train.length < minTrain) {
      skipped.push({ index: k, reason: "treino_insuficiente", train: train.length, test: testIdx.length, purged });
      continue;
    }
    if (testIdx.length < minTest) {
      skipped.push({ index: k, reason: "teste_insuficiente", train: train.length, test: testIdx.length, purged });
      continue;
    }
    const trainEnd = train.reduce((m, i) => Math.max(m, times[i] as number), Number.NEGATIVE_INFINITY);
    out.push({ index: k, train, test: testIdx, purged, trainEndMs: train.length === 0 ? null : trainEnd, testStartMs: testStart, testEndMs: testEnd });
  }
  return { folds: out, skipped };
}

/**
 * Verificação independente de vazamento: em toda dobra, o último rótulo de treino termina antes do primeiro instante
 * de teste. Devolve a lista de violações (vazia = sem vazamento).
 */
export function lookaheadViolations(times: readonly number[], folds: readonly Fold[], horizonMs: number, embargoMs = 0): string[] {
  const problems: string[] = [];
  for (const fold of folds) {
    const testStart = Math.min(...fold.test.map((i) => times[i] as number));
    const trainSet = new Set(fold.train);
    for (const i of fold.test) if (trainSet.has(i)) problems.push(`dobra ${fold.index}: linha ${i} está no treino e no teste`);
    for (const i of fold.train) {
      if ((times[i] as number) + horizonMs + embargoMs > testStart) problems.push(`dobra ${fold.index}: o rótulo da linha ${i} termina depois do início do teste`);
    }
  }
  return problems;
}
