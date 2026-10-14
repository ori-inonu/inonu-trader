/**
 * The layout rules of the bottom dock that must hold across window resizes (DOC-4), kept pure so they are tested without a browser.
 *
 * The desk mounts the dock twice: one copy for the wide layout and the mobile sections for a phone. Both exist in the tree but only the
 * copy that is on screen may mount the real body of a view (a second mount is a second provider call), and until the width is measured
 * neither does. What a view shows (the OKX surface or the on-chain one) comes from the focus alone and never from the width, so a
 * resize cannot drop the token the person is looking at.
 */

import { DOCK_TABS, type DockTabDef } from "./dock";

/** The breakpoint of the phone layout; the same one the desk stylesheet uses. */
export const NARROW_QUERY = "(max-width: 820px)";

export interface NarrowQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

/** Reports the width now and on every change (reading the query again each time) and returns the way to stop. */
export function watchNarrow(query: NarrowQuery, onChange: (narrow: boolean) => void): () => void {
  const update = (): void => onChange(query.matches);
  update();
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}

export type DockCopy = "wide" | "phone";
export type BodyMount = "carregando" | "oculto" | "montar";

export interface BodyPlan {
  /** carregando: width not measured yet. oculto: the copy that is off screen. montar: mount the real body. */
  readonly mount: BodyMount;
  /** Which market the shared views (tape, liquidity) read: the OKX instrument or the on-chain token in focus. */
  readonly surface: "okx" | "onchain";
}

export function bodyPlan(input: { readonly narrow: boolean | null; readonly copy: DockCopy; readonly onchainFocus: unknown | null }): BodyPlan {
  const surface = input.onchainFocus === null ? "okx" : "onchain";
  if (input.narrow === null) return { mount: "carregando", surface };
  const onScreen = input.copy === "phone" ? input.narrow : !input.narrow;
  return { mount: onScreen ? "montar" : "oculto", surface };
}

/**
 * The ids of the tabs whose body is on screen: on a wide window the active tab (none while the dock is collapsed to its bar); on a
 * phone each of the two sections shows its own active tab, or its first one when the active tab sits in the other section, and the
 * sections never collapse. Whatever reads data for a tab (the engine reading, a provider) is turned on from this list.
 */
export function visibleTabIds(input: {
  readonly narrow: boolean | null;
  readonly active: string;
  readonly open: boolean;
  readonly tabs?: readonly DockTabDef[];
}): string[] {
  const tabs = input.tabs ?? DOCK_TABS;
  if (input.narrow === null || tabs.length === 0) return [];
  if (!input.narrow) {
    if (!input.open) return [];
    return [tabs.some((t) => t.id === input.active) ? input.active : tabs[0]!.id];
  }
  const out: string[] = [];
  for (const group of ["livro", "fontes"] as const) {
    const inGroup = tabs.filter((t) => t.group === group);
    if (inGroup.length === 0) continue;
    out.push(inGroup.some((t) => t.id === input.active) ? input.active : inGroup[0]!.id);
  }
  return out;
}
