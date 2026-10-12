import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FORBIDDEN_TEXT } from "./mesa-model";
import { applyLayout, LAYOUT_BOOT_SCRIPT, LAYOUT_KEY, LAYOUT_LABEL, normalizeLayout, readStoredLayout } from "./layout";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key), data };
};

describe("layout preference (chart mode)", () => {
  test("only the chart mode is stored; anything else is the full desk and never throws", () => {
    expect(normalizeLayout("grafico")).toBe("grafico");
    for (const raw of [null, undefined, "", "completo", "GRAFICO", "tela", 1, {}]) expect(normalizeLayout(raw)).toBe("completo");
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(readStoredLayout(broken)).toBe("completo");
    expect(readStoredLayout(null)).toBe("completo");
    const storage = memoryStorage();
    storage.setItem(LAYOUT_KEY, "grafico");
    expect(readStoredLayout(storage)).toBe("grafico");
  });

  test("applying sets the attribute the stylesheet reads and stores it; the full desk clears both", () => {
    const storage = memoryStorage();
    const root = { dataset: {} as Record<string, string | undefined> };
    applyLayout("grafico", root, storage);
    expect(root.dataset.layout).toBe("grafico");
    expect(storage.data.get(LAYOUT_KEY)).toBe("grafico");
    applyLayout("completo", root, storage);
    expect(root.dataset.layout).toBeUndefined();
    expect(storage.data.has(LAYOUT_KEY)).toBe(false);
    const blocked = { setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => applyLayout("grafico", root, blocked)).not.toThrow();
    expect(root.dataset.layout).toBe("grafico");
  });

  test("the labels say each state in words", () => {
    expect(LAYOUT_LABEL.completo).toBe("Modo grafico");
    expect(LAYOUT_LABEL.grafico).toBe("Voltar a mesa completa");
    for (const label of Object.values(LAYOUT_LABEL)) expect(label).not.toMatch(FORBIDDEN_TEXT);
  });

  test("the boot script is tiny, guarded and sets only the known mode before paint", () => {
    expect(LAYOUT_BOOT_SCRIPT).toContain(LAYOUT_KEY);
    expect(LAYOUT_BOOT_SCRIPT).toContain("try");
    expect(LAYOUT_BOOT_SCRIPT).toContain("grafico");
    expect(LAYOUT_BOOT_SCRIPT.length).toBeLessThan(300);
    expect(LAYOUT_BOOT_SCRIPT).not.toMatch(FORBIDDEN_TEXT);
  });

  test("the stylesheet hides the book, tape, watchlist and flow wings only in chart mode and only above the phone breakpoint", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const media = /@media \(min-width: 821px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(media).toContain(':root[data-layout="grafico"]');
    expect(media).toContain('[data-slot="livro"]');
    expect(media).toContain('[data-slot="fluxo"]');
    expect(media).toContain("display: none");
    expect(media).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
