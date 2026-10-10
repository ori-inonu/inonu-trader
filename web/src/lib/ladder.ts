import type { BlockEvent } from "./types";

/** Smallest drawn bar so a level with no resting size stays visible. */
const MIN_SCALE = 0.35;

export interface DepthLevel {
  price: number;
  bidSize: number;
  askSize: number;
  block: number | null;
  isLive: boolean;
  arm: "bid" | "ask" | "mid";
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampSize(value: number | null): number {
  if (value === null) return 0;
  return Math.max(0, value);
}

/**
 * Builds depth levels from the fields a BlockEvent actually carries.
 * A resting size that is not in the data is never invented, because a fabricated resting order
 * is a false claim about the on-chain book. Absent sizes stay 0 and the level simply renders thin.
 */
export function buildDepthLevels(events: BlockEvent[], count: number): DepthLevel[] {
  const wanted = Math.max(0, Math.floor(count));
  if (wanted === 0) return [];

  const byPrice = new Map<number, DepthLevel>();

  for (const event of events) {
    const mid = finiteOrNull(event.mid);
    const bestBid = finiteOrNull(event.bestBid);
    const bestAsk = finiteOrNull(event.bestAsk);
    const bidSize = clampSize(finiteOrNull(event.resting?.bidMon));
    const askSize = clampSize(finiteOrNull(event.resting?.askMon));

    const touch = (price: number | null, arm: "bid" | "ask"): void => {
      if (price === null || price <= 0) return;
      const existing = byPrice.get(price);
      const size = arm === "bid" ? bidSize : askSize;
      const isNewer = existing === undefined || event.block > (existing.block ?? -1);
      byPrice.set(price, {
        price,
        bidSize: arm === "bid" ? size : existing?.bidSize ?? 0,
        askSize: arm === "ask" ? size : existing?.askSize ?? 0,
        block: isNewer ? event.block : existing?.block ?? null,
        isLive: isNewer,
        arm,
      });
    };

    touch(bestBid, "bid");
    touch(bestAsk, "ask");

    if (mid !== null && mid > 0) {
      const existing = byPrice.get(mid);
      byPrice.set(mid, {
        price: mid,
        bidSize: existing?.bidSize ?? 0,
        askSize: existing?.askSize ?? 0,
        block: existing?.block ?? event.block,
        isLive: existing?.isLive ?? true,
        arm: "mid",
      });
    }
  }

  return [...byPrice.values()]
    .sort((a, b) => a.price - b.price)
    .slice(0, wanted);
}

/**
 * Maps a resting size onto a drawn scale inside [0.35, 1] so zero, tiny and enormous sizes all
 * stay visible instead of collapsing or overflowing the ladder.
 */
export function levelGeometry(level: DepthLevel, maxSize: number, size?: number): number {
  const armSize = level.arm === "bid" ? level.bidSize : level.arm === "ask" ? level.askSize : 0;
  const raw = size === undefined ? armSize : size;
  const value = isFiniteNumber(raw) ? Math.max(0, raw) : 0;
  if (!isFiniteNumber(maxSize) || maxSize <= 0) return MIN_SCALE;
  const ratio = Math.min(1, value / maxSize);
  return MIN_SCALE + (1 - MIN_SCALE) * ratio;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}