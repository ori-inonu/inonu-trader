import { expect, test } from 'bun:test';
import { bindTransportProof, networkCoreFresh } from './transport-proof';
import { proofFixture } from './testing/proof-fixture';

test('a ready injected adapter or mismatched transport receipt cannot qualify a network observation', () => {
 const e = { status: 'ready', source: 'onchainos-rest-v6', mode: 'unverified', endpoint: '/api/v6/example', method: 'GET', chainIndex: '196', correlationId: 'c', requestedAtMs: 10, receivedAtMs: 11, expiresAtMs: 100, sourceAtMs: null, httpStatus: 200, unit: 'raw', error: null, data: {} } as const;
 const core = { correlationId: 'c', chainIndex: '196', observedAtMs: 11, envelopes: Object.fromEntries(['balance', 'prices', 'candles', 'quote'].map(key => [key, e])), capabilities: [{ endpoint: e.endpoint, source: e.source, implemented: true, exercisedReal: false, integrated: true }], proposal: null, holdReasons: [] } as any;
 const receipt = { transport: 'production-fetch', correlationId: 'c', chainIndex: '196', endpoint: e.endpoint, method: 'GET', requestedAtMs: 10, receivedAtMs: 11, httpStatus: 200, providerCode: '0' } as const;
 expect(networkCoreFresh(core, 12)).toBe(false);
 const bound = bindTransportProof(core, [receipt]);
 expect(networkCoreFresh(bound, 12)).toBe(false);
 expect(bound.capabilities[0]?.exercisedReal).toBe(false);
 expect(networkCoreFresh(bound, 101)).toBe(false);
 expect(networkCoreFresh(bindTransportProof(core, [{ ...receipt, correlationId: 'other' }]), 12)).toBe(false);
 expect(networkCoreFresh(bindTransportProof(core, [{ ...receipt, providerCode: '50011' }]), 12)).toBe(false);
 expect(networkCoreFresh({ ...bound, envelopes: { ...bound.envelopes, quote: { ...e, receivedAtMs: NaN } } }, 12)).toBe(false);
 // These receipts are constructed fixtures for the seam, never evidence of actual provider access.
});

test('freshness requires complete market bodies, source times and matched pair coverage before paid inference', () => {
 const at = 1_790_000_000_000; const sample = proofFixture(at);
 expect(networkCoreFresh(sample, at + 1)).toBe(true);
 for (const key of ['prices', 'candles'] as const) {
  const field = key === 'prices' ? 'prices' : 'series';
  const change = (data: object, sourceAtMs: number | null = at) => ({ ...sample, envelopes: { ...sample.envelopes, [key]: { ...sample.envelopes[key]!, sourceAtMs, data } } });
  const data = sample.envelopes[key]!.data as any;
  expect(networkCoreFresh(change({ ...data, [field]: [] }), at + 1)).toBe(false);
  expect(networkCoreFresh(change({ ...data, missingTokens: ['omitted'] }), at + 1)).toBe(false);
  expect(networkCoreFresh(change({ ...data, omittedTokens: ['omitted'] }), at + 1)).toBe(false);
  expect(networkCoreFresh(change(data, null), at + 1)).toBe(false);
  expect(networkCoreFresh(change(data, at + 6_000), at + 1)).toBe(false);
 }
 expect(networkCoreFresh({ ...sample, envelopes: { ...sample.envelopes, prices: { ...sample.envelopes.prices!, endpoint: '/api/v6/example' } } }, at + 1)).toBe(false);
 const candles = sample.envelopes.candles!.data as any;
 expect(networkCoreFresh({ ...sample, envelopes: { ...sample.envelopes, candles: { ...sample.envelopes.candles!, data: { ...candles, series: candles.series.slice(0, 1) } } } }, at + 1)).toBe(false);
});

test('a supported-chain response alone does not qualify a family; its actual reads must also be proven', () => {
 const make = (endpoint: string) => ({ status: 'ready', source: 'onchainos-rest-v6', mode: 'unverified', endpoint, method: 'GET', chainIndex: '196', correlationId: 'c', requestedAtMs: 10, receivedAtMs: 11, expiresAtMs: 100, sourceAtMs: null, httpStatus: 200, unit: 'raw', error: null, data: {} } as const);
 const support = make('/api/v6/dex/balance/supported/chain');
 const balance = make('/api/v6/dex/balance/all-token-balances-by-address');
 const core = { correlationId: 'c', chainIndex: '196', observedAtMs: 11, envelopes: { balanceSupport: support, balance }, capabilities: [{ family: 'balance', endpoint: support.endpoint, source: support.source, implemented: true, exercisedReal: false }], proposal: null, holdReasons: [] } as any;
 const proof = (endpoint: string) => ({ transport: 'production-fetch', correlationId: 'c', chainIndex: '196', endpoint, method: 'GET', requestedAtMs: 10, receivedAtMs: 11, httpStatus: 200, providerCode: '0' } as const);
 expect(bindTransportProof(core, [proof(support.endpoint)]).capabilities[0]?.exercisedReal).toBe(false);
 expect(bindTransportProof(core, [proof(balance.endpoint)]).capabilities[0]?.exercisedReal).toBe(false);
 expect(bindTransportProof(core, [proof(support.endpoint), proof(balance.endpoint)]).capabilities[0]?.exercisedReal).toBe(true);
});
