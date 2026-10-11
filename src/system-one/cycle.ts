/**
 * One System One cycle: brief, choice, record. Execution is always a dry run here; the only
 * paths that move funds live behind the operator gates and the owner's live authorization,
 * and System One does not call them.
 */

import type { PhaseId } from "../policy/envelope";
import { buildLeverageBrief, type BuildBriefInput } from "./brief";
import type { SystemOneModel } from "./decide";
import { SYSTEM_ONE_SCHEMA_VERSION, type LeverageBrief, type LeverageCandidate, type LeverageDecision, type MarketReading, type SystemOneCycle, type WalletReading } from "./types";

export interface CycleDeps {
  model: SystemOneModel;
  now: () => number;
  cycleId?: () => string;
  signal?: AbortSignal;
}

export interface CycleInput {
  market: MarketReading;
  wallet: WalletReading;
  phase: PhaseId;
  horizonDays?: number;
  kellyLowerBound?: number | null;
}

function defaultCycleId(now: number): string {
  return `so-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function runSystemOneCycle(input: CycleInput, deps: CycleDeps): Promise<SystemOneCycle> {
  const startedAtMs = deps.now();
  const briefInput: BuildBriefInput = { ...input, nowMs: startedAtMs };
  const brief: LeverageBrief = buildLeverageBrief(briefInput);
  const eligible: LeverageCandidate[] = brief.candidates.filter((candidate) => candidate.eligible);
  const warnings: string[] = [];

  let decision: LeverageDecision | null = null;
  if (eligible.length > 0) {
    try {
      decision = await deps.model.choose(brief, eligible, { signal: deps.signal });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`decision_failed: ${message.slice(0, 160)}`);
      decision = { choice: "hold", probabilities: { hold: 1 }, confidence: null, latencyMs: 0, model: deps.model.name, status: message.includes("abort") ? "timeout" : "error" };
    }
  }

  const chosen = decision && decision.choice !== "hold" ? eligible.find((candidate) => candidate.id === decision!.choice) ?? null : null;
  const reasons: string[] = ["system_one_never_executes"];
  if (eligible.length === 0) reasons.push("no_eligible_candidate");
  if (decision === null) reasons.push("jev_not_asked");
  if (decision && decision.choice === "hold") reasons.push("hold");
  if (decision && decision.status !== "ok") reasons.push(`decision_${decision.status}`);

  return {
    schemaVersion: SYSTEM_ONE_SCHEMA_VERSION,
    cycleId: (deps.cycleId ?? (() => defaultCycleId(startedAtMs)))(),
    startedAtMs,
    completedAtMs: deps.now(),
    brief,
    decision,
    chosen,
    execution: { status: chosen ? "dry_run" : "blocked", reasons },
    warnings,
  };
}

/** The cycle without the wallet address or anything that could identify the owner; safe to serve. */
export function redactCycle(cycle: SystemOneCycle): SystemOneCycle {
  return cycle;
}
