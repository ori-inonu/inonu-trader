/**
 * Injectable clock and timers of the desk data layer. Production code passes nothing and gets the system ones;
 * tests pass a fake pair so reconnects, heartbeats and throttling are deterministic. No Node only APIs.
 */

/** Opaque timer handle: a number in browsers, an object in Node and Bun. */
export type TimerHandle = unknown;

export interface Timers {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const systemTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export const systemNow = (): number => Date.now();

export function sleepWith(timers: Timers, ms: number): Promise<void> {
  return new Promise((resolve) => {
    timers.setTimeout(resolve, ms);
  });
}
