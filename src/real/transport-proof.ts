import type { CoreSample, Inventory, MarketCandles, MarketPrices, NormalizedQuote, SanitizedCoreSample, SourceEnvelope } from './types';

export interface TransportReceipt {
 transport: 'production-fetch'; correlationId: string; chainIndex: string;
 endpoint: string; method: 'GET' | 'POST'; requestedAtMs: number; receivedAtMs: number;
 httpStatus: number; providerCode: string | null;
}
export type WithTransport<T> = T & { transportEvidence: TransportReceipt[] };
const matches = (e: SourceEnvelope<unknown>, r: TransportReceipt) => r.transport === 'production-fetch' && r.correlationId === e.correlationId && r.chainIndex === e.chainIndex && r.endpoint === e.endpoint && r.method === e.method && r.httpStatus === 200 && r.providerCode === '0' && Number.isFinite(r.requestedAtMs) && Number.isFinite(r.receivedAtMs) && r.requestedAtMs >= e.requestedAtMs && r.receivedAtMs <= e.receivedAtMs && r.receivedAtMs >= r.requestedAtMs;

/** Production entry binds receipts from its own global fetch; no environment trust flag. */
export function bindTransportProof(sample: CoreSample, evidence: readonly TransportReceipt[]): WithTransport<CoreSample> {
 const receipts = evidence.filter(r => r.correlationId === sample.correlationId && r.chainIndex === sample.chainIndex).map(r => ({ ...r }));
 const familyKeys: Record<string, string[]> = { market: ['marketSupport', 'prices', 'candles'], balance: ['balanceSupport', 'balance'], dex: ['dexSupport', 'quote', 'build'] };
 const proven = (key: string) => {
  const e = sample.envelopes[key];
  if (!e || e.source !== 'onchainos-rest-v6' || e.status !== 'ready' || e.data === null) return false;
  const count = receipts.filter(r => matches(e, r)).length;
  const series = key === 'candles' && typeof e.data === 'object' ? (e.data as { series?: unknown[] }).series : undefined;
  return count >= (Array.isArray(series) ? Math.max(1, series.length) : 1);
 };
 return { ...sample, transportEvidence: receipts, capabilities: sample.capabilities.map(c => ({ ...c, exercisedReal: c.source === 'onchainos-rest-v6' && c.implemented && Boolean(familyKeys[c.family]?.every(proven)) })) };
}
export function networkCoreFresh(sample: CoreSample | SanitizedCoreSample, atMs: number): boolean {
 const receipts = (sample as Partial<WithTransport<SanitizedCoreSample>>).transportEvidence;
 if (!Array.isArray(receipts) || !Number.isFinite(atMs) || !Number.isFinite(sample.observedAtMs) || sample.observedAtMs > atMs) return false;
 const contracts = { balance: ['/api/v6/dex/balance/all-token-balances-by-address', 'GET', 'balance-unit-unknown', 60_000], prices: ['/api/v6/dex/market/price', 'POST', 'quote-currency-unknown', 60_000], candles: ['/api/v6/dex/market/candles', 'GET', 'quote-currency-unknown', 60_000], quote: ['/api/v6/dex/aggregator/quote', 'GET', 'smallest-token-unit', 15_000] } as const;
 const envelopesValid = (Object.keys(contracts) as (keyof typeof contracts)[]).every(key => {
  const e = sample.envelopes[key];
  const [endpoint, method, unit, ttl] = contracts[key];
  return Boolean(e && e.source === 'onchainos-rest-v6' && e.status === 'ready' && e.data !== null && e.endpoint === endpoint && e.method === method && e.unit === unit && Number.isSafeInteger(e.requestedAtMs) && Number.isSafeInteger(e.receivedAtMs) && Number.isSafeInteger(e.expiresAtMs) && e.requestedAtMs <= e.receivedAtMs && e.expiresAtMs > e.receivedAtMs && e.expiresAtMs <= e.receivedAtMs + ttl && e.expiresAtMs > atMs && e.receivedAtMs <= atMs && e.correlationId === sample.correlationId && e.chainIndex === sample.chainIndex && receipts.some(r => matches(e, r)));
 });
 if (!envelopesValid) return false;
 // Transport success alone is not complete evidence. Do not spend inference quota on empty/partial market reads.
 try {
  const inventory = sample.envelopes.balance!.data as Inventory;
  if (!Array.isArray(inventory.assets) || inventory.coverage?.scope !== 'observed-tokens-only' || inventory.coverage.observedAssets !== inventory.assets.length) return false;
  const prices = sample.envelopes.prices!.data as MarketPrices;
  const candles = sample.envelopes.candles!.data as MarketCandles;
  for (const key of ['prices', 'candles'] as const) {
   const e = sample.envelopes[key]!;
   if (!Number.isSafeInteger(e.sourceAtMs) || e.sourceAtMs! > atMs + 5_000 || e.expiresAtMs > e.sourceAtMs! + 60_000) return false;
  }
  const complete = (data: MarketPrices | MarketCandles) => Array.isArray(data.missingTokens) && data.missingTokens.length === 0 && Array.isArray(data.omittedTokens) && data.omittedTokens.length === 0;
  if (!complete(prices) || !complete(candles) || !Array.isArray(prices.prices) || prices.prices.length === 0 || !Array.isArray(candles.series) || candles.series.length === 0) return false;
  const decimal = (value: unknown) => typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
  const tokens = new Set<string>(); const priceTimes: number[] = [];
  for (const price of prices.prices) {
   if (typeof price.tokenContractAddress !== 'string' || tokens.has(price.tokenContractAddress) || !decimal(price.price) || !Number.isSafeInteger(price.sourceAtMs) || price.sourceAtMs! > atMs + 5_000 || price.sourceAtMs! + 60_000 <= atMs) return false;
   tokens.add(price.tokenContractAddress); priceTimes.push(price.sourceAtMs!);
  }
  if (sample.envelopes.prices!.sourceAtMs !== Math.min(...priceTimes)) return false;
  const candleTokens = new Set<string>(); const candleTimes: number[] = [];
  for (const series of candles.series) {
   if (!tokens.has(series.tokenContractAddress) || candleTokens.has(series.tokenContractAddress) || series.bar !== '1m' || !Array.isArray(series.candles) || series.candles.length === 0) return false;
   candleTokens.add(series.tokenContractAddress);
   for (const candle of series.candles) {
    if (!candle.confirmed || !Number.isSafeInteger(candle.openedAtMs) || !Number.isSafeInteger(candle.closedAtMs) || candle.openedAtMs < 0 || candle.closedAtMs !== candle.openedAtMs + 60_000 || candle.closedAtMs > atMs + 5_000 || ![candle.open, candle.high, candle.low, candle.close].every(decimal)) return false;
   }
   const sourceTime = Math.max(...series.candles.map(c => c.closedAtMs));
   if (sourceTime + 60_000 <= atMs) return false;
   candleTimes.push(sourceTime);
  }
  if (candleTokens.size !== tokens.size || sample.envelopes.candles!.sourceAtMs !== Math.min(...candleTimes) || receipts.filter(r => matches(sample.envelopes.candles!, r)).length < candleTokens.size) return false;
  const quote = sample.envelopes.quote!.data as NormalizedQuote;
  if (quote.chainIndex !== sample.chainIndex || quote.swapMode !== 'exactIn' || quote.amountUnit !== 'smallest-token-unit' || !/^[1-9]\d*$/.test(quote.fromTokenAmount) || !/^[1-9]\d*$/.test(quote.toTokenAmount) || quote.fromToken?.tokenContractAddress === quote.toToken?.tokenContractAddress || !tokens.has(quote.fromToken?.tokenContractAddress) || !tokens.has(quote.toToken?.tokenContractAddress)) return false;
  return true;
 } catch { return false; }
}
/** Bounded whitelist only: no address-bearing query or provider body is persisted. */
export async function providerCode(response: Response): Promise<string | null> {
 const reader = response.clone().body?.getReader(); if (!reader) return null;
 let size = 0; const chunks: Uint8Array[] = [];
 try {
  while (true) { const p = await reader.read(); if (p.done) break; size += p.value.length; if (size > 2_000_000) { void reader.cancel().catch(() => {}); return null; } chunks.push(p.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  const body = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
  return body && typeof body.code === 'string' && /^\d{1,8}$/.test(body.code) && Array.isArray(body.data) ? body.code : null;
 } catch { return null; } finally { reader.releaseLock(); }
}
