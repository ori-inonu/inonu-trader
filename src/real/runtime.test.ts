import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRealConfig } from './config';
import { openRealJournal } from './journal';
import { createRealRuntime } from './runtime';
import { proofFixture } from './testing/proof-fixture';

test('legacy consent cannot authorize the newly declared public RPC recipient', async () => {
 const dir=mkdtempSync(join(tmpdir(),'real-consent-scope-'));const journal=openRealJournal(join(dir,'cycles.jsonl'));
 const runtime=createRealRuntime({config:loadRealConfig({}),journal,read:async()=>{throw new Error('no read')},sanitize:value=>value as any});
 const input={address:'0x'+'1'.repeat(40),chainIndex:'196',revision:1,consent:true};
 try { expect(()=>runtime.consent(input)).toThrow('Invalid wallet consent');expect(runtime.health().walletConsent.active).toBe(false); }
 finally {await runtime.stop();journal.close();rmSync(dir,{recursive:true,force:true})}
});

test('fresh paper cycles reserve inference across restart; stale or failed reads hold and recovery works', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-runtime-'));
 const path = join(dir, 'cycles.jsonl');
 let journal = openRealJournal(path);
 let at = 1_790_000_000_000; let outage = false; let inferences = 0;
 const config = loadRealConfig({ OKX_WEB3_API_KEY: 'key', OKX_WEB3_API_SECRET: 'secret', OKX_WEB3_API_PASSPHRASE: 'pass', TYPESAFE_AI_API_KEY: 'app-key', REAL_JEV_CONSUMPTION_AUTHORIZED: 'true', REAL_JEV_MAX_CALLS: '1' });
 const make = (): ReturnType<typeof createRealRuntime> => createRealRuntime({ config, journal, now: () => at,
  read: async input => {
   if (outage) throw new Error('test-only provider outage');
   return proofFixture(at, input.correlationId, runtime.health().walletConsent.identityKey!, 1);
  }, sanitize: value => value as any,
  decide: async () => { inferences++; return { choice: 'hold', status: 'ready', model: 'test-only-model', latencyMs: 1, inputTokens: null, costUsd: null, called: true, reasons: ['test-only decision'] }; },
 });
 let runtime: ReturnType<typeof createRealRuntime> = make();
 const grant = () => runtime.consent({ address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 1, consent: true, queryScope: 'web3-rpc-read-v2' });
 try {
  grant(); await runtime.tick();
  expect(inferences).toBe(1); expect(journal.history.filter(c => c.reservationOnly).length).toBe(1);
  at += 101;
  expect(runtime.latest().cycle?.decision.status).toBe('blocked');
  await runtime.stop(); journal.close(); journal = openRealJournal(path); runtime = make();
  expect(runtime.health().walletConsent.active).toBe(false);
  grant(); await runtime.tick();
  expect(inferences).toBe(1); expect(runtime.latest().cycle?.decision.reasons).toContain('Limite de chamadas Jev atingido');
  outage = true; await runtime.tick(); expect(runtime.latest().cycle?.decision.status).toBe('error'); expect(runtime.latest().cycle?.core).toBeNull();
  outage = false; at++; await runtime.tick(); expect(runtime.latest().cycle?.core).not.toBeNull();
  expect(runtime.latest().history.every(c => c !== null && c.mode === 'paper' && c.executionEnabled === false && c.realizedPnlUsd === null)).toBe(true);
 } finally { await runtime.stop(); journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('empty market responses cannot reserve quota or call application inference', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-incomplete-')); const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 const at = 1_790_000_000_000; let calls = 0;
 const config = loadRealConfig({ OKX_WEB3_API_KEY: 'key', OKX_WEB3_API_SECRET: 'secret', OKX_WEB3_API_PASSPHRASE: 'pass', TYPESAFE_AI_API_KEY: 'app-key', REAL_JEV_CONSUMPTION_AUTHORIZED: 'true', REAL_JEV_MAX_CALLS: '1' });
 let runtime: ReturnType<typeof createRealRuntime>;
 runtime = createRealRuntime({ config, journal, now: () => at, read: async input => {
  const sample = proofFixture(at, input.correlationId, runtime.health().walletConsent.identityKey!, 1);
  sample.envelopes.prices = { ...sample.envelopes.prices!, sourceAtMs: null, data: { prices: [], missingTokens: ['missing'], omittedTokens: [], currency: 'unknown' } };
  return sample;
 }, sanitize: value => value as any, decide: async () => { calls++; return { choice: 'hold', status: 'ready', model: 'test-only', latencyMs: 1, inputTokens: null, costUsd: null, called: true, reasons: [] }; } });
 try {
  runtime.consent({ address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 1, consent: true, queryScope: 'web3-rpc-read-v2' }); await runtime.tick();
  expect(calls).toBe(0); expect(runtime.health().jevCalls.reserved).toBe(0); expect(journal.history.some(c => c.reservationOnly)).toBe(false); expect(runtime.latest().cycle?.decision.status).toBe('blocked');
 } finally { await runtime.stop(); journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('an inference result that outlives source TTL remains called but is recorded blocked', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-inference-expiry-')); const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 let at = 1_790_000_000_000;
 const config = loadRealConfig({ OKX_WEB3_API_KEY: 'key', OKX_WEB3_API_SECRET: 'secret', OKX_WEB3_API_PASSPHRASE: 'pass', TYPESAFE_AI_API_KEY: 'app-key', REAL_JEV_CONSUMPTION_AUTHORIZED: 'true', REAL_JEV_MAX_CALLS: '1' });
 let runtime: ReturnType<typeof createRealRuntime>;
 runtime = createRealRuntime({ config, journal, now: () => at, read: async input => proofFixture(at, input.correlationId, runtime.health().walletConsent.identityKey!, 1), sanitize: value => value as any, decide: async () => { at += 101; return { choice: 'hold', status: 'ready', model: 'test-only', latencyMs: 101, inputTokens: null, costUsd: null, called: true, reasons: [] }; } });
 try {
  runtime.consent({ address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 1, consent: true, queryScope: 'web3-rpc-read-v2' }); const cycle = await runtime.tick();
  expect(cycle.decision.called).toBe(true); expect(cycle.decision.status).toBe('blocked'); expect(journal.history.at(-1)?.decision.status).toBe('blocked'); expect(runtime.health().jevCalls.reserved).toBe(1);
 } finally { await runtime.stop(); journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a core observation expires by elapsed time and cannot revive after a wall-clock jump', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-core-clock-')); const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 const origin = 1_790_000_000_000; let wall = origin, mono = 0;
 const config = loadRealConfig({ OKX_WEB3_API_KEY: 'key', OKX_WEB3_API_SECRET: 'secret', OKX_WEB3_API_PASSPHRASE: 'pass' });
 let runtime: ReturnType<typeof createRealRuntime>;
 runtime = createRealRuntime({ config, journal, now: () => wall, monotonic: () => mono, read: async input => proofFixture(wall, input.correlationId, runtime.health().walletConsent.identityKey!, 1), sanitize: value => value as any });
 try {
  runtime.consent({ address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 1, consent: true, queryScope: 'web3-rpc-read-v2' }); await runtime.tick();
  expect(runtime.latest().cycle?.decision.reasons).not.toContain('Dados essenciais incompletos ou expirados');
  wall -= 1_000; expect(runtime.latest().cycle?.decision.reasons).toContain('Dados essenciais incompletos ou expirados');
  expect(runtime.latest().cycle?.core).toBeNull();
  expect(runtime.latest().history[0]?.core).toBeNull();
  wall = origin; expect(runtime.latest().cycle?.decision.reasons).toContain('Dados essenciais incompletos ou expirados');
  expect(runtime.latest().cycle?.core).toBeNull();
  await runtime.tick(); mono += 101; wall += 101; expect(runtime.latest().cycle?.decision.reasons).toContain('Dados essenciais incompletos ou expirados');
 } finally { await runtime.stop(); journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the worker remains available without keys and never sends a connected address without consent', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-runtime-'));
 const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 try {
  let calls = 0;
  const runtime = createRealRuntime({ config: loadRealConfig({}), journal, read: async () => { calls++; throw new Error('must not read'); }, sanitize: value => value as any });
  await runtime.start();
  expect(runtime.health().worker.running).toBe(true);
  expect((runtime.health().services as any).worker?.running).toBe(true);
  expect(runtime.latest().cycle?.decision.choice).toBe('hold');
  expect(runtime.latest().cycle?.core).toBeNull();
  expect(calls).toBe(0);
  runtime.consent({ address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 1, consent: true, queryScope: 'web3-rpc-read-v2' });
  await runtime.tick();
  expect(calls).toBe(0);
  expect(JSON.stringify(runtime.health())).not.toContain('0x' + '1'.repeat(40));
  await runtime.stop();
  expect(runtime.health().worker.running).toBe(false);
 } finally { journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('revocation invalidates an in-flight response and deduplicates simultaneous refreshes', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-runtime-'));
 const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 try {
  const config = loadRealConfig({ OKX_WEB3_API_KEY: 'key', OKX_WEB3_API_SECRET: 'secret', OKX_WEB3_API_PASSPHRASE: 'pass' });
  let release!: (sample: any) => void;
  let calls = 0;
  const runtime = createRealRuntime({ config, journal, now: () => 1000, read: async input => { calls++; return await new Promise(resolve => { release = () => resolve({ correlationId: input.correlationId, identityKey: runtime.health().walletConsent.identityKey!, revision: 2, chainIndex: '196', observedAtMs: 1000, envelopes: {}, capabilities: [], proposal: null, holdReasons: [] }); }); }, sanitize: value => value as any });
  runtime.consent({ address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 2, consent: true, queryScope: 'web3-rpc-read-v2' });
  const first = runtime.tick(); const second = runtime.tick();
  runtime.revoke(); release(null);
  await Promise.all([first, second]);
  expect(calls).toBe(1);
  expect(runtime.latest().cycle?.core).toBeNull();
  expect(runtime.latest().cycle?.decision.reasons).toContain('Consentimento revogado ou identidade alterada durante a consulta');
  expect(runtime.health().walletConsent.active).toBe(false);
 } finally { journal.close(); rmSync(dir, { recursive: true, force: true }); }
});
