import type { Policy, Snapshot } from "./types.ts";

// Freshness of the four timestamped components of a snapshot against an injected clock.
// A component is fresh when its age is at most the policy maximum, stale when older, and
// future when its timestamp is after the clock (zero tolerance, like the other OKX modules).

export type FreshnessStatus = "fresh" | "stale" | "future";

export interface ComponentFreshness {
  tsMs: number;
  /** null when the timestamp is in the future. */
  ageMs: number | null;
  status: FreshnessStatus;
}

export interface SnapshotFreshness {
  spotBook: ComponentFreshness;
  perpBook: ComponentFreshness;
  mark: ComponentFreshness;
  funding: ComponentFreshness;
  booksSkewMs: number;
  skewExceeded: boolean;
}

export type FreshnessComponent = "spot_book" | "perp_book" | "mark" | "funding";

function component(tsMs: number, nowMs: number, maxAgeMs: number): ComponentFreshness {
  if (tsMs > nowMs) return { tsMs, ageMs: null, status: "future" };
  const ageMs = nowMs - tsMs;
  return { tsMs, ageMs, status: ageMs > maxAgeMs ? "stale" : "fresh" };
}

export function assessFreshness(snapshot: Snapshot, nowMs: number, policy: Policy): SnapshotFreshness {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError("the clock must be a non-negative safe integer");
  const skew = snapshot.books.perp.tsMs - snapshot.books.spot.tsMs;
  const booksSkewMs = skew < 0 ? -skew : skew;
  return {
    spotBook: component(snapshot.books.spot.tsMs, nowMs, policy.maxSnapshotAgeMs),
    perpBook: component(snapshot.books.perp.tsMs, nowMs, policy.maxSnapshotAgeMs),
    mark: component(snapshot.mark.tsMs, nowMs, policy.maxSnapshotAgeMs),
    funding: component(snapshot.funding.tsMs, nowMs, policy.maxSnapshotAgeMs),
    booksSkewMs,
    skewExceeded: booksSkewMs > policy.maxBookSkewMs,
  };
}

const KEY: Record<FreshnessComponent, keyof Omit<SnapshotFreshness, "booksSkewMs" | "skewExceeded">> = {
  spot_book: "spotBook",
  perp_book: "perpBook",
  mark: "mark",
  funding: "funding",
};

/** Reason codes for the listed components, in the order given, plus book skew when requested. */
export function freshnessReasons(freshness: SnapshotFreshness, components: readonly FreshnessComponent[], includeSkew: boolean): string[] {
  const reasons: string[] = [];
  for (const name of components) {
    const status = freshness[KEY[name]].status;
    if (status === "stale") reasons.push(`stale:${name}`);
    else if (status === "future") reasons.push(`future:${name}`);
  }
  if (includeSkew && freshness.skewExceeded) reasons.push("skew:books");
  return reasons;
}
