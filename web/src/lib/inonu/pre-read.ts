/**
 * What the code already read for free before anyone asks the Inonu (the Inonu tab of the simple desk): whether the moment lines up for a question (the scenario of the thermometer),
 * what the market costs to move through right now, and what the Inonu answered the last time. The person sees the ground the model will be asked about and decides whether a consult
 * is worth its cost. The code DESCRIBES here; the only words of an order are the Inonu's own answer, shown with its age.
 */
import type { MarketRead } from "../desk/market-read";

export interface PreReadLine {
  readonly kind: "cenario" | "mercado" | "resposta";
  /** The scenario line is stressed when a question is worth asking; the rest are plain. */
  readonly tone: "worth" | "plain";
  readonly text: string;
}

export interface PreReadInput {
  /** The scenario of the thermometer: its sentence, and whether enough lines up and the Inonu has no recent answer. */
  readonly scenario: { readonly headline: string; readonly worthAsking: boolean };
  readonly market: MarketRead | null;
  /** The last answer of the Inonu for this instrument, in the words the thermometer uses. */
  readonly answer: { readonly word: string; readonly age: string; readonly fresh: boolean } | null;
}

/** The lines, in the order a person reads them; a line the code could not read is left out, never filled in. */
export function preReadLines(input: PreReadInput): PreReadLine[] {
  const lines: PreReadLine[] = [{ kind: "cenario", tone: input.scenario.worthAsking ? "worth" : "plain", text: input.scenario.headline }];
  if (input.market !== null && input.market.state === "ok") lines.push({ kind: "mercado", tone: "plain", text: input.market.thicknessText });
  lines.push({
    kind: "resposta",
    tone: "plain",
    text: input.answer === null ? "O Inonu ainda nao respondeu para este ativo." : `Ultima resposta do Inonu: ${input.answer.word}, ${input.answer.age}${input.answer.fresh ? "" : " (antiga)"}.`,
  });
  return lines;
}
