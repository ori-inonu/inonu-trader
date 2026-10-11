import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { ENDPOINTS } from "./endpoints.ts";
import { FIXTURES } from "./fixtures.ts";

// Keeps the specification (docs/OKX-ONCHAINOS-DADOS-SPEC.md), the endpoint registry, the R6 catalog, the fixtures and the
// tests in agreement. See criteria D25, D26 and D27 (and the label part of D10).

const directory = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const spec = readFileSync(join(root, "docs", "OKX-ONCHAINOS-DADOS-SPEC.md"), "utf8");
const catalog = JSON.parse(readFileSync(join(root, "docs", "research", "R6-onchain-os-catalogo.json"), "utf8")) as {
  items: Array<{ id: string; method: string | null; path: string | null; tier: string; docUrl: string | null; repoCoverage: { file: string; mode: string } | null }>;
};

function tableRows(): string[][] {
  return spec
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .map((line) => line.slice(1, line.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim()));
}

interface SpecEndpointRow {
  id: string;
  method: string;
  path: string;
  cells: string[];
}

function endpointRows(): SpecEndpointRow[] {
  const found: SpecEndpointRow[] = [];
  for (const cells of tableRows()) {
    const id = /^`([a-z][a-z0-9.\-]*)`$/.exec(cells[0] ?? "");
    const route = /^(GET|POST) `(\/api\/[^`]+)`$/.exec(cells[1] ?? "");
    if (id !== null && route !== null) found.push({ id: id[1] as string, method: route[1] as string, path: route[2] as string, cells });
  }
  return found;
}

const FAMILY_FILE: Record<string, string> = {
  "market-price": "src/onchainos/market-price.ts",
  "market-token": "src/onchainos/market-token.ts",
  signals: "src/onchainos/signals.ts",
  social: "src/onchainos/social.ts",
  gateway: "src/onchainos/gateway.ts",
  defi: "src/onchainos/defi-read.ts",
  "public-okx": "src/onchainos/public-okx.ts",
};

describe("spec: registry, tables and catalog", () => {
  test("D25: every registry endpoint has a row in the specification with the same method, path and tier (or documented limit), and no row is extra", () => {
    const rows = endpointRows();
    expect(rows.length).toBe(ENDPOINTS.length);
    for (const endpoint of ENDPOINTS) {
      const row = rows.find((entry) => entry.id === endpoint.id);
      expect(row, `sem linha para ${endpoint.id}`).toBeDefined();
      expect(row!.method, endpoint.id).toBe(endpoint.method);
      expect(row!.path, endpoint.id).toBe(endpoint.path);
      if (endpoint.family === "public-okx") expect(row!.cells[2], endpoint.id).toContain(`${endpoint.limitPer2s} por 2 s`);
      else expect(row!.cells[2], endpoint.id).toBe(endpoint.tier);
    }
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  test("D25: the registry agrees with the R6 catalog on path, method, tier and page, and every entry is a read", () => {
    let matched = 0;
    for (const endpoint of ENDPOINTS) {
      expect(endpoint.method === "GET" || endpoint.method === "POST").toBe(true);
      if (endpoint.catalogId === null) continue;
      const item = catalog.items.find((entry) => entry.id === endpoint.catalogId);
      expect(item, `catálogo sem ${endpoint.catalogId}`).toBeDefined();
      matched += 1;
      if (endpoint.family === "public-okx") {
        expect((item!.path ?? "").startsWith(endpoint.path) || (item!.path ?? "").includes(endpoint.path.split("/").slice(-1)[0] as string)).toBe(true);
        continue;
      }
      expect(item!.method, endpoint.id).toBe(endpoint.method);
      expect(item!.path, endpoint.id).toBe(endpoint.path);
      expect(item!.tier, endpoint.id).toBe(endpoint.tier);
      expect(item!.docUrl, endpoint.id).toBe(endpoint.docUrl);
    }
    expect(matched).toBe(37);
  });

  test("D25: every catalog item that has a registry endpoint now points at its module, and every file it names exists", () => {
    for (const endpoint of ENDPOINTS) {
      if (endpoint.catalogId === null) continue;
      const item = catalog.items.find((entry) => entry.id === endpoint.catalogId)!;
      expect(item.repoCoverage, endpoint.catalogId).not.toBeNull();
      expect(item.repoCoverage!.mode, endpoint.catalogId).toBe("somente_leitura");
      const files = item.repoCoverage!.file.split(";").map((value) => value.trim());
      expect(files, endpoint.catalogId).toContain(FAMILY_FILE[endpoint.family]);
      for (const file of files) expect(existsSync(join(root, file)), `${endpoint.catalogId}: ${file}`).toBe(true);
    }
  });

  test("D25: the catalog still does not claim coverage for the security scans or any item that moves funds or prepares data to sign", () => {
    for (const item of catalog.items) {
      if (item.id.startsWith("security.")) expect(item.repoCoverage, item.id).toBeNull();
      if (/^(trade\.(swap|intent|solver)|defi\.transaction|agentic\.|payments\.)/.test(item.id)) {
        expect(item.repoCoverage === null || !item.repoCoverage.file.includes("src/onchainos/"), item.id).toBe(true);
      }
    }
  });

  test("D25: the specification lists the blocked security paths and says why they are not implemented", () => {
    for (const path of ["token-scan", "dapp-scan", "transaction-scan/evm", "transaction-scan/sol", "approval-mng", "sign-message-check"]) expect(spec).toContain(path);
    expect(spec).toMatch(/Bloqueados \(segurança\)/);
    expect(spec).toMatch(/falsa segurança/);
    expect(spec).toMatch(/Não implementados, com motivo/);
  });

  test("D10: the unit labels exist as types, the specification explains them and the undeclared output units are nowhere", () => {
    const values = readFileSync(join(directory, "values.ts"), "utf8");
    for (const label of ["EpochMs", "EpochMsByExample", "UsdAmount", "PercentPoints", "PercentByExample", "FractionOfOne", "DecimalFraction", "AmbiguousScale", "CountUnits", "PriceQuoteUnknown", "AmountUnitUnknown", "WeiOrSun", "Microlamports", "DecimalText"]) {
      expect(values, label).toMatch(new RegExp(`export type ${label} = (?:number|string);`));
    }
    for (const word of ["PriceQuoteUnknown", "AmbiguousScale", "NAO declarada", "holdPercent", "toTokenAmount", "minReceiveAmount"]) expect(spec, word).toContain(word);
    for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))) {
      expect(/toTokenAmount|minReceiveAmount/.test(readFileSync(join(directory, name), "utf8")), name).toBe(false);
    }
  });
});

describe("spec: fixtures", () => {
  test("D26: every fixture declares its provenance, source and note, and none claims profit, return or edge", () => {
    const entries = Object.entries(FIXTURES);
    expect(entries.length).toBeGreaterThan(45);
    for (const [key, fixture] of entries) {
      expect(["doc-example", "live-keyless", "synthetic"], key).toContain(fixture.provenance);
      expect(typeof fixture.source === "string" && fixture.source.startsWith("https://"), key).toBe(true);
      expect(typeof fixture.note === "string" && fixture.note.length > 20, key).toBe(true);
      expect(Object.isFrozen(fixture), key).toBe(true);
      if (fixture.provenance === "doc-example") expect(fixture.source.startsWith("https://web3.okx.com/onchainos/dev-docs/"), key).toBe(true);
      if (fixture.provenance === "live-keyless") {
        expect(fixture.source.startsWith("https://www.okx.com/api/v5/"), key).toBe(true);
        expect(fixture.note, key).toContain("2026-10-11");
      }
      const rendered = `${fixture.note} ${JSON.stringify(fixture.body)}`;
      expect(/lucro|profit|vantagem comprovada|guaranteed|retorno garantido/i.test(rendered), key).toBe(false);
    }
  });

  test("D26: every registry endpoint has at least one fixture and the three provenances are all used", () => {
    for (const endpoint of ENDPOINTS) {
      expect(Object.keys(FIXTURES).some((key) => key.startsWith(endpoint.id)), `sem fixture para ${endpoint.id}`).toBe(true);
    }
    const provenances = new Set(Object.values(FIXTURES).map((fixture) => fixture.provenance));
    expect(provenances).toEqual(new Set(["doc-example", "live-keyless", "synthetic"]));
  });

  test("D26: the specification explains the three provenances and warns that the pages were summarised by a tool", () => {
    for (const word of ["doc-example", "live-keyless", "synthetic", "ferramenta que resume texto", "provam leitura"]) expect(spec, word).toContain(word);
  });
});

describe("spec: the criteria", () => {
  const testFiles = [
    ...readdirSync(directory).filter((name) => name.endsWith(".test.ts")).map((name) => ({ name, path: join(directory, name) })),
    { name: "onchainos-capture.test.ts", path: join(root, "scripts", "onchainos-capture.test.ts") },
  ];
  const idsByFile = new Map<string, Set<number>>();
  for (const file of testFiles) {
    const ids = new Set<number>();
    for (const match of readFileSync(file.path, "utf8").matchAll(/\btest\(\s*["'`]((?:D\d+[ ,]*)+):/g)) {
      for (const id of (match[1] as string).matchAll(/D(\d+)/g)) ids.add(Number(id[1]));
    }
    idsByFile.set(file.name, ids);
  }

  function criteria(): Array<{ id: number; files: string[]; behavior: string }> {
    return tableRows()
      .filter((cells) => /^D\d+$/.test(cells[0] ?? ""))
      .map((cells) => ({ id: Number((cells[0] as string).slice(1)), behavior: cells[1] ?? "", files: [...(cells[2] ?? "").matchAll(/`([a-z0-9.\-]+\.test\.ts)`/g)].map((match) => match[1] as string) }));
  }

  test("D27: the specification defines D1 to D27 once each, in order", () => {
    const found = criteria();
    expect(found.map((entry) => entry.id)).toEqual(Array.from({ length: 27 }, (_, index) => index + 1));
    for (const entry of found) expect(entry.behavior.length, `D${entry.id}`).toBeGreaterThan(40);
  });

  test("D27: every criterion is exercised by a test whose title starts with its identifier, in the files the specification names", () => {
    for (const entry of criteria()) {
      const everywhere = [...idsByFile.values()].some((ids) => ids.has(entry.id));
      expect(everywhere, `nenhum teste começa com D${entry.id}`).toBe(true);
      expect(entry.files.length, `D${entry.id} sem arquivo de teste na tabela`).toBeGreaterThan(0);
      for (const file of entry.files) {
        expect(idsByFile.has(file), `D${entry.id}: ${file} não existe`).toBe(true);
        expect(idsByFile.get(file)!.has(entry.id), `D${entry.id}: ${file} não tem teste com esse identificador`).toBe(true);
      }
    }
  });

  test("D27: the specification names exactly the files that hold tests with each identifier", () => {
    for (const entry of criteria()) {
      const holders = [...idsByFile].filter(([, ids]) => ids.has(entry.id)).map(([file]) => file).sort();
      expect([...entry.files].sort(), `D${entry.id}`).toEqual(holders);
    }
  });

  test("D27: no test title uses an identifier the specification does not define", () => {
    const defined = new Set(criteria().map((entry) => entry.id));
    for (const [file, ids] of idsByFile) {
      for (const id of ids) expect(defined.has(id), `${file}: D${id}`).toBe(true);
    }
  });
});
