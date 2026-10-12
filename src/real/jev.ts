import { experimental_evaluate } from 'ai';
import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import type { SanitizedCoreSample } from './types';
import type { RealDecision } from './runtime-types';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function sanitizedDecisionState(sample: SanitizedCoreSample, atMs: number) {
 return {
  chain: ['196', '143'].includes(sample.chainIndex) ? sample.chainIndex : null, observedAtMs: sample.observedAtMs,
  // Wallet consultation consent is not permission to send holdings or their aggregates to AI.
  sources: Object.fromEntries(['balance', 'prices', 'candles', 'quote'].map(key => { const e = sample.envelopes[key]; return [key, { status: e?.status ?? 'blocked', source: 'onchainos-rest-v6', ageMs: e && Number.isFinite(e.receivedAtMs) ? Math.max(0, atMs - e.receivedAtMs) : null, fresh: Boolean(e && e.expiresAtMs > atMs) }]; })),
  candidates: [], costs: { inferenceUsd: null, completeTradingCostsUsd: null },
  executionEnabled: false,
 };
}

export function realDecisionFromEvaluation(value: unknown, model: string, latencyMs: number, usdPerMillion: number | null): RealDecision {
 const answers = record(value) && record(value.answers) ? value.answers : null;
 const answer = answers && record(answers.allocation) ? answers.allocation : null;
 const weights = answer && record(answer.probabilities) ? answer.probabilities : null;
 const keys = ['hold', 'insufficient_evidence'];
 if (!answer || typeof answer.choice !== 'string' || !keys.includes(answer.choice) || !weights || Object.keys(weights).length !== 2 || !keys.every(key => typeof weights[key] === 'number' && Number.isFinite(weights[key]) && weights[key] >= 0 && weights[key] <= 1) || Math.abs((weights.hold as number) + (weights.insufficient_evidence as number) - 1) > 0.02 || !Number.isFinite(latencyMs) || latencyMs < 0) throw new Error('Invalid Jev application evaluation');
 const usage = record(value) && record(value.usage) ? value.usage : null;
 const inputTokens = usage && typeof usage.inputTokens === 'number' && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 ? usage.inputTokens : null;
 // A configured reference price and input-token usage do not prove the final billed cost.
 const costUsd = null;
 return { choice: 'hold', status: answer.choice === 'hold' ? 'ready' : 'blocked', model, latencyMs, inputTokens, costUsd, called: true, reasons: [answer.choice === 'hold' ? 'Jev mantém hold: nenhuma oportunidade financeira qualificada' : 'Jev apontou evidência insuficiente'], };
}

export function createRealJev(modelId: string, usdPerMillion: number | null) {
 const model = typeSafeAi.evaluationModel(modelId);
 return async (sample: SanitizedCoreSample, signal: AbortSignal): Promise<RealDecision> => {
  const started = performance.now();
  const result = await experimental_evaluate({ model, state: sanitizedDecisionState(sample, Date.now()) as any, questions: {
   allocation: { type: 'choice', instructions: { question: 'Should this paper cycle hold, or is the observed evidence insufficient to assess even its current readiness?', goal: 'Preserve capital and describe the current evidence honestly. No candidate is financially qualified and execution is disabled.', inputs: 'State is a sanitized summary. Values may be unknown. Source freshness does not establish economic eligibility. Do not infer address, private balances, profit, or permission.' }, criteria: {
    hold: 'The observed data supports a paper hold decision; commit no capital because no financially qualified candidate exists.',
    insufficient_evidence: 'The source evidence is inconsistent or insufficient to assess readiness; commit no capital and request better observations.',
   } },
  } as any, maxRetries: 0, abortSignal: signal });
  return realDecisionFromEvaluation(result, modelId, performance.now() - started, usdPerMillion);
 };
}
