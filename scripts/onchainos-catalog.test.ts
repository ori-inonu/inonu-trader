import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Contract test for docs/research/R6-onchain-os-catalogo.json, the machine-readable inventory of the OKX Onchain OS
// documentation. Other components (the ecosystem map in the console, the decision lab) read this file, so its shape must
// not drift silently. The test checks structure and internal consistency only; it does not certify that any endpoint exists.

const root = join(import.meta.dir, "..");
const path = join(root, "docs", "research", "R6-onchain-os-catalogo.json");
const raw = readFileSync(path, "utf8");

interface CatalogItem {
  id: string;
  family: string;
  name: string;
  method: string | null;
  path: string | null;
  purpose: string;
  auth: string;
  tier: string;
  class: string;
  chains: unknown;
  caveats: unknown;
  docUrl: string | null;
  docRead: unknown;
  r1Coverage: string;
  repoCoverage: { file: string; mode: string } | null;
  priority: string;
  safetyClass: string;
  blocker: unknown;
}
const catalog = JSON.parse(raw) as { generatedAt: string; sources: unknown[]; items: CatalogItem[] };

const FIELDS = ["id", "family", "name", "method", "path", "purpose", "auth", "tier", "class", "chains", "caveats", "docUrl", "docRead", "r1Coverage", "repoCoverage", "priority", "safetyClass", "blocker"];
const CLASSES = ["read", "prepares-calldata", "writes-or-moves-funds"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const SAFETY = ["automatable-readonly", "human-approval-required", "never-automate"];

describe("R6 Onchain OS catalog", () => {
  test("has the documented top-level shape and a plausible size", () => {
    expect(Object.keys(catalog).sort()).toEqual(["generatedAt", "items", "sources"]);
    expect(Number.isFinite(Date.parse(catalog.generatedAt))).toBe(true);
    expect(Array.isArray(catalog.sources) && catalog.sources.length > 0).toBe(true);
    expect(catalog.items.length).toBeGreaterThanOrEqual(400);
  });

  test("every item has exactly the 18 documented fields and unique ids", () => {
    const ids = new Set<string>();
    for (const item of catalog.items) {
      expect(Object.keys(item).sort()).toEqual([...FIELDS].sort());
      expect(typeof item.id === "string" && item.id.length > 0).toBe(true);
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    }
  });

  test("enumerations are closed", () => {
    for (const item of catalog.items) {
      expect({ id: item.id, ok: CLASSES.includes(item.class) }).toEqual({ id: item.id, ok: true });
      expect({ id: item.id, ok: PRIORITIES.includes(item.priority) }).toEqual({ id: item.id, ok: true });
      expect({ id: item.id, ok: SAFETY.includes(item.safetyClass) }).toEqual({ id: item.id, ok: true });
    }
  });

  test("an item that moves funds is never classified as automatable read-only", () => {
    for (const item of catalog.items.filter((entry) => entry.class === "writes-or-moves-funds")) {
      expect({ id: item.id, safety: item.safetyClass }).not.toEqual({ id: item.id, safety: "automatable-readonly" });
    }
  });

  test("every repository coverage points to files that exist", () => {
    const missing: string[] = [];
    for (const item of catalog.items) {
      if (!item.repoCoverage) continue;
      expect(typeof item.repoCoverage.mode === "string" && item.repoCoverage.mode.length > 0).toBe(true);
      for (const file of item.repoCoverage.file.split(";").map((value) => value.trim()).filter(Boolean)) {
        if (!existsSync(join(root, file))) missing.push(`${item.id}: ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("P0 items name their endpoint and the page they came from", () => {
    const p0 = catalog.items.filter((item) => item.priority === "P0");
    expect(p0.length).toBeGreaterThan(0);
    for (const item of p0) {
      expect({ id: item.id, path: typeof item.path === "string" && item.path.startsWith("/") }).toEqual({ id: item.id, path: true });
      expect({ id: item.id, url: typeof item.docUrl === "string" && item.docUrl.startsWith("https://") }).toEqual({ id: item.id, url: true });
    }
  });

  test("the file contains no em dash, en dash or middle dot and no obvious secret shape", () => {
    expect(raw.includes("—") || raw.includes("–") || raw.includes("·")).toBe(false);
    expect(/0x[0-9a-fA-F]{64}\b/.test(raw)).toBe(false);
    expect(/BEGIN (RSA|EC|OPENSSH) PRIVATE/.test(raw)).toBe(false);
  });
});
