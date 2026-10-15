/**
 * What the agent's decisions cost in model fees (ZC-2, docs/sdd/agente-autonomo/ADENDO-A-zero-configuracao.md). The owner's rule is that spending on the model and on data is judged by what the portfolio earns, not capped in advance: the agent counts what it spends
 * so that the screen can show the result AFTER the fees, and never stops deciding because a count was reached. This file is only the arithmetic over a price table that carries its source and its date.
 * Unknown stays unknown: a token count that was not reported makes the cost null, never zero. Pure.
 */

export interface Price {
  readonly model: string;
  /** Dollars per million input tokens. */
  readonly inputUsdPerMtok: number;
  /** Dollars per million output tokens. */
  readonly outputUsdPerMtok: number;
  readonly source: string;
  /** The day the price was read from the source. */
  readonly asOf: string;
}

/** TypeSafe's published price of Jev 1.13: 42 dollars per billion input tokens, output tokens free. Read on 2026-10-14; a price that changes is a change of this table, with its new date. */
export const JEV_PRICE: Price = { model: "jev-1.13.0", inputUsdPerMtok: 0.042, outputUsdPerMtok: 0, source: "https://docs.typesafe.ai/models", asOf: "2026-10-14" };

export interface Usage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

const count = (v: number | null): v is number => v !== null && Number.isSafeInteger(v) && v >= 0;

/** The cost of one consultation in dollars, or null when the tokens that set it were not reported. */
export function consultCostUsd(usage: Usage, price: Price = JEV_PRICE): number | null {
  if (!count(usage.inputTokens)) return null;
  let usd = (usage.inputTokens * price.inputUsdPerMtok) / 1e6;
  if (price.outputUsdPerMtok > 0) {
    if (!count(usage.outputTokens)) return null;
    usd += (usage.outputTokens * price.outputUsdPerMtok) / 1e6;
  }
  return usd;
}

/** The sum of the costs that are known, and how many could not be known: a total never hides a part it does not have. */
export function sumCostUsd(costs: readonly (number | null)[]): { readonly usd: number; readonly unknown: number } {
  let usd = 0;
  let unknown = 0;
  for (const c of costs) {
    if (c === null || !Number.isFinite(c) || c < 0) unknown++;
    else usd += c;
  }
  return { usd, unknown };
}
