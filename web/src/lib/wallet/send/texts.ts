/**
 * The words of the order panel that are more than a label: what the gateway's errors mean for an order, how a step ended, and how the person sees the state of the permission. Plain ASCII, no middle dot, no dash,
 * no order word written by the code (the panel says "compra" and "troca"; a decision is the model's, and it is in the picks above).
 */
import type { TradeError } from "./trade-client";
import type { TradeResult } from "./log";
import type { TradeSettings } from "./settings";

const ERROR_TEXT: Readonly<Record<TradeError, string>> = {
  no_credentials: "Falta a credencial da OnchainOS em Configuracoes. Nada foi pedido",
  incomplete_credentials: "A credencial da OnchainOS esta incompleta em Configuracoes. Nada foi pedido",
  budget_exhausted: "O limite de leituras da OnchainOS acabou por agora. Nada foi pedido",
  pace_limited: "Muitos pedidos em sequencia. Espere alguns segundos e revise de novo",
  rate_limited: "A OnchainOS pediu para esperar. Revise de novo em instantes",
  provider_unauthorized: "A OnchainOS recusou a credencial. Confira em Configuracoes",
  provider_payment_required: "O teste gratuito da Trade API acabou. O app nao paga: a ordem nao pode ser montada",
  provider_error: "A OnchainOS nao respondeu agora. Revise de novo em instantes",
  schema: "A resposta do provedor veio fora do formato esperado. Nada foi enviado",
  unsupported_chain: "Esta rede nao e atendida pelo provedor para trocas",
  clock_skew: "O relogio do Windows esta fora de hora e o provedor recusou o pedido. Sincronize a hora e tente de novo",
  bad_request: "O pedido da ordem ficou invalido. Confira o tamanho e a moeda",
  network: "Sem conexao com o servidor local",
  backend_stale: "O servidor local conectado nao tem a rota de ordens. Abra a mesa pelo Inonu Trader atualizado",
  origin_denied: "O servidor local recusou o pedido desta origem. Abra a mesa pelo Inonu Trader",
  sem_cotacao: "O provedor nao tem cotacao para este tamanho",
  sem_transacao: "O provedor nao montou uma transacao para este tamanho. Tente outro tamanho",
};

export function tradeErrorText(error: TradeError): string {
  return ERROR_TEXT[error] ?? "Nao foi possivel montar a ordem agora";
}

const RESULT_TEXT: Readonly<Record<TradeResult, string>> = {
  pendente: "Aberta na carteira: responda la. Enquanto isso ela conta no seu teto do dia",
  recusada: "Recusada na carteira",
  enviada: "Enviada, esperando a rede confirmar",
  confirmada: "Confirmada na rede",
  revertida: "A rede confirmou que falhou: nada foi trocado e a taxa de rede foi paga",
  falhou: "Falhou antes de sair da carteira",
  sem_recibo: "Enviada, e a rede ainda nao confirmou. Confira o codigo na carteira",
};

export function resultText(result: TradeResult): string {
  return RESULT_TEXT[result];
}

/** The state of the permission in one phrase, for the head of the panel and of Configuracoes. */
export function permissionLine(settings: TradeSettings): string {
  if (settings.killed) return "Parado";
  if (!settings.enabled) return "Desligado";
  if (settings.perOperationUsd === null || settings.dailyUsd === null) return "Ligado, sem tetos: nada sera enviado";
  return "Ligado";
}
