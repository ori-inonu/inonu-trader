import type { OperatorCycle } from "./types";

/**
 * Risk and return statistics over the operator journal. Pure functions over
 * persisted cycles: no network, no inference. Everything here is descriptive
 * history; averages of estimates are not forecasts and realized totals only
 * count reconciled results.
 */
export interface KindInsight {
  kind: string;
  seen: number;
  eligible: number;
  chosen: number;
  /** Mean conservative net in basis points of size over candidates with a known net. */
  avgNetBps: number | null;
  avgNetUsd: number | null;
  avgPriceImpactPercent: number | null;
  /** Share of seen candidates that passed the gate. */
  eligibleRate: number;
  /** Share of eligible candidates Jev chose. */
  chosenRate: number | null;
  /** Most frequent gate reasons for this kind. */
  topReasons: { reason: string; count: number }[];
}

export interface OperatorInsights {
  cycles: number;
  firstCycleAtMs: number | null;
  lastCycleAtMs: number | null;
  decisions: { asked: number; hold: number; chosen: number };
  executions: Record<string, number>;
  realized: { plans: number; totalUsd: number; wins: number; losses: number; hitRate: number | null; unknown: number };
  inferenceUsd: number | null;
  byKind: KindInsight[];
  series: { startedAtMs: number; knownValueUsd: number; valueComplete: boolean; choice: string | null; chosenNetUsd: number | null; execution: string; realizedUsd: number | null }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts one JSONL line per cycle; malformed lines are skipped, never guessed. */
export function parseCycleLines(text: string): OperatorCycle[] {
  const cycles: OperatorCycle[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isRecord(value) && typeof value.cycleId === "string" && Array.isArray(value.candidates) && Array.isArray(value.verdicts) && isRecord(value.inventory) && isRecord(value.execution))
        cycles.push(value as unknown as OperatorCycle);
    } catch {
      continue;
    }
  }
  return cycles;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function computeInsights(cycles: OperatorCycle[]): OperatorInsights {
  const ordered = [...cycles].sort((a, b) => a.startedAtMs - b.startedAtMs);
  const executions: Record<string, number> = {};
  const decisions = { asked: 0, hold: 0, chosen: 0 };
  const realized = { plans: 0, totalUsd: 0, wins: 0, losses: 0, hitRate: null as number | null, unknown: 0 };
  let inferenceUsd: number | null = 0;
  const kinds = new Map<string, { seen: number; eligible: number; chosen: number; netBps: number[]; netUsd: number[]; impact: number[]; reasons: Map<string, number> }>();
  const series: OperatorInsights["series"] = [];

  for (const cycle of ordered) {
    executions[cycle.execution.status] = (executions[cycle.execution.status] ?? 0) + 1;
    if (cycle.decision) {
      decisions.asked++;
      if (cycle.decision.choice === "hold") decisions.hold++; else decisions.chosen++;
    }
    if (cycle.inferenceUsd === null) inferenceUsd = null; else if (inferenceUsd !== null) inferenceUsd += cycle.inferenceUsd;
    const realizedUsd = cycle.execution.realizedUsd;
    if (cycle.execution.status === "completed") {
      realized.plans++;
      if (typeof realizedUsd === "number" && Number.isFinite(realizedUsd)) {
        realized.totalUsd += realizedUsd;
        if (realizedUsd > 0) realized.wins++; else if (realizedUsd < 0) realized.losses++;
      } else {
        realized.unknown++;
      }
    }
    const verdictFor = new Map(cycle.verdicts.map((verdict) => [verdict.candidateId, verdict] as const));
    for (const candidate of cycle.candidates) {
      let entry = kinds.get(candidate.kind);
      if (!entry) {
        entry = { seen: 0, eligible: 0, chosen: 0, netBps: [], netUsd: [], impact: [], reasons: new Map() };
        kinds.set(candidate.kind, entry);
      }
      entry.seen++;
      const verdict = verdictFor.get(candidate.id);
      if (verdict?.eligible) entry.eligible++;
      for (const reason of verdict?.reasons ?? []) entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + 1);
      if (cycle.decision?.choice === candidate.id) entry.chosen++;
      if (candidate.netUsd !== null && Number.isFinite(candidate.netUsd)) {
        entry.netUsd.push(candidate.netUsd);
        if (candidate.sizeUsd) entry.netBps.push((candidate.netUsd / candidate.sizeUsd) * 10_000);
      }
      if (candidate.priceImpactPercent !== null && Number.isFinite(candidate.priceImpactPercent)) entry.impact.push(Math.abs(candidate.priceImpactPercent));
    }
    const chosen = cycle.decision && cycle.decision.choice !== "hold" ? cycle.candidates.find((candidate) => candidate.id === cycle.decision!.choice) ?? null : null;
    series.push({
      startedAtMs: cycle.startedAtMs,
      knownValueUsd: cycle.inventory.knownValueUsd,
      valueComplete: cycle.inventory.valueComplete,
      choice: cycle.decision?.choice ?? null,
      chosenNetUsd: chosen?.netUsd ?? null,
      execution: cycle.execution.status,
      realizedUsd: typeof realizedUsd === "number" && Number.isFinite(realizedUsd) ? realizedUsd : null,
    });
  }
  const decided = realized.wins + realized.losses;
  realized.hitRate = decided > 0 ? realized.wins / decided : null;

  const byKind: KindInsight[] = [...kinds.entries()].map(([kind, entry]) => ({
    kind,
    seen: entry.seen,
    eligible: entry.eligible,
    chosen: entry.chosen,
    avgNetBps: mean(entry.netBps),
    avgNetUsd: mean(entry.netUsd),
    avgPriceImpactPercent: mean(entry.impact),
    eligibleRate: entry.seen ? entry.eligible / entry.seen : 0,
    chosenRate: entry.eligible ? entry.chosen / entry.eligible : null,
    topReasons: [...entry.reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, count]) => ({ reason, count })),
  })).sort((a, b) => (b.avgNetBps ?? -Infinity) - (a.avgNetBps ?? -Infinity));

  return {
    cycles: ordered.length,
    firstCycleAtMs: ordered[0]?.startedAtMs ?? null,
    lastCycleAtMs: ordered.at(-1)?.startedAtMs ?? null,
    decisions,
    executions,
    realized,
    inferenceUsd,
    byKind,
    series: series.slice(-200),
  };
}
