"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Jev reads the tape: the latest advisory buy, sell or hold per instrument, as served by GET /jev-read.
 * The server already projects the record through an allowlist; this parser is the second wall and refuses anything
 * that does not look exactly like it: a read that claims to execute, an unknown action, a non finite number.
 */

export type JevAction = "buy" | "sell" | "hold";
const ACTIONS: readonly JevAction[] = ["buy", "sell", "hold"];

export interface JevAnalysisLevelView {
  px: number;
  kind: "support" | "resistance";
  touches: number;
  tf: "15m" | "1h";
}

export interface JevTrendView {
  regime: "up" | "down" | "range";
  adx15m: number;
  efficiency15m: number;
  emaStack15m: number;
  emaStack1h: number;
  emaStack4h: number;
  extensionAtr15m: number;
}

export interface JevMomentumView {
  rsi5m: number;
  rsi15m: number;
  rsi1h: number;
  macdHistAtr15m: number;
}

export interface JevVolatilityView {
  atrBps15m: number;
  atrBps1h: number;
  volRank24h: number;
  bbWidthRank15m: number;
  bbPercentB15m: number;
  expectedAbsMove5mBps: number;
}

export interface JevSmcView {
  demandBlockBps: number | null;
  supplyBlockBps: number | null;
  gapsUp: number;
  gapsDown: number;
  gapNearestBps: number | null;
  lastBreak: { kind: "BOS" | "CHoCH"; dir: "up" | "down"; ageBars: number } | null;
  rangePos: number | null;
  rangeState: "inside" | "above" | "below" | null;
  poolAboveBps: number | null;
  poolBelowBps: number | null;
  lastSweep: { kind: "highs" | "lows"; ageBars: number } | null;
}

export interface JevStructureView {
  donchianPos1h: number;
  supportBps: number | null;
  supportTouches: number | null;
  resistanceBps: number | null;
  resistanceTouches: number | null;
  renkoRun15m: number;
  levels: JevAnalysisLevelView[];
  smc15m?: JevSmcView;
  smc1h?: JevSmcView;
}

export type JevOiRegime = "long_buildup" | "short_buildup" | "short_covering" | "long_unwind" | "mixed";

export interface JevDerivativesView {
  fundingZ: number | null;
  fundingPctile: number | null;
  oiChange1hPct: number | null;
  oiPriceRegime: JevOiRegime | null;
  longShortRatio: number | null;
  longShortZ: number | null;
  takerBuyShare1h: number | null;
}

export interface JevCrossAssetView {
  corrBtc48h: number;
  betaBtc48h: number;
  relStrengthVsBtc24hBps: number;
}

export interface JevCostView {
  assumedRoundTripFeeBps: number;
  spreadBps: number;
  moveToCost: number;
}

/**
 * The optional Python digest. The same contract the producer validates: a section is absent when the pack could
 * not compute it, and an analysis with no surviving section does not exist. Descriptive only, never a decision.
 */
export interface JevAnalysisView {
  ageSec: number;
  trend?: JevTrendView;
  momentum?: JevMomentumView;
  volatility?: JevVolatilityView;
  structure?: JevStructureView;
  derivatives?: JevDerivativesView;
  crossAsset?: JevCrossAssetView;
  cost?: JevCostView;
}

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
  analysis?: JevAnalysisView;
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
const inRange = (value: unknown, lo: number, hi: number, loExclusive = false): value is number =>
  finite(value) && (loExclusive ? value > lo : value >= lo) && value <= hi;

/** The analysis is descriptive data, so a decision-flavored key inside it refuses the whole block. */
const ANALYSIS_FORBIDDEN = new Set(["buy", "sell", "hold", "action", "signal", "signals", "recommend", "recommendation", "vote", "side"]);

function analysisHasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(analysisHasForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, item]) => ANALYSIS_FORBIDDEN.has(key) || analysisHasForbiddenKey(item));
}

function parseTrend(raw: unknown): JevTrendView | null {
  if (!isRecord(raw)) return null;
  if (raw.regime !== "up" && raw.regime !== "down" && raw.regime !== "range") return null;
  if (!inRange(raw.adx15m, 0, 100) || !inRange(raw.efficiency15m, 0, 1) || !finite(raw.extensionAtr15m)) return null;
  const stacks = ["emaStack15m", "emaStack1h", "emaStack4h"] as const;
  for (const key of stacks) {
    const value = raw[key];
    if (!Number.isInteger(value) || (value !== -1 && value !== 0 && value !== 1)) return null;
  }
  return {
    regime: raw.regime,
    adx15m: raw.adx15m,
    efficiency15m: raw.efficiency15m,
    emaStack15m: raw.emaStack15m as number,
    emaStack1h: raw.emaStack1h as number,
    emaStack4h: raw.emaStack4h as number,
    extensionAtr15m: raw.extensionAtr15m,
  };
}

function parseMomentum(raw: unknown): JevMomentumView | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.rsi5m, 0, 100) || !inRange(raw.rsi15m, 0, 100) || !inRange(raw.rsi1h, 0, 100)) return null;
  if (!finite(raw.macdHistAtr15m)) return null;
  return { rsi5m: raw.rsi5m, rsi15m: raw.rsi15m, rsi1h: raw.rsi1h, macdHistAtr15m: raw.macdHistAtr15m };
}

function parseVolatility(raw: unknown): JevVolatilityView | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.atrBps15m, 0, Number.POSITIVE_INFINITY, true) || !inRange(raw.atrBps1h, 0, Number.POSITIVE_INFINITY, true)) return null;
  if (!inRange(raw.volRank24h, 0, 1, true) || !inRange(raw.bbWidthRank15m, 0, 1, true)) return null;
  if (!finite(raw.bbPercentB15m) || !inRange(raw.expectedAbsMove5mBps, 0, Number.POSITIVE_INFINITY)) return null;
  return {
    atrBps15m: raw.atrBps15m,
    atrBps1h: raw.atrBps1h,
    volRank24h: raw.volRank24h,
    bbWidthRank15m: raw.bbWidthRank15m,
    bbPercentB15m: raw.bbPercentB15m,
    expectedAbsMove5mBps: raw.expectedAbsMove5mBps,
  };
}

function parseLevel(raw: unknown): JevAnalysisLevelView | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.px, 0, Number.POSITIVE_INFINITY, true)) return null;
  if (raw.kind !== "support" && raw.kind !== "resistance") return null;
  if (!Number.isInteger(raw.touches) || (raw.touches as number) < 1) return null;
  if (raw.tf !== "15m" && raw.tf !== "1h") return null;
  return { px: raw.px, kind: raw.kind, touches: raw.touches as number, tf: raw.tf };
}

const SMC_MAX_BPS = 1_000_000;
const SMC_MAX_AGE_BARS = 100_000;
const SMC_MAX_COUNT = 1_000;
const smcBps = (value: unknown): value is number | null | undefined => value === null || value === undefined || inRange(value, 0, SMC_MAX_BPS);
const smcInt = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

function parseSmc(raw: unknown): JevSmcView | null {
  if (!isRecord(raw)) return null;
  if (!smcBps(raw.demandBlockBps) || !smcBps(raw.supplyBlockBps) || !smcBps(raw.gapNearestBps) || !smcBps(raw.poolAboveBps) || !smcBps(raw.poolBelowBps)) return null;
  if (!smcInt(raw.gapsUp, SMC_MAX_COUNT) || !smcInt(raw.gapsDown, SMC_MAX_COUNT)) return null;
  if (raw.rangePos !== null && raw.rangePos !== undefined && !inRange(raw.rangePos, 0, 1)) return null;
  const state = raw.rangeState;
  if (state !== null && state !== undefined && state !== "inside" && state !== "above" && state !== "below") return null;
  let lastBreak: JevSmcView["lastBreak"] = null;
  if (raw.lastBreak !== null && raw.lastBreak !== undefined) {
    const b = raw.lastBreak;
    if (!isRecord(b) || (b.kind !== "BOS" && b.kind !== "CHoCH") || (b.dir !== "up" && b.dir !== "down") || !smcInt(b.ageBars, SMC_MAX_AGE_BARS)) return null;
    lastBreak = { kind: b.kind, dir: b.dir, ageBars: b.ageBars };
  }
  let lastSweep: JevSmcView["lastSweep"] = null;
  if (raw.lastSweep !== null && raw.lastSweep !== undefined) {
    const s = raw.lastSweep;
    if (!isRecord(s) || (s.kind !== "highs" && s.kind !== "lows") || !smcInt(s.ageBars, SMC_MAX_AGE_BARS)) return null;
    lastSweep = { kind: s.kind, ageBars: s.ageBars };
  }
  return {
    demandBlockBps: raw.demandBlockBps ?? null,
    supplyBlockBps: raw.supplyBlockBps ?? null,
    gapsUp: raw.gapsUp,
    gapsDown: raw.gapsDown,
    gapNearestBps: raw.gapNearestBps ?? null,
    lastBreak,
    rangePos: raw.rangePos ?? null,
    rangeState: (state ?? null) as JevSmcView["rangeState"],
    poolAboveBps: raw.poolAboveBps ?? null,
    poolBelowBps: raw.poolBelowBps ?? null,
    lastSweep,
  };
}

function parseStructure(raw: unknown): JevStructureView | null {
  if (!isRecord(raw) || !finite(raw.donchianPos1h) || !Number.isInteger(raw.renkoRun15m)) return null;
  if (!Array.isArray(raw.levels) || raw.levels.length > 6) return null;
  const levels: JevAnalysisLevelView[] = [];
  for (const item of raw.levels) {
    const level = parseLevel(item);
    if (level === null) return null;
    levels.push(level);
  }
  if (raw.supportBps !== null && raw.supportBps !== undefined && !inRange(raw.supportBps, 0, Number.POSITIVE_INFINITY)) return null;
  if (raw.resistanceBps !== null && raw.resistanceBps !== undefined && !inRange(raw.resistanceBps, 0, Number.POSITIVE_INFINITY)) return null;
  for (const key of ["supportTouches", "resistanceTouches"] as const) {
    const value = raw[key];
    if (value !== null && value !== undefined && (!Number.isInteger(value) || (value as number) < 1)) return null;
  }
  const smc15m = parseSmc(raw.smc15m);
  const smc1h = parseSmc(raw.smc1h);
  return {
    donchianPos1h: raw.donchianPos1h,
    supportBps: raw.supportBps ?? null,
    supportTouches: (raw.supportTouches ?? null) as number | null,
    resistanceBps: raw.resistanceBps ?? null,
    resistanceTouches: (raw.resistanceTouches ?? null) as number | null,
    renkoRun15m: raw.renkoRun15m as number,
    levels,
    ...(smc15m === null ? {} : { smc15m }),
    ...(smc1h === null ? {} : { smc1h }),
  };
}

const OI_REGIMES = new Set<JevOiRegime>(["long_buildup", "short_buildup", "short_covering", "long_unwind", "mixed"]);

function parseDerivatives(raw: unknown): JevDerivativesView | null {
  if (!isRecord(raw)) return null;
  for (const key of ["fundingZ", "oiChange1hPct", "longShortZ"] as const) {
    const value = raw[key];
    if (value !== null && value !== undefined && !finite(value)) return null;
  }
  if (raw.fundingPctile !== null && raw.fundingPctile !== undefined && !inRange(raw.fundingPctile, 0, 1)) return null;
  if (raw.takerBuyShare1h !== null && raw.takerBuyShare1h !== undefined && !inRange(raw.takerBuyShare1h, 0, 1)) return null;
  if (raw.longShortRatio !== null && raw.longShortRatio !== undefined && !inRange(raw.longShortRatio, 0, Number.POSITIVE_INFINITY, true)) return null;
  const regime = raw.oiPriceRegime;
  if (regime !== null && regime !== undefined && !OI_REGIMES.has(regime as JevOiRegime)) return null;
  const out: JevDerivativesView = {
    fundingZ: numOrNull(raw.fundingZ),
    fundingPctile: numOrNull(raw.fundingPctile),
    oiChange1hPct: numOrNull(raw.oiChange1hPct),
    oiPriceRegime: (regime ?? null) as JevOiRegime | null,
    longShortRatio: numOrNull(raw.longShortRatio),
    longShortZ: numOrNull(raw.longShortZ),
    takerBuyShare1h: numOrNull(raw.takerBuyShare1h),
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

function parseCrossAsset(raw: unknown): JevCrossAssetView | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.corrBtc48h, -1, 1) || !finite(raw.betaBtc48h) || !finite(raw.relStrengthVsBtc24hBps)) return null;
  return { corrBtc48h: raw.corrBtc48h, betaBtc48h: raw.betaBtc48h, relStrengthVsBtc24hBps: raw.relStrengthVsBtc24hBps };
}

function parseCost(raw: unknown): JevCostView | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.assumedRoundTripFeeBps, 0, Number.POSITIVE_INFINITY, true)) return null;
  if (!inRange(raw.spreadBps, 0, Number.POSITIVE_INFINITY) || !inRange(raw.moveToCost, 0, Number.POSITIVE_INFINITY)) return null;
  return { assumedRoundTripFeeBps: raw.assumedRoundTripFeeBps, spreadBps: raw.spreadBps, moveToCost: raw.moveToCost };
}

/**
 * Deliberate copy of the backend projectAnalysis: the browser cannot import from src/, and this parser is the
 * last wall before a number is shown. A section that violates the contract is dropped; a decision-flavored key
 * anywhere drops the whole block; an analysis with no surviving section does not exist.
 */
export function parseAnalysis(raw: unknown): JevAnalysisView | null {
  if (!isRecord(raw)) return null;
  if (!Number.isInteger(raw.ageSec) || (raw.ageSec as number) < 0 || (raw.ageSec as number) > 86_400) return null;
  if (analysisHasForbiddenKey(raw)) return null;
  const out: Record<string, unknown> = { ageSec: raw.ageSec };
  let sections = 0;
  const parsers = {
    trend: parseTrend,
    momentum: parseMomentum,
    volatility: parseVolatility,
    structure: parseStructure,
    derivatives: parseDerivatives,
    crossAsset: parseCrossAsset,
    cost: parseCost,
  } as const;
  for (const [key, parse] of Object.entries(parsers)) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const parsed = parse(value);
    if (parsed !== null) {
      out[key] = parsed;
      sections += 1;
    }
  }
  return sections === 0 ? null : (out as unknown as JevAnalysisView);
}

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
  const analysis = parseAnalysis(raw.analysis);
  return {
    instId: raw.instId,
    ...top,
    depthQuoteTop5: depth,
    returnsBps: returns,
    flow60s: { ...flowNumbers, imbalance: numOrNull(flow.imbalance), vwap: numOrNull(flow.vwap), lastPx: numOrNull(flow.lastPx), lastSide: flow.lastSide === "buy" || flow.lastSide === "sell" ? flow.lastSide : null },
    change24hPct: numOrNull(raw.change24hPct),
    rangePosition24h: numOrNull(raw.rangePosition24h),
    fundingRatePct: numOrNull(raw.fundingRatePct),
    ...(analysis === null ? {} : { analysis }),
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
