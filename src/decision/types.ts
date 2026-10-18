/**
 * Contrato do motor de decisão local. Puro: sem rede, disco, relógio global, aleatoriedade ou segredos.
 * Unidades: preço em USD; custos e edge em bps do notional (1 bp = 0,01%); valores em USD; tempo em ms.
 * A decisão só lê o que já está em memória; aquisição de dados e confirmação on-chain ficam fora dela.
 * Este módulo não tem caminho de assinatura ou transmissão: só os modos replay e paper existem.
 */

export type Action = "COMPRAR" | "VENDER" | "NAO_OPERAR";
export type Mode = "replay" | "paper";
export type Side = "buy" | "sell";

/**
 * Custos de UMA perna. Uma operação completa tem duas pernas (entrada e saída, `legs: 2`) e paga cada campo por perna
 * duas vezes, salvo `spreadBps` (spread cheio, pago uma vez no ciclo; meio spread numa perna só) e `exitExtraBps`
 * (só na saída, uma vez). Quem apenas fecha uma posição já aberta usa `legs: 1`: a entrada é custo afundado.
 */
export interface Costs {
  readonly dexFeeBps: number;
  readonly spreadBps: number;
  readonly slippageBps: number;
  readonly impactBps: number;
  /** MEV e seleção adversa esperados. */
  readonly mevBps: number;
  /** Imposto de token, impacto extra de venda, custo de sair da posição. */
  readonly exitExtraBps: number;
  /** Gas por perna, em USD. */
  readonly gasUsd: number;
  /** Probabilidade [0,1] de a tentativa falhar ou reverter, e o que a falha custa em USD (gas queimado). */
  readonly failProb: number;
  readonly failCostUsd: number;
}

export interface Opportunity {
  /** Chave de idempotência: a mesma oportunidade sempre tem o mesmo id. */
  readonly id: string;
  /** Pernas a pagar: 2 (padrão) para abrir e fechar dentro do horizonte, 1 para só fechar uma posição existente. */
  readonly legs?: 1 | 2;
  readonly venue: string;
  readonly chain: string;
  readonly symbol: string;
  readonly side: Side;
  readonly atMs: number;
  /** Instante da cotação; a validade se mede contra `atMs`. */
  readonly quoteAtMs: number;
  /**
   * Preço de referência em USD. A decisão NÃO o usa; só o envio (preço-limite da ordem). Ausente é permitido para
   * decidir sem enviar (modo sombra); o runner recusa com bad_data uma ordem sem preço. Presente, tem de ser > 0.
   */
  readonly priceUsd?: number;
  /** Movimento favorável esperado se acertar, e adverso se errar, ambos em bps positivos. */
  readonly upBps: number;
  readonly downBps: number;
  /** Probabilidade calibrada [0,1] de acertar dentro do horizonte. */
  readonly pWin: number;
  readonly horizonMs: number;
  /** Profundidade utilizável em USD. */
  readonly liquidityUsd: number;
  /** Risco do token e do contrato, [0,1], 1 é o pior. */
  readonly riskScore: number;
  /** Motivo fatal vindo do conector (honeypot, lista negra). Presente => nunca opera. */
  readonly blocked?: string;
  readonly costs: Costs;
}

export interface Portfolio {
  readonly equityUsd: number;
  readonly peakEquityUsd: number;
  readonly cashUsd: number;
  /** Saldo de gas (token nativo da cadeia) em USD. Ausente: o controle de saldo, quando ligado, recusa. */
  readonly gasBalanceUsd?: number;
  /** O executor consegue cotar e enviar agora (saída do breaker de executor). Ausente conta como disponível. */
  readonly executorAvailable?: boolean;
  /** Resultado do dia em USD (negativo é perda). */
  readonly dayPnlUsd: number;
  /** Exposição aberta por símbolo, em USD. */
  readonly exposureUsd: Readonly<Record<string, number>>;
  /** Correlação [-1,1] entre dois símbolos; 1 para o mesmo símbolo. */
  readonly correlation: (a: string, b: string) => number;
}

export interface Limits {
  readonly minNetEdgeBps: number;
  readonly maxQuoteAgeMs: number;
  readonly maxSlippageBps: number;
  readonly maxGasUsd: number;
  /** Saldo mínimo de gas em USD. Ausente: o controle fica desligado. */
  readonly minGasBalanceUsd?: number;
  readonly maxRiskScore: number;
  /** Liquidez utilizável deve ser pelo menos este múltiplo do tamanho. */
  readonly minLiquidityMultiple: number;
  readonly maxPositionPct: number;
  readonly maxGrossExposurePct: number;
  readonly maxDayLossPct: number;
  readonly maxDrawdownPct: number;
  /** Acima desta correlação absoluta com exposição já aberta, o tamanho é reduzido ou a operação recusada. */
  readonly maxCorrelation: number;
  /** Fração de Kelly aplicada ao sizing (0..1). */
  readonly kellyFraction: number;
}

/** Códigos estáveis de motivo, para log, painel e teste. */
export type Reason =
  | "blocked_token" | "risk_score_high" | "quote_stale" | "liquidity_thin" | "slippage_over_cap" | "gas_over_cap"
  | "no_edge" | "edge_below_min" | "size_zero" | "exposure_limit" | "correlation_high"
  | "day_loss_limit" | "drawdown_limit" | "duplicate" | "breaker_open" | "live_disabled"
  | "bad_data" | "gas_balance_low" | "executor_unavailable" | "audit_unavailable" | "ok";

export type StageName = "filtro" | "edge" | "sizing" | "controles";

export interface StageTrace {
  readonly name: StageName;
  readonly ok: boolean;
  readonly reason?: Reason;
  /** Duração da etapa em ms, medida com o relógio injetado. */
  readonly ms: number;
}

export interface Decision {
  readonly action: Action;
  readonly id: string;
  readonly symbol: string;
  readonly sizeUsd: number;
  readonly grossEdgeBps: number;
  readonly costBps: number;
  readonly netEdgeBps: number;
  /** NAO_OPERAR sempre traz ao menos um motivo diferente de "ok". */
  readonly reasons: readonly Reason[];
  readonly stages: readonly StageTrace[];
}

/** Execução desacoplada da decisão. Só replay e paper; não existe porta live neste módulo. */
export interface Order {
  readonly id: string;
  readonly symbol: string;
  readonly side: Side;
  readonly sizeUsd: number;
  readonly limitPriceUsd: number;
  /** Sequência monotônica por porta; reuso do mesmo id nunca gera segunda ordem. */
  readonly nonce: number;
}

export interface Fill {
  readonly id: string;
  readonly status: "filled" | "rejected" | "failed";
  readonly fillPriceUsd: number;
  readonly feeUsd: number;
  readonly gasUsd: number;
  readonly slippageBps: number;
  /** Motivo da recusa ou falha, em código estável do executor (ex.: gas_station_pendente). Ausente em fill. */
  readonly reason?: string;
}

/** Custo da perna de entrada: o que a decisão supôs contra o que a execução cobrou, em bps do tamanho. */
export interface Reconciliation {
  readonly id: string;
  readonly sizeUsd: number;
  readonly expectedLegCostBps: number;
  readonly realizedLegCostBps: number;
  /** Realizado menos esperado: positivo é custo maior que o previsto. */
  readonly errorBps: number;
}

export interface ExecutionPort {
  readonly mode: Mode;
  submit(order: Order): Promise<Fill>;
}

/** Linha de `data/decision-reasons.jsonl`: append-only, uma por decisão, sem segredos nem endereços completos. */
export interface ReasonRecord {
  readonly v: 1;
  readonly tsMs: number;
  readonly mode: Mode;
  readonly venue: string;
  readonly chain: string;
  readonly decision: Decision;
  readonly fill?: Fill;
  readonly reconciliation?: Reconciliation;
}
