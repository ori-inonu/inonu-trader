/**
 * Model, events and effects of the desk reducer, plus the small helpers every reducer step shares.
 */

import { computeMetrics } from "./analytics";
import type { BookFailure, BookState } from "./book";
import { exchangeNow } from "./clock-skew";
import { initialDeskState } from "./desk-merge";
import { instTypeOf, type FundingUpdate, type MarkPriceUpdate, type OpenInterestUpdate } from "./okx-parse";
import type { OkxSubscriptionArg, OkxWsMessage } from "./okx-ws";
import type {
  DeskBar,
  DeskCandle,
  DeskFeedStatus,
  DeskInstrument,
  DeskState,
  DeskTicker,
} from "./types";

// ---------------------------------------------------------------------------
// Model, events, effects
// ---------------------------------------------------------------------------

export interface BookDiagnostics {
  readonly snapshots: number;
  readonly updates: number;
  readonly books5: number;
  readonly checksumVerified: number;
  readonly checksumMismatches: number;
  readonly sequenceVerified: number;
  readonly sequenceBreaks: number;
  readonly malformed: number;
  readonly resyncs: number;
}

export interface DeskDiagnostics {
  /** Data messages ingested, per channel. */
  readonly messages: Readonly<Record<string, number>>;
  /** Rows that failed strict parsing. */
  readonly rejectedRows: number;
  /** Messages dropped because they belong to another instrument or bar than the focus. */
  readonly ignoredMessages: number;
  readonly book: BookDiagnostics;
}

export interface DeskModel {
  readonly desk: DeskState;
  /** The 400 level book, null before its snapshot and after a failure. */
  readonly fullBook: BookState | null;
  /** The latest books5 snapshot, shown only while there is no healthy full book. */
  readonly top5: BookState | null;
  readonly awaitingSnapshot: boolean;
  /** When the focus subscription began; bounds the rate metrics by what was really observed. */
  readonly focusSinceMs: number | null;
  /** Flow seconds before this instant are never zero filled (the feed was down). */
  readonly flowGapFloorMs: number | null;
  readonly lastSliceMs: number | null;
  readonly diagnostics: DeskDiagnostics;
}

export type DeskEvent =
  | { readonly type: "focus"; readonly focus: string; readonly bar: DeskBar; readonly nowMs: number }
  | { readonly type: "bar"; readonly bar: DeskBar; readonly nowMs: number }
  | { readonly type: "watchlist"; readonly instIds: readonly string[] }
  | { readonly type: "instrument"; readonly instrument: DeskInstrument; readonly nowMs: number }
  /** The perpetual used by the derivatives panel, or null when it does not exist. */
  | { readonly type: "swap"; readonly instId: string | null }
  /** One time REST bootstrap of the perpetual panel; it fills only fields still null, WS pushes stay authoritative. */
  | {
      readonly type: "derivatives-seed";
      readonly instId: string;
      readonly funding?: FundingUpdate;
      readonly mark?: MarkPriceUpdate;
      readonly openInterest?: OpenInterestUpdate;
      readonly nowMs: number;
    }
  | { readonly type: "candles"; readonly instId: string; readonly bar: DeskBar; readonly candles: readonly DeskCandle[]; readonly nowMs: number }
  | { readonly type: "spark"; readonly instId: string; readonly closes: readonly number[] }
  | { readonly type: "ticker"; readonly ticker: DeskTicker; readonly nowMs: number }
  | { readonly type: "message"; readonly message: OkxWsMessage; readonly nowMs: number }
  | { readonly type: "feed"; readonly status: DeskFeedStatus }
  /** OKX clock minus browser clock, null when no trustworthy measurement exists. */
  | { readonly type: "skew"; readonly skewMs: number | null }
  /** The public stream lost continuity (reconnect). */
  | { readonly type: "gap"; readonly nowMs: number }
  | { readonly type: "tick"; readonly nowMs: number };

export interface DeskEffect {
  readonly type: "resubscribe";
  readonly arg: OkxSubscriptionArg;
  readonly reason: BookFailure;
}

export interface DeskReduction {
  readonly model: DeskModel;
  readonly effects: readonly DeskEffect[];
}

export const NO_EFFECTS: readonly DeskEffect[] = [];

const EMPTY_BOOK_DIAGNOSTICS: BookDiagnostics = {
  snapshots: 0,
  updates: 0,
  books5: 0,
  checksumVerified: 0,
  checksumMismatches: 0,
  sequenceVerified: 0,
  sequenceBreaks: 0,
  malformed: 0,
  resyncs: 0,
};

export function createDeskModel(focus: string, bar: DeskBar, watchlist: readonly string[]): DeskModel {
  return {
    desk: initialDeskState(focus, bar, watchlist),
    fullBook: null,
    top5: null,
    awaitingSnapshot: false,
    focusSinceMs: null,
    flowGapFloorMs: null,
    lastSliceMs: null,
    diagnostics: { messages: {}, rejectedRows: 0, ignoredMessages: 0, book: EMPTY_BOOK_DIAGNOSTICS },
  };
}

export function quoteMultiplierOf(focus: string): number | null {
  return instTypeOf(focus) === "SWAP" ? null : 1;
}

/** Local instant moved onto the exchange clock, null while the skew is unknown. */
export function exchangeAt(model: DeskModel, localMs: number): number | null {
  return exchangeNow(model.desk.clockSkewMs, localMs);
}

/** Recomputes the clock dependent metrics. Called at publish time. */
export function withMetrics(model: DeskModel, nowMs: number): DeskModel {
  const { desk } = model;
  const metrics = computeMetrics({
    book: desk.book,
    ticker: desk.ticker,
    trades: desk.trades,
    flow: desk.flow,
    candles: desk.candles,
    bar: desk.bar,
    nowMs,
    exchangeNowMs: exchangeAt(model, nowMs),
    observedSinceMs: model.focusSinceMs,
    quoteMultiplier: quoteMultiplierOf(desk.focus),
  });
  return { ...model, desk: { ...desk, metrics } };
}


export function patchDiagnostics(
  model: DeskModel,
  patch: { channel?: string; rejected?: number; ignored?: number; book?: Partial<BookDiagnostics> },
): DeskDiagnostics {
  const d = model.diagnostics;
  const messages =
    patch.channel === undefined ? d.messages : { ...d.messages, [patch.channel]: (d.messages[patch.channel] ?? 0) + 1 };
  const book = patch.book === undefined ? d.book : { ...d.book };
  if (patch.book !== undefined) {
    const mutable = book as { -readonly [K in keyof BookDiagnostics]: BookDiagnostics[K] };
    for (const key of Object.keys(patch.book) as (keyof BookDiagnostics)[]) mutable[key] += patch.book[key] ?? 0;
  }
  return {
    messages,
    rejectedRows: d.rejectedRows + (patch.rejected ?? 0),
    ignoredMessages: d.ignoredMessages + (patch.ignored ?? 0),
    book,
  };
}

export function ignored(model: DeskModel, channel: string): DeskReduction {
  return { model: { ...model, diagnostics: patchDiagnostics(model, { ignored: 1 }) }, effects: NO_EFFECTS };
}

export function withDesk(model: DeskModel, desk: DeskState, patch: Parameters<typeof patchDiagnostics>[1], effects: readonly DeskEffect[] = NO_EFFECTS): DeskReduction {
  return { model: { ...model, desk, diagnostics: patchDiagnostics(model, patch) }, effects };
}

