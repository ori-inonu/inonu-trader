/**
 * The ledger of "Pedir ao Inonu" (T7.4, ASK-6): every call to the model, with the tokens, dollars and latency the provider
 * MEASURED and `null` wherever it reported nothing. Before this existed the cost of the model in this repository was
 * "not measured"; this is what lets a saving be proved or denied.
 *
 * One JSON object per line in `<dir>/ledger.jsonl`, append only, bounded. Days are UTC days. A damaged line is skipped and
 * counted. Only the documented fields are stored: no prompt, no answer text, no key. A folder that cannot be written never
 * breaks a click: the entry stays in memory for the session.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AskMode, EvaluationUsage, Ledger, LedgerEntry } from "./ask";

const DAY_MS = 86_400_000;
const DEFAULT_MAX_ENTRIES = 5_000;
const MODES: readonly string[] = ["ativo", "token", "descoberta", "filtro", "ranking", "carteira", "ecossistema"];

export interface Totals {
  /** Calls that reached the model. */
  readonly calls: number;
  /** Null as soon as one of those calls has no measured cost. */
  readonly usd: number | null;
  readonly tokens: number | null;
  /** Sum of the OnchainOS calls that were counted. */
  readonly onchainosCalls: number;
  readonly avgLatencyMs: number | null;
}

export interface LedgerSummary {
  readonly today: Totals;
  readonly month: Totals;
}

export interface FileLedger extends Ledger {
  /** Always present here: what counts against the daily dollar cap (see `Ledger.committedTodayUsd`). */
  committedTodayUsd(nowMs: number): number | null;
  entries(): LedgerEntry[];
  corruptLines(): number;
  summary(nowMs: number): LedgerSummary;
}

const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

function parseEvaluations(value: unknown, count: number): EvaluationUsage[] | null {
  if (!Array.isArray(value) || value.length !== count || value.length > 2) return null;
  const result: EvaluationUsage[] = [];
  for (const [index, raw] of value.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.indice !== index + 1) return null;
    result.push({ indice: (index + 1) as 1 | 2, tokensEntrada: numberOrNull(o.tokensEntrada), tokensSaida: numberOrNull(o.tokensSaida), usd: numberOrNull(o.usd), usdEstimado: numberOrNull(o.usdEstimado) });
  }
  return result;
}

function parseEntry(value: unknown): LedgerEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.atMs !== "number" || !Number.isFinite(o.atMs)) return null;
  if (typeof o.modo !== "string" || !MODES.includes(o.modo) || typeof o.razao !== "string" || typeof o.resultado !== "string") return null;
  if (o.chamadasModelo !== 0 && o.chamadasModelo !== 1 && o.chamadasModelo !== 2) return null;
  if (o.chamadasModelo === 2 && o.modo !== "ecossistema") return null;
  const avaliacoes = o.avaliacoes === undefined ? undefined : parseEvaluations(o.avaliacoes, o.chamadasModelo);
  if (avaliacoes === null) return null;
  return {
    id: o.id,
    atMs: o.atMs,
    modo: o.modo as AskMode,
    razao: o.razao,
    briefHash: typeof o.briefHash === "string" ? o.briefHash : null,
    modelo: typeof o.modelo === "string" ? o.modelo : null,
    chamadasModelo: o.chamadasModelo,
    chamadasOnchainos: numberOrNull(o.chamadasOnchainos),
    tokensEntrada: numberOrNull(o.tokensEntrada),
    tokensSaida: numberOrNull(o.tokensSaida),
    usd: numberOrNull(o.usd),
    usdEstimado: numberOrNull(o.usdEstimado),
    ...(avaliacoes !== undefined ? { avaliacoes } : {}),
    latenciaMs: numberOrNull(o.latenciaMs),
    resultado: o.resultado,
  };
}

/** Only the documented fields, in a fixed order. */
const serialize = (e: LedgerEntry): string =>
  JSON.stringify({ id: e.id, atMs: e.atMs, modo: e.modo, razao: e.razao, briefHash: e.briefHash, modelo: e.modelo, chamadasModelo: e.chamadasModelo, chamadasOnchainos: e.chamadasOnchainos, tokensEntrada: e.tokensEntrada, tokensSaida: e.tokensSaida, usd: e.usd, usdEstimado: e.usdEstimado ?? null, ...(e.avaliacoes ? { avaliacoes: e.avaliacoes.map((a) => ({ indice: a.indice, tokensEntrada: a.tokensEntrada, tokensSaida: a.tokensSaida, usd: a.usd, usdEstimado: a.usdEstimado })) } : {}), latenciaMs: e.latenciaMs, resultado: e.resultado });

function totals(entries: readonly LedgerEntry[]): Totals {
  const calls = entries.filter((e) => e.chamadasModelo > 0);
  const usd = calls.every((e) => e.usd !== null) ? calls.reduce((sum, e) => sum + e.usd!, 0) : null;
  const tokens = calls.every((e) => e.tokensEntrada !== null && e.tokensSaida !== null) ? calls.reduce((sum, e) => sum + e.tokensEntrada! + e.tokensSaida!, 0) : null;
  const latencies = calls.map((e) => e.latenciaMs).filter((l): l is number => l !== null);
  return {
    calls: calls.reduce((sum, e) => sum + e.chamadasModelo, 0),
    usd,
    tokens,
    onchainosCalls: entries.reduce((sum, e) => sum + (e.chamadasOnchainos ?? 0), 0),
    avgLatencyMs: latencies.length === 0 ? null : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
  };
}

export function createFileLedger(options: { readonly dir: string; readonly maxEntries?: number }): FileLedger {
  const file = join(options.dir, "ledger.jsonl");
  const max = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  let list: LedgerEntry[] = [];
  let corrupt = 0;
  let lineCount = 0;

  const rewrite = (): void => {
    try {
      mkdirSync(options.dir, { recursive: true });
      const temp = `${file}.tmp`;
      writeFileSync(temp, list.map(serialize).map((l) => `${l}\n`).join(""));
      renameSync(temp, file);
      lineCount = list.length;
    } catch {
      // the ledger must never break a click; memory still has the entries
    }
  };

  if (existsSync(file)) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (line.trim() === "") continue;
        lineCount += 1;
        try {
          const parsed = parseEntry(JSON.parse(line));
          if (parsed === null) corrupt += 1;
          else list.push(parsed);
        } catch {
          corrupt += 1;
        }
      }
    } catch {
      // unreadable: start empty
    }
    if (list.length > max) {
      list = list.slice(-max);
      rewrite();
    }
  }

  const sameDay = (atMs: number, nowMs: number) => Math.floor(atMs / DAY_MS) === Math.floor(nowMs / DAY_MS);
  const sameMonth = (atMs: number, nowMs: number) => new Date(atMs).getUTCFullYear() === new Date(nowMs).getUTCFullYear() && new Date(atMs).getUTCMonth() === new Date(nowMs).getUTCMonth();

  return {
    record(rawEntry) {
      const entry = parseEntry(rawEntry);
      if (entry === null) return;
      list.push(entry);
      if (list.length > max) list = list.slice(-max);
      try {
        mkdirSync(options.dir, { recursive: true });
        appendFileSync(file, `${serialize(entry)}\n`);
        lineCount += 1;
        if (lineCount > max * 2) rewrite();
      } catch {
        // unwritable folder: the session still has it
      }
    },
    spentTodayUsd(nowMs) {
      return totals(list.filter((e) => sameDay(e.atMs, nowMs))).usd;
    },
    committedTodayUsd(nowMs) {
      const calls = list.filter((e) => e.chamadasModelo > 0 && sameDay(e.atMs, nowMs));
      let sum = 0;
      for (const call of calls) {
        const counted = call.avaliacoes
          ? call.avaliacoes.every((a) => (a.usd ?? a.usdEstimado) !== null) ? call.avaliacoes.reduce((s, a) => s + (a.usd ?? a.usdEstimado)!, 0) : null
          : call.usd ?? call.usdEstimado ?? null;
        if (counted === null) return null; // no cost and no estimate: the price was not known, the dollar caps were off for it
        sum += counted;
      }
      return sum;
    },
    callsToday(nowMs) {
      return list.filter((e) => sameDay(e.atMs, nowMs)).reduce((sum, e) => sum + e.chamadasModelo, 0);
    },
    entries: () => [...list],
    corruptLines: () => corrupt,
    summary(nowMs) {
      return { today: totals(list.filter((e) => sameDay(e.atMs, nowMs))), month: totals(list.filter((e) => sameMonth(e.atMs, nowMs))) };
    },
  };
}
