import { netEdgeBps } from "./edge";
import type { Limits, Opportunity, Portfolio } from "./types";

/** Fechar uma posição já aberta (uma perna de venda): é redução de risco, não exposição nova. */
export const isClosing = (opp: Opportunity): boolean => opp.side === "sell" && opp.legs === 1;

/** Posição aberta neste símbolo, em USD (nunca negativa). */
const heldUsd = (opp: Opportunity, port: Portfolio): number => Math.max(0, port.exposureUsd[opp.symbol] ?? 0);

/** Espaço restante para a posição deste símbolo, em USD. Para quem fecha, o espaço é a própria posição. */
export function positionRoomUsd(opp: Opportunity, port: Portfolio, limits: Limits): number {
  if (isClosing(opp)) return heldUsd(opp, port);
  const held = port.exposureUsd[opp.symbol] ?? 0;
  return Math.max(0, limits.maxPositionPct * port.equityUsd - held);
}

/**
 * Teto de notional. Para abrir: posição, exposição bruta restante e liquidez utilizável. Para fechar: a posição aberta,
 * limitada só pela liquidez; os limites de exposição existem para impedir risco novo e não podem prender uma posição
 * que valorizou além deles.
 */
export function notionalCapUsd(opp: Opportunity, port: Portfolio, limits: Limits): number {
  const liquidity = limits.minLiquidityMultiple > 0 ? opp.liquidityUsd / limits.minLiquidityMultiple : Infinity;
  if (isClosing(opp)) return Math.min(heldUsd(opp, port), liquidity);
  const gross = Object.values(port.exposureUsd).reduce((sum, v) => sum + Math.abs(v), 0);
  const room = Math.max(0, limits.maxGrossExposurePct * port.equityUsd - gross);
  return Math.min(positionRoomUsd(opp, port, limits), room, liquidity);
}

/**
 * Para abrir: Kelly fracionado sobre o edge líquido avaliado no teto (fração = edge / downBps), limitado pelo teto.
 * Para fechar: a posição inteira, até o teto de liquidez, desde que o edge líquido seja positivo.
 * Retorna 0 quando não há edge líquido positivo, não há espaço ou o resultado não é um número finito.
 */
export function sizeUsd(opp: Opportunity, port: Portfolio, limits: Limits): number {
  const cap = notionalCapUsd(opp, port, limits);
  if (!(cap > 0)) return 0;
  const net = netEdgeBps(opp, cap);
  if (!(net > 0)) return 0;
  if (isClosing(opp)) return Number.isFinite(cap) ? cap : 0;
  if (!(opp.downBps > 0)) return 0;
  const size = Math.min(cap, ((limits.kellyFraction * net) / opp.downBps) * Math.max(0, port.equityUsd));
  return Number.isFinite(size) && size > 0 ? size : 0;
}
