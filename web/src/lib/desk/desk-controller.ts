/**
 * Wires the desk data layer together without React: two OKX sockets (public and business), the REST client and the
 * store. `useDesk` is a thin hook over this, and the live smoke script drives it directly.
 *
 * Lifecycle: constructing a controller has no side effects (no socket, no timer, no request). `start()` opens the
 * sockets and begins loading, `stop()` closes everything and aborts requests, and the pair can be repeated (React
 * StrictMode mounts, unmounts and mounts again).
 *
 * Subscriptions
 * - public: `books`, `books5`, `trades` and `tickers` of the focus; `tickers` of every watchlist instrument; for the
 *   focus perpetual (`${base}-USDT-SWAP`, only if REST confirms it exists and trades) `funding-rate`, `mark-price`,
 *   `open-interest`, plus `index-tickers` of `${base}-USDT`; `funding-rate` of every existing watchlist perpetual.
 * - business: `candle{bar}` of the focus.
 * REST: instrument and candle history of the focus, perpetual lookups, sparklines of the watchlist (last 24 hourly
 * closes, every 5 minutes) and a light ticker probe of the focus every minute, which also keeps the REST feed honest.
 */

import { createSkewMonitor, type SkewMonitor } from "./clock-skew";
import { createDeskStore, type DeskDiagnostics, type DeskEffect, type DeskStore } from "./desk-store";
import { candleChannel, indexInstIdFor, swapInstIdFor } from "./okx-parse";
import { OKX_REST_BASE, createOkxRest, type FetchLike, type OkxRest } from "./okx-rest";
import { createResyncGuard } from "./resync-guard";
import {
  createOkxSocket,
  type OkxProtocolError,
  type OkxSocket,
  type OkxSocketStats,
  type OkxSubscriptionArg,
  type WebSocketCtor,
} from "./okx-ws";
import { systemNow, systemTimers, type TimerHandle, type Timers } from "./runtime";
import { DESK_DEFAULT_WATCHLIST, type DeskBar, type DeskState } from "./types";

export interface DeskControllerOptions {
  readonly focus: string;
  readonly bar: DeskBar;
  readonly watchlist?: readonly string[];
  readonly WebSocketCtor?: WebSocketCtor;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly timers?: Timers;
  readonly random?: () => number;
  readonly publicUrl?: string;
  readonly businessUrl?: string;
  readonly restBaseUrl?: string;
  readonly publishIntervalMs?: number;
  /** Period of the pulse that refreshes feed statuses and samples time based series. */
  readonly pulseMs?: number;
  readonly sparkRefreshMs?: number;
  readonly probeEveryMs?: number;
  readonly restMinIntervalMs?: number;
}

export interface ControllerDiagnostics {
  readonly store: DeskDiagnostics;
  readonly publicSocket: OkxSocketStats | null;
  readonly businessSocket: OkxSocketStats | null;
  readonly protocolErrors: readonly OkxProtocolError[];
}

export interface DeskController {
  readonly store: DeskStore;
  start(): void;
  stop(): void;
  setFocus(instId: string): void;
  setBar(bar: DeskBar): void;
  setWatchlist(instIds: readonly string[]): void;
  getState(): DeskState;
  subscribe(listener: (state: DeskState) => void): () => void;
  getDiagnostics(): ControllerDiagnostics;
}

const SPARK_BAR: DeskBar = "1H";
const SPARK_POINTS = 24;
const SPARK_RETRY_MS = 30_000;
const CANDLE_TARGET = 300;

export function createDeskController(options: DeskControllerOptions): DeskController {
  const now = options.now ?? systemNow;
  const timers = options.timers ?? systemTimers;
  const pulseMs = options.pulseMs ?? 1_000;
  const sparkRefreshMs = options.sparkRefreshMs ?? 300_000;
  const probeEveryMs = options.probeEveryMs ?? 60_000;

  let focus = options.focus;
  let bar = options.bar;
  let watchlist: readonly string[] = options.watchlist ?? DESK_DEFAULT_WATCHLIST;
  let running = false;
  /** Bumps on start and stop: the loops that must survive a focus change check this one. */
  let session = 0;
  /** Bumps on start, stop and every focus change: per instrument loading checks this one. */
  let runId = 0;
  let focusAbort: AbortController | null = null;
  let skewMonitor: SkewMonitor | null = null;
  let seedAbort: AbortController | null = null;
  let seededKey: string | null = null;
  let candleAbort: AbortController | null = null;
  let publicSocket: OkxSocket | null = null;
  let businessSocket: OkxSocket | null = null;
  let pulseTimer: TimerHandle | null = null;
  let probeTimer: TimerHandle | null = null;
  let sparkTimer: TimerHandle | null = null;
  let candlesLoaded = false;
  let instrumentLoaded = false;
  const protocolErrors: OkxProtocolError[] = [];
  /** Perpetual instId -> whether it exists and trades. Only definitive answers are stored. */
  const swapKnown = new Map<string, boolean>();

  const resync = createResyncGuard({ now, timers });
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const restBase = (options.restBaseUrl ?? OKX_REST_BASE).replace(/\/+$/, "");
  const rest: OkxRest = createOkxRest({
    fetch: fetchImpl,
    onStatusChange: (status) => store.dispatch({ type: "feed", status }),
    now,
    timers,
    ...(options.restBaseUrl ? { baseUrl: options.restBaseUrl } : {}),
    ...(options.restMinIntervalMs !== undefined ? { minIntervalMs: options.restMinIntervalMs } : {}),
  });

  const store = createDeskStore({
    focus,
    bar,
    watchlist,
    now,
    timers,
    ...(options.publishIntervalMs !== undefined ? { publishIntervalMs: options.publishIntervalMs } : {}),
    onEffect: (effect: DeskEffect) => {
      if (effect.type !== "resubscribe") return;
      // OKX budgets subscription requests, so a book that keeps failing is resynced at a growing distance.
      resync.request(`${effect.arg.channel}|${effect.arg.instId}`, () => publicSocket?.resubscribe(effect.arg));
    },
  });

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  function desiredPublic(): OkxSubscriptionArg[] {
    const wanted = new Map<string, OkxSubscriptionArg>();
    const add = (channel: string, instId: string): void => {
      wanted.set(`${channel}|${instId}`, { channel, instId });
    };
    add("books", focus);
    add("books5", focus);
    add("trades", focus);
    add("tickers", focus);
    for (const id of watchlist) add("tickers", id);
    const focusSwap = swapInstIdFor(focus);
    if (swapKnown.get(focusSwap) === true) {
      add("funding-rate", focusSwap);
      add("mark-price", focusSwap);
      add("open-interest", focusSwap);
      add("index-tickers", indexInstIdFor(focus));
    }
    for (const id of watchlist) {
      const swap = swapInstIdFor(id);
      if (swapKnown.get(swap) === true) add("funding-rate", swap);
    }
    return [...wanted.values()];
  }

  function syncSubscriptions(): void {
    publicSocket?.setSubscriptions(desiredPublic());
    businessSocket?.setSubscriptions([{ channel: candleChannel(bar), instId: focus }]);
  }

  // -------------------------------------------------------------------------
  // REST loading
  // -------------------------------------------------------------------------

  function announceSwap(): void {
    const swap = swapInstIdFor(focus);
    const known = swapKnown.get(swap);
    if (known === undefined) return;
    store.dispatch({ type: "swap", instId: known ? swap : null });
    if (known && seededKey !== `${runId}:${swap}`) {
      seededKey = `${runId}:${swap}`;
      void seedDerivatives(swap, runId);
    }
  }

  /**
   * One time REST bootstrap of the perpetual panel. The funding-rate socket channel does not push a snapshot on
   * subscribe for every instrument, so without this the panel could wait many seconds for its funding. The three reads
   * are queued together (spaced by the REST limiter), each lands as soon as it arrives, a failed one leaves its fields
   * null, and everything is dropped if the focus changes meanwhile. Socket pushes keep updating afterwards.
   */
  async function seedDerivatives(swap: string, myRun: number): Promise<void> {
    seedAbort?.abort();
    const abort = new AbortController();
    seedAbort = abort;
    const current = (): boolean => myRun === runId && !abort.signal.aborted && swapInstIdFor(focus) === swap;
    const { signal } = abort;
    await Promise.all([
      rest.fundingRate(swap, signal).then((result) => {
        if (current() && result.ok) store.dispatch({ type: "derivatives-seed", instId: swap, funding: result.value, nowMs: now() });
      }),
      rest.markPrice(swap, signal).then((result) => {
        if (current() && result.ok) store.dispatch({ type: "derivatives-seed", instId: swap, mark: result.value, nowMs: now() });
      }),
      rest.openInterest(swap, signal).then((result) => {
        if (current() && result.ok) store.dispatch({ type: "derivatives-seed", instId: swap, openInterest: result.value, nowMs: now() });
      }),
    ]);
  }

  async function resolveSwaps(ids: readonly string[], myRun: number, signal: AbortSignal): Promise<void> {
    for (const swap of ids) {
      if (swapKnown.has(swap)) continue;
      const result = await rest.instrument(swap, signal);
      if (myRun !== runId || signal.aborted) return;
      if (result.ok) swapKnown.set(swap, true);
      else if (result.error.code === "not_found" || result.error.code === "not_live") swapKnown.set(swap, false);
      else continue;
      if (swap === swapInstIdFor(focus)) announceSwap();
      syncSubscriptions();
    }
  }

  async function loadCandles(myRun: number): Promise<void> {
    candleAbort?.abort();
    const abort = new AbortController();
    candleAbort = abort;
    const instId = focus;
    const wantedBar = bar;
    const result = await rest.candleHistory(instId, wantedBar, CANDLE_TARGET, abort.signal);
    if (myRun !== runId || abort.signal.aborted || instId !== focus || wantedBar !== bar) return;
    if (!result.ok) return;
    candlesLoaded = true;
    store.dispatch({ type: "candles", instId, bar: wantedBar, candles: result.value, nowMs: now() });
  }

  async function loadFocus(myRun: number): Promise<void> {
    focusAbort?.abort();
    const abort = new AbortController();
    focusAbort = abort;
    const instId = focus;
    instrumentLoaded = false;
    candlesLoaded = false;
    const candlesDone = loadCandles(myRun);
    const instrument = await rest.instrument(instId, abort.signal);
    if (myRun !== runId || abort.signal.aborted || instId !== focus) return;
    if (instrument.ok) {
      instrumentLoaded = true;
      store.dispatch({ type: "instrument", instrument: instrument.value, nowMs: now() });
    }
    announceSwap();
    await resolveSwaps([swapInstIdFor(instId), ...watchlist.map(swapInstIdFor)], myRun, abort.signal);
    await candlesDone;
  }

  async function refreshSparks(mySession: number): Promise<void> {
    let allOk = true;
    for (const instId of [...watchlist]) {
      const result = await rest.candles(instId, SPARK_BAR, { limit: SPARK_POINTS });
      if (mySession !== session) return;
      if (!result.ok) {
        allOk = false;
        continue;
      }
      store.dispatch({ type: "spark", instId, closes: result.value.map((candle) => candle.close) });
    }
    scheduleSpark(allOk ? sparkRefreshMs : SPARK_RETRY_MS, mySession);
  }

  function scheduleSpark(delayMs: number, mySession: number): void {
    if (sparkTimer !== null) timers.clearTimeout(sparkTimer);
    sparkTimer = timers.setTimeout(() => {
      sparkTimer = null;
      if (mySession === session) void refreshSparks(mySession);
    }, delayMs);
  }

  async function probe(mySession: number): Promise<void> {
    const myRun = runId;
    const instId = focus;
    const ticker = await rest.ticker(instId);
    if (mySession !== session || myRun !== runId) return;
    if (ticker.ok) store.dispatch({ type: "ticker", ticker: ticker.value, nowMs: now() });
    if (!instrumentLoaded) {
      const instrument = await rest.instrument(instId);
      if (mySession === session && myRun === runId && instrument.ok) {
        instrumentLoaded = true;
        store.dispatch({ type: "instrument", instrument: instrument.value, nowMs: now() });
      }
    }
    if (mySession !== session || myRun !== runId) return;
    if (!candlesLoaded) await loadCandles(myRun);
    if (mySession !== session || myRun !== runId) return;
    const signal = (focusAbort ??= new AbortController()).signal;
    await resolveSwaps([swapInstIdFor(instId), ...watchlist.map(swapInstIdFor)], myRun, signal);
  }

  function scheduleProbe(mySession: number): void {
    probeTimer = timers.setTimeout(() => {
      probeTimer = null;
      if (mySession !== session) return;
      void probe(mySession).finally(() => {
        if (mySession === session) scheduleProbe(mySession);
      });
    }, probeEveryMs);
  }

  // -------------------------------------------------------------------------
  // Pulse
  // -------------------------------------------------------------------------

  function pulse(): void {
    const t = now();
    if (publicSocket) store.dispatch({ type: "feed", status: publicSocket.getStatus(t) });
    if (businessSocket) store.dispatch({ type: "feed", status: businessSocket.getStatus(t) });
    store.dispatch({ type: "feed", status: rest.status(t) });
    store.dispatch({ type: "tick", nowMs: t });
  }

  function schedulePulse(mySession: number): void {
    pulseTimer = timers.setTimeout(() => {
      pulseTimer = null;
      if (mySession !== session) return;
      pulse();
      schedulePulse(mySession);
    }, pulseMs);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  function start(): void {
    if (running) return;
    running = true;
    session += 1;
    runId += 1;
    const mySession = session;
    const myRun = runId;

    const common = {
      ...(options.WebSocketCtor ? { WebSocketCtor: options.WebSocketCtor } : {}),
      now,
      timers,
      ...(options.random ? { random: options.random } : {}),
    };
    const onProtocolError = (error: OkxProtocolError): void => {
      protocolErrors.push(error);
      if (protocolErrors.length > 20) protocolErrors.shift();
    };
    publicSocket = createOkxSocket({
      ...common,
      feedId: "okx-public-ws",
      ...(options.publicUrl ? { url: options.publicUrl } : {}),
      onMessage: (message) => store.dispatch({ type: "message", message, nowMs: now() }),
      onStatusChange: (status) => store.dispatch({ type: "feed", status }),
      onProtocolError,
      onOpen: ({ reconnect }) => {
        if (reconnect) store.dispatch({ type: "gap", nowMs: now() });
      },
    });
    businessSocket = createOkxSocket({
      ...common,
      feedId: "okx-business-ws",
      ...(options.businessUrl ? { url: options.businessUrl } : {}),
      onMessage: (message) => store.dispatch({ type: "message", message, nowMs: now() }),
      onStatusChange: (status) => store.dispatch({ type: "feed", status }),
      onProtocolError,
      onOpen: ({ reconnect }) => {
        // Candles pushed while the socket was down are lost: reload the history, the merge keeps what we hold.
        if (reconnect && mySession === session) void loadCandles(runId);
      },
    });

    store.dispatch({ type: "focus", focus, bar, nowMs: now() });
    store.dispatch({ type: "watchlist", instIds: watchlist });
    announceSwap();
    syncSubscriptions();
    publicSocket.start();
    businessSocket.start();

    skewMonitor = createSkewMonitor({
      fetch: fetchImpl,
      now,
      timers,
      url: restBase + "/api/v5/public/time",
      onSkew: (skewMs) => store.dispatch({ type: "skew", skewMs }),
    });
    skewMonitor.start();
    pulse();
    schedulePulse(mySession);
    scheduleProbe(mySession);
    void loadFocus(myRun).then(() => {
      if (mySession === session) void refreshSparks(mySession);
    });
  }

  function stop(): void {
    if (!running) return;
    running = false;
    session += 1;
    runId += 1;
    for (const handle of [pulseTimer, probeTimer, sparkTimer]) if (handle !== null) timers.clearTimeout(handle);
    pulseTimer = null;
    probeTimer = null;
    sparkTimer = null;
    skewMonitor?.stop();
    skewMonitor = null;
    seedAbort?.abort();
    seedAbort = null;
    seededKey = null;
    resync.clear();
    focusAbort?.abort();
    candleAbort?.abort();
    focusAbort = null;
    candleAbort = null;
    publicSocket?.stop();
    businessSocket?.stop();
    if (publicSocket) store.dispatch({ type: "feed", status: publicSocket.getStatus() });
    if (businessSocket) store.dispatch({ type: "feed", status: businessSocket.getStatus() });
    store.flush();
    publicSocket = null;
    businessSocket = null;
  }

  function setFocus(instId: string): void {
    if (instId === focus || instId.length === 0) return;
    focus = instId;
    store.dispatch({ type: "focus", focus, bar, nowMs: now() });
    if (!running) return;
    runId += 1;
    seedAbort?.abort();
    announceSwap();
    syncSubscriptions();
    // The sparklines belong to the watchlist, not to the focus: they keep their own five minute rhythm.
    void loadFocus(runId);
  }

  function setBar(next: DeskBar): void {
    if (next === bar) return;
    bar = next;
    store.dispatch({ type: "bar", bar, nowMs: now() });
    if (!running) return;
    syncSubscriptions();
    candlesLoaded = false;
    void loadCandles(runId);
  }

  function setWatchlist(instIds: readonly string[]): void {
    if (instIds.length === watchlist.length && instIds.every((id, i) => id === watchlist[i])) return;
    watchlist = [...instIds];
    store.dispatch({ type: "watchlist", instIds: watchlist });
    if (!running) return;
    syncSubscriptions();
    const myRun = runId;
    const mySession = session;
    const signal = (focusAbort ??= new AbortController()).signal;
    void resolveSwaps(watchlist.map(swapInstIdFor), myRun, signal).then(() => {
      if (mySession === session) void refreshSparks(mySession);
    });
  }

  return {
    store,
    start,
    stop,
    setFocus,
    setBar,
    setWatchlist,
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(listener),
    getDiagnostics: () => ({
      store: store.getDiagnostics(),
      publicSocket: publicSocket?.getStats() ?? null,
      businessSocket: businessSocket?.getStats() ?? null,
      protocolErrors: [...protocolErrors],
    }),
  };
}

