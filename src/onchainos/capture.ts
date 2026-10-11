/**
 * The capture recorder: it runs a source epoch after epoch and writes what it read in the capture format of the Jev
 * Decision Lab. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 10 (criteria D20, D21).
 *
 * THE ONLY LIBRARY FILE THAT WRITES TO DISK. It does read nothing from the environment, uses no network and holds no
 * credential: the source reads through its own injected clients and hands back records.
 *
 * Folder layout (all three created by this recorder and nothing else):
 *   capture.jsonl         the records, canonical lines of the lab format, one block per epoch
 *   capture-ledger.jsonl  one line per COMMITTED epoch: id, grid instant, counts, t range and the byte offset of the data
 *   capture-manifest.json public configuration and provenance, written atomically (temporary file, then rename)
 *
 * Guarantees:
 *  - BOUNDED: `maxEpochs` is the total target in the folder, `maxDurationMs` the limit of this invocation. The deadline is
 *    passed to the source, which checks it before every read; an epoch interrupted by it writes nothing.
 *  - IDEMPOTENT: an epoch is a cell of the grid `floor(now / epochMs) * epochMs` with id `e<instant>`. A cell that is
 *    already in the ledger is never written again; cells lost because an epoch overran are not backfilled.
 *  - ATOMIC APPENDS: the block of an epoch is built and validated whole in memory, appended in ONE call, and only then is
 *    the ledger line appended. An epoch counts when the ledger says so. Bytes after the last committed offset (a crash
 *    between the two appends, a torn line) are cut off on resume and the epoch is redone.
 *  - STRICT: every record is serialized and parsed back by the lab parser before anything is written. A malformed record,
 *    a candle already recorded, a `t` that goes backwards, a folder made with another configuration or damaged on disk
 *    STOPS the run with a clear error that names the epoch, the record and the field and never echoes values. The report
 *    of a stopped run is still returned, with what was done up to there.
 *  - NEVER OVERWRITES: a damaged or foreign folder is left exactly as it was.
 *  - NEVER WRITES A SECRET: the manifest holds the public configuration given by `source.describe()` and nothing else.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPTURE_KINDS, CaptureFormatError, parseCaptureLine, parseCaptureText, serializeCaptureRecord, type CaptureKind, type CaptureRecord } from "../lab/capture-format.ts";
import { OnchainosError } from "./errors.ts";
import {
  CaptureError,
  type CaptureCursors,
  type CaptureErrorKind,
  type CaptureFs,
  type CaptureSource,
  type CaptureSourceId,
  type EpochContext,
} from "./capture-types.ts";

export const CAPTURE_FILES = Object.freeze({ data: "capture.jsonl", ledger: "capture-ledger.jsonl", manifest: "capture-manifest.json" });
export const CAPTURE_NOTICE = "Captura somente leitura de dados de mercado. Nada aqui prova lucro e nada aqui concede permissão.";
const MANIFEST_NOTICE = "Captura somente leitura de dados de mercado; os valores são do instante em que foram lidos.";
const DEFAULT_MAX_RESUME_BYTES = 67_108_864;
const MAX_EPOCHS_CEILING = 100_000;
const MIN_EPOCH_MS = 1_000;
const MAX_MS = 86_400_000;

// ---------------------------------------------------------------------------
// The real file port
// ---------------------------------------------------------------------------

export const nodeCaptureFs: CaptureFs = {
  exists: (path) => existsSync(path),
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  mkdirp: (path) => {
    mkdirSync(path, { recursive: true });
  },
  readBytes: (path) => new Uint8Array(readFileSync(path)),
  size: (path) => statSync(path).size,
  append: (path, text) => {
    appendFileSync(path, text, "utf8");
  },
  writeAtomic: (path, text) => {
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  },
  createExclusive: (path, text) => {
    writeFileSync(path, text, { encoding: "utf8", flag: "wx" });
  },
  truncate: (path, size) => {
    truncateSync(path, size);
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunCaptureOptions {
  outDir: string;
  source: CaptureSource;
  /** Total number of committed epochs wanted in the folder, 1 to 100000. */
  maxEpochs: number;
  /** Limit of THIS invocation, 1000 ms to one day. */
  maxDurationMs: number;
  /** Grid step, 1000 ms to one day. */
  epochMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  fs?: CaptureFs;
  /** Largest data file a resume accepts to read back. Default 64 MiB. */
  maxResumeBytes?: number;
}

export interface CaptureReport {
  schema: "onchainos-capture-report-v1";
  status: "completed" | "duration_limit" | "stopped";
  source: CaptureSourceId;
  epochMs: number;
  epochsTarget: number;
  epochsCommitted: number;
  epochsWrittenThisRun: number;
  records: { total: number; byKind: Record<string, number> };
  writtenThisRun: { records: number; byKind: Record<string, number> };
  firstT: number | null;
  lastT: number | null;
  skipped: Array<{ epochId: string; kind: string; inst: string; reason: string }>;
  notes: Array<{ epochId: string; note: string }>;
  stop: { kind: CaptureErrorKind; message: string; epochId: string | null } | null;
  files: { data: string; ledger: string; manifest: string };
  notice: string;
}

interface LedgerEntry {
  epochId: string;
  gridMs: number;
  records: number;
  firstT: number | null;
  lastT: number | null;
  bytesEnd: number;
  byKind: Record<string, number>;
  skipped: number;
}

interface Accumulator {
  total: number;
  byKind: Record<string, number>;
  firstT: number | null;
  lastT: number | null;
  candleMax: Map<string, number>;
  candleKeys: Set<string>;
  settledMax: Map<string, number>;
}

interface FolderState {
  entries: LedgerEntry[];
  committedIds: Set<string>;
  lastGridMs: number | null;
  dataBytes: number;
  acc: Accumulator;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function newAccumulator(): Accumulator {
  return { total: 0, byKind: {}, firstT: null, lastT: null, candleMax: new Map(), candleKeys: new Set(), settledMax: new Map() };
}

function absorb(acc: Accumulator, record: CaptureRecord): void {
  acc.total += 1;
  acc.byKind[record.kind] = (acc.byKind[record.kind] ?? 0) + 1;
  acc.firstT = acc.firstT === null ? record.t : Math.min(acc.firstT, record.t);
  acc.lastT = acc.lastT === null ? record.t : Math.max(acc.lastT, record.t);
  if (record.kind === "candle") {
    const stream = `${record.inst}|${record.data.barMs}`;
    acc.candleKeys.add(`${stream}|${record.data.startMs}`);
    acc.candleMax.set(stream, Math.max(acc.candleMax.get(stream) ?? 0, record.data.startMs));
  } else if (record.kind === "funding" && record.t >= record.data.settleMs) {
    acc.settledMax.set(record.inst, Math.max(acc.settledMax.get(record.inst) ?? 0, record.data.settleMs));
  }
}

/** A snapshot of the cursors at the start of an epoch: what the source sees cannot change while it reads. */
function cursorsOf(acc: Accumulator): CaptureCursors {
  const candles = new Map(acc.candleMax);
  const settled = new Map(acc.settledMax);
  return {
    lastCandleStartMs: (inst, barMs) => candles.get(`${inst}|${barMs}`) ?? null,
    lastSettledFundingMs: (inst) => settled.get(inst) ?? null,
  };
}

/** Runs a file operation; any failure becomes an io error that names the action, never the system message. */
function io<T>(action: string, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    const code = typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? ` (${(error as { code: string }).code})` : "";
    throw new CaptureError("io", `falha de arquivo ao ${action}${code}`);
  }
}

function strictUtf8(bytes: Uint8Array, what: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CaptureError("corrupt", `${what} não é UTF-8 válido`);
  }
}

function safeKind(record: CaptureRecord): string {
  return (CAPTURE_KINDS as readonly string[]).includes(record.kind) ? record.kind : "?";
}

function safeInst(record: CaptureRecord): string {
  return typeof record.inst === "string" && /^[A-Z0-9]{1,20}(?:-[A-Z0-9]{1,20}){1,3}$/.test(record.inst) ? record.inst : "?";
}

const LEDGER_KEYS = ["epochId", "gridMs", "records", "firstT", "lastT", "bytesEnd", "byKind", "skipped"];

function parseLedgerLine(line: string, number: number, previous: LedgerEntry | undefined): LedgerEntry {
  const fail = (reason: string): never => {
    throw new CaptureError("corrupt", `ledger inválido na linha ${number}: ${reason}`);
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return fail("JSON malformado");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail("objeto esperado");
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== LEDGER_KEYS.length || !LEDGER_KEYS.every((key) => keys.includes(key))) return fail("chaves inesperadas");
  const integer = (value: unknown, name: string, allowNull = false): number | null => {
    if (value === null && allowNull) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail(`${name} deve ser um inteiro não negativo`);
    return value;
  };
  const gridMs = integer(record.gridMs, "gridMs") as number;
  const records = integer(record.records, "records") as number;
  const firstT = integer(record.firstT, "firstT", true);
  const lastT = integer(record.lastT, "lastT", true);
  const bytesEnd = integer(record.bytesEnd, "bytesEnd") as number;
  const skipped = integer(record.skipped, "skipped") as number;
  if (record.epochId !== `e${gridMs}`) return fail("epochId não confere com gridMs");
  if (typeof record.byKind !== "object" || record.byKind === null || Array.isArray(record.byKind)) return fail("byKind deve ser um objeto");
  const byKind: Record<string, number> = {};
  for (const [kind, count] of Object.entries(record.byKind as Record<string, unknown>)) {
    if (!(CAPTURE_KINDS as readonly string[]).includes(kind) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return fail("byKind inválido");
    byKind[kind] = count;
  }
  if (previous !== undefined) {
    if (gridMs <= previous.gridMs) return fail("épocas fora de ordem ou repetidas");
    if (bytesEnd < previous.bytesEnd) return fail("deslocamento de bytes menor que o da época anterior");
  }
  return { epochId: `e${gridMs}`, gridMs, records, firstT, lastT, bytesEnd, byKind, skipped };
}

function manifestOf(options: RunCaptureOptions): Record<string, unknown> {
  return {
    schema: "onchainos-capture-manifest-v1",
    format: "jev-lab-capture-jsonl",
    source: options.source.id,
    epochMs: options.epochMs,
    config: options.source.describe(),
    notice: MANIFEST_NOTICE,
  };
}

function checkOptions(options: RunCaptureOptions): void {
  const fail = (message: string): never => {
    throw new CaptureError("usage", message);
  };
  if (typeof options.outDir !== "string" || options.outDir.length === 0) fail("outDir é obrigatório");
  if (!Number.isInteger(options.maxEpochs) || options.maxEpochs < 1 || options.maxEpochs > MAX_EPOCHS_CEILING) fail(`maxEpochs deve ser um inteiro de 1 a ${MAX_EPOCHS_CEILING}`);
  if (!Number.isInteger(options.epochMs) || options.epochMs < MIN_EPOCH_MS || options.epochMs > MAX_MS) fail(`epochMs deve ser um inteiro de ${MIN_EPOCH_MS} a ${MAX_MS}`);
  if (!Number.isInteger(options.maxDurationMs) || options.maxDurationMs < 1 || options.maxDurationMs > MAX_MS) fail(`maxDurationMs deve ser um inteiro de 1 a ${MAX_MS}`);
  if (options.maxResumeBytes !== undefined && (!Number.isInteger(options.maxResumeBytes) || options.maxResumeBytes < 1)) fail("maxResumeBytes inválido");
}

// ---------------------------------------------------------------------------
// Opening the folder: create or resume
// ---------------------------------------------------------------------------

interface Paths {
  dir: string;
  data: string;
  ledger: string;
  manifest: string;
}

function openFolder(fs: CaptureFs, paths: Paths, manifest: Record<string, unknown>, maxResumeBytes: number, notes: CaptureReport["notes"]): FolderState {
  if (fs.exists(paths.dir) && !fs.isDirectory(paths.dir)) throw new CaptureError("io", "o destino de --out existe e não é uma pasta");
  if (!fs.exists(paths.dir)) io("criar a pasta de saída", () => fs.mkdirp(paths.dir));

  const hasManifest = fs.exists(paths.manifest);
  const hasData = fs.exists(paths.data);
  const hasLedger = fs.exists(paths.ledger);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  if (!hasManifest && !hasData && !hasLedger) {
    io("criar o manifesto", () => fs.writeAtomic(paths.manifest, manifestText));
    io("criar o arquivo de dados", () => fs.createExclusive(paths.data, ""));
    io("criar o ledger", () => fs.createExclusive(paths.ledger, ""));
    return { entries: [], committedIds: new Set(), lastGridMs: null, dataBytes: 0, acc: newAccumulator() };
  }
  if (!hasManifest) throw new CaptureError("corrupt", "a pasta tem arquivos de captura mas não tem manifesto; nada foi alterado, use outra pasta");

  let stored: unknown;
  try {
    stored = JSON.parse(strictUtf8(io("ler o manifesto", () => fs.readBytes(paths.manifest)), "o manifesto"));
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError("corrupt", "o manifesto não é JSON válido; nada foi alterado");
  }
  if (canonicalJson(stored) !== canonicalJson(manifest)) {
    throw new CaptureError("state_mismatch", "a pasta de saída foi criada com outra configuração (fonte, instrumentos, espécies, barras ou grade); use outra pasta ou a mesma configuração");
  }
  if (!hasData && !hasLedger) {
    io("criar o arquivo de dados", () => fs.createExclusive(paths.data, ""));
    io("criar o ledger", () => fs.createExclusive(paths.ledger, ""));
    return { entries: [], committedIds: new Set(), lastGridMs: null, dataBytes: 0, acc: newAccumulator() };
  }
  if (!hasData || !hasLedger) throw new CaptureError("corrupt", "falta o arquivo de dados ou o ledger; nada foi alterado");

  // ledger
  let ledgerText = strictUtf8(io("ler o ledger", () => fs.readBytes(paths.ledger)), "o ledger");
  if (ledgerText.length > 0 && !ledgerText.endsWith("\n")) {
    const cut = ledgerText.lastIndexOf("\n") + 1;
    const dropped = ledgerText.length - cut;
    io("cortar a última linha incompleta do ledger", () => fs.truncate(paths.ledger, Buffer.byteLength(ledgerText.slice(0, cut), "utf8")));
    ledgerText = ledgerText.slice(0, cut);
    notes.push({ epochId: "retomada", note: `última linha do ledger incompleta (${dropped} caracteres) descartada` });
  }
  const entries: LedgerEntry[] = [];
  const committedIds = new Set<string>();
  const lines = ledgerText === "" ? [] : ledgerText.slice(0, -1).split("\n");
  lines.forEach((line, index) => {
    const entry = parseLedgerLine(line, index + 1, entries[entries.length - 1]);
    if (committedIds.has(entry.epochId)) throw new CaptureError("corrupt", `ledger inválido na linha ${index + 1}: época repetida`);
    committedIds.add(entry.epochId);
    entries.push(entry);
  });

  // data
  const committedBytes = entries[entries.length - 1]?.bytesEnd ?? 0;
  const dataSize = io("medir o arquivo de dados", () => fs.size(paths.data));
  if (dataSize < committedBytes) throw new CaptureError("corrupt", "o arquivo de dados é menor que o ledger: dados se perderam; nada foi alterado, restaure o arquivo ou use outra pasta");
  if (committedBytes > maxResumeBytes) throw new CaptureError("io", "arquivo de dados grande demais para retomar nesta ferramenta; use outra pasta de saída");
  if (dataSize > committedBytes) {
    io("cortar a cauda não confirmada do arquivo de dados", () => fs.truncate(paths.data, committedBytes));
    notes.push({ epochId: "retomada", note: `cauda não confirmada de ${dataSize - committedBytes} bytes no arquivo de dados descartada (época interrompida); ela será refeita` });
  }
  const bytes = io("ler o arquivo de dados", () => fs.readBytes(paths.data));
  const acc = newAccumulator();
  let parsedRecords: CaptureRecord[];
  try {
    parsedRecords = parseCaptureText(strictUtf8(bytes, "o arquivo de dados"));
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    if (error instanceof CaptureFormatError) throw new CaptureError("corrupt", `arquivo de dados inválido: ${error.message}; nada foi alterado`);
    throw new CaptureError("corrupt", "arquivo de dados inválido; nada foi alterado");
  }
  for (const record of parsedRecords) absorb(acc, record);
  const expected = entries.reduce((sum, entry) => sum + entry.records, 0);
  if (parsedRecords.length !== expected) throw new CaptureError("corrupt", `o ledger conta ${expected} registros e o arquivo de dados tem ${parsedRecords.length}; nada foi alterado`);

  return { entries, committedIds, lastGridMs: entries[entries.length - 1]?.gridMs ?? null, dataBytes: committedBytes, acc };
}

// ---------------------------------------------------------------------------
// One epoch
// ---------------------------------------------------------------------------

function buildBlock(epochId: string, records: readonly CaptureRecord[], acc: Accumulator): { sorted: CaptureRecord[]; block: string } {
  const checked = records.map((record, index) => {
    try {
      const line = serializeCaptureRecord(record);
      parseCaptureLine(line, 1);
      return { record, line, index };
    } catch (error) {
      const reason = error instanceof CaptureFormatError ? error.message.replace(/^linha \d+, ?/, "") : "estrutura inválida";
      throw new CaptureError("malformed_record", `época ${epochId}, registro ${index} (${safeKind(record)} ${safeInst(record)}): ${reason}`);
    }
  });
  checked.sort((a, b) => a.record.t - b.record.t || a.index - b.index);
  const candles = new Set<string>();
  for (const { record } of checked) {
    if (record.kind !== "candle") continue;
    const key = `${record.inst}|${record.data.barMs}|${record.data.startMs}`;
    if (acc.candleKeys.has(key) || candles.has(key)) throw new CaptureError("malformed_record", `época ${epochId}: vela repetida (${safeInst(record)}, barMs ${record.data.barMs}, início ${record.data.startMs})`);
    candles.add(key);
  }
  const first = checked[0];
  if (first !== undefined && acc.lastT !== null && first.record.t < acc.lastT) {
    throw new CaptureError("clock", `época ${epochId}: o relógio local voltou: o primeiro registro (t=${first.record.t}) é anterior ao último gravado (t=${acc.lastT})`);
  }
  return { sorted: checked.map((entry) => entry.record), block: checked.map((entry) => `${entry.line}\n`).join("") };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export async function runCapture(options: RunCaptureOptions): Promise<CaptureReport> {
  checkOptions(options);
  const fs = options.fs ?? nodeCaptureFs;
  const paths: Paths = {
    dir: options.outDir,
    data: join(options.outDir, CAPTURE_FILES.data),
    ledger: join(options.outDir, CAPTURE_FILES.ledger),
    manifest: join(options.outDir, CAPTURE_FILES.manifest),
  };
  const report: CaptureReport = {
    schema: "onchainos-capture-report-v1",
    status: "completed",
    source: options.source.id,
    epochMs: options.epochMs,
    epochsTarget: options.maxEpochs,
    epochsCommitted: 0,
    epochsWrittenThisRun: 0,
    records: { total: 0, byKind: {} },
    writtenThisRun: { records: 0, byKind: {} },
    firstT: null,
    lastT: null,
    skipped: [],
    notes: [],
    stop: null,
    files: { data: CAPTURE_FILES.data, ledger: CAPTURE_FILES.ledger, manifest: CAPTURE_FILES.manifest },
    notice: CAPTURE_NOTICE,
  };

  let state: FolderState | null = null;
  let currentEpochId: string | null = null;
  const startedAt = options.now();
  const deadline = startedAt + options.maxDurationMs;
  const stopped = (kind: CaptureErrorKind, message: string): void => {
    report.status = "stopped";
    report.stop = { kind, message, epochId: currentEpochId };
  };

  try {
    state = openFolder(fs, paths, manifestOf(options), options.maxResumeBytes ?? DEFAULT_MAX_RESUME_BYTES, report.notes);
    let stalls = 0;

    while (state.entries.length < options.maxEpochs) {
      const t0 = options.now();
      if (t0 >= deadline) {
        report.status = "duration_limit";
        break;
      }
      const gridMs = Math.floor(t0 / options.epochMs) * options.epochMs;
      if (state.lastGridMs !== null && gridMs < state.lastGridMs) {
        throw new CaptureError("clock", "o relógio local voltou: a célula atual da grade é anterior à última época gravada");
      }
      const epochId = `e${gridMs}`;
      if (state.committedIds.has(epochId)) {
        const wait = gridMs + options.epochMs - t0;
        if (t0 + wait >= deadline) {
          report.status = "duration_limit";
          break;
        }
        await options.sleep(wait);
        if (options.now() <= t0) {
          stalls += 1;
          if (stalls > 3) throw new CaptureError("clock", "o relógio local não avança durante a espera");
        }
        continue;
      }
      stalls = 0;
      currentEpochId = epochId;

      const context: EpochContext = {
        epochId,
        gridMs,
        epochMs: options.epochMs,
        firstEpoch: state.entries.length === 0,
        cursors: cursorsOf(state.acc),
        checkDeadline: () => {
          if (options.now() >= deadline) throw new CaptureError("deadline", "o limite de duração desta execução foi atingido no meio de uma época");
        },
      };

      let collection;
      try {
        collection = await options.source.collect(context);
      } catch (error) {
        if (error instanceof CaptureError && error.kind === "deadline") {
          report.status = "duration_limit";
          currentEpochId = null;
          break;
        }
        throw error;
      }

      const { sorted, block } = buildBlock(epochId, collection.records, state.acc);
      const byKind: Record<string, number> = {};
      for (const record of sorted) byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
      const entry: LedgerEntry = {
        epochId,
        gridMs,
        records: sorted.length,
        firstT: sorted[0]?.t ?? null,
        lastT: sorted[sorted.length - 1]?.t ?? null,
        bytesEnd: state.dataBytes + Buffer.byteLength(block, "utf8"),
        byKind,
        skipped: collection.skipped.length,
      };
      if (block.length > 0) io("gravar os registros da época", () => fs.append(paths.data, block));
      io("confirmar a época no ledger", () => fs.append(paths.ledger, `${JSON.stringify(entry)}\n`));

      state.entries.push(entry);
      state.committedIds.add(epochId);
      state.lastGridMs = gridMs;
      state.dataBytes = entry.bytesEnd;
      for (const record of sorted) absorb(state.acc, record);
      report.epochsWrittenThisRun += 1;
      report.writtenThisRun.records += sorted.length;
      for (const [kind, count] of Object.entries(byKind)) report.writtenThisRun.byKind[kind] = (report.writtenThisRun.byKind[kind] ?? 0) + count;
      for (const note of collection.skipped) report.skipped.push({ epochId, kind: note.kind, inst: note.inst, reason: note.reason });
      for (const note of collection.notes) report.notes.push({ epochId, note });
      currentEpochId = null;
    }
  } catch (error) {
    if (error instanceof CaptureError) stopped(error.kind, error.message);
    else if (error instanceof OnchainosError) stopped("provider", error.message);
    else stopped("internal", `erro interno inesperado (${error instanceof Error ? error.name : typeof error})`);
  }

  if (state !== null) {
    report.epochsCommitted = state.entries.length;
    report.records = { total: state.acc.total, byKind: { ...state.acc.byKind } };
    report.firstT = state.acc.firstT;
    report.lastT = state.acc.lastT;
  }
  return report;
}

// ---------------------------------------------------------------------------
// Summary for people (Portuguese)
// ---------------------------------------------------------------------------

export function summarizePt(report: CaptureReport): string[] {
  const lines: string[] = [];
  const kinds = (counts: Record<string, number>): string => {
    const parts = Object.entries(counts).map(([kind, count]) => `${kind} ${count}`);
    return parts.length === 0 ? "nenhum" : parts.join(", ");
  };
  lines.push(`Captura somente leitura (fonte ${report.source}): ${report.epochsCommitted} de ${report.epochsTarget} épocas na pasta, ${report.epochsWrittenThisRun} gravadas nesta execução.`);
  lines.push(`Registros nesta execução: ${report.writtenThisRun.records} (${kinds(report.writtenThisRun.byKind)}); no total da pasta: ${report.records.total} (${kinds(report.records.byKind)}).`);
  if (report.status === "completed") lines.push("Estado: concluída.");
  else if (report.status === "duration_limit") lines.push("Estado: parada pelo limite de duração; repita o comando para continuar de onde parou.");
  else lines.push(`Estado: PARADA (${report.stop?.kind ?? "desconhecido"}): ${report.stop?.message ?? "sem detalhe"}`);
  if (report.skipped.length > 0) lines.push(`Registros não gravados de propósito: ${report.skipped.length} (veja o campo skipped do relatório).`);
  if (report.notes.length > 0) lines.push(`Observações: ${report.notes.length} (veja o campo notes do relatório).`);
  lines.push(report.notice);
  return lines;
}

export type { CaptureKind };
