/**
 * The bottom dock of the desk (spec DOC-1/DOC-2): a strip of tabs in the style of the trading
 * platforms, collapsible to its tab bar and resizable from its top edge. The open flag, the active
 * tab and the height persist in this browser under `jev.dock.v1`.
 *
 * This module is pure: it knows nothing about React or the DOM beyond a minimal storage shape,
 * so every rule is tested without a browser. Reading the stored value happens only after mount
 * (the callers do it in an effect), so the server markup is always the default state.
 */

export const DOCK_KEY = "jev.dock.v1";

/** Height of the always visible tab bar, and the whole dock when collapsed. */
export const DOCK_TAB_BAR_PX = 34;
/** The dock never gets shorter than this when open. */
export const DOCK_MIN_PX = 190;
/** The dock never takes more than this share of the window height. */
export const DOCK_MAX_PCT = 55;
/** Initial height, a share of the window height. */
export const DOCK_DEFAULT_PCT = 26;
/** One ArrowUp or ArrowDown on the separator moves the height by this many percent points. */
export const DOCK_KEY_STEP_PCT = 2;
/** Stored percent values below this are pointless: the px floor would hide the difference. */
export const DOCK_MIN_PCT = 8;

/** Mobile: which bottom section of the desk a dock tab belongs to. */
export type DockGroup = "livro" | "fontes";

export interface DockTabDef {
  readonly id: string;
  readonly label: string;
  readonly group: DockGroup;
}

/**
 * The dock tabs, in order (DOC-4): five, not nine. Radar and Mercado bruto hold several views behind chips
 * (see dock-subviews.ts), so the raw market (tape, book, liquidity) is a drawer inside the last tab and the on-chain
 * views sit together in the Radar. The id of the Inonu tab stays `diario` so a saved choice keeps working.
 */
export const DOCK_TABS: readonly DockTabDef[] = [
  { id: "diario", label: "Inonu", group: "fontes" },
  { id: "radar", label: "Radar", group: "fontes" },
  { id: "fluxo", label: "Fluxo", group: "livro" },
  { id: "carteira", label: "Carteira", group: "fontes" },
  { id: "mercado", label: "Mercado", group: "livro" },
];

/**
 * The nine tab dock saved ids that no longer exist; each one lands on the tab (and the view inside it) that holds that
 * content now, so nobody opens the desk on a tab that is gone.
 */
const LEGACY_PLACEMENT: Readonly<Record<string, { readonly tab: string; readonly sub: string }>> = Object.freeze({
  fita: { tab: "mercado", sub: "fita" },
  livro: { tab: "mercado", sub: "livro" },
  liquidez: { tab: "mercado", sub: "liquidez" },
  smart: { tab: "radar", sub: "smart" },
  traders: { tab: "radar", sub: "traders" },
  holders: { tab: "radar", sub: "holders" },
  ecossistema: { tab: "radar", sub: "smart" },
});

export function legacyPlacement(id: unknown): { readonly tab: string; readonly sub: string } | null {
  return typeof id === "string" && Object.hasOwn(LEGACY_PLACEMENT, id) ? LEGACY_PLACEMENT[id]! : null;
}

export interface DockState {
  readonly open: boolean;
  readonly tab: string;
  readonly heightPct: number;
}

export function defaultDock(tabs: readonly DockTabDef[] = DOCK_TABS): DockState {
  return { open: true, tab: tabs[0]?.id ?? "fita", heightPct: DOCK_DEFAULT_PCT };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Field by field defensive parse: a corrupted payload falls back to the defaults piece by piece,
 * an out of range height is clamped and an unknown tab goes back to the first tab of the list.
 */
export function parseDock(raw: unknown, tabs: readonly DockTabDef[] = DOCK_TABS): DockState {
  const base = defaultDock(tabs);
  if (!isRecord(raw)) return base;
  const open = typeof raw.open === "boolean" ? raw.open : base.open;
  const known = new Set(tabs.map((t) => t.id));
  const moved = legacyPlacement(raw.tab)?.tab;
  const tab = typeof raw.tab === "string" && known.has(raw.tab) ? raw.tab : moved !== undefined && known.has(moved) ? moved : base.tab;
  const pct = typeof raw.heightPct === "number" && Number.isFinite(raw.heightPct) ? raw.heightPct : base.heightPct;
  return { open, tab, heightPct: clampHeightPct(pct) };
}

/** Keeps a stored or dragged percent inside the meaningful band, independent of the window size. */
export function clampHeightPct(pct: number): number {
  if (!Number.isFinite(pct)) return DOCK_DEFAULT_PCT;
  return Math.min(DOCK_MAX_PCT, Math.max(DOCK_MIN_PCT, pct));
}

/** The open dock height in px for a window of `viewportH` px, honouring the px floor and the pct cap. */
export function dockHeightPx(pct: number, viewportH: number): number {
  if (!Number.isFinite(viewportH) || viewportH <= 0) return DOCK_MIN_PX;
  return Math.min((DOCK_MAX_PCT / 100) * viewportH, Math.max(DOCK_MIN_PX, (clampHeightPct(pct) / 100) * viewportH));
}

/**
 * One keyboard step on the separator: plus or minus DOCK_KEY_STEP_PCT percent points, re-clamped
 * so the answer always honours the px floor and the pct cap of this window.
 */
export function stepHeightPct(pct: number, dir: 1 | -1, viewportH: number): number {
  const moved = clampHeightPct(pct + dir * DOCK_KEY_STEP_PCT);
  if (!Number.isFinite(viewportH) || viewportH <= 0) return moved;
  return roundPct((dockHeightPx(moved, viewportH) / viewportH) * 100);
}

/** A drag of the top edge: moving the pointer up grows the dock. */
export function dragHeightPct(startPct: number, startClientY: number, clientY: number, viewportH: number): number {
  if (!Number.isFinite(viewportH) || viewportH <= 0) return clampHeightPct(startPct);
  const deltaPct = ((startClientY - clientY) / viewportH) * 100;
  const pct = clampHeightPct(startPct + deltaPct);
  // The px floor keeps the answer honest: dragging below the minimum reports the floor, not a stale pct.
  return roundPct((dockHeightPx(pct, viewportH) / viewportH) * 100);
}

/** Percents are stored and reported to ARIA; a stable two decimal rounding avoids float noise. */
function roundPct(pct: number): number {
  return Number(pct.toFixed(4));
}

export function isDockTab(id: string, tabs: readonly DockTabDef[] = DOCK_TABS): boolean {
  return tabs.some((t) => t.id === id);
}

/** Choosing a valid tab reveals its content without resetting the user's panel height. */
export function selectDockTab(state: DockState, id: string, tabs: readonly DockTabDef[] = DOCK_TABS): DockState {
  return isDockTab(id, tabs) ? { ...state, tab: id, open: true } : state;
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined;

export function loadDock(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage, tabs: readonly DockTabDef[] = DOCK_TABS): DockState {
  try {
    const raw = storage?.getItem(DOCK_KEY);
    if (raw == null) return defaultDock(tabs);
    return parseDock(JSON.parse(raw), tabs);
  } catch {
    return defaultDock(tabs);
  }
}

/** A blocked or full storage only loses the memory of the dock; nothing else changes. */
export function saveDock(state: DockState, storage: WritableStorage = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(DOCK_KEY, JSON.stringify({ open: state.open, tab: state.tab, heightPct: clampHeightPct(state.heightPct) }));
  } catch {
    /* session only */
  }
}
