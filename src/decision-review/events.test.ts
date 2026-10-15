import { expect, test } from "bun:test";
import { createOpportunityDispatcher, parseOpportunityEvent, type OpportunityEvent, type OpportunityReviewAck } from "./events";
import * as eventDispatchers from "./events";

const asset = "token:501:" + "5".repeat(44);
const event = (digest = "a".repeat(64), at = 1000) => ({ assetKey: asset, source: "onchain_price", kind: "price_changed", observedAtMs: at, fingerprint: digest });

test("a new fact requests a review immediately and duplicate facts do not consume another one", async () => {
  const calls: unknown[] = [];
  const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async batch => { calls.push(batch); return true; } });
  expect(d.notify(event())).toBe("accepted");
  expect(d.notify(event())).toBe("duplicate");
  await d.idle();
  expect(calls).toHaveLength(1);
  expect(d.status().queued).toBe(0);
});

test("facts arriving during a flight coalesce to the latest version and are reviewed after that flight without overlap", async () => {
  let release!: () => void, active = 0, maximum = 0;
  const started = new Promise<void>(r => { release = r; });
  const batches: string[][] = [];
  const d = createOpportunityDispatcher({ now: () => 1100, allowed: () => true, request: async batch => {
    active++; maximum = Math.max(maximum, active); batches.push(batch.map(e => e.fingerprint));
    if (batches.length === 1) await started;
    active--; return true;
  } });
  d.notify(event()); await Promise.resolve();
  d.notify(event("b".repeat(64), 1050)); d.notify(event("c".repeat(64), 1100));
  release(); await d.idle();
  expect(maximum).toBe(1);
  expect(batches).toEqual([["a".repeat(64)], ["c".repeat(64)]]);
});

test("a provider cooldown or a busy scheduler keeps the event for an explicit wake, not an infinite retry loop", async () => {
  let allowed = false, consumed = false, calls = 0;
  const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => allowed, request: async () => { calls++; return consumed; } });
  d.notify(event()); await d.idle(); expect(calls).toBe(0); expect(d.status().queued).toBe(1);
  allowed = true; d.wake(); await d.idle(); expect(calls).toBe(1); expect(d.status().queued).toBe(1);
  consumed = true; d.wake(); await d.idle(); expect(calls).toBe(2); expect(d.status().queued).toBe(0);
});

test("an expired event, a future event, a malformed identity and stopping never cause a review", async () => {
  let now = 1000, calls = 0;
  const d = createOpportunityDispatcher({ now: () => now, allowed: () => false, maxAgeMs: 100, request: async () => { calls++; return true; } });
  expect(d.notify(event(undefined, 899))).toBe("stale");
  expect(d.notify(event(undefined, 1001))).toBe("invalid");
  expect(d.notify({ ...event(), assetKey: "SOL", instructions: "buy" })).toBe("invalid");
  d.notify(event()); await d.idle(); now = 1200; d.wake(); await d.idle(); expect(d.status().queued).toBe(0);
  d.stop(); expect(d.notify(event(undefined, 1200))).toBe("stopped"); expect(calls).toBe(0);
});

test("independent assets form one batch and an unknown readiness exception preserves it", async () => {
  let ready = false;
  const batches: number[] = [];
  const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => { if (!ready) throw new Error("unavailable"); return true; },
    request: async batch => { batches.push(batch.length); return true; } });
  d.notify(event()); d.notify({ ...event(), assetKey: "token:501:" + "6".repeat(44) });
  await d.idle(); expect(batches).toEqual([]); expect(d.status().queued).toBe(2);
  ready = true; d.wake(); await d.idle(); expect(batches).toEqual([2]);
});

test("an older reordered update never replaces a newer queued fact", async () => {
  const calls: string[][] = [];
  const d = createOpportunityDispatcher({ now: () => 1100, allowed: () => true, request: async batch => { calls.push(batch.map(e => e.fingerprint)); return true; } });
  d.notify(event("b".repeat(64), 1100));
  expect(d.notify(event("a".repeat(64), 1000))).toBe("stale");
  await d.idle(); expect(calls).toEqual([["b".repeat(64)]]);
});

test("native coin events use the wallet's canonical identity without confusing two chains", async () => {
  const assets: string[] = [];
  const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async batch => { assets.push(...batch.map(e => e.assetKey)); return true; } });
  expect(d.notify({ ...event(), assetKey: "token:501:native" })).toBe("accepted");
  expect(d.notify({ ...event(), assetKey: "token:1:native" })).toBe("accepted");
  await d.idle(); expect(assets).toEqual(["token:501:native", "token:1:native"]);
});

test("a new provider observation of an unreviewed identical fact refreshes its age without duplicating the review", async () => {
  let now = 1000, ready = false;
  const calls: number[] = [];
  const d = createOpportunityDispatcher({ now: () => now, maxAgeMs: 100, allowed: () => ready,
    request: async batch => { calls.push(batch[0]!.observedAtMs); return true; } });
  d.notify(event()); await d.idle();
  now = 1090;
  expect(d.notify(event(undefined, now))).toBe("duplicate");
  now = 1150; ready = true; d.wake(); await d.idle();
  expect(calls).toEqual([1090]);
  expect(d.status().queued).toBe(0);
});

test("unconsumed in-flight keys keep their queue slots and cannot overflow the bound when restored", async () => {
  let release!: () => void;
  const wait = new Promise<void>(r => { release = r; });
  const d = createOpportunityDispatcher({ now: () => 1100, maxKeys: 2, allowed: () => true, request: async () => { await wait; return false; } });
  d.notify(event());
  d.notify({ ...event(), assetKey: "token:501:" + "6".repeat(44) });
  await Promise.resolve();
  expect(d.notify({ ...event(), assetKey: "token:501:" + "7".repeat(44) })).toBe("queue_full");
  expect(d.notify(event("b".repeat(64), 1100))).toBe("accepted");
  release(); await d.idle();
  expect(d.status()).toMatchObject({ queued: 2, awaitingWake: true });
});

const independent = (n: number, at = 1000): OpportunityEvent => ({ ...event(undefined, at), kind: "price_changed", assetKey: `token:1:0x${n.toString(16).padStart(40, "0")}` });

test("partial ACK preserves forty-three of fifty burst assets and waits for an explicit wake", async () => {
  const batches: number[] = [];
  const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => true, maxKeys: 50, request: async batch => {
    batches.push(batch.length); return batches.length === 1 ? { reviewed: batch.slice(0, 7) } : true;
  } });
  for (let i = 1; i <= 50; i++) expect(d.notify(independent(i))).toBe("accepted");
  expect(d.notify(independent(51))).toBe("queue_full");
  await d.idle();
  expect(d.status()).toMatchObject({ queued: 43, awaitingWake: true, running: false });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(batches).toEqual([50]);
  d.wake(); await d.idle(); expect(batches).toEqual([50, 43]); expect(d.status().queued).toBe(0);
});

test("unknown, duplicate, malformed and arbitrary truthy ACKs preserve the entire batch", async () => {
  const invalid: ((batch: readonly OpportunityEvent[]) => unknown)[] = [
    batch => ({ reviewed: [batch[0], independent(3)] }),
    batch => ({ reviewed: [batch[0], batch[0]] }),
    batch => ({ reviewed: [{ ...batch[0], observedAtMs: 1001 }] }),
    batch => ({ reviewed: [{ ...batch[0], fingerprint: "f".repeat(64) }] }),
    batch => ({ reviewed: [{ ...batch[0], source: "other_source" }] }),
    batch => ({ reviewed: [{ ...batch[0], kind: "risk_changed" }] }),
    batch => ({ reviewed: [{ ...batch[0], extra: true }] }),
    batch => ({ reviewed: [batch[0]], extra: true }),
    () => ({}), () => "true", () => 1, () => [], () => new Boolean(true),
    batch => ({ reviewed: Object.assign([batch[0]], { extra: true }) }),
    batch => ({ reviewed: [batch[0], ,] }),
    batch => Object.assign({ reviewed: [batch[0]] }, { [Symbol("unexpected")]: true }),
  ];
  for (const result of invalid) {
    let calls = 0;
    const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async batch => { calls++; return result(batch) as boolean | OpportunityReviewAck; } });
    d.notify(independent(1)); d.notify(independent(2)); await d.idle();
    expect(d.status()).toMatchObject({ queued: 2, awaitingWake: true }); expect(calls).toBe(1);
  }
});

test("ACK accessors are rejected without invoking them or serializing original objects", async () => {
  let called = 0;
  for (const result of [
    (batch: readonly OpportunityEvent[]) => Object.defineProperty({}, "reviewed", { enumerable: true, get() { called++; return batch; } }),
    (batch: readonly OpportunityEvent[]) => ({ reviewed: [Object.defineProperty({ ...batch[0] }, "fingerprint", { enumerable: true, get() { called++; return "a".repeat(64); } })] }),
  ]) {
    const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async batch => result(batch) as OpportunityReviewAck });
    d.notify(independent(1)); await d.idle(); expect(d.status().queued).toBe(1);
  }
  expect(called).toBe(0);
});

test("mutating an offered event cannot change its original internal version or forge an ACK", async () => {
  const offered: OpportunityEvent[][] = []; let count = 0;
  const d = createOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async batch => {
    offered.push(batch.map(e => ({ ...e })));
    if (++count === 1) { (batch[0] as { fingerprint: string }).fingerprint = "f".repeat(64); return { reviewed: [batch[0]!] }; }
    return true;
  } });
  d.notify(independent(1)); d.notify(independent(2)); await d.idle();
  expect(d.status()).toMatchObject({ queued: 2, awaitingWake: true });
  d.wake(); await d.idle(); expect(offered[1]).toEqual(offered[0]);
});

test("an ACK for an older fingerprint never removes a new same-key version received during flight", async () => {
  let release!: () => void, calls = 0; const gate = new Promise<void>(resolve => { release = resolve; });
  const batches: OpportunityEvent[][] = [];
  const d = createOpportunityDispatcher({ now: () => 1100, allowed: () => true, request: async batch => {
    batches.push(batch.map(e => ({ ...e })));
    if (++calls === 1) { await gate; return { reviewed: batch }; }
    return false;
  } });
  d.notify(event()); await Promise.resolve(); d.notify(event("b".repeat(64), 1100));
  release(); await d.idle();
  expect(batches.map(b => b.map(e => e.fingerprint))).toEqual([["a".repeat(64)], ["b".repeat(64)]]);
  expect(d.status()).toMatchObject({ queued: 1, awaitingWake: true });
});

test("a newer observation of identical facts remains pending after an older temporal ACK", async () => {
  for (const booleanAck of [false, true]) {
    let release!: () => void, calls = 0; const gate = new Promise<void>(resolve => { release = resolve; });
    const times: number[][] = [];
    const d = createOpportunityDispatcher({ now: () => 1100, allowed: () => true, request: async batch => {
      times.push(batch.map(e => e.observedAtMs));
      if (++calls === 1) { await gate; return booleanAck ? true : { reviewed: batch }; }
      return true;
    } });
    d.notify(event()); await Promise.resolve(); expect(d.notify(event(undefined, 1100))).toBe("duplicate");
    release(); await d.idle();
    expect(d.status()).toMatchObject({ queued: 1, awaitingWake: true }); expect(times).toEqual([[1000]]);
    d.wake(); await d.idle(); expect(times).toEqual([[1000], [1100]]); expect(d.status().queued).toBe(0);
  }
});

test("partial restoration preserves original age and stop cannot resurrect an in-flight batch", async () => {
  let now = 1000, calls = 0;
  const d = createOpportunityDispatcher({ now: () => now, maxAgeMs: 100, allowed: () => true, request: async batch => { calls++; return { reviewed: [batch[0]!] }; } });
  d.notify(independent(1)); d.notify(independent(2)); await d.idle(); expect(d.status().queued).toBe(1);
  now = 1101; d.wake(); await d.idle(); expect(d.status().queued).toBe(0); expect(calls).toBe(1);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const stopped = createOpportunityDispatcher({ now: () => 1000, allowed: () => true, request: async () => { await gate; return { reviewed: [] }; } });
  stopped.notify(independent(1)); await Promise.resolve(); stopped.stop(); release(); await stopped.idle();
  stopped.wake(); await stopped.idle(); expect(stopped.status()).toMatchObject({ stopped: true, queued: 0, running: false });
});

test("event dispatcher has no network, own clock, model, execution or persistent-store ports", async () => {
  const source = await Bun.file(new URL("./events.ts", import.meta.url)).text();
  expect(source).not.toMatch(/\bfetch\s*\(|\bprocess\.|\bDate\.now\s*\(|Bun\.|from ["'][^"']*(?:executor|ledger|cli|service|wire|node:fs)["']/);
});

test("event ingress refuses accessors without executing them or interrupting the source", () => {
  let calls = 0;
  const raw = Object.defineProperty({ ...event() }, "assetKey", { enumerable: true, get() { calls++; throw new Error("synthetic_getter"); } });
  const d = createOpportunityDispatcher({ now: () => 1_000, allowed: () => true, request: async () => true });
  expect(() => d.notify(raw)).not.toThrow();
  expect(d.notify(raw)).toBe("invalid");
  expect(parseOpportunityEvent(raw)).toBeNull();
  expect(calls).toBe(0);
});

test("event ingress refuses symbol or hidden fields beyond the exact five data properties", () => {
  const symbol = { ...event(), [Symbol("synthetic_extra")]: 1 };
  const hidden = Object.defineProperty({ ...event() }, "extra", { value: 1, enumerable: false });
  const d = createOpportunityDispatcher({ now: () => 1_000, allowed: () => false, request: async () => true });
  expect(d.notify(symbol)).toBe("invalid");
  expect(d.notify(hidden)).toBe("invalid");
  expect(parseOpportunityEvent(symbol)).toBeNull();
  expect(parseOpportunityEvent(hidden)).toBeNull();
});

test("generic versioned dispatcher is exported and parser failures are invalid without requesting work", async () => {
  expect(typeof eventDispatchers.createVersionedEventDispatcher).toBe("function");
  let calls = 0;
  const d = eventDispatchers.createVersionedEventDispatcher<OpportunityEvent>({
    codec: { parse: () => { throw new Error("synthetic_codec_failure"); }, key: e => e.assetKey, fingerprint: e => e.fingerprint, same: (a, b) => a?.observedAtMs === b.observedAtMs && a?.fingerprint === b.fingerprint },
    now: () => 1000, allowed: () => true, request: async () => { calls++; return true; },
  });
  expect(() => d.notify(event())).not.toThrow();
  expect(d.notify(event())).toBe("invalid");
  await d.idle(); expect(calls).toBe(0); expect(d.status().queued).toBe(0);
});

test("generic ACK enforces observation time and fingerprint even if the codec comparison is permissive", async () => {
  for (const changed of [{ observedAtMs: 1001 }, { fingerprint: "f".repeat(64) }]) {
    const d = eventDispatchers.createVersionedEventDispatcher<OpportunityEvent>({
      codec: { parse: parseOpportunityEvent, key: e => e.assetKey, fingerprint: e => e.fingerprint, same: () => true },
      now: () => 1100, allowed: () => true, request: async batch => ({ reviewed: [{ ...batch[0]!, ...changed }] }),
    });
    d.notify(event()); await d.idle(); expect(d.status()).toMatchObject({ queued: 1, awaitingWake: true }); d.stop();
  }
});
