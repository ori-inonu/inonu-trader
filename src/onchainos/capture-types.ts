/**
 * Types shared by the capture sources and the recorder. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 10.
 * Types and one error class only: no behavior, no file access.
 */

import type { CaptureKind, CaptureRecord } from "../lab/capture-format.ts";
import type { Tier } from "./http.ts";

export type CaptureSourceId = "public-okx" | "onchainos";

export type CaptureErrorKind =
  /** A record the lab format cannot carry or a provider answer that breaks its own contract. */
  | "malformed_record"
  /** The provider could not be read (typed error of the transport, no secret in it). */
  | "provider"
  /** The local clock went backwards. */
  | "clock"
  /** The existing output folder was made with another configuration. */
  | "state_mismatch"
  /** The output folder is damaged: it is never overwritten. */
  | "corrupt"
  /** Disk problem or a path that is not a folder. */
  | "io"
  /** The per invocation duration limit was reached in the middle of an epoch. */
  | "deadline"
  /** Invalid options or configuration given by the caller. Nothing was read or written. */
  | "usage"
  /** Anything unexpected. The message carries no detail. */
  | "internal";

export class CaptureError extends Error {
  readonly kind: CaptureErrorKind;
  constructor(kind: CaptureErrorKind, message: string) {
    super(message);
    this.name = "CaptureError";
    this.kind = kind;
  }
}

/** The file port of the recorder. The real one lives in capture.ts; the tests also use an in memory one. */
export interface CaptureFs {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  mkdirp(path: string): void;
  readBytes(path: string): Uint8Array;
  size(path: string): number;
  /** Appends the whole text in ONE call. */
  append(path: string, text: string): void;
  /** Writes a temporary file and renames it over the target. */
  writeAtomic(path: string, text: string): void;
  /** Creates the file and fails if it already exists. */
  createExclusive(path: string, text: string): void;
  truncate(path: string, size: number): void;
}

export interface PlannedCall {
  /** Id of the endpoint in the registry (endpoints.ts). */
  readonly endpointId: string;
  readonly method: "GET" | "POST";
  readonly path: string;
  /** Descriptive parameters (never a credential). */
  readonly params: Readonly<Record<string, string>>;
  readonly tier: Tier;
  readonly frequency: "every_epoch" | "first_epoch" | "after_settlement";
  readonly purpose: string;
}

export interface CaptureCursors {
  /** Highest startMs already recorded for this instrument and bar duration, or null. */
  lastCandleStartMs(inst: string, barMs: number): number | null;
  /** Highest settleMs already recorded as a settled funding value for this instrument, or null. */
  lastSettledFundingMs(inst: string): number | null;
}

export interface EpochContext {
  readonly epochId: string;
  readonly gridMs: number;
  readonly epochMs: number;
  /** True when nothing has been committed yet in this folder. */
  readonly firstEpoch: boolean;
  readonly cursors: CaptureCursors;
  /** Throws CaptureError("deadline") when the per invocation duration limit has passed. Call before every read. */
  readonly checkDeadline: () => void;
}

export interface SkipNote {
  readonly kind: CaptureKind | "other";
  readonly inst: string;
  readonly reason: string;
}

export interface EpochCollection {
  /** Records in any order; the recorder sorts them by t, validates each one and appends the epoch as a block. */
  readonly records: CaptureRecord[];
  /** Records that were not written on purpose (nothing new, not yet closed, not representable), each with its reason. */
  readonly skipped: SkipNote[];
  /** Observations worth reporting (for example a gap in candles). */
  readonly notes: string[];
}

export interface CaptureSource {
  readonly id: CaptureSourceId;
  /** Public configuration only: it goes into the manifest and must match on resume. */
  describe(): Record<string, unknown>;
  /** What one epoch would call, for the plan command. No network. */
  plan(): PlannedCall[];
  collect(context: EpochContext): Promise<EpochCollection>;
}
