/**
 * Closed states, the five derived statuses and freshness. Pure.
 *
 * Freshness has TWO clocks and they never substitute for each other:
 *  - capture: how old OUR reading is (fetchedAtMs against nowMs);
 *  - source: how old the PROVIDER datum is (sourceTimeMs against fetchedAtMs). Without a provider clock it is `unknown`.
 */

import type { EvidenceState, Freshness, FreshnessReport, StateKind, Status, Timing } from "./types.ts";

export const OK: EvidenceState = Object.freeze({ kind: "ok", code: "ok" });

export function state(kind: Exclude<StateKind, "ok">, code: string): EvidenceState {
  return Object.freeze({ kind, code });
}

/** Provider clocks may run ahead of ours by this much before a datum is called `future`. */
export const FUTURE_TOLERANCE_MS = 5_000;

export function freshnessOf(timestampMs: number | null, referenceMs: number, maxAgeMs: number, offsetMs: number | null = null): Freshness {
  if (timestampMs === null || !Number.isFinite(timestampMs)) return "unknown";
  // A measured offset (provider minus local) puts the provider clock on our timeline.
  const onLocalClock = offsetMs === null ? timestampMs : timestampMs - offsetMs;
  if (onLocalClock > referenceMs + FUTURE_TOLERANCE_MS) return "future";
  return referenceMs - onLocalClock <= maxAgeMs ? "fresh" : "stale";
}

export function freshnessReport(timing: Timing, nowMs: number, maxAgeMs: number, sourceMaxAgeMs: number = maxAgeMs): FreshnessReport {
  const capture = freshnessOf(timing.fetchedAtMs, nowMs, maxAgeMs);
  const source =
    timing.sourceTimeMs === null || timing.fetchedAtMs === null ? "unknown" : freshnessOf(timing.sourceTimeMs, timing.fetchedAtMs, sourceMaxAgeMs, timing.clockOffsetMs);
  return { capture, source };
}

/** Maps a granular state to the status a reader sees. */
export function statusOfState(kind: StateKind): Status {
  switch (kind) {
    case "ok":
      return "valid";
    case "missing":
    case "omitted_by_filter":
    case "unverified":
      return "incomplete";
    case "stale":
    case "future":
      return "stale";
    case "divergent":
      return "divergent";
    case "unreconciled":
      return "unreconciled";
  }
}

const SEVERITY: Readonly<Record<Status, number>> = { valid: 0, incomplete: 1, stale: 2, unreconciled: 3, divergent: 4 };

/** The worst of several statuses. An empty list is `incomplete`: nothing was observed, which is not validity. */
export function worstStatus(statuses: readonly Status[]): Status {
  if (statuses.length === 0) return "incomplete";
  return statuses.reduce((worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst));
}

export function statusOfFreshness(report: FreshnessReport): Status {
  if (report.capture === "stale" || report.source === "stale") return "stale";
  if (report.capture === "future" || report.source === "future") return "stale";
  if (report.capture === "unknown") return "incomplete";
  return "valid";
}
