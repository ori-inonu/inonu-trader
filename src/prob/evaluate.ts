/**
 * Avaliação fora da amostra: walk-forward com purga, previsões empilhadas, métricas com intervalos por token e por
 * bloco de tempo, e o veredito. Puro.
 *
 * Regras que protegem contra autoengano:
 *  - o ajuste usa só linhas cujo rótulo terminou antes do início do teste (purga);
 *  - a referência do Brier skill é a taxa-base do TREINO de cada dobra, nunca a do teste;
 *  - previsões que o modelo recusa (null) ficam de fora, mas são contadas, e a referência é medida nas mesmas linhas;
 *  - o veredito usa o intervalo CONSERVADOR (a envoltória do bootstrap por token e por bloco de tempo) no nível
 *    corrigido para o número de comparações pré-registradas;
 *  - "sinal demonstrado" exige AUC acima de 0,5 e Brier skill acima de 0 nesse intervalo. Qualquer outro caso é
 *    "não demonstrado", "pior que a taxa-base" ou "inconclusivo": todos são resultados válidos.
 */

import { auc, brier, ece, logLoss, reliabilityTable, type ReliabilityBin } from "./scoring.ts";
import { doubleClusterCi } from "./intervals.ts";
import { walkForwardFolds, type SkippedFold } from "./validation.ts";

export interface Pred {
  readonly token: string;
  readonly block: string;
  readonly fold: number;
  readonly atMs: number;
  /** Probabilidade do modelo. */
  readonly p: number;
  /** Taxa-base do treino da dobra (a previsão constante de referência). */
  readonly pBase: number;
  readonly y: 0 | 1;
}

export interface IntervalReport {
  readonly estimate: number | null;
  readonly byToken: [number, number] | null;
  readonly byTime: [number, number] | null;
  /** Envoltória dos dois, a 95%. */
  readonly conservative: [number, number] | null;
  /** Envoltória no nível corrigido para o número de comparações. */
  readonly conservativeAdjusted: [number, number] | null;
  readonly tokens: number;
  readonly blocks: number;
  readonly reason: string | null;
}

export interface EvalSummary {
  readonly n: number;
  readonly abstained: number;
  readonly tokens: number;
  readonly positives: number;
  readonly baseRateTest: number | null;
  readonly baseRateTrain: number | null;
  readonly meanPrediction: number | null;
  readonly auc: IntervalReport;
  readonly brierSkill: IntervalReport;
  readonly brier: number | null;
  readonly brierReference: number | null;
  readonly logLoss: number | null;
  readonly ece: number | null;
  /** Intervalo do ECE por token e por bloco de tempo (o ECE é enviesado para cima em amostra pequena: leia junto com a tabela). */
  readonly eceInterval: IntervalReport;
  readonly reliability: ReliabilityBin[];
}

export type Verdict = "sinal_demonstrado" | "sinal_nao_demonstrado" | "pior_que_a_taxa_base" | "inconclusivo";

const eceStat = (rows: readonly Pred[]): number | null => (rows.length === 0 ? null : ece(rows.map((r) => r.p), rows.map((r) => r.y), 10));

export const aucStat = (rows: readonly Pred[]): number | null => (rows.length < 2 ? null : auc(rows.map((r) => r.p), rows.map((r) => r.y)));

export function skillStat(rows: readonly Pred[]): number | null {
  if (rows.length === 0) return null;
  let model = 0;
  let base = 0;
  for (const r of rows) {
    model += (r.p - r.y) * (r.p - r.y);
    base += (r.pBase - r.y) * (r.pBase - r.y);
  }
  return base > 0 ? 1 - model / base : null;
}

export interface EvalOptions {
  readonly seed: number;
  readonly resamples: number;
  /** Número de comparações pré-registradas, para o nível corrigido (Bonferroni). */
  readonly comparisons: number;
  readonly minRows?: number;
}

function intervalReport(preds: readonly Pred[], stat: (rows: readonly Pred[]) => number | null, options: EvalOptions, seedOffset: number): IntervalReport {
  const adjusted = 0.05 / Math.max(1, options.comparisons);
  const ci = doubleClusterCi(preds, (r) => r.token, (r) => r.block, stat, { resamples: options.resamples, seed: options.seed + seedOffset, extraAlphas: [adjusted] });
  const reasons = [ci.byToken.reason, ci.byTime.reason].filter((r): r is NonNullable<typeof r> => r !== null);
  return {
    estimate: ci.byToken.estimate,
    byToken: ci.byToken.lo === null || ci.byToken.hi === null ? null : [ci.byToken.lo, ci.byToken.hi],
    byTime: ci.byTime.lo === null || ci.byTime.hi === null ? null : [ci.byTime.lo, ci.byTime.hi],
    conservative: ci.conservative,
    conservativeAdjusted: ci.extra[0]?.conservative ?? null,
    tokens: ci.byToken.clusters,
    blocks: ci.byTime.clusters,
    reason: reasons.length === 0 ? null : reasons.join("+"),
  };
}

export function summarize(preds: readonly Pred[], abstained: number, options: EvalOptions): EvalSummary {
  const p = preds.map((r) => r.p);
  const y = preds.map((r) => r.y);
  const bases = preds.map((r) => r.pBase);
  const positives = y.reduce<number>((s, v) => s + v, 0);
  const brierModel = brier(p, y);
  const brierRef = brier(bases, y);
  return {
    n: preds.length,
    abstained,
    tokens: new Set(preds.map((r) => r.token)).size,
    positives,
    baseRateTest: preds.length === 0 ? null : positives / preds.length,
    baseRateTrain: preds.length === 0 ? null : bases.reduce((s, v) => s + v, 0) / preds.length,
    meanPrediction: preds.length === 0 ? null : p.reduce((s, v) => s + v, 0) / preds.length,
    auc: intervalReport(preds, aucStat, options, 1),
    brierSkill: intervalReport(preds, skillStat, options, 2),
    brier: brierModel,
    brierReference: brierRef,
    logLoss: logLoss(p, y),
    ece: ece(p, y, 10),
    eceInterval: intervalReport(preds, eceStat, options, 3),
    reliability: reliabilityTable(p, y, { bins: 10, minPerBin: 10 }),
  };
}

export function verdictOf(summary: EvalSummary, minRows = 100): Verdict {
  const aucCi = summary.auc.conservativeAdjusted;
  const skillCi = summary.brierSkill.conservativeAdjusted;
  if (summary.n < minRows || skillCi === null) return "inconclusivo";
  if (skillCi[1] < 0) return "pior_que_a_taxa_base";
  if (skillCi[0] > 0 && aucCi !== null && aucCi[0] > 0.5) return "sinal_demonstrado";
  return "sinal_nao_demonstrado";
}

/** O que o motor de predição devolve para as linhas de teste de uma dobra: null no vetor = abstém; null no todo = não ajustou. */
export type FitPredict = (trainIdx: readonly number[], testIdx: readonly number[]) => ReadonlyArray<number | null> | null;

export interface WalkForwardRun {
  readonly preds: Pred[];
  readonly abstained: number;
  readonly folds: Array<{ index: number; train: number; test: number; purged: number; fitted: boolean; trainBaseRate: number | null; testBaseRate: number | null }>;
  readonly skipped: SkippedFold[];
}

export interface WalkForwardInput {
  readonly times: readonly number[];
  readonly y: ReadonlyArray<0 | 1>;
  readonly tokens: readonly string[];
  readonly horizonMs: number;
  readonly folds: number;
  readonly minTrain: number;
  readonly minTest: number;
  readonly blockMs: number;
}

export function walkForwardRun(input: WalkForwardInput, fitPredict: FitPredict): WalkForwardRun {
  const wf = walkForwardFolds(input.times, { folds: input.folds, horizonMs: input.horizonMs, minTrain: input.minTrain, minTest: input.minTest });
  const preds: Pred[] = [];
  let abstained = 0;
  const foldInfo: WalkForwardRun["folds"] = [];
  for (const fold of wf.folds) {
    const trainRate = fold.train.reduce((s, i) => s + (input.y[i] as number), 0) / fold.train.length;
    const testRate = fold.test.reduce((s, i) => s + (input.y[i] as number), 0) / fold.test.length;
    const out = fitPredict(fold.train, fold.test);
    foldInfo.push({ index: fold.index, train: fold.train.length, test: fold.test.length, purged: fold.purged, fitted: out !== null, trainBaseRate: trainRate, testBaseRate: testRate });
    if (out === null) {
      abstained += fold.test.length;
      continue;
    }
    fold.test.forEach((i, k) => {
      const p = out[k];
      if (p === null || p === undefined || !Number.isFinite(p)) {
        abstained += 1;
        return;
      }
      const t = input.times[i] as number;
      preds.push({ token: input.tokens[i] as string, block: String(Math.floor(t / input.blockMs)), fold: fold.index, atMs: t, p: Math.min(1, Math.max(0, p)), pBase: trainRate, y: input.y[i] as 0 | 1 });
    });
  }
  return { preds, abstained, folds: foldInfo, skipped: wf.skipped };
}
