/**
 * What the Veredito learns from the model's OWN answers, beyond the action (INT-2.x, JEV-1 to JEV-3). Pure.
 *
 * The TypeSafe documentation is explicit about two things: the model's probabilities say how concentrated its answer was (not how
 * likely it is to be right), and a choice question can lean on the ORDER in which the options are listed. So the judge asks the same
 * closed question a second time with the options in the opposite order, in the SAME call as the first, and reads two things in code:
 *
 *   consistency      from the concentration of the probabilities, (n x peak - 1) / (n - 1) for n options, the lower of the two
 *                    orderings; null when the answer carried no probabilities. It is a word for how decided the model was.
 *   orderingsAgree   whether both orderings chose the same option; null when either answer is not a choice.
 *
 * Neither is a chance of winning, and the Veredito never says so: a low consistency or a disagreement only ever turns the answer into
 * "esperar" (see compose.ts). The code that builds the questions and reads the answers has no model in it: it is tested with fakes.
 */
export interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions: unknown;
  readonly criteria: Readonly<Record<string, string>>;
}

/** The id of the second asking of the decision question. */
export const ORDER_CHECK_ID = "decision_b";

/** The same question, the same words, the options in the opposite order. */
export function orderCheckQuestion(base: ChoiceQuestion): ChoiceQuestion {
  return { ...base, criteria: Object.fromEntries(Object.entries(base.criteria).reverse()) };
}

export interface Insight {
  readonly consistency: number | null;
  readonly orderingsAgree: boolean | null;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** (n x peak - 1) / (n - 1), from the probabilities of one answer over `n` options; null when they are not usable. */
export function consistencyOf(probabilities: unknown, optionCount: number): number | null {
  if (!isRec(probabilities) || !Number.isInteger(optionCount) || optionCount < 2) return null;
  const values = Object.values(probabilities);
  if (values.length === 0 || !values.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
  const total = (values as number[]).reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;
  const peak = Math.max(...(values as number[])) / total;
  return Math.min(1, Math.max(0, (optionCount * peak - 1) / (optionCount - 1)));
}

export function readInsight(answers: unknown, optionCount: number): Insight {
  const a = isRec(answers) && isRec(answers.decision) ? answers.decision : null;
  const b = isRec(answers) && isRec(answers[ORDER_CHECK_ID]) ? answers[ORDER_CHECK_ID] : null;
  const choiceA = typeof a?.choice === "string" ? a.choice : null;
  const choiceB = typeof b?.choice === "string" ? b.choice : null;
  const parts = [a === null ? null : consistencyOf(a.probabilities, optionCount), b === null ? null : consistencyOf(b.probabilities, optionCount)].filter((v): v is number => v !== null);
  return {
    consistency: parts.length === 0 ? null : Math.round(Math.min(...parts) * 1e4) / 1e4,
    orderingsAgree: choiceA === null || choiceB === null ? null : choiceA === choiceB,
  };
}

/**
 * A small bench between the model call and the answer the person sees: the call leaves what it learned under the hash of the Brief it
 * answered, and the decision log takes it when it composes the Veredito. Entries expire, and taking one removes it, so nothing grows.
 */
export function createInsightBox(options: { readonly now: () => number; readonly ttlMs?: number; readonly max?: number }) {
  const ttl = options.ttlMs ?? 120_000;
  const max = options.max ?? 32;
  const items = new Map<string, { readonly at: number; readonly insight: Insight }>();
  return {
    put(briefHash: string, insight: Insight): void {
      items.set(briefHash, { at: options.now(), insight });
      while (items.size > max) items.delete(items.keys().next().value as string);
    },
    take(briefHash: string | null): Insight | null {
      if (briefHash === null) return null;
      const hit = items.get(briefHash);
      items.delete(briefHash);
      return hit === undefined || options.now() - hit.at > ttl ? null : hit.insight;
    },
    size: () => items.size,
  };
}

export type InsightBox = ReturnType<typeof createInsightBox>;
