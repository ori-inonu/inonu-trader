/**
 * The views inside the two composite tabs of the bottom dock (DOC-4, INF-1): Radar (where to buy, zones, traders, holders; the news are gone: nobody decides from a headline)
 * and Mercado bruto (tape, book, liquidity). Only the chosen view of a tab mounts a body, so nothing in a drawer loads (or spends a
 * provider call) until the person opens it. The choice is remembered on this machine under `inonu.dock.subs.v1`.
 *
 * Pure like dock.ts: it knows nothing about React; reading the stored value happens after mount.
 */
import { DOCK_KEY, legacyPlacement } from "./dock";

export const DOCK_SUBS_KEY = "inonu.dock.subs.v1";

export type SubViewTab = "radar" | "mercado";

export interface SubViewDef {
  readonly id: string;
  readonly label: string;
}

export const DOCK_SUBVIEWS: Readonly<Record<SubViewTab, readonly SubViewDef[]>> = {
  radar: [
    // the best opportunities of the whole ecosystem, with the size of each purchase worked out from the balance: the first view of the Radar (RAS-8)
    { id: "melhores", label: "Melhores" },
    // the tokens of several networks at once with their readings and marks of care, the evidence behind the best ones (RAS-7, deviation D4-34)
    { id: "oportunidades", label: "Ecossistema" },
    { id: "smart", label: "Onde comprar" },
    { id: "zonas", label: "Zonas" },
    { id: "traders", label: "Traders" },
    { id: "holders", label: "Holders" },
    // the launches of a chain with the facts a person weighs before one (RAS-2, deviation D4-31)
    { id: "lancamentos", label: "Lancamentos" },
    // the pairs of the exchange by how far out of the ordinary each is: where to look, never what to buy (RAS-7)
    { id: "pares", label: "Pares OKX" },
  ],
  mercado: [
    { id: "fita", label: "Fita" },
    { id: "livro", label: "Livro" },
    { id: "liquidez", label: "Liquidez" },
  ],
};

export type DockSubs = Readonly<Record<SubViewTab, string>>;

export const DEFAULT_SUBS: DockSubs = { radar: "melhores", mercado: "fita" };

export function isSubView(tab: SubViewTab, id: unknown): boolean {
  return typeof id === "string" && DOCK_SUBVIEWS[tab].some((v) => v.id === id);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Field by field defensive parse: a view that does not exist in its tab goes back to that tab's default. */
export function parseSubs(raw: unknown): DockSubs {
  if (!isRecord(raw)) return DEFAULT_SUBS;
  return {
    radar: isSubView("radar", raw.radar) ? (raw.radar as string) : DEFAULT_SUBS.radar,
    mercado: isSubView("mercado", raw.mercado) ? (raw.mercado as string) : DEFAULT_SUBS.mercado,
  };
}

/** A dock saved by the nine tab desk: the old tab id says which view of which tab to open; any other id changes nothing. */
export function subsFromLegacy(oldTabId: unknown, current: DockSubs): DockSubs {
  const placed = legacyPlacement(oldTabId);
  if (placed === null || (placed.tab !== "radar" && placed.tab !== "mercado")) return current;
  return { ...current, [placed.tab]: placed.sub };
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined;

export function loadSubs(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage): DockSubs {
  try {
    const raw = storage?.getItem(DOCK_SUBS_KEY);
    return raw == null ? DEFAULT_SUBS : parseSubs(JSON.parse(raw));
  } catch {
    return DEFAULT_SUBS;
  }
}

/**
 * The views to open with: the saved choice when there is one; otherwise, for a dock saved by the nine tab desk, the view that used to
 * be the tab (so a person who left the desk on "Livro" comes back to Mercado bruto, Livro); otherwise the defaults.
 */
export function loadSubsMigrating(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage): DockSubs {
  try {
    if (storage?.getItem(DOCK_SUBS_KEY) != null) return loadSubs(storage);
    const rawDock = storage?.getItem(DOCK_KEY);
    if (rawDock == null) return DEFAULT_SUBS;
    const parsed: unknown = JSON.parse(rawDock);
    return subsFromLegacy(isRecord(parsed) ? parsed.tab : undefined, DEFAULT_SUBS);
  } catch {
    return DEFAULT_SUBS;
  }
}

/**
 * Loads with the migration AND writes it, when the migration changed something: the legacy tab id lives in the dock value, which the
 * next click on a dock tab rewrites, so a migration that is only read would be lost on the second visit.
 */
export function migrateSubs(storage: (ReadableStorage & WritableStorage) | null | undefined = typeof localStorage === "undefined" ? null : localStorage): DockSubs {
  const subs = loadSubsMigrating(storage);
  try {
    if (storage?.getItem(DOCK_SUBS_KEY) == null && (subs.radar !== DEFAULT_SUBS.radar || subs.mercado !== DEFAULT_SUBS.mercado)) saveSubs(subs, storage);
  } catch {
    /* session only */
  }
  return subs;
}

/** A blocked or full storage only loses the memory of the choice. */
export function saveSubs(subs: DockSubs, storage: WritableStorage = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(DOCK_SUBS_KEY, JSON.stringify({ radar: subs.radar, mercado: subs.mercado }));
  } catch {
    /* session only */
  }
}
