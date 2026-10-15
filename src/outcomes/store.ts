/**
 * Append-only storage of the recorder (INT-0.7, REC-2): snapshots, labels and decisions as JSON lines in one folder.
 *
 *  - one file per UTC day for snapshots, for labels and for decisions (a legacy `decisions.jsonl` is still read, counted and, being
 *    the oldest thing there is, the first to go);
 *  - a damaged line is skipped and counted, never fatal; a line that is not exactly the documented shape is damaged, and a snapshot
 *    is only read back when its FeatureVector is exactly the documented one and says it is about the same instrument and instant;
 *  - a folder that cannot be written never breaks a click: `append*` returns false, the failure is counted, and nothing throws;
 *  - ONE cap for everything the module owns (default 200 MB): before a write that would cross it, the oldest days of every kind are
 *    removed until the folder is under 90% of it and the line fits; the files of the current day are never removed to make room, so
 *    when even that is not enough the write is REFUSED (false, counted) instead of pretending. Only files this module names are ever
 *    touched.
 *
 * Only documented fields are written: no prompt, no model text, no key, no address.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_NAMES, FEATURE_VERSION, INTERVALS } from "../intel/features/types";
import { HORIZONS, type DecisionRecord, type Label, type Snapshot, type ZoneRef } from "./types";

export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
/** The exact size of the folder is read again every this many writes, so a change made from outside is noticed. */
const RECOUNT_EVERY = 50;
const SNAP = /^snapshots-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const LAB = /^labels-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const DEC = /^decisions-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const LEGACY_DECISIONS = "decisions.jsonl";
/** The legacy file sorts before every real day. */
const LEGACY_DAY = "0000-00-00";

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

/**
 * The vector of a snapshot must be the one the producer makes: every name of the list and no other, a number or a null for each, a
 * reason for every null and a null for every reason, ages that are not negative (a negative age is a block from the future), and the
 * same instrument and instant as the snapshot that carries it. Nothing is completed: what is missing makes the line damaged.
 *
 * The one thing that may sit in `nulos` without being a name is the producer's freshness reason for the bars of an interval
 * (`bars<interval>`, the stale data gate of the verdict): `velas_velhas` when the last closed bar is too old, and then the vector keeps
 * its age; `sem_velas` when there was no closed bar, and then there is no age. Any other key, code or pairing is a damaged line.
 */
function parseVector(f: unknown, instId: string, asOfMs: number): Snapshot["features"] | null {
  if (!isRec(f) || f.v !== FEATURE_VERSION || f.instId !== instId || f.asOfMs !== asOfMs || !isRec(f.values) || !isRec(f.nulos) || !isRec(f.idades)) return null;
  const names = Object.keys(f.values);
  if (names.length !== FEATURE_NAMES.length || !FEATURE_NAMES.every((n) => n in (f.values as object))) return null;
  for (const name of FEATURE_NAMES) {
    const value = f.values[name];
    if (!numOrNull(value)) return null;
    const reason = f.nulos[name];
    if (value === null ? typeof reason !== "string" || reason.length === 0 : reason !== undefined) return null;
  }
  for (const [key, reason] of Object.entries(f.nulos)) {
    if (key in (f.values as object)) continue;
    if (!INTERVALS.some((i) => `bars${i}` === key) || (reason !== "velas_velhas" && reason !== "sem_velas")) return null;
    if ((reason === "velas_velhas") !== (key in (f.idades as object))) return null;
  }
  for (const value of Object.values(f.idades)) if (!num(value) || value < 0) return null;
  return { v: FEATURE_VERSION, instId, asOfMs, values: f.values as Record<string, number | null>, nulos: f.nulos as Record<string, string>, idades: f.idades as Record<string, number> };
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
  const features = parseVector(raw.features, raw.instId, raw.asOfMs);
  if (features === null) return null;
  return {
    id: raw.id,
    asOfMs: raw.asOfMs,
    instId: raw.instId,
    market: raw.market,
    price: raw.price,
    costRoundTripBps: raw.costRoundTripBps,
    atr15m: raw.atr15m,
    zones: { demanda, oferta, ...(todas === undefined ? {} : { todas }) },
    features,
    origem: raw.origem,
  };
}

const BARRIERS: readonly unknown[] = ["alvo", "parada", "tempo", null];
const BASES: readonly unknown[] = ["zona", "atr", null];
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
  for (const key of ["baseDaParadaLong", "baseDaParadaShort"] as const) if (raw[key] !== undefined && !BASES.includes(raw[key])) return null;
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
  /** Every decision, oldest day first (the legacy file before them). */
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
  /** The size of the folder as far as this module knows it: exact after a count, and growing by what it writes in between. */
  let known: number | null = null;

  const files = (pattern: RegExp, sinceMs?: number): string[] => {
    const floor = sinceMs === undefined ? null : day(sinceMs);
    try {
      return readdirSync(options.dir).filter((f) => pattern.test(f) && (floor === null || pattern.exec(f)![1]! >= floor)).sort();
    } catch {
      return [];
    }
  };
  const legacy = (): string[] => (existsSync(join(options.dir, LEGACY_DECISIONS)) ? [LEGACY_DECISIONS] : []);
  const decisionFiles = (): string[] => [...legacy(), ...files(DEC)];
  const dayOf = (name: string): string => (name === LEGACY_DECISIONS ? LEGACY_DAY : (SNAP.exec(name) ?? LAB.exec(name) ?? DEC.exec(name))![1]!);
  const ownFiles = (): string[] => [...files(SNAP), ...files(LAB), ...decisionFiles()];
  const sizeOf = (name: string): number => {
    try {
      return statSync(join(options.dir, name)).size;
    } catch {
      return 0;
    }
  };
  const count = (): number => ownFiles().reduce((sum, f) => sum + sizeOf(f), 0);

  /**
   * Makes room for a line of `incoming` bytes: removes the oldest days, of every kind together, until the folder is under 90% of the
   * cap and the line fits under it. The files of the current day and anything newer are never removed, and neither is a file this
   * module does not own.
   */
  function makeRoom(incoming: number): number {
    const target = Math.min(max * 0.9, max - incoming);
    let total = count();
    if (total <= target) return total;
    const today = day(now());
    const old = ownFiles().filter((f) => dayOf(f) < today).sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || a.localeCompare(b));
    for (const name of old) {
      if (total <= target) break;
      try {
        const size = sizeOf(name);
        unlinkSync(join(options.dir, name));
        total -= size;
      } catch {
        // a file that cannot be removed stays; the next write tries again
      }
    }
    return count();
  }

  function append(name: string, value: unknown): boolean {
    try {
      const line = `${JSON.stringify(value)}\n`;
      const size = Buffer.byteLength(line);
      mkdirSync(options.dir, { recursive: true });
      if (known === null || appends % RECOUNT_EVERY === 0) known = count();
      if (known + size > max) {
        known = makeRoom(size);
        if (known + size > max) throw new Error("over the cap");
      }
      appendFileSync(join(options.dir, name), line);
      known += size;
      appends += 1;
      lastAppendMs = now();
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
    appendDecision: (d) => append(`decisions-${day(now())}.jsonl`, d),
    snapshots: (sinceMs) => read(files(SNAP, sinceMs), parseSnapshot),
    labels: (sinceMs) => read(files(LAB, sinceMs), parseLabel),
    decisions: () => read(decisionFiles(), parseDecision),
    doneKeys: (sinceMs) => new Set(read(files(LAB, sinceMs), parseLabel).filter((l) => l.completo || l.motivoIncompleto !== "horizonte_alem_dos_dados").map((l) => `${l.snapshotId}|${l.horizonte}`)),
    stats() {
      corrupt = 0;
      const snapshots = readAll(files(SNAP), parseSnapshot).length;
      const labels = readAll(files(LAB), parseLabel).length;
      const decisions = readAll(decisionFiles(), parseDecision).length;
      return { snapshots, labels, decisions, corruptLines: corrupt, writeErrors, bytes: count(), lastAppendMs };
    },
  };
}
