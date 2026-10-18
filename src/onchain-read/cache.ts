/**
 * In-memory response cache for the gateway (ONC-3): canonical key -> {data, cachedAtMs}. A request can never
 * receive data newer than the endpoint TTL; when the provider cannot be reached (error, exhausted budget,
 * pace limit, cooldown) a stale entry is served while it is younger than min(12 x TTL, 24 h). Identical
 * in-flight requests coalesce into a single provider call.
 */

const STALE_MAX_MS = 24 * 3_600_000;

export interface CacheEntry {
  readonly data: unknown;
  readonly cachedAtMs: number;
}

export interface OnchainCache {
  /** Fresh entry, or a stale one still inside its window, or null. */
  get(key: string, ttlMs: number): { entry: CacheEntry; fresh: boolean } | null;
  set(key: string, data: unknown): void;
  /** One provider call shared by every concurrent identical request. */
  coalesce<T>(key: string, fn: () => Promise<T>): Promise<T>;
  readonly size: number;
}

export function createOnchainCache(now: () => number): OnchainCache {
  const entries = new Map<string, { data: unknown; cachedAtMs: number }>();
  const inflight = new Map<string, Promise<unknown>>();
  return {
    get(key, ttlMs) {
      const entry = entries.get(key);
      if (!entry) return null;
      const age = now() - entry.cachedAtMs;
      if (age < ttlMs) return { entry, fresh: true };
      if (age < Math.min(12 * ttlMs, STALE_MAX_MS)) return { entry, fresh: false };
      return null;
    },
    set(key, data) {
      entries.set(key, { data, cachedAtMs: now() });
    },
    coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing as Promise<T>;
      const promise = fn().finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
    get size() {
      return entries.size;
    },
  };
}
