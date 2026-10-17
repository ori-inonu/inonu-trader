/**
 * The Jev as the judge of the sequential decisions (engine.ts): one System One Choice question per call, through the same SDK path the lab and the agent already use (`experimental_evaluate`, no retries, a timeout that
 * aborts the connection). No ceiling on the calls of a run: the owner pays for the Jev and asked for no cap, so a decision may take as many questions as it needs. Every failure (a refused budget, a timeout, an exception, an answer that is not a distribution over the keys) is a null answer, never a guess and never an
 * exception into the procedure. The key reaches only the provider constructor: it is not kept in the result, not in the meter and not in any message. What is sent is what the spec holds, which `sanitizeSpec` has cleared
 * of addresses, keys and secrets. Nothing here executes, signs or sends anything but the question.
 */
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { experimental_evaluate } from "ai";
import type { Judge, JudgeAnswer, JudgeQuestion } from "./engine";

export const JEV_JUDGE_DEFAULT_TIMEOUT_MS = 20_000;

export type EvaluateFn = (args: { model: unknown; state: unknown; questions: unknown; maxRetries: number; abortSignal: AbortSignal }) => Promise<unknown>;

const sdkEvaluate: EvaluateFn = (args) => experimental_evaluate({ model: args.model as never, state: args.state as never, questions: args.questions as never, maxRetries: args.maxRetries, abortSignal: args.abortSignal });

export interface JevJudgeOptions {
  /** The provider key. Handed only to the provider constructor. */
  readonly apiKey: string;
  readonly modelId?: string;
  /** Optional. Left out means no ceiling; given, it is the most questions this judge will send. */
  readonly maxCalls?: number;
  readonly timeoutMs?: number;
  /** Tests inject a fake; the default is the SDK. */
  readonly evaluate?: EvaluateFn;
  /** Tests inject a model; the default is built from the key on the first call. */
  readonly model?: unknown;
}

export interface JevJudgeMeter {
  readonly maxCalls: number | null;
  readonly sent: number;
  readonly failed: number;
  /** Input tokens the provider reported, summed; calls without a report are counted apart, never as zero tokens. */
  readonly inputTokens: number;
  readonly callsWithoutUsage: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function createJevJudge(opts: JevJudgeOptions): Judge & { meter(): JevJudgeMeter } {
  if (opts.maxCalls !== undefined && (!Number.isSafeInteger(opts.maxCalls) || opts.maxCalls < 1)) throw new Error("maxCalls deve ser inteiro positivo, ou omitido");
  const evaluate = opts.evaluate ?? sdkEvaluate;
  let model: unknown = opts.model;
  let sent = 0;
  let failed = 0;
  let inputTokens = 0;
  let callsWithoutUsage = 0;
  return {
    async ask(q: JudgeQuestion): Promise<JudgeAnswer | null> {
      if (opts.maxCalls !== undefined && sent >= opts.maxCalls) return null;
      sent++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? JEV_JUDGE_DEFAULT_TIMEOUT_MS);
      try {
        if (model === undefined) model = createTypeSafeAi({ apiKey: opts.apiKey }).evaluationModel(opts.modelId ?? "jev-latest");
        const result = await evaluate({ model, state: q.state, questions: { [q.id]: { type: "choice", instructions: q.instructions, criteria: q.criteria } }, maxRetries: 0, abortSignal: controller.signal });
        const record = isRecord(result) ? result : {};
        const usage = isRecord(record.usage) ? record.usage.inputTokens : undefined;
        if (typeof usage === "number" && Number.isFinite(usage) && usage > 0) inputTokens += usage;
        else callsWithoutUsage++;
        const answers = isRecord(record.answers) ? record.answers : {};
        const answer = isRecord(answers[q.id]) ? (answers[q.id] as Record<string, unknown>) : null;
        const probabilities = answer !== null && isRecord(answer.probabilities) ? (answer.probabilities as Record<string, number>) : null;
        if (probabilities === null) {
          failed++;
          return null;
        }
        return { probabilities };
      } catch {
        failed++;
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    meter: () => ({ maxCalls: opts.maxCalls ?? null, sent, failed, inputTokens, callsWithoutUsage }),
  };
}
