/**
 * How a purchase of the agent is sized: by the Jev, among alternatives the code can carry out (docs/sdd/agente-autonomo/ADENDO-B-autonomia-economica.md AEC-10 to AEC-16). The owner decided on 2026-10-14 that the
 * code does not choose the size or the risk of an operation with a ceiling of its own (a share of the portfolio at risk, a concentration, a reserve, a share of the pool or of the volume, a minimum of ten dollars):
 * those are FACTS the Jev reads. What the code keeps is what is physical.
 *
 *  - The executable maximum of a purchase is the cash the agent wallet holds on the NETWORK of the candidate (a token is paid for with what that network has; bridging is out of scope), and, when the OKX account
 *    has a limit per transaction switched on in its portal, a share of that limit (the account refuses an order at exactly its limit, and the price moves between the quote and the signature). That limit is the
 *    provider's restriction, not a cap of this app, and it is never bypassed.
 *  - The sizes the Jev chooses among are FRACTIONS of that maximum: a tenth, a third, two thirds, all of it. The Jev never writes a number.
 *  - A size whose dollars are not positive is not offered. There is no other floor, and no rounding to the dollar or the cent: the amount is cut to what the coin can represent when it is turned into units (swap-args.ts).
 *
 * Pure: no clock, no network, no storage.
 */
import type { BuyStance } from "./types";

/** The sizes of a purchase, as fractions of the executable maximum, from the smallest to the largest. */
export const AGENT_FRACTIONS = { buy_tenth: 0.1, buy_third: 1 / 3, buy_two_thirds: 2 / 3, buy_full: 1 } as const satisfies Record<Exclude<BuyStance, "skip">, number>;
/** The same fractions as a numerator and a denominator, so that the dollars are `ceiling * num / den`: a multiplication by a binary 0.1 or 1/3 would add noise in the last digits (37.125 would give 3.7125000000000004 for a tenth). */
export const AGENT_FRACTION_PARTS = { buy_tenth: { num: 1, den: 10 }, buy_third: { num: 1, den: 3 }, buy_two_thirds: { num: 2, den: 3 }, buy_full: { num: 1, den: 1 } } as const satisfies Record<Exclude<BuyStance, "skip">, { readonly num: number; readonly den: number }>;
export type AgentBuySize = keyof typeof AGENT_FRACTIONS;
export const AGENT_BUY_SIZES = ["buy_tenth", "buy_third", "buy_two_thirds", "buy_full"] as const satisfies readonly AgentBuySize[];

/** What share of the account's per-transaction limit a purchase may use: the account refuses an order at exactly its limit and the price moves between the quote and the signature (the same share as a sale, gate.ts). */
export const PROVIDER_LIMIT_SHARE = 0.95;

export type CeilingBinding = "caixa" | "limite_da_conta" | "sem_saldo" | "sem_dado";

export interface ExecutableCeiling {
  /** Dollars, exact (no rounding), zero when nothing can be bought. */
  readonly usd: number;
  /** What the maximum is: the cash of the network, the limit of the account, or why there is none. */
  readonly binding: CeilingBinding;
}

export function executableCeiling(input: { readonly cashOnChainUsd: number | null; readonly providerPerTxUsd: number | null }): ExecutableCeiling {
  const cash = input.cashOnChainUsd;
  if (cash === null || !Number.isFinite(cash) || cash < 0) return { usd: 0, binding: "sem_dado" };
  if (cash === 0) return { usd: 0, binding: "sem_saldo" };
  const limit = input.providerPerTxUsd;
  if (limit !== null && Number.isFinite(limit) && limit > 0 && limit * PROVIDER_LIMIT_SHARE < cash) return { usd: limit * PROVIDER_LIMIT_SHARE, binding: "limite_da_conta" };
  return { usd: cash, binding: "caixa" };
}

/** The dollars of every size on offer for a ceiling: only the positive ones, in the order smallest to largest. */
export function sizesFor(ceilingUsd: number): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!Number.isFinite(ceilingUsd) || ceilingUsd <= 0) return out;
  for (const size of AGENT_BUY_SIZES) {
    const { num, den } = AGENT_FRACTION_PARTS[size];
    const usd = (ceilingUsd * num) / den;
    if (usd > 0) out[size] = usd;
  }
  return out;
}
