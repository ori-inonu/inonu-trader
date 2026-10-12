/**
 * The chart mode of the desk, the "maximize chart" of a charting platform: the book, the tape, the watchlist and the
 * flow gauge step aside and the Jev strip and the chart take the whole width. It is one attribute on the document that
 * the stylesheet reads (globals.css), remembered in this browser and applied before the first paint.
 */

export type LayoutId = "completo" | "grafico";

export const LAYOUT_KEY = "inonu:layout";

/** The button's name in each state, always in words. */
export const LAYOUT_LABEL: Record<LayoutId, string> = { completo: "Modo grafico", grafico: "Voltar a mesa completa" };

/** Anything that is not the chart mode is the full desk: a corrupt or foreign value never breaks the page. */
export function normalizeLayout(raw: unknown): LayoutId {
  return raw === "grafico" ? "grafico" : "completo";
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void; removeItem(key: string): void } | null | undefined;

export function readStoredLayout(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage): LayoutId {
  try {
    return normalizeLayout(storage?.getItem(LAYOUT_KEY));
  } catch {
    return "completo";
  }
}

/** Sets the attribute the stylesheet reads and remembers the choice; a blocked storage only loses the memory. */
export function applyLayout(
  id: LayoutId,
  root: { dataset: Record<string, string | undefined> } = document.documentElement,
  storage: WritableStorage = typeof localStorage === "undefined" ? null : localStorage,
): void {
  if (id === "completo") delete root.dataset.layout;
  else root.dataset.layout = id;
  try {
    if (id === "completo") storage?.removeItem(LAYOUT_KEY);
    else storage?.setItem(LAYOUT_KEY, id);
  } catch {
    /* a blocked storage only loses the memory of the choice */
  }
}

/** Runs in the head before the first paint so a saved chart mode never flashes the full desk first. */
export const LAYOUT_BOOT_SCRIPT = `try{if(localStorage.getItem("${LAYOUT_KEY}")==="grafico")document.documentElement.dataset.layout="grafico"}catch(e){}`;
