/**
 * Ingestion of OKX channel messages into the desk model. Every function is pure: it returns a new model (or the same
 * reference through `ignored` accounting) and never mutates its input.
 */

import { addTradeToFlow } from "./analytics";
import { applyBooks5Message, applyBooksMessage } from "./book";
import {
  CANDLES_CAP,
  FLOW_CAP,
  TRADES_CAP,
  acceptTicker,
  mergeTrades,
  upsertCandles,
} from "./desk-merge";
import {
  NO_EFFECTS,
  exchangeAt,
  ignored,
  patchDiagnostics,
  withDesk,
  type BookDiagnostics,
  type DeskModel,
  type DeskReduction,
} from "./desk-model";
import {
  barOfChannel,
  indexInstIdFor,
  instTypeOf,
  parseCandleRow,
  parseFundingRow,
  parseIndexTickerRow,
  parseMarkPriceRow,
  parseOpenInterestRow,
  parseTicker,
  parseTradeRow,
  swapInstIdFor,
} from "./okx-parse";
import type { FundingUpdate, MarkPriceUpdate, OpenInterestUpdate } from "./okx-parse";
import type { OkxWsMessage } from "./okx-ws";
import type { DeskCandle, DeskDerivatives, DeskState, DeskTicker, DeskWatchRow } from "./types";

export function applyTicker(desk: DeskState, ticker: DeskTicker): DeskState {
  let next = desk;
  if (ticker.instId === desk.focus) {
    const accepted = acceptTicker(desk.ticker, ticker);
    if (accepted !== null) next = { ...next, ticker: accepted };
  }
  if (next.watchlist.some((row) => row.instId === ticker.instId)) {
    const rows = next.watchlist.map((row): DeskWatchRow => {
      if (row.instId !== ticker.instId) return row;
      return { ...row, ticker: acceptTicker(row.ticker, ticker) ?? row.ticker };
    });
    next = { ...next, watchlist: rows };
  }
  return next;
}

function ingestTickers(model: DeskModel, message: OkxWsMessage, nowMs: number): DeskReduction {
  const { arg, data } = message;
  const { desk } = model;
  if (arg.instId !== desk.focus && !desk.watchlist.some((row) => row.instId === arg.instId)) return ignored(model, arg.channel);
  let next = desk;
  let rejected = 0;
  for (const row of data) {
    const ticker = parseTicker(row);
    if (ticker === null || ticker.instId !== arg.instId) rejected += 1;
    else next = applyTicker(next, ticker);
  }
  return withDesk(model, { ...next, updatedAtMs: nowMs }, { channel: arg.channel, rejected });
}

function ingestTrades(model: DeskModel, message: OkxWsMessage, nowMs: number): DeskReduction {
  const { arg, data } = message;
  const { desk } = model;
  if (arg.instId !== desk.focus) return ignored(model, arg.channel);
  const parsed = [];
  let rejected = 0;
  for (const row of data) {
    const trade = parseTradeRow(row);
    if (trade === null || trade.instId !== desk.focus) rejected += 1;
    else parsed.push({ id: trade.id, px: trade.px, sz: trade.sz, side: trade.side, tsMs: trade.tsMs });
  }
  const merge = mergeTrades(desk.trades, parsed, TRADES_CAP);
  if (merge.fresh.length === 0) return withDesk(model, desk, { channel: arg.channel, rejected });
  let flow = desk.flow;
  const gapFloor = model.flowGapFloorMs === null ? null : exchangeAt(model, model.flowGapFloorMs);
  for (const trade of merge.fresh) flow = addTradeToFlow(flow, trade, FLOW_CAP, gapFloor);
  return withDesk(model, { ...desk, trades: merge.trades, flow, updatedAtMs: nowMs }, { channel: arg.channel, rejected });
}

function ingestCandles(model: DeskModel, message: OkxWsMessage, nowMs: number): DeskReduction {
  const { arg, data } = message;
  const { desk } = model;
  if (arg.instId !== desk.focus || barOfChannel(arg.channel) !== desk.bar) return ignored(model, arg.channel);
  const incoming: DeskCandle[] = [];
  let rejected = 0;
  for (const row of data) {
    const candle = parseCandleRow(row, instTypeOf(desk.focus));
    if (candle === null) rejected += 1;
    else incoming.push(candle);
  }
  const candles = upsertCandles(desk.candles, incoming, false, CANDLES_CAP);
  return withDesk(model, { ...desk, candles, updatedAtMs: nowMs }, { channel: arg.channel, rejected });
}

function ingestBooks(model: DeskModel, message: OkxWsMessage, nowMs: number): DeskReduction {
  const { arg, action, data } = message;
  const { desk } = model;
  if (arg.instId !== desk.focus) return ignored(model, arg.channel);
  const row = data[0];

  if (arg.channel === "books5") {
    const step = applyBooks5Message(desk.focus, row);
    if (!step.ok) return withDesk(model, desk, { channel: arg.channel, rejected: 1 });
    const next: DeskModel = { ...model, top5: step.book };
    const book = model.fullBook ?? step.book;
    return withDesk(next, { ...desk, book, updatedAtMs: nowMs }, { channel: arg.channel, book: { books5: 1 } });
  }

  if (action === null) return withDesk(model, desk, { channel: arg.channel, rejected: 1 });
  if (action === "update" && model.awaitingSnapshot) {
    return { model: { ...model, diagnostics: patchDiagnostics(model, { ignored: 1 }) }, effects: NO_EFFECTS };
  }
  const step = applyBooksMessage(action === "snapshot" ? null : model.fullBook, desk.focus, action, row);
  if (step.ok) {
    const book: Partial<BookDiagnostics> = {
      ...(action === "snapshot" ? { snapshots: 1 } : { updates: 1 }),
      ...(step.verified === "checksum" ? { checksumVerified: 1 } : {}),
      ...(step.verified === "sequence" ? { sequenceVerified: 1 } : {}),
    };
    const next: DeskModel = { ...model, fullBook: step.book, awaitingSnapshot: false };
    return withDesk(next, { ...desk, book: step.book, updatedAtMs: nowMs }, { channel: arg.channel, book });
  }
  const failure: Partial<BookDiagnostics> = {
    resyncs: 1,
    ...(step.reason === "checksum" ? { checksumMismatches: 1 } : {}),
    ...(step.reason === "sequence" ? { sequenceBreaks: 1 } : {}),
    ...(step.reason === "malformed" ? { malformed: 1 } : {}),
  };
  const shown = step.reason === "checksum" ? (step.suspect ?? null) : (model.top5 ?? null);
  const next: DeskModel = { ...model, fullBook: null, awaitingSnapshot: true };
  return withDesk(next, { ...desk, book: shown, updatedAtMs: nowMs }, { channel: arg.channel, book: failure }, [
    { type: "resubscribe", arg: { channel: arg.channel, instId: arg.instId }, reason: step.reason },
  ]);
}

type DerivativesPatch = {
  -readonly [K in "fundingRate" | "nextFundingTimeMs" | "markPx" | "indexPx" | "openInterest" | "openInterestUsd"]?: DeskDerivatives[K];
};

export function mergeDerivatives(
  current: DeskDerivatives,
  patch: DerivativesPatch,
  tsMs: number | null,
): DeskDerivatives {
  const next = { ...current };
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    const value = patch[key];
    if (value !== undefined && value !== null) (next as Record<string, unknown>)[key] = value;
  }
  const newest = Math.max(current.tsMs ?? 0, tsMs ?? 0);
  return { ...next, tsMs: newest > 0 ? newest : current.tsMs };
}

/**
 * Applies the REST bootstrap of the perpetual panel. Only fields that are still null are filled, so a value a socket
 * push already delivered is never replaced by an older REST reading. Exchange timestamps feed `tsMs`.
 */
export function applyDerivativesSeed(
  model: DeskModel,
  seed: {
    readonly instId: string;
    readonly funding?: FundingUpdate;
    readonly mark?: MarkPriceUpdate;
    readonly openInterest?: OpenInterestUpdate;
    readonly nowMs: number;
  },
): DeskReduction {
  const current = model.desk.derivatives;
  if (current === null || current.instId !== seed.instId) return { model, effects: NO_EFFECTS };
  const patch: DerivativesPatch = {};
  let tsMs: number | null = null;
  const newest = (value: number | null): void => {
    if (value !== null && (tsMs === null || value > tsMs)) tsMs = value;
  };
  if (seed.funding !== undefined && seed.funding.instId === seed.instId) {
    if (current.fundingRate === null && seed.funding.fundingRate !== null) patch.fundingRate = seed.funding.fundingRate;
    if (current.nextFundingTimeMs === null && seed.funding.nextFundingTimeMs !== null) patch.nextFundingTimeMs = seed.funding.nextFundingTimeMs;
    newest(seed.funding.tsMs);
  }
  if (seed.mark !== undefined && seed.mark.instId === seed.instId) {
    if (current.markPx === null && seed.mark.markPx !== null) patch.markPx = seed.mark.markPx;
    newest(seed.mark.tsMs);
  }
  if (seed.openInterest !== undefined && seed.openInterest.instId === seed.instId) {
    if (current.openInterest === null && seed.openInterest.openInterest !== null) patch.openInterest = seed.openInterest.openInterest;
    if (current.openInterestUsd === null && seed.openInterest.openInterestUsd !== null) patch.openInterestUsd = seed.openInterest.openInterestUsd;
    newest(seed.openInterest.tsMs);
  }
  if (Object.keys(patch).length === 0) return { model, effects: NO_EFFECTS };
  const derivatives = mergeDerivatives(current, patch, tsMs);
  return { model: { ...model, desk: { ...model.desk, derivatives, updatedAtMs: seed.nowMs } }, effects: NO_EFFECTS };
}

function ingestDerivatives(model: DeskModel, message: OkxWsMessage, nowMs: number): DeskReduction {
  const { arg, data } = message;
  let desk = model.desk;
  let rejected = 0;
  let touched = false;
  const swap = desk.derivatives?.instId ?? null;
  for (const row of data) {
    if (arg.channel === "funding-rate") {
      const update = parseFundingRow(row);
      if (update === null || update.instId !== arg.instId) { rejected += 1; continue; }
      if (update.fundingRate !== null && desk.watchlist.some((r) => swapInstIdFor(r.instId) === update.instId)) {
        const rate = update.fundingRate;
        desk = { ...desk, watchlist: desk.watchlist.map((r) => (swapInstIdFor(r.instId) === update.instId ? { ...r, fundingRate: rate } : r)) };
        touched = true;
      }
      if (desk.derivatives !== null && update.instId === swap) {
        desk = { ...desk, derivatives: mergeDerivatives(desk.derivatives, { fundingRate: update.fundingRate, nextFundingTimeMs: update.nextFundingTimeMs }, update.tsMs) };
        touched = true;
      }
    } else if (arg.channel === "mark-price") {
      const update = parseMarkPriceRow(row);
      if (update === null || update.instId !== arg.instId) { rejected += 1; continue; }
      if (desk.derivatives !== null && update.instId === swap) {
        desk = { ...desk, derivatives: mergeDerivatives(desk.derivatives, { markPx: update.markPx }, update.tsMs) };
        touched = true;
      }
    } else if (arg.channel === "open-interest") {
      const update = parseOpenInterestRow(row);
      if (update === null || update.instId !== arg.instId) { rejected += 1; continue; }
      if (desk.derivatives !== null && update.instId === swap) {
        desk = { ...desk, derivatives: mergeDerivatives(desk.derivatives, { openInterest: update.openInterest, openInterestUsd: update.openInterestUsd }, update.tsMs) };
        touched = true;
      }
    } else {
      const update = parseIndexTickerRow(row);
      if (update === null || update.instId !== arg.instId) { rejected += 1; continue; }
      if (desk.derivatives !== null && update.instId === indexInstIdFor(desk.focus)) {
        desk = { ...desk, derivatives: mergeDerivatives(desk.derivatives, { indexPx: update.indexPx }, update.tsMs) };
        touched = true;
      }
    }
  }
  if (!touched && rejected === 0) return ignored(model, arg.channel);
  return withDesk(model, touched ? { ...desk, updatedAtMs: nowMs } : desk, { channel: arg.channel, rejected });
}

export function ingest(model: DeskModel, message: OkxWsMessage, nowMs: number): DeskReduction {
  switch (message.arg.channel) {
    case "tickers":
      return ingestTickers(model, message, nowMs);
    case "trades":
      return ingestTrades(model, message, nowMs);
    case "books":
    case "books5":
      return ingestBooks(model, message, nowMs);
    case "funding-rate":
    case "mark-price":
    case "open-interest":
    case "index-tickers":
      return ingestDerivatives(model, message, nowMs);
    default:
      return barOfChannel(message.arg.channel) === null ? ignored(model, message.arg.channel) : ingestCandles(model, message, nowMs);
  }
}

