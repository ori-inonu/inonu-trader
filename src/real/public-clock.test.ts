import { expect, test } from 'bun:test';
import { createPublicClock } from './public-clock';

const start = 1_790_000_000_000;
function fixture(change: { rtt?: number; offset?: number; dateOffset?: number; status?: number; body?: unknown } = {}) {
 let wall = start, mono = 100;
 const sent: { url: string; init: RequestInit }[] = [];
 const clock = createPublicClock({ now: () => wall, monotonic: () => mono, fetch: async (url, init) => {
  sent.push({ url: String(url), init: init! });
  const rtt = change.rtt ?? 400; wall += rtt; mono += rtt;
  const server = start + rtt / 2 + (change.offset ?? 70_000);
  return new Response(JSON.stringify(change.body ?? { code: '0', data: [{ ts: String(server) }] }), { status: change.status ?? 200, headers: { Date: new Date(server + (change.dateOffset ?? 0)).toUTCString() } });
 } });
 return { clock, sent, advance(ms: number) { wall += ms; mono += ms; }, jump(ms: number) { wall += ms; } };
}

test('bounded public clock preserves original receipt and conservative local bounds without claiming injected transport real', async () => {
 const f = fixture(); const probe = await f.clock.observe();
 expect(probe.proof.status).toBe('ready'); expect(probe.proof.transport).toBe('injected');
 expect(probe.proof.serverAtMs).toBe(start + 70_200); expect(probe.proof.offsetMs).toBe(70_000);
 expect(probe.proof.uncertaintyMs).toBe(201); expect(probe.valid()).toBe(true);
 const bounds = probe.localBounds(start + 70_400)!;
 expect(bounds.earliestLocalMs).toBe(start + 400 - 451);
 expect(bounds.latestLocalMs).toBe(start + 400 + 451);
 expect(f.sent).toHaveLength(1); expect(f.sent[0]!.url).toBe('https://www.okx.com/api/v5/public/time');
 expect(f.sent[0]!.init.redirect).toBe('error'); expect(f.sent[0]!.init.credentials).toBe('omit');
 expect(f.sent[0]!.init.headers).toEqual({ Accept: 'application/json' });
});

test('clock expires by monotonic elapsed time after at most60 seconds', async () => {
 const f = fixture(); const probe = await f.clock.observe(); f.advance(60_000);
 expect(probe.valid()).toBe(false); expect(probe.localBounds(start)).toBeNull();
});

test('forward or backward wall-clock jumps invalidate the calibrated observation', async () => {
 for (const ms of [1000, -1000]) { const f = fixture(); const probe = await f.clock.observe(); f.jump(ms); expect(probe.valid()).toBe(false); f.jump(-ms); expect(probe.valid()).toBe(false); }
});

test('excessive RTT, offset or disagreement with HTTP Date fails closed', async () => {
 for (const change of [{ rtt: 2001 }, { offset: 180001 }, { dateOffset: 5000 }]) {
  const probe = await fixture(change).clock.observe(); expect(probe.proof.status).toBe('blocked'); expect(probe.localBounds(start)).toBeNull();
 }
});

test('unsuccessful or malformed response cannot establish a clock, does not echo provider content or retry', async () => {
 for (const change of [{ status: 500, body: { msg: 'private-provider-error' } }, { body: { code: '0', data: [{ ts: 'NaN' }] } }, { body: { code: '0', data: [{ ts: String(start) }, { ts: String(start) }] } }]) {
  const f = fixture(change); const probe = await f.clock.observe(); expect(probe.proof.status).toBe('blocked'); expect(f.sent).toHaveLength(1); expect(JSON.stringify(probe.proof)).not.toContain('private-provider-error');
 }
});

test('production transport is chosen only when no fetch seam is injected', async () => {
 const f = fixture(); const probe = await f.clock.observe(); expect(probe.proof.transport).toBe('injected');
});
