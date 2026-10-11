"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function parseCandidate(value: unknown): SystemOneCandidateView | null {
  if (!isRecord(value)) return null;
  const side = value.side === "short" ? "short" : value.side === "long" ? "long" : null;
  const leverage = num(value.leverage);
  const id = str(value.id);
  if (!side || leverage === null || !id) return null;
  return {
    id,
    side,
    leverage,
    marginUsd: num(value.marginUsd) ?? 0,
    notionalUsd: num(value.notionalUsd) ?? 0,
    liquidationDistance: num(value.liquidationDistance) ?? 1 / leverage,
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
  const brief = value.brief;
  if (!isRecord(brief.market) || !isRecord(brief.wallet) || !isRecord(brief.limits) || !Array.isArray(brief.candidates)) return null;
  const cycleId = str(value.cycleId);
  if (!cycleId) return null;
  const market = brief.market;
  const wallet = brief.wallet;
  const limits = brief.limits;
  const candidates = brief.candidates.map(parseCandidate).filter((candidate): candidate is SystemOneCandidateView => candidate !== null);
  const decisionRaw = value.decision;
  const decision = isRecord(decisionRaw) && typeof decisionRaw.choice === "string"
    ? {
        choice: decisionRaw.choice,
        probabilities: isRecord(decisionRaw.probabilities) ? Object.fromEntries(Object.entries(decisionRaw.probabilities).filter(([, p]) => typeof p === "number" && Number.isFinite(p))) as Record<string, number> : {},
        confidence: num(decisionRaw.confidence),
        latencyMs: num(decisionRaw.latencyMs) ?? 0,
        model: str(decisionRaw.model, "desconhecido"),
        status: str(decisionRaw.status, "ok"),
      }
    : null;
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
        capitalUsd: num(wallet.capitalUsd) ?? 0,
        knownValueUsd: num(wallet.knownValueUsd) ?? 0,
        valueComplete: wallet.valueComplete === true,
        openNotionalUsd: num(wallet.openNotionalUsd) ?? 0,
        openSide: typeof wallet.openSide === "string" ? wallet.openSide : null,
        source: str(wallet.source, "unknown"),
      },
      limits: {
        leverageCeiling: num(limits.leverageCeiling) ?? 0,
        leverageCap: num(limits.leverageCap),
        orderCapUsd: num(limits.orderCapUsd) ?? 0,
        exposureCapUsd: num(limits.exposureCapUsd) ?? 0,
        liquidationDistanceFloor: num(limits.liquidationDistanceFloor),
        dailyStopUsd: num(limits.dailyStopUsd),
      },
      candidates,
      eligibleIds: strings(brief.eligibleIds),
      notes: strings(brief.notes),
    },
    decision,
    chosen: parseCandidate(value.chosen),
    execution: { status: str(value.execution.status, "blocked"), reasons: strings(value.execution.reasons) },
    warnings: strings(value.warnings),
  };
}

export function useSystemOne(apiUrl: string, intervalMs = 10_000): SystemOneState & { reload(): void } {
  const [state, setState] = useState<SystemOneState>({ status: "idle", cycle: null, error: null, ageMs: null });
  const alive = useRef(true);

  const load = useCallback(async () => {
    setState((previous) => (previous.status === "idle" ? { ...previous, status: "loading" } : previous));
    try {
      const response = await fetch(`${apiUrl}/system-one`, { cache: "no-store" });
      if (response.status === 404) {
        if (alive.current) setState((previous) => ({ ...previous, status: "absent", error: null }));
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const cycle = parseSystemOneCycle(await response.json());
      if (!cycle) throw new Error("ciclo invalido");
      if (alive.current) setState({ status: "ready", cycle, error: null, ageMs: Math.max(0, Date.now() - cycle.completedAtMs) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (alive.current) setState((previous) => ({ ...previous, status: previous.cycle ? "ready" : "error", error: message }));
    }
  }, [apiUrl]);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => { void load(); }, intervalMs);
    const clock = setInterval(() => {
      setState((previous) => (previous.cycle ? { ...previous, ageMs: Math.max(0, Date.now() - previous.cycle.completedAtMs) } : previous));
    }, 1_000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [load, intervalMs]);

  return { ...state, reload: () => { void load(); } };
}
