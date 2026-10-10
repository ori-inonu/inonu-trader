import type { Action } from "./types";

const ARC_TOTAL = 100;
const ARC_GAP = 1;

/**
 * Dash pattern for a probability arc on a 100 unit track, clamped into [0, 1].
 * The drawn run and the remaining track always sum to the track length, so p = 0 draws nothing
 * and p = 1 still leaves one unit of gap between neighbouring arcs.
 */
export function arcDash(p: number): string {
  const value = typeof p !== "number" || Number.isNaN(p) ? 0 : Math.min(1, Math.max(0, p));
  return `${value} ${ARC_TOTAL - value}`;
}

const ARC_START = -120;
const ARC_SWEEP = 240;

/** Gauge centre angle per arm. Buy sits at the high end, so more buy weight swings the needle up. */
const ARM_CENTRE: ReadonlyArray<[Action, number]> = [
  ["buy", ARC_START + ARC_SWEEP],
  ["hold", ARC_START + ARC_SWEEP / 2],
  ["sell", ARC_START],
];

/**
 * Needle angle in degrees for an action, on a gauge that starts at ARC_START and sweeps ARC_SWEEP.
 * The angle comes only from the probabilities, so equal probabilities place the needle identically
 * no matter which action was chosen.
 */
export function needleAngle(
  probabilities: { buy: number; sell: number; hold: number },
  action: Action,
): number {
  // The action is accepted so callers can pass the decision straight through, but the angle comes
  // from the probabilities alone. Equal probabilities therefore always place the needle identically.
  void action;
  let total = 0;
  let weighted = 0;

  for (const [key, centre] of ARM_CENTRE) {
    const raw = probabilities[key];
    const value = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
    total += value;
    weighted += value * centre;
  }

  if (total <= 0) return ARC_START;
  return weighted / total;
}
