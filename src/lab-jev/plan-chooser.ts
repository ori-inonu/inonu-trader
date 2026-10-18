/**
 * The offline stand-in used to PLAN a paid run of the real Jev. Specification: docs/JEV-LAB-JEV-REAL.md section 3.
 *
 * `PlanChooser` is plugged into the same lab pipeline as the real chooser and builds, for every consultation that the
 * real run would make, exactly the payload that the real chooser would send, but it only measures that payload (how
 * many candidates, how many tokens it is estimated to cost) and always answers hold. No network, no key, no cost.
 * It announces itself as a mock so it can never be mistaken for a Jev.
 */

import type { ChooserAnswer, ChooserState, LabChooser } from "../lab/policies.ts";
import { HOLD } from "../lab/types.ts";
import { buildJevLabPayload, estimateInputTokens } from "./jev-chooser.ts";

export interface PlannedCall {
  candidates: number;
  typicalTokens: number;
  conservativeTokens: number;
}

export interface Spread {
  min: number;
  mean: number;
  max: number;
  total: number;
}

export interface ConsultationPlan {
  /** Consultations the real run would make: one per epoch that has at least one eligible candidate. */
  calls: number;
  /** States the real chooser would have refused (outside the vocabulary); each would be an error hold. */
  rejected: number;
  candidates: Spread | null;
  typicalTokens: Spread | null;
  conservativeTokens: Spread | null;
}

function spread(values: readonly number[]): Spread | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return { min: Math.min(...values), mean: total / values.length, max: Math.max(...values), total };
}

export class PlanChooser implements LabChooser {
  readonly name = "plano";
  readonly isMock = true;
  readonly planned: PlannedCall[] = [];
  rejected = 0;
  /** The state of the first consultation: the real run uses it for its preflight call. */
  firstState: ChooserState | null = null;

  choose(state: ChooserState): ChooserAnswer {
    try {
      const payload = buildJevLabPayload(state);
      const estimate = estimateInputTokens(payload);
      this.planned.push({ candidates: payload.state.candidates.length, typicalTokens: estimate.typical, conservativeTokens: estimate.conservative });
      if (this.firstState === null) this.firstState = state;
    } catch {
      this.rejected += 1;
    }
    return { choice: HOLD, latencyMs: 0 };
  }

  summary(): ConsultationPlan {
    return {
      calls: this.planned.length,
      rejected: this.rejected,
      candidates: spread(this.planned.map((call) => call.candidates)),
      typicalTokens: spread(this.planned.map((call) => call.typicalTokens)),
      conservativeTokens: spread(this.planned.map((call) => call.conservativeTokens)),
    };
  }
}
