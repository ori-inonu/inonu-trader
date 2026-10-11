"use client";

import { useEffect, useRef, useState } from "react";

/** Mirror of src/system-one/types.ts as served by GET /system-one. */
export interface SystemOneCandidateView {
  id: string;
  side: "long" | "short";
  leverage: number;
  marginUsd: number;
  notionalUsd: number;
  liquidationDistance: number;
  touchProbability: number | null;
  medianMultipleNoEdge: number | null;
  fundingCarryPerDay: number | null;
  fundingCarryUsd: number | null;
  eligible: boolean;
  reasons: string[];
}

export interface SystemOneCycleView {
  cycleId: string;
  startedAtMs: number;
  completedAtMs: number;
  brief: {
    phase: string;
    horizonDays: number;
    market: {
      instId: string;
      indexPrice: number | null;
      markPrice: number | null;
      fundingRate: number | null;
      fundingIntervalMs: number | null;
      realizedSigmaDaily: number | null;
      candlesUsed: number;
      source: string;
      observedAtMs: number;
    };
    wallet: { capitalUsd: number; knownValueUsd: number; valueComplete: boolean; openNotionalUsd: number; openSide: string | null; source: string };
    limits: { leverageCeiling: number; leverageCap: number | null; orderCapUsd: number; exposureCapUsd: number; liquidationDistanceFloor: number | null; dailyStopUsd: number | null };
    candidates: SystemOneCandidateView[];
    eligibleIds: string[];
    notes: string[];
  };
  decision: { choice: string; probabilities: Record<string, number>; confidence: number | null; latencyMs: number; model: string; status: string } | null;
  chosen: SystemOneCandidateView | null;
  execution: { status: string; reasons: string[] };
  warnings: string[];
}

export interface SystemOneState {
  status: "idle" | "loading" | "ready" | "absent" | "error";
  cycle: SystemOneCycleView | null;
  error: string | null;
  ageMs: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function requiredNumbers(input: Record<string, unknown>, fields: string, positive = false): boolean {
  return fields.split(" ").every(key => {
    const value = num(input[key]);
    return value !== null && (positive ? value > 0 : value >= 0);
  });
}

function validCandidateNumbers(input: Record<string, unknown>): boolean {
  return requiredNumbers(input, "marginUsd notionalUsd") && requiredNumbers(input, "leverage liquidationDistance", true);
}

function parseCandidate(value: unknown): SystemOneCandidateView | null {
  if (!isRecord(value)) return null;
  const side = value.side === "short" ? "short" : value.side === "long" ? "long" : null;
  const leverage = num(value.leverage);
  const id = str(value.id);
  if (!side || leverage === null || !id || !validCandidateNumbers(value)) return null;
  return {
    id,
    side,
    leverage,
    marginUsd: num(value.marginUsd)!,
    notionalUsd: num(value.notionalUsd)!,
    liquidationDistance: num(value.liquidationDistance)!,
    touchProbability: num(value.touchProbability),
    medianMultipleNoEdge: num(value.medianMultipleNoEdge),
    fundingCarryPerDay: num(value.fundingCarryPerDay),
    fundingCarryUsd: num(value.fundingCarryUsd),
    eligible: value.eligible === true,
    reasons: strings(value.reasons),
  };
}

/** Strict enough to never render a partial cycle as a decision. */
export function parseSystemOneCycle(value: unknown): SystemOneCycleView | null {
  if (!isRecord(value) || !isRecord(value.brief) || !isRecord(value.execution)) return null;
  if (value.schemaVersion !== 1 || num(value.startedAtMs) === null || num(value.completedAtMs) === null) return null;
  if (Number(value.completedAtMs) < Number(value.startedAtMs)) return null;
  if (value.execution.status !== "blocked" && value.execution.status !== "dry_run") return null;
  const brief = value.brief;
  if (!isRecord(brief.market) || !isRecord(brief.wallet) || !isRecord(brief.limits) || !Array.isArray(brief.candidates)) return null;
  const cycleId = str(value.cycleId);
  if (!cycleId) return null;
  const market = brief.market;
  const wallet = brief.wallet;
  const limits = brief.limits;
  if (!requiredNumbers(wallet, "capitalUsd knownValueUsd openNotionalUsd") ||
      !requiredNumbers(limits, "orderCapUsd exposureCapUsd") || !requiredNumbers(limits, "leverageCeiling", true)) return null;
  if (brief.candidates.some(candidate => isRecord(candidate) && /^(long|short)-(1|2|3|5)x$/.test(str(candidate.id)) && !validCandidateNumbers(candidate))) return null;
  const candidates = brief.candidates.map(parseCandidate).filter((candidate): candidate is SystemOneCandidateView => candidate !== null);
  const decisionRaw = value.decision;
  const decision = isRecord(decisionRaw) && typeof decisionRaw.choice === "string"
    ? {
        choice: decisionRaw.choice,
        probabilities: isRecord(decisionRaw.probabilities) ? Object.fromEntries(Object.entries(decisionRaw.probabilities).filter(([, p]) => typeof p === "number" && Number.isFinite(p))) as Record<string, number> : {},
        confidence: num(decisionRaw.confidence),
        latencyMs: num(decisionRaw.latencyMs) ?? 0,
        model: str(decisionRaw.model, "desconhecido"),
        status: str(decisionRaw.status, "malformed"),
      }
    : null;
  const chosenRaw = parseCandidate(value.chosen);
  const chosen = chosenRaw ? candidates.find(candidate => candidate.id === chosenRaw.id && candidate.eligible) ?? null : null;
  if (value.chosen !== null && (!chosen || !decision || decision.status !== "ok" || decision.choice !== chosen.id || !strings(brief.eligibleIds).includes(chosen.id))) return null;
  if ((value.execution.status === "dry_run") !== (chosen !== null)) return null;
  if (decision?.choice !== undefined && decision.choice !== "hold" && !chosen) return null;
  return {
    cycleId,
    startedAtMs: num(value.startedAtMs) ?? 0,
    completedAtMs: num(value.completedAtMs) ?? 0,
    brief: {
      phase: str(brief.phase, "fase-0"),
      horizonDays: num(brief.horizonDays) ?? 7,
      market: {
        instId: str(market.instId, "?"),
        indexPrice: num(market.indexPrice),
        markPrice: num(market.markPrice),
        fundingRate: num(market.fundingRate),
        fundingIntervalMs: num(market.fundingIntervalMs),
        realizedSigmaDaily: num(market.realizedSigmaDaily),
        candlesUsed: num(market.candlesUsed) ?? 0,
        source: str(market.source, "unknown"),
        observedAtMs: num(market.observedAtMs) ?? 0,
      },
      wallet: {
        capitalUsd: num(wallet.capitalUsd)!,
        knownValueUsd: num(wallet.knownValueUsd)!,
        valueComplete: wallet.valueComplete === true,
        openNotionalUsd: num(wallet.openNotionalUsd)!,
        openSide: typeof wallet.openSide === "string" ? wallet.openSide : null,
        source: str(wallet.source, "unknown"),
      },
      limits: {
        leverageCeiling: num(limits.leverageCeiling)!,
        leverageCap: num(limits.leverageCap),
        orderCapUsd: num(limits.orderCapUsd)!,
        exposureCapUsd: num(limits.exposureCapUsd)!,
        liquidationDistanceFloor: num(limits.liquidationDistanceFloor),
        dailyStopUsd: num(limits.dailyStopUsd),
      },
      candidates,
      eligibleIds: strings(brief.eligibleIds),
      notes: strings(brief.notes),
    },
    decision,
    chosen,
    execution: { status: str(value.execution.status, "blocked"), reasons: strings(value.execution.reasons) },
    warnings: strings(value.warnings),
  };
}

type StateUpdate = SystemOneState | ((previous: SystemOneState) => SystemOneState);

/** One in-flight read per source. A disposed source never publishes into a newer session. */
export function createSystemOneLoader(apiUrl: string, setState: (update: StateUpdate) => void, fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  let disposed = false;
  let active: AbortController | null = null;
  const load = async () => {
    if (disposed || active) return;
    const controller = new AbortController();
    active = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setState((previous) => (previous.status === "idle" ? { ...previous, status: "loading" } : previous));
    try {
      const response = await fetcher(`${apiUrl}/system-one`, { cache: "no-store", signal: controller.signal });
      if (response.status === 404) {
        if (!disposed && !controller.signal.aborted) setState({ status: "absent", cycle: null, ageMs: null, error: null });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const cycle = parseSystemOneCycle(await response.json());
      if (!cycle) throw new Error("ciclo invalido");
      if (!disposed && !controller.signal.aborted) setState({ status: "ready", cycle, error: null, ageMs: Math.max(0, Date.now() - cycle.completedAtMs) });
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

export function useSystemOne(apiUrl: string, intervalMs = 10_000): SystemOneState & { reload(): void } {
  const [state, setState] = useState<SystemOneState>({ status: "idle", cycle: null, error: null, ageMs: null });
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    const loader = createSystemOneLoader(apiUrl, setState);
    setState({ status: "idle", cycle: null, error: null, ageMs: null });
    reload.current = () => { void loader.load(); };
    void loader.load();
    const timer = setInterval(() => { void loader.load(); }, Math.max(1000, Number.isFinite(intervalMs) ? intervalMs : 10_000));
    const clock = setInterval(() => {
      setState((previous) => (previous.cycle ? { ...previous, ageMs: Math.max(0, Date.now() - previous.cycle.completedAtMs) } : previous));
    }, 1_000);
    return () => {
      loader.dispose();
      reload.current = () => {};
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [apiUrl, intervalMs]);

  return { ...state, reload: () => reload.current() };
}
