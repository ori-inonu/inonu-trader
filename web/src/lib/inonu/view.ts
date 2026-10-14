/**
 * What the desk SAYS about a request to Inonu (ASK-7, ASK-9, ASK-10). Plain ASCII; no dash and no middle dot. Inonu is the
 * assistant; Jev appears only as the model behind it. The wording of a decision is the model's own (comprar, vender,
 * manter): the engine never produces those words, only the model does, and only after a click.
 */
import type { AskAnswer, AskDecision } from "./client";

export type CandidateKind = "zona" | "token" | "spot" | "perp" | "manter";

export function candidateKind(id: string | null): CandidateKind | null {
  if (id === null || id === "manter") return "manter";
  const head = id.split(":", 1)[0];
  return head === "zona" || head === "token" || head === "spot" || head === "perp" ? head : null;
}

export function describeCandidate(id: string | null): string {
  if (id === null || id === "manter") return "nenhum candidato";
  const cut = id.indexOf(":");
  if (cut < 0) return id;
  const kind = id.slice(0, cut);
  const rest = id.slice(cut + 1);
  if (kind === "spot") return `spot ${rest}`;
  if (kind === "perp") return `perpetuo ${rest}`;
  if (kind === "zona") return `a zona ${rest.slice(0, 6)}`;
  if (kind === "token") {
    const at = rest.indexOf(":");
    if (at < 0) return id;
    const chain = rest.slice(0, at);
    const address = rest.slice(at + 1);
    return `o token ${address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address} (rede ${chain})`;
  }
  return id;
}

const ACTION_WORD = { buy: "comprar", sell: "vender", hold: "esperar" } as const;

export function decisionHeadline(decision: AskDecision): string {
  return decision.action === "hold" ? "Inonu decidiu esperar" : `Inonu decidiu ${ACTION_WORD[decision.action]} ${describeCandidate(decision.candidateId)}`;
}

const MOTIVO: Readonly<Record<string, string>> = {
  sem_chave: "Configure a chave do modelo em Configuracoes",
  teto_por_pedido: "Limite de custo por pedido atingido. Nada foi enviado ao modelo",
  teto_diario: "Limite de custo do dia atingido. Nada foi enviado ao modelo",
  teto_de_chamadas: "Limite de pedidos do dia atingido. Nada foi enviado ao modelo",
  teto_onchainos: "Limite de chamadas ao OnchainOS por pedido atingido. Nada foi enviado ao modelo",
  cooldown: "Espere alguns segundos antes de pedir de novo",
  em_andamento: "Ja existe um pedido em andamento",
  tempo_esgotado: "O modelo nao respondeu a tempo",
  modelo_falhou: "O modelo falhou. Tente de novo",
  coleta_falhou: "Nao foi possivel ler o mercado agora",
  pedido_invalido: "Pedido invalido",
  modo_nao_disponivel: "Este tipo de pedido ainda nao esta disponivel",
  alvo_invalido: "Ativo invalido para o pedido",
  instrumento_nao_suportado: "Este ativo ainda nao e suportado pelo Inonu",
  brief_grande_demais: "Os dados do pedido ficaram grandes demais",
  sem_candidatos: "Nao ha candidatos legiveis agora. Nada foi enviado ao modelo",
  saldo_vencido: "O saldo lido ficou velho. Leia de novo e peca outra vez. Nada foi enviado ao modelo",
  sem_sinais: "A rede nao tem sinais de carteiras rastreadas agora. Nada foi enviado ao modelo",
  sem_dados_onchain: "A OnchainOS nao devolveu dados agora. Nada foi enviado ao modelo",
  sem_credencial_onchainos: "Falta a credencial da OnchainOS em Configuracoes. Nada foi enviado ao modelo",
  servidor_sem_rota: "Esta consulta nao esta disponivel no servidor conectado. Verifique a conexao em Diagnostico",
  origem_negada: "O servidor local recusou o pedido desta origem. Abra a mesa pelo Inonu Trader",
  sem_conexao: "Sem conexao com o servidor local",
  resposta_invalida: "O servidor respondeu algo inesperado",
  servidor_com_erro: "O servidor local falhou. Tente de novo",
  cancelado: "Pedido cancelado",
};

export function motivoText(motivo: string | undefined): string {
  if (motivo === undefined) return "Nao foi possivel pedir agora";
  const known = MOTIVO[motivo];
  if (known !== undefined) return known;
  if (motivo.startsWith("resposta_invalida:")) return "A resposta do modelo foi descartada porque nao seguia o formato";
  if (motivo.startsWith("okx_")) return `A OKX nao respondeu agora (${motivo.replace(/[^a-z0-9_]/g, "")})`;
  return "Nao foi possivel pedir agora";
}

export type AskViewState =
  | { readonly phase: "idle" }
  | { readonly phase: "asking" }
  | { readonly phase: "answered"; readonly answer: AskAnswer; readonly atMs: number }
  | { readonly phase: "failed"; readonly answer: AskAnswer };

export function stateLine(state: AskViewState, nowMs: number): string {
  switch (state.phase) {
    case "idle":
      return "Sem pedido";
    case "asking":
      return "Perguntando ao Inonu";
    case "failed":
      return motivoText(state.answer.motivo ?? state.answer.status);
    case "answered": {
      const age = Math.max(0, nowMs - state.atMs);
      if (age < 60_000) return "Inonu respondeu ha menos de 1 min";
      if (age < 3_600_000) return `Inonu respondeu ha ${Math.floor(age / 60_000)} min`;
      return `Inonu respondeu ha ${Math.floor(age / 3_600_000)} h`;
    }
  }
}

export function costLine(custo: AskAnswer["custo"]): string {
  if (custo.tokens === 0 && custo.usd === 0) return "resposta reaproveitada, sem custo";
  if (custo.tokens === null) return "tokens e custo nao medidos";
  if (custo.usd === null) return `${custo.tokens} tokens, custo em dolar nao medido`;
  return `${custo.tokens} tokens, US$ ${custo.usd.toFixed(custo.usd < 0.01 ? 4 : 2).replace(".", ",")}`;
}
