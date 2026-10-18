/**
 * Medida da hesitação do Jev. Puro.
 *
 * Três ângulos, todos sobre o que o agente já grava:
 *  1. Dentro de uma consulta: quanto da massa de probabilidade está perto do empate (pBuy perto de 0,5; diferença
 *     pequena entre as duas opções mais prováveis).
 *  2. Entre consultas seguidas do MESMO candidato (a cada ~2,5 min): a escolha vira (compra para pula ou o inverso)?
 *     Uma escolha estável não vira sem dado novo; virar muito é sinal de ruído, não de informação.
 *  3. Entre a primeira resposta e o segundo olhar do fechamento: o segundo olhar discorda da primeira?
 * Todo intervalo é por agrupamento de token: as consultas do mesmo token são dependentes.
 */

import type { BriefItemRow, ClosingRow } from "./dataset.ts";
import { clusterBootstrap, mean, median, quantile, wilson } from "./intervals.ts";
import { spearman } from "./scoring.ts";

/** Consultas seguidas: o intervalo entre ciclos é de ~2,4 min; acima disto o candidato saiu da lista e voltou. */
const CONSECUTIVE_MS = 6 * 60_000;

export interface Proportion {
  readonly count: number;
  readonly n: number;
  readonly share: number | null;
  /** Wilson, que SUPÕE amostras independentes (otimista aqui). */
  readonly wilson: [number, number] | null;
  /** Bootstrap por token (honesto quanto à dependência). Null com poucos tokens. */
  readonly byToken: [number, number] | null;
  readonly tokens: number;
}

function proportion(items: ReadonlyArray<{ token: string; hit: boolean }>, seed: number, resamples: number): Proportion {
  const count = items.filter((i) => i.hit).length;
  const boot = clusterBootstrap(items, (i) => i.token, (rows) => (rows.length === 0 ? null : rows.filter((r) => r.hit).length / rows.length), { resamples, seed });
  return {
    count,
    n: items.length,
    share: items.length === 0 ? null : count / items.length,
    wilson: wilson(count, items.length),
    byToken: boot.lo === null || boot.hi === null ? null : [boot.lo, boot.hi],
    tokens: new Set(items.map((i) => i.token)).size,
  };
}

export interface HesitationReport {
  readonly looks: { readonly cycles: number; readonly items: number; readonly withVerdict: number };
  readonly pBuyDistribution: { readonly p50: number | null; readonly p90: number | null; readonly p99: number | null; readonly max: number | null };
  /** pBuy entre 0,4 e 0,6: o Jev quase empata entre comprar e pular. */
  readonly pBuyNearHalf: Proportion;
  /** Diferença entre as duas opções mais prováveis menor que 0,10. */
  readonly closeCall: Proportion;
  /** A escolha pedida é uma compra. */
  readonly leansBuy: Proportion;
  /** Troca de escolha (compra para pula ou pula para compra) entre consultas seguidas do mesmo candidato. */
  readonly flips: Proportion;
  /** O mesmo, só quando a primeira consulta do par estava perto do empate (pBuy de 0,4 a 0,6). */
  readonly flipsNearHalf: Proportion;
  /** Quantas vezes a escolha de compra se repete na consulta seguinte (persistência de uma compra). */
  readonly buyPersistence: Proportion;
  /** Margem (maior probabilidade menos a segunda) das consultas em que a escolha é comprar: compra decidida por margem fina é quase empate. */
  readonly buyLeanMargin: { readonly n: number; readonly p25: number | null; readonly p50: number | null; readonly p75: number | null; readonly below010: Proportion; readonly below020: Proportion };
  readonly stability: { readonly pairs: number; readonly spearmanNextPBuy: number | null; readonly meanAbsChange: number | null };
}

const leansBuy = (r: BriefItemRow): boolean => r.requested !== null && r.requested.startsWith("buy");

export function hesitationOf(rows: readonly BriefItemRow[], seed: number, resamples: number): HesitationReport {
  const usable = rows.filter((r) => !r.codeClosed && r.pBuy !== null);
  const pBuys = usable.map((r) => r.pBuy as number);
  const near = usable.map((r) => ({ token: r.tokenKey, hit: (r.pBuy as number) >= 0.4 && (r.pBuy as number) <= 0.6 }));
  const close = usable.filter((r) => r.topMargin !== null).map((r) => ({ token: r.tokenKey, hit: (r.topMargin as number) < 0.1 }));
  const lean = usable.map((r) => ({ token: r.tokenKey, hit: leansBuy(r) }));
  const byToken = new Map<string, BriefItemRow[]>();
  for (const r of usable) {
    const list = byToken.get(r.tokenKey);
    if (list === undefined) byToken.set(r.tokenKey, [r]);
    else list.push(r);
  }
  const leaning = usable.filter((r) => leansBuy(r) && r.topMargin !== null);
  const margins = leaning.map((r) => r.topMargin as number);
  const flips: Array<{ token: string; hit: boolean }> = [];
  const flipsNear: Array<{ token: string; hit: boolean }> = [];
  const persist: Array<{ token: string; hit: boolean }> = [];
  const nextX: number[] = [];
  const nextY: number[] = [];
  const absChange: number[] = [];
  for (const [token, list] of byToken) {
    list.sort((a, b) => a.atMs - b.atMs);
    for (let i = 1; i < list.length; i += 1) {
      const a = list[i - 1] as BriefItemRow;
      const b = list[i] as BriefItemRow;
      if (b.atMs === a.atMs || b.atMs - a.atMs > CONSECUTIVE_MS) continue;
      const flipped = leansBuy(a) !== leansBuy(b);
      flips.push({ token, hit: flipped });
      if ((a.pBuy as number) >= 0.4 && (a.pBuy as number) <= 0.6) flipsNear.push({ token, hit: flipped });
      if (leansBuy(a)) persist.push({ token, hit: leansBuy(b) });
      nextX.push(a.pBuy as number);
      nextY.push(b.pBuy as number);
      absChange.push(Math.abs((b.pBuy as number) - (a.pBuy as number)));
    }
  }
  return {
    looks: { cycles: new Set(rows.map((r) => r.cycleId)).size, items: rows.length, withVerdict: rows.filter((r) => r.verdict !== null).length },
    pBuyDistribution: { p50: quantile(pBuys, 0.5), p90: quantile(pBuys, 0.9), p99: quantile(pBuys, 0.99), max: pBuys.length === 0 ? null : Math.max(...pBuys) },
    pBuyNearHalf: proportion(near, seed + 1, resamples),
    closeCall: proportion(close, seed + 2, resamples),
    leansBuy: proportion(lean, seed + 3, resamples),
    flips: proportion(flips, seed + 4, resamples),
    flipsNearHalf: proportion(flipsNear, seed + 5, resamples),
    buyPersistence: proportion(persist, seed + 6, resamples),
    buyLeanMargin: {
      n: margins.length,
      p25: quantile(margins, 0.25),
      p50: quantile(margins, 0.5),
      p75: quantile(margins, 0.75),
      below010: proportion(leaning.map((r) => ({ token: r.tokenKey, hit: (r.topMargin as number) < 0.1 })), seed + 7, resamples),
      below020: proportion(leaning.map((r) => ({ token: r.tokenKey, hit: (r.topMargin as number) < 0.2 })), seed + 8, resamples),
    },
    stability: { pairs: nextX.length, spearmanNextPBuy: spearman(nextX, nextY), meanAbsChange: mean(absChange) },
  };
}

export interface SecondLookReport {
  readonly closings: number;
  /** Fechamentos em que o código leu a cotação e o modelo deu a segunda resposta. */
  readonly answered: number;
  readonly tokens: number;
  /** Fatia do maior token entre todos os fechamentos: o segundo olhar repete o mesmo candidato. */
  readonly topTokenShare: number | null;
  readonly secondBuys: number;
  /** Primeira resposta inclinada a comprar e segunda olhada que pula. */
  readonly secondSkipsAfterFirstBuy: Proportion;
  readonly firstP: { readonly p50: number | null; readonly min: number | null; readonly max: number | null };
  /** Primeira resposta (probabilidade do fechamento) entre 0,4 e 0,6: quase um cara ou coroa. */
  readonly firstNearHalf: Proportion;
  readonly secondBuyP: { readonly p50: number | null; readonly p90: number | null; readonly max: number | null };
  readonly spearmanFirstSecond: number | null;
  /** Segunda olhada com probabilidade de compra de pelo menos 0,40: quase compra. */
  readonly nearMiss: number;
  readonly firstMinusSecondMean: number | null;
}

export function secondLookOf(closings: readonly ClosingRow[], seed: number, resamples: number): SecondLookReport {
  const answered = closings.filter((c) => c.secondBuy !== null);
  const tokens = new Map<string, number>();
  for (const c of closings) tokens.set(c.tokenKey, (tokens.get(c.tokenKey) ?? 0) + 1);
  const top = Math.max(0, ...tokens.values());
  const pairs = answered.filter((c) => c.firstP !== null);
  const firsts = closings.map((c) => c.firstP).filter((v): v is number => v !== null);
  const seconds = answered.map((c) => c.secondBuy as number);
  return {
    closings: closings.length,
    answered: answered.length,
    tokens: tokens.size,
    topTokenShare: closings.length === 0 ? null : top / closings.length,
    secondBuys: answered.filter((c) => (c.secondBuy as number) >= 0.5).length,
    secondSkipsAfterFirstBuy: proportion(answered.map((c) => ({ token: c.tokenKey, hit: (c.secondBuy as number) < 0.5 })), seed + 11, resamples),
    firstP: { p50: median(firsts), min: firsts.length === 0 ? null : Math.min(...firsts), max: firsts.length === 0 ? null : Math.max(...firsts) },
    firstNearHalf: proportion(closings.filter((c) => c.firstP !== null).map((c) => ({ token: c.tokenKey, hit: (c.firstP as number) >= 0.4 && (c.firstP as number) <= 0.6 })), seed + 12, resamples),
    secondBuyP: { p50: quantile(seconds, 0.5), p90: quantile(seconds, 0.9), max: seconds.length === 0 ? null : Math.max(...seconds) },
    spearmanFirstSecond: spearman(pairs.map((c) => c.firstP as number), pairs.map((c) => c.secondBuy as number)),
    nearMiss: answered.filter((c) => (c.secondBuy as number) >= 0.4).length,
    firstMinusSecondMean: pairs.length === 0 ? null : (mean(pairs.map((c) => (c.firstP as number) - (c.secondBuy as number))) as number),
  };
}
