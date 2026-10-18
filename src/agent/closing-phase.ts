/**
 * The closing phase of a cycle (docs/sdd/carteira-evidencia 70M and 80): for each purchase the first answer of the Jev leaned to, quote the entry (read only), bind the quote to its request, refuse by the objective checks, check
 * that the quote is still fresh, and ask the model one closed question, all inside the SAME budget as the primary consults (every physical request begun and finished there). In `shadow` it only measures: it returns and
 * records what it would say and never changes a stance, never calls the executor and never repeats an order. A failure at any step is a coded record, never an exception and never a guess.
 */
import { bindEntryQuote } from "../decision-review/entry-quote";
import type { Budget } from "./budget";
import type { EntryQuoteRead } from "./cli";
import { CLOSING_QUOTE_FRESH_MS, closingBrief, closingRecord, quoteIsFresh, quoteRefusal, type ClosingAnswer, type ClosingBrief, type ClosingMode, type ClosingRecord } from "./closing";
import type { ExecBrief } from "./fills";
import type { ModelAnswer } from "./model";
import { estimateClosingTokens } from "./model";
import type { ProfileId } from "./plans";
import type { PlannedOrder } from "./types";

/** What the cycle hands over for one purchase the first answer leaned to: the hypothetical order of the size asked (never sent), the facts of the candidate and what the gate did. */
export interface ClosingCandidate {
  readonly id: string;
  readonly order: PlannedOrder;
  readonly symbol: string;
  readonly portfolioUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly profile: ProfileId;
  readonly smallest: boolean;
  readonly firstP: number | null;
  readonly facets: Readonly<Record<string, number>>;
  readonly item: Readonly<Record<string, unknown>> | null;
  readonly itemLegend: Readonly<Record<string, string>>;
  readonly appliedByGate: string;
}

export interface ClosingDeps {
  readonly mode: () => ClosingMode;
  readonly quoter: { read(order: PlannedOrder, ctx: { readonly cycleId: string; readonly requestId: string; readonly signal: AbortSignal }): Promise<EntryQuoteRead> };
  readonly model: {
    readonly name: string;
    close?(input: { readonly brief: ClosingBrief; readonly symbol: string; readonly signal: AbortSignal }): Promise<{ readonly answer: ClosingAnswer | null; readonly usage: ModelAnswer["usage"] }>;
  };
  /** The budget of the primary consults: the closing spends from it, never from a budget of its own. */
  readonly budget: Budget;
  /**
   * How many primary looks are still due before the day (UTC) ends at the agent's cadence. The closing may only spend what is left after them: a second look must never take the consultation a primary look needs.
   * Absent: the caller does not know the cadence and nothing is held back.
   */
  readonly reserveForPrimaries?: () => number;
  readonly now: () => number;
  readonly newId: () => string;
  readonly record: (record: ClosingRecord) => void;
  readonly maxPerCycle: number;
  readonly timeouts: { readonly quoteMs: number; readonly modelMs: number };
}

/** The tokens assumed for the pre-check of the budget, before the brief of a closing exists. */
const PRECHECK_TOKENS = 3_000;

export async function runClosing(input: {
  readonly deps: ClosingDeps;
  readonly cycleId: string;
  readonly candidates: readonly ClosingCandidate[];
  readonly signal: AbortSignal;
  readonly exec: ExecBrief | null;
  /** Where the look stands against the cycle's orders (see ClosingRecord.placed). */
  readonly placed?: "antes" | "depois";
}): Promise<ClosingRecord[]> {
  const { deps } = input;
  const out: ClosingRecord[] = [];
  const phaseStartedAtMs = deps.now();
  const ranked = [...input.candidates].sort((a, b) => (b.firstP ?? -1) - (a.firstP ?? -1)).slice(0, Math.max(0, deps.maxPerCycle));
  for (const c of ranked) {
    if (input.signal.aborted) break;
    const requestId = deps.newId();
    const base = { cycleId: input.cycleId, candidateId: c.id, requestId, atMs: deps.now(), mode: deps.mode(), firstP: c.firstP, appliedByGate: c.appliedByGate, placed: input.placed ?? "antes", phaseStartedAtMs };
    const finish = (extra: Omit<Parameters<typeof closingRecord>[0], keyof typeof base>): void => {
      const record = closingRecord({ ...base, ...extra });
      out.push(record);
      try {
        deps.record(record);
      } catch {
        // a record that could not be kept costs nothing
      }
    };
    // 1. the day's budget, before anything is read: a spent budget asks nothing, and so does a day with nothing to spare after the primary looks still due
    const pre = deps.budget.check(PRECHECK_TOKENS);
    if (!pre.ok) { finish({ quote: null, quoteFailure: null, refusal: null, brief: null, answer: null, reason: pre.reason }); continue; }
    if (deps.reserveForPrimaries !== undefined) {
      const day = deps.budget.status();
      if (day.limits.maxConsultsPerDay - day.consults - deps.reserveForPrimaries() < 1) { finish({ quote: null, quoteFailure: null, refusal: null, brief: null, answer: null, reason: "reserva_para_primarias" }); continue; }
    }

    // 2. the quote of the entry, read only
    let read: EntryQuoteRead;
    try {
      read = await deps.quoter.read(c.order, { cycleId: input.cycleId, requestId, signal: AbortSignal.any([input.signal, AbortSignal.timeout(deps.timeouts.quoteMs)]) });
    } catch {
      read = { ok: false, reason: "quote_recusada" };
    }
    if (!read.ok) { finish({ quote: null, quoteFailure: read.reason, refusal: null, brief: null, answer: null }); continue; }

    // 3. bound to its request: the token, the pair, the amount, the decimals and the clock, or a coded failure
    const bound = bindEntryQuote(read.request, read.raw, deps.now(), CLOSING_QUOTE_FRESH_MS);
    if (!bound.ok) { finish({ quote: null, quoteFailure: bound.reason, refusal: null, brief: null, answer: null }); continue; }

    // 4. what the code refuses by itself
    const refusal = quoteRefusal(bound.value);
    if (refusal !== null) { finish({ quote: bound.value, quoteFailure: null, refusal, brief: null, answer: null }); continue; }

    // 5. fresh at the moment of the question (other candidates were quoted in between)
    if (!quoteIsFresh(bound.value, deps.now())) { finish({ quote: bound.value, quoteFailure: null, refusal: null, brief: null, answer: null, reason: "cotacao_vencida" }); continue; }

    // 6. the question, one physical request inside the same budget
    const close = deps.model.close;
    if (close === undefined) { finish({ quote: bound.value, quoteFailure: null, refusal: null, brief: null, answer: null, reason: "modelo_sem_fechamento" }); continue; }
    const brief = closingBrief({ symbol: c.symbol, sizeUsd: c.order.usd, portfolioUsd: c.portfolioUsd, liquidityUsd: c.liquidityUsd, profile: c.profile, smallest: c.smallest, first: { pBuy: c.firstP, facets: c.facets }, item: c.item, itemLegend: c.itemLegend, quote: bound.value, quoteFailure: null, exec: input.exec, nowMs: deps.now() });
    const estimate = estimateClosingTokens(brief);
    const check = deps.budget.check(estimate);
    if (!check.ok) { finish({ quote: bound.value, quoteFailure: null, refusal: null, brief: null, answer: null, reason: check.reason }); continue; }
    let ticket;
    try {
      ticket = deps.budget.begin(estimate);
    } catch {
      finish({ quote: bound.value, quoteFailure: null, refusal: null, brief: null, answer: null, reason: "orcamento_nao_gravou" });
      continue;
    }
    let answer: ClosingAnswer | null = null;
    let reason: string | undefined;
    const askedAtMs = deps.now();
    let answeredAtMs: number | null = null;
    try {
      const result = await close.call(deps.model, { brief, symbol: c.symbol, signal: AbortSignal.any([input.signal, AbortSignal.timeout(deps.timeouts.modelMs)]) });
      answeredAtMs = deps.now();
      deps.budget.finish(ticket, result.usage);
      answer = result.answer;
    } catch {
      deps.budget.finish(ticket, null);
      reason = "modelo_erro";
    }
    finish({ quote: bound.value, quoteFailure: null, refusal: null, brief, answer, askedAtMs, answeredAtMs, ...(reason === undefined ? {} : { reason }) });
  }
  return out;
}
