import { expect, test } from "bun:test";
import { captureOpportunityFacts, captureEventReviewBrief, proveOpportunityReview } from "./event-evidence";
import { createOpportunityDispatcher } from "./events";

const asset = "token:501:" + "5".repeat(44);
const item = `buy:${asset}`;
function snapshot(price = 2, at = 1_000) {
  const result = captureOpportunityFacts({ assetKey: asset, source: "onchain_price", kind: "price_changed", observedAtMs: at, availableAtMs: at + 10, facts: { price, liquidity: 500 } });
  if (!result.ok) throw new Error("fixture_snapshot_invalid");
  return result.value;
}
function frame() {
  const fact = snapshot();
  const captured = captureEventReviewBrief({ compras: { [item]: { p: 2, l: 500 } }, posicoes: {}, contexto: null });
  if (!captured.ok) throw new Error("fixture_brief_invalid");
  return {
    cycleId: "cycle-event-1", askedAtMs: 1_100, answeredAtMs: 1_200, maxAgeMs: 1_000,
    brief: captured.brief, briefHash: captured.hash, batch: [fact.event],
    bindings: [{ snapshot: fact, section: "compras", itemId: item, fields: { price: "p", liquidity: "l" } }],
  };
}

test("only facts present in the exact consulted Brief can acknowledge an event", () => {
  const input = frame();
  const result = proveOpportunityReview(input);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.ack.reviewed).toEqual(input.batch);
  expect(result.proof.briefHash).toBe(input.briefHash);
  expect(result.proof.sourceAuthenticated).toBe(false);
  expect(result.proof.executionProven).toBe(false);
});

test("a consultation using old cached values leaves the new event unconsumed", () => {
  const input = frame();
  const next = snapshot(3, 1_020);
  const result = proveOpportunityReview({ ...input, batch: [next.event], bindings: [{ ...input.bindings[0], snapshot: next }] });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.ack.reviewed).toEqual([]);
  expect(result.proof.events[0]?.status).toBe("facts_missing");
});

test("availability after the model was asked cannot leak into its review", () => {
  const input = frame();
  const future = snapshot(2, 1_100);
  const result = proveOpportunityReview({ ...input, batch: [future.event], bindings: [{ ...input.bindings[0], snapshot: future }] });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.ack.reviewed).toEqual([]);
  expect(result.proof.events[0]?.status).toBe("not_available");
});

test("snapshot and Brief hashes cannot be rebound to changed values", () => {
  const input = frame();
  const changed = { ...input.bindings[0]!.snapshot, facts: { price: 9, liquidity: 500 } };
  const result = proveOpportunityReview({ ...input, bindings: [{ ...input.bindings[0], snapshot: changed }] });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.ack.reviewed).toEqual([]);
  expect(proveOpportunityReview({ ...input, brief: { compras: {}, posicoes: {}, contexto: null } }).ok).toBe(false);
});

test("equal values in another asset or in the legend are not the event's active facts", () => {
  const input = frame();
  const wrongItem = `buy:token:501:${"6".repeat(44)}`;
  for (const binding of [{ ...input.bindings[0], itemId: wrongItem }, { ...input.bindings[0], section: "chaves" }]) {
    const result = proveOpportunityReview({ ...input, bindings: [binding] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ack.reviewed).toEqual([]);
  }
});

test("captured Brief is detached, frozen and preserves its serialized key order", () => {
  const raw = { z: { value: 1 }, a: 2 };
  const result = captureEventReviewBrief(raw);
  expect(result.ok).toBe(true);
  raw.z.value = 7;
  if (!result.ok) return;
  expect(JSON.stringify(result.brief)).toBe('{"z":{"value":1},"a":2}');
  expect(Object.isFrozen(result.brief)).toBe(true);
  expect(Object.isFrozen(result.brief.z)).toBe(true);
});

test("accessors are rejected without running user code", () => {
  let called = 0;
  const raw = Object.defineProperty({}, "price", { enumerable: true, get() { called++; throw new Error("fixture"); } });
  expect(captureEventReviewBrief(raw).ok).toBe(false);
  expect(captureOpportunityFacts({ assetKey: asset, source: "onchain_price", kind: "price_changed", observedAtMs: 100, availableAtMs: 100, facts: raw }).ok).toBe(false);
  expect(called).toBe(0);
});

test("same material facts preserve the event fingerprint while new observations have distinct snapshots", () => {
  const first = snapshot(), next = snapshot(2, 1_050);
  expect(first.event.fingerprint).toBe(next.event.fingerprint);
  expect(first.snapshotHash).not.toBe(next.snapshotHash);
  const reordered = captureOpportunityFacts({ assetKey: asset, source: "onchain_price", kind: "price_changed", observedAtMs: 1_000, availableAtMs: 1_010, facts: { liquidity: 500, price: 2 } });
  expect(reordered.ok).toBe(true);
  if (reordered.ok) expect(reordered.value).toEqual(first);
});

test("a stale observation cannot be rejuvenated by availability or the next cycle", () => {
  const input = frame();
  const result = proveOpportunityReview({ ...input, askedAtMs: 9_000, answeredAtMs: 9_100 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.proof.events[0]?.status).toBe("stale");
  expect(result.ack.reviewed).toEqual([]);
});

test("partial representations, ambiguous mappings and duplicate bindings cannot acknowledge a full fact set", () => {
  const input = frame();
  for (const fields of [{ price: "p" }, { price: "p", liquidity: "p" }]) {
    const result = proveOpportunityReview({ ...input, bindings: [{ ...input.bindings[0], fields }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proof.events[0]?.status).toBe("binding_invalid");
  }
  expect(proveOpportunityReview({ ...input, bindings: [input.bindings[0], input.bindings[0]] }).ok).toBe(false);
  expect(proveOpportunityReview({ ...input, batch: [...input.batch, ...input.batch] }).ok).toBe(false);
});

test("unknown fields, clocks, non-JSON data and changed Brief order fail explicitly", () => {
  const input = frame();
  for (const change of [{ answeredAtMs: 1_099 }, { askedAtMs: -1 }, { maxAgeMs: 0 }, { maxAgeMs: Infinity }, { invented: true }]) {
    expect(proveOpportunityReview({ ...input, ...change }).ok).toBe(false);
  }
  const reordered = { contexto: null, posicoes: {}, compras: { [item]: { p: 2, l: 500 } } };
  expect(proveOpportunityReview({ ...input, brief: reordered })).toEqual({ ok: false, code: "brief_hash_mismatch" });
  expect(captureEventReviewBrief({ x: undefined }).ok).toBe(false);
  expect(captureEventReviewBrief({ x: new Date() }).ok).toBe(false);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  expect(captureEventReviewBrief(cyclic).ok).toBe(false);
  expect(captureEventReviewBrief({ x: [1, , 3] }).ok).toBe(false);
});

test("an exact holding identity is supported without inventing wallet authority", () => {
  const input = frame(), held = `hold:${asset}@agente`;
  const captured = captureEventReviewBrief({ compras: {}, posicoes: { [held]: { p: 2, l: 500 } } });
  if (!captured.ok) throw new Error("fixture");
  const result = proveOpportunityReview({ ...input, brief: captured.brief, briefHash: captured.hash, bindings: [{ ...input.bindings[0], section: "posicoes", itemId: held }] });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.ack.reviewed).toEqual(input.batch);
    expect(result.proof.modelCallObserved).toBe(false);
  }
});

test("snapshot and proof outputs cannot share mutable state across reviews", () => {
  const input = frame(), result = proveOpportunityReview(input);
  if (!result.ok) throw new Error("fixture");
  input.bindings[0]!.fields.price = "wrong";
  expect(result.proof.events[0]?.fields?.price).toBe("p");
  expect(Object.isFrozen(result.proof.events[0]?.fields)).toBe(true);
  expect(Object.isFrozen(result.ack.reviewed)).toBe(true);
  expect(Object.isFrozen(input.bindings[0]!.snapshot.facts)).toBe(true);
});

test("fifty synthetic instruments share one fake review and only represented events are consumed", async () => {
  const snapshots = Array.from({ length: 50 }, (_, i) => {
    const assetKey = `token:1:0x${(i + 1).toString(16).padStart(40, "0")}`;
    const captured = captureOpportunityFacts({ assetKey, source: "fixture_market", kind: "new_candidate", observedAtMs: 1_000, availableAtMs: 1_010, facts: { price: i + 1 } });
    if (!captured.ok) throw new Error("fixture");
    return captured.value;
  });
  let consulted = 0, includeAll = false, active = 0, maxActive = 0;
  const dispatcher = createOpportunityDispatcher({ now: () => 1_200, allowed: () => true, request: async batch => {
    active++; maxActive = Math.max(maxActive, active);
    try {
      const selected = batch.filter((_, i) => includeAll || i % 2 === 0);
      const compras = Object.fromEntries(selected.map(event => ["buy:" + event.assetKey, { p: snapshots.find(s => s.event.assetKey === event.assetKey)!.facts.price }]));
      const captured = captureEventReviewBrief({ compras, posicoes: {} });
      if (!captured.ok) throw new Error("fixture");
      // The fake model receives the same frozen object that the proof checks.
      await Promise.resolve(captured.brief);
      consulted++;
      const result = proveOpportunityReview({ cycleId: `cycle-fixture-${consulted}`, askedAtMs: 1_100, answeredAtMs: 1_200, maxAgeMs: 1_000, brief: captured.brief, briefHash: captured.hash, batch,
        bindings: selected.map(event => ({ snapshot: snapshots.find(s => s.event.assetKey === event.assetKey)!, section: "compras", itemId: "buy:" + event.assetKey, fields: { price: "p" } })) });
      if (!result.ok) throw new Error("fixture");
      return result.ack;
    } finally { active--; }
  } });
  for (const fact of snapshots) expect(dispatcher.notify(fact.event)).toBe("accepted");
  await dispatcher.idle();
  expect(consulted).toBe(1);
  expect(dispatcher.status()).toMatchObject({ queued: 25, awaitingWake: true });
  includeAll = true; dispatcher.wake(); await dispatcher.idle();
  expect(consulted).toBe(2);
  expect(dispatcher.status().queued).toBe(0);
  expect(maxActive).toBe(1);
});
