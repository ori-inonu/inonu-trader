import { netEdgeBps } from "./edge";
import type { Limits, Opportunity, Portfolio } from "./types";

/** Espaço restante para a posição deste símbolo, em USD. */
export function positionRoomUsd(opp: Opportunity, port: Portfolio, limits: Limits): number {
  const held = port.exposureUsd[opp.symbol] ?? 0;
  return Math.max(0, limits.maxPositionPct * port.equityUsd - held);
}

/** Teto de notional: posição, exposição bruta restante e liquidez utilizável. */
export function notionalCapUsd(opp: Opportunity, port: Portfolio, limits: Limits): number {
  const gross = Object.values(port.exposureUsd).reduce((sum, v) => sum + Math.abs(v), 0);
  const room = Math.max(0, limits.maxGrossExposurePct * port.equityUsd - gross);
  const liquidity = limits.minLiquidityMultiple > 0 ? opp.liquidityUsd / limits.minLiquidityMultiple : Infinity;
  return Math.min(positionRoomUsd(opp, port, limits), room, liquidity);
}

/**
 * Kelly fracionado sobre o edge líquido avaliado no teto (fração = edge / downBps), limitado pelo teto.
 * Retorna 0 quando não há edge líquido positivo ou não há espaço.
 */
export function sizeUsd(opp: Opportunity, port: Portfolio, limits: Limits): number {
  const cap = notionalCapUsd(opp, port, limits);
  if (!(cap > 0) || !(opp.downBps > 0)) return 0;
  const net = netEdgeBps(opp, cap);
  if (!(net > 0)) return 0;
  const kelly = (limits.kellyFraction * net) / opp.downBps;
  return Math.min(cap, kelly * Math.max(0, port.equityUsd));
}
