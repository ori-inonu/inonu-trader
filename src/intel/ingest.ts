/**
 * Ingestion control for the flow engine (T5.1, ING-1 to ING-4).
 *
 * The exchange sends thousands of ticks a second; nothing downstream should recompute on each one and the model never
 * sees one. This module turns ticks and book snapshots into bars of 1 s, 5 s and 1 min by EVENT time, hands them out only
 * when they close (so the engine recalculates once per bar, ING-2), keeps a bounded queue that counts what it drops
 * (ING-4) and measures messages per second per source (ING-3, today measured nowhere).
 *
 * Pure: no clock, no network, no disk. Time arrives as a parameter (`advance(ts)`, `record(source, atMs)`), so the same
 * input always gives the same output.
 */
import { addDec, cmpDec, decToString, parseDec, type Dec } from "./decimal";

export interface Trade {
  /** Event time in epoch milliseconds, as the exchange stamped it. */
  readonly ts: number;
  /** Decimal text, as sent. */
  readonly px: string;
  /** Decimal text, as sent (contracts for a perpetual; the footprint converts, see footprint.ts). */
  readonly sz: string;
  /** The aggressor (the taker) side. */
  readonly side: "buy" | "sell";
}

export type BookLevel = readonly [price: string, size: string];

export interface BookSnapshot {
  readonly ts: number;
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
}

export interface Bar {
  readonly instId: string;
  readonly spanMs: number;
  /** Start of the bar in event time, aligned to the span. */
  readonly start: number;
  /** Prices as the exchange sent them; null for a bar that holds only book snapshots. */
  readonly open: string | null;
  readonly high: string | null;
  readonly low: string | null;
  readonly close: string | null;
  readonly trades: number;
  readonly buys: number;
  readonly sells: number;
  /** Exact decimal sums of the aggressor sizes. */
  readonly buyVolume: string;
  readonly sellVolume: string;
  /** The last book snapshot (by time) that fell in the bar. */
  readonly book: BookSnapshot | null;
}

const DEFAULT_SPANS_MS = [1_000, 5_000, 60_000] as const;
const DEFAULT_MAX_TRADES = 5_000;

interface Edge {
  readonly ts: number;
  readonly seq: number;
  readonly text: string;
}

interface OpenBar {
  readonly start: number;
  open: Edge | null;
  close: Edge | null;
  high: { readonly dec: Dec; readonly text: string } | null;
  low: { readonly dec: Dec; readonly text: string } | null;
  trades: number;
  buys: number;
  sells: number;
  buyVolume: Dec;
  sellVolume: Dec;
  book: BookSnapshot | null;
  bookSeq: number;
}

interface InstrumentState {
  watermark: number;
  seq: number;
  /** Open bars by span, keyed by start. */
  readonly open: Map<number, Map<number, OpenBar>>;
}

export interface CoalescerStats {
  /** Ticks or snapshots older than the oldest open 1 s boundary: dropped. */
  readonly late: number;
  /** Malformed input: dropped. */
  readonly invalid: number;
  readonly openBars: number;
}

export interface Coalescer {
  add(instId: string, trade: Trade): Bar[];
  addBook(instId: string, snapshot: BookSnapshot): Bar[];
  /** Closes every bar whose end is at or before `ts` (a quiet market produces no tick to do it). */
  advance(ts: number, instId?: string): Bar[];
  stats(): CoalescerStats;
}

const ZERO: Dec = { int: 0n, scale: 0 };

function validSpans(spans: readonly number[]): number[] {
  if (spans.length === 0) throw new RangeError("at least one span");
  for (const span of spans) if (!Number.isSafeInteger(span) || span <= 0) throw new RangeError(`bad span ${span}`);
  return [...spans].sort((a, b) => a - b);
}

const validTime = (ts: unknown): ts is number => typeof ts === "number" && Number.isSafeInteger(ts) && ts >= 0;

export function createCoalescer(options: { readonly spans?: readonly number[] } = {}): Coalescer {
  const spans = validSpans(options.spans ?? DEFAULT_SPANS_MS);
  const smallest = spans[0]!;
  const instruments = new Map<string, InstrumentState>();
  let late = 0;
  let invalid = 0;

  const stateOf = (instId: string): InstrumentState => {
    let state = instruments.get(instId);
    if (state === undefined) {
      state = { watermark: -1, seq: 0, open: new Map(spans.map((span) => [span, new Map<number, OpenBar>()])) };
      instruments.set(instId, state);
    }
    return state;
  };

  /** Events before this instant have no open bar left in the smallest span: they are late. */
  const lateBefore = (state: InstrumentState): number => (state.watermark < 0 ? -1 : Math.floor(state.watermark / smallest) * smallest);

  const barAt = (state: InstrumentState, span: number, ts: number): OpenBar => {
    const start = Math.floor(ts / span) * span;
    const bars = state.open.get(span)!;
    let bar = bars.get(start);
    if (bar === undefined) {
      bar = { start, open: null, close: null, high: null, low: null, trades: 0, buys: 0, sells: 0, buyVolume: ZERO, sellVolume: ZERO, book: null, bookSeq: -1 };
      bars.set(start, bar);
    }
    return bar;
  };

  /** Closes the bars whose end is at or before the watermark, smallest span first, oldest first. */
  const closeUpTo = (instId: string, state: InstrumentState, ts: number): Bar[] => {
    if (ts > state.watermark) state.watermark = ts;
    const out: Bar[] = [];
    for (const span of spans) {
      const bars = state.open.get(span)!;
      const ready = [...bars.values()].filter((bar) => bar.start + span <= state.watermark).sort((a, b) => a.start - b.start);
      for (const bar of ready) {
        bars.delete(bar.start);
        out.push({
          instId,
          spanMs: span,
          start: bar.start,
          open: bar.open?.text ?? null,
          high: bar.high?.text ?? null,
          low: bar.low?.text ?? null,
          close: bar.close?.text ?? null,
          trades: bar.trades,
          buys: bar.buys,
          sells: bar.sells,
          buyVolume: decToString(bar.buyVolume),
          sellVolume: decToString(bar.sellVolume),
          book: bar.book,
        });
      }
    }
    return out;
  };

  return {
    add(instId, trade) {
      const px = validTime(trade?.ts) && (trade.side === "buy" || trade.side === "sell") ? parseDec(trade.px) : null;
      const sz = px === null ? null : parseDec(trade.sz);
      if (px === null || sz === null || px.int <= 0n || sz.int <= 0n) {
        invalid += 1;
        return [];
      }
      const state = stateOf(instId);
      if (trade.ts < lateBefore(state)) {
        late += 1;
        return [];
      }
      const seq = state.seq++;
      for (const span of spans) {
        const bar = barAt(state, span, trade.ts);
        bar.trades += 1;
        if (trade.side === "buy") {
          bar.buys += 1;
          bar.buyVolume = addDec(bar.buyVolume, sz);
        } else {
          bar.sells += 1;
          bar.sellVolume = addDec(bar.sellVolume, sz);
        }
        if (bar.open === null || trade.ts < bar.open.ts || (trade.ts === bar.open.ts && seq < bar.open.seq)) bar.open = { ts: trade.ts, seq, text: trade.px };
        if (bar.close === null || trade.ts > bar.close.ts || (trade.ts === bar.close.ts && seq > bar.close.seq)) bar.close = { ts: trade.ts, seq, text: trade.px };
        if (bar.high === null || cmpDec(px, bar.high.dec) > 0) bar.high = { dec: px, text: trade.px };
        if (bar.low === null || cmpDec(px, bar.low.dec) < 0) bar.low = { dec: px, text: trade.px };
      }
      return closeUpTo(instId, state, trade.ts);
    },

    addBook(instId, snapshot) {
      if (!validTime(snapshot?.ts) || !Array.isArray(snapshot.bids) || !Array.isArray(snapshot.asks)) {
        invalid += 1;
        return [];
      }
      const state = stateOf(instId);
      if (snapshot.ts < lateBefore(state)) {
        late += 1;
        return [];
      }
      const seq = state.seq++;
      for (const span of spans) {
        const bar = barAt(state, span, snapshot.ts);
        if (bar.book === null || snapshot.ts > bar.book.ts || (snapshot.ts === bar.book.ts && seq > bar.bookSeq)) {
          bar.book = snapshot;
          bar.bookSeq = seq;
        }
      }
      return closeUpTo(instId, state, snapshot.ts);
    },

    advance(ts, instId) {
      if (!validTime(ts)) return [];
      const out: Bar[] = [];
      for (const [id, state] of instruments) {
        if (instId !== undefined && id !== instId) continue;
        out.push(...closeUpTo(id, state, ts));
      }
      return out;
    },

    stats() {
      let openBars = 0;
      for (const state of instruments.values()) for (const bars of state.open.values()) openBars += bars.size;
      return { late, invalid, openBars };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bounded queue (ING-4)

export interface TradeQueue {
  offer(instId: string, trade: Trade): void;
  /** Hands over everything queued for the instrument in event-time order (ties in arrival order) and empties it. */
  drain(instId: string): Trade[];
  stats(): { readonly size: Record<string, number>; readonly dropped: Record<string, number> };
}

export function createTradeQueue(options: { readonly maxTrades?: number } = {}): TradeQueue {
  const max = options.maxTrades ?? DEFAULT_MAX_TRADES;
  if (!Number.isSafeInteger(max) || max < 1) throw new RangeError("maxTrades must be a positive integer");
  const queues = new Map<string, Trade[]>();
  const dropped = new Map<string, number>();
  return {
    offer(instId, trade) {
      let queue = queues.get(instId);
      if (queue === undefined) {
        queue = [];
        queues.set(instId, queue);
      }
      queue.push(trade);
      if (queue.length > max) {
        // the oldest goes: a burst keeps the freshest picture, and the loss is counted, never silent
        queue.splice(0, queue.length - max);
        dropped.set(instId, (dropped.get(instId) ?? 0) + 1);
      }
    },
    drain(instId) {
      const queue = queues.get(instId) ?? [];
      queues.set(instId, []);
      return queue.map((trade, index) => ({ trade, index })).sort((a, b) => a.trade.ts - b.trade.ts || a.index - b.index).map((entry) => entry.trade);
    },
    stats() {
      return { size: Object.fromEntries([...queues].map(([id, queue]) => [id, queue.length])), dropped: Object.fromEntries(dropped) };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Messages per second per source (ING-3)

export interface SourceRate {
  readonly perSecond: number;
  readonly total: number;
  readonly lastAtMs: number | null;
}

export interface RateMeter {
  record(source: string, atMs: number, count?: number): void;
  perSecond(source: string, nowMs: number): number;
  snapshot(nowMs: number): Record<string, SourceRate>;
  /** Number of one-second buckets still held for the source (memory bound, for tests). */
  bucketCount(source: string): number;
}

interface SourceState {
  readonly buckets: Map<number, number>;
  total: number;
  firstAt: number;
  lastAt: number;
}

export function createRateMeter(options: { readonly windowMs?: number } = {}): RateMeter {
  const windowMs = options.windowMs ?? 10_000;
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000) throw new RangeError("windowMs must be at least 1000");
  const windowSeconds = Math.ceil(windowMs / 1000);
  const sources = new Map<string, SourceState>();

  const rate = (state: SourceState, nowMs: number): number => {
    // until a full window has elapsed the denominator is the time since the first message, so a starting stream is not underestimated
    const effective = Math.min(windowMs, Math.max(1000, nowMs - state.firstAt));
    const startKey = Math.floor((nowMs - effective) / 1000);
    const endKey = Math.floor(nowMs / 1000);
    let count = 0;
    for (const [key, n] of state.buckets) if (key >= startKey && key <= endKey) count += n;
    return count / (effective / 1000);
  };

  return {
    record(source, atMs, count = 1) {
      let state = sources.get(source);
      if (state === undefined) {
        state = { buckets: new Map(), total: 0, firstAt: atMs, lastAt: atMs };
        sources.set(source, state);
      }
      const key = Math.floor(atMs / 1000);
      state.buckets.set(key, (state.buckets.get(key) ?? 0) + count);
      state.total += count;
      if (atMs < state.firstAt) state.firstAt = atMs;
      if (atMs > state.lastAt) state.lastAt = atMs;
      const newest = Math.floor(state.lastAt / 1000);
      for (const k of state.buckets.keys()) if (k < newest - windowSeconds) state.buckets.delete(k);
    },
    perSecond(source, nowMs) {
      const state = sources.get(source);
      return state === undefined ? 0 : rate(state, nowMs);
    },
    snapshot(nowMs) {
      return Object.fromEntries([...sources].map(([name, state]) => [name, { perSecond: rate(state, nowMs), total: state.total, lastAtMs: state.lastAt }]));
    },
    bucketCount(source) {
      return sources.get(source)?.buckets.size ?? 0;
    },
  };
}
