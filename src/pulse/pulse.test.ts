import { expect, test } from "bun:test";
import type { SocketLike } from "../inonu/okx-ws";
import { createPulse } from "./pulse";
import { MINUTE } from "./regime";

// The pulse service with a FAKE socket, a FAKE scheduler and a FAKE clock: no network, no key, no money.
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % MINUTE);

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; }
  push(instId: string, rows: { px: string; sz: string; side: "buy" | "sell"; ts: number }[]): void {
    this.onmessage?.({ data: JSON.stringify({ arg: { channel: "trades", instId }, data: rows.map((r) => ({ ...r, ts: String(r.ts) })) }) });
  }
}

function rig(skewMs = 0) {
  const sockets: FakeSocket[] = [];
  const clock = { now: T0 + skewMs };
  const timers: { every: number; fn: () => void }[] = [];
  const afters: (() => void)[] = [];
  const pulse = createPulse({
    create: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    schedule: { after: (_ms, fn) => { afters.push(fn); return () => {}; }, every: (ms, fn) => { timers.push({ every: ms, fn }); return () => {}; } },
    now: () => clock.now,
  });
  return { pulse, sockets, clock, timers, afters, tick: () => { for (const t of timers) t.fn(); } };
}
/** Two trades per minute for a pair (buyers three to one), the local clock following the exchange time plus the skew of the machine. */
function feedMinutes(socket: FakeSocket, clock: { now: number }, skewMs: number, instId: string, from: number, closes: readonly number[]): void {
  closes.forEach((close, i) => {
    const base = T0 + (from + i) * MINUTE;
    clock.now = base + 20_000 + skewMs;
    socket.push(instId, [{ px: String(close), sz: "3", side: "buy", ts: base + 10_000 }, { px: String(close), sz: "1", side: "sell", ts: base + 20_000 }]);
  });
}
const CLIMB = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 101, 102, 103, 104, 105, 106];

test("before it is live and has bars, the pulse says nothing", () => {
  const { pulse } = rig();
  expect(pulse.context()).toBeNull();
  pulse.start();
  expect(pulse.context()).toBeNull();
  expect(pulse.status().feed.state).not.toBe("live");
});

test("trades become minute bars and the regime is flat keys for the Brief, with the closing bar closed by the quiet-market timer", () => {
  const { pulse, sockets, clock, tick } = rig();
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  expect(s.sent.map((m) => JSON.parse(m).args.map((a: { instId: string }) => a.instId)).flat().sort()).toEqual(["BTC-USDT", "SOL-USDT"]);
  feedMinutes(s, clock, 0, "BTC-USDT", 0, CLIMB);
  // minute 15 is still open: its bar closes when the minute ends, which a quiet market never announces
  clock.now = T0 + 16 * MINUTE + 1_000;
  tick();
  expect(pulse.context()).toEqual({
    btc_1m: 0.95,
    btc_5m: 4.95,
    btc_fl: 0.5,
    btc_rv: 0.499,
    sol_1m: null,
    sol_5m: null,
    sol_fl: null,
    sol_rv: null,
  });
  expect(pulse.status().instruments.find((i) => i.id === "BTC-USDT")).toMatchObject({ bars: 16 });
});

test("the local clock does not have to agree with the exchange: the pulse runs on event time", () => {
  const { pulse, sockets, clock, tick } = rig(77_000);
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  feedMinutes(s, clock, 77_000, "BTC-USDT", 0, CLIMB);
  // the last trade arrived 77 s "late" by the local clock; 41 s later the minute of the exchange is over
  clock.now += 41_000;
  tick();
  const ctx = pulse.context();
  expect(ctx).not.toBeNull();
  // an early close from a fast local clock would have made later trades of a minute late and dropped them; the numbers are those of a machine with the right time
  expect(ctx).toMatchObject({ btc_1m: 0.95, btc_5m: 4.95, btc_fl: 0.5, btc_rv: 0.499 });
});

test("a market that goes quiet becomes unknown, never calm", () => {
  const { pulse, sockets, clock, tick } = rig();
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  feedMinutes(s, clock, 0, "BTC-USDT", 0, CLIMB);
  clock.now += 41_000;
  tick();
  expect(pulse.context()).not.toBeNull();
  clock.now += 5 * MINUTE;
  tick();
  expect(pulse.context()).toBeNull();
});

test("a closed feed gives no context even if bars were kept", () => {
  const { pulse, sockets, clock, tick } = rig();
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  feedMinutes(s, clock, 0, "BTC-USDT", 0, CLIMB);
  clock.now += 41_000;
  tick();
  expect(pulse.context()).not.toBeNull();
  pulse.close();
  expect(pulse.context()).toBeNull();
  expect(pulse.status().feed.state).toBe("closed");
});

test("malformed rows are counted by the feed and never become bars", () => {
  const { pulse, sockets } = rig();
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  s.onmessage?.({ data: JSON.stringify({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [{ px: "-1", sz: "1", side: "buy", ts: String(T0) }, { px: "100", sz: "1", side: "hold", ts: String(T0) }] }) });
  expect(pulse.status().instruments.find((i) => i.id === "BTC-USDT")).toMatchObject({ bars: 0 });
  expect(pulse.status().rejected).toBe(2);
});

test("a fast local clock does not close a minute that is still open on the exchange (the late trade of that minute still counts)", () => {
  const skew = 77_000;
  const { pulse, sockets, clock, tick } = rig(skew);
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  feedMinutes(s, clock, skew, "BTC-USDT", 0, CLIMB.slice(0, 14));
  // minute 14: one trade, then the quiet-market timer fires while the exchange is still inside that minute (the local clock is 77 s ahead)
  const base = T0 + 14 * MINUTE;
  clock.now = base + 10_000 + skew;
  s.push("BTC-USDT", [{ px: "104", sz: "3", side: "buy", ts: base + 10_000 }]);
  tick();
  // another trade of the SAME minute arrives afterwards, at a new price
  clock.now = base + 50_000 + skew;
  s.push("BTC-USDT", [{ px: "104.5", sz: "1", side: "sell", ts: base + 50_000 }]);
  // minute 15 and the end of it
  feedMinutes(s, clock, skew, "BTC-USDT", 15, [106]);
  clock.now += 41_000;
  tick();
  // the close of minute 14 is the LAST trade of that minute (104.5), so the last minute moved 106 / 104.5 - 1
  expect(pulse.context()).toMatchObject({ btc_1m: 1.44 });
});

test("facts carry the identity of the print they came from; reading them again does not rejuvenate them", () => {
  const { pulse, sockets, clock, tick } = rig();
  pulse.start();
  const s = sockets[0]!;
  expect(pulse.facts()).toEqual([]);
  s.onopen?.();
  feedMinutes(s, clock, 0, "BTC-USDT", 0, CLIMB);
  clock.now += 41_000;
  tick();
  const [fact] = pulse.facts();
  expect(fact).toMatchObject({ kind: "market_regime", venue: "okx", marketType: "SPOT", instrument: "BTC-USDT", originAtMs: T0 + 15 * MINUTE + 20_000, generation: 0, quality: { bars: 16, gaps: 0 }, values: { ret1m: 0.95, ret5m: 4.95, flow5m: 0.5, rv15m: 0.499 } });
  expect(pulse.facts()).toHaveLength(1);
  // later and quiet, but still current: the same print, so the same fact and the same hash
  clock.now += 30_000;
  expect(pulse.facts()[0]!.hash).toBe(fact!.hash);
  // SOL has no print: no fact for it
  expect(pulse.facts().some((f) => f.instrument === "SOL-USDT")).toBe(false);
});

test("a reconnect is visible in the generation of the facts, and a stale series gives none", () => {
  const { pulse, sockets, clock, afters, tick } = rig();
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  feedMinutes(s, clock, 0, "BTC-USDT", 0, CLIMB);
  clock.now += 41_000;
  tick();
  const before = pulse.facts()[0]!;
  // the line drops and comes back
  s.onclose?.();
  expect(afters.length).toBeGreaterThan(0);
  afters[afters.length - 1]!();
  sockets[1]!.onopen?.();
  const after = pulse.facts()[0]!;
  expect(after.generation).toBe(before.generation + 1);
  expect(after.hash).not.toBe(before.hash);
  expect(after.originAtMs).toBe(before.originAtMs);
  clock.now += 5 * MINUTE;
  tick();
  expect(pulse.facts()).toEqual([]);
});

test("RED2 of the review: the origin of a fact is the last print of the last CLOSED minute that contributed, not the print of the minute still open", () => {
  const { pulse, sockets, clock, tick } = rig();
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  // minutes 0 to 14 complete, and one print in minute 15 which is still open
  feedMinutes(s, clock, 0, "BTC-USDT", 0, CLIMB.slice(0, 15));
  const base = T0 + 15 * MINUTE;
  clock.now = base + 20_000;
  s.push("BTC-USDT", [{ px: "106", sz: "3", side: "buy", ts: base + 20_000 }]);
  tick();
  const before = pulse.read().facts[0]!;
  // the values come from bars 0 to 14 only: the print at minute 15 and 20 s did not contribute to them
  expect(before.originAtMs).toBe(T0 + 14 * MINUTE + 20_000);
  expect(before.windowEndMs).toBe(T0 + 15 * MINUTE);
  expect(before.quality.bars).toBe(15);
  // a minute of silence later the open minute closes by the timer: new values, new window, new origin, new hash
  clock.now = base + 20_000 + 41_000;
  tick();
  const after = pulse.read().facts[0]!;
  expect(after.windowEndMs).toBe(T0 + 16 * MINUTE);
  expect(after.originAtMs).toBe(base + 20_000);
  expect(after.hash).not.toBe(before.hash);
  // and reading it again later, with nothing new, keeps it
  clock.now += 30_000;
  expect(pulse.facts()[0]!.hash).toBe(after.hash);
});

test("read() gives the context and the facts of ONE instant, and they agree", () => {
  const { pulse, sockets, clock, tick } = rig();
  pulse.start();
  const s = sockets[0]!;
  s.onopen?.();
  feedMinutes(s, clock, 0, "BTC-USDT", 0, CLIMB);
  clock.now += 41_000;
  tick();
  const reading = pulse.read();
  const fact = reading.facts.find((f) => f.instrument === "BTC-USDT")!;
  expect(reading.context).toMatchObject({ btc_1m: fact.values.ret1m, btc_5m: fact.values.ret5m, btc_fl: fact.values.flow5m, btc_rv: fact.values.rv15m });
  // the wrappers are that same reading
  expect(pulse.context()).toEqual(reading.context);
  expect(pulse.facts()).toEqual([...reading.facts]);
  // a feed that is not live gives neither
  pulse.close();
  expect(pulse.read()).toEqual({ context: null, facts: [] });
});
