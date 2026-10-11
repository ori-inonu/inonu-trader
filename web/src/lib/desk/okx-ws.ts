/**
 * Reconnecting client of the OKX public v5 WebSocket (keyless): `/ws/v5/public` and `/ws/v5/business`.
 *
 * - Injectable WebSocket constructor, clock, timers and random source, so it is deterministic under test.
 * - Exponential backoff with jitter, 1 s doubling up to 30 s. The attempt counter only resets after a connection stayed
 *   open for a while, so a server that accepts and immediately drops cannot be hammered.
 * - OKX heartbeat: the text `ping` after 20 s without any inbound frame, any inbound frame (the `pong`, or data)
 *   proves life, no answer within the timeout closes and reconnects.
 * - Per socket subscription set, resent in full after every reconnect, with runtime subscribe and unsubscribe.
 * - `getStatus` yields the `DeskFeedStatus` of the feed, with the freshness window of `DESK_FRESHNESS_MS` and a
 *   Portuguese reason whenever the feed is not live. Only data frames count as messages for freshness: acks and
 *   pongs prove the connection, not that data is flowing.
 */
import { isRecord } from "./okx-parse";
import {
  OKX_BUSINESS_WS_URL,
  OKX_PUBLIC_WS_URL,
  parseArg,
  subscriptionKey,
  type OkxProtocolError,
  type OkxSocket,
  type OkxSocketOptions,
  type OkxSubscriptionArg,
  type WebSocketCtor,
  type WebSocketLike,
} from "./okx-ws-types";
import { systemNow, systemTimers, type TimerHandle } from "./runtime";
import { DESK_FRESHNESS_MS, type DeskFeedState, type DeskFeedStatus } from "./types";

export * from "./okx-ws-types";

const WS_OPEN = 1;
const MAX_ARGS_PER_OP = 50;


function seconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000));
}

export function createOkxSocket(options: OkxSocketOptions): OkxSocket {
  const feedId = options.feedId;
  const url = options.url ?? (feedId === "okx-public-ws" ? OKX_PUBLIC_WS_URL : OKX_BUSINESS_WS_URL);
  const now = options.now ?? systemNow;
  const timers = options.timers ?? systemTimers;
  const random = options.random ?? Math.random;
  const freshnessMs = options.freshnessMs ?? DESK_FRESHNESS_MS[feedId];
  const heartbeatAfterMs = options.heartbeatAfterMs ?? 20_000;
  const pongTimeoutMs = options.pongTimeoutMs ?? 5_000;
  const backoffBaseMs = options.backoffBaseMs ?? 1_000;
  const backoffMaxMs = options.backoffMaxMs ?? 30_000;
  const stableAfterMs = options.stableAfterMs ?? 10_000;
  const failedAfterAttempts = options.failedAfterAttempts ?? 5;

  const subs = new Map<string, OkxSubscriptionArg>();
  const messageCounts: Record<string, number> = {};
  let malformed = 0;
  let errors = 0;
  let pongs = 0;

  let wanted = false;
  let everStarted = false;
  let everOpened = false;
  let phase: "idle" | "connecting" | "open" | "backoff" = "idle";
  let socket: WebSocketLike | null = null;
  let failures = 0;
  let reconnects = 0;
  let openedAtMs: number | null = null;
  let lastMessageAtMs: number | null = null;
  let lastFrameAtMs = 0;
  let nextRetryAtMs: number | null = null;
  let lastCloseDetail = "";
  let fatal: string | null = null;
  let silenceTimer: TimerHandle | null = null;
  let pongTimer: TimerHandle | null = null;
  let retryTimer: TimerHandle | null = null;
  let lastEmitted = "";

  function getStatus(nowMs: number = now()): DeskFeedStatus {
    let state: DeskFeedState;
    let detail: string | null;
    if (fatal !== null) {
      state = "failed";
      detail = fatal;
    } else if (phase === "idle") {
      state = "idle";
      detail = everStarted ? "Conexão encerrada." : "Aguardando início.";
    } else if (phase === "connecting") {
      if (failures === 0) {
        state = "connecting";
        detail = "Abrindo a conexão com a OKX.";
      } else {
        state = "reconnecting";
        detail = `Reconectando, tentativa ${failures + 1}.`;
      }
    } else if (phase === "backoff") {
      const wait = nextRetryAtMs === null ? 0 : seconds(nextRetryAtMs - nowMs);
      if (failures >= failedAfterAttempts) {
        state = "failed";
        detail = `Sem conexão com a OKX após ${failures} tentativas. Nova tentativa em ${wait} s.`;
      } else {
        state = "reconnecting";
        detail = `Conexão perdida${lastCloseDetail ? ` (${lastCloseDetail})` : ""}. Nova tentativa em ${wait} s.`;
      }
    } else {
      const dataSinceOpen = lastMessageAtMs !== null && openedAtMs !== null && lastMessageAtMs >= openedAtMs;
      if (!dataSinceOpen) {
        const waited = openedAtMs === null ? 0 : nowMs - openedAtMs;
        if (waited <= freshnessMs) {
          state = "connecting";
          detail = "Conectado, aguardando os primeiros dados.";
        } else {
          state = "stale";
          detail = `Conectado, mas sem dados há ${seconds(waited)} s.`;
        }
      } else {
        const age = nowMs - (lastMessageAtMs as number);
        if (age <= freshnessMs) {
          state = "live";
          detail = null;
        } else {
          state = "stale";
          detail = `Sem dados há ${seconds(age)} s, limite de ${seconds(freshnessMs)} s.`;
        }
      }
    }
    return { id: feedId, state, lastMessageAtMs, freshnessMs, reconnects, detail };
  }

  function emitStatus(): void {
    if (options.onStatusChange === undefined) return;
    const status = getStatus();
    const key = `${status.state}|${status.reconnects}|${status.detail ?? ""}`;
    if (key === lastEmitted) return;
    lastEmitted = key;
    options.onStatusChange(status);
  }

  function clearTimer(handle: TimerHandle | null): null {
    if (handle !== null) timers.clearTimeout(handle);
    return null;
  }

  function send(payload: string): boolean {
    if (socket === null || socket.readyState !== WS_OPEN) return false;
    try {
      socket.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  function sendOp(op: "subscribe" | "unsubscribe", args: readonly OkxSubscriptionArg[]): void {
    for (let i = 0; i < args.length; i += MAX_ARGS_PER_OP) {
      send(JSON.stringify({ op, args: args.slice(i, i + MAX_ARGS_PER_OP) }));
    }
  }

  function armSilence(delayMs: number): void {
    silenceTimer = clearTimer(silenceTimer);
    silenceTimer = timers.setTimeout(onSilence, delayMs);
  }

  function onSilence(): void {
    silenceTimer = null;
    if (phase !== "open") return;
    const quietFor = now() - lastFrameAtMs;
    if (quietFor < heartbeatAfterMs) {
      armSilence(heartbeatAfterMs - quietFor);
      return;
    }
    send("ping");
    pongTimer = clearTimer(pongTimer);
    pongTimer = timers.setTimeout(onPongTimeout, pongTimeoutMs);
    armSilence(heartbeatAfterMs);
  }

  function onPongTimeout(): void {
    pongTimer = null;
    if (phase !== "open" || socket === null) return;
    dropSocket("sem resposta ao ping");
  }

  /** Detaches and closes the current socket, then handles it as a connection loss. */
  function dropSocket(detail: string): void {
    const current = socket;
    if (current !== null) {
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      try {
        current.close(4000, detail);
      } catch {
        // already closed
      }
    }
    handleClose(detail);
  }

  function handleClose(detail: string): void {
    silenceTimer = clearTimer(silenceTimer);
    pongTimer = clearTimer(pongTimer);
    const wasStable = openedAtMs !== null && now() - openedAtMs >= stableAfterMs;
    socket = null;
    openedAtMs = null;
    if (!wanted) {
      phase = "idle";
      emitStatus();
      return;
    }
    if (wasStable) failures = 0;
    failures += 1;
    lastCloseDetail = detail;
    const exponential = Math.min(backoffMaxMs, backoffBaseMs * 2 ** (failures - 1));
    const delay = Math.round(exponential * (0.75 + 0.25 * random()));
    phase = "backoff";
    nextRetryAtMs = now() + delay;
    retryTimer = clearTimer(retryTimer);
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      reconnects += 1;
      connect();
    }, delay);
    emitStatus();
  }

  function resolveCtor(): WebSocketCtor | null {
    if (options.WebSocketCtor !== undefined) return options.WebSocketCtor;
    return typeof globalThis.WebSocket === "function" ? (globalThis.WebSocket as unknown as WebSocketCtor) : null;
  }

  function connect(): void {
    retryTimer = clearTimer(retryTimer);
    nextRetryAtMs = null;
    const Ctor = resolveCtor();
    if (Ctor === null) {
      fatal = "WebSocket indisponível neste ambiente.";
      phase = "idle";
      emitStatus();
      return;
    }
    phase = "connecting";
    emitStatus();
    let created: WebSocketLike;
    try {
      created = new Ctor(url);
    } catch {
      handleClose("falha ao abrir o socket");
      return;
    }
    socket = created;
    created.onopen = () => {
      if (socket !== created) return;
      phase = "open";
      openedAtMs = now();
      lastFrameAtMs = openedAtMs;
      const reconnect = everOpened;
      everOpened = true;
      if (subs.size > 0) sendOp("subscribe", [...subs.values()]);
      armSilence(heartbeatAfterMs);
      emitStatus();
      options.onOpen?.({ reconnect });
    };
    created.onmessage = (event) => {
      if (socket !== created) return;
      onFrame(event.data);
    };
    created.onerror = () => {
      if (socket !== created) return;
      lastCloseDetail = "erro de rede";
    };
    created.onclose = (event) => {
      if (socket !== created) return;
      handleClose(event.reason ? event.reason : `código ${event.code}`);
    };
  }

  function onFrame(data: unknown): void {
    const t = now();
    lastFrameAtMs = t;
    pongTimer = clearTimer(pongTimer);
    if (typeof data !== "string") {
      malformed += 1;
      return;
    }
    if (data === "pong") {
      pongs += 1;
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      malformed += 1;
      return;
    }
    if (!isRecord(json)) {
      malformed += 1;
      return;
    }
    if (typeof json.event === "string") {
      onEvent(json);
      return;
    }
    const arg = parseArg(json.arg);
    const payload = json.data;
    if (arg === null || !Array.isArray(payload)) {
      malformed += 1;
      return;
    }
    lastMessageAtMs = t;
    messageCounts[arg.channel] = (messageCounts[arg.channel] ?? 0) + 1;
    const action = json.action === "snapshot" || json.action === "update" ? json.action : null;
    options.onMessage({ arg, action, data: payload });
    if (lastEmitted.startsWith("live|") === false) emitStatus();
  }

  function onEvent(json: Record<string, unknown>): void {
    if (json.event === "error") {
      errors += 1;
      options.onProtocolError?.({
        code: typeof json.code === "string" ? json.code : "",
        message: typeof json.msg === "string" ? json.msg : "",
      });
      return;
    }
    if (json.event === "notice" && json.code === "64008") {
      // OKX announces a service upgrade and will close the connection: reconnect at the base delay, without penalty.
      failures = 0;
      dropSocket("manutenção anunciada pela OKX");
    }
  }

  function start(): void {
    if (wanted) return;
    wanted = true;
    everStarted = true;
    everOpened = false;
    failures = 0;
    fatal = null;
    connect();
  }

  function stop(): void {
    wanted = false;
    silenceTimer = clearTimer(silenceTimer);
    pongTimer = clearTimer(pongTimer);
    retryTimer = clearTimer(retryTimer);
    const current = socket;
    socket = null;
    openedAtMs = null;
    nextRetryAtMs = null;
    if (current !== null) {
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      try {
        current.close(1000, "stop");
      } catch {
        // already closed
      }
    }
    phase = "idle";
    emitStatus();
  }

  function subscribe(...args: readonly OkxSubscriptionArg[]): void {
    const added: OkxSubscriptionArg[] = [];
    for (const arg of args) {
      const key = subscriptionKey(arg);
      if (subs.has(key)) continue;
      subs.set(key, arg);
      added.push(arg);
    }
    if (added.length > 0 && phase === "open") sendOp("subscribe", added);
  }

  function unsubscribe(...args: readonly OkxSubscriptionArg[]): void {
    const removed: OkxSubscriptionArg[] = [];
    for (const arg of args) {
      if (subs.delete(subscriptionKey(arg))) removed.push(arg);
    }
    if (removed.length > 0 && phase === "open") sendOp("unsubscribe", removed);
  }

  function setSubscriptions(args: readonly OkxSubscriptionArg[]): void {
    const wantedKeys = new Set(args.map(subscriptionKey));
    const leaving = [...subs.values()].filter((arg) => !wantedKeys.has(subscriptionKey(arg)));
    if (leaving.length > 0) unsubscribe(...leaving);
    subscribe(...args);
  }

  function resubscribe(arg: OkxSubscriptionArg): void {
    if (!subs.has(subscriptionKey(arg)) || phase !== "open") return;
    sendOp("unsubscribe", [arg]);
    sendOp("subscribe", [arg]);
  }

  return {
    feedId,
    start,
    stop,
    subscribe,
    unsubscribe,
    setSubscriptions,
    resubscribe,
    subscriptions: () => [...subs.values()],
    getStatus,
    getStats: () => ({ messages: { ...messageCounts }, malformed, errors, pongs }),
  };
}
