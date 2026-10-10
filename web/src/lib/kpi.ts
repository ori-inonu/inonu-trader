import type { Action, BlockEvent } from "./types";

const ACTION_TONE: Record<Action, KpiTone> = { buy: "buy", sell: "sell", hold: "hold" };

export type KpiTone = "neutral" | "buy" | "sell" | "hold" | "late" | "unknown";

export interface KpiCell {
  id: string;
  label: string;
  value: string;
  meta?: string;
  tone: KpiTone;
  hero?: boolean;
}

/** Nothing to show is stated plainly. Never a fake zero. */
const UNAVAILABLE = "Indisponivel";

const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A sample that rounds to zero ms is no sample at all, so it reads as unavailable rather than as 0 ms. */
function latencyText(avgLatencyMs: number): string {
  if (!isFiniteNumber(avgLatencyMs) || avgLatencyMs <= 0) return UNAVAILABLE;
  const rounded = Math.round(avgLatencyMs);
  return rounded >= 1 ? `${INT.format(rounded)} ms` : UNAVAILABLE;
}

export function buildKpiCells(
  latest: BlockEvent | null,
  avgLatencyMs: number,
  uptimeText: string | null,
): KpiCell[] {
  const mid = latest?.mid;
  const midValue = isFiniteNumber(mid) ? INT.format(Math.round(mid * 1_000_000)) : UNAVAILABLE;
  const late = latest?.decision?.late === true;

  const heroTone: KpiTone = !latest
    ? "unknown"
    : late
      ? "late"
      : (latest.decision ? ACTION_TONE[latest.decision.action] : "neutral");

  const hero: KpiCell = {
    id: "mid",
    label: "Mid / MON",
    value: midValue,
    meta: late ? "Resposta tardia" : undefined,
    tone: heroTone,
    hero: true,
  };

  const totals = latest?.totals;
  const decisions: KpiCell = {
    id: "decisoes",
    label: "Decisoes",
    value: totals ? INT.format(totals.decisions) : UNAVAILABLE,
    tone: "neutral",
  };

  const orders: KpiCell = {
    id: "ordens",
    label: "Ordens",
    value: totals ? INT.format(totals.quotes) : UNAVAILABLE,
    tone: "neutral",
  };

  const executions: KpiCell = {
    id: "execucoes",
    label: "Execucoes",
    value: totals ? INT.format(totals.fills) : UNAVAILABLE,
    tone: totals && totals.fills > 0 ? "neutral" : "unknown",
  };

  const latency: KpiCell = {
    id: "latencia",
    label: "Latencia media",
    value: latencyText(avgLatencyMs),
    tone: "neutral",
  };

  const observed: KpiCell = {
    id: "observado",
    label: "Tempo observado",
    value: uptimeText && uptimeText.trim() ? uptimeText : UNAVAILABLE,
    tone: "neutral",
  };

  return [hero, decisions, orders, executions, latency, observed];
}