import { finiteOrNull, isRecord } from "./types";

const reasons = new Set([
  "phase_0_observes_only", "phase_requires_spot", "borrowing_not_allowed_in_phase",
  "above_leverage_ceiling", "above_leverage_cap", "leverage_cap_undefined", "below_liquidation_floor",
  "sigma_unknown", "market_stale", "inventory_stale", "funding_unknown", "mark_price_unknown",
  "margin_zero", "inventory_value_incomplete", "inventory_invalid", "would_flip_open_position", "exposure_cap_reached",
  "system_one_never_executes", "no_eligible_candidate", "jev_not_asked", "hold",
  "decision_error", "decision_timeout", "decision_malformed", "decision_invalid-choice", "decision_failed",
]);
const codes = (input: unknown) => Array.isArray(input) ? input.filter((value): value is string => typeof value === "string" && reasons.has(value)).slice(0, 32) : [];
const numbers = (input: Record<string, unknown>, fields: string) => Object.fromEntries(fields.split(" ").map(key => [key, finiteOrNull(input[key])]));
const member = (input: unknown, values: string[], fallback: string | null = "unknown") => typeof input === "string" && values.includes(input) ? input : fallback;
const candidateId = (input: unknown) => typeof input === "string" && /^(long|short)-(1|2|3|5)x$/.test(input) ? input : null;
const requiredNumbers = (input: Record<string, unknown>, fields: string, positive = false) => fields.split(" ").every(key => {
  const value = finiteOrNull(input[key]);
  return value !== null && (positive ? value > 0 : value >= 0);
});
const validCandidate = (input: Record<string, unknown>) => requiredNumbers(input, "marginUsd notionalUsd") && requiredNumbers(input, "leverage liquidationDistance", true);

const quantReasons = ["too_few_candles", "stale", "sigma_unknown"];
const probability = (input: unknown) => { const value = finiteOrNull(input); return value !== null && value >= 0 && value <= 1 ? value : null; };

/** Allowlisted projection of the optional quant annex: evidence about data and risk, never a choice. */
function publicQuant(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input) || !isRecord(input.quality)) return null;
  const dataGrade = member(input.quality.grade, ["A", "B", "C", "F"], null);
  if (dataGrade === null) return null;
  if (input.status === "unavailable") return { status: "unavailable", reason: member(input.reason, quantReasons), dataGrade };
  if (input.status !== "ok" || !isRecord(input.sigma) || !isRecord(input.tail) || !Array.isArray(input.candidates)) return null;
  const horizon = finiteOrNull(input.horizonDays);
  return {
    status: "ok", dataGrade, horizonDays: horizon !== null && horizon > 0 ? horizon : null,
    sigma: { ...numbers(input.sigma, "low central high"), regime: member(input.sigma.regime, ["calm", "normal", "stressed"], null) },
    tail: { ...numbers(input.tail, "excessKurtosis hillIndex"), heavyTailed: typeof input.tail.heavyTailed === "boolean" ? input.tail.heavyTailed : null },
    simulation: {
      paths: isRecord(input.simulation) && Number.isInteger(input.simulation.paths) && (input.simulation.paths as number) > 0 ? input.simulation.paths : null,
      skipped: member(input.simulationSkipped, ["too_few_returns", "returns_invalid", "sigma_zero", "budget_exceeded"], null),
    },
    candidates: input.candidates.slice(0, 8).filter(isRecord).filter(c => candidateId(c.id)).map(c => ({
      id: candidateId(c.id), sideAwareTouch: probability(c.sideAwareTouch), simulatedTouch: probability(c.simulatedTouch), simulatedStdError: probability(c.simulatedStdError),
    })),
  };
}

/** Explicit dashboard projection. Never publish free-form provider text or extra journal fields. */
export function publicSystemOneView(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input) || input.schemaVersion !== 1 || !isRecord(input.brief) || !isRecord(input.execution)) return null;
  const { brief, execution } = input;
  if (!isRecord(brief.market) || !isRecord(brief.wallet) || !isRecord(brief.limits) || !Array.isArray(brief.candidates)) return null;
  const started = finiteOrNull(input.startedAtMs), completed = finiteOrNull(input.completedAtMs);
  if (started === null || completed === null || started <= 0 || completed < started || !["blocked", "dry_run"].includes(String(execution.status))) return null;
  if (!requiredNumbers(brief.wallet, "capitalUsd knownValueUsd openNotionalUsd") ||
      !requiredNumbers(brief.limits, "orderCapUsd exposureCapUsd") || !requiredNumbers(brief.limits, "leverageCeiling", brief.phase !== "fase-0")) return null;
  if (brief.candidates.some(c => isRecord(c) && candidateId(c.id) && !validCandidate(c))) return null;
  if (isRecord(input.chosen) && !validCandidate(input.chosen)) return null;
  const candidates = brief.candidates.slice(0, 8).filter(isRecord).filter(c => candidateId(c.id)).map(c => ({
    ...numbers(c, "leverage marginUsd notionalUsd liquidationDistance touchProbability medianMultipleNoEdge fundingCarryPerDay fundingCarryUsd"),
    id: candidateId(c.id), side: member(c.side, ["long", "short"]), eligible: c.eligible === true, reasons: codes(c.reasons),
  }));
  const raw = input.decision;
  const decision = isRecord(raw) ? {
    ...numbers(raw, "confidence latencyMs"),
    choice: raw.choice === "hold" ? "hold" : candidateId(raw.choice),
    model: raw.model === "mock" ? "mock" : typeof raw.model === "string" && /^jev-(?:latest|\d+\.\d+\.\d+)$/.test(raw.model) ? raw.model : "unknown",
    status: member(raw.status, ["ok", "error", "timeout", "malformed", "invalid-choice"], "malformed"),
    probabilities: isRecord(raw.probabilities) ? Object.fromEntries(Object.entries(raw.probabilities).filter(([key, value]) => (key === "hold" || candidateId(key)) && finiteOrNull(value) !== null && Number(value) >= 0)) : {},
  } : null;
  const ids = brief.eligibleIds;
  const eligibleIds = candidates.filter(c => c.eligible && Array.isArray(ids) && ids.includes(c.id)).map(c => c.id);
  const chosenId = isRecord(input.chosen) ? input.chosen.id : null;
  const chosen = candidates.find(c => c.id === chosenId && eligibleIds.includes(c.id)) ?? null;
  if ((execution.status === "dry_run") !== (chosen !== null)) return null;
  if (chosen && (decision?.status !== "ok" || decision.choice !== chosen.id)) return null;
  if (decision && decision.choice !== "hold" && !chosen) return null;
  const market = brief.market, wallet = brief.wallet;
  const quant = publicQuant(brief.quant);
  return {
    schemaVersion: 1, cycleId: typeof input.cycleId === "string" && /^so-[a-z0-9-]{1,64}$/.test(input.cycleId) ? input.cycleId : `so-${started}`,
    startedAtMs: started, completedAtMs: completed,
    brief: {
      phase: member(brief.phase, ["fase-0", "fase-1", "fase-2"]), horizonDays: finiteOrNull(brief.horizonDays),
      market: { ...numbers(market, "indexPrice markPrice fundingRate fundingIntervalMs realizedSigmaDaily candlesUsed candleBarMs observedAtMs"), instId: typeof market.instId === "string" && /^[A-Z0-9]{1,12}-[A-Z0-9]{1,12}-SWAP$/.test(market.instId) ? market.instId : "unknown", source: member(market.source, ["synthetic", "okx_public_v5"]) },
      wallet: { ...numbers(wallet, "capitalUsd knownValueUsd openNotionalUsd observedAtMs"), valueComplete: wallet.valueComplete === true, openSide: member(wallet.openSide, ["long", "short"], null), source: member(wallet.source, ["synthetic", "configured", "okx_balance_api"]) },
      limits: numbers(brief.limits, "leverageCeiling leverageCap orderCapUsd exposureCapUsd liquidationDistanceFloor dailyStopUsd"),
      candidates, eligibleIds, notes: [],
      ...(quant ? { quant } : {}),
    },
    decision, chosen, execution: { status: execution.status, reasons: codes(execution.reasons) }, warnings: codes(input.warnings),
  };
}
