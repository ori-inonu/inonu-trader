"use client";

import { useCallback, useEffect, useState } from "react";

/** Mirror of src/operator/types.ts as served by GET /operator (redacted). */
export interface OperatorCandidateView {
  id: string;
  kind: string;
  title: string;
  chainIndex: string;
  toChainIndex?: string;
  from: { symbol: string };
  to: { symbol: string };
  sizeUsd: number | null;
  netUsd: number | null;
  priceImpactPercent: number | null;
  quoteAgeMs: number | null;
  notes: string[];
}

export interface OperatorCycleView {
  cycleId: string;
  startedAtMs: number;
  completedAtMs: number;
  inventory: {
    address: string;
    observedAtMs: number;
    source: string;
    knownValueUsd: number;
    valueComplete: boolean;
    chains: { chainIndex: string; chainName: string; nativeSymbol: string; nativeBalance: number | null; knownValueUsd: number; valueComplete: boolean; assets: { symbol: string; balanceText: string; valueUsd: number | null; native: boolean }[] }[];
  };
  candidates: OperatorCandidateView[];
  verdicts: { candidateId: string; eligible: boolean; reasons: string[] }[];
  eligibleIds: string[];
  decision: { choice: string; probabilities: Record<string, number>; confidence: number | null; latencyMs: number; model: string } | null;
  plan: { planId: string; candidateId: string; executionQualification: string; expiresAtMs: number; steps: { kind: string; description: string }[] } | null;
  execution: { status: string; reasons: string[]; txHash: string | null; realizedUsd?: number | null };
  inferenceUsd: number | null;
  warnings: string[];
  ledger?: { dayNotionalUsd: number; dayPlans: number; dayRealizedUsd?: number; openLegs: { planId: string; pairKey: string; status: string; openedAtMs: number; txHash: string }[]; killSwitch: boolean } | null;
}

export interface OperatorFeedState {
  status: "idle" | "loading" | "ready" | "absent" | "error";
  cycle: OperatorCycleView | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOperatorCycle(value: unknown): OperatorCycleView | null {
  if (!isRecord(value) || typeof value.cycleId !== "string" || !isRecord(value.inventory) || !Array.isArray(value.candidates) || !Array.isArray(value.verdicts) || !isRecord(value.execution)) return null;
  return value as unknown as OperatorCycleView;
}

export function useOperatorFeed(apiUrl: string, intervalMs = 15_000): OperatorFeedState & { reload(): void } {
  const [state, setState] = useState<OperatorFeedState>({ status: "idle", cycle: null, error: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: current.cycle ? current.status : "loading" }));
    try {
      const response = await fetch(`${apiUrl}/operator`, { cache: "no-store" });
      if (response.status === 404) { setState({ status: "absent", cycle: null, error: null }); return; }
      if (!response.ok) throw new Error(`http ${response.status}`);
      const cycle = parseOperatorCycle(await response.json());
      if (!cycle) throw new Error("schema");
      setState({ status: "ready", cycle, error: null });
    } catch (error) {
      setState((current) => ({ status: "error", cycle: current.cycle, error: error instanceof Error ? error.message : "falha" }));
    }
  }, [apiUrl]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), intervalMs);
    return () => clearInterval(timer);
  }, [load, intervalMs]);
  return { ...state, reload: () => void load() };
}
