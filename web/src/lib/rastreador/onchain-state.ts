/**
 * What the Rastreador remembers about the universe (RAS-4), kept on THIS machine in the browser storage under `inonu.rastreador.universo.v1`:
 * the exchange or one network on-chain, and the view, the filters and the sort of the on-chain table. Whatever is not exactly the documented
 * shape is dropped field by field on the way in, so a hand edited or older payload never breaks the page. A blocked or full storage changes
 * nothing: the choices then last until the page closes.
 */
import {
  DEFAULT_ONCHAIN_FILTERS, DEFAULT_ONCHAIN_SORT, ONCHAIN_VIEW_ORDER,
  type OnchainFilters, type OnchainSort, type OnchainSortKey, type OnchainViewId,
} from "./onchain-model";
import type { ScreensStorage } from "./screens";

export const UNIVERSE_KEY = "inonu.rastreador.universo.v1";
const MAX_SEARCH = 40;
const CHAIN = /^\d{1,12}$/;

export type Universe = "corretora" | "onchain";

export interface UniverseState {
  readonly universo: Universe;
  readonly chainIndex: string;
  readonly visao: OnchainViewId;
  readonly filtros: OnchainFilters;
  readonly ordenacao: OnchainSort;
}

export const DEFAULT_UNIVERSE: UniverseState = { universo: "corretora", chainIndex: "196", visao: "geral", filtros: DEFAULT_ONCHAIN_FILTERS, ordenacao: DEFAULT_ONCHAIN_SORT };

const SORT_KEYS: readonly OnchainSortKey[] = ["rank", "ativo", "preco", "var24h", "vol", "mcap", "liquidez", "holders", "pressao", "carteiras", "usd", "vendida", "risco", "top10", "dev", "bundlers"];

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A number from zero up, or null; anything else (a text, NaN, a negative) is dropped. */
const nonNegative = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const anyNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseFilters(raw: unknown): OnchainFilters {
  if (!isRec(raw)) return DEFAULT_ONCHAIN_FILTERS;
  const risk = nonNegative(raw.riscoMax);
  return {
    busca: typeof raw.busca === "string" ? raw.busca.slice(0, MAX_SEARCH) : "",
    volUsdMin: nonNegative(raw.volUsdMin),
    liquidezMin: nonNegative(raw.liquidezMin),
    holdersMin: nonNegative(raw.holdersMin),
    carteirasMin: nonNegative(raw.carteirasMin),
    varMin: anyNumber(raw.varMin),
    varMax: anyNumber(raw.varMax),
    riscoMax: risk !== null && risk <= 5 ? risk : null,
  };
}

function parseSort(raw: unknown): OnchainSort {
  if (!isRec(raw) || typeof raw.key !== "string" || !(SORT_KEYS as readonly string[]).includes(raw.key) || (raw.dir !== "asc" && raw.dir !== "desc")) return DEFAULT_ONCHAIN_SORT;
  return { key: raw.key as OnchainSortKey, dir: raw.dir };
}

export function parseUniverse(raw: unknown): UniverseState {
  if (!isRec(raw)) return DEFAULT_UNIVERSE;
  return {
    universo: raw.universo === "onchain" ? "onchain" : "corretora",
    chainIndex: typeof raw.chainIndex === "string" && CHAIN.test(raw.chainIndex) ? raw.chainIndex : DEFAULT_UNIVERSE.chainIndex,
    visao: typeof raw.visao === "string" && (ONCHAIN_VIEW_ORDER as readonly string[]).includes(raw.visao) ? (raw.visao as OnchainViewId) : DEFAULT_UNIVERSE.visao,
    filtros: parseFilters(raw.filtros),
    ordenacao: parseSort(raw.ordenacao),
  };
}

/**
 * What the page remembers is the network, the view, the filters and the sort; the universe it OPENS on is always the exchange. Choosing the on-chain universe
 * is a click that reads the provider, so it is made every time and never by opening the page.
 */
export function loadUniverse(storage: ScreensStorage | null): UniverseState {
  if (storage === null) return DEFAULT_UNIVERSE;
  try {
    const raw = storage.getItem(UNIVERSE_KEY);
    return raw === null ? DEFAULT_UNIVERSE : { ...parseUniverse(JSON.parse(raw)), universo: "corretora" };
  } catch {
    return DEFAULT_UNIVERSE;
  }
}

/** Choosing a universe. Entering the on-chain one never opens the Smart money view by itself: that view reads the signals, and it has its own click. */
export function enterUniverse(state: UniverseState, universo: Universe): UniverseState {
  // the universe that is already open is not entered again: the view the person is on stays where it is
  if (state.universo === universo) return state;
  return { ...state, universo, visao: universo === "onchain" && state.visao === "smart" ? "geral" : state.visao };
}

export function saveUniverse(storage: ScreensStorage | null, state: UniverseState): void {
  if (storage === null) return;
  try {
    storage.setItem(UNIVERSE_KEY, JSON.stringify(state));
  } catch {
    // full or blocked: the state lasts until the page closes
  }
}
