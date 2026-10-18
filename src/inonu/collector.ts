/**
 * The collector: the memory the flow engine learns its thresholds from. Trades arrive from the live feed; per instrument it
 * keeps a bounded window of the latest trades, the sizes of the latest trades (for the threshold T), and, for every CLOSED
 * one minute candle, the footprint it left behind (FLX-8, FLX-12). After enough minutes the adaptive thresholds exist.
 *
 * A footprint is accumulated trade by trade and the raw trades of the minute are not kept. The bin width is decided once, when
 * the instrument starts being watched, from its last twenty candles, so the footprints of one run are comparable. A minute
 * with no trade leaves nothing and a gap does not invent candles. A late trade goes to the window but cannot reopen a closed
 * footprint. The REST reads, the clock and the memory of the previous run are injected. With a memory, what the engine learned
 * survives a restart (FLX-12): the history and the trade sizes come back when an instrument starts being watched, and every
 * closed minute is written again; `restored` says how many of the kept minutes came from the previous run. The trades
 * themselves are never kept on disk.
 */
import { autoBinTicks, candleStart, createFootprint, createTradeReader, type FootprintBuilder, type InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";
import type { ThresholdCandle } from "../intel/thresholds";
import type { FlowMemory } from "./flow-memory";
import { instTypeOf, type OkxPublic } from "./okx-public";

const MINUTE_MS = 60_000;
const DEFAULT_MAX_WINDOW = 500;
const DEFAULT_MAX_HISTORY = 60;
const TRADE_UNITS_KEPT = 2_000;
const CANDLES_FOR_BIN = 20;
const CANDLES_TO_LOAD = 120;

export interface CollectorSnapshot {
  readonly meta: InstrumentMeta;
  readonly binTicks: number;
  /** The latest trades by event time, oldest first. */
  readonly window: Trade[];
  /** Footprints of the closed minutes, oldest first. */
  readonly history: ThresholdCandle[];
  /** Closed minutes that had trades, counting the ones restored from the previous run (not capped by the history size). */
  readonly closedCandles: number;
  /** How many of the kept history minutes still come from the previous run's memory. */
  readonly restored: number;
  /** Sizes of the latest trades in units. */
  readonly tradeUnits: number[];
  readonly firstTradeTs: number | null;
  readonly lastTradeTs: number | null;
  readonly late: number;
  readonly rejected: number;
}

export type WatchResult = { readonly ok: true } | { readonly ok: false; readonly reason: "bad_symbol" | "load_failed" | "limit" };

/**
 * How many instruments are held at once. The desk can ask about any instrument of the exchange; each one held keeps a window of trades, its
 * learned minutes and (with the live feed) a subscription and a file. Past this a new instrument is not followed: its reading comes from
 * the exchange on each click, the same engine on less memory.
 */
const MAX_INSTRUMENTS = 24;

export interface Collector {
  watch(instId: string, signal?: AbortSignal): Promise<WatchResult>;
  ingest(instId: string, trades: readonly Trade[]): void;
  snapshot(instId: string): CollectorSnapshot | null;
  instruments(): string[];
}

interface State {
  readonly meta: InstrumentMeta;
  readonly binTicks: number;
  readonly read: (trade: Trade) => { readonly units: number } | null;
  window: Trade[];
  history: ThresholdCandle[];
  tradeUnits: number[];
  current: { readonly start: number; readonly builder: FootprintBuilder } | null;
  closedCandles: number;
  /** Minutes closed live since watching started, never the restored ones. */
  liveClosed: number;
  firstTradeTs: number | null;
  lastTradeTs: number | null;
  late: number;
  rejected: number;
}

export function createCollector(options: {
  readonly rest: OkxPublic;
  readonly now: () => number;
  readonly maxWindow?: number;
  readonly maxHistory?: number;
  readonly memory?: FlowMemory;
  readonly maxInstruments?: number;
}): Collector {
  const maxInstruments = options.maxInstruments ?? MAX_INSTRUMENTS;
  const maxWindow = options.maxWindow ?? DEFAULT_MAX_WINDOW;
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;
  const states = new Map<string, State>();
  const loading = new Map<string, Promise<WatchResult>>();

  /** The previous run's history and trade sizes, bounded like the live ones; nothing when there is no memory or it fails. */
  function recall(instId: string): { history: ThresholdCandle[]; tradeUnits: number[] } {
    try {
      const memory = options.memory?.read(instId);
      if (memory === null || memory === undefined) return { history: [], tradeUnits: [] };
      return { history: memory.history.slice(-maxHistory).map((c) => ({ binTicks: c.binTicks, levels: c.levels.map((l) => ({ c: l.c, v: l.v })), ...(c.closedAtMs === undefined ? {} : { closedAtMs: c.closedAtMs }) })), tradeUnits: memory.tradeUnits.slice(-TRADE_UNITS_KEPT) };
    } catch {
      return { history: [], tradeUnits: [] };
    }
  }

  async function load(instId: string, signal?: AbortSignal): Promise<WatchResult> {
    if (instTypeOf(instId) === null) return { ok: false, reason: "bad_symbol" };
    try {
      const [meta, candles] = await Promise.all([options.rest.instrument(instId, signal), options.rest.candles(instId, CANDLES_TO_LOAD, signal)]);
      const binTicks = autoBinTicks(candles.slice(-CANDLES_FOR_BIN), meta.tickSz);
      const restored = recall(instId);
      states.set(instId, {
        meta,
        binTicks,
        read: createTradeReader(meta, binTicks),
        window: [],
        history: restored.history,
        tradeUnits: restored.tradeUnits,
        current: null,
        closedCandles: restored.history.length,
        liveClosed: 0,
        firstTradeTs: null,
        lastTradeTs: null,
        late: 0,
        rejected: 0,
      });
      return { ok: true };
    } catch {
      return { ok: false, reason: "load_failed" }; // nothing of the failure travels
    }
  }

  function close(state: State): void {
    if (state.current === null) return;
    const footprint = state.current.builder.build();
    if (footprint.trades > 0) {
      state.history.push({ binTicks: state.binTicks, levels: footprint.levels.map((level) => ({ c: level.c, v: level.v })), closedAtMs: options.now() });
      if (state.history.length > maxHistory) state.history = state.history.slice(-maxHistory);
      state.closedCandles += 1;
      state.liveClosed += 1;
      remember(state);
    }
    state.current = null;
  }

  function remember(state: State): void {
    try {
      options.memory?.write(state.meta.instId, { binTicks: state.binTicks, history: state.history, tradeUnits: state.tradeUnits });
    } catch {
      // a memory that fails changes nothing: the engine goes on from what it holds
    }
  }

  return {
    async watch(instId, signal) {
      if (states.has(instId)) return { ok: true };
      const pending = loading.get(instId);
      if (pending) return pending;
      if (states.size + loading.size >= maxInstruments) return { ok: false, reason: "limit" };
      const started = load(instId, signal).finally(() => loading.delete(instId));
      loading.set(instId, started);
      return started;
    },

    ingest(instId, trades) {
      const state = states.get(instId);
      if (state === undefined) return;
      let needsSort = false;
      for (const trade of [...trades].sort((a, b) => a.ts - b.ts)) {
        const read = state.read(trade);
        if (read === null) {
          state.rejected += 1;
          continue;
        }
        const start = candleStart(trade.ts, MINUTE_MS);
        if (state.current === null || start > state.current.start) {
          close(state);
          state.current = { start, builder: createFootprint(state.meta, state.binTicks) };
        }
        if (start < state.current.start) state.late += 1;
        else state.current.builder.add(trade);

        const last = state.window[state.window.length - 1];
        if (last !== undefined && trade.ts < last.ts) needsSort = true;
        state.window.push(trade);
        state.tradeUnits.push(read.units);
        state.firstTradeTs = state.firstTradeTs === null ? trade.ts : Math.min(state.firstTradeTs, trade.ts);
        state.lastTradeTs = state.lastTradeTs === null ? trade.ts : Math.max(state.lastTradeTs, trade.ts);
      }
      if (needsSort) state.window.sort((a, b) => a.ts - b.ts);
      if (state.window.length > maxWindow) state.window = state.window.slice(-maxWindow);
      if (state.tradeUnits.length > TRADE_UNITS_KEPT) state.tradeUnits = state.tradeUnits.slice(-TRADE_UNITS_KEPT);
    },

    snapshot(instId) {
      const state = states.get(instId);
      if (state === undefined) return null;
      return {
        meta: state.meta,
        binTicks: state.binTicks,
        window: [...state.window],
        history: state.history.map((candle) => ({ binTicks: candle.binTicks, levels: candle.levels.map((level) => ({ ...level })) })),
        closedCandles: state.closedCandles,
        restored: Math.max(0, state.history.length - state.liveClosed),
        tradeUnits: [...state.tradeUnits],
        firstTradeTs: state.firstTradeTs,
        lastTradeTs: state.lastTradeTs,
        late: state.late,
        rejected: state.rejected,
      };
    },

    instruments: () => [...states.keys()],
  };
}
