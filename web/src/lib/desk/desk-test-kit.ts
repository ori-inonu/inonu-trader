/**
 * Test doubles of the desk data layer: a manual clock with timers, a fake WebSocket and a scriptable fetch.
 * Imported only by `*.test.ts` and the manual smoke script; never by production code.
 */

import type { FetchLike, FetchResponseLike } from "./okx-rest";
import type { WebSocketCtor, WebSocketLike } from "./okx-ws";
import type { TimerHandle, Timers } from "./runtime";

export class FakeClock implements Timers {
  nowMs: number;
  private seq = 0;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();

  constructor(startMs = 1_700_000_000_000) {
    this.nowMs = startMs;
  }

  readonly now = (): number => this.nowMs;

  setTimeout(fn: () => void, ms: number): TimerHandle {
    this.seq += 1;
    this.pending.set(this.seq, { at: this.nowMs + Math.max(0, ms), fn });
    return this.seq;
  }

  clearTimeout(handle: TimerHandle): void {
    this.pending.delete(handle as number);
  }

  pendingCount(): number {
    return this.pending.size;
  }

  /** Advances time, firing every timer that falls due, in order. Timers created while advancing fire too. */
  advance(ms: number): void {
    const target = this.nowMs + ms;
    for (;;) {
      let nextId = -1;
      let nextAt = Number.POSITIVE_INFINITY;
      for (const [id, timer] of this.pending) {
        if (timer.at <= target && timer.at < nextAt) {
          nextAt = timer.at;
          nextId = id;
        }
      }
      if (nextId < 0) break;
      const timer = this.pending.get(nextId);
      this.pending.delete(nextId);
      if (timer === undefined) break;
      this.nowMs = Math.max(this.nowMs, timer.at);
      timer.fn();
    }
    this.nowMs = target;
  }

  /** Like `advance`, but lets promises settle between steps. */
  async advanceAsync(ms: number, stepMs = 100): Promise<void> {
    let left = ms;
    await flushPromises();
    while (left > 0) {
      const step = Math.min(stepMs, left);
      this.advance(step);
      left -= step;
      await flushPromises();
    }
  }
}

export async function flushPromises(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

export class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  closeCall: { code: number | undefined; reason: string | undefined } | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    if (this.readyState !== 1) throw new Error("socket not open");
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCall = { code, reason };
    this.readyState = 3;
  }

  /** Server side: the handshake completes. */
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  /** Server side: a text frame arrives. Objects are sent as JSON. */
  receive(frame: unknown): void {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }

  /** Server side: the connection drops. */
  serverClose(code = 1006, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  /** Operations sent by the client, parsed (ping is reported as the string "ping"). */
  ops(): unknown[] {
    return this.sent.map((text) => (text === "ping" ? "ping" : (JSON.parse(text) as unknown)));
  }
}

export function createFakeWebSocketCtor(): { readonly Ctor: WebSocketCtor; readonly instances: FakeWebSocket[] } {
  const instances: FakeWebSocket[] = [];
  const Ctor = class extends FakeWebSocket {
    constructor(url: string) {
      super(url);
      instances.push(this);
    }
  };
  return { Ctor, instances };
}

export interface FakeFetchCall {
  readonly url: string;
}

export type FakeRoute = (url: URL) => { status?: number; body: unknown } | null;

/** A fetch that answers from a list of routes and records the calls. A route returns null to pass. */
export function createFakeFetch(routes: readonly FakeRoute[]): { readonly fetch: FetchLike; readonly calls: FakeFetchCall[] } {
  const calls: FakeFetchCall[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push({ url });
    const parsed = new URL(url);
    for (const route of routes) {
      const answer = route(parsed);
      if (answer === null) continue;
      const status = answer.status ?? 200;
      const response: FetchResponseLike = {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body)),
      };
      return response;
    }
    return { ok: false, status: 404, text: async () => "not found" };
  };
  return { fetch, calls };
}

export const okEnvelope = (data: unknown): { code: string; msg: string; data: unknown } => ({ code: "0", msg: "", data });

// ---------------------------------------------------------------------------
// Payload builders with the exact OKX shapes
// ---------------------------------------------------------------------------

export function candleRow(tsMs: number, close: number, confirmed = true): string[] {
  const c = String(close);
  return [String(tsMs), c, String(close + 1), String(close - 1), c, "10", String(close * 10), String(close * 10), confirmed ? "1" : "0"];
}

export function tradeRow(instId: string, tradeId: string, px: string, sz: string, side: "buy" | "sell", tsMs: number): Record<string, string> {
  return { instId, tradeId, px, sz, side, ts: String(tsMs), count: "1" };
}

export function tickerRow(instId: string, last: string, tsMs: number, extra: Record<string, string> = {}): Record<string, string> {
  return {
    instType: instId.endsWith("-SWAP") ? "SWAP" : "SPOT",
    instId,
    last,
    lastSz: "1",
    askPx: last,
    askSz: "2",
    bidPx: last,
    bidSz: "3",
    open24h: last,
    high24h: last,
    low24h: last,
    volCcy24h: "1000",
    vol24h: "10",
    ts: String(tsMs),
    ...extra,
  };
}

export function instrumentRow(instId: string, state = "live"): Record<string, string> {
  const swap = instId.endsWith("-SWAP");
  const [base = "", quote = ""] = instId.split("-");
  return {
    instType: swap ? "SWAP" : "SPOT",
    instId,
    state,
    baseCcy: swap ? "" : base,
    quoteCcy: swap ? "" : quote,
    instFamily: swap ? `${base}-${quote}` : "",
    ctValCcy: swap ? base : "",
    settleCcy: swap ? quote : "",
    tickSz: "0.1",
    lotSz: swap ? "1" : "0.001",
  };
}

export function bookMessage(
  channel: "books" | "books5",
  instId: string,
  action: "snapshot" | "update" | null,
  row: Record<string, unknown>,
): unknown {
  return { arg: { channel, instId }, ...(action ? { action } : {}), data: [row] };
}
