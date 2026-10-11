/**
 * Server clock offset for System One.
 *
 * Every timestamp the cycle trusts is stamped by OKX. A local clock that runs behind the exchange makes those stamps
 * look like they come from the future, so a freshness check against the local clock rejects every reading and the
 * cycle silently degrades to "no eligible candidate". The cure is not to relax the check but to measure the offset
 * against the exchange's own clock and evaluate freshness on the corrected clock.
 *
 * The measurement is the classic midpoint estimate: the server stamp minus the middle of the request. The sample with
 * the smallest round trip wins, and a sample with a slow round trip is discarded, because its error is bounded by half
 * of the round trip. When nothing trustworthy is measured the result is null and the caller keeps the local clock
 * (which then fails closed, exactly as before).
 */

export const OKX_PUBLIC_TIME_URL = "https://www.okx.com/api/v5/public/time";
/** A round trip longer than this says nothing reliable about the offset (error up to half of it). */
export const MAX_TRUSTED_ROUND_TRIP_MS = 2_500;
export const DEFAULT_CLOCK_SAMPLES = 3;
const DEFAULT_TIMEOUT_MS = 5_000;

export interface ClockSample {
  /** Server clock minus local clock, in milliseconds. Positive: the local clock is behind the exchange. */
  readonly offsetMs: number;
  readonly roundTripMs: number;
  readonly measuredAtMs: number;
}

export interface ClockResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ClockFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<ClockResponse>;

export function computeClockSample(requestedAtMs: number, receivedAtMs: number, serverAtMs: number): ClockSample | null {
  if (!Number.isFinite(requestedAtMs) || !Number.isFinite(receivedAtMs) || !Number.isFinite(serverAtMs)) return null;
  if (receivedAtMs < requestedAtMs) return null;
  const roundTripMs = receivedAtMs - requestedAtMs;
  return { offsetMs: Math.round(serverAtMs - (requestedAtMs + roundTripMs / 2)), roundTripMs, measuredAtMs: receivedAtMs };
}

/** Strict reader of `{ code: "0", data: [{ ts: "<ms>" }] }`. Anything else is null. */
export function parseOkxServerTime(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const envelope = body as { code?: unknown; data?: unknown };
  if (envelope.code !== "0" || !Array.isArray(envelope.data) || envelope.data.length === 0) return null;
  const row: unknown = envelope.data[0];
  if (typeof row !== "object" || row === null) return null;
  const ts = (row as { ts?: unknown }).ts;
  if (typeof ts !== "string" || !/^\d{1,16}$/.test(ts)) return null;
  const value = Number(ts);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export interface MeasureOptions {
  readonly fetch: ClockFetch;
  readonly now: () => number;
  readonly samples?: number;
  readonly url?: string;
  readonly timeoutMs?: number;
}

export async function measureServerClockOffset(options: MeasureOptions): Promise<ClockSample | null> {
  const samples = Math.max(1, Math.min(options.samples ?? DEFAULT_CLOCK_SAMPLES, 7));
  const url = options.url ?? OKX_PUBLIC_TIME_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let best: ClockSample | null = null;
  for (let i = 0; i < samples; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestedAtMs = options.now();
      const response = await options.fetch(url, { signal: controller.signal });
      if (!response.ok) continue;
      const serverAtMs = parseOkxServerTime(await response.json());
      const receivedAtMs = options.now();
      if (serverAtMs === null) continue;
      const sample = computeClockSample(requestedAtMs, receivedAtMs, serverAtMs);
      if (sample === null || sample.roundTripMs > MAX_TRUSTED_ROUND_TRIP_MS) continue;
      if (best === null || sample.roundTripMs < best.roundTripMs) best = sample;
    } catch {
      // A failed sample is simply not a sample.
    } finally {
      clearTimeout(timer);
    }
  }
  return best;
}

/**
 * The corrected clock: local time plus the measured offset plus half of the round trip. The estimate can be behind
 * the true server clock by at most half of the round trip, so adding it guarantees the corrected clock is never
 * earlier than the exchange's: a stamp the exchange issued cannot land in the future, and `isFreshReading` stays
 * strict. The price is that a reading looks at most half a round trip older than it is.
 */
export function correctedClock(sample: ClockSample, local: () => number = Date.now): () => number {
  const shiftMs = sample.offsetMs + Math.ceil(sample.roundTripMs / 2);
  return () => local() + shiftMs;
}
