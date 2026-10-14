/**
 * ONE steady hand for the page. The reading of who is in charge (the stabilizer) must be the same wherever it is shown: the thermometer beside the chart and the lines of the Inonu tab
 * read it from here, so two panels never disagree about the same second. The store keeps one stabilizer per instrument, feeds it once a second while somebody is looking at that
 * instrument, and lets go of it (forgetting its past) when nobody is. Pure but for the timers it is given; React reads it through `useSteadyFlow`.
 */
import { createStabilizer, type StableReading } from "./stabilize";

export interface SteadyFlowDeps {
  readonly now: () => number;
  readonly setTimer: (tick: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  readonly everyMs?: number;
}

interface Slot {
  readonly hand: ReturnType<typeof createStabilizer>;
  readonly getters: Set<() => number | null>;
  reading: StableReading | null;
  timer: unknown;
}

export function createSteadyFlow(deps: SteadyFlowDeps) {
  const slots = new Map<string, Slot>();
  const listeners = new Set<() => void>();
  const everyMs = deps.everyMs ?? 1000;

  const tick = (slot: Slot): void => {
    const first = slot.getters.values().next();
    if (first.done) return;
    const next = slot.hand.push(first.value(), deps.now());
    const old = slot.reading;
    // a new object only when what the screen shows changed: a store that hands out a new reading every second would redraw every panel every second
    if (next === null ? old === null : old !== null && old.band === next.band && old.pct === next.pct && old.sinceMs === next.sinceMs) return;
    slot.reading = next;
    for (const listener of [...listeners]) listener();
  };

  return {
    /** Somebody is looking at this instrument and can say what the raw reading is now. Returns the way to stop looking. */
    attach(instId: string, latest: () => number | null): () => void {
      let slot = slots.get(instId);
      if (slot === undefined) {
        slot = { hand: createStabilizer(), getters: new Set(), reading: null, timer: null };
        slots.set(instId, slot);
      }
      const mine = slot;
      mine.getters.add(latest);
      if (mine.timer === null) {
        tick(mine);
        mine.timer = deps.setTimer(() => tick(mine), everyMs);
      }
      return () => {
        mine.getters.delete(latest);
        if (mine.getters.size === 0) {
          if (mine.timer !== null) deps.clearTimer(mine.timer);
          // nobody is looking: the next time starts from nothing, so an old reading never greets a new look
          slots.delete(instId);
          for (const listener of [...listeners]) listener();
        }
      };
    },
    read(instId: string): StableReading | null {
      return slots.get(instId)?.reading ?? null;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type SteadyFlow = ReturnType<typeof createSteadyFlow>;
