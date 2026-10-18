/**
 * Strict readers for what the core sends about the Veredito, the Placar and the profile. The contract is closed: a key that is
 * not documented, a number that is not finite, a word outside the vocabulary or a text that is too long makes the whole value
 * null, and the screen then falls back to what it showed before. Nothing outside the shape is ever rendered.
 */
import { GATES, type Confianca, type GateId, type Perfil, type Plano, type Selo, type TargetKind, type Veredito } from "./types";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);
const MAX_TEXT = 240;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_TEXT;
const exact = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).length === keys.length && keys.every((k) => k in o);

const SELOS: readonly string[] = ["comprar", "vender", "esperar"];
const CONFIANCAS: readonly string[] = ["baixa", "media", "alta"];
const TARGETS: readonly string[] = ["zona_oposta", "piscina", "perfil", "multiplo"];
const PLAN_KEYS = ["lado", "entradaBaixo", "entradaAlto", "entradaReferencia", "distanciaAteEntradaBps", "invalidacao", "alvo", "alvoTipo", "riscoBps", "alvoBps", "custoBps", "ganhoRiscoLiquido", "tamanho"] as const;
const VERDICT_KEYS = ["selo", "confianca", "forcadoPor", "mensagem", "motivos", "risco", "plano", "notaZona", "avisos", "consultivo"] as const;

export function parsePlano(raw: unknown): Plano | null {
  if (!isRec(raw) || !exact(raw, PLAN_KEYS)) return null;
  if (raw.lado !== "compra" && raw.lado !== "venda") return null;
  for (const k of ["entradaBaixo", "entradaAlto", "entradaReferencia", "distanciaAteEntradaBps", "invalidacao", "alvo", "riscoBps", "alvoBps", "custoBps"] as const) if (!num(raw[k])) return null;
  if (typeof raw.alvoTipo !== "string" || !TARGETS.includes(raw.alvoTipo) || !numOrNull(raw.ganhoRiscoLiquido)) return null;
  let tamanho: Plano["tamanho"] = null;
  if (raw.tamanho !== null) {
    const t = raw.tamanho;
    if (!isRec(t) || !exact(t, ["riscoUsd", "notionalUsd", "quantidadeBase", "limitadoPeloCapital"]) || !num(t.riscoUsd) || !num(t.notionalUsd) || !num(t.quantidadeBase) || typeof t.limitadoPeloCapital !== "boolean") return null;
    tamanho = { riscoUsd: t.riscoUsd, notionalUsd: t.notionalUsd, quantidadeBase: t.quantidadeBase, limitadoPeloCapital: t.limitadoPeloCapital };
  }
  return {
    lado: raw.lado,
    entradaBaixo: raw.entradaBaixo as number,
    entradaAlto: raw.entradaAlto as number,
    entradaReferencia: raw.entradaReferencia as number,
    distanciaAteEntradaBps: raw.distanciaAteEntradaBps as number,
    invalidacao: raw.invalidacao as number,
    alvo: raw.alvo as number,
    alvoTipo: raw.alvoTipo as TargetKind,
    riscoBps: raw.riscoBps as number,
    alvoBps: raw.alvoBps as number,
    custoBps: raw.custoBps as number,
    ganhoRiscoLiquido: raw.ganhoRiscoLiquido as number | null,
    tamanho,
  };
}

export function parseVeredito(raw: unknown): Veredito | null {
  if (!isRec(raw) || !exact(raw, VERDICT_KEYS)) return null;
  if (typeof raw.selo !== "string" || !SELOS.includes(raw.selo)) return null;
  if (raw.confianca !== null && (typeof raw.confianca !== "string" || !CONFIANCAS.includes(raw.confianca))) return null;
  if (raw.forcadoPor !== null && (typeof raw.forcadoPor !== "string" || !(GATES as readonly string[]).includes(raw.forcadoPor))) return null;
  if (!text(raw.mensagem) || !text(raw.consultivo)) return null;
  if (!Array.isArray(raw.motivos) || raw.motivos.length > 3 || !raw.motivos.every(text)) return null;
  if (!Array.isArray(raw.avisos) || raw.avisos.length > 8 || !raw.avisos.every(text)) return null;
  if (raw.risco !== null && !text(raw.risco)) return null;
  if (!numOrNull(raw.notaZona)) return null;
  const plano = raw.plano === null ? null : parsePlano(raw.plano);
  if (raw.plano !== null && plano === null) return null;
  // the seal and the gate must agree: only "esperar" can be forced
  if (raw.forcadoPor !== null && raw.selo !== "esperar") return null;
  return {
    selo: raw.selo as Selo,
    confianca: raw.confianca as Confianca | null,
    forcadoPor: raw.forcadoPor as GateId | null,
    mensagem: raw.mensagem as string,
    motivos: raw.motivos as string[],
    risco: raw.risco as string | null,
    plano,
    notaZona: raw.notaZona as number | null,
    avisos: raw.avisos as string[],
    consultivo: raw.consultivo as string,
  };
}

export function parsePerfil(raw: unknown): Perfil | null {
  if (!isRec(raw) || !exact(raw, ["capitalUsd", "riskPct"]) || !numOrNull(raw.capitalUsd) || !numOrNull(raw.riskPct)) return null;
  if ((raw.capitalUsd === null) !== (raw.riskPct === null)) return null;
  return { capitalUsd: raw.capitalUsd as number | null, riskPct: raw.riskPct as number | null };
}

export interface Placar {
  readonly estado: "nao_medido" | "medido";
  readonly texto: string;
  readonly medidas: number;
  readonly minimo: number;
}

/** The Placar of `/inonu/placar`: the state, the sentence the core composed, and how far the count is from the minimum. */
export function parsePlacar(raw: unknown): Placar | null {
  if (!isRec(raw) || raw.ok !== true || !isRec(raw.placar)) return null;
  const p = raw.placar;
  if ((p.estado !== "nao_medido" && p.estado !== "medido") || !text(p.texto) || !num(p.minimo) || !isRec(p.decisoes) || !num(p.decisoes.medidas)) return null;
  return { estado: p.estado, texto: p.texto as string, medidas: p.decisoes.medidas, minimo: p.minimo };
}

export interface Gravador {
  readonly ligado: boolean;
  readonly fotos: number;
  readonly resultados: number;
  readonly respostas: number;
  readonly falhasDeGravacao: number;
  readonly bytes: number;
}

export interface Medicao {
  readonly placar: Placar;
  /** Null when the core did not say how the recorder is. */
  readonly gravador: Gravador | null;
}

const count = (v: unknown): v is number => num(v) && v >= 0;

/** The Placar and the health of the recorder, as `/inonu/placar` sends them. A recorder block that is not readable is left out, not guessed. */
export function parseMedicao(raw: unknown): Medicao | null {
  const placar = parsePlacar(raw);
  if (placar === null || !isRec(raw)) return null;
  const g = raw.gravador;
  const gravador =
    isRec(g) && typeof g.enabled === "boolean" && count(g.snapshots) && count(g.labels) && count(g.decisions) && count(g.writeErrors) && count(g.bytes)
      ? { ligado: g.enabled, fotos: g.snapshots, resultados: g.labels, respostas: g.decisions, falhasDeGravacao: g.writeErrors, bytes: g.bytes }
      : null;
  return { placar, gravador };
}
