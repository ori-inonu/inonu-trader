const ENDPOINT = '/api/v5/public/time' as const;
const TTL_MS = 60_000;
const DRIFT_MS = 250;

export interface PublicClockProof {
 source: 'okx-public-v5'; endpoint: typeof ENDPOINT;
 transport: 'production-https' | 'injected'; status: 'ready' | 'blocked';
 requestedAtMs: number; receivedAtMs: number; serverAtMs: number | null;
 dateHeaderAtMs: number | null; httpStatus: number | null; code: string | null;
 offsetMs: number | null; uncertaintyMs: number | null; expiresAtMs: number;
 reason: string | null;
}
export interface PublicClockObservation {
 proof: PublicClockProof;
 valid(): boolean;
 localBounds(sourceMs: number): { earliestLocalMs: number; latestLocalMs: number } | null;
}

/** A short-lived reference for public Exchange reads only. Never changes the OS clock. */
export function createPublicClock(options: { now?: () => number; monotonic?: () => number; fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response> } = {}) {
 const now = options.now ?? Date.now;
 const monotonic = options.monotonic ?? (() => performance.now());
 const request = options.fetch ?? globalThis.fetch;
 return {
  async observe(): Promise<PublicClockObservation> {
   const requestedAtMs = now(), sentMono = monotonic();
   const proof: PublicClockProof = { source: 'okx-public-v5', endpoint: ENDPOINT, transport: options.fetch ? 'injected' : 'production-https', status: 'blocked', requestedAtMs, receivedAtMs: requestedAtMs, serverAtMs: null, dateHeaderAtMs: null, httpStatus: null, code: null, offsetMs: null, uncertaintyMs: null, expiresAtMs: requestedAtMs, reason: 'Referência pública de tempo não validada.' };
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 2_000);
   let receivedMono = sentMono;
   try {
    const response = await request(`https://www.okx.com${ENDPOINT}`, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
    proof.httpStatus = response.status;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('body');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
     for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_048) throw new Error('bounds');
      chunks.push(part.value);
     }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    proof.receivedAtMs = now(); receivedMono = monotonic();
    const joined = new Uint8Array(size); let cursor = 0;
    for (const chunk of chunks) { joined.set(chunk, cursor); cursor += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('shape');
    const value = body as { code?: unknown; data?: unknown };
    if (typeof value.code === 'string' && /^-?\d{1,12}$/.test(value.code)) proof.code = value.code;
    if (!response.ok || proof.code !== '0' || !Array.isArray(value.data) || value.data.length !== 1) throw new Error('response');
    const row: unknown = value.data[0];
    if (!row || typeof row !== 'object' || Array.isArray(row) || !('ts' in row) || typeof row.ts !== 'string' || !/^\d{13}$/.test(row.ts)) throw new Error('timestamp');
    const server = Number(row.ts), date = Date.parse(response.headers.get('Date') ?? '');
    const rtt = receivedMono - sentMono, elapsed = proof.receivedAtMs - requestedAtMs;
    if (!Number.isSafeInteger(server) || !Number.isFinite(date) || !Number.isFinite(rtt) || rtt < 0 || rtt > 2_000 || Math.abs(elapsed - rtt) > DRIFT_MS || Math.abs(server - date) > 2_000) throw new Error('clock');
    const offset = server - (requestedAtMs + proof.receivedAtMs) / 2;
    if (Math.abs(offset) > 180_000) throw new Error('offset');
    proof.serverAtMs = server; proof.dateHeaderAtMs = date;
    proof.offsetMs = offset; proof.uncertaintyMs = rtt / 2 + 1;
    proof.expiresAtMs = proof.receivedAtMs + TTL_MS; proof.status = 'ready'; proof.reason = null;
   } catch {
    proof.receivedAtMs = now(); receivedMono = monotonic(); proof.expiresAtMs = proof.receivedAtMs;
   } finally { clearTimeout(timeout); }
   let invalidated = false;
   const valid = () => {
    const elapsed = monotonic() - receivedMono;
    const fresh = proof.status === 'ready' && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < TTL_MS && now() < proof.expiresAtMs && Math.abs(now() - proof.receivedAtMs - elapsed) <= DRIFT_MS;
    if (!fresh) invalidated = true;
    return !invalidated;
   };
   return { proof, valid, localBounds(sourceMs: number) {
    if (!valid() || !Number.isSafeInteger(sourceMs) || sourceMs < 0 || sourceMs > 8_640_000_000_000_000 || proof.offsetMs === null || proof.uncertaintyMs === null) return null;
    const center = sourceMs - proof.offsetMs, margin = proof.uncertaintyMs + DRIFT_MS;
    return { earliestLocalMs: Math.floor(center - margin), latestLocalMs: Math.ceil(center + margin) };
   } };
  },
 };
}
