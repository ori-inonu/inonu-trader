import { expect, test } from 'bun:test';
import { realDecisionFromEvaluation, sanitizedDecisionState } from './jev';

test('real Jev decisions preserve unknown usage/cost and reject invented choices or invalid weights', () => {
 const valid = { answers: { allocation: { choice: 'hold', probabilities: { hold: 0.8, insufficient_evidence: 0.2 } } } };
 const decision = realDecisionFromEvaluation(valid, 'jev-latest', 12, null);
 expect(decision.inputTokens).toBeNull(); expect(decision.costUsd).toBeNull(); expect(decision.choice).toBe('hold');
 expect(() => realDecisionFromEvaluation({ answers: { allocation: { choice: 'trade', probabilities: { hold: 1, insufficient_evidence: 0 } } } }, 'jev-latest', 12, null)).toThrow();
 expect(() => realDecisionFromEvaluation({ answers: { allocation: { choice: 'hold', probabilities: { hold: NaN, insufficient_evidence: 0 } } } }, 'jev-latest', 12, null)).toThrow();
 const state = sanitizedDecisionState({ chainIndex: '196', observedAtMs: 1, identityKey: 'PRIVATE-IDENTITY', envelopes: { balance: { status: 'ready', source: 'onchainos-rest-v6', receivedAtMs: 1, expiresAtMs: 100, data: { knownValueUsd: null, completeValueUsd: null, coverage: { observedAssets: 1 } } } }, holdReasons: ['UNTRUSTED PROVIDER TEXT'], capabilities: [], proposal: null, revision: 1, correlationId: 'correlation' } as any, 2);
 expect(JSON.stringify(state)).not.toContain('PRIVATE'); expect(JSON.stringify(state)).not.toContain('UNTRUSTED');
 expect(state).not.toHaveProperty('inventory');
 const missing = sanitizedDecisionState({ ...({ chainIndex: '196', observedAtMs: 1, envelopes: { balance: { data: {} } } } as any) }, 2);
 expect(missing).not.toHaveProperty('inventory');
});

test('the decision prompt contains no private inventory amount, aggregate, coverage or derived completeness', () => {
 const state = sanitizedDecisionState({ chainIndex: '196', observedAtMs: 1, envelopes: { balance: { status: 'ready', receivedAtMs: 1, expiresAtMs: 100, data: { assets: [{ balance: '123456789.987654321', rawBalance: '123456789987654321' }], knownValueUsd: '987654321.123456789', completeValueUsd: '987654321.123456789', coverage: { observedAssets: 777 } } } } } as any, 2);
 const text = JSON.stringify(state);
 for (const privateValue of ['123456789', '987654321', '777', 'completeValueUsd', 'observedKnownValueUsd', 'coverage', 'assets']) expect(text).not.toContain(privateValue);
 expect(state).not.toHaveProperty('inventory');
});
