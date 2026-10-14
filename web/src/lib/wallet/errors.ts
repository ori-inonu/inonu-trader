/**
 * What a person is told when the wallet extension refuses or fails (T9.1, WAL-1). The wallet gives a numeric code (the ones EIP-1193
 * defines, plus 4902 for an unknown network and -32002 for a request already waiting, which the extensions add). The text is ours, in
 * plain words with what to do next; the message the wallet wrote is never shown or kept, because it can carry anything.
 *
 * Pure: no clock, no network, no storage, and it cannot ask the wallet for anything.
 */

export type WalletErrorKind =
  | "recusado"
  | "nao_autorizado"
  | "metodo_nao_suportado"
  | "desconectado"
  | "rede_desconectada"
  | "rede_desconhecida"
  | "pedido_pendente"
  | "invalido"
  | "interno"
  | "tempo_esgotado"
  | "rede_nao_confirmada"
  | "desconhecido";

export interface WalletErrorInfo {
  readonly kind: WalletErrorKind;
  /** The numeric code the wallet gave; null when it gave none. */
  readonly code: number | null;
  readonly text: string;
}

/** Our own timeout: the wallet did not answer in the time we allowed. */
export class WalletTimeoutError extends Error {
  constructor() {
    super("wallet_timeout");
  }
}

const TEXT: Readonly<Record<WalletErrorKind, string>> = {
  recusado: "Voce recusou o pedido na carteira. Nada foi alterado",
  nao_autorizado: "A carteira ainda nao autorizou este site. Autorize a conexao na extensao e tente de novo",
  metodo_nao_suportado: "Esta carteira nao suporta esta operacao",
  desconectado: "A carteira esta desconectada. Conecte e tente de novo",
  rede_desconectada: "A carteira perdeu a conexao com a rede. Tente de novo em instantes",
  rede_desconhecida: "A carteira nao conhece esta rede. Ela pode ser adicionada com a sua confirmacao",
  pedido_pendente: "A carteira ja esta esperando uma resposta sua. Abra a carteira e responda ao pedido anterior",
  invalido: "A carteira recusou os dados do pedido",
  interno: "A carteira falhou por dentro. Tente de novo",
  tempo_esgotado: "A carteira nao respondeu a tempo. Abra a carteira e tente de novo",
  rede_nao_confirmada: "A carteira nao confirmou a rede escolhida. Selecione a rede na carteira e atualize",
  desconhecido: "A carteira recusou ou falhou. Tente de novo",
};

const KIND_OF_CODE: ReadonlyMap<number, WalletErrorKind> = new Map([
  [4001, "recusado"],
  [4100, "nao_autorizado"],
  [4200, "metodo_nao_suportado"],
  [-32601, "metodo_nao_suportado"],
  [4900, "desconectado"],
  [4901, "rede_desconectada"],
  [4902, "rede_desconhecida"],
  [-32002, "pedido_pendente"],
  [-32602, "invalido"],
  [-32603, "interno"],
]);

export const walletError = (kind: WalletErrorKind, code: number | null = null): WalletErrorInfo => ({ kind, code, text: TEXT[kind] });

function codeOf(error: unknown): number | null {
  try {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "number" && Number.isInteger(code) ? code : null;
  } catch {
    return null;
  }
}

/** The kind, the code and our text for whatever the wallet threw. Nothing of the wallet message survives. */
export function classifyWalletError(error: unknown): WalletErrorInfo {
  try {
    if (error instanceof WalletTimeoutError) return walletError("tempo_esgotado");
  } catch {
    // a hostile value: fall through to the code
  }
  const code = codeOf(error);
  const kind = code === null ? undefined : KIND_OF_CODE.get(code);
  return walletError(kind ?? "desconhecido", code);
}
