/**
 * Builds the state Jev sees from real, fresh inputs. Missing or stale inputs do not produce a state: they produce the
 * list of reasons, and the caller does not ask the model. Nothing here fills a gap with a default number.
 */

import {
  BOOK_MAX_AGE_MS,
  CANDLES_MAX_AGE_MS,
  FLOW_WINDOW_MS,
  FUTURE_TOLERANCE_MS,
  HORIZON_MINUTES,
  MIN_CANDLES,
  TICKER_MAX_AGE_MS,
  type InsufficientReason,
  type TapeCandle,
  type TapeInput,
  type TapeLevel,
  type TapeState,
  type TapeTrade,
} from "./types";

export type TapeStateResult = { readonly ok: true; readonly state: TapeState } | { readonly ok: false; readonly reasons: readonly InsufficientReason[] };

const BAR_MS = 60_000;
const VOL_RETURNS = 30;
const BOOK_DEPTH_LEVELS = 5;

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function validLevels(levels: readonly TapeLevel[]): TapeLevel[] {
  return levels.filter((level) => positive(level.px) && positive(level.sz));
}

/** The tail of the candle series when it is 31 contiguous, valid one minute bars; null otherwise. */
function contiguousTail(candles: readonly TapeCandle[]): TapeCandle[] | null {
  if (candles.length < MIN_CANDLES) return null;
  const tail = candles.slice(-MIN_CANDLES);
  for (let i = 0; i < tail.length; i += 1) {
    const candle = tail[i]!;
    if (!positive(candle.close) || !finite(candle.tsMs)) return null;
    if (i > 0 && candle.tsMs - tail[i - 1]!.tsMs !== BAR_MS) return null;
  }
  return tail;
}

function sampleStdDev(values: readonly number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function flowOf(trades: readonly TapeTrade[], nowMs: number): TapeState["flow60s"] {
  const inWindow = trades
    .filter((t) => positive(t.px) && positive(t.sz) && finite(t.receivedAtMs) && nowMs - t.receivedAtMs <= FLOW_WINDOW_MS && t.receivedAtMs <= nowMs)
    .sort((a, b) => a.receivedAtMs - b.receivedAtMs);
  let buyBase = 0;
  let sellBase = 0;
  let notional = 0;
  for (const t of inWindow) {
    if (t.side === "buy") buyBase += t.sz;
    else sellBase += t.sz;
    notional += t.px * t.sz;
  }
  const total = buyBase + sellBase;
  const last = inWindow[inWindow.length - 1] ?? null;
  return {
    count: inWindow.length,
    buyBase,
    sellBase,
    imbalance: total > 0 ? (buyBase - sellBase) / total : null,
    cvdBase: buyBase - sellBase,
    vwap: total > 0 ? notional / total : null,
    lastPx: last ? last.px : null,
    lastSide: last ? last.side : null,
  };
}

/** An age is acceptable when it is not older than the limit and not meaningfully in the future of the clock it is read on. */
const fresh = (ageMs: number, maxMs: number) => ageMs <= maxMs && ageMs >= -FUTURE_TOLERANCE_MS;

export function buildTapeState(input: TapeInput): TapeStateResult {
  const reasons: InsufficientReason[] = [];

  const bids = input.book ? validLevels(input.book.bids) : [];
  const asks = input.book ? validLevels(input.book.asks) : [];
  if (input.book === null || bids.length === 0 || asks.length === 0) reasons.push("book_missing");
  else if (!fresh(input.nowMs - input.book.receivedAtMs, BOOK_MAX_AGE_MS)) reasons.push("book_stale");
  else if (bids[0]!.px >= asks[0]!.px) reasons.push("book_crossed");

  if (input.ticker === null || !positive(input.ticker.last)) reasons.push("ticker_missing");
  else if (!fresh(input.nowMs - input.ticker.receivedAtMs, TICKER_MAX_AGE_MS)) reasons.push("ticker_stale");

  // Candle stamps come from the exchange, so they are aged on the exchange clock. Without a measured offset the age is unknown.
  const tail = contiguousTail(input.candles);
  if (tail === null) reasons.push("candles_short");
  else if (input.exchangeNowMs === null || !Number.isFinite(input.exchangeNowMs)) reasons.push("clock_unknown");
  else if (!fresh(input.exchangeNowMs - tail[tail.length - 1]!.tsMs, CANDLES_MAX_AGE_MS)) reasons.push("candles_stale");

  // Flow is read from the trades channel. Silence from a dead or unsubscribed channel must not look like a quiet market.
  if (!input.tradesLive) reasons.push("trades_unavailable");

  if (reasons.length > 0 || input.book === null || input.ticker === null || tail === null) return { ok: false, reasons };

  const bestBid = bids[0]!.px;
  const bestAsk = asks[0]!.px;
  const mid = (bestBid + bestAsk) / 2;
  const bidQuote = bids.slice(0, BOOK_DEPTH_LEVELS).reduce((sum, l) => sum + l.px * l.sz, 0);
  const askQuote = asks.slice(0, BOOK_DEPTH_LEVELS).reduce((sum, l) => sum + l.px * l.sz, 0);

  const closes = tail.map((c) => c.close);
  const last = closes[closes.length - 1]!;
  const returnBps = (bars: number) => (last / closes[closes.length - 1 - bars]! - 1) * 10_000;
  const logReturns: number[] = [];
  for (let i = closes.length - VOL_RETURNS; i < closes.length; i += 1) logReturns.push(Math.log(closes[i]! / closes[i - 1]!));

  const { open24h, high24h, low24h } = input.ticker;
  const change24hPct = positive(open24h) ? ((input.ticker.last - open24h) / open24h) * 100 : null;
  const rangePosition24h = positive(high24h) && positive(low24h) && high24h > low24h ? (input.ticker.last - low24h) / (high24h - low24h) : null;

  return {
    ok: true,
    state: {
      instId: input.instId,
      horizonMinutes: HORIZON_MINUTES,
      mid,
      spreadBps: ((bestAsk - bestBid) / mid) * 10_000,
      bookImbalanceTop5: (bidQuote - askQuote) / (bidQuote + askQuote),
      depthQuoteTop5: { bid: bidQuote, ask: askQuote },
      returnsBps: { m1: returnBps(1), m5: returnBps(5), m15: returnBps(15), m30: returnBps(30) },
      volBpsPerMinute: sampleStdDev(logReturns) * 10_000,
      flow60s: flowOf(input.trades, input.nowMs),
      change24hPct,
      rangePosition24h,
      fundingRatePct: finite(input.fundingRate) ? input.fundingRate * 100 : null,
    },
  };
}
