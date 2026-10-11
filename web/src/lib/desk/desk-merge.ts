/**
 * Small pure merge helpers of the desk store: bounded, ordered, immutable. Nothing here mutates its inputs.
 */

import { EMPTY_METRICS } from "./analytics";
import {
  DESK_FRESHNESS_MS,
  type DeskBar,
  type DeskCandle,
  type DeskFeedId,
  type DeskFeedStatus,
  type DeskState,
  type DeskTicker,
  type DeskTrade,
  type DeskWatchRow,
} from "./types";

export const TRADES_CAP = 200;
export const FLOW_CAP = 120;
export const LIQUIDITY_CAP = 90;
export const CANDLES_CAP = 300;

/** The feeds this data layer owns, in display order. The lead appends the backend, wallet and OnchainOS ones. */
export const OWNED_FEED_IDS: readonly DeskFeedId[] = ["okx-public-ws", "okx-business-ws", "okx-public-rest"];

export function idleFeed(id: DeskFeedId): DeskFeedStatus {
  return {
    id,
    state: "idle",
    lastMessageAtMs: null,
    freshnessMs: DESK_FRESHNESS_MS[id],
    reconnects: 0,
    detail: "Aguardando início.",
  };
}

export function emptyWatchRow(instId: string): DeskWatchRow {
  return { instId, ticker: null, spark: [], fundingRate: null };
}

export function initialDeskState(focus: string, bar: DeskBar, watchlist: readonly string[]): DeskState {
  return {
    focus,
    bar,
    instrument: null,
    ticker: null,
    book: null,
    trades: [],
    candles: [],
    derivatives: null,
    metrics: EMPTY_METRICS,
    flow: [],
    liquidity: [],
    watchlist: watchlist.map(emptyWatchRow),
    feeds: OWNED_FEED_IDS.map(idleFeed),
    updatedAtMs: null,
    clockSkewMs: null,
  };
}

/** A ticker replaces the current one unless it is older (same timestamp wins, so REST seeds and WS ticks interleave). */
export function acceptTicker(current: DeskTicker | null, incoming: DeskTicker): DeskTicker | null {
  return current === null || incoming.tsMs >= current.tsMs ? incoming : null;
}

/**
 * Upserts candles by bar time, oldest first, capped to the newest `cap`.
 * A confirmed bar is never overwritten by an unconfirmed one. A REST bar never replaces a bar already held for the same
 * time unless it confirms it, because the live socket may have moved on while the request was in flight.
 */
export function upsertCandles(
  existing: readonly DeskCandle[],
  incoming: readonly DeskCandle[],
  fromRest: boolean,
  cap: number = CANDLES_CAP,
): readonly DeskCandle[] {
  if (incoming.length === 0) return existing;
  const byTs = new Map<number, DeskCandle>();
  for (const candle of existing) byTs.set(candle.tsMs, candle);
  for (const candle of incoming) {
    const held = byTs.get(candle.tsMs);
    if (held !== undefined) {
      if (held.confirmed && !candle.confirmed) continue;
      if (fromRest && !candle.confirmed) continue;
    }
    byTs.set(candle.tsMs, candle);
  }
  const ordered = [...byTs.values()].sort((a, b) => a.tsMs - b.tsMs);
  return ordered.length > cap ? ordered.slice(ordered.length - cap) : ordered;
}

export interface TradeMerge {
  /** Newest first, capped. */
  readonly trades: readonly DeskTrade[];
  /** Trades that were not already held, oldest first. */
  readonly fresh: readonly DeskTrade[];
}

/** Merges trades (any order) into the newest-first buffer, dropping ids already held. */
export function mergeTrades(held: readonly DeskTrade[], incoming: readonly DeskTrade[], cap: number = TRADES_CAP): TradeMerge {
  const seen = new Set(held.map((trade) => trade.id));
  const fresh: DeskTrade[] = [];
  for (const trade of [...incoming].sort((a, b) => a.tsMs - b.tsMs)) {
    if (seen.has(trade.id)) continue;
    seen.add(trade.id);
    fresh.push(trade);
  }
  if (fresh.length === 0) return { trades: held, fresh };
  const merged = [...fresh.slice().reverse(), ...held].sort((a, b) => b.tsMs - a.tsMs);
  return { trades: merged.length > cap ? merged.slice(0, cap) : merged, fresh };
}

export function replaceFeed(feeds: readonly DeskFeedStatus[], status: DeskFeedStatus): readonly DeskFeedStatus[] {
  const index = feeds.findIndex((feed) => feed.id === status.id);
  if (index < 0) return [...feeds, status];
  return [...feeds.slice(0, index), status, ...feeds.slice(index + 1)];
}

export function feedState(feeds: readonly DeskFeedStatus[], id: DeskFeedId): DeskFeedStatus["state"] | null {
  return feeds.find((feed) => feed.id === id)?.state ?? null;
}
