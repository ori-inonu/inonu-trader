/**
 * Display preferences of the desk. Only the palette of the rise and fall colours is a preference today, as in the
 * colour menu of a wallet: the default, a pair that colour-blind readers tell apart (blue and orange) and the inverted
 * pair. The charts read --buy and --sell from the stylesheet when they draw, so one attribute on the document
 * recolours every panel and every canvas. The colours below must match globals.css; a test keeps them equal.
 */

export type PaletteId = "padrao" | "daltonismo" | "invertido";

export interface PaletteOption {
  readonly id: PaletteId;
  readonly label: string;
  readonly hint: string;
  /** The rise colour, for the swatch in the menu. */
  readonly up: string;
  /** The fall colour, for the swatch in the menu. */
  readonly down: string;
}

export const PALETTES: readonly PaletteOption[] = [
  { id: "padrao", label: "Padrao", hint: "Verde sobe, vermelho desce", up: "#3ddc97", down: "#ff6b81" },
  { id: "daltonismo", label: "Daltonismo", hint: "Azul sobe, laranja desce", up: "#56b4ff", down: "#ff7a3d" },
  { id: "invertido", label: "Invertido", hint: "Vermelho sobe, verde desce", up: "#ff6b81", down: "#3ddc97" },
];

export const PALETTE_KEY = "inonu:palette";

/** Anything that is not a known non-default palette is the default: a corrupt or foreign value never breaks the page. */
export function normalizePalette(raw: unknown): PaletteId {
  return raw === "daltonismo" || raw === "invertido" ? raw : "padrao";
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void; removeItem(key: string): void } | null | undefined;

export function readStoredPalette(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage): PaletteId {
  try {
    return normalizePalette(storage?.getItem(PALETTE_KEY));
  } catch {
    return "padrao";
  }
}

/** Sets the attribute that the stylesheet reads and remembers the choice; storage may be blocked, the attribute still applies. */
export function applyPalette(
  id: PaletteId,
  root: { dataset: Record<string, string | undefined> } = document.documentElement,
  storage: WritableStorage = typeof localStorage === "undefined" ? null : localStorage,
): void {
  if (id === "padrao") delete root.dataset.palette;
  else root.dataset.palette = id;
  try {
    if (id === "padrao") storage?.removeItem(PALETTE_KEY);
    else storage?.setItem(PALETTE_KEY, id);
  } catch {
    /* a blocked storage only loses the memory of the choice */
  }
}

/** Runs in the head before the first paint so a saved palette never flashes the default one. */
export const PALETTE_BOOT_SCRIPT = `try{var p=localStorage.getItem("${PALETTE_KEY}");if(p==="daltonismo"||p==="invertido")document.documentElement.dataset.palette=p}catch(e){}`;
