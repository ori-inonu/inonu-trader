/**
 * Builds the state Jev sees from real, fresh inputs. Missing or stale inputs do not produce a state: they produce the
 * list of reasons, and the caller does not ask the model. Nothing here fills a gap with a default number.
 */

import {
  BOOK_MAX_AGE_MS,
  CANDLES_MAX_AGE_MS,
  FLOW_WINDOW_MS,
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
const unixMs = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const monoMs = (value: unknown): value is number => finite(value) && value >= 0;

function bookFresh(input: TapeInput): boolean {
  const proof = input.book?.proof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || typeof input.feedId !== "string" || input.feedId.length === 0 ||
    proof.feedId !== input.feedId || !unixMs(input.feedEpoch) || proof.feedEpoch !== input.feedEpoch ||
    !Number.isSafeInteger(proof.captureId) || proof.captureId <= 0 || proof.forSpotInstId !== input.instId ||
    proof.requestedInstId !== input.instId || !unixMs(input.wsGeneration) || !unixMs(proof.sourceTsMs) ||
    !unixMs(proof.receivedAtMs) || !monoMs(proof.receivedAtMonoMs) || !monoMs(input.monotonicNowMs)) return false;
  if (proof.source === "rest_book") {
    if (proof.wsGeneration !== null || (proof.reportedInstId !== null && proof.reportedInstId !== input.instId)) return false;
  } else if (proof.source === "ws_books5") {
    if (proof.wsGeneration !== input.wsGeneration || proof.reportedInstId !== input.instId) return false;
  } else return false;
  const cacheAge = input.monotonicNowMs - proof.receivedAtMonoMs;
  if (cacheAge < 0 || cacheAge > BOOK_MAX_AGE_MS) return false;
  // Preserve the common clock_unknown gate rather than label an unknown exchange age as stale.
  if (!finite(input.exchangeNowMs) || input.exchangeNowMs < 0 || input.exchangeNowMs > Number.MAX_SAFE_INTEGER) return true;
  const sourceAge = input.exchangeNowMs - proof.sourceTsMs;
  return sourceAge >= 0 && sourceAge <= BOOK_MAX_AGE_MS;
}

function tickerFresh(input: TapeInput): boolean {
  const proof = input.ticker?.proof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || typeof input.feedId !== "string" || input.feedId.length === 0 ||
    proof.feedId !== input.feedId || !unixMs(input.feedEpoch) || proof.feedEpoch !== input.feedEpoch ||
    !Number.isSafeInteger(proof.captureId) || proof.captureId <= 0 || proof.forSpotInstId !== input.instId ||
    proof.requestedInstId !== input.instId || proof.reportedInstId !== input.instId || !unixMs(input.wsGeneration) ||
    !unixMs(proof.sourceTsMs) || !unixMs(proof.receivedAtMs) || !monoMs(proof.receivedAtMonoMs) || !monoMs(input.monotonicNowMs)) return false;
  if (proof.source === "rest_ticker") {
    if (proof.wsGeneration !== null) return false;
  } else if (proof.source === "ws_tickers") {
    if (proof.wsGeneration !== input.wsGeneration) return false;
  } else return false;
  const cacheAge = input.monotonicNowMs - proof.receivedAtMonoMs;
  if (cacheAge < 0 || cacheAge > TICKER_MAX_AGE_MS) return false;
  // Unknown exchange time is reported by the common clock_unknown gate.
  if (!finite(input.exchangeNowMs) || input.exchangeNowMs < 0 || input.exchangeNowMs > Number.MAX_SAFE_INTEGER) return true;
  const sourceAge = input.exchangeNowMs - proof.sourceTsMs;
  return sourceAge >= 0 && sourceAge <= TICKER_MAX_AGE_MS;
}

function fundingPercent(input: TapeInput): number | null {
  const observation = input.funding;
  if (!observation || !finite(observation.rate) || !Number.isSafeInteger(input.fundingMaxAgeMs) || input.fundingMaxAgeMs <= 0) return null;
  const proof = observation.proof;
  if (!proof || typeof input.feedId !== "string" || input.feedId.length === 0 || proof.feedId !== input.feedId ||
    !unixMs(input.feedEpoch) || proof.feedEpoch !== input.feedEpoch || !Number.isSafeInteger(proof.captureId) || proof.captureId <= 0 ||
    proof.source !== "rest_funding" || proof.wsGeneration !== null || proof.forSpotInstId !== input.instId ||
    proof.requestedInstId !== `${input.instId}-SWAP` || proof.reportedInstId !== `${input.instId}-SWAP` ||
    !unixMs(proof.sourceTsMs) || !unixMs(proof.receivedAtMs) || !monoMs(proof.receivedAtMonoMs) || !monoMs(input.monotonicNowMs) ||
    !finite(input.exchangeNowMs) || input.exchangeNowMs < 0 || input.exchangeNowMs > Number.MAX_SAFE_INTEGER) return null;
  const sourceAge = input.exchangeNowMs - proof.sourceTsMs;
  const cacheAge = input.monotonicNowMs - proof.receivedAtMonoMs;
  const percent = observation.rate * 100;
  return sourceAge >= 0 && sourceAge <= input.fundingMaxAgeMs && cacheAge >= 0 && cacheAge <= input.fundingMaxAgeMs && finite(percent) ? percent : null;
}

function validLevels(levels: readonly TapeLevel[]): TapeLevel[] {
  return levels.filter((level) => positive(level.px) && positive(level.sz));
}

/** The tail of the candle series when it is 31 contiguous, valid one minute bars; null otherwise. */
function contiguousTail(input: TapeInput): TapeCandle[] | null {
  const candles = input.candles;
  if (candles.length < MIN_CANDLES) return null;
  const tail = candles.slice(-MIN_CANDLES);
  for (let i = 0; i < tail.length; i += 1) {
    const candle = tail[i]!;
    if (!positive(candle.close) || !Number.isSafeInteger(candle.tsMs) || candle.tsMs < 0) return null;
    const proof = candle.proof;
    if (!proof || typeof proof !== "object" || Array.isArray(proof) || typeof input.feedId !== "string" || input.feedId.length === 0 ||
      proof.feedId !== input.feedId || !unixMs(input.feedEpoch) || proof.feedEpoch !== input.feedEpoch ||
      !Number.isSafeInteger(proof.captureId) || proof.captureId <= 0 || proof.forSpotInstId !== input.instId ||
      proof.requestedInstId !== input.instId || (proof.reportedInstId !== null && proof.reportedInstId !== input.instId) ||
      proof.source !== "rest_candles_1m" || proof.wsGeneration !== null || !unixMs(input.wsGeneration) ||
      !unixMs(proof.sourceTsMs) || proof.sourceTsMs !== candle.tsMs || !unixMs(proof.receivedAtMs) ||
      !monoMs(proof.receivedAtMonoMs) || !monoMs(input.monotonicNowMs) || proof.receivedAtMonoMs > input.monotonicNowMs) return null;
    if (i > 0 && candle.tsMs - tail[i - 1]!.tsMs !== BAR_MS) return null;
  }
  return tail;
}

function coverageFresh(input: TapeInput): boolean {
  const proof = input.coverage;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) ||
    typeof input.feedId !== "string" || input.feedId.length === 0 || proof.feedId !== input.feedId ||
    !unixMs(input.feedEpoch) || proof.feedEpoch !== input.feedEpoch || proof.instId !== input.instId ||
    !unixMs(input.wsGeneration) || proof.wsGeneration !== input.wsGeneration ||
    proof.source !== "ws_trades" || proof.socketOpen !== true || !monoMs(input.monotonicNowMs) ||
    !monoMs(proof.acknowledgedAtMonoMs) || !monoMs(proof.continuousSinceMonoMs) ||
    !monoMs(proof.observedThroughMonoMs) || proof.observedThroughMonoMs !== input.monotonicNowMs ||
    proof.acknowledgedAtMonoMs > proof.continuousSinceMonoMs ||
    proof.observedThroughMonoMs - proof.continuousSinceMonoMs < FLOW_WINDOW_MS) return false;
  return proof.lostThroughMonoMs === null ||
    (monoMs(proof.lostThroughMonoMs) && proof.observedThroughMonoMs - proof.lostThroughMonoMs > FLOW_WINDOW_MS);
}

function sampleStdDev(values: readonly number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function tradesVerified(input: TapeInput): boolean {
  if (!Array.isArray(input.trades)) return false;
  return input.trades.every((trade) => {
    if (!trade || typeof trade !== "object" || !positive(trade.px) || !positive(trade.sz) ||
      (trade.side !== "buy" && trade.side !== "sell")) return false;
    const proof = trade.proof;
    return !!proof && typeof proof === "object" && !Array.isArray(proof) &&
      proof.feedId === input.feedId && proof.feedEpoch === input.feedEpoch &&
      Number.isSafeInteger(proof.captureId) && proof.captureId > 0 &&
      proof.forSpotInstId === input.instId && proof.requestedInstId === input.instId &&
      proof.reportedInstId === input.instId && proof.source === "ws_trades" &&
      proof.wsGeneration === input.wsGeneration && unixMs(proof.sourceTsMs) &&
      unixMs(proof.receivedAtMs) && proof.receivedAtMs === trade.receivedAtMs &&
      monoMs(proof.receivedAtMonoMs) && proof.receivedAtMonoMs <= input.monotonicNowMs;
  });
}

function flowOf(trades: readonly TapeTrade[], monotonicNowMs: number): TapeState["flow60s"] {
  const inWindow = trades
    .filter((t) => monotonicNowMs - t.proof.receivedAtMonoMs <= FLOW_WINDOW_MS)
    .sort((a, b) => a.proof.receivedAtMonoMs - b.proof.receivedAtMonoMs);
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

export function buildTapeState(input: TapeInput): TapeStateResult {
  const reasons: InsufficientReason[] = [];

  const bids = input.book ? validLevels(input.book.bids) : [];
  const asks = input.book ? validLevels(input.book.asks) : [];
  if (input.book === null || bids.length === 0 || asks.length === 0) reasons.push("book_missing");
  else if (!bookFresh(input)) reasons.push("book_stale");
  else if (bids[0]!.px >= asks[0]!.px) reasons.push("book_crossed");

  if (input.ticker === null || !positive(input.ticker.last)) reasons.push("ticker_missing");
  else if (!tickerFresh(input)) reasons.push("ticker_stale");

  // Candle stamps come from the exchange, so they are aged on the exchange clock. Without a measured offset the age is unknown.
  const tail = contiguousTail(input);
  if (tail === null) reasons.push("candles_short");
  else if (input.exchangeNowMs === null || !Number.isFinite(input.exchangeNowMs) || input.exchangeNowMs < 0 || input.exchangeNowMs > Number.MAX_SAFE_INTEGER) reasons.push("clock_unknown");
  else {
    // A forming bar may be current, but its opening cannot be in the future.
    // Keep the fractional corrected exchange clock; do not round a negative age to zero.
    const ageMs = input.exchangeNowMs - tail[tail.length - 1]!.tsMs;
    if (ageMs < 0 || ageMs > CANDLES_MAX_AGE_MS) reasons.push("candles_stale");
  }

  // Flow is read from the trades channel. Silence from a dead or unsubscribed channel must not look like a quiet market.
  if (!input.tradesLive || !coverageFresh(input) || !tradesVerified(input)) reasons.push("trades_unavailable");

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
      flow60s: flowOf(input.trades, input.monotonicNowMs),
      change24hPct,
      rangePosition24h,
      fundingRatePct: fundingPercent(input),
    },
  };
}
