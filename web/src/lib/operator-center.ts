"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseOperatorCycle, type OperatorCandidateView, type OperatorCycleView } from "./operator-feed";

/** Mirror of src/operator/insights.ts as served by GET /operator/insights. */
export interface KindInsightView {
  kind: string;
  seen: number;
  eligible: number;
  chosen: number;
  avgNetBps: number | null;
  avgNetUsd: number | null;
  avgPriceImpactPercent: number | null;
  eligibleRate: number;
  chosenRate: number | null;
  topReasons: { reason: string; count: number }[];
}

export interface OperatorInsightsView {
  cycles: number;
  firstCycleAtMs: number | null;
  lastCycleAtMs: number | null;
  decisions: { asked: number; hold: number; chosen: number };
  executions: Record<string, number>;
  realized: { plans: number; totalUsd: number; wins: number; losses: number; hitRate: number | null; unknown: number };
  inferenceUsd: number | null;
  byKind: KindInsightView[];
  series: { startedAtMs: number; knownValueUsd: number; valueComplete: boolean; choice: string | null; chosenNetUsd: number | null; execution: string; realizedUsd: number | null }[];
}

export interface OperatorCenterState {
  status: "idle" | "loading" | "ready" | "absent" | "error";
  cycle: OperatorCycleView | null;
  history: OperatorCycleView[];
  insights: OperatorInsightsView | null;
  error: string | null;
  /** Milliseconds since the newest cycle finished, recomputed on every tick. */
  ageMs: number | null;
  lastFetchAtMs: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseInsights(value: unknown): OperatorInsightsView | null {
  if (!isRecord(value) || typeof value.cycles !== "number" || !isRecord(value.decisions) || !isRecord(value.realized) || !Array.isArray(value.byKind) || !Array.isArray(value.series)) return null;
  return value as unknown as OperatorInsightsView;
}

/** Candidates ranked for the decision table: eligible first, then by net bps, unknowns last. */
export function rankCandidates(cycle: OperatorCycleView): (OperatorCandidateView & { eligible: boolean; reasons: string[]; weight: number | null; netBps: number | null })[] {
  const verdicts = new Map(cycle.verdicts.map((verdict) => [verdict.candidateId, verdict] as const));
  return cycle.candidates.map((candidate) => {
    const verdict = verdicts.get(candidate.id);
    const weight = cycle.decision?.probabilities[candidate.id];
    return {
      ...candidate,
      eligible: verdict?.eligible ?? false,
      reasons: verdict?.reasons ?? [],
      weight: typeof weight === "number" ? weight : null,
      netBps: candidate.netUsd !== null && candidate.sizeUsd ? (candidate.netUsd / candidate.sizeUsd) * 10_000 : null,
    };
  }).sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if ((a.weight ?? -1) !== (b.weight ?? -1)) return (b.weight ?? -1) - (a.weight ?? -1);
    return (b.netBps ?? -Infinity) - (a.netBps ?? -Infinity);
  });
}

/** Risk label from the candidate's own numbers; descriptive, not a forecast. */
export function riskLabel(candidate: { priceImpactPercent: number | null; quoteAgeMs: number | null; netUsd: number | null; sizeUsd: number | null }): "baixo" | "medio" | "alto" | "desconhecido" {
  if (candidate.priceImpactPercent === null || candidate.quoteAgeMs === null || candidate.netUsd === null || !candidate.sizeUsd) return "desconhecido";
  const impact = Math.abs(candidate.priceImpactPercent);
  const netBps = (candidate.netUsd / candidate.sizeUsd) * 10_000;
  if (impact > 0.5 || candidate.quoteAgeMs > 10_000 || netBps < 0) return "alto";
  if (impact > 0.2 || candidate.quoteAgeMs > 5_000 || netBps < 20) return "medio";
  return "baixo";
}

export function useOperatorCenter(apiUrl: string, cycleIntervalMs = 5_000, insightsIntervalMs = 15_000): OperatorCenterState & { reload(): void } {
  const [state, setState] = useState<OperatorCenterState>({ status: "idle", cycle: null, history: [], insights: null, error: null, ageMs: null, lastFetchAtMs: null });
  const cycleRef = useRef<OperatorCycleView | null>(null);

  const loadCycle = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/operator`, { cache: "no-store" });
      if (response.status === 404) { setState((current) => ({ ...current, status: "absent", cycle: null, error: null, lastFetchAtMs: Date.now() })); return; }
      if (!response.ok) throw new Error(`http ${response.status}`);
      const cycle = parseOperatorCycle(await response.json());
      if (!cycle) throw new Error("schema");
      cycleRef.current = cycle;
      setState((current) => ({ ...current, status: "ready", cycle, error: null, ageMs: Date.now() - cycle.completedAtMs, lastFetchAtMs: Date.now() }));
    } catch (error) {
      setState((current) => ({ ...current, status: current.cycle ? current.status : "error", error: error instanceof Error ? error.message : "falha", lastFetchAtMs: Date.now() }));
    }
  }, [apiUrl]);

  const loadInsights = useCallback(async () => {
    try {
      const [historyResponse, insightsResponse] = await Promise.all([
        fetch(`${apiUrl}/operator/history?limit=40`, { cache: "no-store" }),
        fetch(`${apiUrl}/operator/insights`, { cache: "no-store" }),
      ]);
      if (!historyResponse.ok || !insightsResponse.ok) return;
      const historyRaw: unknown = await historyResponse.json();
      const history = Array.isArray(historyRaw) ? historyRaw.map(parseOperatorCycle).filter((entry): entry is OperatorCycleView => entry !== null) : [];
      const insights = parseInsights(await insightsResponse.json());
      setState((current) => ({ ...current, history, insights: insights ?? current.insights }));
    } catch {
      return;
    }
  }, [apiUrl]);

  useEffect(() => {
    void loadCycle();
    void loadInsights();
    const cycleTimer = setInterval(() => void loadCycle(), cycleIntervalMs);
    const insightsTimer = setInterval(() => void loadInsights(), insightsIntervalMs);
    const ageTimer = setInterval(() => {
      const cycle = cycleRef.current;
      if (cycle) setState((current) => ({ ...current, ageMs: Date.now() - cycle.completedAtMs }));
    }, 1_000);
    return () => { clearInterval(cycleTimer); clearInterval(insightsTimer); clearInterval(ageTimer); };
  }, [loadCycle, loadInsights, cycleIntervalMs, insightsIntervalMs]);

  return { ...state, reload: () => { void loadCycle(); void loadInsights(); } };
}
