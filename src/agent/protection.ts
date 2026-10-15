/**
 * The exits that the plan of a position demands (AUT-4): stop, trailing stop, expired time, and the half taken at the target. They are the CODE's, not the model's: they run before the model is asked, they
 * work with the budget spent or the model down, and they are never held back by the agent's daily sale cap. They apply only to positions the agent opened (they have a plan) in the wallet the agent trades
 * from. A price the code cannot see means no action and a note, never a guess. The price is observed AFTER the triggers are read, so a trigger reflects what the plan knew before this look.
 */
import { protectiveSellPlan } from "./exit";
import { planTriggers, planView, protectiveStance, planKey, type PlanStore, type PlanView } from "./plans";
import type { Book, PlannedOrder, Position } from "./types";

export interface ProtectionInput {
  readonly book: Book;
  readonly plans: PlanStore;
  /** The price now, from the facts of the position. Null when unknown. */
  readonly priceOf: (position: Position) => number | null;
  /** The highest price since the last look, when the candles give it. */
  readonly highOf: (position: Position) => number | null;
  readonly nowMs: number;
}

export interface Protection {
  /** The exits the plans demand, biggest first, as orders of the agent's wallet. */
  readonly orders: readonly PlannedOrder[];
  /** Holding candidate ids whose fate the plan decided: the model is not asked about them. */
  readonly handled: ReadonlySet<string>;
  /** The plan of each position the agent opened, for the Brief. */
  readonly views: ReadonlyMap<string, PlanView>;
  /** Codes of what could not be done. */
  readonly notes: readonly string[];
}

export const holdingId = (p: Position): string => `hold:${p.id}@${p.wallet}`;

/** A plan whose position has been gone from the managed wallet for this long is an orphan of a trade that already ended (sold, moved, or hidden by the provider): it is closed, so a new purchase of the same token does not inherit its entry and its clock. */
export const ORPHAN_AFTER_MS = 60 * 60_000;

export function protect(input: ProtectionInput): Protection {
  const orders: PlannedOrder[] = [];
  const handled = new Set<string>();
  const views = new Map<string, PlanView>();
  const notes = new Set<string>();
  for (const p of input.book.positions) {
    if (p.isCash || p.wallet !== "agente") continue;
    const key = planKey(p.chainIndex, p.address);
    const plan = input.plans.get(key);
    if (plan === undefined) continue;
    const price = input.priceOf(p);
    views.set(holdingId(p), planView(plan, price, input.nowMs));
    // without a price the stop and the target see nothing, but the time stop does not need one
    if (price === null) notes.add("protecao_sem_preco");
    const stance = protectiveStance(planTriggers(plan, price, input.nowMs), plan.trimmed);
    if (price !== null) input.plans.observe(key, price, input.nowMs, input.highOf(p) ?? undefined);
    if (stance === null) continue;
    // the exit of a plan is risk control: it needs the balance, not a price and not a minimum order
    const sale = protectiveSellPlan(p, stance);
    if (sale === null) {
      notes.add("protecao_sem_ordem");
      continue;
    }
    handled.add(holdingId(p));
    orders.push({ candidateId: holdingId(p), side: "sell", stance, chainIndex: p.chainIndex, symbol: p.symbol, address: p.address, usd: sale.usd, amountMinor: sale.amountMinor, wallet: "agente", profile: null, source: "protecao" });
  }
  // plans of positions that are no longer in the wallet: closed by what the wallet shows, never by a transaction hash, and only when it has shown the position gone for a whole hour without a reading
  // that had it in between (one reading that lacks a position says little: the provider can drop a token, or flag it as risk, and bring it back)
  const held = new Set(input.book.positions.filter((p) => p.wallet === "agente" && !p.isCash && (p.balanceMinor === null || /[1-9]/.test(p.balanceMinor))).map((p) => planKey(p.chainIndex, p.address)));
  const flagged = new Set(input.book.flaggedKeys ?? []);
  for (const plan of input.plans.all()) {
    if (held.has(plan.key) || flagged.has(plan.key)) {
      input.plans.seen(plan.key);
      if (flagged.has(plan.key)) notes.add("token_marcado_risco");
      continue;
    }
    const since = input.plans.absent(plan.key, input.nowMs);
    if (since === null || input.nowMs - since < ORPHAN_AFTER_MS) continue;
    input.plans.close(plan.key);
    notes.add("plano_orfao");
  }
  orders.sort((a, b) => b.usd - a.usd);
  return { orders, handled, views, notes: [...notes] };
}
