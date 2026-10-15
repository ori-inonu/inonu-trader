/**
 * How much of a holding leaves when the model chooses to trim or exit (AUT-2). The model picks a stance; THIS module turns it into an amount in the token's smallest unit with `BigInt`, rounded down, so
 * an order can never ask for more than the wallet holds and a balance beyond 2^53 loses no digit. Pure: no clock, no network, no storage.
 */
import { SIZING } from "../opportunity/sizing";
import type { OrderRecord } from "./ledger";
import { planKey } from "./plans";
import { EXIT_FRACTION, EXIT_STANCES, type ExitStance, type Position } from "./types";

export interface SellPlan {
  /** Whole digits, the token's smallest unit. */
  readonly amountMinor: string;
  /** Whole dollars, rounded down; what the position is worth in the fraction sold. */
  readonly usd: number;
}

const DIGITS = /^[1-9]\d*$/;

const PPM = 10n ** 12n;
/** The dollars of the raw amount that is really sent: the plain fraction of the value when the amount is exactly that fraction of the balance, and the share the amount really is of the balance when the division was cut to whole units (a third of 5 units is 1 unit, a fifth of the position); a cut under a part in a billion is no cut. */
function usdOfAmount(usd: number, amount: bigint, balance: bigint, num: number, den: number): number {
  // cut by less than a part in a billion (a third of 10^18 units): the plain fraction, to the cent
  const wanted = balance * BigInt(num);
  if ((wanted - amount * BigInt(den)) * 1_000_000_000n <= wanted) return (usd * num) / den;
  return usd * (Number((amount * PPM) / balance) / Number(PPM));
}

/** What stays in the wallet of the native coin, in dollars: it pays the fee of every transaction after this one (an exit of everything of it would leave the agent unable to move anything on that network). */
export const GAS_RESERVE_USD = 5;

/** The part of a native balance that is never sold: the reserve, rounded up; the whole balance when its value is unknown or no larger than the reserve. */
function reserveMinor(balance: bigint, usd: number | null): bigint {
  if (usd === null || !Number.isFinite(usd) || usd <= GAS_RESERVE_USD) return balance;
  const reserveCents = BigInt(Math.round(GAS_RESERVE_USD * 100));
  const usdCents = BigInt(Math.floor(usd * 100));
  return (balance * reserveCents + usdCents - 1n) / usdCents;
}

/** Null when the stance does not make an order: unknown or odd balance, a balance whose human and raw forms do not agree (no decimals), unknown value, or a fraction that rounds to zero units. There is no minimum order and no rounding to the dollar (the owner's decision of 2026-10-14): what a small sale costs is a fact the Jev weighs. */
export function sellPlan(position: Position, stance: Exclude<ExitStance, "hold">): SellPlan | null {
  if (position.isCash || position.balanceMinor === null || !DIGITS.test(position.balanceMinor)) return null;
  // the raw amount is what is sent; when the two forms of the balance the provider gave do not agree, it is not known to be the balance
  if (position.decimals === null) return null;
  const usd = position.usd;
  if (usd === null || !Number.isFinite(usd) || usd <= 0) return null;
  const { num, den } = EXIT_FRACTION[stance];
  const balance = BigInt(position.balanceMinor);
  let amount = stance === "exit_all" ? balance : (balance * BigInt(num)) / BigInt(den);
  if (amount <= 0n) return null;
  let sellUsd = usdOfAmount(usd, amount, balance, num, den);
  if (position.address === "native") {
    // the native coin keeps its reserve for the fees: what is sold is capped at everything above it
    const sellable = balance - reserveMinor(balance, usd);
    if (sellable <= 0n) return null;
    if (amount > sellable) {
      amount = sellable;
      sellUsd = Math.min(sellUsd, usd - GAS_RESERVE_USD);
    }
  }
  if (!(sellUsd > 0)) return null;
  return { amountMinor: amount.toString(), usd: sellUsd };
}

/**
 * The exit the PLAN of a position demands (stop, trailing, time, half at the target). It is risk control, not an opinion: it is worked out from the balance alone, with no minimum order and no price
 * (a position whose value cannot be seen, or has fallen under the minimum, must still be able to leave). The dollars are what the fraction was worth when known, else zero.
 */
export function protectiveSellPlan(position: Position, stance: Extract<ExitStance, "trim_half" | "exit_all">): SellPlan | null {
  if (position.isCash || position.balanceMinor === null || !DIGITS.test(position.balanceMinor)) return null;
  const { num, den } = EXIT_FRACTION[stance];
  const balance = BigInt(position.balanceMinor);
  let amount = stance === "exit_all" ? balance : (balance * BigInt(num)) / BigInt(den);
  if (amount <= 0n) return null;
  const known = position.usd !== null && Number.isFinite(position.usd) && position.usd > 0;
  let usd = known ? usdOfAmount(position.usd as number, amount, balance, num, den) : 0;
  if (position.address === "native") {
    // even a stop does not take the coin that pays the fee of the next transaction
    const sellable = balance - reserveMinor(balance, position.usd);
    if (sellable <= 0n) return null;
    if (amount > sellable) {
      amount = sellable;
      usd = known ? Math.min(usd, (position.usd as number) - GAS_RESERVE_USD) : 0;
    }
  }
  return { amountMinor: amount.toString(), usd };
}

/** What the half at a target already did: its target (an amount, fixed when the first part went out) and what receipts confirmed of it. */
export interface HalfProgress {
  readonly targetMinor: bigint;
  readonly soldMinor: bigint;
}

/**
 * The half at the target, counted from the ledger so that it survives a restart and a deposit: the TARGET is half of the balance the wallet held when the first part of it went out (an amount, never a share of
 * whatever the balance is later), and only parts a receipt CONFIRMED (`executada`) count as sold. A part that failed cleanly or was never sent counts for nothing, and when it was the only one there is no target yet (null:
 * the half is worked out afresh). Parts of the plan only: its token, the plan's own exits, sales from the agent's wallet since the plan was opened. A balance that was not read exactly leaves the target unknown (null).
 */
export function halfProgress(records: readonly OrderRecord[], key: string, sinceMs: number): HalfProgress | null {
  const parts = records
    .filter((r) => r.source === "protecao" && r.stance === "trim_half" && r.side === "sell" && r.wallet === "agente" && r.atMs >= sinceMs && planKey(r.chainIndex, r.address) === key && (r.stage === "executada" || r.stage === "incerta" || r.stage === "enviando"))
    .sort((a, b) => a.atMs - b.atMs);
  const first = parts[0];
  if (first === undefined || first.balanceBeforeMinor === undefined || first.balanceBeforeMinor === null || !DIGITS.test(first.balanceBeforeMinor)) return null;
  let sold = 0n;
  for (const p of parts) if (p.stage === "executada" && p.amountMinor !== null && DIGITS.test(p.amountMinor)) sold += BigInt(p.amountMinor);
  return { targetMinor: BigInt(first.balanceBeforeMinor) / 2n, soldMinor: sold };
}

/** The half at the target is done: what receipts confirmed reached the target. Without a target on record (older records, a balance not read exactly) any confirmed half was the half, as before. */
export function halfDone(records: readonly OrderRecord[], key: string, sinceMs: number): boolean {
  const progress = halfProgress(records, key, sinceMs);
  if (progress === null) return records.some((r) => r.source === "protecao" && r.stance === "trim_half" && r.stage === "executada" && r.atMs >= sinceMs && planKey(r.chainIndex, r.address) === key);
  return progress.soldMinor >= progress.targetMinor;
}

/** `hold` always; every other stance only where it makes an order, so the model is never offered something the code cannot carry out. */
export function exitStancesOffered(position: Position): readonly ExitStance[] {
  return EXIT_STANCES.filter((stance) => stance === "hold" || sellPlan(position, stance) !== null);
}
