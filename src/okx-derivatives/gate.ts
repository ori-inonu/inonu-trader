import { INELIGIBLE_REASON_CODES, UNAVAILABLE_REASON_CODES, type Verdict } from "./types.ts";

// RiskGate-style verdict. Reasons come from a closed vocabulary (types.ts); an unknown code is a
// programming error and throws instead of silently passing.
//
// Precedence: a definitive limit (ineligible) wins over missing data (unavailable), which wins over
// eligible. The reason list always contains every reason, unique and sorted, so it is deterministic.

const INELIGIBLE = new Set<string>(INELIGIBLE_REASON_CODES);
const UNAVAILABLE = new Set<string>(UNAVAILABLE_REASON_CODES);

export function classifyReason(code: string): "ineligible" | "unavailable" {
  if (INELIGIBLE.has(code)) return "ineligible";
  if (UNAVAILABLE.has(code)) return "unavailable";
  throw new RangeError("unknown verdict reason code");
}

export function decideVerdict(reasons: Iterable<string>): Verdict {
  const unique = [...new Set(reasons)].sort();
  let ineligible = false;
  let unavailable = false;
  for (const code of unique) {
    if (classifyReason(code) === "ineligible") ineligible = true;
    else unavailable = true;
  }
  return { status: ineligible ? "ineligible" : unavailable ? "unavailable" : "eligible", reasons: unique };
}
