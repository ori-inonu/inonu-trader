/**
 * The host side of the macro market context (ADENDO-E, E1 and E3; sections 135 and 136 of the shared coordination file). The pulse (`src/pulse`) produces facts with identity; the Codex's `decision-review` modules capture them,
 * project them into the context of the Brief and prove which events a Brief really carried. THIS module is the host between them, with nothing of its own to decide:
 *
 * - `poll()` reads the pulse ONCE and captures an observation into an immutable snapshot only if it is STRICTLY NEWER than the current one of its market (by window, print, generation): reading the same one again, replaying
 *   an older one at any distance, or offering one that cannot be ordered renews nothing, so the first availability of an observation is never rejuvenated; only the MATERIAL ones are told to the dispatcher;
 * - `prepare(asOfMs)` reads first and only then fixes the instant of the context (never earlier than `asOfMs`, than now, or than the availability of any snapshot it carries), and projects the latest snapshots into the ten fields per market the Brief carries (explicit nulls for a market that is missing or too old, never a calm);
 * - `review(...)` is called AFTER the real model call with the exact frozen Brief that was sent, and returns the acknowledgement of the events that Brief really carried (never `true` for a timer or for `consulted`).
 *
 * It opens no connection, calls no model and knows no executor: the pulse, the clock and the dispatcher's `notify` are injected. OFF unless the host builds it.
 */
import { randomUUID } from "node:crypto";
import { captureContextFacts, projectContextFacts, proveContextReview, type ContextFactSnapshot, type ContextRegistryEntry, type ContextReviewProof } from "../decision-review/context-evidence";
import type { ContextOpportunityEvent, ContextReviewAck } from "../decision-review/context-events";
import { createMateriality, type Materiality } from "../pulse/facts";
import type { PulseReading } from "../pulse/pulse";

/** The markets the context carries and the prefix of their keys. The key of a market is fixed per round and has no collisions. */
export const DEFAULT_MACRO_REGISTRY: readonly ContextRegistryEntry[] = Object.freeze([
  Object.freeze({ contextKey: "okx:SPOT:BTC-USDT", prefix: "btc" }),
  Object.freeze({ contextKey: "okx:SPOT:SOL-USDT", prefix: "sol" }),
]);

export { MACRO_LEGEND, hasMacroKeys, materialContext } from "./macro-keys";

export interface MacroPrepared {
  /** Which instance of the host captured the snapshots. "First capture" is the first capture BY THIS INSTANCE: a restart makes another instance, with another epoch, that captures the same hash again (another snapshot); the journal of the earlier looks is never rewritten. */
  readonly hostEpoch: string;
  readonly context: Readonly<Record<string, number | string | null>>;
  /** The time the context was made: distinct from the time the model is really asked. */
  readonly contextAtMs: number;
  readonly registry: readonly ContextRegistryEntry[];
  readonly registryHash: string;
  /** The snapshots the context was derived from, kept for replay. */
  readonly snapshots: readonly ContextFactSnapshot[];
}

export interface MacroReview {
  readonly ack: ContextReviewAck;
  readonly proof: ContextReviewProof;
}

export interface MacroDeps {
  /** The pulse; `read()` gives the context and the facts of ONE instant. */
  readonly pulse: { read(): PulseReading };
  /** The local clock. */
  readonly now: () => number;
  /** The context dispatcher's `notify`: told only about the material facts. */
  readonly notify: (event: ContextOpportunityEvent) => unknown;
  readonly registry?: readonly ContextRegistryEntry[];
  /** How old an observation may be, at the time the context is made and at the time the model is asked. Default three minutes. */
  readonly maxAgeMs?: number;
  readonly materiality?: Materiality;
  /** A name for this instance of the host (for example the process); by default the time it was made plus a random suffix. */
  readonly epoch?: string;
}

export interface MacroContext {
  poll(): void;
  prepare(asOfMs: number): MacroPrepared | null;
  review(input: {
    readonly cycleId: string;
    readonly prepared: MacroPrepared;
    readonly askedAtMs: number;
    readonly answeredAtMs: number;
    /** The exact frozen Brief that was sent (`captureEventReviewBrief`) and its SHA-256. */
    readonly brief: unknown;
    readonly briefHash: string;
    /** The events the dispatcher offered with this look; empty for a look nobody asked for. */
    readonly batch: readonly ContextOpportunityEvent[];
  }): MacroReview | null;
}

/** The order of two observations of the same market: the window they are final for, then the print they come from, then the generation of the connection. Strictly greater is newer; anything else is a replay or cannot be ordered. */
const orderOf = (fact: { readonly windowEndMs?: number; readonly originAtMs: number; readonly generation: number }): readonly [number, number, number] => [fact.windowEndMs ?? 0, fact.originAtMs, fact.generation];
const isNewer = (a: readonly [number, number, number], b: readonly [number, number, number]): boolean => {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
};

export function createMacroContext(deps: MacroDeps): MacroContext {
  const registry = deps.registry ?? DEFAULT_MACRO_REGISTRY;
  const wanted = new Set(registry.map((entry) => entry.contextKey));
  const maxAgeMs = deps.maxAgeMs ?? 180_000;
  const materiality = deps.materiality ?? createMateriality();
  const hostEpoch = deps.epoch ?? `epoch-${deps.now()}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  // ONE snapshot per market, never evicted: it is the first capture of the newest observation, and it is what makes a replay of anything older recognisable at any distance. No cache of past observations decides what was "seen":
  // an observation is new only if it is strictly newer than the current one by (window, print, generation)
  const latest = new Map<string, ContextFactSnapshot>();

  function poll(): void {
    let reading: PulseReading;
    try {
      reading = deps.pulse.read();
    } catch {
      return;
    }
    // the availability of a derived fact is the host's first look AT it, taken after the reading
    const availableAtMs = deps.now();
    const fresh: ContextFactSnapshot[] = [];
    for (const fact of reading.facts) {
      const key = `okx:${fact.marketType}:${fact.instrument}`;
      if (!wanted.has(key)) continue;
      const current = latest.get(key);
      // the same observation again renews nothing; an older one is a replay; one that cannot be ordered is unknown: none of them is captured
      if (current !== undefined && !isNewer(orderOf(fact), orderOf(current.fact))) continue;
      const captured = captureContextFacts({ fact, availableAtMs });
      if (!captured.ok) continue;
      latest.set(key, captured.value);
      fresh.push(captured.value);
    }
    for (const event of materiality.observe(fresh.map((snapshot) => snapshot.fact as never))) {
      const snapshot = fresh.find((candidate) => candidate.fact.hash === event.factHash);
      if (snapshot === undefined) continue;
      try {
        deps.notify(snapshot.event);
      } catch {
        // the queue is the dispatcher's business; a failure to tell it costs this event, not the cycle
      }
    }
  }

  return {
    poll,

    prepare(asOfMs) {
      // read and capture FIRST, then fix the instant of the context: it never predates the capture it carries, and never predates the instant the cycle asked for it
      poll();
      const snapshots = registry.flatMap((entry) => latest.get(entry.contextKey) ?? []);
      // never earlier than the instant asked, than now, or than the availability of any snapshot the context carries (a clock that stepped back a millisecond after a capture must not make the fact "from the future");
      // nothing is backdated: the availability stays the one of the first capture, and a real question asked BEFORE this instant is refused by the proof
      const contextAtMs = Math.max(asOfMs, deps.now(), ...snapshots.map((snapshot) => snapshot.availableAtMs));
      const projected = projectContextFacts({ registry, snapshots, asOfMs: contextAtMs, maxAgeMs });
      if (!projected.ok) return null;
      return { hostEpoch, context: projected.context, contextAtMs: projected.contextAtMs, registry, registryHash: projected.registryHash, snapshots };
    },

    review(input) {
      const proved = proveContextReview({
        cycleId: input.cycleId,
        contextAtMs: input.prepared.contextAtMs,
        askedAtMs: input.askedAtMs,
        answeredAtMs: input.answeredAtMs,
        maxAgeMs,
        brief: input.brief,
        briefHash: input.briefHash,
        batch: input.batch,
        registry: input.prepared.registry,
        snapshots: input.prepared.snapshots,
      });
      return proved.ok ? { ack: proved.ack, proof: proved.proof } : null;
    },
  };
}

export interface MacroBridge {
  /** What the cycle is given as `deps.macro`: it projects the context and proves the Brief, adding the batch the dispatcher offered with this look. */
  readonly port: {
    prepare(asOfMs: number): MacroPrepared | null;
    review(input: { readonly cycleId: string; readonly prepared: MacroPrepared; readonly askedAtMs: number; readonly answeredAtMs: number; readonly brief: unknown; readonly briefHash: string }): MacroReview | null;
  };
  /** What the dispatcher is given as `request`: it offers the batch to the SAME flight of the scheduler and answers with the acknowledgement of the proof, or `false` when the flight was busy or the look did not carry the facts. */
  request(batch: readonly ContextOpportunityEvent[]): Promise<boolean | ContextReviewAck>;
}

/**
 * The glue between the dispatcher and the cycle, with no flight of its own: `requestCycle` is the scheduler's (`false` when it is busy, stopped or off). Never `true` for a timer or for `consulted` alone: the answer is the
 * acknowledgement the proof of THAT look produced.
 */
export function createMacroBridge(deps: { readonly macro: MacroContext; readonly requestCycle: () => Promise<boolean> }): MacroBridge {
  let batch: readonly ContextOpportunityEvent[] = [];
  let ack: ContextReviewAck | null = null;
  let asking = false;
  return {
    port: {
      prepare: (asOfMs) => deps.macro.prepare(asOfMs),
      review: (input) => {
        const result = deps.macro.review({ ...input, batch });
        ack = result === null ? null : result.ack;
        return result;
      },
    },
    async request(offered) {
      if (asking) return false;
      asking = true;
      batch = offered;
      ack = null;
      try {
        const consulted = await deps.requestCycle();
        return consulted && ack !== null ? ack : false;
      } catch {
        return false;
      } finally {
        batch = [];
        ack = null;
        asking = false;
      }
    },
  };
}
