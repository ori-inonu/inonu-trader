/**
 * One Jev read of one instrument: build the state from real inputs, ask the model only if the state exists, validate
 * the answer, and record it as an advisory. A model failure, a timeout and a malformed answer all end in hold with a
 * status; none of them throws into the caller's loop.
 */

import { randomUUID } from "node:crypto";
import { validateTapeDecision, type TapeModel } from "./decide";
import { buildTapeState } from "./state";
import { JEV_READ_SCHEMA_VERSION, type JevRead, type TapeDecision, type TapeInput } from "./types";

export interface ReadDeps {
  /** null observes only: the state is built and recorded, the model is not asked and no decision exists. */
  readonly model: TapeModel | null;
  readonly now: () => number;
  readonly readId?: () => string;
  readonly clockOffsetMs?: number | null;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;

function failed(model: string, status: "error" | "timeout", latencyMs: number): TapeDecision {
  return { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, confidence: null, latencyMs, model, status, inputTokens: null };
}

export async function runJevRead(input: TapeInput, deps: ReadDeps): Promise<JevRead> {
  const atMs = deps.now();
  const base = {
    schemaVersion: JEV_READ_SCHEMA_VERSION,
    readId: (deps.readId ?? (() => `jr-${randomUUID().slice(0, 12)}`))(),
    instId: input.instId,
    atMs,
    clockOffsetMs: deps.clockOffsetMs ?? null,
    advisory: true,
    execution: "never",
  } as const;

  const built = buildTapeState(input);
  if (!built.ok) return { ...base, state: null, insufficient: built.reasons, decision: null };
  const model = deps.model;
  if (model === null) return { ...base, state: built.state, insufficient: [], decision: null };

  const timeoutMs = Math.min(Math.max(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS);
  const controller = new AbortController();
  const signal = deps.signal ? AbortSignal.any([deps.signal, controller.signal]) : controller.signal;
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let decision: TapeDecision;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("deadline"));
      }, timeoutMs);
    });
    // The model gets its own copy: it cannot alter the state that is recorded.
    const raw = await Promise.race([model.decide(structuredClone(built.state), { signal }), deadline]);
    decision = validateTapeDecision(raw, model.name);
  } catch {
    decision = failed(model.name, controller.signal.aborted ? "timeout" : "error", performance.now() - started);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return { ...base, state: built.state, insufficient: [], decision };
}
