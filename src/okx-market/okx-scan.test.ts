import { expect, test } from 'bun:test';
import { scanOpportunities } from './okx-scan';
import { DEFAULT_RESEARCH_POLICY } from './okx-opportunities';
import { createOkxReadOnlyClient } from './okx-api';

const id = { chainIndex: '56', tokenContractAddress: '0x1111111111111111111111111111111111111111' };
const now = 1700000030000;
function client() {
  return {
    protocols: async () => [{ chainIndex: '56', chainName: 'BSC', protocolList: [{ protocolId: 'actual', protocolName: 'Fixture' }] }],
    listMemePump: async () => ({ cursor: null, items: [{ ...id, symbol: 'SYNTHETIC' }] }),
    prices: async () => [{ ...id, price: '1', time: String(now - 30000), holders: '2000' }],
    advanced: async () => [{ ...id, riskControlLevel: '1', top10HoldPercent: '10', tokenTags: [] }],
    pools: async () => [{ liquidityUsd: '200000', liquidityAmount: [{ tokenContractAddress: id.tokenContractAddress }] }],
  };
}
test('scans finite public facts through discovered coverage without authorizing execution', async () => {
  const result = await scanOpportunities({ client: client(), chainIndex: '56', stage: 'NEW', protocolId: 'actual', limit: 1, policy: DEFAULT_RESEARCH_POLICY, now: () => now, source: 'synthetic' });
  expect(result.source).toBe('synthetic');
  expect(result.items).toHaveLength(1);
  expect(result.items[0]?.assessment.status).toBe('research_candidate');
  expect(result.items[0]?.assessment.execution).toBe('not_qualified');
  expect(result.apiCalls).toBe(5);
  expect(result.costUsd).toBeNull();
  expect(result.policy).toEqual(DEFAULT_RESEARCH_POLICY);
});
test('joins reordered prices by identity and rejects conflicts and unrequested assets', async () => {
  const second = { ...id, tokenContractAddress: '0x2222222222222222222222222222222222222222' };
  const base = client();
  const api = { ...base, listMemePump: async () => ({ cursor: null, items: [{ ...id, symbol: 'ONE' }, { ...second, symbol: 'TWO' }] }), prices: async () => [{ ...second, price: '2', time: String(now), holders: '2000' }, { ...id, price: '1', time: String(now), holders: '2000' }], advanced: async (identity: typeof id) => [{ ...identity, riskControlLevel: '1', top10HoldPercent: '10', tokenTags: [] }], pools: async (identity: typeof id) => [{ liquidityUsd: '200000', liquidityAmount: [{ tokenContractAddress: identity.tokenContractAddress }] }] };
  const options = { client: api, chainIndex: '56', stage: 'NEW' as const, protocolId: 'actual', limit: 2, policy: DEFAULT_RESEARCH_POLICY, now: () => now, source: 'synthetic' as const };
  const ordered = await scanOpportunities(options);
  expect(ordered.items.map(x => x.opportunity.priceUsd)).toEqual([1, 2]);
  const conflict = await scanOpportunities({ ...options, client: { ...api, prices: async () => [{ ...id, price: '1', time: String(now), holders: '2000' }, { ...id, price: '99', time: String(now), holders: '2000' }] } });
  expect(conflict.items[0]?.opportunity.priceUsd).toBeNull();
  expect(conflict.items[0]?.assessment.status).toBe('unknown');
  expect(conflict.items[0]?.assessment.reasons).toContain('unknown:duplicate_price_identity');
  const wrong = await scanOpportunities({ ...options, client: { ...api, prices: async () => [{ ...id, tokenContractAddress: '0x3333333333333333333333333333333333333333', price: '99' }] } });
  expect(wrong.items.every(x => x.assessment.status === 'blocked')).toBe(true);
});
test('checks gates before provider calls, rejects malformed listed identities, caps work and sanitizes failures', async () => {
  const base = client(); let calls = 0;
  const api = { ...base, protocols: async () => { calls++; return base.protocols(); } };
  const options = { client: api, chainIndex: '56', stage: 'NEW' as const, protocolId: 'actual', limit: 1, policy: DEFAULT_RESEARCH_POLICY, now: () => now, source: 'synthetic' as const };
  await expect(scanOpportunities({ ...options, limit: 31 })).rejects.toThrow('Invalid scan options');
  await expect(scanOpportunities({ ...options, policy: { ...DEFAULT_RESEARCH_POLICY, minHolders: NaN } })).rejects.toThrow('Invalid research policy');
  expect(calls).toBe(0);
  await expect(scanOpportunities({ ...options, chainIndex: '196' })).rejects.toThrow('Unsupported chain or protocol');
  expect(calls).toBe(1);
  let enriched = 0;
  const invalid = await scanOpportunities({ ...options, client: { ...api, listMemePump: async () => ({ cursor: null, items: [{ ...id, chainIndex: '196' }] }), advanced: async () => { enriched++; return []; } } });
  expect(invalid.items).toEqual([]);
  expect(invalid.rejectedItems).toBe(1);
  expect(enriched).toBe(0);
  const capped = await scanOpportunities({ ...options, client: { ...api, listMemePump: async () => ({ cursor: 'ignored', items: [{ ...id }, { ...id, tokenContractAddress: 'other' }] }), advanced: async () => { throw new Error('private-provider-error'); } } });
  expect(capped.items).toHaveLength(1);
  expect(capped.apiCalls).toBe(5);
  expect(capped.items[0]?.assessment.status).toBe('unknown');
  expect(capped.items[0]?.assessment.reasons).toContain('unknown:advanced_fetch_failed');
  expect(JSON.stringify(capped)).not.toContain('private-provider-error');
});
test('does not choose arbitrarily among duplicate listing or advanced identities', async () => {
  const api = client(); let enriched = 0;
  const options = { client: api, chainIndex: '56', stage: 'NEW' as const, protocolId: 'actual', limit: 2, policy: DEFAULT_RESEARCH_POLICY, now: () => now, source: 'synthetic' as const };
  const duplicate = await scanOpportunities({ ...options, client: { ...api, listMemePump: async () => ({ cursor: null, items: [{ ...id }, { ...id, symbol: 'CONFLICT' }] }), advanced: async () => { enriched++; return []; } } });
  expect(duplicate.items).toEqual([]);
  expect(duplicate.rejectedItems).toBe(2);
  expect(enriched).toBe(0);
  const advanced = await scanOpportunities({ ...options, client: { ...api, advanced: async () => [...await api.advanced(), { ...id, riskControlLevel: '5' }] } });
  expect(advanced.items[0]?.opportunity.riskLevel).toBeNull();
  expect(advanced.items[0]?.assessment.status).toBe('unknown');
  expect(advanced.items[0]?.assessment.reasons).toContain('unknown:duplicate_advanced_identity');
});

test('preserves explicit identity conflicts across the HTTP client and scanner', async () => {
  const other = { ...id, tokenContractAddress: '0x2222222222222222222222222222222222222222' };
  const base = client();
  for (const endpoint of ['prices', 'advanced', 'pools'] as const) {
    const http = createOkxReadOnlyClient({ credentials: { apiKey: 'fixture-key', secret: 'fixture-secret', passphrase: 'fixture-passphrase' }, fetch: async (url) => {
      const path = new URL(String(url)).pathname;
      let data: unknown;
      if (path.endsWith('chainsProtocol')) data = await base.protocols();
      else if (path.endsWith('tokenList')) data = await base.listMemePump();
      else if (path.endsWith('price-info')) data = endpoint === 'prices' ? [{ ...other, price: '1', time: String(now), holders: '2000' }] : await base.prices();
      else if (path.endsWith('advanced-info')) data = endpoint === 'advanced' ? { ...other, riskControlLevel: '1', top10HoldPercent: '10', tokenTags: [] } : (await base.advanced())[0];
      else if (path.endsWith('top-liquidity')) data = endpoint === 'pools' ? [{ liquidityUsd: '200000', liquidityAmount: [{ tokenContractAddress: other.tokenContractAddress }] }] : await base.pools();
      else throw new Error('Unexpected fixture endpoint');
      return new Response(JSON.stringify({ code: '0', data }));
    } });
    const result = await scanOpportunities({ client: http, chainIndex: '56', stage: 'NEW', protocolId: 'actual', limit: 1, policy: DEFAULT_RESEARCH_POLICY, now: () => now, source: 'synthetic' });
    expect(result.items[0]?.assessment.status).toBe('blocked');
    expect(result.items[0]?.assessment.reasons).toContain(endpoint === 'prices' ? 'price_identity_mismatch' : endpoint === 'pools' ? 'pool_identity_mismatch' : 'advanced_identity_mismatch');
    expect(result.items[0]?.assessment.execution).toBe('not_qualified');
  }
});

test('missing HTTP advanced identity remains unknown and remote error text stays private', async () => {
  const base = client();
  const http = createOkxReadOnlyClient({ credentials: { apiKey: 'fixture-key', secret: 'fixture-secret', passphrase: 'fixture-passphrase' }, fetch: async () => new Response(JSON.stringify({ code: '0', data: { riskControlLevel: '1', top10HoldPercent: '10', tokenTags: [] } })) });
  const result = await scanOpportunities({ client: { ...base, advanced: http.advanced }, chainIndex: '56', stage: 'NEW', protocolId: 'actual', limit: 1, policy: DEFAULT_RESEARCH_POLICY, now: () => now, source: 'synthetic' });
  expect(result.items[0]?.assessment.status).toBe('unknown');
  expect(result.items[0]?.assessment.reasons).toContain('unknown:advanced_fetch_failed');
  const failure = await scanOpportunities({ client: { ...base, pools: async () => { throw new Error('private-provider-error'); } }, chainIndex: '56', stage: 'NEW', protocolId: 'actual', limit: 1, policy: DEFAULT_RESEARCH_POLICY, now: () => now, source: 'synthetic' });
  expect(failure.items[0]?.assessment.status).toBe('unknown');
  expect(JSON.stringify(failure)).not.toContain('private-provider-error');
});
