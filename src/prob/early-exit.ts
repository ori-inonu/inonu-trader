/**
 * Política de SAÍDA ANTECIPADA do fechamento, avaliada OFFLINE sobre os registros que o agente já gravou.
 *
 * O fechamento (segundo olhar) lê a cotação da entrada (~1 s) e pergunta de novo ao modelo (~0,3 s). A saída
 * antecipada dispensa os dois quando a primeira resposta já torna a compra improvável. Isto é só medição: nada aqui é
 * ligado na produção, e o resultado é uma RECOMENDAÇÃO com intervalo.
 *
 * Três políticas:
 *  - limiar: dispensa quando a primeira resposta (pBuy do fechamento) é menor que um limiar fixo;
 *  - calibrada: ajusta, só com fechamentos ANTERIORES (walk-forward), a probabilidade de a segunda olhada comprar
 *    dado o pBuy da primeira, e dispensa quando a probabilidade calibrada fica abaixo de um piso, com uma fração de
 *    exploração (um em N é feito mesmo assim) para o calibrador continuar vendo o mundo;
 *  - repetição: depois que a segunda olhada pulou um token, dispensa os fechamentos do mesmo token por um tempo,
 *    a menos que a primeira resposta suba.
 *
 * O que se perde: segundas olhadas que COMPRARIAM (probabilidade de compra de pelo menos 0,5) e as que quase
 * compram (pelo menos 0,40). Quando nenhuma compra útil existe nos dados (zero em n), a perda observada é zero e o que
 * se reporta é o limite superior de 95% (Wilson), nunca "zero garantido". Puro.
 */

import type { ClosingRow } from "./dataset.ts";
import { fitBinned, fitPlatt } from "./calibrators.ts";
import { clusterBootstrap, quantileSorted, wilson } from "./intervals.ts";

export const BUY_THRESHOLD = 0.5;
const NEAR_MISS_THRESHOLD = 0.4;

interface SpendRow {
  readonly row: ClosingRow;
  /** O fechamento gastou algo (leu a cotação ou chamou o modelo). */
  readonly spent: boolean;
  /** Segundos que a política deixa de gastar neste fechamento (0 quando não dispensa). */
  readonly savedMs: number;
  readonly dropped: boolean;
}

export interface PolicyResult {
  readonly policy: "limiar" | "calibrada" | "repeticao";
  readonly param: Record<string, number>;
  /** Fechamentos que gastaram cotação e/ou modelo (a base onde a economia existe). */
  readonly spentClosings: number;
  readonly dropped: number;
  readonly droppedShare: number | null;
  readonly droppedShareCi: [number, number] | null;
  readonly quoteCallsSaved: number;
  readonly modelCallsSaved: number;
  readonly secondsSaved: number;
  /** Média de segundos economizados por fechamento que gastou. */
  readonly secondsSavedPerSpent: number | null;
  readonly secondsSavedPerSpentCi: [number, number] | null;
  /** Compras que a segunda olhada faria (>= 0,5) entre as que foram dispensadas, e quantas existiam no total. */
  readonly lostBuys: number;
  readonly totalBuys: number;
  /** Limite superior de 95% (Wilson) da taxa de compras perdidas entre os fechamentos com resposta. */
  readonly lostBuyRateUpper95: number | null;
  readonly lostNearMisses: number;
  readonly totalNearMisses: number;
  /** Dos fechamentos com resposta, quantos a política teria dispensado. */
  readonly answeredDropped: number;
  readonly answered: number;
  /** Para cada fechamento em ordem cronológica, se a política o dispensa (não vai para o relatório). */
  readonly flags: readonly boolean[];
}

function evaluate(
  policy: PolicyResult["policy"],
  param: Record<string, number>,
  rows: ReadonlyArray<SpendRow>,
  seed: number,
  resamples: number,
): PolicyResult {
  const spentRows = rows.filter((r) => r.spent);
  const droppedSpent = spentRows.filter((r) => r.dropped);
  const answered = rows.filter((r) => r.row.secondBuy !== null);
  const answeredDropped = answered.filter((r) => r.dropped);
  const lostBuys = answeredDropped.filter((r) => (r.row.secondBuy as number) >= BUY_THRESHOLD).length;
  const totalBuys = answered.filter((r) => (r.row.secondBuy as number) >= BUY_THRESHOLD).length;
  const nearLost = answeredDropped.filter((r) => (r.row.secondBuy as number) >= NEAR_MISS_THRESHOLD).length;
  const nearTotal = answered.filter((r) => (r.row.secondBuy as number) >= NEAR_MISS_THRESHOLD).length;
  const share = boot(spentRows, (rs) => (rs.length === 0 ? null : rs.filter((r) => r.dropped).length / rs.length), seed, resamples);
  const secs = boot(spentRows, (rs) => (rs.length === 0 ? null : rs.reduce((s, r) => s + r.savedMs, 0) / rs.length / 1000), seed + 1, resamples);
  const upper = wilson(lostBuys, answered.length);
  return {
    policy,
    param,
    spentClosings: spentRows.length,
    dropped: droppedSpent.length,
    droppedShare: spentRows.length === 0 ? null : droppedSpent.length / spentRows.length,
    droppedShareCi: share,
    quoteCallsSaved: droppedSpent.filter((r) => r.row.quoted).length,
    modelCallsSaved: droppedSpent.filter((r) => r.row.modelMs !== null).length,
    secondsSaved: droppedSpent.reduce((s, r) => s + r.savedMs, 0) / 1000,
    secondsSavedPerSpent: spentRows.length === 0 ? null : droppedSpent.reduce((s, r) => s + r.savedMs, 0) / spentRows.length / 1000,
    secondsSavedPerSpentCi: secs,
    lostBuys,
    totalBuys,
    lostBuyRateUpper95: upper === null ? null : upper[1],
    lostNearMisses: nearLost,
    totalNearMisses: nearTotal,
    answeredDropped: answeredDropped.length,
    answered: answered.length,
    flags: rows.map((r) => r.dropped),
  };
}

function boot(rows: readonly SpendRow[], stat: (rows: readonly SpendRow[]) => number | null, seed: number, resamples: number): [number, number] | null {
  const r = clusterBootstrap(rows, (x) => x.row.tokenKey, stat, { resamples, seed });
  return r.lo === null || r.hi === null ? null : [r.lo, r.hi];
}

const spentOf = (c: ClosingRow): boolean => c.quoted || c.modelMs !== null || c.spentMs > 0;
/** O que um fechamento custou: o tempo medido de ponta a ponta (cotação mais modelo). */
const costMs = (c: ClosingRow): number => c.spentMs;

/** Ordem cronológica estável. */
export function inTimeOrder(closings: readonly ClosingRow[]): ClosingRow[] {
  return [...closings].sort((a, b) => a.atMs - b.atMs);
}

export function thresholdPolicy(closings: readonly ClosingRow[], theta: number, seed: number, resamples: number): PolicyResult {
  const rows = inTimeOrder(closings).map((row): SpendRow => {
    const dropped = row.firstP !== null && row.firstP < theta;
    return { row, spent: spentOf(row), dropped, savedMs: dropped ? costMs(row) : 0 };
  });
  return evaluate("limiar", { theta }, rows, seed, resamples);
}

export interface CalibratedOptions {
  /** Dispensa quando P(segunda olhada compra) calibrada fica abaixo disto. */
  readonly floor: number;
  /** Um em cada `exploreEvery` fechamentos que seriam dispensados é feito mesmo assim. 0 desliga. */
  readonly exploreEvery: number;
  /** Fechamentos com resposta antes de a política poder agir. */
  readonly warmup: number;
}

/**
 * Walk-forward: para cada fechamento, ajusta com os fechamentos ANTERIORES que tiveram segunda resposta (pBuy da
 * primeira contra "a segunda olhada compraria") e decide. Enquanto o ajuste não tem as duas classes (nenhuma compra
 * observada), usa o limite superior de Wilson da taxa de compra como probabilidade: "zero em n" não vira "zero".
 */
export function calibratedPolicy(closings: readonly ClosingRow[], options: CalibratedOptions, seed: number, resamples: number): PolicyResult {
  const ordered = inTimeOrder(closings);
  const history: Array<{ p: number; y: number }> = [];
  let wouldDrop = 0;
  const rows: SpendRow[] = [];
  for (const row of ordered) {
    let dropped = false;
    if (row.firstP !== null && history.length >= options.warmup) {
      const ps = history.map((h) => h.p);
      const ys = history.map((h) => h.y);
      const positives = ys.reduce((s, v) => s + v, 0);
      let q: number | null = null;
      if (positives === 0) {
        const w = wilson(0, history.length);
        q = w === null ? null : w[1];
      } else {
        const cal = fitPlatt(ps, ys, { minSamples: options.warmup }) ?? fitBinned(ps, ys, { bins: 3, minPerBin: 10 });
        q = cal === null ? null : cal.predict(row.firstP);
      }
      if (q !== null && q < options.floor) {
        wouldDrop += 1;
        const explore = options.exploreEvery > 0 && wouldDrop % options.exploreEvery === 0;
        dropped = !explore;
      }
    }
    rows.push({ row, spent: spentOf(row), dropped, savedMs: dropped ? costMs(row) : 0 });
    if (row.firstP !== null && row.secondBuy !== null) history.push({ p: row.firstP, y: row.secondBuy >= BUY_THRESHOLD ? 1 : 0 });
  }
  return evaluate("calibrada", { floor: options.floor, exploreEvery: options.exploreEvery, warmup: options.warmup }, rows, seed + 7, resamples);
}

export interface RepeatOptions {
  /** Depois de um pulo da segunda olhada, dispensa o mesmo token por este tempo. */
  readonly cooldownMs: number;
  /** Mas refaz se a primeira resposta subiu pelo menos isto em relação à que foi pulada. */
  readonly riseDelta: number;
}

export function repeatPolicy(closings: readonly ClosingRow[], options: RepeatOptions, seed: number, resamples: number): PolicyResult {
  const ordered = inTimeOrder(closings);
  const lastSkip = new Map<string, { atMs: number; firstP: number }>();
  const rows: SpendRow[] = [];
  for (const row of ordered) {
    const last = lastSkip.get(row.tokenKey);
    let dropped = false;
    if (last !== undefined && row.atMs - last.atMs <= options.cooldownMs && row.firstP !== null && row.firstP < last.firstP + options.riseDelta) dropped = true;
    rows.push({ row, spent: spentOf(row), dropped, savedMs: dropped ? costMs(row) : 0 });
    // só um pulo realmente observado (fechamento feito de verdade) reinicia o relógio do token
    if (!dropped && row.secondBuy !== null && row.secondBuy < BUY_THRESHOLD && row.firstP !== null) lastSkip.set(row.tokenKey, { atMs: row.atMs, firstP: row.firstP });
  }
  return evaluate("repeticao", { cooldownMin: options.cooldownMs / 60_000, riseDelta: options.riseDelta }, rows, seed + 13, resamples);
}

export interface PhaseCost {
  readonly cyclesWithClosing: number;
  /** Tempo do fechamento somado por ciclo (sequencial), p50 e p90, em ms. */
  readonly perCycleMs: { readonly p50: number | null; readonly p90: number | null };
  readonly quoteMs: { readonly p50: number | null; readonly p90: number | null; readonly n: number };
  readonly modelMs: { readonly p50: number | null; readonly p90: number | null; readonly n: number };
  readonly totalSecondsObserved: number;
  readonly spanDays: number | null;
  readonly secondsPerDay: number | null;
  readonly quotedPerDay: number | null;
}

export function phaseCostOf(closings: readonly ClosingRow[]): PhaseCost {
  const perCycle = new Map<string, number>();
  for (const c of closings) if (spentOf(c)) perCycle.set(c.cycleId, (perCycle.get(c.cycleId) ?? 0) + c.spentMs);
  const cycles = [...perCycle.values()].sort((a, b) => a - b);
  const quote = closings.map((c) => c.quoteMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const model = closings.map((c) => c.modelMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const times = closings.map((c) => c.atMs);
  const span = times.length < 2 ? null : (Math.max(...times) - Math.min(...times)) / 86_400_000;
  const total = [...perCycle.values()].reduce((s, v) => s + v, 0) / 1000;
  return {
    cyclesWithClosing: perCycle.size,
    perCycleMs: { p50: quantileSorted(cycles, 0.5), p90: quantileSorted(cycles, 0.9) },
    quoteMs: { p50: quantileSorted(quote, 0.5), p90: quantileSorted(quote, 0.9), n: quote.length },
    modelMs: { p50: quantileSorted(model, 0.5), p90: quantileSorted(model, 0.9), n: model.length },
    totalSecondsObserved: total,
    spanDays: span,
    secondsPerDay: span === null || span <= 0 ? null : total / span,
    quotedPerDay: span === null || span <= 0 ? null : closings.filter((c) => c.quoted).length / span,
  };
}
