/**
 * The walk-forward test of the learner (INT-3.5, ML-3, ML-4): the only evidence this module accepts for "the model knows something".
 *
 *  - Time only moves forward: the first part of the timeline is the first training set, the rest is cut into equal blocks of time and
 *    each block is predicted by a model trained on what came BEFORE it. A training row is used only if the window of its label (the
 *    horizon) and an embargo ended before the block starts (purge), so the label of a row never sees the block it is tested on.
 *  - Inside the training part the last slice of time is a validation block: it stops the trees early and fits the isotonic
 *    calibration, and the trading threshold is a quantile of ITS predictions; the test block never picks anything.
 *  - The economic test is a policy over every snapshot time: the model's "trade" (its net return after costs) when its calibrated
 *    probability is at or above the threshold, nothing otherwise. It is compared to zero and, paired on the same times, to simpler
 *    rules (always trade, the trend of one hour, the last break of structure, and a random choice at the same rate), with the
 *    Newey-West test of the lab (the horizons overlap) and the Holm correction over EVERY comparison of EVERY model.
 *  - The gate is strict and says why when it says no.
 *
 * Pure and deterministic.
 */
import { Rng } from "../../lab/rng";
import { calibrationReport, holmAdjust, meanTest } from "../../lab/stats";
import type { Dataset, Sample } from "./dataset";
import { predictGbdt, trainGbdt, type GbdtModel, type GbdtParams } from "./gbdt";
import { applyIsotonic, fitIsotonic, type Isotonic } from "./isotonic";
import { predictLogistic, trainLogistic, type LogisticModel } from "./logistic";
import { fitPrep, selectKept, standardize, widthOf, type Prep } from "./prep";

export type ModelKind = "logistic" | "gbdt";

export interface WalkOptions {
  readonly model: ModelKind;
  /** The label window, in ms (the horizon of the dataset). */
  readonly horizonMs: number;
  /** The distance in ms between two snapshots of the same instrument. */
  readonly stepMs: number;
  readonly folds?: number;
  readonly initialShare?: number;
  readonly embargoMs?: number;
  readonly validationShare?: number;
  readonly thresholdQuantile?: number;
  readonly minTrain?: number;
  readonly minValidation?: number;
  readonly l2?: number;
  readonly gbdt?: GbdtParams;
  readonly seed?: number;
}

export interface Prediction {
  readonly id: string;
  readonly instId: string;
  readonly t: number;
  readonly p: number;
  readonly tau: number;
  readonly net: number;
  readonly y: 0 | 1;
  readonly fold: number;
  readonly x: Float64Array;
}

export interface FoldInfo {
  readonly fold: number;
  readonly testFromMs: number;
  readonly testToMs: number;
  readonly trained: number;
  readonly validated: number;
  readonly tested: number;
  /** The latest snapshot time among the rows the model was fitted on, and among the validation rows: both end, with their labels, before the test block. */
  readonly fitUntilMs: number | null;
  readonly validationUntilMs: number | null;
  readonly skipped: string | null;
}

export interface WalkRun {
  readonly model: ModelKind;
  readonly folds: readonly FoldInfo[];
  readonly oos: readonly Prediction[];
}

const DEFAULTS = { folds: 5, initialShare: 0.4, validationShare: 0.2, thresholdQuantile: 0.8, minTrain: 200, minValidation: 50, l2: 20, seed: 1 } as const;

export const quantile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]!;

export interface Fitted {
  readonly prep: Prep;
  readonly model: LogisticModel | GbdtModel;
  readonly predict: (row: ArrayLike<number>) => number;
}

/** The raw probability of a fitted model for one full row of columns; plain data in, a function out (it is how a stored model is read back). */
export function predictorOf(prep: Prep, model: LogisticModel | GbdtModel): (row: ArrayLike<number>) => number {
  if (model.kind === "logistic") {
    const buffer = new Float64Array(widthOf(prep));
    return (row) => predictLogistic(model, standardize(prep, row, buffer));
  }
  const buffer = new Float64Array(prep.kept.length);
  return (row) => predictGbdt(model, selectKept(prep, row, buffer));
}

/** Trains one model on `fit` rows (the validation block only stops the trees early) and returns its raw probability function. */
export function fitModel(model: ModelKind, fit: readonly Sample[], validation: readonly Sample[], names: readonly string[], o: Pick<WalkOptions, "l2" | "gbdt" | "seed">): Fitted {
  const prep = fitPrep(fit.map((s) => s.x), names);
  const y = Uint8Array.from(fit.map((s) => s.y));
  if (model === "logistic") {
    const d = widthOf(prep);
    const x = new Float64Array(fit.length * d);
    fit.forEach((s, i) => standardize(prep, s.x, x.subarray(i * d, (i + 1) * d)));
    const m = trainLogistic(x, y, fit.length, d, { l2: o.l2 ?? DEFAULTS.l2 });
    return { prep, model: m, predict: predictorOf(prep, m) };
  }
  const p = prep.kept.length;
  const x = new Float64Array(fit.length * p);
  fit.forEach((s, i) => selectKept(prep, s.x, x.subarray(i * p, (i + 1) * p)));
  let valid: { x: Float64Array; y: Uint8Array; n: number } | null = null;
  if (validation.length > 0) {
    const vx = new Float64Array(validation.length * p);
    validation.forEach((s, i) => selectKept(prep, s.x, vx.subarray(i * p, (i + 1) * p)));
    valid = { x: vx, y: Uint8Array.from(validation.map((s) => s.y)), n: validation.length };
  }
  const m = trainGbdt(x, y, fit.length, p, valid, { seed: o.seed ?? DEFAULTS.seed, ...o.gbdt });
  return { prep, model: m, predict: predictorOf(prep, m) };
}

export function walkForward(dataset: Dataset, options: WalkOptions): WalkRun {
  const o = { ...DEFAULTS, ...options };
  const embargo = o.embargoMs ?? o.horizonMs;
  const samples = dataset.samples;
  const folds: FoldInfo[] = [];
  const oos: Prediction[] = [];
  if (samples.length === 0) return { model: o.model, folds, oos };
  const t0 = samples[0]!.t;
  const t1 = samples[samples.length - 1]!.t + 1;
  const a0 = t0 + o.initialShare * (t1 - t0);
  const width = (t1 - a0) / o.folds;

  for (let k = 0; k < o.folds; k += 1) {
    const from = a0 + k * width;
    const to = k === o.folds - 1 ? t1 : a0 + (k + 1) * width;
    const test = samples.filter((s) => s.t >= from && s.t < to);
    // purge: a training row's label window plus the embargo must be over before the test block starts
    const pool = samples.filter((s) => s.t + o.horizonMs + embargo <= from);
    const info = (skipped: string | null, trained = 0, validated = 0, fitUntil: number | null = null, validationUntil: number | null = null): FoldInfo => ({
      fold: k, testFromMs: from, testToMs: to, trained, validated, tested: test.length, fitUntilMs: fitUntil, validationUntilMs: validationUntil, skipped,
    });
    if (test.length === 0 || pool.length === 0) {
      folds.push(info(test.length === 0 ? "sem_teste" : "sem_treino"));
      continue;
    }
    const poolStart = pool[0]!.t;
    const poolEnd = pool[pool.length - 1]!.t;
    const cut = poolStart + (1 - o.validationShare) * (poolEnd - poolStart);
    const validation = pool.filter((s) => s.t >= cut);
    const fit = pool.filter((s) => s.t + o.horizonMs + embargo <= cut);
    if (fit.length < o.minTrain || validation.length < o.minValidation || fit.every((s) => s.y === fit[0]!.y)) {
      folds.push(info(fit.length < o.minTrain ? "treino_curto" : validation.length < o.minValidation ? "validacao_curta" : "treino_sem_variacao", fit.length, validation.length));
      continue;
    }
    const fitted = fitModel(o.model, fit, validation, dataset.names, o);
    const vRaw = validation.map((s) => fitted.predict(s.x));
    const iso: Isotonic = fitIsotonic(vRaw, validation.map((s) => s.y));
    const vCal = vRaw.map((p) => applyIsotonic(iso, p)).sort((a, b) => a - b);
    const tau = quantile(vCal, o.thresholdQuantile);
    for (const s of test) oos.push({ id: s.id, instId: s.instId, t: s.t, p: applyIsotonic(iso, fitted.predict(s.x)), tau, net: s.net, y: s.y, fold: k, x: s.x });
    folds.push(info(null, fit.length, validation.length, fit[fit.length - 1]!.t, validation[validation.length - 1]!.t));
  }
  oos.sort((a, b) => a.t - b.t || (a.instId < b.instId ? -1 : 1));
  return { model: o.model, folds, oos };
}

// ---------------------------------------------------------------------------------------------------------------------------------

export interface TestRow {
  readonly id: string;
  /** What is compared: "zero" or the baseline policy. */
  readonly versus: string;
  readonly n: number;
  readonly meanBps: number;
  readonly ci95Bps: readonly [number, number] | null;
  readonly effectiveSamples: number | null;
  readonly pOneSided: number;
  readonly pHolm: number;
}

export interface ModelEvaluation {
  readonly model: ModelKind;
  readonly folds: readonly FoldInfo[];
  readonly oosSamples: number;
  readonly trades: number;
  readonly tradeShare: number;
  readonly brier: number | null;
  readonly brierBase: number | null;
  readonly skill: number | null;
  readonly ece: number | null;
  readonly policyMeanBps: number | null;
  readonly tests: readonly TestRow[];
  readonly promoted: boolean;
  readonly reasons: readonly string[];
}

export const GATE = Object.freeze({ alpha: 0.05, minTrades: 30, minEffectiveSamples: 30, minSkill: 0, maxEce: 0.08 });

const BASELINES = ["sempre", "tendencia", "estrutura", "aleatorio"] as const;

function baselinePolicy(id: (typeof BASELINES)[number], side: Dataset["side"], names: readonly string[], rate: number): (p: Prediction, rng: Rng) => number {
  const at = (name: string): number => names.indexOf(name);
  const ema = at("trend.ema1h");
  const dir = at("smc15.breakDir");
  const age = at("smc15.breakAge");
  const want = side === "long" ? 1 : -1;
  switch (id) {
    case "sempre":
      return (p) => p.net;
    case "tendencia":
      return (p) => (p.x[ema] === want ? p.net : 0);
    case "estrutura":
      return (p) => (p.x[dir] === want && p.x[age]! <= 12 ? p.net : 0);
    case "aleatorio":
      return (p, rng) => (rng.next() < rate ? p.net : 0);
  }
}

/** One value per snapshot time (bucketed by the cadence): the mean over the instruments of what the policy returned, as a fraction. */
function series(oos: readonly Prediction[], stepMs: number, policy: (p: Prediction, rng: Rng) => number, rng: Rng): { keys: number[]; values: number[] } {
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const p of oos) {
    const key = Math.floor(p.t / stepMs);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += policy(p, rng) / 10_000;
    b.n += 1;
    buckets.set(key, b);
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  return { keys, values: keys.map((k) => buckets.get(k)!.sum / buckets.get(k)!.n) };
}

/** Everything the gate needs about ONE model's out-of-sample predictions, before the correction across models. */
function rawEvaluation(run: WalkRun, dataset: Dataset, o: WalkOptions): Omit<ModelEvaluation, "tests" | "promoted" | "reasons"> & { readonly rows: Omit<TestRow, "pHolm">[] } {
  const oos = run.oos;
  const trades = oos.filter((p) => p.p >= p.tau).length;
  const tradeShare = oos.length === 0 ? 0 : trades / oos.length;
  const overlap = Math.max(1, Math.round(o.horizonMs / o.stepMs));
  const report = oos.length === 0 ? null : calibrationReport(oos.map((p) => ({ p: Math.min(1, Math.max(0, p.p)), hit: p.y === 1 })));
  const ece = report === null ? null : report.reliability.reduce((s, b) => s + (b.n === 0 || b.meanPredicted === null || b.observedFrequency === null ? 0 : (b.n / report.n) * Math.abs(b.meanPredicted - b.observedFrequency)), 0);

  const model = series(oos, o.stepMs, (p) => (p.p >= p.tau ? p.net : 0), new Rng(1, "model"));
  const rows: Omit<TestRow, "pHolm">[] = [];
  const row = (versus: string, values: readonly number[]): void => {
    const t = values.length < 2 ? null : meanTest(values, overlap);
    rows.push({
      id: `${run.model}:${versus}`,
      versus,
      n: values.length,
      meanBps: t === null ? 0 : Math.round(t.mean * 1e5) / 10,
      ci95Bps: t?.ci95 == null ? null : [Math.round(t.ci95[0] * 1e5) / 10, Math.round(t.ci95[1] * 1e5) / 10],
      effectiveSamples: t?.effectiveSamples ?? null,
      pOneSided: t?.pOneSided ?? 1,
    });
  };
  row("zero", model.values);
  for (const id of BASELINES) {
    const base = series(oos, o.stepMs, baselinePolicy(id, dataset.side, dataset.names, tradeShare), new Rng(o.seed ?? 1, `baseline-${id}`));
    row(id, model.values.map((v, i) => v - base.values[i]!));
  }
  return {
    model: run.model,
    folds: run.folds,
    oosSamples: oos.length,
    trades,
    tradeShare,
    brier: report?.brier ?? null,
    brierBase: report?.brierBaseRate ?? null,
    skill: report?.skill ?? null,
    ece,
    policyMeanBps: rows[0]!.meanBps,
    rows,
  };
}

/**
 * The verdict over every model that was run: the Holm correction is over ALL the comparisons of ALL the models together, so trying
 * a second kind of model does not buy a second chance at the same threshold. Promoted means every criterion of the gate is met.
 * When several tables are judged (the long side and the short side, say), pass how many as `families`: the corrected p is multiplied by it.
 */
export function evaluate(runs: readonly WalkRun[], dataset: Dataset, options: Omit<WalkOptions, "model">, families = 1): ModelEvaluation[] {
  const raw = runs.map((run) => rawEvaluation(run, dataset, { ...options, model: run.model }));
  // `families` is how many independent tables (the two sides, for one) were judged: the adjusted p is multiplied by it (Bonferroni across them)
  const adjusted = holmAdjust(raw.flatMap((r) => r.rows.map((x) => Math.min(1, Math.max(0, x.pOneSided))))).map((p) => Math.min(1, p * families));
  let at = 0;
  return raw.map(({ rows, ...r }) => {
    const tests: TestRow[] = rows.map((x) => ({ ...x, pHolm: adjusted[at++]! }));
    const reasons: string[] = [];
    if (r.oosSamples === 0) reasons.push("sem_previsao_fora_da_amostra");
    if (r.trades < GATE.minTrades) reasons.push(`poucas_operacoes_${r.trades}`);
    const zero = tests[0]!;
    if ((zero.effectiveSamples ?? 0) < GATE.minEffectiveSamples) reasons.push(`amostra_efetiva_curta_${zero.effectiveSamples ?? 0}`);
    if (!(zero.meanBps > 0)) reasons.push("media_liquida_nao_positiva");
    for (const t of tests) if (!(t.pHolm < GATE.alpha)) reasons.push(`sem_prova_contra_${t.versus}`);
    if (r.skill === null || !(r.skill > GATE.minSkill)) reasons.push("sem_habilidade_de_probabilidade");
    if (r.ece === null || r.ece > GATE.maxEce) reasons.push("calibracao_ruim");
    return { ...r, tests, promoted: reasons.length === 0, reasons };
  });
}
