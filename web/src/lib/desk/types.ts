/**
 * Contract of the trading desk (Mesa de Operacoes).
 *
 * Everything here describes REAL data read by the browser from the keyless OKX public v5 API
 * (REST https://www.okx.com, WebSocket wss://ws.okx.com/ws/v5/public and /business).
 * No type in this file admits an invented value: a number that is not known is `null`, a feed
 * that is not delivering is `stale` or `failed`, and every channel carries its own provenance.
 *
 * Numbers are for display and analytics only. They are never used as balances or order amounts.
 */

export type DeskFeedId =
  | "okx-public-ws"
  | "okx-business-ws"
  | "okx-public-rest"
  | "jev-backend"
  | "okx-wallet"
  | "onchainos";

/** idle: not started. connecting: socket opening. live: messages inside the freshness window. stale: connected but silent past the window. reconnecting: backing off. failed: gave up or refused. */
export type DeskFeedState = "idle" | "connecting" | "live" | "stale" | "reconnecting" | "failed";

export interface DeskFeedStatus {
  readonly id: DeskFeedId;
  readonly state: DeskFeedState;
  /** Wall clock of the last message that arrived on this feed, null before the first one. */
  readonly lastMessageAtMs: number | null;
  /** Largest silence tolerated before the feed is considered stale. */
  readonly freshnessMs: number;
  readonly reconnects: number;
  /** Short reason in Portuguese when state is not live, null otherwise. */
  readonly detail: string | null;
}

export type DeskInstType = "SPOT" | "SWAP";

export interface DeskInstrument {
  readonly instId: string;
  readonly instType: DeskInstType;
  readonly base: string;
  readonly quote: string;
  /** Price tick as the exchange prints it, e.g. "0.1". Decimals for display are derived from it. */
  readonly tickSz: string;
  readonly lotSz: string;
}

export interface DeskTicker {
  readonly instId: string;
  readonly last: number;
  readonly open24h: number | null;
  readonly high24h: number | null;
  readonly low24h: number | null;
  /** 24h volume in base currency (or contracts for swaps, as OKX reports it). */
  readonly volBase24h: number | null;
  /** 24h volume in quote currency. */
  readonly volQuote24h: number | null;
  readonly bidPx: number | null;
  readonly bidSz: number | null;
  readonly askPx: number | null;
  readonly askSz: number | null;
  /** Exchange timestamp of the tick. */
  readonly tsMs: number;
}

export interface DeskBookLevel {
  readonly px: number;
  readonly sz: number;
  /** Number of resting orders at the level as OKX reports it, 0 when not reported. */
  readonly orders: number;
}

export interface DeskBook {
  readonly instId: string;
  /** Best bid first (descending price). */
  readonly bids: readonly DeskBookLevel[];
  /** Best ask first (ascending price). */
  readonly asks: readonly DeskBookLevel[];
  readonly tsMs: number;
  readonly seqId: number | null;
  /** null when the channel carries no checksum (books5), true or false when validated against OKX's CRC32. */
  readonly checksumOk: boolean | null;
  /**
   * Optional addition (data layer). How the book is kept honest: "checksum" when the CRC32 of OKX is verified on every
   * message, "sequence" when OKX sends checksum 0 (the case on keyless connections) and continuity is verified through
   * seqId and prevSeqId instead, "snapshot" for books5 full snapshots with nothing to verify. Absent means unknown.
   */
  readonly integrity?: "checksum" | "sequence" | "snapshot";
}

export interface DeskTrade {
  readonly id: string;
  readonly px: number;
  readonly sz: number;
  /** Taker side as OKX reports it. */
  readonly side: "buy" | "sell";
  readonly tsMs: number;
}

export interface DeskCandle {
  readonly tsMs: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volBase: number;
  readonly volQuote: number;
  /** false while the bar is still forming. */
  readonly confirmed: boolean;
}

export type DeskBar = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";

export interface DeskDerivatives {
  readonly instId: string;
  /** Funding rate of the current period, as a fraction (0.0001 is 1 bp). */
  readonly fundingRate: number | null;
  readonly nextFundingTimeMs: number | null;
  readonly markPx: number | null;
  readonly indexPx: number | null;
  /** Open interest in contracts. */
  readonly openInterest: number | null;
  /** Open interest in USD notional when OKX reports it. */
  readonly openInterestUsd: number | null;
  readonly tsMs: number | null;
}

/** Metrics computed from the live book, trades and candles. Every field is null when its inputs are missing. */
export interface DeskMetrics {
  readonly midPx: number | null;
  /** Size weighted mid: leans toward the thinner side of the top of book. */
  readonly microPx: number | null;
  readonly spreadBps: number | null;
  /** Share of bid depth over bid plus ask depth inside the window, from 0 (all asks) to 1 (all bids). */
  readonly depthBidShare10bps: number | null;
  readonly depthBidShare50bps: number | null;
  /** Resting quote-currency depth inside the window, per side. */
  readonly bidDepthQuote10bps: number | null;
  readonly askDepthQuote10bps: number | null;
  readonly bidDepthQuote50bps: number | null;
  readonly askDepthQuote50bps: number | null;
  /** Taker flow over the trade window (last 60 s unless the agent documents another). Base units. */
  readonly buyVolBase60s: number | null;
  readonly sellVolBase60s: number | null;
  /** (buy - sell) / (buy + sell) over the window, from -1 to 1. */
  readonly flowImbalance60s: number | null;
  readonly tradesPerSecond60s: number | null;
  /**
   * How many trades the window really holds, as counted (not the rate times sixty): the first seconds of a page, a reconnect or a new instrument show a rate over a few
   * seconds, and a handful of trades says nothing about who is in charge. Absent in a reading made before the field existed.
   */
  readonly tradeCount60s?: number | null;
  /** Cumulative volume delta over the retained trades, base units. */
  readonly cvd: number | null;
  /** Volume weighted average price of the retained trades. */
  readonly vwap: number | null;
  /** Realized daily volatility from log returns of the retained candles, null with fewer than 20 returns. */
  readonly realizedSigmaDaily: number | null;
  /** Percent change against open24h. */
  readonly change24hPct: number | null;
  /**
   * Optional addition (data layer). How far from mid, in bps, the book is known on its thinner side. The books
   * channel holds 400 levels, which for BTC-USDT reaches only about 14 bps: a depth window wider than this reach is
   * reported as null instead of a truncated number. Capped at 10000. null when there is no book.
   */
  readonly bookReachBps?: number | null;
}

export interface DeskFlowBucket {
  /** Start of the bucket. */
  readonly tsMs: number;
  readonly buyBase: number;
  readonly sellBase: number;
  readonly lastPx: number;
  /** Optional addition (data layer). Number of trades in the bucket; 0 for a second without trades. */
  readonly trades?: number;
}

export interface DeskLiquiditySlice {
  readonly tsMs: number;
  /** Quote-currency resting depth per price bin relative to mid, bins ordered from lowest to highest price. */
  readonly bins: readonly number[];
  readonly midPx: number;
  /**
   * Optional additions (data layer). Layout: 60 bins of 2 bps over mid -60 bps to mid +60 bps (bin 0 is the lowest
   * price, bins 0 to 29 are below mid and hold bids, bins 30 to 59 are above mid and hold asks).
   * reachBidBps and reachAskBps are how far from mid, in bps and capped at 60, the book is KNOWN on each side. A bin
   * farther out than the reach holds 0 only because OKX does not publish that depth in the 400 level book, so a
   * renderer should show it as unknown. Absent means the full +/-60 bps is known.
   */
  readonly reachBidBps?: number;
  readonly reachAskBps?: number;
}

export interface DeskWatchRow {
  readonly instId: string;
  readonly ticker: DeskTicker | null;
  /** Last N closes (oldest first) for the sparkline, empty until loaded. */
  readonly spark: readonly number[];
  readonly fundingRate: number | null;
}

/** Everything the desk draws for the focused instrument. */
export interface DeskState {
  readonly focus: string;
  readonly bar: DeskBar;
  readonly instrument: DeskInstrument | null;
  readonly ticker: DeskTicker | null;
  readonly book: DeskBook | null;
  /** Newest first, capped (default 200). */
  readonly trades: readonly DeskTrade[];
  /** Oldest first. */
  readonly candles: readonly DeskCandle[];
  readonly derivatives: DeskDerivatives | null;
  readonly metrics: DeskMetrics;
  /** Per second buckets of taker flow, oldest first, capped (default 120). */
  readonly flow: readonly DeskFlowBucket[];
  /** Book depth snapshots sampled about once a second, oldest first, capped (default 90). */
  readonly liquidity: readonly DeskLiquiditySlice[];
  readonly watchlist: readonly DeskWatchRow[];
  readonly feeds: readonly DeskFeedStatus[];
  /** Wall clock of the most recent state change, for staleness math in the UI. */
  readonly updatedAtMs: number | null;
  /**
   * OKX server clock minus the browser clock, in ms (positive: the browser clock is behind the exchange), measured
   * with the midpoint method against GET /api/v5/public/time. null until measured or when no trustworthy sample
   * exists. Every OKX timestamp in this state (trades, flow buckets, liquidity slices, book, ticker) is EXCHANGE time:
   * compare it with `localNow + clockSkewMs`, never with the bare local clock. Feed freshness
   * (`lastMessageAtMs`, `updatedAtMs`) is LOCAL receipt time and needs no correction.
   */
  readonly clockSkewMs: number | null;
}

export const DESK_DEFAULT_WATCHLIST: readonly string[] = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "OKB-USDT",
  "MON-USDT",
];

export const DESK_FRESHNESS_MS = {
  "okx-public-ws": 5_000,
  "okx-business-ws": 70_000,
  "okx-public-rest": 120_000,
  "jev-backend": 120_000,
  "okx-wallet": 600_000,
  onchainos: 600_000,
} as const satisfies Record<DeskFeedId, number>;
