import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FORBIDDEN_TEXT } from "./mesa-model";
import { applyPalette, normalizePalette, PALETTE_BOOT_SCRIPT, PALETTE_KEY, PALETTES, readStoredPalette } from "./preferences";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key), data };
};

describe("palette preference", () => {
  test("offers the default, a colour-blind safe pair and the inverted pair, each said in words", () => {
    expect(PALETTES.map((p) => p.id)).toEqual(["padrao", "daltonismo", "invertido"]);
    for (const palette of PALETTES) {
      expect(palette.hint.length).toBeGreaterThan(10);
      expect(`${palette.label} ${palette.hint}`).not.toMatch(FORBIDDEN_TEXT);
      expect(palette.up).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.down).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette.up).not.toBe(palette.down);
    }
  });

  test("anything unknown or unreadable falls back to the default and never throws", () => {
    expect(normalizePalette("daltonismo")).toBe("daltonismo");
    expect(normalizePalette("invertido")).toBe("invertido");
    for (const raw of [null, undefined, "", "padrao", "roxo", 3, {}, "DALTONISMO"]) expect(normalizePalette(raw)).toBe("padrao");
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(readStoredPalette(broken)).toBe("padrao");
    expect(readStoredPalette(null)).toBe("padrao");
  });

  test("applying a palette sets the attribute on the document and stores it; the default clears both", () => {
    const storage = memoryStorage();
    const root = { dataset: {} as Record<string, string | undefined> };
    applyPalette("daltonismo", root, storage);
    expect(root.dataset.palette).toBe("daltonismo");
    expect(storage.data.get(PALETTE_KEY)).toBe("daltonismo");
    applyPalette("padrao", root, storage);
    expect(root.dataset.palette).toBeUndefined();
    expect(storage.data.has(PALETTE_KEY)).toBe(false);
    const blocked = { setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => applyPalette("invertido", root, blocked)).not.toThrow();
    expect(root.dataset.palette).toBe("invertido");
  });

  test("the boot script is tiny, guarded and sets only known palettes before paint", () => {
    expect(PALETTE_BOOT_SCRIPT).toContain(PALETTE_KEY);
    expect(PALETTE_BOOT_SCRIPT).toContain("try");
    expect(PALETTE_BOOT_SCRIPT).toContain("daltonismo");
    expect(PALETTE_BOOT_SCRIPT).toContain("invertido");
    expect(PALETTE_BOOT_SCRIPT.length).toBeLessThan(400);
    expect(PALETTE_BOOT_SCRIPT).not.toMatch(FORBIDDEN_TEXT);
  });

  test("the stylesheet overrides --buy and --sell with exactly the colours the menu shows", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    for (const palette of PALETTES.filter((p) => p.id !== "padrao")) {
      const block = new RegExp(`:root\\[data-palette="${palette.id}"\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(block).toContain(`--buy: ${palette.up}`);
      expect(block).toContain(`--sell: ${palette.down}`);
    }
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const standard = PALETTES.find((p) => p.id === "padrao")!;
    expect(root).toContain(`--buy: ${standard.up}`);
    expect(root).toContain(`--sell: ${standard.down}`);
  });
});
