/**
 * Explicit projection of a Jev read for the dashboard. Only the listed fields are copied, only typed values survive,
 * and the model name is shown only when it looks like a Jev model id, so provider free text, extra journal fields and
 * anything else that ends up in the file never reach the API. A record that contradicts itself is dropped entirely.
 */

import { JEV_READ_SCHEMA_VERSION, TAPE_ACTIONS, type TapeAction } from "./types";

const REASONS = new Set(["book_missing", "book_stale", "book_crossed", "ticker_missing", "ticker_stale", "candles_short", "candles_stale"]);
const STATUSES = ["ok", "error", "timeout", "malformed"] as const;
const READ_ID = /^jr-[a-z0-9-]{1,40}$/;
const INST_ID = /^[A-Z0-9]{1,12}-[A-Z0-9]{1,12}(?:-SWAP)?$/;
const MODEL_ID = /^jev-(?:latest|\d+\.\d+\.\d+)$/;
const MAX_RECENT = 60;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const finiteOrNull = (value: unknown): number | null => (finite(value) ? value : null);

function numbersOf(source: unknown, keys: readonly string[]): Record<string, number> | null {
  if (!isRecord(source)) return null;
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = source[key];
    if (!finite(value)) return null;
    out[key] = value;
  }
  return out;
}

function projectState(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw) || typeof raw.instId !== "string" || !INST_ID.test(raw.instId)) return null;
  const top = numbersOf(raw, ["horizonMinutes", "mid", "spreadBps", "bookImbalanceTop5", "volBpsPerMinute"]);
  const depth = numbersOf(raw.depthQuoteTop5, ["bid", "ask"]);
  const returns = numbersOf(raw.returnsBps, ["m1", "m5", "m15", "m30"]);
  const flowNumbers = numbersOf(raw.flow60s, ["count", "buyBase", "sellBase", "cvdBase"]);
  if (top === null || depth === null || returns === null || flowNumbers === null || !isRecord(raw.flow60s)) return null;
  const flow = raw.flow60s;
  return {
    instId: raw.instId,
    ...top,
    depthQuoteTop5: depth,
    returnsBps: returns,
    flow60s: {
      ...flowNumbers,
      imbalance: finiteOrNull(flow.imbalance),
      vwap: finiteOrNull(flow.vwap),
      lastPx: finiteOrNull(flow.lastPx),
      lastSide: flow.lastSide === "buy" || flow.lastSide === "sell" ? flow.lastSide : null,
    },
    change24hPct: finiteOrNull(raw.change24hPct),
    rangePosition24h: finiteOrNull(raw.rangePosition24h),
    fundingRatePct: finiteOrNull(raw.fundingRatePct),
  };
}

function projectDecision(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const action = raw.action;
  if (typeof action !== "string" || !(TAPE_ACTIONS as readonly string[]).includes(action)) return null;
  const weights = numbersOf(raw.probabilities, [...TAPE_ACTIONS]);
  if (weights === null || Object.values(weights).some((w) => w < 0 || w > 1)) return null;
  const status = STATUSES.find((s) => s === raw.status);
  if (status === undefined) return null;
  if (status === "ok" && !(weights[action as TapeAction]! > 0)) return null;
  if (status !== "ok" && action !== "hold") return null;
  const tokens = raw.inputTokens;
  return {
    action,
    probabilities: weights,
    confidence: finiteOrNull(raw.confidence),
    latencyMs: finite(raw.latencyMs) && raw.latencyMs >= 0 ? raw.latencyMs : null,
    model: typeof raw.model === "string" && MODEL_ID.test(raw.model) ? raw.model : "unknown",
    status,
    inputTokens: typeof tokens === "number" && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null,
  };
}

export function publicReadView(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input) || input.schemaVersion !== JEV_READ_SCHEMA_VERSION) return null;
  if (input.advisory !== true || input.execution !== "never") return null;
  if (typeof input.readId !== "string" || !READ_ID.test(input.readId)) return null;
  if (typeof input.instId !== "string" || !INST_ID.test(input.instId)) return null;
  if (!finite(input.atMs) || input.atMs <= 0) return null;

  const insufficient = Array.isArray(input.insufficient) ? input.insufficient.filter((r): r is string => typeof r === "string" && REASONS.has(r)).slice(0, 8) : [];
  const state = input.state === null ? null : projectState(input.state);
  if (input.state !== null && state === null) return null;
  const decision = input.decision === null ? null : projectDecision(input.decision);
  if (input.decision !== null && decision === null) return null;

  if (state === null && (decision !== null || insufficient.length === 0)) return null;
  if (state !== null && insufficient.length > 0) return null;
  if (state !== null && state.instId !== input.instId) return null;

  return {
    schemaVersion: JEV_READ_SCHEMA_VERSION,
    readId: input.readId,
    instId: input.instId,
    atMs: input.atMs,
    clockOffsetMs: finiteOrNull(input.clockOffsetMs),
    advisory: true,
    execution: "never",
    state,
    insufficient,
    decision,
  };
}

export function publicBoardView(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input) || input.schemaVersion !== JEV_READ_SCHEMA_VERSION || !finite(input.updatedAtMs) || input.updatedAtMs <= 0) return null;
  const reads: Record<string, unknown> = {};
  if (isRecord(input.reads)) {
    for (const [key, value] of Object.entries(input.reads).slice(0, 32)) {
      const view = publicReadView(value);
      if (view !== null && view.instId === key) reads[key] = view;
    }
  }
  const recent = Array.isArray(input.recent) ? input.recent.map(publicReadView).filter((v): v is Record<string, unknown> => v !== null).slice(0, MAX_RECENT) : [];
  return { schemaVersion: JEV_READ_SCHEMA_VERSION, updatedAtMs: input.updatedAtMs, reads, recent };
}
