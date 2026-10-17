/**
 * Types and small helpers of the OKX WebSocket client (see okx-ws.ts).
 */

import { isRecord } from "./okx-parse";
import type { Timers } from "./runtime";
import type { DeskFeedStatus } from "./types";

export const OKX_PUBLIC_WS_URL = "wss://ws.okx.com/ws/v5/public";
export const OKX_BUSINESS_WS_URL = "wss://ws.okx.com/ws/v5/business";

/** The subset of the browser WebSocket this client uses. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface OkxSubscriptionArg {
  readonly channel: string;
  readonly instId: string;
}

export interface OkxWsMessage {
  readonly arg: OkxSubscriptionArg;
  /** snapshot or update on incremental channels, null on channels that have no action. */
  readonly action: "snapshot" | "update" | null;
  readonly data: readonly unknown[];
}

export interface OkxProtocolError {
  readonly code: string;
  readonly message: string;
}

export interface OkxSocketStats {
  /** Data messages per channel. */
  readonly messages: Readonly<Record<string, number>>;
  readonly malformed: number;
  readonly errors: number;
  readonly pongs: number;
}

export type OkxFeedId = "okx-public-ws" | "okx-business-ws";

export interface OkxSocketOptions {
  readonly feedId: OkxFeedId;
  readonly url?: string;
  readonly WebSocketCtor?: WebSocketCtor;
  readonly now?: () => number;
  readonly timers?: Timers;
  /** Uniform random in [0, 1). */
  readonly random?: () => number;
  readonly freshnessMs?: number;
  /** Silence before the client sends `ping`. */
  readonly heartbeatAfterMs?: number;
  /** Time allowed for any inbound frame after a `ping`. */
  readonly pongTimeoutMs?: number;
  readonly backoffBaseMs?: number;
  readonly backoffMaxMs?: number;
  /** A connection open at least this long resets the backoff. */
  readonly stableAfterMs?: number;
  /** Consecutive short lived or failed connections after which the feed is reported as failed (retries continue). */
  readonly failedAfterAttempts?: number;
  readonly onMessage: (message: OkxWsMessage) => void;
  readonly onProtocolError?: (error: OkxProtocolError) => void;
  readonly onStatusChange?: (status: DeskFeedStatus) => void;
  /** Called on every open; `reconnect` is true when this is not the first open since start. */
  readonly onOpen?: (info: { readonly reconnect: boolean }) => void;
}

export interface OkxSocket {
  readonly feedId: OkxFeedId;
  start(): void;
  stop(): void;
  subscribe(...args: readonly OkxSubscriptionArg[]): void;
  unsubscribe(...args: readonly OkxSubscriptionArg[]): void;
  /** Declarative sync: sends one unsubscribe for what left and one subscribe for what is new. */
  setSubscriptions(args: readonly OkxSubscriptionArg[]): void;
  /** Unsubscribes and subscribes again, which makes OKX send a fresh snapshot. */
  resubscribe(arg: OkxSubscriptionArg): void;
  subscriptions(): readonly OkxSubscriptionArg[];
  getStatus(nowMs?: number): DeskFeedStatus;
  getStats(): OkxSocketStats;
}

export function subscriptionKey(arg: OkxSubscriptionArg): string {
  return `${arg.channel}|${arg.instId}`;
}

export function parseArg(raw: unknown): OkxSubscriptionArg | null {
  if (!isRecord(raw)) return null;
  const { channel, instId } = raw;
  if (typeof channel !== "string" || channel.length === 0) return null;
  if (typeof instId !== "string" || instId.length === 0) return null;
  return { channel, instId };
}

function seconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000));
}
