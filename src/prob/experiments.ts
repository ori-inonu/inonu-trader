/**
 * Lista versionada de experimentos probabilísticos. Cada experimento declara hipótese, método, resultado, veredito e
 * a próxima hipótese. Puro: recebe os conjuntos já montados e a semente.
 *
 * Alvo comum: P(o preço do candidato sobe pelo menos X bps no horizonte), com X = 30 como alvo principal (o mínimo
 * líquido do motor de decisão) e X = 0 e 100 como sensibilidade. O retorno é bruto de custo: a conta de duas pernas do
 * motor (dezenas de bps) vem depois e só piora o quadro.
 *
 * Comparações pré-registradas (entram na correção de Bonferroni do veredito): {jev_bruto, jev_platt,
 * brief_logistica, brief_mais_jev_logistica} nos horizontes 15 min e 1 h, e placar_logistica em 15 min, 1 h e 4 h,
 * todas com X = 30. Tudo o mais é secundário e descritivo.
 */

import { fitBinned, fitIsotonic, fitPlatt, type Calibrator } from "./calibrators.ts";
import type { BriefItemRow, ClosingRow, HorizonId, LabeledBriefRow, ScoreRow } from "./dataset.ts";
import { HORIZONS, THRESHOLDS_BPS, upLabel } from "./dataset.ts";
import { summarize, verdictOf, walkForwardRun, type EvalSummary, type FitPredict, type Verdict, type WalkForwardRun } from "./evaluate.ts";
import { BRIEF_FEATURES, JEV_FEATURES, SCORE_FEATURES, featureNames, featureRow, type FeatureDef } from "./features.ts";
import { doubleClusterCi, wilson } from "./intervals.ts";
import { fitLogistic } from "./logistic.ts";
import { deriveSeed } from "./rng.ts";
import { auc, spearman } from "./scoring.ts";

export const EXPERIMENT_SUITE_VERSION = "prob-cycle-exp-v2";

export type ModelId = "taxa_base" | "jev_bruto" | "jev_platt" | "jev_isotonica" | "jev_faixas" | "brief_logistica" | "brief_mais_jev_logistica" | "placar_logistica";

export interface ExperimentInput {
  readonly briefs: readonly LabeledBriefRow[];
  readonly scoreRows: readonly ScoreRow[];
  readonly closings: readonly ClosingRow[];
  readonly seed: number;
  readonly resamples: number;
}

export interface Case {
  readonly horizonte: HorizonId;
  readonly limiarBps: number;
  readonly modelo: ModelId;
  readonly parametros?: Record<string, number | string>;
  readonly n: number;
  readonly abstencoes: number;
  readonly tokens: number;
  readonly dobras: number;
  readonly dobrasPuladas: ReadonlyArray<{ readonly indice: number; readonly motivo: string; readonly treino: number; readonly teste: number; readonly purgadas: number }>;
  readonly taxaBaseTeste: number | null;
  readonly taxaBaseTreino: number | null;
  readonly auc: EvalSummary["auc"] | null;
  readonly brierSkill: EvalSummary["brierSkill"] | null;
  readonly brier: number | null;
  readonly brierReferencia: number | null;
  readonly ece: number | null;
  readonly eceIntervalo: EvalSummary["eceInterval"] | null;
  readonly logLoss: number | null;
  readonly confiabilidade: EvalSummary["reliability"] | null;
  readonly primario: boolean;
  readonly veredito: Verdict | "descritivo";
}

export interface ExperimentRecord {
  readonly id: string;
  readonly versao: string;
  readonly hipotese: string;
  readonly metodo: string;
  readonly resultado: unknown;
  readonly veredito: Verdict | "descritivo";
  readonly proximaHipotese: string;
}

interface Table<R> {
  readonly rows: R[];
  readonly y: Array<0 | 1>;
  readonly times: number[];
  readonly tokens: string[];
}

const PRIMARY_COMPARISONS = 11;
const FOLDS = 4;
const BLOCK_BRIEFS_MS = 30 * 60_000;
const BLOCK_SCORE_MS = 2 * 60 * 60_000;

function briefTable(rows: readonly LabeledBriefRow[], horizon: HorizonId, threshold: number): Table<BriefItemRow> {
  const t: Table<BriefItemRow> = { rows: [], y: [], times: [], tokens: [] };
  for (const r of rows) {
    if (r.row.codeClosed || r.row.pBuy === null) continue;
    const y = upLabel(r.labels[horizon].retBps, threshold);
    if (y === null) continue;
    t.rows.push(r.row);
    t.y.push(y);
    t.times.push(r.row.atMs);
    t.tokens.push(r.row.tokenKey);
  }
  return t;
}

function scoreTable(rows: readonly ScoreRow[], horizon: HorizonId, threshold: number): Table<ScoreRow> {
  const t: Table<ScoreRow> = { rows: [], y: [], times: [], tokens: [] };
  for (const r of rows) {
    if (r.codeClosed) continue;
    const y = upLabel(r.retBps[horizon], threshold);
    if (y === null) continue;
    t.rows.push(r);
    t.y.push(y);
    t.times.push(r.atMs);
    t.tokens.push(r.tokenKey);
  }
  return t;
}

const horizonMs = (h: HorizonId): number => (HORIZONS.find((x) => x.id === h) as { ms: number }).ms;

/**
 * Ajusta e prevê com um calibrador sobre o pBuy do Jev; null no vetor = faixa sem base (abstém). Cada calibrador
 * ajustado é entregue a `onFit`, para o relatório mostrar o que foi aprendido (por exemplo a inclinação de Platt:
 * negativa quer dizer que pBuy maior acompanhou subida MENOR no período de ajuste).
 */
function calibratedFit(table: Table<BriefItemRow>, fit: (p: number[], y: number[]) => Calibrator | null, onFit?: (cal: Calibrator) => void): FitPredict {
  return (train, test) => {
    const cal = fit(train.map((i) => table.rows[i]!.pBuy as number), train.map((i) => table.y[i] as number));
    if (cal === null) return null;
    onFit?.(cal);
    return test.map((i) => cal.predict(table.rows[i]!.pBuy as number));
  };
}

function logisticFit<R>(table: Table<R>, defs: ReadonlyArray<FeatureDef<R>>, lambda: number): FitPredict {
  const names = featureNames(defs);
  return (train, test) => {
    const model = fitLogistic(train.map((i) => featureRow(defs, table.rows[i] as R)), train.map((i) => table.y[i] as number), names, { lambda });
    if (model === null) return null;
    return test.map((i) => model.predict(featureRow(defs, table.rows[i] as R)));
  };
}

function toCase<R>(
  table: Table<R>,
  horizon: HorizonId,
  threshold: number,
  model: ModelId,
  run: WalkForwardRun,
  options: { seed: number; resamples: number; primary: boolean; parameters?: Record<string, number | string>; blockMs: number },
): Case {
  const summary = summarize(run.preds, run.abstained, { seed: options.seed, resamples: options.resamples, comparisons: PRIMARY_COMPARISONS });
  const verdict = model === "taxa_base" ? "descritivo" : verdictOf(summary);
  return {
    horizonte: horizon,
    limiarBps: threshold,
    modelo: model,
    ...(options.parameters === undefined ? {} : { parametros: options.parameters }),
    n: summary.n,
    abstencoes: summary.abstained,
    tokens: summary.tokens,
    dobras: run.folds.filter((f) => f.fitted).length,
    dobrasPuladas: run.skipped.map((s) => ({ indice: s.index, motivo: s.reason, treino: s.train, teste: s.test, purgadas: s.purged })),
    taxaBaseTeste: summary.baseRateTest,
    taxaBaseTreino: summary.baseRateTrain,
    auc: model === "taxa_base" ? null : summary.auc,
    brierSkill: model === "taxa_base" ? null : summary.brierSkill,
    brier: summary.brier,
    brierReferencia: summary.brierReference,
    ece: summary.ece,
    eceIntervalo: model === "taxa_base" ? null : summary.eceInterval,
    logLoss: summary.logLoss,
    confiabilidade: model === "taxa_base" ? null : summary.reliability,
    primario: options.primary,
    veredito: verdict,
  };
}

function briefRun(table: Table<BriefItemRow>, horizon: HorizonId, fit: FitPredict): WalkForwardRun {
  return walkForwardRun({ times: table.times, y: table.y, tokens: table.tokens, horizonMs: horizonMs(horizon), folds: FOLDS, minTrain: 60, minTest: 40, blockMs: BLOCK_BRIEFS_MS }, fit);
}

function scoreRun(table: Table<ScoreRow>, horizon: HorizonId, fit: FitPredict): WalkForwardRun {
  return walkForwardRun({ times: table.times, y: table.y, tokens: table.tokens, horizonMs: horizonMs(horizon), folds: FOLDS, minTrain: 80, minTest: 50, blockMs: BLOCK_SCORE_MS }, fit);
}

/** Resumo de um veredito sobre vários casos: o pior caso não esconde o melhor, e o melhor não vira conclusão. */
function overallVerdict(cases: readonly Case[]): Verdict {
  const primary = cases.filter((c) => c.primario && c.modelo !== "taxa_base");
  if (primary.length === 0 || primary.every((c) => c.veredito === "inconclusivo")) return "inconclusivo";
  if (primary.some((c) => c.veredito === "sinal_demonstrado")) return "sinal_demonstrado";
  if (primary.every((c) => c.veredito === "pior_que_a_taxa_base" || c.veredito === "inconclusivo")) return "pior_que_a_taxa_base";
  return "sinal_nao_demonstrado";
}

// ---------------------------------------------------------------------------
// E01: taxa-base
// ---------------------------------------------------------------------------

function baseRateExperiment(input: ExperimentInput): ExperimentRecord {
  const rows: unknown[] = [];
  for (const h of HORIZONS) {
    for (const x of THRESHOLDS_BPS) {
      const t = briefTable(input.briefs, h.id, x);
      const hits = t.y.reduce<number>((s, v) => s + v, 0);
      const ci = doubleClusterCi(t.rows.map((r, i) => ({ token: t.tokens[i] as string, block: String(Math.floor((t.times[i] as number) / BLOCK_BRIEFS_MS)), y: t.y[i] as number })), (r) => r.token, (r) => r.block, (rs) => (rs.length === 0 ? null : rs.reduce((s, r) => s + r.y, 0) / rs.length), { resamples: input.resamples, seed: deriveSeed(input.seed, `E01-${h.id}-${x}`) });
      const run = briefRun(t, h.id, (train, test) => test.map(() => train.reduce((s, i) => s + (t.y[i] as number), 0) / train.length));
      rows.push({
        horizonte: h.id,
        limiarBps: x,
        n: t.y.length,
        tokens: new Set(t.tokens).size,
        taxaBase: t.y.length === 0 ? null : hits / t.y.length,
        wilsonSeLinhasFossemIndependentes: wilson(hits, t.y.length),
        icPorToken: ci.byToken.lo === null ? null : [ci.byToken.lo, ci.byToken.hi],
        icPorBlocoDeTempo: ci.byTime.lo === null ? null : [ci.byTime.lo, ci.byTime.hi],
        taxaBasePorDobra: run.folds.map((f) => ({ dobra: f.index, treino: f.trainBaseRate, teste: f.testBaseRate })),
      });
    }
  }
  return {
    id: "E01-taxa-base",
    versao: EXPERIMENT_SUITE_VERSION,
    hipotese: "A taxa-base de 'subiu pelo menos X bps' é estável o bastante entre a janela de ajuste e a de teste para servir de referência.",
    metodo: "Frequência de y por horizonte e limiar sobre as consultas rotuladas (rótulo exato, caminho de preço ou brief posterior), com Wilson (que supõe independência) e bootstrap por token e por bloco de 30 min; taxa de treino e de teste por dobra walk-forward.",
    resultado: rows,
    veredito: "descritivo",
    proximaHipotese: "Se a taxa-base derivar muito entre dobras, o Brier skill contra a taxa de treino mede deriva de mercado, não habilidade: condicionar a referência ao regime (BTC 1 h) com mais dias de dados.",
  };
}

// ---------------------------------------------------------------------------
// E02 e E03: Jev bruto e calibrado
// ---------------------------------------------------------------------------

function jevExperiments(input: ExperimentInput): ExperimentRecord[] {
  const rawCases: Case[] = [];
  const calCases: Case[] = [];
  for (const h of HORIZONS) {
    for (const x of THRESHOLDS_BPS) {
      const t = briefTable(input.briefs, h.id, x);
      const primary = x === 30 && h.id !== "4h";
      const seed = deriveSeed(input.seed, `E02-${h.id}-${x}`);
      const base = briefRun(t, h.id, (train, test) => test.map(() => train.reduce((s, i) => s + (t.y[i] as number), 0) / train.length));
      if (x === 30) rawCases.push(toCase(t, h.id, x, "taxa_base", base, { seed, resamples: input.resamples, primary: false, blockMs: BLOCK_BRIEFS_MS }));
      const raw = briefRun(t, h.id, (_train, test) => test.map((i) => t.rows[i]!.pBuy as number));
      rawCases.push(toCase(t, h.id, x, "jev_bruto", raw, { seed: seed + 1, resamples: input.resamples, primary, blockMs: BLOCK_BRIEFS_MS }));
      const slopes: number[] = [];
      const platt = briefRun(t, h.id, calibratedFit(t, (p, y) => fitPlatt(p, y, { minSamples: 40 }), (cal) => slopes.push(Math.round((cal.describe().slope as number) * 1000) / 1000)));
      calCases.push(toCase(t, h.id, x, "jev_platt", platt, { seed: seed + 2, resamples: input.resamples, primary, parameters: { inclinacaoPorDobra: slopes.join(";") }, blockMs: BLOCK_BRIEFS_MS }));
      if (x === 30) {
        const iso = briefRun(t, h.id, calibratedFit(t, (p, y) => fitIsotonic(p, y, { minSamples: 40 })));
        calCases.push(toCase(t, h.id, x, "jev_isotonica", iso, { seed: seed + 3, resamples: input.resamples, primary: false, blockMs: BLOCK_BRIEFS_MS }));
        const bins = briefRun(t, h.id, calibratedFit(t, (p, y) => fitBinned(p, y, { bins: 4, minPerBin: 20 })));
        calCases.push(toCase(t, h.id, x, "jev_faixas", bins, { seed: seed + 4, resamples: input.resamples, primary: false, blockMs: BLOCK_BRIEFS_MS }));
      }
    }
  }
  return [
    {
      id: "E02-jev-bruto",
      versao: EXPERIMENT_SUITE_VERSION,
      hipotese: "A probabilidade bruta de compra do Jev (soma das opções buy_*) ordena melhor que o acaso os candidatos que sobem pelo menos X bps, e vale como probabilidade dessa subida.",
      metodo: "walk-forward com purga (4 dobras, rótulo olhando o horizonte para a frente); AUC e Brier skill contra a taxa-base do treino nas linhas de teste; intervalos por token e por bloco de 30 min (envoltória), no nível de Bonferroni para as comparações pré-registradas. A legenda do brief diz que pBuy não é chance de lucro: espera-se Brier skill negativo e o AUC é o teste de ordenação.",
      resultado: rawCases,
      veredito: overallVerdict(rawCases),
      proximaHipotese: "Com mais dias (answers.jsonl e prices.jsonl gravados pelo agente), repetir por regime de mercado; se o AUC continuar em 0,5, o Jev não ordena por retorno de curto prazo e o uso dele deve ser como filtro de risco, não de entrada.",
    },
    {
      id: "E03-jev-calibrado",
      versao: EXPERIMENT_SUITE_VERSION,
      hipotese: "Recalibrar o pBuy do Jev com a janela anterior (Platt, isotônica, faixas) dá uma probabilidade melhor que a taxa-base para subidas de pelo menos X bps.",
      metodo: "Mesmo walk-forward do E02; o calibrador é ajustado só no treino purgado e aplicado ao teste. Platt é o principal (pré-registrado); isotônica e faixas (4 quantis, mínimo de 20 por faixa) são secundárias. Faixa sem amostra devolve null e a linha é contada como abstenção.",
      resultado: calCases,
      veredito: overallVerdict(calCases),
      proximaHipotese: "Calibrar contra o desfecho líquido de custo (retorno acima do custo de duas pernas) em vez de bruto, assim que houver fills e preços por token com carimbo de observação.",
    },
  ];
}

// ---------------------------------------------------------------------------
// E04 e E05: features estruturadas do brief
// ---------------------------------------------------------------------------

function structuredExperiments(input: ExperimentInput): ExperimentRecord[] {
  const d1: Case[] = [];
  const d2: Case[] = [];
  const allDefs = [...BRIEF_FEATURES, ...JEV_FEATURES];
  for (const h of HORIZONS) {
    for (const x of THRESHOLDS_BPS) {
      const t = briefTable(input.briefs, h.id, x);
      const primary = x === 30 && h.id !== "4h";
      const seed = deriveSeed(input.seed, `E04-${h.id}-${x}`);
      const lambdas = x === 30 && h.id !== "4h" ? [20, 2, 200] : [20];
      lambdas.forEach((lambda, k) => {
        const main = k === 0;
        const r1 = briefRun(t, h.id, logisticFit(t, BRIEF_FEATURES, lambda));
        d1.push(toCase(t, h.id, x, "brief_logistica", r1, { seed: seed + k, resamples: input.resamples, primary: primary && main, parameters: { lambda }, blockMs: BLOCK_BRIEFS_MS }));
        if (main) {
          const r2 = briefRun(t, h.id, logisticFit(t, allDefs, lambda));
          d2.push(toCase(t, h.id, x, "brief_mais_jev_logistica", r2, { seed: seed + 10, resamples: input.resamples, primary, parameters: { lambda }, blockMs: BLOCK_BRIEFS_MS }));
        }
      });
    }
  }
  return [
    {
      id: "E04-brief-estruturado",
      versao: EXPERIMENT_SUITE_VERSION,
      hipotese: "As features estruturadas do brief (momento r5/r15/r1, RSI, volume, holders, risco, liquidez, fluxo) preveem a subida de pelo menos X bps melhor que a taxa-base, sem usar nenhuma saída do Jev.",
      metodo: `Regressão logística L2 com padronização e indicador de ausente (${BRIEF_FEATURES.length} features; lambda 20 principal, 2 e 200 como sensibilidade), ajustada em walk-forward com purga; mesma avaliação do E02.`,
      resultado: d1,
      veredito: overallVerdict(d1),
      proximaHipotese: "Se houver sinal fraco, testar um modelo mais simples (3 a 5 features) pré-registrado antes de ver o teste; com poucos agrupamentos e janela curta, mais features podem aumentar o risco de ajuste ao ruido.",
    },
    {
      id: "E05-brief-mais-jev",
      versao: EXPERIMENT_SUITE_VERSION,
      hipotese: "Somar as saídas do Jev (pBuy e as seis facetas) às features do brief melhora a previsão em relação às features sozinhas.",
      metodo: "O mesmo modelo do E04 com as sete colunas do Jev; a comparação é entre E04 e E05 nas mesmas dobras.",
      resultado: d2,
      veredito: overallVerdict(d2),
      proximaHipotese: "Medir o ganho incremental do Jev sobre o momento puro com desfecho líquido e mais dias; sem ganho, o Jev não acrescenta informação de preço ao que o brief já traz.",
    },
  ];
}

// ---------------------------------------------------------------------------
// E06: placar em janela longa
// ---------------------------------------------------------------------------

function scoreboardExperiment(input: ExperimentInput): ExperimentRecord {
  const cases: Case[] = [];
  for (const h of HORIZONS) {
    for (const x of THRESHOLDS_BPS) {
      const t = scoreTable(input.scoreRows, h.id, x);
      const primary = x === 30;
      const seed = deriveSeed(input.seed, `E06-${h.id}-${x}`);
      if (x === 30) {
        const base = scoreRun(t, h.id, (train, test) => test.map(() => train.reduce((s, i) => s + (t.y[i] as number), 0) / train.length));
        cases.push(toCase(t, h.id, x, "taxa_base", base, { seed, resamples: input.resamples, primary: false, blockMs: BLOCK_SCORE_MS }));
      }
      const run = scoreRun(t, h.id, logisticFit(t, SCORE_FEATURES, 20));
      cases.push(toCase(t, h.id, x, "placar_logistica", run, { seed: seed + 1, resamples: input.resamples, primary, parameters: { lambda: 20 }, blockMs: BLOCK_SCORE_MS }));
    }
  }
  return {
    id: "E06-placar-longo",
    versao: EXPERIMENT_SUITE_VERSION,
    hipotese: "As facetas do Jev (seis julgamentos de 0 a 1), as famílias de evidência e a postura, gravadas no placar ao longo de ~3 dias e ~100 tokens, preveem a subida de pelo menos X bps melhor que a taxa-base.",
    metodo: "Candidatos de compra do placar (sem os fechados pelo código), rótulo exato (entrada e liquidação do placar), logística L2 em walk-forward com purga (4 dobras, blocos de 2 h). O placar é uma AMOSTRA: marca uma decisão de não agir por token, lado e postura por hora e limita as consultas de preço, então o resultado vale para essa amostra, não para o universo de candidatos.",
    resultado: cases,
    veredito: overallVerdict(cases),
    proximaHipotese: "Revisar contratos de answers.jsonl e prices.jsonl e cobertura de um futuro leitor, sem presumir observacao simultanea nem alterar os journals.",
  };
}

// ---------------------------------------------------------------------------
// E07: triagem univariada e E08: ordem entre pBuy e retorno
// ---------------------------------------------------------------------------

function screeningExperiment(input: ExperimentInput): ExperimentRecord {
  const horizon: HorizonId = "1h";
  const t = briefTable(input.briefs, horizon, 30);
  const defs = [...BRIEF_FEATURES, ...JEV_FEATURES];
  const adjustedAlpha = 0.05 / defs.length;
  const out: Array<{ feature: string; n: number; auc: number | null; ic: [number, number] | null; excluiMeio: boolean }> = [];
  for (const def of defs) {
    const items = t.rows.map((r, i) => ({ v: def.get(r), y: t.y[i] as number, token: t.tokens[i] as string, block: String(Math.floor((t.times[i] as number) / BLOCK_BRIEFS_MS)) })).filter((r): r is { v: number; y: number; token: string; block: string } => r.v !== null);
    const stat = (rs: readonly { v: number; y: number }[]): number | null => (rs.length < 2 ? null : auc(rs.map((r) => r.v), rs.map((r) => r.y)));
    const ci = doubleClusterCi(items, (r) => r.token, (r) => r.block, stat, { resamples: input.resamples, seed: deriveSeed(input.seed, `E07-${def.name}`), extraAlphas: [adjustedAlpha] });
    const adj = ci.extra[0]?.conservative ?? null;
    out.push({ feature: def.name, n: items.length, auc: ci.byToken.estimate, ic: adj, excluiMeio: adj !== null && (adj[0] > 0.5 || adj[1] < 0.5) });
  }
  out.sort((a, b) => Math.abs((b.auc ?? 0.5) - 0.5) - Math.abs((a.auc ?? 0.5) - 0.5));
  const hits = out.filter((o) => o.excluiMeio).length;
  return {
    id: "E07-triagem-univariada",
    versao: EXPERIMENT_SUITE_VERSION,
    hipotese: "Alguma feature isolada do brief ordena os candidatos por subida de pelo menos 30 bps em 1 h (AUC diferente de 0,5).",
    metodo: `AUC de cada uma das ${defs.length} features contra y (1 h, X = 30), sem ajuste de modelo, com intervalo conservador (envoltória por token e por bloco de 30 min) no nível de Bonferroni para ${defs.length} features. Exploratório: serve para escolher a próxima hipótese, não para concluir.`,
    resultado: { features: out.slice(0, 12), totalFeatures: defs.length, quantasExcluemMeio: hits, esperadoPorAcasoAoNivelAdotado: 0.05 },
    veredito: "descritivo",
    proximaHipotese: hits === 0 ? "Nenhuma feature isolada se separa de 0,5 neste volume de dados: repetir com mais dias antes de testar interações." : "Pré-registrar as features que se separaram e confirmá-las numa janela posterior, nunca na mesma.",
  };
}

function rankExperiment(input: ExperimentInput): ExperimentRecord {
  const rows: unknown[] = [];
  for (const h of HORIZONS) {
    const items = input.briefs.filter((r) => !r.row.codeClosed && r.row.pBuy !== null && r.labels[h.id].retBps !== null).map((r) => ({ p: r.row.pBuy as number, ret: r.labels[h.id].retBps as number, token: r.row.tokenKey, block: String(Math.floor(r.row.atMs / BLOCK_BRIEFS_MS)) }));
    const stat = (rs: readonly { p: number; ret: number }[]): number | null => spearman(rs.map((r) => r.p), rs.map((r) => r.ret));
    const ci = doubleClusterCi(items, (r) => r.token, (r) => r.block, stat, { resamples: input.resamples, seed: deriveSeed(input.seed, `E08-${h.id}`) });
    rows.push({ horizonte: h.id, n: items.length, tokens: new Set(items.map((i) => i.token)).size, spearman: ci.byToken.estimate, icPorToken: ci.byToken.lo === null ? null : [ci.byToken.lo, ci.byToken.hi], icPorBlocoDeTempo: ci.byTime.lo === null ? null : [ci.byTime.lo, ci.byTime.hi], conservador: ci.conservative });
  }
  return {
    id: "E08-ordem-pbuy-retorno",
    versao: EXPERIMENT_SUITE_VERSION,
    hipotese: "Candidatos com pBuy maior têm retorno futuro maior (correlação de postos de Spearman positiva).",
    metodo: "Spearman entre o pBuy e o retorno em bps (robusto às caudas pesadas), nas linhas rotuladas, sem ajuste de modelo; intervalos por token e por bloco de tempo. Sem correção para múltiplos horizontes: descritivo.",
    resultado: rows,
    veredito: "descritivo",
    proximaHipotese: "Se a correlação for ~0, descartar o pBuy como sinal de retorno e medir o poder dele sobre o risco (queda extrema, rug) em vez do retorno médio.",
  };
}

export function runExperiments(input: ExperimentInput): ExperimentRecord[] {
  return [baseRateExperiment(input), ...jevExperiments(input), ...structuredExperiments(input), scoreboardExperiment(input), screeningExperiment(input), rankExperiment(input)];
}
