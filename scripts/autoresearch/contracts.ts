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
