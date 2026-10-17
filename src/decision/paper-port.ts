import { assertPaperOrReplay } from "./controls";
import type { ExecutionPort, Fill, Mode, Order } from "./types";

export interface PaperPortOptions {
  readonly mode: Mode;
  /** Preço executável da ordem agora, ou undefined quando não há (a ordem é recusada). Em replay lê a série gravada. */
  priceFor(order: Order): number | undefined;
  /** Taxa cobrada sobre o tamanho, em bps. */
  readonly feeBps: number;
  /** Gas por envio, em USD, cobrado também quando o envio falha. */
  readonly gasUsd: number;
  /** Slippage adverso simulado, em bps do preço. Padrão 0. */
  slippageBps?(order: Order): number;
  /** Motivo de falha do envio (gas queimado, sem fill), ou undefined quando o envio funciona. */
  failure?(order: Order): string | undefined;
}

export interface PaperPnl {
  readonly realizedUsd: number;
  readonly feesUsd: number;
  readonly gasUsd: number;
  readonly open: Readonly<Record<string, { readonly units: number; readonly costUsd: number }>>;
}

export interface PaperPort extends ExecutionPort {
  fills(): readonly Fill[];
  pnl(): PaperPnl;
}

/**
 * Porta de execução simulada (paper ou replay). Não assina, não transmite e não tem caminho para o modo live:
 * `assertPaperOrReplay` recusa qualquer outro modo. Idempotente por id (reenviar devolve o mesmo fill, nunca outro) e
 * o nonce tem de ser exatamente o seguinte ao último aceito. Preço pior que o limite da ordem é recusado.
 */
export function createPaperPort(options: PaperPortOptions): PaperPort {
  assertPaperOrReplay(options.mode);
  const done = new Map<string, Fill>();
  const list: Fill[] = [];
  const positions = new Map<string, { units: number; costUsd: number }>();
  let lastNonce = 0;
  let realized = 0;
  let fees = 0;
  let gas = 0;

  const settle = (fill: Fill): Fill => {
    done.set(fill.id, fill);
    list.push(fill);
    return fill;
  };
  /** Recusa. Só recusas definitivas guardam o id; erro de nonce é do chamador e pode ser reenviado com o nonce certo. */
  const refuse = (order: Order, reason: string, keep = true): Fill => {
    const fill: Fill = { id: order.id, status: "rejected", fillPriceUsd: 0, feeUsd: 0, gasUsd: 0, slippageBps: 0, reason };
    return keep ? settle(fill) : fill;
  };

  return {
    mode: options.mode,

    async submit(order) {
      const prior = done.get(order.id);
      if (prior !== undefined) return prior;
      if (order.nonce !== lastNonce + 1) return refuse(order, "nonce", false);
      if (!(order.sizeUsd > 0)) return refuse(order, "tamanho_invalido");
      // Spot: vender exige posição. O paper não opera a descoberto.
      if (order.side === "sell" && (positions.get(order.symbol)?.units ?? 0) <= 0) return refuse(order, "sem_posicao");
      lastNonce = order.nonce;

      const failure = options.failure?.(order);
      if (failure !== undefined) {
        gas += options.gasUsd;
        return settle({ id: order.id, status: "failed", fillPriceUsd: 0, feeUsd: 0, gasUsd: options.gasUsd, slippageBps: 0, reason: failure });
      }
      const quoted = options.priceFor(order);
      if (quoted === undefined || !(quoted > 0)) return refuse(order, "sem_preco");

      const slippage = options.slippageBps?.(order) ?? 0;
      const price = order.side === "buy" ? quoted * (1 + slippage / 1e4) : quoted * (1 - slippage / 1e4);
      if (order.side === "buy" ? price > order.limitPriceUsd : price < order.limitPriceUsd) return refuse(order, "limite_de_preco");

      const fee = (order.sizeUsd * options.feeBps) / 1e4;
      fees += fee;
      gas += options.gasUsd;
      const units = order.sizeUsd / price;
      const held = positions.get(order.symbol) ?? { units: 0, costUsd: 0 };
      if (order.side === "buy") {
        // A base de custo inclui a taxa e o gas da entrada: o PnL realizado da saída já sai líquido dos dois lados.
        positions.set(order.symbol, { units: held.units + units, costUsd: held.costUsd + order.sizeUsd + fee + options.gasUsd });
      } else {
        const sold = Math.min(units, held.units);
        const basis = held.units > 0 ? held.costUsd * (sold / held.units) : 0;
        realized += order.sizeUsd * (sold / units) - basis - fee - options.gasUsd;
        positions.set(order.symbol, { units: held.units - sold, costUsd: held.costUsd - basis });
      }
      return settle({ id: order.id, status: "filled", fillPriceUsd: price, feeUsd: fee, gasUsd: options.gasUsd, slippageBps: slippage });
    },

    fills: () => list,

    pnl: () => ({
      realizedUsd: realized,
      feesUsd: fees,
      gasUsd: gas,
      open: Object.fromEntries([...positions].filter(([, p]) => p.units > 1e-12)),
    }),
  };
}
