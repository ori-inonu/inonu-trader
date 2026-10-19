/**
 * What the guard SEES between two looks of the model that is worth asking the model about sooner (AUT-2): a held token whose price moved by half of its plan's stop distance since the price the model last read. The
 * fact comes from a real read (the book the guard takes every few seconds), carries its own observation time and a digest of the size of the move, and is handed to the dispatcher of `decision-review/events.ts`. Nothing here
 * orders anything or says buy or sell: it only says "this changed, look again", and the model keeps the decision. The size of the step is the plan's own (a tight plan asks sooner, a wide one later), not a number of ours.
 */
import { createHash } from "node:crypto";
import type { OpportunityEvent } from "../decision-review/events";
import { planKey, PROFILES, type PlanStore } from "./plans";
import type { Book, Position } from "./types";

const EVENT_SOURCE = "guard_book";
/** A position smaller than this is not worth a look of the model for a price move. */
export const MIN_EVENT_POSITION_USD = 5;

const held = (p: Position): boolean => p.wallet === "agente" && !p.isCash && p.priceUsd != null && Number.isFinite(p.priceUsd) && p.priceUsd > 0;

/** The price of each held token in the agent's wallet, by plan key: what the model is about to read. */
export function pricesOf(book: Book): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of book.positions) if (held(p)) out.set(planKey(p.chainIndex, p.address), p.priceUsd as number);
  return out;
}

export function priceMoveEvents(input: {
  /** The price of each held token (by plan key) at the last look of the model. */
  readonly looked: ReadonlyMap<string, number>;
  readonly book: Book;
  readonly plans: Pick<PlanStore, "get">;
  readonly nowMs: number;
}): OpportunityEvent[] {
  const out: OpportunityEvent[] = [];
  for (const p of input.book.positions) {
    if (!held(p) || p.usd === null || !Number.isFinite(p.usd) || p.usd < MIN_EVENT_POSITION_USD) continue;
    const key = planKey(p.chainIndex, p.address);
    const plan = input.plans.get(key);
    const base = input.looked.get(key);
    if (plan === undefined || base === undefined || !(base > 0)) continue;
    const step = PROFILES[plan.profile].stopPct / 2;
    const movePct = ((p.priceUsd as number) - base) / base * 100;
    if (!(Math.abs(movePct) >= step)) continue;
    const assetKey = `token:${p.chainIndex}:${p.chainIndex === "501" ? p.address : p.address.toLowerCase()}`;
    const bucket = Math.floor(Math.abs(movePct) / step);
    out.push({
      assetKey,
      source: EVENT_SOURCE,
      kind: "price_changed",
      observedAtMs: Math.min(input.book.observedAtMs, input.nowMs),
      fingerprint: createHash("sha256").update(`${assetKey}|${movePct > 0 ? "up" : "down"}|${bucket}`).digest("hex"),
    });
  }
  return out;
}

/**
 * Whether a fact may ask for another look NOW: connected, holding the folder, not closing, in the autonomous mode (a rhythm the person set by hand is the rhythm), the day's budget of consultations not spent, and the gap since the
 * end of the last cycle gone (the guard looks every 45 s and a fact must not become a look of the model each time). Pure: the readiness is given, nothing is read here.
 */
export function eventsAllowed(s: {
  readonly connected: boolean;
  readonly lockHeld: boolean;
  readonly closing: boolean;
  readonly auto: boolean;
  readonly lastCycleAtMs: number | null;
  readonly nowMs: number;
  readonly minGapMs: number;
  readonly budgetOk: boolean;
}): boolean {
  if (!s.connected || !s.lockHeld || s.closing || !s.auto || !s.budgetOk) return false;
  return s.lastCycleAtMs === null || s.nowMs - s.lastCycleAtMs >= s.minGapMs;
}
