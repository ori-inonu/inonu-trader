// ASK-10, AC-ASK-4, T7.9: the assistant shown on the desk is "Inonu"; "Jev" is only the model behind it and appears only as that
// provenance ("modelo: Jev", "(Jev)") or as the name of the model's own key. The scan reads the source of the screens in scope
// (comments are not shown to anyone, so they are not scanned), and fails on any other line that says "Jev". Code identifiers,
// ids and file names are lower case or part of words and are not what is scanned. The old console and the other sessions'
// areas (Z6) are outside the installed app and outside this scan.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "../..");
const ROOTS = ["components/Desk", "lib/mesa", "lib/desk", "components/Settings", "components/Doctor", "app/layout.tsx", "app/page.tsx", "app/configuracoes", "app/doctor"];
const SKIP = /\.test\.tsx?$|fixture/;

/** The only lines allowed to name Jev: provenance of the model, and the model's own key. */
const ALLOWED: readonly RegExp[] = [/modelo: Jev/, /\(Jev\)/, /"Chave do Jev"/];

function* sources(path: string): Generator<string> {
  const full = join(SRC, path);
  let info;
  try {
    info = statSync(full);
  } catch {
    return;
  }
  if (info.isFile()) {
    if (!SKIP.test(full)) yield full;
    return;
  }
  for (const name of readdirSync(full)) {
    const child = join(path, name);
    const childFull = join(SRC, child);
    if (statSync(childFull).isDirectory()) yield* sources(child);
    else if (/\.(ts|tsx)$/.test(name) && !SKIP.test(name)) yield childFull;
  }
}

const withoutComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");

describe("the displayed name of the assistant", () => {
  test("no screen in scope says Jev except as the provenance of the model", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of ROOTS) {
      for (const file of sources(root)) {
        scanned += 1;
        withoutComments(readFileSync(file, "utf8")).split("\n").forEach((line, index) => {
          if (!/\bJev\b/.test(line)) return;
          if (ALLOWED.some((pattern) => pattern.test(line))) return;
          offenders.push(`${file.slice(SRC.length + 1)}:${index + 1}: ${line.trim().slice(0, 140)}`);
        });
      }
    }
    expect(scanned).toBeGreaterThan(40);
    expect(offenders).toEqual([]);
  });

  test("the provenance is still there: the card of the answer and the chart tooltip say which model answered", () => {
    const ask = readFileSync(join(SRC, "components/Desk/InonuAsk.tsx"), "utf8");
    expect(ask).toContain("modelo: Jev");
    const strip = readFileSync(join(SRC, "components/Desk/InonuSignalStrip.tsx"), "utf8");
    expect(strip).toContain("modelo: Jev");
  });
});
