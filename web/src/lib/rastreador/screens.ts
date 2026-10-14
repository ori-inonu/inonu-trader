/**
 * Saved screens and the last working state of the Rastreador (RAS-4), kept on THIS machine in the browser storage:
 * `inonu.screens.v1` holds up to twenty named screens (name, filters, view, sort) and `inonu.rastreador.v1` the state the page
 * was left in. Whatever is not exactly the documented shape is dropped on the way in, so a hand edited or older payload never
 * breaks the page. A blocked or full storage changes nothing: the choices then last until the page closes.
 */
import { DEFAULT_FILTERS, DEFAULT_SORT, SORT_KEYS, VIEWS, VIEW_ORDER, parseFilters, type Filters, type Sort, type ViewId } from "./model";

export const SCREENS_KEY = "inonu.screens.v1";
export const WORK_KEY = "inonu.rastreador.v1";
export const MAX_SCREENS = 20;
const MAX_NAME = 40;

export interface Screen {
  readonly nome: string;
  readonly filtros: Filters;
  readonly visao: ViewId;
  readonly ordenacao: Sort;
}

export interface WorkState {
  readonly visao: ViewId;
  readonly filtros: Filters;
  readonly ordenacao: Sort;
}

export interface ScreensStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A name is what the person typed, without control characters, trimmed and cut. */
function cleanName(raw: unknown): string {
  // eslint-disable-next-line no-control-regex
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME).trim() : "";
}

function parseView(raw: unknown): ViewId | null {
  return typeof raw === "string" && (VIEW_ORDER as readonly string[]).includes(raw) ? (raw as ViewId) : null;
}

function parseSort(raw: unknown): Sort | null {
  if (!isRec(raw) || typeof raw.key !== "string" || !(SORT_KEYS as readonly string[]).includes(raw.key) || (raw.dir !== "asc" && raw.dir !== "desc")) return null;
  return { key: raw.key as Sort["key"], dir: raw.dir };
}

export function parseScreens(raw: unknown): Screen[] {
  if (!Array.isArray(raw)) return [];
  const out: Screen[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRec(item)) continue;
    const nome = cleanName(item.nome);
    const visao = parseView(item.visao);
    const ordenacao = parseSort(item.ordenacao);
    if (nome === "" || visao === null || ordenacao === null || seen.has(nome.toLowerCase())) continue;
    seen.add(nome.toLowerCase());
    out.push({ nome, filtros: parseFilters(item.filtros), visao, ordenacao });
    if (out.length === MAX_SCREENS) break;
  }
  return out;
}

/** A new list: the screen replaces the one with the same name (any case) in place, or goes to the end; past twenty the oldest goes. */
export function upsertScreen(list: readonly Screen[], screen: Screen): Screen[] {
  const nome = cleanName(screen.nome);
  if (nome === "") return [...list];
  const next: Screen = { ...screen, nome };
  const at = list.findIndex((s) => s.nome.toLowerCase() === nome.toLowerCase());
  const out = at >= 0 ? list.map((s, i) => (i === at ? next : s)) : [...list, next];
  return out.slice(-MAX_SCREENS);
}

export function removeScreen(list: readonly Screen[], nome: string): Screen[] {
  const key = cleanName(nome).toLowerCase();
  return list.filter((s) => s.nome.toLowerCase() !== key);
}

export function loadScreens(storage: ScreensStorage | null): Screen[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(SCREENS_KEY);
    return raw === null ? [] : parseScreens(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveScreens(storage: ScreensStorage | null, list: readonly Screen[]): void {
  if (storage === null) return;
  try {
    storage.setItem(SCREENS_KEY, JSON.stringify(list));
  } catch {
    // full or blocked: the screens last until the page closes
  }
}

const DEFAULT_WORK: WorkState = { visao: "geral", filtros: DEFAULT_FILTERS, ordenacao: DEFAULT_SORT };

/** A view that cannot be used yet is never restored: the page would open on a table with nothing to show. */
export function parseWork(raw: unknown): WorkState {
  if (!isRec(raw)) return DEFAULT_WORK;
  const visao = parseView(raw.visao);
  return {
    visao: visao !== null && VIEWS[visao].available ? visao : DEFAULT_WORK.visao,
    filtros: parseFilters(raw.filtros),
    ordenacao: parseSort(raw.ordenacao) ?? DEFAULT_WORK.ordenacao,
  };
}

export function loadWork(storage: ScreensStorage | null): WorkState {
  if (storage === null) return DEFAULT_WORK;
  try {
    const raw = storage.getItem(WORK_KEY);
    return raw === null ? DEFAULT_WORK : parseWork(JSON.parse(raw));
  } catch {
    return DEFAULT_WORK;
  }
}

export function saveWork(storage: ScreensStorage | null, work: WorkState): void {
  if (storage === null) return;
  try {
    storage.setItem(WORK_KEY, JSON.stringify(work));
  } catch {
    // full or blocked: the state lasts until the page closes
  }
}
