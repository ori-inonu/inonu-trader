export interface DecisionWeightAnnotation {
  schemaVersion: 1;
  origin: "provider_reported" | "adapter_choice_fallback" | "adapter_safety_fallback" | "unknown";
  selectedWeight: number | null;
  reportedSelectedWeight: number | null;
  financialCalibration: "not_established";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const TOLERANCE = 1e-12;
type Action = "buy" | "sell" | "hold";
type Weights = Record<Action, number>;
type Status = "ok" | "error" | "timeout" | "malformed";
interface Decision { action: Action; probabilities: Weights; status: Status }

function isAction(value: unknown): value is Action {
  return value === "buy" || value === "sell" || value === "hold";
}

function readDecision(value: unknown): Decision | null {
  if (!isRecord(value) || !isAction(value.action) || !isRecord(value.probabilities)) return null;
  const { status, probabilities } = value;
  if (status !== "ok" && status !== "error" && status !== "timeout" && status !== "malformed") return null;
  const { buy, sell, hold } = probabilities;
  if (![buy, sell, hold].every(weight => typeof weight === "number" && Number.isFinite(weight) && weight >= 0 && weight <= 1)) return null;
  const weights = { buy, sell, hold } as Weights;
  if (Math.abs(weights.buy + weights.sell + weights.hold - 1) > TOLERANCE) return null;
  if (status === "ok" ? weights[value.action] <= 0 : value.action !== "hold") return null;
  return { action: value.action, probabilities: weights, status };
}

function readResponse(value: unknown): { action: Action; probabilities: Weights; reported: boolean } | null {
  if (!isRecord(value) || !isAction(value.choice)) return null;
  if (value.probabilities === undefined) {
    return { action: value.choice, probabilities: {
      buy: value.choice === "buy" ? 1 : 0,
      sell: value.choice === "sell" ? 1 : 0,
      hold: value.choice === "hold" ? 1 : 0,
    }, reported: false };
  }
  if (!isRecord(value.probabilities)) return null;
  const buy = value.probabilities.buy ?? 0;
  const sell = value.probabilities.sell ?? 0;
  const hold = value.probabilities.hold ?? 0;
  if (![buy, sell, hold].every(weight => typeof weight === "number" && Number.isFinite(weight) && weight >= 0)) return null;
  const weights = { buy, sell, hold } as Weights;
  const total = weights.buy + weights.sell + weights.hold;
  if (!Number.isFinite(total) || total <= 0 || weights[value.choice] <= 0) return null;
  const normalized = { buy: weights.buy / total, sell: weights.sell / total, hold: weights.hold / total };
  if (!Object.values(normalized).every(Number.isFinite) || normalized[value.choice] <= 0) return null;
  return { action: value.choice, probabilities: normalized, reported: true };
}

function equalWeights(a: Weights, b: Weights): boolean {
  return Math.abs(a.buy - b.buy) <= TOLERANCE
    && Math.abs(a.sell - b.sell) <= TOLERANCE
    && Math.abs(a.hold - b.hold) <= TOLERANCE;
}

function readOrigin(decision: Decision, evidence: unknown): DecisionWeightAnnotation["origin"] {
  if (!isRecord(evidence)) return "unknown";
  const canonicalHold = decision.action === "hold" && decision.probabilities.buy === 0
    && decision.probabilities.sell === 0 && decision.probabilities.hold === 1;
  if (evidence.kind === "observed_failure") {
    return canonicalHold && (evidence.status === "error" || evidence.status === "timeout")
      && decision.status === evidence.status ? "adapter_safety_fallback" : "unknown";
  }
  if (evidence.kind !== "observed_response" || !("raw" in evidence)) return "unknown";
  const response = readResponse(evidence.raw);
  if (!response && canonicalHold && decision.status === "malformed") return "adapter_safety_fallback";
  if (response && decision.status === "ok" && response.action === decision.action
    && equalWeights(response.probabilities, decision.probabilities)) {
    return response.reported ? "provider_reported" : "adapter_choice_fallback";
  }
  return "unknown";
}

export function annotateDecisionWeights(
  decision: unknown,
  evidence: unknown,
): DecisionWeightAnnotation | null {
  const valid = readDecision(decision);
  if (!valid) return null;
  const origin = readOrigin(valid, evidence);
  const selectedWeight = valid.status === "ok" ? valid.probabilities[valid.action] : null;
  return {
    schemaVersion: 1,
    origin,
    selectedWeight,
    reportedSelectedWeight: origin === "provider_reported" ? selectedWeight : null,
    financialCalibration: "not_established",
  };
}
