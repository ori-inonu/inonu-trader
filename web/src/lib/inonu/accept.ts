/**
 * What "Aceitar" does, by the family of the candidate the model chose (ASK-14, T7.11). In NO family does it send an order: the desk has no
 * order path and the exchange has no order API in this scope. The effect is always a line in the local journal on this machine, which
 * keeps the reason (code-written, never the model free text) for a zone and for a hold, and for a token on-chain also FILLS the draft of the
 * order ticket of the Carteira tab (WAL-7): the network, the token and the side, no amount; the ticket only shows quotes and never sends.
 *
 * Pure: the screen asks what to write and what to say; storage and clock are the caller's.
 */
import { type TicketDraft, draftFromDecision, isTicketCandidate } from "../wallet/ticket";
import type { AskAnswer } from "./client";
import type { JournalEntry } from "./journal";
import { type CandidateKind, candidateKind } from "./view";

export type AcceptFamily = CandidateKind;

export interface AcceptEffect {
  readonly familia: AcceptFamily;
  readonly efeito: "diario" | "diario_com_razao" | "diario_e_ticket";
  /** The order ticket (WAL-7): `preenchido` when Aceitar fills its draft (a token on-chain); null for the families that never go to it. */
  readonly ticket: "preenchido" | null;
  /** Always false, by type: no family sends an order. */
  readonly enviaOrdem: false;
}

const REASON_MAX = 200;

export function acceptEffect(candidateId: string | null): AcceptEffect {
  const familia = candidateKind(candidateId) ?? "manter";
  switch (familia) {
    case "spot":
    case "perp":
      return { familia, efeito: "diario", ticket: null, enviaOrdem: false };
    case "zona":
    case "manter":
      return { familia, efeito: "diario_com_razao", ticket: null, enviaOrdem: false };
    case "token":
      // the ticket is filled only when the draft can be made from the candidate: what the card says must be what happened
      return isTicketCandidate(candidateId) ? { familia, efeito: "diario_e_ticket", ticket: "preenchido", enviaOrdem: false } : { familia, efeito: "diario", ticket: null, enviaOrdem: false };
  }
}

/** The line to write for one click on Aceitar (accepted true) or Ignorar (false). Only documented fields. */
export function journalEntryFor(input: {
  readonly instId: string;
  readonly decisao: NonNullable<AskAnswer["decisao"]>;
  readonly briefHash: string | null;
  readonly accepted: boolean;
  readonly atMs: number;
}): JournalEntry {
  const { decisao } = input;
  const effect = acceptEffect(decisao.candidateId);
  return {
    atMs: input.atMs,
    instId: input.instId,
    action: decisao.action,
    candidateId: decisao.candidateId,
    kind: effect.familia,
    briefHash: input.briefHash,
    accepted: input.accepted,
    modelo: decisao.modelo,
    razao: effect.efeito === "diario_com_razao" ? decisao.razao.slice(0, REASON_MAX) : null,
  };
}

/**
 * The draft of the order ticket that an accepted answer leaves (WAL-7): only for a token on-chain with a side, only when the person accepted, and never with an
 * amount. Ignorar and every other family leave nothing.
 */
export function ticketDraftFor(input: {
  readonly decisao: NonNullable<AskAnswer["decisao"]>;
  readonly briefHash: string | null;
  readonly symbol: string | null;
  readonly accepted: boolean;
  readonly atMs: number;
}): TicketDraft | null {
  if (!input.accepted || acceptEffect(input.decisao.candidateId).ticket !== "preenchido") return null;
  return draftFromDecision({ candidateId: input.decisao.candidateId, action: input.decisao.action, briefHash: input.briefHash, symbol: input.symbol, atMs: input.atMs });
}

export type AcceptResult = "aceita" | "aceita_sem_ticket" | "ignorada";

/**
 * What one click on Aceitar or Ignorar does, as one pure function: the line for the local journal, the draft that fills the ticket (or null) and what the card
 * says. The screen only applies it, so the sentence cannot say a ticket was filled when it was not.
 */
export function acceptOutcome(input: {
  readonly instId: string;
  readonly decisao: NonNullable<AskAnswer["decisao"]>;
  readonly briefHash: string | null;
  readonly symbol: string | null;
  readonly accepted: boolean;
  readonly atMs: number;
}): { readonly entry: JournalEntry; readonly draft: TicketDraft | null; readonly note: AcceptResult } {
  const entry = journalEntryFor({ instId: input.instId, decisao: input.decisao, briefHash: input.briefHash, accepted: input.accepted, atMs: input.atMs });
  const draft = ticketDraftFor({ decisao: input.decisao, briefHash: input.briefHash, symbol: input.symbol, accepted: input.accepted, atMs: input.atMs });
  if (!input.accepted) return { entry, draft, note: "ignorada" };
  return { entry, draft, note: entry.kind === "token" && draft === null ? "aceita_sem_ticket" : "aceita" };
}

/** The sentence under the card once the person clicked: what was written, and that nothing was sent. */
export function acceptNote(familia: AcceptFamily, result: AcceptResult): string {
  if (result === "ignorada") return "Ignorada. Registrado no diario local.";
  if (result === "aceita_sem_ticket") return "Registrado no diario local. O ticket nao foi preenchido: este token nao tem um endereco que o ticket aceite. Nenhuma ordem foi enviada.";
  switch (familia) {
    case "zona":
    case "manter":
      return "Registrado no diario local, com a razao. Nenhuma ordem foi enviada.";
    case "token":
      return "Registrado no diario local e o ticket da aba Carteira foi preenchido. Nenhuma ordem foi enviada.";
    default:
      return "Registrado no diario local. Nenhuma ordem foi enviada.";
  }
}
