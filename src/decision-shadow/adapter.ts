import type { ClosingRecord } from "../agent/closing";
import type { Costs, Opportunity, Portfolio } from "../decision/types";

/**
 * Ponte entre o ciclo de produção e o motor de decisão: monta uma Opportunity a partir de um ClosingRecord real (a compra
 * em que o modelo se inclinou, com a cotação de entrada lida e o plano de alvo e stop). Campo que o registro não traz NÃO é
 * preenchido: a oportunidade volta como não avaliável, com a lista do que faltou. O que o motor precisa e a produção não mede
 * entra como premissa explícita, versionada e conservadora (custo maior, nunca menor), registrada junto de cada avaliação.
 */
export interface ShadowAssumptions {
  readonly version: string;
  /** Horizonte da aposta. O plano da produção não declara prazo: 1 hora, a escala da volatilidade horária do brief. */
  readonly horizonMs: number;
  /** Slippage da execução contra a cotação, por perna: p95 medido em 15 execuções reais (ver baseline-audit). */
  readonly slippageBps: number;
  /** MEV e seleção adversa por perna: sem medida, valor conservador. */
  readonly mevBps: number;
  /** Probabilidade de a tentativa falhar por motivo que não é do ambiente (simulação, impacto): sem medida segura, valor conservador. */
  readonly failProb: number;
  /** Falha de simulação não chega a ser enviada, então não queima gas. */
  readonly failCostUsd: number;
}

export const SHADOW_ASSUMPTIONS: ShadowAssumptions = { version: "shadow-v1", horizonMs: 3_600_000, slippageBps: 10.6, mevBps: 10, failProb: 0.1, failCostUsd: 0 };

export type Adapted =
  | { readonly ok: true; readonly opportunity: Opportunity; readonly notes: readonly string[] }
  | { readonly ok: false; readonly missing: readonly string[] };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * @param pWin probabilidade de ganho já decidida pelo chamador (calibrada, ou bruta e marcada como tal); null quando não existe.
 */
export function opportunityFromClosing(record: ClosingRecord, pWin: number | null, assumptions: ShadowAssumptions = SHADOW_ASSUMPTIONS): Adapted {
  const missing: string[] = [];
  const quote = record.quote;
  const brief = record.brief;
  const cand = rec(brief?.cand);
  const facts = rec(quote?.facts);
  const plano = rec(brief?.plano);

  if (quote === null) missing.push("quote");
  if (brief === null) missing.push("brief");
  const impactPct = num(facts.impactPct);
  const tradeFee = facts.feeUnit === "usd" ? num(facts.tradeFee) : null;
  const taxBuy = num(facts.taxToPct);
  const liquidityK = num(cand.l);
  const risk = num(cand.r);
  const alvo = num(plano.alvo);
  const stop = num(plano.stop);
  if (quote !== null && impactPct === null) missing.push("quote.impactPct");
  if (quote !== null && tradeFee === null) missing.push("quote.tradeFee");
  if (quote !== null && taxBuy === null) missing.push("quote.taxToPct");
  if (brief !== null && liquidityK === null) missing.push("cand.l");
  if (brief !== null && risk === null) missing.push("cand.r");
  if (brief !== null && (alvo === null || alvo <= 0 || stop === null || stop <= 0)) missing.push("plano");
  if (pWin === null) missing.push("pWin");
  if (missing.length > 0 || quote === null || impactPct === null || tradeFee === null || taxBuy === null || liquidityK === null || risk === null || alvo === null || stop === null || pWin === null) {
    return { ok: false, missing };
  }

  const impactBps = Math.abs(impactPct) * 100;
  const taxBps = Math.max(0, taxBuy) * 100;
  const costs: Costs = {
    // A taxa do pool já está no impacto cotado; aqui entra só o imposto de compra do token.
    dexFeeBps: taxBps,
    spreadBps: 0,
    slippageBps: assumptions.slippageBps,
    impactBps,
    mevBps: assumptions.mevBps,
    // A saída não foi cotada: assume o mesmo impacto e o mesmo imposto da entrada.
    exitExtraBps: impactBps + taxBps,
    gasUsd: Math.max(0, tradeFee),
    failProb: assumptions.failProb,
    failCostUsd: assumptions.failCostUsd,
  };
  const blocked = quote.honeypot?.to === true ? "honeypot" : quote.disposition === "provider_block" ? "provider_block" : undefined;
  const opportunity: Opportunity = {
    id: `${record.cycleId}:${record.candidateId}`,
    venue: "okx-dex",
    chain: quote.chainIndex,
    symbol: typeof cand.s === "string" && cand.s !== "" ? cand.s : "token",
    side: "buy",
    legs: 2,
    atMs: Math.max(record.atMs, quote.receivedAtMs),
    quoteAtMs: quote.receivedAtMs,
    upBps: alvo * 100,
    downBps: stop * 100,
    pWin,
    horizonMs: assumptions.horizonMs,
    liquidityUsd: liquidityK * 1000,
    riskScore: Math.min(1, Math.max(0, risk / 5)),
    ...(blocked === undefined ? {} : { blocked }),
    costs,
  };
  return {
    ok: true,
    opportunity,
    notes: [
      `horizonte ${assumptions.horizonMs / 60_000} min (premissa)`,
      `slippage ${assumptions.slippageBps} bps por perna (p95 medido na execução real)`,
      `mev ${assumptions.mevBps} bps por perna (premissa)`,
      `falha ${assumptions.failProb} (premissa)`,
      "saída com o mesmo impacto e imposto da entrada (premissa)",
    ],
  };
}

/**
 * Carteira derivada do próprio registro: a patrimônio sai do tamanho da compra e da fração da carteira que ele representa.
 * O que o registro não traz (perda do dia, pico, demais posições) entra neutro e fica declarado; serve à sombra, nunca à execução.
 */
export function derivePortfolio(record: ClosingRecord): { readonly portfolio: Portfolio; readonly notes: readonly string[] } | null {
  const quote = record.quote;
  const cart = num(record.brief?.tam.cart);
  const cand = rec(record.brief?.cand);
  if (quote === null || cart === null || cart <= 0) return null;
  const decimals = quote.fromDecimals;
  const size = Number(quote.fromAmountMinor) / 10 ** decimals;
  if (!Number.isFinite(size) || size <= 0) return null;
  const equity = size / (cart / 100);
  const heldPct = num(cand.y) ?? 0;
  const symbol = typeof cand.s === "string" && cand.s !== "" ? cand.s : "token";
  return {
    portfolio: { equityUsd: equity, peakEquityUsd: equity, cashUsd: equity, dayPnlUsd: 0, exposureUsd: heldPct > 0 ? { [symbol]: (heldPct / 100) * equity } : {}, correlation: () => 0 },
    notes: ["patrimônio derivado do tamanho e da fração da carteira", "perda do dia, pico e demais posições neutros (não constam do registro)"],
  };
}
