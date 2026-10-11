/**
 * Offset between the OKX server clock and the browser clock.
 *
 * Every timestamp OKX sends (trades, candles, book, ticker) is exchange time. A browser clock that runs behind makes
 * those stamps look like they come from the future, which would blank any window computed against the local clock.
 * The offset is measured with the classic midpoint method against GET /api/v5/public/time: the server stamp minus the
 * middle of the request. The sample with the smallest round trip wins and a slow sample is discarded, because its
 * error is bounded by half of its round trip. When nothing trustworthy is measured the result is null, never a guess.
 *
 * Mirrors src/system-one/clock.ts of the backend (web/ cannot import from ../src).
 */

import { isRecord } from "./okx-parse";
import type { FetchLike } from "./okx-rest";
import { systemTimers, type TimerHandle, type Timers } from "./runtime";

export const OKX_TIME_URL = "https://www.okx.com/api/v5/public/time";
/** A round trip longer than this says nothing reliable about the offset (error up to half of it). */
export const MAX_TRUSTED_ROUND_TRIP_MS = 2_500;
export const DEFAULT_CLOCK_SAMPLES = 3;
const DEFAULT_TIMEOUT_MS = 5_000;

export interface ClockSample {
  /** Server clock minus local clock, in ms. Positive: the local clock is behind the exchange. */
  readonly offsetMs: number;
  readonly roundTripMs: number;
  readonly measuredAtMs: number;
}

export function computeClockSample(requestedAtMs: number, receivedAtMs: number, serverAtMs: number): ClockSample | null {
  if (!Number.isFinite(requestedAtMs) || !Number.isFinite(receivedAtMs) || !Number.isFinite(serverAtMs)) return null;
  if (receivedAtMs < requestedAtMs) return null;
  const roundTripMs = receivedAtMs - requestedAtMs;
  return { offsetMs: Math.round(serverAtMs - (requestedAtMs + roundTripMs / 2)), roundTripMs, measuredAtMs: receivedAtMs };
}

/** Strict reader of `{ code: "0", data: [{ ts: "<ms>" }] }`. Anything else is null. */
export function parseOkxServerTime(body: unknown): number | null {
  if (!isRecord(body) || body.code !== "0" || !Array.isArray(body.data) || body.data.length === 0) return null;
  const row: unknown = body.data[0];
  if (!isRecord(row)) return null;
  const ts = row.ts;
  if (typeof ts !== "string" || !/^\d{1,16}$/.test(ts)) return null;
  const value = Number(ts);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export interface MeasureClockOptions {
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly timers?: Timers;
  readonly samples?: number;
  readonly url?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** Takes up to `samples` readings one after another and keeps the one with the smallest trusted round trip. */
export async function measureClockSkew(options: MeasureClockOptions): Promise<ClockSample | null> {
  const samples = Math.max(1, Math.min(options.samples ?? DEFAULT_CLOCK_SAMPLES, 7));
  const url = options.url ?? OKX_TIME_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timers = options.timers ?? systemTimers;
  let best: ClockSample | null = null;
  for (let i = 0; i < samples; i += 1) {
    if (options.signal?.aborted) return best;
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = timers.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestedAtMs = options.now();
      const response = await options.fetch(url, { signal: controller.signal });
      const text = await response.text();
      const receivedAtMs = options.now();
      if (!response.ok) continue;
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        continue;
      }
      const serverAtMs = parseOkxServerTime(body);
      if (serverAtMs === null) continue;
      const sample = computeClockSample(requestedAtMs, receivedAtMs, serverAtMs);
      if (sample === null || sample.roundTripMs > MAX_TRUSTED_ROUND_TRIP_MS) continue;
      if (best === null || sample.roundTripMs < best.roundTripMs) best = sample;
    } catch {
      // A failed sample is simply not a sample.
    } finally {
      timers.clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
  return best;
}

/** Local time moved onto the exchange clock; null when the skew is not known. */
export function exchangeNow(skewMs: number | null, localNowMs: number): number | null {
  return skewMs === null ? null : localNowMs + skewMs;
}

export interface SkewMonitorOptions {
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly timers?: Timers;
  readonly url?: string;
  readonly samples?: number;
  /** Called with a new measurement, or with null when the last trustworthy one has become too old. */
  readonly onSkew: (skewMs: number | null) => void;
  readonly remeasureMs?: number;
  readonly retryMs?: number;
  /** A measurement older than this is dropped (reported as null) when re-measuring keeps failing. */
  readonly maxAgeMs?: number;
}

export interface SkewMonitor {
  start(): void;
  stop(): void;
}

/** Measures at start and again every 10 minutes (every 30 s while measurements fail). */
export function createSkewMonitor(options: SkewMonitorOptions): SkewMonitor {
  const timers = options.timers ?? systemTimers;
  const remeasureMs = options.remeasureMs ?? 600_000;
  const retryMs = options.retryMs ?? 30_000;
  const maxAgeMs = options.maxAgeMs ?? 1_800_000;
  let generation = 0;
  let timer: TimerHandle | null = null;
  let abort: AbortController | null = null;
  let lastOkAtMs: number | null = null;

  function schedule(delayMs: number, mine: number): void {
    if (timer !== null) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = null;
      if (mine === generation) void measure(mine);
    }, delayMs);
  }

  async function measure(mine: number): Promise<void> {
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    const sample = await measureClockSkew({
      fetch: options.fetch,
      now: options.now,
      timers,
      signal: controller.signal,
      ...(options.url ? { url: options.url } : {}),
      ...(options.samples ? { samples: options.samples } : {}),
    });
    if (mine !== generation || controller.signal.aborted) return;
    if (sample !== null) {
      lastOkAtMs = options.now();
      options.onSkew(sample.offsetMs);
      schedule(remeasureMs, mine);
      return;
    }
    if (lastOkAtMs === null || options.now() - lastOkAtMs > maxAgeMs) {
      lastOkAtMs = null;
      options.onSkew(null);
    }
    schedule(retryMs, mine);
  }

  return {
    start() {
      generation += 1;
      void measure(generation);
    },
    stop() {
      generation += 1;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      abort?.abort();
      abort = null;
    },
  };
}
