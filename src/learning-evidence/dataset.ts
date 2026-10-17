import { FEATURE_NAMES, FEATURE_VERSION } from "../intel/features/types";
import { parseLabel, parseSnapshot } from "../outcomes/store";
import { HORIZONS, HORIZON_MS, type Horizon, type Label, type Snapshot } from "../outcomes/types";

export const MAX_RECORDS = 100_000;
const safeTime = (value: number) => Number.isSafeInteger(value) && value >= 0;
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

export interface DatasetOptions {
  readonly horizon: Horizon;
  readonly asOfMs: number;
  readonly minTrainGroups?: number;
  readonly testGroups?: number;
  readonly embargoMs?: number;
}
export interface LearningRow {
  readonly snapshotId: string;
  readonly instId: string;
  readonly asOfMs: number;
  readonly labelEndMs: number;
  readonly costRoundTripBps: number;
  readonly features: { readonly v: 1; readonly asOfMs: number; readonly values: Readonly<Record<string, number | null>> };
  readonly target: { readonly hypotheticalNetLongBps: number; readonly positiveNetLong: boolean };
}
export interface LearningFold {
  readonly train: readonly number[];
  readonly test: readonly number[];
  readonly testStartMs: number;
  readonly testEndMs: number;
  readonly trainLabelCutoffMs: number;
  readonly purgedRows: number;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
}

function documentedLabel(item: Label): Label {
  const reaction = (value: Label["zonaDemanda"]) => value === null ? null : { tocou: value.tocou, reagiu: value.reagiu };
  return { snapshotId: item.snapshotId, horizonte: item.horizonte, completo: item.completo,
    motivoIncompleto: item.motivoIncompleto, brutoLongBps: item.brutoLongBps,
    liquidoLongBps: item.liquidoLongBps, liquidoShortBps: item.liquidoShortBps,
    maxAltaBps: item.maxAltaBps, maxQuedaBps: item.maxQuedaBps,
    barreiraLong: item.barreiraLong, barreiraShort: item.barreiraShort,
    zonaDemanda: reaction(item.zonaDemanda), zonaOferta: reaction(item.zonaOferta) };
}

function uniqueRecords<T>(raw: readonly unknown[], parse: (value: unknown) => T | null,
  key: (item: T) => string, kind: string) {
  const records = new Map<string, T>();
  const signatures = new Map<string, string>();
  let duplicates = 0;
  for (const value of raw) {
    const item = parse(value);
    if (!item) throw new Error("invalid_" + kind);
    const id = key(item), signature = canonical(item);
    if (signatures.has(id)) {
      if (signatures.get(id) !== signature) throw new Error("conflicting_" + kind);
      duplicates++;
    } else { records.set(id, item); signatures.set(id, signature); }
  }
  return { records, duplicates };
}

function chronologicalFolds(rows: readonly LearningRow[], options: DatasetOptions) {
  const minTrain = options.minTrainGroups ?? 30;
  const testSize = options.testGroups ?? 12;
  const embargo = options.embargoMs ?? 0;
  const groups: number[] = [], groupStarts: number[] = [];
  for (let index = 0; index < rows.length; index++) {
    const timestamp = rows[index]!.asOfMs;
    if (groups.at(-1) !== timestamp) { groups.push(timestamp); groupStarts.push(index); }
  }
  const folds: LearningFold[] = [];
  let skippedBlocks = 0;
  let indexCount = 0;
  let trainEnd = 0, trainGroupCount = 0;
  for (let start = minTrain; start + testSize <= groups.length; start += testSize) {
    const testStartMs = groups[start]!;
    const testEndMs = groups[start + testSize - 1]!;
    const cutoff = testStartMs - embargo;
    // All rows use one horizon: sorted timestamps imply sorted label ends.
    // Advance once even when many test blocks have insufficient training.
    while (trainEnd < rows.length && rows[trainEnd]!.labelEndMs < cutoff) {
      if (trainEnd === 0 || rows[trainEnd]!.asOfMs !== rows[trainEnd - 1]!.asOfMs) trainGroupCount++;
      trainEnd++;
    }
    if (trainGroupCount < minTrain) { skippedBlocks++; continue; }
    const testBegin = groupStarts[start]!, testEnd = groupStarts[start + testSize] ?? rows.length;
    indexCount += trainEnd + testEnd - testBegin;
    if (indexCount > 2_000_000) throw new Error("fold_index_limit");
    const train = Array.from({ length: trainEnd }, (_, index) => index);
    const test = Array.from({ length: testEnd - testBegin }, (_, index) => testBegin + index);
    const purgedRows = testBegin - trainEnd;
    folds.push({ train, test, testStartMs, testEndMs, trainLabelCutoffMs: cutoff, purgedRows });
  }
  return { folds, skippedBlocks, timestampGroups: groups.length,
    tailGroups: groups.length <= minTrain ? 0 : (groups.length - minTrain) % testSize };
}
export function buildLearningDataset(snapshots: readonly unknown[], labels: readonly unknown[], options: DatasetOptions) {
  if (!(HORIZONS as readonly string[]).includes(options.horizon) || !safeTime(options.asOfMs) ||
    (options.minTrainGroups !== undefined && !positiveInteger(options.minTrainGroups)) ||
    (options.testGroups !== undefined && !positiveInteger(options.testGroups)) ||
    (options.embargoMs !== undefined && !safeTime(options.embargoMs))) throw new Error("invalid_options");
  if (snapshots.length + labels.length > MAX_RECORDS) throw new Error("record_limit");
  const snapshotSet = uniqueRecords<Snapshot>(snapshots, parseSnapshot, (s) => s.id, "snapshot");
  const labelSet = uniqueRecords<Label>(labels, (raw) => {
    const parsed = parseLabel(raw);
    return parsed ? documentedLabel(parsed) : null;
  }, (item) => JSON.stringify([item.snapshotId, item.horizonte]), "label");
  const observations = new Set<string>();
  for (const s of snapshotSet.records.values()) {
    const key = JSON.stringify([s.instId, s.asOfMs]);
    if (observations.has(key)) throw new Error("duplicate_observation");
    observations.add(key);
  }
  const rows: LearningRow[] = [];
  const excluded = { sampling: 0, cost: 0, features: 0, timestamp: 0, missingLabel: 0,
    incompleteLabel: 0, immatureLabel: 0, inconsistentReturn: 0 };
  for (const snap of snapshotSet.records.values()) {
    if (snap.market !== "spot" || snap.origem !== "relogio") { excluded.sampling++; continue; }
    if (snap.costRoundTripBps === null || snap.costRoundTripBps < 0) { excluded.cost++; continue; }
    const labelEndMs = snap.asOfMs + HORIZON_MS[options.horizon];
    if (!safeTime(snap.asOfMs) || !safeTime(snap.features.asOfMs) || !safeTime(labelEndMs)) {
      excluded.timestamp++; continue;
    }
    if (!snap.id || !snap.instId || snap.features.instId !== snap.instId ||
      snap.features.asOfMs > snap.asOfMs ||
      Object.values(snap.features.idades).some((age) => age < 0) ||
      FEATURE_NAMES.some((name) => !Object.hasOwn(snap.features.values, name))) {
      excluded.features++; continue;
    }
    const outcome = labelSet.records.get(JSON.stringify([snap.id, options.horizon]));
    if (!outcome) { excluded.missingLabel++; continue; }
    if (!outcome.completo || outcome.motivoIncompleto !== null ||
      outcome.brutoLongBps === null || outcome.liquidoLongBps === null) { excluded.incompleteLabel++; continue; }
    if (labelEndMs > options.asOfMs) { excluded.immatureLabel++; continue; }
    if (Math.abs(outcome.liquidoLongBps - (outcome.brutoLongBps - snap.costRoundTripBps)) > 0.000001) {
      excluded.inconsistentReturn++; continue;
    }
    rows.push({
      snapshotId: snap.id, instId: snap.instId, asOfMs: snap.asOfMs,
      labelEndMs, costRoundTripBps: snap.costRoundTripBps,
      features: { v: FEATURE_VERSION, asOfMs: snap.features.asOfMs,
        values: Object.fromEntries(FEATURE_NAMES.map((name) => [name, snap.features.values[name] ?? null])) },
      target: { hypotheticalNetLongBps: outcome.liquidoLongBps, positiveNetLong: outcome.liquidoLongBps > 0 },
    });
  }
  rows.sort((a, b) => a.asOfMs - b.asOfMs || (a.instId < b.instId ? -1 : a.instId > b.instId ? 1 : 0));
  const partition = chronologicalFolds(rows, options);
  return { version: 1 as const, targetKind: "hypothetical_spot_long_after_recorded_cost" as const,
    horizon: options.horizon, asOfMs: options.asOfMs,
    settings: { minTrainGroups: options.minTrainGroups ?? 30, testGroups: options.testGroups ?? 12, embargoMs: options.embargoMs ?? 0 },
    rows, folds: partition.folds, status: partition.folds.length ? "ready_for_evaluation" : "insufficient_data",
    diagnostics: { inputSnapshots: snapshots.length, inputLabels: labels.length, excluded,
      duplicateSnapshots: snapshotSet.duplicates, duplicateLabels: labelSet.duplicates,
      rows: rows.length, timestampGroups: partition.timestampGroups, folds: partition.folds.length,
      skippedBlocks: partition.skippedBlocks, tailGroups: partition.tailGroups } };
}
