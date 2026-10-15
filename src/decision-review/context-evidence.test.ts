import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { captureEventReviewBrief } from "./event-evidence";
import { captureContextFacts, projectContextFacts, proveContextReview } from "./context-evidence";
import { createContextOpportunityDispatcher } from "./context-events";

const canonical = (v: unknown): string => JSON.stringify(v, (_key, value) => value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
function fact(instrument = "BTC-USDT") {
  const body = { kind: "market_regime", venue: "okx", marketType: "SPOT", instrument, source: "okx-public-trades", units: { returns: "percent", flow: "ratio_minus1_to_1", volatility: "percent_per_minute" },
    originAtMs: 9_000_000, observedAtLocalMs: 1_000, generation: 1, quality: { bars: 16, gaps: 0 }, values: { ret1m: 1, ret5m: 4, flow5m: 0.5, rv15m: 0.3 } };
  return { ...body, hash: createHash("sha256").update(canonical(body)).digest("hex") };
}
function rehash(raw: ReturnType<typeof fact>) {
  const { hash: _old, ...body } = raw;
  return { ...body, hash: createHash("sha256").update(canonical(body)).digest("hex") };
}
function windowFact(windowEndMs = 9_060_000, originAtMs = 9_000_000) {
  const { hash: _old, ...base } = fact();
  const body = { ...base, originAtMs, windowEndMs };
  return { ...body, hash: createHash("sha256").update(canonical(body)).digest("hex") };
}
function frame() {
  const captured = captureContextFacts({ fact: fact(), availableAtMs: 1_020 });
  if (!captured.ok) throw new Error("fixture_snapshot");
  const registry = [{ contextKey: "okx:SPOT:BTC-USDT", prefix: "btc" }], snapshots = [captured.value];
  const projection = projectContextFacts({ registry, snapshots, asOfMs: 1_100, maxAgeMs: 500 });
  if (!projection.ok) throw new Error("fixture_projection");
  const brief = captureEventReviewBrief({ contexto: projection.context, compras: {}, posicoes: {} });
  if (!brief.ok) throw new Error("fixture_brief");
  return { cycleId: "cycle-macro-1", contextAtMs: projection.contextAtMs, askedAtMs: 1_100, answeredAtMs: 1_200, maxAgeMs: 500, brief: brief.brief, briefHash: brief.hash, batch: [captured.value.event], registry, snapshots };
}

test("macro facts retain CEX identity and two distinct clocks without a token mint", () => {
  const input = frame(), snapshot = input.snapshots[0]!;
  expect(snapshot.event.contextKey).toBe("okx:SPOT:BTC-USDT");
  expect(snapshot.event.observedAtMs).toBe(1_000);
  expect(snapshot.event.factHash).toBe(fact().hash);
  expect(snapshot.event).not.toHaveProperty("assetKey");
  const result = proveContextReview(input);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.ack.reviewed).toEqual(input.batch);
});

test("projection supplies values, exact hash, age and quality to the Brief", () => {
  const input = frame();
  expect(input.brief.contexto).toEqual({ btc_1m: 1, btc_5m: 4, btc_fl: 0.5, btc_rv: 0.3, btc_fh: fact().hash, btc_age_ms: 100, btc_asof_ms: 1_100, btc_bars: 16, btc_gaps: 0, btc_gen: 1 });
});

test("four equal numbers alone cannot acknowledge a new fact version", () => {
  const input = frame();
  const brief = captureEventReviewBrief({ contexto: { btc_1m: 1, btc_5m: 4, btc_fl: 0.5, btc_rv: 0.3 }, compras: {}, posicoes: {} });
  if (!brief.ok) throw new Error("fixture");
  const result = proveContextReview({ ...input, brief: brief.brief, briefHash: brief.hash });
  expect(result.ok).toBe(true);
  if (result.ok) { expect(result.ack.reviewed).toEqual([]); expect(result.proof.events[0]?.status).toBe("context_missing"); }
});

test("old, future and missing context become explicit nulls without refreshing the observation", () => {
  const input = frame();
  for (const [asOfMs, status] of [[1_010, "not_available"], [1_501, "stale"]] as const) {
    const projection = projectContextFacts({ registry: input.registry, snapshots: input.snapshots, asOfMs, maxAgeMs: 500 });
    expect(projection.ok).toBe(true);
    if (projection.ok) { expect(Object.values(projection.context).every(v => v === null)).toBe(true); expect(projection.states[0]?.status).toBe(status); }
  }
  const missing = projectContextFacts({ registry: input.registry, snapshots: [], asOfMs: 1_100, maxAgeMs: 500 });
  expect(missing.ok).toBe(true);
  if (missing.ok) expect(missing.states[0]?.status).toBe("missing");
});

test("invalid numbers or changed material values cannot survive the producer hash", () => {
  for (const bad of [NaN, Infinity, -Infinity]) expect(captureContextFacts({ fact: { ...fact(), values: { ...fact().values, ret1m: bad } }, availableAtMs: 1_020 }).ok).toBe(false);
  expect(captureContextFacts({ fact: { ...fact(), values: { ...fact().values, ret1m: 2 } }, availableAtMs: 1_020 }).ok).toBe(false);
});

test("registry collisions and metadata from another instrument are not silently merged", () => {
  const input = frame();
  const registry = [...input.registry, { contextKey: "okx:SPOT:SOL-USDT", prefix: "btc" }];
  expect(projectContextFacts({ registry, snapshots: input.snapshots, asOfMs: 1_100, maxAgeMs: 500 }).ok).toBe(false);
  const wrong = captureContextFacts({ fact: fact("SOL-USDT"), availableAtMs: 1_020 });
  if (!wrong.ok) throw new Error("fixture");
  expect(proveContextReview({ ...input, snapshots: [wrong.value] }).ok).toBe(false);
});

test("preparation and actual request clocks stay distinct without backdating a model call", () => {
  const input = frame();
  const result = proveContextReview({ ...input, askedAtMs: 1_105 });
  expect(result.ok).toBe(true);
  if (result.ok) { expect(result.ack.reviewed).toEqual(input.batch); expect(result.proof.contextAtMs).toBe(1_100); expect(result.proof.askedAtMs).toBe(1_105); }
  const expired = proveContextReview({ ...input, askedAtMs: 1_501, answeredAtMs: 1_550 });
  expect(expired.ok).toBe(true);
  if (expired.ok) { expect(expired.ack.reviewed).toEqual([]); expect(expired.proof.events[0]?.status).toBe("stale"); }
  expect(proveContextReview({ ...input, contextAtMs: 1_101 }).ok).toBe(false);
});

test("a reconnect hash with equal values cannot use the previous fact reference", () => {
  const input = frame(), changed = rehash({ ...fact(), generation: 2 });
  const next = captureContextFacts({ fact: changed, availableAtMs: 1_030 });
  if (!next.ok) throw new Error("fixture");
  const result = proveContextReview({ ...input, batch: [next.value.event], snapshots: [next.value] });
  expect(result.ok).toBe(true);
  if (result.ok) { expect(result.ack.reviewed).toEqual([]); expect(result.proof.events[0]?.status).toBe("context_missing"); }
  const oldEvent = proveContextReview({ ...input, snapshots: [next.value] });
  expect(oldEvent.ok).toBe(true);
  if (oldEvent.ok) { expect(oldEvent.ack.reviewed).toEqual([]); expect(oldEvent.proof.events[0]?.snapshotHash).toBeNull(); }
});

test("capture availability cannot be backdated to the print or after context preparation", () => {
  const input = frame();
  expect(captureContextFacts({ fact: fact(), availableAtMs: 999 }).ok).toBe(false);
  const late = captureContextFacts({ fact: fact(), availableAtMs: 1_101 });
  if (!late.ok) throw new Error("fixture");
  const result = proveContextReview({ ...input, askedAtMs: 1_150, snapshots: [late.value] });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.proof.events[0]?.status).toBe("not_available");
  expect(late.value.availabilityBasis).toBe("first_host_capture");
});

test("maximum age boundary uses the actual ask, not the completion or cached age field", () => {
  const input = frame();
  const valid = proveContextReview({ ...input, askedAtMs: 1_500, answeredAtMs: 8_000 });
  expect(valid.ok).toBe(true);
  if (valid.ok) expect(valid.ack.reviewed).toEqual(input.batch);
  const invalid = proveContextReview({ ...input, askedAtMs: 1_501, answeredAtMs: 8_000 });
  expect(invalid.ok).toBe(true);
  if (invalid.ok) expect(invalid.ack.reviewed).toEqual([]);
});

test("a forged hash, swapped identity, wrong quality and deep getters never yield a fact", () => {
  for (const bad of [rehash({ ...fact(), values: { ...fact().values, flow5m: 2 } }), rehash({ ...fact(), quality: { bars: 16, gaps: 16 } }), { ...fact(), hash: "f".repeat(64) }, rehash({ ...fact(), marketType: "SWAP" })]) {
    expect(captureContextFacts({ fact: bad, availableAtMs: 1_020 }).ok).toBe(false);
  }
  let calls = 0;
  const getter = Object.defineProperty({ ...fact() }, "values", { enumerable: true, get() { calls++; throw new Error("synthetic_getter"); } });
  expect(captureContextFacts({ fact: getter, availableAtMs: 1_020 }).ok).toBe(false);
  expect(calls).toBe(0);
});

test("model context and returned witnesses are detached and frozen", () => {
  const input = frame(), result = proveContextReview(input);
  expect(result.ok).toBe(true);
  input.registry[0]!.prefix = "changed";
  if (result.ok) {
    expect(result.proof.registry[0]?.prefix).toBe("btc");
    expect(Object.isFrozen(result.proof.registry)).toBe(true);
    expect(Object.isFrozen(result.proof.registry[0])).toBe(true);
    expect(result.proof.seriesFreshness).toBe("reported_by_producer");
    expect(result.proof.sourceAuthenticated).toBe(false);
  }
});

test("BTC and SOL share a fake consultation and unrepresented macro events stay queued", async () => {
  const snapshots = ["BTC-USDT", "SOL-USDT"].map(instrument => {
    const result = captureContextFacts({ fact: fact(instrument), availableAtMs: 1_020 });
    if (!result.ok) throw new Error("fixture");
    return result.value;
  });
  const registry = [{ contextKey: "okx:SPOT:BTC-USDT", prefix: "btc" }, { contextKey: "okx:SPOT:SOL-USDT", prefix: "sol" }];
  let all = false, calls = 0;
  const queue = createContextOpportunityDispatcher({ now: () => 1_200, allowed: () => true, request: async batch => {
    calls++;
    const selected = snapshots.filter(s => batch.some(e => e.factHash === s.fact.hash) && (all || s.fact.instrument === "BTC-USDT"));
    const projected = projectContextFacts({ registry, snapshots: selected, asOfMs: 1_100, maxAgeMs: 500 });
    if (!projected.ok) throw new Error("fixture");
    const frozen = captureEventReviewBrief({ contexto: projected.context });
    if (!frozen.ok) throw new Error("fixture");
    await Promise.resolve(frozen.brief); // fake model consumes this exact object
    const result = proveContextReview({ cycleId: `cycle-macro-${calls}`, contextAtMs: 1_100, askedAtMs: 1_105, answeredAtMs: 1_200, maxAgeMs: 500, brief: frozen.brief, briefHash: frozen.hash, batch, registry, snapshots: selected });
    if (!result.ok) throw new Error("fixture");
    return result.ack;
  } });
  for (const snapshot of snapshots) expect(queue.notify(snapshot.event)).toBe("accepted");
  await queue.idle();
  expect(calls).toBe(1); expect(queue.status()).toMatchObject({ queued: 1, awaitingWake: true });
  all = true; queue.wake(); await queue.idle();
  expect(calls).toBe(2); expect(queue.status().queued).toBe(0);
});

test("a closed-window fact keeps its thirteenth hashed field in snapshot schema two", () => {
  const result = captureContextFacts({ fact: windowFact(), availableAtMs: 1_020 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.schemaVersion).toBe(2);
  expect(result.value.fact).toHaveProperty("windowEndMs", 9_060_000);
  expect(result.value.fact.hash).toBe(windowFact().hash);
  expect(result.value.event.factHash).toBe(windowFact().hash);
  const legacy = captureContextFacts({ fact: fact(), availableAtMs: 1_020 });
  expect(legacy.ok).toBe(true);
  if (legacy.ok) { expect(legacy.value.schemaVersion).toBe(1); expect(legacy.value.fact).not.toHaveProperty("windowEndMs"); }
});

test("window grid, contributing minute and the complete canonical hash are validated", () => {
  for (const raw of [windowFact(9_060_001), windowFact(9_060_000, 9_060_000), windowFact(9_060_000, 8_999_999), windowFact(-60_000)]) {
    expect(captureContextFacts({ fact: raw, availableAtMs: 1_020 }).ok).toBe(false);
  }
  const raw = windowFact(), { windowEndMs: _removed, ...dropped } = raw;
  expect(captureContextFacts({ fact: dropped, availableAtMs: 1_020 }).ok).toBe(false);
  expect(captureContextFacts({ fact: { ...raw, windowEndMs: 9_120_000 }, availableAtMs: 1_020 }).ok).toBe(false);
});

test("the v2 window survives projection and exact-Brief consumption without cross-clock comparison", () => {
  const input = frame(), captured = captureContextFacts({ fact: windowFact(), availableAtMs: 1_020 });
  expect(captured.ok).toBe(true);
  if (!captured.ok) return;
  const snapshots = [captured.value];
  const projection = projectContextFacts({ registry: input.registry, snapshots, asOfMs: 1_100, maxAgeMs: 500 });
  expect(projection.ok).toBe(true);
  if (!projection.ok) return;
  const brief = captureEventReviewBrief({ contexto: projection.context });
  if (!brief.ok) throw new Error("fixture");
  const result = proveContextReview({ ...input, snapshots, brief: brief.brief, briefHash: brief.hash, batch: [captured.value.event] });
  expect(result.ok).toBe(true);
  if (result.ok) { expect(result.ack.reviewed).toEqual([captured.value.event]); expect(result.proof.seriesFreshness).toBe("reported_by_producer"); }
  expect(projectContextFacts({ registry: input.registry, snapshots: [{ ...captured.value, schemaVersion: 1 }], asOfMs: 1_100, maxAgeMs: 500 }).ok).toBe(false);
});
