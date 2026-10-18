/**
 * Montagem do relatório do ciclo probabilístico. Pura: recebe os journals já lidos (listas de objetos) e devolve o
 * relatório. Quem lê os arquivos e grava o resultado é scripts/prob-cycle.ts.
 *
 * O relatorio projeta contagens e agregados. leaksIn procura identificadores conhecidos antes da gravacao.
 * Essa checagem nao e uma varredura de todo formato possivel de segredo.
 */

import {
  HORIZONS,
  barAgeMin,
  briefRowsFrom,
  buildLaterBriefIndex,
  buildPricePath,
  buildScoreboardIndex,
  closingRowsFrom,
  coverageOf,
  isRecord,
  labelBriefRows,
  labelRow,
  num,
  scoreRowsFrom,
  type BriefItemRow,
  type ClosingRow,
  type HorizonId,
  type LabelContext,
  type LabelSource,
  type LabeledBriefRow,
  type Row,
} from "./dataset.ts";
import { calibratedPolicy, phaseCostOf, repeatPolicy, thresholdPolicy, inTimeOrder, type PolicyResult } from "./early-exit.ts";
import { EXPERIMENT_SUITE_VERSION, runExperiments, type ExperimentRecord } from "./experiments.ts";
import { hesitationOf, secondLookOf } from "./hesitation.ts";
import { clusterBootstrap, median, wilson } from "./intervals.ts";
import { auditBriefFields, auditListFields, auditMeta, auditPriceConsistency, auditScoreboard, auditVerdicts, distOf, type FieldAudit } from "./quality.ts";
import { deriveSeed } from "./rng.ts";
import { spearman } from "./scoring.ts";

export const REPORT_VERSION = "prob-cycle-v2";
export const ACTIVE_JOURNALS = ["briefs", "scoreboard", "closings", "decisions-meta", "equity"] as const;
export const PRESENCE_ONLY_JOURNALS = ["answers", "prices", "fills"] as const;

export interface Journals {
  readonly briefs: readonly Row[];
  readonly scoreboard: readonly Row[];
  readonly closings: readonly Row[];
  readonly decisionsMeta: readonly Row[];
  readonly equity: readonly Row[];
  /** Linhas e linhas malformadas de cada arquivo; null = arquivo ausente; contagens null = só a presença foi checada. */
  readonly files: Readonly<Record<string, { readonly lines: number | null; readonly malformed: number | null } | null>>;
}

export interface ReportOptions {
  readonly seed: number;
  readonly resamples: number;
  /** Relógio de fora: só entra como carimbo do relatório. Nenhum cálculo usa o relógio. */
  readonly nowMs: number;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const round = (v: number | null, digits = 4): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);

function span(times: readonly number[]): { fromMs: number | null; toMs: number | null; hours: number | null } {
  const finite = times.filter(Number.isFinite);
  if (finite.length === 0) return { fromMs: null, toMs: null, hours: null };
  const from = Math.min(...finite);
  const to = Math.max(...finite);
  return { fromMs: from, toMs: to, hours: round((to - from) / HOUR_MS, 2) };
}

// ---------------------------------------------------------------------------
// Concordância entre fontes de rótulo
// ---------------------------------------------------------------------------

export interface AgreementCell {
  readonly horizonte: HorizonId;
  readonly fontes: readonly [LabelSource, LabelSource];
  readonly n: number;
  readonly mesmoSinal: number | null;
  readonly mesmoSinalWilson: [number, number] | null;
  readonly spearman: number | null;
  readonly medianaDiferencaAbsolutaBps: number | null;
}

export function agreementOf(labeled: readonly LabeledBriefRow[]): AgreementCell[] {
  const out: AgreementCell[] = [];
  const pairs: Array<readonly [LabelSource, LabelSource]> = [
    ["scoreboard_exato", "caminho_de_preco"],
    ["scoreboard_exato", "brief_posterior"],
    ["caminho_de_preco", "brief_posterior"],
  ];
  for (const h of HORIZONS) {
    for (const [a, b] of pairs) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const r of labeled) {
        const x = r.labels[h.id].bySource[a];
        const y = r.labels[h.id].bySource[b];
        if (x !== undefined && y !== undefined) {
          xs.push(x);
          ys.push(y);
        }
      }
      const same = xs.filter((x, i) => Math.sign(x) === Math.sign(ys[i] as number)).length;
      out.push({
        horizonte: h.id,
        fontes: [a, b],
        n: xs.length,
        mesmoSinal: xs.length === 0 ? null : round(same / xs.length),
        mesmoSinalWilson: xs.length === 0 ? null : (wilson(same, xs.length) as [number, number]),
        spearman: round(spearman(xs, ys)),
        medianaDiferencaAbsolutaBps: round(median(xs.map((x, i) => Math.abs(x - (ys[i] as number)))), 1),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contexto de mercado (campos compartilhados por todos os candidatos de uma consulta)
// ---------------------------------------------------------------------------

function auditContext(briefs: readonly Row[]): Array<{ campo: string; consultas: number; nulos: number; iguaisAConsultaAnterior: number | null }> {
  const ordered = [...briefs].filter((b) => num(b.atMs) !== null).sort((a, b) => (a.atMs as number) - (b.atMs as number));
  return ["btc_1h", "btc_4h", "btc_24h", "eth_24h", "fund_btc_bps", "oi_btc_1h"].map((campo) => {
    let nulls = 0;
    let pairs = 0;
    let same = 0;
    let prev: number | null | undefined;
    for (const b of ordered) {
      const ctx = isRecord(b.contexto) ? b.contexto : null;
      const v = ctx === null ? null : num(ctx[campo]);
      if (v === null) nulls += 1;
      if (prev !== undefined && v !== null && prev !== null) {
        pairs += 1;
        if (v === prev) same += 1;
      }
      prev = v;
    }
    return { campo, consultas: ordered.length, nulos: nulls, iguaisAConsultaAnterior: pairs === 0 ? null : round(same / pairs) };
  });
}

// ---------------------------------------------------------------------------
// Fechamentos
// ---------------------------------------------------------------------------

function auditClosingsData(closings: readonly ClosingRow[], raw: readonly Row[], briefRows: readonly BriefItemRow[]) {
  const reasons: Record<string, number> = {};
  for (const c of closings) {
    const k = c.wouldReason === null ? "sem_motivo" : ["resposta_do_jev", "reserva_para_primarias"].includes(c.wouldReason) ? c.wouldReason : "outro_motivo";
    reasons[k] = (reasons[k] ?? 0) + 1;
  }
  const byKey = new Map(briefRows.map((r) => [`${r.cycleId}|${r.candidateId}`, r]));
  let compared = 0;
  let differsFromSum = 0;
  let equalsBuyTenth = 0;
  for (const c of closings) {
    const b = byKey.get(`${c.cycleId}|${c.candidateId}`);
    if (b === undefined || c.firstP === null || b.pBuy === null || b.pBuyTenth === null) continue;
    compared += 1;
    if (Math.abs(c.firstP - b.pBuy) > 0.02) differsFromSum += 1;
    if (Math.abs(c.firstP - b.pBuyTenth) <= 0.011) equalsBuyTenth += 1;
  }
  const tokens = new Map<string, number>();
  for (const c of closings) tokens.set(c.tokenKey, (tokens.get(c.tokenKey) ?? 0) + 1);
  const sorted = [...tokens.values()].sort((a, b) => b - a);
  const withBrief = raw.filter((r) => isRecord(r.brief)).length;
  return {
    total: closings.length,
    comCotacao: closings.filter((c) => c.quoted).length,
    comSegundaResposta: closings.filter((c) => c.secondBuy !== null).length,
    semGastoPorMotivo: reasons,
    fechamentosPorToken: { tokens: tokens.size, maiorToken: sorted[0] ?? 0, maiorTokenParte: closings.length === 0 ? null : round((sorted[0] ?? 0) / closings.length), tresMaiores: sorted.slice(0, 3) },
    comBriefGravado: withBrief,
    pBuyDoFechamentoContraConsultaOriginal: { comparados: compared, diferemDaSomaDeBuy: differsFromSum, igualAProbabilidadeDeBuyTenth: equalsBuyTenth },
    janela: span(closings.map((c) => c.atMs)),
  };
}

// ---------------------------------------------------------------------------
// Achados e correções
// ---------------------------------------------------------------------------

export interface Finding {
  readonly id: string;
  readonly severidade: "alta" | "media" | "baixa";
  readonly achado: string;
  readonly numeros: Record<string, number | string | null>;
  readonly correcao: string;
}

const pct = (v: number | null): string => (v === null ? "n/d" : `${(v * 100).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export interface ProbReport {
  readonly leitura: { readonly cobertura: "parcial"; readonly journalsAtivos: typeof ACTIVE_JOURNALS; readonly somentePresenca: typeof PRESENCE_ONLY_JOURNALS; readonly segmentosRotacionados: "nao_lidos" };
  readonly versao: string;
  readonly suiteDeExperimentos: string;
  readonly geradoEmMs: number;
  readonly semente: number;
  readonly resamples: number;
  readonly entradas: Journals["files"];
  readonly janela: Record<string, ReturnType<typeof span>>;
  readonly qualidade: Record<string, unknown>;
  readonly conjunto: Record<string, unknown>;
  readonly experimentos: ExperimentRecord[];
  readonly hesitacao: Record<string, unknown>;
  readonly saidaAntecipada: Record<string, unknown>;
  readonly achados: Finding[];
  readonly limites: string[];
  readonly backlog: string[];
}

const POLICY_THETAS = [0.4, 0.45, 0.5, 0.55];
const COOLDOWNS_MIN = [5, 15, 30, 60];

export function buildReport(journals: Journals, options: ReportOptions): ProbReport {
  const { seed, resamples } = options;
  const briefRows = briefRowsFrom(journals.briefs);
  const labeled = labelBriefRows(briefRows, journals.scoreboard, journals.equity);
  const scoreRows = scoreRowsFrom(journals.scoreboard);
  const closingRows = closingRowsFrom(journals.closings);
  const path = buildPricePath(journals.scoreboard, journals.equity);
  const scoreIndex = buildScoreboardIndex(journals.scoreboard);
  const later = buildLaterBriefIndex(briefRows);
  const ctx: LabelContext = { scoreboard: scoreIndex, path, later };

  // ----- qualidade
  const fields = auditBriefFields(briefRows);
  const verdicts = auditVerdicts(briefRows);
  const meta = auditMeta(journals.decisionsMeta, journals.briefs);
  const board = auditScoreboard(journals.scoreboard, journals.briefs);
  const prices = auditPriceConsistency(path);
  const closingAudit = auditClosingsData(closingRows, journals.closings, briefRows);
  const context = auditContext(journals.briefs);
  const briefSpan = span(journals.briefs.map((b) => num(b.atMs) ?? Number.NaN));
  const boardSpan = span(journals.scoreboard.filter((r) => r.kind === "decision").map((r) => num(r.atMs) ?? Number.NaN));
  const itemsPerLook = journals.briefs.length === 0 ? null : briefRows.length / journals.briefs.length;
  const briefHashes = journals.briefs.map((b) => b.briefHash).filter((h): h is string => typeof h === "string");
  const duplicates = {
    consultasComCicloRepetido: journals.briefs.length - new Set(journals.briefs.map((b) => b.cycleId)).size,
    linhasCicloCandidatoRepetidas: briefRows.length - new Set(briefRows.map((r) => `${r.cycleId}|${r.candidateId}`)).size,
    hashDoBriefRepetido: briefHashes.length - new Set(briefHashes).size,
    tokenRepetidoNaMesmaConsulta: briefRows.length - new Set(briefRows.map((r) => `${r.cycleId}|${r.tokenKey}`)).size,
  };

  // ----- conjunto rotulado
  const coverage: Record<string, unknown> = {};
  for (const h of HORIZONS) coverage[h.id] = coverageOf(labeled.map((l) => ({ tokenKey: l.row.tokenKey, labels: l.labels })), h.id);
  const exactKeys = new Set<string>();
  for (const key of scoreIndex.decisions.keys()) exactKeys.add(key.replace(/\|inacao$/, ""));
  const directBrief = briefRows.filter((r) => exactKeys.has(`${r.cycleId}:${r.candidateId}`)).length;
  const directClosings = closingRows.filter((c) => exactKeys.has(`${c.cycleId}:${c.candidateId}`)).length;
  const closingLabels = closingRows.map((c) => ({ tokenKey: c.tokenKey, labels: labelRow({ cycleId: c.cycleId, candidateId: c.candidateId, tokenKey: c.tokenKey, atMs: c.atMs, agMin: c.item !== null && isRecord(c.item.mo) ? barAgeMin(c.item.mo.ag) : null }, ctx) }));
  const closingCoverage: Record<string, unknown> = {};
  for (const h of HORIZONS) closingCoverage[h.id] = coverageOf(closingLabels, h.id);
  const itemBytes = briefRows.length === 0 ? null : briefRows.reduce((s, r) => s + new TextEncoder().encode(JSON.stringify(r.item)).length, 0) / briefRows.length;
  const bytesPerLook = itemBytes === null || itemsPerLook === null ? null : itemsPerLook * (itemBytes + 160);
  const looksPerDay = briefSpan.hours === null || briefSpan.hours <= 0 ? null : (journals.briefs.length / briefSpan.hours) * 24;
  const returnsAll = scoreRows.map((r) => r.retBps["1h"]).filter((v): v is number => v !== null);

  // ----- experimentos
  const experimentos = runExperiments({ briefs: labeled, scoreRows, closings: closingRows, seed: deriveSeed(seed, "experimentos"), resamples });

  // ----- hesitação e saída antecipada
  const hes = hesitationOf(briefRows, deriveSeed(seed, "hesitacao"), resamples);
  const second = secondLookOf(closingRows, deriveSeed(seed, "segundo-olhar"), resamples);
  const phase = phaseCostOf(closingRows);
  const policySeed = deriveSeed(seed, "saida-antecipada");
  const policies: PolicyResult[] = [
    ...POLICY_THETAS.map((t) => thresholdPolicy(closingRows, t, policySeed, resamples)),
    calibratedPolicy(closingRows, { floor: 0.05, exploreEvery: 10, warmup: 30 }, policySeed, resamples),
    ...COOLDOWNS_MIN.map((m) => repeatPolicy(closingRows, { cooldownMs: m * 60_000, riseDelta: 0.05 }, policySeed, resamples)),
  ];
  const ordered = inTimeOrder(closingRows);
  const closingOutcome = ordered.map((c) => {
    const mo = c.item !== null && isRecord(c.item.mo) ? c.item.mo : null;
    return labelRow({ cycleId: c.cycleId, candidateId: c.candidateId, tokenKey: c.tokenKey, atMs: c.atMs, agMin: barAgeMin(mo?.ag) }, ctx)["1h"].retBps;
  });
  /** Desfecho de preço (1 h, bruto) dos dispensados contra os mantidos: 30 e 140 bps sao limiares brutos exploratorios, sem deducao de custos. */
  const lossByOutcome = (p: PolicyResult) => {
    const count = { dispensadosComRotulo: 0, dispensadosAcima30bps: 0, dispensadosAcima140bps: 0, mantidosComRotulo: 0, mantidosAcima30bps: 0, mantidosAcima140bps: 0 };
    p.flags.forEach((dropped, i) => {
      const ret = closingOutcome[i];
      if (ret === null || ret === undefined) return;
      if (dropped) {
        count.dispensadosComRotulo += 1;
        if (ret >= 30) count.dispensadosAcima30bps += 1;
        if (ret >= 140) count.dispensadosAcima140bps += 1;
      } else {
        count.mantidosComRotulo += 1;
        if (ret >= 30) count.mantidosAcima30bps += 1;
        if (ret >= 140) count.mantidosAcima140bps += 1;
      }
    });
    return count;
  };
  const policyReport = policies.map((p) => {
    const { flags: _flags, ...rest } = p;
    return { ...rest, desfechoDePreco1h: lossByOutcome(p) };
  });
  const labeledClosings1h = closingOutcome.filter((v) => v !== null).length;
  /** Desfecho historico de preco (1 h, bruto) de todos os fechamentos com rotulo; nao mede ganho ou perda de uma execucao. */
  const closingTokens = ordered.map((c) => c.tokenKey);
  const outcomePairs = closingOutcome.map((ret, i) => ({ ret, token: closingTokens[i] as string })).filter((r): r is { ret: number; token: string } => r.ret !== null);
  const shareAtLeast = (limit: number) => {
    const boot = clusterBootstrap(outcomePairs, (r) => r.token, (rs) => (rs.length === 0 ? null : rs.filter((r) => r.ret >= limit).length / rs.length), { resamples, seed: deriveSeed(seed, `desfecho-fechamento-${limit}`) });
    return { parte: round(boot.estimate), icPorToken: boot.lo === null || boot.hi === null ? null : [round(boot.lo), round(boot.hi)], tokens: boot.clusters };
  };
  const closingOutcomeStats = {
    comRotulo1h: outcomePairs.length,
    retornoMedianoBps: round(median(outcomePairs.map((r) => r.ret)), 1),
    subiuPeloMenos30bps: shareAtLeast(30),
    subiuPeloMenos140bps: shareAtLeast(140),
    leitura: "Retorno bruto de 1 h das fontes de rotulo disponiveis. Os limiares 30 e 140 bps sao exploratorios e nao presumem custo conhecido. Amostras podem se sobrepor.",
  };

  const report: ProbReport = {
    versao: REPORT_VERSION,
    suiteDeExperimentos: EXPERIMENT_SUITE_VERSION,
    geradoEmMs: options.nowMs,
    semente: seed,
    resamples,
    leitura: { cobertura: "parcial", journalsAtivos: ACTIVE_JOURNALS, somentePresenca: PRESENCE_ONLY_JOURNALS, segmentosRotacionados: "nao_lidos" },
    entradas: Object.fromEntries([...ACTIVE_JOURNALS, ...PRESENCE_ONLY_JOURNALS].map(name => [name + ".jsonl", journals.files[name + ".jsonl"] ?? null])),
    janela: { briefs: briefSpan, placar: boardSpan, fechamentos: span(closingRows.map((c) => c.atMs)) },
    qualidade: {
      camposDoBrief: fields.map(condenseField),
      listasDoBrief: auditListFields(briefRows),
      probabilidadesDoJev: verdicts,
      decisionsMeta: meta,
      placar: board,
      consistenciaDePreco: prices,
      contextoDeMercado: context,
      fechamentos: closingAudit,
      duplicidade: duplicates,
      candidatosPorConsulta: itemsPerLook,
      tokensDistintosNoBrief: new Set(briefRows.map((r) => r.tokenKey)).size,
    },
    conjunto: {
      consultas: journals.briefs.length,
      linhasDeCandidato: briefRows.length,
      linhasSemEscolhaDoJev: briefRows.filter((r) => r.codeClosed).length,
      tokens: new Set(briefRows.map((r) => r.tokenKey)).size,
      cobertura: coverage,
      juncaoDiretaBriefPlacar: { linhasComDecisaoDoPlacar: directBrief, parte: briefRows.length === 0 ? null : round(directBrief / briefRows.length) },
      juncaoDiretaFechamentoPlacar: { fechamentos: closingRows.length, ligados: directClosings },
      coberturaDosFechamentos: closingCoverage,
      concordanciaEntreFontes: agreementOf(labeled),
      placar: {
        decisoesDeCompra: scoreRows.length,
        tokens: new Set(scoreRows.map((r) => r.tokenKey)).size,
        comRetorno: Object.fromEntries(HORIZONS.map((h) => [h.id, scoreRows.filter((r) => r.retBps[h.id] !== null).length])),
        liquidadasSemPreco: Object.fromEntries(HORIZONS.map((h) => [h.id, scoreRows.filter((r) => r.settledWithoutPrice[h.id]).length])),
        retorno1hBps: distOf(returnsAll),
      },
      registroAdicionalMinimo: {
        proposta: "O produtor atual ja grava answers.jsonl e prices.jsonl append-only. Este leitor verifica somente sua presenca. Uma extensao futura precisa conferir contratos, cobertura e tempos de observacao desconhecidos, sem alterar o produtor.",
        bytesPorItem: round(itemBytes, 0),
        bytesPorConsultaEstimados: round(bytesPerLook, 0),
        consultasPorDia: round(looksPerDay, 0),
        megabytesPorDiaEstimados: bytesPerLook === null || looksPerDay === null ? null : round((bytesPerLook * looksPerDay) / 1e6, 2),
        efeitoNaJuncao: "A presenca de um arquivo nao prova cobertura de candidatos nem de horizontes. A juncao direta e a disponibilidade de rotulos sao medidas separadamente.",
      },
    },
    experimentos,
    hesitacao: { consultas: hes, segundaOlhada: second },
    saidaAntecipada: {
      custoDaFase: phase,
      orcamentoDeTempo: {
        inicioDoCicloAtePerguntaAoModeloMs: meta.cycleStartToAskMs,
        respostaDoModeloMs: meta.modelLatencyMs,
        fechamentoPorCicloMs: phase.perCycleMs,
        parteMedianaAntesDoModelo: meta.cycleStartToAskMs === null || meta.modelLatencyMs === null || phase.perCycleMs.p50 === null ? null : round(meta.cycleStartToAskMs.p50 / (meta.cycleStartToAskMs.p50 + meta.modelLatencyMs.p50 + phase.perCycleMs.p50)),
        leitura: "Comparacao de medianas de parcelas com coberturas possivelmente diferentes; nao e a decomposicao pareada de um ciclo nem uma estimativa causal de economia.",
      },
      politicas: policyReport,
      fechamentosComDesfechoDePreco1h: labeledClosings1h,
      desfechoDosFechamentos: closingOutcomeStats,
      recomendacao: recommend(policies, phase.spanDays),
      aviso: "Medido na propria amostra: não é validação. Compras e perdas sao contagens das respostas disponiveis. Ausencia de compra observada nao demonstra perda nula; leia o limite de Wilson. Nenhuma politica aqui altera o agente.",
    },
    achados: [],
    limites: [],
    backlog: [],
  };
  const findings = findingsOf(report, { fields, verdicts, board, prices, meta, briefRows, scoreRows, closingAudit });
  return { ...report, achados: findings, limites: limitsOf(report), backlog: backlogOf(report) };
}

function condenseField(f: FieldAudit) {
  return {
    campo: f.id,
    unidade: f.unit,
    n: f.n,
    ausente: f.absent,
    nulo: f.nulls,
    presente: f.present,
    parteComValor: round(f.presentShare),
    zeros: f.zeros,
    parteZero: round(f.zeroShare),
    impossiveis: f.impossible,
    minimo: round(f.min, 4),
    mediana: round(f.p50, 4),
    maximo: round(f.max, 4),
    distintos: f.distinct,
    constante: f.constant,
    outliers: f.outliers,
    iguaisEntreConsultasSeguidas: round(f.unchangedShare),
    paresSeguidos: f.unchangedPairs,
    deriva: f.drift === null ? null : { ks: round(f.drift.ksD), critico: round(f.drift.ksCritical), deslocamentoRobusto: round(f.drift.robustShift, 3), alarme: f.drift.flagged },
    alertas: f.flags,
  };
}

function recommend(policies: readonly PolicyResult[], spanDays: number | null) {
  const eligible = policies.filter((p) => p.lostBuys === 0 && p.droppedShare !== null && p.droppedShare > 0 && (p.totalNearMisses === 0 || p.lostNearMisses / p.totalNearMisses <= 0.1));
  const best = [...eligible].sort((a, b) => (b.secondsSavedPerSpent ?? 0) - (a.secondsSavedPerSpent ?? 0))[0];
  if (best === undefined) return { politica: null, motivo: "nenhuma política dispensa fechamentos sem perder compra nem mais de 10% das quase-compras nesta amostra" };
  const { flags: _flags, ...rest } = best;
  return {
    politica: rest.policy,
    parametros: rest.param,
    criterio: "maior economia de segundos por fechamento com zero compras perdidas e no máximo 10% das quase-compras perdidas, escolhida na própria amostra",
    fechamentosDispensadosParte: round(rest.droppedShare),
    segundosEconomizadosPorFechamento: round(rest.secondsSavedPerSpent, 3),
    segundosEconomizadosPorFechamentoIc95PorToken: rest.secondsSavedPerSpentCi === null ? null : [round(rest.secondsSavedPerSpentCi[0], 3), round(rest.secondsSavedPerSpentCi[1], 3)],
    chamadasDeCotacaoEvitadas: rest.quoteCallsSaved,
    chamadasDeModeloEvitadas: rest.modelCallsSaved,
    porDia: spanDays === null || spanDays <= 0 ? null : { cotacoes: round(rest.quoteCallsSaved / spanDays, 1), chamadasAoModelo: round(rest.modelCallsSaved / spanDays, 1), segundos: round(rest.secondsSaved / spanDays, 1) },
    comprasPerdidas: `${rest.lostBuys} de ${rest.answered} respostas (limite superior de 95%: ${pct(rest.lostBuyRateUpper95)})`,
    quaseComprasPerdidas: `${rest.lostNearMisses} de ${rest.totalNearMisses}`,
  };
}

function findingsOf(
  report: ProbReport,
  x: {
    fields: readonly FieldAudit[];
    verdicts: ReturnType<typeof auditVerdicts>;
    board: ReturnType<typeof auditScoreboard>;
    prices: ReturnType<typeof auditPriceConsistency>;
    meta: ReturnType<typeof auditMeta>;
    briefRows: readonly BriefItemRow[];
    scoreRows: readonly unknown[];
    closingAudit: ReturnType<typeof auditClosingsData>;
  },
): Finding[] {
  const out: Finding[] = [];
  const field = (id: string) => x.fields.find((f) => f.id === id);
  const conj = report.conjunto as { juncaoDiretaBriefPlacar: { linhasComDecisaoDoPlacar: number; parte: number | null }; cobertura: Record<string, { share: number | null; labeled: number; bySource: Record<string, number>; rows: number }> };
  const bw = report.janela.briefs as { hours: number | null };
  const sw = report.janela.placar as { hours: number | null };
  out.push({
    id: "D01-brief-janela-rolante",
    severidade: "alta",
    achado: "A janela recebida do brief e a do placar podem ter coberturas diferentes. A presenca dos journals append-only nao informa seu conteudo neste leitor limitado.",
    numeros: { consultasGuardadas: x.briefRows.length === 0 ? 0 : report.conjunto.consultas as number, horasDeBrief: bw.hours, horasDePlacar: sw.hours, answersJsonl: report.entradas["answers.jsonl"] === null ? "ausente" : "presente", pricesJsonl: report.entradas["prices.jsonl"] === null ? "ausente" : "presente" },
    correcao: "Conferir cobertura e contratos do produtor atual antes de ampliar o leitor. Nao inferir retencao, duracao ou completude pela quantidade de linhas.",
  });
  out.push({
    id: "D02-juncao-pobre",
    severidade: "alta",
    achado: "A juncao direta mede quantos candidatos e fechamentos encontram a mesma chave no placar. A proporcao recebida nao garante representatividade do universo de consultas.",
    numeros: { candidatosDoBrief: x.briefRows.length, comDecisaoDoPlacar: conj.juncaoDiretaBriefPlacar.linhasComDecisaoDoPlacar, parte: conj.juncaoDiretaBriefPlacar.parte, fechamentos: x.closingAudit.total, fechamentosLigadosAoPlacar: (report.conjunto.juncaoDiretaFechamentoPlacar as { ligados: number }).ligados },
    correcao: "Investigar lacunas de juncao e cobertura como limites do leitor, preservando registros existentes e ausencia de preco.",
  });
  out.push({
    id: "D03-instante-da-decisao",
    severidade: "media",
    achado: "Este leitor ancora rotulos no instante do ciclo. Carimbos de leitura e de montagem do brief nao demonstram quando a fonte observou cada preco ou fato.",
    numeros: { instanteGravadoIgualAoInicioDoCiclo: x.board.decisionTimeIsCycleStart === null ? "n/d" : String(x.board.decisionTimeIsCycleStart), medianaDoInicioDoCicloAtePerguntaMs: x.meta.cycleStartToAskMs?.p50 ?? null, medianaDoBriefProntoAtePerguntaMs: x.meta.factAgeMs?.p50 ?? null, parteDoPrecoDaCarteiraRepetidoEntreLeiturasSeguidas: round(x.prices.equityUnchangedShare), retorno15mExatamenteZero: round(x.board.zeroReturnShare["15m"] ?? null) },
    correcao: "Auditar separadamente ciclo, leitura, resposta e observacao da fonte. Tempo desconhecido deve permanecer null; nao substituir por horario de leitura.",
  });
  out.push({
    id: "D04-liquidacao-sem-preco",
    severidade: "media",
    achado: "As fracoes por horizonte medem liquidacoes sem preco. Ausencias seletivas podem introduzir vies de sobrevivencia; a causa nao e estabelecida por estas contagens.",
    numeros: Object.fromEntries(Object.entries(x.board.settledWithoutPrice).map(([w, c]) => [`janela_${w}`, c.share === null ? null : round(c.share)])),
    correcao: "Preservar retorno desconhecido como null e quantificar cobertura. Somente evidencia adicional pode distinguir desaparecimento, falha de coleta e perda efetiva.",
  });
  out.push({
    id: "D05-retornos-extremos",
    severidade: "media",
    achado: "A distribuicao de retornos e as divergencias entre precos proximos descrevem as caudas recebidas. Essas estatisticas nao identificam a causa de valores extremos.",
    numeros: { retornoMedianoBps: x.board.retBps1h?.p50 ?? null, retornoP90Bps: x.board.retBps1h?.p90 ?? null, acimaDe5000bps: x.board.extremeReturn1h.beyond5000bps, amostra: x.board.extremeReturn1h.n, divergenciaMedianaEntrePrecosProximosBps: x.prices.absDiffBps?.p50 ?? null, divergenciaAcima100bps: round(x.prices.beyond100bps) },
    correcao: "Investigar comparabilidade de fonte e instante antes de interpretar caudas. Usar distribuicoes e postos sem transformar preco ausente em perda.",
  });
  const mo = field("mo.r15");
  const tm = field("tm.r4");
  const wu = field("wu");
  out.push({
    id: "D06-campos-ausentes",
    severidade: "alta",
    achado: "A completude por campo mede valores presentes, nulos e ausentes nesta amostra. Nao demonstra se a ausencia e aleatoria nem a causa de uma lacuna.",
    numeros: { momentoComValor: round(mo?.presentShare ?? null), tmComValor: round(tm?.presentShare ?? null), wuComValor: round(wu?.presentShare ?? null), lpComValor: round(field("lp")?.presentShare ?? null) },
    correcao: "Preservar null e indicadores de ausente. Conferir contrato do produtor e disponibilidade da fonte antes de propor alteracoes.",
  });
  const frozen = x.fields.filter((f) => f.flags.includes("congelado_entre_consultas")).map((f) => f.id);
  out.push({
    id: "D07-campos-congelados",
    severidade: "baixa",
    achado: "A lista identifica campos que repetem valores pelo criterio de consultas seguidas. Repeticao nao demonstra sua causa nem independencia entre linhas.",
    numeros: { camposCongelados: frozen.join(",") === "" ? "nenhum" : frozen.join(","), total: frozen.length },
    correcao: "Interpretar repeticoes junto da idade e cobertura conhecidas; manter agrupamento temporal e por token na avaliacao.",
  });
  out.push({
    id: "D08-pbuy-quantizado",
    severidade: "media",
    achado: "A grade, os empates e as somas sao medidos nos valores recebidos. first.pBuy do fechamento corresponde a buy_tenth; o leitor soma buy_* no brief.",
    numeros: { pBuyDistintos: x.verdicts.pBuyDistinct, parteEmEmpate: round(x.verdicts.pBuyTieShare), grade: x.verdicts.onHundredthsGrid ? "centesimos" : "mais fina", fechamentoDifereDaSoma: round(x.verdicts.buyTenthDiffersFromSum), somasForaDeUm: x.verdicts.sumOff },
    correcao: "Distinguir as grandezas e conferir a grade observada antes de comparar calibracao. Esta entrega nao altera probabilidades gravadas.",
  });
  const top = (x.closingAudit.fechamentosPorToken.maiorTokenParte as number | null);
  out.push({
    id: "D09-fechamento-repetitivo",
    severidade: "media",
    achado: "As contagens medem concentracao por token e respostas de compra disponiveis. Nao demonstram que todos os segundos olhares pulam nem que repetir uma consulta e inutil.",
    numeros: { fechamentos: x.closingAudit.total, parteDoMaiorToken: round(top), tokens: x.closingAudit.fechamentosPorToken.tokens, segundasOlhadasQueCompram: (report.hesitacao as { segundaOlhada: { secondBuys: number } }).segundaOlhada.secondBuys },
    correcao: "Comparar politicas somente offline e exigir validacao posterior para hipoteses de economia. Nenhuma recomendacao habilita mudanca no agente.",
  });
  const zeroAlways = x.fields.filter((f) => f.zeroShare === 1 && f.present > 50).map((f) => f.id);
  const nearConstant = x.fields.filter((f) => f.constant && f.zeroShare !== 1).map((f) => f.id);
  out.push({
    id: "D11-zero-e-constantes",
    severidade: "media",
    achado: "Zeros e constantes sao propriedades dos valores recebidos. As contagens nao revelam se representam uma medicao, valor padrao ou falta de informacao.",
    numeros: { sempreZero: zeroAlways.join(",") || "nenhum", constantesNaoZero: nearConstant.join(",") || "nenhum", executavelMaximoMin: field("x")?.min ?? null, executavelMaximoMax: field("x")?.max ?? null, riscoDistintos: field("r")?.distinct ?? null },
    correcao: "Investigar a proveniencia e preservar ausencia distinta de zero antes de modificar features ou registros.",
  });
  const ag = field("mo.ag");
  out.push({
    id: "D12-momento-defasado",
    severidade: "media",
    achado: "A idade da barra e medida por mo.ag quando disponivel. O alinhamento do brief posterior e aproximado e exige idade conhecida nas duas pontas.",
    numeros: { agMinimoMin: ag?.min ?? null, agMedianoMin: ag?.p50 ?? null, agMaximoMin: ag?.max ?? null, idadeMedianaDoFechamentoMin: ag?.p50 === null || ag?.p50 === undefined ? null : Math.max(0, ag.p50 - 5), parteDosCandidatosComMomento: round(ag?.presentShare ?? null) },
    correcao: "Conferir semantica da barra e cobertura da idade; abster-se dessa fonte quando a idade for desconhecida ou invalida.",
  });
  const budget = (report.saidaAntecipada as { orcamentoDeTempo: { inicioDoCicloAtePerguntaAoModeloMs: { p50: number; p90: number } | null; respostaDoModeloMs: { p50: number } | null; fechamentoPorCicloMs: { p50: number | null }; parteMedianaAntesDoModelo: number | null } }).orcamentoDeTempo;
  out.push({
    id: "D13-tempo-antes-do-modelo",
    severidade: "alta",
    achado: "As medianas recebidas comparam parcelas de tempo com coberturas distintas. Nao estabelecem que uma parcela domina todos os ciclos.",
    numeros: { inicioDoCicloAtePerguntaP50Ms: budget.inicioDoCicloAtePerguntaAoModeloMs?.p50 ?? null, inicioDoCicloAtePerguntaP90Ms: budget.inicioDoCicloAtePerguntaAoModeloMs?.p90 ?? null, respostaDoModeloP50Ms: budget.respostaDoModeloMs?.p50 ?? null, fechamentoPorCicloP50Ms: budget.fechamentoPorCicloMs.p50, parteMedianaAntesDoModelo: round(budget.parteMedianaAntesDoModelo) },
    correcao: "Exigir medicoes pareadas de inicio e fim para estimar economia por ciclo. A soma de medianas nao substitui essa medicao.",
  });
  out.push({
    id: "D10-vazamento",
    severidade: x.meta.factAfterAsk > 0 ? "alta" : "baixa",
    achado: "A contagem verifica apenas fatos posteriores a pergunta nos metadados disponiveis. Zero violacoes nao demonstra ausencia de vazamento quando faltam carimbos ou proveniencia.",
    numeros: { consultasComFatoPosterior: x.meta.factAfterAsk, consultas: x.meta.rows, briefsSemMeta: x.meta.briefsWithoutMeta, duplicadas: x.meta.duplicateCycles },
    correcao: "Manter verificacao temporal, explicitar metadados ausentes e auditar tempos de observacao. A purga nao certifica a origem dos dados.",
  });
  return out;
}

function limitsOf(report: ProbReport): string[] {
  const conj = report.conjunto as { tokens: number };
  const bw = report.janela.briefs as { hours: number | null };
  return [
    "Janela recebida de " + (bw.hours ?? "n/d") + " h e " + conj.tokens + " tokens. Regimes e dobras validas devem ser avaliados por experimento, nao presumidos.",
    "Cobertura parcial: apenas arquivos ativos de briefs, scoreboard, closings, decisions-meta e equity. answers, prices e fills tem somente presenca verificada; segmentos rotacionados nao sao lidos.",
    "Amostras podem se sobrepor e depender de token, tempo e mercado. Bootstrap por agrupamento nao elimina dependencia nem garante representatividade.",
    "Retorno bruto de custo com fontes de qualidade desigual. Placar exato significa mesma chave e horizonte nominal, nao horario de observacao exato. Precos podem ter idade desconhecida.",
    "pBuy e um peso de decisao, nao chance de lucro. Ler Brier skill e AUC com cobertura, abstencoes e intervalos.",
    "Rotulos sem preco ficam ausentes e podem introduzir vies de selecao. Ausencia nao demonstra retorno zero nem perda total.",
    "Nenhum numero aqui e lucro, retorno liquido esperado ou qualificacao para operar. Selecao de politicas na propria amostra exige validacao posterior.",
  ];
}

function backlogOf(report: ProbReport): string[] {
  void report;
  return [
    "Implementar leitor de answers/prices e segmentos rotacionados somente apos revisar contratos e cobertura, preservando produtor e tempos desconhecidos.",
    "Auditar horizonte nominal, leitura e observacao da fonte; manter abstencao quando o alinhamento nao puder ser demonstrado.",
    "Estudar alvo liquido com custos observados, sem substituir custo desconhecido por zero nem interpretar subida bruta como lucro.",
    "Pre-registrar hipoteses e validar em janela posterior congelada com avaliacao de regime e representatividade.",
    "Validar hipoteses de saida antecipada offline em janela posterior, contabilizando respostas ausentes e compras que seriam perdidas.",
    "Investigar caudas e qualidade de fonte antes de propor novo modelo. Mudancas operacionais permanecem fora desta biblioteca.",
  ];
}

// ---------------------------------------------------------------------------
// Privacidade
// ---------------------------------------------------------------------------

/**
 * Confere que o texto do relatório não contém nenhum id de ciclo, endereço de token ou outro identificador longo
 * dos dados de entrada. Devolve a lista de ocorrências (vazia = limpo), sem repetir o valor encontrado.
 */
export function leaksIn(reportText: string, journals: Journals): string[] {
  const found: string[] = [];
  const check = (value: unknown, what: string): void => {
    if (typeof value === "string" && value.length >= 8 && reportText.includes(value)) found.push(what);
  };
  for (const b of journals.briefs) {
    check(b.cycleId, "cycleId");
    if (Array.isArray(b.candidates)) for (const c of b.candidates) if (isRecord(c) && typeof c.id === "string") {
      check(c.id, "candidateId");
      const parts = c.id.split(":");
      check(parts[parts.length - 1]?.split("@")[0], "endereco");
    }
  }
  for (const r of journals.scoreboard) {
    check(r.cycleId, "cycleId");
    check(r.address, "endereco");
    check(r.key, "chave");
  }
  for (const c of journals.closings) {
    check(c.cycleId, "cycleId");
    check(c.requestId, "requestId");
    if (isRecord(c.quote)) check(c.quote.fingerprint, "impressaoDaCotacao");
  }
  for (const m of journals.decisionsMeta) {
    check(m.cycleId, "cycleId");
    if (isRecord(m.metadata)) for (const k of ["sourceRecordHash", "snapshotHash", "decisionVersion", "evaluatorHash"]) check(m.metadata[k], "hash");
  }
  return [...new Set(found)];
}
