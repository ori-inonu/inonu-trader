/**
 * Orchestrator and report builder of the Jev Decision Lab. Specification: docs/JEV-LABORATORIO-DE-DECISAO.md
 * sections 4, 7, 9 and 10.
 *
 * `runEpochs` is PURE with respect to the world: it does no I/O of its own. The journal is injected (memory or file),
 * the source is injected, the policies are injected. For each epoch of the grid it
 *   1. opens the decision window of the source (the future is now a trap),
 *   2. builds the candidates from `asOf(t)` and asks every policy that has not yet decided,
 *   3. closes the window and checks that nobody tried to read the future (a caught LeakError still fails the run),
 *   4. only then computes the outcomes, the one place that reads `future()`,
 *   5. appends the whole group in one call, so a failed epoch leaves no trace.
 * Rerunning is idempotent: whatever is already in the journal is neither recomputed nor rewritten.
 *
 * `buildReport` reads ONLY the journal: the report of a run is the report of its journal, byte for byte.
 */

import { CANDIDATE_DEFAULTS, buildEpoch, epochIdFor, type CandidateParams } from "./candidates.ts";
import { JournalError, assertComplete, canonicalJson, type JournalData, type JournalPort, type JournalRecord, type JsonObject } from "./journal.ts";
import { COST_TABLE, computeEpochOutcomes, exitFor, returnOnCapital, type CostTable, type OutcomeParams } from "./outcomes.ts";
import { describePolicy, type LabPolicy, type PolicyDescriptor, type PolicyInput } from "./policies.ts";
import { LeakError, type DataSource, type RecordStore, type SyntheticConfig } from "./source.ts";
import { STATS_DEFAULTS, assignHolm, buildPairedReport, buildPolicyReport, overlapOf, promotionGate, type PolicyInputs, type StatsContext } from "./stats.ts";
import {
  DAY_MS,
  DECISION_STATUSES,
  HOLD,
  HOUR_MS,
  LEVERAGES,
  deepFreeze,
  type DecisionStatus,
  type Epoch,
  type EpochResult,
  type LabCandidate,
  type LabReport,
  type Leverage,
  type Outcome,
  type PairedReport,
  type PolicyDecision,
  type PolicyReport,
} from "./types.ts";

export const MOCK_WARNING =
  "ATENÇÃO: o Jev desta execução é um SUBSTITUTO SIMULADO (MockJevChooser). Nenhuma chamada ao Jev real foi feita e nenhuma conclusão sobre o Jev pode sair deste relatório.";

export const STANDING_DISCLAIMER =
  "Nada neste relatório prova lucro. Este relatório não concede nenhuma permissão: o laboratório só registra decisões hipotéticas, não executa, não assina e não é recomendação de investimento. Dados sintéticos provam apenas aritmética e a máquina estatística. Quem decide é o dono, com o checklist de qualificação real (bun run qualify:live).";

// ---------------------------------------------------------------------------
// The manifest of a run
// ---------------------------------------------------------------------------

export interface RunSpec {
  schema: "jev-lab-manifest-v1";
  mode: "synthetic" | "replay";
  source: string;
  sourceDetail: JsonObject;
  stepMs: number;
  horizonMs: number;
  barMs: number;
  executionDelayMs: number;
  firstEpochMs: number;
  /** How many epochs the grid plans; some may still be pending when the data ends earlier. */
  epochs: number;
  seed: number | null;
  plantedEdgeBps: number | null;
  /** Declared by the operator when the configuration was frozen; the lab cannot verify it. */
  frozenAtMs: number | null;
  inferenceUsdPerMTok: number | null;
  jevTimeoutMs: number;
  costTable: CostTable;
  candidates: { venue: string; lookbackMs: number; minVolBars: number; fundingSettlements: number; maxQuoteAgeMs: number };
  policies: PolicyDescriptor[];
}

export function manifestOf(spec: RunSpec): JsonObject {
  return JSON.parse(JSON.stringify(spec)) as JsonObject;
}

function ceilTo(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

function floorTo(value: number, multiple: number): number {
  return Math.floor(value / multiple) * multiple;
}

export interface SpecOptions {
  frozenAtMs?: number | null;
  inferenceUsdPerMTok?: number | null;
  jevTimeoutMs?: number;
}

const DEFAULT_JEV_TIMEOUT_MS = 15_000;

export function buildSyntheticSpec(config: SyntheticConfig, policies: readonly PolicyDescriptor[], options: SpecOptions = {}): RunSpec {
  return {
    schema: "jev-lab-manifest-v1",
    mode: "synthetic",
    source: `synthetic:seed=${config.seed}`,
    sourceDetail: JSON.parse(JSON.stringify(config)) as JsonObject,
    stepMs: config.stepMs,
    horizonMs: config.horizonMs,
    barMs: config.barMs,
    executionDelayMs: config.executionDelayMs,
    firstEpochMs: config.startMs + config.warmupMs,
    epochs: config.epochs,
    seed: config.seed,
    plantedEdgeBps: config.plantedEdgeBps,
    frozenAtMs: options.frozenAtMs ?? null,
    inferenceUsdPerMTok: options.inferenceUsdPerMTok ?? null,
    jevTimeoutMs: options.jevTimeoutMs ?? DEFAULT_JEV_TIMEOUT_MS,
    costTable: COST_TABLE,
    candidates: { ...CANDIDATE_DEFAULTS },
    policies: policies.map((policy) => describePolicy(policy)),
  };
}

export interface ReplaySpecOptions extends SpecOptions {
  stepMs: number;
  horizonMs: number;
  barMs: number;
  executionDelayMs?: number;
  warmupMs?: number;
  firstEpochMs?: number;
  seed?: number;
}

/**
 * The grid of a replay: epochs on multiples of the step, starting after the warmup, as many as the data can finish
 * (entry, horizon and capture lag all inside the data).
 */
export function buildReplaySpec(source: RecordStore, digest: string, policies: readonly PolicyDescriptor[], options: ReplaySpecOptions): RunSpec {
  const executionDelayMs = options.executionDelayMs ?? options.barMs;
  const warmupMs = options.warmupMs ?? 3 * DAY_MS;
  const firstEpochMs = options.firstEpochMs ?? ceilTo(source.coverage.firstMs + warmupMs, options.stepMs);
  const maxEntryStart = floorTo(source.coverage.lastMs - options.horizonMs - COST_TABLE.captureLagMs, options.barMs);
  const lastEpochMs = maxEntryStart - executionDelayMs;
  if (!(lastEpochMs >= firstEpochMs)) throw new RangeError("captura curta demais para o horizonte, o atraso de execução e o aquecimento pedidos");
  const epochs = Math.floor((lastEpochMs - firstEpochMs) / options.stepMs) + 1;
  return {
    schema: "jev-lab-manifest-v1",
    mode: "replay",
    source: source.id,
    sourceDetail: { digest, firstMs: source.coverage.firstMs, lastMs: source.coverage.lastMs, records: source.records.length },
    stepMs: options.stepMs,
    horizonMs: options.horizonMs,
    barMs: options.barMs,
    executionDelayMs,
    firstEpochMs,
    epochs,
    seed: options.seed ?? 0,
    plantedEdgeBps: null,
    frozenAtMs: options.frozenAtMs ?? null,
    inferenceUsdPerMTok: options.inferenceUsdPerMTok ?? null,
    jevTimeoutMs: options.jevTimeoutMs ?? DEFAULT_JEV_TIMEOUT_MS,
    costTable: COST_TABLE,
    candidates: { ...CANDIDATE_DEFAULTS },
    policies: policies.map((policy) => describePolicy(policy)),
  };
}

function fail(field: string): never {
  throw new JournalError("corrupt", `manifesto inválido (${field})`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail(field);
  return value;
}

function nonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(field);
  return value;
}

function nullableNumber(value: unknown, field: string, integer: boolean): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) fail(field);
  return value;
}

/** Validates a manifest read from a journal. Anything unexpected is a corrupt journal, not a default. */
export function parseSpec(manifest: JsonObject): RunSpec {
  if (manifest.schema !== "jev-lab-manifest-v1") fail("schema");
  if (manifest.mode !== "synthetic" && manifest.mode !== "replay") fail("mode");
  if (typeof manifest.source !== "string") fail("source");
  if (!isObject(manifest.sourceDetail)) fail("sourceDetail");
  const stepMs = positiveInt(manifest.stepMs, "stepMs");
  const horizonMs = positiveInt(manifest.horizonMs, "horizonMs");
  const barMs = positiveInt(manifest.barMs, "barMs");
  if (stepMs % barMs !== 0 || horizonMs % barMs !== 0) fail("stepMs e horizonMs devem ser múltiplos de barMs");
  const table = manifest.costTable;
  if (!isObject(table) || table.schema !== "jev-lab-costs-v1" || !isObject(table.feeTakerBps) || !isObject(table.fixedUsdPerRoundTrip)) fail("costTable");
  for (const key of ["slippageBpsPerSide", "cashYieldAnnual", "maintenanceMarginRate", "captureLagMs", "notionalUsd", "fundingLookbackMs"]) {
    if (typeof (table as Record<string, unknown>)[key] !== "number") fail(`costTable.${key}`);
  }
  const candidates = manifest.candidates;
  if (!isObject(candidates)) fail("candidates");
  for (const key of ["lookbackMs", "minVolBars", "fundingSettlements", "maxQuoteAgeMs"]) positiveInt((candidates as Record<string, unknown>)[key], `candidates.${key}`);
  if (typeof (candidates as Record<string, unknown>).venue !== "string") fail("candidates.venue");
  const policies = manifest.policies;
  if (!Array.isArray(policies) || policies.length === 0) fail("policies");
  const descriptors: PolicyDescriptor[] = (policies as unknown[]).map((entry, index) => {
    if (!isObject(entry) || typeof entry.id !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(entry.id)) return fail(`policies[${index}]`);
    for (const flag of ["baseline", "tested", "passive"]) if (typeof entry[flag] !== "boolean") fail(`policies[${index}].${flag}`);
    const chooser = entry.chooser;
    if (chooser !== null && !(isObject(chooser) && typeof chooser.name === "string" && typeof chooser.isMock === "boolean")) fail(`policies[${index}].chooser`);
    return { id: entry.id, baseline: entry.baseline as boolean, tested: entry.tested as boolean, passive: entry.passive as boolean, chooser: chooser === null ? null : { name: (chooser as { name: string }).name, isMock: (chooser as { isMock: boolean }).isMock } };
  });
  return {
    schema: "jev-lab-manifest-v1",
    mode: manifest.mode,
    source: manifest.source,
    sourceDetail: manifest.sourceDetail as JsonObject,
    stepMs,
    horizonMs,
    barMs,
    executionDelayMs: nonNegativeInt(manifest.executionDelayMs, "executionDelayMs"),
    firstEpochMs: nonNegativeInt(manifest.firstEpochMs, "firstEpochMs"),
    epochs: nonNegativeInt(manifest.epochs, "epochs"),
    seed: nullableNumber(manifest.seed, "seed", true),
    plantedEdgeBps: nullableNumber(manifest.plantedEdgeBps, "plantedEdgeBps", false),
    frozenAtMs: nullableNumber(manifest.frozenAtMs, "frozenAtMs", true),
    inferenceUsdPerMTok: nullableNumber(manifest.inferenceUsdPerMTok, "inferenceUsdPerMTok", false),
    jevTimeoutMs: positiveInt(manifest.jevTimeoutMs, "jevTimeoutMs"),
    costTable: table as unknown as CostTable,
    candidates: candidates as RunSpec["candidates"],
    policies: descriptors,
  };
}

function candidateParamsOf(spec: RunSpec, provenanceSource: string): CandidateParams {
  return { stepMs: spec.stepMs, horizonMs: spec.horizonMs, barMs: spec.barMs, executionDelayMs: spec.executionDelayMs, provenanceSource, table: spec.costTable, ...spec.candidates };
}

function outcomeParamsOf(spec: RunSpec): OutcomeParams {
  return { barMs: spec.barMs, horizonMs: spec.horizonMs, executionDelayMs: spec.executionDelayMs, table: spec.costTable };
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export interface RunOptions {
  source: DataSource;
  policies: readonly LabPolicy[];
  spec: RunSpec;
  journal: JournalPort;
  /** Called every `snapshotEvery` processed epochs and once at the end. */
  snapshot?: () => void;
  snapshotEvery?: number;
}

export interface RunSummary {
  planned: number;
  /** Epochs where something was computed and stored. */
  processed: number;
  /** Epochs already complete in the journal. */
  skipped: number;
  /** Epochs whose horizon the data does not cover yet. */
  pending: number;
  /** Records stored in this call. */
  appended: number;
}

function sortedById(candidates: readonly LabCandidate[]): LabCandidate[] {
  return [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function failureDecision(policyId: string, input: PolicyInput, status: DecisionStatus, note: string): PolicyDecision {
  const probabilities: Record<string, number> = { [HOLD]: 1 };
  for (const candidate of sortedById(input.eligible)) probabilities[candidate.id] = 0;
  return { policyId, epochId: input.epochId, choice: HOLD, probabilities, latencyMs: 0, inputTokens: null, costUsd: null, status, note };
}

/** A policy answer is trusted for nothing: wrong ids, wrong numbers and unknown choices all become a hold with a status. */
function checkedDecision(policy: LabPolicy, input: PolicyInput, raw: unknown): PolicyDecision {
  const malformed = (note: string): PolicyDecision => failureDecision(policy.id, input, "malformed", note);
  if (typeof raw !== "object" || raw === null) return malformed("a política devolveu algo que não é uma decisão");
  const d = raw as Record<string, unknown>;
  if (d.policyId !== policy.id || d.epochId !== input.epochId) return malformed("decisão com identificadores trocados");
  const known = new Set<string>([HOLD, ...input.eligible.map((candidate) => candidate.id)]);
  if (typeof d.choice !== "string" || !known.has(d.choice)) return failureDecision(policy.id, input, "invalid-choice", "a política escolheu um id que não é hold nem elegível");
  if (typeof d.probabilities !== "object" || d.probabilities === null) return malformed("probabilidades ausentes");
  const probabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(d.probabilities as Record<string, unknown>)) {
    if (!known.has(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return malformed("probabilidades inválidas");
    probabilities[key] = value;
  }
  if (typeof d.latencyMs !== "number" || !Number.isFinite(d.latencyMs) || d.latencyMs < 0) return malformed("latência inválida");
  if (d.inputTokens !== null && (typeof d.inputTokens !== "number" || !Number.isSafeInteger(d.inputTokens) || d.inputTokens < 0)) return malformed("uso de tokens inválido");
  if (d.costUsd !== null && (typeof d.costUsd !== "number" || !Number.isFinite(d.costUsd) || d.costUsd < 0)) return malformed("custo inválido");
  if (typeof d.status !== "string" || !(DECISION_STATUSES as readonly string[]).includes(d.status)) return malformed("status inválido");
  if (d.note !== null && typeof d.note !== "string") return malformed("nota inválida");
  return {
    policyId: policy.id,
    epochId: input.epochId,
    choice: d.choice,
    probabilities,
    latencyMs: d.latencyMs,
    inputTokens: d.inputTokens as number | null,
    costUsd: d.costUsd as number | null,
    status: d.status as DecisionStatus,
    note: d.note as string | null,
  };
}

async function runPolicy(policy: LabPolicy, input: PolicyInput): Promise<PolicyDecision> {
  let raw: unknown;
  try {
    raw = await policy.decide(input);
  } catch (error) {
    if (error instanceof LeakError) throw error;
    return failureDecision(policy.id, input, "error", "a política lançou erro");
  }
  return checkedDecision(policy, input, raw);
}

export async function runEpochs(options: RunOptions): Promise<RunSummary> {
  const { source, policies, spec, journal } = options;
  if (canonicalJson(policies.map((policy) => describePolicy(policy))) !== canonicalJson(spec.policies)) throw new RangeError("o elenco de políticas difere do manifesto da execução");
  const candidateParams = candidateParamsOf(spec, source.id);
  const outcomeParams = outcomeParamsOf(spec);
  const summary: RunSummary = { planned: spec.epochs, processed: 0, skipped: 0, pending: 0, appended: 0 };
  const every = options.snapshotEvery ?? 50;
  let sinceSnapshot = 0;

  for (let index = 0; index < spec.epochs; index += 1) {
    const t = spec.firstEpochMs + index * spec.stepMs;
    if (exitFor(t, outcomeParams) + spec.costTable.captureLagMs > source.coverage.lastMs) {
      summary.pending += 1;
      continue;
    }
    const epochId = epochIdFor(t);
    let epoch: Epoch | undefined = journal.getEpoch(epochId);
    const isNew = epoch === undefined;
    const waiting = policies.filter((policy) => !journal.hasDecision(epochId, policy.id));
    const decisions: PolicyDecision[] = [];

    if (isNew || waiting.length > 0) {
      const leaksBefore = source.leakAttempts();
      source.openDecision(t);
      try {
        if (epoch === undefined) epoch = buildEpoch(source.asOf(t), index, candidateParams);
        const eligible = sortedById(epoch.candidates.filter((candidate) => (epoch as Epoch).eligibleIds.includes(candidate.id)));
        const input: PolicyInput = deepFreeze({ epochId, t, eligible: eligible.map((candidate) => structuredClone(candidate)) });
        for (const policy of waiting) decisions.push(await runPolicy(policy, input));
      } finally {
        source.closeDecision();
      }
      if (source.leakAttempts() !== leaksBefore) throw new LeakError("uma política tentou ler o futuro durante a decisão");
    }

    const missing = (epoch as Epoch).eligibleIds.filter((candidateId) => !journal.hasOutcome(epochId, candidateId));
    const outcomes: Outcome[] = missing.length === 0 ? [] : computeEpochOutcomes({ ...(epoch as Epoch), eligibleIds: missing }, source, outcomeParams);

    const records: JournalRecord[] = [];
    if (isNew) records.push({ type: "epoch", epoch: epoch as Epoch });
    for (const decision of decisions) records.push({ type: "decision", decision });
    for (const outcome of outcomes) records.push({ type: "outcome", outcome });
    if (records.length === 0) {
      summary.skipped += 1;
      continue;
    }
    summary.appended += journal.append(records);
    summary.processed += 1;
    sinceSnapshot += 1;
    if (options.snapshot !== undefined && sinceSnapshot >= every) {
      options.snapshot();
      sinceSnapshot = 0;
    }
  }
  if (options.snapshot !== undefined && sinceSnapshot > 0) options.snapshot();
  return summary;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function statusCounts(): Record<DecisionStatus, number> {
  return { ok: 0, "invalid-choice": 0, malformed: 0, timeout: 0, error: 0 };
}

function inputsFor(descriptor: PolicyDescriptor, data: JournalData, spec: RunSpec): PolicyInputs {
  const decisions = new Map<string, PolicyDecision>();
  for (const decision of data.decisions) if (decision.policyId === descriptor.id) decisions.set(decision.epochId, decision);
  const outcomes = new Map<string, Outcome>();
  for (const outcome of data.outcomes) outcomes.set(`${outcome.epochId}|${outcome.candidateId}`, outcome);

  const statuses = statusCounts();
  const costUsd: Array<number | null> = [];
  const inputTokens: Array<number | null> = [];
  const latencyMs: number[] = [];
  const consultedEpoch: boolean[] = [];
  for (const epoch of data.epochs) {
    const decision = decisions.get(epoch.id) as PolicyDecision;
    statuses[decision.status] += 1;
    const consulted = descriptor.chooser !== null && epoch.eligibleIds.length > 0;
    consultedEpoch.push(consulted);
    if (consulted) {
      costUsd.push(decision.costUsd);
      inputTokens.push(decision.inputTokens);
      latencyMs.push(decision.latencyMs);
    }
  }
  const costKnown = costUsd.every((cost) => cost !== null);
  const notional = spec.costTable.notionalUsd;

  const results: Array<EpochResult | null> = [];
  const calibrationPairs: Array<{ p: number; hit: boolean }> = [];
  const sigmas: number[] = [];
  data.epochs.forEach((epoch, position) => {
    const decision = decisions.get(epoch.id) as PolicyDecision;
    const infer = consultedEpoch[position] && costKnown ? (decision.costUsd as number) / notional : 0;
    const flat = (x: number): Record<Leverage, number> => ({ 1: x, 2: x, 3: x, 5: x, 10: x });
    const noLiquidation: Record<Leverage, boolean> = { 1: false, 2: false, 3: false, 5: false, 10: false };
    if (decision.choice === HOLD) {
      results.push({ trade: false, modality: null, returnOnCapital: -infer, equityMultiple: flat(1 - infer), liquidated: noLiquidation, levered: false });
      return;
    }
    const outcome = outcomes.get(`${epoch.id}|${decision.choice}`);
    if (outcome === undefined || !outcome.complete) {
      results.push(null);
      return;
    }
    const candidate = epoch.candidates.find((c) => c.id === decision.choice) as LabCandidate;
    const x1 = returnOnCapital(outcome, descriptor.passive) as number;
    const x = x1 - infer;
    const levered = !descriptor.passive && outcome.leverage[0]?.applicable === true;
    const multiples = flat(1 + x);
    const liquidated = { ...noLiquidation };
    if (levered) {
      LEVERAGES.forEach((leverage, i) => {
        const row = outcome.leverage[i];
        multiples[leverage] = Math.max(0, (row?.equityMultiple as number) - infer);
        liquidated[leverage] = row?.liquidated === true;
      });
    }
    results.push({ trade: true, modality: candidate.modality, returnOnCapital: x, equityMultiple: multiples, liquidated, levered });
    if (descriptor.chooser !== null && decision.status === "ok") {
      const p = decision.probabilities[decision.choice];
      if (typeof p === "number") calibrationPairs.push({ p, hit: (outcome.netReturn as number) > 0 });
    }
    const vol = candidate.features.volHorizonBps;
    if (typeof vol === "number" && vol > 0) sigmas.push(vol / 1e4 / Math.sqrt(spec.horizonMs / DAY_MS));
  });
  return {
    descriptor,
    results,
    statuses,
    consulted: costUsd.length,
    costUsd,
    inputTokens,
    latencyMs,
    calibrationPairs,
    sigmaDailyReference: sigmas.length === 0 ? null : sigmas.reduce((a, b) => a + b, 0) / sigmas.length,
  };
}

function comma(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

export function buildReport(data: JournalData): LabReport {
  const spec = parseSpec(data.manifest);
  assertComplete(data, spec.policies.map((policy) => policy.id));
  const ctx: StatsContext = {
    stepMs: spec.stepMs,
    horizonMs: spec.horizonMs,
    maxDecisionMs: STATS_DEFAULTS.maxDecisionMs,
    bootstrap: { resamples: STATS_DEFAULTS.bootstrapResamples, seed: STATS_DEFAULTS.bootstrapSeed, ruinFraction: STATS_DEFAULTS.ruinFraction },
    maintenanceMarginRate: spec.costTable.maintenanceMarginRate,
    alpha: STATS_DEFAULTS.alpha,
  };
  const inputs = spec.policies.map((descriptor) => inputsFor(descriptor, data, spec));
  const policies: PolicyReport[] = inputs.map((entry) => buildPolicyReport(entry, ctx));
  const multipleTesting = assignHolm(policies, STATS_DEFAULTS.alpha, STATS_DEFAULTS.minTradesForModality);

  const paired: PairedReport[] = [];
  for (const tested of inputs.filter((entry) => entry.descriptor.tested)) {
    for (const baseline of inputs.filter((entry) => entry.descriptor.baseline && entry.descriptor.id !== tested.descriptor.id)) paired.push(buildPairedReport(tested, baseline, ctx));
  }
  const flagged = policies
    .filter((policy) => policy.tested && policy.adjustedP !== null && policy.adjustedP < STATS_DEFAULTS.alpha)
    .filter((policy) => {
      const rows = paired.filter((row) => row.policy === policy.id);
      return rows.length > 0 && rows.every((row) => row.significantlyBetter === true);
    })
    .map((policy) => policy.id);

  const epochs = data.epochs.length;
  const first = data.epochs[0];
  const last = data.epochs[epochs - 1];
  const subject = policies.find((policy) => policy.tested && !policy.baseline) ?? null;
  const run: LabReport["run"] = {
    epochs,
    pendingEpochs: Math.max(0, spec.epochs - epochs),
    firstEpochMs: first === undefined ? spec.firstEpochMs : first.t,
    lastEpochMs: last === undefined ? spec.firstEpochMs : last.t,
    spanDays: (epochs * spec.stepMs) / DAY_MS,
    stepMs: spec.stepMs,
    horizonMs: spec.horizonMs,
    overlap: overlapOf(ctx),
    seed: spec.seed,
    plantedEdgeBps: spec.plantedEdgeBps,
    frozenAtMs: spec.frozenAtMs,
    completeness: subject === null || epochs === 0 ? null : subject.usableEpochs / epochs,
  };
  const jevDescriptor = spec.policies.find((policy) => policy.tested && !policy.baseline) ?? null;
  const isMock = jevDescriptor?.chooser?.isMock ?? true;
  const gate = promotionGate({ mode: spec.mode, run, policies, paired, multipleTesting });

  const notes: string[] = [];
  if (spec.mode === "synthetic") notes.push("Dados sintéticos provam apenas aritmética e a máquina estatística; nenhum número descreve um mercado.");
  else notes.push("Captura reproduzida: o laboratório não verifica a origem nem o instante de gravação dos dados (limite 9 da especificação).");
  if (isMock) notes.push("O Jev desta execução é o MockJevChooser: uma regra determinística e transparente, não o Jev real.");
  notes.push("Custos: tabela única de padrões conservadores (taxas taker, spread cotado, slippage de 1 bp por lado, custo de oportunidade do caixa e funding pelo calendário).");
  notes.push("Inferência: Newey-West com lag max(3K, plug-in), variância inflada por n/(n - lag) e t de Student; correção de Holm; comparação com as linhas de base por união-interseção.");
  notes.push("Alavancagem aparece só como contrafactual de risco: sem vantagem validada ela apenas reduz a mediana.");
  if (run.pendingEpochs > 0) notes.push(`Épocas pendentes: ${run.pendingEpochs} (o horizonte ainda não é coberto pelos dados).`);

  return {
    schema: "jev-lab-report-v1",
    mode: spec.mode,
    source: spec.source,
    jev: { chooser: jevDescriptor?.chooser?.name ?? "desconhecido", isMock, realJevCalled: !isMock, warning: isMock ? MOCK_WARNING : null },
    run,
    costTable: JSON.parse(JSON.stringify(spec.costTable)) as Record<string, unknown>,
    policies,
    paired,
    multipleTesting,
    flagged,
    gate,
    notes,
    disclaimer: STANDING_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Short summary in Portuguese (stderr of the CLI)
// ---------------------------------------------------------------------------

function cell(value: number | null, digits: number): string {
  return value === null ? "n/d" : comma(value, digits);
}

export function renderSummaryPt(report: LabReport): string[] {
  const lines: string[] = ["JEV LAB: laboratório de decisão (somente sombra: nada é executado, assinado ou enviado)."];
  if (report.jev.isMock) lines.push(MOCK_WARNING);
  const run = report.run;
  if (report.mode === "synthetic") {
    lines.push(`Fonte: sintética (semente ${run.seed ?? "n/d"}, vantagem plantada ${cell(run.plantedEdgeBps, 0)} bps). Dados sintéticos provam apenas aritmética e a máquina estatística.`);
  } else {
    lines.push(`Fonte: captura reproduzida (${report.source}). A origem dos dados não é verificada pelo laboratório.`);
  }
  lines.push(
    `Janela: ${run.epochs} épocas, ${comma(run.spanDays, 1)} dias, passo ${comma(run.stepMs / HOUR_MS, 1)} h, horizonte ${comma(run.horizonMs / HOUR_MS, 1)} h (sobreposição ${run.overlap}), completude ${run.completeness === null ? "n/d" : `${comma(run.completeness * 100, 0)}%`}.`,
  );
  lines.push("Política            n    média (bps)   t       p ajustado   Sharpe anual");
  for (const policy of report.policies) {
    const mean = policy.mean;
    lines.push(
      `${policy.id.padEnd(18)}  ${String(policy.usableEpochs).padEnd(4)} ${cell(mean === null ? null : mean.meanBps, 2).padEnd(13)} ${cell(mean === null ? null : mean.t, 2).padEnd(7)} ${cell(policy.adjustedP, 3).padEnd(12)} ${cell(policy.sharpe.annualized, 2)}`,
    );
  }
  let leverageLines = 0;
  for (const policy of report.policies) {
    const row = policy.leverage.find((entry) => entry.leverage === 10);
    if (!policy.tested || row?.bootstrap === null || row === undefined) continue;
    leverageLines += 1;
    lines.push(`Contrafactual de alavancagem de ${policy.id} a 10x (caminhos reamostrados): patrimônio final mediano ${comma(row.bootstrap.medianFinalEquity, 2)}, liquidação em ${comma(row.bootstrap.probLiquidation * 100, 0)}% dos caminhos.`);
  }
  if (leverageLines > 0) lines.push("Sem vantagem validada, alavancar só reduz a mediana; o contrafactual mostra risco, não ganho.");
  lines.push(`Sinalizadas (Holm e acima de todas as linhas de base): ${report.flagged.length === 0 ? "nenhuma" : report.flagged.join(", ")}.`);
  const gate = report.gate;
  lines.push(`Portão de promoção: permanecer na fase-0. Critérios aprovados ${gate.passed.length}, reprovados ${gate.failed.length}, desconhecidos ${gate.unknown.length}. O portão só recomenda; quem decide é o dono.`);
  lines.push(STANDING_DISCLAIMER);
  return lines;
}

