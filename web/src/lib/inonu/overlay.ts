/**
 * What the engine measured, as the chart draws it (T5.7, T6.4): `GET /inonu/engine?instId=` on the desk's own origin. Everything
 * is in PRICE space, so the browser needs no knowledge of ticks, bins or contracts. The parser is strict and bounded: a
 * malformed answer is nothing at all, and the lists are cut so a buggy server cannot make the chart draw thousands of boxes.
 * Reading it is free (it never touches the model), so it is polled; asking the model is a separate, explicit click.
 */
export interface OverlayLevel {
  readonly baixo: number;
  readonly alto: number;
  readonly c: number;
  readonly v: number;
  readonly imb: "c" | "v" | "cv" | null;
  readonly volume: "c" | "v" | "n" | null;
  readonly alerta: { readonly c: boolean; readonly v: boolean } | null;
}

export interface OverlayRun {
  readonly lado: "c" | "v";
  readonly baixo: number;
  readonly alto: number;
  readonly n: number;
}

export interface OverlayExhaustion {
  readonly extremo: "baixo" | "alto";
  readonly baixo: number;
  readonly alto: number;
  readonly n: number;
}

export interface OverlayZone {
  readonly id: string;
  readonly lado: "demanda" | "oferta" | "neutra";
  readonly baixo: number;
  readonly alto: number;
  readonly nota: number;
  readonly estado: "ativa" | "testada";
  readonly fatores: readonly string[];
  readonly idadeBarras: number;
  readonly invalidacao: number | null;
  readonly primeiroTs: number;
}

export interface Band {
  readonly baixo: number;
  readonly alto: number;
}

export interface ChartOverlay {
  readonly instId: string;
  readonly asOfMs: number;
  readonly fonte: "okx_ws_trades" | "okx_public_v5";
  readonly price: number | null;
  readonly atr14: number | null;
  readonly tickSz: string;
  readonly step: number;
  readonly binTicks: number;
  /** `restaurado`: how many of the closed minutes come from the memory of the previous run. */
  readonly aquecimento: { readonly fechadas: number; readonly necessarias: number; readonly pronto: boolean; readonly restaurado: number };
  /** One unit of `niveis` and `totais` in base currency, as a decimal text. Absent from a core older than this field. */
  readonly unidade?: string;
  /** The aggressed units of the whole window on each side (`niveis` may keep only the levels nearest the price). Absent from an older core. */
  readonly totais?: { readonly c: number; readonly v: number };
  readonly niveis: readonly OverlayLevel[];
  readonly corridas: { readonly sequencial: readonly OverlayRun[]; readonly progressao: readonly OverlayRun[]; readonly exaustao: readonly OverlayExhaustion[] };
  readonly perfil: { readonly poc: Band | null; readonly val: number | null; readonly vah: number | null; readonly hvn: readonly Band[]; readonly lvn: readonly Band[] };
  readonly absorcao: { readonly lado: "c" | "v"; readonly razaoVolume: number } | null;
  readonly zonas: readonly OverlayZone[];
}

const MAX_LEVELS = 200;
const MAX_ZONES = 12;
const MAX_RUNS = 12;
const MAX_BANDS = 20;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonNeg = (v: unknown): v is number => fin(v) && v >= 0;
const finOrNull = (v: unknown): number | null | undefined => (v === null ? null : fin(v) ? v : undefined);
const token = (v: unknown, max: number): string | null => (typeof v === "string" && /^[A-Za-z0-9_-]+$/.test(v) ? v.slice(0, max) : null);

function band(v: unknown): Band | null {
  if (!isRec(v) || !fin(v.baixo) || !fin(v.alto) || v.alto < v.baixo) return null;
  return { baixo: v.baixo, alto: v.alto };
}

function all<T>(raw: unknown, max: number, one: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const item of raw.slice(0, max)) {
    const parsed = one(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

export function parseOverlay(raw: unknown): ChartOverlay | null {
  if (!isRec(raw) || raw.ok !== true) return null;
  const instId = token(raw.instId, 60);
  if (instId === null || !fin(raw.asOfMs) || (raw.fonte !== "okx_ws_trades" && raw.fonte !== "okx_public_v5")) return null;
  const price = finOrNull(raw.price);
  const atr14 = finOrNull(raw.atr14);
  if (price === undefined || atr14 === undefined || typeof raw.tickSz !== "string" || !fin(raw.step) || raw.step <= 0 || !fin(raw.binTicks)) return null;
  const warm = raw.aquecimento;
  if (!isRec(warm) || !nonNeg(warm.fechadas) || !nonNeg(warm.necessarias) || typeof warm.pronto !== "boolean") return null;
  // an older core does not say; a present value must be a whole count
  if (warm.restaurado !== undefined && !nonNeg(warm.restaurado)) return null;

  // an older core says neither; a value that is present must be well formed
  let unidade: string | undefined;
  if (raw.unidade !== undefined) {
    if (typeof raw.unidade !== "string" || !/^[0-9]+(\.[0-9]+)?$/.test(raw.unidade) || !(Number(raw.unidade) > 0)) return null;
    unidade = raw.unidade;
  }
  let totais: { c: number; v: number } | undefined;
  if (raw.totais !== undefined) {
    const t = raw.totais;
    if (!isRec(t) || !nonNeg(t.c) || !nonNeg(t.v)) return null;
    totais = { c: t.c, v: t.v };
  }

  const niveis = all(raw.niveis, MAX_LEVELS, (v): OverlayLevel | null => {
    if (!isRec(v) || !fin(v.baixo) || !fin(v.alto) || v.alto <= v.baixo || !nonNeg(v.c) || !nonNeg(v.v)) return null;
    if (v.imb !== null && v.imb !== "c" && v.imb !== "v" && v.imb !== "cv") return null;
    if (v.volume !== null && v.volume !== "c" && v.volume !== "v" && v.volume !== "n") return null;
    const alerta = isRec(v.alerta) && typeof v.alerta.c === "boolean" && typeof v.alerta.v === "boolean" ? { c: v.alerta.c, v: v.alerta.v } : null;
    if (v.alerta !== null && alerta === null) return null;
    return { baixo: v.baixo, alto: v.alto, c: v.c, v: v.v, imb: v.imb, volume: v.volume, alerta };
  });
  if (niveis === null) return null;

  const corr = raw.corridas;
  if (!isRec(corr)) return null;
  const run = (v: unknown): OverlayRun | null => {
    const b = band(v);
    if (b === null || !isRec(v) || (v.lado !== "c" && v.lado !== "v") || !nonNeg(v.n)) return null;
    return { lado: v.lado, ...b, n: v.n };
  };
  const exh = (v: unknown): OverlayExhaustion | null => {
    const b = band(v);
    if (b === null || !isRec(v) || (v.extremo !== "baixo" && v.extremo !== "alto") || !nonNeg(v.n)) return null;
    return { extremo: v.extremo, ...b, n: v.n };
  };
  const sequencial = all(corr.sequencial, MAX_RUNS, run);
  const progressao = all(corr.progressao, MAX_RUNS, run);
  const exaustao = all(corr.exaustao, MAX_RUNS, exh);
  if (sequencial === null || progressao === null || exaustao === null) return null;

  const per = raw.perfil;
  if (!isRec(per)) return null;
  const poc = per.poc === null ? null : band(per.poc);
  const val = finOrNull(per.val);
  const vah = finOrNull(per.vah);
  const hvn = all(per.hvn, MAX_BANDS, band);
  const lvn = all(per.lvn, MAX_BANDS, band);
  if ((per.poc !== null && poc === null) || val === undefined || vah === undefined || hvn === null || lvn === null) return null;

  let absorcao: ChartOverlay["absorcao"] = null;
  if (raw.absorcao !== null) {
    const a = raw.absorcao;
    if (!isRec(a) || (a.lado !== "c" && a.lado !== "v") || !fin(a.razaoVolume)) return null;
    absorcao = { lado: a.lado, razaoVolume: a.razaoVolume };
  }

  const zonas = all(raw.zonas, MAX_ZONES, (v): OverlayZone | null => {
    const b = band(v);
    if (b === null || !isRec(v)) return null;
    const id = token(v.id, 24);
    if (id === null || (v.lado !== "demanda" && v.lado !== "oferta" && v.lado !== "neutra") || (v.estado !== "ativa" && v.estado !== "testada")) return null;
    if (!fin(v.nota) || !nonNeg(v.idadeBarras) || !fin(v.primeiroTs) || !Array.isArray(v.fatores)) return null;
    const invalidacao = finOrNull(v.invalidacao);
    if (invalidacao === undefined) return null;
    const fatores = v.fatores.map((f) => token(f, 4)).filter((f): f is string => f !== null);
    return { id, lado: v.lado, ...b, nota: v.nota, estado: v.estado, fatores, idadeBarras: v.idadeBarras, invalidacao, primeiroTs: v.primeiroTs };
  });
  if (zonas === null) return null;

  return {
    instId,
    asOfMs: raw.asOfMs,
    fonte: raw.fonte,
    price,
    atr14,
    tickSz: raw.tickSz.slice(0, 20),
    step: raw.step,
    binTicks: raw.binTicks,
    aquecimento: { fechadas: warm.fechadas, necessarias: warm.necessarias, pronto: warm.pronto, restaurado: warm.restaurado ?? 0 },
    ...(unidade !== undefined ? { unidade } : {}),
    ...(totais !== undefined ? { totais } : {}),
    niveis,
    corridas: { sequencial, progressao, exaustao },
    perfil: { poc, val, vah, hvn, lvn },
    absorcao,
    zonas,
  };
}

export type OverlayOutcome = { readonly ok: true; readonly overlay: ChartOverlay } | { readonly ok: false; readonly reason: string };

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export function createOverlayClient(base: string = process.env.NEXT_PUBLIC_API_URL ?? "", fetchImpl: FetchLike = (url, init) => fetch(url, init)) {
  return {
    async fetch(instId: string, signal?: AbortSignal): Promise<OverlayOutcome> {
      if (!/^[A-Z0-9-]{3,60}$/.test(instId)) return { ok: false, reason: "alvo_invalido" };
      let res: Response;
      try {
        res = await fetchImpl(`${base}/inonu/engine?instId=${encodeURIComponent(instId)}`, signal ? { signal } : {});
      } catch {
        return { ok: false, reason: "sem_conexao" };
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // a non JSON page still has a status
      }
      const overlay = parseOverlay(body);
      if (overlay !== null) return { ok: true, overlay };
      if (isRec(body) && body.ok === false && typeof body.code === "string") return { ok: false, reason: body.code === "forbidden" ? "origem_negada" : (token(body.code, 40) ?? "resposta_invalida") };
      if (res.status === 404) return { ok: false, reason: "servidor_sem_rota" };
      if (res.status === 403) return { ok: false, reason: "origem_negada" };
      return { ok: false, reason: "resposta_invalida" };
    },
  };
}

export type OverlayClient = ReturnType<typeof createOverlayClient>;
