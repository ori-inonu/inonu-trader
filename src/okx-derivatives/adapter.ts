import { sha256Hex } from "./canonical.ts";
import { syntheticInput } from "./fixture.ts";
import { parseDerivativesInput } from "./snapshot.ts";
import type { Evaluation, Snapshot, SourceClaim } from "./types.ts";

// VenueAdapter for OKX derivatives, read-only and offline. It exposes a validated snapshot and the
// evaluation request, and nothing else: no order, signing, credential or network method exists.
// A future live adapter would be a separate, qualified module with its own review (see
// docs/OPPORTUNITY-ARCHITECTURE.md); this one only wraps a fixture or a local file.

export interface CapabilitySnapshot {
  readonly read: true;
  readonly authenticated: false;
  readonly demo: false;
  readonly live: false;
  readonly signer: false;
  readonly network: false;
  /** Observed blockers, sorted. */
  readonly blockers: readonly string[];
}

export interface DerivativesVenueAdapter {
  readonly venue: "okx";
  readonly adapterKind: "offline_fixture";
  /** Identifies the normalized snapshot contract, not a verbatim OKX API response. */
  readonly apiVersion: string;
  readonly capabilities: CapabilitySnapshot;
  readonly sourceClaim: SourceClaim;
  readonly mode: "synthetic" | "imported";
  snapshot(): Snapshot;
  evaluation(): Evaluation;
  /** SHA-256 of the key-sorted canonical JSON of the validated input. */
  inputSha256(): string;
}

const API_VERSION = "okx_v5_normalized_snapshot_v1";

const BLOCKERS = Object.freeze(["execution_not_qualified", "no_credentials", "no_network_client", "no_signer", "offline_fixture_only"]);

/** Validates the raw input strictly and wraps it. Throws DerivativesError for malformed input. */
export function createFixtureAdapter(raw: unknown, mode: "synthetic" | "imported"): DerivativesVenueAdapter {
  const parsed = parseDerivativesInput(raw);
  const hash = sha256Hex(parsed.canonicalJson);
  const capabilities: CapabilitySnapshot = Object.freeze({
    read: true,
    authenticated: false,
    demo: false,
    live: false,
    signer: false,
    network: false,
    blockers: BLOCKERS,
  } as const);
  return Object.freeze({
    venue: "okx",
    adapterKind: "offline_fixture",
    apiVersion: API_VERSION,
    capabilities,
    sourceClaim: parsed.sourceClaim,
    mode,
    snapshot: () => parsed.snapshot,
    evaluation: () => parsed.evaluation,
    inputSha256: () => hash,
  } as const);
}

/** The built-in, deterministic and entirely invented input. */
export function createSyntheticAdapter(): DerivativesVenueAdapter {
  return createFixtureAdapter(syntheticInput(), "synthetic");
}
