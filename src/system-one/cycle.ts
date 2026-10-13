/**
 * One System One cycle: brief, choice, record. Execution is always a dry run here; the only
 * paths that move funds live behind the operator gates and the owner's live authorization,
 * and System One does not call them.
 */

import type { PhaseId } from "../policy/envelope";
import type { QuantAnnex } from "../quant/annex";
import { buildLeverageBrief, type BuildBriefInput } from "./brief";
import { validateLeverageDecision, type SystemOneModel } from "./decide";
import { SYSTEM_ONE_SCHEMA_VERSION, type LeverageBrief, type LeverageCandidate, type LeverageDecision, type MarketReading, type SystemOneCycle, type WalletReading } from "./types";

export interface CycleDeps {
  model: SystemOneModel;
  now: () => number;
  cycleId?: () => string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CycleInput {
  market: MarketReading;
  wallet: WalletReading;
  phase: PhaseId;
  horizonDays?: number;
  kellyLowerBound?: number | null;
  /** Optional evidence from src/quant. Copied onto the brief; it does not enter eligibility. */
  quant?: QuantAnnex;
}

function defaultCycleId(now: number): string {
  return `so-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function runSystemOneCycle(input: CycleInput, deps: CycleDeps): Promise<SystemOneCycle> {
  const startedAtMs = deps.now();
  const briefInput: BuildBriefInput = { ...structuredClone(input), nowMs: startedAtMs };
  const brief: LeverageBrief = buildLeverageBrief(briefInput);
  if (input.quant !== undefined) brief.quant = structuredClone(input.quant);
  const eligible: LeverageCandidate[] = brief.candidates.filter((candidate) => candidate.eligible);
  const warnings: string[] = [];

  let decision: LeverageDecision | null = null;
  if (eligible.length > 0) {
    const controller = new AbortController();
    const timeoutMs = deps.timeoutMs ?? 10_000;
    const signal = deps.signal ? AbortSignal.any([deps.signal, controller.signal]) : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("invalid deadline");
      signal.throwIfAborted();
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("decision cancelled"));
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const budgetMs = Math.min(timeoutMs, 60_000);
      const deadline = performance.now() + budgetMs;
      timer = setTimeout(() => controller.abort(), budgetMs);
      // The adapter receives independent copies; only the local envelope may validate its answer.
      const raw = await Promise.race([deps.model.choose(structuredClone(brief), structuredClone(eligible), { signal }), cancelled]);
      // A blocked event loop can resolve the promise before servicing its overdue timer.
      if (performance.now() >= deadline) controller.abort();
      signal.throwIfAborted();
      decision = validateLeverageDecision(raw, eligible);
    } catch {
      warnings.push("decision_failed");
      decision = { choice: "hold", probabilities: { hold: 1 }, confidence: null, latencyMs: 0, model: deps.model.name, status: signal.aborted ? "timeout" : "error" };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  const chosen = decision?.status === "ok" && decision.choice !== "hold" ? eligible.find((candidate) => candidate.id === decision.choice) ?? null : null;
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

/** Local journal compatibility only. HTTP publication must use publicSystemOneView. */
export function redactCycle(cycle: SystemOneCycle): SystemOneCycle {
  return cycle;
}
