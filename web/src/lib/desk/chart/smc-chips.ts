/**
 * Smart money context chips for the chart legend strip (spec 3.4). Pure model over the same
 * SmcContext the Jev pack shares: each chip is a description of the reading, never a decision.
 * Tones only carry direction (buy tone for up, sell tone for down); they are not commands.
 */

import type { SmcContext } from "./smc";

export type SmcChipTone = "neutral" | "buy" | "sell";

export interface SmcChip {
  readonly id: string;
  readonly text: string;
  readonly title: string;
  readonly tone: SmcChipTone;
}

/** Fixed prefix of the chip group label: smart money is a computation, not a decision. */
export const SMC_CHIPS_TITLE = "Smart money, calculo, nao e decisao";

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const bps = (v: number): string => `${Math.round(v)}`;

function barsAgo(ageBars: number): string {
  if (ageBars === 0) return "agora";
  return ageBars === 1 ? "ha 1 barra" : `ha ${ageBars} barras`;
}

/**
 * The chips for one context, in display order. Each carries a one sentence definition for its
 * title. `bar` is the chart's interval label used in the titles ("barras de 15m").
 */
export function smcChips(ctx: SmcContext, bar: string): SmcChip[] {
  const chips: SmcChip[] = [];

  if (ctx.rangeState === "above") {
    chips.push({ id: "position", text: "Fora da faixa, acima", title: `${SMC_CHIPS_TITLE}. O preco esta acima do topo do ultimo intervalo de estrutura.`, tone: "buy" });
  } else if (ctx.rangeState === "below") {
    chips.push({ id: "position", text: "Fora da faixa, abaixo", title: `${SMC_CHIPS_TITLE}. O preco esta abaixo do fundo do ultimo intervalo de estrutura.`, tone: "sell" });
  } else if (ctx.rangePos !== null) {
    if (ctx.rangePos < 0.45) {
      chips.push({ id: "position", text: `Desconto ${pct(ctx.rangePos)}`, title: `${SMC_CHIPS_TITLE}. Posicao do preco dentro do ultimo intervalo: abaixo de 45% e desconto.`, tone: "buy" });
    } else if (ctx.rangePos > 0.55) {
      chips.push({ id: "position", text: `Premium ${pct(ctx.rangePos)}`, title: `${SMC_CHIPS_TITLE}. Posicao do preco dentro do ultimo intervalo: acima de 55% e premium.`, tone: "sell" });
    } else {
      chips.push({ id: "position", text: `Equilibrio ${pct(ctx.rangePos)}`, title: `${SMC_CHIPS_TITLE}. Posicao do preco dentro do ultimo intervalo, perto do meio.`, tone: "neutral" });
    }
  }

  if (ctx.demandBlockBps !== null) {
    chips.push({
      id: "demand",
      text: ctx.demandBlockBps === 0 ? "Dentro da demanda" : `Demanda a ${bps(ctx.demandBlockBps)} bps abaixo`,
      title: `${SMC_CHIPS_TITLE}. Distancia do preco ate o bloco de ordem de demanda ativo mais proximo.`,
      tone: "buy",
    });
  }
  if (ctx.supplyBlockBps !== null) {
    chips.push({
      id: "supply",
      text: ctx.supplyBlockBps === 0 ? "Dentro da oferta" : `Oferta a ${bps(ctx.supplyBlockBps)} bps acima`,
      title: `${SMC_CHIPS_TITLE}. Distancia do preco ate o bloco de ordem de oferta ativo mais proximo.`,
      tone: "sell",
    });
  }

  if (ctx.gapsUp > 0) {
    chips.push({ id: "gapsUp", text: `FVG de alta aberto${ctx.gapsUp > 1 ? ` (${ctx.gapsUp})` : ""}`, title: `${SMC_CHIPS_TITLE}. Imbalance de alta ainda nao preenchido por completo.`, tone: "buy" });
  }
  if (ctx.gapsDown > 0) {
    chips.push({ id: "gapsDown", text: `FVG de baixa aberto${ctx.gapsDown > 1 ? ` (${ctx.gapsDown})` : ""}`, title: `${SMC_CHIPS_TITLE}. Imbalance de baixa ainda nao preenchido por completo.`, tone: "sell" });
  }

  if (ctx.lastBreak !== null) {
    const dir = ctx.lastBreak.dir === "up" ? "alta" : "baixa";
    chips.push({
      id: "lastBreak",
      text: `${ctx.lastBreak.kind} de ${dir} ${barsAgo(ctx.lastBreak.ageBars)}`,
      title: `${SMC_CHIPS_TITLE}. Ultima ruptura de estrutura (BOS ou mudanca de carater), idade em barras de ${bar}.`,
      tone: ctx.lastBreak.dir === "up" ? "buy" : "sell",
    });
  }

  if (ctx.lastSweep !== null) {
    const kind = ctx.lastSweep.kind === "highs" ? "topos" : "fundos";
    chips.push({
      id: "lastSweep",
      text: `Varredura de ${kind} ${barsAgo(ctx.lastSweep.ageBars)}`,
      title: `${SMC_CHIPS_TITLE}. Ultima varredura de um pool de liquidez, idade em barras de ${bar}.`,
      tone: ctx.lastSweep.kind === "highs" ? "sell" : "buy",
    });
  }

  if (ctx.poolAboveBps !== null) {
    chips.push({ id: "poolAbove", text: `Liquidez acima a ${bps(ctx.poolAboveBps)} bps`, title: `${SMC_CHIPS_TITLE}. Distancia do preco ate o pool de liquidez ativo mais proximo acima.`, tone: "buy" });
  }
  if (ctx.poolBelowBps !== null) {
    chips.push({ id: "poolBelow", text: `Liquidez abaixo a ${bps(ctx.poolBelowBps)} bps`, title: `${SMC_CHIPS_TITLE}. Distancia do preco ate o pool de liquidez ativo mais proximo abaixo.`, tone: "sell" });
  }

  return chips;
}
