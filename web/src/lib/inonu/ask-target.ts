/**
 * What "Pedir ao Inonu" asks about (ASK-2, ASK-4, F2-DIG-4). The desk is on an OKX instrument or, after a pick on the Smart money
 * view or the asset picker, on an on-chain token. The first goes to the exchange reads (mode `ativo`), the second to the OnchainOS
 * gateway (mode `token`); one function builds the request so the two cannot be mixed up. Pure.
 */
import type { AskRequest } from "./client";

export type AskSubject =
  | { readonly kind: "okx"; readonly instId: string }
  | { readonly kind: "token"; readonly chainIndex: string; readonly address: string; readonly symbol: string }
  /** "The best entries now" on one network (ASK-12): the whole network is the subject, from the top bar. */
  | { readonly kind: "descoberta"; readonly chainIndex: string; readonly chainName: string }
  /** The two to five rows the person ticked in the Rastreador, ranked together (RAS-6). */
  | { readonly kind: "ranking"; readonly instIds: readonly string[] };

export function subjectFromFocus(
  instId: string,
  onchainFocus: { readonly chainIndex: string; readonly address: string; readonly symbol: string } | null,
): AskSubject {
  return onchainFocus === null
    ? { kind: "okx", instId }
    : { kind: "token", chainIndex: onchainFocus.chainIndex, address: onchainFocus.address, symbol: onchainFocus.symbol };
}

/** Chain and address only for a token: the symbol is for the person, not for the request. */
export function askRequestFor(subject: AskSubject): AskRequest {
  switch (subject.kind) {
    case "okx":
      return { modo: "ativo", alvo: { instId: subject.instId } };
    case "token":
      return { modo: "token", alvo: { chainIndex: subject.chainIndex, address: subject.address } };
    case "descoberta":
      return { modo: "descoberta", alvo: { chainIndex: subject.chainIndex } };
    case "ranking":
      return { modo: "ranking", alvos: subject.instIds.map((instId) => ({ instId })) };
  }
}

/** The key of the subject: what the answer on screen, the chart marker and the journal belong to. */
export function subjectKey(subject: AskSubject): string {
  switch (subject.kind) {
    case "okx":
      return subject.instId;
    case "token":
      return `token:${subject.chainIndex}:${subject.address}`;
    case "descoberta":
      return `descoberta:${subject.chainIndex}`;
    case "ranking":
      // a set: the same rows ticked in another order are the same subject
      return `ranking:${[...subject.instIds].sort().join(",")}`;
  }
}

/** The text of the button when the click asks something other than the usual question about one instrument or token; undefined otherwise. */
export function askButtonLabel(subject: AskSubject): string | undefined {
  switch (subject.kind) {
    case "descoberta":
      return "Pedir ao Inonu: melhores entradas agora";
    case "ranking":
      return `Pedir ao Inonu: ranquear as ${subject.instIds.length} escolhidas`;
    default:
      return undefined;
  }
}

/**
 * The name the journal line carries. A ranking is about several instruments and the line is about the one the model picked, so that
 * line is findable by it; a pick that is not one of the rows (the model cannot give one, the code checks) falls back to the subject.
 */
export function journalInstId(subject: AskSubject, candidateId: string | null): string {
  if (subject.kind !== "ranking" || candidateId === null) return subjectKey(subject);
  const cut = candidateId.indexOf(":");
  const kind = cut < 0 ? "" : candidateId.slice(0, cut);
  const picked = cut < 0 ? "" : candidateId.slice(cut + 1);
  return (kind === "spot" || kind === "perp") && subject.instIds.includes(picked) ? picked : subjectKey(subject);
}

export function subjectLabel(subject: AskSubject): string {
  switch (subject.kind) {
    case "okx":
      return subject.instId;
    case "token":
      return `${subject.symbol} na rede ${subject.chainIndex}`;
    case "descoberta":
      return `melhores entradas na rede ${subject.chainName}`;
    case "ranking":
      return `ranking de ${subject.instIds.length} ativos escolhidos`;
  }
}
