import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRealConfig } from './config';
import { openRealJournal } from './journal';
import { createRealRuntime } from './runtime';
import { createRealHandler } from './server';
import { createPublicRuntime } from './public-runtime';

test('HTTP readiness is public and consent writes require an allowed origin and bounded valid JSON', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-http-'));
 const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 try {
  const config = loadRealConfig({});
  const runtime = createRealRuntime({ config, journal, read: async () => { throw new Error('not configured'); }, sanitize: value => value as any });
  const publicWorker = createPublicRuntime({ read: async () => { throw new Error('unavailable'); } });
  const handler = createRealHandler(runtime, config, publicWorker);
  const publicResponse = await handler(new Request('http://127.0.0.1:3000/api/real/public-market'));
  expect(publicResponse.status).toBe(200);
  expect(await publicResponse.json()).toBeNull();
  expect((await handler(new Request('http://127.0.0.1:3000/api/real/public-market/refresh', { method: 'POST' }))).status).toBe(403);
  const refreshed = await handler(new Request('http://127.0.0.1:3000/api/real/public-market/refresh', { method: 'POST', headers: { Origin: 'http://localhost:3001' } }));
  expect(refreshed.status).toBe(200);
  expect((await refreshed.json() as any).status).toBe('error');
  expect(runtime.latest().history).toHaveLength(0);
  expect((await handler(new Request('http://127.0.0.1:3000/api/real/health'))).status).toBe(200);
  const body = JSON.stringify({ consent: true, queryScope: 'web3-rpc-read-v2', address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 1 });
  expect((await handler(new Request('http://127.0.0.1:3000/api/real/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }))).status).toBe(403);
  expect((await handler(new Request('http://127.0.0.1:3000/api/real/consent', { method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body }))).status).toBe(403);
  const response = await handler(new Request('http://127.0.0.1:3000/api/real/consent', { method: 'POST', headers: { Origin: 'http://localhost:3001', 'Content-Type': 'application/json' }, body }));
  expect(response.status).toBe(200);
  expect(JSON.stringify(await response.json())).not.toContain('0x' + '1'.repeat(40));
  expect((await handler(new Request('http://127.0.0.1:3000/api/real/consent', { method: 'POST', headers: { Origin: 'http://localhost:3001', 'Content-Type': 'application/json' }, body: ' '.repeat(4097) }))).status).toBe(413);
  expect((await handler(new Request('http://127.0.0.1:3000/api/real/consent', { method: 'DELETE', headers: { Origin: 'http://localhost:3001' } }))).status).toBe(200);
  expect(runtime.health().walletConsent.active).toBe(false);
 } finally { journal.close(); rmSync(dir, { recursive: true, force: true }); }
});
