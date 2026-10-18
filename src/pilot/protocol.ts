import type { OpportunityCandidate, GateVerdict, OperatorDecision, ExecutionPlan } from "../operator/types";
export interface PilotRequest {
  sessionId: string; requestId: string; account: string; chainId: string;
  observedAtMs: number; block: string;
}
export type PilotSource = "unavailable" | "real" | "fixture";
/** Public qualification summary; never carries source payloads or addresses. */
export type PilotCoverage =
  | {status:"unknown";chains:[];valueComplete:null;unitsQualified:null;quoteCostsComplete:null;assetCount:null}
  | {status:"qualified";chains:["196"];valueComplete:true;unitsQualified:true;quoteCostsComplete:true;assetCount:number};
export interface PilotCycle {
  protocol: "gev-wallet-pilot-v1";
  sessionId: string; requestId: string; contextKey: string; cycleId: string;
  maskedAccount: string; chainId: string; chainIndex: string | null;
  mode: "simulation"; execution: "disabled"; status: "hold" | "simulated";
  source: PilotSource; dataVersion: string | null; observedAtMs: number | null;
  coverage: PilotCoverage;
  /** Oldest verified quote timestamp, independently bounds every plan. */
  quoteObservedAtMs: number | null;
  completedAtMs: number; validUntilMs: number; knownValueUsd: number | null;
  candidates: OpportunityCandidate[]; verdicts: GateVerdict[];
  decision: OperatorDecision | null; plan: ExecutionPlan | null; reasons: string[];
  inferenceCostUsd: number | null; billedCostUsd: null; realizedProfitUsd: null;
}
export function pilotContextKey(r: PilotRequest): string {
  // Correlation only, never authorization. Source identity is checked using the
  // complete address in memory; the journal does not persist that address.
  let hash = BigInt("0xcbf29ce484222325");
  for (const c of r.account.toLowerCase()) hash = BigInt.asUintN(64, (hash ^ BigInt(c.charCodeAt(0))) * BigInt("0x100000001b3"));
  return [r.sessionId, hash.toString(16), r.chainId, r.observedAtMs, r.block].join(":");
}
export const PILOT_MAX_AGE_MS = 60_000;
export const PILOT_MAX_QUOTE_AGE_MS = 15_000;
/** Identifiers must never carry a complete EVM address into persisted traces. */
export const pilotNonceValid = (v: unknown): v is string => typeof v === "string" &&
  /^[A-Za-z0-9_-]{8,80}$/.test(v) && !/[a-f0-9]{40}/i.test(v);
