/**
 * The rows a person ticks in the Rastreador to ask Inonu to rank them (RAS-6). Two to five, never more: ten rows would cost about
 * twenty reads, over the cap of one click. The choice is a list of ids, not of rows, so a table that refreshes (a price that moved) or
 * is filtered (a row that left the view) does not lose it. Pure: no clock, no network, no storage.
 */
import type { AskSubject } from "@/lib/inonu/ask-target";

export const CHOOSE_MIN = 2;
export const CHOOSE_MAX = 5;

/** Tick or untick a row. At the limit a new tick changes nothing and the same list comes back, so the screen can tell why. */
export function toggleChosen(chosen: readonly string[], id: string): readonly string[] {
  if (chosen.includes(id)) return chosen.filter((c) => c !== id);
  if (chosen.length >= CHOOSE_MAX) return chosen;
  return [...chosen, id];
}

/** A ranking needs at least two rows (one row is a click on that row) and at most five. */
export const canRank = (chosen: readonly string[]): boolean => chosen.length >= CHOOSE_MIN && chosen.length <= CHOOSE_MAX;

/**
 * The choice that still means something: checked against the whole universe, not the filtered table, so a filter that hides a ticked row
 * keeps it; a pair the exchange no longer lists drops out. While the universe has not arrived nothing is dropped, and neither are the
 * pairs of a market whose list failed to arrive while the other did.
 */
export function chosenIds(chosen: readonly string[], universe: readonly { readonly id: string }[] | null, missing: "spot" | "perp" | null = null): readonly string[] {
  if (universe === null) return chosen;
  const known = new Set(universe.map((r) => r.id));
  // a list that did not arrive says nothing about its pairs: they stay until the list comes back
  const isPerp = (id: string): boolean => id.endsWith("-SWAP");
  return chosen.filter((id) => known.has(id) || (missing === "perp" && isPerp(id)) || (missing === "spot" && !isPerp(id)));
}

/** The line of the ranking section: how many rows are chosen, and what is missing or that the limit was reached. */
export function chosenLine(count: number): string {
  const base = `${count} de ${CHOOSE_MAX} linhas escolhidas`;
  if (count < CHOOSE_MIN) return `${base}. Falta pelo menos uma para ranquear`;
  if (count >= CHOOSE_MAX) return `${base}. Limite de ${CHOOSE_MAX} por pedido`;
  return base;
}

/** What to ask about, in the order the rows were ticked; null while there is nothing to rank. */
export function rankingSubjectOf(chosen: readonly string[]): Extract<AskSubject, { kind: "ranking" }> | null {
  return canRank(chosen) ? { kind: "ranking", instIds: [...chosen] } : null;
}
