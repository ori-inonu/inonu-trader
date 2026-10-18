// DOC-4, INF-1: Radar and Mercado bruto hold several views behind chips. The chosen view of each is remembered on this machine, an
// older saved dock (nine tabs) opens on the view that used to be a tab, and only the view that is chosen mounts a body.
import { describe, expect, test } from "bun:test";
import { DOCK_KEY } from "./dock";
import {
  DEFAULT_SUBS,
  DOCK_SUBS_KEY,
  DOCK_SUBVIEWS,
  isSubView,
  loadSubs,
  loadSubsMigrating,
  migrateSubs,
  parseSubs,
  saveSubs,
  subsFromLegacy,
} from "./dock-subviews";

const mem = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
};

describe("the views inside the two composite tabs", () => {
  test("Radar: Melhores, Ecossistema, Onde comprar, Zonas, Traders, Holders, Lancamentos, Pares OKX (no news: nobody decides from a headline); Mercado bruto: Fita, Livro, Liquidez", () => {
    expect(DOCK_SUBVIEWS.radar.map((v) => v.label)).toEqual(["Melhores", "Ecossistema", "Onde comprar", "Zonas", "Traders", "Holders", "Lancamentos", "Pares OKX"]);
    expect(DOCK_SUBVIEWS.mercado.map((v) => v.label)).toEqual(["Fita", "Livro", "Liquidez"]);
  });

  test("ids are unique inside a tab and the defaults are views that exist", () => {
    for (const tab of ["radar", "mercado"] as const) {
      const ids = DOCK_SUBVIEWS[tab].map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(DEFAULT_SUBS[tab]);
    }
  });

  test("the raw market starts on the tape and the radar on the best opportunities of the ecosystem", () => {
    expect(DEFAULT_SUBS).toEqual({ radar: "melhores", mercado: "fita" });
  });

  test("isSubView is exact: a view of the other tab, an unknown id and a non string are not views", () => {
    expect(isSubView("radar", "smart")).toBe(true);
    expect(isSubView("mercado", "livro")).toBe(true);
    expect(isSubView("radar", "livro")).toBe(false);
    expect(isSubView("mercado", "smart")).toBe(false);
    expect(isSubView("radar", "__proto__")).toBe(false);
    expect(isSubView("radar", 7)).toBe(false);
  });

  test("no label carries a middle dot, a dash or an accent", () => {
    for (const view of [...DOCK_SUBVIEWS.radar, ...DOCK_SUBVIEWS.mercado]) {
      expect(view.label).not.toMatch(/[·—–]/);
      expect(view.label).toBe(view.label.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    }
  });
});

describe("what is remembered", () => {
  test("a corrupted payload falls back view by view", () => {
    expect(parseSubs(null)).toEqual(DEFAULT_SUBS);
    expect(parseSubs("texto")).toEqual(DEFAULT_SUBS);
    expect(parseSubs([])).toEqual(DEFAULT_SUBS);
    expect(parseSubs({ radar: "holders", mercado: "livro" })).toEqual({ radar: "holders", mercado: "livro" });
    expect(parseSubs({ radar: "livro", mercado: 5 })).toEqual(DEFAULT_SUBS);
    expect(parseSubs({ radar: "traders" })).toEqual({ radar: "traders", mercado: "fita" });
  });

  test("load and save roundtrip, a blocked or broken storage only loses the memory", () => {
    const storage = mem();
    saveSubs({ radar: "traders", mercado: "liquidez" }, storage);
    expect(JSON.parse(storage.map.get(DOCK_SUBS_KEY)!)).toEqual({ radar: "traders", mercado: "liquidez" });
    expect(loadSubs(storage)).toEqual({ radar: "traders", mercado: "liquidez" });
    expect(loadSubs(mem({ [DOCK_SUBS_KEY]: "{nao e json" }))).toEqual(DEFAULT_SUBS);
    expect(loadSubs(null)).toEqual(DEFAULT_SUBS);
    expect(() => saveSubs({ radar: "oportunidades", mercado: "fita" }, { setItem: () => { throw new Error("cheio"); } })).not.toThrow();
  });

  test("an older saved dock opens on the view that used to be the tab, and a tab that was never one of the nine changes nothing", () => {
    expect(subsFromLegacy("livro", DEFAULT_SUBS)).toEqual({ radar: "melhores", mercado: "livro" });
    expect(subsFromLegacy("traders", DEFAULT_SUBS)).toEqual({ radar: "traders", mercado: "fita" });
    // the old Ecossistema tab (news and sentiment) went to Onde comprar, not to the new Oportunidades view
    expect(subsFromLegacy("ecossistema", DEFAULT_SUBS)).toEqual({ radar: "smart", mercado: "fita" });
    // not a tab of the old dock: nothing changes
    expect(subsFromLegacy("carteira", { radar: "holders", mercado: "livro" })).toEqual({ radar: "holders", mercado: "livro" });
    expect(subsFromLegacy(undefined, DEFAULT_SUBS)).toEqual(DEFAULT_SUBS);
  });

  test("the migration is written once, so it survives the person clicking another dock tab (which rewrites the dock and loses the old tab id)", () => {
    const storage = mem({ [DOCK_KEY]: JSON.stringify({ open: true, tab: "livro", heightPct: 30 }) });
    expect(migrateSubs(storage)).toEqual({ radar: "melhores", mercado: "livro" });
    expect(JSON.parse(storage.map.get(DOCK_SUBS_KEY)!)).toEqual({ radar: "melhores", mercado: "livro" });
    // the person clicks another tab: the stored dock now says "carteira", and the old tab id is gone
    storage.map.set(DOCK_KEY, JSON.stringify({ open: true, tab: "carteira", heightPct: 30 }));
    expect(loadSubsMigrating(storage)).toEqual({ radar: "melhores", mercado: "livro" });
  });

  test("a saved choice is never overwritten by the migration, and a fresh install saves nothing it did not need to", () => {
    const saved = mem({ [DOCK_KEY]: JSON.stringify({ tab: "livro" }), [DOCK_SUBS_KEY]: JSON.stringify({ radar: "traders", mercado: "fita" }) });
    expect(migrateSubs(saved)).toEqual({ radar: "traders", mercado: "fita" });
    expect(JSON.parse(saved.map.get(DOCK_SUBS_KEY)!)).toEqual({ radar: "traders", mercado: "fita" });
    const fresh = mem();
    expect(migrateSubs(fresh)).toEqual(DEFAULT_SUBS);
    expect(fresh.map.has(DOCK_SUBS_KEY)).toBe(false);
    expect(migrateSubs(null)).toEqual(DEFAULT_SUBS);
  });

  test("loading with migration: a dock saved by the nine tab desk opens its old view, but a saved choice of views always wins", () => {
    expect(loadSubsMigrating(mem({ [DOCK_KEY]: JSON.stringify({ open: true, tab: "liquidez", heightPct: 30 }) }))).toEqual({ radar: "melhores", mercado: "liquidez" });
    expect(loadSubsMigrating(mem({ [DOCK_KEY]: JSON.stringify({ tab: "holders" }) }))).toEqual({ radar: "holders", mercado: "fita" });
    const both = mem({ [DOCK_KEY]: JSON.stringify({ tab: "livro" }), [DOCK_SUBS_KEY]: JSON.stringify({ radar: "traders", mercado: "fita" }) });
    expect(loadSubsMigrating(both)).toEqual({ radar: "traders", mercado: "fita" });
    // nothing saved, a dock saved on a tab that has always existed, a broken dock, no storage
    expect(loadSubsMigrating(mem())).toEqual(DEFAULT_SUBS);
    expect(loadSubsMigrating(mem({ [DOCK_KEY]: JSON.stringify({ tab: "carteira" }) }))).toEqual(DEFAULT_SUBS);
    expect(loadSubsMigrating(mem({ [DOCK_KEY]: "{nao e json" }))).toEqual(DEFAULT_SUBS);
    expect(loadSubsMigrating(null)).toEqual(DEFAULT_SUBS);
  });
});