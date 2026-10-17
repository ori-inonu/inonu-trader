export interface EvidenceSource {
  readonly id: string;
  readonly path: string;
  readonly sha256: string | null;
  readonly asOfMs: number | null;
  readonly classification: "local_process" | "public_market" | "synthetic";
  readonly limitations: readonly string[];
}

export interface EvidenceMeasurement {
  readonly id: string;
  readonly value: number | string | boolean | null;
  readonly unit: string;
  readonly status: "observed" | "derived" | "unknown";
  readonly reason: string | null;
  readonly sourceId: string;
}

export interface EvidenceSnapshot {
  readonly schemaVersion: 1;
  /** Maximum available source time, not the current wall clock. */
  readonly capturedAtMs: number;
  readonly sources: readonly EvidenceSource[];
  readonly measurements: readonly EvidenceMeasurement[];
}

export interface WorkloadResult {
  readonly metrics: Readonly<Record<string, number>>;
  readonly report: unknown;
}

export const ONLINE_LIMITS = {
  timeoutMs: 15_000,
  maxResponseBytes: 4 * 1024 * 1024,
  runtimeMaxAgeMs: 120_000,
  marketMaxAgeMs: 120_000,
  clockSkewMs: 30_000,
} as const;

export interface OnlineSource extends EvidenceSource {
  readonly classification: "local_process" | "public_market";
  readonly requestedAtMs: number;
  readonly receivedAtMs: number;
  readonly transport: "http_loopback" | "https_public";
}

export interface OnlineOptions {
  readonly runtimeBaseUrl: string;
  readonly runtimeOrigin: string;
}

export interface OnlineObservation {
  readonly startedAtMs: number;
  readonly completedAtMs: number;
  readonly sources: readonly OnlineSource[];
  /** Process identity only; startedAt is not the freshness of its decisions. */
  readonly health: {
    readonly app: string;
    readonly version: string;
    readonly startedAt: number;
  };
  /** Raw runtime payloads stay in memory and must never be printed or saved. */
  readonly analysis: unknown;
  readonly ledger: unknown;
  /** Public CEX context only, not an executable DEX price or a wallet mark. */
  readonly market: {
    readonly instrument: "SOL-USDT";
    readonly last: number;
    readonly bid: number;
    readonly ask: number;
    readonly quoteAtMs: number;
    readonly serverAtMs: number;
  };
}
