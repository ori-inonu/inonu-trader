/**
 * E1 of ADENDO-E: the pulse of the market. ONE connection to OKX's public WebSocket (free, no key; it is the same `trades` feed of the flow engine, with the aggressor side of every print), coalesced into one-minute bars
 * and read as a short-horizon regime (`regime.ts`) for a few reference markets. It hands the Brief a flat set of keys (`btc_1m`, `btc_5m`, `btc_fl`, `btc_rv`, and the same for SOL) or null.
 *
 * Time: the machine's clock is not trusted to agree with the exchange (the clock of this computer was measured seconds off). The pulse runs on EVENT time: the stamp of the latest trade plus the local time that has
 * passed since that trade arrived. A quiet market closes its last minute by that clock and goes stale on its own; a stale or closed feed answers null, never a calm that is not measured.
 *
 * Only CLOSED minutes count. A fact says which window it is final for (`windowEndMs`) and the origin of the LAST PRINT OF THE LAST CLOSED MINUTE that contributed; a print of the minute still open did not contribute to the
 * values and does not move the origin. `read()` gives the context and the facts from the SAME instant, so a consumer never mixes two readings.
 *
 * Everything with a side effect is injected (the socket, the scheduler, the clock), so it is tested without a network. It reads and keeps numbers; it calls no provider that costs, opens no second connection per
 * consumer and decides nothing.
 */
import { createCoalescer, type Bar, type RateMeter } from "../intel/ingest";
import { createTradeFeed, type FeedStatus, type TradeFeed, type TradeFeedOptions } from "../inonu/okx-ws";
import { factOf, gapsInLast, type PulseFact } from "./facts";
import { MINUTE, regimeOf, type MinuteBar, type Regime } from "./regime";

export interface PulseInstrument {
  /** The OKX instrument id, for example `BTC-USDT`. */
  readonly id: string;
  /** The prefix of its keys in the Brief, a short lowercase code. */
  readonly key: string;
}

/** The reference markets: the market's anchor and the chain the agent trades on. */
export const DEFAULT_PULSE_INSTRUMENTS: readonly PulseInstrument[] = [
  { id: "BTC-USDT", key: "btc" },
  { id: "SOL-USDT", key: "sol" },
];

export interface PulseOptions {
  readonly create: TradeFeedOptions["create"];
  readonly schedule: TradeFeedOptions["schedule"];
  /** The local clock, epoch milliseconds. */
  readonly now: () => number;
  readonly instruments?: readonly PulseInstrument[];
  readonly meter?: RateMeter;
  readonly url?: string;
}

export interface PulseStatus {
  readonly feed: FeedStatus;
  readonly rejected: number;
  readonly instruments: readonly { readonly id: string; readonly bars: number; readonly regime: Regime | null }[];
}

export interface PulseReading {
  /** The keys for the Brief, or null when the feed is not live or no reference market has a current regime. */
  readonly context: Readonly<Record<string, number | null>> | null;
  /** The facts with identity (facts.ts), one per market that has a current regime. Empty when the feed is not live. */
  readonly facts: readonly PulseFact[];
}

export interface Pulse {
  /** Opens the connection and starts the timer that closes quiet minutes. Safe to call once. */
  start(): void;
  /** The context and the facts of ONE instant: use this, not `context()` and `facts()` from two readings. */
  read(): PulseReading;
  /** The keys for the Brief, or null when the feed is not live or no reference market has a current regime. */
  context(): Readonly<Record<string, number | null>> | null;
  /** The facts with identity (facts.ts), one per market that has a current regime: the same window gives the same hash, and a reconnect changes the generation. Empty when the feed is not live. */
  facts(): PulseFact[];
  status(): PulseStatus;
  close(): void;
}

/** Minutes kept per market: enough for the fifteen-minute window and a margin. */
const KEEP_BARS = 24;
/** How often a quiet market's last minute is closed, in ms. */
const QUIET_CLOSE_EVERY_MS = 5_000;

const toMinuteBar = (bar: Bar): MinuteBar | null => {
  if (bar.spanMs !== MINUTE || bar.close === null) return null;
  const close = Number(bar.close);
  const buyVolume = Number(bar.buyVolume);
  const sellVolume = Number(bar.sellVolume);
  return Number.isFinite(close) && Number.isFinite(buyVolume) && Number.isFinite(sellVolume) ? { start: bar.start, close, buyVolume, sellVolume } : null;
};

export function createPulse(options: PulseOptions): Pulse {
  const instruments = options.instruments ?? DEFAULT_PULSE_INSTRUMENTS;
  const byId = new Map(instruments.map((i) => [i.id, i] as const));
  const coalescer = createCoalescer({ spans: [MINUTE] });
  const kept = new Map<string, MinuteBar[]>(instruments.map((i) => [i.id, []]));
  /** The latest print of each minute of each market, and the local time it arrived: what a fact says about its own origin. */
  const prints = new Map<string, Map<number, { readonly ts: number; readonly localAt: number }>>(instruments.map((i) => [i.id, new Map()]));
  let lastEventTs = -1;
  let receivedAt = 0;
  let started = false;
  let stopQuiet: (() => void) | null = null;
  let rejectedByUs = 0;

  const keep = (instId: string, closed: readonly Bar[]): void => {
    const list = kept.get(instId);
    if (list === undefined) return;
    for (const bar of closed) {
      if (bar.instId !== instId) continue;
      const minute = toMinuteBar(bar);
      if (minute === null) {
        rejectedByUs += 1;
        continue;
      }
      const at = list.findIndex((b) => b.start === minute.start);
      if (at >= 0) list[at] = minute;
      else list.push(minute);
    }
    list.sort((a, b) => a.start - b.start);
    while (list.length > KEEP_BARS) list.shift();
  };

  const notePrint = (instId: string, ts: number): void => {
    const byMinute = prints.get(instId);
    if (byMinute === undefined) return;
    const minute = Math.floor(ts / MINUTE) * MINUTE;
    const current = byMinute.get(minute);
    if (current === undefined || ts > current.ts) byMinute.set(minute, { ts, localAt: options.now() });
    // a margin of minutes beyond the bars kept is enough for the origin of any fact
    for (const start of [...byMinute.keys()]) if (start < minute - (KEEP_BARS + 6) * MINUTE) byMinute.delete(start);
  };

  /** The exchange's time now: the latest trade stamp plus what has passed locally since it arrived; null before any trade. */
  const eventNow = (): number | null => (lastEventTs < 0 ? null : lastEventTs + Math.max(0, options.now() - receivedAt));

  const feed: TradeFeed = createTradeFeed({
    create: options.create,
    schedule: options.schedule,
    now: options.now,
    ...(options.meter === undefined ? {} : { meter: options.meter }),
    ...(options.url === undefined ? {} : { url: options.url }),
    onTrades: (instId, trades) => {
      if (!byId.has(instId)) return;
      for (const trade of trades) {
        notePrint(instId, trade.ts);
        if (trade.ts > lastEventTs) {
          lastEventTs = trade.ts;
          receivedAt = options.now();
        }
        keep(instId, coalescer.add(instId, trade));
      }
    },
  });

  const closeQuiet = (): void => {
    const now = eventNow();
    if (now === null) return;
    for (const { id } of instruments) keep(id, coalescer.advance(now, id));
  };

  /** The closed minutes of a market at `now`, and the regime they make. */
  const closedAt = (id: string, now: number): { readonly bars: readonly MinuteBar[]; readonly regime: Regime | null } => {
    const bars = (kept.get(id) ?? []).filter((b) => b.start + MINUTE <= now);
    return { bars, regime: regimeOf(bars, now) };
  };

  const readAt = (now: number | null): PulseReading => {
    if (now === null || feed.status().state !== "live") return { context: null, facts: [] };
    const context: Record<string, number | null> = {};
    const facts: PulseFact[] = [];
    let any = false;
    for (const { id, key } of instruments) {
      const { bars, regime } = closedAt(id, now);
      if (regime !== null) any = true;
      context[`${key}_1m`] = regime?.ret1m ?? null;
      context[`${key}_5m`] = regime?.ret5m ?? null;
      context[`${key}_fl`] = regime?.flow5m ?? null;
      context[`${key}_rv`] = regime?.rv15m ?? null;
      if (regime === null || bars.length === 0) continue;
      const last = bars.reduce((a, b) => (b.start > a.start ? b : a));
      const print = prints.get(id)?.get(last.start);
      if (print === undefined) continue; // a minute that closed without a print on record: nothing honest to say about its origin
      const fact = factOf({
        instrument: id,
        windowEndMs: last.start + MINUTE,
        originAtMs: print.ts,
        observedAtLocalMs: print.localAt,
        generation: feed.stats().reconnects,
        bars: bars.length,
        gaps: gapsInLast(bars, 15),
        regime,
      });
      if (fact !== null) facts.push(fact);
    }
    return { context: any ? context : null, facts };
  };

  return {
    start() {
      if (started) return;
      started = true;
      for (const { id } of instruments) feed.subscribe(id);
      stopQuiet = options.schedule.every(QUIET_CLOSE_EVERY_MS, closeQuiet);
    },

    read: () => readAt(eventNow()),
    context: () => readAt(eventNow()).context,
    facts: () => [...readAt(eventNow()).facts],

    status() {
      const now = eventNow();
      return {
        feed: feed.status(),
        rejected: feed.stats().rejected + rejectedByUs,
        instruments: instruments.map(({ id }) => ({ id, bars: kept.get(id)?.length ?? 0, regime: now === null ? null : closedAt(id, now).regime })),
      };
    },

    close() {
      stopQuiet?.();
      stopQuiet = null;
      feed.close();
    },
  };
}
