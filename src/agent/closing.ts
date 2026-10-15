/**
 * The closing of a purchase (phase 2 of the decision, docs/sdd/carteira-evidencia sections 70M and 80): when the first answer of the Jev leaned to buy a token, the code reads the quote of that entry (read only), puts it in front of
 * the model together with EVERYTHING the first brief said about the token and the model's OWN first judgments, and asks one closed question: still buy, or skip. Pure: the brief, the question, the reading of the answer, the objective
 * refusals, the freshness rule and the record are built here; the reading of the quote, the call of the model and the files belong to the callers. The brief carries percentages and codes only (never a dollar amount, an address,
 * a quote id or a route). The cost it shows is PARTIAL (the announced fee and the price difference of the quote, for the way in): the exit, the rent and the real cost are not in it, and it says so. Nothing here orders, signs
 * or repeats an order.
 */
import { createHash } from "node:crypto";
import type { BoundEntryQuote } from "../decision-review/entry-quote";
import type { ExecBrief } from "./fills";
import { PROFILES, type ProfileId } from "./plans";

export const CLOSING_VERSION = 1;
/** The version of the wording of the question and of the legend: written on every record, so two periods can be told apart. */
export const CLOSING_CRITERIA = "closing-v1";
/** The brief of one closing: one candidate with ALL the facts the first brief gave it, the first answer, the quote and the plan. Measured by the tests; far under what the provider takes. */
export const CLOSING_BRIEF_MAX_BYTES = 6000;
/** How old a quote may be when the model is asked: the provider's own cache window for this same quote (`ttlMs` of the quote route in the gateway catalog), not the time an order is given to execute. */
export const CLOSING_QUOTE_FRESH_MS = 15_000;

export type ClosingMode = "shadow" | "decide";

const FACET_KEYS = ["late_entry", "still_falling", "accumulating", "exit_easy", "distribution", "fading"] as const;

/** What the model reads next to the numbers: what each key means. Without a word that could read as an amount of money. */
const LEGEND: Readonly<Record<string, string>> = {
  cob: "PARTIAL coverage of the cost: only what the quote announces for the way in is known; the exit, the rent of the accounts and what is really paid are not",
  sua: "your own first answer about this token: p is the share of your earlier Choice that went to buying, from 0 to 1 (not a chance of profit), f your six narrow judgments from 0 to 100 (late_entry, still_falling, accumulating, exit_easy, distribution, fading)",
  cot: "the quote of the entry, read just now: e its state (ok or aviso, a warning of the tool), imp the signed price difference of the quote in percent (a positive value is in your favour, a negative one against you), taxa the announced network fee as a percent of the size, imposto the tax of each token in percent, entra the announced fee plus the part of the price difference that is against you (a favourable difference is not counted as a cost), idade seconds since the quote was asked",
  cand: "everything the first brief said about this token, with the same keys and meanings as there",
  cotMotivo: "why there is no quote",
  tam: "the size as a percent of the whole portfolio (cart) and of the pool liquidity (liq)",
  plano: "the plan the purchase would open: alvo the target and stop the loss that closes it, both in percent",
  min: "true when this is the smallest purchase the code can carry out",
  voltas: "your real closed round trips so far (cash before the network fee, not profit): voltas how many, retorno percent of what went out, ultimas the latest, sem_entrada sales with no known entry",
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (x: number | null, d: number): number | null => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const safe = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 12) || "token";

export interface ClosingContext {
  readonly symbol: string;
  /** The size offered, in dollars: only ever shown as a percent of the portfolio and of the pool. */
  readonly sizeUsd: number;
  readonly portfolioUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly profile: ProfileId;
  /** True when the size is the smallest the code can carry out. */
  readonly smallest: boolean;
  readonly first: { readonly pBuy: number | null; readonly facets: Readonly<Record<string, number>> };
  /** What the first brief said about this token (its item of `compras`, percentages and codes) and the legend of those keys: the facts of the candidate travel with the closing, not only the opinions about them. */
  readonly item?: Readonly<Record<string, unknown>> | null;
  readonly itemLegend?: Readonly<Record<string, string>>;
  readonly quote: BoundEntryQuote | null;
  readonly quoteFailure: string | null;
  readonly exec: ExecBrief | null;
  readonly nowMs: number;
}

export interface ClosingBrief {
  readonly v: 1;
  readonly c: string;
  readonly cob: "parcial";
  readonly sua: { readonly p: number | null; readonly f: Readonly<Record<string, number>> };
  readonly cand: Readonly<Record<string, unknown>> | null;
  readonly cot: { readonly e: "ok" | "aviso" | "bloqueio"; readonly imp: number | null; readonly taxa: number | null; readonly imposto: readonly [number | null, number | null]; readonly entra: number | null; readonly idade: number } | null;
  readonly cotMotivo?: string;
  readonly tam: { readonly cart: number | null; readonly liq: number | null };
  readonly plano: { readonly alvo: number; readonly stop: number };
  readonly min: boolean;
  readonly voltas: ExecBrief | null;
  readonly chaves: Readonly<Record<string, string>>;
}

export function closingBrief(ctx: ClosingContext): ClosingBrief {
  const facets: Record<string, number> = {};
  for (const k of FACET_KEYS) {
    const v = ctx.first.facets[k];
    if (typeof v === "number" && Number.isFinite(v)) facets[k] = Math.round(v * 100);
  }
  const size = ctx.sizeUsd;
  const cot = ctx.quote === null ? null : (() => {
    const q = ctx.quote!, f = q.facts;
    // the fee is the quote's network fee in dollars, shown as a percent of the size; precision is kept (a real fee of a cent on a purchase of ten dollars is a hundredth of a percent, never a zero)
    const taxa = f.tradeFee !== null && size > 0 ? (f.tradeFee / size) * 100 : null;
    const imp = f.impactPct;
    // the price difference of the quote is signed (positive: in your favour); only the part against you is added to the announced fee
    const against = imp === null ? null : Math.max(0, -imp);
    return {
      e: q.disposition === "ok" ? "ok" as const : q.disposition === "provider_warn" ? "aviso" as const : "bloqueio" as const,
      imp: round(imp, 4), taxa: round(taxa, 6), imposto: [round(f.taxFromPct, 4), round(f.taxToPct, 4)] as const,
      entra: against !== null && taxa !== null ? round(against + taxa, 6) : null,
      // aged at the moment the brief is built, from the start of the request (it includes the time spent on other candidates)
      idade: Math.max(0, Math.round((ctx.nowMs - q.startedAtMs) / 1000)),
    };
  })();
  const spec = PROFILES[ctx.profile];
  return {
    v: 1, c: safe(ctx.symbol), cob: "parcial",
    sua: { p: round(ctx.first.pBuy, 2), f: facets },
    cand: ctx.item ?? null,
    cot, ...(cot === null ? { cotMotivo: ctx.quoteFailure ?? "sem_cotacao" } : {}),
    tam: { cart: ctx.portfolioUsd !== null && ctx.portfolioUsd > 0 ? round((size / ctx.portfolioUsd) * 100, 1) : null, liq: ctx.liquidityUsd !== null && ctx.liquidityUsd > 0 ? round((size / ctx.liquidityUsd) * 100, 3) : null },
    plano: { alvo: spec.targetPct, stop: spec.stopPct }, min: ctx.smallest, voltas: ctx.exec, chaves: { ...LEGEND, ...(ctx.itemLegend ?? {}) },
  };
}

/** Whether the quote is still within the window the provider itself caches it for, at the moment the model is about to be asked. Checked again after other candidates were quoted and before the call. */
export const quoteIsFresh = (q: BoundEntryQuote, nowMs: number): boolean => nowMs >= q.startedAtMs && nowMs - q.startedAtMs <= CLOSING_QUOTE_FRESH_MS;

/** What the code refuses by itself, before it spends a question: the same objective checks the executor makes, on the quote read for the closing. Null when there is nothing to refuse. */
export function quoteRefusal(q: BoundEntryQuote): string | null {
  if (q.honeypot.to === true || q.honeypot.from === true) return "honeypot";
  if (q.disposition === "provider_block") return "cotacao_bloqueada";
  if (q.disposition === "provider_warn") return "cotacao_aviso";
  if (q.honeypot.to === null) return "honeypot_desconhecido";
  return null;
}

const GOAL = "Decide with part of the cost of entering known: buy only if the target of the plan is worth that cost and your own judgments above. The cost shown is partial (the announced fee and the price difference of the quote, for the way in; not the exit, the rent or what is really paid). Skipping costs nothing; a purchase that is later closed at a loss costs the whole round trip.";
const INPUTS = "state.c is the token, state.cob says the cost is partial, state.sua your own first answer, state.cand everything the first brief said about the token, state.cot the quote of the entry (percentages), state.tam the size, state.plano the target and stop, state.voltas your real closed trips. state.chaves says what each key means.";

/** The one closed question of the phase. The symbol is cleaned: nothing from outside enters the text of a question. */
export function closingQuestion(symbol: string): unknown {
  return {
    type: "choice",
    instructions: { question: `You leaned to buy ${safe(symbol)}. Now that part of the cost of entering is known, do you still buy it?`, goal: GOAL, inputs: INPUTS },
    criteria: {
      buy: "Buy it: the target of the plan is worth the cost shown and your own judgments above do not argue against it.",
      skip: "Skip it: the cost shown, the facts about the token or your own judgments above weigh more than what the plan can earn.",
    },
  };
}

export interface ClosingAnswer {
  readonly buy: number;
  readonly skip: number;
}

/** The answer, read only when it is a distribution over exactly `buy` and `skip` (each from 0 to 1, summing to one) and, when it names a choice, that choice is the most likely one. Null otherwise. */
export function closingAnswerOf(raw: unknown): ClosingAnswer | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { choice?: unknown; probabilities?: unknown };
  const p = o.probabilities;
  if (p === null || typeof p !== "object" || Array.isArray(p)) return null;
  const keys = Object.keys(p as object);
  if (keys.length !== 2 || !keys.includes("buy") || !keys.includes("skip")) return null;
  const buy = num((p as Record<string, unknown>).buy), skip = num((p as Record<string, unknown>).skip);
  if (buy === null || skip === null || buy < 0 || buy > 1 || skip < 0 || skip > 1 || Math.abs(buy + skip - 1) > 0.02) return null;
  if (o.choice !== undefined && (o.choice !== "buy" && o.choice !== "skip" || (o.choice === "buy" ? buy < skip : skip < buy))) return null;
  return { buy, skip };
}

/** The decision of the model: the most likely option; a tie is a skip. No bar of the code stands between this and the answer. */
export const closingVerdict = (a: ClosingAnswer): "buy" | "skip" => (a.buy > a.skip ? "buy" : "skip");

export interface ClosingRecord {
  readonly v: 1;
  readonly phase: "closing";
  /** The wording of the question and the legend in force. */
  readonly criteria: string;
  readonly cycleId: string;
  readonly candidateId: string;
  readonly requestId: string;
  readonly atMs: number;
  readonly mode: ClosingMode;
  /** The first answer, raw to six places, and what the gate of the cycle did with it. */
  readonly first: { readonly pBuy: number | null; readonly appliedByGate: string };
  readonly quote: BoundEntryQuote | null;
  readonly quoteFailure: string | null;
  readonly refusal: string | null;
  /** The exact structured brief the model was given, and its hash and size: an auditor can recompute the hash and see which facts the second request carried. Null when no question was asked. */
  readonly brief: ClosingBrief | null;
  readonly briefHash: string | null;
  readonly briefBytes: number | null;
  readonly answer: { readonly buy: number; readonly skip: number } | null;
  /** What the phase says: buy, skip, or null when it could not say; and why. */
  readonly would: "buy" | "skip" | null;
  readonly wouldReason: string;
  /** What the cycle really did with the candidate (in shadow: what the gate decided; the phase changes nothing). */
  readonly applied: string;
  /** Where the look stood against the cycle's orders: `antes` (a purchase measured at its entry, before it was sent) or `depois` (the cycle had a sale, so every order went out first and the look came after). */
  readonly placed: "antes" | "depois";
  /** When the phase began, when the question really went to the model and when the answer came: the physical moments, so freshness and use can be proven from the record. Null when no question went out. */
  readonly phaseStartedAtMs: number;
  readonly askedAtMs: number | null;
  readonly answeredAtMs: number | null;
}

export function closingRecord(input: {
  readonly cycleId: string;
  readonly candidateId: string;
  readonly requestId: string;
  readonly atMs: number;
  readonly mode: ClosingMode;
  readonly firstP: number | null;
  readonly appliedByGate: string;
  readonly quote: BoundEntryQuote | null;
  readonly quoteFailure: string | null;
  readonly refusal: string | null;
  readonly brief: ClosingBrief | null;
  readonly answer: ClosingAnswer | null;
  /** Why no answer exists when the cause is not a missing quote or a refusal: the quote went stale, the budget is spent, the model has no closing or failed. */
  readonly reason?: string;
  readonly applied?: string;
  readonly placed?: "antes" | "depois";
  readonly phaseStartedAtMs?: number;
  readonly askedAtMs?: number | null;
  readonly answeredAtMs?: number | null;
}): ClosingRecord {
  const text = input.brief === null ? null : JSON.stringify(input.brief);
  const would = input.refusal !== null ? "skip" : input.quote === null || input.brief === null ? null : input.answer === null ? null : closingVerdict(input.answer);
  const wouldReason = input.refusal ?? (input.answer === null ? input.reason : undefined) ?? (input.quote === null ? input.quoteFailure ?? "sem_cotacao" : input.answer === null ? "sem_resposta" : "resposta_do_jev");
  return {
    v: 1, phase: "closing", criteria: CLOSING_CRITERIA, cycleId: input.cycleId, candidateId: input.candidateId, requestId: input.requestId, atMs: input.atMs, mode: input.mode,
    first: { pBuy: round(input.firstP, 6), appliedByGate: input.appliedByGate },
    quote: input.quote, quoteFailure: input.quoteFailure, refusal: input.refusal,
    brief: input.brief, briefHash: text === null ? null : createHash("sha256").update(text).digest("hex").slice(0, 16), briefBytes: text === null ? null : new TextEncoder().encode(text).length,
    answer: input.answer === null ? null : { buy: round(input.answer.buy, 6)!, skip: round(input.answer.skip, 6)! },
    would, wouldReason, applied: input.applied ?? input.appliedByGate,
    placed: input.placed ?? "antes", phaseStartedAtMs: input.phaseStartedAtMs ?? input.atMs, askedAtMs: input.askedAtMs ?? null, answeredAtMs: input.answeredAtMs ?? null,
  };
}
