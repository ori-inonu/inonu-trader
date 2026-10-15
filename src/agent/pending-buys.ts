/**
 * The purchases the wallet does not show yet (the independent review of 2026-10-15, SF-1). The book is read once per look and the provider's balances can lag a transaction by minutes: a purchase that was sent and not yet
 * reflected must come off the cash of its network, and its token must not be offered as a new idea, or the next look would spend the same dollars twice. A purchase counts until the wallet holds MORE of its token than it
 * held when the order was written (the cash of that same reading already lost the dollars), or, for one that was confirmed, until the settling window is over; one still in flight counts until its answer or the wallet
 * frees it. A balance that was not known exactly cannot prove the wallet caught up, so the purchase stays pending.
 *
 * The debit is kept in the UNITS of the coin the order pays in, exactly what the order sends (the dollars cut down to six decimals of the coin, as `buildSwapArgs` writes them): a debit rounded to a cent would leave the
 * next offer above what the wallet physically holds (RED 1 of the independent review of the v2 package). Dollars are kept too, unrounded, for what only needs to say that something is pending. Pure: no clock, no storage.
 */
import type { OrderRecord } from "./ledger";
import { planKey } from "./plans";
import { decimalDigits, settlementFor } from "./swap-args";
import type { Book } from "./types";

export interface PendingBuys {
  /** Dollars of purchases not yet reflected, by network (the plain sum, never rounded). */
  readonly byChain: Readonly<Record<string, number>>;
  /** The same purchases in raw units of the coin each network pays in, exactly what the orders send; a network whose paying coin has no known decimals has none. */
  readonly rawByChain: Readonly<Record<string, bigint>>;
  /** The tokens (`planKey`) of those purchases: they are not offered as a new purchase while pending. */
  readonly tokens: ReadonlySet<string>;
}

const DIGITS = /^\d+$/;

/** What the order sends of a coin with `decimals` places: the dollars cut down to six decimals, in raw units; null when nothing is sent. */
function sentRaw(usd: number, decimals: number): bigint | null {
  const d = decimalDigits(usd, 6);
  if (d === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const fraction = decimals >= d.fraction.length ? d.fraction.padEnd(decimals, "0") : d.fraction.slice(0, decimals);
  return BigInt(d.whole + fraction);
}

export function pendingBuys(input: { readonly records: readonly OrderRecord[]; readonly book: Book; readonly nowMs: number; readonly settleWindowMs: number }): PendingBuys {
  const byChain: Record<string, number> = {};
  const rawByChain: Record<string, bigint> = {};
  const tokens = new Set<string>();
  for (const r of input.records) {
    if (r.side !== "buy" || r.wallet !== "agente") continue;
    const inFlight = r.stage === "enviando" || r.stage === "incerta";
    const recentlyDone = r.stage === "executada" && input.nowMs - r.atMs <= input.settleWindowMs;
    if (!inFlight && !recentlyDone) continue;
    const key = planKey(r.chainIndex, r.address);
    const held = input.book.positions.find((p) => p.wallet === "agente" && !p.isCash && planKey(p.chainIndex, p.address) === key);
    const now = held === undefined ? 0n : held.balanceMinor !== null && DIGITS.test(held.balanceMinor) ? BigInt(held.balanceMinor) : null;
    const before = typeof r.balanceBeforeMinor === "string" && DIGITS.test(r.balanceBeforeMinor) ? BigInt(r.balanceBeforeMinor) : null;
    if (now !== null && before !== null && now > before) continue;
    if (!(r.usd > 0) || !Number.isFinite(r.usd)) continue;
    byChain[r.chainIndex] = (byChain[r.chainIndex] ?? 0) + r.usd;
    const decimals = settlementFor(input.book, r.chainIndex)?.decimals ?? null;
    const raw = decimals === null ? null : sentRaw(r.usd, decimals);
    if (raw !== null) rawByChain[r.chainIndex] = (rawByChain[r.chainIndex] ?? 0n) + raw;
    tokens.add(key);
  }
  return { byChain, rawByChain, tokens };
}
