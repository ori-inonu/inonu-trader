import { expect, test } from 'bun:test';
import { createPublicRuntime } from './public-runtime';
import type { PublicMarketSnapshot } from './public-market';
import { publicRefreshDelay } from './public-runtime';

test('public cadence refreshes before expiry without exceeding bounded acquisition rate', () => {
 expect(publicRefreshDelay({ status: 'ready', expiresAtMs: 36_000 }, 0)).toBe(18_000);
 expect(publicRefreshDelay({ status: 'ready', expiresAtMs: 60_000 }, 0)).toBe(30_000);
 expect(publicRefreshDelay({ status: 'ready', expiresAtMs: 2_000 }, 0)).toBe(15_000);
 expect(publicRefreshDelay({ status: 'blocked', expiresAtMs: 0 }, 0)).toBe(60_000);
 expect(publicRefreshDelay(null, 0)).toBe(60_000);
});

const sample = (): PublicMarketSnapshot => ({ source: 'okx-public-v5', mode: 'unverified', status: 'blocked', observedAtMs: 100, expiresAtMs: 200, instrument: null, funding: null, mark: null, capability: { id: 'funding.public-btc', family: 'funding', source: 'okx-public-v5', documented: true, implemented: true, exercisedReal: false, integrated: false, financiallyQualified: false, status: 'blocked', reason: 'metadata', nextRequirement: 'metadata' }, dependencies: ['metadata'], requests: [] });

test('a wall-clock jump cannot extend or restore the served snapshot lifetime', async () => {
 let wall = 150, mono = 0;
 const worker = createPublicRuntime({ read: async () => ({ ...sample(), status: 'ready' }), now: () => wall, monotonic: () => mono });
 await worker.tick(); expect(worker.latest()?.status).toBe('ready');
 wall -= 1_000; expect(worker.latest()?.status).toBe('blocked');
 wall = 150; expect(worker.latest()?.status).toBe('blocked');
 await worker.tick(); wall += 40; mono += 50;
 expect(worker.latest()?.status).toBe('blocked');
 await worker.stop();
});

test('public collection is serial, and stopping discards late data without blocking the core', async () => {
 let resolve!: (s: PublicMarketSnapshot) => void;
 let calls = 0;
 const worker = createPublicRuntime({ read: () => { calls++; return new Promise(r => { resolve = r; }); } });
 const started = worker.start();
 const overlap = worker.tick();
 expect(calls).toBe(1);
 expect(worker.health().running).toBe(true);
 const stopped = worker.stop();
 resolve(sample());
 await Promise.all([started, overlap, stopped]);
 expect(worker.latest()).toBeNull();
 expect(worker.health().running).toBe(false);
});

test('failed refresh removes previous values, diagnoses failure, and permits recovery', async () => {
 let fail = false;
 const worker = createPublicRuntime({ read: async () => { if (fail) throw new Error('secret upstream message'); return sample(); }, now: () => 150 });
 await worker.tick();
 expect(worker.latest()?.capability.integrated).toBe(true);
 expect(worker.latest()?.capability.exercisedReal).toBe(false);
 fail = true;
 await worker.tick();
 expect(worker.latest()?.status).toBe('error');
 expect(worker.latest()?.mark).toBeNull();
 expect(JSON.stringify(worker.latest())).not.toContain('secret');
 fail = false;
 await worker.tick();
 expect(worker.latest()?.status).toBe('blocked');
 await worker.stop();
});

test('expiration holds the served snapshot and restart collects a new sample', async () => {
 let clock = 150; let count = 0;
 const worker = createPublicRuntime({ read: async () => { count++; return sample(); }, now: () => clock });
 await worker.start();
 expect(worker.latest()?.dependencies).toEqual(['metadata']);
 clock = 201;
 expect(worker.latest()?.dependencies).toContain('Coleta pública expirada; aguardar atualização do worker.');
 await worker.stop();
 await worker.start();
 expect(count).toBe(2);
 await worker.stop();
});
