import { createHmac } from 'node:crypto';
import { SignalsError, validateSignalQuery, type SignalQuery, type SignalsClient } from './report';

export interface SignalsCredentials { apiKey: string; secret: string; passphrase: string }
export type SignalsFetch = (url: string, init: RequestInit) => Promise<Response>;
const HOST = 'https://web3.okx.com';
const CHAINS = '/api/v6/dex/market/signal/supported/chain';
const SIGNALS = '/api/v6/dex/market/signal/list';

export function createSignalsClient(options: {
  credentials: SignalsCredentials; fetch?: SignalsFetch; now?: () => number; timeoutMs?: number;
}): SignalsClient {
  const credentials = { ...options.credentials };
  if (![credentials.apiKey, credentials.secret, credentials.passphrase].every(value => typeof value === 'string' && value.length <= 512 && /^[\x21-\x7e]+$/.test(value))) throw new SignalsError('invalid_input');
  const send = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new SignalsError('invalid_input');
  async function request(path: typeof CHAINS | typeof SIGNALS, body?: string): Promise<unknown[]> {
    const method = path === CHAINS ? 'GET' : 'POST';
    const time = now();
    if (!Number.isSafeInteger(time) || time <= 0 || time > 8.64e15) throw new SignalsError('invalid_input');
    const timestamp = new Date(time).toISOString();
    const signature = createHmac('sha256', credentials.secret).update(timestamp + method + path + (body ?? '')).digest('base64');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new SignalsError('deadline')); }, timeoutMs);
    });
    try {
      const work = (async () => {
        const response = await send(HOST + path, { method, body, redirect: 'error', signal: controller.signal, headers: {
          'Content-Type': 'application/json', 'OK-ACCESS-KEY': credentials.apiKey,
          'OK-ACCESS-SIGN': signature, 'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': credentials.passphrase,
        } });
        if (!response.ok) throw new SignalsError('request_failed');
        const envelope: unknown = await response.json();
        if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) throw new SignalsError('invalid_response');
        const data = envelope as Record<string, unknown>;
        if (data.code !== '0' || !Array.isArray(data.data)) throw new SignalsError('invalid_response');
        return data.data;
      })();
      return await Promise.race([work, deadline]);
    } catch (error) {
      if (error instanceof SignalsError) throw error;
      throw new SignalsError('request_failed');
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    supportedChains: () => request(CHAINS),
    listSignals: async (input: SignalQuery) => {
      const query = validateSignalQuery(input);
      return request(SIGNALS, JSON.stringify({ chainIndex: query.chainIndex, walletType: query.walletTypes.join(','), limit: String(query.limit) }));
    },
  };
}
