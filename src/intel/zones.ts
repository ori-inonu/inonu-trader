/**
 * Dynamic zones of interest by confluence (T6.1, SMT-1, SMT-2, SMT-5). Our own operational definition, see
 * flow-engine.md 3.
 *
 * Independent families of evidence (E1 structure, E2 footprint, E3 profile, E4 book, E5 anchored VWAP, E6 smart money
 * cost) each propose a price range with a strength from 0 to 1. Proposals that overlap, or sit within a quarter of the ATR
 * of each other, fuse into one zone. The score is the weighted share of the enabled families that back the zone, it
 * decays by age with a half-life, and the zone moves through states as the price meets it.
 *
 * A zone DESCRIBES demand or supply. Nothing here says what to do: the model, when the user asks, chooses among candidate
 * ids (ASK-4), and the code never turns a zone's side into an order. The weights are priors, not a claim of performance:
 * their validation is T6.6.
 *
 * Pure: no clock, no network, no disk. The bar arrives as a parameter and the previous zones are carried by the caller.
 */
import { createHash } from "node:crypto";

export type Family = "E1" | "E2" | "E3" | "E4" | "E5" | "E6";
export const FAMILIES: readonly Family[] = ["E1", "E2", "E3", "E4", "E5", "E6"];

/** Priors, configurable and recorded in the journal. They do not claim any performance. */
export const DEFAULT_WEIGHTS: Readonly<Record<Family, number>> = { E1: 1.0, E2: 1.0, E3: 0.8, E4: 0.6, E5: 0.5, E6: 1.2 };

export type ZoneSide = "demanda" | "oferta" | "neutra";
export type ZoneState = "ativa" | "testada" | "mitigada" | "expirada" | "fraca";

export interface Proposal {
  readonly family: Family;
  readonly baixo: number;
  readonly alto: number;
  readonly lado: "demanda" | "oferta";
  /** 0 to 1. */
  readonly forca: number;
  readonly ts: number;
}

/** A CLOSED bar of the zones' interval. */
export interface ZoneBar {
  readonly ts: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface ZoneParams {
  /** The families that exist for this asset (E6 only on-chain). The score is relative to them. */
  readonly enabled: readonly Family[];
  readonly atr14: number;
  readonly intervalMs: number;
  readonly weights?: Partial<Record<Family, number>>;
  /** Half-life of the score, in bars. Default 50. */
  readonly meiaVida?: number;
  /** Smallest score of a zone. Default 15. */
  readonly minNota?: number;
  /** Oldest age of a zone, in bars. Default 500. */
  readonly idadeMax?: number;
  /** Proposals closer than this share of the ATR fuse. Default a quarter. */
  readonly mergeAtr?: number;
  /** Distance of the invalidation level beyond the opposite limit, in ATR. Default a tenth. */
  readonly invalidAtr?: number;
  /** Families that must back a zone for it to be active. Default 2. */
  readonly minFamilias?: number;
  /** Smallest strength that counts as backing. Default 0.2. */
  readonly minForca?: number;
  readonly maxVisible?: number;
  /** Derivatives regime (E7): scales every strength, clamped to 0.8 to 1.2. Default 1 (no data). */
  readonly regimeModifier?: number;
  /** False when this bar was already judged by an earlier update: the score and the age still move, the price does not test or mitigate. Default true. */
  readonly judgePrice?: boolean;
}

export interface Zone {
  readonly id: string;
  readonly lado: ZoneSide;
  readonly baixo: number;
  readonly alto: number;
  /** Score after the decay by age. */
  readonly nota: number;
  /** Score before the decay. */
  readonly notaBruta: number;
  /** The families backing the zone (strength at least minForca), in family order. */
  readonly fatores: Family[];
  /** The strongest proposal of each family, after the regime modifier. */
  readonly forcas: Partial<Record<Family, number>>;
  readonly primeiroTs: number;
  readonly idadeBarras: number;
  readonly estado: ZoneState;
  /** Level beyond which the zone no longer holds: the opposite limit plus 0.1 ATR. Null for a neutral zone. */
  readonly invalidacao: number | null;
  /** The price has already entered the zone without closing beyond its opposite limit. */
  readonly testada: boolean;
}

export interface ZoneUpdate {
  /** Every zone evaluated on this bar, including the ones that just ended. Ascending by lower limit. */
  readonly zones: Zone[];
  /** Up to maxVisible active or tested zones, the closest to the price first: what may be shown and offered. */
  readonly visible: Zone[];
  /** What to carry to the next bar: the zones that did not end. */
  readonly next: Zone[];
  readonly familiasHabilitadas: Family[];
  /** The weights used, so the journal records them. */
  readonly pesos: Record<Family, number>;
}

const REGIME_MIN = 0.8;
const REGIME_MAX = 1.2;

const positive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number`);
  return value;
};

function identity(lado: ZoneSide, baixo: number, alto: number, primeiroTs: number): string {
  return createHash("sha256").update(`${lado}|${baixo}|${alto}|${primeiroTs}`).digest("hex").slice(0, 12);
}

interface Cluster {
  baixo: number;
  alto: number;
  items: Proposal[];
}

export function updateZones(input: { readonly prev: readonly Zone[]; readonly proposals: readonly Proposal[]; readonly bar: ZoneBar; readonly params: ZoneParams }): ZoneUpdate {
  const { prev, bar, params } = input;
  const atr = positive(params.atr14, "atr14");
  const intervalMs = positive(params.intervalMs, "intervalMs");
  const halfLife = positive(params.meiaVida ?? 50, "meiaVida");
  const minNota = params.minNota ?? 15;
  const maxAge = positive(params.idadeMax ?? 500, "idadeMax");
  const tolerance = (params.mergeAtr ?? 0.25) * atr;
  const invalidation = (params.invalidAtr ?? 0.1) * atr;
  const minFamilies = params.minFamilias ?? 2;
  const minStrength = params.minForca ?? 0.2;
  const maxVisible = params.maxVisible ?? 6;
  const modifier = Math.min(REGIME_MAX, Math.max(REGIME_MIN, params.regimeModifier ?? 1));
  const judge = params.judgePrice ?? true;

  if (params.enabled.length === 0) throw new RangeError("at least one family must be enabled");
  const weights = { ...DEFAULT_WEIGHTS, ...params.weights } as Record<Family, number>;
  for (const family of FAMILIES) positive(weights[family], `weight of ${family}`);
  const enabled = FAMILIES.filter((family) => params.enabled.includes(family));
  const denominator = enabled.reduce((sum, family) => sum + weights[family], 0);

  for (const p of input.proposals) {
    if (!(p.baixo <= p.alto) || !Number.isFinite(p.baixo) || !Number.isFinite(p.alto)) throw new RangeError("a proposal needs baixo <= alto");
    if (!(p.forca >= 0 && p.forca <= 1)) throw new RangeError("forca is from 0 to 1");
  }

  // 1. fuse the proposals of the enabled families into clusters
  const usable = input.proposals
    .filter((p) => enabled.includes(p.family))
    .map((p) => ({ ...p, forca: Math.min(1, p.forca * modifier) }))
    .sort((a, b) => a.baixo - b.baixo || a.alto - b.alto || a.family.localeCompare(b.family));
  const clusters: Cluster[] = [];
  for (const p of usable) {
    const last = clusters[clusters.length - 1];
    if (last !== undefined && p.baixo <= last.alto + tolerance) {
      last.alto = Math.max(last.alto, p.alto);
      last.items.push(p);
    } else {
      clusters.push({ baixo: p.baixo, alto: p.alto, items: [p] });
    }
  }

  // 2. match each cluster to an existing zone (the zone keeps its identity while it lives)
  const unmatched = new Map(prev.map((zone) => [zone.id, zone]));
  const overlap = (zone: Zone, cluster: Cluster) => Math.min(zone.alto, cluster.alto) - Math.max(zone.baixo, cluster.baixo);
  const matchOf = (cluster: Cluster): Zone | undefined => {
    const candidates = [...unmatched.values()].filter((zone) => zone.baixo <= cluster.alto + tolerance && zone.alto >= cluster.baixo - tolerance);
    candidates.sort((a, b) => overlap(b, cluster) - overlap(a, cluster) || Math.abs((a.baixo + a.alto) / 2 - (cluster.baixo + cluster.alto) / 2) - Math.abs((b.baixo + b.alto) / 2 - (cluster.baixo + cluster.alto) / 2) || a.id.localeCompare(b.id));
    return candidates[0];
  };

  const evaluated: Zone[] = [];
  for (const cluster of clusters) {
    const existing = matchOf(cluster);
    if (existing) unmatched.delete(existing.id);

    const forcas: Partial<Record<Family, number>> = {};
    for (const p of cluster.items) forcas[p.family] = Math.max(forcas[p.family] ?? 0, p.forca);
    const weighted = enabled.reduce((sum, family) => sum + weights[family] * (forcas[family] ?? 0), 0);
    const notaBruta = (100 * weighted) / denominator;

    let demanda = 0;
    let oferta = 0;
    for (const p of cluster.items) (p.lado === "demanda" ? (demanda += weights[p.family] * p.forca) : (oferta += weights[p.family] * p.forca));
    const lado: ZoneSide = demanda > oferta ? "demanda" : oferta > demanda ? "oferta" : "neutra";

    const primeiroTs = existing?.primeiroTs ?? bar.ts;
    const idadeBarras = Math.max(0, Math.floor((bar.ts - primeiroTs) / intervalMs));
    const nota = notaBruta * 0.5 ** (idadeBarras / halfLife);
    if (existing === undefined && nota < minNota) continue; // a new proposal under the floor is not a zone

    const fatores = enabled.filter((family) => (forcas[family] ?? 0) >= minStrength);
    const backed = nota >= minNota && fatores.length >= minFamilies;
    const id = existing?.id ?? identity(lado, cluster.baixo, cluster.alto, primeiroTs);
    evaluated.push(settle({ id, lado, baixo: cluster.baixo, alto: cluster.alto, nota, notaBruta, fatores, forcas, primeiroTs, idadeBarras, backed, existing, bar, minNota, maxAge, invalidation, judge }));
  }

  // 3. a zone whose evidence is gone scores zero: it ends
  for (const zone of unmatched.values()) {
    const idadeBarras = Math.max(0, Math.floor((bar.ts - zone.primeiroTs) / intervalMs));
    evaluated.push({ ...zone, nota: 0, notaBruta: 0, fatores: [], forcas: {}, idadeBarras, estado: "expirada" });
  }

  evaluated.sort((a, b) => a.baixo - b.baixo || a.id.localeCompare(b.id));
  const distance = (zone: Zone) => (bar.close < zone.baixo ? zone.baixo - bar.close : bar.close > zone.alto ? bar.close - zone.alto : 0);
  const visible = evaluated
    .filter((zone) => zone.estado === "ativa" || zone.estado === "testada")
    .sort((a, b) => distance(a) - distance(b) || b.nota - a.nota || a.id.localeCompare(b.id))
    .slice(0, maxVisible);
  const next = evaluated.filter((zone) => zone.estado === "ativa" || zone.estado === "testada" || zone.estado === "fraca");
  return { zones: evaluated, visible, next, familiasHabilitadas: [...enabled], pesos: weights };
}

interface Settle {
  readonly id: string;
  readonly lado: ZoneSide;
  readonly baixo: number;
  readonly alto: number;
  readonly nota: number;
  readonly notaBruta: number;
  readonly fatores: Family[];
  readonly forcas: Partial<Record<Family, number>>;
  readonly primeiroTs: number;
  readonly idadeBarras: number;
  readonly backed: boolean;
  readonly existing: Zone | undefined;
  readonly bar: ZoneBar;
  readonly minNota: number;
  readonly maxAge: number;
  readonly invalidation: number;
  readonly judge: boolean;
}

/** The state of a zone on this bar, by precedence: expired, mitigated, tested, active, weak. */
function settle(s: Settle): Zone {
  const invalidacao = s.lado === "demanda" ? s.baixo - s.invalidation : s.lado === "oferta" ? s.alto + s.invalidation : null;
  const base = { id: s.id, lado: s.lado, baixo: s.baixo, alto: s.alto, nota: s.nota, notaBruta: s.notaBruta, fatores: s.fatores, forcas: s.forcas, primeiroTs: s.primeiroTs, idadeBarras: s.idadeBarras, invalidacao };
  const weakOrActive: ZoneState = s.backed ? "ativa" : "fraca";
  // a new zone is not judged against the bar that created it; the price meets it from the next bar on
  if (s.existing === undefined) return { ...base, estado: weakOrActive, testada: false };
  if (s.nota < s.minNota || s.idadeBarras > s.maxAge) return { ...base, estado: "expirada", testada: s.existing.testada };
  if (!s.judge) return { ...base, estado: s.existing.testada ? "testada" : weakOrActive, testada: s.existing.testada };
  const beyond = s.lado === "demanda" ? s.bar.close < s.baixo : s.lado === "oferta" ? s.bar.close > s.alto : false;
  if (beyond) return { ...base, estado: "mitigada", testada: s.existing.testada };
  const entered = s.bar.low <= s.alto && s.bar.high >= s.baixo;
  const testada = s.existing.testada || entered;
  return { ...base, estado: testada ? "testada" : weakOrActive, testada };
}
