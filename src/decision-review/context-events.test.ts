import { expect, test } from "bun:test";
import { parseOpportunityEvent } from "./events";
import { createContextOpportunityDispatcher, parseContextOpportunityEvent, type ContextOpportunityEvent, type ContextReviewAck } from "./context-events";

const event = (contextKey = "okx:SPOT:BTC-USDT", observedAtMs = 1000, factHash = "a".repeat(64)): ContextOpportunityEvent => ({ contextKey, source: "okx-public-trades", kind: "market_regime", observedAtMs, factHash });

test("macro parser accepts coherent market identities and never fabricates a token mint", () => {
  for (const key of ["okx:SPOT:BTC-USDT", "okx:SWAP:BTC-USDT-SWAP", "okx:FUTURES:BTC-USD-261225"]) {
    const parsed = parseContextOpportunityEvent(event(key)); expect(parsed).toEqual(event(key));
    expect(parsed).not.toBe(event(key)); expect(parseOpportunityEvent(parsed)).toBeNull();
    expect(Object.keys(parsed!)).toEqual(["contextKey", "source", "kind", "observedAtMs", "factHash"]);
  }
  for (const key of ["token:501:native", "BTC", "binance:SPOT:BTC-USDT", "okx:SPOT:BTC-USDT-SWAP", "okx:SWAP:BTC-USDT", "okx:FUTURES:BTC-USD-SWAP", "okx:FUTURES:BTC-USD-261332", "okx:SPOT:btc-usdt", "okx:SPOT:BTC-USDT:extra"]) expect(parseContextOpportunityEvent(event(key))).toBeNull();
});

test("macro parser detaches five data fields and rejects accessors, symbols, hidden properties and malformed values", () => {
  let getters = 0;
  const getter = Object.defineProperty({ ...event() }, "contextKey", { enumerable: true, get() { getters++; throw new Error("fixture_getter"); } });
  const hidden = Object.defineProperty({ ...event() }, "extra", { value: true });
  for (const raw of [getter, hidden, { ...event(), [Symbol("extra")]: 1 }, { ...event(), assetKey: "token:501:native" }, { ...event(), source: "onchain_price" }, { ...event(), kind: "price_changed" }, { ...event(), observedAtMs: NaN }, { ...event(), observedAtMs: Infinity }, { ...event(), observedAtMs: -1 }, { ...event(), observedAtMs: .5 }, { ...event(), factHash: "A".repeat(64) }, new Proxy({}, { getPrototypeOf() { throw new Error("fixture_proxy"); } })]) expect(parseContextOpportunityEvent(raw)).toBeNull();
  expect(getters).toBe(0);
  const raw = event(), parsed = parseContextOpportunityEvent(raw); (raw as { factHash: string }).factHash = "b".repeat(64);
  expect(parsed?.factHash).toBe("a".repeat(64));
});

test("macro burst of fifty markets uses the shared queue and partial exact ACK", async () => {
  const batches: number[] = []; let active = 0, maximum = 0;
  const d = createContextOpportunityDispatcher({ now: () => 1000, allowed: () => true, maxKeys: 50, request: async batch => {
    active++; maximum = Math.max(maximum, active); batches.push(batch.length); await Promise.resolve(); active--;
    return { reviewed: batches.length === 1 ? batch.slice(0, 7) : batch };
  } });
  for (let i = 0; i < 50; i++) expect(d.notify(event(`okx:SPOT:T${i}-USDT`))).toBe("accepted");
  expect(d.notify(event("okx:SPOT:EXTRA-USDT"))).toBe("queue_full"); await d.idle();
  expect(d.status()).toMatchObject({ queued: 43, awaitingWake: true, running: false }); expect(batches).toEqual([50]);
  d.wake(); await d.idle(); expect(batches).toEqual([50, 43]); expect(d.status().queued).toBe(0); expect(maximum).toBe(1);
});

test("same fact after a reconnect has a new hash and an older ACK cannot remove it", async () => {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; }); const batches: ContextOpportunityEvent[][] = [];
  const d = createContextOpportunityDispatcher({ now: () => 1100, allowed: () => true, request: async batch => {
    batches.push([...batch]); if (batches.length === 1) await gate; return { reviewed: batch };
  } });
  d.notify(event()); await Promise.resolve(); expect(d.notify(event(undefined, 1100, "b".repeat(64)))).toBe("accepted");
  release(); await d.idle(); expect(batches.map(b => b[0]!.factHash)).toEqual(["a".repeat(64), "b".repeat(64)]); expect(d.status().queued).toBe(0);
});

test("same factHash with a newer local observation waits after the earlier temporal ACK", async () => {
  for (const literal of [false, true]) {
    let release!: () => void; const gate = new Promise<void>(r => { release = r; }); const times: number[] = [];
    const d = createContextOpportunityDispatcher({ now: () => 1100, allowed: () => true, request: async batch => {
      times.push(batch[0]!.observedAtMs); if (times.length === 1) await gate; return literal ? true : { reviewed: batch };
    } });
    d.notify(event()); await Promise.resolve(); expect(d.notify(event(undefined, 1100))).toBe("duplicate"); release(); await d.idle();
    expect(d.status()).toMatchObject({ queued: 1, awaitingWake: true }); expect(times).toEqual([1000]);
    d.wake(); await d.idle(); expect(times).toEqual([1000, 1100]); expect(d.status().queued).toBe(0);
  }
});

test("macro ACK rejects wrong identity, time, hash, accessors, extras and arbitrary truthy results", async () => {
  let getters = 0;
  const invalid: ((batch: readonly ContextOpportunityEvent[]) => unknown)[] = [
    batch => ({ reviewed: [{ ...batch[0], contextKey: "okx:SPOT:ETH-USDT" }] }), batch => ({ reviewed: [{ ...batch[0], observedAtMs: 1001 }] }),
    batch => ({ reviewed: [{ ...batch[0], factHash: "f".repeat(64) }] }), batch => ({ reviewed: [batch[0], batch[0]] }),
    batch => Object.defineProperty({}, "reviewed", { enumerable: true, get() { getters++; return batch; } }),
    batch => ({ reviewed: [Object.defineProperty({ ...batch[0] }, "factHash", { enumerable: true, get() { getters++; return "a".repeat(64); } })] }),
    batch => ({ reviewed: [batch[0]], extra: true }), () => "true", () => 1,
  ];
  for (const reply of invalid) {
    const d = createContextOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async batch => reply(batch) as ContextReviewAck });
    d.notify(event()); await d.idle(); expect(d.status()).toMatchObject({ queued: 1, awaitingWake: true }); d.stop();
  }
  expect(getters).toBe(0);
});

test("macro mutation cannot rewrite internal versions or erase an unreviewed market", async () => {
  let count = 0; const offered: string[][] = [];
  const d = createContextOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async batch => {
    offered.push(batch.map(e => e.factHash)); if (++count === 1) { (batch[0] as { factHash: string }).factHash = "f".repeat(64); return { reviewed: batch }; } return true;
  } });
  d.notify(event()); await d.idle(); expect(d.status().queued).toBe(1); d.wake(); await d.idle(); expect(offered).toEqual([["a".repeat(64)], ["a".repeat(64)]]);
});

test("macro freshness, readiness, retained slots and stop use the shared dispatcher semantics", async () => {
  let now = 1000, ready = false, calls = 0;
  const d = createContextOpportunityDispatcher({ now: () => now, maxAgeMs: 100, allowed: () => ready, maxKeys: 1, request: async () => { calls++; return false; } });
  expect(d.notify(event(undefined, 899))).toBe("stale"); expect(d.notify(event(undefined, 1001))).toBe("invalid");
  d.notify(event()); await d.idle(); expect(calls).toBe(0); expect(d.notify(event("okx:SPOT:ETH-USDT"))).toBe("queue_full");
  ready = true; d.wake(); await d.idle(); expect(calls).toBe(1); expect(d.status().queued).toBe(1);
  now = 1101; d.wake(); await d.idle(); expect(calls).toBe(1); expect(d.status().queued).toBe(0);
  d.stop(); expect(d.notify(event(undefined, now))).toBe("stopped");
});

test("macro codec has no pulse, network, own clock, model, financial or persistent-store import", async () => {
  const source = await Bun.file(new URL("./context-events.ts", import.meta.url)).text();
  expect(source).not.toMatch(/\bfetch\s*\(|\bprocess\.|\bDate\.now\s*\(|Bun\.|from ["'][^"']*(?:pulse|executor|ledger|cli|service|wire|node:fs)["']/);
});
