/**
 * The metadata of a decision for the study of the agent (docs/sdd/agente-autonomo/ADENDO-D, V2-4): the full hashes and the real clocks of one primary consultation, in an envelope of its own, apart from the record that
 * is hashed (the hash of a record never lives inside it). Nothing here is invented: a clock that cannot be true or a hash that is not a full SHA-256 gives no envelope at all.
 * Pure: no clock, no storage.
 */
import { createHash } from "node:crypto";
import { MIN_SAMPLE, RECORD_MIN_N, RETRY_LIMIT_MS, WINDOWS } from "./scoreboard";

const HEX64 = /^[0-9a-f]{64}$/;

export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

/** JSON with the keys of every object sorted at every depth (array order is kept): the same value always prints the same. */
export function canonicalJson(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(sorted(value));
}

export interface DecisionMetadata {
  readonly schemaVersion: 1;
  /** SHA-256 of the exact text of the record as it was written. */
  readonly sourceRecordHash: string;
  /** SHA-256 of the exact Brief the model read. */
  readonly snapshotHash: string;
  /** SHA-256 of the version of the decider (see `decisionVersionOf`). */
  readonly decisionVersion: string;
  /** SHA-256 of the rule that measures the outcome of this decision, here the Placar (see `evaluatorHashOf`). */
  readonly evaluatorHash: string;
  readonly askedAtMs: number;
  readonly answeredAtMs: number;
  readonly recordedAtMs: number;
  /** When the Brief was ready: no fact in it is later than this. */
  readonly factAvailableAtMs: number;
  /** There is only the operating arm. */
  readonly arm: "A";
}

const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

export function decisionMetadata(input: {
  readonly recordLine: string;
  readonly snapshotHash: string;
  readonly decisionVersion: string;
  readonly evaluatorHash: string;
  readonly factAvailableAtMs: number;
  readonly askedAtMs: number;
  readonly answeredAtMs: number;
  readonly recordedAtMs: number;
}): DecisionMetadata | null {
  if (typeof input.recordLine !== "string" || input.recordLine.length === 0) return null;
  if (!HEX64.test(input.snapshotHash) || !HEX64.test(input.decisionVersion) || !HEX64.test(input.evaluatorHash)) return null;
  const { factAvailableAtMs: f, askedAtMs: q, answeredAtMs: a, recordedAtMs: r } = input;
  if (![f, q, a, r].every(clock) || !(f <= q && q <= a && a <= r)) return null;
  return { schemaVersion: 1, sourceRecordHash: sha256Hex(input.recordLine), snapshotHash: input.snapshotHash, decisionVersion: input.decisionVersion, evaluatorHash: input.evaluatorHash, askedAtMs: q, answeredAtMs: a, recordedAtMs: r, factAvailableAtMs: f, arm: "A" };
}

/**
 * The version of the decider: the labels of its rules (the wording of the questions, the legend of the Brief, the layout of the Brief), the model asked for and the digest of every constant text the model reads. It
 * changes when any of them does. It does NOT prove the code that ran (there is no build identity at run time) and the model is the name asked for, not one the provider resolved.
 */
export function decisionVersionOf(input: { readonly criteria: string; readonly legend: string; readonly briefVersion: number; readonly model: string; readonly questions: string }): string {
  return sha256Hex(canonicalJson({ criteria: input.criteria, legend: input.legend, briefVersion: input.briefVersion, model: input.model, questions: input.questions }));
}

/** SHA-256 of a description of the rule that measures outcomes. */
export const evaluatorHashOf = (spec: unknown): string => sha256Hex(canonicalJson(spec));

/** What the Placar measures with: the windows it settles at and the thresholds of its samples. It identifies OUR measuring rule, not another evaluator; it changes when a window or a threshold does. */
export const placarSpec = (): Readonly<Record<string, unknown>> => ({ evaluator: "placar-v1", windows: WINDOWS, minSample: MIN_SAMPLE, retryLimitMs: RETRY_LIMIT_MS, recordMinN: RECORD_MIN_N });
export const placarEvaluatorHash = (): string => evaluatorHashOf(placarSpec());
