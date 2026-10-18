import { describe, expect, test } from 'bun:test';
import { collectSignals, type SignalsClient } from './report';

const NOW = 1_791_632_000_000;
const query = { chainIndex: '56', walletTypes: ['1', '2', '3'], limit: 10 };
function row(overrides: Record<string, unknown> = {}) {
  return {
    chainIndex: '56', timestamp: String(NOW - 1000), walletType: '1',
    price: '0.000000000123456789', amountUsd: '234.567890123456789',
    token: { tokenAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678', symbol: 'TEST', name: 'Synthetic token', holders: '2500', top10HolderPercent: '18.2', marketCapUsd: '123456.789' },
    triggerWalletAddress: 'wallet-DO-NOT-EXPORT', cursor: 'cursor-DO-NOT-EXPORT',
    ...overrides,
  };
}
function client(rows: unknown[] = [row()], chains: unknown[] = [{ chainIndex: '56' }]): SignalsClient {
  return { supportedChains: async () => chains, listSignals: async () => rows };
}

describe('historical OKX Signals report', () => {
  test('publishes a precise observed buy event with token identity and an explicit execution gate', async () => {
    const report = await collectSignals({ client: client(), query, now: () => NOW, source: 'synthetic' });
    expect(report.source).toBe('synthetic');
    expect(report.observedAtMs).toBe(NOW);
    expect(report.signals).toHaveLength(1);
    expect(report.signals[0]).toMatchObject({
      chainIndex: '56', tokenAddress: '0x1234567890abcdef1234567890abcdef12345678',
      direction: 'buy_observation', walletCategory: 'smart_money',
      triggeredAtMs: NOW - 1000, freshness: 'fresh',
      historicalPriceUsd: '0.000000000123456789', historicalAmountUsd: '234.567890123456789',
      execution: 'not_qualified', currentExitLiquidityUsd: null,
    });
    expect(JSON.stringify(report)).not.toContain('DO-NOT-EXPORT');
  });
  test('does not request a signal page without unambiguous chain coverage', async () => {
    for (const chains of [[], [{ chainIndex: '1' }], [{ chainIndex: '56' }, { chainIndex: '56' }]]) {
      let pages = 0;
      const source: SignalsClient = { supportedChains: async () => chains, listSignals: async () => { pages++; return [row()]; } };
      await expect(collectSignals({ client: source, query, now: () => NOW, source: 'synthetic' })).rejects.toThrow();
      expect(pages).toBe(0);
    }
  });
  test('rejects a page whose token identity, chain or requested category cannot be trusted', async () => {
    const badRows = [null, row({ chainIndex: '1' }), row({ token: {} }), row({ token: { tokenAddress: 'https://untrusted.invalid' } }), row({ walletType: '2' })];
    for (const invalid of badRows) await expect(collectSignals({ client: client([invalid]), query: { ...query, walletTypes: ['1'] }, now: () => NOW, source: 'synthetic' })).rejects.toThrow();
    await expect(collectSignals({ client: client([row(), row()]), query: { ...query, limit: 1 }, now: () => NOW, source: 'synthetic' })).rejects.toThrow();
    const solana = row({ chainIndex: '501', token: { tokenAddress: 'So11111111111111111111111111111111111111112' } });
    const solReport = await collectSignals({ client: client([solana], [{ chainIndex: '501' }]), query: { ...query, chainIndex: '501' }, now: () => NOW, source: 'synthetic' });
    expect(solReport.signals[0]?.tokenAddress).toBe('So11111111111111111111111111111111111111112');
  });
  test('keeps stale, future and unknown event times distinct from receipt time and accepts documented wallet enums', async () => {
    const rows = [row({ timestamp: String(NOW - 60001), walletType: '2' }), row({ timestamp: String(NOW + 1), walletType: 'WHALE' }), row({ timestamp: 'not-a-time', walletType: 'new_type' }), row({ timestamp: '9007199254740993' }), row({ timestamp: '' }), row({ timestamp: String(NOW), walletType: 'SMART_MONEY' })];
    const report = await collectSignals({ client: client(rows), query, now: () => NOW, source: 'synthetic' });
    expect(report.signals.map(signal => signal.freshness)).toEqual(['stale', 'future', 'unknown', 'unknown', 'unknown', 'fresh']);
    expect(report.signals.map(signal => signal.walletCategory)).toEqual(['influencer', 'whale', 'unknown', 'smart_money', 'smart_money', 'smart_money']);
    expect(report.signals[2]?.triggeredAtMs).toBeNull();
    expect(report.signals[3]?.triggeredAtMs).toBeNull();
    expect(report.observedAtMs).toBe(NOW);
    expect(report.signals.every(signal => signal.execution === 'not_qualified')).toBe(true);
  });
  test('requires a Solana address to decode to exactly 32 bytes while preserving its case', async () => {
    const solQuery = { ...query, chainIndex: '501' };
    for (const tokenAddress of ['z'.repeat(44), '2'.repeat(32), '1'.repeat(33)]) {
      const source = client([row({ chainIndex: '501', token: { tokenAddress } })], [{ chainIndex: '501' }]);
      await expect(collectSignals({ client: source, query: solQuery, now: () => NOW, source: 'synthetic' })).rejects.toThrow('invalid_response');
    }
    for (const tokenAddress of ['1'.repeat(32), 'So11111111111111111111111111111111111111112']) {
      const source = client([row({ chainIndex: '501', token: { tokenAddress } })], [{ chainIndex: '501' }]);
      const report = await collectSignals({ client: source, query: solQuery, now: () => NOW, source: 'synthetic' });
      expect(report.signals[0]?.tokenAddress).toBe(tokenAddress);
    }
  });
  test('publishes only bounded whitelisted optional fields and preserves decimal text instead of inventing values', async () => {
    const report = await collectSignals({ client: client([row(), row({ price: NaN, amountUsd: '1e300', token: { tokenAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678', symbol: { secret: 'DO-NOT-EXPORT' }, name: 'bad\nname', holders: '9007199254740993', top10HolderPercent: '101', marketCapUsd: '-5' }, arbitrary: 'DO-NOT-EXPORT' })]), query, now: () => NOW, source: 'synthetic' });
    expect(report.signals[0]).toMatchObject({ holders: 2500, top10HolderPercent: '18.2' });
    expect(report.signals[1]).toMatchObject({ symbol: null, name: null, historicalPriceUsd: null, historicalAmountUsd: null, holders: null, top10HolderPercent: null });
    expect(JSON.stringify(report)).not.toContain('DO-NOT-EXPORT');
    expect(report).toMatchObject({ access: 'unknown', quota: 'unknown', observedApiCostUsd: null });
  });
  test('drops provider fields excluded by the frozen historical observation contract', async () => {
    const report = await collectSignals({ client: client(), query, now: () => NOW, source: 'synthetic' });
    expect(report.signals[0]).not.toHaveProperty('historicalMarketCapUsd');
    expect(Object.keys(report.signals[0]!).sort()).toEqual([
      'chainIndex', 'tokenAddress', 'symbol', 'name', 'direction', 'walletCategory',
      'triggeredAtMs', 'freshness', 'historicalPriceUsd', 'historicalAmountUsd',
      'holders', 'top10HolderPercent', 'execution', 'currentExitLiquidityUsd', 'missingEvidence',
    ].sort());
  });
  test('rejects invalid query or local clock before consulting any source', async () => {
    let calls = 0;
    const source: SignalsClient = { supportedChains: async () => { calls++; return []; }, listSignals: async () => { calls++; return []; } };
    for (const invalid of [{ ...query, chainIndex: '../56' }, { ...query, chainIndex: '0' }, { ...query, walletTypes: [] }, { ...query, walletTypes: ['4'] }, { ...query, walletTypes: ['1', '1'] }, { ...query, limit: 0 }, { ...query, limit: 101 }, { ...query, limit: 1.5 }]) {
      await expect(collectSignals({ client: source, query: invalid, now: () => NOW, source: 'synthetic' })).rejects.toThrow('invalid_input');
    }
    await expect(collectSignals({ client: source, query, now: () => NaN, source: 'synthetic' })).rejects.toThrow('invalid_input');
    expect(calls).toBe(0);
  });
  test('validates concentration against the exact decimal boundary without rounding', async () => {
    const percentages = ['100.000000000000000001', '100.000000000000000000', '99.999999999999999999', '0', '100.1'] as const;
    const rows = percentages.map(top10HolderPercent => row({ token: { tokenAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678', top10HolderPercent } }));
    const report = await collectSignals({ client: client(rows), query, now: () => NOW, source: 'synthetic' });
    expect(report.signals.map(signal => signal.top10HolderPercent)).toEqual([null, percentages[1], percentages[2], '0', null]);
  });
  test('judges freshness at receipt after a delayed page instead of freezing time at request start', async () => {
    let clock = NOW;
    const delayed: SignalsClient = { supportedChains: async () => [{ chainIndex: '56' }], listSignals: async () => { clock += 60001; return [row({ timestamp: String(NOW) })]; } };
    const report = await collectSignals({ client: delayed, query, now: () => clock, source: 'synthetic' });
    expect(report.observedAtMs).toBe(NOW + 60001);
    expect(report.signals[0]?.freshness).toBe('stale');
  });
});
