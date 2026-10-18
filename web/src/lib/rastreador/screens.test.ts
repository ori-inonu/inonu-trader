// RAS-4: saved screens and the last working state of the Rastreador live on this machine (inonu.screens.v1 holds up to twenty
// named screens). Anything that is not exactly the documented shape is dropped on the way in, so a hand edited or older payload
// never breaks the page, and a blocked storage changes nothing. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { DEFAULT_FILTERS, DEFAULT_SORT, type Filters } from "./model";
import { MAX_SCREENS, SCREENS_KEY, WORK_KEY, loadScreens, loadWork, parseScreens, parseWork, removeScreen, saveScreens, saveWork, upsertScreen, type Screen } from "./screens";

class Store {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const screen = (nome: string, over: Partial<Screen> = {}): Screen => ({ nome, filtros: DEFAULT_FILTERS, visao: "geral", ordenacao: DEFAULT_SORT, ...over });

describe("parseScreens", () => {
  test("good entries are read as they are", () => {
    const filtros: Filters = { ...DEFAULT_FILTERS, mercado: "perp", volUsdMin: 1e6 };
    const list = [screen("Perpetuos grandes", { filtros, visao: "fluxo", ordenacao: { key: "pressao", dir: "asc" } })];
    expect(parseScreens(list)).toEqual(list);
  });

  test("anything that is not a list is nothing, and a bad entry is dropped without hurting the others", () => {
    expect(parseScreens(null)).toEqual([]);
    expect(parseScreens({})).toEqual([]);
    expect(parseScreens("x")).toEqual([]);
    const mixed = parseScreens([screen("ok"), { nome: 5 }, { nome: "", filtros: {}, visao: "geral", ordenacao: DEFAULT_SORT }, { nome: "view", filtros: {}, visao: "nada", ordenacao: DEFAULT_SORT }, { nome: "sort", filtros: {}, visao: "geral", ordenacao: { key: "x", dir: "asc" } }, "str", null]);
    expect(mixed.map((s) => s.nome)).toEqual(["ok"]);
  });

  test("the filters inside are sanitised like any filters, and the name is trimmed and cut", () => {
    const [one] = parseScreens([{ nome: `  ${"n".repeat(80)}  `, filtros: { mercado: "onchain", busca: "<b>" }, visao: "geral", ordenacao: DEFAULT_SORT }]);
    expect(one!.nome.length).toBe(40);
    expect(one!.filtros.mercado).toBe("todos");
    expect(one!.filtros.busca).toBe("b");
  });

  test("names with control characters are cleaned, and two screens cannot share a name", () => {
    expect(parseScreens([screen("a\u0000b\nc")])[0]!.nome).toBe("abc");
    expect(parseScreens([screen("Dupla"), screen("dupla"), screen("Outra")]).map((s) => s.nome)).toEqual(["Dupla", "Outra"]);
  });

  test("at most twenty are read", () => {
    const many = Array.from({ length: 30 }, (_, i) => screen(`tela ${i}`));
    expect(parseScreens(many)).toHaveLength(MAX_SCREENS);
  });
});

describe("upsert and remove", () => {
  test("a new screen goes to the end, a screen with the same name (any case) is replaced in place", () => {
    let list = upsertScreen([], screen("A"));
    list = upsertScreen(list, screen("B"));
    list = upsertScreen(list, screen("a", { visao: "desempenho" }));
    expect(list.map((s) => s.nome)).toEqual(["a", "B"]);
    expect(list[0]!.visao).toBe("desempenho");
  });

  test("past twenty the oldest goes", () => {
    let list: Screen[] = [];
    for (let i = 0; i < 25; i += 1) list = upsertScreen(list, screen(`t${i}`));
    expect(list).toHaveLength(MAX_SCREENS);
    expect(list[0]!.nome).toBe("t5");
    expect(list[MAX_SCREENS - 1]!.nome).toBe("t24");
  });

  test("an empty name is refused and removing removes only that screen", () => {
    expect(upsertScreen([screen("A")], screen("   "))).toEqual([screen("A")]);
    expect(removeScreen([screen("A"), screen("B")], "a").map((s) => s.nome)).toEqual(["B"]);
    expect(removeScreen([screen("A")], "zzz")).toHaveLength(1);
  });

  test("it never changes the list it was given", () => {
    const base = [screen("A")];
    upsertScreen(base, screen("B"));
    removeScreen(base, "A");
    expect(base).toHaveLength(1);
  });
});

describe("storage", () => {
  test("saves under its own key and reads back", () => {
    const store = new Store();
    saveScreens(store, [screen("A", { visao: "fluxo" })]);
    expect(store.data.has(SCREENS_KEY)).toBe(true);
    expect(loadScreens(store)).toEqual([screen("A", { visao: "fluxo" })]);
  });

  test("no storage, a blocked one or broken JSON never breaks the page", () => {
    expect(loadScreens(null)).toEqual([]);
    const broken = new Store();
    broken.data.set(SCREENS_KEY, "{nope");
    expect(loadScreens(broken)).toEqual([]);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadScreens(throwing)).toEqual([]);
    expect(() => saveScreens(throwing, [screen("A")])).not.toThrow();
    expect(() => saveScreens(null, [screen("A")])).not.toThrow();
  });
});

describe("the last working state", () => {
  test("view, filters and sort come back after a reload", () => {
    const store = new Store();
    const work = { visao: "fluxo" as const, filtros: { ...DEFAULT_FILTERS, mercado: "spot" as const, busca: "BTC" }, ordenacao: { key: "pressao" as const, dir: "asc" as const } };
    saveWork(store, work);
    expect(store.data.has(WORK_KEY)).toBe(true);
    expect(loadWork(store)).toEqual(work);
  });

  test("a view that cannot be used yet is not restored, and garbage is the default state", () => {
    expect(parseWork({ visao: "smart", filtros: {}, ordenacao: DEFAULT_SORT }).visao).toBe("geral");
    expect(parseWork(null)).toEqual({ visao: "geral", filtros: DEFAULT_FILTERS, ordenacao: DEFAULT_SORT });
    expect(parseWork({ visao: 3, filtros: 4, ordenacao: "x" })).toEqual({ visao: "geral", filtros: DEFAULT_FILTERS, ordenacao: DEFAULT_SORT });
    expect(loadWork(null)).toEqual({ visao: "geral", filtros: DEFAULT_FILTERS, ordenacao: DEFAULT_SORT });
  });
});
