import { expect, test } from "bun:test";
import { captureContextFacts } from "../decision-review/context-evidence";
import { createMateriality, factOf, gapsInLast, type PulseFact } from "./facts";
import { MINUTE, type MinuteBar, type Regime } from "./regime";

// Facts with identity and events from them (ADENDO-E, E1 and E3, producer side). Pure: no clock, no network.
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % MINUTE);
const regime: Regime = { ret1m: 0.95, ret5m: 4.95, flow5m: 0.5, rv15m: 0.499 };
const make = (over: Partial<Parameters<typeof factOf>[0]> = {}): PulseFact =>
  factOf({ instrument: "BTC-USDT", windowEndMs: T0 + 15 * MINUTE, originAtMs: T0 + 14 * MINUTE + 20_000, observedAtLocalMs: T0 + 77_000, generation: 0, bars: 15, gaps: 0, regime, ...over })!;

test("a fact names what it is: venue, instrument, market type, source, units, origin time, local receipt, connection generation, quality", () => {
  const fact = make();
  expect(fact).toMatchObject({
    kind: "market_regime",
    venue: "okx",
    marketType: "SPOT",
    instrument: "BTC-USDT",
    source: "okx-public-trades",
    originAtMs: T0 + 14 * MINUTE + 20_000,
    observedAtLocalMs: T0 + 77_000,
    generation: 0,
    quality: { bars: 15, gaps: 0 },
    values: regime,
  });
  expect(fact.units).toEqual({ returns: "percent", flow: "ratio_minus1_to_1", volatility: "percent_per_minute" });
  expect(fact.hash).toMatch(/^[a-f0-9]{64}$/);
});

test("the hash is stable for the same content and changes with any part of it", () => {
  expect(make().hash).toBe(make().hash);
  expect(make({ regime: { ...regime, ret1m: 0.96 } }).hash).not.toBe(make().hash);
  expect(make({ originAtMs: T0 + 14 * MINUTE + 30_000 }).hash).not.toBe(make().hash);
  expect(make({ generation: 1 }).hash).not.toBe(make().hash);
  expect(make({ gaps: 1 }).hash).not.toBe(make().hash);
  expect(make({ observedAtLocalMs: T0 + 78_000 }).hash).not.toBe(make().hash);
  // an instrument is not a token: BTC-USDT carries no chain or mint, and one that is not an instrument id is refused
  expect(make()).not.toHaveProperty("chainIndex");
  expect(make()).not.toHaveProperty("address");
  expect(factOf({ instrument: "not an instrument", windowEndMs: MINUTE, originAtMs: 1, observedAtLocalMs: 1, generation: 0, bars: 1, gaps: 0, regime })).toBeNull();
});

test("a fact with nothing measured is not a fact", () => {
  expect(factOf({ instrument: "BTC-USDT", windowEndMs: MINUTE, originAtMs: 1, observedAtLocalMs: 1, generation: 0, bars: 1, gaps: 0, regime: { ret1m: null, ret5m: null, flow5m: null, rv15m: null } })).toBeNull();
  expect(factOf({ instrument: "BTC-USDT", windowEndMs: MINUTE, originAtMs: -1, observedAtLocalMs: 1, generation: 0, bars: 1, gaps: 0, regime })).toBeNull();
  expect(factOf({ instrument: "BTC-USDT", windowEndMs: MINUTE, originAtMs: 1, observedAtLocalMs: 1, generation: -1, bars: 1, gaps: 0, regime })).toBeNull();
});

test("gaps are the minutes missing from the last fifteen before the last bar", () => {
  const bar = (i: number): MinuteBar => ({ start: T0 + i * MINUTE, close: 100, buyVolume: 1, sellVolume: 1 });
  const all = Array.from({ length: 16 }, (_, i) => bar(i));
  expect(gapsInLast(all, 15)).toBe(0);
  expect(gapsInLast(all.filter((b) => b.start !== T0 + 10 * MINUTE && b.start !== T0 + 12 * MINUTE), 15)).toBe(2);
  expect(gapsInLast([bar(15)], 15)).toBe(14);
  expect(gapsInLast([], 15)).toBe(0);
});

test("a move of three sigmas or more over five minutes is a material event, with the fact it came from", () => {
  const m = createMateriality();
  // 5-minute move of 4.95 percent against a one-minute volatility of 0.499: 4.95 / (0.499 * sqrt(5)) = 4.4 sigmas
  const events = m.observe([make()]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ kind: "move", instrument: "BTC-USDT", direction: "up", factHash: make().hash, originAtMs: make().originAtMs });
  expect(events[0]!.sigmas).toBeCloseTo(4.44, 1);
});

test("a quiet fact is no event, and neither is one whose volatility is unknown or zero", () => {
  const m = createMateriality();
  expect(m.observe([make({ regime: { ...regime, ret5m: 0.5 } })])).toEqual([]);
  expect(m.observe([make({ regime: { ...regime, rv15m: null } })])).toEqual([]);
  expect(m.observe([make({ regime: { ...regime, rv15m: 0 } })])).toEqual([]);
  expect(m.observe([make({ regime: { ...regime, ret5m: null } })])).toEqual([]);
});

test("the same move is told once: no new event for the same direction inside the cooldown, a new one when the direction flips or the cooldown is over", () => {
  const m = createMateriality({ cooldownMs: 5 * MINUTE });
  expect(m.observe([make()])).toHaveLength(1);
  expect(m.observe([make({ windowEndMs: T0 + 16 * MINUTE, originAtMs: T0 + 16 * MINUTE - 10_000 })])).toEqual([]);
  expect(m.observe([make({ windowEndMs: T0 + 17 * MINUTE, originAtMs: T0 + 17 * MINUTE - 10_000, regime: { ...regime, ret5m: -4.95 } })])).toHaveLength(1);
  expect(m.observe([make({ windowEndMs: T0 + 23 * MINUTE, originAtMs: T0 + 23 * MINUTE - 10_000, regime: { ...regime, ret5m: -4.95 } })])).toHaveLength(1);
  // another instrument has its own memory
  expect(m.observe([make({ instrument: "SOL-USDT", windowEndMs: T0 + 17 * MINUTE, originAtMs: T0 + 17 * MINUTE - 10_000 })])).toHaveLength(1);
});

test("the sigma multiple is a parameter of the evaluation, not a constant of the market", () => {
  const strict = createMateriality({ sigmas: 6 });
  expect(strict.observe([make()])).toEqual([]);
  const loose = createMateriality({ sigmas: 2 });
  expect(loose.observe([make({ regime: { ...regime, ret5m: 2.5 } })])).toHaveLength(1);
});

// The three vectors of the independent review of the pulse producer (section 134): each was written to fail first.

test("RED1 of the review: a value that is not a finite number is refused, never hashed as if it were unknown", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(make({ regime: { ...regime, ret1m: bad } })).toBeNull();
    expect(make({ regime: { ...regime, ret5m: bad } })).toBeNull();
    expect(make({ regime: { ...regime, flow5m: bad } })).toBeNull();
    expect(make({ regime: { ...regime, rv15m: bad } })).toBeNull();
  }
  // units: a flow is a ratio from -1 to 1 and a volatility cannot be negative
  expect(make({ regime: { ...regime, flow5m: 1.01 } })).toBeNull();
  expect(make({ regime: { ...regime, flow5m: -1.01 } })).toBeNull();
  expect(make({ regime: { ...regime, rv15m: -0.001 } })).toBeNull();
  expect(make({ regime: { ...regime, flow5m: 1 } })).not.toBeNull();
  // unknown stays unknown: null is a legitimate value and has a hash of its own
  expect(make({ regime: { ...regime, ret1m: null } })!.hash).not.toBe(make()!.hash);
});

test("the end of the window is part of the fact and of its hash, on the minute grid, with the origin print inside the minute that ends there", () => {
  expect(make().windowEndMs).toBe(T0 + 15 * MINUTE);
  // another valid window gives another fact
  expect(make({ windowEndMs: T0 + 16 * MINUTE, originAtMs: T0 + 15 * MINUTE + 20_000 }).hash).not.toBe(make().hash);
  // off the grid, or negative, is refused
  expect(make({ windowEndMs: T0 + 15 * MINUTE + 1 })).toBeNull();
  expect(make({ windowEndMs: -MINUTE })).toBeNull();
  // the origin lies in [end - one minute, end): the first instant of the minute is in, the end is out, and before it is out
  expect(make({ originAtMs: T0 + 14 * MINUTE })).not.toBeNull();
  expect(make({ originAtMs: T0 + 15 * MINUTE - 1 })).not.toBeNull();
  expect(make({ originAtMs: T0 + 15 * MINUTE })).toBeNull();
  expect(make({ originAtMs: T0 + 14 * MINUTE - 1 })).toBeNull();
});

// The contract with the consumer (decision-review/context-evidence.ts, sections 135 and 136): a fact of the producer must be accepted by its capture, hash included.
test("a fact of the producer is accepted by the consumer's capture, and any change of its content is refused", () => {
  const fact = make();
  const captured = captureContextFacts({ fact, availableAtMs: fact.observedAtLocalMs + 1 });
  expect(captured.ok).toBe(true);
  if (!captured.ok) throw new Error(captured.code);
  expect(captured.value.event).toEqual({ contextKey: "okx:SPOT:BTC-USDT", source: "okx-public-trades", kind: "market_regime", observedAtMs: fact.observedAtLocalMs, factHash: fact.hash });
  expect(captured.value.availableAtMs).toBe(fact.observedAtLocalMs + 1);
  // the thirteen-field fact is a schema 2 snapshot of the consumer, with the window it was computed over
  expect(captured.value.schemaVersion).toBe(2);
  expect(captured.value.fact).toMatchObject({ windowEndMs: fact.windowEndMs });
  // the same fact altered after hashing no longer matches its own hash
  expect(captureContextFacts({ fact: { ...fact, values: { ...fact.values, ret1m: 9 } }, availableAtMs: fact.observedAtLocalMs + 1 }).ok).toBe(false);
  // a window changed after hashing, or taken out of the fact, is refused: the hash covers it
  expect(captureContextFacts({ fact: { ...fact, windowEndMs: fact.windowEndMs + 60_000 }, availableAtMs: fact.observedAtLocalMs + 1 }).ok).toBe(false);
  const { windowEndMs: _window, ...withoutWindow } = fact;
  expect(captureContextFacts({ fact: withoutWindow, availableAtMs: fact.observedAtLocalMs + 1 }).ok).toBe(false);
  // and it cannot be "available" before it was observed
  expect(captureContextFacts({ fact, availableAtMs: fact.observedAtLocalMs - 1 }).ok).toBe(false);
});
