/**
 * The words of the Veredito card (VER-4, VER-6, UX-2): pure functions from the numbers of the plan to the lines a person reads.
 * Shares of the price are shown as percent (the card never asks anyone to know what a basis point is); a price keeps the decimals
 * the desk gives a price of that magnitude. Plain ASCII, no dash, no middle dot. Nothing here predicts anything: it says what the
 * plan IS, and that it is a calculation over the risk the person chose.
 */
import { fmtNumber, fmtSizeSig, priceDecimalsForMagnitude } from "../desk/ui/format";
import type { Confianca, Plano, Selo, TargetKind } from "./types";

export interface PlanRow {
  readonly rotulo: string;
  readonly valor: string;
  readonly dica: string | null;
}

export const SEAL_WORD: Readonly<Record<Selo, string>> = { comprar: "Comprar", vender: "Vender", esperar: "Esperar" };

export const TARGET_WORD: Readonly<Record<TargetKind, string>> = {
  zona_oposta: "perto da zona do lado oposto",
  piscina: "perto de liquidez parada",
  perfil: "no preco mais negociado",
  multiplo: "1,5 vez o risco",
};

const pct = (bps: number): string => `${fmtNumber(bps / 100, 2)}%`;

export function confidenceLine(conf: Confianca | null): string {
  return conf === null ? "Consistencia das respostas do modelo: nao informada." : `Consistencia das respostas do modelo: ${conf === "media" ? "media" : conf}.`;
}

export function zoneLine(nota: number | null): string | null {
  return nota === null ? null : `Forca da zona: ${fmtNumber(nota, 0)} de 100. Descreve a zona, nao preve o preco.`;
}

/** The plan as rows. The size row is absent without a profile: nothing is invented to fill it. */
export function planRows(plano: Plano, baseSymbol: string): PlanRow[] {
  const d = priceDecimalsForMagnitude(plano.entradaReferencia);
  const px = (n: number): string => fmtNumber(n, d);
  const long = plano.lado === "compra";
  const rows: PlanRow[] = [
    {
      rotulo: "Entrada",
      valor: plano.entradaBaixo === plano.entradaAlto ? px(plano.entradaReferencia) : `${px(plano.entradaBaixo)} a ${px(plano.entradaAlto)}`,
      dica: plano.distanciaAteEntradaBps > 0 ? `${long ? "abaixo" : "acima"} do preco agora, a ${pct(plano.distanciaAteEntradaBps)}` : "o preco ja esta na faixa",
    },
    { rotulo: "A ideia cai em", valor: px(plano.invalidacao), dica: `${pct(plano.riscoBps)} de risco a partir da entrada` },
    { rotulo: "Alvo", valor: px(plano.alvo), dica: `${pct(plano.alvoBps)} ${long ? "acima" : "abaixo"}, ${TARGET_WORD[plano.alvoTipo]}` },
    {
      rotulo: "Ganho sobre risco",
      valor: plano.ganhoRiscoLiquido === null ? "o custo come o alvo" : fmtNumber(plano.ganhoRiscoLiquido, 2),
      dica: "depois dos custos",
    },
    { rotulo: "Custo de entrar e sair", valor: pct(plano.custoBps), dica: "taxas, folga de execucao e spread" },
  ];
  if (plano.tamanho !== null) {
    const t = plano.tamanho;
    rows.push({
      rotulo: "Tamanho",
      valor: `US$ ${fmtNumber(t.notionalUsd, 2)} (${fmtSizeSig(t.quantidadeBase)} ${baseSymbol})`,
      dica: t.limitadoPeloCapital ? "limitado ao seu capital, sem alavancagem" : `para perder US$ ${fmtNumber(t.riscoUsd, 2)} se a ideia cair`,
    });
  }
  return rows;
}

/** Percent typed by a person ("0,5", "1.5", " 2 ") to a number, or null. */
export function parseNumberInput(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
