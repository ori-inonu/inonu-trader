import { describe, expect, test } from "bun:test";
import {
  DOCK_DEFAULT_PCT,
  DOCK_KEY,
  DOCK_MAX_PCT,
  DOCK_MIN_PX,
  DOCK_TABS,
  clampHeightPct,
  defaultDock,
  dockHeightPx,
  dragHeightPct,
  legacyPlacement,
  loadDock,
  parseDock,
  saveDock,
  selectDockTab,
  stepHeightPct,
} from "./dock";

const mem = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
};

describe("dock model", () => {
  test("selecting a known tab reveals a collapsed dock and preserves its chosen height", () => {
    const storage = mem();
    const next = selectDockTab({ open: false, tab: "diario", heightPct: 42 }, "carteira");
    expect(next).toEqual({ open: true, tab: "carteira", heightPct: 42 });
    saveDock(next, storage);
    expect(loadDock(storage)).toEqual(next);
  });

  test("selecting the current tab reveals it, while an unknown tab leaves the dock unchanged", () => {
    const closed = { open: false, tab: "radar", heightPct: 31 };
    expect(selectDockTab(closed, "radar")).toEqual({ ...closed, open: true });
    expect(selectDockTab(closed, "unknown")).toBe(closed);
  });

  test("defaults: open, the Inonu tab first, 26 percent", () => {
    expect(defaultDock()).toEqual({ open: true, tab: "diario", heightPct: DOCK_DEFAULT_PCT });
  });

  test("the dock has five tabs in the documented order (DOC-4): Inonu, Radar, Fluxo, Carteira, Mercado (the raw market reads as a card in the simple desk)", () => {
    expect(DOCK_TABS.map((t) => t.label)).toEqual(["Inonu", "Radar", "Fluxo", "Carteira", "Mercado"]);
    expect(DOCK_TABS.map((t) => t.id)).toEqual(["diario", "radar", "fluxo", "carteira", "mercado"]);
    expect(new Set(DOCK_TABS.map((t) => t.id)).size).toBe(5);
  });

  test("on a phone the raw market and the flow sit in the book section, the rest in the sources section", () => {
    const groupOf = (id: string) => DOCK_TABS.find((t) => t.id === id)!.group;
    expect(["fluxo", "mercado"].map(groupOf)).toEqual(["livro", "livro"]);
    expect(["diario", "radar", "carteira"].map(groupOf)).toEqual(["fontes", "fontes", "fontes"]);
  });

  test("the ids of the nine old tabs are not tabs any more, but a stored one lands on the tab that now holds it", () => {
    for (const old of ["fita", "livro", "liquidez", "smart", "traders", "holders", "ecossistema"]) {
      expect(DOCK_TABS.some((t) => t.id === old)).toBe(false);
      expect(DOCK_TABS.some((t) => t.id === legacyPlacement(old)?.tab)).toBe(true);
    }
    expect(legacyPlacement("fita")).toEqual({ tab: "mercado", sub: "fita" });
    expect(legacyPlacement("livro")).toEqual({ tab: "mercado", sub: "livro" });
    expect(legacyPlacement("liquidez")).toEqual({ tab: "mercado", sub: "liquidez" });
    expect(legacyPlacement("smart")).toEqual({ tab: "radar", sub: "smart" });
    expect(legacyPlacement("traders")).toEqual({ tab: "radar", sub: "traders" });
    expect(legacyPlacement("holders")).toEqual({ tab: "radar", sub: "holders" });
    expect(legacyPlacement("ecossistema")).toEqual({ tab: "radar", sub: "smart" });
    // the tabs that kept their ids, and anything unknown, are not legacy
    expect(legacyPlacement("diario")).toBeNull();
    expect(legacyPlacement("carteira")).toBeNull();
    expect(legacyPlacement("inexistente")).toBeNull();
    expect(legacyPlacement(42)).toBeNull();
    expect(legacyPlacement("__proto__")).toBeNull();
  });

  test("a stored value from the nine tab dock opens the tab that holds the old one", () => {
    expect(parseDock({ open: false, tab: "livro", heightPct: 40 })).toEqual({ open: false, tab: "mercado", heightPct: 40 });
    expect(parseDock({ tab: "smart" }).tab).toBe("radar");
    expect(parseDock({ tab: "ecossistema" }).tab).toBe("radar");
    expect(parseDock({ tab: "diario" }).tab).toBe("diario");
  });

  test("a corrupted payload falls back field by field", () => {
    expect(parseDock(null)).toEqual(defaultDock());
    expect(parseDock("texto")).toEqual(defaultDock());
    expect(parseDock([])).toEqual(defaultDock());
    expect(parseDock({ open: false, tab: "carteira", heightPct: 40 })).toEqual({ open: false, tab: "carteira", heightPct: 40 });
    expect(parseDock({ open: "sim", tab: 42, heightPct: "alta" })).toEqual(defaultDock());
  });

  test("the journal tab is Inonu now (ASK-9, ASK-10): same id so stored preferences keep working, no old name", () => {
    const tab = DOCK_TABS.find((t) => t.id === "diario");
    expect(tab?.label).toBe("Inonu");
    expect(DOCK_TABS.map((t) => t.label)).not.toContain("Diario do Jev");
  });

  test("an unknown tab goes back to the first tab", () => {
    expect(parseDock({ tab: "inexistente" }).tab).toBe(DOCK_TABS[0].id);
    expect(parseDock({ tab: "smart-money" }).tab).toBe("diario");
  });

  test("an out of range height is clamped", () => {
    expect(parseDock({ heightPct: 200 }).heightPct).toBe(DOCK_MAX_PCT);
    expect(parseDock({ heightPct: 0 }).heightPct).toBe(8);
    expect(clampHeightPct(Number.NaN)).toBe(DOCK_DEFAULT_PCT);
  });

  test("height in px honours the 190 floor and the 55 percent cap", () => {
    expect(dockHeightPx(26, 1000)).toBe(260);
    expect(dockHeightPx(10, 4000)).toBe(400); // 10% de 4000 = 400, dentro do teto
    expect(dockHeightPx(8, 1000)).toBe(DOCK_MIN_PX); // 80 px < 190 sobe ao piso
    expect(dockHeightPx(55, 1000)).toBe(550);
    expect(dockHeightPx(26, 0)).toBe(DOCK_MIN_PX);
    expect(dockHeightPx(26, Number.NaN)).toBe(DOCK_MIN_PX);
  });

  test("keyboard step moves two percent points and respects the cap and floor", () => {
    expect(stepHeightPct(26, 1, 1000)).toBe(28);
    expect(stepHeightPct(26, -1, 1000)).toBe(24);
    expect(stepHeightPct(54, 1, 1000)).toBe(55);
    expect(stepHeightPct(55, 1, 1000)).toBe(55);
    // 900 px window, piso 190 px = 21,11%: um passo abaixo de 22 para no piso.
    const down = stepHeightPct(22, -1, 900);
    expect(dockHeightPx(down, 900)).toBe(DOCK_MIN_PX);
  });

  test("dragging up grows the dock, dragging down shrinks it", () => {
    expect(dragHeightPct(26, 500, 400, 1000)).toBe(36); // 100 px para cima = +10%
    expect(dragHeightPct(26, 500, 600, 1000)).toBe(19); // 16% seriam 160 px, o piso devolve 19%
    expect(dragHeightPct(26, 500, 0, 1000)).toBe(55); // limitado no teto
    expect(dragHeightPct(26, 500, 5000, 1000)).toBeCloseTo(19, 0); // limitado no piso de 190 px
    expect(dragHeightPct(26, 500, 400, 0)).toBe(26); // janela desconhecida nao move
  });

  test("load and save roundtrip; invalid JSON returns defaults", () => {
    const storage = mem();
    saveDock({ open: false, tab: "mercado", heightPct: 33 }, storage);
    expect(JSON.parse(storage.map.get(DOCK_KEY)!)).toEqual({ open: false, tab: "mercado", heightPct: 33 });
    expect(loadDock(storage)).toEqual({ open: false, tab: "mercado", heightPct: 33 });
    expect(loadDock(mem({ [DOCK_KEY]: "{nao e json" }))).toEqual(defaultDock());
    expect(loadDock(null)).toEqual(defaultDock());
    saveDock({ open: true, tab: "diario", heightPct: 999 }, storage);
    expect(loadDock(storage).heightPct).toBe(DOCK_MAX_PCT);
  });
});
