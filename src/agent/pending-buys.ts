/**
 * The purchases the wallet does not show yet (the independent review of 2026-10-15, SF-1). The book is read once per look and the provider's balances can lag a transaction by minutes: a purchase that was sent and not yet
 * reflected must come off the cash of its network, and its token must not be offered as a new idea, or the next look would spend the same dollars twice. A purchase counts until the wallet holds MORE of its token than it
 * held when the order was written (the cash of that same reading already lost the dollars), or, for one that was confirmed, until the settling window is over; one still in flight counts until its answer or the wallet
 * frees it. A balance that was not known exactly cannot prove the wallet caught up, so the purchase stays pending. Pure: no clock, no storage.
 */
import type { OrderRecord } from "./ledger";
import { planKey } from "./plans";
import type { Book } from "./types";

export interface PendingBuys {
  /** Dollars of purchases not yet reflected, by network. */
  readonly byChain: Readonly<Record<string, number>>;
  /** The tokens (`planKey`) of those purchases: they are not offered as a new purchase while pending. */
  readonly tokens: ReadonlySet<string>;
}

const DIGITS = /^\d+$/;

export function pendingBuys(input: { readonly records: readonly OrderRecord[]; readonly book: Book; readonly nowMs: number; readonly settleWindowMs: number }): PendingBuys {
  const byChain: Record<string, number> = {};
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
    byChain[r.chainIndex] = Math.round(((byChain[r.chainIndex] ?? 0) + r.usd) * 100) / 100;
    tokens.add(key);
  }
  return { byChain, tokens };
}
