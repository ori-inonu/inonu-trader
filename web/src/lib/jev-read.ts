"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Jev reads the tape: the latest advisory buy, sell or hold per instrument, as served by GET /jev-read.
 * The server already projects the record through an allowlist; this parser is the second wall and refuses anything
 * that does not look exactly like it: a read that claims to execute, an unknown action, a non finite number.
 */

export type JevAction = "buy" | "sell" | "hold";
const ACTIONS: readonly JevAction[] = ["buy", "sell", "hold"];

export interface JevReadStateView {
  instId: string;
  horizonMinutes: number;
  mid: number;
  spreadBps: number;
  bookImbalanceTop5: number;
  volBpsPerMinute: number;
  depthQuoteTop5: { bid: number; ask: number };
  returnsBps: { m1: number; m5: number; m15: number; m30: number };
  flow60s: { count: number; buyBase: number; sellBase: number; cvdBase: number; imbalance: number | null; vwap: number | null; lastPx: number | null; lastSide: "buy" | "sell" | null };
  change24hPct: number | null;
  rangePosition24h: number | null;
  fundingRatePct: number | null;
}

export interface JevDecisionView {
  action: JevAction;
  probabilities: Record<JevAction, number>;
  confidence: number | null;
  latencyMs: number | null;
  model: string;
  status: "ok" | "error" | "timeout" | "malformed";
  inputTokens: number | null;
}

export interface JevReadView {
  readId: string;
  instId: string;
  /** On the exchange clock when clockOffsetMs is not null, on the producer's local clock otherwise. */
  atMs: number;
  clockOffsetMs: number | null;
  state: JevReadStateView | null;
  insufficient: string[];
  decision: JevDecisionView | null;
}

export interface JevReadBoardView {
  updatedAtMs: number;
  reads: Record<string, JevReadView>;
  recent: JevReadView[];
}

export interface JevReadBoardState {
  status: "idle" | "loading" | "ready" | "absent" | "error";
  board: JevReadBoardView | null;
  error: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const numOrNull = (value: unknown): number | null => (finite(value) ? value : null);

function numbers<K extends string>(source: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!isRecord(source)) return null;
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const value = source[key];
    if (!finite(value)) return null;
    out[key] = value;
  }
  return out;
}

function parseState(raw: unknown): JevReadStateView | null {
  if (!isRecord(raw) || typeof raw.instId !== "string") return null;
  const top = numbers(raw, ["horizonMinutes", "mid", "spreadBps", "bookImbalanceTop5", "volBpsPerMinute"] as const);
  const depth = numbers(raw.depthQuoteTop5, ["bid", "ask"] as const);
  const returns = numbers(raw.returnsBps, ["m1", "m5", "m15", "m30"] as const);
  const flowNumbers = numbers(raw.flow60s, ["count", "buyBase", "sellBase", "cvdBase"] as const);
  if (top === null || depth === null || returns === null || flowNumbers === null || !isRecord(raw.flow60s)) return null;
  const flow = raw.flow60s;
  return {
    instId: raw.instId,
    ...top,
    depthQuoteTop5: depth,
    returnsBps: returns,
    flow60s: { ...flowNumbers, imbalance: numOrNull(flow.imbalance), vwap: numOrNull(flow.vwap), lastPx: numOrNull(flow.lastPx), lastSide: flow.lastSide === "buy" || flow.lastSide === "sell" ? flow.lastSide : null },
    change24hPct: numOrNull(raw.change24hPct),
    rangePosition24h: numOrNull(raw.rangePosition24h),
    fundingRatePct: numOrNull(raw.fundingRatePct),
  };
}

function parseDecision(raw: unknown): JevDecisionView | null {
  if (!isRecord(raw)) return null;
  const action = ACTIONS.find((a) => a === raw.action);
  const status = (["ok", "error", "timeout", "malformed"] as const).find((s) => s === raw.status);
  const weights = numbers(raw.probabilities, ACTIONS);
  if (action === undefined || status === undefined || weights === null) return null;
  const tokens = raw.inputTokens;
  return {
    action,
    probabilities: weights,
    confidence: numOrNull(raw.confidence),
    latencyMs: numOrNull(raw.latencyMs),
    model: typeof raw.model === "string" ? raw.model : "unknown",
    status,
    inputTokens: typeof tokens === "number" && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null,
  };
}

export function parseJevRead(raw: unknown): JevReadView | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.advisory !== true || raw.execution !== "never") return null;
  if (typeof raw.readId !== "string" || typeof raw.instId !== "string" || !finite(raw.atMs)) return null;
  const state = raw.state === null ? null : parseState(raw.state);
  if (raw.state !== null && state === null) return null;
  const decision = raw.decision === null ? null : parseDecision(raw.decision);
  if (raw.decision !== null && decision === null) return null;
  return {
    readId: raw.readId,
    instId: raw.instId,
    atMs: raw.atMs,
    clockOffsetMs: numOrNull(raw.clockOffsetMs),
    state,
    insufficient: Array.isArray(raw.insufficient) ? raw.insufficient.filter((r): r is string => typeof r === "string").slice(0, 8) : [],
    decision,
  };
}

export function parseJevReadBoard(raw: unknown): JevReadBoardView | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !finite(raw.updatedAtMs)) return null;
  const reads: Record<string, JevReadView> = {};
  if (isRecord(raw.reads)) {
    for (const [key, value] of Object.entries(raw.reads)) {
      const parsed = parseJevRead(value);
      if (parsed !== null && parsed.instId === key) reads[key] = parsed;
    }
  }
  const recent = Array.isArray(raw.recent) ? raw.recent.map(parseJevRead).filter((r): r is JevReadView => r !== null) : [];
  return { updatedAtMs: raw.updatedAtMs, reads, recent };
}

/**
 * Age of a read in milliseconds. A read stamped on the exchange clock is compared with the browser clock corrected by
 * the measured skew (exchange minus browser); without a skew its age is unknown rather than guessed.
 */
export function readAgeMs(read: JevReadView, localNowMs: number, browserSkewMs: number | null): number | null {
  if (read.clockOffsetMs === null) return Math.max(0, localNowMs - read.atMs);
  if (browserSkewMs === null) return null;
  return Math.max(0, localNowMs + browserSkewMs - read.atMs);
}

export type ReadFreshness = "fresh" | "late" | "stale" | "unknown";

/** The producer reads each market about once a minute: past 90 s a read is late, past 5 minutes it is stale. */
export function readFreshness(ageMs: number | null): ReadFreshness {
  if (ageMs === null) return "unknown";
  if (ageMs <= 90_000) return "fresh";
  if (ageMs <= 300_000) return "late";
  return "stale";
}

type StateUpdate = JevReadBoardState | ((previous: JevReadBoardState) => JevReadBoardState);

/** One in flight read at a time. A disposed loader never publishes into a newer session. */
export function createJevReadLoader(apiUrl: string, setState: (update: StateUpdate) => void, fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  let disposed = false;
  let active: AbortController | null = null;
  const load = async () => {
    if (disposed || active) return;
    const controller = new AbortController();
    active = controller;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    setState((previous) => (previous.status === "idle" ? { ...previous, status: "loading" } : previous));
    try {
      const response = await fetcher(`${apiUrl}/jev-read`, { cache: "no-store", signal: controller.signal });
      if (response.status === 404) {
        if (!disposed && !controller.signal.aborted) setState({ status: "absent", board: null, error: null });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const board = parseJevReadBoard(await response.json());
      if (!board) throw new Error("quadro invalido");
      if (!disposed && !controller.signal.aborted) setState({ status: "ready", board, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!disposed) setState((previous) => ({ ...previous, status: "error", error: message }));
    } finally {
      clearTimeout(timeout);
      active = null;
    }
  };
  return { load, dispose: () => { disposed = true; active?.abort(); } };
}

export function useJevRead(apiUrl: string, intervalMs = 4_000): JevReadBoardState & { reload(): void } {
  const [state, setState] = useState<JevReadBoardState>({ status: "idle", board: null, error: null });
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    const loader = createJevReadLoader(apiUrl, setState);
    setState({ status: "idle", board: null, error: null });
    reload.current = () => { void loader.load(); };
    void loader.load();
    const timer = setInterval(() => { void loader.load(); }, Math.max(1_000, Number.isFinite(intervalMs) ? intervalMs : 4_000));
    return () => {
      loader.dispose();
      reload.current = () => {};
      clearInterval(timer);
    };
  }, [apiUrl, intervalMs]);

  return { ...state, reload: () => reload.current() };
}
