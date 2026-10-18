import { describe, expect, test, vi } from 'bun:test';
import { createSignalsClient } from './client';
import { collectSignals } from './report';

const credentials = { apiKey: 'test-key', secret: 'test-secret', passphrase: 'test-passphrase' };
const now = () => Date.parse('2026-10-10T12:00:00.000Z');
const query = { chainIndex: '56', walletTypes: ['1', '2', '3'], limit: 10 };
describe('OKX Signals HTTP boundary', () => {
  test('signs the exact fixed GET and object POST once each and accepts the documented envelope without msg', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createSignalsClient({
      credentials, now, fetch: async (url, init) => {
        calls.push({ url, init });
        return Response.json({ code: '0', data: calls.length === 1 ? [{ chainIndex: '56' }] : [] });
      }
    });
    const report = await collectSignals({ client, query, now, source: 'okx_authenticated' });
    expect(report.signals).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls.map(call => [call.url, call.init.method, call.init.body, call.init.redirect])).toEqual([
      ['https://web3.okx.com/api/v6/dex/market/signal/supported/chain', 'GET', undefined, 'error'],
      ['https://web3.okx.com/api/v6/dex/market/signal/list', 'POST', '{"chainIndex":"56","walletType":"1,2,3","limit":"10"}', 'error'],
    ]);
    // Independent Node crypto golden signatures, with public test credentials only.
    expect(calls.map(call => new Headers(call.init.headers).get('OK-ACCESS-SIGN'))).toEqual(['3TJ91+tXwXoO9YQvV9TuKvUx/w3NQX8d2/Jab/6Gbm4=', '1fD3gjlFtcDE3sd7bsP1z977ubR1kJOz5nJ74wK0a5A=']);
    expect(new Headers(calls[1]!.init.headers).get('OK-ACCESS-TIMESTAMP')).toBe('2026-10-10T12:00:00.000Z');
  });
  test('rejects HTTP, provider and schema failures without retrying or exposing upstream messages', async () => {
    for (const response of [Response.json({ code: '0', data: [] }, { status: 402 }), Response.json({ code: '0', data: [] }, { status: 429 }), Response.json({ code: '50011', msg: 'PRIVATE-UPSTREAM', data: [] }), Response.json({ code: '0', data: {} }), Response.json([]), new Response('PRIVATE-UPSTREAM', { status: 200 })]) {
      let calls = 0;
      const client = createSignalsClient({ credentials, now, fetch: async () => { calls++; return response; } });
      let message = '';
      try { await client.supportedChains(); } catch (error) { message = (error as Error).message; }
      expect(message).toMatch(/^OKX Signals: (request_failed|invalid_response)$/);
      expect(message).not.toContain('PRIVATE-UPSTREAM');
      expect(calls).toBe(1);
    }
    const broken = createSignalsClient({ credentials, now, fetch: async () => { throw new Error('PRIVATE-UPSTREAM'); } });
    await expect(broken.supportedChains()).rejects.toThrow('OKX Signals: request_failed');
  });
  test('uses one deadline for headers and body, aborting even when a transport ignores the signal', async () => {
    for (const mode of ['headers', 'body', 'combined']) {
      let signal: AbortSignal | null = null;
      let calls = 0;
      const client = createSignalsClient({
        credentials, now, timeoutMs: 30, fetch: async (_url, init) => {
          calls++; signal = init.signal ?? null;
          if (mode === 'headers') return new Promise<Response>(() => { });
          if (mode === 'combined') await Bun.sleep(20);
          return {
            ok: true, json: async () => {
              if (mode === 'body') return new Promise(() => { });
              await Bun.sleep(20); return { code: '0', data: [] };
            }
          } as Response;
        }
      });
      await expect(client.supportedChains()).rejects.toThrow('OKX Signals: deadline');
      expect((signal as AbortSignal | null)?.aborted).toBe(true);
      expect(calls).toBe(1);
    }
  });

  test.each(['fetch', 'json'] as const)('rejects a %s result after the monotonic deadline', async (phase) => {
    vi.useFakeTimers();
    const timeoutMs = 30;
    const startedAt = 1_000;
    let monotonicNow = startedAt;
    let signal: AbortSignal | null = null;
    let calls = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
    try {
      const client = createSignalsClient({
        credentials, now, timeoutMs, fetch: async (_url, init) => {
          calls += 1;
          signal = init.signal ?? null;
          const response = Response.json({ code: '0', data: [] });
          if (phase === 'fetch') {
            monotonicNow = startedAt + timeoutMs + 1;
            return response;
          }
          const readJson = response.json.bind(response);
          Object.defineProperty(response, 'json', {
            value: async () => {
              const value = await readJson();
              monotonicNow = startedAt + timeoutMs + 1;
              return value;
            }
          });
          return response;
        }
      });
      await expect(client.supportedChains()).rejects.toMatchObject({ code: 'deadline' });
      expect((signal as AbortSignal | null)?.aborted).toBe(true);
      expect(calls).toBe(1);
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });
  test('validates credentials, query, deadline and clock before fetch and snapshots test credentials', async () => {
    let calls = 0;
    const send = async () => { calls++; return Response.json({ code: '0', data: [] }); };
    for (const bad of [{ ...credentials, apiKey: '' }, { ...credentials, secret: 'bad\nsecret' }, { ...credentials, passphrase: '   ' }]) {
      expect(() => createSignalsClient({ credentials: bad, fetch: send, now })).toThrow('invalid_input');
    }
    for (const timeoutMs of [0, 30001, NaN, 1.5]) expect(() => createSignalsClient({ credentials, fetch: send, now, timeoutMs })).toThrow('invalid_input');
    const client = createSignalsClient({ credentials, fetch: send, now });
    await expect(client.listSignals({ ...query, limit: 101 })).rejects.toThrow('invalid_input');
    await expect(createSignalsClient({ credentials, fetch: send, now: () => NaN }).supportedChains()).rejects.toThrow('invalid_input');
    expect(calls).toBe(0);
    const mutable = { ...credentials };
    const snapshotted = createSignalsClient({
      credentials: mutable, now, fetch: async (_url, init) => {
        expect(new Headers(init.headers).get('OK-ACCESS-KEY')).toBe('test-key');
        return Response.json({ code: '0', data: [] });
      }
    });
    mutable.apiKey = 'changed';
    await snapshotted.supportedChains();
  });
});
