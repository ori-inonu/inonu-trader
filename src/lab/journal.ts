/**
 * Journal of the Jev Decision Lab: append-only JSONL of epochs, decisions and outcomes with idempotent resume.
 * Specification: docs/JEV-LABORATORIO-DE-DECISAO.md section 3.5.
 *
 * This is the ONLY lab module that writes to disk. Rules:
 * - the log is only ever appended to; one group of lines is written with a single append call;
 * - an identical record already in the journal is skipped (rerunning an epoch never duplicates), a record with the
 *   same key and different content is a conflict and nothing of its batch is stored;
 * - snapshots are written to a temporary file and renamed over the target, so a reader never sees half a snapshot;
 * - reading is STRICT: any malformed line is an error that names the line (never the content), never skipped;
 * - a missing or corrupt journal STOPS the run instead of starting empty over existing results: a journal that is
 *   missing while a snapshot exists, an empty or truncated one, one whose header differs from the requested
 *   configuration, all raise an error and leave every file untouched.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DECISION_STATUSES, HOLD, INCOMPLETE_REASONS, LAB_MODALITIES, LAB_SIDES, LEVERAGES, type Epoch, type LabCandidate, type Outcome, type PolicyDecision } from "./types.ts";

export type JournalErrorKind = "corrupt" | "missing" | "mismatch" | "conflict" | "incomplete" | "invalid";

export class JournalError extends Error {
  readonly kind: JournalErrorKind;
  readonly line: number | null;
  constructor(kind: JournalErrorKind, message: string, line: number | null = null) {
    super(line === null ? message : `linha ${line}: ${message}`);
    this.name = "JournalError";
    this.kind = kind;
    this.line = line;
  }
}

export type JsonObject = Record<string, unknown>;

export type JournalRecord =
  | { type: "epoch"; epoch: Epoch }
  | { type: "decision"; decision: PolicyDecision }
  | { type: "outcome"; outcome: Outcome };

export interface JournalData {
  runId: string;
  manifest: JsonObject;
  epochs: Epoch[];
  decisions: PolicyDecision[];
  outcomes: Outcome[];
}

/** What the orchestrator needs from a journal. */
export interface JournalPort {
  hasEpoch(epochId: string): boolean;
  getEpoch(epochId: string): Epoch | undefined;
  hasDecision(epochId: string, policyId: string): boolean;
  hasOutcome(epochId: string, candidateId: string): boolean;
  /** Stores what is new, skips what is identical, throws on conflict. Returns how many records were stored. */
  append(records: readonly JournalRecord[]): number;
  data(): JournalData;
}

const JOURNAL_SCHEMA = "jev-lab-journal-v1";
const SNAPSHOT_SCHEMA = "jev-lab-snapshot-v1";
const MAX_JOURNAL_BYTES = 536_870_912;

// ---------------------------------------------------------------------------
// Canonical form and digests
// ---------------------------------------------------------------------------

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/** JSON with the keys of every object sorted: two equal values always give the same text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function digestText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function digestBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function runIdOf(manifest: JsonObject): string {
  return digestText(canonicalJson(manifest)).slice(0, 16);
}

// ---------------------------------------------------------------------------
// Strict validation of what is written and read
// ---------------------------------------------------------------------------

class Invalid extends Error {}

function bad(path: string, reason: string): never {
  throw new Invalid(`${path}: ${reason}`);
}

function plain(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) bad(path, "objeto esperado");
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) bad(`${path}.${key}`, "chave desconhecida");
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) bad(`${path}.${key}`, "chave ausente");
}

function text(value: unknown, path: string, pattern: RegExp, max = 200): string {
  if (typeof value !== "string" || value.length > max || !pattern.test(value)) bad(path, "texto inválido");
  return value;
}

function integer(value: unknown, path: string, min: number, max: number = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) bad(path, "inteiro inválido");
  return value;
}

function finite(value: unknown, path: string, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) bad(path, "número inválido");
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") bad(path, "booleano esperado");
  return value;
}

function nullable<T>(value: unknown, read: (v: unknown) => T): T | null {
  return value === null ? null : read(value);
}

const INSTRUMENT = /^[A-Z0-9]{1,20}(?:-[A-Z0-9]{1,20}){1,3}$/;
const POLICY_ID = /^[a-z][a-z0-9-]{0,31}$/;
const EPOCH_ID = /^e[0-9]{1,16}$/;
const CANDIDATE_ID = /^(?:funding-carry|perp-directional|spot-momentum|yield-allocation|dex-signal|kuru-maker)\.[A-Z0-9]{1,20}(?:-[A-Z0-9]{1,20}){1,3}\.(?:long|short|neutral)$/;
const FEATURE_NAME = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const REASON = /^[a-z][a-z0-9:_-]{0,60}$/;
const VENUE = /^[a-z0-9-]{1,16}$/;
const ANY_TEXT = /^[^\u0000-\u001f]*$/;

function validateCandidate(value: unknown, path: string): LabCandidate {
  const v = plain(value, path);
  exact(v, ["id", "modality", "instrument", "hedgeInstrument", "venue", "observedAtMs", "horizonMs", "side", "features", "costs", "validUntilMs", "provenance"], path);
  const id = text(v.id, `${path}.id`, CANDIDATE_ID, 100);
  if (typeof v.modality !== "string" || !(LAB_MODALITIES as readonly string[]).includes(v.modality)) bad(`${path}.modality`, "modalidade desconhecida");
  const instrument = text(v.instrument, `${path}.instrument`, INSTRUMENT, 48);
  if (typeof v.side !== "string" || !(LAB_SIDES as readonly string[]).includes(v.side)) bad(`${path}.side`, "lado desconhecido");
  if (id !== `${v.modality}.${instrument}.${v.side}`) bad(`${path}.id`, "id não confere com modalidade, instrumento e lado");
  const featuresRaw = plain(v.features, `${path}.features`);
  const features: Record<string, number | null> = {};
  for (const key of Object.keys(featuresRaw)) {
    if (!FEATURE_NAME.test(key)) bad(`${path}.features`, "nome de feature inválido");
    features[key] = nullable(featuresRaw[key], (x) => finite(x, `${path}.features.${key}`));
  }
  const c = plain(v.costs, `${path}.costs`);
  exact(c, ["feeBps", "spreadBps", "slippageBps", "fixedUsd", "notionalUsd", "complete"], `${path}.costs`);
  const costs = {
    feeBps: nullable(c.feeBps, (x) => finite(x, `${path}.costs.feeBps`, 0)),
    spreadBps: nullable(c.spreadBps, (x) => finite(x, `${path}.costs.spreadBps`, 0)),
    slippageBps: nullable(c.slippageBps, (x) => finite(x, `${path}.costs.slippageBps`, 0)),
    fixedUsd: nullable(c.fixedUsd, (x) => finite(x, `${path}.costs.fixedUsd`, 0)),
    notionalUsd: finite(c.notionalUsd, `${path}.costs.notionalUsd`, Number.MIN_VALUE),
    complete: bool(c.complete, `${path}.costs.complete`),
  };
  if (costs.complete !== (costs.feeBps !== null && costs.spreadBps !== null && costs.slippageBps !== null && costs.fixedUsd !== null)) bad(`${path}.costs.complete`, "complete não confere com os componentes");
  const p = plain(v.provenance, `${path}.provenance`);
  exact(p, ["source", "externalAccessObserved"], `${path}.provenance`);
  return {
    id,
    modality: v.modality as LabCandidate["modality"],
    instrument,
    hedgeInstrument: nullable(v.hedgeInstrument, (x) => text(x, `${path}.hedgeInstrument`, INSTRUMENT, 48)),
    venue: text(v.venue, `${path}.venue`, VENUE, 16),
    observedAtMs: integer(v.observedAtMs, `${path}.observedAtMs`, 0),
    horizonMs: integer(v.horizonMs, `${path}.horizonMs`, 1),
    side: v.side as LabCandidate["side"],
    features,
    costs,
    validUntilMs: integer(v.validUntilMs, `${path}.validUntilMs`, 0),
    provenance: { source: text(p.source, `${path}.provenance.source`, ANY_TEXT, 120), externalAccessObserved: bool(p.externalAccessObserved, `${path}.provenance.externalAccessObserved`) },
  };
}

function validateEpoch(value: unknown, path = "epoch"): Epoch {
  const v = plain(value, path);
  exact(v, ["id", "index", "t", "candidates", "eligibleIds", "ineligible"], path);
  const t = integer(v.t, `${path}.t`, 0);
  const id = text(v.id, `${path}.id`, EPOCH_ID, 20);
  if (id !== `e${t}`) bad(`${path}.id`, "id não confere com t");
  if (!Array.isArray(v.candidates) || v.candidates.length > 500) bad(`${path}.candidates`, "lista inválida");
  const candidates = v.candidates.map((entry, i) => validateCandidate(entry, `${path}.candidates[${i}]`));
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) bad(`${path}.candidates`, "id de candidato repetido");
    ids.add(candidate.id);
  }
  if (!Array.isArray(v.eligibleIds)) bad(`${path}.eligibleIds`, "lista esperada");
  const eligibleIds = v.eligibleIds.map((entry, i) => text(entry, `${path}.eligibleIds[${i}]`, CANDIDATE_ID, 100));
  if (new Set(eligibleIds).size !== eligibleIds.length || eligibleIds.some((entry) => !ids.has(entry))) bad(`${path}.eligibleIds`, "ids elegíveis inválidos");
  if (!Array.isArray(v.ineligible)) bad(`${path}.ineligible`, "lista esperada");
  const ineligible = v.ineligible.map((entry, i) => {
    const e = plain(entry, `${path}.ineligible[${i}]`);
    exact(e, ["id", "reasons"], `${path}.ineligible[${i}]`);
    if (!Array.isArray(e.reasons) || e.reasons.length === 0) bad(`${path}.ineligible[${i}].reasons`, "razões esperadas");
    return { id: text(e.id, `${path}.ineligible[${i}].id`, CANDIDATE_ID, 100), reasons: e.reasons.map((r, k) => text(r, `${path}.ineligible[${i}].reasons[${k}]`, REASON, 61)) };
  });
  const ineligibleIds = ineligible.map((entry) => entry.id);
  if (ineligibleIds.some((entry) => !ids.has(entry) || eligibleIds.includes(entry)) || eligibleIds.length + ineligibleIds.length !== candidates.length) bad(`${path}.ineligible`, "elegíveis e inelegíveis não cobrem os candidatos");
  return { id, index: integer(v.index, `${path}.index`, 0), t, candidates, eligibleIds, ineligible };
}

function validateDecision(value: unknown, path = "decision"): PolicyDecision {
  const v = plain(value, path);
  exact(v, ["policyId", "epochId", "choice", "probabilities", "latencyMs", "inputTokens", "costUsd", "status", "note"], path);
  const probabilitiesRaw = plain(v.probabilities, `${path}.probabilities`);
  const probabilities: Record<string, number> = {};
  for (const key of Object.keys(probabilitiesRaw)) {
    if (key !== HOLD && !CANDIDATE_ID.test(key)) bad(`${path}.probabilities`, "chave inválida");
    probabilities[key] = finite(probabilitiesRaw[key], `${path}.probabilities.${key}`, 0, 1);
  }
  if (typeof v.status !== "string" || !(DECISION_STATUSES as readonly string[]).includes(v.status)) bad(`${path}.status`, "status desconhecido");
  const choice = v.choice;
  if (choice !== HOLD) text(choice, `${path}.choice`, CANDIDATE_ID, 100);
  return {
    policyId: text(v.policyId, `${path}.policyId`, POLICY_ID, 32),
    epochId: text(v.epochId, `${path}.epochId`, EPOCH_ID, 20),
    choice: choice as string,
    probabilities,
    latencyMs: finite(v.latencyMs, `${path}.latencyMs`, 0),
    inputTokens: nullable(v.inputTokens, (x) => integer(x, `${path}.inputTokens`, 0)),
    costUsd: nullable(v.costUsd, (x) => finite(x, `${path}.costUsd`, 0)),
    status: v.status as PolicyDecision["status"],
    note: nullable(v.note, (x) => text(x, `${path}.note`, ANY_TEXT, 200)),
  };
}

function validateOutcome(value: unknown, path = "outcome"): Outcome {
  const v = plain(value, path);
  exact(v, ["epochId", "candidateId", "entryMs", "horizonEndMs", "grossReturn", "fundingReturn", "costReturn", "opportunityCost", "netReturn", "capitalPerNotional", "leverage", "complete", "incompleteReason"], path);
  const complete = bool(v.complete, `${path}.complete`);
  const reason = nullable(v.incompleteReason, (x) => {
    if (typeof x !== "string" || !(INCOMPLETE_REASONS as readonly string[]).includes(x)) bad(`${path}.incompleteReason`, "razão desconhecida");
    return x as Outcome["incompleteReason"];
  });
  if (!Array.isArray(v.leverage) || v.leverage.length !== LEVERAGES.length) bad(`${path}.leverage`, "uma linha por alavancagem esperada");
  const leverage = v.leverage.map((entry, i) => {
    const row = plain(entry, `${path}.leverage[${i}]`);
    exact(row, ["leverage", "applicable", "liquidated", "equityMultiple"], `${path}.leverage[${i}]`);
    if (row.leverage !== LEVERAGES[i]) bad(`${path}.leverage[${i}].leverage`, "alavancagem fora de ordem");
    return {
      leverage: LEVERAGES[i] as (typeof LEVERAGES)[number],
      applicable: bool(row.applicable, `${path}.leverage[${i}].applicable`),
      liquidated: nullable(row.liquidated, (x) => bool(x, `${path}.leverage[${i}].liquidated`)),
      equityMultiple: nullable(row.equityMultiple, (x) => finite(x, `${path}.leverage[${i}].equityMultiple`, 0)),
    };
  });
  const outcome: Outcome = {
    epochId: text(v.epochId, `${path}.epochId`, EPOCH_ID, 20),
    candidateId: text(v.candidateId, `${path}.candidateId`, CANDIDATE_ID, 100),
    entryMs: nullable(v.entryMs, (x) => integer(x, `${path}.entryMs`, 0)),
    horizonEndMs: integer(v.horizonEndMs, `${path}.horizonEndMs`, 0),
    grossReturn: nullable(v.grossReturn, (x) => finite(x, `${path}.grossReturn`)),
    fundingReturn: nullable(v.fundingReturn, (x) => finite(x, `${path}.fundingReturn`)),
    costReturn: nullable(v.costReturn, (x) => finite(x, `${path}.costReturn`)),
    opportunityCost: nullable(v.opportunityCost, (x) => finite(x, `${path}.opportunityCost`)),
    netReturn: nullable(v.netReturn, (x) => finite(x, `${path}.netReturn`)),
    capitalPerNotional: nullable(v.capitalPerNotional, (x) => finite(x, `${path}.capitalPerNotional`, Number.MIN_VALUE)),
    leverage,
    complete,
    incompleteReason: reason,
  };
  const numbers = [outcome.grossReturn, outcome.fundingReturn, outcome.costReturn, outcome.opportunityCost, outcome.netReturn, outcome.capitalPerNotional];
  if (complete) {
    if (reason !== null || numbers.some((n) => n === null) || outcome.entryMs === null) bad(`${path}.complete`, "resultado completo exige números e nenhuma razão");
  } else if (reason === null || numbers.some((n) => n !== null) || leverage.some((row) => row.liquidated !== null || row.equityMultiple !== null)) {
    bad(`${path}.complete`, "resultado incompleto exige razão e números nulos");
  }
  return outcome;
}

function validateRecord(value: unknown, path = "registro"): JournalRecord {
  const v = plain(value, path);
  if (v.type === "epoch") {
    exact(v, ["type", "epoch"], path);
    return { type: "epoch", epoch: validateEpoch(v.epoch) };
  }
  if (v.type === "decision") {
    exact(v, ["type", "decision"], path);
    return { type: "decision", decision: validateDecision(v.decision) };
  }
  if (v.type === "outcome") {
    exact(v, ["type", "outcome"], path);
    return { type: "outcome", outcome: validateOutcome(v.outcome) };
  }
  return bad(`${path}.type`, "tipo de registro desconhecido");
}

function keyOf(record: JournalRecord): string {
  if (record.type === "epoch") return `E|${record.epoch.id}`;
  if (record.type === "decision") return `D|${record.decision.epochId}|${record.decision.policyId}`;
  return `O|${record.outcome.epochId}|${record.outcome.candidateId}`;
}

export function serializeRecord(record: JournalRecord): string {
  return `${JSON.stringify(record)}\n`;
}

function headerLine(runId: string, manifest: JsonObject): string {
  return `${JSON.stringify({ type: "header", schema: JOURNAL_SCHEMA, runId, manifest: sortValue(manifest) })}\n`;
}

// ---------------------------------------------------------------------------
// In-memory state shared by the memory and the file journal
// ---------------------------------------------------------------------------

class JournalState {
  readonly epochs: Epoch[] = [];
  readonly decisions: PolicyDecision[] = [];
  readonly outcomes: Outcome[] = [];
  private readonly epochById = new Map<string, Epoch>();
  private readonly canonical = new Map<string, string>();

  constructor(
    readonly runId: string,
    readonly manifest: JsonObject,
  ) {}

  hasKey(key: string): boolean {
    return this.canonical.has(key);
  }

  epoch(id: string): Epoch | undefined {
    return this.epochById.get(id);
  }

  /** References must exist: the epoch of a decision or an outcome, and the choice or candidate among the eligible ones. */
  checkReferences(record: JournalRecord, epochs: (id: string) => Epoch | undefined, invalid: (message: string) => never): void {
    if (record.type === "epoch") return;
    const epochId = record.type === "decision" ? record.decision.epochId : record.outcome.epochId;
    const epoch = epochs(epochId);
    if (epoch === undefined) invalid("registro de uma época desconhecida");
    if (record.type === "decision") {
      const { choice, probabilities } = record.decision;
      if (choice !== HOLD && !(epoch as Epoch).eligibleIds.includes(choice)) invalid("escolha que não é hold nem candidato elegível da época");
      for (const key of Object.keys(probabilities)) if (key !== HOLD && !(epoch as Epoch).eligibleIds.includes(key)) invalid("probabilidade de um candidato que não é elegível");
    } else if (!(epoch as Epoch).eligibleIds.includes(record.outcome.candidateId)) {
      invalid("resultado de um candidato que não é elegível na época");
    }
  }

  commit(record: JournalRecord): void {
    this.canonical.set(keyOf(record), canonicalJson(record));
    if (record.type === "epoch") {
      this.epochs.push(record.epoch);
      this.epochById.set(record.epoch.id, record.epoch);
    } else if (record.type === "decision") this.decisions.push(record.decision);
    else this.outcomes.push(record.outcome);
  }

  /**
   * Validates a batch and returns the records that are new. Identical records are skipped, a different record with an
   * existing key is a conflict. Nothing is stored here.
   */
  plan(records: readonly JournalRecord[]): JournalRecord[] {
    const fresh: JournalRecord[] = [];
    const batchKeys = new Map<string, string>();
    const batchEpochs = new Map<string, Epoch>();
    for (const raw of records) {
      let record: JournalRecord;
      try {
        record = validateRecord(raw);
      } catch (error) {
        if (error instanceof Invalid) throw new JournalError("invalid", `registro inválido: ${error.message}`);
        throw error;
      }
      const key = keyOf(record);
      const content = canonicalJson(record);
      const known = batchKeys.get(key) ?? this.canonical.get(key);
      if (known !== undefined) {
        if (known !== content) throw new JournalError("conflict", "registro com a mesma chave e conteúdo diferente do já gravado");
        continue;
      }
      this.checkReferences(record, (id) => batchEpochs.get(id) ?? this.epochById.get(id), (message) => {
        throw new JournalError("invalid", message);
      });
      batchKeys.set(key, content);
      if (record.type === "epoch") batchEpochs.set(record.epoch.id, record.epoch);
      fresh.push(record);
    }
    return fresh;
  }

  data(): JournalData {
    return { runId: this.runId, manifest: this.manifest, epochs: this.epochs, decisions: this.decisions, outcomes: this.outcomes };
  }
}

export class MemoryJournal implements JournalPort {
  private readonly state: JournalState;

  constructor(manifest: JsonObject) {
    this.state = new JournalState(runIdOf(manifest), sortValue(manifest) as JsonObject);
  }

  hasEpoch(epochId: string): boolean {
    return this.state.hasKey(`E|${epochId}`);
  }

  getEpoch(epochId: string): Epoch | undefined {
    return this.state.epoch(epochId);
  }

  hasDecision(epochId: string, policyId: string): boolean {
    return this.state.hasKey(`D|${epochId}|${policyId}`);
  }

  hasOutcome(epochId: string, candidateId: string): boolean {
    return this.state.hasKey(`O|${epochId}|${candidateId}`);
  }

  append(records: readonly JournalRecord[]): number {
    const fresh = this.state.plan(records);
    for (const record of fresh) this.state.commit(record);
    return fresh.length;
  }

  data(): JournalData {
    return this.state.data();
  }
}

// ---------------------------------------------------------------------------
// Strict parsing
// ---------------------------------------------------------------------------

/**
 * Parses the text of a journal. Every error names the line and never repeats its content. The text must end with a
 * newline: a last line without one is a write that was cut short.
 */
export function parseJournalText(content: string): JournalData {
  return parseJournalState(content).data();
}

function parseJournalState(content: string): JournalState {
  if (content.length === 0) throw new JournalError("corrupt", "diário vazio");
  const lines = content.split("\n");
  const last = lines[lines.length - 1];
  if (last !== "") throw new JournalError("corrupt", "última linha sem quebra de linha (escrita interrompida)", lines.length);
  lines.pop();
  let state: JournalState | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] as string;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new JournalError("corrupt", "JSON malformado", lineNumber);
    }
    try {
      if (index === 0) {
        const header = plain(value, "cabeçalho");
        exact(header, ["type", "schema", "runId", "manifest"], "cabeçalho");
        if (header.type !== "header" || header.schema !== JOURNAL_SCHEMA) bad("cabeçalho", "a primeira linha deve ser o cabeçalho do diário");
        const runId = text(header.runId, "cabeçalho.runId", /^[0-9a-f]{16}$/, 16);
        const manifest = plain(header.manifest, "cabeçalho.manifest");
        if (runIdOf(manifest) !== runId) bad("cabeçalho.runId", "não confere com o manifesto");
        state = new JournalState(runId, manifest);
        continue;
      }
      const record = validateRecord(value);
      const current = state as JournalState;
      if (current.hasKey(keyOf(record))) bad("registro", "registro duplicado");
      current.checkReferences(record, (id) => current.epoch(id), (message) => bad("registro", message));
      current.commit(record);
    } catch (error) {
      if (error instanceof Invalid) throw new JournalError("corrupt", error.message, lineNumber);
      throw error;
    }
  }
  return state as JournalState;
}

/** Every epoch has a decision of each policy and an outcome of each eligible candidate; otherwise it names the epoch. */
export function assertComplete(data: JournalData, policyIds: readonly string[]): void {
  const decisions = new Set(data.decisions.map((d) => `${d.epochId}|${d.policyId}`));
  const outcomes = new Set(data.outcomes.map((o) => `${o.epochId}|${o.candidateId}`));
  for (const epoch of data.epochs) {
    const missingDecision = policyIds.find((policyId) => !decisions.has(`${epoch.id}|${policyId}`));
    if (missingDecision !== undefined) throw new JournalError("incomplete", `época ${epoch.id} incompleta: falta a decisão de uma política; retome a execução na mesma pasta`);
    const missingOutcome = epoch.eligibleIds.find((candidateId) => !outcomes.has(`${epoch.id}|${candidateId}`));
    if (missingOutcome !== undefined) throw new JournalError("incomplete", `época ${epoch.id} incompleta: falta o resultado de um candidato; retome a execução na mesma pasta`);
  }
}

// ---------------------------------------------------------------------------
// File journal
// ---------------------------------------------------------------------------

function atomicWrite(path: string, content: string): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JournalError("corrupt", "o diário não é UTF-8 válido");
  }
}

interface SnapshotFile {
  schema: typeof SNAPSHOT_SCHEMA;
  runId: string;
  epochs: number;
  decisions: number;
  outcomes: number;
  journalBytes: number;
  lastEpochId: string | null;
}

function readSnapshot(path: string): SnapshotFile {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new JournalError("corrupt", "snapshot ilegível ou malformado");
  }
  try {
    const v = plain(value, "snapshot");
    exact(v, ["schema", "runId", "epochs", "decisions", "outcomes", "journalBytes", "lastEpochId"], "snapshot");
    if (v.schema !== SNAPSHOT_SCHEMA) bad("snapshot.schema", "esquema desconhecido");
    return {
      schema: SNAPSHOT_SCHEMA,
      runId: text(v.runId, "snapshot.runId", /^[0-9a-f]{16}$/, 16),
      epochs: integer(v.epochs, "snapshot.epochs", 0),
      decisions: integer(v.decisions, "snapshot.decisions", 0),
      outcomes: integer(v.outcomes, "snapshot.outcomes", 0),
      journalBytes: integer(v.journalBytes, "snapshot.journalBytes", 0),
      lastEpochId: nullable(v.lastEpochId, (x) => text(x, "snapshot.lastEpochId", EPOCH_ID, 20)),
    };
  } catch (error) {
    if (error instanceof Invalid) throw new JournalError("corrupt", `snapshot inválido (${error.message})`);
    throw error;
  }
}

export class FileJournal implements JournalPort {
  private constructor(
    private readonly directory: string,
    private readonly state: JournalState,
  ) {}

  private get journalPath(): string {
    return join(this.directory, "journal.jsonl");
  }

  /**
   * Opens the journal of a run directory, creating it only when NOTHING exists there. Raises JournalError (and leaves
   * every file as it was) when the journal is missing but a snapshot shows results existed, when it is empty,
   * truncated or malformed, when it is smaller than its snapshot, or when its header differs from `manifest`.
   */
  static open(directory: string, manifest: JsonObject): FileJournal {
    if (existsSync(directory) && !statSync(directory).isDirectory()) throw new JournalError("invalid", "o destino de --out existe e não é uma pasta");
    mkdirSync(directory, { recursive: true });
    const journalPath = join(directory, "journal.jsonl");
    const snapshotPath = join(directory, "snapshot.json");
    const runId = runIdOf(manifest);

    if (!existsSync(journalPath)) {
      if (existsSync(snapshotPath)) throw new JournalError("missing", "o diário não existe mas há um snapshot: os resultados anteriores se perderam; não recomeço vazio por cima, restaure o diário ou use outra pasta");
      try {
        writeFileSync(journalPath, headerLine(runId, manifest), { encoding: "utf8", flag: "wx" });
      } catch {
        throw new JournalError("invalid", "não foi possível criar o diário");
      }
      return new FileJournal(directory, new JournalState(runId, sortValue(manifest) as JsonObject));
    }

    const size = statSync(journalPath).size;
    if (size > MAX_JOURNAL_BYTES) throw new JournalError("invalid", "diário grande demais");
    const state = parseJournalState(decodeUtf8(readFileSync(journalPath)));
    if (state.runId !== runId || canonicalJson(state.manifest) !== canonicalJson(manifest)) throw new JournalError("mismatch", "o diário foi gravado para outra configuração: use outra pasta ou a mesma configuração");
    if (existsSync(snapshotPath)) {
      const snapshot = readSnapshot(snapshotPath);
      if (snapshot.runId !== runId) throw new JournalError("mismatch", "o snapshot é de outra execução");
      if (state.epochs.length < snapshot.epochs || state.decisions.length < snapshot.decisions || state.outcomes.length < snapshot.outcomes || size < snapshot.journalBytes) {
        throw new JournalError("corrupt", "o diário tem menos registros do que o snapshot: truncamento detectado; não continuo");
      }
    }
    return new FileJournal(directory, state);
  }

  /** Strict read of a journal file for reporting. */
  static read(path: string): JournalData {
    if (!existsSync(path)) throw new JournalError("missing", "o diário não existe");
    const stats = statSync(path);
    if (!stats.isFile()) throw new JournalError("invalid", "o caminho do diário não é um arquivo regular");
    if (stats.size > MAX_JOURNAL_BYTES) throw new JournalError("invalid", "diário grande demais");
    return parseJournalText(decodeUtf8(readFileSync(path)));
  }

  hasEpoch(epochId: string): boolean {
    return this.state.hasKey(`E|${epochId}`);
  }

  getEpoch(epochId: string): Epoch | undefined {
    return this.state.epoch(epochId);
  }

  hasDecision(epochId: string, policyId: string): boolean {
    return this.state.hasKey(`D|${epochId}|${policyId}`);
  }

  hasOutcome(epochId: string, candidateId: string): boolean {
    return this.state.hasKey(`O|${epochId}|${candidateId}`);
  }

  /** One append call for the whole batch; the file is only ever extended. */
  append(records: readonly JournalRecord[]): number {
    const fresh = this.state.plan(records);
    if (fresh.length === 0) return 0;
    appendFileSync(this.journalPath, fresh.map(serializeRecord).join(""), "utf8");
    for (const record of fresh) this.state.commit(record);
    return fresh.length;
  }

  data(): JournalData {
    return this.state.data();
  }

  /** Counts and size of the journal, replaced atomically (temporary file, then rename). */
  snapshot(): void {
    const epochs = this.state.epochs;
    const snapshot: SnapshotFile = {
      schema: SNAPSHOT_SCHEMA,
      runId: this.state.runId,
      epochs: epochs.length,
      decisions: this.state.decisions.length,
      outcomes: this.state.outcomes.length,
      journalBytes: statSync(this.journalPath).size,
      lastEpochId: epochs.length === 0 ? null : (epochs[epochs.length - 1] as Epoch).id,
    };
    atomicWrite(join(this.directory, "snapshot.json"), `${JSON.stringify(snapshot)}\n`);
  }
}
