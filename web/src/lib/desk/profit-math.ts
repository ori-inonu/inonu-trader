/**
 * The account of the profit (INF, ASK): what a plan of the Veredito is worth AFTER the costs, in numbers a person can add up. It is arithmetic over the plan the core
 * already composed (the entry, the point where the idea fails, the target and the cost of getting in and out): if the target is reached the person gains the distance minus
 * the cost, if the idea fails they lose the distance plus the cost, and the share of the times they must be right just to break even follows from the two. It predicts
 * nothing: the chance of being right is NOT here, only how often it would have to be for the plan to pay.
 *
 * Pure: no clock, no network. Percent here are real percent (1 is 1%), not basis points.
 */
import type { Plano } from "../veredito/types";

export interface ProfitMath {
  /** Distance to the target and to the point where the idea fails, before costs. */
  readonly targetPct: number;
  readonly stopPct: number;
  /** The cost of getting in and out, as a share of the price. */
  readonly costPct: number;
  /** What is left of the target after the cost, and what is lost at the stop with the cost added. Null gain: the cost eats the target. */
  readonly gainNetPct: number | null;
  readonly lossNetPct: number;
  /** The share of the times the plan must work to break even; null when the cost eats the target (no share is enough). */
  readonly breakEvenPct: number | null;
  /** Gain over loss after costs; null when the cost eats the target. */
  readonly netRatio: number | null;
  /** In dollars, when the person gave a capital and a risk: the most they gain at the target and the most they lose at the stop (the loss includes the cost). */
  readonly usd: { readonly notional: number; readonly gain: number | null; readonly loss: number } | null;
}

const pct = (bps: number): number => bps / 100;

export function profitMath(plan: Plano): ProfitMath {
  const gainNetBps = plan.alvoBps - plan.custoBps;
  const lossNetBps = plan.riscoBps + plan.custoBps;
  const paying = gainNetBps > 0 && Number.isFinite(gainNetBps) && lossNetBps > 0;
  const size = plan.tamanho;
  return {
    targetPct: pct(plan.alvoBps),
    stopPct: pct(plan.riscoBps),
    costPct: pct(plan.custoBps),
    gainNetPct: paying ? pct(gainNetBps) : null,
    lossNetPct: pct(lossNetBps),
    breakEvenPct: paying ? (lossNetBps / (gainNetBps + lossNetBps)) * 100 : null,
    netRatio: paying ? gainNetBps / lossNetBps : null,
    usd: size === null ? null : { notional: size.notionalUsd, gain: paying ? (size.notionalUsd * gainNetBps) / 10_000 : null, loss: size.riscoUsd },
  };
}

const num = (n: number, digits: number): string => n.toFixed(digits).replace(".", ",");
const money = (n: number): string => `US$ ${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/** The lines a person reads, in plain Portuguese without accents. `measured` says how the Inonu's hits are measured, so the break even is read against it. */
export function profitLines(m: ProfitMath, measured: string): string[] {
  if (m.gainNetPct === null) {
    return [`O custo de entrar e sair (${num(m.costPct, 2)}%) come o alvo (${num(m.targetPct, 2)}%): este plano nao paga.`];
  }
  const lines = [
    `Se der certo: +${num(m.gainNetPct, 2)}% (alvo ${num(m.targetPct, 2)}% menos ${num(m.costPct, 2)}% de custo).`,
    `Se der errado: -${num(m.lossNetPct, 2)}% (a ideia cai em ${num(m.stopPct, 2)}%, mais ${num(m.costPct, 2)}% de custo).`,
    `Para empatar, o plano precisa dar certo em ${num(m.breakEvenPct ?? 0, 0)}% das vezes. ${measured}`,
  ];
  if (m.usd !== null && m.usd.gain !== null) lines.push(`Com o seu risco: ganha ate ${money(m.usd.gain)} ou perde ${money(m.usd.loss)}, em ${money(m.usd.notional)}.`);
  return lines;
}
