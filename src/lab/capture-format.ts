/**
 * Capture format of the Jev Decision Lab: JSONL lines {t, kind, inst, data} with STRICT validation.
 * Specification: docs/JEV-LABORATORIO-DE-DECISAO.md section 3.4. A later data-collection task writes files in exactly
 * this format; this module only reads and writes text, it never opens a file or touches the network.
 *
 * `t` is the instant at which the datum became knowable to a live observer (local receipt). A candle is only knowable
 * after it closes, so `t >= startMs + barMs` is enforced here: the format itself refuses the most common way of
 * leaking the future into a replay.
 *
 * Errors name the line and the field path and NEVER echo the content of the line.
 */

export const CAPTURE_KINDS = ["ticker", "funding", "mark", "candle", "book", "oi"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_LIMITS = Object.freeze({
  maxLineBytes: 65_536,
  maxChars: 268_435_456,
  maxRecords: 5_000_000,
  maxBookLevels: 50,
  /** 2100-01-01T00:00:00Z */
  maxT: 4_102_444_800_000,
  maxBarMs: 86_400_000,
  maxInstLength: 48,
  /** Largest absolute funding rate per settlement (5%): beyond it a percent was probably written as a fraction. */
  maxAbsFundingRate: 0.05,
});

export const FUNDING_INTERVALS_MS: readonly number[] = Object.freeze([3_600_000, 7_200_000, 14_400_000, 28_800_000]);

export interface TickerData { bid: number; ask: number; last: number; bidSize?: number; askSize?: number; vol24h?: number }
export interface FundingData { rate: number; settleMs: number; intervalMs: number }
export interface MarkData { price: number; index?: number }
export interface CandleData { startMs: number; barMs: number; open: number; high: number; low: number; close: number; volume?: number }
export type BookLevel = readonly [number, number];
export interface BookData { bids: readonly BookLevel[]; asks: readonly BookLevel[] }
export interface OiData { oi: number; oiUsd?: number }

export type CaptureRecord =
  | { readonly t: number; readonly kind: "ticker"; readonly inst: string; readonly data: Readonly<TickerData> }
  | { readonly t: number; readonly kind: "funding"; readonly inst: string; readonly data: Readonly<FundingData> }
  | { readonly t: number; readonly kind: "mark"; readonly inst: string; readonly data: Readonly<MarkData> }
  | { readonly t: number; readonly kind: "candle"; readonly inst: string; readonly data: Readonly<CandleData> }
  | { readonly t: number; readonly kind: "book"; readonly inst: string; readonly data: Readonly<BookData> }
  | { readonly t: number; readonly kind: "oi"; readonly inst: string; readonly data: Readonly<OiData> };

export type RecordOf<K extends CaptureKind> = Extract<CaptureRecord, { kind: K }>;

export class CaptureFormatError extends Error {
  readonly line: number;
  readonly path: string;
  constructor(line: number, path: string, reason: string) {
    super(`linha ${line}${path === "" ? "" : `, campo ${path}`}: ${reason}`);
    this.name = "CaptureFormatError";
    this.line = line;
    this.path = path;
  }
}

const INST_PATTERN = /^[A-Z0-9]{1,20}(?:-[A-Z0-9]{1,20}){1,3}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const TOP_KEYS = ["t", "kind", "inst", "data"] as const;
const DATA_KEYS: Record<CaptureKind, { required: readonly string[]; optional: readonly string[] }> = {
  ticker: { required: ["bid", "ask", "last"], optional: ["bidSize", "askSize", "vol24h"] },
  funding: { required: ["rate", "settleMs", "intervalMs"], optional: [] },
  mark: { required: ["price"], optional: ["index"] },
  candle: { required: ["startMs", "barMs", "open", "high", "low", "close"], optional: ["volume"] },
  book: { required: ["bids", "asks"], optional: [] },
  oi: { required: ["oi"], optional: ["oiUsd"] },
};

function fail(line: number, path: string, reason: string): never {
  throw new CaptureFormatError(line, path, reason);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, line: number, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(line, path, "número finito esperado");
  return value;
}

function positive(value: unknown, line: number, path: string): number {
  const n = finite(value, line, path);
  if (n <= 0) fail(line, path, "número maior que zero esperado");
  return n;
}

function nonNegative(value: unknown, line: number, path: string): number {
  const n = finite(value, line, path);
  if (n < 0) fail(line, path, "número maior ou igual a zero esperado");
  return n;
}

function safeInteger(value: unknown, line: number, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(line, path, `inteiro seguro entre ${minimum} e ${maximum} esperado`);
  return value;
}

/** Rejects unknown keys first (in object order) and then missing required keys (in canonical order). */
function checkKeys(source: Record<string, unknown>, required: readonly string[], optional: readonly string[], line: number, prefix: string): void {
  for (const key of Object.keys(source)) {
    if (!required.includes(key) && !optional.includes(key)) fail(line, `${prefix}${key}`, "chave desconhecida");
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) fail(line, `${prefix}${key}`, "chave obrigatória ausente");
  }
}

function optionalValue(source: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
}

function readLevels(value: unknown, line: number, path: string, descending: boolean): BookLevel[] {
  if (!Array.isArray(value)) fail(line, path, "lista de níveis esperada");
  if (value.length > CAPTURE_LIMITS.maxBookLevels) fail(line, path, `no máximo ${CAPTURE_LIMITS.maxBookLevels} níveis por lado`);
  const levels: BookLevel[] = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length !== 2) fail(line, path, "nível esperado como [preço, tamanho]");
    const price = positive(raw[0], line, path);
    const size = positive(raw[1], line, path);
    const previous = levels[levels.length - 1];
    if (previous !== undefined && (descending ? price >= previous[0] : price <= previous[0])) fail(line, path, descending ? "preços de bids devem ser estritamente decrescentes" : "preços de asks devem ser estritamente crescentes");
    levels.push(Object.freeze([price, size]) as BookLevel);
  }
  return levels;
}

function readData(kind: CaptureKind, raw: Record<string, unknown>, t: number, line: number): CaptureRecord["data"] {
  const keys = DATA_KEYS[kind];
  checkKeys(raw, keys.required, keys.optional, line, "data.");
  switch (kind) {
    case "ticker": {
      const bid = positive(raw.bid, line, "data.bid");
      const ask = positive(raw.ask, line, "data.ask");
      const last = positive(raw.last, line, "data.last");
      const data: TickerData = { bid, ask, last };
      const bidSize = optionalValue(raw, "bidSize");
      const askSize = optionalValue(raw, "askSize");
      const vol24h = optionalValue(raw, "vol24h");
      if (bidSize !== undefined) data.bidSize = nonNegative(bidSize, line, "data.bidSize");
      if (askSize !== undefined) data.askSize = nonNegative(askSize, line, "data.askSize");
      if (vol24h !== undefined) data.vol24h = nonNegative(vol24h, line, "data.vol24h");
      if (bid > ask) fail(line, "data.bid", "ticker cruzado: bid acima de ask");
      return data;
    }
    case "funding": {
      const rate = finite(raw.rate, line, "data.rate");
      if (Math.abs(rate) > CAPTURE_LIMITS.maxAbsFundingRate) fail(line, "data.rate", "taxa fora da faixa de 5% por liquidação (fração, não porcentagem)");
      const settleMs = safeInteger(raw.settleMs, line, "data.settleMs", 1, CAPTURE_LIMITS.maxT);
      const intervalMs = finite(raw.intervalMs, line, "data.intervalMs");
      if (!FUNDING_INTERVALS_MS.includes(intervalMs)) fail(line, "data.intervalMs", "intervalo deve ser 1, 2, 4 ou 8 horas em milissegundos");
      return { rate, settleMs, intervalMs } satisfies FundingData;
    }
    case "mark": {
      const data: MarkData = { price: positive(raw.price, line, "data.price") };
      const index = optionalValue(raw, "index");
      if (index !== undefined) data.index = positive(index, line, "data.index");
      return data;
    }
    case "candle": {
      const startMs = safeInteger(raw.startMs, line, "data.startMs", 0, CAPTURE_LIMITS.maxT);
      const barMs = safeInteger(raw.barMs, line, "data.barMs", 1_000, CAPTURE_LIMITS.maxBarMs);
      if (barMs % 1_000 !== 0) fail(line, "data.barMs", "duração da vela deve ser múltiplo de 1000 ms");
      const open = positive(raw.open, line, "data.open");
      const high = positive(raw.high, line, "data.high");
      const low = positive(raw.low, line, "data.low");
      const close = positive(raw.close, line, "data.close");
      if (low > Math.min(open, close)) fail(line, "data.low", "mínima acima da abertura ou do fechamento");
      if (high < Math.max(open, close)) fail(line, "data.high", "máxima abaixo da abertura ou do fechamento");
      const data: CandleData = { startMs, barMs, open, high, low, close };
      const volume = optionalValue(raw, "volume");
      if (volume !== undefined) data.volume = nonNegative(volume, line, "data.volume");
      if (t < startMs + barMs) fail(line, "t", "vela registrada antes de fechar (t deve ser pelo menos startMs + barMs)");
      return data;
    }
    case "book": {
      const bids = readLevels(raw.bids, line, "data.bids", true);
      const asks = readLevels(raw.asks, line, "data.asks", false);
      const bestBid = bids[0];
      const bestAsk = asks[0];
      if (bestBid !== undefined && bestAsk !== undefined && bestBid[0] >= bestAsk[0]) fail(line, "data.bids", "livro cruzado: melhor bid não abaixo do melhor ask");
      return { bids: Object.freeze(bids), asks: Object.freeze(asks) } satisfies BookData;
    }
    case "oi": {
      const data: OiData = { oi: nonNegative(raw.oi, line, "data.oi") };
      const oiUsd = optionalValue(raw, "oiUsd");
      if (oiUsd !== undefined) data.oiUsd = nonNegative(oiUsd, line, "data.oiUsd");
      return data;
    }
  }
}

/** Validates a parsed JSON value as a capture record. Used by the line parser and by the synthetic generator's self check. */
export function validateCaptureRecord(value: unknown, lineNumber = 1): CaptureRecord {
  if (!isPlainObject(value)) fail(lineNumber, "", "objeto esperado");
  checkKeys(value, TOP_KEYS, [], lineNumber, "");
  const t = safeInteger(value.t, lineNumber, "t", 0, CAPTURE_LIMITS.maxT);
  const kind = value.kind;
  if (typeof kind !== "string" || !(CAPTURE_KINDS as readonly string[]).includes(kind)) fail(lineNumber, "kind", "espécie desconhecida");
  const inst = value.inst;
  if (typeof inst !== "string" || inst.length > CAPTURE_LIMITS.maxInstLength || !INST_PATTERN.test(inst)) fail(lineNumber, "inst", "identificador de instrumento inválido");
  if (!isPlainObject(value.data)) fail(lineNumber, "data", "objeto esperado");
  const data = readData(kind as CaptureKind, value.data, t, lineNumber);
  return Object.freeze({ t, kind: kind as CaptureKind, inst, data: Object.freeze(data) }) as CaptureRecord;
}

export function parseCaptureLine(line: string, lineNumber = 1): CaptureRecord {
  if (CONTROL_CHARACTERS.test(line)) fail(lineNumber, "", "caractere de controle na linha");
  if (Buffer.byteLength(line, "utf8") > CAPTURE_LIMITS.maxLineBytes) fail(lineNumber, "", `linha acima de ${CAPTURE_LIMITS.maxLineBytes} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return fail(lineNumber, "", "JSON malformado");
  }
  return validateCaptureRecord(parsed, lineNumber);
}

export interface ParseCaptureOptions {
  maxRecords?: number;
  maxChars?: number;
}

export function parseCaptureText(text: string, options: ParseCaptureOptions = {}): CaptureRecord[] {
  const maxRecords = options.maxRecords ?? CAPTURE_LIMITS.maxRecords;
  const maxChars = options.maxChars ?? CAPTURE_LIMITS.maxChars;
  if (text.length > maxChars) fail(1, "", `arquivo acima de ${maxChars} caracteres`);
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split("\n");
  const records: CaptureRecord[] = [];
  const candles = new Set<string>();
  let previousT = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    let line = lines[index] as string;
    if (index === lines.length - 1 && line === "") continue;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "") fail(lineNumber, "", "linha vazia");
    if (records.length >= maxRecords) fail(lineNumber, "", `mais de ${maxRecords} registros`);
    const record = parseCaptureLine(line, lineNumber);
    if (record.t < previousT) fail(lineNumber, "t", "t não pode diminuir ao longo do arquivo");
    previousT = record.t;
    if (record.kind === "candle") {
      const key = `${record.inst}|${record.data.barMs}|${record.data.startMs}`;
      if (candles.has(key)) fail(lineNumber, "data.startMs", "vela duplicada para o mesmo instrumento, duração e início");
      candles.add(key);
    }
    records.push(record);
  }
  return records;
}

/** Data with its keys in the canonical order of the kind, optional keys only when present. */
function canonicalData(record: CaptureRecord): Record<string, unknown> {
  switch (record.kind) {
    case "book":
      return { bids: record.data.bids.map(([p, s]) => [p, s]), asks: record.data.asks.map(([p, s]) => [p, s]) };
    default: {
      const keys = DATA_KEYS[record.kind];
      const source = record.data as unknown as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of [...keys.required, ...keys.optional]) {
        if (source[key] !== undefined) out[key] = source[key];
      }
      return out;
    }
  }
}

/** The canonical line (no trailing newline): keys in the fixed order t, kind, inst, data. */
export function serializeCaptureRecord(record: CaptureRecord): string {
  return JSON.stringify({ t: record.t, kind: record.kind, inst: record.inst, data: canonicalData(record) });
}

/** One canonical line per record, each ended by a newline; the empty list gives the empty text. */
export function serializeCapture(records: readonly CaptureRecord[]): string {
  let text = "";
  for (const record of records) text += `${serializeCaptureRecord(record)}\n`;
  return text;
}
