import type { Opportunity } from "./types";

/** Edge bruto em bps: acerto ganha upBps, erro perde downBps. */
export function grossEdgeBps(opp: Opportunity): number {
  return opp.pWin * opp.upBps - (1 - opp.pWin) * opp.downBps;
}

/**
 * Custo total em bps de uma operação. Cada campo por perna (taxa do DEX, slippage, impacto, MEV, gas e custo esperado
 * de falha) é pago `legs` vezes; o spread cheio é pago uma vez no ciclo completo e meio spread numa perna só;
 * `exitExtraBps` é da saída e é pago uma vez em qualquer caso. Gas e custo de falha viram bps dividindo pelo
 * notional em USD; sem notional positivo esses termos não existem e só valem os custos de bps.
 */
export function totalCostBps(opp: Opportunity, notionalUsd: number): number {
  const c = opp.costs;
  const legs = opp.legs ?? 2;
  const perLeg = c.dexFeeBps + c.slippageBps + c.impactBps + c.mevBps;
  const spread = legs === 2 ? c.spreadBps : c.spreadBps / 2;
  const bps = legs * perLeg + spread + c.exitExtraBps;
  if (!(notionalUsd > 0)) return bps;
  return bps + ((legs * (c.gasUsd + c.failProb * c.failCostUsd)) / notionalUsd) * 1e4;
}

/**
 * Custo esperado da perna de entrada, em bps do notional: o que a execução cobra de fato naquele envio
 * (taxa do DEX, slippage, impacto, MEV, meio spread, gas e custo esperado de falha). Serve à reconciliação.
 */
export function expectedLegCostBps(opp: Opportunity, notionalUsd: number): number {
  const c = opp.costs;
  const bps = c.dexFeeBps + c.slippageBps + c.impactBps + c.mevBps + c.spreadBps / 2;
  return notionalUsd > 0 ? bps + ((c.gasUsd + c.failProb * c.failCostUsd) / notionalUsd) * 1e4 : bps;
}

/** Edge líquido em bps para um notional dado. */
export function netEdgeBps(opp: Opportunity, notionalUsd: number): number {
  return grossEdgeBps(opp) - totalCostBps(opp, notionalUsd);
}

/**
 * Probabilidade de acerto mínima para que o edge líquido atinja `targetNetBps`, dados os movimentos e o custo em bps.
 * Resolve pWin*up - (1-pWin)*down - cost = target. Acima de 1 significa que nenhuma probabilidade basta;
 * abaixo de 0 significa que basta qualquer uma (o custo é coberto até errando).
 */
export function requiredPWin(upBps: number, downBps: number, costBps: number, targetNetBps: number): number {
  return (targetNetBps + costBps + downBps) / (upBps + downBps);
}
