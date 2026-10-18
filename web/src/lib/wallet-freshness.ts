export const WALLET_BALANCE_STALE_AFTER_MS = 60_000;
export const WALLET_FRESHNESS_TICK_MS = 1_000;

export type WalletBalanceFreshnessStatus = "unknown" | "fresh" | "stale";

export interface WalletBalanceFreshness {
  status: WalletBalanceFreshnessStatus;
  ageMs: number | null;
}

export type WalletIntervalHandle = ReturnType<typeof globalThis.setInterval>;

export interface WalletFreshnessScheduler {
  setInterval(callback: () => void, delayMs: number): WalletIntervalHandle;
  clearInterval(handle: WalletIntervalHandle): void;
}

export function isValidWalletTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 8_640_000_000_000_000
  );
}

export function getWalletBalanceFreshness(
  observedAtMs: unknown,
  nowMs: unknown,
): WalletBalanceFreshness {
  if (!isValidWalletTimestamp(observedAtMs) || !isValidWalletTimestamp(nowMs) || nowMs < observedAtMs) {
    return { status: "unknown", ageMs: null };
  }

  const ageMs = nowMs - observedAtMs;
  return {
    status: ageMs > WALLET_BALANCE_STALE_AFTER_MS ? "stale" : "fresh",
    ageMs,
  };
}

export function formatWalletObservationTime(observedAtMs: unknown): string | null {
  return isValidWalletTimestamp(observedAtMs) ? new Date(observedAtMs).toISOString() : null;
}

export function startWalletFreshnessTicker(
  onTick: (nowMs: number) => void,
  now: () => number = Date.now,
  scheduler: WalletFreshnessScheduler = globalThis,
): () => void {
  const tick = () => {
    try {
      const current = now();
      onTick(isValidWalletTimestamp(current) ? current : Number.NaN);
    } catch {
      onTick(Number.NaN);
    }
  };

  tick();
  const handle = scheduler.setInterval(tick, WALLET_FRESHNESS_TICK_MS);
  return () => scheduler.clearInterval(handle);
}
