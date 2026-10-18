import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { CATALOG, CATALOG_FAMILIES, STATUS_LABEL, TIER_NEEDED_LABEL } from "./ecosystem-catalog";
import { KURU_ALLOWLIST, NOT_VIABLE_TODAY, TIERS, TIER_STATE_LABEL } from "./permission-tiers";
import { BANNED_MARKS, ESCAPE_PATTERN, FORBIDDEN_TOKENS, findBannedMarks } from "./scan-helpers";

// The /central page is read only: no wallet, no signing, no sending, no network and nothing persisted.
// This file scans every file of the feature (the tests included) for what must never appear, and it scans the data that
// the page renders.

const WEB = resolve(import.meta.dir, "../../..");
const REPO = resolve(WEB, "..");
const LIB_DIR = join(WEB, "src/lib/central");
// Directories the feature owns. lib/central is the delivered part. components/central and app/central are the route
// itself, which is not built yet. listFiles returns an empty list for a directory that does not exist, so every scan
// below already covers those two the day they are added, without this file having to pretend they exist today.
const FEATURE_DIRS = [join(WEB, "src/components/central"), LIB_DIR, join(WEB, "src/app/central")];
// Files outside those directories that belong to the feature. They carry the navigation to the route and the guide of
// the route. Each is scanned as soon as it exists; none is asserted to exist before the route it belongs to is built,
// because the scan below is the guard and an existence assertion on a file that does not exist yet only fails.
const TEXT_ONLY_FILES = [
  join(WEB, "src/components/Header/Header.tsx"),
  join(WEB, "src/components/Header/Header.module.css"),
  join(REPO, "docs/okx-central-v1/GUIA.md"),
];

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) result.push(...listFiles(full));
    else result.push(full);
  }
  return result.sort();
}

const featureFiles = FEATURE_DIRS.flatMap(listFiles);
const display = (file: string) => relative(REPO, file).split(sep).join("/");

describe("the feature directories exist and are populated", () => {
  test("lib/central, the delivered part of the feature, holds files", () => {
    expect(listFiles(LIB_DIR).length).toBeGreaterThan(0);
  });

  // Every feature directory that does exist must be populated: an empty directory is a deleted feature, not an absent one.
  test("every feature directory that exists holds files", () => {
    for (const dir of FEATURE_DIRS.filter(existsSync)) expect(listFiles(dir).length).toBeGreaterThan(0);
  });

  // The route directories are asserted as soon as they exist, so the guard cannot be satisfied by an empty skeleton.
  test("components/central and app/central hold a page and a stylesheet once they exist", () => {
    const routeDirs = FEATURE_DIRS.filter((dir) => dir !== LIB_DIR);
    if (routeDirs.every((dir) => !existsSync(dir))) return;
    for (const dir of routeDirs.filter(existsSync)) expect(listFiles(dir).length).toBeGreaterThan(0);
    expect(featureFiles.some((file) => file.endsWith("page.tsx"))).toBe(true);
    expect(featureFiles.some((file) => file.endsWith(".module.css"))).toBe(true);
  });

  // Anti-vacuity: the scans below must have something to scan, or they would pass on an empty feature.
  test("the scans below have files to scan", () => {
    expect(featureFiles.length).toBeGreaterThan(0);
    expect(featureFiles).toContain(join(LIB_DIR, "scan-helpers.ts"));
  });
});

describe("no wallet, signing, sending, network or storage code", () => {
  test("none of the forbidden tokens appears in any file of the feature", () => {
    const hits: string[] = [];
    for (const file of featureFiles) {
      const text = readFileSync(file, "utf8");
      for (const token of FORBIDDEN_TOKENS) if (text.includes(token)) hits.push(`${display(file)} contains ${token}`);
    }
    expect(hits).toEqual([]);
  });

  test("the feature imports nothing that talks to the network or to a wallet", () => {
    const hits: string[] = [];
    const allowedPackages = ["react", "react-dom/server", "next", "next/link", "bun:test", "node:fs", "node:path"];
    for (const file of featureFiles) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
        const specifier = match[1]!;
        const allowed = specifier.startsWith(".") || specifier.startsWith("@/") || allowedPackages.includes(specifier);
        if (!allowed) hits.push(`${display(file)} imports ${specifier}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("components and libraries do not touch cookies, beacons, popups or location", () => {
    const hits: string[] = [];
    for (const file of featureFiles) {
      if (!/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of [/document\.cookie/, /window\.open\s*\(/, /location\.(?:assign|replace)\s*\(/, /location\.href\s*=/]) {
        if (pattern.test(text)) hits.push(`${display(file)} matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("no banned punctuation in rendered text (byte level)", () => {
  test("no source file of the feature contains an em dash, en dash, middle dot or look alike", () => {
    const hits: string[] = [];
    for (const file of [...featureFiles, ...TEXT_ONLY_FILES.filter(existsSync)]) {
      const bytes = new Uint8Array(readFileSync(file));
      for (const name of findBannedMarks(bytes)) hits.push(`${display(file)} contains ${name}`);
    }
    expect(hits).toEqual([]);
  });

  test("no source file writes a banned mark as an entity or as an escape sequence", () => {
    const hits: string[] = [];
    for (const file of [...featureFiles, ...TEXT_ONLY_FILES.filter(existsSync)]) {
      const match = ESCAPE_PATTERN.exec(readFileSync(file, "utf8"));
      if (match) hits.push(`${display(file)} contains ${match[0]}`);
    }
    expect(hits).toEqual([]);
  });

  test("the byte scanner itself detects every mark and leaves normal text alone", () => {
    for (const mark of BANNED_MARKS) {
      expect(findBannedMarks(new Uint8Array([0x61, ...mark.bytes, 0x62]))).toContain(mark.name);
    }
    expect(findBannedMarks(new TextEncoder().encode("texto normal: acentuação, hífen-minus, aspas \"retas\" e sinal de menos -3"))).toEqual([]);
  });

  test("the escape scanner detects entities and escape sequences", () => {
    // Every sample is assembled from parts so that this file, which the escape scan above also reads, does not contain
    // a banned entity or escape literally. Same convention as FORBIDDEN_TOKENS and ESCAPE_PATTERN in scan-helpers.ts.
    const entity = (name: string) => `&${name};`;
    const decimal = (code: number) => `&#${code};`;
    const hexadecimal = (code: string) => `&#x${code};`;
    const unicode = (code: string) => `\\u${code}`;
    const unicodeBraced = (code: string) => `\\u{${code}}`;
    const samples = [
      entity("mdash;"), entity("middot;"),
      decimal(8212), decimal(8211),
      hexadecimal("2014"), hexadecimal("00b7"),
      unicode("2014"), unicode("00b7"), unicodeBraced("2013"),
    ];
    for (const sample of samples) expect(ESCAPE_PATTERN.test(sample)).toBe(true);
    expect(ESCAPE_PATTERN.test("&amp; &lt; texto -3 normal")).toBe(false);
  });

  test("the data rendered by the page is free of banned marks and forbidden tokens", () => {
    const payload = JSON.stringify({ CATALOG, CATALOG_FAMILIES, STATUS_LABEL, TIER_NEEDED_LABEL, KURU_ALLOWLIST, NOT_VIABLE_TODAY, TIERS, TIER_STATE_LABEL });
    expect(payload.length).toBeGreaterThan(5000);
    expect(findBannedMarks(new TextEncoder().encode(payload))).toEqual([]);
    for (const token of FORBIDDEN_TOKENS) expect(payload.includes(token)).toBe(false);
  });
});
