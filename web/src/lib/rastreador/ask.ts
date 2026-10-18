/**
 * "Perguntar ao Inonu" in the Rastreador (RAS-5): what the model chose comes back as a filter, is shown as chips the person can
 * remove, and is applied only when the person says so. The chips describe; they never tell anyone what to do (FLX-10). Pure.
 */
import type { AskFilter } from "../inonu/client";
import { fmtCompact, fmtPctSigned } from "../desk/ui/format";
import { DEFAULT_FILTERS, DEFAULT_SORT, type Filters, type Sort } from "./model";

export type ChipId = "mercado" | "vol" | "varMin" | "varMax" | "rank" | "fixados" | "ordem";

export interface Chip {
  readonly id: ChipId;
  readonly label: string;
}

const ORDER_WORD: Record<string, string> = {
  "volUsd24h:desc": "maior volume",
  "volUsd24h:asc": "menor volume",
  "var24hPct:desc": "maior alta",
  "var24hPct:asc": "maior queda",
  "preco:desc": "maior preco",
  "preco:asc": "menor preco",
};

/** The parts of a filter that carry information, in a fixed order; the order of the table is always there because it always applies. */
export function chipsOf(filtro: AskFilter): Chip[] {
  const chips: Chip[] = [];
  if (filtro.mercado !== "todos") chips.push({ id: "mercado", label: `Mercado: ${filtro.mercado === "spot" ? "Spot" : "Perpetuos"}` });
  if (filtro.volUsdMin !== null) chips.push({ id: "vol", label: `Vol USD min: ${fmtCompact(filtro.volUsdMin)}` });
  if (filtro.varMin !== null) chips.push({ id: "varMin", label: `Var 24h acima de ${fmtPctSigned(filtro.varMin, 0)}` });
  if (filtro.varMax !== null) chips.push({ id: "varMax", label: `Var 24h abaixo de ${fmtPctSigned(filtro.varMax, 0)}` });
  if (filtro.rankMax !== null) chips.push({ id: "rank", label: `Rank ate ${filtro.rankMax}` });
  if (filtro.apenasFixados) chips.push({ id: "fixados", label: "So fixados" });
  chips.push({ id: "ordem", label: `Ordem: ${ORDER_WORD[`${filtro.ordenar.chave}:${filtro.ordenar.direcao}`] ?? "maior volume"}` });
  return chips;
}

/** The filters and the sort of the table from the chips the person kept. A chip that was removed leaves the neutral value in its place. */
export function applyChips(filtro: AskFilter, keep: ReadonlySet<ChipId>): { filters: Filters; sort: Sort } {
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    ...(keep.has("mercado") ? { mercado: filtro.mercado } : {}),
    ...(keep.has("vol") ? { volUsdMin: filtro.volUsdMin } : {}),
    ...(keep.has("varMin") ? { varMin: filtro.varMin } : {}),
    ...(keep.has("varMax") ? { varMax: filtro.varMax } : {}),
    ...(keep.has("rank") ? { rankMax: filtro.rankMax } : {}),
    ...(keep.has("fixados") ? { apenasFixados: filtro.apenasFixados } : {}),
  };
  const sort: Sort = keep.has("ordem") ? { key: filtro.ordenar.chave, dir: filtro.ordenar.direcao } : DEFAULT_SORT;
  return { filters, sort };
}
