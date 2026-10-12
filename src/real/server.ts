import type { RealConfig } from './config';
import type { RealRuntime } from './runtime';
import type { PublicRuntime } from './public-runtime';
import { capabilityCatalog } from './capabilities';

class BodyError extends Error { constructor(readonly status: number) { super('Invalid request body'); } }
async function boundedJson(request: Request): Promise<unknown> {
 if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new BodyError(415);
 if (!request.body) throw new BodyError(400);
 const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
 try {
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); throw new BodyError(413); } parts.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); } catch { throw new BodyError(400); }
 } finally { reader.releaseLock(); }
}

/** Local paper API. The versioned grant covers backend, OKX Web3 and declared public RPC reads. */
export function createRealHandler(runtime: RealRuntime, config: RealConfig, publicWorker?: PublicRuntime) {
 return async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const allowed = origin !== null && config.origins.includes(origin);
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (allowed) { headers['Access-Control-Allow-Origin'] = origin!; headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS'; headers['Access-Control-Allow-Headers'] = 'Content-Type'; }
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !allowed) return json({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers });
  try {
   if (request.method === 'GET' && url.pathname === '/api/real/health') { const health = runtime.health(); return json({ ...health, capabilities: capabilityCatalog(config, runtime.latest().cycle?.core ?? null, publicWorker?.latest()?.capability ?? null), services: { ...health.services, publicMarket: publicWorker?.health() ?? null } }); }
   if (request.method === 'GET' && url.pathname === '/api/real/latest') return json(runtime.latest());
   if (request.method === 'GET' && url.pathname === '/api/real/public-market') return json(publicWorker?.latest() ?? null);
   if (['POST', 'DELETE'].includes(request.method) && !allowed) return json({ error: 'Allowed Origin required' }, 403);
   if (url.pathname === '/api/real/public-market/refresh' && request.method === 'POST' && publicWorker) { await publicWorker.tick(); return json(publicWorker.latest()); }
   if (url.pathname === '/api/real/consent' && request.method === 'POST') return json(runtime.consent(await boundedJson(request)));
   if (url.pathname === '/api/real/consent' && request.method === 'DELETE') return json(runtime.revoke());
   if (url.pathname === '/api/real/refresh' && request.method === 'POST') { await runtime.tick(); return json(runtime.latest()); }
   return json({ error: 'Route unavailable in the independent real pipeline' }, 404);
  } catch (error) { return json({ error: error instanceof BodyError ? 'Invalid or oversized JSON' : 'Request could not be completed; inspect readiness' }, error instanceof BodyError ? error.status : 400); }
 };
}
