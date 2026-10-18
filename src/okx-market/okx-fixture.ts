import type { OkxReadOnlyClient, TokenIdentity } from './okx-api';

export const SYNTHETIC_SCAN_TIME_MS = 1_700_000_030_000;
export const SYNTHETIC_PROTOCOL_ID = 'fixture';
const syntheticClients = new WeakSet<object>();

export function isSyntheticOkxClient(value: unknown): value is OkxReadOnlyClient {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  return syntheticClients.has(value);
}

/** Public-boundary fixture. No credentials, wallet state, provider calls or price forecast. */
export function createSyntheticOkxClient(): OkxReadOnlyClient {
  const identities = ['1', '2', '3'].map(n => ({ chainIndex: '56', tokenContractAddress: '0x' + n.repeat(40) }));
  function index(identity: TokenIdentity) { return identities.findIndex(x => x.chainIndex === identity.chainIndex && x.tokenContractAddress === identity.tokenContractAddress.toLowerCase()); }
  const client: OkxReadOnlyClient = {
    protocols: async () => [{ chainIndex: '56', chainName: 'Synthetic BSC coverage', protocolList: [{ protocolId: SYNTHETIC_PROTOCOL_ID, protocolName: 'Synthetic protocol' }] }],
    listMemePump: async ({ limit }) => ({ cursor: null, items: identities.slice(0, limit).map((x, i) => ({ ...x, symbol: ['DEMO_CANDIDATE', 'DEMO_BLOCKED', 'DEMO_UNKNOWN'][i] })) }),
    prices: async requested => requested.map(x => ({ ...x, price: '1', time: String(SYNTHETIC_SCAN_TIME_MS - 30_000), holders: index(x) === 2 ? '' : '2000' })),
    advanced: async x => [{ ...x, riskControlLevel: index(x) === 2 ? '0' : '1', top10HoldPercent: '10', ...(index(x) === 2 ? {} : { tokenTags: index(x) === 1 ? ['honeypot'] : [] }) }],
    pools: async x => [{ liquidityUsd: '200000', liquidityAmount: [{ tokenContractAddress: x.tokenContractAddress }], liquidityProviderFeePercent: '0.3%', hookFeePercent: { buy: '', sell: '' }, sniperTaxPercent: { buy: '', sell: '' } }],
  };
  Object.freeze(client);
  syntheticClients.add(client);
  return client;
}
