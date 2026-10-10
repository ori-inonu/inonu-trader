import { type SignalQuery, type SignalsClient } from './report';

export const SYNTHETIC_SIGNALS_TIME_MS = 1_791_632_000_000;
export const SYNTHETIC_SIGNALS_QUERY: SignalQuery = { chainIndex: '56', walletTypes: ['1', '2', '3'], limit: 3 };
export function createSyntheticSignalsClient(): SignalsClient {
  return {
    supportedChains: async () => [{ chainIndex: '56' }],
    listSignals: async () => [
      { chainIndex: '56', timestamp: String(SYNTHETIC_SIGNALS_TIME_MS - 1000), walletType: '1', price: '0.000000123456789', amountUsd: '150.25', token: { tokenAddress: '0x1111111111111111111111111111111111111111', symbol: 'SYNTH', name: 'Synthetic observation', holders: '2500', top10HolderPercent: '18.2', marketCapUsd: '123456.789' } },
      { chainIndex: '56', timestamp: String(SYNTHETIC_SIGNALS_TIME_MS - 120000), walletType: 'WHALE', token: { tokenAddress: '0x2222222222222222222222222222222222222222', symbol: 'STALE', name: 'Synthetic stale event' } },
      { chainIndex: '56', timestamp: 'unknown', walletType: 'UNRECOGNIZED', token: { tokenAddress: '0x3333333333333333333333333333333333333333', symbol: 'UNKNOWN', name: 'Synthetic incomplete event' } },
    ],
  };
}
