// RAS-5: "Perguntar ao Inonu" in the Rastreador. What the model chose comes back as a filter, is shown as chips the person can remove,
// and is applied only when the person says so. The chips describe; they never tell anyone what to do (FLX-10).
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { AskFilter } from "../inonu/client";
import { applyChips, chipsOf, type ChipId } from "./ask";
import { DEFAULT_FILTERS, DEFAULT_SORT } from "./model";

const NEUTRAL: AskFilter = { mercado: "todos", volUsdMin: null, varMin: null, varMax: null, rankMax: null, apenasFixados: false, ordenar: { chave: "volUsd24h", direcao: "desc" } };
const FULL: AskFilter = { mercado: "perp", volUsdMin: 100_000_000, varMin: 3, varMax: null, rankMax: 50, apenasFixados: true, ordenar: { chave: "var24hPct", direcao: "desc" } };

describe("the chips", () => {
  test("a neutral filter says only the order, because that is the only thing it changes", () => {
    expect(chipsOf(NEUTRAL).map((c) => c.id)).toEqual(["ordem"]);
    expect(chipsOf(NEUTRAL)[0]!.label).toBe("Ordem: maior volume");
  });

  test("every part of a full filter is a chip with a plain label", () => {
    expect(chipsOf(FULL)).toEqual([
      { id: "mercado", label: "Mercado: Perpetuos" },
      { id: "vol", label: "Vol USD min: 100 mi" },
      { id: "varMin", label: "Var 24h acima de +3%" },
      { id: "rank", label: "Rank ate 50" },
      { id: "fixados", label: "So fixados" },
      { id: "ordem", label: "Ordem: maior alta" },
    ]);
  });

  test("a fall and a calm day are described by the band they ask for", () => {
    expect(chipsOf({ ...NEUTRAL, varMax: -10 }).map((c) => c.label)).toContain("Var 24h abaixo de -10%");
    const calm = chipsOf({ ...NEUTRAL, varMin: -1, varMax: 1 }).map((c) => c.label);
    expect(calm).toContain("Var 24h acima de -1%");
    expect(calm).toContain("Var 24h abaixo de +1%");
  });

  test("the order has a word for each key and direction", () => {
    const word = (chave: AskFilter["ordenar"]["chave"], direcao: "asc" | "desc") => chipsOf({ ...NEUTRAL, ordenar: { chave, direcao } }).find((c) => c.id === "ordem")!.label;
    expect(word("volUsd24h", "desc")).toBe("Ordem: maior volume");
    expect(word("volUsd24h", "asc")).toBe("Ordem: menor volume");
    expect(word("var24hPct", "desc")).toBe("Ordem: maior alta");
    expect(word("var24hPct", "asc")).toBe("Ordem: maior queda");
    expect(word("preco", "desc")).toBe("Ordem: maior preco");
    expect(word("preco", "asc")).toBe("Ordem: menor preco");
  });

  test("labels are plain ASCII with no middle dot, dash or order verb", () => {
    for (const filtro of [NEUTRAL, FULL, { ...FULL, varMin: null, varMax: -3, mercado: "spot" as const }]) {
      for (const chip of chipsOf(filtro)) {
        expect(/^[\x20-\x7e]*$/.test(chip.label)).toBe(true);
        for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(chip.label)).toBe(false);
      }
    }
  });
});

describe("applying the chips the person kept", () => {
  const all = new Set<ChipId>(chipsOf(FULL).map((c) => c.id));

  test("every chip kept builds the filters and the sort of the table, starting from the defaults", () => {
    const out = applyChips(FULL, all);
    expect(out.filters).toEqual({ ...DEFAULT_FILTERS, mercado: "perp", volUsdMin: 100_000_000, varMin: 3, rankMax: 50, apenasFixados: true });
    expect(out.sort).toEqual({ key: "var24hPct", dir: "desc" });
  });

  test("a chip the person removed is not applied, and the neutral value takes its place", () => {
    const out = applyChips(FULL, new Set<ChipId>(["mercado", "ordem"]));
    expect(out.filters).toEqual({ ...DEFAULT_FILTERS, mercado: "perp" });
    expect(out.sort).toEqual({ key: "var24hPct", dir: "desc" });
    const noOrder = applyChips(FULL, new Set<ChipId>(["vol"]));
    expect(noOrder.sort).toEqual(DEFAULT_SORT);
    expect(noOrder.filters.volUsdMin).toBe(100_000_000);
  });

  test("with nothing kept it is the default table", () => {
    expect(applyChips(FULL, new Set())).toEqual({ filters: DEFAULT_FILTERS, sort: DEFAULT_SORT });
  });

  test("an old search text is not carried over: the sentence defines the whole screen", () => {
    expect(applyChips(NEUTRAL, new Set<ChipId>(["ordem"])).filters.busca).toBe("");
  });
});
