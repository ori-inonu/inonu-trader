/** Wall time can advance validity, but cannot extend it after a clock rollback. */
export function createObservationClock(wall: () => number = Date.now, monotonic: () => number = () => performance.now()) {
 let at = wall(), previous = monotonic(), invalid = false;
 return () => {
  const elapsed = monotonic(), current = wall();
  if (!Number.isFinite(current) || !Number.isFinite(elapsed) || elapsed < previous) invalid = true;
  if (invalid) return NaN;
  at = Math.max(current, at + elapsed - previous);
  previous = elapsed;
  return at;
 };
}
