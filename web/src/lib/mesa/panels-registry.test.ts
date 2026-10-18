// INF-3, AC-INF-1, T10.4: no panel, tab or route exists on the desk without a requirement behind it. The registry lists every one with
// the id of the requirement that asks for it in docs/sdd/inonu-desktop-v1/SPEC.md; this test fails when a route, a dock tab or a
// panel component appears without an entry, when an entry points at something that no longer exists, or when the requirement id is
// not in the SPEC. Tabs also carry the most rows they may show without opening a drawer (INF-1).
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DOCK_TABS } from "./dock";
import { FLOW_ROWS_MAX, ZONE_ROWS_MAX } from "./flow-tab-model";
import { MAX_ROWS_PER_TAB, PANEL_REGISTRY, type RegistryEntry } from "./panels-registry";

const WEB_SRC = resolve(import.meta.dir, "../..");
const ROOT = resolve(import.meta.dir, "../../../..");
/** The requirements of the desk and those of the autonomous agent (its screen is the home of the app). */
const SPECS = [join(ROOT, "docs/sdd/inonu-desktop-v1/SPEC.md"), join(ROOT, "docs/sdd/agente-autonomo/SPEC.md")];

const idsOf = (kind: RegistryEntry["kind"]) => PANEL_REGISTRY.filter((e) => e.kind === kind).map((e) => e.id).sort();

function routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (existsSync(join(dir, "page.tsx"))) out.push(prefix === "" ? "/" : prefix);
    for (const name of readdirSync(dir)) {
      const child = join(dir, name);
      if (statSync(child).isDirectory()) walk(child, `${prefix}/${name}`);
    }
  };
  walk(join(WEB_SRC, "app"), "");
  return out.sort();
}

/** The panel components the desk exports: capitalised names in panels/index.ts, minus the frame they all share. */
function panelComponents(): string[] {
  const text = readFileSync(join(WEB_SRC, "components/Desk/panels/index.ts"), "utf8");
  const names = new Set<string>();
  for (const match of text.matchAll(/^export \{([^}]+)\} from/gm)) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()!.trim();
      if (/^[A-Z][A-Za-z]+$/.test(name) && !["PanelEmpty", "PanelFrame"].includes(name)) names.add(name);
    }
  }
  return [...names].sort();
}

describe("every route, tab and panel has a requirement", () => {
  test("every route of the app is in the registry, and so is nothing that does not exist", () => {
    expect(idsOf("rota")).toEqual(routes());
  });

  test("every tab of the dock is in the registry, and so is nothing that does not exist", () => {
    expect(idsOf("aba")).toEqual(DOCK_TABS.map((t) => t.id).sort());
  });

  test("every panel component of the desk is in the registry, and so is nothing that does not exist", () => {
    expect(idsOf("painel")).toEqual(panelComponents());
  });

  test("every entry names a requirement that is in the SPEC", () => {
    const spec = SPECS.map((file) => readFileSync(file, "utf8")).join("\n");
    const known = new Set([...spec.matchAll(/^\| ([A-Z]{3}-\d+) \|/gm)].map((m) => m[1]!));
    expect(known.size).toBeGreaterThan(100);
    for (const entry of PANEL_REGISTRY) expect(known.has(entry.requisito)).toBe(true);
  });

  test("no entry appears twice", () => {
    const keys = PANEL_REGISTRY.map((e) => `${e.kind}:${e.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("what a tab may show without opening a drawer (INF-1)", () => {
  test("every tab of the dock has a budget of rows, and none is above the documented twelve", () => {
    expect(MAX_ROWS_PER_TAB).toBe(12);
    for (const entry of PANEL_REGISTRY.filter((e) => e.kind === "aba")) {
      expect(entry.maxLinhas).toBeGreaterThan(0);
      expect(entry.maxLinhas!).toBeLessThanOrEqual(MAX_ROWS_PER_TAB);
    }
  });

  test("the two tabs built from the flow engine cap their rows at the budget of the registry", () => {
    const budget = (id: string) => PANEL_REGISTRY.find((e) => e.kind === "aba" && e.id === id)!.maxLinhas!;
    expect(FLOW_ROWS_MAX).toBeLessThanOrEqual(budget("fluxo"));
    expect(ZONE_ROWS_MAX).toBeLessThanOrEqual(budget("radar"));
  });

  // What this does NOT check: the raw market (tape up to 100 prints, book 15 levels a side) and the on-chain tables are scrolling tables
  // whose visible rows are set by the height of the dock (about seven at the default height), not by a row cap. The budget is enforced
  // in code only where the rows are built from the engine reading, above.
});
