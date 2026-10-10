import { normalizeTokenAddress } from '../okx-market/token-identity';

export interface SignalQuery { chainIndex: string; walletTypes: readonly string[]; limit: number }
export interface SignalsClient {
  supportedChains(): Promise<unknown[]>;
  listSignals(query: SignalQuery): Promise<unknown[]>;
}
export class SignalsError extends Error {
  constructor(public readonly code: 'invalid_input' | 'invalid_response' | 'unsupported_chain' | 'request_failed' | 'deadline') {
    super(`OKX Signals: ${code}`);
    this.name = 'SignalsError';
  }
}
export function validateSignalQuery(query: SignalQuery): SignalQuery {
  if (!query || typeof query.chainIndex !== 'string' || !/^[1-9][0-9]{0,19}$/.test(query.chainIndex) || !Array.isArray(query.walletTypes) || query.walletTypes.length < 1 || query.walletTypes.length > 3 || query.walletTypes.some(type => !['1', '2', '3'].includes(type)) || new Set(query.walletTypes).size !== query.walletTypes.length || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new SignalsError('invalid_input');
  return { chainIndex: query.chainIndex, walletTypes: [...query.walletTypes], limit: query.limit };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SignalsError('invalid_response');
  return value as Record<string, unknown>;
}
function walletCode(value: unknown): string | null {
  switch (value) {
    case '1': case 'SMART_MONEY': return '1';
    case '2': case 'INFLUENCER': return '2';
    case '3': case 'WHALE': return '3';
    default: return null;
  }
}
function validSolanaAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = [0];
  for (const character of value) {
    let carry = alphabet.indexOf(character);
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  const leadingZeros = value.match(/^1*/)?.[0].length ?? 0;
  const numericLength = bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length;
  return leadingZeros + numericLength === 32;
}
function validAddress(chain: string, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // Reuse the existing module's explicit EVM allowlist, without broadening it.
  if (normalizeTokenAddress(chain, 'EVM') === 'evm') return /^0x[0-9a-fA-F]{40}$/.test(value);
  if (chain === '501') return validSolanaAddress(value);
  return /^[A-Za-z0-9]{8,128}$/.test(value);
}
function eventTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[0-9]{1,16}$/.test(value)) return null;
  const time = Number(value);
  return Number.isSafeInteger(time) && time > 0 ? time : null;
}
function checkedTime(now: () => number): number {
  const time = now();
  if (!Number.isSafeInteger(time) || time <= 0 || time > 8.64e15) throw new SignalsError('invalid_input');
  return time;
}
function decimal(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 128 && /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) ? value : null;
}
function displayText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
}
function holders(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[0-9]{1,16}$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}
function percentage(value: unknown): string | null {
  const text = decimal(value);
  if (text === null) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) < 100 || (whole === '100' && !/[1-9]/.test(fraction)) ? text : null;
}

export async function collectSignals(input: {
  client: SignalsClient; query: SignalQuery; now: () => number; source: 'synthetic' | 'okx_authenticated';
}) {
  const query = validateSignalQuery(input.query);
  checkedTime(input.now);
  const chains = await input.client.supportedChains();
  if (!Array.isArray(chains) || chains.filter(value => value !== null && typeof value === 'object' && (value as Record<string, unknown>).chainIndex === query.chainIndex).length !== 1) throw new SignalsError('unsupported_chain');
  const rows = await input.client.listSignals(query);
  if (!Array.isArray(rows) || rows.length > query.limit) throw new SignalsError('invalid_response');
  const observedAtMs = checkedTime(input.now);
  return {
    schema: 'okx_signals_observations_v1' as const, source: input.source, observedAtMs,
    query,
    execution: 'not_qualified' as const,
    access: 'unknown' as const, quota: 'unknown' as const, observedApiCostUsd: null,
    signals: rows.map(value => {
      const row = record(value);
      const token = record(row.token);
      const code = walletCode(row.walletType);
      if (row.chainIndex !== query.chainIndex || !validAddress(query.chainIndex, token.tokenAddress) || (code !== null && !query.walletTypes.includes(code))) throw new SignalsError('invalid_response');
      // Unix milliseconds are explicitly documented by the official CLI reference.
      const triggeredAtMs = eventTime(row.timestamp);
      const freshness = triggeredAtMs === null ? 'unknown' : triggeredAtMs > observedAtMs ? 'future' : observedAtMs - triggeredAtMs > 60000 ? 'stale' : 'fresh';
      return {
        chainIndex: String(row.chainIndex), tokenAddress: normalizeTokenAddress(String(row.chainIndex), String(token.tokenAddress)),
        symbol: displayText(token.symbol), name: displayText(token.name),
        direction: 'buy_observation' as const, walletCategory: code === '1' ? 'smart_money' : code === '2' ? 'influencer' : code === '3' ? 'whale' : 'unknown',
        triggeredAtMs, freshness,
        historicalPriceUsd: decimal(row.price), historicalAmountUsd: decimal(row.amountUsd),
        holders: holders(token.holders), top10HolderPercent: percentage(token.top10HolderPercent),
        execution: 'not_qualified' as const, currentExitLiquidityUsd: null,
        missingEvidence: ['current_exit_liquidity', 'contract_security', 'executable_sell_quote', 'actual_fees'],
      };
    }),
  };
}
