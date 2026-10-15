/**
 * The Evidence Brief (T7.1, ASK-3, ING-2): the only thing the model is asked about. Compact, deterministic, hashed, with
 * the unknown written as null plus a reason, and no raw data. Our own format, see flow-engine.md 5.
 *
 *  - one object per instrument or token, at most 2 KB, keys sorted so the same content always gives the same bytes;
 *  - a SHA-256 over the canonical form without the hash field;
 *  - scores rounded to two decimals and distances to whole basis points of the current price;
 *  - when it does not fit, the cuts happen in a fixed order and each one is written in `nulos`: first the factors and the
 *    trail components, then the zones of the lowest score, then the regime. The ids of the candidates, the ages and the
 *    nulls are never cut; if they alone do not fit, that is an error, not a silent truncation.
 *
 * Pure: no clock, no network, no disk. The words of an order never appear: candidates are described, not recommended.
 */
import { createHash } from "node:crypto";

export const MAX_BRIEF_BYTES = 2048;
const NOTE_FACTORS = "descartado_por_tamanho";
const MATERIAL_SCORE_STEP = 10;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** An instrument, a token, or (the discovery mode) a whole network: the Brief is then about the candidates it lists, not about one target. */
export type BriefTarget =
  | { readonly instId: string }
  | { readonly chainIndex: string; readonly address: string }
  | { readonly chainIndex: string; readonly escopo: "descoberta" }
  /** The ranking of the rows chosen in the Rastreador (RAS-6): the Brief is about the instruments it lists, sorted so the order of the clicks does not matter. */
  | { readonly escopo: "ranking"; readonly instIds: readonly string[] }
  /** The ecosystem (RAS-8): the Brief is about the tokens of several networks that the code put forward, with the ceiling of what the balance allows for each. */
  | { readonly escopo: "ecossistema"; readonly chainIndexes: readonly string[] };

export interface BriefCandidate {
  readonly id: string;
  readonly tipo: "zona" | "token" | "spot" | "perp" | "manter";
  /** Lower and upper limit as basis points of the current price (negative: below). */
  readonly limitesBps?: readonly [number, number];
  readonly nota?: number;
  readonly fatores?: readonly string[];
  readonly idadeBarras?: number;
  readonly estado?: string;
  readonly invalidacaoBps?: number | null;
}

export interface BriefInput {
  readonly alvo: BriefTarget;
  readonly asOfMs: number;
  readonly familiasHabilitadas: readonly string[];
  /** Counts and levels, never ticks. */
  readonly fluxo: { readonly [key: string]: Json } | null;
  readonly candidatos: readonly BriefCandidate[];
  readonly trilha: { readonly nota: number | null; readonly componentes?: { readonly [key: string]: number | null }; readonly componentesAusentes: readonly string[] } | null;
  readonly risco: { readonly nivel: string | number | null; readonly flags: readonly string[] } | null;
  readonly regime: { readonly funding: number | null; readonly oiVar: number | null; readonly btcBeta: number | null } | null;
  /** Age in milliseconds of each field, so the model can discount stale data. */
  readonly idades: { readonly [field: string]: number };
  readonly origens: { readonly [field: string]: string };
  /** Why a field is null. */
  readonly nulos: { readonly [field: string]: string };
}

export interface Brief extends BriefInput {
  readonly schemaVersion: 1;
  readonly hash: string;
}

export class BriefTooLarge extends Error {
  constructor(readonly bytes: number, readonly maxBytes: number) {
    super(`the Brief needs ${bytes} bytes and the limit is ${maxBytes} even without its optional parts`);
  }
}

const TYPE_RANK: Readonly<Record<BriefCandidate["tipo"], number>> = { zona: 0, token: 1, spot: 2, perp: 3, manter: 4 };

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("a Brief number must be finite");
  return value;
}

const canonical = (value: unknown): string => JSON.stringify(sortKeys(value));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const roundBps = (n: number): number => Math.round(n) + 0;

function normalizeCandidate(candidate: BriefCandidate): BriefCandidate {
  return {
    ...candidate,
    ...(candidate.nota === undefined ? {} : { nota: round2(candidate.nota) }),
    ...(candidate.limitesBps === undefined ? {} : { limitesBps: [roundBps(candidate.limitesBps[0]), roundBps(candidate.limitesBps[1])] as const }),
    ...(candidate.invalidacaoBps === undefined || candidate.invalidacaoBps === null ? {} : { invalidacaoBps: roundBps(candidate.invalidacaoBps) }),
  };
}

const orderCandidates = (list: readonly BriefCandidate[]): BriefCandidate[] =>
  list.map(normalizeCandidate).sort((a, b) => TYPE_RANK[a.tipo] - TYPE_RANK[b.tipo] || (b.nota ?? -1) - (a.nota ?? -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

interface Working {
  schemaVersion: 1;
  alvo: BriefTarget;
  asOfMs: number;
  familiasHabilitadas: string[];
  fluxo: BriefInput["fluxo"];
  candidatos: BriefCandidate[];
  trilha: BriefInput["trilha"];
  risco: BriefInput["risco"];
  regime: BriefInput["regime"];
  idades: { [field: string]: number };
  origens: { [field: string]: string };
  nulos: { [field: string]: string };
}

function seal(working: Working): { brief: Brief; json: string; bytes: number } {
  const hash = createHash("sha256").update(canonical(working)).digest("hex");
  const brief = { ...working, hash } as Brief;
  const json = canonical(brief);
  return { brief, json, bytes: new TextEncoder().encode(json).length };
}

export function buildBrief(input: BriefInput, options: { readonly maxBytes?: number } = {}): { brief: Brief; json: string; bytes: number } {
  const maxBytes = options.maxBytes ?? MAX_BRIEF_BYTES;
  const working: Working = {
    schemaVersion: 1,
    alvo: input.alvo,
    asOfMs: input.asOfMs,
    familiasHabilitadas: [...input.familiasHabilitadas],
    fluxo: input.fluxo,
    candidatos: orderCandidates(input.candidatos),
    trilha: input.trilha === null ? null : { ...input.trilha, ...(input.trilha.nota === null ? {} : { nota: round2(input.trilha.nota) }) },
    risco: input.risco,
    regime: input.regime,
    idades: { ...input.idades },
    origens: { ...input.origens },
    nulos: { ...input.nulos },
  };

  let sealed = seal(working);
  const fits = () => sealed.bytes <= maxBytes;
  const resealed = () => (sealed = seal(working));

  // 1. the factors of the candidates and the components of the trail
  if (!fits()) {
    let cut = false;
    working.candidatos = working.candidatos.map((c) => {
      if (c.fatores === undefined) return c;
      cut = true;
      const { fatores: _omit, ...rest } = c;
      return rest;
    });
    if (working.trilha?.componentes !== undefined) {
      const { componentes: _omit, ...rest } = working.trilha;
      working.trilha = rest;
      cut = true;
    }
    if (cut) {
      working.nulos.fatores = NOTE_FACTORS;
      resealed();
    }
  }

  // 2. the zones of the lowest score, one at a time (ties: the larger id first, so the cut is deterministic)
  let droppedZones = 0;
  while (!fits()) {
    const zones = working.candidatos.filter((c) => c.tipo === "zona");
    if (zones.length === 0) break;
    const worst = zones.reduce((a, b) => ((b.nota ?? -1) < (a.nota ?? -1) || ((b.nota ?? -1) === (a.nota ?? -1) && b.id > a.id) ? b : a));
    working.candidatos = working.candidatos.filter((c) => c !== worst);
    droppedZones += 1;
    working.nulos.zonas = `descartadas_por_tamanho:${droppedZones}`;
    resealed();
  }

  // 3. the regime
  if (!fits() && working.regime !== null) {
    working.regime = null;
    working.nulos.regime = NOTE_FACTORS;
    resealed();
  }

  if (!fits()) throw new BriefTooLarge(sealed.bytes, maxBytes);
  return sealed;
}

// ---------------------------------------------------------------------------------------------------------------------
// Regenerate only on a material change

export interface Materiality {
  readonly changed: boolean;
  readonly reasons: string[];
}

/**
 * Whether `next` differs from `prev` in a way that is worth asking again (ING-2): a zone or candidate appearing, ending or
 * changing state, a score moving by 10 points or more, a run (Sequencial, Progressao, Exaustao) appearing or ending, or a
 * datum older than its time to live. Everything else, such as the delta ticking, is noise.
 */
export function materialChange(prev: Brief | null, next: Brief, ttlMs: { readonly [field: string]: number } = {}): Materiality {
  if (prev === null) return { changed: true, reasons: ["primeiro"] };
  const reasons: string[] = [];

  const before = new Map(prev.candidatos.map((c) => [c.id, c]));
  const after = new Map(next.candidatos.map((c) => [c.id, c]));
  for (const id of [...after.keys()].sort()) {
    const now = after.get(id)!;
    const was = before.get(id);
    if (was === undefined) {
      if (now.tipo !== "manter") reasons.push(`nova:${id}`);
      continue;
    }
    if (was.estado !== now.estado) reasons.push(`estado:${id}`);
    if (was.nota !== undefined && now.nota !== undefined && round2(Math.abs(now.nota - was.nota)) >= MATERIAL_SCORE_STEP) reasons.push(`nota:${id}`);
  }
  for (const id of [...before.keys()].sort()) if (!after.has(id) && before.get(id)!.tipo !== "manter") reasons.push(`fim:${id}`);

  for (const run of ["seq", "prg", "exh"] as const) {
    if (canonical(prev.fluxo?.[run] ?? null) !== canonical(next.fluxo?.[run] ?? null)) reasons.push(`fluxo.${run}`);
  }
  for (const field of Object.keys(ttlMs).sort()) {
    const age = next.idades[field];
    if (age !== undefined && age > ttlMs[field]!) reasons.push(`idade:${field}`);
  }
  return { changed: reasons.length > 0, reasons };
}
