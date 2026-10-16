import { momentumRulePolicy } from "../../src/lab/policies.ts";
import type { LabPolicy } from "../../src/lab/policies.ts";

export const RESEARCH_CANDIDATE_ID = "research-candidate";

/**
 * The Phase 1 candidate is exactly the ancestral momentum rule under a distinct journal identity.
 * It is a transparent offline rule, not the real Jev or a model-based chooser.
 */
export function createCandidatePolicy(): LabPolicy {
 const ancestor = momentumRulePolicy();
 return {
  ...ancestor,
  id: RESEARCH_CANDIDATE_ID,
  baseline: false,
  tested: true,
  passive: false,
  chooser: null,
  decide: async (input) => {
   const decision = await ancestor.decide(input);
   return { ...decision, policyId: RESEARCH_CANDIDATE_ID };
  },
 };
}
