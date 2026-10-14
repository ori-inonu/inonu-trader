/**
 * The model of the Rastreador (RAS-2, RAS-3, RAS-4): a table of the exchange's own tradable pairs with filters, views and a
 * sort that work with no model call. The universe is what OKX publishes for free: USDT spot pairs and USDT perpetuals. A value
 * the exchange does not give is `null` and the screen shows a dash with the reason, never a made up number. The pressure of
 * the flow is a measured ratio of the aggressor sides with a descriptive word, never an instruction (FLX-10).
 *
 * Pure: no clock, no network, no storage. The screens that save and load things live in `screens.ts`.
 */
import type { DeskTicker } from "../desk/types";

export type Mercado = "spot" | "perp";

export interface RastreadorRow {
  /** The OKX instrument id, for example BTC-USDT or BTC-USDT-SWAP. */
  readonly id: string;
  readonly mercado: Mercado;
  readonly base: string;
  readonly preco: number | null;
  /** Change of the last price against the 24h open, in percent; null when the open is unknown. */
  readonly var24hPct: number | null;
  /** Volume of the day in USD. For a perpetual it is contracts times the size of a contract times the last price, hence `volAprox`. */
  readonly volUsd24h: number | null;
  readonly volAprox: boolean;
  /** Position by volume across the whole universe; null when the volume is unknown. */
  readonly rank: number | null;
  readonly tsMs: number;
}

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v);

function rowOf(t: DeskTicker, mercado: Mercado, contractSize: number | undefined): RastreadorRow {
  const suffix = mercado === "perp" ? "-USDT-SWAP" : "-USDT";
  const base = t.instId.slice(0, t.instId.length - suffix.length);
  const var24hPct = finite(t.open24h) && t.open24h > 0 ? ((t.last - t.open24h) / t.open24h) * 100 : null;
  let volUsd24h: number | null = null;
  let volAprox = false;
  if (mercado === "spot") {
    volUsd24h = finite(t.volQuote24h) ? t.volQuote24h : null;
  } else {
    // OKX gives a perpetual's volume in CONTRACTS: times the size of one contract and the last price is the USD volume the day
    // traded at about. Without the size of the contract the volume is unknown, never a guess.
    volUsd24h = finite(t.volBase24h) && contractSize !== undefined ? t.volBase24h * contractSize * t.last : null;
    volAprox = volUsd24h !== null;
  }
  return { id: t.instId, mercado, base, preco: Number.isFinite(t.last) ? t.last : null, var24hPct, volUsd24h, volAprox, rank: null, tsMs: t.tsMs };
}

/**
 * The universe from the two ticker lists; a list that did not arrive leaves the other one standing. `contractSizes` is the coin
 * per contract of each perpetual (see contracts.ts): without it a perpetual's volume is unknown.
 */
export function buildRows(spot: readonly DeskTicker[] | null, swap: readonly DeskTicker[] | null, contractSizes: ReadonlyMap<string, number> | null = null): RastreadorRow[] {
  const rows: RastreadorRow[] = [
    ...(spot ?? []).filter((t) => t.instId.endsWith("-USDT") && t.instId.split("-").length === 2).map((t) => rowOf(t, "spot", undefined)),
    ...(swap ?? []).filter((t) => t.instId.endsWith("-USDT-SWAP")).map((t) => rowOf(t, "perp", contractSizes?.get(t.instId))),
  ];
  const ranked = rows
    .filter((r) => r.volUsd24h !== null)
    .sort((a, b) => b.volUsd24h! - a.volUsd24h! || a.id.localeCompare(b.id));
  const position = new Map(ranked.map((r, i) => [r.id, i + 1]));
  return rows.map((r) => ({ ...r, rank: position.get(r.id) ?? null }));
}

// ---------------------------------------------------------------------------------------------- filters

export interface Filters {
  readonly mercado: "todos" | Mercado;
  readonly busca: string;
  readonly volUsdMin: number | null;
  readonly varMin: number | null;
  readonly varMax: number | null;
  readonly rankMax: number | null;
  readonly apenasFixados: boolean;
}

export const DEFAULT_FILTERS: Filters = { mercado: "todos", busca: "", volUsdMin: null, varMin: null, varMax: null, rankMax: null, apenasFixados: false };

const MAX_SEARCH = 24;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numberOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseFilters(raw: unknown): Filters {
  if (!isRec(raw)) return DEFAULT_FILTERS;
  const mercado = raw.mercado === "spot" || raw.mercado === "perp" || raw.mercado === "todos" ? raw.mercado : DEFAULT_FILTERS.mercado;
  const busca = typeof raw.busca === "string" ? raw.busca.replace(/[^A-Za-z0-9-]/g, "").slice(0, MAX_SEARCH) : DEFAULT_FILTERS.busca;
  const volUsdMin = numberOrNull(raw.volUsdMin);
  const rankMax = typeof raw.rankMax === "number" && Number.isInteger(raw.rankMax) && raw.rankMax >= 1 ? raw.rankMax : null;
  return {
    mercado,
    busca,
    volUsdMin: volUsdMin !== null && volUsdMin >= 0 ? volUsdMin : null,
    varMin: numberOrNull(raw.varMin),
    varMax: numberOrNull(raw.varMax),
    rankMax,
    apenasFixados: typeof raw.apenasFixados === "boolean" ? raw.apenasFixados : DEFAULT_FILTERS.apenasFixados,
  };
}

/** A filter that asks for a number never lets a row through whose number is unknown. */
export function applyFilters(rows: readonly RastreadorRow[], filters: Filters, pins: ReadonlySet<string>): RastreadorRow[] {
  const needle = filters.busca.trim().toUpperCase();
  return rows.filter((r) => {
    if (filters.mercado !== "todos" && r.mercado !== filters.mercado) return false;
    if (needle !== "" && !r.id.includes(needle)) return false;
    if (filters.apenasFixados && !pins.has(r.id)) return false;
    if (filters.volUsdMin !== null && (r.volUsd24h === null || r.volUsd24h < filters.volUsdMin)) return false;
    if (filters.varMin !== null && (r.var24hPct === null || r.var24hPct < filters.varMin)) return false;
    if (filters.varMax !== null && (r.var24hPct === null || r.var24hPct > filters.varMax)) return false;
    if (filters.rankMax !== null && (r.rank === null || r.rank > filters.rankMax)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------------------------- sorting

export type SortKey = "rank" | "ativo" | "preco" | "var24hPct" | "volUsd24h" | "pressao" | "var1h" | "var4h";
export interface Sort {
  readonly key: SortKey;
  readonly dir: "asc" | "desc";
}
export const DEFAULT_SORT: Sort = { key: "volUsd24h", dir: "desc" };
export const SORT_KEYS: readonly SortKey[] = ["rank", "ativo", "preco", "var24hPct", "volUsd24h", "pressao", "var1h", "var4h"];

/** Values that are measured outside the ticker list (the flow of the visible rows, the candles of the visible rows). */
export interface Measures {
  readonly pressao: ReadonlyMap<string, number | null>;
  readonly var1h: ReadonlyMap<string, number | null>;
  readonly var4h: ReadonlyMap<string, number | null>;
}
export const NO_MEASURES: Measures = { pressao: new Map(), var1h: new Map(), var4h: new Map() };

function valueOf(row: RastreadorRow, key: SortKey, measures: Measures): number | string | null {
  switch (key) {
    case "rank": return row.rank;
    case "ativo": return row.id;
    case "preco": return row.preco;
    case "var24hPct": return row.var24hPct;
    case "volUsd24h": return row.volUsd24h;
    case "pressao": return measures.pressao.get(row.id) ?? null;
    case "var1h": return measures.var1h.get(row.id) ?? null;
    case "var4h": return measures.var4h.get(row.id) ?? null;
  }
}

/** A new list; an unknown value goes last in both directions, and a tie is broken by the id so the order is stable. */
export function sortRows(rows: readonly RastreadorRow[], sort: Sort, measures: Measures = NO_MEASURES): RastreadorRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a, sort.key, measures);
    const right = valueOf(b, sort.key, measures);
    if (left === null && right === null) return a.id.localeCompare(b.id);
    if (left === null) return 1;
    if (right === null) return -1;
    const order = typeof left === "string" || typeof right === "string" ? String(left).localeCompare(String(right)) : left - right;
    return order === 0 ? a.id.localeCompare(b.id) : order * sign;
  });
}

// ---------------------------------------------------------------------------------------------- views

export type ViewId = "geral" | "desempenho" | "fluxo" | "smart" | "risco";
export const VIEW_ORDER: readonly ViewId[] = ["geral", "desempenho", "fluxo", "smart", "risco"];

export interface Column {
  readonly id: string;
  readonly label: string;
  readonly numeric: boolean;
  readonly sortKey: SortKey | null;
  /** One plain sentence about what the column is and where it comes from. */
  readonly tip: string;
}

export interface ViewDef {
  readonly id: ViewId;
  readonly label: string;
  readonly available: boolean;
  /** Why the view cannot be used yet; null when it can. */
  readonly reason: string | null;
  readonly columns: readonly Column[];
}

const ON_CHAIN_REASON = "Carteiras rastreadas e risco existem para tokens on-chain, que entram no Rastreador quando o gateway estiver ligado";

const COL = {
  rank: { id: "rank", label: "Rank", numeric: true, sortKey: "rank", tip: "Posicao pelo volume em USD das ultimas 24 horas, entre os pares da OKX" },
  ativo: { id: "ativo", label: "Ativo", numeric: false, sortKey: "ativo", tip: "Simbolo do par na OKX" },
  preco: { id: "preco", label: "Preco", numeric: true, sortKey: "preco", tip: "Ultimo preco negociado, direto da OKX" },
  var24h: { id: "var24h", label: "Var 24h", numeric: true, sortKey: "var24hPct", tip: "Variacao do ultimo preco contra a abertura de 24 horas atras" },
  vol: { id: "vol", label: "Vol USD 24h", numeric: true, sortKey: "volUsd24h", tip: "Volume das ultimas 24 horas em USD. Em perpetuos e contratos vezes o tamanho do contrato vezes o ultimo preco (aproximado)" },
  pressao: { id: "pressao", label: "Pressao de fluxo", numeric: true, sortKey: "pressao", tip: "Agressao compradora menos agressao vendedora, dividido pelo total, nos ultimos 500 negocios e no maximo no ultimo minuto. Um par muito negociado enche os 500 em poucos segundos; a janela medida aparece ao lado. E uma medida, nao uma instrucao" },
  mercado: { id: "mercado", label: "Mercado", numeric: false, sortKey: null, tip: "Spot ou perpetuo" },
  var1h: { id: "var1h", label: "Var 1 h", numeric: true, sortKey: "var1h", tip: "Variacao da ultima hora, das velas de 1 minuto, so para as linhas visiveis" },
  var4h: { id: "var4h", label: "Var 4 h", numeric: true, sortKey: "var4h", tip: "Variacao das ultimas 4 horas, das velas de 1 minuto, so para as linhas visiveis" },
  janela: { id: "janela", label: "Janela medida", numeric: true, sortKey: null, tip: "Quanto tempo os negocios lidos cobrem de fato" },
  negocios: { id: "negocios", label: "Negocios", numeric: true, sortKey: null, tip: "Quantos negocios entraram na medida" },
} as const satisfies Record<string, Column>;

export const VIEWS: Readonly<Record<ViewId, ViewDef>> = {
  geral: { id: "geral", label: "Visao geral", available: true, reason: null, columns: [COL.rank, COL.ativo, COL.preco, COL.var24h, COL.vol, COL.pressao, COL.mercado] },
  desempenho: { id: "desempenho", label: "Desempenho", available: true, reason: null, columns: [COL.ativo, COL.var1h, COL.var4h, COL.var24h, COL.preco] },
  fluxo: { id: "fluxo", label: "Fluxo", available: true, reason: null, columns: [COL.ativo, COL.pressao, COL.janela, COL.negocios, COL.vol] },
  smart: { id: "smart", label: "Smart money", available: false, reason: ON_CHAIN_REASON, columns: [COL.ativo] },
  risco: { id: "risco", label: "Risco", available: false, reason: ON_CHAIN_REASON, columns: [COL.ativo] },
};

// ---------------------------------------------------------------------------------------------- pressure

export interface TradeLike {
  readonly ts: number;
  readonly sz: number;
  readonly side: "buy" | "sell";
}

export interface Pressure {
  /** In [-1, 1]: (aggressive buying - aggressive selling) / (both). */
  readonly valor: number;
  readonly compra: number;
  readonly venda: number;
  readonly negocios: number;
  /** How much time the trades read actually cover; a short sample is not passed off as a full window. */
  readonly janelaMs: number;
}

export const PRESSURE_WINDOW_MS = 60_000;

/** The measured pressure over the last window, or null when no trade falls in it. */
export function pressureOf(trades: readonly TradeLike[], nowMs: number, windowMs: number = PRESSURE_WINDOW_MS): Pressure | null {
  let compra = 0;
  let venda = 0;
  let negocios = 0;
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const t of trades) {
    if (!Number.isFinite(t.sz) || t.sz <= 0 || !Number.isFinite(t.ts) || nowMs - t.ts > windowMs || t.ts > nowMs) continue;
    if (t.side === "buy") compra += t.sz;
    else venda += t.sz;
    negocios += 1;
    first = Math.min(first, t.ts);
    last = Math.max(last, t.ts);
  }
  if (negocios === 0) return null;
  return { valor: (compra - venda) / (compra + venda), compra, venda, negocios, janelaMs: last - first };
}

/** Descriptive words for the pressure: they say which aggressor side dominated, and never what to do. */
export function pressureLabel(valor: number): string {
  if (valor > 0.35) return "Pressao compradora forte";
  if (valor >= 0.1) return "Pressao compradora";
  if (valor > -0.1) return "Equilibrada";
  if (valor >= -0.35) return "Pressao vendedora";
  return "Pressao vendedora forte";
}
