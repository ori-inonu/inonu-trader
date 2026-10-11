import type { FeedSideFilter, FeedTypeFilter } from "./presentation";

/**
 * The two empty states are different facts and must never be merged.
 * "Aguardando dados do feed" means nothing has arrived yet. "Nenhum evento para estes filtros"
 * means the feed is alive but the chosen filters exclude everything it sent.
 */
export function telemetryEmptyMessage(
  eventCount: number,
  sideFilter: FeedSideFilter,
  typeFilter: FeedTypeFilter,
): string {
  const defaultSelection = sideFilter === "all" && typeFilter === "all";
  if (eventCount === 0 && defaultSelection) return "Aguardando dados do feed";
  return "Nenhum evento para estes filtros";
}

/** Stagger offset per row, capped so a long list never grows a one second tail. */
export function telemetryStaggerDelay(index: number, step = 26, cap = 8): number {
  return Math.min(Math.max(0, index), cap) * step;
}