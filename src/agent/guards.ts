/**
 * What the code still refuses after the quote of an order, as a FACT for the status and the screen (docs/sdd/agente-autonomo/ADENDO-D, V2-3). These are choices of the code, not of the owner and not physical limits:
 * the price impact each kind of order accepts, the tax of the token, the slippage passed to the tool, the share of the stop of a profile a purchase may pay to get in, and what stays of the native coin for the fee of
 * the next transactions. Every number is read from the constant the executor itself uses, so the screen cannot say something the code does not do. Pure.
 */
import { IMPACT_CAP_PCT, MAX_TAX_PCT } from "./cli";
import { GAS_RESERVE_USD } from "./exit";
import { BUY_COST_STOP_DIVISOR, SLIPPAGE_CAP_PCT } from "./swap-args";

export interface ExecutionGuards {
  readonly impactPct: { readonly buy: number; readonly sell: number; readonly protecao: number };
  readonly taxPct: number;
  readonly slippagePct: { readonly buy: number; readonly sell: number; readonly protecao: number };
  readonly buyCostShareOfStop: number;
  readonly nativeReserve: { readonly kind: "fixa" | "taxa_medida"; readonly usd: number | null };
}

export function executionGuards(): ExecutionGuards {
  return {
    impactPct: { buy: IMPACT_CAP_PCT.buy, sell: IMPACT_CAP_PCT.sell, protecao: IMPACT_CAP_PCT.protecao },
    taxPct: MAX_TAX_PCT,
    slippagePct: { buy: SLIPPAGE_CAP_PCT.buy, sell: SLIPPAGE_CAP_PCT.sell, protecao: SLIPPAGE_CAP_PCT.protecao },
    buyCostShareOfStop: 1 / BUY_COST_STOP_DIVISOR,
    nativeReserve: { kind: "fixa", usd: GAS_RESERVE_USD },
  };
}
