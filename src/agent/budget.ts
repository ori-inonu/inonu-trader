/**
 * The model budget of the agent (AUT-3): consultations and tokens per day, its own and separate from the ask-the-assistant budget. A consultation is counted BEFORE the call is made, so a crash or a
 * timeout cannot hide it; a call whose tokens the provider did not report keeps its estimate (never zero). When the day is spent the cycle decides "manter" without consulting. The dollar cost stays
 * null until the person tells the price per token (Settings); this module counts calls and tokens only.
 */
import { dayKey } from "../operator/ledger";

export interface BudgetLimits {
  readonly maxConsultsPerDay: number;
  /** Null: no token cap, only the count limits. */
  readonly maxTokensPerDay: number | null;
}

/** The consultations a day that a look every `intervalMin` minutes needs, around the clock (a look every five minutes is 288). The agent's own capacity follows this when the autopilot is on (wire.ts). */
export const consultsForRhythm = (intervalMin: number): number => (Number.isFinite(intervalMin) && intervalMin > 0 ? Math.ceil(1440 / intervalMin) : 0);

/** 144 was the first choice: one consultation every ten minutes, around the clock. The owner then asked for a look every five minutes, which needs 288; with the autopilot on the capacity is the larger of this and what the rhythm needs. */
export const DEFAULT_LIMITS: BudgetLimits = { maxConsultsPerDay: 144, maxTokensPerDay: null };

export interface BudgetState {
  readonly version: 1;
  /** UTC day, YYYY-MM-DD. */
  readonly day: string;
  readonly consults: number;
  /** Measured tokens of the finished calls plus the estimate of those not measured or still running. */
  readonly committedTokens: number;
  readonly measuredTokens: number;
  readonly unmeasuredCalls: number;
}

export type BudgetCheck = { readonly ok: true } | { readonly ok: false; readonly reason: "consultas_esgotadas" | "tokens_esgotados" | "ritmo_do_dia" };

export interface BudgetTicket {
  readonly day: string;
  readonly estimateTokens: number;
}

export interface Budget {
  status(): BudgetState & { readonly limits: BudgetLimits };
  check(estimateTokens: number): BudgetCheck;
  /** Counts the consultation and saves it before returning; throws when it cannot be counted or the day is spent. */
  begin(estimateTokens: number): BudgetTicket;
  finish(ticket: BudgetTicket, usage: { readonly inputTokens: number | null; readonly outputTokens: number | null } | null): void;
  /**
   * Counts a request that ALREADY went to the provider and was not counted at begin(): the first of two for one choice (a request refused for its shape and asked again). It is a consultation of unknown usage, so it
   * keeps its estimate and may take the day past its limit (it happened; the next check says the day is spent). Saved best effort: a counter that cannot be saved does not hide a request that was made.
   */
  countExtra(estimateTokens: number): void;
}

const whole = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function parseBudgetState(raw: unknown): BudgetState | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = ["version", "day", "consults", "committedTokens", "measuredTokens", "unmeasuredCalls"];
  if (Object.keys(o).length !== keys.length || !keys.every((k) => Object.hasOwn(o, k))) return null;
  if (o.version !== 1 || typeof o.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.day)) return null;
  if (!whole(o.consults) || !whole(o.committedTokens) || !whole(o.measuredTokens) || !whole(o.unmeasuredCalls)) return null;
  return { version: 1, day: o.day, consults: o.consults, committedTokens: o.committedTokens, measuredTokens: o.measuredTokens, unmeasuredCalls: o.unmeasuredCalls };
}

export interface BudgetDeps {
  /** Spread the day's consultations over the day: only what the UTC clock has earned (plus a small reserve) may be spent, so a faster cadence than the limit allows slows down instead of spending the day by noon. Off by default. */
  readonly pace?: boolean;
  readonly limits: BudgetLimits;
  readonly now: () => number;
  readonly load: () => unknown;
  readonly persist: (state: BudgetState) => void;
}

export function createBudget(deps: BudgetDeps): Budget {
  // the limits are read at every check, so a person's change of the budget applies at once (the object may hold getters over the configuration)
  const limit = (): BudgetLimits => {
    const l = deps.limits;
    if (!Number.isSafeInteger(l.maxConsultsPerDay) || l.maxConsultsPerDay < 1) throw new Error("maxConsultsPerDay must be a whole number of at least 1");
    if (l.maxTokensPerDay !== null && (!Number.isSafeInteger(l.maxTokensPerDay) || l.maxTokensPerDay < 1)) throw new Error("maxTokensPerDay must be null or a whole number of at least 1");
    return l;
  };
  limit();

  const empty = (day: string): BudgetState => ({ version: 1, day, consults: 0, committedTokens: 0, measuredTokens: 0, unmeasuredCalls: 0 });
  let state: BudgetState;
  let loaded: unknown;
  try {
    loaded = deps.load();
  } catch {
    loaded = undefined;
  }
  // a file that exists and cannot be trusted counts the day as spent: nothing is consulted on a counter that may be wrong
  if (loaded === null) state = empty(dayKey(deps.now()));
  else {
    const parsed = parseBudgetState(loaded);
    state = parsed ?? { ...empty(dayKey(deps.now())), consults: limit().maxConsultsPerDay };
  }

  const today = (): BudgetState => {
    const day = dayKey(deps.now());
    if (state.day !== day) state = empty(day);
    return state;
  };

  const check = (estimateTokens: number): BudgetCheck => {
    const s = today();
    const l = limit();
    if (s.consults >= l.maxConsultsPerDay) return { ok: false, reason: "consultas_esgotadas" };
    if (deps.pace === true) {
      const dayMs = 86_400_000;
      const sinceMidnight = ((deps.now() % dayMs) + dayMs) % dayMs;
      const reserve = Math.max(2, Math.ceil(l.maxConsultsPerDay * 0.05));
      if (s.consults >= Math.floor((l.maxConsultsPerDay * sinceMidnight) / dayMs) + reserve) return { ok: false, reason: "ritmo_do_dia" };
    }
    if (l.maxTokensPerDay !== null && s.committedTokens + estimateTokens > l.maxTokensPerDay) return { ok: false, reason: "tokens_esgotados" };
    return { ok: true };
  };

  return {
    status: () => ({ ...today(), limits: { ...limit() } }),
    check,
    begin(estimateTokens) {
      const verdict = check(estimateTokens);
      if (!verdict.ok) throw new Error(verdict.reason);
      const s = today();
      const next: BudgetState = { ...s, consults: s.consults + 1, committedTokens: s.committedTokens + estimateTokens };
      try {
        deps.persist(next);
      } catch {
        throw new Error("orcamento_nao_gravou");
      }
      state = next;
      return { day: next.day, estimateTokens };
    },
    countExtra(estimateTokens) {
      const s = today();
      const next: BudgetState = { ...s, consults: s.consults + 1, committedTokens: s.committedTokens + estimateTokens, unmeasuredCalls: s.unmeasuredCalls + 1 };
      state = next;
      try {
        deps.persist(next);
      } catch {
        // the request is already made; the counter in memory keeps it
      }
    },
    finish(ticket, usage) {
      const s = today();
      // a ticket of a previous day settles nothing: its day is already gone
      if (ticket.day !== s.day) return;
      const measured = usage !== null && usage.inputTokens !== null && usage.outputTokens !== null ? usage.inputTokens + usage.outputTokens : null;
      const next: BudgetState =
        measured === null
          ? { ...s, unmeasuredCalls: s.unmeasuredCalls + 1 }
          : { ...s, committedTokens: Math.max(0, s.committedTokens - ticket.estimateTokens + measured), measuredTokens: s.measuredTokens + measured };
      state = next;
      try {
        deps.persist(next);
      } catch {
        // the call is already made and counted at begin(); a lost settlement only keeps the (larger) estimate
      }
    },
  };
}
