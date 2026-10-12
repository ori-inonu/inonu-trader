/**
 * The real Jev behind the Jev Decision Lab, in SHADOW. Specification: docs/JEV-LAB-JEV-REAL.md.
 *
 * `JevLabChooser` implements the `LabChooser` contract of src/lab/policies.ts with the TypeSafe evaluation model, one
 * choice question per epoch, in the same pattern as JevOperatorModel (src/operator/jev-selector.ts), JevSystemOneModel
 * (src/system-one/decide.ts) and JevTapeModel (src/jev-read/decide.ts): `experimental_evaluate` with maxRetries 0 and an
 * AbortSignal, the answer read from `answers.<id>` and the usage from `usage.inputTokens`.
 *
 * This is the ONLY place of the lab family that imports the SDK. Nothing here executes, signs, sends or reads the
 * environment: the API key is read by the SDK itself, from the environment of the process, when a call is made.
 *
 * What the model sees (decision D1): opaque ids (c1, c2, ...), closed vocabularies (modality, side) and numbers, and
 * nothing else. A criterion whose value is unknown (null) is NOT sent as zero and NOT sent as null: it is left out of
 * `values` and its name is listed under `unknown`, so the model knows the figure does not exist. Anything outside the
 * vocabulary makes the state refusable (`JevStateError`) before any call, so free text can never reach the prompt.
 *
 * The cost is capped by `maxCalls` and `maxUsd` (tokens of input times the price per million tokens that the caller
 * gives). The check happens before each call, with a conservative estimate of the input size and the reservation of
 * calls still in flight; the real usage replaces the estimate when it arrives. A call without valid usage is charged at
 * the estimate against the cap and reported as unknown (null) cost, never zero. When the cap is reached the chooser
 * refuses (`JevBudgetExhaustedError`, status "budget-exhausted"), never calls the model again and says why.
 */

import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { validateChooserAnswer, type ChooserAnswer, type ChooserState, type LabChooser } from "../lab/policies.ts";
import { HOLD, LAB_MODALITIES, LAB_SIDES, type LabModality, type LabSide } from "../lab/types.ts";

// ---------------------------------------------------------------------------
// Limits of this adapter (the script applies the same hard maxima)
// ---------------------------------------------------------------------------

/** No run of the real Jev may be allowed to spend more than this, whatever the caller asks. */
export const JEV_LAB_HARD_MAX_USD = 5;
/** No run of the real Jev may make more calls than this, whatever the caller asks. */
export const JEV_LAB_HARD_MAX_CALLS = 2000;
/** The choice question has the options hold plus one per candidate; the provider takes at most 255 options. */
export const JEV_LAB_MAX_CANDIDATES = 254;
export const JEV_LAB_DEFAULT_ABORT_MS = 22_000;
export const JEV_LAB_DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
/** Fixed extra input tokens added to the conservative estimate: the provider wraps the question in its own prompt. */
export const JEV_LAB_PROMPT_OVERHEAD_TOKENS = 500;
export const JEV_LAB_QUESTION_ID = "decision";
/**
 * The version of every text sent to the model. It is part of the NAME of the chooser, and the name is part of the
 * manifest of a run: a journal can never mix decisions made under two different instructions. A test pins a hash of the
 * texts and fails when they change without this version changing.
 */
export const JEV_LAB_PROMPT_VERSION = "p1";

/** The numeric criteria that candidates of the lab carry (src/lab/candidates.ts). "signalZ", the planted score of the synthetic source, is NOT here on purpose. */
export const JEV_LAB_CRITERIA: readonly string[] = Object.freeze([
  "carryGrossBps",
  "carryNetBps",
  "basisBps",
  "costBps",
  "fundingLastBps",
  "fundingMeanBps",
  "fundingMinBps",
  "fundingNextBps",
  "oiChangeBps",
  "retLookbackBps",
  "settlementsInHorizon",
  "spreadBps",
  "volHorizonBps",
]);

// ---------------------------------------------------------------------------
// What the model is told
// ---------------------------------------------------------------------------

/** The single sentence that says nothing is executed. The static tests allow the words of execution only here. */
export const JEV_LAB_SHADOW_NOTICE =
  "This is a SHADOW evaluation for measurement: nothing is executed, signed or sent, no capital is at risk and no real position exists.";

export const JEV_LAB_QUESTION = "Which single candidate, if any, has the best net result over its horizon, or is holding better?";

export const JEV_LAB_GOAL = `${JEV_LAB_SHADOW_NOTICE} Pick the candidate whose expected net result over the horizon, after the listed costs, is clearly positive. Holding is always valid and is the preferred answer whenever the evidence is thin, mixed, stale or unknown.`;

export const JEV_LAB_INPUTS =
  "Each candidate has an opaque id, a modality, a side and a horizon in hours. Every figure under values was measured before the decision time, and names ending in Bps are basis points. A criterion listed under unknown is UNKNOWN: it is not zero and must not be guessed or assumed. costBps is already a conservative total of fees, spread and slippage. The probabilities you give are uncalibrated decision weights, not win rates, and your confidence is not calibrated.";

const HOLD_TEXT = "Hold: do not select any candidate this epoch. This is a valid and preferred answer when the evidence is thin, mixed, stale or unknown, or when the expected net result does not clearly exceed costBps.";

// ---------------------------------------------------------------------------
// Errors (fixed messages: the message of a provider error is never copied)
// ---------------------------------------------------------------------------

/** The state handed to the chooser is outside the vocabulary of the lab. Nothing was sent. */
export class JevStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevStateError";
  }
}

/** The cap was reached: no call is made and none ever will be. status is the word the lab reports. */
export class JevBudgetExhaustedError extends Error {
  readonly status = "budget-exhausted" as const;
  constructor(readonly reason: "calls" | "usd") {
    super(reason === "calls" ? "orçamento esgotado: limite de chamadas atingido" : "orçamento esgotado: limite de custo atingido");
    this.name = "JevBudgetExhaustedError";
  }
}

/** Too many consultations in a row failed: the Jev is not answering, so no further call is made. */
export class JevCircuitOpenError extends Error {
  readonly status = "circuit-open" as const;
  constructor() {
    super("falhas consecutivas: nenhuma nova consulta será feita");
    this.name = "JevCircuitOpenError";
  }
}

/** The call to the provider failed. The cause is dropped on purpose: provider errors can carry request details. */
export class JevCallError extends Error {
  constructor(readonly kind: "timeout" | "error") {
    super(kind === "timeout" ? "a consulta ao Jev excedeu o prazo e foi abortada" : "a consulta ao Jev falhou");
    this.name = "JevCallError";
  }
}

// ---------------------------------------------------------------------------
// The payload: numbers, opaque ids and closed vocabularies only
// ---------------------------------------------------------------------------

export interface JevLabCandidateState {
  id: string;
  modality: LabModality;
  side: LabSide;
  horizonHours: number;
  /** Known criteria only. A criterion that is unknown is absent here and named under `unknown`. */
  values: Record<string, number>;
  unknown: string[];
}

export interface JevLabState {
  horizonHours: number;
  candidates: JevLabCandidateState[];
}

export interface JevLabQuestions {
  [JEV_LAB_QUESTION_ID]: {
    type: "choice";
    instructions: { question: string; goal: string; inputs: string };
    criteria: Record<string, string>;
  };
}

export interface JevLabPayload {
  state: JevLabState;
  questions: JevLabQuestions;
  /** hold plus the ids of the candidates, in the order of the question. */
  keys: string[];
}

const CANDIDATE_KEY = /^c[1-9][0-9]{0,2}$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MAX_HORIZON_HOURS = 24 * 31;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Five significant digits: keeps the prompt small without flattening a figure like 0.02715. */
function significant(value: number): number {
  return Number(value.toPrecision(5));
}

function positiveHours(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_HORIZON_HOURS) throw new JevStateError(`${what} fora do intervalo`);
  return value;
}

/**
 * Builds what is sent to the model from the state that the Jev policy hands to the chooser. Throws `JevStateError` for
 * anything that is not an opaque id, a member of the closed vocabularies or a finite number (or null, which becomes
 * "unknown"). The error message never repeats the offending content.
 */
export function buildJevLabPayload(state: ChooserState): JevLabPayload {
  if (!isRecord(state) || !Array.isArray(state.candidates)) throw new JevStateError("estado sem candidatos");
  const horizonHours = positiveHours(state.horizonHours, "horizonte do estado");
  if (state.candidates.length < 1 || state.candidates.length > JEV_LAB_MAX_CANDIDATES) throw new JevStateError("número de candidatos fora do intervalo");
  const seen = new Set<string>();
  const candidates: JevLabCandidateState[] = state.candidates.map((candidate) => {
    if (!isRecord(candidate)) throw new JevStateError("candidato malformado");
    const id = candidate.key;
    if (typeof id !== "string" || !CANDIDATE_KEY.test(id) || seen.has(id)) throw new JevStateError("id de candidato inválido ou repetido");
    seen.add(id);
    if (typeof candidate.modality !== "string" || !(LAB_MODALITIES as readonly string[]).includes(candidate.modality)) throw new JevStateError("modalidade fora do vocabulário");
    if (typeof candidate.side !== "string" || !(LAB_SIDES as readonly string[]).includes(candidate.side)) throw new JevStateError("lado fora do vocabulário");
    const candidateHours = positiveHours(candidate.horizonHours, "horizonte do candidato");
    if (!isRecord(candidate.criteria)) throw new JevStateError("critérios malformados");
    const names = Object.keys(candidate.criteria);
    if (names.length > JEV_LAB_CRITERIA.length) throw new JevStateError("critérios demais");
    const values: Record<string, number> = {};
    const unknown: string[] = [];
    for (const name of [...names].sort()) {
      if (!JEV_LAB_CRITERIA.includes(name)) throw new JevStateError("critério fora do vocabulário");
      const value = candidate.criteria[name];
      if (value === null) unknown.push(name);
      else if (typeof value === "number" && Number.isFinite(value)) values[name] = significant(value);
      else throw new JevStateError("valor de critério que não é número nem desconhecido");
    }
    return { id, modality: candidate.modality as LabModality, side: candidate.side as LabSide, horizonHours: candidateHours, values, unknown };
  });

  const criteria: Record<string, string> = { hold: HOLD_TEXT };
  for (const candidate of candidates) {
    criteria[candidate.id] = `Select candidate ${candidate.id}: the hypothetical ${candidate.side} ${candidate.modality} position over ${candidate.horizonHours} hours. Select it only if its figures imply a net gain over that horizon that is clearly larger than its costBps and the uncertainty; figures listed as unknown count against it.`;
  }
  return {
    state: { horizonHours, candidates },
    questions: { [JEV_LAB_QUESTION_ID]: { type: "choice", instructions: { question: JEV_LAB_QUESTION, goal: JEV_LAB_GOAL, inputs: JEV_LAB_INPUTS }, criteria } },
    keys: [HOLD, ...candidates.map((candidate) => candidate.id)],
  };
}

export interface InputTokenEstimate {
  /** Characters over four: the usual rule of thumb. */
  typical: number;
  /** Characters over three plus a fixed overhead: numbers and punctuation cost more tokens than prose. Used for the cap. */
  conservative: number;
}

export function estimateInputTokens(payload: JevLabPayload): InputTokenEstimate {
  const characters = JSON.stringify({ state: payload.state, questions: payload.questions }).length;
  return { typical: Math.ceil(characters / 4), conservative: Math.ceil(characters / 3) + JEV_LAB_PROMPT_OVERHEAD_TOKENS };
}

// ---------------------------------------------------------------------------
// The evaluation function (injectable) and the chooser
// ---------------------------------------------------------------------------

export interface JevEvaluateArgs {
  /** The SDK model; undefined when the caller injected its own evaluate and no model is needed. */
  model: unknown;
  state: unknown;
  questions: unknown;
  maxRetries: number;
  abortSignal: AbortSignal;
}

/** The slice of experimental_evaluate that this adapter uses. */
export type JevEvaluateFn = (args: JevEvaluateArgs) => Promise<unknown>;

const sdkEvaluate: JevEvaluateFn = (args) =>
  experimental_evaluate({ model: args.model as never, state: args.state as never, questions: args.questions as never, maxRetries: args.maxRetries, abortSignal: args.abortSignal });

export interface JevLabChooserOptions {
  /** The model id, e.g. "jev-latest". It becomes the name of the chooser, so it is validated and never a secret. */
  modelId: string;
  /** USD per million input tokens. Required: without it the cap in USD could not be applied. */
  usdPerMTok: number;
  maxCalls: number;
  maxUsd: number;
  /**
   * Abort of the call to the provider, in ms. Keep it a little above the timeout of the Jev policy, so that the policy
   * records the timeout and this abort only cleans up the connection afterwards.
   */
  abortAfterMs?: number;
  /** After this many failures in a row the chooser opens the circuit and stops calling. */
  maxConsecutiveFailures?: number;
  /** The planned size of the largest call in USD, so that the caller can stop BEFORE a call that would not fit. */
  expectedCallUsd?: number;
  /** Default: experimental_evaluate of the AI SDK. Tests inject a fake. */
  evaluate?: JevEvaluateFn;
  /**
   * The SDK model given to experimental_evaluate. Default: typeSafeAi.evaluationModel(modelId), built on the first
   * call, which reads the API key from the environment of the process. A test passes a model whose fetch is a fake.
   */
  model?: unknown;
  /** Clock for the latency, in ms. Default: performance.now. */
  now?: () => number;
}

export type JevStopReason = "calls" | "usd" | "failures";

/** What the chooser spent and saw. All numbers are of THIS chooser instance. */
export interface JevMeter {
  maxCalls: number;
  maxUsd: number;
  usdPerMTok: number;
  /** Calls that reached the provider (including the ones still in flight). */
  callsStarted: number;
  callsSettled: number;
  /** Settled with a usable answer shape that passed validateChooserAnswer. */
  callsOk: number;
  /** Settled with an exception (provider error, timeout, abort). */
  callsFailed: number;
  /** Settled with an answer that validateChooserAnswer refused. */
  callsInvalid: number;
  /** Settled without valid usage: cost unknown, charged to the cap at the estimate. */
  callsWithoutUsage: number;
  /** States refused before any call (outside the vocabulary). */
  statesRejected: number;
  inputTokensKnown: number;
  /** Sum of tokens times price over the calls with valid usage. */
  knownUsd: number;
  /** What counts against maxUsd: known cost, plus the estimate of every call without valid usage and of calls in flight. */
  upperBoundUsd: number;
  consecutiveFailures: number;
  stopReason: JevStopReason | null;
}

export class JevLabChooser implements LabChooser {
  /** The model id as the provider knows it. */
  readonly modelId: string;
  /** The model id and the version of the instruction, e.g. jev-latest@p1: what the manifest of a run records. */
  readonly name: string;
  readonly isMock = false;
  private readonly usdPerMTok: number;
  private readonly maxCalls: number;
  private readonly maxUsd: number;
  private readonly abortAfterMs: number;
  private readonly maxConsecutiveFailures: number;
  private readonly evaluate: JevEvaluateFn;
  private readonly injected: boolean;
  private readonly now: () => number;
  private model: unknown;

  private callsStarted = 0;
  private callsSettled = 0;
  private callsOk = 0;
  private callsFailed = 0;
  private callsInvalid = 0;
  private callsWithoutUsage = 0;
  private statesRejected = 0;
  private inputTokensKnown = 0;
  private knownUsd = 0;
  private committedUsd = 0;
  private reservedUsd = 0;
  private largestCallUsd: number;
  private consecutiveFailures = 0;
  private exhausted: "calls" | "usd" | null = null;
  private tripped = false;

  constructor(options: JevLabChooserOptions) {
    if (typeof options.modelId !== "string" || !MODEL_ID.test(options.modelId)) throw new RangeError("modelId must be 1 to 64 characters of letters, digits and . _ : -");
    if (typeof options.usdPerMTok !== "number" || !Number.isFinite(options.usdPerMTok) || options.usdPerMTok <= 0) throw new RangeError("usdPerMTok must be a finite number above zero");
    if (!Number.isSafeInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > JEV_LAB_HARD_MAX_CALLS) throw new RangeError(`maxCalls must be an integer from 1 to ${JEV_LAB_HARD_MAX_CALLS}`);
    if (typeof options.maxUsd !== "number" || !Number.isFinite(options.maxUsd) || options.maxUsd <= 0 || options.maxUsd > JEV_LAB_HARD_MAX_USD) throw new RangeError(`maxUsd must be a number above zero and at most ${JEV_LAB_HARD_MAX_USD}`);
    const abortAfterMs = options.abortAfterMs ?? JEV_LAB_DEFAULT_ABORT_MS;
    if (!Number.isSafeInteger(abortAfterMs) || abortAfterMs < 1 || abortAfterMs > 600_000) throw new RangeError("abortAfterMs must be an integer from 1 to 600000");
    const failures = options.maxConsecutiveFailures ?? JEV_LAB_DEFAULT_MAX_CONSECUTIVE_FAILURES;
    if (!Number.isSafeInteger(failures) || failures < 1 || failures > 100) throw new RangeError("maxConsecutiveFailures must be an integer from 1 to 100");
    const expected = options.expectedCallUsd ?? 0;
    if (typeof expected !== "number" || !Number.isFinite(expected) || expected < 0) throw new RangeError("expectedCallUsd must be a finite number at or above zero");
    this.modelId = options.modelId;
    this.name = `${options.modelId}@${JEV_LAB_PROMPT_VERSION}`;
    this.usdPerMTok = options.usdPerMTok;
    this.maxCalls = options.maxCalls;
    this.maxUsd = options.maxUsd;
    this.abortAfterMs = abortAfterMs;
    this.maxConsecutiveFailures = failures;
    this.largestCallUsd = expected;
    this.injected = options.evaluate !== undefined;
    this.evaluate = options.evaluate ?? sdkEvaluate;
    this.model = options.model;
    this.now = options.now ?? (() => performance.now());
  }

  private usdFor(tokens: number): number {
    return (tokens / 1_000_000) * this.usdPerMTok;
  }

  /** The SDK model is built on the first real call, so that a chooser with an injected evaluate never touches the SDK. */
  private modelForCall(): unknown {
    if (this.model !== undefined) return this.model;
    if (this.injected) return undefined;
    this.model = typeSafeAi.evaluationModel(this.modelId);
    return this.model;
  }

  /** Why no further consultation will be made, or null while one more call still fits. */
  stopReason(): JevStopReason | null {
    if (this.exhausted !== null) return this.exhausted;
    if (this.tripped) return "failures";
    if (this.callsStarted >= this.maxCalls) return "calls";
    if (this.committedUsd + this.reservedUsd + this.largestCallUsd > this.maxUsd) return "usd";
    return null;
  }

  /** Whether one more call of the given (or the largest seen) size still fits under both caps. */
  canAffordNext(callUsd: number = this.largestCallUsd): boolean {
    if (this.exhausted !== null || this.tripped || this.callsStarted >= this.maxCalls) return false;
    return this.committedUsd + this.reservedUsd + callUsd <= this.maxUsd;
  }

  meter(): JevMeter {
    return {
      maxCalls: this.maxCalls,
      maxUsd: this.maxUsd,
      usdPerMTok: this.usdPerMTok,
      callsStarted: this.callsStarted,
      callsSettled: this.callsSettled,
      callsOk: this.callsOk,
      callsFailed: this.callsFailed,
      callsInvalid: this.callsInvalid,
      callsWithoutUsage: this.callsWithoutUsage,
      statesRejected: this.statesRejected,
      inputTokensKnown: this.inputTokensKnown,
      knownUsd: this.knownUsd,
      upperBoundUsd: this.committedUsd + this.reservedUsd,
      consecutiveFailures: this.consecutiveFailures,
      stopReason: this.stopReason(),
    };
  }

  async choose(state: ChooserState): Promise<ChooserAnswer> {
    let payload: JevLabPayload;
    try {
      payload = buildJevLabPayload(state);
    } catch (error) {
      this.statesRejected += 1;
      throw error;
    }
    const estimate = estimateInputTokens(payload);
    const estimateUsd = this.usdFor(estimate.conservative);
    if (estimateUsd > this.largestCallUsd) this.largestCallUsd = estimateUsd;

    if (this.exhausted !== null) throw new JevBudgetExhaustedError(this.exhausted);
    if (this.tripped) throw new JevCircuitOpenError();
    if (this.callsStarted >= this.maxCalls) {
      this.exhausted = "calls";
      throw new JevBudgetExhaustedError("calls");
    }
    if (this.committedUsd + this.reservedUsd + estimateUsd > this.maxUsd) {
      this.exhausted = "usd";
      throw new JevBudgetExhaustedError("usd");
    }
    // From here to the first await nothing can interleave: the check and the reservation are one step.
    this.callsStarted += 1;
    this.reservedUsd += estimateUsd;

    const started = this.now();
    // An explicit controller and timer, not AbortSignal.timeout: in Bun that signal does not keep the loop alive.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.abortAfterMs);
    let result: unknown;
    try {
      result = await this.evaluate({ model: this.modelForCall(), state: payload.state, questions: payload.questions, maxRetries: 0, abortSignal: controller.signal });
    } catch {
      this.settle(estimateUsd, null, "exception");
      throw new JevCallError(controller.signal.aborted ? "timeout" : "error");
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Math.max(0, this.now() - started);

    const record = isRecord(result) ? result : {};
    const answers = isRecord(record.answers) ? record.answers : {};
    const answer = isRecord(answers[JEV_LAB_QUESTION_ID]) ? (answers[JEV_LAB_QUESTION_ID] as Record<string, unknown>) : {};
    const usage = isRecord(record.usage) ? record.usage.inputTokens : undefined;
    const inputTokens = typeof usage === "number" && Number.isSafeInteger(usage) && usage > 0 ? usage : null;
    const metadata = isRecord(record.providerMetadata) ? record.providerMetadata.typesafe : null;
    const confidences = isRecord(metadata) && isRecord(metadata.confidence) ? metadata.confidence : null;
    const rawConfidence = confidences === null ? undefined : confidences[JEV_LAB_QUESTION_ID];
    const confidence = typeof rawConfidence === "number" && Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1 ? rawConfidence : null;

    const out: ChooserAnswer = {
      choice: answer.choice as string,
      ...(answer.probabilities === undefined ? {} : { probabilities: answer.probabilities as Record<string, number> }),
      confidence,
      latencyMs,
      inputTokens,
    };
    this.settle(estimateUsd, inputTokens, validateChooserAnswer(out, payload.keys).ok ? "ok" : "invalid");
    return out;
  }

  /** Replaces the reservation by what the call really cost (or, without valid usage, by the estimate). */
  private settle(estimateUsd: number, inputTokens: number | null, outcome: "ok" | "invalid" | "exception"): void {
    this.reservedUsd = Math.max(0, this.reservedUsd - estimateUsd);
    this.callsSettled += 1;
    if (inputTokens === null) {
      this.committedUsd += estimateUsd;
      this.callsWithoutUsage += 1;
    } else {
      const cost = this.usdFor(inputTokens);
      this.committedUsd += cost;
      this.knownUsd += cost;
      this.inputTokensKnown += inputTokens;
      if (cost > this.largestCallUsd) this.largestCallUsd = cost;
    }
    if (outcome === "ok") {
      this.callsOk += 1;
      this.consecutiveFailures = 0;
      return;
    }
    // An exception or an answer that does not validate: both are failures of the Jev as seen from the lab.
    if (outcome === "exception") this.callsFailed += 1;
    else this.callsInvalid += 1;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) this.tripped = true;
  }
}
