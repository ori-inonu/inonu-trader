/**
 * Spaces out the resubscribe requests of a book that keeps failing.
 *
 * OKX allows 480 subscription requests per hour per connection, and every resync costs two (unsubscribe, subscribe).
 * The first resync of a quiet period runs at once. A repeat inside the quiet period waits 5 s, then 10 s, 20 s, 40 s and
 * at most 60 s, so a persistent fault (a stream that breaks again right after each snapshot) cannot burn the budget.
 * While a resync is waiting, further requests for the same key are absorbed: the book stays out of use and the desk
 * shows the books5 fallback, which is honest about what is known.
 */

import type { TimerHandle, Timers } from "./runtime";

export interface ResyncGuardOptions {
  readonly now: () => number;
  readonly timers: Timers;
  readonly firstDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Without a resync for this long the next one is immediate again. */
  readonly resetAfterMs?: number;
}

export interface ResyncGuard {
  /** Runs `run` now or later, at most once per pending key. */
  request(key: string, run: () => void): void;
  /** Cancels everything that is waiting. */
  clear(): void;
}

interface KeyState {
  lastAtMs: number;
  attempts: number;
  timer: TimerHandle | null;
}

export function createResyncGuard(options: ResyncGuardOptions): ResyncGuard {
  const firstDelayMs = options.firstDelayMs ?? 5_000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const resetAfterMs = options.resetAfterMs ?? 120_000;
  const keys = new Map<string, KeyState>();

  function request(key: string, run: () => void): void {
    const t = options.now();
    const known = keys.get(key);
    if (known === undefined || (known.timer === null && t - known.lastAtMs > resetAfterMs)) {
      keys.set(key, { lastAtMs: t, attempts: 1, timer: null });
      run();
      return;
    }
    if (known.timer !== null) return;
    const attempts = known.attempts + 1;
    const delayMs = Math.min(maxDelayMs, firstDelayMs * 2 ** (attempts - 2));
    const waitMs = Math.max(0, known.lastAtMs + delayMs - t);
    known.attempts = attempts;
    const fire = (): void => {
      known.timer = null;
      known.lastAtMs = options.now();
      run();
    };
    if (waitMs === 0) fire();
    else known.timer = options.timers.setTimeout(fire, waitMs);
  }

  function clear(): void {
    for (const state of keys.values()) {
      if (state.timer !== null) options.timers.clearTimeout(state.timer);
    }
    keys.clear();
  }

  return { request, clear };
}
