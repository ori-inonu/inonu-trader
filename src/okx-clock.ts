/**
 * The clock every signed OKX request is stamped with (API-2).
 *
 * OKX refuses a signature whose timestamp is more than 30 s away from its own clock (error 50102). The Windows clock of
 * this machine has never synced (about 77 s behind), so a stamp taken from `Date.now()` fails on every authenticated
 * family. The cure is to measure the offset against the exchange's public time endpoint (free, no credential) and stamp
 * with the corrected clock. The measurement and the corrected clock are the ones System One already uses
 * (`src/system-one/clock.ts`); this module only decides when the correction applies and exposes one shared clock.
 *
 * The correction applies only when the skew is 10 s or more, like the OnchainOS gateway: ordinary network jitter must
 * not rewrite timestamps. The local clock is never changed. Nothing here throws: when nothing trustworthy is measured
 * the previous state stays (the local clock before the first success, which fails closed exactly as before).
 */
import { correctedClock, measureServerClockOffset, type ClockFetch, type ClockSample } from "./system-one/clock";

const OKX_CLOCK_APPLY_THRESHOLD_MS = 10_000;

let correction: (() => number) | null = null;
let lastSample: ClockSample | null = null;

/** Milliseconds to stamp OKX signatures with: the corrected clock when a real skew was measured, else the local clock. */
export function okxNowMs(): number {
  // The corrected clock advances with performance.now(), which is fractional; the signals client needs a safe integer.
  return correction ? Math.round(correction()) : Date.now();
}

export function okxNow(): Date {
  return new Date(okxNowMs());
}

export interface OkxClockStatus {
  /** True when signatures are stamped with the corrected clock. */
  readonly applied: boolean;
  /** Last measured skew, exchange minus local, in ms. Null before the first successful measurement. */
  readonly offsetMs: number | null;
  readonly roundTripMs: number | null;
  readonly measuredAtMs: number | null;
}

export function okxClockStatus(): OkxClockStatus {
  return { applied: correction !== null, offsetMs: lastSample?.offsetMs ?? null, roundTripMs: lastSample?.roundTripMs ?? null, measuredAtMs: lastSample?.measuredAtMs ?? null };
}

export interface SyncOkxClockOptions {
  readonly fetch?: ClockFetch;
  /** Local wall clock used to take the samples. */
  readonly now?: () => number;
  /** Monotonic clock the corrected clock advances with. */
  readonly mono?: () => number;
  readonly samples?: number;
  readonly url?: string;
  readonly timeoutMs?: number;
}

/**
 * Measures the skew against OKX and applies it when it is 10 s or more. Returns the sample, or null when nothing
 * trustworthy was measured (state unchanged). A later in-tolerance measurement removes an earlier correction, which is
 * what should happen after the user fixes the Windows clock.
 */
export async function syncOkxClock(options: SyncOkxClockOptions = {}): Promise<ClockSample | null> {
  const local = options.now ?? Date.now;
  const sample = await measureServerClockOffset({
    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
    now: local,
    ...(options.samples === undefined ? {} : { samples: options.samples }),
    ...(options.url === undefined ? {} : { url: options.url }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (sample === null) return null;
  lastSample = sample;
  correction = Math.abs(sample.offsetMs) >= OKX_CLOCK_APPLY_THRESHOLD_MS ? correctedClock(sample, local, options.mono) : null;
  return sample;
}

export function resetOkxClockForTests(): void {
  correction = null;
  lastSample = null;
}
