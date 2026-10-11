/**
 * Pure analytics of the desk: metrics, taker flow buckets, the liquidity layout, VWAP, CVD and realized volatility.
 * Every function returns null when its inputs are missing or cannot support an honest number.
 *
 * Conventions
 * - Depth is quote currency: sum of price times size. It is measured from the book mid, and a window is reported only
 *   when the known book reaches it. The `books` channel holds 400 levels, which for BTC-USDT spans only about 14 bps,
 *   so a 50 bps window there is null (not a truncated figure). `bookReachBps` says how far the book is known.
 * - Taker flow lives in 1 s buckets (`DeskFlowBucket`), fed by every trade, independent of the 200 trade buffer. The
 *   60 s window selects the buckets whose second ends after `now - 60 s`, so its edge has 1 s granularity.
 * - VWAP and CVD run over the retained trades (the newest 200), as the contract states.
 * - Realized sigma is the sample standard deviation of log returns between consecutive CONFIRMED candles exactly one
 *   bar apart (a missing bar is a gap, not a return), scaled by sqrt(bars per day). Below 20 returns it is null.
 * - Liquidity layout: 60 bins of 2 bps over mid -60 bps to mid +60 bps. Bin 0 is the lowest price, bins 0 to 29 hold
 *   bids (below mid) and bins 30 to 59 hold asks (above mid). A level exactly at +60 bps is outside.
 */

import { bookLevelCap } from "./book";
import { BAR_MS } from "./okx-parse";
import type {
  DeskBar,
  DeskBook,
  DeskBookLevel,
  DeskCandle,
  DeskFlowBucket,
  DeskLiquiditySlice,
  DeskMetrics,
  DeskTicker,
  DeskTrade,
} from "./types";

export const LIQUIDITY_BIN_COUNT = 60;
export const LIQUIDITY_BIN_BPS = 2;
export const LIQUIDITY_HALF_WIDTH_BPS = 60;
export const FLOW_BUCKET_MS = 1_000;
export const FLOW_WINDOW_MS = 60_000;
export const MIN_RETURNS_FOR_SIGMA = 20;
export const MAX_REACH_BPS = 10_000;
/** A rate over fewer observed seconds than this is null. */
export const MIN_RATE_WINDOW_MS = 3_000;

const EPSILON_BPS = 1e-9;

export const EMPTY_METRICS: DeskMetrics = {
  midPx: null,
  microPx: null,
  spreadBps: null,
  depthBidShare10bps: null,
  depthBidShare50bps: null,
  bidDepthQuote10bps: null,
  askDepthQuote10bps: null,
  bidDepthQuote50bps: null,
  askDepthQuote50bps: null,
  buyVolBase60s: null,
  sellVolBase60s: null,
  flowImbalance60s: null,
  tradesPerSecond60s: null,
  cvd: null,
  vwap: null,
  realizedSigmaDaily: null,
  change24hPct: null,
  bookReachBps: null,
};

// ---------------------------------------------------------------------------
// Top of book
// ---------------------------------------------------------------------------

export interface TopOfBook {
  readonly bidPx: number;
  readonly bidSz: number | null;
  readonly askPx: number;
  readonly askSz: number | null;
}

/** Best bid and ask from the book, or from the ticker when there is no book. */
export function topOfBook(book: DeskBook | null, ticker: DeskTicker | null): TopOfBook | null {
  const bid = book?.bids[0];
  const ask = book?.asks[0];
  if (bid !== undefined && ask !== undefined) return { bidPx: bid.px, bidSz: bid.sz, askPx: ask.px, askSz: ask.sz };
  if (ticker !== null && ticker.bidPx !== null && ticker.askPx !== null) {
    return { bidPx: ticker.bidPx, bidSz: ticker.bidSz, askPx: ticker.askPx, askSz: ticker.askSz };
  }
  return null;
}

export function midOf(top: TopOfBook): number {
  return (top.bidPx + top.askPx) / 2;
}

/** Size weighted mid: (bid * askSz + ask * bidSz) / (bidSz + askSz). Leans toward the side with less size. */
export function microOf(top: TopOfBook): number | null {
  if (top.bidSz === null || top.askSz === null) return null;
  const total = top.bidSz + top.askSz;
  if (total <= 0) return null;
  return (top.bidPx * top.askSz + top.askPx * top.bidSz) / total;
}

export function spreadBpsOf(top: TopOfBook): number | null {
  const mid = midOf(top);
  const spread = top.askPx - top.bidPx;
  if (mid <= 0 || spread < 0) return null;
  return (spread / mid) * 1e4;
}

// ---------------------------------------------------------------------------
// Depth and the liquidity layout
// ---------------------------------------------------------------------------

/** Distance in bps from mid up to which one side of the book is known: Infinity when the side is complete. */
function sideCoverageBps(side: readonly DeskBookLevel[], mid: number, cap: number): number {
  if (side.length < cap) return Number.POSITIVE_INFINITY;
  const far = side[side.length - 1];
  return far === undefined ? 0 : (Math.abs(far.px - mid) / mid) * 1e4;
}

/** How far from mid, in bps and capped at 10000, the book is known on its thinner side. */
export function bookReachBps(book: DeskBook): number | null {
  const top = topOfBook(book, null);
  if (top === null) return null;
  const mid = midOf(top);
  const cap = bookLevelCap(book);
  const reach = Math.min(sideCoverageBps(book.bids, mid, cap), sideCoverageBps(book.asks, mid, cap));
  return Math.min(MAX_REACH_BPS, reach);
}

export interface WindowDepth {
  readonly bid: number;
  readonly ask: number;
}

/** Resting quote depth (price times size) inside +/- `windowBps` of mid, or null when the known book does not reach it. */
export function depthWithin(book: DeskBook, windowBps: number, quoteMultiplier = 1): WindowDepth | null {
  const top = topOfBook(book, null);
  if (top === null) return null;
  const mid = midOf(top);
  const cap = bookLevelCap(book);
  if (sideCoverageBps(book.bids, mid, cap) + EPSILON_BPS < windowBps) return null;
  if (sideCoverageBps(book.asks, mid, cap) + EPSILON_BPS < windowBps) return null;
  let bid = 0;
  for (const level of book.bids) {
    if ((Math.abs(level.px - mid) / mid) * 1e4 > windowBps + EPSILON_BPS) break;
    bid += level.px * level.sz * quoteMultiplier;
  }
  let ask = 0;
  for (const level of book.asks) {
    if ((Math.abs(level.px - mid) / mid) * 1e4 > windowBps + EPSILON_BPS) break;
    ask += level.px * level.sz * quoteMultiplier;
  }
  return { bid, ask };
}

/** One liquidity snapshot with the layout documented at the top of this file; null without a two sided book. */
export function liquiditySlice(book: DeskBook, tsMs: number, quoteMultiplier: number | null): DeskLiquiditySlice | null {
  if (quoteMultiplier === null) return null;
  const top = topOfBook(book, null);
  if (top === null) return null;
  const mid = midOf(top);
  const bins = new Array<number>(LIQUIDITY_BIN_COUNT).fill(0);
  const place = (level: DeskBookLevel): void => {
    const offsetBps = ((level.px - mid) / mid) * 1e4;
    const index = Math.floor((offsetBps + LIQUIDITY_HALF_WIDTH_BPS) / LIQUIDITY_BIN_BPS);
    if (index >= 0 && index < LIQUIDITY_BIN_COUNT) bins[index] = (bins[index] ?? 0) + level.px * level.sz * quoteMultiplier;
  };
  for (const level of book.bids) place(level);
  for (const level of book.asks) place(level);
  const cap = bookLevelCap(book);
  return {
    tsMs,
    bins,
    midPx: mid,
    reachBidBps: Math.min(LIQUIDITY_HALF_WIDTH_BPS, sideCoverageBps(book.bids, mid, cap)),
    reachAskBps: Math.min(LIQUIDITY_HALF_WIDTH_BPS, sideCoverageBps(book.asks, mid, cap)),
  };
}

// ---------------------------------------------------------------------------
// Trades and taker flow
// ---------------------------------------------------------------------------

export function vwapOf(trades: readonly DeskTrade[]): number | null {
  let notional = 0;
  let size = 0;
  for (const trade of trades) {
    notional += trade.px * trade.sz;
    size += trade.sz;
  }
  return size > 0 ? notional / size : null;
}

export function cvdOf(trades: readonly DeskTrade[]): number | null {
  if (trades.length === 0) return null;
  let delta = 0;
  for (const trade of trades) delta += trade.side === "buy" ? trade.sz : -trade.sz;
  return delta;
}

function bucketStart(tsMs: number): number {
  return Math.floor(tsMs / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
}

function zeroBuckets(fromMs: number, toMs: number, lastPx: number, limit: number): DeskFlowBucket[] {
  const out: DeskFlowBucket[] = [];
  const first = Math.max(fromMs, toMs - (limit - 1) * FLOW_BUCKET_MS);
  for (let ts = first; ts <= toMs; ts += FLOW_BUCKET_MS) out.push({ tsMs: ts, buyBase: 0, sellBase: 0, lastPx, trades: 0 });
  return out;
}

/**
 * Adds a trade to the 1 s buckets (oldest first). Seconds without trades between the last bucket and this trade are
 * filled with real zero buckets, but never earlier than `gapFloorMs` (the moment the feed resumed after an outage, so
 * an outage is not painted as a quiet market). A late trade older than the newest bucket is added to its own bucket
 * when that bucket is still retained and ignored otherwise.
 */
export function addTradeToFlow(
  buckets: readonly DeskFlowBucket[],
  trade: DeskTrade,
  cap: number,
  gapFloorMs: number | null,
): readonly DeskFlowBucket[] {
  const ts = bucketStart(trade.tsMs);
  const delta = (b: DeskFlowBucket | undefined): DeskFlowBucket => ({
    tsMs: ts,
    buyBase: (b?.buyBase ?? 0) + (trade.side === "buy" ? trade.sz : 0),
    sellBase: (b?.sellBase ?? 0) + (trade.side === "sell" ? trade.sz : 0),
    lastPx: trade.px,
    trades: (b?.trades ?? 0) + 1,
  });
  const last = buckets[buckets.length - 1];
  if (last === undefined) return [delta(undefined)];
  if (ts === last.tsMs) return [...buckets.slice(0, -1), delta(last)];
  if (ts < last.tsMs) {
    const index = buckets.findIndex((b) => b.tsMs === ts);
    if (index < 0) return buckets;
    const existing = buckets[index];
    const merged: DeskFlowBucket = { ...delta(existing), lastPx: existing?.lastPx ?? trade.px };
    return [...buckets.slice(0, index), merged, ...buckets.slice(index + 1)];
  }
  const fillFrom = Math.max(last.tsMs + FLOW_BUCKET_MS, gapFloorMs === null ? 0 : bucketStart(gapFloorMs));
  const filler = fillFrom <= ts - FLOW_BUCKET_MS ? zeroBuckets(fillFrom, ts - FLOW_BUCKET_MS, last.lastPx, cap) : [];
  const next = [...buckets, ...filler, delta(undefined)];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Extends the buckets with zero seconds up to the second of `nowMs` while the feed is live. No bucket, no fill. */
export function fillFlowTo(
  buckets: readonly DeskFlowBucket[],
  nowMs: number,
  cap: number,
  gapFloorMs: number | null,
): readonly DeskFlowBucket[] {
  const last = buckets[buckets.length - 1];
  if (last === undefined) return buckets;
  const target = bucketStart(nowMs);
  const from = Math.max(last.tsMs + FLOW_BUCKET_MS, gapFloorMs === null ? 0 : bucketStart(gapFloorMs));
  if (from > target) return buckets;
  const next = [...buckets, ...zeroBuckets(from, target, last.lastPx, cap)];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export interface FlowWindow {
  readonly buy: number;
  readonly sell: number;
  readonly trades: number;
}

/**
 * Sums the buckets whose second ends after `nowMs - windowMs`. `nowMs` is EXCHANGE time (local time plus the clock
 * skew): bucket times come from OKX. There is no upper bound, a stamp the exchange issued cannot be in the future, and
 * a skew error of a second or so must not drop the newest bucket. Null without any bucket.
 */
export function flowWindow(buckets: readonly DeskFlowBucket[], nowMs: number, windowMs = FLOW_WINDOW_MS): FlowWindow | null {
  if (buckets.length === 0) return null;
  let buy = 0;
  let sell = 0;
  let trades = 0;
  for (const bucket of buckets) {
    if (bucket.tsMs + FLOW_BUCKET_MS <= nowMs - windowMs) continue;
    buy += bucket.buyBase;
    sell += bucket.sellBase;
    trades += bucket.trades ?? 0;
  }
  return { buy, sell, trades };
}

// ---------------------------------------------------------------------------
// Volatility
// ---------------------------------------------------------------------------

export function realizedSigmaDaily(candles: readonly DeskCandle[], bar: DeskBar): number | null {
  const barMs = BAR_MS[bar];
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const previous = candles[i - 1];
    const current = candles[i];
    if (previous === undefined || current === undefined) continue;
    if (!previous.confirmed || !current.confirmed || current.tsMs - previous.tsMs !== barMs) continue;
    returns.push(Math.log(current.close / previous.close));
  }
  if (returns.length < MIN_RETURNS_FOR_SIGMA) return null;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(BAR_MS["1D"] / barMs);
}

// ---------------------------------------------------------------------------
// Everything together
// ---------------------------------------------------------------------------

export interface MetricsInput {
  readonly book: DeskBook | null;
  readonly ticker: DeskTicker | null;
  /** Newest first. */
  readonly trades: readonly DeskTrade[];
  /** Oldest first. */
  readonly flow: readonly DeskFlowBucket[];
  /** Oldest first. */
  readonly candles: readonly DeskCandle[];
  readonly bar: DeskBar;
  /** Local wall clock. */
  readonly nowMs: number;
  /** Local time moved onto the OKX clock (local plus skew). null while the skew is unknown: time windows are then null. */
  readonly exchangeNowMs: number | null;
  /** LOCAL time when the current instrument subscription began, to bound rates by what was actually observed. */
  readonly observedSinceMs: number | null;
  /** Quote value of one size unit of the book: 1 for spot, null when unknown (a swap, whose size is in contracts). */
  readonly quoteMultiplier: number | null;
}

function share(bid: number, ask: number): number | null {
  const total = bid + ask;
  return total > 0 ? bid / total : null;
}

export function computeMetrics(input: MetricsInput): DeskMetrics {
  const top = topOfBook(input.book, input.ticker);
  const unit = input.quoteMultiplier;
  const d10 = input.book ? depthWithin(input.book, 10, 1) : null;
  const d50 = input.book ? depthWithin(input.book, 50, 1) : null;
  const scale = (v: number | undefined): number | null => (v === undefined || unit === null ? null : v * unit);
  const window = input.exchangeNowMs === null ? null : flowWindow(input.flow, input.exchangeNowMs);
  const observedMs =
    input.observedSinceMs === null ? null : Math.min(FLOW_WINDOW_MS, input.nowMs - input.observedSinceMs);
  const imbalanceTotal = window === null ? 0 : window.buy + window.sell;
  const ticker = input.ticker;
  return {
    midPx: top === null ? null : midOf(top),
    microPx: top === null ? null : microOf(top),
    spreadBps: top === null ? null : spreadBpsOf(top),
    depthBidShare10bps: d10 === null ? null : share(d10.bid, d10.ask),
    depthBidShare50bps: d50 === null ? null : share(d50.bid, d50.ask),
    bidDepthQuote10bps: scale(d10?.bid),
    askDepthQuote10bps: scale(d10?.ask),
    bidDepthQuote50bps: scale(d50?.bid),
    askDepthQuote50bps: scale(d50?.ask),
    buyVolBase60s: window === null ? null : window.buy,
    sellVolBase60s: window === null ? null : window.sell,
    flowImbalance60s: window === null || imbalanceTotal <= 0 ? null : (window.buy - window.sell) / imbalanceTotal,
    tradesPerSecond60s:
      window === null || observedMs === null || observedMs < MIN_RATE_WINDOW_MS ? null : window.trades / (observedMs / 1000),
    cvd: cvdOf(input.trades),
    vwap: vwapOf(input.trades),
    realizedSigmaDaily: realizedSigmaDaily(input.candles, input.bar),
    change24hPct:
      ticker !== null && ticker.open24h !== null && ticker.open24h > 0 ? (ticker.last / ticker.open24h - 1) * 100 : null,
    bookReachBps: input.book === null ? null : bookReachBps(input.book),
  };
}
