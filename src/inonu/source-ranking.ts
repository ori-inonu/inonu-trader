/**
 * The data source of the ranking mode of "Pedir ao Inonu" (RAS-6): the two to five rows the person chose in the Rastreador, asked
 * together. It runs only when a person clicks, and it makes ONE Brief for the whole click:
 *
 *  1. each chosen instrument is read through the same source the single-instrument mode uses (`ativo`), one after the other, so the
 *     ranking sees exactly what a click on that instrument would have shown the model;
 *  2. each readable instrument becomes one candidate of the Brief (`spot:` or `perp:`), carrying the score of its best zone, the
 *     families that built its zones and how many zones it has; the flow is a few numbers per instrument, never a tick: the trades
 *     counted, the imbalance counts and the share of the delta in the volume of the window (the delta itself is in lots of each
 *     instrument and cannot be compared across them);
 *  3. holding is the last candidate. The model chooses among those ids; the code never turns a score into an order.
 *
 * An instrument that cannot be read is out of the Brief with the constant code of the refusal as a note, never a zero. With fewer than
 * two readable instruments there is nothing to rank and the click is refused before the model is asked, so it costs nothing. Public
 * exchange reads only: no OnchainOS call is made, so `onchainosCalls` is zero. Nothing here calls the model.
 */
import { BriefTooLarge, buildBrief, type BriefCandidate, type Json } from "../intel/brief";
import { HOLD_CANDIDATE } from "../intel/candidates";
import { SourceError } from "./source-error";
import { RANKING_MAX, RANKING_MIN, type AskRequest, type BriefSource, type BuiltBrief } from "./ask";

export interface RankingDeps {
  /** The single-instrument source: every chosen row is read through it, in the mode `ativo`. */
  readonly okx: BriefSource;
  readonly now: () => number;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Six significant digits keep the Brief small without flattening a small delta. */
const six = (v: number): number => Number(v.toPrecision(6));
const MAX_FACTORS = 4;

interface Row {
  readonly instId: string;
  readonly candidate: BriefCandidate;
  readonly flow: Json;
  readonly ageMs: number | null;
  readonly origin: string | null;
  readonly families: readonly string[];
  readonly notes: Record<string, string>;
}

function flowOf(fluxo: unknown): Json {
  const flow = rec(fluxo);
  const window = rec(flow?.janela);
  const imbalance = rec(flow?.imb);
  const c = num(imbalance?.c);
  const v = num(imbalance?.v);
  const share = num(flow?.deltaRazao);
  return { negocios: num(window?.negocios), deltaRazao: share === null ? null : six(share), imb: c === null || v === null ? null : { c, v } };
}

function rowOf(instId: string, built: BuiltBrief): Row | null {
  const instrument = built.candidates.find((c) => c.tipo === "spot" || c.tipo === "perp");
  if (instrument === undefined) return null;
  const zones = built.candidates.filter((c) => c.tipo === "zona");
  const notas = zones.flatMap((z) => (z.nota === undefined ? [] : [z.nota]));
  const factors = [...new Set(zones.flatMap((z) => z.fatores ?? []))].sort().slice(0, MAX_FACTORS);
  const candidate: BriefCandidate = {
    id: instrument.id,
    tipo: instrument.tipo,
    ...(notas.length === 0 ? {} : { nota: Math.max(...notas) }),
    ...(factors.length === 0 ? {} : { fatores: factors }),
    estado: zones.length === 0 ? "sem_zonas" : `zonas:${zones.length}`,
  };
  const { brief } = built;
  const notes: Record<string, string> = {};
  // why a measure of this row is missing (warming up, no trades, no zones): a gap is written as a gap, row by row
  for (const [field, name] of [["fluxo", "fluxo"], ["fluxo.imb", "imb"], ["zonas", "zonas"]] as const) {
    const why = brief.nulos[field];
    if (why !== undefined) notes[`${instId}.${name}`] = why;
  }
  const age = brief.idades.fluxo;
  return { instId, candidate, flow: flowOf(brief.fluxo), ageMs: typeof age === "number" ? age : null, origin: brief.origens.fluxo ?? null, families: brief.familiasHabilitadas, notes };
}

export function createRankingSource(deps: RankingDeps): BriefSource {
  return {
    async build(request: AskRequest, context): Promise<BuiltBrief> {
      if (request.modo !== "ranking") throw new SourceError("modo_nao_disponivel");
      const chosen = request.alvos;
      if (chosen === undefined || chosen.length < RANKING_MIN || chosen.length > RANKING_MAX) throw new SourceError("alvo_invalido");

      const rows: Row[] = [];
      const nulos: Record<string, string> = { trilha: "ativos da OKX: sem carteiras rastreadas", risco: "nao coletado nesta versao" };
      for (const { instId } of chosen) {
        if (context.signal.aborted) throw new SourceError("cancelado", 0);
        try {
          const built = await deps.okx.build({ modo: "ativo", alvo: { instId } }, context);
          const row = rowOf(instId, built);
          if (row === null) nulos[instId] = "sem_candidato_do_ativo";
          else rows.push(row);
        } catch (error) {
          // a cancel that landed during the read is a cancel; anything else is a note, and only a constant travels: a message may carry a value
          if (context.signal.aborted) throw new SourceError("cancelado", 0);
          nulos[instId] = error instanceof SourceError ? error.code : "leitura_falhou";
        }
      }
      if (rows.length < RANKING_MIN) throw new SourceError("sem_candidatos", 0);

      const itens: Record<string, Json> = {};
      const idades: Record<string, number> = {};
      const origens: Record<string, string> = { nota: "melhor_zona_do_ativo" };
      for (const row of rows) {
        itens[row.instId] = row.flow;
        if (row.ageMs !== null) idades[row.instId] = row.ageMs;
        if (row.origin !== null) origens[row.instId] = row.origin;
        Object.assign(nulos, row.notes);
      }
      try {
        const { brief } = buildBrief({
          // the rows that were read: one that could not be read is in the notes with its reason and nowhere else
          alvo: { escopo: "ranking", instIds: rows.map((r) => r.instId).sort() },
          asOfMs: deps.now(),
          familiasHabilitadas: [...new Set(rows.flatMap((r) => r.families))].sort(),
          fluxo: { itens },
          candidatos: [...rows.map((r) => r.candidate), HOLD_CANDIDATE],
          trilha: null,
          risco: null,
          regime: null,
          idades,
          origens,
          nulos,
        });
        return { brief, candidates: brief.candidatos, onchainosCalls: 0 };
      } catch (error) {
        if (error instanceof BriefTooLarge) throw new SourceError("brief_grande_demais", 0);
        throw error;
      }
    },
  };
}
