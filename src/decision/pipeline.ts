import { grossEdgeBps, totalCostBps } from "./edge";
import { checkLimits } from "./controls";
import { isClosing, notionalCapUsd, positionRoomUsd, sizeUsd } from "./sizing";
import { invalidFields, invalidLimits, invalidPortfolio } from "./validate";
import type {
  Action,
  Decision,
  Limits,
  Opportunity,
  Portfolio,
  Reason,
  StageName,
  StageTrace,
} from "./types";

/**
 * Pipeline puro: filtro, edge, sizing e controles, nessa ordem. Para na primeira etapa com motivo.
 * Dado inválido (campo não finito ou fora do domínio) é recusado antes de qualquer conta, com `bad_data`.
 * Custos em bps são avaliados no teto de notional, que é cota superior do edge: custo por notional só cai com o tamanho. O edge final é recalculado no tamanho final.
 */
export function evaluate(
  opp: Opportunity,
  port: Portfolio,
  limits: Limits,
  clock: { now(): number },
): Decision {
  const now = clock.now();
  const stages: StageTrace[] = [];
  if (invalidFields(opp).length + invalidPortfolio(port).length + invalidLimits(limits).length > 0) {
    return { action: "NAO_OPERAR", id: String(opp.id), symbol: String(opp.symbol), sizeUsd: 0, grossEdgeBps: 0, costBps: 0, netEdgeBps: 0, reasons: ["bad_data"], stages: [{ name: "filtro", ok: false, reason: "bad_data", ms: 0 }] };
  }
  const closing = isClosing(opp);
  const cap = notionalCapUsd(opp, port, limits);
  const gross = grossEdgeBps(opp);
  // Cota superior: no teto o custo por notional é o menor possível. Se já falha aqui, nenhum tamanho passa.
  let cost = totalCostBps(opp, cap);
  let net = gross - cost;
  let size = 0;

  const timed = (name: StageName, run: () => Reason[]): Reason[] => {
    const t0 = clock.now();
    const reasons = run();
    const ms = clock.now() - t0;
    stages.push(reasons.length > 0 ? { name, ok: false, reason: reasons[0], ms } : { name, ok: true, ms });
    return reasons;
  };

  const decide = (action: Action, reasons: readonly Reason[]): Decision => ({
    action,
    id: opp.id,
    symbol: opp.symbol,
    sizeUsd: size,
    grossEdgeBps: gross,
    costBps: cost,
    netEdgeBps: net,
    reasons,
    stages,
  });

  const filtro = timed("filtro", () => {
    const r: Reason[] = [];
    if (port.executorAvailable === false) r.push("executor_unavailable");
    if (opp.blocked !== undefined) r.push("blocked_token");
    if (opp.riskScore > limits.maxRiskScore) r.push("risk_score_high");
    if (now - opp.quoteAtMs > limits.maxQuoteAgeMs) r.push("quote_stale");
    // Quem fecha vende até onde a liquidez deixa (o teto de notional cuida disso): liquidez rasa não prende a saída.
    if (!closing && opp.liquidityUsd < limits.minLiquidityMultiple * positionRoomUsd(opp, port, limits)) r.push("liquidity_thin");
    if (opp.costs.slippageBps > limits.maxSlippageBps) r.push("slippage_over_cap");
    if (opp.costs.gasUsd > limits.maxGasUsd) r.push("gas_over_cap");
    if (limits.minGasBalanceUsd !== undefined && !(port.gasBalanceUsd !== undefined && port.gasBalanceUsd >= limits.minGasBalanceUsd)) r.push("gas_balance_low");
    // Correlação limita risco novo: não vale para fechar uma posição. Valor não finito é dado ruim, nunca "sem correlação".
    if (!closing) {
      const corr = Object.entries(port.exposureUsd)
        .filter(([s, v]) => v !== 0 && s !== opp.symbol)
        .map(([s]) => port.correlation(opp.symbol, s));
      if (corr.some((c) => !Number.isFinite(c))) r.push("bad_data");
      else if (corr.some((c) => Math.abs(c) > limits.maxCorrelation)) r.push("correlation_high");
    }
    return r;
  });
  if (filtro.length > 0) return decide("NAO_OPERAR", filtro);

  const edge = timed("edge", () => {
    if (net <= 0) return ["no_edge"];
    if (net < limits.minNetEdgeBps) return ["edge_below_min"];
    return [];
  });
  if (edge.length > 0) return decide("NAO_OPERAR", edge);

  const sizing = timed("sizing", () => {
    size = sizeUsd(opp, port, limits);
    if (!(size > 0)) return ["size_zero"];
    // Custos recalculados no tamanho final: gas e falha pesam mais em bps quando o notional é menor.
    cost = totalCostBps(opp, size);
    net = gross - cost;
    if (net <= 0) return ["no_edge"];
    if (net < limits.minNetEdgeBps) return ["edge_below_min"];
    return [];
  });
  if (sizing.length > 0) return decide("NAO_OPERAR", sizing);

  const controles = timed("controles", () => {
    const r = checkLimits(size, opp.symbol, port, limits, closing);
    return r === "ok" ? [] : [r];
  });
  if (controles.length > 0) return decide("NAO_OPERAR", controles);

  return decide(opp.side === "buy" ? "COMPRAR" : "VENDER", ["ok"]);
}
