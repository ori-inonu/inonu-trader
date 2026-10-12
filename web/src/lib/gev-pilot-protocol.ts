/**
 * Browser copy of the pilot wire protocol. Turbopack is rooted at web/, so the runtime pieces
 * live here and only the types come from the backend module; gev-pilot-protocol.test.ts keeps
 * both copies identical.
 */
import type { PilotRequest } from "../../../src/pilot/protocol";
export type { PilotCoverage, PilotCycle, PilotRequest, PilotSource } from "../../../src/pilot/protocol";

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
