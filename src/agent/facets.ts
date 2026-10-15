/**
 * Facets: narrow yes or no judgments about one candidate, asked in the same call as its stance (docs.typesafe.ai: ask the most explicit, atomic questions you can, one property each, and combine the answers in code).
 * The stance question bundles several judgments behind one answer; a facet exposes one of them as a probability, so it can be inspected and weighed against what the price actually did. They are RECORDED, and two of
 * them are READ: `late_entry` and `still_falling` are the model's own judgment of the top and of the fall, which decide the entries the code only marks (conviction.ts, `CHASE_GATE`); the rest wait for the Placar to show which
 * predicts anything. Pure: it builds questions and reads answers, and a missing or malformed answer is left out, because a record must never be a reason to lose a decision.
 */
import type { Candidate } from "./types";

/** The facets asked about a purchase and about a holding: a high value always means yes. */
export const BUY_FACETS = ["late_entry", "still_falling", "accumulating", "exit_easy", "distribution", "fading"] as const;
export const HOLDING_FACETS = ["distribution", "fading", "late_in_run", "risk_rising"] as const;
/** At most this many candidates are asked about (holdings come first in the list), so the questions do not grow with the pool. */
export const FACET_MAX_CANDIDATES = 12;

type Text = (symbol: string, id: string) => string;
const BUY_TEXT: Readonly<Record<(typeof BUY_FACETS)[number], Text>> = {
  late_entry: (s, id) => `Has the price of ${s} (${id}) already risen so far that buying it now would be buying near a local top?`,
  still_falling: (s, id) => `Is the price of ${s} (${id}) still falling right now, rather than having stopped falling or turned up?`,
  accumulating: (s, id) => `Are the tracked wallets still buying ${s} (${id}) now, rather than having bought it earlier?`,
  exit_easy: (s, id) => `Could the planned purchase of ${s} (${id}) be sold again quickly without moving its price much?`,
  distribution: (s, id) => `Are the wallets that hold ${s} (${id}) selling it into strength right now?`,
  fading: (s, id) => `Is the momentum of ${s} (${id}) fading over the last hour?`,
};
const HOLDING_TEXT: Readonly<Record<(typeof HOLDING_FACETS)[number], Text>> = {
  distribution: (s, id) => `Are the wallets that hold ${s} (${id}) selling it into strength right now?`,
  fading: (s, id) => `Is the momentum of ${s} (${id}) fading over the last hour?`,
  late_in_run: (s, id) => `Is ${s} (${id}) deep into a run-up from which a pullback is likely?`,
  risk_rising: (s, id) => `Does the evidence on ${s} (${id}) point to a rising chance of losing most of its value?`,
};

/** The constant wording of the facet questions, for the digest of what the model reads. */
export const facetTexts = (): { readonly buy: unknown; readonly holding: unknown } => ({ buy: BUY_TEXT, holding: HOLDING_TEXT });

const names = (c: Candidate): readonly string[] => (c.kind === "holding" ? HOLDING_FACETS : BUY_FACETS);

export function facetQuestions(candidates: readonly Candidate[]): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  candidates.slice(0, FACET_MAX_CANDIDATES).forEach((c, index) => {
    for (const name of names(c)) {
      const text = c.kind === "holding" ? HOLDING_TEXT[name as (typeof HOLDING_FACETS)[number]] : BUY_TEXT[name as (typeof BUY_FACETS)[number]];
      questions[`facet_${index}_${name}`] = { type: "boolean", instructions: text(c.symbol, c.id) };
    }
  });
  return questions;
}

/** The facets that came back, by candidate id, each a probability rounded to two places. */
export function readFacets(answers: Readonly<Record<string, unknown>> | undefined, candidates: readonly Candidate[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (answers === undefined || answers === null) return out;
  candidates.slice(0, FACET_MAX_CANDIDATES).forEach((c, index) => {
    for (const name of names(c)) {
      const answer = answers[`facet_${index}_${name}`];
      const p = answer !== null && typeof answer === "object" ? (answer as { probability?: unknown }).probability : undefined;
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) continue;
      (out[c.id] ??= {})[name] = Math.round(p * 100) / 100;
    }
  });
  return out;
}
