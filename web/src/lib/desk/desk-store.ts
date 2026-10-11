/**
 * State machine of the desk: a pure reducer that merges every OKX channel message and REST result into `DeskState`
 * with capped buffers, and a small store that publishes the result to subscribers throttled to about 10 Hz.
 *
 * - `reduceDesk(model, event)` never mutates its input; an ignored event returns the SAME model reference.
 * - Messages for another instrument or bar than the focus (late frames after a switch) are counted and dropped.
 * - The reducer cannot resubscribe, so it returns effects; the controller turns `resubscribe` into a socket call.
 * - Metrics depend on the clock (60 s windows), so they are recomputed at publish time by `withMetrics`.
 * - Honesty: every parsed row passes the strict parsers; a row that fails is counted in `rejectedRows`, never defaulted.
 * - Time: exchange stamps (trades, buckets, slices) are compared on the exchange clock (local plus `clockSkewMs`).
 */

import { fillFlowTo, liquiditySlice } from "./analytics";
import { CANDLES_CAP, FLOW_CAP, LIQUIDITY_CAP, feedState, initialDeskState, replaceFeed, upsertCandles } from "./desk-merge";
import { applyDerivativesSeed, applyTicker, ingest } from "./desk-ingest";
import {
  NO_EFFECTS,
  createDeskModel,
  exchangeAt,
  ignored,
  quoteMultiplierOf,
  withMetrics,
  type DeskDiagnostics,
  type DeskEffect,
  type DeskEvent,
  type DeskModel,
  type DeskReduction,
} from "./desk-model";
import { systemNow, systemTimers, type Timers } from "./runtime";
import type { DeskBar, DeskDerivatives, DeskState } from "./types";

export {
  createDeskModel,
  withMetrics,
  type BookDiagnostics,
  type DeskDiagnostics,
  type DeskEffect,
  type DeskEvent,
  type DeskModel,
  type DeskReduction,
} from "./desk-model";

const SLICE_EVERY_MS = 900;

function tick(model: DeskModel, nowMs: number): DeskReduction {
  const { desk } = model;
  if (feedState(desk.feeds, "okx-public-ws") !== "live") {
    // While the public feed is not live, a quiet flow is not a quiet market: never fill across the outage.
    const protectsFlow = desk.flow.length > 0 && model.flowGapFloorMs !== nowMs;
    return { model: protectsFlow ? { ...model, flowGapFloorMs: nowMs } : model, effects: NO_EFFECTS };
  }
  // Flow buckets and liquidity slices are stamped in exchange time; without a measured skew they wait.
  const exchangeMs = exchangeAt(model, nowMs);
  if (exchangeMs === null) return { model, effects: NO_EFFECTS };
  const gapFloor = model.flowGapFloorMs === null ? null : exchangeAt(model, model.flowGapFloorMs);
  const flow = fillFlowTo(desk.flow, exchangeMs, FLOW_CAP, gapFloor);
  let liquidity = desk.liquidity;
  let lastSliceMs = model.lastSliceMs;
  const book = desk.book;
  if (book !== null && book.integrity !== "snapshot" && (lastSliceMs === null || nowMs - lastSliceMs >= SLICE_EVERY_MS)) {
    const slice = liquiditySlice(book, exchangeMs, quoteMultiplierOf(desk.focus));
    if (slice !== null) {
      liquidity = [...liquidity, slice].slice(-LIQUIDITY_CAP);
      lastSliceMs = nowMs;
    }
  }
  if (flow === desk.flow && liquidity === desk.liquidity) return { model, effects: NO_EFFECTS };
  return { model: { ...model, desk: { ...desk, flow, liquidity }, lastSliceMs }, effects: NO_EFFECTS };
}

export function reduceDesk(model: DeskModel, event: DeskEvent): DeskReduction {
  const { desk } = model;
  switch (event.type) {
    case "focus": {
      const ticker = desk.watchlist.find((row) => row.instId === event.focus)?.ticker ?? null;
      const fresh = initialDeskState(event.focus, event.bar, []);
      const next: DeskModel = {
        ...model,
        desk: { ...fresh, ticker, watchlist: desk.watchlist, feeds: desk.feeds, updatedAtMs: event.nowMs, clockSkewMs: desk.clockSkewMs },
        fullBook: null,
        top5: null,
        awaitingSnapshot: false,
        focusSinceMs: event.nowMs,
        flowGapFloorMs: null,
        lastSliceMs: null,
      };
      return { model: next, effects: NO_EFFECTS };
    }
    case "bar": {
      if (event.bar === desk.bar) return { model, effects: NO_EFFECTS };
      return { model: { ...model, desk: { ...desk, bar: event.bar, candles: [], updatedAtMs: event.nowMs } }, effects: NO_EFFECTS };
    }
    case "watchlist": {
      const rows = event.instIds.map((id) => desk.watchlist.find((row) => row.instId === id) ?? { instId: id, ticker: null, spark: [], fundingRate: null });
      return { model: { ...model, desk: { ...desk, watchlist: rows } }, effects: NO_EFFECTS };
    }
    case "instrument": {
      if (event.instrument.instId !== desk.focus) return { model, effects: NO_EFFECTS };
      return { model: { ...model, desk: { ...desk, instrument: event.instrument, updatedAtMs: event.nowMs } }, effects: NO_EFFECTS };
    }
    case "swap": {
      if (event.instId === null) {
        return desk.derivatives === null ? { model, effects: NO_EFFECTS } : { model: { ...model, desk: { ...desk, derivatives: null } }, effects: NO_EFFECTS };
      }
      if (desk.derivatives?.instId === event.instId) return { model, effects: NO_EFFECTS };
      const derivatives: DeskDerivatives = {
        instId: event.instId,
        fundingRate: null,
        nextFundingTimeMs: null,
        markPx: null,
        indexPx: null,
        openInterest: null,
        openInterestUsd: null,
        tsMs: null,
      };
      return { model: { ...model, desk: { ...desk, derivatives } }, effects: NO_EFFECTS };
    }
    case "derivatives-seed":
      return applyDerivativesSeed(model, event);
    case "candles": {
      if (event.instId !== desk.focus || event.bar !== desk.bar) return ignored(model, "rest-candles");
      const candles = upsertCandles(desk.candles, event.candles, true, CANDLES_CAP);
      return { model: { ...model, desk: { ...desk, candles, updatedAtMs: event.nowMs } }, effects: NO_EFFECTS };
    }
    case "spark": {
      if (!desk.watchlist.some((row) => row.instId === event.instId)) return { model, effects: NO_EFFECTS };
      const spark = event.closes.filter((value) => Number.isFinite(value));
      const rows = desk.watchlist.map((row) => (row.instId === event.instId ? { ...row, spark } : row));
      return { model: { ...model, desk: { ...desk, watchlist: rows } }, effects: NO_EFFECTS };
    }
    case "ticker": {
      const next = applyTicker(desk, event.ticker);
      return next === desk ? { model, effects: NO_EFFECTS } : { model: { ...model, desk: { ...next, updatedAtMs: event.nowMs } }, effects: NO_EFFECTS };
    }
    case "message":
      return ingest(model, event.message, event.nowMs);
    case "feed":
      return { model: { ...model, desk: { ...desk, feeds: replaceFeed(desk.feeds, event.status) } }, effects: NO_EFFECTS };
    case "skew":
      return event.skewMs === desk.clockSkewMs ? { model, effects: NO_EFFECTS } : { model: { ...model, desk: { ...desk, clockSkewMs: event.skewMs } }, effects: NO_EFFECTS };
    case "gap":
      return { model: { ...model, awaitingSnapshot: model.fullBook !== null || model.awaitingSnapshot, flowGapFloorMs: event.nowMs }, effects: NO_EFFECTS };
    case "tick":
      return tick(model, event.nowMs);
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface DeskStoreOptions {
  readonly focus: string;
  readonly bar: DeskBar;
  readonly watchlist: readonly string[];
  readonly now?: () => number;
  readonly timers?: Timers;
  /** Minimum time between two publications. */
  readonly publishIntervalMs?: number;
  readonly onEffect?: (effect: DeskEffect) => void;
}

export interface DeskStore {
  /** The last published state; the same reference until something changes. */
  getState(): DeskState;
  getModel(): DeskModel;
  getDiagnostics(): DeskDiagnostics;
  subscribe(listener: (state: DeskState) => void): () => void;
  dispatch(event: DeskEvent): void;
  /** Publishes now, bypassing the throttle. */
  flush(): void;
  dispose(): void;
}

export function createDeskStore(options: DeskStoreOptions): DeskStore {
  const now = options.now ?? systemNow;
  const timers = options.timers ?? systemTimers;
  const interval = options.publishIntervalMs ?? 100;
  const listeners = new Set<(state: DeskState) => void>();

  let model = withMetrics(createDeskModel(options.focus, options.bar, options.watchlist), now());
  let published = model.desk;
  let dirty = false;
  let lastPublishAt = Number.NEGATIVE_INFINITY;
  let timer: unknown = null;
  let disposed = false;

  function publish(): void {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return;
    dirty = false;
    lastPublishAt = now();
    model = withMetrics(model, lastPublishAt);
    published = model.desk;
    for (const listener of [...listeners]) listener(published);
  }

  function schedule(): void {
    if (disposed || timer !== null) return;
    const wait = interval - (now() - lastPublishAt);
    if (wait <= 0) publish();
    else timer = timers.setTimeout(() => {
      timer = null;
      publish();
    }, wait);
  }

  return {
    getState: () => published,
    getModel: () => model,
    getDiagnostics: () => model.diagnostics,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(event) {
      if (disposed) return;
      const result = reduceDesk(model, event);
      for (const effect of result.effects) options.onEffect?.(effect);
      if (result.model === model) return;
      model = result.model;
      dirty = true;
      schedule();
    },
    flush() {
      dirty = true;
      publish();
    },
    dispose() {
      disposed = true;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      listeners.clear();
    },
  };
}

