import type { CoreSample } from '../types';
import { bindTransportProof } from '../transport-proof';

/** Constructed seam fixture only. This file is never provider access evidence. */
export function proofFixture(at: number, correlationId = 'c', identityKey = '', revision = 1) {
 const tokens = ['0x' + '1'.repeat(40), '0x' + '2'.repeat(40)];
 const price = { prices: tokens.map(tokenContractAddress => ({ tokenContractAddress, price: '2', sourceAtMs: at, currency: 'unknown' })), missingTokens: [], omittedTokens: [], currency: 'unknown' };
 const candles = { series: tokens.map(tokenContractAddress => ({ tokenContractAddress, bar: '1m', candles: [{ openedAtMs: at - 60_000, closedAtMs: at, open: '2', high: '2', low: '2', close: '2', volume: '1', volumeUsd: null, confirmed: true }] })), missingTokens: [], omittedTokens: [], currency: 'unknown' };
 const metadata = (tokenContractAddress: string) => ({ tokenContractAddress, decimals: null, decimalsSource: 'provider-reference', priceUsd: null, isHoneyPot: null, taxRate: null });
 const rows = [
  ['balance', '/api/v6/dex/balance/all-token-balances-by-address', 'GET', 'balance-unit-unknown', null, { assets: [], coverage: { observedAssets: 0, rawBalanceKnown: 0, usdKnown: 0, scope: 'observed-tokens-only' }, knownValueUsd: null, completeValueUsd: null, blockNumber: null }],
  ['prices', '/api/v6/dex/market/price', 'POST', 'quote-currency-unknown', at, price],
  ['candles', '/api/v6/dex/market/candles', 'GET', 'quote-currency-unknown', at, candles],
  ['quote', '/api/v6/dex/aggregator/quote', 'GET', 'smallest-token-unit', null, { chainIndex: '196', swapMode: 'exactIn', fromTokenAmount: '1', toTokenAmount: '2', fromToken: metadata(tokens[0]!), toToken: metadata(tokens[1]!), priceImpactPercent: null, estimatedNetworkFeeUsd: null, estimatedGasRaw: null, routeCount: 0, mainRoute: null, routes: [], amountUnit: 'smallest-token-unit' }],
 ] as const;
 const envelopes = Object.fromEntries(rows.map(([key, endpoint, method, unit, sourceAtMs, data]) => [key, { status: 'ready', source: 'onchainos-rest-v6', mode: 'unverified', endpoint, method, chainIndex: '196', correlationId, requestedAtMs: at, receivedAtMs: at, sourceAtMs, expiresAtMs: at + 100, httpStatus: 200, unit, error: null, data }]));
 const receipts = rows.flatMap(([key, endpoint, method]) => Array.from({ length: key === 'candles' ? tokens.length : 1 }, () => ({ transport: 'production-fetch' as const, correlationId, chainIndex: '196', endpoint, method, requestedAtMs: at, receivedAtMs: at, httpStatus: 200, providerCode: '0' })));
 return bindTransportProof({ correlationId, chainIndex: '196', identityKey, revision, observedAtMs: at, envelopes, capabilities: [], proposal: null, holdReasons: ['Constructed control-flow fixture; never real acceptance evidence'] } as unknown as CoreSample, receipts);
}
