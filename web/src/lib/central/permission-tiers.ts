// Permission tiers T0, T1, T2-A, T2-B and T2-C, as decided in docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md section 4 (D5)
// and detailed in docs/research/R2-carteira-permissoes-delegacao.md section (e).
//
// This is data for display. It enables nothing: the state of each tier says what this build does today, and no tier can be
// reported as enabled or executing. The execution gate in Market.init() (src/market.ts) is unchanged.

export type TierId = "T0" | "T1" | "T2-A" | "T2-B" | "T2-C";

/** What this build does with the tier today. There is deliberately no "enabled" state. */
export type TierState = "active" | "viable_not_enabled" | "blocked";

export const TIER_STATE_LABEL: Readonly<Record<TierState, string>> = {
  active: "Ativo",
  viable_not_enabled: "Viável, mas não habilitado neste build",
  blocked: "Bloqueado pelo gate do build",
};

export interface PermissionTier {
  id: TierId;
  name: string;
  summary: string;
  allows: string;
  realLimit: string;
  condition: string;
  state: TierState;
  /** Why the tier is not active. Empty only for the active tier. */
  blockers: string[];
  source: string;
}

export const TIERS: readonly PermissionTier[] = [
  {
    id: "T0",
    name: "T0, observar",
    summary: "Observar: contas, saldos e candidatos, sem assinar.",
    allows: "Ler a conta, a rede e os saldos da carteira conectada, ler candidatos e calcular limites. Nenhuma assinatura, aprovação ou envio.",
    realLimit: "Não opera.",
    condition: "Padrão. O pacote do painel não deve conter chamadas de assinatura ou envio.",
    state: "active",
    blockers: [],
    source: "Arquitetura, seção 4 (D5); R2, seção (e)",
  },
  {
    id: "T1",
    name: "T1, humano assina",
    summary: "O Jev propõe um plano; o humano confere e assina na extensão do OKX Wallet.",
    allows: "Financiar o agente com valor exato, aprovar valor exato, revogar e mover entre redes, sempre com a assinatura do dono na extensão.",
    realLimit: "O humano não acompanha blocos de 300 ms: não sustenta \"ordem a cada bloco\".",
    condition: "Plano com hash, decodificação determinística do calldata, conta e rede conferidas antes e depois.",
    state: "viable_not_enabled",
    blockers: [
      "Não habilitado neste build: o pacote do painel não contém chamadas de assinatura ou envio.",
      "A assinatura na extensão precisa ser testada pelo dono com valor mínimo.",
      "O humano não acompanha blocos de 300 ms: serve para capital, parâmetros e revogação, não para a ordem a cada bloco.",
    ],
    source: "Arquitetura, seção 4 (D5); R2, seção (e)",
  },
  {
    id: "T2-A",
    name: "T2-A, agente dedicado",
    summary: "Carteira de agente dedicada, chave própria em cofre, saldo e margem mínimos como teto duro, gate determinístico e kill switch em quatro camadas.",
    allows: "Executar dentro de uma allowlist, só com o saldo da carteira de agente. O saldo é o teto.",
    realLimit: "O teto real é o saldo; o gás também precisa de teto.",
    condition: "Qualificação completa, reconciliação e revisão independente antes de qualquer commit que levante o gate.",
    state: "blocked",
    blockers: [
      "Bloqueada por código em Market.init() até qualificação, reconciliação e revisão independente.",
      "Exige registro de autorização do dono com limites, checklist qualify:live completo e um commit separado que levante o gate (decisão D11).",
    ],
    source: "Arquitetura, seção 4 (D5, D11); R2, seção (d) modelo 1",
  },
  {
    id: "T2-B",
    name: "T2-B, Safe com Roles ou Allowance",
    summary: "Safe com Roles ou Allowance Module na Monad, com allowlist de alvo e seletor on-chain.",
    allows: "Executar com limites aplicados on-chain (alvo e seletor), e o dono revoga por transação.",
    realLimit: "A versão corrigida e auditada do Roles ainda não está confirmada.",
    condition: "Teste em fork, revisão independente e confirmação de que a Kuru aceita um contrato como maker (não confirmado).",
    state: "blocked",
    blockers: [
      "Parcial e de esforço grande: a X Layer não tem Allowance Module nem Roles oficial.",
      "A versão corrigida e auditada do Roles ainda não está confirmada.",
      "Falta teste em fork, revisão independente e confirmar que a Kuru aceita um contrato como maker.",
    ],
    source: "Arquitetura, seção 4 (D5); R2, seção (d) modelo 2",
  },
  {
    id: "T2-C",
    name: "T2-C, Agentic Wallet da OKX",
    summary: "Agentic Wallet da OKX, com limites baixos no portal, só para swaps pontuais fora do laço da Kuru.",
    allows: "Swaps pontuais com limites definidos no portal da OKX; a chave fica em TEE do fornecedor.",
    realLimit: "A política não filtra contrato nem seletor, e onde e como é aplicada e revogada não é documentado.",
    condition: "Teto baixo, plano de saída e revisão do instalador e da CLI.",
    state: "blocked",
    blockers: [
      "A política não filtra contrato nem seletor, e onde e como é aplicada e revogada não é documentado.",
      "A chave fica sob custódia de TEE do fornecedor, sem auditoria independente recuperada.",
      "Falta revisar o instalador e a CLI; latência por bloco não medida e disponibilidade no Brasil não confirmada.",
    ],
    source: "Arquitetura, seção 4 (D5); R2, seção (d) modelo 3",
  },
];

export function tierById(id: TierId): PermissionTier {
  const tier = TIERS.find((entry) => entry.id === id);
  if (!tier) throw new RangeError(`unknown tier: ${id}`);
  return tier;
}

export interface NotViableEntry {
  name: string;
  reason: string;
}

/** The row "Não viáveis hoje" of the architecture table. */
export const NOT_VIABLE_TODAY: readonly NotViableEntry[] = [
  {
    name: "ERC-4337 com chaves de sessão",
    reason: "Esforço grande, bundler da X Layer não confirmado, e custo de gás e latência do UserOp não medidos.",
  },
  {
    name: "EIP-7702 com delegado próprio",
    reason: "O OKX Wallet só documenta o upgrade para o delegado dele; um delegado customizado não está confirmado.",
  },
  {
    name: "ERC-7715 e ERC-7710 no OKX Wallet",
    reason: "Ambos seguem em rascunho e o suporte do OKX Wallet não está documentado.",
  },
  {
    name: "Trader Mode na conta principal",
    reason: "Envia a chave da conta ao TEE do fornecedor, o que contradiz operar sem a chave principal.",
  },
];

export interface AllowlistEntry {
  name: string;
  selector: string;
}

export interface KuruAllowlist {
  market: string;
  allowed: readonly AllowlistEntry[];
  denied: readonly (AllowlistEntry & { target: string })[];
  note: string;
}

/**
 * The allowlist foreseen for a future T2 (architecture section 4 and R2 section (e)). Public contract data, shown for
 * transparency. It is a specification, not code that runs: nothing here is enforced by this page.
 */
export const KURU_ALLOWLIST: KuruAllowlist = {
  market: "0x065C9d28E428A0db40191a54d33d5b7c71a9C394",
  allowed: [
    { name: "batchUpdate", selector: "0x5339c59f" },
    { name: "batchCancelOrders", selector: "0x23afbff3" },
  ],
  denied: [
    { target: "MarginAccount 0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5", name: "withdraw", selector: "0x00f714ce" },
    { target: "MarginAccount 0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5", name: "batchWithdrawMaxTokens", selector: "0x0f163fa8" },
    { target: "MarginAccount 0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5", name: "deposit", selector: "0x8340f549" },
  ],
  note: "Allowlist prevista para um futuro T2, ainda não implementada. Qualquer outro alvo, valor nativo diferente de zero e delegatecall também seriam negados.",
};
