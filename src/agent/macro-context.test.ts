import { describe, expect, test } from "bun:test";
import { createContextOpportunityDispatcher, type ContextOpportunityEvent } from "../decision-review/context-events";
import { captureEventReviewBrief } from "../decision-review/event-evidence";
import { factOf, type PulseFact } from "../pulse/facts";
import type { PulseReading } from "../pulse/pulse";
import { MINUTE, type Regime } from "../pulse/regime";
import { DEFAULT_MACRO_REGISTRY, MACRO_LEGEND, createMacroContext, hasMacroKeys, materialContext } from "./macro-context";

// The host side of the macro context (ADENDO-E, E1 and E3) with a FAKE pulse, a FAKE clock and the Codex's real dispatcher and proofs: no network, no model, no money.
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % MINUTE);
const calm: Regime = { ret1m: 0.02, ret5m: 0.05, flow5m: 0.1, rv15m: 0.05 };
const jump: Regime = { ret1m: 1.1, ret5m: 4.95, flow5m: 0.5, rv15m: 0.499 };

function factAt(instrument: string, minute: number, regime: Regime, over: Partial<Parameters<typeof factOf>[0]> = {}): PulseFact {
  return factOf({ instrument, windowEndMs: T0 + minute * MINUTE, originAtMs: T0 + minute * MINUTE - 10_000, observedAtLocalMs: T0 + minute * MINUTE - 10_000 + 77, generation: 0, bars: 15, gaps: 0, regime, ...over })!;
}

function rig(facts: PulseFact[] = []) {
  const clock = { now: T0 + 20 * MINUTE };
  const state = { facts, notified: [] as ContextOpportunityEvent[] };
  const macro = createMacroContext({
    pulse: { read: (): PulseReading => ({ context: null, facts: state.facts }) },
    now: () => clock.now,
    notify: (event) => { state.notified.push(event as ContextOpportunityEvent); return "accepted"; },
  });
  return { macro, clock, state };
}

describe("the context keys", () => {
  test("hasMacroKeys recognises a context that carries a macro projection, and materialContext drops only the keys that change with the clock", () => {
    expect(hasMacroKeys(null)).toBe(false);
    expect(hasMacroKeys({ btc_1h: 0.4 })).toBe(false);
    expect(hasMacroKeys({ btc_fh: "a".repeat(64) })).toBe(true);
    const ctx = { btc_1h: 0.4, btc_1m: 0.1, btc_fh: "a".repeat(64), btc_age_ms: 900, btc_asof_ms: 12345, btc_bars: 15, sol_age_ms: 5, sol_asof_ms: 6 };
    expect(materialContext(ctx)).toEqual({ btc_1h: 0.4, btc_1m: 0.1, btc_fh: "a".repeat(64), btc_bars: 15 });
    expect(materialContext(null)).toBeNull();
    expect(Object.keys(materialContext({ x: 1, y: 2 })!)).toEqual(["x", "y"]);
  });

  test("the legend names every key of the ten", () => {
    for (const suffix of ["_1m", "_5m", "_fl", "_rv", "_fh", "_age_ms", "_asof_ms", "_bars", "_gaps", "_gen"]) expect(MACRO_LEGEND).toContain(`<p>${suffix}`);
    expect(DEFAULT_MACRO_REGISTRY).toEqual([{ contextKey: "okx:SPOT:BTC-USDT", prefix: "btc" }, { contextKey: "okx:SPOT:SOL-USDT", prefix: "sol" }]);
  });
});

describe("snapshots: the first capture of a fact is kept, and reading it again does not renew it", () => {
  test("a fact captured once keeps its first availability whatever the clock says later", () => {
    const btc = factAt("BTC-USDT", 19, calm);
    const { macro, clock } = rig([btc]);
    const first = macro.prepare(clock.now)!;
    const availableFirst = first.snapshots[0]!.availableAtMs;
    expect(availableFirst).toBe(T0 + 20 * MINUTE);
    clock.now += 30_000;
    const second = macro.prepare(clock.now)!;
    expect(second.snapshots[0]!.availableAtMs).toBe(availableFirst);
    expect(second.snapshots[0]!.snapshotHash).toBe(first.snapshots[0]!.snapshotHash);
  });

  test("a new fact (new hash) gets its own first capture", () => {
    const state = rig([factAt("BTC-USDT", 19, calm)]);
    state.macro.prepare(state.clock.now);
    state.clock.now += MINUTE;
    state.state.facts = [factAt("BTC-USDT", 20, { ...calm, ret1m: 0.03 })];
    const next = state.macro.prepare(state.clock.now)!;
    expect(next.snapshots).toHaveLength(1);
    expect(next.snapshots[0]!.availableAtMs).toBe(state.clock.now);
  });
});

describe("the projection: ten fields per market, explicit nulls when a market is missing or old", () => {
  test("BTC present and SOL absent: ten values for btc, ten nulls for sol, and a registry hash", () => {
    const { macro, clock } = rig([factAt("BTC-USDT", 19, calm)]);
    const prepared = macro.prepare(clock.now)!;
    const keys = Object.keys(prepared.context);
    expect(keys).toHaveLength(20);
    expect(prepared.context.btc_1m).toBe(0.02);
    expect(prepared.context.btc_fh).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.context.btc_asof_ms).toBe(clock.now);
    expect(prepared.context.btc_age_ms).toBe(clock.now - factAt("BTC-USDT", 19, calm).observedAtLocalMs);
    for (const suffix of ["1m", "5m", "fl", "rv", "fh", "age_ms", "asof_ms", "bars", "gaps", "gen"]) expect(prepared.context[`sol_${suffix}`]).toBeNull();
    expect(prepared.contextAtMs).toBe(clock.now);
  });

  test("a fact older than the allowed age is explicit nulls, not a calm", () => {
    const { macro, clock } = rig([factAt("BTC-USDT", 19, calm)]);
    macro.prepare(clock.now);
    clock.now += 10 * MINUTE;
    const old = macro.prepare(clock.now)!;
    expect(old.context.btc_1m).toBeNull();
    expect(old.context.btc_fh).toBeNull();
  });
});

describe("events: only a MATERIAL move tells the dispatcher", () => {
  test("a quiet fact is captured and projected but notifies nothing", () => {
    const { macro, clock, state } = rig([factAt("BTC-USDT", 19, calm)]);
    macro.prepare(clock.now);
    expect(state.notified).toEqual([]);
  });

  test("a move of several sigmas notifies once with the event of its snapshot, and reading the same fact again does not notify again", () => {
    const btc = factAt("BTC-USDT", 19, jump);
    const { macro, clock, state } = rig([btc]);
    macro.poll();
    macro.poll();
    expect(state.notified).toHaveLength(1);
    expect(state.notified[0]).toEqual({ contextKey: "okx:SPOT:BTC-USDT", source: "okx-public-trades", kind: "market_regime", observedAtMs: btc.observedAtLocalMs, factHash: btc.hash });
    macro.prepare(clock.now);
    expect(state.notified).toHaveLength(1);
  });
});

describe("the proof: only what the Brief really carried is acknowledged", () => {
  /** A Brief with the context the preparation produced, frozen the way the host sends it. */
  const sent = (context: Record<string, number | string | null>) => {
    const captured = captureEventReviewBrief({ v: 1, carteira: { caixa: 1, agente: 1, principal: 0, posicoes: 0 }, chaves: {}, posicoes: {}, compras: {}, contexto: context, historico: null, mandato: null });
    if (!captured.ok) throw new Error("brief");
    return captured;
  };

  test("BTC and SOL offered, only BTC in the first context: BTC is acknowledged, SOL is not", () => {
    const btc = factAt("BTC-USDT", 19, jump);
    const sol = factAt("SOL-USDT", 19, jump);
    const { macro, clock, state } = rig([btc]);
    macro.poll();
    const prepared = macro.prepare(clock.now)!;
    const batch = [state.notified[0]!, { contextKey: "okx:SPOT:SOL-USDT", source: "okx-public-trades", kind: "market_regime", observedAtMs: sol.observedAtLocalMs, factHash: sol.hash } as ContextOpportunityEvent];
    const brief = sent(prepared.context);
    const result = macro.review({ cycleId: "cy1", prepared, askedAtMs: clock.now + 5, answeredAtMs: clock.now + 400, brief: brief.brief, briefHash: brief.hash, batch })!;
    expect(result.ack.reviewed.map((e) => e.contextKey)).toEqual(["okx:SPOT:BTC-USDT"]);
    expect(result.proof.events.map((e) => [e.event.contextKey, e.status])).toEqual([["okx:SPOT:BTC-USDT", "reviewed"], ["okx:SPOT:SOL-USDT", "snapshot_missing"]]);
    expect(result.proof).toMatchObject({ sourceAuthenticated: false, modelCallObserved: false, executionProven: false, contextAtMs: clock.now, askedAtMs: clock.now + 5 });
  });

  test("four equal numbers without the hash of the fact are not consumption", () => {
    const btc = factAt("BTC-USDT", 19, jump);
    const { macro, clock, state } = rig([btc]);
    macro.poll();
    const prepared = macro.prepare(clock.now)!;
    const withoutHash = { ...prepared.context, btc_fh: null };
    const brief = sent(withoutHash);
    const result = macro.review({ cycleId: "cy1", prepared, askedAtMs: clock.now + 5, answeredAtMs: clock.now + 400, brief: brief.brief, briefHash: brief.hash, batch: [state.notified[0]!] })!;
    expect(result.ack.reviewed).toEqual([]);
    expect(result.proof.events[0]!.status).toBe("context_missing");
  });

  test("a wrong brief hash is refused, never acknowledged", () => {
    const { macro, clock, state } = rig([factAt("BTC-USDT", 19, jump)]);
    macro.poll();
    const prepared = macro.prepare(clock.now)!;
    const brief = sent(prepared.context);
    expect(macro.review({ cycleId: "cy1", prepared, askedAtMs: clock.now + 5, answeredAtMs: clock.now + 400, brief: brief.brief, briefHash: "0".repeat(64), batch: [state.notified[0]!] })).toBeNull();
  });
});

describe("the same queue and flight: the Codex's dispatcher with the host's request", () => {
  const frozen = (context: Record<string, number | string | null>) => {
    const captured = captureEventReviewBrief({ v: 1, carteira: { caixa: 1, agente: 1, principal: 0, posicoes: 0 }, chaves: {}, posicoes: {}, compras: {}, contexto: context, historico: null, mandato: null });
    if (!captured.ok) throw new Error("brief");
    return captured;
  };
  /** What the wire does, with a fake flight: request(batch) makes ONE look (prepare, send the frozen Brief, prove it against the batch) and returns the ack of the proof, or false when the flight is busy. */
  function system(options: { busy?: { on: boolean }; during?: () => void } = {}) {
    const clock = { now: T0 + 20 * MINUTE };
    const facts = { current: [factAt("BTC-USDT", 19, jump)] as PulseFact[] };
    const looks: { cycleId: string; reviewed: string[] }[] = [];
    let macro!: ReturnType<typeof createMacroContext>;
    const dispatcher = createContextOpportunityDispatcher({
      now: () => clock.now,
      // an observation is the local time of the print of the last closed minute: up to a minute and a half old when it is told, so the queue's age bound is the macro's (three minutes), not the default sixty seconds
      maxAgeMs: 180_000,
      allowed: () => true,
      request: async (batch) => {
        if (options.busy?.on === true) return false;
        const prepared = macro.prepare(clock.now)!;
        const brief = frozen(prepared.context);
        options.during?.();
        const result = macro.review({ cycleId: `cy${looks.length + 1}`, prepared, askedAtMs: clock.now + 5, answeredAtMs: clock.now + 400, brief: brief.brief, briefHash: brief.hash, batch });
        looks.push({ cycleId: `cy${looks.length + 1}`, reviewed: result === null ? [] : result.ack.reviewed.map((e) => e.factHash) });
        return result === null ? false : result.ack;
      },
    });
    macro = createMacroContext({ pulse: { read: () => ({ context: null, facts: facts.current }) }, now: () => clock.now, notify: (event) => dispatcher.notify(event) });
    return { macro, dispatcher, clock, facts, looks };
  }

  test("a material event reaches the dispatcher, one look is made, and the proof acknowledges exactly that fact", async () => {
    const sys = system();
    sys.macro.poll();
    await sys.dispatcher.idle();
    expect(sys.looks).toHaveLength(1);
    expect(sys.looks[0]!.reviewed).toEqual([sys.facts.current[0]!.hash]);
    expect(sys.dispatcher.status()).toMatchObject({ queued: 0, awaitingWake: false });
    sys.dispatcher.stop();
  });

  test("a busy flight is not a review: the event is kept, and a wake makes the look and clears it", async () => {
    const busy = { on: true };
    const sys = system({ busy });
    sys.macro.poll();
    await sys.dispatcher.idle();
    expect(sys.looks).toHaveLength(0);
    expect(sys.dispatcher.status()).toMatchObject({ queued: 1, awaitingWake: true });
    busy.on = false;
    sys.dispatcher.wake();
    await sys.dispatcher.idle();
    expect(sys.looks).toHaveLength(1);
    expect(sys.dispatcher.status()).toMatchObject({ queued: 0 });
    sys.dispatcher.stop();
  });

  test("a newer version of the fact that arrives during the look is not cleared by the older acknowledgement: it gets a look of its own", async () => {
    let sys!: ReturnType<typeof system>;
    // a reversal: the materiality tells a same-direction move only once per cooldown, so the newer version is the other way
    const second = factAt("BTC-USDT", 20, { ...jump, ret1m: -1.1, ret5m: -5.2 });
    sys = system({
      during: () => {
        // while the first look is in flight a NEW material fact for the same market is observed
        sys.clock.now += 1_000;
        sys.facts.current = [second];
        sys.macro.poll();
      },
    });
    const first = sys.facts.current[0]!;
    sys.macro.poll();
    await sys.dispatcher.idle();
    expect(sys.looks).toHaveLength(2);
    // the first look carried the first version, and only that one was acknowledged by it
    expect(sys.looks[0]!.reviewed).toEqual([first.hash]);
    // the second version was not swallowed by the older acknowledgement: it was asked for and acknowledged on its own look
    expect(sys.looks[1]!.reviewed).toEqual([second.hash]);
    expect(sys.dispatcher.status()).toMatchObject({ queued: 0 });
    sys.dispatcher.stop();
  });

  test("after stop nothing more is accepted", async () => {
    const sys = system();
    sys.dispatcher.stop();
    sys.macro.poll();
    await sys.dispatcher.idle();
    expect(sys.looks).toHaveLength(0);
    expect(sys.dispatcher.status().stopped).toBe(true);
  });
});

// The three vectors of the independent review of the host (sections 140 and 141): each was written to fail first.

describe("RED1 of the review: the context is made AFTER the pulse is read, so a fact captured now is not 'from the future'", () => {
  test("a clock that advances while the pulse is read does not cost the look the fact it just captured", () => {
    const clock = { now: T0 + 20 * MINUTE };
    const btc = factAt("BTC-USDT", 19, calm);
    const macro = createMacroContext({
      // reading the pulse takes time: the clock moves by a millisecond
      pulse: { read: (): PulseReading => { clock.now += 1; return { context: null, facts: [btc] }; } },
      now: () => clock.now,
      notify: () => "accepted",
    });
    const asOf = clock.now; // what the cycle sampled BEFORE asking for the context
    const prepared = macro.prepare(asOf)!;
    expect(prepared.context.btc_fh).toBe(btc.hash);
    expect(prepared.context.btc_1m).toBe(calm.ret1m);
    // the context never predates the capture it carries, and never predates the instant the cycle asked
    expect(prepared.contextAtMs).toBeGreaterThanOrEqual(prepared.snapshots[0]!.availableAtMs);
    expect(prepared.contextAtMs).toBeGreaterThanOrEqual(asOf);
    expect(prepared.context.btc_asof_ms).toBe(prepared.contextAtMs);
  });
});

describe("RED2 and RED3 of the review: the first capture of a fact is not renewed by a replay, and an older generation never replaces the current one", () => {
  const sameWindow = (generation: number) => factAt("BTC-USDT", 19, calm, { generation });

  test("A, then B (same print, newer generation), then A again: the replay is refused, A is not captured a second time", () => {
    const state = { facts: [sameWindow(0)] as PulseFact[] };
    const clock = { now: T0 + 20 * MINUTE };
    const notified: unknown[] = [];
    const macro = createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: state.facts }) }, now: () => clock.now, notify: (e) => notified.push(e) });
    const first = macro.prepare(clock.now)!;
    const availableA = first.snapshots[0]!.availableAtMs;
    clock.now += 1;
    state.facts = [sameWindow(1)];
    const second = macro.prepare(clock.now)!;
    expect(second.snapshots[0]!.fact.generation).toBe(1);
    clock.now += 1;
    state.facts = [sameWindow(0)]; // the replay of A
    const third = macro.prepare(clock.now)!;
    expect(third.snapshots[0]!.fact.generation).toBe(1);
    expect(third.snapshots[0]!.snapshotHash).toBe(second.snapshots[0]!.snapshotHash);
    expect(third.snapshots[0]!.availableAtMs).toBe(second.snapshots[0]!.availableAtMs);
    expect(third.snapshots[0]!.availableAtMs).toBeGreaterThan(availableA);
  });

  test("the same holds beyond the size of any cache: many generations later, the replay of the first is still refused", () => {
    const state = { facts: [sameWindow(0)] as PulseFact[] };
    const clock = { now: T0 + 20 * MINUTE };
    const macro = createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: state.facts }) }, now: () => clock.now, notify: () => "accepted" });
    macro.prepare(clock.now);
    for (let g = 1; g <= 66; g++) {
      clock.now += 1;
      state.facts = [sameWindow(g)];
      macro.prepare(clock.now);
    }
    const latest = macro.prepare(clock.now)!.snapshots[0]!;
    clock.now += 1;
    state.facts = [sameWindow(0)];
    const after = macro.prepare(clock.now)!.snapshots[0]!;
    expect(after.snapshotHash).toBe(latest.snapshotHash);
    expect(after.fact.generation).toBe(66);
    expect(after.availableAtMs).toBe(latest.availableAtMs);
  });

  test("a fact of the same print with generation 2 followed by generation 1 leaves generation 2 as the current one", () => {
    const state = { facts: [sameWindow(2)] as PulseFact[] };
    const clock = { now: T0 + 20 * MINUTE };
    const macro = createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: state.facts }) }, now: () => clock.now, notify: () => "accepted" });
    macro.prepare(clock.now);
    clock.now += 1;
    state.facts = [sameWindow(1)];
    expect(macro.prepare(clock.now)!.snapshots[0]!.fact.generation).toBe(2);
  });

  test("an older window is a replay too, and a newer window is accepted", () => {
    const state = { facts: [factAt("BTC-USDT", 19, calm)] as PulseFact[] };
    const clock = { now: T0 + 20 * MINUTE };
    const macro = createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: state.facts }) }, now: () => clock.now, notify: () => "accepted" });
    macro.prepare(clock.now);
    clock.now += 1;
    state.facts = [factAt("BTC-USDT", 18, { ...calm, ret1m: 0.5 })];
    expect(macro.prepare(clock.now)!.snapshots[0]!.fact.windowEndMs).toBe(T0 + 19 * MINUTE);
    clock.now += 1;
    state.facts = [factAt("BTC-USDT", 20, { ...calm, ret1m: 0.7 })];
    const newer = macro.prepare(clock.now)!.snapshots[0]!;
    expect(newer.fact.windowEndMs).toBe(T0 + 20 * MINUTE);
    expect(newer.fact.values.ret1m).toBe(0.7);
  });

  test("a fact that cannot be ordered against the current one (same window, origin and generation, other content) is refused, not guessed", () => {
    const state = { facts: [factAt("BTC-USDT", 19, calm)] as PulseFact[] };
    const clock = { now: T0 + 20 * MINUTE };
    const macro = createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: state.facts }) }, now: () => clock.now, notify: () => "accepted" });
    const first = macro.prepare(clock.now)!.snapshots[0]!;
    clock.now += 1;
    state.facts = [factAt("BTC-USDT", 19, { ...calm, ret1m: 0.09 })];
    expect(macro.prepare(clock.now)!.snapshots[0]!.snapshotHash).toBe(first.snapshotHash);
  });
});

describe("residual RED of the review (143): a clock that goes back a millisecond after the capture", () => {
  test("the context never predates the availability of a snapshot it carries, so the fact is not lost; the real askedAt earlier than the context is refused", () => {
    const clock = { now: T0 + 20 * MINUTE };
    const btc = factAt("BTC-USDT", 19, calm);
    let reads = 0;
    const macro = createMacroContext({
      // the first reading takes a millisecond; the second finds the clock a millisecond BEHIND where the capture left it
      pulse: { read: (): PulseReading => { reads += 1; if (reads === 1) clock.now += 1; return { context: null, facts: [btc] }; } },
      now: () => clock.now,
      notify: () => "accepted",
    });
    const first = macro.prepare(clock.now)!;
    const availableAt = first.snapshots[0]!.availableAtMs;
    expect(availableAt).toBe(T0 + 20 * MINUTE + 1);
    clock.now = T0 + 20 * MINUTE; // back by a millisecond
    const second = macro.prepare(clock.now)!;
    expect(second.context.btc_fh).toBe(btc.hash);
    expect(second.contextAtMs).toBeGreaterThanOrEqual(availableAt);
    // nothing was backdated: the availability is the one of the first capture
    expect(second.snapshots[0]!.availableAtMs).toBe(availableAt);
    // and a real question asked BEFORE the context was made is not acknowledged
    const captured = captureEventReviewBrief({ v: 1, carteira: { caixa: 1, agente: 1, principal: 0, posicoes: 0 }, chaves: {}, posicoes: {}, compras: {}, contexto: second.context, historico: null, mandato: null });
    if (!captured.ok) throw new Error("brief");
    const refused = macro.review({ cycleId: "cy1", prepared: second, askedAtMs: second.contextAtMs - 1, answeredAtMs: second.contextAtMs + 100, brief: captured.brief, briefHash: captured.hash, batch: [] });
    expect(refused).toBeNull();
    const accepted = macro.review({ cycleId: "cy1", prepared: second, askedAtMs: second.contextAtMs + 1, answeredAtMs: second.contextAtMs + 100, brief: captured.brief, briefHash: captured.hash, batch: [] });
    expect(accepted).not.toBeNull();
  });
});

describe("scope of 'first capture' (144): per instance of the host, and the epoch says which", () => {
  test("every preparation names the host instance that captured the snapshots; a new instance has another epoch and recaptures the same hash", () => {
    const btc = factAt("BTC-USDT", 19, calm);
    const make = (now: number) => {
      const clock = { now };
      return { clock, macro: createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: [btc] }) }, now: () => clock.now, notify: () => "accepted" }) };
    };
    const a = make(T0 + 20 * MINUTE);
    const first = a.macro.prepare(a.clock.now)!;
    a.clock.now += 5_000;
    const again = a.macro.prepare(a.clock.now)!;
    expect(first.hostEpoch).toMatch(/^epoch-[0-9]+-[a-f0-9]{8}$/);
    expect(again.hostEpoch).toBe(first.hostEpoch);
    // a restart: another instance sees the same observation, captures it again (another snapshot) and says so with another epoch
    const b = make(T0 + 21 * MINUTE);
    const restarted = b.macro.prepare(b.clock.now)!;
    expect(restarted.hostEpoch).not.toBe(first.hostEpoch);
    expect(restarted.snapshots[0]!.fact.hash).toBe(first.snapshots[0]!.fact.hash);
    expect(restarted.snapshots[0]!.availableAtMs).toBeGreaterThan(first.snapshots[0]!.availableAtMs);
    // the epoch can also be given by the host (a stable name for the process)
    const named = createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: [btc] }) }, now: () => T0 + 20 * MINUTE, notify: () => "accepted", epoch: "core-25532" });
    expect(named.prepare(T0 + 20 * MINUTE)!.hostEpoch).toBe("core-25532");
  });
});
