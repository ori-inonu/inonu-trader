// RAS-4: what the Rastreador remembers about the universe on this machine: the exchange or one network on-chain, and the view and the filters of
// the on-chain table. Whatever is not exactly the documented shape is dropped on the way in, so a hand edited or older payload never breaks the page.
// A blocked or full storage changes nothing. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { DEFAULT_ONCHAIN_FILTERS } from "./onchain-model";
import { DEFAULT_UNIVERSE, UNIVERSE_KEY, enterUniverse, loadUniverse, parseUniverse, saveUniverse } from "./onchain-state";

const store = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("what is read back", () => {
  test("the default is the exchange, the first network and the overview", () => {
    expect(DEFAULT_UNIVERSE.universo).toBe("corretora");
    expect(DEFAULT_UNIVERSE.visao).toBe("geral");
    expect(DEFAULT_UNIVERSE.filtros).toEqual(DEFAULT_ONCHAIN_FILTERS);
    expect(/^\d{1,12}$/.test(DEFAULT_UNIVERSE.chainIndex)).toBe(true);
  });

  test("a good payload comes back as it was saved", () => {
    const saved = { universo: "onchain", chainIndex: "501", visao: "risco", filtros: { ...DEFAULT_ONCHAIN_FILTERS, busca: "bonk", volUsdMin: 10_000, riscoMax: 3 }, ordenacao: { key: "liquidez", dir: "asc" } };
    expect(parseUniverse(saved)).toEqual(saved);
  });

  test("anything off the shape falls back to the default, field by field: a bad view does not throw away a good network", () => {
    expect(parseUniverse(null)).toEqual(DEFAULT_UNIVERSE);
    expect(parseUniverse("x")).toEqual(DEFAULT_UNIVERSE);
    expect(parseUniverse([])).toEqual(DEFAULT_UNIVERSE);
    const mixed = parseUniverse({ universo: "onchain", chainIndex: "8453", visao: "tudo", filtros: "no", ordenacao: { key: "nope", dir: "up" } });
    expect(mixed.universo).toBe("onchain");
    expect(mixed.chainIndex).toBe("8453");
    expect(mixed.visao).toBe("geral");
    expect(mixed.filtros).toEqual(DEFAULT_ONCHAIN_FILTERS);
    expect(mixed.ordenacao).toEqual(DEFAULT_UNIVERSE.ordenacao);
  });

  test("the network is a plain index: a path, a script or an oversized text is refused", () => {
    for (const bad of ["../1", "<script>", "", "x".repeat(21), "1 2", "01a", 501, null]) expect(parseUniverse({ chainIndex: bad }).chainIndex).toBe(DEFAULT_UNIVERSE.chainIndex);
  });

  test("the filters are numbers or null, the search is cut, and a text where a number goes is dropped", () => {
    const f = parseUniverse({ filtros: { busca: "x".repeat(200), volUsdMin: "100", liquidezMin: -5, holdersMin: 40, carteirasMin: Number.NaN, varMin: -3, varMax: 99, riscoMax: 9, extra: 1 } }).filtros;
    expect(f.busca.length).toBeLessThanOrEqual(40);
    expect(f.volUsdMin).toBeNull();
    expect(f.liquidezMin).toBeNull();
    expect(f.holdersMin).toBe(40);
    expect(f.carteirasMin).toBeNull();
    expect(f.varMin).toBe(-3);
    expect(f.varMax).toBe(99);
    expect(f.riscoMax).toBeNull();
    expect(Object.keys(f).sort()).toEqual(Object.keys(DEFAULT_ONCHAIN_FILTERS).sort());
  });
});

describe("the storage", () => {
  test("save then load gives back the network, the view, the filters and the sort, under the documented key; the page always OPENS on the exchange", () => {
    const s = store();
    const state = { ...DEFAULT_UNIVERSE, universo: "onchain" as const, chainIndex: "56", visao: "risco" as const };
    saveUniverse(s, state);
    expect(s.data.has(UNIVERSE_KEY)).toBe(true);
    // opening the page on-chain would read the provider without a click: the choice of the universe is a click, every time
    expect(loadUniverse(s)).toEqual({ ...state, universo: "corretora" });
  });

  test("clicking the universe that is already open changes nothing, not even the view the person is on", () => {
    const open = { ...DEFAULT_UNIVERSE, universo: "onchain" as const, visao: "smart" as const };
    expect(enterUniverse(open, "onchain")).toBe(open);
    const exchange = { ...DEFAULT_UNIVERSE };
    expect(enterUniverse(exchange, "corretora")).toBe(exchange);
  });

  test("entering the on-chain universe is a click that never reads the signals by itself: the Smart money view is opened by its own click", () => {
    expect(enterUniverse({ ...DEFAULT_UNIVERSE, visao: "smart" }, "onchain")).toMatchObject({ universo: "onchain", visao: "geral" });
    expect(enterUniverse({ ...DEFAULT_UNIVERSE, visao: "risco" }, "onchain")).toMatchObject({ universo: "onchain", visao: "risco" });
    expect(enterUniverse({ ...DEFAULT_UNIVERSE, universo: "onchain", visao: "smart" }, "corretora")).toMatchObject({ universo: "corretora", visao: "smart" });
  });

  test("no storage, a blocked storage and a corrupt payload all give the default and never throw", () => {
    expect(loadUniverse(null)).toEqual(DEFAULT_UNIVERSE);
    expect(loadUniverse(store({ [UNIVERSE_KEY]: "{not json" }))).toEqual(DEFAULT_UNIVERSE);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(loadUniverse(blocked)).toEqual(DEFAULT_UNIVERSE);
    expect(() => saveUniverse(blocked, DEFAULT_UNIVERSE)).not.toThrow();
    expect(() => saveUniverse(null, DEFAULT_UNIVERSE)).not.toThrow();
  });

  test("the key does not collide with the saved screens or the work of the exchange table", () => {
    expect(UNIVERSE_KEY).not.toBe("inonu.screens.v1");
    expect(UNIVERSE_KEY).not.toBe("inonu.rastreador.v1");
  });
});
