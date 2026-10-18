"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { StableReading } from "./stabilize";
import { createSteadyFlow, type SteadyFlow } from "./steady-flow";

let shared: SteadyFlow | null = null;

/** The one steady hand of the page, created the first time it is needed. */
export function sharedSteadyFlow(): SteadyFlow {
  shared ??= createSteadyFlow({ now: () => Date.now(), setTimer: (tick, ms) => setInterval(tick, ms), clearTimer: (h) => clearInterval(h as ReturnType<typeof setInterval>) });
  return shared;
}

/**
 * The steady reading of who is in charge of this instrument, the same for every panel that asks (the thermometer and the lines of the Inonu tab). `latest` says what the raw
 * reading of the second is; it may be a new function on every render.
 */
export function useSteadyFlow(instId: string, latest: () => number | null): StableReading | null {
  const store = sharedSteadyFlow();
  const ref = useRef(latest);
  ref.current = latest;
  useEffect(() => store.attach(instId, () => ref.current()), [store, instId]);
  return useSyncExternalStore(
    store.subscribe,
    () => store.read(instId),
    () => null,
  );
}
