/**
 * The balance the page hands to "Pedir ao Inonu: as melhores oportunidades", built from the rows of a reading of the wallet at the moment of the click. It is the closed shape the core accepts
 * (`parseSaldo` in the core): numbers in dollars and the PUBLIC address of each token held, never the address of the wallet itself. What counts is what the Carteira tab counts: the rows that
 * have a price and that the provider does not mark as risk; a balance with no price is not worth zero and is left out, and the cash is the stable coins (the same list the portfolio model uses).
 *
 * The core uses these dollars only to size the picks and sends the model percentages, so the amounts stay on this machine. Pure: no clock, no network, no storage.
 */
import type { BalanceRow } from "../wallet/holdings";
import { isStable } from "../wallet/portfolio-model";

export interface SaldoPayload {
  readonly observedAtMs: number;
  readonly totalUsd: number;
  readonly cashUsd: number;
  readonly chains: readonly { readonly chainIndex: string; readonly cashUsd: number }[];
  readonly holdings: readonly { readonly chainIndex: string; readonly address: string; readonly usd: number }[];
  readonly riskPct: number | null;
}

/** What the core accepts: the same limits as its parser, so a payload that leaves here is never refused for its size. */
const MAX_CHAINS = 16;
const MAX_HOLDINGS = 40;

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The address of a holding as the core keeps it, or null when it is not a public token address (the native coin is `native`). */
function addressOf(row: BalanceRow): string | null {
  if (row.tokenAddress === null) return "native";
  if (row.chainIndex === "501") return SOLANA.test(row.tokenAddress) ? row.tokenAddress : null;
  return EVM.test(row.tokenAddress) ? row.tokenAddress.toLowerCase() : null;
}

const whole = (usd: number): number => Math.round(usd * 100) / 100;

/** Null when nothing has a price: there is no portfolio to size against. */
export function saldoFromRows(rows: readonly BalanceRow[], observedAtMs: number, riskPct: number | null = null): SaldoPayload | null {
  const counted = rows.filter((r) => !r.flaggedRisk && r.valueUsd !== null && Number.isFinite(r.valueUsd) && r.valueUsd > 0);
  const totalUsd = counted.reduce((sum, r) => sum + (r.valueUsd ?? 0), 0);
  if (counted.length === 0 || totalUsd <= 0 || !Number.isSafeInteger(observedAtMs) || observedAtMs <= 0) return null;

  const cash = new Map<string, number>();
  const held = new Map<string, { chainIndex: string; address: string; usd: number }>();
  for (const r of counted) {
    const usd = r.valueUsd ?? 0;
    if (isStable(r.symbol)) {
      cash.set(r.chainIndex, (cash.get(r.chainIndex) ?? 0) + usd);
      continue;
    }
    const address = addressOf(r);
    if (address === null) continue;
    const key = `${r.chainIndex}:${address}`;
    const at = held.get(key) ?? { chainIndex: r.chainIndex, address, usd: 0 };
    at.usd += usd;
    held.set(key, at);
  }
  const chains = [...cash.entries()]
    .map(([chainIndex, usd]) => ({ chainIndex, cashUsd: whole(usd) }))
    .sort((a, b) => b.cashUsd - a.cashUsd)
    .slice(0, MAX_CHAINS);
  const cashUsd = whole([...cash.values()].reduce((s, v) => s + v, 0));
  const holdings = [...held.values()]
    .map((h) => ({ ...h, usd: whole(h.usd) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, MAX_HOLDINGS);
  // the cash of the shown networks never passes the cash overall (a rounding of cents may), which is the rule the core checks
  const shown = chains.reduce((s, c) => s + c.cashUsd, 0);
  return {
    observedAtMs,
    totalUsd: whole(totalUsd),
    cashUsd: Math.max(cashUsd, whole(shown)),
    chains,
    holdings,
    riskPct: riskPct !== null && Number.isFinite(riskPct) && riskPct > 0 && riskPct <= 0.2 ? riskPct : null,
  };
}
