import { loadRealConfig } from '../src/real/config';
import { openRealJournal } from '../src/real/journal';
import { createRealRuntime } from '../src/real/runtime';
import { createRealHandler } from '../src/real/server';
import { createRealCore, sanitizeCoreSample } from '../src/real/core';
import { createRealJev } from '../src/real/jev';
import { createOnchainosHttp } from '../src/onchainos/http';
import { bindTransportProof, providerCode, type TransportReceipt, type WithTransport } from '../src/real/transport-proof';
import type { CoreSample } from '../src/real/types';
import { createPublicMarket } from '../src/real/public-market';
import { createPublicRuntime } from '../src/real/public-runtime';
import { createRpcReadAdapter } from '../src/real/rpc-read';
import { attachObservedInventory } from '../src/real/observation-integration';
import { createRealExtensions } from '../src/real/extensions';
import { attachRealExtensions } from '../src/real/extension-integration';

const config = loadRealConfig();
const journal = openRealJournal(config.journalPath);
let cycleSignal: AbortSignal | null = null;
let context: { correlationId: string; chainIndex: string; receipts: TransportReceipt[] } | null = null;
const http = createOnchainosHttp({
 credentials: config.credentials, allowNetwork: Boolean(config.credentials), now: Date.now,
 sleep: milliseconds => Bun.sleep(milliseconds), timeoutMs: 8_000, maxRetries: 0,
 fetch: async (url, init) => {
  const current = context; const requestedAtMs = Date.now();
  const response = await fetch(url, { ...init, signal: cycleSignal ? AbortSignal.any([init.signal, cycleSignal]) : init.signal });
  const code = await providerCode(response);
  if (current) current.receipts.push({ transport: 'production-fetch', correlationId: current.correlationId, chainIndex: current.chainIndex, endpoint: new URL(url).pathname, method: init.method, requestedAtMs, receivedAtMs: Date.now(), httpStatus: response.status, providerCode: code });
  return response;
 },
});
const core = createRealCore({ http, now: Date.now });
const rpc = createRpcReadAdapter({ fetch: (url, init) => fetch(url, init), now: Date.now });
const extensions = createRealExtensions({ http, now: Date.now });
const runtime = createRealRuntime({ config, journal, quota: () => http.quota.snapshot(),
 sanitize: input => ({ ...sanitizeCoreSample(input), transportEvidence: (input as WithTransport<CoreSample>).transportEvidence }),
 read: async (input, signal) => { cycleSignal = signal; context = { correlationId: input.correlationId, chainIndex: input.chainIndex, receipts: [] }; try {
  const observed = await attachObservedInventory(await core.read(input), input, rpc, Date.now, signal);
  const combined = await attachRealExtensions(observed, { correlationId: input.correlationId, chainIndex: input.chainIndex, revision: input.revision }, extensions, signal);
  return bindTransportProof(combined, context.receipts);
 } finally { cycleSignal = null; context = null; } },
 ...(config.jevCredentialPresent && config.jevAuthorized ? { decide: createRealJev(config.jevModel, config.jevUsdPerMillion) } : {}),
});
const publicMarket = createPublicMarket();
const publicWorker = createPublicRuntime({ read: () => publicMarket.read() });
const handle = createRealHandler(runtime, config, publicWorker);
let server: ReturnType<typeof Bun.serve>;
try { server = Bun.serve({ hostname: '127.0.0.1', port: config.port, idleTimeout: 45, fetch: handle }); }
catch { journal.close(); throw new Error('Independent pipeline could not bind its configured local port'); }
let stopping = false;
const shutdown = async () => {
 if (stopping) return; stopping = true;
 await server.stop(true); await Promise.all([runtime.stop(), publicWorker.stop()]); journal.close(); process.exit(0);
};
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
process.on('message', (message: unknown) => { if (typeof message === 'object' && message !== null && (message as { kind?: unknown }).kind === 'shutdown-real-console') void shutdown(); });
await runtime.start();
void publicWorker.start();
console.log(JSON.stringify({ mode: 'paper', executionEnabled: false, url: `http://127.0.0.1:${config.port}/api/real/health`, intervalMs: config.intervalMs, dependencies: runtime.health().dependencies }));
