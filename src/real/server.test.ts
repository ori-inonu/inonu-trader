import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRealConfig } from './config';
import { openRealJournal } from './journal';
import { createRealRuntime } from './runtime';
import { createRealHandler } from './server';
import { createPublicRuntime } from './public-runtime';

type Handler = (request: Request) => Promise<Response>;
const HOST = '127.0.0.1:3000';
/** A browser or curl always sends Host, but a Request built from a URL carries none; the handler refuses a missing Host on purpose. */
const withHost = (handler: Handler): Handler => request => { if (!request.headers.has('host')) request.headers.set('host', HOST); return handler(request); };

test('HTTP readiness is public and consent writes require an allowed origin and bounded valid JSON', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-http-'));
 const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 try {
  const config = loadRealConfig({});
  const runtime = createRealRuntime({ config, journal, read: async () => { throw new Error('not configured'); }, sanitize: value => value as any });
  const publicWorker = createPublicRuntime({ read: async () => { throw new Error('unavailable'); } });
  const handler = withHost(createRealHandler(runtime, config, publicWorker));
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

// D-A3. /api/real/latest carries balances and the browser sends no Origin on a same-origin GET, so a page on a rebound
// DNS name could read it. The Host header is what a rebinding page cannot forge: it must name this loopback server.

function fixture(env: Record<string, string> = {}) {
 const dir = mkdtempSync(join(tmpdir(), 'real-host-'));
 const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 const config = loadRealConfig(env);
 const runtime = createRealRuntime({ config, journal, read: async () => { throw new Error('not configured'); }, sanitize: value => value as any });
 const handler = createRealHandler(runtime, config, createPublicRuntime({ read: async () => { throw new Error('unavailable'); } }));
 return { handler, close() { journal.close(); rmSync(dir, { recursive: true, force: true }); } };
}
const at = (host: string | null, path: string, init: RequestInit = {}) => {
 const headers = new Headers(init.headers);
 if (host !== null) headers.set('host', host);
 return new Request(`http://127.0.0.1:3000${path}`, { ...init, headers });
};
const CONSENT = JSON.stringify({ consent: true, queryScope: 'web3-rpc-read-v2', address: '0x' + '1'.repeat(40), chainIndex: '196', revision: 1 });

test('D-A3 the loopback names with the server port are served, whatever their letter case', async () => {
 const { handler, close } = fixture();
 try {
  for (const host of ['127.0.0.1:3000', 'localhost:3000', '[::1]:3000', 'LocalHost:3000', 'LOCALHOST:3000']) {
   const response = await handler(at(host, '/api/real/latest'));
   expect(response.status, host).toBe(200);
   expect(await response.json(), host).toHaveProperty('history');
  }
 } finally { close(); }
});

test('D-A3 any other Host is refused with 421 and an empty body, even for the GET that has no Origin', async () => {
 const { handler, close } = fixture();
 try {
  const hostile = [
   'evil.example:3000', 'evil.example', '127.0.0.1', 'localhost', '[::1]', '127.0.0.1:3001', 'localhost:3001', '127.0.0.1:30000', '127.0.0.1:300',
   '127.0.0.1:3000.evil.example', '127.0.0.1.evil.example:3000', 'localhost.:3000', 'localhost:3000.', '0.0.0.0:3000', '[::2]:3000', '127.0.0.2:3000',
   'user@127.0.0.1:3000', '127.0.0.1:3000, evil.example:3000', '', '192.168.1.20:3000',
  ];
  const calls: Array<[string, RequestInit]> = [
   ['/api/real/latest', {}],
   ['/api/real/health', {}],
   ['/api/real/public-market', {}],
   ['/api/real/latest', { headers: { Origin: 'http://localhost:3001' } }],
   ['/api/real/consent', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3001' } }],
   ['/api/real/consent', { method: 'POST', headers: { Origin: 'http://localhost:3001', 'Content-Type': 'application/json' }, body: CONSENT }],
   ['/api/real/consent', { method: 'DELETE', headers: { Origin: 'http://localhost:3001' } }],
   ['/api/real/refresh', { method: 'POST', headers: { Origin: 'http://localhost:3001' } }],
   ['/api/real/unknown', {}],
  ];
  for (const host of hostile) {
   for (const [path, init] of calls) {
    const label = `${JSON.stringify(host)} ${init.method ?? 'GET'} ${path}`;
    const response = await handler(at(host, path, init));
    expect(response.status, label).toBe(421);
    expect(await response.text(), label).toBe('');
    expect(response.headers.get('access-control-allow-origin'), label).toBeNull();
    expect(response.headers.get('cache-control'), label).toBe('no-store');
   }
  }
 } finally { close(); }
});

test('D-A3 a request without a Host header is refused', async () => {
 const { handler, close } = fixture();
 try {
  for (const path of ['/api/real/latest', '/api/real/health', '/api/real/public-market']) {
   const response = await handler(at(null, path));
   expect(response.status, path).toBe(421);
   expect(await response.text(), path).toBe('');
  }
 } finally { close(); }
});

test('D-A3 the server port decides which Host is valid, and a non-default REAL_PORT moves the allowlist with it', async () => {
 const { handler, close } = fixture({ REAL_PORT: '4310' });
 try {
  expect((await handler(at('127.0.0.1:4310', '/api/real/latest'))).status).toBe(200);
  expect((await handler(at('localhost:4310', '/api/real/latest'))).status).toBe(200);
  expect((await handler(at('127.0.0.1:3000', '/api/real/latest'))).status).toBe(421);
 } finally { close(); }
});

test('D-A3 port 80 is served by the bare host names a browser sends for it', async () => {
 const { handler, close } = fixture({ REAL_PORT: '80' });
 try {
  for (const host of ['127.0.0.1', 'localhost', '[::1]', '127.0.0.1:80']) expect((await handler(at(host, '/api/real/latest'))).status, host).toBe(200);
  expect((await handler(at('127.0.0.1:3000', '/api/real/latest'))).status).toBe(421);
 } finally { close(); }
});

test('D-A3 the Origin and CORS rules of an allowed Host are unchanged', async () => {
 const { handler, close } = fixture();
 try {
  const allowed = await handler(at(HOST, '/api/real/health', { headers: { Origin: 'http://localhost:3001' } }));
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
  expect(allowed.headers.get('vary')).toBe('Origin');
  const same = await handler(at(HOST, '/api/real/health'));
  expect(same.status).toBe(200);
  expect(same.headers.get('access-control-allow-origin')).toBeNull();
  const foreign = await handler(at(HOST, '/api/real/latest', { headers: { Origin: 'https://attacker.example' } }));
  expect(foreign.status).toBe(403);
  expect(await foreign.json()).toEqual({ error: 'Origin not allowed' });
  expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  const preflight = await handler(at(HOST, '/api/real/consent', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:3001' } }));
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-methods')).toBe('GET,POST,DELETE,OPTIONS');
  expect((await handler(at(HOST, '/api/real/consent', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } }))).status).toBe(403);
  expect((await handler(at(HOST, '/api/real/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: CONSENT }))).status).toBe(403);
  expect((await handler(at(HOST, '/api/real/unknown'))).status).toBe(404);
 } finally { close(); }
});

/** One request over a raw socket, so the Host line is exactly what is written (fetch would rewrite it). */
async function raw(port: number, request: string): Promise<{ status: number; body: string }> {
 const chunks: Buffer[] = [];
 await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('socket timeout')), 5_000);
  let quiet: ReturnType<typeof setTimeout> | undefined;
  Bun.connect({ hostname: '127.0.0.1', port, socket: {
   open(socket) { socket.write(request); },
   // The reply is complete when the server closes or has been silent for a moment (an HTTP/1.0 reply may leave the socket open).
   data(socket, data) { chunks.push(Buffer.from(data)); clearTimeout(quiet); quiet = setTimeout(() => socket.end(), 300); },
   close() { clearTimeout(timer); clearTimeout(quiet); resolve(); },
   error(_socket, error) { clearTimeout(timer); clearTimeout(quiet); reject(error); },
  } }).catch(reject);
 });
 const text = Buffer.concat(chunks).toString('utf8');
 return { status: Number(/^HTTP\/1\.[01] (\d{3})/.exec(text)?.[1]), body: text.slice(text.indexOf('\r\n\r\n') + 4) };
}

test('D-A3 on a real socket a rebinding Host and a missing Host get 421, a loopback Host gets the data', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'real-wire-'));
 const journal = openRealJournal(join(dir, 'cycles.jsonl'));
 let handle: Handler = async () => new Response(null, { status: 503 });
 const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => handle(request) });
 try {
  const port = server.port as number;
  const config = loadRealConfig({ REAL_PORT: String(port) });
  const runtime = createRealRuntime({ config, journal, read: async () => { throw new Error('not configured'); }, sanitize: value => value as any });
  handle = createRealHandler(runtime, config, createPublicRuntime({ read: async () => { throw new Error('unavailable'); } }));
  const get = (host: string | null, version = '1.1') => `GET /api/real/latest HTTP/${version}\r\n${host === null ? '' : `Host: ${host}\r\n`}Connection: close\r\n\r\n`;
  const rebound = await raw(port, get(`rebound.example:${port}`));
  expect(rebound.status).toBe(421);
  expect(rebound.body).toBe('');
  const local = await raw(port, get(`localhost:${port}`));
  expect(local.status).toBe(200);
  expect(JSON.parse(local.body)).toHaveProperty('history');
  const literal = await raw(port, get(`127.0.0.1:${port}`));
  expect(literal.status).toBe(200);
  const missing = await raw(port, get(null, '1.0'));
  expect(missing.status).toBe(421);
  expect(missing.body).toBe('');
 } finally { await server.stop(true); journal.close(); rmSync(dir, { recursive: true, force: true }); }
});
