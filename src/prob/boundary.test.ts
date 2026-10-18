import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A biblioteca probabilística é pura: nenhum módulo em src/prob lê ou grava disco, fala com a rede, lê variável de
 * ambiente ou mede o relógio de parede. Quem tem I/O é scripts/prob-cycle.ts. O relógio e a semente entram sempre de
 * fora. Importa só de dentro do módulo (e nunca de src/agent, que o ciclo probabilístico só lê pelos journals).
 */
const DIR = import.meta.dir;
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), "utf8") }));

/** Ponto médio, travessão e meia-risca, montados por código para este arquivo não conter nenhum deles. */
const FORBIDDEN_PUNCTUATION = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);

const imports = (text: string): string[] => [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);

describe("fronteira da biblioteca probabilística", () => {
  test("encontra os módulos esperados", () => {
    expect(sources.map((s) => s.file)).toEqual(expect.arrayContaining(["rng.ts", "intervals.ts", "scoring.ts", "calibrators.ts", "logistic.ts", "validation.ts", "dataset.ts", "evaluate.ts", "experiments.ts", "report.ts", "early-exit.ts", "hesitation.ts", "quality.ts"]));
  });

  test("só importa de dentro do módulo", () => {
    for (const { file, text } of sources) {
      for (const spec of imports(text)) expect(spec.startsWith("./"), `${file} importa ${spec}`).toBe(true);
    }
  });

  test("sem disco, rede, processo, ambiente, relógio de parede nem aleatoriedade da plataforma", () => {
    const banned: Array<[RegExp, string]> = [
      [/node:/, "módulo node"],
      [/\bfetch\(/, "fetch"],
      [/\bBun\.(file|write|spawn|serve)/, "Bun I/O"],
      [/process\.(env|argv|stdout|exit)/, "process"],
      [/Date\.now\(/, "Date.now"],
      [/new Date\(/, "new Date"],
      [/performance\.now\(/, "performance.now"],
      [/Math\.random\(/, "Math.random"],
      [/\bconsole\./, "console"],
    ];
    for (const { file, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const [re, label] of banned) expect(re.test(code), `${file} usa ${label}`).toBe(false);
    }
  });

  test("nenhum texto usa ponto médio, travessão ou meia-risca", () => {
    for (const { file, text } of sources) expect(FORBIDDEN_PUNCTUATION.test(text), `${file} tem ponto medio, travessao ou meia-risca`).toBe(false);
  });
});
