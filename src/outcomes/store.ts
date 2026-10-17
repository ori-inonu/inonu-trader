/**
 * Append-only storage of the recorder (INT-0.7, REC-2): snapshots, labels and decisions as JSON lines in one folder.
 *
 *  - one file per UTC day for snapshots and for labels, one small file for decisions;
 *  - a damaged line is skipped and counted, never fatal; a line that is not exactly the documented shape is damaged;
 *  - a folder that cannot be written never breaks a click: `append*` returns false, the failure is counted, and nothing throws;
 *  - the folder is capped (default 200 MB): when it is over the cap the oldest day files are removed until it is under 90%
 *    of it. Only files this module names are ever touched.
 *
 * Only documented fields are written: no prompt, no model text, no key, no address.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_VERSION } from "../intel/features/types";
import { HORIZONS, type DecisionRecord, type Label, type Snapshot, type ZoneRef } from "./types";

export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const CHECK_EVERY = 50;
const SNAP = /^snapshots-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const LAB = /^labels-(\d{4}-\d{2}-\d{2})\.jsonl$/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function parseZone(v: unknown): ZoneRef | null | undefined {
  if (v === null) return null;
  if (!isRec(v) || !num(v.baixo) || !num(v.alto) || !numOrNull(v.invalidacao) || !num(v.nota)) return undefined;
  if (v.id !== undefined && (typeof v.id !== "string" || v.id.length === 0 || v.id.length > 64)) return undefined;
  if (v.lado !== undefined && v.lado !== "demanda" && v.lado !== "oferta" && v.lado !== "neutra") return undefined;
  return { ...(v.id === undefined ? {} : { id: v.id }), ...(v.lado === undefined ? {} : { lado: v.lado }), baixo: v.baixo, alto: v.alto, invalidacao: v.invalidacao, nota: v.nota };
}

export function parseSnapshot(raw: unknown): Snapshot | null {
  if (!isRec(raw) || typeof raw.id !== "string" || !num(raw.asOfMs) || typeof raw.instId !== "string") return null;
  if (raw.market !== "spot" && raw.market !== "perp") return null;
  if (!num(raw.price) || !(raw.price > 0) || !numOrNull(raw.costRoundTripBps) || !numOrNull(raw.atr15m)) return null;
  if (raw.origem !== "relogio" && raw.origem !== "pedido" && raw.origem !== "historico") return null;
  if (!isRec(raw.zones)) return null;
  const demanda = parseZone(raw.zones.demanda);
  const oferta = parseZone(raw.zones.oferta);
  if (demanda === undefined || oferta === undefined) return null;
  let todas: ZoneRef[] | undefined;
  if (raw.zones.todas !== undefined) {
    if (!Array.isArray(raw.zones.todas) || raw.zones.todas.length > 12) return null;
    todas = [];
    for (const z of raw.zones.todas) {
      const parsed = parseZone(z);
      if (parsed === undefined || parsed === null) return null;
      todas.push(parsed);
    }
  }
  const f = raw.features;
  if (!isRec(f) || f.v !== FEATURE_VERSION || typeof f.instId !== "string" || !num(f.asOfMs) || !isRec(f.values) || !isRec(f.nulos) || !isRec(f.idades)) return null;
  for (const value of Object.values(f.values)) if (!numOrNull(value)) return null;
  for (const value of Object.values(f.nulos)) if (typeof value !== "string") return null;
  for (const value of Object.values(f.idades)) if (!num(value)) return null;
  return {
    id: raw.id,
    asOfMs: raw.asOfMs,
    instId: raw.instId,
    market: raw.market,
    price: raw.price,
    costRoundTripBps: raw.costRoundTripBps,
    atr15m: raw.atr15m,
    zones: { demanda, oferta, ...(todas === undefined ? {} : { todas }) },
    features: { v: FEATURE_VERSION, instId: f.instId, asOfMs: f.asOfMs, values: f.values as Record<string, number | null>, nulos: f.nulos as Record<string, string>, idades: f.idades as Record<string, number> },
    origem: raw.origem,
  };
}

const BARRIERS: readonly unknown[] = ["alvo", "parada", "tempo", null];
const REASONS: readonly unknown[] = ["horizonte_alem_dos_dados", "lacuna_de_velas", "sem_preco_de_entrada", null];

function parseReaction(v: unknown): { tocou: boolean; reagiu: boolean | null } | null | undefined {
  if (v === null) return null;
  if (!isRec(v) || typeof v.tocou !== "boolean" || (v.reagiu !== null && typeof v.reagiu !== "boolean")) return undefined;
  return { tocou: v.tocou, reagiu: v.reagiu };
}

export function parseLabel(raw: unknown): Label | null {
  if (!isRec(raw) || typeof raw.snapshotId !== "string" || !(HORIZONS as readonly unknown[]).includes(raw.horizonte) || typeof raw.completo !== "boolean") return null;
  if (!REASONS.includes(raw.motivoIncompleto)) return null;
  for (const key of ["brutoLongBps", "liquidoLongBps", "liquidoShortBps", "maxAltaBps", "maxQuedaBps"] as const) if (!numOrNull(raw[key])) return null;
  if (!BARRIERS.includes(raw.barreiraLong) || !BARRIERS.includes(raw.barreiraShort)) return null;
  const zd = parseReaction(raw.zonaDemanda);
  const zo = parseReaction(raw.zonaOferta);
  if (zd === undefined || zo === undefined) return null;
  return raw as unknown as Label & { zonaDemanda: typeof zd; zonaOferta: typeof zo };
}

export function parseDecision(raw: unknown): DecisionRecord | null {
  if (!isRec(raw) || typeof raw.id !== "string" || !num(raw.atMs) || typeof raw.modo !== "string") return null;
  if (raw.instId !== null && typeof raw.instId !== "string") return null;
  if (raw.action !== "buy" && raw.action !== "sell" && raw.action !== "hold") return null;
  if (raw.candidateId !== null && typeof raw.candidateId !== "string") return null;
  if (raw.briefHash !== null && typeof raw.briefHash !== "string") return null;
  if (raw.snapshotId !== null && typeof raw.snapshotId !== "string") return null;
  if (typeof raw.reutilizado !== "boolean") return null;
  let probabilidades: Record<string, number> | null = null;
  if (raw.probabilidades !== null) {
    if (!isRec(raw.probabilidades)) return null;
    for (const v of Object.values(raw.probabilidades)) if (!num(v) || v < 0 || v > 1) return null;
    probabilidades = raw.probabilidades as Record<string, number>;
  }
  let veredito: DecisionRecord["veredito"] = null;
  if (raw.veredito !== null) {
    const v = raw.veredito;
    if (!isRec(v) || (v.selo !== "comprar" && v.selo !== "vender" && v.selo !== "esperar") || (v.forcadoPor !== null && typeof v.forcadoPor !== "string")) return null;
    veredito = { selo: v.selo, forcadoPor: v.forcadoPor };
  }
  return { id: raw.id, atMs: raw.atMs, instId: raw.instId, modo: raw.modo, action: raw.action, candidateId: raw.candidateId, briefHash: raw.briefHash, snapshotId: raw.snapshotId, reutilizado: raw.reutilizado, probabilidades, veredito };
}

export interface StoreStats {
  readonly snapshots: number;
  readonly labels: number;
  readonly decisions: number;
  readonly corruptLines: number;
  readonly writeErrors: number;
  readonly bytes: number;
  readonly lastAppendMs: number | null;
}

export interface OutcomeStore {
  appendSnapshot(snapshot: Snapshot): boolean;
  appendLabel(label: Label): boolean;
  appendDecision(decision: DecisionRecord): boolean;
  /** All snapshots, or those of the UTC days from `sinceMs` on (the labeler only needs the recent ones). */
  snapshots(sinceMs?: number): Snapshot[];
  labels(sinceMs?: number): Label[];
  decisions(): DecisionRecord[];
  /** `snapshotId|horizonte` of every FINAL label already written (complete, or given up on a gap; a horizon that was not over yet is never final), from the label files of the UTC days since `sinceMs`. */
  doneKeys(sinceMs?: number): Set<string>;
  stats(): StoreStats;
}

export interface StoreOptions {
  readonly dir: string;
  /** The clock; default the local one. */
  readonly now?: () => number;
  readonly maxBytes?: number;
}

export function createOutcomeStore(options: StoreOptions): OutcomeStore {
  const now = options.now ?? Date.now;
  const max = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let writeErrors = 0;
  let appends = 0;
  let lastAppendMs: number | null = null;

  const files = (pattern: RegExp, sinceMs?: number): string[] => {
    const floor = sinceMs === undefined ? null : day(sinceMs);
    try {
      return readdirSync(options.dir).filter((f) => pattern.test(f) && (floor === null || pattern.exec(f)![1]! >= floor)).sort();
    } catch {
      return [];
    }
  };
  const dayFiles = (): { name: string; day: string }[] =>
    [...files(SNAP), ...files(LAB)].map((name) => ({ name, day: (SNAP.exec(name) ?? LAB.exec(name))![1]! })).sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  const ownFiles = (): string[] => [...files(SNAP), ...files(LAB), ...(existsSync(join(options.dir, "decisions.jsonl")) ? ["decisions.jsonl"] : [])];
  const bytes = (): number => ownFiles().reduce((sum, f) => {
    try {
      return sum + statSync(join(options.dir, f)).size;
    } catch {
      return sum;
    }
  }, 0);

  /** Over the cap: remove the oldest day files (snapshots and labels of the same day together) until under 90% of it. */
  function enforceCap(): void {
    let total = bytes();
    if (total <= max) return;
    for (const file of dayFiles()) {
      if (total <= max * 0.9) break;
      try {
        const size = statSync(join(options.dir, file.name)).size;
        unlinkSync(join(options.dir, file.name));
        total -= size;
      } catch {
        // a file that cannot be removed stays; the next check tries again
      }
    }
  }

  function append(name: string, value: unknown): boolean {
    try {
      mkdirSync(options.dir, { recursive: true });
      appendFileSync(join(options.dir, name), `${JSON.stringify(value)}\n`);
      appends += 1;
      lastAppendMs = now();
      if (appends % CHECK_EVERY === 0) enforceCap();
      return true;
    } catch {
      writeErrors += 1;
      return false;
    }
  }

  let corrupt = 0;
  function readAll<T>(names: string[], parse: (raw: unknown) => T | null): T[] {
    const out: T[] = [];
    for (const name of names) {
      let text: string;
      try {
        text = readFileSync(join(options.dir, name), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        if (line.length === 0) continue;
        try {
          const value = parse(JSON.parse(line));
          if (value === null) corrupt += 1;
          else out.push(value);
        } catch {
          corrupt += 1;
        }
      }
    }
    return out;
  }
  const read = <T>(names: string[], parse: (raw: unknown) => T | null): T[] => {
    corrupt = 0;
    return readAll(names, parse);
  };

  return {
    appendSnapshot: (s) => append(`snapshots-${day(s.asOfMs)}.jsonl`, s),
    appendLabel: (l) => append(`labels-${day(now())}.jsonl`, l),
    appendDecision: (d) => append("decisions.jsonl", d),
    snapshots: (sinceMs) => read(files(SNAP, sinceMs), parseSnapshot),
    labels: (sinceMs) => read(files(LAB, sinceMs), parseLabel),
    decisions: () => read(existsSync(join(options.dir, "decisions.jsonl")) ? ["decisions.jsonl"] : [], parseDecision),
    doneKeys: (sinceMs) => new Set(read(files(LAB, sinceMs), parseLabel).filter((l) => l.completo || l.motivoIncompleto !== "horizonte_alem_dos_dados").map((l) => `${l.snapshotId}|${l.horizonte}`)),
    stats() {
      corrupt = 0;
      const snapshots = readAll(files(SNAP), parseSnapshot).length;
      const labels = readAll(files(LAB), parseLabel).length;
      const decisions = readAll(existsSync(join(options.dir, "decisions.jsonl")) ? ["decisions.jsonl"] : [], parseDecision).length;
      return { snapshots, labels, decisions, corruptLines: corrupt, writeErrors, bytes: bytes(), lastAppendMs };
    },
  };
}
